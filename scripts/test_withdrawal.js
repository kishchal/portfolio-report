/**
 * Test: Withdrawal / Retirement Planning Formulas
 * Tests spending phases, Monte Carlo helpers, present value, retirement projections
 */
const { assert, test, suite, summarize, extractSpendingFunctions,
        extractFinancialFunctions } = require('./test-helpers');

const fin = extractFinancialFunctions();
const spending = extractSpendingFunctions({ CMA: fin.CMA });
const { getAnnualExpenseForAge, PHASE_TAGS, buildGlideSchedule, getReturnForAge } = spending;

/* ==== getAnnualExpenseForAge ==== */
suite('getAnnualExpenseForAge — phase-based spending');

test('no phases → returns 0 (use 4% rule)', () => {
  assert.strictEqual(getAnnualExpenseForAge(65, []), 0);
  assert.strictEqual(getAnnualExpenseForAge(65, null), 0);
});

test('single phase covers all ages', () => {
  const phases = [{ age: 60, amount: 5000 }];
  assert.strictEqual(getAnnualExpenseForAge(65, phases), 60000);
  assert.strictEqual(getAnnualExpenseForAge(80, phases), 60000);
  assert.strictEqual(getAnnualExpenseForAge(95, phases), 60000);
});

test('before first phase → returns 0', () => {
  const phases = [{ age: 65, amount: 5000 }];
  assert.strictEqual(getAnnualExpenseForAge(60, phases), 0);
});

test('multiple phases — Go-Go / Slow-Go / No-Go', () => {
  const phases = [
    { age: 60, amount: 8000 },
    { age: 75, amount: 6000 },
    { age: 85, amount: 4000 },
  ];
  assert.strictEqual(getAnnualExpenseForAge(65, phases), 96000);  // 8000*12
  assert.strictEqual(getAnnualExpenseForAge(75, phases), 72000);  // 6000*12
  assert.strictEqual(getAnnualExpenseForAge(80, phases), 72000);  // still 6000*12
  assert.strictEqual(getAnnualExpenseForAge(85, phases), 48000);  // 4000*12
  assert.strictEqual(getAnnualExpenseForAge(95, phases), 48000);  // still 4000*12
});

test('exact boundary age picks new phase', () => {
  const phases = [
    { age: 65, amount: 5000 },
    { age: 75, amount: 3000 },
  ];
  assert.strictEqual(getAnnualExpenseForAge(75, phases), 36000);  // 3000*12
});

test('zero amount phase (SS-only)', () => {
  const phases = [
    { age: 60, amount: 5000 },
    { age: 80, amount: 0 },
  ];
  assert.strictEqual(getAnnualExpenseForAge(85, phases), 0);
});

/* ==== PHASE_TAGS ==== */
suite('PHASE_TAGS — Go-Go / Slow-Go / No-Go classification');

test('age ≤ 74 → Go-Go', () => {
  assert.strictEqual(PHASE_TAGS[0].label, 'Go-Go');
  assert.strictEqual(PHASE_TAGS[0].max, 74);
});

test('age 75-84 → Slow-Go', () => {
  assert.strictEqual(PHASE_TAGS[1].label, 'Slow-Go');
  assert.strictEqual(PHASE_TAGS[1].max, 84);
});

test('age 85+ → No-Go', () => {
  assert.strictEqual(PHASE_TAGS[2].label, 'No-Go');
  assert.strictEqual(PHASE_TAGS[2].max, 999);
});

/* ==== Present Value / Inflation formulas ==== */
suite('Present Value / Inflation calculations');

test('PV of $100K in 10 years at 3% inflation', () => {
  const fv = 100000;
  const inflPct = 0.03;
  const years = 10;
  const pv = fv / Math.pow(1 + inflPct, years);
  assert.ok(Math.abs(pv - 74409.39) < 1, `Expected ~74409, got ${pv}`);
});

test('inflation multiplier after 20 years at 3%', () => {
  const mult = Math.pow(1.03, 20);
  assert.ok(Math.abs(mult - 1.8061) < 0.001);
});

test('FV of $50K growing at 7% for 15 years', () => {
  const fv = 50000 * Math.pow(1.07, 15);
  assert.ok(Math.abs(fv - 137952) < 100, `Expected ~137952, got ${fv}`);
});

