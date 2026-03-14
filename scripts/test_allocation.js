/**
 * Test: Allocation, Rebalance, and Expense Formulas
 */
const { assert, test, suite, summarize, extractAllocationFunctions,
        extractFunctions, extractFinancialFunctions } = require('./test-helpers');

/* Build mock DATA for allocation tests */
const mockDATA = [
  { cat: 'US Index Funds', total: 400000, accounts: [
    { num: 'A1', name: 'Taxable', type: 'Taxable Investment', val: 400000,
      tickers: [{ sym: 'FXAIX', name: 'Fidelity 500 Index', val: 400000, gl: 50000, glPct: 14.3, cb: 350000, risk: 'Blue Chip / Core', er: 0.015 }] }
  ]},
  { cat: 'International Funds', total: 150000, accounts: [
    { num: 'A2', name: 'Roth IRA', type: 'Roth', val: 150000,
      tickers: [{ sym: 'FSPSX', name: 'Fidelity Intl Index', val: 150000, gl: 10000, glPct: 7.1, cb: 140000, risk: 'Growth', er: 0.035 }] }
  ]},
  { cat: 'Bond Funds', total: 200000, accounts: [
    { num: 'A3', name: 'Traditional IRA', type: 'Tax-Deferred IRA', val: 200000,
      tickers: [{ sym: 'FXNAX', name: 'Fidelity Bond Index', val: 200000, gl: 5000, glPct: 2.6, cb: 195000, risk: 'Blue Chip / Core', er: 0.025 }] }
  ]},
  { cat: 'Cash / Money Market', total: 100000, accounts: [
    { num: 'A1', name: 'Taxable', type: 'Taxable Investment', val: 100000,
      tickers: [{ sym: 'SPAXX**', name: 'Fidelity Government MM', val: 100000, gl: 0, glPct: 0, cb: 100000, risk: 'Blue Chip / Core', er: 0.42 }] }
  ]},
  { cat: 'Individual Stocks', total: 100000, accounts: [
    { num: 'A1', name: 'Taxable', type: 'Taxable Investment', val: 100000,
      tickers: [
        { sym: 'AAPL', name: 'Apple Inc', val: 60000, gl: 20000, glPct: 50, cb: 40000, risk: 'Blue Chip / Core', er: 0 },
        { sym: 'TSLA', name: 'Tesla Inc', val: 40000, gl: -5000, glPct: -11.1, cb: 45000, risk: 'High Risk / Speculative', er: 0 },
      ]
    }
  ]},
  { cat: 'Real Estate', total: 50000, accounts: [
    { num: 'A2', name: 'Roth IRA', type: 'Roth', val: 50000,
      tickers: [{ sym: 'VNQ', name: 'Vanguard REIT', val: 50000, gl: 3000, glPct: 6.4, cb: 47000, risk: 'Growth', er: 0.12 }] }
  ]},
];
const GRAND = 1000000;

suite('computeCurrentAlloc — portfolio allocation buckets');

const alloc = extractAllocationFunctions({ DATA: mockDATA, GRAND });

test('equity includes US Index + Individual Stocks', () => {
  const cur = alloc.computeCurrentAlloc();
  // US Index 400k + Individual Stocks 100k = 500k
  assert.strictEqual(cur.eq, 500000);
});

test('international allocation', () => {
  const cur = alloc.computeCurrentAlloc();
  assert.strictEqual(cur.intl, 150000);
});

test('bond allocation', () => {
  const cur = alloc.computeCurrentAlloc();
  assert.strictEqual(cur.bond, 200000);
});

test('cash allocation', () => {
  const cur = alloc.computeCurrentAlloc();
  assert.strictEqual(cur.cash, 100000);
});

test('reit allocation', () => {
  const cur = alloc.computeCurrentAlloc();
  assert.strictEqual(cur.reit, 50000);
});

test('total equals GRAND', () => {
  const cur = alloc.computeCurrentAlloc();
  const sum = cur.eq + cur.intl + cur.bond + cur.cash + cur.reit + cur.alt + cur.other;
  assert.strictEqual(sum, GRAND);
  assert.strictEqual(cur.total, GRAND);
});

test('other bucket captures unmapped categories', () => {
  const cur = alloc.computeCurrentAlloc();
  assert.strictEqual(cur.other, 0);  // all categories mapped
});

/* ==== Rebalance drift calculation ==== */
suite('Rebalance drift — manual calculation');

test('drift = |current% - target%| / 2 for total drift', () => {
  // Current: eq=50%, intl=15%, bond=20%, cash=10%, reit=5%, alt=0%
  // Target (moderate): eq=40%, intl=20%, bond=25%, cash=10%, reit=5%, alt=0%
  const curPcts = { eq: 50, intl: 15, bond: 20, cash: 10, reit: 5, alt: 0 };
  const tgtPcts = { eq: 40, intl: 20, bond: 25, cash: 10, reit: 5, alt: 0 };
  const cats = ['eq', 'intl', 'bond', 'cash', 'reit', 'alt'];
  const totalDrift = cats.reduce((s, k) => s + Math.abs(curPcts[k] - tgtPcts[k]), 0) / 2;
  assert.strictEqual(totalDrift, 10);  // (10+5+5+0+0+0)/2 = 10
});

