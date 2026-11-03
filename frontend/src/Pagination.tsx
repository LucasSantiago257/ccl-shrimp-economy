import { useEffect, useState } from 'react';
import type { Num, Page } from './types';
import { Field, Icon, Status, kg, money, useResource } from './ui';

export function usePagedResource<T>(path: string, revision: number, initialSize = 20) {
  const [query, setQuery] = useState(''); const [search, setSearch] = useState(''); const [size, setSize] = useState(initialSize);
  const key = path + '|' + search + '|' + size;
  const [position, setPosition] = useState({ key, page: 1 });
  const page = position.key === key ? position.page : 1;
  useEffect(() => { const timer = setTimeout(() => setSearch(query), 250); return () => clearTimeout(timer); }, [query]);
  const url = path + (path.includes('?') ? '&' : '?') + new URLSearchParams({ page: String(page), size: String(size), q: search });
  const result = useResource<Page<T>>(url, revision);
  const setPage = (next: number) => setPosition({ key, page: next });
  useEffect(() => { if (result.data && page > Math.max(1, result.data.totalPages)) setPosition({ key, page: Math.max(1, result.data.totalPages) }); }, [result.data, page, key]);
  const searching = query !== search;
  return { ...result, data: searching ? undefined : result.data, loading: result.loading || searching,
    items: searching ? [] : result.data?.items || [], page, size, query, setQuery, setPage, setSize };
}

export function SearchBox({ value, change, label, placeholder = 'Buscar nos registros' }: { value: string; change: (value: string) => void; label: string; placeholder?: string }) {
  return <div className="search"><Icon name="search" /><input type="search" maxLength={200} aria-label={label} placeholder={placeholder} value={value} onChange={e => change(e.target.value)} /></div>;
}

export function Pager({ data, loading, label, changePage, changeSize, compact = false }: {
  data?: Pick<Page<unknown>, 'page' | 'size' | 'total' | 'totalPages' | 'hasNext' | 'hasPrevious'>;
  loading?: boolean; label: string; changePage: (page: number) => void; changeSize?: (size: number) => void; compact?: boolean;
}) {
  const page = data?.page || 1, pages = Math.max(1, data?.totalPages || 0), total = data?.total || 0;
  const size = data?.size || 20, first = total ? (page - 1) * size + 1 : 0, last = Math.min(page * size, total);
  return <nav aria-label={'Paginação de ' + label} className={'pagination ' + (compact ? 'compact' : '')}>
    {!compact && <span className="pagination-total" aria-live="polite">{loading ? 'Carregando…' : `${first}–${last} de ${total} registros`}</span>}
    {changeSize && !compact && <label className="pagination-size">Por página<select aria-label={'Registros por página de ' + label} value={size} onChange={e => changeSize(Number(e.target.value))}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
    <div className="pagination-buttons">{!compact && <button type="button" className="button secondary small" disabled={loading || !data?.hasPrevious} onClick={() => changePage(1)}>Primeira</button>}
    <button type="button" className="button secondary small" disabled={loading || !data?.hasPrevious} onClick={() => changePage(page - 1)}>Anterior</button>
    <span aria-live="polite">{page} / {pages}</span>
    <button type="button" className="button secondary small" disabled={loading || !data?.hasNext} onClick={() => changePage(page + 1)}>Próxima</button>
    {!compact && <button type="button" className="button secondary small" disabled={loading || !data?.hasNext} onClick={() => changePage(pages)}>Última</button>}</div>
  </nav>;
}

export function RemoteSelect<T extends { id: number; name: string }>({ path, label, name, value, onSelect, required = true, autoFirst = false, revision = 0, optionLabel }: {
  path: string; label: string; name?: string; value: string; onSelect: (item: T | undefined) => void; required?: boolean; autoFirst?: boolean; revision?: number; optionLabel?: (item: T) => string;
}) {
  const list = usePagedResource<T>(path, revision);
  const [remembered, setRemembered] = useState<T>();
  function choose(item: T | undefined) { setRemembered(item); onSelect(item); }
  useEffect(() => { if (autoFirst && !value && !list.loading && !list.query && list.items.length) choose(list.items[0]); });
  const items = [...list.items];
  if (remembered && String(remembered.id) === value && !items.some(i => String(i.id) === value)) items.unshift(remembered);
  return <div className="remote-select"><Field label={label}><select name={name} required={required} value={value} disabled={list.loading && !value} onChange={e => choose(items.find(i => String(i.id) === e.target.value))}>
    <option value="" disabled={required}>{required ? 'Selecione uma opção' : 'Não informado'}</option>{items.map(item => <option key={item.id} value={item.id}>{optionLabel ? optionLabel(item) : item.name}</option>)}
  </select></Field><input type="search" aria-label={'Buscar ' + label} placeholder={'Buscar ' + label.toLowerCase()} value={list.query} maxLength={200} onChange={e => list.setQuery(e.target.value)} />
    <Status loading={list.loading} error={list.error} /><Pager label={label} data={list.data} loading={list.loading} changePage={list.setPage} compact />
  </div>;
}

// Immutable snapshot records are already preserved as a whole; paginate only their rendering.
export function useArrayPage<T>(items: T[], size = 20) {
  const [page, setPage] = useState(1); const totalPages = Math.ceil(items.length / size);
  const safePage = Math.min(page, Math.max(1, totalPages));
  return { items: items.slice((safePage - 1) * size, safePage * size), setPage,
    data: { page: safePage, size, total: items.length, totalPages, hasNext: safePage < totalPages, hasPrevious: safePage > 1 } };
}

export function StockPositionTable({ rows, label }: { rows: { id: number; name: string; quantity: Num; stock_value: Num }[]; label: string }) {
  const list = useArrayPage(rows);
  const table = (items: typeof rows) => <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor de custo</th></tr></thead><tbody>{items.map(p => <tr key={p.id}><td>{p.name}</td><td>{kg(p.quantity)}</td><td>{money(p.stock_value)}</td></tr>)}</tbody></table></div>;
  return <><div className="screen-only">{table(list.items)}<Pager label={label} data={list.data} changePage={list.setPage} /></div><div className="print-only">{table(rows)}</div></>;
}
