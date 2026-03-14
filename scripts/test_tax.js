/**
 * Test: Tax Calculation Formulas
 * Tests calcTax, calcLTCG, getStdDeduction, calcIRMAA, calcSSTaxableAmount
 * All values verified against 2025 IRS brackets / Publication 915
 */
const { assert, test, suite, summarize, extractFinancialFunctions } = require('./test-helpers');

const fin = extractFinancialFunctions();
const { calcTax, calcLTCG, getStdDeduction, calcIRMAA, calcSSTaxableAmount,
        TAX_BRACKETS_MFJ, TAX_BRACKETS_SINGLE,
        LTCG_BRACKETS_MFJ, LTCG_BRACKETS_SINGLE,
        RMD_TABLE, SS_AGE_FACTOR } = fin;

/* ==== calcTax — Federal ordinary income tax ==== */
suite('calcTax — 2025 MFJ brackets');

test('zero income → zero tax', () => {
  assert.strictEqual(calcTax(0, TAX_BRACKETS_MFJ), 0);
});

test('negative income → zero tax', () => {
  assert.strictEqual(calcTax(-1000, TAX_BRACKETS_MFJ), 0);
});

test('income in 10% bracket only (MFJ)', () => {
  // 10% bracket: 0-23850 MFJ
  const tax = calcTax(20000, TAX_BRACKETS_MFJ);
  assert.strictEqual(tax, 20000 * 0.10);
});

test('income at 10% bracket boundary (MFJ)', () => {
  const tax = calcTax(23850, TAX_BRACKETS_MFJ);
  assert.strictEqual(tax, 23850 * 0.10);
});

test('income spans 10% + 12% brackets (MFJ)', () => {
  // $50,000: first 23850 at 10%, next 26150 at 12%
  const tax = calcTax(50000, TAX_BRACKETS_MFJ);
  const expected = 23850 * 0.10 + (50000 - 23850) * 0.12;
  assert.ok(Math.abs(tax - expected) < 0.01, `Expected ${expected}, got ${tax}`);
});

test('income at top of 22% bracket (MFJ = $206,700)', () => {
  const tax = calcTax(206700, TAX_BRACKETS_MFJ);
  const expected = 23850 * 0.10 + (96950 - 23850) * 0.12 + (206700 - 96950) * 0.22;
  assert.ok(Math.abs(tax - expected) < 0.01, `Expected ${expected}, got ${tax}`);
});

test('high income across all brackets (MFJ $1M)', () => {
  const tax = calcTax(1000000, TAX_BRACKETS_MFJ);
  // Should use all 7 brackets
  const expected = 23850 * 0.10 + (96950 - 23850) * 0.12 + (206700 - 96950) * 0.22
    + (394600 - 206700) * 0.24 + (501050 - 394600) * 0.32
    + (751600 - 501050) * 0.35 + (1000000 - 751600) * 0.37;
  assert.ok(Math.abs(tax - expected) < 0.01, `Expected ${expected}, got ${tax}`);
});

suite('calcTax — 2025 Single brackets');

test('income in 10% bracket (Single)', () => {
  const tax = calcTax(10000, TAX_BRACKETS_SINGLE);
  assert.strictEqual(tax, 10000 * 0.10);
});

test('income spans 10%+12% (Single)', () => {
  const tax = calcTax(30000, TAX_BRACKETS_SINGLE);
  const expected = 11925 * 0.10 + (30000 - 11925) * 0.12;
  assert.ok(Math.abs(tax - expected) < 0.01);
});

/* ==== calcLTCG — Long-term capital gains tax ==== */
suite('calcLTCG — 2025 LTCG rates');

test('LTCG fully in 0% bracket (MFJ, low ordinary income)', () => {
  // MFJ 0% up to $96,700 total. If ordinary=50000, space=46700
  const tax = calcLTCG(40000, 50000, 'mfj');
  assert.strictEqual(tax, 0);
});

test('LTCG straddles 0%/15% brackets (MFJ)', () => {
  // Ordinary=90000, space in 0% = 96700-90000=6700
  // 20000 LTCG: 6700 at 0%, 13300 at 15%
  const tax = calcLTCG(20000, 90000, 'mfj');
  const expected = 6700 * 0 + 13300 * 0.15;
  assert.ok(Math.abs(tax - expected) < 0.01, `Expected ${expected}, got ${tax}`);
});

test('LTCG fully in 15% bracket (MFJ)', () => {
  // Ordinary=100000 (past 0% zone), LTCG=50000
  const tax = calcLTCG(50000, 100000, 'mfj');
  assert.strictEqual(tax, 50000 * 0.15);
});

test('LTCG into 20% bracket (MFJ)', () => {
  // Ordinary=550000, 0% bracket already passed, 15% limit at 600050
  // Space in 15% = 600050-550000=50050
  // LTCG=100000: 50050 at 15%, 49950 at 20%
  const tax = calcLTCG(100000, 550000, 'mfj');
  const expected = 50050 * 0.15 + 49950 * 0.20;
  assert.ok(Math.abs(tax - expected) < 0.01, `Expected ${expected}, got ${tax}`);
});

