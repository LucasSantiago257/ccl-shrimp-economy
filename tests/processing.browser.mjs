import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:15173';
const browser = await chromium.launch({channel:'msedge',headless:true});
const context = await browser.newContext({viewport:{width:390,height:844}});
const page = await context.newPage();

async function get(path) {
  const response = await context.request.get(base + path);
  assert.equal(response.status(),200,await response.text());
  return response.json();
}

async function post(path,data,status=200,key=randomUUID()) {
  const csrf = await get('/api/auth/csrf');
  const response = await context.request.post(base + '/api/v1/' + path,{
    data, headers:{[csrf.header]:csrf.token,'Idempotency-Key':key}
  });
  assert.equal(response.status(),status,await response.text());
  return response.json();
}

try {
  const csrf = await get('/api/auth/csrf');
  const login = await context.request.post(base+'/api/login',{
    form:{username:'boxes-qa',password:'Boxes-QA-Only-2026!'},headers:{[csrf.header]:csrf.token}
  });
  assert.equal(login.status(),204);
  const {date:day} = await get('/api/v1/opening-balances');
  const {id:target} = await post('products',{name:'Filé de camarão',suggestedPrice:'60',minimumStock:'0',active:true});
  const {id:customer} = await post('customers',{name:'Cliente de teste',phone:'',document:'',notes:'',active:true});
  const payment = {paidAmount:'0',method:'PIX',dueDate:day,payInFull:false};
  const {id:purchase} = await post('purchases',{...payment,partyId:null,items:[{productId:1,quantity:'10',unitPrice:'30'}]});
  const batch = {sourceProductId:1,targetProductId:target,inputKg:'10',outputKg:'6'};
  await post('processing',{...batch,targetProductId:1},422);
  await post('processing',{...batch,outputKg:'11'},422);
  await post('processing',{...batch,inputKg:'11'},409);
  await post('processing',{...batch,targetProductId:999999},404);
  const products = async () => (await get('/api/v1/products')).items;
  assert.equal(Number((await products()).find(p=>p.id===1).quantity),10);

  await page.goto(base);
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByRole('button',{name:'Beneficiamento',exact:true}).click();
  await page.getByRole('button',{name:'Novo beneficiamento',exact:true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Produto de origem',{exact:true}).selectOption('1');
  await dialog.getByLabel('Produto resultante',{exact:true}).selectOption(String(target));
  await dialog.getByLabel('Peso consumido (kg)').fill('10');
  await dialog.getByLabel('Peso obtido (kg)').fill('6');
  await dialog.getByText(/Rendimento de 60%/).waitFor();
  const request = page.waitForResponse(r=>r.url().endsWith('/api/v1/processing')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Confirmar beneficiamento'}).click();
  const created = await request;
  assert.equal(created.status(),200,await created.text());
  const {id} = await created.json();
  await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  let items = await products();
  assert.equal(Number(items.find(p=>p.id===1).quantity),0);
  assert.equal(Number(items.find(p=>p.id===target).quantity),6);
  assert.equal(Number(items.find(p=>p.id===target).stock_value),300);
  assert.equal(Number(items.find(p=>p.id===target).average_cost),50);

  const dependency = await get('/api/v1/corrections/PURCHASE/'+purchase+'/preview');
  assert.ok(dependency.dependencies.some(m=>m.type==='PROCESS'&&m.source_id===id));
  const {id:sale} = await post('sales',{...payment,partyId:customer,items:[{productId:target,quantity:'2',unitPrice:'60'}]});
  const report = await get('/api/v1/reports/result?from='+day+'&to='+day);
  assert.equal(Number(report.metrics.cost_of_goods),100);
  assert.equal(Number(report.metrics.lost_kg),0);
  assert.equal(Number(report.metrics.losses),0);
  assert.equal(Number(report.stock.find(p=>p.id===target).quantity),4);
  const reason = {reason:'Corrigir lote de teste'};
  await post('corrections/PROCESS/'+id,reason,409);
  await post('corrections/SALE/'+sale,reason);
  const {id:correction} = await post('corrections/PROCESS/'+id,reason);
  items = await products();
  assert.equal(Number(items.find(p=>p.id===1).stock_value),300);
  assert.equal(Number(items.find(p=>p.id===target).quantity),0);
  const key = randomUUID();
  const replacement = await post('corrections/'+correction+'/replacement/new',batch,200,key);
  assert.deepEqual(await post('corrections/'+correction+'/replacement/new',batch,200,key),replacement);
  assert.equal((await get('/api/v1/processing')).total,2);

  const closing = await post('closings',{from:day,to:day,note:'Beneficiamento QA'});
  const snapshot = (await get('/api/v1/closings/'+closing.id)).snapshot;
  assert.equal(snapshot.records.processing_batches.length,2);
  assert.equal(Number(snapshot.report.stock.find(p=>p.id===target).stock_value),300);
  await post('processing',batch,409);
  console.log('Beneficiamento validado em MySQL e tela de 390 px, incluindo estoque, custo da venda, cancelamento, substituição e snapshot.');
} finally {
  await browser.close();
}
