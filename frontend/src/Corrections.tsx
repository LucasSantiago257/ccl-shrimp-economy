import { createContext, useState } from 'react';
import { Empty, Field, Modal, MutationForm, Panel, Status, date, kg, money, useResource } from './ui';
import { Pager, SearchBox, usePagedResource } from './Pagination';
import type { Num } from './types';
import type { ReplacementRequest } from './postingFlow';
import './corrections.css';

export type CorrectionKind = 'SALE' | 'PURCHASE' | 'EXPENSE' | 'PAYMENT' | 'LOSS';
export type CorrectionTarget = { kind: CorrectionKind; id: number };
export const CorrectionContext = createContext<(target: CorrectionTarget) => void>(() => {});
const names: Record<CorrectionKind,string> = {
  SALE:'Venda', PURCHASE:'Compra', EXPENSE:'Despesa', PAYMENT:'Registro financeiro', LOSS:'Perda',
};
interface Correction {
  id:number; kind:CorrectionKind; source_id:number; reason:string;
  occurred_at:string; created_by:string; replacement_id?:number;
}
interface Preview {
  original:{ amount?:Num; remaining_amount?:Num; total?:Num; occurred_at:string; direction?:string; description?:string; party_name?:string };
  correction:Partial<Correction>;
  stock:{ id:number; product_name:string; quantity_delta:Num }[];
  payments:{ id:number; amount:Num; direction:string }[];
  dependencies:{ id:number; type:'SALE'|'PURCHASE'|'LOSS'; source_id:number }[];
  allocations:{ title_id:number; amount:Num; sale_id?:number; purchase_id?:number; expense_id?:number }[];
}
const targetKey=(target:CorrectionTarget)=>target.kind+':'+target.id;
const targetLabel=(target:CorrectionTarget)=>names[target.kind]+' #'+target.id;

export function CorrectionAction({kind,id,cancelled=false}:CorrectionTarget & {cancelled?:boolean}) {
  return <CorrectionContext.Consumer>{open=>
    <button className="text-button" onClick={()=>open({kind,id})}>{cancelled?'Ver cancelamento':'Cancelar'}</button>
  }</CorrectionContext.Consumer>;
}

function Effects({data,target}: {data:Preview;target:CorrectionTarget}) {
  const refund=data.payments.reduce((sum,p)=>sum+Number(p.amount),0);
  const outstanding=Number(data.original.total||0)-refund;
  return <div className="cancel-effects">
    {data.stock.map(item=><p key={item.id}><strong>{item.product_name}</strong><br/>
      {Number(item.quantity_delta)<0?'Voltam '+kg(-Number(item.quantity_delta))+' ao estoque.':'Saem '+kg(item.quantity_delta)+' do estoque.'}</p>)}
    {target.kind==='PAYMENT' ? <>
      <p>O saldo de <strong>{money(data.original.remaining_amount ?? data.original.amount)}</strong> deste {data.original.direction==='IN'?'recebimento':'pagamento'} será estornado.</p>
      <p>Os valores abaixo voltarão a ficar em aberto.</p>
      <ul>{data.allocations.map(a=><li key={a.title_id}>{a.sale_id?'Venda #'+a.sale_id:a.purchase_id?'Compra #'+a.purchase_id:a.expense_id?'Despesa #'+a.expense_id:'Conta #'+a.title_id} · {money(a.amount)}</li>)}</ul>
    </> : ['SALE','PURCHASE','EXPENSE'].includes(target.kind) && <>
      {refund>0 && <p className="alert info"><strong>Estorno automático de {money(refund)}</strong><br/>
        O valor já {target.kind==='SALE'?'recebido':'pago'} será estornado junto com o cancelamento.</p>}
      {outstanding>0 && <p>O saldo {target.kind==='SALE'?'a receber':'a pagar'} de <strong>{money(outstanding)}</strong> será cancelado.</p>}
    </>}
    <p className="subtle">O ajuste será registrado hoje. Fechamentos anteriores continuam preservados.</p>
  </div>;
}

