import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const config=await readFile(new URL('../.env',import.meta.url),'utf8');
const env=Object.fromEntries(config.trim().split(/\r?\n/).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const browser=await chromium.launch({channel:'msedge',headless:true});
const base='http://127.0.0.1:15173';
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await page.request.get(base+'/api/v1/corrections')).status(),401);
 await page.goto(base);
 await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);
 await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
 await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
 await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
 const day=(await (await page.request.get(base+'/api/v1/closings/status')).json()).date;
 async function post(path,body) {
   const token=await (await page.request.get(base+'/api/auth/csrf')).json();
   const r=await page.request.post(base+'/api/v1'+path,{headers:{[token.header]:token.token,'Idempotency-Key':randomUUID()},data:body});
   assert.equal(r.status(),200,await r.text());return r.json();
 }
 async function get(path) {
   const r=await page.request.get(base+'/api/v1'+path);assert.equal(r.status(),200,await r.text());return r.json();
 }
 async function navigate(name) {
   if(await page.getByRole('button',{name:'Abrir menu',exact:true}).isVisible()) await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
   await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
 }
 const dialog=()=>page.getByRole('dialog');
 async function confirm(reason) {
   const next=dialog().getByRole('button',{name:'Confirmar cancelamento',exact:true});
   await next.waitFor();
   assert.equal(await next.isDisabled(),true);
   await dialog().getByLabel('Por que deseja cancelar?',{exact:true}).fill(reason);
   await next.click();
   await dialog().getByText('Cancelamento concluído',{exact:true}).waitFor();
 }
 const tag=randomUUID().slice(0,8);
 const description='Correção guiada '+tag;
 const original=await post('/expenses',{description,category:'Teste',amount:'15',paidAmount:'5',method:'PIX',dueDate:day});
 await navigate('Despesas');
 const row=page.getByRole('row').filter({hasText:description});
 await row.getByRole('button',{name:'Cancelar',exact:true}).click();
 await dialog().getByText('Estorno automático de R$ 5,00',{exact:true}).waitFor();
 assert.equal(await dialog().getByRole('button',{name:/Conferir pagamento vinculado/}).count(),0);
 await confirm('Valor digitado incorretamente');
 await dialog().getByRole('button',{name:'Registrar dados corretos',exact:true}).click();
 await dialog().getByRole('heading',{name:'Nova despesa',exact:true}).waitFor();
 await dialog().getByLabel('Descrição',{exact:true}).fill('Despesa correta '+tag);
 await dialog().getByLabel('Valor total (R$)',{exact:true}).fill('16');
 await dialog().getByRole('button',{name:'Registrar despesa',exact:true}).click();
 await dialog().waitFor({state:'hidden'});
 const history=await get('/corrections?size=100');
 const correction=history.items.find(c=>c.kind==='EXPENSE'&&c.source_id===original.id);
 assert.ok(correction.replacement_id,'Vínculo automático ao salvar');
 assert.ok(!history.items.some(c=>c.kind==='PAYMENT'&&c.reason==='Pagamento do registro incorreto'));
 await navigate('Correções');
 assert.equal(await page.getByLabel('Número do lançamento',{exact:true}).count(),0);
 await page.getByLabel('Buscar correções',{exact:true}).fill('Valor digitado incorretamente');
 await page.getByRole('row').filter({hasText:'Despesa #'+original.id}).waitFor();

 // A plain cancellation ends without demanding a replacement.
 const duplicate=await post('/expenses',{description:'Duplicidade '+tag,category:'Teste',amount:'12',paidAmount:'0',method:'PIX',dueDate:day});
 await navigate('Despesas');
 await page.getByRole('row').filter({hasText:'Duplicidade '+tag}).getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await dialog().getByLabel('Por que deseja cancelar?',{exact:true}).fill('Registro duplicado');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await mkdir(new URL('../docs/previews/',import.meta.url),{recursive:true});
 await dialog().screenshot({path:new URL('../docs/previews/cancel-flow-mobile.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),animations:'disabled'});
 await dialog().getByRole('button',{name:'Confirmar cancelamento',exact:true}).click();
 await dialog().getByRole('button',{name:'Concluir',exact:true}).click();
 const done=(await get('/corrections?size=100')).items.find(c=>c.kind==='EXPENSE'&&c.source_id===duplicate.id);
 assert.ok(done && !done.replacement_id);

 // Stock dependencies retain a path back to the original purchase.
 const product=(await post('/products',{code:'FLOW-'+tag,name:'Camarão fluxo '+tag,suggestedPrice:'50',minimumStock:'0',active:true})).id;
 const customer=(await post('/customers',{name:'Cliente fluxo '+tag,phone:'',document:'',notes:'',active:true})).id;
 const purchase=await post('/purchases',{items:[{productId:product,quantity:'2',unitPrice:'30'}],paidAmount:'12',method:'PIX',dueDate:day});
 const sale=await post('/sales',{partyId:customer,items:[{productId:product,quantity:'1',unitPrice:'50'}],paidAmount:'10',method:'PIX',dueDate:day});
 await navigate('Compras');
 await page.getByRole('row').filter({hasText:'#'+String(purchase.id).padStart(4,'0')}).getByRole('button',{name:'Cancelar',exact:true}).click();
 await dialog().getByRole('button',{name:'Conferir venda mais recente',exact:true}).click();
 await dialog().getByText('Etapa necessária para cancelar Compra #'+purchase.id,{exact:true}).waitFor();
 await dialog().getByText('Estorno automático de R$ 10,00',{exact:true}).waitFor();
 await confirm('Venda dependente do registro errado');
 await dialog().getByRole('button',{name:'Continuar cancelamento de Compra #'+purchase.id,exact:true}).click();
 await dialog().getByText('Estorno automático de R$ 12,00',{exact:true}).waitFor();
 await confirm('Compra registrada incorretamente');
 await dialog().getByRole('button',{name:'Concluir',exact:true}).click();
 assert.ok((await get('/corrections?size=100')).items.some(c=>c.kind==='SALE'&&c.source_id===sale.id));
 const denied=await page.request.post(base+'/api/v1/corrections/EXPENSE/'+original.id,{headers:{'Idempotency-Key':randomUUID()},data:{reason:'Sem token de segurança'}});
 assert.equal(denied.status(),403);
 assert.deepEqual(errors,[]);
 console.log('OK: confirmação única, estorno financeiro automático de compra/venda/despesa, vínculo automático e celular.');
} finally {await browser.close();}

