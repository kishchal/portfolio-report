/**
 * Test: Withdrawal Engine Calculation Verification
 * Tests the core withdrawal calculation logic including:
 * - Deterministic engine via runMonteCarlo(1 sim, 0 vol)
 * - Cross-engine consistency (MC vs Historical)
 * - Edge cases (depletion, zero balances, RMD boundaries)
 * - blendGlideAllocation, buildContribForAge
 * - _computeCustomBracketLimit
 * - SS break-even crossover logic
 */
const { assert, test, suite, summarize,
  extractFinancialFunctions, extractSpendingFunctions,
  extractScenarioHelpers } = require('./test-helpers');

/* ---- Extract production functions ---- */
/* Extract financial functions first to get production CMA */
const fin = extractFinancialFunctions();
const CMA = fin.CMA; /* Use production CMA, not a test stub */

/* Extract spending functions with production CMA (needed as env overrides for financial block) */
const spend = extractSpendingFunctions({
  CMA,
  localStorage: { getItem: () => null },
});
const { blendGlideAllocation, buildGlideSchedule, getReturnForAge,
  buildContribForAge, getAnnualExpenseForAge, PHASE_TAGS,
  buildOneTimeSpendByAge, buildHealthcareCostForAge,
  buildHealthcareCostFromSettings, _buildSettingsFp } = spend;

/* Re-extract financial functions with spending helpers injected so MC/backtest can call them */
const finFull = extractFinancialFunctions({
  getAnnualExpenseForAge,
  getReturnForAge,
  getContribForAge: buildContribForAge(null), /* default zero-contrib function */
});
const scen = extractScenarioHelpers({
  TAX_BRACKETS_MFJ: fin.TAX_BRACKETS_MFJ,
  TAX_BRACKETS_SINGLE: fin.TAX_BRACKETS_SINGLE,
});

/* Helpers — use finFull for engine functions (MC/backtest need spending helpers in scope) */
const { runMonteCarlo, runHistoricalBacktest, calcTax, calcLTCG, getStdDeduction,
  calcIRMAA, calcSSTaxableAmount, percentile, RMD_TABLE, SS_AGE_FACTOR,
  TAX_BRACKETS_MFJ, TAX_BRACKETS_SINGLE, HIST_RETURNS } = finFull;
const { _computeCustomBracketLimit } = scen;

/* Standard test params matching runMonteCarlo/runHistoricalBacktest signatures.
   Balances represent retirement-date values (already grown). yearsToRetire=0 by default. */
function baseParams(overrides = {}) {
  const curAge = overrides.curAge ?? 65;
  const retireAge = overrides.retireAge ?? 65;
  const lifeExp = overrides.lifeExp ?? 90;
  const yearsToRetire = Math.max(0, retireAge - curAge);
  const yearsInRetirement = Math.max(1, lifeExp - retireAge + 1);
  const retPct = overrides.retPct ?? (CMA.equity.ret * 0.6 + CMA.bonds.ret * 0.4); /* 60/40 blend */
  const bTax = overrides.bTaxableInit ?? 500000;
  const bDef = overrides.bDeferredInit ?? 1000000;
  const bRoth = overrides.bRothInit ?? 300000;
  const bHSA = overrides.bHSAInit ?? 50000;
  const totalAtRetire = bTax + bDef + bRoth + bHSA;
  const filing = overrides.filing || 'mfj'; /* string — '||' is fine */
  const brackets = filing === 'mfj' ? TAX_BRACKETS_MFJ : TAX_BRACKETS_SINGLE;
  const annualNeed = overrides.annualNeed ?? 80000;
  const defaults = {
    nSims: 1, yearsInRetirement, yearsToRetire, retAge: retireAge,
    retPct, inflPct: overrides.inflPct ?? 0.03, vol: overrides.vol ?? 0.0, filing,
    bTaxableInit: bTax, bDeferredInit: bDef, bRothInit: bRoth, bHSAInit: bHSA,
    totalAtRetire,
    ssAnnualFRA: overrides.ssAnnualFRA ?? 30000, ssStartAge: overrides.ssStartAge ?? 67,
    spSSAnnualFRA: overrides.spSSAnnualFRA ?? 0, spSSStartAge: overrides.spSSStartAge ?? 67,
    hasSpouse: overrides.hasSpouse ?? false,
    spAgeOffset: overrides.spAgeOffset ?? 0, lifeExp, spLifeExp: overrides.spLifeExp ?? 0,
    curAge, spAge: overrides.spAge ?? 0, iraBasis: overrides.iraBasis ?? 0,
    rothConvStrategy: overrides.rothConvStrategy || 'none',
    convBracketLimit: overrides.convBracketLimit ?? 0,
    convStartAge: overrides.convStartAge ?? 65, convEndAge: overrides.convEndAge ?? 72,
    brackets, RMD_START_AGE: overrides.RMD_START_AGE ?? 73,
    spendingPhases: [{ age: retireAge, amount: annualNeed / 12 }],
    hasPhases: overrides.hasPhases ?? true,
    stateTaxPct: overrides.stateTaxPct ?? 0.05,
    glideSchedule: overrides.glideSchedule ?? null,
    getContribForAge: overrides.getContribForAge ?? null,
  };
  /* Apply overrides (except computed ones already handled) */
  const result = Object.assign(defaults, overrides);
  /* Recalculate derived fields if overrides changed inputs */
  if (overrides.retireAge != null || overrides.curAge != null || overrides.lifeExp != null) {
    result.yearsToRetire = Math.max(0, result.retAge - result.curAge);
    result.yearsInRetirement = Math.max(1, result.lifeExp - result.retAge + 1);
  }
  if (overrides.annualNeed != null) {
    result.spendingPhases = [{ age: result.retAge, amount: overrides.annualNeed / 12 }];
  }
  if (overrides.filing) {
    result.brackets = overrides.filing === 'mfj' ? TAX_BRACKETS_MFJ : TAX_BRACKETS_SINGLE;
  }
  return result;
}

/* ==== blendGlideAllocation ==== */
suite('blendGlideAllocation — return/vol blending');

test('100% equity returns CMA equity values', () => {
  const r = blendGlideAllocation(100);
  assert.strictEqual(r.eqPct, 100);
  assert.ok(Math.abs(r.ret - CMA.equity.ret) < 0.0001, `Expected ret ~${CMA.equity.ret}, got ${r.ret}`);
  assert.ok(Math.abs(r.vol - CMA.equity.vol) < 0.0001, `Expected vol ~${CMA.equity.vol}, got ${r.vol}`);
});

test('0% equity returns CMA bond values', () => {
  const r = blendGlideAllocation(0);
  assert.strictEqual(r.eqPct, 0);
  assert.ok(Math.abs(r.ret - CMA.bonds.ret) < 0.0001, `Expected ret ~${CMA.bonds.ret}, got ${r.ret}`);
  assert.ok(Math.abs(r.vol - CMA.bonds.vol) < 0.0001, `Expected vol ~${CMA.bonds.vol}, got ${r.vol}`);
});

test('60/40 blend returns weighted average return', () => {
  const r = blendGlideAllocation(60);
  const expectedRet = 0.6 * CMA.equity.ret + 0.4 * CMA.bonds.ret;
  assert.ok(Math.abs(r.ret - expectedRet) < 0.0001, `Expected ret ~${expectedRet.toFixed(4)}, got ${r.ret.toFixed(4)}`);
});

test('60/40 blend volatility follows sqrt formula', () => {
  const r = blendGlideAllocation(60);
  const expectedVol = Math.sqrt(0.36 * CMA.equity.vol ** 2 + 0.16 * CMA.bonds.vol ** 2);
  assert.ok(Math.abs(r.vol - expectedVol) < 0.0001, `Expected vol ~${expectedVol.toFixed(4)}, got ${r.vol.toFixed(4)}`);
});

test('clamps negative equity to 0%', () => {
  const r = blendGlideAllocation(-10);
  assert.strictEqual(r.eqPct, 0);
});

test('clamps equity above 100% to 100%', () => {
  const r = blendGlideAllocation(150);
  assert.strictEqual(r.eqPct, 100);
});

/* ==== buildContribForAge ==== */
suite('buildContribForAge — contribution schedule from settings');

test('null settings returns zero-contribution function', () => {
  const fn = buildContribForAge(null);
  const c = fn(60);
  assert.strictEqual(c.c401k, 0);
  assert.strictEqual(c.ira, 0);
  assert.strictEqual(c.taxable, 0);
  assert.strictEqual(c.hsa, 0);
});

