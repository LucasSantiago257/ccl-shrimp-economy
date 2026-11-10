import type { Num } from './types';
import { kg } from './weight.ts';

export interface QuantityDraft { quantity: string; unit: 'KG' | 'BOX'; boxWeight: string }
const decimal = (value: string): bigint | null => {
  if (!/^\d+(?:\.\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
};
// Keep the database's gram precision: reject excess precision instead of rounding stock.
export function quantityKg(draft: QuantityDraft): string {
  const quantity = decimal(draft.quantity);
  const weight = draft.unit === 'BOX' ? decimal(draft.boxWeight) : 1000n;
  if (quantity === null || weight === null || quantity <= 0n || weight <= 0n || (draft.unit === 'BOX' && weight > 999999999n)) return '';
  const product = quantity * weight;
  if (product % 1000n !== 0n) return '';
  const grams = product / 1000n;
  if (grams > 9999999999999n) return '';
  return `${grams / 1000n}.${String(grams % 1000n).padStart(3, '0')}`;
}
export function boxEquivalent(quantity: Num, weight: Num): string {
  const grams = Math.round(Number(quantity) * 1000), boxGrams = Math.round(Number(weight) * 1000);
  if (!Number.isFinite(grams) || !Number.isFinite(boxGrams) || boxGrams <= 0) return '';
  const full = Math.floor(Math.abs(grams) / boxGrams), remainder = Math.abs(grams) % boxGrams;
  const sign = grams < 0 ? '−' : '';
  return sign + `${full.toLocaleString('pt-BR')} ${full === 1 ? 'caixa' : 'caixas'}` + (remainder ? ' + ' + kg(remainder / 1000) : '');
}
