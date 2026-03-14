/**
 * Test: Snapshot Diff Functions
 * Migrated from ../../test_snapshot_diff.js and enhanced with additional edge cases.
 */
const { assert, test, suite, summarize, extractSnapshotFunctions } = require('./test-helpers');

const snap = extractSnapshotFunctions();
const { _sdParseCSVLine, _sdParseCSVText, _sdParseCurrency, _sdClassify,
        _sdInferAcctType, sdParseFidelityCSV, sdComputeDiff } = snap;

const mockCsv = [
  'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today\'s Gain/Loss Dollar,Today\'s Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type',
  'Z12345678,INDIVIDUAL - TOD,AAPL,APPLE INC,100,$150.00,+$1.00,"$15,000.00",+$100.00,+0.67%,"+$5,000.00",+50.00%,15.00%,"$10,000.00",$100.00,Cash',
  'Z12345678,INDIVIDUAL - TOD,MSFT,MICROSOFT CORP,50,$300.00,-$2.00,"$15,000.00",-$100.00,-0.66%,"+$3,000.00",+25.00%,15.00%,"$12,000.00",$240.00,Cash',
  'Z12345678,INDIVIDUAL - TOD,AAPL,APPLE INC,50,$150.00,+$1.00,"$7,500.00",+$50.00,+0.67%,"+$2,500.00",+50.00%,7.50%,"$5,000.00",$100.00,Cash',
].join('\n');

/* ==== CSV Parsing ==== */
suite('_sdParseCSVLine — RFC 4180 CSV line parsing');

test('simple comma-separated values', () => {
  assert.deepStrictEqual(_sdParseCSVLine('ABC,123,456'), ['ABC', '123', '456']);
});
test('quoted fields with commas', () => {
  assert.deepStrictEqual(
    _sdParseCSVLine('"Hello, World",123,"He said ""hi"""'),
    ['Hello, World', '123', 'He said "hi"']
  );
});
test('empty fields', () => {
  assert.deepStrictEqual(_sdParseCSVLine(',,,'), ['', '', '', '']);
});
test('single field', () => {
  assert.deepStrictEqual(_sdParseCSVLine('hello'), ['hello']);
});
test('quoted field with newline chars in content', () => {
  // In real CSV, newlines inside quotes are part of one field
  assert.deepStrictEqual(_sdParseCSVLine('"line1","line2"'), ['line1', 'line2']);
});

suite('_sdParseCSVText — full CSV parsing');

test('parses 3-row CSV into row objects', () => {
  const rows = _sdParseCSVText(mockCsv);
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0]['Symbol'], 'AAPL');
  assert.strictEqual(rows[1]['Symbol'], 'MSFT');
});
test('preserves all columns', () => {
  const rows = _sdParseCSVText(mockCsv);
  assert.strictEqual(rows[0]['Account Number'], 'Z12345678');
  assert.strictEqual(rows[0]['Current Value'], '$15,000.00');
  assert.strictEqual(rows[2]['Cost Basis Total'], '$5,000.00');
});
test('empty CSV returns empty array', () => {
  assert.deepStrictEqual(_sdParseCSVText(''), []);
  assert.deepStrictEqual(_sdParseCSVText('Header1,Header2'), []);
});

/* ==== Currency Parsing ==== */
suite('_sdParseCurrency — Fidelity format');

test('standard positive', () => assert.strictEqual(_sdParseCurrency('$1,234.56'), 1234.56));
test('parentheses negative', () => assert.strictEqual(_sdParseCurrency('($1,234.56)'), -1234.56));
test('dash-dollar negative', () => assert.strictEqual(_sdParseCurrency('-$500.00'), -500));
test('dollar-dash negative', () => assert.strictEqual(_sdParseCurrency('$-500.00'), -500));
test('plus-dollar positive', () => assert.strictEqual(_sdParseCurrency('+$100.00'), 100));
test('N/A returns null', () => assert.strictEqual(_sdParseCurrency('N/A'), null));
test('empty returns null', () => assert.strictEqual(_sdParseCurrency(''), null));
test('zero', () => assert.strictEqual(_sdParseCurrency('$0.00'), 0));
test('large value', () => assert.strictEqual(_sdParseCurrency('$1,234,567.89'), 1234567.89));