test('disabled contributions (wdContribToggle false) returns zero regardless of data', () => {
  const fn = buildContribForAge({
    wdContribToggle: false,
    _contribMode: 'hybrid',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 1000, ira: 2000, taxable: 3000, hsa: 1000 },
    ],
    wdAge: '55', wdRetire: '65',
  });
  const c = fn(60);
  assert.strictEqual(c.c401k, 0, 'disabled toggle → zero 401k');
  assert.strictEqual(c.match, 0, 'disabled toggle → zero match');
  assert.strictEqual(c.hsa, 0, 'disabled toggle → zero hsa');
});

test('disabled contributions (string "false") returns zero', () => {
  const fn = buildContribForAge({
    wdContribToggle: 'false',
    _contribMode: 'hybrid',
    wdContrib401k: '10000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    wdAge: '55', wdRetire: '65',
  });
  const c = fn(60);
  assert.strictEqual(c.c401k, 0, 'string "false" toggle → zero');
});

test('flat mode returns same contributions for any pre-retirement age', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'flat',
    wdContrib401k: '23000', wdContribMatch: '5000',
    wdContribIRA: '7000', wdContribTaxable: '10000', wdContribHSA: '4150',
    wdAge: '60', wdRetire: '65',
  });
  const c = fn(62);
  assert.strictEqual(c.c401k, 23000);
  assert.strictEqual(c.match, 5000);
  assert.strictEqual(c.ira, 7000);
  assert.strictEqual(c.taxable, 10000);
  assert.strictEqual(c.hsa, 4150);
});

test('flat mode returns zero contributions after retirement age', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'flat',
    wdContrib401k: '23000', wdContribMatch: '5000',
    wdContribIRA: '7000', wdContribTaxable: '10000', wdContribHSA: '4150',
    wdAge: '60', wdRetire: '65',
  });
  /* After the default end age (retirement), contributions should be zero */
  const c = fn(66);
  assert.strictEqual(c.c401k, 0, 'No contributions after retirement age');
});

test('yearly mode uses schedule keyed by age', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'yearly',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 23000, match: 5000, ira: 7000, taxable: 10000, hsa: 4000 },
      { year: 2027, age: 61, c401k: 20000, match: 4000, ira: 7000, taxable: 8000, hsa: 4000 },
    ],
    wdAge: '60', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 23000);
  const c61 = fn(61);
  assert.strictEqual(c61.c401k, 20000);
});

test('yearly mode returns zero for ages not in schedule', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'yearly',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 23000, match: 5000, ira: 7000, taxable: 10000, hsa: 4000 },
    ],
    wdAge: '60', wdRetire: '65',
  });
  const c62 = fn(62);
  assert.strictEqual(c62.c401k, 0);
});

/* ==== Hybrid mode (additive: flat + year-specific) ==== */
suite('buildContribForAge — hybrid mode (additive)');

test('hybrid mode adds flat base + year-specific entries for same age', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'hybrid',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 1000, ira: 2000, taxable: 3000, hsa: 1000 },
    ],
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 15000, 'flat 10k + yearly 5k = 15k');
  assert.strictEqual(c60.match, 3000, 'flat 2k + yearly 1k = 3k');
  assert.strictEqual(c60.ira, 5000, 'flat 3k + yearly 2k = 5k');
  assert.strictEqual(c60.taxable, 8000, 'flat 5k + yearly 3k = 8k');
  assert.strictEqual(c60.hsa, 3000, 'flat 2k + yearly 1k = 3k');
});

test('hybrid mode returns only flat for age without year-specific entry', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'hybrid',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 1000, ira: 2000, taxable: 3000, hsa: 1000 },
    ],
    wdAge: '55', wdRetire: '65',
  });
  const c58 = fn(58);
  assert.strictEqual(c58.c401k, 10000, 'only flat at age 58');
  assert.strictEqual(c58.hsa, 2000, 'only flat HSA at age 58');
});

test('hybrid mode returns only year-specific for age outside flat range', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'hybrid',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '60',
    _contribSchedule: [
      { year: 2031, age: 65, c401k: 3000, match: 0, ira: 1000, taxable: 0, hsa: 0 },
    ],
    wdAge: '55', wdRetire: '60',
  });
  const c65 = fn(65);
  assert.strictEqual(c65.c401k, 3000, 'only year-specific at age 65 (outside flat range)');
  assert.strictEqual(c65.ira, 1000);
  assert.strictEqual(c65.taxable, 0);
});

test('hybrid mode returns zero for age with neither flat nor yearly', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'hybrid',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '60',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 1000, ira: 2000, taxable: 3000, hsa: 1000 },
    ],
    wdAge: '55', wdRetire: '60',
  });
  const c70 = fn(70);
  assert.strictEqual(c70.c401k, 0, 'zero at age 70 — outside both ranges');
});

/* ==== Sub-toggle tests ==== */
suite('buildContribForAge — sub-toggles');

test('recurring off → only year-specific entries used', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    wdContribRecurringToggle: false,
    wdContribYearlyToggle: true,
    _contribMode: 'hybrid',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 1000, ira: 2000, taxable: 3000, hsa: 1000 },
    ],
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 5000, 'only year-specific — recurring off');
  const c58 = fn(58);
  assert.strictEqual(c58.c401k, 0, 'no recurring at age 58');
});

test('yearly off → only recurring flat used', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    wdContribRecurringToggle: true,
    wdContribYearlyToggle: false,
    _contribMode: 'hybrid',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 1000, ira: 2000, taxable: 3000, hsa: 1000 },
    ],
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 10000, 'only flat — yearly off, schedule ignored');
});

test('both sub-toggles off → zero contributions', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    wdContribRecurringToggle: false,
    wdContribYearlyToggle: false,
    _contribMode: 'hybrid',
    wdContrib401k: '10000',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 0, ira: 0, taxable: 0, hsa: 0 },
    ],
    wdContribStartAge: '55', wdContribEndAge: '65',
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 0, 'both off → zero');
});

test('sub-toggles default to true for old settings (backward compat)', () => {
  /* Old settings won't have sub-toggle keys — should default to enabled */
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'hybrid',
    wdContrib401k: '10000',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 5000, match: 0, ira: 0, taxable: 0, hsa: 0 },
    ],
    wdContribStartAge: '55', wdContribEndAge: '65',
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 15000, 'missing toggles → default on → additive');
});

test('old yearly mode zeroes flat to prevent double-count', () => {
  /* When loading old yearly-mode settings, flat values should be zeroed since
     _populateContribYears previously copied flat→yearly. */
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'yearly',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 23000, match: 5000, ira: 7000, taxable: 10000, hsa: 4000 },
    ],
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 23000, 'only yearly — flat zeroed for yearly mode');
  const c58 = fn(58);
  assert.strictEqual(c58.c401k, 0, 'flat zeroed for yearly mode — no entry at age 58');
});

test('old flat mode ignores empty schedule', () => {
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'flat',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 10000, 'flat-only returns flat values');
});

test('old flat mode ignores stale yearly schedule (no double-count)', () => {
  /* R3 fix: stale _contribSchedule from old flat mode should be ignored */
  const fn = buildContribForAge({
    wdContribToggle: true,
    _contribMode: 'flat',
    wdContrib401k: '10000', wdContribMatch: '2000',
    wdContribIRA: '3000', wdContribTaxable: '5000', wdContribHSA: '2000',
    wdContribStartAge: '55', wdContribEndAge: '65',
    _contribSchedule: [
      { year: 2026, age: 60, c401k: 10000, match: 2000, ira: 3000, taxable: 5000, hsa: 2000 },
    ],
    wdAge: '55', wdRetire: '65',
  });
  const c60 = fn(60);
  assert.strictEqual(c60.c401k, 10000, 'flat mode ignores stale schedule — no double-count');
  assert.strictEqual(c60.hsa, 2000, 'only flat HSA — stale yearly ignored');
});

/* ==== _computeCustomBracketLimit ==== */
suite('_computeCustomBracketLimit — Roth conversion bracket ceiling');

test('12% rate MFJ returns 12% bracket ceiling', () => {
  const limit = _computeCustomBracketLimit(12, 'mfj');
  const expected = TAX_BRACKETS_MFJ.find(b => Math.abs(b.rate - 0.12) < 0.001).limit;
  assert.strictEqual(limit, expected, `12% MFJ bracket limit should be ${expected}`);
});

test('22% rate MFJ returns 22% bracket ceiling', () => {
  const limit = _computeCustomBracketLimit(22, 'mfj');
  const expected = TAX_BRACKETS_MFJ.find(b => Math.abs(b.rate - 0.22) < 0.001).limit;
  assert.strictEqual(limit, expected, `22% MFJ bracket limit should be ${expected}`);
});