/* ==== 4% rule guardrails ==== */
suite('4% Rule with guardrails');

test('base 4% withdrawal', () => {
  const totalAtRetire = 2000000;
  const fallback = totalAtRetire * 0.04;
  assert.strictEqual(fallback, 80000);
});

test('guardrail clamps to 3.5% floor', () => {
  const curTotal = 1500000;
  const need = 40000;
  const clamped = Math.max(curTotal * 0.035, Math.min(curTotal * 0.055, need));
  assert.ok(Math.abs(clamped - 52500) < 0.01, `Expected ~52500, got ${clamped}`);
});

test('guardrail clamps to 5.5% ceiling', () => {
  const curTotal = 1000000;
  const need = 100000;  // very high
  const clamped = Math.max(curTotal * 0.035, Math.min(curTotal * 0.055, need));
  assert.strictEqual(clamped, 55000);  // 1000000 * 0.055
});

test('within guardrails → use original need', () => {
  const curTotal = 2000000;
  const need = 80000;  // 4%
  const clamped = Math.max(curTotal * 0.035, Math.min(curTotal * 0.055, need));
  assert.strictEqual(clamped, 80000);
});

/* ==== RMD calculation ==== */
suite('RMD — Required Minimum Distribution');

test('RMD at age 73 for $1M deferred', () => {
  const bD = 1000000;
  const div = fin.RMD_TABLE[73];
  const rmd = bD / div;
  assert.ok(Math.abs(rmd - 37735.85) < 0.1);
});

test('RMD at age 80 for $500K deferred', () => {
  const rmd = 500000 / fin.RMD_TABLE[80];
  const expected = 500000 / 20.2;
  assert.ok(Math.abs(rmd - expected) < 0.1);
});

test('no RMD before RMD start age', () => {
  const age = 72;
  const RMD_START_AGE = 75;
  const rmd = age >= RMD_START_AGE ? 1000000 / fin.RMD_TABLE[age] : 0;
  assert.strictEqual(rmd, 0);
});

test('RMD divisor decreases with age', () => {
  assert.ok(fin.RMD_TABLE[73] > fin.RMD_TABLE[80]);
  assert.ok(fin.RMD_TABLE[80] > fin.RMD_TABLE[90]);
  assert.ok(fin.RMD_TABLE[90] > fin.RMD_TABLE[100]);
});

/* ==== Monte Carlo — log-normal drift ==== */
suite('Monte Carlo — log-normal drift formula');

test('drift formula: mu = ln(1+ret) - vol²/2', () => {
  const retPct = 0.07;
  const vol = 0.15;
  const mu = Math.log(1 + retPct) - vol * vol / 2;
  const expected = Math.log(1.07) - 0.0225 / 2;
  assert.ok(Math.abs(mu - expected) < 0.0001);
});

test('expected return from log-normal = exp(mu + vol²/2) - 1', () => {
  const retPct = 0.07;
  const vol = 0.15;
  const mu = Math.log(1 + retPct) - vol * vol / 2;
  const expectedRet = Math.exp(mu + vol * vol / 2) - 1;
  assert.ok(Math.abs(expectedRet - retPct) < 0.0001);
});

/* ==== Roth conversion bracket room ==== */
suite('Roth conversion — bracket room calculation');

test('bracket room = limit + stdDed - existing income', () => {
  const convBracketLimit = 206700;  // top of 22% MFJ
  const stdDed = 31500;
  const existingIncome = 80000;
  const room = Math.max(0, convBracketLimit + stdDed - existingIncome);
  assert.strictEqual(room, 158200);
});

test('negative room → no conversion', () => {
  const room = Math.max(0, 206700 + 31500 - 300000);
  assert.strictEqual(room, 0);
});

test('basis fraction reduces effective room', () => {
  const remainingBasis = 20000;
  const totalIRA = 200000;
  const basisFraction = remainingBasis / totalIRA;
  const bracketRoom = 100000;
  const effectiveRoom = bracketRoom / (1 - basisFraction);
  // 100000 / 0.9 = 111111.11
  assert.ok(Math.abs(effectiveRoom - 111111.11) < 1);
});

