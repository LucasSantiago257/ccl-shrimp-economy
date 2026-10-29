import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const project = new URL('../', import.meta.url);
const envText = await readFile(new URL('.env', project), 'utf8');
const env = Object.fromEntries(envText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, locale: 'pt-BR' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const preview = new URL('docs/previews/', project);
await mkdir(preview, { recursive: true });
const tag = Date.now().toString().slice(-6);
const customer = 'Cliente Navegador ' + tag, supplier = 'Fornecedor Navegador ' + tag;
async function navigate(name) {
  if (await page.getByRole('button', { name: 'Abrir menu', exact: true }).isVisible()) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(250); // Aguarda o término da transição do menu móvel.
}
try {
  await page.goto('http://127.0.0.1:15173');
  await page.getByLabel('Usuário', { exact: true }).fill(env.APP_ADMIN_USERNAME);
  await page.getByLabel('Senha', { exact: true }).fill(env.APP_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Entrar no sistema', exact: true }).click();
  await page.getByRole('heading', { name: 'Visão geral', exact: true }).waitFor();
  await page.getByText('Vendido no mês', { exact: true }).waitFor();
  console.log('OK navegador — login e painel com dados reais da API');
  for (const [nav, button, name] of [['Clientes', 'Novo cliente', customer], ['Fornecedores', 'Novo fornecedor', supplier]]) {
    await navigate(nav); await page.getByRole('button', { name: button, exact: true }).click();
    const modal = page.getByRole('dialog'); await modal.getByLabel('Nome', { exact: true }).fill(name);
    await modal.getByRole('button', { name: 'Salvar cadastro', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('cell', { name, exact: false }).waitFor();
  }
  console.log('OK navegador — cadastro de cliente e fornecedor');
  await navigate('Compras'); await page.getByRole('button', { name: 'Nova compra', exact: true }).click();
  let modal = page.getByRole('dialog');
  await modal.getByLabel('Fornecedor (opcional)', { exact: true }).selectOption({ label: supplier });
  await modal.getByLabel('Produto', { exact: true }).selectOption({ label: 'Camarão' });
  await modal.getByLabel('Quantidade (kg)', { exact: true }).fill('5');
  await modal.getByLabel('Custo / kg (R$)', { exact: true }).fill('30');
  await modal.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('cell', { name: supplier, exact: true }).waitFor();
  console.log('OK navegador — compra com entrada em estoque');
  await navigate('Vendas'); await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Cliente', { exact: true }).selectOption({ label: customer });
  await modal.getByLabel('Produto', { exact: true }).selectOption({ label: 'Camarão' });
  await modal.getByLabel('Quantidade (kg)', { exact: false }).fill('1.25');
  await modal.getByLabel('Preço / kg (R$)', { exact: true }).fill('50');
  await modal.getByLabel('Condição de pagamento', { exact: true }).selectOption('partial');
  await modal.getByLabel('Recebido agora (R$)', { exact: true }).fill('20');
  await modal.getByRole('button', { name: 'Confirmar venda', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  console.log('OK navegador — venda com recebimento parcial');
  await navigate('Financeiro');
  let row = page.getByRole('row').filter({ hasText: customer });
  await row.getByRole('button', { name: 'Receber', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Receber agora (R$)', { exact: true }).fill('10');
  await modal.getByRole('button', { name: 'Confirmar recebimento', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForTimeout(350);
  assert.match(await row.innerText(), /32,50/);
  console.log('OK navegador — baixa posterior e dívida restante de R$ 32,50');
  await navigate('Compras'); await page.getByRole('button', { name: 'Nova compra', exact: true }).click();
  modal = page.getByRole('dialog');
  await modal.getByLabel('Quantidade (kg)', { exact: true }).fill('1');
  await modal.getByLabel('Custo / kg (R$)', { exact: true }).fill('30');
  await modal.getByLabel('Condição de pagamento', { exact: true }).selectOption('none');
  await modal.getByRole('button', { name: 'Confirmar compra', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('cell', { name: 'Fornecedor não informado', exact: true }).first().waitFor();
  console.log('OK navegador — compra a prazo sem fornecedor');
  await navigate('Visão geral'); await page.getByText('Vendido no mês', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Vendas a receber', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Compras a pagar', exact: true }).waitFor();
  console.log('OK navegador — compras e vendas pendentes no painel');
  await page.screenshot({ path: new URL('desktop.png', preview).pathname.replace(/^\//, ''), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const nav of ['Visão geral', 'Clientes', 'Produtos', 'Compras', 'Vendas', 'Estoque', 'Financeiro', 'Despesas', 'Fechamento']) {
    await navigate(nav); await page.getByRole('heading', { name: nav, exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
    if (dimensions.scroll > dimensions.width) console.log('Overflow', await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 20).map(e => ({ tag: e.tagName, cls: e.className, right: e.getBoundingClientRect().right, width: e.getBoundingClientRect().width }))));
    assert.ok(dimensions.scroll <= dimensions.width, `Overflow horizontal em ${nav}: ${JSON.stringify(dimensions)}`);
  }
  await navigate('Vendas'); await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: new URL('mobile-sale.png', preview).pathname.replace(/^\//, ''), fullPage: true });
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await navigate('Visão geral'); await page.getByText('Vendido no mês', { exact: true }).waitFor();
  await page.screenshot({ path: new URL('mobile.png', preview).pathname.replace(/^\//, ''), fullPage: true });
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  assert.deepEqual(errors, []);
  console.log('OK navegador — nove telas sem overflow em 390px, formulário móvel, sessão sem localStorage e nenhum erro JavaScript');
} catch (error) {
  console.error(String(error.stack || error).replaceAll(env.APP_ADMIN_PASSWORD, '[senha omitida]'));
  await page.screenshot({ path: new URL('browser-failure.png', preview).pathname.replace(/^\//, ''), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
