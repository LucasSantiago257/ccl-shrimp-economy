import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).trim().split(/\r?\n/).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base='http://127.0.0.1:15173';
const project=process.env.PROFILE_TEST_PROJECT||'camarao-remember-qa';
const compose=['compose','-p',project,'-f','compose.yaml','-f','compose.test.yaml','-f','compose.profile-test.yaml'];
function docker(args,input) { return execFileSync('docker',[...compose,...args],{cwd:new URL('../',import.meta.url),stdio:['pipe','pipe','pipe'],input}); }
function sql(query) { return docker(['exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" camarao_test --batch --skip-column-names'],query).toString().trim(); }
const browser=await chromium.launch({channel:'msedge',headless:true});
const contexts=[];
async function context(cookie) { const c=await browser.newContext();contexts.push(c);if(cookie)await c.addCookies([cookie]);return c; }
async function login(c,remember=false,password=env.APP_ADMIN_PASSWORD) {
 const csrf=await(await c.request.get(base+'/api/auth/csrf')).json();
 const r=await c.request.post(base+'/api/login',{headers:{[csrf.header]:csrf.token},form:{username:env.APP_ADMIN_USERNAME,password,remember:String(remember)}});
 assert.equal(r.status(),204);return (await c.cookies(base+'/api/auth/me')).find(c=>c.name==='MARE_REMEMBER');
}
async function status(c,expected) { assert.equal((await c.request.get(base+'/api/auth/me')).status(),expected); }
async function post(c,path,data,expected=200) {
 const csrf=await(await c.request.get(base+'/api/auth/csrf')).json();
 const r=await c.request.post(base+path,{headers:{[csrf.header]:csrf.token},data});assert.equal(r.status(),expected);
}
try {
 const normal=await context();assert.equal(await login(normal),undefined);
 const fresh=await context();await status(fresh,401);
 const device=await context();const page=await device.newPage();
 await page.setViewportSize({width:390,height:844});await page.goto(base);
 const checkbox=page.getByRole('checkbox',{name:'Lembrar meu login'});assert.equal(await checkbox.isChecked(),false);
 await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);
 await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
 await checkbox.check();await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
 await page.getByRole('button',{name:'Perfil',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const cookie=(await device.cookies(base+'/api/auth/me')).find(c=>c.name==='MARE_REMEMBER');
 assert.ok(cookie);assert.equal(cookie.httpOnly,true);assert.equal(cookie.sameSite,'Lax');assert.equal(cookie.path,'/api');
 assert.ok(Math.abs(cookie.expires-Date.now()/1000-30*86400)<15);
 const hash=createHash('sha256').update(cookie.value).digest('hex');
 assert.equal(sql("SELECT token_hash FROM remembered_logins WHERE token_hash='"+hash+"';"),hash);
 await device.close();
 const reopened=await context(cookie);await status(reopened,200);
 assert.equal((await reopened.request.post(base+'/api/logout')).status(),403,'CSRF remains required');
 docker(['restart','backend']);
 for(let i=0;i<60;i++) { try { if((await reopened.request.get(base+'/api/auth/csrf')).status()===200)break; }catch{}await new Promise(r=>setTimeout(r,500)); }
 await status(reopened,200);
 await post(reopened,'/api/logout',undefined,204);
 assert.equal((await reopened.cookies(base+'/api')).some(c=>c.name==='MARE_REMEMBER'),false);
 await status(await context(cookie),401);
 const unchecked=await context();const old=await login(unchecked,true);await login(unchecked,false);
 await status(await context(old),401);
 const expired=await context();const expCookie=await login(expired,true);
 const expHash=createHash('sha256').update(expCookie.value).digest('hex');
 sql("UPDATE remembered_logins SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE token_hash='"+expHash+"';");
 await status(await context(expCookie),401);
 await status(await context({...cookie,value:'bad-token'}),401);
 const changer=await context();await login(changer,true);
 const other=await context();const otherCookie=await login(other,true);
 const changed='Remember-QA-'+randomUUID();
 await post(changer,'/api/auth/password',{currentPassword:env.APP_ADMIN_PASSWORD,password:changed,confirmation:changed});
 await status(await context(otherCookie),401);await status(other,401);await status(changer,401);
 await login(changer,false,changed);
 await post(changer,'/api/auth/password',{currentPassword:changed,password:env.APP_ADMIN_PASSWORD,confirmation:env.APP_ADMIN_PASSWORD});
 console.log('OK: opt-in, 30 days, persistent cookie/hash, browser reopen, backend restart, CSRF, logout, unchecked login, expiry, malformed token and password revocation; mobile 390 px.');
} catch(e) {throw new Error(String(e.stack||e).replaceAll(env.APP_ADMIN_PASSWORD,'[senha omitida]'));}
finally {await browser.close();}
