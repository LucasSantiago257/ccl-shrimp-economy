import { useState } from 'react';
import { Field, Panel, Status, date, kg, money, today, useResource } from './ui';
import { Kpi } from './FinancePages';
import type { Num } from './types';
import './analytics.css';

type Range = { from: string; to: string };
type Metric = 'revenue' | 'operating_result' | 'received' | 'paid' | 'purchased_kg' | 'sold_kg' | 'lost_kg';
type Point = Range & Record<Metric, Num>;
type Analytics = Range & {
  timezone: string; grouping: 'day' | 'week' | 'month'; metrics: Record<string, Num>; stock_kg: Num;
  composition: { sales_total: Num; sales_paid: Num; purchases_total: Num; purchases_paid: Num };
  series: Point[];
};
type Key = { field: Metric; label: string; color: string };
const sales: Key[] = [
  {field:'revenue', label:'Vendas líquidas', color:'#00756c'},
  {field:'operating_result', label:'Resultado', color:'#994c28'},
];
const cash: Key[] = [
  {field:'received', label:'Recebido', color:'#00756c'},
  {field:'paid', label:'Pago', color:'#994c28'},
];
const volume: Key[] = [
  {field:'purchased_kg', label:'Comprado', color:'#00756c'},
  {field:'sold_kg', label:'Vendido', color:'#ac622f'},
  {field:'lost_kg', label:'Perdido', color:'#655581'},
];
const percent = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
const shortNumber = new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1});
const presets = ['Mês atual','Últimos 7 dias','Últimos 30 dias','Mês anterior','Personalizado'] as const;
type Preset = typeof presets[number];
function shift(day: string, offset: number) {
  const time = new Date(day + 'T12:00:00Z');
  time.setUTCDate(time.getUTCDate() + offset);
  return time.toISOString().slice(0,10);
}
function presetRange(preset: Preset, end: string): Range {
  const first = end.slice(0,7) + '-01';
  if (preset === 'Mês anterior') {
    const last = shift(first,-1);
    return {from:last.slice(0,7)+'-01',to:last};
  }
  if (preset === 'Últimos 7 dias') return {from:shift(end,-6),to:end};
  if (preset === 'Últimos 30 dias') return {from:shift(end,-29),to:end};
  return {from:first,to:end};
}
function interval(p: Range) {
  return p.from === p.to ? date(p.from) : date(p.from) + ' a ' + date(p.to);
}

function PaymentPie({data}: {data: Analytics}) {
  const [kind,setKind] = useState<'sales'|'purchases'>('sales');
  const isSale = kind === 'sales';
  const total = Number(data.composition[isSale ? 'sales_total' : 'purchases_total']);
  const paid = Number(data.composition[isSale ? 'sales_paid' : 'purchases_paid']);
  const settled = total ? paid * 100 / total : 0;
  const rows = [
    {label:isSale?'Recebido':'Pago',amount:paid,share:settled,color:'#00756c'},
    {label:isSale?'A receber':'A pagar',amount:total-paid,share:total?100-settled:0,color:'#d69b54'},
  ];
  const title = isSale ? 'Das vendas do período, quanto já recebi?' : 'Das compras do período, quanto já paguei?';
  return <Panel title={title} hint={'Documentos emitidos no período, com baixas até ' + date(data.to) + '.'}
    action={<div className="dash-switch" aria-label="Tipo de documento">{(['sales','purchases'] as const).map(k =>
      <button key={k} aria-pressed={kind===k} onClick={()=>setKind(k)}>{k==='sales'?'Vendas':'Compras'}</button>)}</div>}>
    {total > 0 ? <div className="dash-pie-layout"><div className="dash-pie" aria-hidden="true" style={{background:`conic-gradient(#00756c 0 ${settled}%, #d69b54 ${settled}% 100%)`}}/>
      <div className="dash-breakdown"><small>Total {isSale?'vendido':'comprado'}</small><strong>{money(total)}</strong>
        {rows.map(r=><div className="dash-slice" key={r.label}><i style={{background:r.color}}/><span>{r.label}</span><b>{money(r.amount)}</b><span>{percent.format(r.share)}%</span></div>)}</div></div>
      : <p className="dash-empty">Sem valor de {isSale?'vendas':'compras'} no período</p>}
    <details className="dash-table"><summary>Ver tabela</summary><div className="table-wrap"><table><thead><tr><th>Situação</th><th>Valor</th><th>Percentual</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.label}><td>{r.label}</td><td>{money(r.amount)}</td><td>{total?percent.format(r.share)+'%':'—'}</td></tr>)}</tbody></table></div></details>
  </Panel>;
}

