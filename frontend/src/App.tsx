import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import * as api from './api';
import { ClosedDayContext, Icon, Status, date, today, useResource } from './ui';
import type { Partner, PeriodStatus, Product } from './types';
import { PartnersPage, ProductsPage } from './CatalogPages';
import { TradesPage, StockPage, ExpensesPage } from './OperationPages';
import { FinancePage, ResultPage, Dashboard } from './FinancePages';

const pages = [
  { id: 'dashboard', label: 'Visão geral', icon: 'dashboard', group: 'PRINCIPAL', description: 'Uma visão clara do seu negócio.' },
  { id: 'customers', label: 'Clientes', icon: 'people', group: 'CADASTROS', description: 'Pessoas, histórico e valores a receber.' },
  { id: 'suppliers', label: 'Fornecedores', icon: 'people', description: 'Quem abastece o seu negócio.' },
  { id: 'products', label: 'Produtos', icon: 'box', description: 'Seu catálogo e os preços por quilo.' },
  { id: 'purchases', label: 'Compras', icon: 'purchase', group: 'OPERAÇÃO', description: 'Registre o camarão que chega à empresa.' },
  { id: 'sales', label: 'Vendas', icon: 'sale', description: 'Venda por quilo, à vista ou fiado.' },
  { id: 'stock', label: 'Estoque', icon: 'box', description: 'Acompanhe cada entrada, saída e perda.' },
  { id: 'finance', label: 'Financeiro', icon: 'wallet', group: 'RESULTADOS', description: 'Recebimentos e pagamentos no seu ritmo.' },
  { id: 'expenses', label: 'Despesas', icon: 'wallet', description: 'Registre os gastos da operação.' },
  { id: 'result', label: 'Fechamento', icon: 'report', description: 'Confira o resultado gerencial do período.' },
];