function CancellationStep({target,parent,revision,reason,setReason,back,resolve,close,saved,recreate}:{
  target:CorrectionTarget; parent?:CorrectionTarget; revision:number; reason:string; setReason:(reason:string)=>void;
  back:()=>void; resolve:(target:CorrectionTarget)=>void; close:()=>void; saved:()=>void; recreate:(request:ReplacementRequest)=>void;
}) {
  const preview=useResource<Preview>('/api/v1/corrections/'+target.kind+'/'+target.id+'/preview',revision);
  const data=preview.data;
  if(!data) return <Status loading={preview.loading} error={preview.error}/>;
  const movement=[...data.dependencies].sort((a,b)=>b.id-a.id)[0];
  const cancelled=!!data.correction.id;
  const subject=target.kind==='PAYMENT'?(data.original.direction==='IN'?'Recebimento':'Pagamento'):names[target.kind];
  const title=subject+' #'+target.id;
  return <div className="cancel-flow">
    {parent && <div className="cancel-parent"><span>Etapa necessária para cancelar {targetLabel(parent)}</span>
      <button className="text-button" onClick={back}>Voltar</button></div>}
    <div className="cancel-summary"><strong>{data.original.party_name || data.original.description || title}</strong>
      <span>{date(data.original.occurred_at)}{data.original.total!=null?' · '+money(data.original.total):data.original.amount!=null?' · '+money(data.original.amount):''}</span></div>
    <Status loading={preview.loading} error={preview.error}/>
    {cancelled ? <>
      <div className="cancel-success"><strong>Cancelamento concluído</strong><p>{title}</p>
        <p>{data.correction.reason}</p><small>{date(data.correction.occurred_at!)} · {data.correction.created_by}</small></div>
      {parent ? <button className="button primary" onClick={back}>Continuar cancelamento de {targetLabel(parent)}</button>
        : <>
          {data.correction.replacement_id ? <p>Registro correto já vinculado · #{data.correction.replacement_id}</p>
            : <p>Você pode concluir aqui. Se precisar lançar os dados corretos, o botão abaixo abre o formulário e o vínculo será feito ao salvar.</p>}
          <div className="cancel-actions"><button className="button secondary" onClick={close}>Concluir</button>
            {!data.correction.replacement_id && <button className="button primary" onClick={()=>recreate({correctionId:data.correction.id!,kind:target.kind,sourceId:target.id})}>Registrar dados corretos</button>}
          </div>
        </>}
    </> : movement ? <div className="cancel-pending">
      <h3>Precisamos resolver uma etapa antes</h3>
      <>
        <p>O estoque deste registro foi utilizado ou movimentado depois.</p>
        <p>Confira primeiro {names[movement.type].toLowerCase()} #{movement.source_id}, o registro mais recente. O sistema trará você de volta ao terminar.</p>
        <button className="button primary" onClick={()=>resolve({kind:movement.type,id:movement.source_id})}>Conferir {names[movement.type].toLowerCase()} mais recente</button>
      </>
      <p className="subtle">Cada etapa exige sua confirmação. O registro atual ainda está ativo.</p>
    </div> : <>
        <h3>Confira o cancelamento e o estorno</h3><Effects data={data} target={target}/>
        <MutationForm path={'/api/v1/corrections/'+target.kind+'/'+target.id} button="Confirmar cancelamento"
          build={()=>({reason})} done={saved} valid={!preview.loading && reason.trim().length>=5}
          footerHint="O cancelamento ficará registrado no histórico." pendingLabel="Cancelando…">
          <Field label="Por que deseja cancelar?"><textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex.: valor digitado errado ou registro duplicado"/></Field>
        </MutationForm>
    </>}
  </div>;
}

export function CorrectionModal({target,revision,close,saved,recreate}:{
  target:CorrectionTarget;revision:number;close:()=>void;saved:()=>void;recreate:(request:ReplacementRequest)=>void;
}) {
  const [stack,setStack]=useState<CorrectionTarget[]>([target]);
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const current=stack[stack.length-1];
  return <Modal title={'Cancelamento · '+targetLabel(current)} close={close}>
    <CancellationStep key={targetKey(current)} target={current} parent={stack[stack.length-2]} revision={revision}
      reason={reasons[targetKey(current)]||''} setReason={reason=>setReasons(previous=>({...previous,[targetKey(current)]:reason}))}
      back={()=>setStack(previous=>previous.slice(0,-1))} resolve={next=>setStack(previous=>[...previous,next])}
      close={close} saved={saved} recreate={recreate}/>
  </Modal>;
}

export function CorrectionsPage({revision,navigate}:{revision:number;navigate:(page:string)=>void}) {
  const records=usePagedResource<Correction>('/api/v1/corrections',revision);
  const destinations=[['sales','Vendas'],['purchases','Compras'],['expenses','Despesas'],['finance','Financeiro'],['stock','Estoque']];
  return <>
    <div className="cancel-entry"><h2>Comece pelo registro que deseja cancelar</h2>
      <p>Abra a tela de origem, localize o registro e clique em <strong>Cancelar</strong>. O sistema mostrará os efeitos e conduzirá as etapas.</p>
      <div className="cancel-actions">{destinations.map(([page,label])=><button className="button secondary small" key={page} onClick={()=>navigate(page)}>Ir para {label.toLowerCase()}</button>)}</div>
    </div>
    <Panel title="Histórico de cancelamentos" hint="Confira os cancelamentos e continue o registro dos dados corretos quando necessário."
      action={<SearchBox label="Buscar correções" value={records.query} change={records.setQuery}/>}>
      <Status loading={records.loading} error={records.error}/>
      {!records.loading&&!records.items.length ? <Empty text="Nenhum cancelamento registrado."/> :
        <div className="table-wrap"><table><thead><tr><th>Registro cancelado</th><th>Quando e por quem</th><th>Motivo</th><th>Situação</th><th/></tr></thead>
          <tbody>{records.items.map(c=><tr key={c.id}><td>{names[c.kind]} #{c.source_id}</td><td>{date(c.occurred_at)}<small>{c.created_by}</small></td>
            <td>{c.reason}</td><td>{c.replacement_id?'Novo registro #'+c.replacement_id:'Cancelado'}</td>
            <td><CorrectionAction kind={c.kind} id={c.source_id} cancelled/></td></tr>)}</tbody></table></div>}
      <Pager label="Correções" data={records.data} loading={records.loading} changePage={records.setPage} changeSize={records.setSize}/>
    </Panel>
  </>;
}

