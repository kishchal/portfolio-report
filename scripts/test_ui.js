/**
 * Test: UI Structure and Template Validation
 * Validates DOM structure, tab integrity, theme variables, settings schema,
 * and template placeholder substitution.
 */
const { assert, test, suite, summarize, fs, path, TEMPLATE_PATH } = require('./test-helpers');

const html = fs.readFileSync(TEMPLATE_PATH, 'utf8');

/* ==== Template structure ==== */
suite('Template structure — required elements');

test('contains DOCTYPE and html tag', () => {
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<html/i);
});

test('contains all 4 main tabs', () => {
  const tabs = ['holdings', 'withdrawals', 'scenarios', 'snapshot'];
  tabs.forEach(t => {
    assert.match(html, new RegExp(`data-pivot="${t}"`), `Missing pivot tab: ${t}`);
  });
});

test('contains all 8 sub-pivot tabs', () => {
  const subs = ['acctName', 'acctType', 'category', 'xray', 'suggestions', 'rebalance', 'expenses', 'taxloss'];
  subs.forEach(s => {
    assert.match(html, new RegExp(`data-sub="${s}"`), `Missing sub-pivot tab: ${s}`);
  });
});

test('sub-tabs have icons', () => {
  assert.match(html, /🏦 By Account/);
  assert.match(html, /📂 By Account Type/);
  assert.match(html, /📊 By Investment Category/);
  assert.match(html, /🔬/);  // Fund X-Ray
  assert.match(html, /💡/);  // Suggestions
  assert.match(html, /⚖️/);  // Rebalance
  assert.match(html, /💰/);  // Expenses
  assert.match(html, /🏷️/);  // Tax-Loss
});

test('Export PDF button in holdings sub-pivot bar', () => {
  assert.match(html, /export-pdf-btn.*?exportTabToPDF\('holdings'\)/s);
});

test('holdingsSubPivot uses flex layout with space-between', () => {
  assert.match(html, /holdingsSubPivot.*?display:flex.*?justify-content:space-between/s);
});

/* ==== Template placeholders ==== */
suite('Template placeholders — all substitution markers');

test('contains DATA_JSON placeholder', () => {
  assert.match(html, /\{\{DATA_JSON\}\}/);
});

test('contains GRAND_TOTAL_NUM placeholder', () => {
  assert.match(html, /\{\{GRAND_TOTAL_NUM\}\}/);
});

test('contains SUGGESTIONS_JSON placeholder', () => {
  assert.match(html, /\{\{SUGGESTIONS_JSON\}\}/);
});

test('contains RAW_CSV_JSON placeholder', () => {
  assert.match(html, /\{\{RAW_CSV_JSON\}\}/);
});

test('contains FUND_HOLDINGS_LIVE_JSON placeholder', () => {
  assert.match(html, /\{\{FUND_HOLDINGS_LIVE_JSON\}\}/);
});

/* ==== Theme system ==== */
suite('Theme system — CSS variables and theme definitions');

test('defines data-theme attribute targets', () => {
  assert.match(html, /\[data-theme="coral"\]/);
  assert.match(html, /\[data-theme="dark"\]/);
});