function SeriesChart({title,hint,points,keys,lines=false,weights=false}: {
  title:string; hint:string; points:Point[]; keys:Key[]; lines?:boolean; weights?:boolean;
}) {
  const values = points.flatMap(p=>keys.map(k=>Number(p[k.field])));
  const min = Math.min(0,...values), max = Math.max(0,...values) || (min===0 ? 1 : 0);
  const y = (v:number)=> 130 - (v-min)*110/(max-min);
  const column = 282/points.length;
  const x = (i:number)=>56+(i+0.5)*column;
  const width = column * 0.8 / keys.length;
  const format = weights ? kg : money;
  const ticks = Array.from(new Set([min,0,max])).sort((a,b)=>a-b);
  return <Panel title={title} hint={hint}>
    <div className="dash-legend">{keys.map(k=><span key={k.field}><i style={{background:k.color}}/>{k.label}</span>)}</div>
    <svg viewBox="0 0 350 158" className="dash-plot" role="img" aria-label={title + '. Valores completos em Ver tabela.'}>
      {ticks.map(t=><g key={t}><line x1="56" x2="338" y1={y(t)} y2={y(t)} stroke={t===0?'#6a7975':'#dce6e1'} />
        <text x="53" y={y(t)+3} textAnchor="end">{weights?'':'R$ '}{shortNumber.format(t)}{weights?' kg':''}</text></g>)}
      {keys.map((k,j)=>lines ? <g key={k.field}><polyline fill="none" stroke={k.color} strokeWidth="2" strokeDasharray={j?'5 2':undefined}
        points={points.map((p,i)=>x(i)+','+y(Number(p[k.field]))).join(' ')}/>{points.map((p,i)=><circle key={p.from} cx={x(i)} cy={y(Number(p[k.field]))} r={points.length===1?3:1.6} fill={k.color}/>)}</g>
        : <g key={k.field}>{points.map((p,i)=><rect key={p.from} fill={k.color} x={x(i)-column*0.4+j*width} width={width*0.92} y={y(Number(p[k.field]))} height={y(0)-y(Number(p[k.field]))}/>)}</g>)}
      {Array.from(new Set([0,Math.floor((points.length-1)/2),points.length-1])).map(i=><text key={i} x={x(i)} y="150" textAnchor="middle">{date(points[i].from).slice(0,5)}</text>)}
    </svg>
    <details className="dash-table"><summary>Ver tabela</summary><div className="table-wrap"><table><thead><tr><th>Período</th>{keys.map(k=><th key={k.field}>{k.label}</th>)}</tr></thead>
      <tbody>{points.map(p=><tr key={p.from}><td>{interval(p)}</td>{keys.map(k=><td key={k.field}>{format(p[k.field])}</td>)}</tr>)}</tbody></table></div></details>
  </Panel>;
}

export function AnalyticsPage({revision}: {revision:number}) {
  const day = today();
  const [preset,setPreset] = useState<Preset>('Mês atual');
  const [custom,setCustom] = useState<Range>(()=>presetRange('Mês atual',day));
  const [draft,setDraft] = useState(custom);
  const [error,setError] = useState('');
  const range = preset==='Personalizado' ? custom : presetRange(preset,day);
  const resource = useResource<Analytics>(`/api/v1/reports/dashboard?from=${range.from}&to=${range.to}`,revision);
  const data=resource.data, m=data?.metrics;
  return <div className="dash-page"><div className="dash-filters"><Field label="Período"><select value={preset} onChange={e=>{
    const next=e.target.value as Preset;
    if(next==='Personalizado'){setCustom(range);setDraft(range);}
    setError('');setPreset(next);
  }}>{presets.map(p=><option key={p}>{p}</option>)}</select></Field>
    {preset==='Personalizado' && <form className="dash-custom" onSubmit={e=>{
      e.preventDefault();
      const span=(Date.parse(draft.to)-Date.parse(draft.from))/86400000;
      if(!Number.isFinite(span)||span<0||span>=366){setError('Escolha um intervalo de 1 a 366 dias.');return;}
      setError('');setCustom(draft);
    }}><Field label="Data inicial"><input type="date" required value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></Field>
    <Field label="Data final"><input type="date" required value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></Field>
    <button className="button secondary">Aplicar</button></form>}
    <small>{interval(range)} · Horário da Bahia</small></div>
    {error && <p role="alert" className="alert error">{error}</p>}
    <Status error={resource.error} loading={resource.loading}/>
    {data && m && <><div className="kpi-grid">
      <Kpi label="Vendas líquidas" value={money(m.revenue)} hint="Após descontos" icon="sale"/>
      <Kpi label="Resultado gerencial" value={money(m.operating_result)} hint="Após custos, despesas e perdas" featured/>
      <Kpi label="Quilos vendidos" value={kg(m.sold_kg)} hint="Saídas por venda no período" icon="sale"/>
      <Kpi label="Estoque na data final" value={kg(data.stock_kg)} hint={date(data.to)} icon="box"/></div>
      <PaymentPie data={data}/>
      <div className="dash-balances"><div>Vendas a receber <strong>{money(m.receivables)}</strong></div><div>Compras a pagar <strong>{money(m.purchase_payables)}</strong></div>
      <small>Saldo em {date(data.to)}, incluindo pendências anteriores ao período.</small></div>
      <div className="dash-charts"><SeriesChart title="Quanto vendi e quanto lucrei?" hint="Vendas após descontos e resultado após todos os custos." points={data.series} keys={sales} lines/>
      <SeriesChart title="Quanto dinheiro entrou e saiu?" hint={'Movimento líquido no período: '+money(m.cash_flow)} points={data.series} keys={cash}/>
      <SeriesChart title="Quantos quilos comprei, vendi ou perdi?" hint={'Movimento de estoque por '+({day:'dia',week:'semana',month:'mês'}[data.grouping])+'.'} points={data.series} keys={volume} weights/></div></>}
  </div>;
}