/* ==== HSA medical allowance ==== */
suite('HSA — medical spending allowance');

test('HSA medical allowance after 65', () => {
  const age = 70;
  const inflMult = Math.pow(1.03, 5);  // 5 years of inflation
  const annMed = age >= 65 ? 5000 * inflMult : 0;
  assert.ok(annMed > 5000 && annMed < 6000);
});

test('no HSA medical before 65', () => {
  const annMed = 60 >= 65 ? 5000 : 0;
  assert.strictEqual(annMed, 0);
});

test('HSA early withdrawal penalty before 65', () => {
  const penalty = 0.20;
  const hsaNonMed = 10000;
  const penaltyAmt = hsaNonMed * penalty;
  assert.strictEqual(penaltyAmt, 2000);
});

/* ==== Withdrawal sequencing ==== */
suite('Withdrawal sequencing — account ordering');

test('pre-RMD: taxable first, then deferred (bracket room), then Roth', () => {
  const target = 100000;
  const bT = 200000, bD = 500000, bR = 300000;
  const bracketLim = 150000;
  let rem = target;
  const wT = Math.min(rem, bT); rem -= wT;
  const wD = Math.min(rem, bracketLim, bD); rem -= wD;
  const wR = Math.min(rem, bR); rem -= wR;
  assert.strictEqual(wT, 100000);
  assert.strictEqual(wD, 0);
  assert.strictEqual(wR, 0);
});

test('pre-RMD: taxable exhausted, fill deferred to bracket', () => {
  const target = 100000;
  const bT = 30000;
  let rem = target;
  const wT = Math.min(rem, bT); rem -= wT;
  const bracketLim = 50000;
  const bD = 500000;
  const wD = Math.min(rem, bracketLim, bD); rem -= wD;
  const bR = 300000;
  const wR = Math.min(rem, bR); rem -= wR;
  assert.strictEqual(wT, 30000);
  assert.strictEqual(wD, 50000);
  assert.strictEqual(wR, 20000);
});

test('post-RMD: RMD first, then taxable, then deferred surplus', () => {
  const rmd = 40000;
  const target = 100000;
  const bT = 200000, bD = 500000;
  let rem = target;
  let wD = Math.min(rmd, bD); rem -= wD;
  const wT = Math.min(rem, bT); rem -= wT;
  assert.strictEqual(wD, 40000);
  assert.strictEqual(wT, 60000);
  assert.strictEqual(rem, 0);
});

/* ==== Monte Carlo simulation engine ==== */
suite('runMonteCarlo — behavioral tests');

// runMonteCarlo calls getAnnualExpenseForAge which is in a different extraction block.
// Inject it into the financial extraction environment.
const finMC = extractFinancialFunctions({ getAnnualExpenseForAge, getReturnForAge });
const { runMonteCarlo, TAX_BRACKETS_MFJ, TAX_BRACKETS_SINGLE } = finMC;
const finHist = extractFinancialFunctions({ getAnnualExpenseForAge, getReturnForAge });
const { runHistoricalBacktest, HIST_RETURNS, CMA } = finHist;

// Base params for Monte Carlo — fill all destructured fields
function mcParams(overrides = {}) {
  return {
    nSims: 10, yearsInRetirement: 5, yearsToRetire: 0,
    retAge: 65, retPct: 0.07, inflPct: 0.03, vol: 0.15,
    filing: 'MFJ',
    bTaxableInit: 200000, bDeferredInit: 500000, bRothInit: 100000, bHSAInit: 0,
    totalAtRetire: 800000,
    ssAnnualFRA: 24000, ssStartAge: 67,
    spSSAnnualFRA: 12000, spSSStartAge: 67,
    hasSpouse: true, spAgeOffset: 0,
    lifeExp: 90, spLifeExp: 90, curAge: 65, spAge: 65,
    rothConvStrategy: 'none', convBracketLimit: Infinity,
    brackets: TAX_BRACKETS_MFJ,
    RMD_START_AGE: 75,
    spendingPhases: [], hasPhases: false,
    glideSchedule: null,
    stateTaxPct: 0,
    ...overrides,
  };
}