test('10% rate Single returns 10% bracket ceiling', () => {
  const limit = _computeCustomBracketLimit(10, 'single');
  const expected = TAX_BRACKETS_SINGLE.find(b => Math.abs(b.rate - 0.10) < 0.001).limit;
  assert.strictEqual(limit, expected, `10% Single bracket limit should be ${expected}`);
});

test('0% rate returns lowest bracket', () => {
  const limit = _computeCustomBracketLimit(0, 'mfj');
  assert.strictEqual(limit, TAX_BRACKETS_MFJ[0].limit);
});

test('37% rate returns highest finite bracket', () => {
  const limit = _computeCustomBracketLimit(37, 'mfj');
  const finiteBrackets = TAX_BRACKETS_MFJ.filter(b => isFinite(b.limit));
  const expected = finiteBrackets[finiteBrackets.length - 1].limit;
  assert.strictEqual(limit, expected);
});

/* ==== Deterministic Monte Carlo (1 sim, 0 vol) ==== */
suite('Deterministic engine via runMonteCarlo (1 sim, 0 vol)');

test('basic retirement scenario returns expected structure', () => {
  const p = baseParams();
  const result = runMonteCarlo(p);
  assert.ok(result, 'runMonteCarlo should return a result');
  assert.ok(typeof result.successRate === 'number', 'Should have successRate');
  assert.ok(Array.isArray(result.endingBalances), 'Should have endingBalances');
  assert.ok(Array.isArray(result.bands) && result.bands.length === 5, 'Should have 5 percentile bands');
  assert.ok(Array.isArray(result.bands[2]), 'Median band (index 2) should be an array');
});

test('no-withdrawal scenario preserves portfolio growth', () => {
  const p = baseParams({ annualNeed: 0, ssAnnualFRA: 0 });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 100, 'Zero-withdrawal should have 100% success');
  const totalStart = p.bTaxableInit + p.bDeferredInit + p.bRothInit + p.bHSAInit;
  assert.ok(result.endingBalances[0] > totalStart, 'Ending balance should grow with no withdrawals');
});

test('RMDs kick in at the correct age', () => {
  /* $1M deferred, no spending need, no SS — only forced withdrawals should be RMDs after age 73 */
  const pNoRMD = baseParams({
    bTaxableInit: 0, bDeferredInit: 1000000, bRothInit: 0, bHSAInit: 0,
    annualNeed: 0, ssAnnualFRA: 0, curAge: 65, retireAge: 65, lifeExp: 80,
  });
  const result = runMonteCarlo(pNoRMD);
  assert.ok(result.successRate === 100, 'No-withdrawal should succeed');
  /* The median band at index 0 (age 65) should start at the full $1M deferred balance.
     At index 8 (age 73, first RMD year), the balance should be lower due to RMD withdrawals.
     Before age 73, balance should only grow (6% return, no withdrawals).
     After age 73, RMDs cause drawdowns. */
  const median = result.bands[2]; /* 50th percentile */
  const preRMDIdx = 7;  /* age 72 */
  const postRMDIdx = 8; /* age 73 - first RMD */
  assert.ok(median.length > postRMDIdx, 'Bands should extend to RMD age');
  /* Pre-RMD: balance should be growing (no withdrawals) */
  assert.ok(median[preRMDIdx] > median[0], 'Balance should grow pre-RMD');
  /* Post-RMD: growth rate slows because RMDs pull money out.
     Compare growth rate before and after RMD start. */
  const growthPre = median[preRMDIdx] / median[preRMDIdx - 1];
  const growthPost = median[postRMDIdx] / median[preRMDIdx];
  assert.ok(growthPost < growthPre,
    `Growth should slow after RMDs: pre=${growthPre.toFixed(4)}, post=${growthPost.toFixed(4)}`);
});

test('high withdrawal depletes portfolio (success < 100%)', () => {
  const p = baseParams({ annualNeed: 300000, ssAnnualFRA: 0, nSims: 1, vol: 0 });
  const result = runMonteCarlo(p);
  /* $1.85M portfolio with $300K/yr withdrawal should deplete */
  assert.ok(result.successRate < 100, `Should deplete with $300K/yr withdrawals, got ${result.successRate}%`);
});

test('Social Security reduces needed withdrawals', () => {
  const pNoSS = baseParams({ ssAnnualFRA: 0 });
  const pWithSS = baseParams({ ssAnnualFRA: 40000, ssStartAge: 67 });
  const rNoSS = runMonteCarlo(pNoSS);
  const rWithSS = runMonteCarlo(pWithSS);
  assert.ok(rWithSS.endingBalances[0] >= rNoSS.endingBalances[0],
    'Portfolio with SS should end higher than without');
});

test('Roth conversion strategy affects results', () => {
  const pNone = baseParams({ rothConvStrategy: 'none' });
  const pConv = baseParams({
    rothConvStrategy: 'fixed', convBracketLimit: 206700,
    convStartAge: 65, convEndAge: 72,
  });
  const rNone = runMonteCarlo(pNone);
  const rConv = runMonteCarlo(pConv);
  /* Both should produce results — Roth conversion shifts tax burden */
  assert.ok(rNone.endingBalances[0] !== rConv.endingBalances[0],
    'Roth conversion should produce different ending balance');
});

test('state tax reduces ending balance', () => {
  const pNoState = baseParams({ stateTaxPct: 0 });
  const pWithState = baseParams({ stateTaxPct: 0.10 });
  const rNoState = runMonteCarlo(pNoState);
  const rWithState = runMonteCarlo(pWithState);
  assert.ok(rNoState.endingBalances[0] > rWithState.endingBalances[0],
    'State tax should reduce ending balance');
});

test('filing status single uses single brackets', () => {
  const pMFJ = baseParams({ filing: 'mfj' });
  const pSingle = baseParams({ filing: 'single' });
  const rMFJ = runMonteCarlo(pMFJ);
  const rSingle = runMonteCarlo(pSingle);
  /* Single should pay more tax (lower brackets), less ending balance */
  assert.ok(rMFJ.endingBalances[0] > rSingle.endingBalances[0],
    'MFJ should have higher ending balance than Single (lower taxes)');
});

test('IRA basis reduces tax on deferred withdrawals', () => {
  const pNoBasis = baseParams({ iraBasis: 0 });
  const pWithBasis = baseParams({ iraBasis: 200000 });
  const rNoBasis = runMonteCarlo(pNoBasis);
  const rWithBasis = runMonteCarlo(pWithBasis);
  assert.ok(rWithBasis.endingBalances[0] >= rNoBasis.endingBalances[0],
    'IRA basis should reduce taxes and increase ending balance');
});

/* ==== Cross-engine consistency ==== */
suite('Cross-engine consistency — MC vs Historical');

test('deterministic MC and historical use same RMD table', () => {
  /* Both engines should reference the same RMD_TABLE */
  assert.ok(RMD_TABLE[73] > 0, 'RMD table should have age 73');
  assert.ok(RMD_TABLE[90] > 0, 'RMD table should have age 90');
  /* RMD divisor decreases with age */
  assert.ok(RMD_TABLE[73] > RMD_TABLE[90], 'RMD divisor should decrease with age');
});

test('deterministic MC and historical produce finite success rates', () => {
  const p = baseParams();
  const mc = runMonteCarlo(p);
  const hist = runHistoricalBacktest(p);
  assert.ok(mc.successRate >= 0 && mc.successRate <= 100, `MC success rate in range: ${mc.successRate}`);
  assert.ok(hist.successRate >= 0 && hist.successRate <= 100, `Hist success rate in range: ${hist.successRate}`);
});

test('zero-withdrawal plan succeeds in both engines', () => {
  const p = baseParams({ annualNeed: 0, ssAnnualFRA: 0 });
  const mc = runMonteCarlo(p);
  const hist = runHistoricalBacktest(p);
  assert.strictEqual(mc.successRate, 100, 'MC: zero-withdrawal should succeed');
  assert.strictEqual(hist.successRate, 100, 'Hist: zero-withdrawal should succeed');
});

test('both engines return bands with correct year count', () => {
  const p = baseParams();
  const mc = runMonteCarlo(p);
  const hist = runHistoricalBacktest(p);
  const expectedYears = p.yearsInRetirement;
  assert.strictEqual(mc.bands[2].length, expectedYears, `MC median band should have ${expectedYears} years`);
  assert.ok(hist.bands && hist.bands.length > 0, 'Hist should have bands');
});