test('setTheme function exists and syncs to settings', () => {
  assert.match(html, /function setTheme\(name\)/);
  assert.match(html, /documentElement\.setAttribute\('data-theme'/);
});

test('theme not restored in loadSettings (bug fix)', () => {
  // After the bug fix, loadSettings should NOT contain setTheme(s._theme)
  const loadSettingsMatch = html.match(/function loadSettings\(\)\s*\{[\s\S]*?\n\}/);
  if (loadSettingsMatch) {
    assert.ok(!/if\s*\(\s*s\._theme\s*\)\s*setTheme\s*\(/.test(loadSettingsMatch[0]),
      'loadSettings should not restore theme — bug fix removed this');
  }
});

test('cross-tab theme sync via storage event', () => {
  assert.match(html, /addEventListener\('storage'/);
});

/* ==== Settings persistence ==== */
suite('Settings persistence — save/load/export/import');

test('saveSettings function exists', () => {
  assert.match(html, /function saveSettings\(\)/);
});

test('loadSettings function exists', () => {
  assert.match(html, /function loadSettings\(\)/);
});

test('exportSettingsToFile function exists', () => {
  assert.match(html, /function exportSettingsToFile\(\)/);
});

test('importSettingsFromFile function exists', () => {
  assert.match(html, /function importSettingsFromFile\b/);
});

test('Settings dropdown has Save and Load options', () => {
  assert.match(html, /Save Settings/);
  assert.match(html, /Load Settings/);
});

test('Settings dropdown has Export CSV option', () => {
  assert.match(html, /Export Data \(CSV\)/);
});

/* ==== Content containers ==== */
suite('Content containers — dedicated render targets');

test('allocOverview container exists', () => {
  assert.match(html, /id="allocOverview"/);
});

test('drilldown container exists', () => {
  assert.match(html, /id="drilldown"/);
});

test('xrayContent container exists', () => {
  assert.match(html, /id="xrayContent"/);
});

test('rebalanceContent container exists', () => {
  assert.match(html, /id="rebalanceContent"/);
});

test('expensesContent container exists', () => {
  assert.match(html, /id="expensesContent"/);
});

test('suggestionsContent container exists', () => {
  assert.match(html, /id="suggestionsContent"/);
});

test('taxlossContent container exists', () => {
  assert.match(html, /id="taxlossContent"/);
});

/* ==== Key functions exist ==== */
suite('Key function declarations present');

const requiredFunctions = [
  'fmt', 'fmt2', 'esc', 'pct', 'ylink',
  'buildMetricCharts', 'switchChart', 'toggleChartPV',
  'buildSSBreakEven',
  'renderAcctTypePivot', 'renderCategoryPivot', 'renderAcctNamePivot',
  'computeFundXRay', 'renderFundXRay',
  'renderRebalance', 'renderRebalResult', 'generateRebalTrades',
  'renderExpenses',
  'computeCurrentAlloc', 'renderSuggestions',
  'calcLTCG', 'getStdDeduction', 'calcIRMAA', 'calcSSTaxableAmount', 'calcTax',
  'randNormal', 'runMonteCarlo',
  'getAllRetirementAccounts', 'getAccountBuckets',
  'getAnnualExpenseForAge', 'getSpendPhases',
  'renderWithdrawals', 'computeWithdrawalPlan',
  'renderWdTable',
  'renderTaxLoss',
  'renderSnapshotDiff', 'sdParseFidelityCSV', 'sdComputeDiff',
  'renderScenarios', 'runScenarioComparison',
  'saveSettings', 'loadSettings',
  'exportSettingsToFile', 'importSettingsFromFile',
  'exportTabToPDF', 'exportCSV',
  '_renderHoldingsSubPivot',
];

requiredFunctions.forEach(fn => {
  test(`function ${fn}() declared`, () => {
    assert.match(html, new RegExp(`function ${fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
      `Missing function declaration: ${fn}`);
  });
});

/* ==== Print/Export ==== */
suite('Print and Export features');

test('Export PDF buttons for each main tab', () => {
  ['holdings', 'withdrawals', 'scenarios', 'snapshot'].forEach(tab => {
    assert.match(html, new RegExp(`exportTabToPDF\\('${tab}'\\)`),
      `Missing Export PDF for ${tab}`);
  });
});

test('exportCSV function generates timestamped filename', () => {
  const exportCSVBlock = html.match(/function exportCSV\(\)[\s\S]*?\n\}/);
  assert.ok(exportCSVBlock, 'exportCSV function not found');
  assert.match(exportCSVBlock[0], /toISOString/);
});

/* ==== CSS class consistency ==== */
suite('CSS classes and styles');

test('export-pdf-btn class defined in styles', () => {
  assert.match(html, /\.export-pdf-btn\s*\{/);
});

test('pivot-tab class defined', () => {
  assert.match(html, /\.pivot-tab/);
});

test('sub-pivot-tab class defined', () => {
  assert.match(html, /\.sub-pivot-tab/);
});

test('@media print hides interactive elements', () => {
  assert.match(html, /@media print/);
});

/* ==== Backward compatibility ==== */
suite('Backward compatibility');

test('startup IIFE migrates old suggestions/taxloss tab choices', () => {
  // The IIFE should check for _activeTab of suggestions/taxloss and migrate
  assert.match(html, /savedTab\s*===\s*'suggestions'/);
  assert.match(html, /savedTab\s*===\s*'taxloss'/);
});

test('holdingsSubPivot display set to flex on tab switch', () => {
  assert.match(html, /holdingsSubPivot.*?\.style\.display.*?=.*?'flex'/s);
});

summarize('UI Structure');