test('zero LTCG → zero tax', () => {
  assert.strictEqual(calcLTCG(0, 50000, 'mfj'), 0);
});

test('LTCG Single 0% bracket', () => {
  const tax = calcLTCG(30000, 10000, 'single');
  // Space in 0% = 48350-10000=38350 > 30000
  assert.strictEqual(tax, 0);
});

/* ==== getStdDeduction ==== */
suite('getStdDeduction — 2025 Standard Deduction');

test('MFJ, both under 65', () => {
  const ded = getStdDeduction('mfj', 50, 48, true, 100000);
  assert.strictEqual(ded, 31500);
});

test('Single, under 65', () => {
  const ded = getStdDeduction('single', 50, 0, false, 50000);
  assert.strictEqual(ded, 15750);
});

test('MFJ, primary 65+, spouse under 65, MAGI below threshold', () => {
  // base=31500 + extra(1600) + seniorDed(6000) for primary only
  const ded = getStdDeduction('mfj', 66, 60, true, 100000);
  assert.strictEqual(ded, 31500 + 1600 + 6000);
});

test('MFJ, both 65+, MAGI below threshold', () => {
  const ded = getStdDeduction('mfj', 68, 66, true, 100000);
  // base + 2*(extra+seniorDed)
  assert.strictEqual(ded, 31500 + 2 * (1600 + 6000));
});

test('MFJ, both 65+, MAGI at threshold = no phaseout', () => {
  const ded = getStdDeduction('mfj', 68, 66, true, 150000);
  assert.strictEqual(ded, 31500 + 2 * (1600 + 6000));
});

test('MFJ, both 65+, MAGI above threshold = phaseout', () => {
  // MAGI=200000, threshold=150000, excess=50000
  // phaseout per person = min(6000, 50000*0.06) = min(6000,3000) = 3000
  // seniorDed per person = 6000-3000 = 3000
  const ded = getStdDeduction('mfj', 68, 66, true, 200000);
  assert.strictEqual(ded, 31500 + 2 * (1600 + 3000));
});

test('MFJ, both 65+, MAGI way above threshold = full phaseout', () => {
  // MAGI=350000, excess=200000, phaseout=min(6000,12000)=6000
  // seniorDed = 0
  const ded = getStdDeduction('mfj', 70, 68, true, 350000);
  assert.strictEqual(ded, 31500 + 2 * (1600 + 0));
});

test('Single, 65+, MAGI below threshold', () => {
  const ded = getStdDeduction('single', 67, 0, false, 50000);
  // 15750 + 2000 + 6000
  assert.strictEqual(ded, 15750 + 2000 + 6000);
});

test('Single, 65+, MAGI above threshold', () => {
  // threshold=75000, MAGI=100000, excess=25000, phaseout=min(6000,1500)=1500
  const ded = getStdDeduction('single', 67, 0, false, 100000);
  assert.strictEqual(ded, 15750 + 2000 + (6000 - 1500));
});

/* ==== calcIRMAA ==== */
suite('calcIRMAA — Medicare IRMAA surcharges');

test('MAGI below threshold → no surcharge (MFJ)', () => {
  assert.strictEqual(calcIRMAA(200000, 'mfj', 2), 0);
});

test('MAGI in first surcharge tier (MFJ)', () => {
  // 212001-266000: partB=74, partD=13.70
  const surcharge = calcIRMAA(250000, 'mfj', 2);
  assert.strictEqual(surcharge, (74.00 + 13.70) * 12 * 2);
});

test('MAGI in third tier (MFJ)', () => {
  // 334001-400000: partB=295.90, partD=57
  const surcharge = calcIRMAA(350000, 'mfj', 1);
  assert.strictEqual(surcharge, (295.90 + 57.00) * 12 * 1);
});

test('zero people → zero surcharge', () => {
  assert.strictEqual(calcIRMAA(500000, 'mfj', 0), 0);
});

test('zero MAGI → zero surcharge', () => {
  assert.strictEqual(calcIRMAA(0, 'mfj', 2), 0);
});

test('Single below threshold', () => {
  assert.strictEqual(calcIRMAA(100000, 'single', 1), 0);
});

test('Single first tier', () => {
  const surcharge = calcIRMAA(120000, 'single', 1);
  assert.strictEqual(surcharge, (74.00 + 13.70) * 12 * 1);
});

/* ==== calcSSTaxableAmount — IRS Publication 915 ==== */
suite('calcSSTaxableAmount — Social Security taxation');

test('low combined income → 0% taxable (MFJ)', () => {
  // combined = 20000 + 30000*0.5 = 35000; base=32000 but total SS would need check
  // Actually: combined = otherIncome + ss*0.5
  // If other=10000, ss=20000: combined=10000+10000=20000 < 32000 → 0
  assert.strictEqual(calcSSTaxableAmount(20000, 10000, 'mfj'), 0);
});