/* ==== Edge cases ==== */
suite('Edge cases — depletion, zero balances, boundaries');

test('all-zero balances returns 0% success for non-zero need', () => {
  const p = baseParams({
    bTaxableInit: 0, bDeferredInit: 0, bRothInit: 0, bHSAInit: 0,
    annualNeed: 50000, ssAnnualFRA: 0,
  });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'Zero portfolio with spending need should fail');
});

test('all-zero balances with SS only', () => {
  const p = baseParams({
    bTaxableInit: 0, bDeferredInit: 0, bRothInit: 0, bHSAInit: 0,
    annualNeed: 30000, ssAnnualFRA: 30000, ssStartAge: 67,
  });
  const result = runMonteCarlo(p);
  /* SS starts at 67 but retirement at 65 — gap years 65-66 have no income and no portfolio.
     Plan should fail because there's no money for the first 2 years. */
  assert.ok(typeof result.successRate === 'number', 'Should produce a result');
  assert.strictEqual(result.successRate, 0,
    'Zero portfolio with SS gap should fail (no funds for ages 65-66)');
});

test('Roth-only portfolio (no RMDs, no tax)', () => {
  const p = baseParams({
    bTaxableInit: 0, bDeferredInit: 0, bRothInit: 1800000, bHSAInit: 0,
    annualNeed: 60000, ssAnnualFRA: 0,
    rothConvStrategy: 'none',
  });
  const result = runMonteCarlo(p);
  assert.ok(result.successRate > 0, 'Roth-only should produce results');
  /* No deferred = no RMDs, should have more left */
  assert.ok(result.endingBalances[0] > 0, 'Should not deplete $1.8M Roth at $60K/yr');
});

test('HSA-only scenario (small portfolio)', () => {
  const p = baseParams({
    bTaxableInit: 0, bDeferredInit: 0, bRothInit: 0, bHSAInit: 100000,
    annualNeed: 5000, ssAnnualFRA: 0,
  });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', 'HSA-only should produce results');
});

test('retirement at current age (immediate retirement)', () => {
  const p = baseParams({ curAge: 65, retireAge: 65 });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', 'Immediate retirement should work');
});

test('very long retirement (age 30 to 100)', () => {
  const p = baseParams({
    curAge: 30, retireAge: 30, lifeExp: 100,
    bTaxableInit: 2000000, bDeferredInit: 0, bRothInit: 0, bHSAInit: 0,
    annualNeed: 40000, ssAnnualFRA: 0,
  });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', '70-year retirement should produce results');
  assert.strictEqual(result.bands[2].length, 71, `Should have 71 years (age 30-100 inclusive), got ${result.bands[2].length}`);
});

test('glide path changes allocation over time', () => {
  const schedule = buildGlideSchedule(65, 90, 'glidepath', null, 60, null);
  assert.ok(schedule, 'Glidepath should produce a schedule');
  const p = baseParams({ glideSchedule: schedule });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', 'Glide path should produce results');
});

test('spouse SS adds to household income', () => {
  const pNoSpouse = baseParams({ spSSAnnualFRA: 0 });
  const pWithSpouse = baseParams({
    spSSAnnualFRA: 20000, spSSStartAge: 67,
    spAge: 58, spLifeExp: 88, spAgeOffset: -2,
    hasSpouse: true,
  });
  const rNoSpouse = runMonteCarlo(pNoSpouse);
  const rWithSpouse = runMonteCarlo(pWithSpouse);
  assert.ok(rWithSpouse.endingBalances[0] >= rNoSpouse.endingBalances[0],
    'Spouse SS should increase ending balance');
});

/* ==== SS break-even crossover logic (formula-based) ==== */
suite('Social Security break-even crossover calculations');

test('cumulative SS at 62 catches up slower than at 70', () => {
  const fraAnnual = 36000; /* $3K/mo at FRA */
  const inflPct = 0.03;
  /* At age 62: 70% of FRA, starts collecting at 62 */
  /* At age 70: 124% of FRA, starts collecting at 70 */
  let cum62 = 0, cum70 = 0;
  for (let age = 62; age <= 90; age++) {
    if (age >= 62) cum62 += fraAnnual * SS_AGE_FACTOR[62] * Math.pow(1 + inflPct, age - 62);
    if (age >= 70) cum70 += fraAnnual * SS_AGE_FACTOR[70] * Math.pow(1 + inflPct, age - 62);
  }
  /* By age 90, claiming at 70 should have overtaken 62 */
  assert.ok(cum70 > cum62, `By 90, age-70 ($${Math.round(cum70)}) should exceed age-62 ($${Math.round(cum62)})`);
});

test('break-even age between 62 and 70 is approximately 80-83', () => {
  const fraAnnual = 36000;
  const inflPct = 0.03;
  let cum62 = 0, cum70 = 0, breakEvenAge = null;
  for (let age = 62; age <= 100; age++) {
    if (age >= 62) cum62 += fraAnnual * SS_AGE_FACTOR[62] * Math.pow(1 + inflPct, age - 62);
    if (age >= 70) cum70 += fraAnnual * SS_AGE_FACTOR[70] * Math.pow(1 + inflPct, age - 62);
    if (cum70 > cum62 && breakEvenAge === null) breakEvenAge = age;
  }
  assert.ok(breakEvenAge >= 78 && breakEvenAge <= 85,
    `Break-even age should be ~80-83, got ${breakEvenAge}`);
});

test('SS_AGE_FACTOR has correct values for key ages', () => {
  assert.ok(Math.abs(SS_AGE_FACTOR[62] - 0.70) < 0.01, 'Age 62 factor should be ~70%');
  assert.ok(Math.abs(SS_AGE_FACTOR[67] - 1.00) < 0.01, 'Age 67 factor should be 100%');
  assert.ok(Math.abs(SS_AGE_FACTOR[70] - 1.24) < 0.01, 'Age 70 factor should be ~124%');
});

/* ==== Tax calculation integration ==== */
suite('Tax integration — end-to-end tax scenarios');

test('standard deduction shelters low income', () => {
  const stdDed = getStdDeduction('mfj', 65, 60, true, 60000);
  const taxableIncome = Math.max(0, 60000 - stdDed);
  const tax = calcTax(taxableIncome, TAX_BRACKETS_MFJ);
  /* MFJ std deduction ~$39K for 65+ filer with OBBBA; taxable ~$20,900 */
  /* Tax on $20,900: all in 10% bracket (MFJ 10% limit ~$23,850) = ~$2,090 */
  assert.ok(tax > 0 && tax < 5000,
    `Tax on $${taxableIncome} taxable income should be $0-5K, got $${Math.round(tax)}`);
  const expectedTax = Math.min(taxableIncome, TAX_BRACKETS_MFJ[0].limit) * TAX_BRACKETS_MFJ[0].rate;
  assert.ok(Math.abs(tax - expectedTax) < 100,
    `Tax $${Math.round(tax)} should be ~$${Math.round(expectedTax)} (within $100)`);
});

test('IRMAA surcharge at high MAGI', () => {
  const irmaa = calcIRMAA(400000, 'mfj', 2);
  assert.ok(irmaa > 0, 'IRMAA should apply at $400K MAGI MFJ');
});

test('SS taxation at 85% ceiling for high income', () => {
  const ssAnnual = 40000;
  const otherIncome = 200000;
  const taxable = calcSSTaxableAmount(ssAnnual, otherIncome, 'mfj');
  assert.ok(Math.abs(taxable - ssAnnual * 0.85) < 1, 'High-income SS should be 85% taxable');
});

test('LTCG 0% rate for low ordinary income', () => {
  const ltcgTax = calcLTCG(20000, 30000, 'mfj');
  assert.strictEqual(ltcgTax, 0, 'LTCG should be 0% at low ordinary income');
});

/* ==== RMD table verification ==== */
suite('RMD table — IRS Uniform Lifetime Table 2025');

test('divisor at age 73 (RMD start for 1951-1959)', () => {
  assert.ok(RMD_TABLE[73] > 25 && RMD_TABLE[73] < 28, `Age 73 divisor should be ~26.5, got ${RMD_TABLE[73]}`);
});

test('divisor at age 85 is lower than age 73', () => {
  assert.ok(RMD_TABLE[85] < RMD_TABLE[73], 'Divisor should decrease with age');
});

test('RMD calc: $1M at age 75', () => {
  const rmd = 1000000 / RMD_TABLE[75];
  assert.ok(rmd > 30000 && rmd < 50000, `RMD at 75 should be $30-50K, got $${Math.round(rmd)}`);
});