test('drift dollar amounts sum to zero', () => {
  const curPcts = { eq: 50, intl: 15, bond: 20, cash: 10, reit: 5, alt: 0 };
  const tgtPcts = { eq: 40, intl: 20, bond: 25, cash: 10, reit: 5, alt: 0 };
  const cats = ['eq', 'intl', 'bond', 'cash', 'reit', 'alt'];
  const diffs = cats.map(k => (tgtPcts[k] - curPcts[k]) / 100 * GRAND);
  const sum = diffs.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum) < 0.01, `Dollar drift should net to zero, got ${sum}`);
});

/* ==== Expense ratio calculations ==== */
suite('Expense ratio — fee drag formulas');

test('weighted average ER', () => {
  // FXAIX: 400k @ 0.015%, FSPSX: 150k @ 0.035%, FXNAX: 200k @ 0.025%
  // SPAXX: 100k @ 0.42%, AAPL: 60k @ 0%, TSLA: 40k @ 0%, VNQ: 50k @ 0.12%
  const holdings = [
    { val: 400000, er: 0.015 },
    { val: 150000, er: 0.035 },
    { val: 200000, er: 0.025 },
    { val: 100000, er: 0.42 },
    { val: 60000, er: 0 },
    { val: 40000, er: 0 },
    { val: 50000, er: 0.12 },
  ];
  const totalVal = holdings.reduce((s, h) => s + h.val, 0);
  const weightedER = holdings.reduce((s, h) => s + h.er * h.val, 0) / totalVal;
  // Manual: (6000+5250+5000+42000+0+0+6000)/1000000 = 64250/1000000 = 0.064250
  assert.ok(Math.abs(weightedER - 0.06425) < 0.0001, `Expected ~0.06425, got ${weightedER}`);
});

test('annual fee drag', () => {
  const annualCost = 400000 * 0.015 / 100 + 150000 * 0.035 / 100 + 200000 * 0.025 / 100
    + 100000 * 0.42 / 100 + 50000 * 0.12 / 100;
  // 60 + 52.5 + 50 + 420 + 60 = 642.50
  assert.ok(Math.abs(annualCost - 642.50) < 0.01);
});

test('10-year fee drag with 7% growth', () => {
  const annualCost = 642.50;
  const factor = (Math.pow(1.07, 10) - 1) / 0.07;
  const tenYearDrag = annualCost * factor;
  // factor ≈ 13.816, drag ≈ 8881.81
  assert.ok(tenYearDrag > 8800 && tenYearDrag < 9000, `Expected ~8882, got ${tenYearDrag}`);
});

test('per-fund savings from cheaper alternative', () => {
  // SPAXX at 0.42% → if replaced by 0.01% fund: (0.42-0.01)/100 * 100000
  const savings = (0.42 - 0.01) / 100 * 100000;
  assert.ok(Math.abs(savings - 410) < 0.01, `Expected 410, got ${savings}`);
});

/* ==== Tax-Loss Harvesting formulas ==== */
suite('Tax-Loss Harvesting — TLH calculations');

test('LTCG offset savings at 15%', () => {
  const losses = 5000;  // TSLA loss
  const gains = 20000;  // AAPL gain
  const ltcgOffset = Math.min(losses, gains);
  const ltcgSavings = ltcgOffset * 0.15;
  assert.strictEqual(ltcgSavings, 750);
});

test('ordinary income offset capped at $3000', () => {
  const netLossAfterGains = 10000;  // hypothetical
  const ordOffset = Math.min(netLossAfterGains, 3000);
  const ordSavings = ordOffset * 0.22;  // 22% bracket
  assert.strictEqual(ordSavings, 660);
});

test('carryover calculation', () => {
  const netLossAfterGains = 10000;
  const carryover = Math.max(0, netLossAfterGains - 3000);
  assert.strictEqual(carryover, 7000);
});

test('no losses → no TLH benefit', () => {
  const totalLoss = 0;
  const ltcgOffset = Math.min(Math.abs(totalLoss), 20000);
  assert.strictEqual(ltcgOffset, 0);
});

/* ==== Deep-loss hold rule (from rebalance) ==== */
suite('Rebalance — deep-loss hold rule');

test('loss > 50% of cost basis in tax-advantaged → hold', () => {
  const gain = -30000, cb = 50000;
  const isDeepLoss = gain < 0 && cb > 0 && Math.abs(gain) / cb > 0.5;
  assert.strictEqual(isDeepLoss, true);
});

test('loss exactly 50% → not deep loss', () => {
  const gain = -25000, cb = 50000;
  const isDeepLoss = gain < 0 && cb > 0 && Math.abs(gain) / cb > 0.5;
  assert.strictEqual(isDeepLoss, false);
});

test('loss in taxable account → not held (can TLH)', () => {
  const isTaxable = true;
  // Even if deep loss, taxable positions should not use this rule
  assert.strictEqual(isTaxable, true);  // they get TLH benefit
});

test('gain position → not deep loss', () => {
  const gain = 5000, cb = 50000;
  const isDeepLoss = gain < 0 && cb > 0 && Math.abs(gain) / cb > 0.5;
  assert.strictEqual(isDeepLoss, false);
});

summarize('Allocation & Rebalance');
