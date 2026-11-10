import {QuantityFields} from './BoxQuantity';
import {quantityKg} from './boxes';
import type {QuantityDraft} from './boxes';
import {useContext,useRef,useState} from 'react';
import * as api from './api';
import {RemoteSelect} from './Pagination';
import type {Partner,Product,Num} from './types';
import {ClosedDayContext,Field,Icon,Modal,MutationForm,Panel,Status,date,kg,money,today,useResource} from './ui';

type StockDraft=QuantityDraft & {key:string;productId:string;name:string;quantity:string;unitCost:string};
type DebtDraft={key:string;kind:string;partyId:string;partyName:string;description:string;amount:string;dueDate:string};
type Position={configured:boolean;dismissed:boolean;hasPostings:boolean;dayClosed:boolean;canUndo:boolean;date:string;
 opening:{id:number;cash_amount:Num;note:string;occurred_at:string;created_by:string};
 stock:{id:number;product_name:string;quantity:Num;unit_cost:Num;total_cost:Num}[];
 debts:{id:number;nature:string;opening_description:string;amount:Num;due_date:string}[]};
const stockRow=():StockDraft=>({key:crypto.randomUUID(),productId:'',name:'',quantity:'',unit:'KG',boxWeight:'15',unitCost:''});
const debtRow=():DebtDraft=>({key:crypto.randomUUID(),kind:'RECEIVABLE',partyId:'',partyName:'',description:'',amount:'',dueDate:today()});