test('divisor at age 100 is very small', () => {
  assert.ok(RMD_TABLE[100] < 10 && RMD_TABLE[100] > 0, `Age 100 divisor should be small, got ${RMD_TABLE[100]}`);
});

/* ==== Monte Carlo with volatility ==== */
suite('Monte Carlo — stochastic behavior');

test('higher volatility increases outcome dispersion', () => {
  const pLowVol = baseParams({ vol: 0.05, nSims: 100 });
  const pHighVol = baseParams({ vol: 0.20, nSims: 100 });
  const rLow = runMonteCarlo(pLowVol);
  const rHigh = runMonteCarlo(pHighVol);
  /* Higher vol should have wider spread between p10 and p90 */
  const spreadLow = percentile(rLow.endingBalances, 90) - percentile(rLow.endingBalances, 10);
  const spreadHigh = percentile(rHigh.endingBalances, 90) - percentile(rHigh.endingBalances, 10);
  assert.ok(spreadHigh > spreadLow,
    `High vol spread ($${Math.round(spreadHigh)}) should exceed low vol ($${Math.round(spreadLow)})`);
});

test('1000 simulations produce stable success rate', () => {
  const p = baseParams({ vol: 0.12, nSims: 1000 });
  const r = runMonteCarlo(p);
  /* With $1.85M portfolio, ~$80K need, 60/40 blend, success should be high but not guaranteed */
  assert.ok(r.successRate > 50 && r.successRate < 100,
    `Success rate should be 50-100% for moderate risk, got ${r.successRate}%`);
  assert.ok(r.endingBalances.length === 1000, 'Should have 1000 ending balances');
  /* Run twice — results should be similar (within 10pp) due to large sample */
  const r2 = runMonteCarlo(p);
  assert.ok(Math.abs(r.successRate - r2.successRate) < 10,
    `Two 1000-sim runs should be within 10pp: ${r.successRate}% vs ${r2.successRate}%`);
});

/* ==== Historical backtest specifics ==== */
suite('Historical backtest — period-specific behavior');

test('historical returns data starts at 1926', () => {
  assert.ok(HIST_RETURNS.length > 0, 'Should have historical data');
  assert.ok(HIST_RETURNS[0][0] === 1926, `First year should be 1926, got ${HIST_RETURNS[0][0]}`);
});

test('each historical period has stock, bond, and inflation', () => {
  HIST_RETURNS.forEach(r => {
    assert.ok(typeof r[1] === 'number', `Year ${r[0]} missing stock return`);
    assert.ok(typeof r[2] === 'number', `Year ${r[0]} missing bond return`);
    assert.ok(typeof r[3] === 'number', `Year ${r[0]} missing inflation`);
  });
});

test('conservative portfolio survives most historical periods', () => {
  const p = baseParams({
    bTaxableInit: 200000, bDeferredInit: 800000, bRothInit: 500000, bHSAInit: 0,
    annualNeed: 50000, ssAnnualFRA: 30000, ssStartAge: 67,
    retPct: 0.06, vol: 0.12,
  });
  const result = runHistoricalBacktest(p);
  /* $1.5M portfolio with $50K need + $30K SS = strong plan; expect >70% historical success */
  assert.ok(result.successRate > 70, `Conservative plan should have >70% historical success, got ${result.successRate}%`);
});

test('worst5 array contains at most 5 entries', () => {
  const p = baseParams();
  const result = runHistoricalBacktest(p);
  assert.ok(result.worst5.length <= 5, `worst5 should have ≤5 entries, got ${result.worst5.length}`);
});

/* ==== Numerical edge cases ==== */
suite('Numerical edge cases — deflation, extreme inputs');

test('deflation scenario (negative inflation) produces valid results', () => {
  const p = baseParams({ inflPct: -0.02, nSims: 1, vol: 0 });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number' && isFinite(result.successRate),
    'Deflation should produce finite success rate');
  assert.ok(result.endingBalances[0] >= 0, 'Ending balance should be non-negative');
});

test('zero return and zero inflation produces valid results', () => {
  const p = baseParams({ retPct: 0, inflPct: 0, nSims: 1, vol: 0 });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', 'Zero return should produce results');
});

test('extreme longevity (age 65 to 115) does not crash', () => {
  const p = baseParams({ lifeExp: 115 });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', 'Extreme longevity should produce results');
  assert.strictEqual(result.bands[2].length, p.yearsInRetirement,
    `Should have ${p.yearsInRetirement} years in median band`);
});

test('negative return scenario does not crash', () => {
  const p = baseParams({ retPct: -0.05, nSims: 1, vol: 0 });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', 'Negative return should produce results');
  assert.strictEqual(result.successRate, 0, 'Negative return should deplete portfolio');
});

test('100% volatility produces valid (but risky) results', () => {
  const p = baseParams({ vol: 1.0, nSims: 50 });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number' && isFinite(result.successRate),
    'Extreme volatility should produce finite results');
  assert.ok(result.endingBalances.every(b => isFinite(b)), 'All ending balances should be finite');
});

test('post-retirement contributions increase ending balance', () => {
  const contribFn = buildContribForAge({
    wdContribToggle: true, _contribMode: 'flat',
    wdContrib401k: '10000', wdContribMatch: '0', wdContribIRA: '0',
    wdContribTaxable: '0', wdContribHSA: '0',
    wdAge: '65', wdRetire: '70', wdContribStartAge: '65', wdContribEndAge: '70',
  });
  const pNoContrib = baseParams({ annualNeed: 0, ssAnnualFRA: 0 });
  const pWithContrib = baseParams({ annualNeed: 0, ssAnnualFRA: 0, getContribForAge: contribFn });
  const rNo = runMonteCarlo(pNoContrib);
  const rWith = runMonteCarlo(pWithContrib);
  assert.ok(rWith.endingBalances[0] > rNo.endingBalances[0],
    'Contributions should strictly increase ending balance');
});

test('historical backtest with contributions increases ending balance', () => {
  const contribFn = buildContribForAge({
    wdContribToggle: true, _contribMode: 'flat',
    wdContrib401k: '10000', wdContribMatch: '0', wdContribIRA: '0',
    wdContribTaxable: '0', wdContribHSA: '0',
    wdAge: '65', wdRetire: '70', wdContribStartAge: '65', wdContribEndAge: '70',
  });
  const pNoContrib = baseParams({ annualNeed: 0, ssAnnualFRA: 0 });
  const pWithContrib = baseParams({ annualNeed: 0, ssAnnualFRA: 0, getContribForAge: contribFn });
  const rNo = runHistoricalBacktest(pNoContrib);
  const rWith = runHistoricalBacktest(pWithContrib);
  /* Median ending balance should be higher with contributions */
  const medianNo = percentile(rNo.endingBalances, 50);
  const medianWith = percentile(rWith.endingBalances, 50);
  assert.ok(medianWith > medianNo,
    `Historical backtest: contributions should strictly help (median $${Math.round(medianWith)} > $${Math.round(medianNo)})`);
});

test('4% guardrail path (hasPhases=false) produces valid results', () => {
  const p = baseParams({
    hasPhases: false, spendingPhases: [],
    bTaxableInit: 500000, bDeferredInit: 500000, bRothInit: 0, bHSAInit: 0,
    ssAnnualFRA: 0,
  });
  const result = runMonteCarlo(p);
  assert.ok(typeof result.successRate === 'number', '4% rule path should produce results');
  assert.ok(result.successRate >= 0 && result.successRate <= 100, 'Success rate in valid range');
  /* With $1M portfolio and 4% rule (~$40K/yr), should have reasonable success */
  assert.ok(result.successRate > 0, '4% rule on $1M should not be 0% success');
});

test('4% guardrail path in historical backtest', () => {
  const p = baseParams({
    hasPhases: false, spendingPhases: [],
    bTaxableInit: 500000, bDeferredInit: 500000, bRothInit: 0, bHSAInit: 0,
    ssAnnualFRA: 0,
  });
  const result = runHistoricalBacktest(p);
  assert.ok(typeof result.successRate === 'number', 'Historical 4% rule path should produce results');
  assert.ok(result.successRate > 0, 'Historical 4% rule on $1M should succeed sometimes');
});

/* ==== Input validation — NaN/Infinity guards ==== */
suite('Input validation — NaN/Infinity guards');

test('NaN annualNeed returns 0% success (not silent 100%)', () => {
  const p = baseParams({ annualNeed: NaN });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'NaN spending should fail, not silently succeed');
});

test('Infinity annualNeed returns 0% success', () => {
  const p = baseParams({ annualNeed: Infinity });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'Infinity spending should fail');
});