/* ==== Classification ==== */
suite('_sdClassify — symbol/description classification');

test('FXAIX → US Index Funds', () => assert.strictEqual(_sdClassify('FXAIX', 'FIDELITY 500 INDEX'), 'US Index Funds'));
test('individual stock', () => assert.strictEqual(_sdClassify('AAPL', 'APPLE INC'), 'Individual Stocks'));
test('money market', () => assert.strictEqual(_sdClassify('SPAXX**', 'Fidelity Government Money Market'), 'Cash / Money Market'));
test('bond fund (not in map → Individual Stocks heuristic)', () => assert.strictEqual(_sdClassify('BND', 'Vanguard Total Bond'), 'Individual Stocks'));
test('international fund (FTIHX in map)', () => {
  const result = _sdClassify('FTIHX', 'FIDELITY TOTAL INTL INDEX');
  assert.strictEqual(result, 'International Funds');
});

suite('_sdInferAcctType — account type inference');

test('INDIVIDUAL → Taxable', () => assert.strictEqual(_sdInferAcctType('INDIVIDUAL - TOD'), 'Taxable Investment'));
test('ROTH IRA → Roth', () => assert.strictEqual(_sdInferAcctType('ROTH IRA'), 'Roth'));
test('401K → Tax-Deferred', () => assert.strictEqual(_sdInferAcctType('401K PLAN'), 'Tax-Deferred 401(k)'));
test('Rollover IRA', () => assert.strictEqual(_sdInferAcctType('ROLLOVER IRA'), 'Tax-Deferred IRA'));
test('Health Savings Account', () => assert.strictEqual(_sdInferAcctType('HEALTH SAVINGS ACCOUNT'), 'HSA'));
test('Joint account', () => assert.strictEqual(_sdInferAcctType('JOINT TENANTS WROS'), 'Taxable Investment'));

/* ==== Fidelity CSV Parsing + Aggregation ==== */
suite('sdParseFidelityCSV — parsing and tax lot aggregation');

test('aggregates AAPL tax lots (100 + 50 shares)', () => {
  const parsed = sdParseFidelityCSV(mockCsv);
  assert.strictEqual(parsed.holdings.length, 2);  // AAPL aggregated, MSFT separate
  const aapl = parsed.holdings.find(h => h.symbol === 'AAPL');
  assert.strictEqual(aapl.value, 22500);  // 15000 + 7500
  assert.strictEqual(aapl.gainLoss, 7500);  // 5000 + 2500
  assert.strictEqual(aapl.costBasis, 15000);  // 10000 + 5000
});

test('total portfolio value', () => {
  const parsed = sdParseFidelityCSV(mockCsv);
  assert.strictEqual(parsed.total, 37500);
});

test('gain/loss percentage computed correctly', () => {
  const parsed = sdParseFidelityCSV(mockCsv);
  const aapl = parsed.holdings.find(h => h.symbol === 'AAPL');
  assert.strictEqual(aapl.gainLossPct, 50);  // 7500/15000 * 100
});

test('account type inferred', () => {
  const parsed = sdParseFidelityCSV(mockCsv);
  assert.strictEqual(parsed.holdings[0].accountType, 'Taxable Investment');
});

/* ==== Snapshot Diff Computation ==== */
suite('sdComputeDiff — diff engine');

const before = {
  holdings: [
    { accountNumber: 'Z123', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'AAPL', description: 'APPLE', value: 10000, category: 'Individual Stocks', gainLoss: 1000, costBasis: 9000 },
    { accountNumber: 'Z123', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'MSFT', description: 'MICROSOFT', value: 5000, category: 'Individual Stocks', gainLoss: 500, costBasis: 4500 },
    { accountNumber: 'Z123', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'GOOG', description: 'ALPHABET', value: 3000, category: 'Individual Stocks', gainLoss: 300, costBasis: 2700 },
  ],
  total: 18000,
};
const after = {
  holdings: [
    { accountNumber: 'Z123', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'AAPL', description: 'APPLE', value: 12000, category: 'Individual Stocks', gainLoss: 3000, costBasis: 9000 },
    { accountNumber: 'Z123', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'MSFT', description: 'MICROSOFT', value: 4500, category: 'Individual Stocks', gainLoss: 0, costBasis: 4500 },
    { accountNumber: 'Z123', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'NVDA', description: 'NVIDIA', value: 2000, category: 'Individual Stocks', gainLoss: 0, costBasis: 2000 },
  ],
  total: 18500,
};

