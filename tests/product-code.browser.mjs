import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base='http://127.0.0.1:15173';
const browser=await chromium.launch({channel:'msedge',headless:true});const c=await browser.newContext({viewport:{width:390,height:844}});
let passed=0;const template={name:'Camarão novo',suggestedPrice:'25',minimumStock:'0',active:true};
async function test(name,run){await run();console.log('OK '+(++passed)+' — '+name);}
async function get(path){const r=await c.request.get(base+path);assert.equal(r.status(),200,await r.text());return r.json();}
async function save(body,key=randomUUID(),method='POST',id='',status=200){const csrf=await get('/api/auth/csrf');const r=await c.request.fetch(base+'/api/v1/products'+id,{method,headers:{[csrf.header]:csrf.token,'Idempotency-Key':key},data:body});assert.equal(r.status(),status,await r.text());return method==='POST'&&status===200?r.json():undefined;}
async function product(id){const page=await get('/api/v1/products?size=100');return page.items.find(p=>p.id===id);}
try{
 for(let i=0;i<40;i++){try{if((await c.request.get(base+'/api/auth/csrf')).status()===200)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 let status=0;for(let i=0;i<10;i++){const t=await get('/api/auth/csrf');status=(await c.request.post(base+'/api/login',{headers:{[t.header]:t.token},form:{username:env.APP_ADMIN_USERNAME,password:env.APP_ADMIN_PASSWORD}})).status();if(status===204)break;await new Promise(r=>setTimeout(r,300));}assert.equal(status,204);
 await test('Código omitido, nulo ou em branco usa prefixo e sequência existentes',async()=>{
  for(const [body,expected] of [[template,'CAM-002'],[{...template,code:null},'CAM-003'],[{...template,code:'   '},'CAM-004']]){
   const created=await save(body);assert.equal((await product(created.id)).code,expected);
  }
 });
 await test('Reenvio usa o mesmo ID e não consome outra sequência',async()=>{
  const key=randomUUID();const first=await save(template,key);assert.equal((await product(first.id)).code,'CAM-005');
  assert.equal((await save(template,key)).id,first.id);assert.equal((await product((await save(template)).id)).code,'CAM-006');
 });
 await test('Dez cadastros simultâneos recebem códigos únicos e consecutivos',async()=>{
  const results=await Promise.all(Array.from({length:10},(_,i)=>save({...template,name:'Peixe paralelo '+i})));
  const all=(await get('/api/v1/products?size=100')).items;const codes=results.map(r=>all.find(p=>p.id===r.id).code).sort();
  assert.deepEqual(codes,Array.from({length:10},(_,i)=>'PEI-'+String(i+1).padStart(3,'0')));
 });
 await test('Códigos manuais são preservados e colisões seguem a comparação do MySQL',async()=>{
  assert.equal((await product((await save({...template,name:'Manual',code:'XYZ-007'})).id)).code,'XYZ-007');
  assert.equal((await product((await save({...template,name:'Xyz novo'})).id)).code,'XYZ-008');
  await save({...template,name:'Manual com acento',code:'XÝZ-009'});
  assert.equal((await product((await save({...template,name:'Xyz próximo'})).id)).code,'XYZ-010');
  await save({...template,code:'XYZ-008'},randomUUID(),'POST','',409);
  const custom=await save({...template,name:'Personalizado',code:'MEU-CODIGO'});assert.equal((await product(custom.id)).code,'MEU-CODIGO');
  await save({...template,code:'TST-999'});assert.equal((await product((await save({...template,name:'Tst expansão'})).id)).code,'TST-1000');
 });
 await test('Editar sem código mantém o atual, e números antigos não são reutilizados',async()=>{
  const first=await save({...template,name:'Robalo original'});assert.equal((await product(first.id)).code,'ROB-001');
  await save({...template,name:'Nome alterado'},randomUUID(),'PUT','/'+first.id);assert.equal((await product(first.id)).code,'ROB-001');
  await save({...template,name:'Outro nome',code:'OUT-020'},randomUUID(),'PUT','/'+first.id);
  assert.equal((await product((await save({...template,name:'Robalo novo'})).id)).code,'ROB-002');
  assert.equal((await product((await save({...template,name:'Rã'})).id)).code,'RA-001');
  assert.equal((await product((await save({...template,name:'123 ---'})).id)).code,'PRO-001');
 });
 await test('Tela de celular permite salvar sem preencher o código',async()=>{
  const page=await c.newPage();await page.goto(base);await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Produtos',exact:true}).click();
  await page.getByRole('button',{name:'Novo produto',exact:true}).click();
  assert.equal(await page.locator('input[name="code"]').count(),0);
  await page.getByLabel('Nome',{exact:true}).fill('Água para teste');await page.getByLabel('Preço sugerido / kg (R$)',{exact:true}).fill('25');await page.getByRole('button',{name:'Salvar produto',exact:true}).click();
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:'Água para teste',exact:true})});await card.waitFor();assert.equal((await get('/api/v1/products?q='+encodeURIComponent('Água para teste'))).items[0].code,'AGU-001');
  await card.getByRole('button',{name:'Editar produto',exact:true}).click();assert.equal(await page.locator('input[name="code"]').count(),0);await page.getByLabel('Nome',{exact:true}).fill('Água renomeada');await page.getByRole('button',{name:'Salvar produto',exact:true}).click();await page.getByRole('heading',{name:'Água renomeada',exact:true}).waitFor();assert.equal((await get('/api/v1/products?q='+encodeURIComponent('Água renomeada'))).items[0].code,'AGU-001');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 });
 console.log(passed+' cenários de código opcional aprovados, exclusivamente em banco de teste.');
}catch(e){throw new Error(String(e.stack||e).replaceAll(env.APP_ADMIN_PASSWORD,'[senha omitida]'));}
finally{await browser.close();}
