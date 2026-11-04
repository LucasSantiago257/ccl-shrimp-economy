import {useState} from 'react';
import * as api from './api';
import {Field,Panel,Status,useResource} from './ui';

function PasswordFields() {
 return <><Field label="Nova senha" hint="Pelo menos 12 caracteres."><input name="password" type="password" required minLength={12} maxLength={72} autoComplete="new-password"/></Field>
 <Field label="Confirmar nova senha"><input name="confirmation" type="password" required minLength={12} maxLength={72} autoComplete="new-password"/></Field></>;
}
export function ProfilePage({onChanged}:{onChanged:()=>void}) {
 const resource=useResource<{username:string;recoveryEmail:string;recoveryConfigured:boolean}>('/api/auth/profile',0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 return <><Status loading={resource.loading} error={resource.error}/>
 {resource.data && <Panel title="Seu perfil" hint={'Usuário: '+resource.data.username}>
 <div style={{padding:20}}>
 <p>E-mail de recuperação: {resource.data.recoveryEmail||'Ainda não configurado'}</p>
 {!resource.data.recoveryConfigured && <p className="alert info">O envio de recuperação aguarda a configuração do serviço de e-mail.</p>}
 <form className="form" onSubmit={async e=>{
   e.preventDefault();if(busy)return;
   const data=new FormData(e.currentTarget);setBusy(true);setError('');
   try {await api.mutate('/api/auth/password',Object.fromEntries(data),crypto.randomUUID());onChanged();}
   catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}>
 <h3>Trocar senha</h3><p>Após salvar, entre novamente com a nova senha.</p>
 <Field label="Senha atual"><input name="currentPassword" type="password" required autoComplete="current-password"/></Field>
 <PasswordFields/>{error&&<p role="alert" className="alert error">{error}</p>}
 <button className="button primary" disabled={busy}>{busy?'Salvando…':'Salvar nova senha'}</button>
 </form></div></Panel>}</>;
}
export function RecoveryPage({token,back}:{token?:string;back:()=>void}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 return <main className="boot"><section className="login-card">
 <h1>{token?'Definir nova senha':'Recuperar acesso'}</h1>
 <p>{token?'Escolha sua nova senha para entrar na Maré.':'As instruções serão enviadas ao e-mail de recuperação cadastrado.'}</p>
 {message?<><p role="status">{message}</p><button className="button primary" onClick={back}>Voltar para entrar</button></>:
 <form className="form" onSubmit={async e=>{
   e.preventDefault();if(busy)return;const data=new FormData(e.currentTarget);setBusy(true);setError('');
   try {
     if(token){await api.mutate('/api/auth/password/reset',{...Object.fromEntries(data),token},crypto.randomUUID());setMessage('Senha redefinida. Entre com a nova senha.');}
     else {const r=await api.mutate<{message:string}>('/api/auth/password/reset-request',{},crypto.randomUUID());setMessage(r.message);}
   }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }}>
 {token&&<PasswordFields/>}{error&&<p role="alert" className="alert error">{error}</p>}
 <button className="button primary" disabled={busy}>{busy?'Aguarde…':token?'Redefinir senha':'Enviar instruções'}</button>
 <button type="button" className="text-button" onClick={back}>Voltar para entrar</button>
 </form>}
 </section></main>;
}

