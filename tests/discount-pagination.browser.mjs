import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const project = new URL('../', import.meta.url);
const envText = await readFile(new URL('.env', project), 'utf8');
const env = Object.fromEntries(envText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, locale: 'pt-BR' });
const errors = []; page.on('pageerror', e => errors.push(e.message));
async function request(path, body) {
  const url = 'http://127.0.0.1:15173/api/v1' + path;
  if (!body) { const r = await page.request.get(url); assert.ok(r.ok()); return r.json(); }
  const csrf = await (await page.request.get('http://127.0.0.1:15173/api/auth/csrf')).json();
  const r = await page.request.post(url, { data: body, headers: { [csrf.header]: csrf.token, 'Idempotency-Key': randomUUID() } });
  assert.ok(r.ok(), `${path}: ${await r.text()}`); return r.json();
}
async function navigate(name) {
  if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegação principal', exact: true }).getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(250);
}
try {
  await page.goto('http://127.0.0.1:15173');
  await page.getByLabel('Usuário', { exact: true }).fill(env.APP_ADMIN_USERNAME);
  await page.getByLabel('Senha', { exact: true }).fill(env.APP_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar no sistema', exact: true }).click();
  await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor();
  const customers = await request('/customers?size=20'); assert.ok(customers.total > 200);
  const lastCustomers = await request(`/customers?size=20&page=${customers.totalPages}`);
  const customer = lastCustomers.items.at(-1);
  await navigate('Clientes');
  const controls = page.getByRole('navigation', { name: 'Paginação de Clientes', exact: true });
  await controls.getByRole('button', { name: 'Última', exact: true }).click();
  await page.getByRole('cell', { name: customer.name, exact: false }).waitFor();
  await page.getByLabel('Buscar cliente', { exact: true }).fill('ZZ Paginação');
  const first = await request('/customers?q=ZZ%20Pagina%C3%A7%C3%A3o&size=20');
  await page.getByRole('cell', { name: first.items[0].name, exact: false }).waitFor();
  assert.match(await controls.locator('.pagination-buttons>span').innerText(), /^1 \/ /);
  await page.getByLabel('Registros por página de Clientes', { exact: true }).selectOption('50');
  const fifty = await request('/customers?q=ZZ%20Pagina%C3%A7%C3%A3o&size=50');
  await page.getByRole('cell', { name: fifty.items.at(-1).name, exact: false }).waitFor();
  assert.equal(await page.locator('.panel tbody tr').count(), 50);
  console.log('OK navegador — última página, busca global, retorno à primeira página e tamanho de 50 registros');

  const products = await request('/products?q=ZZ%20Produto&size=100&page=3');
  const product = products.items.at(-1); assert.ok(product);
  const status = await request('/closings/status'); const dueDate = status.date;
  await request('/purchases', { items: [{ productId: product.id, quantity: '5', unitPrice: '30' }], paidAmount: '0', payInFull: true, method: 'PIX', dueDate });
  await navigate('Vendas'); await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Nova venda', exact: true });
  await modal.getByLabel('Buscar Cliente', { exact: true }).fill(customer.name);
  await modal.getByLabel('Cliente', { exact: true }).selectOption(String(customer.id));
  await modal.getByLabel('Buscar Produto', { exact: true }).fill(product.name);
  await modal.getByLabel('Produto', { exact: true }).selectOption(String(product.id));
  await modal.getByLabel('Quantidade (kg)', { exact: true }).fill('2');
  await modal.getByLabel('Preço / kg (R$)', { exact: true }).fill('50');
  await modal.getByLabel('Desconto (R$)', { exact: true }).fill('10');
  assert.match(await modal.locator('.trade-total strong').innerText(), /90,00/);
  await modal.getByLabel('Condição de pagamento', { exact: true }).selectOption('partial');
  await modal.getByLabel('Recebido agora (R$)', { exact: true }).fill('20');
  await page.screenshot({ path: new URL('docs/previews/discount-form.png', project).pathname.replace(/^\//, ''), fullPage: true });
  await modal.getByRole('button', { name: 'Confirmar venda', exact: true }).click();
  await modal.waitFor({ state: 'hidden' });
  const saleRow = page.getByRole('row').filter({ hasText: customer.name });
  await saleRow.waitFor(); assert.match(await saleRow.innerText(), /10,00/); assert.match(await saleRow.innerText(), /90,00/);
  console.log('OK navegador — cliente e produto além da primeira página são selecionáveis; desconto e total líquido aparecem na venda');

  const bulkCustomer = first.items[0];
  for (let i = 0; i < 2; i++) await request('/sales', { partyId: bulkCustomer.id, items: [{ productId: product.id, quantity: '0.2', unitPrice: '50' }], discountAmount: '1', paidAmount: '0', method: 'PIX', dueDate });
  await navigate('Clientes'); await page.getByLabel('Buscar cliente', { exact: true }).fill(bulkCustomer.name);
  await page.getByRole('row').filter({ hasText: bulkCustomer.name }).getByRole('button', { name: 'Extrato', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Extrato · ' + bulkCustomer.name, exact: true });
  await modal.locator('.statement-total strong').filter({ hasText: '18,00' }).waitFor();
  await modal.getByRole('navigation', { name: 'Paginação de Contas do cliente', exact: true }).getByRole('button', { name: 'Última', exact: true }).click();
  await modal.getByRole('button', { name: 'Receber', exact: true }).first().click();
  const receiving = page.getByRole('dialog', { name: 'Receber de ' + bulkCustomer.name, exact: true });
  await receiving.getByLabel('Receber agora (R$)', { exact: true }).fill('3');
  await receiving.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await receiving.waitFor({ state: 'hidden' });
  await modal.locator('.statement-total strong').filter({ hasText: '15,00' }).waitFor();
  await modal.getByRole('button', { name: 'Fechar', exact: true }).click();
  console.log('OK navegador — extrato soma todas as páginas e registra pagamento de título além dos primeiros 200');

  await page.setViewportSize({ width: 390, height: 844 }); await navigate('Clientes');
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); assert.ok(size.scroll <= size.width);
  await page.screenshot({ path: new URL('docs/previews/pagination-mobile.png', project).pathname.replace(/^\//, ''), fullPage: true });
  await navigate('Vendas'); await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Nova venda', exact: true });
  await modal.getByLabel('Desconto (R$)', { exact: true }).scrollIntoViewIfNeeded();
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await page.screenshot({ path: new URL('docs/previews/discount-mobile.png', project).pathname.replace(/^\//, ''), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('OK navegador — paginação e desconto em 390px sem overflow ou erros JavaScript');
} catch (error) {
  console.error(String(error.stack || error).replaceAll(env.APP_ADMIN_PASSWORD, '[senha omitida]'));
  await page.screenshot({ path: new URL('docs/previews/discount-failure.png', project).pathname.replace(/^\//, ''), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