test('combined income between base and upper (MFJ) — tier 1', () => {
  // other=30000, ss=20000: combined=30000+10000=40000
  // base=32000, upper=44000
  // tier1 = min(ss*0.50, 0.50*min(combined-base, upper-base))
  //       = min(10000, 0.50*min(8000,12000)) = min(10000, 4000) = 4000
  const result = calcSSTaxableAmount(20000, 30000, 'mfj');
  assert.strictEqual(result, 4000);
});

test('combined income above upper (MFJ) — tier 2', () => {
  // other=80000, ss=30000: combined=80000+15000=95000
  // base=32000, upper=44000
  // tier1 = min(15000, 0.50*min(95000-32000, 44000-32000)) = min(15000, 0.50*12000) = 6000
  // tier2 = min(30000*0.85, 6000 + 0.85*(95000-44000))
  //       = min(25500, 6000+43350) = 25500
  const result = calcSSTaxableAmount(30000, 80000, 'mfj');
  assert.strictEqual(result, 25500);
});

test('very high income → 85% of SS taxable (MFJ)', () => {
  // other=200000, ss=40000: combined=200000+20000=220000
  // tier1 = min(20000, 0.50*min(188000,12000)) = min(20000,6000) = 6000
  // tier2 = min(34000, 6000+0.85*(220000-44000)) = min(34000, 6000+149600) = 34000
  const result = calcSSTaxableAmount(40000, 200000, 'mfj');
  assert.strictEqual(result, 34000);
});

test('zero SS income → zero taxable', () => {
  assert.strictEqual(calcSSTaxableAmount(0, 100000, 'mfj'), 0);
});

test('zero other income, moderate SS (MFJ)', () => {
  // other=0, ss=40000: combined=0+20000=20000 < 32000
  assert.strictEqual(calcSSTaxableAmount(40000, 0, 'mfj'), 0);
});

test('Single filer, combined above upper', () => {
  // other=40000, ss=24000: combined=40000+12000=52000
  // Single: base=25000, upper=34000
  // tier1 = min(12000, 0.50*min(27000,9000)) = min(12000,4500) = 4500
  // tier2 = min(20400, 4500+0.85*(52000-34000)) = min(20400, 4500+15300) = 19800
  const result = calcSSTaxableAmount(24000, 40000, 'single');
  assert.strictEqual(result, 19800);
});

/* ==== RMD_TABLE ==== */
suite('RMD_TABLE — IRS Uniform Lifetime Table');

test('age 72 divisor is 27.4', () => {
  assert.strictEqual(RMD_TABLE[72], 27.4);
});
test('age 75 divisor is 24.6', () => {
  assert.strictEqual(RMD_TABLE[75], 24.6);
});
test('age 90 divisor is 12.2', () => {
  assert.strictEqual(RMD_TABLE[90], 12.2);
});
test('age 100 divisor is 6.4', () => {
  assert.strictEqual(RMD_TABLE[100], 6.4);
});
test('age 120 divisor is 2.0', () => {
  assert.strictEqual(RMD_TABLE[120], 2.0);
});
test('RMD calc: $1M at age 73', () => {
  const rmd = 1000000 / RMD_TABLE[73];
  assert.ok(Math.abs(rmd - 37735.85) < 0.1, `RMD should be ~37735.85, got ${rmd}`);
});

/* ==== SS_AGE_FACTOR ==== */
suite('SS_AGE_FACTOR — Social Security claiming factors');

test('age 62 = 70% of FRA', () => {
  assert.strictEqual(SS_AGE_FACTOR[62], 0.70);
});
test('age 67 = 100% (FRA)', () => {
  assert.strictEqual(SS_AGE_FACTOR[67], 1.00);
});
test('age 70 = 124%', () => {
  assert.strictEqual(SS_AGE_FACTOR[70], 1.24);
});
test('claiming at 62 vs 70 — 70 is 77% more', () => {
  const ratio = SS_AGE_FACTOR[70] / SS_AGE_FACTOR[62];
  assert.ok(Math.abs(ratio - 1.7714) < 0.001);
});

/* ==== percentile ==== */
suite('percentile — statistical percentile calculation');

/* percentile is now a top-level function, extracted via the financial block */
const { percentile } = extractFinancialFunctions();

test('50th percentile of sorted array', () => {
  assert.strictEqual(percentile([1, 2, 3, 4, 5], 50), 3);
});
test('0th percentile = minimum', () => {
  assert.strictEqual(percentile([10, 20, 30, 40, 50], 0), 10);
});
test('100th percentile = maximum', () => {
  assert.strictEqual(percentile([10, 20, 30, 40, 50], 100), 50);
});
test('empty array returns 0', () => {
  assert.strictEqual(percentile([], 50), 0);
});
test('interpolation between values', () => {
  const result = percentile([10, 20, 30, 40], 25);
  assert.strictEqual(result, 17.5);
});

summarize('Tax & Financial');
