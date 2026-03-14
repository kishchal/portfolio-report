/**
 * Shared test harness for portfolio-report template.html
 *
 * Extracts JavaScript functions and constants from the single-file HTML template
 * by eval-ing code blocks between markers, with a mock DOM/browser environment.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_PATH = path.resolve(__dirname, '..', 'assets', 'template.html');

/* ---- Lightweight DOM / browser mocks ---- */
function buildMockEnv(overrides = {}) {
  const storage = {};
  return {
    CATEGORY_COLORS: {},
    ALLOC_COLORS: { eq: '#2563eb', intl: '#f59e0b', bond: '#6366f1', cash: '#10b981', reit: '#ec4899', alt: '#94a3b8', other: '#d1d5db' },
    DATA: overrides.DATA || [],
    GRAND: overrides.GRAND || 0,
    SUGG_METRICS: overrides.SUGG_METRICS || {},
    RAW_CSV: overrides.RAW_CSV || [],
    FUND_HOLDINGS_DB: overrides.FUND_HOLDINGS_DB || {},
    FUND_META: overrides.FUND_META || {},
    MODELS: overrides.MODELS || { high: { name: 'Aggressive', alloc: [] }, medium: { name: 'Moderate', alloc: [] }, low: { name: 'Conservative', alloc: [] } },
    RISK_COLORS: {},
    RISK_ORDER: [],
    fmt: (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmt2: (v) => '$' + Math.round(v).toLocaleString('en-US'),
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pct: (v) => (overrides.GRAND || 0) > 0 ? (v / (overrides.GRAND || 1) * 100).toFixed(1) + '%' : '0.0%',
    ylink: (v) => String(v),
    localStorage: {
      _data: storage,
      getItem(k) { return storage[k] || null; },
      setItem(k, v) { storage[k] = v; },
      removeItem(k) { delete storage[k]; },
    },
    alert() {},
    showToast() {},
    document: {
      _elemCache: {},
      _makeElem(id) {
        return {
          id,
          style: {},
          innerHTML: '',
          value: '',
          textContent: '',
          checked: false,
          addEventListener() {},
          classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
          nextElementSibling: { classList: { toggle() {} } },
          querySelectorAll() { return []; },
          querySelector() { return null; },
          appendChild() {},
          removeChild() {},
        };
      },
      getElementById(id) {
        if (!this._elemCache[id]) this._elemCache[id] = this._makeElem(id);
        return this._elemCache[id];
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          style: {},
          innerHTML: '',
          className: '',
          appendChild() {},
          addEventListener() {},
          querySelectorAll() { return []; },
          querySelector() { return null; },
          click() {},
          setAttribute() {},
          getAttribute() { return null; },
          classList: { toggle() {}, add() {}, remove() {} },
        };
      },
      body: { appendChild() {}, removeChild() {} },
      documentElement: { setAttribute() {}, getAttribute() { return ''; } },
    },
    FileReader: function FileReader() {
      this.readAsText = () => {};
      this.onload = null;
    },
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    URL: { createObjectURL() { return 'blob:mock'; }, revokeObjectURL() {} },
    window: overrides.window || {},
    Blob: function Blob() {},
    console,
    Math,
    Date,
    Array,
    Object,
    Map,
    Set,
    Number,
    String,
    JSON,
    RegExp,
    Error,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    encodeURIComponent,
    decodeURIComponent,
    /* Spread any extra overrides not handled above (e.g., injected functions) */
    ...Object.fromEntries(
      Object.entries(overrides).filter(([k]) =>
        !['DATA','GRAND','SUGG_METRICS','RAW_CSV','FUND_HOLDINGS_DB','FUND_META','MODELS'].includes(k)
      )
    ),
  };
}

/**
 * Extract a block of JS from template.html between two marker strings.
 * Returns the raw source code string.
 */
function extractBlock(startMarker, endMarker) {
  const text = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) throw new Error(`Start marker not found: ${startMarker}`);
  const endIdx = endMarker ? text.indexOf(endMarker, startIdx) : text.length;
  if (endIdx === -1) throw new Error(`End marker not found: ${endMarker}`);
  return text.slice(startIdx, endIdx);
}

/**
 * Extract and evaluate a block of JS, returning specified exports.
 * @param {string} startMarker - Start of code block
 * @param {string} endMarker - End of code block
 * @param {string[]} exports - Function/variable names to return
 * @param {object} envOverrides - Overrides for the mock environment
 * @returns {object} - Map of name → value
 */