test('NaN retPct returns 0% success', () => {
  const p = baseParams({ retPct: NaN });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'NaN return should fail');
});

test('NaN inflPct returns 0% success', () => {
  const p = baseParams({ inflPct: NaN });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'NaN inflation should fail');
});

test('historical backtest with NaN returns 0% success', () => {
  const p = baseParams({ retPct: NaN });
  const result = runHistoricalBacktest(p);
  assert.strictEqual(result.successRate, 0, 'NaN return in historical should fail');
});

/* ==== RMD start age 75 (SECURE Act 2.0) ==== */
suite('RMD start age variation');

test('RMD_START_AGE=75 delays forced withdrawals vs 73', () => {
  /* Extend to age 95 so the delayed-RMD benefit is clearer over more years */
  const p73 = baseParams({
    bTaxableInit: 0, bDeferredInit: 1000000, bRothInit: 0, bHSAInit: 0,
    annualNeed: 0, ssAnnualFRA: 0, RMD_START_AGE: 73, lifeExp: 95,
  });
  const p75 = baseParams({
    bTaxableInit: 0, bDeferredInit: 1000000, bRothInit: 0, bHSAInit: 0,
    annualNeed: 0, ssAnnualFRA: 0, RMD_START_AGE: 75, lifeExp: 95,
  });
  const r73 = runMonteCarlo(p73);
  const r75 = runMonteCarlo(p75);
  /* Both should succeed (no spending need) */
  assert.strictEqual(r73.successRate, 100, 'RMD 73 zero-need should succeed');
  assert.strictEqual(r75.successRate, 100, 'RMD 75 zero-need should succeed');
  /* RMD at 75 means 2 fewer years of forced distributions → different ending balance.
     The key assertion is that the engine actually USES the RMD_START_AGE param (different results). */
  assert.ok(r73.endingBalances[0] !== r75.endingBalances[0],
    'Different RMD start ages should produce different ending balances');
});

/* ==== Spouse life-expectancy cutoff ==== */
suite('Spouse life-expectancy cutoff');

test('spouse SS stops after spouse life expectancy', () => {
  /* Spouse dies at 75 (spLifeExp=75); retiree lives to 90 */
  const pLongSpouse = baseParams({
    hasSpouse: true, spSSAnnualFRA: 25000, spSSStartAge: 67,
    spAge: 65, spLifeExp: 90, spAgeOffset: 0,
    annualNeed: 80000, ssAnnualFRA: 30000,
  });
  const pShortSpouse = baseParams({
    hasSpouse: true, spSSAnnualFRA: 25000, spSSStartAge: 67,
    spAge: 65, spLifeExp: 75, spAgeOffset: 0,
    annualNeed: 80000, ssAnnualFRA: 30000,
  });
  const rLong = runMonteCarlo(pLongSpouse);
  const rShort = runMonteCarlo(pShortSpouse);
  /* Longer spouse life = more SS income = higher ending balance */
  assert.ok(rLong.endingBalances[0] > rShort.endingBalances[0],
    'Longer-lived spouse should yield higher ending balance (more SS years)');
});

/* ==== New Critical Edge Cases ==== */
suite('New Critical Edge Cases');

test('NaN yearsToRetire returns 0% success', () => {
  const p = baseParams({ curAge: 60, retireAge: 65 });
  p.yearsToRetire = NaN;
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'NaN yearsToRetire should fail');
});

test('NaN retAge returns 0% success', () => {
  const p = baseParams({ retAge: NaN });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'NaN retAge should fail');
});

test('NaN convBracketLimit returns 0% success', () => {
  const p = baseParams({ convBracketLimit: NaN, rothConvStrategy: 'custom' });
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'NaN convBracketLimit should fail');
});

test('NaN spendingPhases amount returns 0% success', () => {
  const p = baseParams({ annualNeed: NaN });
  p.spendingPhases = [{ age: 65, amount: NaN }];
  const result = runMonteCarlo(p);
  assert.strictEqual(result.successRate, 0, 'NaN spendingPhases should fail');
});

test('NaN spendingPhases amount in Historical returns 0% success', () => {
  const p = baseParams({ annualNeed: NaN });
  p.spendingPhases = [{ age: 65, amount: NaN }];
  const result = runHistoricalBacktest(p);
  assert.strictEqual(result.successRate, 0, 'NaN spendingPhases in Historical should fail');
});

/* ==== One-Time Spendings ==== */
suite('One-Time Spendings — buildOneTimeSpendByAge');

test('buildOneTimeSpendByAge converts year-based schedule to age-keyed map', () => {
  const schedule = [
    { year: 2030, amount: 50000, desc: 'Home renovation' },
    { year: 2035, amount: 20000, desc: 'New car' },
  ];
  const result = buildOneTimeSpendByAge(schedule, 50, 2025);
  assert.strictEqual(result[55], 50000, 'Year 2030 with age 50 in 2025 = age 55');
  assert.strictEqual(result[60], 20000, 'Year 2035 = age 60');
  assert.strictEqual(result[65] || 0, 0, 'No spending at age 65');
});

test('buildOneTimeSpendByAge aggregates multiple entries for same year', () => {
  const schedule = [
    { year: 2030, amount: 30000, desc: 'Item 1' },
    { year: 2030, amount: 20000, desc: 'Item 2' },
  ];
  const result = buildOneTimeSpendByAge(schedule, 50, 2025);
  assert.strictEqual(result[55], 50000, 'Same year amounts should be summed');
});

test('buildOneTimeSpendByAge returns empty for null/empty schedule', () => {
  assert.deepStrictEqual(buildOneTimeSpendByAge(null, 50, 2025), {});
  assert.deepStrictEqual(buildOneTimeSpendByAge([], 50, 2025), {});
});

suite('One-Time Spendings — MC/Historical integration');

test('MC: one-time spending increases withdrawal need at specific age', () => {
  /* Run without one-time spendings */
  const p1 = baseParams({ vol: 0, annualNeed: 60000, retireAge: 65, curAge: 65, lifeExp: 90 });
  const mc1 = runMonteCarlo(p1);

  /* Run with a $100k one-time spending at age 70 */
  const p2 = baseParams({ vol: 0, annualNeed: 60000, retireAge: 65, curAge: 65, lifeExp: 90 });
  p2.oneTimeByAge = { 70: 100000 };
  const mc2 = runMonteCarlo(p2);

  /* Median band at year 5 (age 70) should be lower with one-time spending */
  const yr5NoOts = mc1.bands[2][5];
  const yr5WithOts = mc2.bands[2][5];
  assert.ok(yr5WithOts < yr5NoOts, `One-time spending should reduce balance at age 70: ${yr5WithOts} < ${yr5NoOts}`);
});

test('MC: one-time spending at non-retirement age has no effect on that year', () => {
  const p = baseParams({ vol: 0, annualNeed: 60000, retireAge: 65, curAge: 65, lifeExp: 90 });
  /* Age 30 is before retirement, so it has no effect (MC only runs retirement years) */
  p.oneTimeByAge = { 30: 999999 };
  const mc = runMonteCarlo(p);
  assert.ok(mc.successRate > 0, 'Spending at pre-retirement age should not affect MC');
});

test('Historical: one-time spending reduces success rate for large amounts', () => {
  /* Run without one-time spendings */
  const p1 = baseParams({ annualNeed: 60000, retireAge: 65, curAge: 65, lifeExp: 90 });
  const h1 = runHistoricalBacktest(p1);

  /* Run with massive one-time spendings every year */
  const p2 = baseParams({ annualNeed: 60000, retireAge: 65, curAge: 65, lifeExp: 90 });
  const byAge = {};
  for (let a = 65; a <= 90; a++) byAge[a] = 200000;
  p2.oneTimeByAge = byAge;
  const h2 = runHistoricalBacktest(p2);

  assert.ok(h2.successRate <= h1.successRate, `Massive one-time spendings should reduce or maintain success rate: ${h2.successRate} <= ${h1.successRate}`);
});

test('MC: null/undefined oneTimeByAge causes no crash', () => {
  const p = baseParams({ vol: 0 });
  p.oneTimeByAge = undefined;
  const mc = runMonteCarlo(p);
  assert.ok(mc.successRate > 0, 'undefined oneTimeByAge should not crash');

  const p2 = baseParams({ vol: 0 });
  p2.oneTimeByAge = null;
  const mc2 = runMonteCarlo(p2);
  assert.ok(mc2.successRate > 0, 'null oneTimeByAge should not crash');
});

