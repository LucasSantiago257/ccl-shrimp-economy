import { createContext, useContext, useState } from 'react';
import { Empty, Field, Modal, MutationForm, Panel, Status, date, kg, money, text, useResource } from './ui';
import { Pager, RemoteSelect, SearchBox, usePagedResource } from './Pagination';
import type { Num } from './types';

export type CorrectionKind = 'SALE' | 'PURCHASE' | 'EXPENSE' | 'PAYMENT' | 'LOSS';
export type CorrectionTarget = { kind: CorrectionKind; id: number };
export const CorrectionContext = createContext<(target: CorrectionTarget) => void>(() => {});
const names: Record<CorrectionKind,string> = {
  SALE: 'Venda', PURCHASE: 'Compra', EXPENSE: 'Despesa', PAYMENT: 'Pagamento / recebimento', LOSS: 'Perda',
};
interface Correction {
  id: number; kind: CorrectionKind; source_id: number; reason: string;
  occurred_at: string; created_by: string; replacement_id?: number;
}
interface Preview {
  kind: CorrectionKind; sourceId: number;
  original: { amount?: Num; total?: Num; occurred_at: string; direction?: string };
  correction: Partial<Correction>;
  stock: { id: number; product_name: string; quantity_delta: Num; value_delta: Num }[];
  payments: { id: number; amount: Num }[];
  dependencies: { id: number; type: 'SALE' | 'PURCHASE' | 'LOSS'; source_id: number }[];
  allocations: { title_id: number; amount: Num }[];
}
export function CorrectionAction({ kind, id, cancelled = false }: CorrectionTarget & { cancelled?: boolean }) {
  const open = useContext(CorrectionContext);
  return <button className="text-button" onClick={() => open({kind,id})}>
    {cancelled ? 'Ver cancelamento' : 'Corrigir'}
  </button>;
}

function ReplacementForm({ correction, saved }: { correction: Partial<Correction>; saved: () => void }) {
  const [source,setSource] = useState('');
  return <MutationForm path={'/api/v1/corrections/'+correction.id+'/replacement'}
    build={() => ({sourceId:Number(source)})} done={saved} button="Vincular lançamento correto">
    <p>Cadastre o lançamento correto na tela de origem e depois selecione-o abaixo. O vínculo ficará registrado no histórico.</p>
    <RemoteSelect<{id:number;name:string;occurred_at:string}> path={'/api/v1/corrections/'+correction.id+'/candidates'}
      label="Lançamento substituto" value={source} onSelect={item => setSource(item ? String(item.id) : '')}
      optionLabel={item => '#'+item.id+' · '+date(item.occurred_at)} />
  </MutationForm>;
}

