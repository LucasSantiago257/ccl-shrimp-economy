import { useContext, useState } from 'react';
import { CorrectionAction } from './Corrections';
import { Pager, RemoteSelect, SearchBox, usePagedResource } from './Pagination';
import { useReplacementForm } from './postingFlow';
import type { Num, Product } from './types';
import { ClosedDayContext, Empty, Field, Icon, Modal, MutationForm, Panel, Status, date, kg, money } from './ui';

const path = '/api/v1/processing';
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

interface Batch {
  id: number;
  source_name: string;
  target_name: string;
  input_kg: Num;
  output_kg: Num;
  transferred_cost: Num;
  occurred_at: string;
  correction_id?: number;
}

export function ProcessingPage({ revision, saved }: { revision: number; saved: () => void }) {
  const list = usePagedResource<Batch>(path, revision);
  const [open, setOpen] = useState(false);
  const close = useReplacementForm('PROCESS', setOpen);
  const closedDay = useContext(ClosedDayContext);
  return <>
    <div className="toolbar">
      <SearchBox label="Buscar beneficiamentos" value={list.query} change={list.setQuery} placeholder="Buscar por produto de origem ou resultado" />
      <button className="button primary" disabled={closedDay} onClick={() => setOpen(true)}><Icon name="plus" />Novo beneficiamento</button>
    </div>
    <Status loading={list.loading} error={list.error} />
    <Panel title="Histórico de beneficiamento">
      {!list.items.length ? <Empty text="Nenhum beneficiamento encontrado." /> : <div className="table-wrap"><table>
        <thead><tr><th>Registro</th><th>Origem consumida</th><th>Produto obtido</th><th>Rendimento</th><th>Custo transferido</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>{list.items.map(batch => <tr key={batch.id}>
          <td><strong>#{batch.id}</strong><small>{date(batch.occurred_at)}</small></td>
          <td>{batch.source_name}<small>{kg(batch.input_kg)}</small></td>
          <td>{batch.target_name}<small>{kg(batch.output_kg)}</small></td>
          <td>{percent.format(Number(batch.output_kg) / Number(batch.input_kg))}<small>{kg(Number(batch.input_kg) - Number(batch.output_kg))} de diferença</small></td>
          <td>{money(batch.transferred_cost)}</td>
          <td>{batch.correction_id ? 'Cancelado' : 'Confirmado'}</td>
          <td><CorrectionAction kind="PROCESS" id={batch.id} cancelled={!!batch.correction_id} /></td>
        </tr>)}</tbody>
      </table></div>}
      <Pager label="Beneficiamentos" data={list.data} loading={list.loading} changePage={list.setPage} changeSize={list.setSize} />
    </Panel>
    {open && <Modal title="Novo beneficiamento" close={close}>
      <ProcessingForm revision={revision} done={() => { setOpen(false); saved(); }} />
    </Modal>}
  </>;
}

function ProcessingForm({ revision, done }: { revision: number; done: () => void }) {
  const [source, setSource] = useState<Product>();
  const [target, setTarget] = useState<Product>();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const consumed = Number(input);
  const obtained = Number(output);
  const distinct = !!source && !!target && source.id !== target.id;
  const valid = distinct && consumed > 0 && consumed <= Number(source?.quantity) && obtained > 0 && obtained <= consumed;
  return <MutationForm path={path} button="Confirmar beneficiamento" valid={valid} done={done}
    build={() => ({ sourceProductId: source?.id, targetProductId: target?.id, inputKg: input, outputKg: output })}>
    <RemoteSelect<Product> path="/api/v1/products?activeOnly=true&inStockOnly=true" label="Produto de origem"
      revision={revision} value={source ? String(source.id) : ''} onSelect={setSource}
      optionLabel={product => product.name + ' · ' + kg(product.quantity)} />
    <RemoteSelect<Product> path="/api/v1/products?activeOnly=true" label="Produto resultante"
      revision={revision} value={target ? String(target.id) : ''} onSelect={setTarget} />
    <p className="subtle">Cadastre o produto resultante em Produtos antes do primeiro beneficiamento. Exemplo: Camarão sem cabeça.</p>
    <div className="form-grid">
      <Field label="Peso consumido (kg)"><input type="number" min="0.001" step="0.001" max={source?.quantity} required value={input} onChange={e => setInput(e.target.value)} /></Field>
      <Field label="Peso obtido (kg)"><input type="number" min="0.001" step="0.001" max={input || undefined} required value={output} onChange={e => setOutput(e.target.value)} /></Field>
    </div>
    {source && target && !distinct && <p className="alert error">Escolha produtos diferentes para origem e resultado.</p>}
    {consumed > 0 && obtained > consumed && <p className="alert error">O peso obtido não pode exceder o peso consumido.</p>}
    {valid && <p className="alert info" role="status">Rendimento de {percent.format(obtained / consumed)} · {kg(consumed - obtained)} de diferença de peso.</p>}
    <p className="subtle">O custo total da matéria-prima consumida passa para o produto resultante. A diferença de peso faz parte do rendimento.</p>
  </MutationForm>;
}
