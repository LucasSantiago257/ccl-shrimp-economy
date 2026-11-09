import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base='http://127.0.0.1:15173';
const browser=await chromium.launch({channel:'msedge',headless:true});const c=await browser.newContext({viewport:{width:390,height:844}});const page=await c.newPage();
let passed=0;
async function test(name,run){await run();console.log('OK '+(++passed)+' — '+name);}
async function get(path){const r=await c.request.get(base+path);assert.equal(r.status(),200,await r.text());return r.json();}
async function post(path,data,method='POST',expected=200){const csrf=await get('/api/auth/csrf');const r=await c.request.fetch(base+path,{method,headers:{[csrf.header]:csrf.token,'Idempotency-Key':randomUUID()},data});assert.equal(r.status(),expected,await r.text());return r;}
async function navigate(name){await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();}
const reminder=page.getByRole('region',{name:'Saldo inicial opcional'});
try{
 for(let i=0;i<30;i++){try{if((await c.request.get(base+'/api/auth/csrf')).status()===200)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 await page.goto(base);await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
 await test('X do aviso dispensa implantação sem criar saldos e persiste após recarregar',async()=>{
  await reminder.waitFor();await reminder.getByRole('button',{name:'Dispensar saldo inicial',exact:true}).click();await reminder.waitFor({state:'hidden'});
  await page.reload();await page.getByRole('button',{name:'Abrir menu',exact:true}).waitFor();assert.equal(await reminder.count(),0);
  const status=await get('/api/v1/opening-balances');assert.equal(status.dismissed,true);assert.equal(status.configured,false);assert.equal(status.hasPostings,false);
  const today=status.date;const m=(await get('/api/v1/reports/result?from='+today+'&to='+today)).metrics;assert.equal(Number(m.initial_cash),0);assert.equal(Number(m.receivables),0);assert.equal(Number(m.closing_cash),0);
 });
 await test('X da tela volta à visão geral e continua permitindo configuração manual',async()=>{
  await navigate('Saldo inicial');await page.getByRole('button',{name:'Dispensar saldo inicial',exact:true}).click();await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
  assert.equal((await get('/api/v1/opening-balances')).dismissed,true);
  await navigate('Saldo inicial');await page.getByLabel('Dinheiro em caixa e bancos (R$)',{exact:true}).fill('75');await page.getByRole('button',{name:'Conferir saldo inicial',exact:true}).click();
  await page.getByRole('checkbox',{name:'Conferi os saldos nas planilhas'}).check();await page.getByRole('button',{name:'Confirmar saldo inicial',exact:true}).click();await page.getByRole('heading',{name:'Saldo inicial configurado',exact:true}).waitFor();
  const status=await get('/api/v1/opening-balances');assert.equal(status.dismissed,false);assert.equal(status.configured,true);assert.equal(Number(status.opening.cash_amount),75);
 });
 await test('Sem saldo inicial, compras funcionam normalmente a partir de zero',async()=>{
  await page.getByRole('button',{name:'Corrigir saldo inicial',exact:true}).click();await page.getByLabel('Motivo da correção',{exact:true}).fill('Continuar sem implantação neste teste');await page.getByRole('button',{name:'Desfazer saldo inicial',exact:true}).click();
  await page.getByRole('button',{name:'Conferir saldo inicial',exact:true}).waitFor();await page.getByRole('button',{name:'Dispensar saldo inicial',exact:true}).click();
  const status=await get('/api/v1/opening-balances');
  await post('/api/v1/purchases',{partyId:null,items:[{productId:1,quantity:'1',unitPrice:'25'}],paidAmount:'0',method:'PIX',dueDate:status.date});
  const after=await get('/api/v1/opening-balances');assert.equal(after.configured,false);assert.equal(after.hasPostings,true);
  const m=(await get('/api/v1/reports/result?from='+status.date+'&to='+status.date)).metrics;assert.equal(Number(m.initial_cash),0);assert.equal(Number(m.purchases),25);assert.equal(Number(m.closing_cash),0);
  await page.reload();await page.getByRole('button',{name:'Abrir menu',exact:true}).waitFor();assert.equal(await reminder.count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 });
 await test('Preferência exige autenticação, CSRF e valor válido',async()=>{
  assert.equal((await c.request.put(base+'/api/v1/opening-balances/preference',{data:{dismissed:true}})).status(),403);
  await post('/api/v1/opening-balances/preference',{dismissed:null},'PUT',400);
  const anon=await browser.newContext();const csrf=await(await anon.request.get(base+'/api/auth/csrf')).json();
  assert.equal((await anon.request.put(base+'/api/v1/opening-balances/preference',{headers:{[csrf.header]:csrf.token},data:{dismissed:true}})).status(),401);
 });
 console.log(passed+' cenários de saldo inicial opcional aprovados em banco isolado.');
}catch(e){throw new Error(String(e.stack||e).replaceAll(env.APP_ADMIN_PASSWORD,'[senha omitida]'));}
finally{await browser.close();}