export function CorrectionModal({target,revision,close,saved}: {
  target: CorrectionTarget; revision: number; close: () => void; saved: () => void;
}) {
  const preview = useResource<Preview>('/api/v1/corrections/'+target.kind+'/'+target.id+'/preview',revision);
  const [confirmed,setConfirmed] = useState(false);
  const open = useContext(CorrectionContext);
  const data = preview.data;
  const cancelled = !!data?.correction.id;
  const blocked = !!data && (data.payments.length > 0 || data.dependencies.length > 0);
  return <Modal title={'Correção · '+names[target.kind]+' #'+target.id} close={close}>
    <Status loading={preview.loading} error={preview.error} />
    {data && <div>
      <p>Registro de {date(data.original.occurred_at)}{data.original.total != null ? ' · '+money(data.original.total) : data.original.amount != null ? ' · '+money(data.original.amount) : ''}</p>
      {cancelled ? <>
        <p className="alert info">Cancelado pela correção #{data.correction.id} em {date(data.correction.occurred_at!)} por {data.correction.created_by}.</p>
        <p><strong>Motivo</strong><br />{data.correction.reason}</p>
        {data.correction.replacement_id ? <p>Lançamento substituto #{data.correction.replacement_id}</p>
          : <ReplacementForm correction={data.correction} saved={saved} />}
      </> : <>
        <p className="alert info">O cancelamento será registrado no dia atual. Revise os efeitos abaixo antes de confirmar.</p>
        {data.stock.length > 0 && <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Ajuste no estoque</th><th>Ajuste no valor</th></tr></thead>
          <tbody>{data.stock.map(m => <tr key={m.id}><td>{m.product_name}</td><td>{kg(-Number(m.quantity_delta))}</td><td>{money(-Number(m.value_delta))}</td></tr>)}</tbody></table></div>}
        {target.kind === 'PAYMENT' && <>
          <p>O registro de {data.original.direction === 'IN' ? 'recebimento' : 'pagamento'} será estornado no caixa e os valores voltarão a ficar em aberto nas contas abaixo. Esta ação corrige o registro do sistema.</p>
          <ul>{data.allocations.map(a => <li key={a.title_id}>Conta #{a.title_id} · {money(a.amount)}</li>)}</ul>
        </>}
        {['SALE','PURCHASE','EXPENSE'].includes(target.kind) && <p>O valor deste documento será estornado no resultado ou nas compras. A cobrança vinculada será cancelada.</p>}
        {data.payments.length > 0 && <div className="alert info"><strong>Cancele primeiro os pagamentos vinculados</strong>
          <ul>{data.payments.map(p => <li key={p.id}>#{p.id} · {money(p.amount)} <button className="text-button" onClick={() => open({kind:'PAYMENT',id:p.id})}>Conferir pagamento</button></li>)}</ul>
          Confira todas as contas abrangidas por cada pagamento.
        </div>}
        {data.dependencies.length > 0 && <div className="alert info"><strong>Há movimentos posteriores para os produtos deste registro.</strong>
          <p>Confira e corrija os registros dependentes começando pelo mais recente, para preservar o custo médio.</p>
          <ul>{data.dependencies.map(d => <li key={d.id}>{names[d.type]} #{d.source_id} · Movimento #{d.id} <button className="text-button" onClick={() => open({kind:d.type,id:d.source_id})}>Conferir registro</button></li>)}</ul>
        </div>}
        <MutationForm path={'/api/v1/corrections/'+target.kind+'/'+target.id} button="Confirmar cancelamento"
          valid={confirmed && !blocked} build={d => ({reason:text(d,'reason')})} done={saved}>
          <Field label="Motivo da correção"><textarea name="reason" required minLength={5} maxLength={500} rows={3} /></Field>
          <label className="checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            Conferi os efeitos e confirmo o cancelamento deste registro incorreto.</label>
        </MutationForm>
      </>}
    </div>}
  </Modal>;
}

export function CorrectionsPage({revision}: {revision:number}) {
  const records = usePagedResource<Correction>('/api/v1/corrections',revision);
  const [kind,setKind] = useState<CorrectionKind>('SALE');
  const [source,setSource] = useState('');
  const open = useContext(CorrectionContext);
  return <>
    <p className="alert info">Use esta tela para corrigir erros de registro. O ajuste aparece na data atual, com motivo e responsável. Depois, cadastre o lançamento correto e vincule-o ao cancelamento.</p>
    <form className="toolbar" onSubmit={e => {e.preventDefault();open({kind,id:Number(source)});}}>
      <Field label="Tipo de lançamento"><select value={kind} onChange={e => setKind(e.target.value as CorrectionKind)}>
        {Object.entries(names).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
      </select></Field>
      <Field label="Número do lançamento"><input type="number" required min="1" step="1" value={source} onChange={e => setSource(e.target.value)} /></Field>
      <button className="button secondary">Conferir correção</button>
    </form>
    <Panel title="Histórico de correções" hint="Cancelamentos e lançamentos substitutos" action={<SearchBox label="Buscar correções" value={records.query} change={records.setQuery} />}>
      <Status loading={records.loading} error={records.error} />
      {!records.loading && !records.items.length ? <Empty text="Nenhuma correção registrada." /> :
        <div className="table-wrap"><table><thead><tr><th>Correção</th><th>Origem</th><th>Motivo</th><th>Substituto</th><th /></tr></thead>
          <tbody>{records.items.map(c => <tr key={c.id}><td>#{c.id}<small>{date(c.occurred_at)} · {c.created_by}</small></td>
            <td>{names[c.kind]} #{c.source_id}</td><td>{c.reason}</td><td>{c.replacement_id ? '#'+c.replacement_id : 'A vincular'}</td>
            <td><CorrectionAction kind={c.kind} id={c.source_id} cancelled /></td></tr>)}</tbody></table></div>}
      <Pager label="Correções" data={records.data} loading={records.loading} changePage={records.setPage} changeSize={records.setSize} />
    </Panel>
  </>;
}

