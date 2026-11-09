import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import * as api from './api';
import { ClosedDayContext, Icon, date, today, useResource } from './ui';
import type { PeriodStatus } from './types';
import { PartnersPage, ProductsPage } from './CatalogPages';
import { TradesPage, StockPage, ExpensesPage } from './OperationPages';
import { FinancePage, ResultPage, Dashboard } from './FinancePages';
import { AnalyticsPage } from './AnalyticsPage';
import { ProfilePage, RecoveryPage } from './ProfilePage';
import { OpeningPage, OpeningReminder } from './OpeningPage';
import './opening.css';
import { CorrectionContext, CorrectionModal, CorrectionsPage } from './Corrections';
import type { CorrectionTarget } from './Corrections';
import { ReplacementContext, postingPages } from './postingFlow';
import type { ReplacementRequest } from './postingFlow';

const pages = [
  { id: 'dashboard', label: 'Visão geral', icon: 'dashboard', group: 'PRINCIPAL', description: 'Uma visão clara do seu negócio.' },
  { id: 'profile', label: 'Perfil', icon: 'people', description: 'Sua conta e segurança de acesso.' },
  { id: 'customers', label: 'Clientes', icon: 'people', group: 'CADASTROS', description: 'Pessoas, histórico e valores a receber.' },
  { id: 'suppliers', label: 'Fornecedores', icon: 'people', description: 'Quem abastece o seu negócio.' },
  { id: 'products', label: 'Produtos', icon: 'box', description: 'Seu catálogo e os preços por quilo.' },
  { id: 'opening', label: 'Saldo inicial', icon: 'wallet', description: 'Traga os saldos das suas planilhas para a Maré.' },
  { id: 'purchases', label: 'Compras', icon: 'purchase', group: 'OPERAÇÃO', description: 'Registre o camarão que chega à empresa.' },
  { id: 'sales', label: 'Vendas', icon: 'sale', description: 'Venda por quilo, à vista ou fiado.' },
  { id: 'stock', label: 'Estoque', icon: 'box', description: 'Acompanhe cada entrada, saída e perda.' },
  { id: 'analytics', label: 'Dashboards', icon: 'report', group: 'RESULTADOS', description: 'Acompanhe vendas, caixa e estoque ao longo do tempo.' },
  { id: 'finance', label: 'Financeiro', icon: 'wallet', description: 'Recebimentos e pagamentos no seu ritmo.' },
  { id: 'expenses', label: 'Despesas', icon: 'wallet', description: 'Registre os gastos da operação.' },
  { id: 'result', label: 'Fechamento', icon: 'report', description: 'Confira o resultado gerencial do período.' },
  { id: 'corrections', label: 'Correções', icon: 'report', description: 'Corrija erros com histórico e ajustes de estoque e financeiro.' },
];

