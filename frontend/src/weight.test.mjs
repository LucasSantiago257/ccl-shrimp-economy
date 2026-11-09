import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kg} from './weight.ts';

test('small balances and reversals remain visible in grams',()=>{
  assert.equal(kg('0.001'),'1 g');assert.equal(kg('-0.001'),'-1 g');
  assert.equal(kg('0.009'),'9 g');assert.equal(kg('-0.009'),'-9 g');
});
test('zero, kilograms and approved decimal precision are preserved',()=>{
  assert.equal(kg(0),'0,0 kg');assert.equal(kg(35),'35,0 kg');
  assert.equal(kg('0.01'),'0,01 kg');assert.equal(kg('1.25'),'1,25 kg');
});