function sampleCustomGlideSchedule() {
  return buildGlideSchedule(55, 85, 'custom', [
    { age: 55, eqPct: 70 },
    { age: 85, eqPct: 20 },
  ], 55);
}

test('runMonteCarlo returns expected structure', () => {
  const result = runMonteCarlo(mcParams());
  assert.ok(result.bands, 'should have bands');
  assert.deepStrictEqual(result.pctiles, [10, 25, 50, 75, 90]);
  assert.strictEqual(result.nSims, 10);
  assert.ok(typeof result.successRate === 'number');
  assert.strictEqual(result.bands.length, 5);
  assert.strictEqual(result.bands[0].length, 5); // one entry per year of retirement
});

test('100% success with no withdrawals and positive returns', () => {
  const result = runMonteCarlo(mcParams({
    nSims: 50, yearsInRetirement: 3, vol: 0.001,
    bTaxableInit: 1000000, bDeferredInit: 0, bRothInit: 0, bHSAInit: 0,
    totalAtRetire: 1000000,
    ssAnnualFRA: 0, spSSAnnualFRA: 0,
    hasSpouse: false, hasPhases: false, spendingPhases: [],
  }));
  assert.strictEqual(result.successRate, 100);
});

test('ending balances has one entry per simulation', () => {
  const result = runMonteCarlo(mcParams({
    nSims: 25, yearsInRetirement: 2,
    filing: 'Single', brackets: TAX_BRACKETS_SINGLE,
    bTaxableInit: 100000, bDeferredInit: 300000, bRothInit: 100000, bHSAInit: 50000,
    totalAtRetire: 550000,
    ssAnnualFRA: 18000, spSSAnnualFRA: 0,
    hasSpouse: false,
    spendingPhases: [{ age: 65, amount: 3000 }], hasPhases: true,
  }));
  assert.strictEqual(result.endingBalances.length, 25);
});

test('percentile bands are monotonically ordered', () => {
  const result = runMonteCarlo(mcParams({ nSims: 100 }));
  for (let yr = 0; yr < result.bands[0].length; yr++) {
    for (let b = 0; b < result.bands.length - 1; b++) {
      assert.ok(result.bands[b][yr] <= result.bands[b + 1][yr],
        `Band ${result.pctiles[b]} should be <= ${result.pctiles[b+1]} at year ${yr}`);
    }
  }
});

test('mcParams defaults glideSchedule to null', () => {
  assert.strictEqual(mcParams().glideSchedule, null);
});

/* ==== Glide path schedule helpers ==== */
suite('buildGlideSchedule — age-based allocation schedule');

test('fixed mode returns null', () => {
  assert.strictEqual(buildGlideSchedule(65, 90, 'fixed', [], 55), null);
});

test('glidepath mode returns schedule entries with age, eqPct, ret, vol', () => {
  const schedule = buildGlideSchedule(65, 90, 'glidepath', [], 55);
  assert.ok(Array.isArray(schedule));
  assert.ok(schedule.length > 0);
  schedule.forEach(entry => {
    assert.ok(typeof entry.age === 'number');
    assert.ok(typeof entry.eqPct === 'number');
    assert.ok(typeof entry.ret === 'number');
    assert.ok(typeof entry.vol === 'number');
  });
});

test('glidepath equity decreases with age', () => {
  const schedule = buildGlideSchedule(65, 90, 'glidepath', [], 55);
  assert.ok(schedule[0].eqPct > schedule[schedule.length - 1].eqPct);
});

test('glidepath equity stays between 20% and 80%', () => {
  const schedule = buildGlideSchedule(65, 90, 'glidepath', [], 55);
  schedule.forEach(entry => {
    assert.ok(entry.eqPct >= 20 && entry.eqPct <= 80,
      `Expected eqPct between 20 and 80, got ${entry.eqPct} at age ${entry.age}`);
  });
});

test('custom mode uses supplied waypoints', () => {
  const schedule = sampleCustomGlideSchedule();
  assert.strictEqual(schedule[0].age, 55);
  assert.strictEqual(schedule[0].eqPct, 70);
  assert.strictEqual(schedule[schedule.length - 1].age, 85);
  assert.strictEqual(schedule[schedule.length - 1].eqPct, 20);
  assert.strictEqual(schedule.length, 31);
});

