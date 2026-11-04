import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).trim().split(/\r?\n/).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base='http://127.0.0.1:15173';
const browser=await chromium.launch({channel:'msedge',headless:true});
async function post(context,path,body,status=200) {
 const token=await (await context.request.get(base+'/api/auth/csrf')).json();
 const r=await context.request.post(base+path,{headers:{[token.header]:token.token},data:body});
 assert.equal(r.status(),status,await r.text());return r;
}
async function login(context,password,status=204) {
 const token=await (await context.request.get(base+'/api/auth/csrf')).json();
 const r=await context.request.post(base+'/api/login',{headers:{[token.header]:token.token},form:{username:env.APP_ADMIN_USERNAME,password}});
 assert.equal(r.status(),status);
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 const context=await browser.newContext();
 const second=await browser.newContext();
 await login(context,env.APP_ADMIN_PASSWORD);await login(second,env.APP_ADMIN_PASSWORD);
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.getByRole('button',{name:'Perfil',exact:true}).click();
 await page.getByRole('heading',{name:'Seu perfil',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const password='Qa-New-'+randomUUID();
 await post(context,'/api/auth/password',{currentPassword:'wrong-password',password,confirmation:password},422);
 await page.getByLabel('Senha atual',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
 await page.getByLabel('Nova senha',{exact:true}).fill(password);
 await page.getByLabel('Confirmar nova senha',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Salvar nova senha',exact:true}).click();
 await page.getByRole('button',{name:'Entrar no sistema',exact:true}).waitFor();
 assert.equal((await second.request.get(base+'/api/auth/me')).status(),401);
 await login(context,env.APP_ADMIN_PASSWORD,401);
 await login(context,password);
 execFileSync('docker',['compose','-p',process.env.PROFILE_TEST_PROJECT||'camarao-profile-qa','-f','compose.yaml','-f','compose.test.yaml','-f','compose.profile-test.yaml','restart','backend'],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
 for(let i=0;i<60;i++){
  try{if((await context.request.get(base+'/api/auth/csrf')).status()===200)break;}catch{}
  await pause(500);
 }
 await login(context,password);
 // Start recovery anonymously, with mail captured locally.
 const recovery=await browser.newContext();
 const resetPage=await recovery.newPage();
 await resetPage.goto(base);
 await resetPage.getByRole('button',{name:'Esqueci minha senha',exact:true}).click();
 await resetPage.getByRole('button',{name:'Enviar instruções',exact:true}).click();
 await resetPage.getByRole('button',{name:'Voltar para entrar',exact:true}).waitFor();
 let message;
 for(let i=0;i<40;i++){
  const box=await (await fetch('http://127.0.0.1:18025/api/v1/messages')).json();
  if(box.messages?.length) {
   message=await (await fetch('http://127.0.0.1:18025/api/v1/message/'+box.messages[0].ID)).json();
   break;
  }
  await pause(250);
 }
 assert.ok(message?.Text,'E-mail de recuperação capturado');
 assert.equal(message.To[0].Address,'profile-qa@example.test');
 const token=message.Text.match(/#reset-password=([A-Za-z0-9_-]{43})/)[1];
 await resetPage.goto(base+'/#reset-password='+token);
 await resetPage.getByLabel('Nova senha',{exact:true}).waitFor();
 assert.equal(resetPage.url().includes(token),false);
 const next='Qa-Reset-'+randomUUID();
 await resetPage.getByLabel('Nova senha',{exact:true}).fill(next);
 await resetPage.getByLabel('Confirmar nova senha',{exact:true}).fill(next);
 await resetPage.getByRole('button',{name:'Redefinir senha',exact:true}).click();
 await resetPage.getByText('Senha redefinida. Entre com a nova senha.',{exact:true}).waitFor();
 assert.equal((await context.request.get(base+'/api/auth/me')).status(),401);
 await post(recovery,'/api/auth/password/reset',{token,password:next,confirmation:next},422);
 await login(recovery,next);
 const expiredToken='e'.repeat(43);
 const expiredHash=createHash('sha256').update(expiredToken).digest('hex');
 execFileSync('docker',['compose','-p',process.env.PROFILE_TEST_PROJECT||'camarao-profile-qa','-f','compose.yaml','-f','compose.test.yaml','-f','compose.profile-test.yaml','exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" camarao_test'],
   {cwd:new URL('../',import.meta.url),stdio:['pipe','pipe','pipe'],input:"UPDATE app_account SET reset_hash='"+expiredHash+"',reset_expires=UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE id=1;"});
 await post(recovery,'/api/auth/password/reset',{token:expiredToken,password:next,confirmation:next},422);
 await post(recovery,'/api/auth/password',{currentPassword:next,password:env.APP_ADMIN_PASSWORD,confirmation:env.APP_ADMIN_PASSWORD});
 await login(context,env.APP_ADMIN_PASSWORD);
 assert.deepEqual(errors,[]);
 console.log('OK: Perfil, senha atual, troca persistida após reinício, revogação de sessões, envio SMTP local, reset e token de uso único.');
} catch(e) { throw new Error(String(e.stack||e).replaceAll(env.APP_ADMIN_PASSWORD,'[senha omitida]')); }
finally {await browser.close();}

