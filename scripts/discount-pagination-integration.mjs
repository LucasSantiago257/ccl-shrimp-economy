import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:18080'; // Exclusivamente o banco de teste.
const contents = await readFile(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(contents.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const cookies = new Map(); let passed = 0;
async function http(path, { method = 'GET', body, key, expected = 200, form = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') { const csrf = await http('/api/auth/csrf'); headers[csrf.header] = csrf.token; }
  headers.Cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
  if (body !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(30000) });
  for (const cookie of r.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
  const raw = await r.text(); let value; try { value = raw ? JSON.parse(raw) : undefined; } catch { value = raw; }
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(value)}`); return value;
}
const get = path => http('/api/v1' + path);
const post = (path, body, expected = 200, key = randomUUID()) => http('/api/v1' + path, { method: 'POST', body, key, expected });
const cents = value => BigInt(Math.round(Number(value) * 100));
async function test(name, run) { await run(); console.log(`OK desconto/paginação ${++passed} — ${name}`); }
async function batch(count, run) { const result = []; for (let start = 0; start < count; start += 8) result.push(...await Promise.all(Array.from({ length: Math.min(8, count - start) }, (_, i) => run(start + i)))); return result; }
async function collect(path, size = 37) {
  const join = path.includes('?') ? '&' : '?'; const rows = []; let first;
  for (let page = 1; ; page++) {
    const data = await get(`${path}${join}page=${page}&size=${size}`); first ||= data;
    assert.equal(data.page, page); assert.equal(data.size, size); assert.equal(data.total, first.total);
    assert.ok(data.items.length <= size); rows.push(...data.items);
    if (!data.hasNext) break;
  }
  assert.equal(rows.length, first.total); assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  return { rows, total: first.total, summary: first.summary };
}
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tag = randomUUID().slice(0, 8), partner = name => ({ name, phone: '71999990000', document: '', notes: 'Fictício', active: true });
await http('/api/login', { method: 'POST', body: { username: env.APP_ADMIN_USERNAME, password: env.APP_ADMIN_PASSWORD }, expected: 204, form: true });
assert.equal((await get('/closings/status')).closed, false, 'Execute antes de fechar o dia de teste.');
const customer = (await post('/customers', partner('DESCONTO ' + tag))).id;
const product = (await post('/products', { code: 'DESC-' + tag, name: 'Camarão desconto ' + tag, suggestedPrice: '50', minimumStock: '0', active: true })).id;
const makeSale = extra => ({ partyId: customer, items: [{ productId: product, quantity: '10', unitPrice: '50' }], discountAmount: '50', paidAmount: '200', method: 'PIX', dueDate: day, ...extra });
await post('/purchases', { items: [{ productId: product, quantity: '100', unitPrice: '30' }], paidAmount: '0', payInFull: true, method: 'PIX', dueDate: day });
let discountedSale, discountedTitle;

await test('Desconto reduz receita e dívida e preserva o custo dos quilos', async () => {
  const before = await get(`/reports/result?from=${day}&to=${day}`);
  discountedSale = (await post('/sales', makeSale({}))).id;
  const sales = await collect('/sales?q=' + tag);
  const sale = sales.rows.find(s => s.id === discountedSale);
  assert.equal(Number(sale.gross_total), 500); assert.equal(Number(sale.discount_amount), 50); assert.equal(Number(sale.total), 450); assert.equal(Number(sale.cost_total), 300);
  const titles = await get(`/titles?customerId=${customer}`); discountedTitle = titles.items.find(t => t.sale_id === discountedSale);
  assert.equal(Number(discountedTitle.amount), 450); assert.equal(Number(discountedTitle.outstanding), 250);
  const after = await get(`/reports/result?from=${day}&to=${day}`);
  for (const [key, difference] of Object.entries({ gross_revenue: 50000, discounts: 5000, revenue: 45000, cost_of_goods: 30000, gross_profit: 15000 })) assert.equal(cents(after.metrics[key]) - cents(before.metrics[key]), BigInt(difference), key);
  const item = (await get(`/sales/${discountedSale}/items`))[0]; assert.equal(Number(item.total), 500);
});
await test('Quitação integral usa o total líquido exato', async () => {
  const sale = await post('/sales', makeSale({ items: [{ productId: product, quantity: '1', unitPrice: '100.01' }], discountAmount: '0.02', paidAmount: '0', payInFull: true }));
  const title = (await get(`/titles?customerId=${customer}`)).items.find(t => t.sale_id === sale.id);
  assert.equal(Number(title.amount), 99.99); assert.equal(Number(title.paid), 99.99); assert.equal(Number(title.outstanding), 0);
});
await test('Desconto integral movimenta estoque sem criar dívida de valor zero', async () => {
  const before = await get(`/titles?customerId=${customer}`), stock = await get('/products?q=DESC-' + tag);
  const sale = await post('/sales', makeSale({ items: [{ productId: product, quantity: '1', unitPrice: '50' }], discountAmount: '50', paidAmount: '0', payInFull: true }));
  const current = await get(`/titles?customerId=${customer}`); assert.equal(current.total, before.total);
  const row = (await collect('/sales?q=DESCONTO')).rows.find(s => s.id === sale.id); assert.equal(Number(row.total), 0);
  const after = await get('/products?q=DESC-' + tag); assert.equal(Number(stock.items[0].quantity) - Number(after.items[0].quantity), 1);
});
await test('Desconto inválido e pagamento acima do líquido não deixam efeito parcial', async () => {
  const before = await get('/sales?q=DESCONTO');
  await post('/sales', makeSale({ discountAmount: '-1' }), 400);
  await post('/sales', makeSale({ discountAmount: '500.01' }), 422);
  await post('/sales', makeSale({ discountAmount: '0.001' }), 400);
  await post('/sales', makeSale({ discountAmount: '50', paidAmount: '450.01' }), 422);
  await post('/purchases', makeSale({ partyId: null, discountAmount: '1', paidAmount: '0' }), 422);
  assert.equal((await get('/sales?q=DESCONTO')).total, before.total);
});
await test('Desconto participa da idempotência e saldo não depende da página', async () => {
  const key = randomUUID(), body = makeSale({ paidAmount: '0' });
  const first = await post('/sales', body, 200, key); assert.equal((await post('/sales', body, 200, key)).id, first.id);
  await post('/sales', makeSale({ paidAmount: '0', discountAmount: '49' }), 409, key);
  const a = await get(`/titles?customerId=${customer}&size=1`), b = await get(`/titles?customerId=${customer}&size=100`);
  assert.deepEqual(a.summary, b.summary); assert.ok(a.total > a.items.length);
});
await test('Paginação valida limites e páginas vazias', async () => {
  for (const query of ['page=0', 'page=-1', 'size=0', 'size=101', 'q=' + 'x'.repeat(201)]) await http('/api/v1/customers?' + query, { expected: 400 });
  const page = await get('/customers?page=99999&size=10'); assert.equal(page.items.length, 0); assert.equal(page.hasNext, false); assert.ok(page.total > 0);
});
await test('Busca considera telefone, documento e curingas literais', async () => {
  await post('/customers', { ...partner('Literal 50%_! ' + tag), phone: 'TEL-' + tag, document: 'DOC-' + tag });
  for (const q of ['50%_!', 'TEL-' + tag, 'DOC-' + tag]) assert.equal((await get('/customers?q=' + encodeURIComponent(q))).total, 1);
  assert.equal((await get('/customers?q=' + encodeURIComponent("' OR 1=1 --"))).total, 0);
});

console.log('Preparando registros fictícios além dos limites antigos…');
const customerNames = Array.from({ length: 205 }, (_, i) => `ZZ Paginação ${tag} ${String(i).padStart(3, '0')}`);
const customers = await batch(205, i => post('/customers', partner(customerNames[i])));
const supplierName = 'ZZ Fornecedor ' + tag;
const supplier = (await post('/suppliers', partner(supplierName))).id;
await batch(205, i => post('/products', { code: `PAG-${tag}-${i}`, name: `ZZ Produto ${tag} ${String(i).padStart(3, '0')}`, suggestedPrice: '50', minimumStock: '0', active: true }));
const stockName = 'ZZ Estoque ' + tag;
const stockProduct = (await post('/products', { code: 'LOTE-' + tag, name: stockName, suggestedPrice: '50', minimumStock: '0', active: true })).id;
await post('/purchases', { partyId: supplier, items: [{ productId: stockProduct, quantity: '1000', unitPrice: '10' }], paidAmount: '0', method: 'PIX', dueDate: day });
await batch(205, () => post('/purchases', { partyId: supplier, items: [{ productId: stockProduct, quantity: '0.01', unitPrice: '10' }], paidAmount: '0', method: 'PIX', dueDate: day }));
await batch(205, () => post('/sales', { partyId: customers[0].id, items: [{ productId: stockProduct, quantity: '0.01', unitPrice: '50' }], discountAmount: '0.01', paidAmount: '0', payInFull: true, method: 'PIX', dueDate: day }));
await batch(305, i => post('/expenses', { description: `PAG-Despesa ${tag} ${i}`, category: 'Teste', amount: '0.01', paidAmount: '0', method: 'PIX', dueDate: day }));

for (const [name, path, minimum] of [
  ['Clientes além de 200', '/customers?q=' + encodeURIComponent('ZZ Paginação ' + tag), 205],
  ['Produtos além de 200', '/products?q=' + encodeURIComponent('ZZ Produto ' + tag), 205],
  ['Compras além de 200', '/purchases?q=' + encodeURIComponent(supplierName), 206],
  ['Vendas além de 200', '/sales?q=' + encodeURIComponent(customerNames[0]), 205],
  ['Despesas além de 200', '/expenses?q=' + encodeURIComponent('PAG-Despesa ' + tag), 305],
  ['Pagamentos além de 200', '/settlements?q=' + encodeURIComponent(customerNames[0]), 205],
  ['Movimentos além de 300', '/stock/movements?productId=' + stockProduct, 411],
  ['Títulos além de 500', '/titles?nature=PAYABLE&q=' + tag, 511],
]) await test(name + ' são acessíveis sem duplicações entre páginas', async () => {
  const data = await collect(path); assert.equal(data.total, minimum);
});
await test('Títulos a receber e a pagar combinados ultrapassam 500 sem corte', async () => {
  const a = await collect('/titles?nature=RECEIVABLE&q=' + encodeURIComponent(customerNames[0]));
  const b = await collect('/titles?nature=PAYABLE&q=' + tag);
  assert.ok(a.total + b.total > 500);
  assert.equal(b.rows.reduce((sum, t) => sum + cents(t.outstanding), 0n), cents(b.summary.outstanding));
  assert.ok(Number((await get('/titles?nature=PAYABLE&size=1')).summary.outstanding) > 0);
});
await test('Resumo de estoque não é limitado à página e filtros são aplicados antes da contagem', async () => {
  const all = await get('/products?size=1'); assert.ok(all.total > 200); assert.ok(Number(all.summary.quantity) > 1000);
  const selected = await get('/products?q=' + encodeURIComponent(stockName)); assert.equal(selected.total, 1); assert.equal(Number(selected.items[0].quantity), 1000);
  const open = await collect('/titles?nature=RECEIVABLE&openOnly=true'); assert.ok(open.rows.every(t => Number(t.outstanding) > 0));
});
console.log(`\n${passed} verificações de desconto e paginação aprovadas. Todas as massas de dados são fictícias e ficam no banco de teste.`);
