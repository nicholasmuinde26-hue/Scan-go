import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeVariableMeasureBarcode, verifyVariableMeasureLabel, VariableMeasureLayout } from './variableMeasureBarcode.js';

const layout: VariableMeasureLayout = {
  enabled: true, prefix: '20', pluStart: 4, pluLength: 3, valueStart: 7, valueLength: 4,
  valueType: 'PRICE', scaleId: 'SCALE-A', storeCodeStart: 2, storeCodeLength: 2,
  internalCheckDigitIndex: 11, internalCheckAlgorithm: 'MOD10', toleranceMinor: 1,
};
const product = { name: 'Tomatoes', pluCode: '123', pricePerKgMinor: 10000 };
function makeBarcode(value: string, store = '01'): string {
  const data = `20${store}123${value}`;
  const internal = [...data].reduce((sum, digit) => sum + Number(digit), 0) % 10;
  const firstTwelve = `${data}${internal}`;
  const ean = [...firstTwelve].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${firstTwelve}${(10 - ean % 10) % 10}`;
}

test('decodes a valid price label and checks the EAN and scale payload digits', () => {
  const result = verifyVariableMeasureLabel(makeBarcode('0120'), layout, '01', product);
  assert.equal(result.pluCode, '123');
  assert.equal(result.priceMinor, 120);
  assert.equal(result.weightGrams, 12);
  assert.equal(result.scaleId, 'SCALE-A');
});

test('decodes a weight label and recomputes its catalogue price', () => {
  const result = verifyVariableMeasureLabel(makeBarcode('0120'), { ...layout, valueType: 'WEIGHT' }, '01', product);
  assert.equal(result.weightGrams, 120);
  assert.equal(result.priceMinor, 1200);
});

test('rejects a bad EAN-13 check digit', () => {
  const valid = makeBarcode('0120');
  assert.throws(() => decodeVariableMeasureBarcode(`${valid.slice(0, 12)}${(Number(valid[12]) + 1) % 10}`, layout), /EAN-13/);
});

test('rejects a bad scale payload check digit', () => {
  const valid = makeBarcode('0120');
  const wrongInner = `${valid.slice(0, 11)}${(Number(valid[11]) + 1) % 10}`;
  const eanSum = [...wrongInner].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  const wrongBothAdjusted = `${wrongInner}${(10 - eanSum % 10) % 10}`;
  assert.throws(() => decodeVariableMeasureBarcode(wrongBothAdjusted, layout), /payload check digit/);
});

test('rejects a wrong scale prefix', () => {
  assert.throws(() => decodeVariableMeasureBarcode(`21${makeBarcode('0120').slice(2)}`, layout), /prefix/);
});

test('rejects a printed price that does not match the catalogue price per kg', () => {
  assert.throws(() => verifyVariableMeasureLabel(makeBarcode('0128'), layout, '01', product), /does not match/);
});

test('rejects a label encoded for another store scale', () => {
  assert.throws(() => verifyVariableMeasureLabel(makeBarcode('0120', '02'), layout, '01', product), /another store scale/);
});
