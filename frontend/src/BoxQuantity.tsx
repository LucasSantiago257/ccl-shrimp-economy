import type { Product } from './types';
import { Field, MutationForm, kg } from './ui';
import { quantityKg } from './boxes';
import type { QuantityDraft } from './boxes';

export function QuantityFields({ value, change, label = 'Quantidade', hint }: {
  value: QuantityDraft; change: (patch: Partial<QuantityDraft>) => void; label?: string; hint?: string;
}) {
  const converted = quantityKg(value);
  return <div className="quantity-entry">
    <div className="form-grid"><Field label="Informar quantidade em"><select value={value.unit} onChange={e => change({ unit: e.target.value as QuantityDraft['unit'], quantity: '' })}><option value="KG">Quilos</option><option value="BOX">Caixas</option></select></Field>
      <Field label={label + (value.unit === 'BOX' ? ' (caixas)' : ' (kg)')} hint={hint}><input type="number" required min="0.001" max="9999999999.999" step="0.001" value={value.quantity} onChange={e => change({ quantity: e.target.value })} /></Field></div>
    {value.unit === 'BOX' && <><Field label="Peso de cada caixa (kg)" hint="Vale apenas para este lançamento. O peso padrão pode ser alterado no Estoque ou em Produtos."><input type="number" required min="0.001" max="999999.999" step="0.001" value={value.boxWeight} onChange={e => change({ boxWeight: e.target.value })} /></Field>
      {converted ? <p className="alert info" role="status">{Number(value.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} caixa(s) × {kg(value.boxWeight)} = <strong>{kg(converted)}</strong></p> : value.quantity && value.boxWeight && <p className="alert error" role="alert">Informe valores positivos cuja conversão em quilos tenha no máximo três casas decimais, dentro do limite permitido.</p>}</>}
  </div>;
}

export function BoxWeightForm({ product, done }: { product: Product; done: () => void }) {
  return <MutationForm path={`/api/v1/products/${product.id}/box-weight`} method="PUT" button="Salvar peso da caixa" done={done} build={d => ({ boxWeightKg: String(d.get('weight')) })}>
    <p>{product.name}: defina o peso sugerido para novas compras, vendas e a visualização do estoque. Os quilos em estoque e os lançamentos anteriores continuam preservados.</p>
    <Field label="Peso padrão da caixa (kg)"><input name="weight" type="number" min="0.001" max="999999.999" step="0.001" required defaultValue={Number(product.box_weight_kg || 15)} /></Field>
  </MutationForm>;
}