function Login({ onLogin }: { onLogin: (username: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try { await api.login(String(data.get('username')), String(data.get('password'))); const user = await api.get<{ username: string }>('/api/auth/me'); onLogin(user.username); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-story"><div className="brand"><span className="brand-mark"><Icon name="wave" size={28} /></span><span>maré<small>GESTÃO DO CAMARÃO</small></span></div><div><span className="eyebrow light">DO ESTOQUE AO RECEBIMENTO</span><h1>Seu negócio,<br />em boas águas.</h1><p>Compras, vendas e fiado organizados.<br />Mais clareza para cuidar de cada quilo.</p><div className="wave-art" aria-hidden="true"><Icon name="wave" size={190} /></div></div><small>Gestão simples. Decisões bem informadas.</small></section><section className="login-main"><form onSubmit={submit} className="login-card"><span className="eyebrow">BEM-VINDO À MARÉ</span><h2>Vamos começar?</h2><p>Entre para acompanhar o seu negócio.</p><label className="field"><span>Usuário</span><input name="username" autoComplete="username" required autoFocus /></label><label className="field"><span>Senha</span><input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert" className="alert error">{error}</p>}<button className="button primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no sistema'}<Icon name="arrow" /></button><small className="subtle">Use as credenciais definidas na configuração local.</small></form></section></main>;
}

export default function App() {
  const [user, setUser] = useState<string | null>(null); const [checking, setChecking] = useState(true); const [error, setError] = useState('');
  async function check() {
    setChecking(true); setError('');
    try { const data = await api.get<{ username: string }>('/api/auth/me'); setUser(data.username); }
    catch (e) { if (!(e instanceof api.ApiError && e.status === 401)) setError('O servidor está indisponível. Confira se os serviços foram iniciados.'); }
    finally { setChecking(false); }
  }
  useEffect(() => { void check(); const expired = () => setUser(null); window.addEventListener('session-expired', expired); return () => window.removeEventListener('session-expired', expired); }, []);
  if (checking) return <main className="boot" role="status"><Icon name="wave" size={44} /><p>Preparando a Maré…</p></main>;
  if (error) return <main className="boot"><p role="alert">{error}</p><button className="button primary" onClick={() => void check()}>Tentar novamente</button></main>;
  return user ? <Shell username={user} signOut={() => setUser(null)} /> : <Login onLogin={setUser} />;
}

function Shell({ username, signOut }: { username: string; signOut: () => void }) {
  const [page, setPage] = useState('dashboard'); const [revision, setRevision] = useState(0); const [menu, setMenu] = useState(false); const [notice, setNotice] = useState('');
  const customers = useResource<Partner[]>('/api/v1/customers', revision);
  const suppliers = useResource<Partner[]>('/api/v1/suppliers', revision);
  const products = useResource<Product[]>('/api/v1/products', revision);
  const [clockRevision, setClockRevision] = useState(0);
  const period = useResource<PeriodStatus>('/api/v1/closings/status', revision + clockRevision);
  useEffect(() => { const timer = setInterval(() => setClockRevision(v => v + 1), 60000); return () => clearInterval(timer); }, []);
  const current = pages.find(p => p.id === page)!;
  const navigate = (next: string) => { setPage(next); setMenu(false); };
  const saved = () => { setRevision(r => r + 1); setNotice('Registro salvo com sucesso.'); };
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice, revision]);
  async function exit() { try { await api.logout(); signOut(); } catch (e) { setNotice((e as Error).message); } }
  const catalogError = customers.error || suppliers.error || products.error;
  return <div className="app-shell">
    {menu && <button className="menu-backdrop" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
    <aside className={'sidebar ' + (menu ? 'open' : '')}><div className="brand"><span className="brand-mark"><Icon name="wave" size={27} /></span><span>maré<small>GESTÃO DO CAMARÃO</small></span></div><nav aria-label="Navegação principal">{pages.map(p => <div key={p.id}>{p.group && <div className="nav-group">{p.group}</div>}<button className={'nav-item ' + (page === p.id ? 'active' : '')} onClick={() => navigate(p.id)} aria-current={page === p.id ? 'page' : undefined}><Icon name={p.icon} /><span>{p.label}</span>{page === p.id && <span className="nav-dot" />}</button></div>)}</nav><div className="sidebar-bottom"><div className="account-avatar">{username.slice(0, 1).toUpperCase()}</div><div><strong>{username}</strong><small>Administrador</small></div><button className="icon-button" aria-label="Sair do sistema" title="Sair" onClick={() => void exit()}><Icon name="logout" size={18} /></button></div></aside>
    <div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Abrir menu" onClick={() => setMenu(true)}><Icon name="menu" /></button><span className="breadcrumb">Meu negócio <span>/</span> <strong>{current.label}</strong></span><span className="top-date">{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', dateStyle: 'long' }).format(new Date(today() + 'T12:00:00Z'))}</span></header><main className="content"><div className="page-heading"><div><span className="eyebrow">GESTÃO DO SEU NEGÓCIO</span><h1>{current.label}</h1><p>{current.description}</p></div><button className="button secondary small" onClick={() => setRevision(r => r + 1)}>Atualizar</button></div>
      {catalogError && <Status loading={false} error={catalogError} />}
      {period.data?.closed && <div className="closed-day-banner" role="status"><div><strong>Dia {date(period.data.date)} fechado</strong><span>Novos lançamentos estão bloqueados. Consulte o snapshot preservado no fechamento.</span></div><button className="button secondary small" onClick={() => navigate('result')}>Ver fechamentos</button></div>}
      <ClosedDayContext.Provider value={!!period.data?.closed}>
      {page === 'dashboard' && <Dashboard revision={revision} products={products.data || []} navigate={navigate} />}
      {(page === 'customers' || page === 'suppliers') && <PartnersPage key={page} customer={page === 'customers'} partners={(page === 'customers' ? customers.data : suppliers.data) || []} loading={page === 'customers' ? customers.loading : suppliers.loading} revision={revision} saved={saved} />}
      {page === 'products' && <ProductsPage products={products.data || []} loading={products.loading} saved={saved} />}
      {(page === 'purchases' || page === 'sales') && <TradesPage key={page} sale={page === 'sales'} parties={(page === 'sales' ? customers.data : suppliers.data) || []} products={products.data || []} revision={revision} saved={saved} />}
      {page === 'stock' && <StockPage products={products.data || []} revision={revision} saved={saved} />}
      {page === 'finance' && <FinancePage revision={revision} saved={saved} />}
      {page === 'expenses' && <ExpensesPage revision={revision} saved={saved} />}
      {page === 'result' && <ResultPage revision={revision} saved={saved} />}
      </ClosedDayContext.Provider>
    </main><footer className="app-footer"><span>maré <span>·</span> Gestão do camarão</span><span>Valores em reais · Pesos em quilos</span></footer></div>{notice && <div role="status" className="toast"><Icon name="check" />{notice}<button className="icon-button" aria-label="Dispensar aviso" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
  </div>;
}
