import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const config=await readFile(new URL('../.env',import.meta.url),'utf8');
const env=Object.fromEntries(config.trim().split(/\r?\n/).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const browser=await chromium.launch({channel:'msedge',headless:true});
const base='http://127.0.0.1:15173';
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await page.request.get(base+'/api/v1/corrections')).status(),401);
  await page.goto(base);
  await page.getByLabel('Usuário',{exact:true}).fill(env.APP_ADMIN_USERNAME);
  await page.getByLabel('Senha',{exact:true}).fill(env.APP_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'Entrar no sistema',exact:true}).click();
  await page.getByRole('heading',{name:'Visão geral',exact:true}).waitFor();
  const day=(await (await page.request.get(base+'/api/v1/closings/status')).json()).date;
  async function post(path,body){
    const token=await (await page.request.get(base+'/api/auth/csrf')).json();
    const r=await page.request.post(base+'/api/v1'+path,{headers:{[token.header]:token.token,'Idempotency-Key':randomUUID()},data:body});
    assert.equal(r.status(),200,await r.text());
    return r.json();
  }
  const tag=randomUUID().slice(0,8);
  const expenseBody={description:'Correção navegador '+tag,category:'Teste',amount:'15',paidAmount:'0',method:'PIX',dueDate:day};
  const original=await post('/expenses',expenseBody);
  await page.getByRole('navigation').getByRole('button',{name:'Despesas',exact:true}).click();
  const originalRow=page.getByRole('row').filter({hasText:expenseBody.description});
  await originalRow.getByRole('button',{name:'Corrigir',exact:true}).click();
  let dialog=page.getByRole('dialog');
  const confirm=dialog.getByRole('button',{name:'Confirmar cancelamento',exact:true});
  await confirm.waitFor();
  assert.equal(await confirm.isDisabled(),true);
  await dialog.getByLabel('Motivo da correção',{exact:true}).fill('Valor digitado incorretamente');
  await dialog.getByLabel('Conferi os efeitos',{exact:false}).check();
  await confirm.click();
  await page.getByRole('dialog').getByLabel('Lançamento substituto',{exact:true}).waitFor();
  const replacement=await post('/expenses',{...expenseBody,description:'Substituto '+tag,amount:'16'});
  // Reopen to refresh the candidates after the new document is created.
  await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
  await originalRow.getByRole('button',{name:'Ver cancelamento',exact:true}).click();
  dialog=page.getByRole('dialog');
  await dialog.getByLabel('Lançamento substituto',{exact:true}).selectOption(String(replacement.id));
  await dialog.getByRole('button',{name:'Vincular lançamento correto',exact:true}).click();
  await page.getByRole('dialog').getByText('Lançamento substituto #'+replacement.id,{exact:true}).waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Correções',exact:true}).click();
  await page.getByLabel('Buscar correções',{exact:true}).fill('Valor digitado incorretamente');
  await page.getByRole('row').filter({hasText:'Despesa #'+original.id}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const history=await (await page.request.get(base+'/api/v1/corrections')).json();
  assert.ok(history.items.some(c=>c.source_id===original.id&&c.replacement_id===replacement.id));
  // API also enforces CSRF on cancellation.
  const denied=await page.request.post(base+'/api/v1/corrections/EXPENSE/'+replacement.id,{headers:{'Idempotency-Key':randomUUID()},data:{reason:'Requisição sem token'}});
  assert.equal(denied.status(),403);
  assert.deepEqual(errors,[]);
  console.log('OK: prévia, confirmação, cancelamento, selo na origem, vínculo do substituto, histórico, CSRF e tela móvel.');
} finally {await browser.close();}