test('custom step interpolation holds equity flat until the next waypoint', () => {
  const schedule = buildGlideSchedule(55, 75, 'custom', [
    { age: 55, eqPct: 70 },
    { age: 65, eqPct: 50 },
    { age: 75, eqPct: 30 },
  ], 55, 'step');
  assert.strictEqual(getReturnForAge(schedule, 60).eqPct, 70);
  assert.strictEqual(getReturnForAge(schedule, 65).eqPct, 70);
  assert.strictEqual(getReturnForAge(schedule, 66).eqPct, 50);
  assert.strictEqual(getReturnForAge(schedule, 75).eqPct, 30);
});

test('custom mode interpolates equity between waypoints', () => {
  const schedule = sampleCustomGlideSchedule();
  const age70 = schedule.find(entry => entry.age === 70);
  assert.ok(age70, 'Expected an entry for age 70');
  assert.ok(Math.abs(age70.eqPct - 45) < 0.001, `Expected ~45, got ${age70.eqPct}`);
});

suite('getReturnForAge — glide schedule lookup');

test('null schedule returns fallback value', () => {
  assert.strictEqual(getReturnForAge(null, 65, 0.07), 0.07);
});

test('schedule returns matching entry for age', () => {
  const schedule = sampleCustomGlideSchedule();
  const age70 = schedule.find(entry => entry.age === 70);
  assert.deepStrictEqual(getReturnForAge(schedule, 70), age70);
});

test('age beyond schedule returns last entry', () => {
  const schedule = sampleCustomGlideSchedule();
  assert.deepStrictEqual(getReturnForAge(schedule, 95), schedule[schedule.length - 1]);
});

suite('runHistoricalBacktest — behavioral tests');

test('HIST_RETURNS has 1926-based historical data', () => {
  assert.ok(Array.isArray(HIST_RETURNS));
  assert.ok(HIST_RETURNS.length > 90, `Expected >90 rows, got ${HIST_RETURNS.length}`);
  assert.strictEqual(HIST_RETURNS[0][0], 1926);
});

test('runHistoricalBacktest returns expected structure', () => {
  const result = runHistoricalBacktest(mcParams({ nSims: 10 }));
  assert.ok(typeof result.nPeriods === 'number');
  assert.ok(typeof result.successRate === 'number');
  assert.ok(Array.isArray(result.bands));
  assert.ok(Array.isArray(result.worst5));
  assert.ok(Array.isArray(result.results));
});

test('historical backtest evaluates multiple periods', () => {
  const result = runHistoricalBacktest(mcParams());
  assert.ok(result.nPeriods > 0, `Expected historical periods, got ${result.nPeriods}`);
});

test('historical success rate stays between 0 and 100', () => {
  const result = runHistoricalBacktest(mcParams());
  assert.ok(result.successRate >= 0 && result.successRate <= 100,
    `Expected successRate between 0 and 100, got ${result.successRate}`);
});

test('historical bands track each year of retirement', () => {
  const params = mcParams({ yearsInRetirement: 7 });
  const result = runHistoricalBacktest(params);
  assert.strictEqual(result.bands.length, 5);
  result.bands.forEach(band => assert.strictEqual(band.length, params.yearsInRetirement));
});

test('historical zero-spending plan succeeds in every period', () => {
  const result = runHistoricalBacktest(mcParams({
    spendingPhases: [{ age: 65, amount: 0 }],
    hasPhases: true,
  }));
  assert.strictEqual(result.successRate, 100);
});

test('worst5 contains at most five results', () => {
  const result = runHistoricalBacktest(mcParams());
  assert.ok(result.worst5.length <= 5, `Expected at most 5 worst periods, got ${result.worst5.length}`);
});

test('historical backtest accepts glide schedules', () => {
  const glideSchedule = buildGlideSchedule(65, 90, 'glidepath', [], 55);
  const result = runHistoricalBacktest(mcParams({ glideSchedule }));
  assert.ok(result.nPeriods > 0);
  assert.ok(result.results.length === result.nPeriods);
  assert.ok(CMA.equity.ret > CMA.bonds.ret);
});

summarize('Withdrawal & Retirement');
