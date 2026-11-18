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
  const sourceName='Camarão M '+randomUUID().slice(0,8);
  const {id:source}=await post('products',{name:sourceName,suggestedPrice:'40',minimumStock:'0',active:true});
  const {id:target} = await post('products',{name:'Filé '+sourceName,suggestedPrice:'60',minimumStock:'0',active:true});
  const {id:customer} = await post('customers',{name:'Cliente de teste',phone:'',document:'',notes:'',active:true});
  const payment = {paidAmount:'0',method:'PIX',dueDate:day,payInFull:false};
  const {id:purchase} = await post('purchases',{...payment,partyId:null,items:[{productId:source,quantity:'20',unitPrice:'30',suggestedPrice:'40'}]});
  await post('purchases',{...payment,items:[{productId:source,quantity:'1000',unitPrice:'32',suggestedPrice:'43'}]});
  const lots=()=>get('/api/v1/stock/lots?productId='+source);
  const [old,fresh]=await lots();
  assert.equal(Number(old.suggested_price),40);
  assert.equal(Number(fresh.suggested_price),43);
  const lines=[{productId:source,lotId:old.id,quantity:'20',unitPrice:'40'},
    {productId:source,lotId:fresh.id,quantity:'5',unitPrice:'43'}];
  const {id:sale}=await post('sales',{...payment,partyId:customer,items:lines});
  assert.deepEqual((await lots()).map(l=>Number(l.quantity)),[995]);
  const items=await get('/api/v1/sales/'+sale+'/items');
  assert.deepEqual(items.map(i=>Number(i.cost_total)),[600,160]);
  const reason={reason:'Conferência do lote no teste'};
  await post('corrections/SALE/'+sale,reason);
  assert.deepEqual((await lots()).map(l=>Number(l.quantity)),[20,1000]);
  const {id:batch}=await post('processing',{sourceProductId:source,targetProductId:target,lotId:old.id,inputKg:'20',outputKg:'12'});
  const [fillet]=await get('/api/v1/stock/lots?productId='+target);
  assert.equal(Number(fillet.stock_value),600);
  assert.equal(Number(fillet.origin_id),batch);
  assert.deepEqual((await lots()).map(l=>l.id),[fresh.id]);
  await post('corrections/PROCESS/'+batch,reason);
  assert.equal((await lots())[0].id,old.id);
  await page.goto(base);
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByRole('button',{name:'Estoque',exact:true}).click();
  await page.getByRole('article').filter({has:page.getByText(sourceName,{exact:true})}).getByRole('button',{name:'Ver lotes',exact:true}).click();
  await page.getByText('Entrega #'+purchase+' ·',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  await page.getByRole('button',{name:'Vendas',exact:true}).click();
  await page.getByRole('button',{name:'Nova venda',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Produto',{exact:true}).selectOption(String(source));
  await page.waitForFunction(()=>document.querySelector('dialog input[type=number][step="0.000001"]')?.value==='40');
  await dialog.getByLabel('Lote de origem').selectOption(String(fresh.id));
  assert.equal(Number(await dialog.getByLabel('Preço / kg (R$)',{exact:true}).inputValue()),43);
  console.log('Venda de dois lotes, custos, cancelamentos, beneficiamento e estoque móvel validados.');
} finally {await browser.close();}