function extractFunctions(startMarker, endMarker, exports, envOverrides = {}) {
  const code = extractBlock(startMarker, endMarker);
  const env = buildMockEnv(envOverrides);

  const envKeys = Object.keys(env);
  const envVals = envKeys.map(k => env[k]);

  const returnStmt = exports.map(e => `  ${e}: typeof ${e} !== 'undefined' ? ${e} : undefined`).join(',\n');
  const wrappedCode = `(function(${envKeys.join(',')}) {\n${code}\nreturn {\n${returnStmt}\n};\n})`;

  try {
    const factory = eval(wrappedCode);
    return factory(...envVals);
  } catch (e) {
    throw new Error(`Failed to extract functions [${exports.join(', ')}]: ${e.message}\n${e.stack}`);
  }
}

/**
 * Extract the full financial calculation block (tax brackets through Monte Carlo).
 */
function extractFinancialFunctions(envOverrides = {}) {
  return extractFunctions(
    '/* IRS Uniform Lifetime Table',
    '/* Get all retirement-eligible accounts',
    [
      'RMD_TABLE',
      'TAX_BRACKETS_MFJ', 'TAX_BRACKETS_SINGLE',
      'LTCG_BRACKETS_MFJ', 'LTCG_BRACKETS_SINGLE',
      'STD_DEDUCTION_MFJ', 'STD_DEDUCTION_SINGLE',
      'EXTRA_STD_DED_MFJ', 'EXTRA_STD_DED_SINGLE',
      'OBBBA_SENIOR_DED', 'OBBBA_THRESHOLD_MFJ', 'OBBBA_THRESHOLD_SINGLE',
      'SS_AGE_FACTOR',
      'IRMAA_BRACKETS_MFJ', 'IRMAA_BRACKETS_SINGLE',
      'calcLTCG', 'getStdDeduction', 'calcIRMAA', 'calcSSTaxableAmount', 'calcTax',
      'randNormal', 'runMonteCarlo', 'percentile',
    ],
    envOverrides
  );
}

/**
 * Extract formatting utilities.
 */
function extractFormattingFunctions() {
  return extractFunctions(
    '/* ==== Formatting Utilities ==== */',
    '/* ==== End Formatting Utilities ==== */',
    ['fmt', 'fmt2', 'esc', 'pct', 'ylink'],
    { GRAND: 1000000 }
  );
}

/**
 * Extract snapshot diff functions.
 */
function extractSnapshotFunctions(envOverrides = {}) {
  return extractFunctions(
    '/* ==== Snapshot Diff ==== */',
    '/* ---- Spending Phases',
    [
      '_sdParseCSVLine', '_sdParseCSVText', '_sdParseCurrency',
      '_sdClassify', '_sdInferAcctType',
      'sdParseFidelityCSV', 'sdComputeDiff', 'sdFlattenCurrentData',
      'sdExtractDate', 'sdDaySpan',
    ],
    envOverrides
  );
}

/**
 * Extract spending phase and contribution helpers.
 */
function extractSpendingFunctions(envOverrides = {}) {
  return extractFunctions(
    '/* ---- Spending Phases (age-based',
    'function renderWithdrawals()',
    [
      'PHASE_TAGS', 'getPhaseTag', 'getAnnualExpenseForAge',
    ],
    envOverrides
  );
}

/**
 * Extract allocation functions.
 */
function extractAllocationFunctions(envOverrides = {}) {
  return extractFunctions(
    'function computeCurrentAlloc()',
    'function renderSuggestions()',
    [
      'computeCurrentAlloc', 'allocBar',
    ],
    envOverrides
  );
}

/* ---- Simple test runner ---- */
let _passed = 0, _failed = 0, _failures = [];

function test(name, fn) {
  try {
    fn();
    _passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    _failed++;
    _failures.push({ name, error: e });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function suite(name) {
  console.log(`\n${name}`);
}

function summarize(label) {
  const total = _passed + _failed;
  console.log(`\n${'='.repeat(50)}`);
  if (_failed === 0) {
    console.log(`All ${total} ${label} tests passed.`);
  } else {
    console.log(`${_passed}/${total} ${label} tests passed, ${_failed} FAILED.`);
    _failures.forEach(f => {
      console.log(`  FAIL: ${f.name}`);
      console.log(`    ${f.error.message}`);
    });
    process.exit(1);
  }
}

module.exports = {
  assert,
  fs,
  path,
  TEMPLATE_PATH,
  buildMockEnv,
  extractBlock,
  extractFunctions,
  extractFinancialFunctions,
  extractFormattingFunctions,
  extractSnapshotFunctions,
  extractSpendingFunctions,
  extractAllocationFunctions,
  test,
  suite,
  summarize,
};
