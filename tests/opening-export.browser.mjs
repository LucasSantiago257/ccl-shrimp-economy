import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const base='http://127.0.0.1:18080',web='http://127.0.0.1:15173';
const browser=await chromium.launch({channel:'msedge',headless:true});const c=await browser.newContext();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const tag=randomUUID().slice(0,8);let passed=0;
async function test(name,run){await run();console.log('OK '+(++passed)+' — '+name);}
async function get(path){const r=await c.request.get(base+path);assert.equal(r.status(),200,await r.text());return r.json();}
async function post(path,data,status=200,key=randomUUID()){
 const t=await get('/api/auth/csrf');const r=await c.request.post(base+path,{headers:{[t.header]:t.token,'Idempotency-Key':key},data});assert.equal(r.status(),status,await r.text());return status===200?r.json():undefined;
}
const report=()=>get('/api/v1/reports/result?from='+today+'&to='+today);
const n=(v)=>Number(v);
let customer,opening,firstOpening;
try{
 for(let i=0;i<40;i++){try{if((await c.request.get(base+'/api/auth/csrf')).status()===200)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 let loginStatus=0;
 for(let i=0;i<10;i++){const t=await get('/api/auth/csrf');loginStatus=(await c.request.post(base+'/api/login',{headers:{[t.header]:t.token},form:{username:env.APP_ADMIN_USERNAME,password:env.APP_ADMIN_PASSWORD}})).status();if(loginStatus===204)break;await new Promise(r=>setTimeout(r,300));}
 assert.equal(loginStatus,204);
 customer=await post('/api/v1/customers',{name:'Cliente inicial '+tag,phone:'',document:'',notes:'',active:true});
 const body={cashAmount:'50',stock:[{productId:1,quantity:'1',unitCost:'20'}],debts:[{nature:'RECEIVABLE',partyId:customer.id,description:'Fiado antigo',amount:'10',dueDate:today}],note:'Implantação de teste',confirmed:true};
 await test('Validação e rollback de implantação inválida',async()=>{
  await post('/api/v1/opening-balances',{...body,confirmed:false},400);
  await post('/api/v1/opening-balances',{...body,stock:[null]},400);
  await post('/api/v1/opening-balances',{...body,debts:[{...body.debts[0],partyId:999999}]},404);
  assert.equal((await get('/api/v1/opening-balances')).configured,false);
  assert.equal(n((await get('/api/v1/products')).items.find(p=>p.id===1).quantity),0);
 });
 await test('Reenvio e concorrência não duplicam implantação',async()=>{
  const key=randomUUID();const attempts=await Promise.all(Array.from({length:5},()=>post('/api/v1/opening-balances',body,200,key)));firstOpening=attempts[0];assert.equal(new Set(attempts.map(r=>r.id)).size,1);
  assert.equal((await post('/api/v1/opening-balances',body,200,key)).id,firstOpening.id);
  await post('/api/v1/opening-balances',body,409);
  const m=(await report()).metrics;assert.equal(n(m.initial_cash),50);assert.equal(n(m.closing_cash),50);
  assert.equal(n(m.revenue),0);assert.equal(n(m.purchases),0);assert.equal(n(m.received),0);assert.equal(n(m.operating_result),0);
 });
 const mobile=await browser.newContext({viewport:{width:390,height:844}});const page=await mobile.newPage();
 await page.goto(web);await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
 await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Saldo inicial',exact:true}).click();
 await test('Implantação pode ser corrigida antes de operar, preservando estorno',async()=>{
  await page.getByRole('button',{name:'Corrigir saldo inicial',exact:true}).click();await page.getByLabel('Motivo da correção',{exact:true}).fill('Conferência encontrou valor incorreto');
  await page.getByRole('button',{name:'Desfazer saldo inicial',exact:true}).click();await page.getByRole('button',{name:'Conferir saldo inicial',exact:true}).waitFor();
  const m=(await report()).metrics;assert.equal(n(m.initial_cash),0);assert.equal(n(m.receivables),0);
  assert.equal(n((await get('/api/v1/products')).items.find(p=>p.id===1).quantity),0);
  assert.equal((await get('/api/v1/titles?openOnly=true')).total,0);
 });
 await test('Tela móvel confere estoque, caixa e contas antes de confirmar',async()=>{
  await page.getByLabel('Dinheiro em caixa e bancos (R$)',{exact:true}).fill('500');
  await page.getByRole('button',{name:'Adicionar produto ao saldo',exact:true}).click();await page.getByLabel('Produto do saldo 1',{exact:true}).selectOption('1');
  await page.getByLabel('Quantidade inicial 1 (kg)',{exact:true}).fill('10');await page.getByLabel('Custo médio 1 / kg (R$)',{exact:true}).fill('30');
  for(let i=1;i<=3;i++){
   await page.getByRole('button',{name:'Adicionar conta antiga',exact:true}).click();
   await page.getByLabel('Tipo da conta '+i,{exact:true}).selectOption(i===1?'RECEIVABLE':i===2?'PURCHASE_PAYABLE':'OTHER_PAYABLE');
   if(i===1)await page.getByLabel('Cliente da conta 1',{exact:true}).selectOption(String(customer.id));
   await page.getByLabel('Descrição da conta '+i,{exact:true}).fill(i===1?'Venda antiga da planilha':i===2?'Compra antiga sem fornecedor':'Outra obrigação antiga');
   await page.getByLabel('Valor restante da conta '+i+' (R$)',{exact:true}).fill(i===1?'120':i===2?'80':'40');
  }
  await page.getByRole('button',{name:'Conferir saldo inicial',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Confirmar saldo inicial',exact:true}).isEnabled(),false);
  await page.getByRole('checkbox',{name:'Conferi os saldos nas planilhas'}).check();
  await page.screenshot({path:new URL('../../../work/opening-review-mobile.png',import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/,'') ,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Confirmar saldo inicial',exact:true}).click();await page.getByRole('heading',{name:'Saldo inicial configurado',exact:true}).waitFor();
  opening=(await get('/api/v1/opening-balances')).opening;
  const data=await report(),m=data.metrics;
  assert.equal(n(m.initial_cash),500);assert.equal(n(m.closing_cash),500);assert.equal(n(m.receivables),120);assert.equal(n(m.payables),120);assert.equal(n(m.purchase_payables),80);
  assert.equal(n(m.revenue),0);assert.equal(n(m.purchases),0);assert.equal(n(m.operating_result),0);assert.equal(n(data.stock.find(p=>p.id===1).stock_value),300);
 });
 await test('Receber e pagar dívidas antigas altera caixa sem inventar lucro',async()=>{
  const receivable=(await get('/api/v1/titles?nature=RECEIVABLE&openOnly=true')).items[0];
  const payable=(await get('/api/v1/titles?nature=PAYABLE&purchasesOnly=true&openOnly=true')).items[0];
  await post('/api/v1/settlements',{method:'PIX',allocations:[{titleId:receivable.id,amount:'30'}]});
  await post('/api/v1/settlements',{method:'PIX',allocations:[{titleId:payable.id,amount:'20'}]});
  const m=(await report()).metrics;assert.equal(n(m.revenue),0);assert.equal(n(m.operating_result),0);assert.equal(n(m.closing_cash),510);assert.equal(n(m.receivables),90);assert.equal(n(m.purchase_payables),60);assert.equal(n(m.payables),100);
  await post('/api/v1/opening-balances/'+opening.id+'/undo',{reason:'Não pode alterar após pagamentos'},422);
  assert.equal((await get('/api/v1/opening-balances')).canUndo,false);
 });
 await test('Venda usa custo do estoque inicial e cancelamento mantém contas antigas',async()=>{
  const sale=await post('/api/v1/sales',{partyId:customer.id,items:[{productId:1,quantity:'2',unitPrice:'50'}],discountAmount:'10',paidAmount:'25',method:'PIX',dueDate:today});
  const m=(await report()).metrics;assert.equal(n(m.revenue),90);assert.equal(n(m.cost_of_goods),60);assert.equal(n(m.operating_result),30);assert.equal(n(m.closing_cash),535);assert.equal(n(m.receivables),155);
  await post('/api/v1/corrections/SALE/'+sale.id,{reason:'Venda de teste registrada incorretamente'});
  const after=(await report()).metrics;assert.equal(n(after.revenue),0);assert.equal(n(after.closing_cash),510);assert.equal(n(after.receivables),90);
  assert.equal(n((await get('/api/v1/products')).items.find(p=>p.id===1).quantity),10);
 });
 await test('Exportação anual e consolidada têm tamanho limitado e datas corretas',async()=>{
  const r=await c.request.get(base+'/api/v1/reports/export?from=2024-01-01&to=2024-12-31&grouping=month');assert.equal(r.status(),200);
  const bytes=await r.body(),csv=bytes.toString('utf8');assert.equal(bytes[0],0xef);assert.equal(csv.trim().split(/\r?\n/).length,13);assert.ok(bytes.length<16000);assert.ok(csv.includes('2024-02-29'));
  const annual=await c.request.get(base+'/api/v1/reports/export?from='+today.slice(0,4)+'-01-01&to='+today+'&grouping=total');assert.equal(annual.status(),200);assert.equal((await annual.text()).trim().split(/\r?\n/).length,2);
  assert.equal((await c.request.get(base+'/api/v1/reports/export?from=2024-01-01&to=2025-12-31&grouping=month')).status(),422);
  assert.equal((await c.request.get(base+'/api/v1/reports/export?from='+today+'&to='+today+'&grouping=raw')).status(),422);
 });
 await test('Resumo pode ser baixado pela tela de fechamento em celular',async()=>{
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Fechamento',exact:true}).click();
  await page.getByRole('button',{name:'Ano anterior',exact:true}).click();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar resumo CSV',exact:true}).click();const download=await pending;
  const text=await readFile(await download.path(),'utf8');assert.equal(text.trim().split(/\r?\n/).length,13);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 });
 await test('Fechamento preserva implantação e bloqueia alterações',async()=>{
  const closed=await post('/api/v1/closings',{from:today,to:today,note:'Implantação conferida'});
  const snapshot=(await get('/api/v1/closings/'+closed.id)).snapshot;
  assert.equal(snapshot.schemaVersion,5);assert.equal(snapshot.records.opening_balances.length,2);assert.equal(snapshot.records.opening_reversals.length,1);
  assert.equal(n(snapshot.report.metrics.initial_cash),500);
  await post('/api/v1/opening-balances/'+opening.id+'/undo',{reason:'Fechamento já preservado'},409);
  const exportFile=await c.request.get(base+'/api/v1/reports/export?from='+today+'&to='+today+'&grouping=total');assert.equal(exportFile.status(),200);
 });
 console.log(passed+' cenários de implantação e resumo aprovados; SMTP real não utilizado.');
}catch(e){throw new Error(String(e.stack||e).replaceAll(env.APP_ADMIN_PASSWORD,'[senha omitida]'));}
finally{await browser.close();}
