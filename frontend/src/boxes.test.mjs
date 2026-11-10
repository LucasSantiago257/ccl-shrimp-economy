import assert from 'node:assert/strict';
import {test} from 'node:test';
import {quantityKg,boxEquivalent} from './boxes.ts';
test('boxes convert exactly to kilograms, including partial boxes and grams',()=>{
 assert.equal(quantityKg({quantity:'2',unit:'BOX',boxWeight:'15'}),'30.000');
 assert.equal(quantityKg({quantity:'0.5',unit:'BOX',boxWeight:'12.5'}),'6.250');
 assert.equal(quantityKg({quantity:'0.001',unit:'BOX',boxWeight:'1'}),'0.001');
 assert.equal(quantityKg({quantity:'12.345',unit:'KG',boxWeight:''}),'12.345');
});
test('conversion never silently rounds stock or overflows accepted weights',()=>{
 for(const draft of [{quantity:'0.001',unit:'BOX',boxWeight:'0.001'},{quantity:'1.234',unit:'BOX',boxWeight:'1.234'},{quantity:'-1',unit:'BOX',boxWeight:'15'},{quantity:'1',unit:'BOX',boxWeight:'0'},{quantity:'1',unit:'BOX',boxWeight:'1000000'},{quantity:'9999999999',unit:'BOX',boxWeight:'999999'},{quantity:'1e3',unit:'KG',boxWeight:'15'}])assert.equal(quantityKg(draft),'');
});
test('stock equivalents show full boxes and loose kilograms without hiding leftovers',()=>{
 assert.equal(boxEquivalent('35','15'),'2 caixas + 5,0 kg');
 assert.equal(boxEquivalent('15','15'),'1 caixa');
 assert.equal(boxEquivalent('0','15'),'0 caixas');
 assert.equal(boxEquivalent('15.001','15'),'1 caixa + 1 g');
});