export function OpeningPage({revision,saved,navigate,onSkip}:{revision:number;saved:()=>void;navigate:(page:string)=>void;onSkip:()=>void}) {
 const resource=useResource<Position>('/api/v1/opening-balances',revision);
 const closed=useContext(ClosedDayContext);
 const [cash,setCash]=useState('0'),[note,setNote]=useState('');
 const [stock,setStock]=useState<StockDraft[]>([]),[debts,setDebts]=useState<DebtDraft[]>([]);
 const [review,setReview]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[undo,setUndo]=useState(false);
 const key=useRef(crypto.randomUUID());
 const position=resource.data;
 async function skip(){
  if(busy)return;setBusy(true);setError('');
  try{await api.mutate('/api/v1/opening-balances/preference',{dismissed:true},crypto.randomUUID(),'PUT');onSkip();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function changeStock(id:string,patch:Partial<StockDraft>){setStock(rows=>rows.map(r=>r.key===id?{...r,...patch}:r));}
 function changeDebt(id:string,patch:Partial<DebtDraft>){setDebts(rows=>rows.map(r=>r.key===id?{...r,...patch}:r));}
 const stockValue=stock.reduce((sum,s)=>sum+Number(quantityKg(s))*Number(s.unitCost),0);
 const receivables=debts.filter(d=>d.kind==='RECEIVABLE').reduce((s,d)=>s+Number(d.amount),0);
 const payables=debts.filter(d=>d.kind!=='RECEIVABLE').reduce((s,d)=>s+Number(d.amount),0);
 async function confirm(){
  if(busy||!confirmed)return;setBusy(true);setError('');
  try{await api.mutate('/api/v1/opening-balances',{cashAmount:cash,note,confirmed:true,
   stock:stock.map(s=>({productId:Number(s.productId),quantity:quantityKg(s),unitCost:s.unitCost})),
   debts:debts.map(d=>({nature:d.kind==='RECEIVABLE'?'RECEIVABLE':'PAYABLE',partyId:d.partyId?Number(d.partyId):null,description:d.description,amount:d.amount,dueDate:d.dueDate,purchaseRelated:d.kind==='PURCHASE_PAYABLE'}))},key.current);
   saved();setReview(false);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <><Status loading={resource.loading} error={resource.error}/>{position && <>
 {position.configured ? <>
  <Panel title="Saldo inicial configurado" hint={'Registrado em '+date(position.opening.occurred_at)+' por '+position.opening.created_by}>
   <div className="opening-info"><p>Estes são os valores informados na implantação. Os saldos atuais e os pagamentos posteriores estão no Estoque e no Financeiro.</p>
   <p><strong>Dinheiro em caixa e bancos: {money(position.opening.cash_amount)}</strong></p>{position.opening.note&&<p>{position.opening.note}</p>}
   {position.canUndo&&!closed?<button className="button secondary" onClick={()=>setUndo(true)}>Corrigir saldo inicial</button>:<p className="subtle">A implantação fica preservada após o primeiro lançamento ou o fechamento do dia.</p>}</div>
  </Panel>
  <Panel title="Estoque trazido das planilhas"><StockTable rows={position.stock}/></Panel>
  <Panel title="Contas antigas informadas"><DebtTable rows={position.debts.map(d=>({key:String(d.id),kind:d.nature==='RECEIVABLE'?'A receber':'A pagar',description:d.opening_description,amount:d.amount,dueDate:d.due_date}))}/></Panel>
 </> : position.hasPostings ? <Panel title="O sistema já possui lançamentos"><div className="opening-info"><p>O saldo inicial deve ser configurado antes da primeira compra, venda, despesa, perda ou pagamento. Isso evita somar novamente valores já registrados.</p><p>Os dados existentes estão preservados. Consulte o Financeiro e o Estoque para conferir sua posição.</p></div></Panel>
 : position.dayClosed||closed ? <p className="alert info">O dia está fechado. A implantação poderá ser registrada no próximo dia aberto.</p>
 : <>
  <Panel title="Comece com a posição real do seu negócio" hint={'Data de implantação: '+date(position.date)+' · Horário da Bahia'} action={<button className="icon-button" type="button" title="Continuar sem saldo inicial" aria-label="Dispensar saldo inicial" disabled={busy} onClick={()=>void skip()}><Icon name="close"/></button>}><div className="opening-info">
   <p className="subtle">Preenchimento opcional. Use o X para continuar com os saldos em zero. Você pode voltar aqui antes do primeiro lançamento.</p>
   {error&&!review&&<p className="alert error" role="alert">{error}</p>}
   <p>Informe o que já existia antes de começar a usar a Maré: mercadoria disponível, dinheiro e contas ainda em aberto. Vendas e compras antigas não precisam ser recriadas.</p>
   <p>Esses valores não contam como venda, compra ou lucro. O custo do estoque será usado nas próximas vendas.</p>
   <div className="opening-actions"><button className="text-button" onClick={()=>navigate('products')}>Cadastrar produtos</button><button className="text-button" onClick={()=>navigate('customers')}>Cadastrar clientes</button><button className="text-button" onClick={()=>navigate('suppliers')}>Cadastrar fornecedores</button></div>
  </div></Panel>
  {!review?<form className="form opening-form" onSubmit={e=>{e.preventDefault();setError('');if(stock.some(s=>!quantityKg(s))){setError('Confira as quantidades e os pesos das caixas.');return;}setConfirmed(false);setReview(true);}}>
   <h2>1. Dinheiro disponível</h2>
   <Field label="Dinheiro em caixa e bancos (R$)" hint="Some os saldos que já possui. Valor negativo representa saldo devedor; não repita essa dívida nas contas abaixo."><input type="number" step="0.01" required value={cash} onChange={e=>setCash(e.target.value)}/></Field>
   <div className="form-section-heading"><h2>2. Estoque disponível</h2><button type="button" className="text-button" disabled={stock.length>=100} onClick={()=>setStock(rows=>[...rows,stockRow()])}>Adicionar produto ao saldo</button></div>
   <p className="subtle">Informe apenas os quilos que ainda tem e o custo médio de aquisição. Não use o preço de venda.</p>
   {stock.map((s,index)=><div className="opening-row" key={s.key}>
    <div className="form-section-heading"><h3>Produto {index+1}</h3><button type="button" className="text-button" aria-label={'Remover produto '+(index+1)} onClick={()=>setStock(rows=>rows.filter(r=>r.key!==s.key))}>Remover</button></div>
    <RemoteSelect<Product> path="/api/v1/products?activeOnly=true" label={'Produto do saldo '+(index+1)} value={s.productId} revision={revision} onSelect={p=>changeStock(s.key,{productId:p?String(p.id):'',name:p?.name||'',quantity:'',boxWeight:String(p?.box_weight_kg||15)})}/>
    <QuantityFields value={s} change={patch=>changeStock(s.key,patch)} label={'Quantidade inicial '+(index+1)}/><div className="form-grid"><Field label={'Custo médio '+(index+1)+' / kg (R$)'}><input type="number" min="0.000001" step="0.000001" required value={s.unitCost} onChange={e=>changeStock(s.key,{unitCost:e.target.value})}/></Field></div>
   </div>)}
   <div className="form-section-heading"><h2>3. Contas antigas em aberto</h2><button type="button" className="text-button" disabled={debts.length>=200} onClick={()=>setDebts(rows=>[...rows,debtRow()])}>Adicionar conta antiga</button></div>
   <p className="subtle">Informe somente o valor que falta receber ou pagar. Valores já quitados ficam de fora.</p>
   {debts.map((d,index)=><div className="opening-row" key={d.key}>
    <div className="form-section-heading"><h3>Conta {index+1}</h3><button type="button" className="text-button" onClick={()=>setDebts(rows=>rows.filter(r=>r.key!==d.key))}>Remover conta {index+1}</button></div>
    <Field label={'Tipo da conta '+(index+1)}><select value={d.kind} onChange={e=>changeDebt(d.key,{kind:e.target.value,partyId:'',partyName:''})}><option value="RECEIVABLE">Cliente me deve</option><option value="PURCHASE_PAYABLE">Devo por uma compra de mercadoria</option><option value="OTHER_PAYABLE">Outra conta a pagar</option></select></Field>
    <RemoteSelect<Partner> key={d.kind} path={'/api/v1/'+(d.kind==='RECEIVABLE'?'customers':'suppliers')+'?activeOnly=true'} label={(d.kind==='RECEIVABLE'?'Cliente da conta ':'Fornecedor opcional da conta ')+(index+1)} value={d.partyId} required={d.kind==='RECEIVABLE'} revision={revision} onSelect={p=>changeDebt(d.key,{partyId:p?String(p.id):'',partyName:p?.name||''})}/>
    <Field label={'Descrição da conta '+(index+1)}><input required maxLength={250} value={d.description} onChange={e=>changeDebt(d.key,{description:e.target.value})} placeholder="Ex.: restante da venda anotada na planilha"/></Field>
    <div className="form-grid"><Field label={'Valor restante da conta '+(index+1)+' (R$)'}><input type="number" min="0.01" step="0.01" required value={d.amount} onChange={e=>changeDebt(d.key,{amount:e.target.value})}/></Field><Field label={'Vencimento da conta '+(index+1)}><input type="date" required value={d.dueDate} onChange={e=>changeDebt(d.key,{dueDate:e.target.value})}/></Field></div>
   </div>)}
   <Field label="Observação da implantação (opcional)"><textarea maxLength={500} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: posição conferida com a planilha de novembro"/></Field>
   <button className="button primary">Conferir saldo inicial</button>
  </form>:<Panel title="Confira antes de confirmar"><div className="opening-info">
   <div className="opening-summary"><p>Dinheiro disponível<strong>{money(cash)}</strong></p><p>Valor estimado do estoque<strong>{money(stockValue)}</strong></p><p>Contas a receber<strong>{money(receivables)}</strong></p><p>Contas a pagar<strong>{money(payables)}</strong></p></div>
   <StockTable rows={stock.map((s,index)=>({id:index,product_name:s.name,quantity:quantityKg(s),unit_cost:s.unitCost,total_cost:Number(quantityKg(s))*Number(s.unitCost)}))}/>
   <DebtTable rows={debts.map(d=>({key:d.key,kind:d.kind==='RECEIVABLE'?'A receber':d.kind==='PURCHASE_PAYABLE'?'Compra a pagar':'Outra conta a pagar',description:(d.partyName?d.partyName+' · ':'')+d.description,amount:d.amount,dueDate:d.dueDate}))}/>
   <p className="alert info">Confirme apenas os saldos que existiam antes de usar a Maré. A implantação fica preservada após o primeiro lançamento ou o fechamento do dia.</p>
   <label className="checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Conferi os saldos nas planilhas e não estou repetindo compras ou vendas.</label>
   {error&&<p className="alert error" role="alert">{error}</p>}
   <div className="opening-actions"><button className="button secondary" disabled={busy} onClick={()=>setReview(false)}>Voltar e ajustar</button><button className="button primary" disabled={!confirmed||busy} onClick={()=>void confirm()}>{busy?'Registrando…':'Confirmar saldo inicial'}</button></div>
  </div></Panel>}
 </>}
 {undo&&<Modal title="Corrigir a implantação" close={()=>setUndo(false)}><MutationForm path={'/api/v1/opening-balances/'+position.opening.id+'/undo'} button="Desfazer saldo inicial" done={()=>{setUndo(false);setCash('0');setStock([]);setDebts([]);setNote('');setConfirmed(false);key.current=crypto.randomUUID();saved();}} build={d=>({reason:String(d.get('reason'))})}>
  <p>O sistema registrará um estorno dos saldos iniciais. Depois você poderá informar os valores corretos. O histórico da conferência será preservado.</p><Field label="Motivo da correção"><textarea name="reason" minLength={5} maxLength={500} required rows={3}/></Field>
 </MutationForm></Modal>}
 </>}</>;
}
function StockTable({rows}:{rows:{id:number;product_name:string;quantity:Num;unit_cost:Num;total_cost:Num}[]}){
 return !rows.length?<p className="subtle opening-info">Sem estoque inicial informado.</p>:<div className="table-wrap"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Custo / kg</th><th>Valor do estoque</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.product_name}</td><td>{kg(r.quantity)}</td><td>{money(r.unit_cost)}</td><td>{money(r.total_cost)}</td></tr>)}</tbody></table></div>;
}
function DebtTable({rows}:{rows:{key:string;kind:string;description:string;amount:Num;dueDate:string}[]}){
 return !rows.length?<p className="subtle opening-info">Sem contas antigas informadas.</p>:<div className="table-wrap"><table><thead><tr><th>Conta</th><th>Descrição</th><th>Vencimento</th><th>Valor restante</th></tr></thead><tbody>{rows.map(r=><tr key={r.key}><td>{r.kind}</td><td>{r.description}</td><td>{date(r.dueDate)}</td><td>{money(r.amount)}</td></tr>)}</tbody></table></div>;
}

export function OpeningReminder({revision,navigate}:{revision:number;navigate:(page:string)=>void}){
 const [hidden,setHidden]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const resource=useResource<Position>('/api/v1/opening-balances',revision);
 const p=resource.data;
 if(hidden||!p||p.configured||p.dismissed||p.hasPostings||p.dayClosed)return null;
 return <section className="opening-reminder" aria-label="Saldo inicial opcional"><div><strong>Já tinha estoque, dinheiro ou contas em aberto?</strong><p>Traga os saldos das suas planilhas antes do primeiro lançamento. Se preferir, comece com os saldos em zero.</p>{error&&<p role="alert">{error}</p>}</div>
  <button className="button secondary small" onClick={()=>navigate('opening')}>Configurar saldo inicial</button>
  <button className="icon-button" aria-label="Dispensar saldo inicial" title="Continuar sem saldo inicial" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await api.mutate('/api/v1/opening-balances/preference',{dismissed:true},crypto.randomUUID(),'PUT');setHidden(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><Icon name="close"/></button>
 </section>;
}
