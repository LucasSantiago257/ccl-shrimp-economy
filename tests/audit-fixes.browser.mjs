import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base='http://127.0.0.1:18080',web='http://127.0.0.1:15173';
const compose=['compose','-p','camarao-fixes-qa','-f','compose.yaml','-f','compose.test.yaml','-f','compose.profile-test.yaml'];
function docker(args,input){return execFileSync('docker',[...compose,...args],{cwd:new URL('../',import.meta.url),stdio:['pipe','pipe','pipe'],input});}
function sql(query){return docker(['exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u"$MYSQL_USER" camarao_test --batch --skip-column-names'],query).toString().trim();}
const browser=await chromium.launch({channel:'msedge',headless:true});
let passed=0;
async function test(name,action){await action();console.log('OK '+(++passed)+' — '+name);}
async function csrf(c,url=base){return(await c.request.get(url+'/api/auth/csrf')).json();}
async function login(c,password=env.APP_ADMIN_PASSWORD,url=base,headers={}){const t=await csrf(c,url);return c.request.post(url+'/api/login',{headers:{[t.header]:t.token,...headers},form:{username:env.APP_ADMIN_USERNAME,password}});}
const c=await browser.newContext();
async function post(path,data,key=randomUUID(),status=200){const t=await csrf(c);const r=await c.request.post(base+path,{headers:{[t.header]:t.token,...(key===null?{}:{'Idempotency-Key':key})},data});assert.equal(r.status(),status,await r.text());return status===200?r.json():undefined;}
const tag=randomUUID().slice(0,8),party={name:'QA '+tag,phone:'',document:'',notes:'Teste isolado',active:true};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
try {
 sql('DELETE FROM login_attempt_windows;');
 assert.equal((await login(c)).status(),204);
 let customer,product;
 await test('Clientes, fornecedores e produtos são idempotentes, inclusive em paralelo',async()=>{
  for(const resource of ['customers','suppliers','products']){
   const body=resource==='products'?{code:'FIX-'+tag,name:'Camarão QA '+tag,suggestedPrice:'50',minimumStock:'0',active:true}:party;
   const key=randomUUID(),t=await csrf(c);
   const results=await Promise.all(Array.from({length:5},async()=>{
    const r=await c.request.post(base+'/api/v1/'+resource,{headers:{[t.header]:t.token,'Idempotency-Key':key},data:body});assert.equal(r.status(),200,await r.text());return r.json();
   }));
   assert.equal(new Set(results.map(r=>r.id)).size,1);
   const repeated=await post('/api/v1/'+resource,body,key);assert.equal(repeated.id,results[0].id);
   await post('/api/v1/'+resource,{...body,name:body.name+' alterado'},key,409);
   const rows=await(await c.request.get(base+'/api/v1/'+resource+'?q='+encodeURIComponent(body.name))).json();assert.equal(rows.total,1);
   if(resource==='customers')customer=repeated.id;
   if(resource==='products'){product=repeated.id;assert.equal(sql('SELECT COUNT(*) FROM stock_balances WHERE product_id='+product+';'),'1');}
  }
 });
 await test('Cadastro exige chave de idempotência válida',async()=>{
  await post('/api/v1/customers',party,null,400);await post('/api/v1/customers',party,'short',422);
 });
 const body={partyId:customer,items:[{productId:product,quantity:'1',unitPrice:'50'}],paidAmount:'0',method:'PIX',dueDate:today};
 await test('Itens e alocações nulos retornam 400 sem criar lançamentos',async()=>{
  const before=sql('SELECT (SELECT COUNT(*) FROM sales),(SELECT COUNT(*) FROM purchases),(SELECT COUNT(*) FROM settlements);');
  await post('/api/v1/sales',{...body,items:[null]},randomUUID(),400);
  await post('/api/v1/purchases',{...body,partyId:null,items:[null]},randomUUID(),400);
  await post('/api/v1/settlements',{method:'PIX',allocations:[null]},randomUUID(),400);
  assert.equal(sql('SELECT (SELECT COUNT(*) FROM sales),(SELECT COUNT(*) FROM purchases),(SELECT COUNT(*) FROM settlements);'),before);
 });
 await test('Recriação também rejeita item nulo sem deixar dados parciais',async()=>{
  await post('/api/v1/purchases',{...body,partyId:null,items:[{productId:product,quantity:'5',unitPrice:'20'}]});
  const sale=await post('/api/v1/sales',body);
  const correction=await post('/api/v1/corrections/SALE/'+sale.id,{reason:'Registro incorreto de teste'});
  const before=sql('SELECT COUNT(*) FROM sales;');
  await post('/api/v1/corrections/'+correction.id+'/replacement/new',{...body,items:[null]},randomUUID(),422);
  assert.equal(sql('SELECT COUNT(*) FROM sales;'),before);
 });
 await test('Saldo de 0,001 kg aparece como 1 g no estoque em celular',async()=>{
  const tiny=await post('/api/v1/products',{code:'GRAM-'+tag,name:'Camarão grama '+tag,suggestedPrice:'1000',minimumStock:'0',active:true});
  await post('/api/v1/purchases',{...body,partyId:null,items:[{productId:tiny.id,quantity:'0.001',unitPrice:'1000'}]});
  const mobile=await browser.newContext({viewport:{width:390,height:844}});const page=await mobile.newPage();
  await page.goto(web);await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByRole('button',{name:'Estoque',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar estoque',exact:true}).fill('Camarão grama '+tag);
  await page.locator('.stock-number').filter({hasText:/^1 g$/}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await mobile.close();
 });
 await test('Login limita 20 tentativas por origem e preserva bloqueio após reinício',async()=>{
  sql('DELETE FROM login_attempt_windows;');
  const second=new Date().getSeconds();if(second>35)await new Promise(r=>setTimeout(r,(61-second)*1000));
  const attack=await browser.newContext();const origin={'X-Real-IP':'198.51.100.20'};
  for(let i=0;i<20;i++)assert.equal((await login(attack,'QA-invalid-password',base,origin)).status(),401);
  const blocked=await login(attack,env.APP_ADMIN_PASSWORD,base,origin);assert.equal(blocked.status(),429);assert.ok(Number(blocked.headers()['retry-after'])>0);
  assert.equal((await login(await browser.newContext(),env.APP_ADMIN_PASSWORD,base,{'X-Real-IP':'198.51.100.21'})).status(),204);
  docker(['restart','backend']);
  for(let i=0;i<60;i++){try{if((await c.request.get(base+'/api/auth/csrf')).status()===200)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  assert.equal((await login(attack,env.APP_ADMIN_PASSWORD,base,origin)).status(),429);
 });
 await test('Proxy ignora X-Real-IP forjado e interface explica o bloqueio',async()=>{
  sql('DELETE FROM login_attempt_windows;');
  const second=new Date().getSeconds();if(second>45)await new Promise(r=>setTimeout(r,(61-second)*1000));
  const attack=await browser.newContext();
  for(let i=0;i<20;i++)assert.equal((await login(attack,'QA-invalid-password',web,{'X-Real-IP':'203.0.113.'+(i+1)})).status(),401);
  const page=await attack.newPage();await page.goto(web);
  await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Muitas tentativas'}).waitFor();
 });
 console.log(passed+' regressões dos quatro bugs aprovadas.');
}catch(e){throw new Error(String(e.stack||e).replaceAll(env.APP_ADMIN_PASSWORD,'[senha omitida]'));}
finally{sql('DELETE FROM login_attempt_windows;');await browser.close();}
