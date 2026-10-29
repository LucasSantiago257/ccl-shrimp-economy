import { cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import * as api from './api';
import type { Num } from './types';

export const money = (value: Num = 0) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
export const kg = (value: Num = 0) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(value)) + ' kg';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', dateStyle: 'short' }).format(new Date(value.includes('T') ? value + (value.endsWith('Z') ? '' : 'Z') : value + 'T12:00:00Z'));
export const methods = { CASH: 'Dinheiro', PIX: 'Pix', TRANSFER: 'Transferência', CARD: 'Cartão' };
export const ClosedDayContext = createContext(false);
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    box: 'M21 8l-9 5-9-5 M12 22V13 M3 7l9-5 9 5v10l-9 5-9-5z M7.5 4.5l9 5',
    purchase: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
    sale: 'M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5',
    wallet: 'M20 8V5H5a2 2 0 0 1 0-4h14 M3 3v16a2 2 0 0 0 2 2h16V8H5 M21 12h-5v5h5',
    report: 'M4 3v18h17 M8 16v-5 M13 16V7 M18 16V4',
    plus: 'M12 5v14 M5 12h14', close: 'M6 6l12 12 M18 6L6 18',
    wave: 'M2 8c4-6 6 6 10 0s6 6 10 0 M2 15c4-6 6 6 10 0s6 6 10 0',
    arrow: 'M5 12h14 M13 6l6 6-6 6', logout: 'M9 4H4v16h5 M10 12h11 M17 8l4 4-4 4',
    search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    menu: 'M3 6h18 M3 12h18 M3 18h18', check: 'M5 12l4 4L19 6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.box} /></svg>;
}
export function useResource<T>(path: string, revision: number) {
  const [data, setData] = useState<T>(); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true; setLoading(true); setError(''); api.get<T>(path).then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [path, revision]);
  return { data, error, loading };
}
export function Status({ loading, error }: { loading: boolean; error: string }) {
  return error ? <p role="alert" className="alert error">{error}</p> : loading ? <p role="status" className="loading">Carregando informações…</p> : null;
}
export function Empty({ text = 'Nenhum lançamento por aqui ainda.' }: { text?: string }) {
  return <div className="empty"><span className="empty-icon"><Icon name="box" size={27} /></span><strong>{text}</strong><span>Os registros aparecerão aqui assim que forem cadastrados.</span></div>;
}
export function Panel({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2>{hint && <p>{hint}</p>}</div>{action}</div>{children}</section>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const id = useId();
  const control = isValidElement<{ id?: string; 'aria-describedby'?: string }>(children)
    ? cloneElement(children, { id, 'aria-describedby': hint ? id + '-hint' : undefined }) : children;
  return <div className="field"><label htmlFor={id}>{label}</label>{control}{hint && <small id={id + '-hint'}>{hint}</small>}</div>;
}
export function MethodField() {
  return <Field label="Forma de pagamento"><select name="method" defaultValue="PIX">{Object.entries(methods).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>;
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="modal" aria-label={title} onCancel={close}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Fechar"><Icon name="close" /></button></div>{children}</dialog>;
}
export function MutationForm({ path, method = 'POST', build, done, children, button, valid = true }: {
  path: string; method?: string; build: (data: FormData) => unknown; done: () => void; children: ReactNode; button: string; valid?: boolean;
}) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const pending = useRef(false);
  const request = useRef({ fingerprint: '', key: '' });
  const closedDay = useContext(ClosedDayContext);
  const blocked = closedDay && method === 'POST' && ['/api/v1/sales', '/api/v1/purchases', '/api/v1/settlements', '/api/v1/expenses', '/api/v1/stock/losses'].includes(path);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || blocked) return; pending.current = true; setBusy(true); setError('');
    try {
      const body = build(new FormData(event.currentTarget)); const fingerprint = path + JSON.stringify(body);
      if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
      await api.mutate(path, body, request.current.key, method); done();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão. Tente novamente.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="form">{children}{blocked && <p className="alert info" role="status">O dia está fechado. Novos lançamentos estão bloqueados até o próximo dia aberto.</p>}{error && <p className="alert error" role="alert">{error}</p>}<div className="form-footer"><span className="subtle">Os valores serão conferidos ao salvar.</span><button className="button primary" disabled={busy || !valid || blocked}>{busy ? 'Salvando…' : button}<Icon name="arrow" size={17} /></button></div></form>;
}
export const text = (data: FormData, key: string) => String(data.get(key) || '').trim();