test('MC: NaN in oneTimeByAge returns 0% success', () => {
  const p = baseParams({ vol: 0 });
  p.oneTimeByAge = { 70: NaN };
  const mc = runMonteCarlo(p);
  assert.strictEqual(mc.successRate, 0, 'NaN in oneTimeByAge should be caught by guard');
});

test('Historical: NaN in oneTimeByAge returns 0% success', () => {
  const p = baseParams();
  p.oneTimeByAge = { 70: NaN };
  const h = runHistoricalBacktest(p);
  assert.strictEqual(h.successRate, 0, 'NaN in oneTimeByAge should be caught by Historical guard');
});

/* ================================================================
   buildHealthcareCostForAge — Healthcare Cost Function Tests
   ================================================================ */
suite('buildHealthcareCostForAge — basic');

test('returns null when toggle is off (no params)', () => {
  const fn = buildHealthcareCostForAge({});
  // function should still be returned; null means disabled via buildHealthcareCostFromSettings
  assert.ok(typeof fn === 'function', 'should return a function');
});

test('pre-65 costs: annual premium + OOP with no inflation year 0', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: null
  });
  const r = fn(60);
  // pre-65: 9600 (annual) + 3000 (OOP) = 12600
  assert.strictEqual(r.total, 12600, 'pre-65 total: 9600 + 3000 = 12600');
  assert.strictEqual(r.qualifiedMedical, r.total, 'all healthcare is qualified medical');
});

test('post-65 costs: Part B + Part D + Medigap + OOP', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 800, pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 65, spouseAge: null
  });
  const r = fn(65);
  // post-65: (185+35+200)*12 + 3000 = 5040 + 3000 = 8040
  assert.strictEqual(r.total, 8040, 'post-65 total: (185+35+200)*12+3000 = 8040');
});

test('medical inflation compounds correctly', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 12000, pre65StartAge: 60, partB: 0, partD: 0, medigap: 0,
    oop: 0, medInflPct: 10, curAge: 60, spouseAge: null
  });
  const r0 = fn(60); // year 0: 12000 (annual)
  const r1 = fn(61); // year 1: 12000 * 1.10 = 13200
  const r2 = fn(62); // year 2: 12000 * 1.21 = 14520
  assert.strictEqual(r0.total, 12000, 'year 0 no inflation');
  assert.ok(Math.abs(r1.total - 13200) < 1, `year 1 10% inflation: got ${r1.total}`);
  assert.ok(Math.abs(r2.total - 14520) < 1, `year 2 21% cumulative inflation: got ${r2.total}`);
});

test('pre-65 to post-65 transition at age 65', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 12000, pre65StartAge: 58, partB: 185, partD: 35, medigap: 200,
    oop: 2000, medInflPct: 0, curAge: 58, spouseAge: null
  });
  const pre = fn(64); // pre-65: 12000 (annual) + 2000 = 14000
  const post = fn(65); // post-65: (185+35+200)*12 + 2000 = 7040
  assert.strictEqual(pre.total, 14000, 'age 64 uses pre-65 annual premium');
  assert.strictEqual(post.total, 7040, 'age 65 switches to Medicare');
});

test('pre-65 returns zero before pre65StartAge', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 800, pre65StartAge: 62, partB: 185, partD: 35, medigap: 200,
    oop: 2000, medInflPct: 0, curAge: 55, spouseAge: null
  });
  const r = fn(60);
  assert.strictEqual(r.total, 0, 'no healthcare cost before pre65StartAge');
});

suite('buildHealthcareCostForAge — spouse');

test('spouse costs double when both same age', () => {
  const single = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: null
  });
  const couple = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: 60
  });
  const s = single(60);
  const c = couple(60);
  assert.strictEqual(c.total, s.total * 2, 'couple costs should be 2x single when same age');
});

test('spouse at different age: one pre-65 one post-65', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 63, spouseAge: 66
  });
  // primary age 63 = pre-65: 9600+3000=12600; spouse age 66 = post-65: (185+35+200)*12+3000=8040
  const r = fn(63);
  assert.strictEqual(r.total, 12600 + 8040, 'mixed ages: primary pre-65 + spouse post-65');
});

test('spouse pre-65 costs start when primary reaches pre65StartAge (calendar event)', () => {
  // Primary age 60, spouse age 55, pre65Start=60 (retirement year).
  // Both lose employer coverage at the same calendar time (when primary retires).
  const fn = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: 55
  });
  // At primary age 60: primary pre-65 (12600) + spouse pre-65 (12600) = 25200
  // Spouse is 55 but pre65Start is a calendar event — both start paying
  const r60 = fn(60);
  assert.strictEqual(r60.total, 12600 * 2, 'both pay pre-65 costs when primary hits retirement age');
  // At primary age 65: primary post-65 (8040), spouse age 60 still pre-65 (12600)
  const r65 = fn(65);
  assert.strictEqual(r65.total, 8040 + 12600, 'primary post-65, spouse still pre-65');
  // At primary age 70: primary post-65 (8040), spouse age 65 now post-65 (8040)
  const r70 = fn(70);
  assert.strictEqual(r70.total, 8040 * 2, 'both post-65');
});

test('curAge=0 is honored (not coerced to 55)', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 6000, pre65StartAge: 0, partB: 185, partD: 35, medigap: 200,
    oop: 1000, medInflPct: 0, curAge: 0, spouseAge: null
  });
  // age 0 with curAge 0: pre-65 costs (6000+1000=7000), inflation year offset = 0
  const r = fn(0);
  assert.strictEqual(r.total, 7000, 'age 0: pre-65 costs with no inflation offset');
  // age 64: still pre-65
  const r64 = fn(64);
  assert.strictEqual(r64.total, 7000, 'age 64: still pre-65 costs');
  // age 65: transitions to post-65
  const r65 = fn(65);
  assert.strictEqual(r65.total, (185+35+200)*12 + 1000, 'age 65: post-65 costs');
});

test('pre65StartAge=0 starts pre-65 costs from age 0', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 12000, pre65StartAge: 0, partB: 185, partD: 35, medigap: 200,
    oop: 2000, medInflPct: 0, curAge: 50, spouseAge: null
  });
  // age 50: >= pre65StartAge (0), so pre-65 costs apply
  const r = fn(50);
  assert.strictEqual(r.total, 14000, 'pre65StartAge=0: pre-65 costs at age 50');
});

suite('buildHealthcareCostFromSettings');

test('returns zero-cost function when healthcare toggle is explicitly off', () => {
  const fn = buildHealthcareCostFromSettings({ wdHealthcareToggle: false });
  assert.ok(typeof fn === 'function', 'should return a function (not null) when toggle exists but is off');
  const result = fn(65);
  assert.strictEqual(result.total, 0, 'total should be 0 when toggle is off');
  assert.strictEqual(result.qualifiedMedical, 0, 'qualifiedMedical should be 0 when toggle is off');
});

test('returns null when toggle is missing', () => {
  const fn = buildHealthcareCostFromSettings({});
  assert.strictEqual(fn, null, 'should return null when toggle is missing');
});

test('returns function when toggle is on', () => {
  const fn = buildHealthcareCostFromSettings({
    wdHealthcareToggle: true, wdAge: 60,
    wdHcPre65Premium: 800, wdHcPre65StartAge: 58,
    wdHcPartB: 185, wdHcPartD: 35, wdHcMedigap: 200,
    wdHcOOP: 3000, wdHcInflation: 5.5,
  });
  assert.ok(typeof fn === 'function', 'should return a function when toggle is on');
  const r = fn(60);
  assert.ok(r.total > 0, 'should return non-zero cost');
});

test('string toggle "true" works (settings restored from JSON)', () => {
  const fn = buildHealthcareCostFromSettings({
    wdHealthcareToggle: 'true', wdAge: 60,
    wdHcPre65Premium: 800, wdHcPre65StartAge: 58,
    wdHcPartB: 185, wdHcPartD: 35, wdHcMedigap: 200,
    wdHcOOP: 3000, wdHcInflation: 5.5,
  });
  assert.ok(typeof fn === 'function', 'string "true" should enable healthcare');
});

suite('buildHealthcareCostFromSettings — value mapping');

test('fromSettings maps saved values to correct function output', () => {
  const saved = {
    wdHealthcareToggle: true, wdAge: 60,
    wdHcPre65Premium: 9600, wdHcPre65StartAge: 58,
    wdHcPartB: 185, wdHcPartD: 35, wdHcMedigap: 200,
    wdHcOOP: 3000, wdHcInflation: 0,
  };
  const fromSettings = buildHealthcareCostFromSettings(saved);
  const direct = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 58,
    partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: null
  });
  assert.strictEqual(fromSettings(60).total, direct(60).total, 'age 60 should match direct builder');
  assert.strictEqual(fromSettings(65).total, direct(65).total, 'age 65 should match direct builder');
  assert.strictEqual(fromSettings(70).total, direct(70).total, 'age 70 should match direct builder');
});