function Login({ onLogin, onRecover }: { onLogin: (username: string) => void; onRecover:()=>void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try { await api.login(String(data.get('username')), String(data.get('password')), data.get('remember') === 'on'); const user = await api.get<{ username: string }>('/api/auth/me'); onLogin(user.username); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-story"><div className="brand"><span className="brand-mark"><Icon name="wave" size={28} /></span><span>maré<small>GESTÃO DO CAMARÃO</small></span></div><div><span className="eyebrow light">DO ESTOQUE AO RECEBIMENTO</span><h1>Seu negócio,<br />em boas águas.</h1><p>Compras, vendas e fiado organizados.<br />Mais clareza para cuidar de cada quilo.</p><div className="wave-art" aria-hidden="true"><Icon name="wave" size={190} /></div></div><small>Gestão simples. Decisões bem informadas.</small></section><section className="login-main"><form onSubmit={submit} className="login-card"><span className="eyebrow">BEM-VINDO À MARÉ</span><h2>Vamos começar?</h2><p>Entre para acompanhar o seu negócio.</p><label className="field"><span>Usuário</span><input name="username" autoComplete="username" required autoFocus /></label><label className="field"><span>Senha</span><input name="password" type="password" autoComplete="current-password" required /></label><label className="remember-login"><input type="checkbox" name="remember" /><span>Lembrar meu login por 30 dias<small>Use apenas em um dispositivo pessoal.</small></span></label>{error && <p role="alert" className="alert error">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no sistema'}<Icon name="arrow" /></button><button type="button" className="text-button" onClick={onRecover}>Esqueci minha senha</button></form></section></main>;
}

export default function App() {
  const [recovery,setRecovery]=useState<string | null>(()=>{
    const match=window.location.hash.match(/^#reset-password=([A-Za-z0-9_-]+)$/);
    if(match) return match[1];
    return null;
  });
  useEffect(()=>{
    const read=()=>{
      const match=window.location.hash.match(/^#reset-password=([A-Za-z0-9_-]+)$/);
      if(match){setRecovery(match[1]);window.history.replaceState(null,'',window.location.pathname);}
    };
    read();window.addEventListener('hashchange',read);
    return ()=>window.removeEventListener('hashchange',read);
  },[]);
  const [user, setUser] = useState<string | null>(null); const [checking, setChecking] = useState(true); const [error, setError] = useState('');
  async function check() {
    setChecking(true); setError('');
    try { const data = await api.get<{ username: string }>('/api/auth/me'); setUser(data.username); }
    catch (e) { if (!(e instanceof api.ApiError && e.status === 401)) setError('O servidor está indisponível. Confira se os serviços foram iniciados.'); }
    finally { setChecking(false); }
  }
  useEffect(() => { void check(); const expired = () => setUser(null); window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, []);
  if(recovery!==null) return <RecoveryPage key={recovery||'request'} token={recovery||undefined} back={()=>{setRecovery(null);setUser(null);}}/>;
  if (checking) return <main className="boot" role="status"><Icon name="wave" size={44} /><p>Preparando a Maré…</p></main>;
  if (error) return <main className="boot"><p role="alert">{error}</p><button className="button primary" onClick={() => void check()}>Tentar novamente</button></main>;
  return user ? <Shell username={user} signOut={() => setUser(null)} /> : <Login onLogin={setUser} onRecover={()=>setRecovery('')} />;
}

function Shell({ username, signOut }: { username: string; signOut: () => void }) {
  const [correction,setCorrection] = useState<CorrectionTarget | null>(null);
  const [replacement,setReplacement] = useState<ReplacementRequest | null>(null);
  const [page, setPage] = useState('dashboard'); const [revision, setRevision] = useState(0); const [menu, setMenu] = useState(false); const [notice, setNotice] = useState('');
  const [clockRevision, setClockRevision] = useState(0);
  const period = useResource<PeriodStatus>('/api/v1/closings/status', revision + clockRevision);
  useEffect(() => { const timer = setInterval(() => setClockRevision(v => v + 1), 60000); return () => clearInterval(timer); }, []);
  const current = pages.find(p => p.id === page)!;
  const navigate = (next: string) => { setReplacement(null); setPage(next); setMenu(false); };
  const saved = () => { setRevision(r => r + 1); setNotice(replacement ? 'Registro correto salvo e vinculado.' : 'Registro salvo com sucesso.'); };
  const recreate = (request: ReplacementRequest) => {
    setCorrection(null);
    setReplacement(request);
    setPage(postingPages[request.kind]);
    setMenu(false);
  };
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice, revision]);
  async function exit() { try { await api.logout(); signOut(); } catch (e) { setNotice((e as Error).message); } }
  return <ReplacementContext.Provider value={{request:replacement,cancel:()=>setReplacement(null),complete:()=>setReplacement(null)}}>
    <CorrectionContext.Provider value={target => setCorrection(target)}><div className="app-shell">
    {menu && <button className="menu-backdrop" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
    <aside className={'sidebar ' + (menu ? 'open' : '')}><div className="brand"><span className="brand-mark"><Icon name="wave" size={27} /></span><span>maré<small>GESTÃO DO CAMARÃO</small></span></div><nav aria-label="Navegação principal">{pages.filter(p=>p.id!=='profile').map(p => <div key={p.id}>{p.group && <div className="nav-group">{p.group}</div>}<button className={'nav-item ' + (page === p.id ? 'active' : '')} onClick={() => navigate(p.id)} aria-current={page === p.id ? 'page' : undefined}><Icon name={p.icon} /><span>{p.label}</span>{page === p.id && <span className="nav-dot" />}</button></div>)}</nav><button className="nav-item" style={{marginTop:'auto'}} onClick={()=>navigate('profile')} aria-current={page==='profile'?'page':undefined}><Icon name="people"/><span>Perfil</span></button><div className="sidebar-bottom" style={{marginTop:0}}><div className="account-avatar">{username.slice(0, 1).toUpperCase()}</div><div><strong>{username}</strong><small>Administrador</small></div><button className="icon-button" aria-label="Sair do sistema" title="Sair" onClick={() => void exit()}><Icon name="logout" size={18} /></button></div></aside>
    <div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMenu(true)}><Icon name="menu" /></button><span className="breadcrumb">Meu negócio <span>/</span> <strong>{current.label}</strong></span><span className="top-date">{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', dateStyle: 'long' }).format(new Date(today() + 'T12:00:00Z'))}</span></header><main className="content"><div className="page-heading"><div><span className="eyebrow">GESTÃO DO SEU NEGÓCIO</span><h1>{current.label}</h1><p>{current.description}</p></div><button className="button secondary small" onClick={() => setRevision(r => r + 1)}>Atualizar</button></div>
      {period.data?.closed && <div className="closed-day-banner" role="status"><div><strong>Dia {date(period.data.date)} fechado</strong><span>{period.data.automaticClosingPending ? 'Novos lançamentos estão bloqueados desde as 23h59. O snapshot automático está sendo preparado.' : 'Novos lançamentos estão bloqueados. Consulte o snapshot preservado no fechamento.'}</span></div><button className="button secondary small" onClick={() => navigate('result')}>Ver fechamentos</button></div>}
      <ClosedDayContext.Provider value={!!period.data?.closed}>
      {replacement && <div className="alert info replacement-notice" role="status">
        <span><strong>Registrando os dados corretos</strong><br/>
          {replacement.kind==='PAYMENT' ? 'Escolha a conta abaixo e registre o pagamento ou recebimento correto.' : 'Preencha o formulário com os dados corretos.'} O vínculo com o registro cancelado será feito ao salvar.</span>
        <button className="text-button" onClick={()=>setReplacement(null)}>Sair da correção</button>
      </div>}
      {page === 'dashboard' && <><OpeningReminder revision={revision} navigate={navigate}/><Dashboard revision={revision} navigate={navigate} /></>}
      {page === 'profile' && <ProfilePage onChanged={signOut}/>}
      {page === 'opening' && <OpeningPage revision={revision} saved={saved} navigate={navigate} onSkip={()=>{setRevision(r=>r+1);navigate('dashboard');}}/>}
      {page === 'analytics' && <AnalyticsPage revision={revision} />}
      {page === 'corrections' && <CorrectionsPage revision={revision} navigate={navigate} />}
      {(page === 'customers' || page === 'suppliers') && <PartnersPage key={page} customer={page === 'customers'} revision={revision} saved={saved} />}
      {page === 'products' && <ProductsPage revision={revision} saved={saved} />}
      {(page === 'purchases' || page === 'sales') && <TradesPage key={page} sale={page === 'sales'} revision={revision} saved={saved} />}
      {page === 'stock' && <StockPage revision={revision} saved={saved} />}
      {page === 'finance' && <FinancePage revision={revision} saved={saved} />}
      {page === 'expenses' && <ExpensesPage revision={revision} saved={saved} />}
      {page === 'result' && <ResultPage revision={revision + clockRevision} saved={saved} />}
      {correction && <CorrectionModal key={correction.kind+':'+correction.id} target={correction} revision={revision} close={() => setCorrection(null)} saved={saved} recreate={recreate} />}
      </ClosedDayContext.Provider>
    </main><footer className="app-footer"><span>maré <span>·</span> Gestão do camarão</span><span>Valores em reais · Pesos em quilos</span></footer></div>{notice && <div role="status" className="toast"><Icon name="check" />{notice}<button className="icon-button" aria-label="Dispensar aviso" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
  </div></CorrectionContext.Provider></ReplacementContext.Provider>;
}
