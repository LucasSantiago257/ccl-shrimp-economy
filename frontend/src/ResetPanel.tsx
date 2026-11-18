import {useState} from 'react';
import * as api from './api';
import {Field,Panel,useResource} from './ui';
export function ResetPanel(){
 const status=useResource<{resetEnabled:boolean}>('/api/v1/homologation/status',0);
 const [open,setOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!status.data?.resetEnabled)return null;
 return <Panel title="Homologação · Reiniciar operação"><div style={{padding:20}}><p>Preserva os cadastros de clientes e fornecedores e seu acesso ao sistema. Apaga compras, vendas, fiados, pagamentos, despesas e agendamentos mensais, beneficiamentos, estoque e saldo inicial. Remove os fechamentos e seus snapshots. O catálogo de produtos volta a ter apenas Camarão, com estoque zero. Esta ação é irreversível.</p>
 {!open?<button className="button secondary" style={{color:'#a52828',marginTop:16}} onClick={()=>setOpen(true)}>Limpar dados operacionais</button>:<form className="form" onSubmit={async e=>{e.preventDefault();if(busy||confirmation!=='LIMPAR OPERACAO')return;setBusy(true);setError('');try{await api.mutate('/api/v1/homologation/clear-operations',{confirmation},crypto.randomUUID());window.location.reload();}catch(e){setError((e as Error).message);setBusy(false);}}}>
 <Field label="Digite LIMPAR OPERACAO para confirmar"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" required/></Field>{error&&<p className="alert error" role="alert">{error}</p>}
 <button className="button primary" disabled={busy||confirmation!=='LIMPAR OPERACAO'}>{busy?'Apagando…':'Confirmar limpeza da operação'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>{setOpen(false);setConfirmation('');}}>Cancelar</button></form>}
 </div></Panel>;
}
