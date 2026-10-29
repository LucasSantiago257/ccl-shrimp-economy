import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:18080'; // Somente o ambiente de teste.
const content = await readFile(new URL('../.env', import.meta.url), 'utf8');
const env = Object.fromEntries(content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const cookies = new Map(); let passed = 0;
async function http(path, { method = 'GET', body, key, expected = [200], form = false, raw = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') { const csrf = await http('/api/auth/csrf'); headers[csrf.header] = csrf.token; }
  headers.Cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
  if (body !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : form ? new URLSearchParams(body) : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(30000) });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
  const text = await response.text(); let data; try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  assert.ok(expected.includes(response.status), `${method} ${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return raw ? { text, status: response.status, headers: response.headers, data } : data;
}
const get = path => http('/api/v1' + path);
const post = (path, body, expected = [200], key = randomUUID(), raw = false) => http('/api/v1' + path, { method: 'POST', body, expected, key, raw });
async function test(name, run) { await run(); passed++; console.log(`OK fechamento ${passed} — ${name}`); }
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = days => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const tag = randomUUID().slice(0, 8);
await http('/api/login', { method: 'POST', body: { username: env.APP_ADMIN_USERNAME, password: env.APP_ADMIN_PASSWORD }, form: true, expected: [204] });
let product, customer, anonymousPurchase, anonymousTitle, captured, closureId, rawSnapshot;
const closingKey = randomUUID(), closingBody = { from: day, to: day, note: 'Fechamento de teste com snapshot' };

await test('Compra sem fornecedor cria estoque e dívida identificada pela compra', async () => {
  const before = await get(`/reports/result?from=${day}&to=${day}`);
  customer = (await get('/customers'))[0];
  product = (await post('/products', { code: 'CLOSE-' + tag, name: 'Camarão fechamento ' + tag, suggestedPrice: '50', minimumStock: '0', active: true })).id;
  anonymousPurchase = (await post('/purchases', { items: [{ productId: product, quantity: '2', unitPrice: '30' }], paidAmount: '10', method: 'PIX', dueDate: day })).id;
  const purchase = (await get('/purchases')).find(p => p.id === anonymousPurchase);
  assert.equal(purchase.supplier_id, null); assert.equal(purchase.party_name, 'Fornecedor não informado');
  anonymousTitle = (await get('/titles?nature=PAYABLE&openOnly=true&purchasesOnly=true')).find(t => t.purchase_id === anonymousPurchase);
  assert.equal(Number(anonymousTitle.outstanding), 50); assert.match(anonymousTitle.party_name, new RegExp('Compra #' + anonymousPurchase));
  const after = await get(`/reports/result?from=${day}&to=${day}`);
  assert.equal(Math.round(Number(after.metrics.purchase_payables) * 100) - Math.round(Number(before.metrics.purchase_payables) * 100), 5000);
});
await test('Despesa pendente não aumenta o indicador de compras a pagar', async () => {
  const before = await get(`/reports/result?from=${day}&to=${day}`);
  await post('/expenses', { description: 'Despesa pendente de teste', category: 'Teste', amount: '19', paidAmount: '0', method: 'PIX', dueDate: day });
  const after = await get(`/reports/result?from=${day}&to=${day}`);
  assert.equal(Number(after.metrics.purchase_payables), Number(before.metrics.purchase_payables));
  assert.equal(Math.round(Number(after.metrics.payables) * 100) - Math.round(Number(before.metrics.payables) * 100), 1900);
});
await test('Compra com fornecedor explicitamente nulo também pode ser quitada', async () => {
  const result = await post('/purchases', { partyId: null, items: [{ productId: product, quantity: '1', unitPrice: '30' }], paidAmount: '0', payInFull: true, method: 'PIX', dueDate: day });
  const title = (await get('/titles?nature=PAYABLE')).find(t => t.purchase_id === result.id);
  assert.equal(Number(title.outstanding), 0);
});
await test('Venda continua exigindo cliente', async () => {
  await post('/sales', { partyId: null, items: [{ productId: product, quantity: '1', unitPrice: '50' }], paidAmount: '0', method: 'PIX', dueDate: day }, [422]);
});
await test('Fechar data futura ou intervalo invertido é rejeitado', async () => {
  await post('/closings', { from: shift(1), to: shift(1), note: '' }, [422]);
  await post('/closings', { from: day, to: shift(-1), note: '' }, [422]);
});
await test('Período anterior fechado não impede lançamentos no dia seguinte', async () => {
  await post('/closings', { from: shift(-1), to: shift(-1), note: 'Dia anterior' });
  assert.equal((await get('/closings/status')).closed, false);
  await post('/expenses', { description: 'Dia atual continua aberto', category: 'Teste', amount: '0.01', paidAmount: '0', method: 'PIX', dueDate: day });
});
await test('Intervalos sobrepostos não podem ser fechados novamente', async () => {
  await post('/closings', { from: shift(-1), to: day, note: '' }, [409]);
  assert.equal((await get('/closings/status')).closed, false);
});
await test('Corrida entre lançamento e fechamento preserva uma fronteira atômica', async () => {
  const [closing, expense] = await Promise.all([
    post('/closings', closingBody, [200], closingKey),
    post('/expenses', { description: 'Despesa concorrente ' + tag, category: 'Teste', amount: '17', paidAmount: '0', method: 'PIX', dueDate: day }, [200, 409], randomUUID(), true),
  ]);
  closureId = closing.id; captured = await get('/closings/' + closureId);
  const matching = captured.snapshot.records.expenses.filter(e => e.description === 'Despesa concorrente ' + tag);
  assert.equal(matching.length, expense.status === 200 ? 1 : 0);
  assert.equal((await get('/closings/status')).closed, true);
  const live = await get(`/reports/result?from=${day}&to=${day}`);
  assert.deepEqual(captured.snapshot.report.metrics, live.metrics);
});
await test('Snapshot contém metadados, itens e posições financeiras preservadas', async () => {
  assert.equal(captured.metadata.closed_by, env.APP_ADMIN_USERNAME);
  assert.equal(captured.metadata.date_from, day); assert.equal(captured.metadata.date_to, day);
  assert.equal(captured.snapshot.schemaVersion, 1);
  for (const key of ['sales', 'sale_items', 'purchases', 'purchase_items', 'expenses', 'stock_movements', 'settlements', 'settlement_allocations', 'titles', 'products']) assert.ok(Array.isArray(captured.snapshot.records[key]), key);
  assert.ok(captured.snapshot.records.purchases.some(p => p.id === anonymousPurchase && p.supplier_id === null));
});
await test('Arquivo JSON baixado corresponde exatamente ao SHA-256 preservado', async () => {
  const download = await http(`/api/v1/closings/${closureId}/snapshot`, { raw: true }); rawSnapshot = download.text;
  assert.equal(createHash('sha256').update(rawSnapshot).digest('hex'), captured.metadata.snapshot_sha256);
  assert.match(download.headers.get('content-disposition'), /attachment/);
});
await test('Mesmo fechamento é idempotente e duplicidade com nova chave é rejeitada', async () => {
  assert.equal((await post('/closings', closingBody, [200], closingKey)).id, closureId);
  await post('/closings', closingBody, [409]);
});
await test('Todos os lançamentos ficam bloqueados, inclusive por requisição direta', async () => {
  const trade = { partyId: customer.id, items: [{ productId: product, quantity: '0.1', unitPrice: '50' }], paidAmount: '0', method: 'PIX', dueDate: day };
  await post('/sales', trade, [409]);
  await post('/purchases', { ...trade, partyId: null }, [409]);
  await post('/expenses', { description: 'Bloqueada', category: 'Teste', amount: '1', paidAmount: '0', method: 'PIX', dueDate: day }, [409]);
  await post('/settlements', { method: 'PIX', allocations: [{ titleId: anonymousTitle.id, amount: '1' }] }, [409]);
  await post('/stock/losses', { productId: product, quantity: '0.1', reason: 'Bloqueada' }, [409]);
  assert.deepEqual((await get('/closings/' + closureId)).snapshot, captured.snapshot);
});
await test('Mudanças nos cadastros não alteram nomes ou bytes do snapshot', async () => {
  await http('/api/v1/customers/' + customer.id, { method: 'PUT', body: { name: customer.name + ' alterado', phone: customer.phone, document: customer.document, notes: customer.notes, active: true } });
  await http('/api/v1/products/' + product, { method: 'PUT', body: { code: 'CLOSE-' + tag, name: 'Produto renomeado após fechamento', suggestedPrice: '90', minimumStock: '0', active: true } });
  const download = await http(`/api/v1/closings/${closureId}/snapshot`, { raw: true });
  assert.equal(download.text, rawSnapshot); assert.deepEqual((await get('/closings/' + closureId)).snapshot, captured.snapshot);
});
console.log(`\n${passed} verificações de fechamento, fornecedor opcional e pendências aprovadas. Dia fechado apenas no ambiente de teste.`);
