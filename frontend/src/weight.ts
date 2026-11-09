import type { Num } from './types';

const kilograms = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const grams = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function kg(value: Num = 0): string {
  const quantity = Number(value);
  return quantity !== 0 && Math.abs(quantity) < 0.01
    ? grams.format(quantity * 1000) + ' g'
    : kilograms.format(quantity) + ' kg';
}
