// Teste destrutivo apenas no sentido de criar dados fictícios em camarao_test.
// Não recebe URL externa: porta reservada ao Compose de teste.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = 'http://127.0.0.1:18080';
const envText = await readFile(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(envText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const cookies = new Map();
let passed = 0;
async function http(path, { method = 'GET', body, key, expected = 200, auth = true, csrf = true, form = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET' && csrf) {
    const token = await http('/api/auth/csrf');
    headers[token.header] = token.token;
  }
  if (auth) headers.Cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
  if (body !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (auth) for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]; const i = pair.indexOf('=');
    if (pair.slice(i + 1)) cookies.set(pair.slice(0, i), pair.slice(i + 1)); else cookies.delete(pair.slice(0, i));
  }
  const raw = await response.text();
  let data; try { data = raw ? JSON.parse(raw) : undefined; } catch { data = raw; }
  if (response.status !== expected) throw new Error(`${method} ${path}: esperado HTTP ${expected}, recebido ${response.status}. ${JSON.stringify(data)}`);
  return data;
}
async function test(name, action) { await action(); passed++; console.log(`OK ${passed} — ${name}`); }
const get = path => http('/api/v1' + path);
const post = (path, body, expected = 200, key = randomUUID()) => http('/api/v1' + path, { method: 'POST', body, expected, key });
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tag = randomUUID().slice(0, 8);
let customer, otherCustomer, supplier, product, saleId, saleKey, saleBody, title;
const party = name => ({ name: name + ' ' + tag, phone: '71999990000', document: '', notes: 'Dado fictício de teste', active: true });
const report = () => get(`/reports/result?from=${day}&to=${day}`);

await test('API protegida sem autenticação', async () => { await http('/api/v1/products', { auth: false, expected: 401 }); });
await test('Login com sessão e CSRF', async () => {
  await http('/api/login', { method: 'POST', body: { username: env.APP_ADMIN_USERNAME, password: env.APP_ADMIN_PASSWORD }, form: true, expected: 204 });
  const user = await http('/api/auth/me'); assert.equal(user.username, env.APP_ADMIN_USERNAME);
});
await test('Banco de teste sem lançamentos anteriores', async () => {
  const r = await report(); assert.equal(Number(r.metrics.revenue), 0); assert.equal(Number(r.metrics.purchases), 0); assert.equal(Number(r.metrics.expenses), 0);
});
await test('Cadastros e estoque inicial zero', async () => {
  customer = (await post('/customers', party('Cliente teste'))).id;
  otherCustomer = (await post('/customers', party('Outro cliente'))).id;
  supplier = (await post('/suppliers', party('Fornecedor teste'))).id;
  product = (await post('/products', { code: 'QA-' + tag, name: 'Camarão teste ' + tag, suggestedPrice: '50', minimumStock: '5', active: true })).id;
  const p = (await get('/products')).find(p => p.id === product); assert.equal(Number(p.quantity), 0);
});
await test('POST sem CSRF é bloqueado', async () => {
  await http('/api/v1/customers', { method: 'POST', body: party('Bloqueado'), csrf: false, expected: 403 });
});
await test('Compra de 100 kg por R$ 3.000 com pagamento imediato', async () => {
  await post('/purchases', { partyId: supplier, items: [{ productId: product, quantity: '100', unitPrice: '30' }], paidAmount: '0', payInFull: true, method: 'PIX', dueDate: day });
  const p = (await get('/products')).find(p => p.id === product); assert.equal(Number(p.quantity), 100); assert.equal(Number(p.average_cost), 30);
});
await test('Venda de 40 kg, recebimento parcial e dívida de R$ 1.000', async () => {
  saleKey = randomUUID(); saleBody = { partyId: customer, items: [{ productId: product, quantity: '40', unitPrice: '50' }], paidAmount: '1000', method: 'PIX', dueDate: day };
  saleId = (await post('/sales', saleBody, 200, saleKey)).id;
  title = (await get(`/titles?customerId=${customer}`)).find(t => t.sale_id === saleId);
  assert.equal(Number(title.outstanding), 1000);
  const p = (await get('/products')).find(p => p.id === product); assert.equal(Number(p.quantity), 60);
});
await test('Repetição da mesma chave não duplica venda nem estoque', async () => {
  assert.equal((await post('/sales', saleBody, 200, saleKey)).id, saleId);
  const sales = await get('/sales'); assert.equal(sales.length, 1);
  await post('/sales', { ...saleBody, paidAmount: '999' }, 409, saleKey);
  const p = (await get('/products')).find(p => p.id === product); assert.equal(Number(p.quantity), 60);
});
await test('Pagamento posterior de R$ 400 preserva estoque e venda', async () => {
  const body = { method: 'CASH', allocations: [{ titleId: title.id, amount: '400' }] }, key = randomUUID();
  const payment = await post('/settlements', body, 200, key);
  assert.equal((await post('/settlements', body, 200, key)).id, payment.id);
  const current = (await get(`/titles?customerId=${customer}`))[0]; assert.equal(Number(current.outstanding), 600);
  const customers = await get('/customers'); assert.equal(Number(customers.find(c => c.id === customer).balance), 600);
  const p = (await get('/products')).find(p => p.id === product); assert.equal(Number(p.quantity), 60);
});
await test('Despesa paga e fechamento conciliado', async () => {
  await post('/expenses', { description: 'Gelo teste', category: 'Conservação', amount: '100', paidAmount: '100', method: 'PIX', dueDate: day });
  const r = await report(); const m = r.metrics;
  for (const [key, value] of Object.entries({ revenue: 2000, cost_of_goods: 1200, purchases: 3000, expenses: 100, gross_profit: 800, operating_result: 700, received: 1400, paid: 3100, cash_flow: -1700, receivables: 600, payables: 0, purchased_kg: 100, sold_kg: 40 })) assert.equal(Number(m[key]), value, key);
  const p = r.stock.find(p => p.id === product); assert.equal(Number(p.quantity), 60); assert.equal(Number(p.stock_value), 1800);
});
await test('Consulta histórica não inclui operações posteriores', async () => {
  const prior = new Date(day + 'T12:00:00Z'); prior.setUTCDate(prior.getUTCDate() - 1); const previous = prior.toISOString().slice(0, 10);
  const r = await get(`/reports/result?from=${previous}&to=${previous}`);
  assert.equal(Number(r.metrics.revenue), 0); assert.equal(Number(r.metrics.receivables), 0);
  assert.equal(Number(r.stock.find(p => p.id === product).quantity), 0);
});
await test('Pagamento acima da dívida é rejeitado sem efeito', async () => {
  const before = (await get('/settlements')).length;
  await post('/settlements', { method: 'PIX', allocations: [{ titleId: title.id, amount: '600.01' }] }, 422);
  assert.equal((await get('/settlements')).length, before);
});
await test('Venda sem estoque não deixa documento, dívida ou movimento', async () => {
  const before = (await get('/sales')).length, movements = (await get('/stock/movements')).length;
  await post('/sales', { ...saleBody, items: [{ productId: product, quantity: '60.001', unitPrice: '50' }], paidAmount: '0' }, 409);
  assert.equal((await get('/sales')).length, before); assert.equal((await get('/stock/movements')).length, movements);
});
await test('Quantidade negativa e precisão acima de gramas são rejeitadas', async () => {
  await post('/sales', { ...saleBody, items: [{ productId: product, quantity: '-1', unitPrice: '50' }] }, 400);
  await post('/sales', { ...saleBody, items: [{ productId: product, quantity: '1.0001', unitPrice: '50' }] }, 400);
});
await test('Perda reduz quantidade e resultado sem mexer no caixa', async () => {
  await post('/stock/losses', { productId: product, quantity: '2', reason: 'Descarte de teste' });
  const r = await report(); assert.equal(Number(r.metrics.losses), 60); assert.equal(Number(r.metrics.operating_result), 640); assert.equal(Number(r.metrics.cash_flow), -1700);
  assert.equal(Number(r.stock.find(p => p.id === product).quantity), 58);
});
let concurrentProduct;
await test('Rollback de todos os itens quando um deles falha', async () => {
  concurrentProduct = (await post('/products', { code: 'QC-' + tag, name: 'Produto concorrência ' + tag, suggestedPrice: '50', minimumStock: '0', active: true })).id;
  const before = (await get('/products')).find(p => p.id === product);
  await post('/sales', { ...saleBody, items: [{ productId: product, quantity: '1', unitPrice: '50' }, { productId: concurrentProduct, quantity: '1', unitPrice: '50' }], paidAmount: '0' }, 409);
  const after = (await get('/products')).find(p => p.id === product); assert.equal(Number(after.quantity), Number(before.quantity)); assert.equal(Number(after.stock_value), Number(before.stock_value));
});
await test('Vendas concorrentes não vendem os mesmos últimos quilos', async () => {
  await post('/purchases', { partyId: supplier, items: [{ productId: concurrentProduct, quantity: '1', unitPrice: '30' }], paidAmount: '0', method: 'PIX', dueDate: day });
  const body = { partyId: otherCustomer, items: [{ productId: concurrentProduct, quantity: '0.750', unitPrice: '50' }], paidAmount: '0', method: 'PIX', dueDate: day };
  const outcomes = await Promise.allSettled([post('/sales', body), post('/sales', body)]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(Number((await get('/products')).find(p => p.id === concurrentProduct).quantity), 0.25);
});
await test('Pagamentos concorrentes não excedem a dívida', async () => {
  const body = { method: 'PIX', allocations: [{ titleId: title.id, amount: '400' }] };
  const outcomes = await Promise.allSettled([post('/settlements', body), post('/settlements', body)]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(Number((await get(`/titles?customerId=${customer}`))[0].outstanding), 200);
});
await test('Preço novo não altera receita e custo da venda antiga', async () => {
  await http('/api/v1/products/' + product, { method: 'PUT', body: { code: 'QA-' + tag, name: 'Camarão teste ' + tag, suggestedPrice: '80', minimumStock: '5', active: true } });
  const items = await get(`/sales/${saleId}/items`); assert.equal(Number(items[0].unit_price), 50); assert.equal(Number(items[0].cost_total), 1200);
});
await test('Pagamento não mistura dívidas de clientes diferentes', async () => {
  const other = (await get(`/titles?customerId=${otherCustomer}`))[0];
  const before = (await get('/settlements')).length;
  await post('/settlements', { method: 'PIX', allocations: [{ titleId: title.id, amount: '10' }, { titleId: other.id, amount: '10' }] }, 422);
  assert.equal((await get('/settlements')).length, before);
});
await test('Um pagamento quita duas contas do mesmo cliente', async () => {
  const sale = await post('/sales', { ...saleBody, items: [{ productId: product, quantity: '0.250', unitPrice: '50' }], paidAmount: '0' });
  const secondTitle = (await get(`/titles?customerId=${customer}`)).find(t => t.sale_id === sale.id);
  const payment = await post('/settlements', { method: 'PIX', allocations: [{ titleId: title.id, amount: '50' }, { titleId: secondTitle.id, amount: '12.50' }] });
  const records = await get(`/settlements?customerId=${customer}`); assert.equal(Number(records.find(s => s.id === payment.id).amount), 62.5);
  const current = await get(`/titles?customerId=${customer}`); assert.equal(Number(current.find(t => t.id === title.id).outstanding), 150); assert.equal(Number(current.find(t => t.id === secondTitle.id).outstanding), 0);
});
await test('Pagamento integral usa arredondamento exato do servidor', async () => {
  const sale = await post('/sales', { ...saleBody, items: [{ productId: product, quantity: '0.001', unitPrice: '5' }], paidAmount: '0', payInFull: true });
  const current = (await get(`/titles?customerId=${customer}`)).find(t => t.sale_id === sale.id);
  assert.equal(Number(current.amount), 0.01); assert.equal(Number(current.paid), 0.01); assert.equal(Number(current.outstanding), 0);
});
await test('Requisições simultâneas com a mesma chave criam uma única despesa', async () => {
  const key = randomUUID(), body = { description: 'Idempotência concorrente', category: 'Teste', amount: '0.01', paidAmount: '0', method: 'PIX', dueDate: day };
  const before = (await get('/expenses')).length;
  const results = await Promise.all([post('/expenses', body, 200, key), post('/expenses', body, 200, key)]);
  assert.equal(results[0].id, results[1].id); assert.equal((await get('/expenses')).length, before + 1);
});
await test('Logout encerra o acesso', async () => { await http('/api/logout', { method: 'POST', expected: 204 }); await http('/api/auth/me', { expected: 401 }); });
console.log(`\n${passed} verificações de integração aprovadas em MySQL real. Dados fictícios preservados somente no ambiente de teste.`);
