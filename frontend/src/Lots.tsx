import { useEffect, useState } from 'react';
import { Field, Status, date, kg, money, useResource } from './ui';

type Lot = {id:number; origin:string; origin_id:number; received_at:string; quantity:number; unit_cost:number; suggested_price:number};
function label(lot:Lot) {
  if (lot.origin==='PREVIOUS') return 'Saldo anterior';
  if (lot.origin==='OPENING') return 'Saldo inicial';
  return (lot.origin==='PROCESS' ? 'Beneficiamento #' : 'Entrega #')+lot.origin_id+' · '+date(lot.received_at);
}
export function LotSelect({product,revision,value,onSelect}:{product:string;revision:number;value:string;onSelect:(id:string,price:string)=>void}) {
  const lots=useResource<Lot[]>('/api/v1/stock/lots?productId='+product,revision);
  useEffect(()=>{
    if(lots.data?.length && !value) onSelect(String(lots.data[0].id),String(lots.data[0].suggested_price));
  },[lots.data,value,onSelect]);
  return <><Status loading={lots.loading} error={lots.error}/><Field label="Lote de origem"><select required value={value} onChange={e=>{
    const lot=lots.data?.find(l=>String(l.id)===e.target.value);
    if(lot) onSelect(String(lot.id),String(lot.suggested_price));
  }}><option value="">{lots.loading?'Carregando…':'Sem lote selecionado'}</option>{lots.data?.map(l=><option key={l.id} value={l.id}>{label(l)} · {kg(l.quantity)} · {money(l.suggested_price)}/kg</option>)}</select></Field></>;
}
export function StockLots({product,revision}:{product:number;revision:number}) {
  const [open,setOpen]=useState(false);
  return <><button type="button" className="text-button" onClick={()=>setOpen(!open)}>{open?'Ocultar lotes':'Ver lotes'}</button>{open && <LotList product={product} revision={revision}/>}</>;
}
function LotList({product,revision}:{product:number;revision:number}) {
  const [history,setHistory]=useState(false);
  const lots=useResource<Lot[]>('/api/v1/stock/lots?productId='+product+'&history='+history,revision);
  return <div><label><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/> Incluir esgotados</label><Status loading={lots.loading} error={lots.error}/>
    {lots.data?.map(l=><p key={l.id}><strong>{label(l)}</strong> · {kg(l.quantity)}<br/>Venda {money(l.suggested_price)}/kg {Number(l.quantity)>0 && <>· Custo {money(l.unit_cost)}/kg</>}</p>)}{lots.data?.length===0 && <p>Nenhum lote disponível.</p>}</div>;
}
