import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:15173';
const browser=await chromium.launch({channel:'msedge',headless:true});
const c=await browser.newContext({viewport:{width:390,height:844}});
async function get(path){const r=await c.request.get(base+path);assert.equal(r.status(),200);return r.json();}
async function reset(confirmation){const t=await get('/api/auth/csrf');return c.request.post(base+'/api/v1/homologation/clear-operations',{headers:{[t.header]:t.token},data:{confirmation}});}
try{
 const t=await get('/api/auth/csrf');assert.equal((await c.request.post(base+'/api/login',{headers:{[t.header]:t.token},form:{username:'boxes-qa',password:'Boxes-QA-Only-2026!'}})).status(),204);
 assert.equal((await get('/api/v1/homologation/status')).resetEnabled,true);
 assert.ok((await get('/api/v1/closings')).total>0,'Execute boxes.browser.mjs antes para criar lançamentos e snapshot');
 assert.equal((await reset('errado')).status(),422);assert.ok((await get('/api/v1/closings')).total>0);
 assert.equal((await c.request.post(base+'/api/v1/homologation/clear-operations',{data:{confirmation:'LIMPAR OPERACAO'}})).status(),403);
 const anon=await browser.newContext();const at=await(await anon.request.get(base+'/api/auth/csrf')).json();assert.equal((await anon.request.post(base+'/api/v1/homologation/clear-operations',{headers:{[at.header]:at.token},data:{confirmation:'LIMPAR OPERACAO'}})).status(),401);await anon.close();
 const partnerIds=async path=>(await get('/api/v1/'+path+'?size=100')).items.map(row=>row.id);
 const customers=await partnerIds('customers'), suppliers=await partnerIds('suppliers');
 const page=await c.newPage();await page.goto(base);await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Perfil',exact:true}).click();await page.getByRole('button',{name:'Limpar dados operacionais',exact:true}).click();
 const confirm=page.getByRole('button',{name:'Confirmar limpeza da operação',exact:true});assert.equal(await confirm.isDisabled(),true);await page.getByLabel('Digite LIMPAR OPERACAO para confirmar',{exact:true}).fill('LIMPAR OPERACAO');
 const response=page.waitForResponse(r=>r.url().endsWith('/homologation/clear-operations')&&r.request().method()==='POST');await confirm.click();const result=await response;assert.equal(result.status(),200);await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
 assert.deepEqual(await partnerIds('customers'),customers);assert.deepEqual(await partnerIds('suppliers'),suppliers);
 for(const path of ['fixed-expenses','sales','purchases','expenses','settlements','titles','stock/movements','closings','corrections'])assert.equal((await get('/api/v1/'+path)).total,0,path);
 const p=await get('/api/v1/products');assert.equal(p.total,1);assert.equal(p.items[0].code,'CAM-001');assert.equal(Number(p.items[0].quantity),0);assert.equal(Number(p.items[0].box_weight_kg),15);
 const opening=await get('/api/v1/opening-balances');assert.equal(opening.hasPostings,false);assert.equal(opening.configured,false);assert.equal((await get('/api/v1/closings/status')).closed,false);assert.equal((await get('/api/auth/me')).username,'boxes-qa');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal((await reset('LIMPAR OPERACAO')).status(),200);
 console.log('Reset aprovado: confirmação, autenticação, CSRF, limpeza operacional e preservação de parceiros, fechamentos removidos, usuário preservado, repetição e celular 390 px.');
}finally{await browser.close();}
