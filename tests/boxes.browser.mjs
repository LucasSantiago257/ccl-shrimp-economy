import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:15173'; // Only the isolated test stack; never use the operational URL.
const browser=await chromium.launch({channel:'msedge',headless:true});
const c=await browser.newContext({viewport:{width:390,height:844}}),page=await c.newPage();
let passed=0,day,customer,purchase,sale,loss;
async function test(name,run){await run();console.log('OK '+(++passed)+' — '+name);}
async function get(path){const r=await c.request.get(base+path,{timeout:10000});assert.equal(r.status(),200,await r.text());return r.json();}
async function command(path,data,{method='POST',expected=200,key=randomUUID()}={}){const csrf=await get('/api/auth/csrf');const r=await c.request.fetch(base+path,{method,headers:{[csrf.header]:csrf.token,'Idempotency-Key':key},data});assert.equal(r.status(),expected,await r.text());return r;}
async function navigate(name){await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();}
async function product(){return (await get('/api/v1/products')).items.find(p=>p.id===1);}
const dialog=()=>page.getByRole('dialog');
async function chooseBoxes(quantity,weight){await dialog().getByLabel('Informar quantidade em',{exact:true}).selectOption('BOX');await dialog().getByLabel(/Quantidade.*\(caixas\)/).fill(quantity);if(weight)await dialog().getByLabel('Peso de cada caixa (kg)',{exact:true}).fill(weight);}
async function cancel(kind,id){return command(`/api/v1/corrections/${kind}/${id}`,{reason:'Corrigir erro de lançamento no teste de caixas'});}
try{
 let ready=false;for(let i=0;i<60;i++){try{await get('/api/auth/csrf');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Backend isolado deve iniciar');
 let status;for(let i=0;i<10;i++){const csrf=await get('/api/auth/csrf');status=(await c.request.post(base+'/api/login',{headers:{[csrf.header]:csrf.token},form:{username:'boxes-qa',password:'Boxes-QA-Only-2026!'}})).status();if(status===204)break;await new Promise(r=>setTimeout(r,300));}assert.equal(status,204);
 day=(await get('/api/v1/opening-balances')).date;
 assert.equal((await get('/api/v1/purchases')).total,0,'Use banco novo de teste');
 customer=(await(await command('/api/v1/customers',{name:'Cliente caixas QA',phone:'',document:'',notes:'',active:true})).json()).id;
 await page.goto(base);await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
 await test('Cadastro não oculta saldo inicial; implantação aceita caixas e confere os quilos',async()=>{
  assert.equal((await get('/api/v1/opening-balances')).hasPostings,false);
  await navigate('Saldo inicial');await page.getByRole('button',{name:'Adicionar produto ao saldo',exact:true}).click();await page.getByLabel('Produto do saldo 1',{exact:true}).selectOption('1');
  await page.getByLabel('Informar quantidade em',{exact:true}).selectOption('BOX');await page.getByLabel('Quantidade inicial 1 (caixas)',{exact:true}).fill('1.5');await page.getByLabel('Custo médio 1 / kg (R$)',{exact:true}).fill('30');
  await page.getByRole('button',{name:'Conferir saldo inicial',exact:true}).click();assert.ok((await page.locator('main').textContent()).includes('22,5 kg'));
  await page.getByRole('checkbox',{name:'Conferi os saldos nas planilhas'}).check();await page.getByRole('button',{name:'Confirmar saldo inicial',exact:true}).click();await page.getByRole('heading',{name:'Saldo inicial configurado',exact:true}).waitFor();
  assert.equal(Number((await product()).quantity),22.5);assert.equal((await get('/api/v1/opening-balances')).hasPostings,false);
 });
 await test('Compra sem fornecedor aceita caixas de peso próprio e remove saldo inicial do menu',async()=>{
  await navigate('Compras');await page.getByRole('button',{name:'Nova compra',exact:true}).click();await dialog().getByLabel('Produto',{exact:true}).selectOption('1');await chooseBoxes('2','12.5');await dialog().getByLabel('Custo / kg (R$)',{exact:true}).fill('30');await dialog().getByLabel('Condição de pagamento',{exact:true}).selectOption('none');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/purchases')&&r.request().method()==='POST');await dialog().getByRole('button',{name:'Confirmar compra',exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());purchase=(await r.json()).id;await dialog().waitFor({state:'hidden'});
  assert.equal(Number((await product()).quantity),47.5);assert.equal((await get('/api/v1/opening-balances')).hasPostings,true);
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Saldo inicial',exact:true}).count(),0);await page.getByRole('button',{name:'Visão geral',exact:true}).click();assert.equal(await page.getByRole('region',{name:'Saldo inicial opcional'}).count(),0);
  await page.reload();await page.getByRole('button',{name:'Abrir menu',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Saldo inicial',exact:true}).count(),0);await page.getByRole('button',{name:'Vendas',exact:true}).click();
  const item=(await get(`/api/v1/purchases/${purchase}/items`))[0];assert.equal(Number(item.quantity),25);assert.equal(Number(item.box_count),2);assert.equal(Number(item.box_weight_kg),12.5);assert.equal(Number((await product()).box_weight_kg),15);
 });
 await test('Venda em caixas mantém desconto, recebimento parcial e custo por quilo',async()=>{
  await page.getByRole('button',{name:'Nova venda',exact:true}).click();await dialog().getByLabel('Cliente',{exact:true}).selectOption(String(customer));await dialog().getByLabel('Produto',{exact:true}).selectOption('1');await chooseBoxes('1.5','10');await dialog().getByLabel('Desconto (R$)',{exact:true}).fill('50');await dialog().getByLabel('Condição de pagamento',{exact:true}).selectOption('partial');await dialog().getByLabel('Recebido agora (R$)',{exact:true}).fill('100');
  assert.ok((await dialog().textContent()).includes('15,0 kg'));assert.ok((await dialog().textContent()).includes('500,00'));
  assert.equal(await dialog().evaluate(e=>e.scrollWidth>e.clientWidth),false);
  await mkdir(new URL('../docs/previews/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../docs/previews/caixas-venda-mobile.png',import.meta.url).pathname.slice(1),fullPage:true});
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/sales')&&r.request().method()==='POST');await dialog().getByRole('button',{name:'Confirmar venda',exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());sale=(await r.json()).id;await dialog().waitFor({state:'hidden'});
  const item=(await get(`/api/v1/sales/${sale}/items`))[0];assert.equal(Number(item.quantity),15);assert.equal(Number(item.box_count),1.5);assert.equal(Number(item.box_weight_kg),10);assert.equal(Number(item.cost_total),450);
  const titles=(await get('/api/v1/titles')).items;assert.equal(Number(titles.find(t=>t.sale_id===sale).outstanding),600);assert.equal(Number((await product()).quantity),32.5);
  await page.getByRole('button',{name:'Ver itens',exact:true}).first().click();assert.ok((await dialog().textContent()).includes('1,5 caixa(s) de 10,0 kg'));await dialog().getByRole('button',{name:'Fechar',exact:true}).click();
 });
 await test('Estoque mostra caixas e sobras; alteração de padrão não muda o histórico',async()=>{
  await navigate('Estoque');const card=page.locator('article').filter({has:page.getByText('Camarão',{exact:true})});await card.getByRole('button',{name:'Alterar peso da caixa',exact:true}).click();await dialog().getByLabel('Peso padrão da caixa (kg)',{exact:true}).fill('20');await dialog().getByRole('button',{name:'Salvar peso da caixa',exact:true}).click();await dialog().waitFor({state:'hidden'});await page.getByText('1 caixa + 12,5 kg · caixa de 20,0 kg',{exact:true}).waitFor();
  assert.equal(Number((await product()).quantity),32.5);assert.equal(Number((await get(`/api/v1/sales/${sale}/items`))[0].box_weight_kg),10);
  await mkdir(new URL('../docs/previews/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../docs/previews/caixas-estoque-mobile.png',import.meta.url).pathname.slice(1),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 });
 await test('Perda em meia caixa converte o peso ajustado e relatórios continuam em kg',async()=>{
  await page.getByRole('button',{name:'Registrar perda',exact:true}).click();await dialog().getByLabel('Produto',{exact:true}).selectOption('1');await chooseBoxes('0.5','15');await dialog().getByLabel('Motivo',{exact:true}).fill('Perda em meia caixa de teste');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/stock/losses')&&r.request().method()==='POST');await dialog().getByRole('button',{name:'Confirmar perda',exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());loss=(await r.json()).id;await dialog().waitFor({state:'hidden'});
  assert.equal(Number((await product()).quantity),25);const report=await get(`/api/v1/reports/result?from=${day}&to=${day}`);assert.equal(Number(report.metrics.purchased_kg),25);assert.equal(Number(report.metrics.sold_kg),15);assert.equal(Number(report.metrics.lost_kg),7.5);assert.equal(Number(report.metrics.operating_result),25);
  const dashboard=await get(`/api/v1/reports/dashboard?from=${day}&to=${day}`);assert.equal(Number(dashboard.stock_kg),25);assert.equal(Number(dashboard.metrics.revenue),700);
 });
 await test('Servidor rejeita metadados inconsistentes e peso inválido sem lançamento parcial',async()=>{
  const body={partyId:null,items:[{productId:1,quantity:'29',unitPrice:'30',boxCount:'2',boxWeightKg:'15'}],paidAmount:'0',method:'PIX',dueDate:day};
  await command('/api/v1/purchases',body,{expected:422});await command('/api/v1/purchases',{...body,items:[{...body.items[0],boxWeightKg:null}]},{expected:422});await command('/api/v1/purchases',{...body,items:[{...body.items[0],boxCount:'0'}]},{expected:400});
  await command('/api/v1/products/1/box-weight',{boxWeightKg:0},{method:'PUT',expected:400});await command('/api/v1/products/1/box-weight',{boxWeightKg:'1000000'},{method:'PUT',expected:400});await command('/api/v1/products/999999/box-weight',{boxWeightKg:15},{method:'PUT',expected:404});
  assert.equal(Number((await product()).quantity),25);assert.equal((await get('/api/v1/purchases')).total,1);
  await command('/api/v1/products/1/box-weight',{boxWeightKg:20},{method:'PUT'});await command('/api/v1/products/1/box-weight',{boxWeightKg:20},{method:'PUT'});
  assert.equal((await c.request.put(base+'/api/v1/products/1/box-weight',{data:{boxWeightKg:15}})).status(),403);
  const anon=await browser.newContext();const token=await(await anon.request.get(base+'/api/auth/csrf')).json();assert.equal((await anon.request.put(base+'/api/v1/products/1/box-weight',{headers:{[token.header]:token.token},data:{boxWeightKg:15}})).status(),401);await anon.close();
 });
 await test('Compra em kg continua compatível e reenvio de caixas não duplica estoque',async()=>{
  const body={partyId:null,items:[{productId:1,quantity:'1',unitPrice:'30'}],paidAmount:'0',method:'PIX',dueDate:day};const key=randomUUID();const id=(await(await command('/api/v1/purchases',body,{key})).json()).id;assert.equal((await(await command('/api/v1/purchases',body,{key})).json()).id,id);assert.equal(Number((await product()).quantity),26);
  await cancel('PURCHASE',id);const boxBody={...body,items:[{productId:1,quantity:'2',unitPrice:'30',boxCount:'0.1',boxWeightKg:'20'}]};const boxKey=randomUUID();const boxId=(await(await command('/api/v1/purchases',boxBody,{key:boxKey})).json()).id;assert.equal((await(await command('/api/v1/purchases',boxBody,{key:boxKey})).json()).id,boxId);assert.equal(Number((await product()).quantity),27);await cancel('PURCHASE',boxId);
 });
 await test('Cancelamentos restauram quilos e dinheiro, sem reexibir saldo inicial',async()=>{
  await cancel('LOSS',loss);await cancel('SALE',sale);const p=await product();assert.equal(Number(p.quantity),47.5);assert.equal(Number(p.stock_value),1425);
  const report=await get(`/api/v1/reports/result?from=${day}&to=${day}`);assert.equal(Number(report.metrics.revenue),0);assert.equal(Number(report.metrics.received),0);assert.equal(Number(report.metrics.receivables),0);
  await page.reload();await page.getByRole('button',{name:'Abrir menu',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Saldo inicial',exact:true}).count(),0);await page.getByRole('button',{name:'Produtos',exact:true}).click();await page.getByRole('button',{name:'Alterar peso da caixa',exact:true}).click();await dialog().getByLabel('Peso padrão da caixa (kg)',{exact:true}).fill('25');await dialog().getByRole('button',{name:'Salvar peso da caixa',exact:true}).click();await dialog().waitFor({state:'hidden'});assert.equal(Number((await product()).box_weight_kg),25);
 });
 await test('Fechamento e CSV preservam caixas históricas independentemente do padrão atual',async()=>{
  const id=(await(await command('/api/v1/closings',{from:day,to:day,note:'Snapshot de validação de caixas'})).json()).id;const before=await get(`/api/v1/closings/${id}`);assert.equal(before.snapshot.schemaVersion,5);const items=before.snapshot.records.sale_items;assert.equal(Number(items.find(i=>i.sale_id===sale).box_weight_kg),10);assert.equal(Number(before.snapshot.report.stock[0].quantity),47.5);
  const csv=await c.request.get(base+`/api/v1/closings/${id}/snapshot`);assert.equal(csv.status(),200);assert.ok((await csv.text()).includes('box_weight_kg'));
  await command('/api/v1/products/1/box-weight',{boxWeightKg:35},{method:'PUT'});const after=await get(`/api/v1/closings/${id}`);assert.equal(after.metadata.snapshot_sha256,before.metadata.snapshot_sha256);assert.deepEqual(after.snapshot,before.snapshot);
 });
 console.log(passed+' cenários de caixas e saldo inicial aprovados exclusivamente em banco isolado.');
}finally{await browser.close();}