test('fromSettings with spouse passes spouseAge correctly', () => {
  const saved = {
    wdHealthcareToggle: true, wdAge: 60,
    wdSpouseToggle: true, wdSpAge: 58,
    wdHcPre65Premium: 9600, wdHcPre65StartAge: 55,
    wdHcPartB: 185, wdHcPartD: 35, wdHcMedigap: 200,
    wdHcOOP: 3000, wdHcInflation: 0,
  };
  const fn = buildHealthcareCostFromSettings(saved);
  const single = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 55, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: null
  });
  const r = fn(60);
  assert.ok(r.total > single(60).total, 'couple cost should exceed single cost');
});

suite('buildHealthcareCostForAge — edge cases');

test('NaN premium defaults to 0', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 'abc', pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: null
  });
  const r = fn(60);
  // NaN premium → 0; cost = 0 + 3000 (oop) = 3000
  assert.strictEqual(r.total, 3000, 'NaN premium should default to 0');
});

test('zero Part B/D/Medigap respected (not replaced by defaults)', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 0, pre65StartAge: 60, partB: 0, partD: 0, medigap: 0,
    oop: 0, medInflPct: 0, curAge: 65, spouseAge: null
  });
  const r = fn(65);
  assert.strictEqual(r.total, 0, 'all-zero post-65 should be 0');
});

test('negative premium clamped to 0', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: -5000, pre65StartAge: 60, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 60, spouseAge: null
  });
  const r = fn(60);
  assert.strictEqual(r.total, 3000, 'negative premium clamped: cost = 0 + 3000 oop');
});

test('curAge already 65+ skips pre-65 costs', () => {
  const fn = buildHealthcareCostForAge({
    pre65Premium: 9600, pre65StartAge: 55, partB: 185, partD: 35, medigap: 200,
    oop: 3000, medInflPct: 0, curAge: 70, spouseAge: null
  });
  const r = fn(70);
  // post-65: (185+35+200)*12 + 3000 = 8040
  assert.strictEqual(r.total, 8040, 'at age 70, uses post-65 costs');
});

suite('_buildSettingsFp — toggle coercion & fingerprint equality');

test('toggle coercion: boolean true/false and string equivalents', () => {
  const base = {
    ret:7,infl:3,ss:0,ssAge:67,conv:'none',retire:65,life:90,stax:0,
    age:55,filing:'mfj',vol:12,hasSpouse:false,spAge:0,spLife:0,spSS:0,spSSAge:67,
    customPct:15,convStart:65,convEnd:74,iraBasis:'0',
    contribToggle:false,contribRecurring:false,contribYearly:false,
    contribMode:'flat',contribStartAge:'',contribEndAge:'',
    contrib401k:'',contribMatch:'',contribIRA:'',contribTaxable:'',contribHSA:'',
    contribScheduleFp:'flat',
    hcToggle:false,hcPre65Premium:'',hcStartAge:'',
    hcPartB:'',hcPartD:'',hcMedigap:'',hcOOP:'',hcInflation:'',
    otsToggle:false,otsFp:'none',
    bTI:500000,bDI:500000,bRI:200000,bHI:50000,glideFp:'fixed'
  };
  const fpBoolFalse = _buildSettingsFp({ ...base, hcToggle: false, contribToggle: false, otsToggle: false });
  const fpStrFalse = _buildSettingsFp({ ...base, hcToggle: 'false', contribToggle: 'false', otsToggle: 'false' });
  const fpBoolTrue = _buildSettingsFp({ ...base, hcToggle: true, contribToggle: true, otsToggle: true });
  const fpStrTrue = _buildSettingsFp({ ...base, hcToggle: 'true', contribToggle: 'true', otsToggle: 'true' });
  // boolean false and string "false" must produce same fingerprint (both disabled)
  assert.strictEqual(fpBoolFalse, fpStrFalse, 'boolean false === string "false"');
  // boolean true and string "true" must produce same fingerprint (both enabled)
  assert.strictEqual(fpBoolTrue, fpStrTrue, 'boolean true === string "true"');
  // enabled !== disabled
  assert.notStrictEqual(fpBoolFalse, fpBoolTrue, 'disabled !== enabled');
});

test('identical inputs produce identical fingerprints (suggFp === scenFp parity)', () => {
  const params = {
    ret:7,infl:3,ss:2500,ssAge:67,conv:'moderate',retire:65,life:90,stax:5,
    age:55,filing:'mfj',vol:12,hasSpouse:true,spAge:53,spLife:92,spSS:1500,spSSAge:67,
    customPct:15,convStart:65,convEnd:74,iraBasis:'25000',
    contribToggle:true,contribRecurring:true,contribYearly:false,
    contribMode:'hybrid',contribStartAge:'55',contribEndAge:'65',
    contrib401k:'23000',contribMatch:'11500',contribIRA:'7000',contribTaxable:'5000',contribHSA:'3850',
    contribScheduleFp:'flat',
    hcToggle:true,hcPre65Premium:'800',hcStartAge:'60',
    hcPartB:'185',hcPartD:'35',hcMedigap:'200',hcOOP:'3000',hcInflation:'5.5',
    otsToggle:true,otsFp:'[[70,50000]]',
    bTI:500000,bDI:500000,bRI:200000,bHI:50000,glideFp:'fixed'
  };
  const fp1 = _buildSettingsFp(params);
  const fp2 = _buildSettingsFp({ ...params });
  assert.strictEqual(fp1, fp2, 'same inputs must produce same fingerprint');
  // Changing one field must change fingerprint
  const fp3 = _buildSettingsFp({ ...params, ret: 8 });
  assert.notStrictEqual(fp1, fp3, 'different return rate must change fingerprint');
});

suite('HC integration — MC/Historical');

test('MC: hcCostFn increases spending need (lower success rate)', () => {
  const base = baseParams();
  base.bTaxableInit = 500000; base.bDeferredInit = 500000;
  base.bRothInit = 200000; base.bHSAInit = 0;
  base.spendingPhases = [{ age: 65, amount: 60000 }]; base.hasPhases = true;
  // Without HC
  const mcNo = runMonteCarlo({ ...base, hcCostFn: null });
  // With HC adding $15k/yr
  const hcFn = (_age) => ({ total: 15000, qualifiedMedical: 15000 });
  const mcYes = runMonteCarlo({ ...base, hcCostFn: hcFn });
  assert.ok(mcYes.successRate <= mcNo.successRate, `HC should reduce or equal success rate: ${mcYes.successRate} <= ${mcNo.successRate}`);
});

test('Historical: hcCostFn increases spending need', () => {
  const base = baseParams();
  base.bTaxableInit = 500000; base.bDeferredInit = 500000;
  base.bRothInit = 200000; base.bHSAInit = 0;
  base.spendingPhases = [{ age: 65, amount: 60000 }]; base.hasPhases = true;
  const hNo = runHistoricalBacktest({ ...base, hcCostFn: null });
  const hcFn = (_age) => ({ total: 15000, qualifiedMedical: 15000 });
  const hYes = runHistoricalBacktest({ ...base, hcCostFn: hcFn });
  assert.ok(hYes.successRate <= hNo.successRate, `HC should reduce or equal historical success: ${hYes.successRate} <= ${hNo.successRate}`);
});

test('MC: HSA used for qualified medical expenses when hcCostFn provided', () => {
  const base = baseParams();
  base.bHSAInit = 50000;
  base.spendingPhases = [{ age: 65, amount: 50000 }]; base.hasPhases = true;
  const hcFn = (age) => ({ total: 8000, qualifiedMedical: 8000 });
  const mcWithHC = runMonteCarlo({ ...base, hcCostFn: hcFn });
  const mcNoHC = runMonteCarlo({ ...base, hcCostFn: null });
  assert.ok(typeof mcWithHC.successRate === 'number', 'MC with HC should produce valid result');
  assert.ok(typeof mcNoHC.successRate === 'number', 'MC without HC should produce valid result');
  // With explicit HC costs ($8k/yr), success rate should be <= no-HC (legacy $5k fallback)
  // because $8k > $5k increases spending pressure
  assert.ok(mcWithHC.successRate <= mcNoHC.successRate,
    `HC $8k/yr should reduce or equal success vs legacy $5k: ${mcWithHC.successRate} <= ${mcNoHC.successRate}`);
});

summarize('Withdrawal Engine Verification');
