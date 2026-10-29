import { useState } from 'react';
import type { Closure, ClosingDetail, SnapshotRecord } from './types';
import { Empty, Field, Modal, MutationForm, Panel, Status, date, kg, money, text, today, useResource } from './ui';

const timestamp = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value.endsWith('Z') ? value : value + 'Z'));

export function ClosingsPanel({ from, to, revision, saved }: { from: string; to: string; revision: number; saved: () => void }) {
  const list = useResource<Closure[]>('/api/v1/closings', revision);
  const [closing, setClosing] = useState<{ from: string; to: string } | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const open = (start: string, end: string) => { setConfirmed(false); setClosing({ from: start, to: end }); };
  const closedToday = (list.data || []).some(c => c.date_from <= today() && c.date_to >= today());
  return <><Panel title="Fechamentos preservados" hint="Snapshots permanentes com totais, registros, responsável e verificação de integridade." action={<div className="closing-actions"><button className="button secondary small" disabled={from > to || to > today()} onClick={() => open(from, to)}>Fechar intervalo selecionado</button><button className="button primary small" disabled={closedToday || list.loading || !!list.error} onClick={() => open(today(), today())}>{closedToday ? 'Hoje já está fechado' : 'Fechar dia de hoje'}</button></div>}>
    <Status loading={list.loading} error={list.error} />
    {!list.loading && !list.data?.length ? <Empty text="Nenhum período fechado ainda." /> : !!list.data?.length && <div className="table-wrap"><table><thead><tr><th>Período</th><th>Fechado em</th><th>Responsável</th><th>Snapshot</th></tr></thead><tbody>{list.data.map(c => <tr key={c.id}><td><strong>{date(c.date_from)} a {date(c.date_to)}</strong><small>Fechamento #{c.id}</small></td><td>{timestamp(c.closed_at)}</td><td>{c.closed_by}</td><td><button className="text-button" onClick={() => setView(c.id)}>Ver snapshot</button><a className="text-button" href={`/api/v1/closings/${c.id}/snapshot`}>Baixar JSON</a></td></tr>)}</tbody></table></div>}
  </Panel>
  {closing && <Modal title="Confirmar fechamento do período" close={() => setClosing(null)}><MutationForm path="/api/v1/closings" button="Fechar e preservar snapshot" valid={confirmed} done={() => { setClosing(null); saved(); }} build={d => ({ ...closing, note: text(d, 'note') })}><div className="payment-summary"><span>Período que será fechado</span><strong>{date(closing.from)} a {date(closing.to)}</strong><small>America/Bahia · todos os lançamentos da empresa</small></div><p className="alert info">O fechamento é definitivo. Compras, vendas, recebimentos, pagamentos, despesas e perdas serão bloqueados nas datas fechadas, inclusive por outros acessos. O próximo dia aberto permite novos lançamentos normalmente.</p><Field label="Observação do fechamento (opcional)"><textarea name="note" maxLength={500} rows={3} /></Field><label className="checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required />Conferi os registros e entendo que não poderei reabrir ou alterar este fechamento.</label></MutationForm></Modal>}
  {view !== null && <Modal title={`Snapshot do fechamento #${view}`} close={() => setView(null)}><SnapshotView id={view} /></Modal>}</>;
}

const columns: Record<string, string> = { id: 'ID', customer_name: 'Cliente', supplier_name: 'Fornecedor', party_name: 'Pessoa / origem', product_name: 'Produto', total: 'Total', cost_total: 'Custo aplicado', quantity: 'Quantidade', unit_price: 'Preço / kg', occurred_at: 'Data do registro', sale_id: 'Venda', purchase_id: 'Compra', amount: 'Valor', paid: 'Baixado até o fim', outstanding: 'Em aberto no fim', direction: 'Movimento', method: 'Forma', title_id: 'Conta', settlement_id: 'Pagamento', category: 'Categoria', description: 'Descrição', type: 'Tipo', quantity_delta: 'Variação kg', value_delta: 'Variação de custo', reason: 'Motivo', nature: 'Natureza', due_date: 'Vencimento' };
const sections: [string, string, string[]][] = [
  ['sales', 'Vendas', ['id', 'customer_name', 'total', 'cost_total', 'occurred_at']],
  ['sale_items', 'Itens das vendas', ['sale_id', 'product_name', 'quantity', 'unit_price', 'total', 'cost_total']],
  ['purchases', 'Compras', ['id', 'supplier_name', 'total', 'occurred_at']],
  ['purchase_items', 'Itens das compras', ['purchase_id', 'product_name', 'quantity', 'unit_price', 'total']],
  ['expenses', 'Despesas', ['id', 'description', 'category', 'total', 'occurred_at']],
  ['settlements', 'Recebimentos e pagamentos', ['id', 'direction', 'method', 'amount', 'occurred_at']],
  ['settlement_allocations', 'Vínculos dos pagamentos', ['settlement_id', 'title_id', 'amount']],
  ['stock_movements', 'Movimentos do estoque', ['id', 'product_name', 'type', 'quantity_delta', 'value_delta', 'reason', 'occurred_at']],
  ['titles', 'Posição das contas na data final', ['id', 'party_name', 'nature', 'amount', 'paid', 'outstanding', 'due_date']],
];
const metricNames: Record<string, string> = { revenue: 'Vendas', cost_of_goods: 'Custo das mercadorias vendidas', gross_profit: 'Lucro bruto', operating_result: 'Resultado gerencial', purchases: 'Compras', expenses: 'Despesas', losses: 'Custo das perdas', received: 'Recebimentos', paid: 'Pagamentos', cash_flow: 'Movimento líquido de caixa', opening_cash: 'Saldo anterior dos lançamentos', closing_cash: 'Saldo final dos lançamentos', receivables: 'Vendas a receber', payables: 'Total a pagar', purchase_payables: 'Compras a pagar', purchased_kg: 'Kg comprados', sold_kg: 'Kg vendidos', lost_kg: 'Kg perdidos' };
function cell(row: SnapshotRecord, key: string) {
  const value = row[key]; if (value == null) return '—';
  if (key === 'occurred_at') return timestamp(String(value));
  if (key === 'due_date') return date(String(value));
  if (key === 'quantity' || key === 'quantity_delta') return kg(value);
  if (['total', 'cost_total', 'unit_price', 'value_delta', 'amount', 'paid', 'outstanding'].includes(key)) return money(value);
  const names: Record<string, string> = { RECEIVABLE: 'A receber', PAYABLE: 'A pagar', IN: 'Recebimento', OUT: 'Pagamento', CASH: 'Dinheiro', PIX: 'Pix', CARD: 'Cartão', TRANSFER: 'Transferência', SALE: 'Venda', PURCHASE: 'Compra', LOSS: 'Perda' };
  return names[String(value)] || String(value);
}
function SnapshotView({ id }: { id: number }) {
  const result = useResource<ClosingDetail>(`/api/v1/closings/${id}`, 0);
  if (!result.data) return <Status loading={result.loading} error={result.error} />;
  const { metadata: c, snapshot } = result.data;
  return <div className="snapshot-content"><div className="snapshot-metadata"><span className="badge green">Snapshot preservado · integridade conferida</span><h3>{date(c.date_from)} a {date(c.date_to)}</h3><p>Fechado em {timestamp(c.closed_at)} por <strong>{c.closed_by}</strong> · {c.timezone}</p>{c.note && <p>{c.note}</p>}<label>SHA-256<code>{c.snapshot_sha256}</code></label><a className="button secondary" href={`/api/v1/closings/${id}/snapshot`}>Baixar snapshot completo em JSON</a><p className="subtle">Os dados abaixo foram salvos no fechamento e não são recalculados a partir dos cadastros atuais.</p></div>
    <h3 className="section-title">Totais preservados</h3><div className="table-wrap"><table className="report-table"><thead><tr><th>Indicador</th><th>Valor</th></tr></thead><tbody>{Object.entries(metricNames).map(([key, label]) => <tr key={key}><td>{label}</td><td>{key.endsWith('_kg') ? kg(snapshot.report.metrics[key]) : money(snapshot.report.metrics[key])}</td></tr>)}</tbody></table></div>
    <h3 className="section-title">Estoque preservado</h3><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor de custo</th></tr></thead><tbody>{snapshot.report.stock.map(p => <tr key={p.id}><td>{p.name}</td><td>{kg(p.quantity)}</td><td>{money(p.stock_value)}</td></tr>)}</tbody></table></div>
    <div className="snapshot-sections">{sections.map(([key, title, fields]) => { const rows = snapshot.records[key] || []; return <details key={key}><summary>{title}<span>{rows.length} registros</span></summary>{rows.length ? <div className="table-wrap"><table><thead><tr>{fields.map(f => <th key={f}>{columns[f]}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{fields.map(f => <td key={f}>{cell(row, f)}</td>)}</tr>)}</tbody></table></div> : <p className="subtle">Nenhum registro neste período.</p>}</details>; })}</div>
  </div>;
}
