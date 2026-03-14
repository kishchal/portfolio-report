/**
 * Test: Formatting Utilities
 * Tests fmt, fmt2, esc, pct, ylink functions
 */
const { assert, test, suite, summarize, extractFormattingFunctions } = require('./test-helpers');

const { fmt, fmt2, esc, pct, ylink } = extractFormattingFunctions();

suite('fmt — currency with 2 decimals');
test('formats positive value', () => {
  assert.strictEqual(fmt(1234.56), '$1,234.56');
});
test('formats zero', () => {
  assert.strictEqual(fmt(0), '$0.00');
});
test('formats large value', () => {
  assert.strictEqual(fmt(1000000), '$1,000,000.00');
});
test('formats small decimal', () => {
  assert.strictEqual(fmt(0.99), '$0.99');
});
test('formats negative value', () => {
  // Node's toLocaleString produces $-500.50 (dollar sign before minus)
  const result = fmt(-500.5);
  assert.ok(result.includes('500.50'), `Should contain 500.50, got ${result}`);
  assert.ok(result.includes('-'), `Should contain minus sign, got ${result}`);
});

suite('fmt2 — rounded whole-dollar currency');
test('rounds down', () => {
  assert.strictEqual(fmt2(1234.49), '$1,234');
});
test('rounds up', () => {
  assert.strictEqual(fmt2(1234.51), '$1,235');
});
test('formats zero', () => {
  assert.strictEqual(fmt2(0), '$0');
});
test('formats millions', () => {
  assert.strictEqual(fmt2(5000000), '$5,000,000');
});

suite('esc — HTML entity escaping');
test('escapes ampersand', () => {
  assert.strictEqual(esc('A&B'), 'A&amp;B');
});
test('escapes angle brackets', () => {
  assert.strictEqual(esc('<script>'), '&lt;script&gt;');
});
test('escapes double quotes', () => {
  assert.strictEqual(esc('"hello"'), '&quot;hello&quot;');
});
test('handles numbers', () => {
  assert.strictEqual(esc(42), '42');
});
test('handles empty string', () => {
  assert.strictEqual(esc(''), '');
});

suite('pct — percentage of grand total (GRAND=1,000,000)');
test('10% of 1M', () => {
  assert.strictEqual(pct(100000), '10.0%');
});
test('0.1% precision', () => {
  assert.strictEqual(pct(1000), '0.1%');
});
test('100% of portfolio', () => {
  assert.strictEqual(pct(1000000), '100.0%');
});
test('zero value', () => {
  assert.strictEqual(pct(0), '0.0%');
});

suite('ylink — Yahoo Finance link generation');
test('simple ticker gets link', () => {
  const result = ylink('AAPL');
  assert.match(result, /finance\.yahoo\.com\/quote\/AAPL/);
  assert.match(result, /target="_blank"/);
});
test('ticker with trailing stars gets cleaned link', () => {
  const result = ylink('SPAXX**');
  assert.match(result, /quote\/SPAXX/);
  /* Display text should preserve original */
  assert.match(result, /SPAXX\*\*/);
});
test('non-ticker (long name) returns escaped text', () => {
  const result = ylink('SOME LONG DESCRIPTION');
  assert.ok(!result.includes('finance.yahoo.com'));
});
test('empty string returns escaped empty', () => {
  assert.strictEqual(ylink(''), '');
});

summarize('Formatting');
