export type VariableMeasureValueType = 'PRICE' | 'WEIGHT';
export type InternalCheckAlgorithm = 'MOD10' | 'LUHN';

export interface VariableMeasureLayout {
  enabled?: boolean;
  prefix: string;
  pluStart: number;
  pluLength: number;
  valueStart: number;
  valueLength: number;
  valueType: VariableMeasureValueType;
  scaleId: string;
  storeCodeStart?: number;
  storeCodeLength?: number;
  internalCheckDigitIndex?: number;
  internalCheckAlgorithm?: InternalCheckAlgorithm;
  toleranceMinor?: number;
  toleranceGrams?: number;
}

export interface VariableMeasureProduct {
  _id?: unknown;
  name: string;
  pluCode?: string;
  pricePerKgMinor?: number;
}

export interface DecodedVariableMeasureLabel {
  barcode: string;
  pluCode: string;
  encodedValue: number;
  valueType: VariableMeasureValueType;
  storeCode?: string;
  scaleId: string;
}

export interface VerifiedVariableMeasureLabel extends DecodedVariableMeasureLabel {
  product: VariableMeasureProduct;
  priceMinor: number;
  weightGrams: number;
  unitPriceAtScan: number;
}

function ean13CheckDigit(data: string): number {
  const weightedSum = [...data].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (weightedSum % 10)) % 10;
}

function internalCheckDigit(digits: string, index: number, algorithm: InternalCheckAlgorithm): number {
  const payload = [...digits].filter((_, i) => i !== index && i !== 12).map(Number);
  if (algorithm === 'MOD10') return payload.reduce((sum, digit) => sum + digit, 0) % 10;
  let sum = 0;
  let double = true;
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    let digit = payload[i] * (double ? 2 : 1);
    if (digit > 9) digit -= 9;
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

function assertSlice(index: number, length: number, name: string): void {
  if (!Number.isInteger(index) || !Number.isInteger(length) || index < 0 || length < 1 || index + length > 12) {
    throw new Error(`Invalid variable measure barcode ${name} position.`);
  }
}

export function decodeVariableMeasureBarcode(barcodeInput: string, layout: VariableMeasureLayout): DecodedVariableMeasureLabel {
  const barcode = String(barcodeInput || '').trim();
  if (!layout.enabled) throw new Error('Variable measure barcode scanning is not enabled for this store.');
  if (!/^\d{13}$/.test(barcode)) throw new Error('Variable measure labels must be 13 digit EAN-13 barcodes.');
  if (!layout.prefix || !barcode.startsWith(layout.prefix)) throw new Error('Barcode does not match this store scale prefix.');
  if (!layout.scaleId) throw new Error('A scale ID must be configured for this store.');
  assertSlice(layout.pluStart, layout.pluLength, 'PLU');
  assertSlice(layout.valueStart, layout.valueLength, 'value');
  if (layout.pluStart < layout.valueStart + layout.valueLength && layout.valueStart < layout.pluStart + layout.pluLength) {
    throw new Error('Variable measure PLU and value fields cannot overlap.');
  }
  if (layout.storeCodeStart !== undefined && layout.storeCodeLength !== undefined) assertSlice(layout.storeCodeStart, layout.storeCodeLength, 'store code');
  const finalCheck = Number(barcode[12]);
  if (ean13CheckDigit(barcode.slice(0, 12)) !== finalCheck) throw new Error('EAN-13 check digit is invalid.');
  if (layout.internalCheckDigitIndex !== undefined) {
    const index = layout.internalCheckDigitIndex;
    if (!Number.isInteger(index) || index < 0 || index > 11) throw new Error('Invalid internal check digit position.');
    const expected = internalCheckDigit(barcode, index, layout.internalCheckAlgorithm || 'MOD10');
    if (Number(barcode[index]) !== expected) throw new Error('Scale payload check digit is invalid.');
  }
  const pluCode = barcode.slice(layout.pluStart, layout.pluStart + layout.pluLength);
  const encodedValue = Number(barcode.slice(layout.valueStart, layout.valueStart + layout.valueLength));
  if (!pluCode || !Number.isSafeInteger(encodedValue) || encodedValue <= 0) throw new Error('PLU or encoded value is invalid.');
  const storeCode = layout.storeCodeStart !== undefined && layout.storeCodeLength !== undefined
    ? barcode.slice(layout.storeCodeStart, layout.storeCodeStart + layout.storeCodeLength)
    : undefined;
  return { barcode, pluCode, encodedValue, valueType: layout.valueType, storeCode, scaleId: layout.scaleId };
}

export function verifyVariableMeasureLabel(
  barcode: string,
  layout: VariableMeasureLayout,
  storeCode: string,
  product: VariableMeasureProduct | null | undefined,
): VerifiedVariableMeasureLabel {
  const decoded = decodeVariableMeasureBarcode(barcode, layout);
  if (decoded.storeCode && decoded.storeCode !== String(storeCode)) throw new Error('This label belongs to another store scale.');
  if (!product || !product.pricePerKgMinor || product.pricePerKgMinor <= 0 || product.pluCode !== decoded.pluCode) {
    throw new Error('No active weighted product matches this scale PLU.');
  }
  let priceMinor: number;
  let weightGrams: number;
  if (decoded.valueType === 'PRICE') {
    priceMinor = decoded.encodedValue;
    weightGrams = Math.round(priceMinor * 1000 / product.pricePerKgMinor);
    const calculated = Math.round(weightGrams * product.pricePerKgMinor / 1000);
    if (Math.abs(calculated - priceMinor) > (layout.toleranceMinor ?? 2)) throw new Error('Printed label price does not match catalogue price per kg.');
  } else {
    weightGrams = decoded.encodedValue;
    priceMinor = Math.round(weightGrams * product.pricePerKgMinor / 1000);
    if (Math.abs(weightGrams - decoded.encodedValue) > (layout.toleranceGrams ?? 5)) throw new Error('Printed label weight is outside the configured tolerance.');
  }
  return { ...decoded, product, priceMinor, weightGrams, unitPriceAtScan: product.pricePerKgMinor };
}