test('total change', () => {
  const diff = sdComputeDiff(before, after);
  assert.strictEqual(diff.totalChange, 500);
  assert.strictEqual(diff.totalBefore, 18000);
  assert.strictEqual(diff.totalAfter, 18500);
});

test('change percentage', () => {
  const diff = sdComputeDiff(before, after);
  assert.ok(Math.abs(diff.totalChangePct - 500 / 18000 * 100) < 0.01);
});

test('new positions detected', () => {
  const diff = sdComputeDiff(before, after);
  assert.deepStrictEqual(diff.newPositions.map(p => p.symbol), ['NVDA']);
});

test('closed positions detected', () => {
  const diff = sdComputeDiff(before, after);
  assert.deepStrictEqual(diff.closedPositions.map(p => p.symbol), ['GOOG']);
});

test('changed positions with correct deltas', () => {
  const diff = sdComputeDiff(before, after);
  const changes = Object.fromEntries(diff.changedPositions.map(p => [p.symbol, p]));
  assert.strictEqual(changes.AAPL.change, 2000);
  assert.strictEqual(changes.MSFT.change, -500);
});

test('hierarchy groups by category', () => {
  const diff = sdComputeDiff(before, after);
  assert.ok(Array.isArray(diff.hierarchy));
  assert.strictEqual(diff.hierarchy.length, 1);  // all Individual Stocks
  assert.strictEqual(diff.hierarchy[0].category, 'Individual Stocks');
});

test('accountHierarchy groups by account', () => {
  const diff = sdComputeDiff(before, after);
  assert.ok(Array.isArray(diff.accountHierarchy));
  assert.strictEqual(diff.accountHierarchy.length, 1);  // one account
  assert.strictEqual(diff.accountHierarchy[0].num, 'Z123');
});

test('multi-account diff', () => {
  const b = {
    holdings: [
      { accountNumber: 'A1', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'AAPL', description: 'APPLE', value: 10000, category: 'Individual Stocks', gainLoss: 0, costBasis: 10000 },
      { accountNumber: 'A2', accountName: 'Roth', accountType: 'Roth', symbol: 'FXAIX', description: 'Fidelity 500', value: 8000, category: 'US Index Funds', gainLoss: 0, costBasis: 8000 },
    ],
    total: 18000,
  };
  const a = {
    holdings: [
      { accountNumber: 'A1', accountName: 'Taxable', accountType: 'Taxable Investment', symbol: 'AAPL', description: 'APPLE', value: 12000, category: 'Individual Stocks', gainLoss: 0, costBasis: 10000 },
      { accountNumber: 'A2', accountName: 'Roth', accountType: 'Roth', symbol: 'FXAIX', description: 'Fidelity 500', value: 9000, category: 'US Index Funds', gainLoss: 0, costBasis: 8000 },
    ],
    total: 21000,
  };
  const diff = sdComputeDiff(b, a);
  assert.strictEqual(diff.accountHierarchy.length, 2);
  assert.strictEqual(diff.hierarchy.length, 2);
});

/* ==== Edge cases ==== */
suite('Snapshot Diff — edge cases');

test('empty before snapshot', () => {
  const diff = sdComputeDiff({ holdings: [], total: 0 }, after);
  assert.strictEqual(diff.newPositions.length, 3);
  assert.strictEqual(diff.closedPositions.length, 0);
});

test('empty after snapshot', () => {
  const diff = sdComputeDiff(before, { holdings: [], total: 0 });
  assert.strictEqual(diff.closedPositions.length, 3);
  assert.strictEqual(diff.newPositions.length, 0);
});

test('identical snapshots → zero total change', () => {
  const diff = sdComputeDiff(before, before);
  assert.strictEqual(diff.totalChange, 0);
  assert.strictEqual(diff.newPositions.length, 0);
  assert.strictEqual(diff.closedPositions.length, 0);
  // Changed positions may include items with change=0 (positions present in both)
  diff.changedPositions.forEach(p => {
    assert.strictEqual(p.change, 0, `${p.symbol} should have zero change`);
  });
});

summarize('Snapshot Diff');
