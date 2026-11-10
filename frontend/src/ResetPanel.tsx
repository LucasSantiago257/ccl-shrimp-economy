import {useState} from 'react';
import * as api from './api';
import {Field,Panel,useResource} from './ui';
export function ResetPanel(){
 const status=useResource<{resetEnabled:boolean}>('/api/v1/homologation/status',0);
 const [open,setOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!status.data?.resetEnabled)return null;
 return <Panel title="Homologação · Reset do sistema"><div style={{padding:20}}><p>Apaga clientes, fornecedores, produtos, compras, vendas, pagamentos, despesas, perdas, estoque, saldo inicial e todos os fechamentos com seus snapshots. Os bloqueios desses períodos serão removidos. Mantém seu usuário e senha e recria o produto Camarão com estoque zero. Esta ação é irreversível.</p>
 {!open?<button className="button secondary" style={{color:'#a52828',marginTop:16}} onClick={()=>setOpen(true)}>KILL — Resetar homologação</button>:<form className="form" onSubmit={async e=>{e.preventDefault();if(busy||confirmation!=='APAGAR HOMOLOGACAO')return;setBusy(true);setError('');try{await api.mutate('/api/v1/homologation/reset',{confirmation},crypto.randomUUID());window.location.reload();}catch(e){setError((e as Error).message);setBusy(false);}}}>
 <Field label="Digite APAGAR HOMOLOGACAO para confirmar"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off" required/></Field>{error&&<p className="alert error" role="alert">{error}</p>}
 <button className="button primary" disabled={busy||confirmation!=='APAGAR HOMOLOGACAO'}>{busy?'Apagando…':'Apagar todos os dados de homologação'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>{setOpen(false);setConfirmation('');}}>Cancelar</button></form>}
 </div></Panel>;
}
