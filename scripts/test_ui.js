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

test('withdrawals template includes glide path toggle and mode selector', () => {
  assert.match(html, /id="wdGlideToggle"/);
  assert.match(html, /id="wdGlidePanel"/);
  assert.match(html, /id="wdGlideMode"/);
  assert.match(html, /function onGlideToggleChange\b/);
});

test('custom glide UI includes interpolation toggle controls', () => {
  assert.match(html, /id="wdGlideInterp"/);
  assert.match(html, /id="glideInterpLinear"/);
  assert.match(html, /id="glideInterpStep"/);
  assert.match(html, /function setGlideInterp\(/);
  assert.match(html, /function getGlideInterp\(/);
});

test('withdrawals template includes Monte Carlo and historical backtest sections', () => {
  assert.match(html, /wd-sec-mc-analysis/);
  assert.match(html, /wd-sec-hist-backtest/);
});

test('historical returns dataset is embedded in template', () => {
  assert.match(html, /HIST_RETURNS/);
});

test('capital market assumptions constant is embedded in template', () => {
  assert.match(html, /const CMA/);
});

test('scenario comparator includes shared glide path option', () => {
  assert.match(html, /scSharedGlide/);
});

test('glide mode preserves fixed return and volatility snapshots', () => {
  assert.match(html, /_savedFixedReturn/);
  assert.match(html, /_savedFixedVol/);
  assert.match(html, /priorMode==='fixed'&&usingGlide/);
  assert.match(html, /priorMode!=='fixed'&&glideMode==='fixed'/);
});

test('onGlideToggleChange captures return/vol before enabling and restores after disabling', () => {
  /* Verify capture happens BEFORE onGlideModeChange when enabling */
  assert.match(html, /onGlideToggleChange\(checked\)\{[\s\S]*?if\(checked\)\{[\s\S]*?_savedFixedReturn=retEl\.value[\s\S]*?onGlideModeChange\(mode\)/);
  /* Verify restore happens AFTER onGlideModeChange when disabling */
  assert.match(html, /onGlideModeChange\('fixed'\)[\s\S]*?savedRet.*?_savedFixedReturn/);
  /* Verify data-fixed-return/vol fallback mechanism */
  assert.match(html, /data-fixed-return/);
  assert.match(html, /data-fixed-vol/);
});

test('return/vol fields track user edits with data attributes for glide restore', () => {
  /* Event listener captures user edits to data-fixed-return/vol when not in glide mode */
  assert.match(html, /retTrack\.addEventListener\('input'/);
  assert.match(html, /volTrack\.addEventListener\('input'/);
  assert.match(html, /setAttribute\('data-fixed-return'/);
  assert.match(html, /setAttribute\('data-fixed-vol'/);
});

test('glide-derived assumption display is marked informational', () => {
  assert.match(html, /data-glide-display/);
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
  'buildMetricCharts', 'switchChart',
  'buildSSBreakEven',
  'renderAcctTypePivot', 'renderCategoryPivot', 'renderAcctNamePivot',
  'computeFundXRay', 'renderFundXRay',
  'renderRebalance', 'renderRebalResult', 'generateRebalTrades',
  'renderExpenses',
  'computeCurrentAlloc', 'renderSuggestions',
  'calcLTCG', 'getStdDeduction', 'calcIRMAA', 'calcSSTaxableAmount', 'calcTax',
  'randNormal', 'runMonteCarlo', 'runHistoricalBacktest',
  'getAllRetirementAccounts', 'getAccountBuckets',
  'getAnnualExpenseForAge', 'getSpendPhases', 'buildGlideSchedule', 'getReturnForAge',
  'renderWithdrawals', 'computeWithdrawalPlan',
  'toggleSimMode', 'getGlideInterp', 'onGlideModeChange', 'setGlideInterp', 'renderGlideMiniChart',
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

/* ==== Regression: contribution row delete button on the right ==== */
suite('Contribution row delete button — right-side placement');

test('addContribYear places delete button after cy-fields, not inside cy-badge', () => {
  // Delete button should come AFTER cy-fields closing tag (as a sibling, not nested)
  assert.match(html, /<\/div>`\s*\+\s*\n\s*\s*`<button type="button" class="spend-phase-del" onclick="this\.closest\('\.contrib-year-row'\)/);
});

test('cy-badge does not contain a delete button', () => {
  // Extract the addContribYear function
  const fnMatch = html.match(/function addContribYear[\s\S]*?^}/m);
  assert.ok(fnMatch, 'addContribYear function found');
  const fnBody = fnMatch[0];
  // cy-badge should NOT contain spend-phase-del
  const badgeContent = fnBody.match(/`<div class="cy-badge">`[\s\S]*?<\/div>`/);
  assert.ok(badgeContent, 'cy-badge div found');
  assert.ok(!badgeContent[0].includes('spend-phase-del'), 'Delete button should not be inside cy-badge');
});

test('contrib-year-row CSS has right-side delete button flex styling', () => {
  assert.match(html, /\.contrib-year-row\s*>\s*\.spend-phase-del/);
});

/* ==== Regression: glide chart styling matches Account Balances ==== */
suite('Glide chart — professional styling');

test('glide chart SVG uses proportional scaling, border, and card background', () => {
  assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(html, /background:var\(--card\);border:1px solid var\(--border\);border-radius:8px/);
});

test('glide chart uses wide viewBox for full-width display', () => {
  assert.match(html, /const w=1100,h=300/);
});

test('glide chart Y-axis uses dashed grid lines and richer area opacity', () => {
  assert.match(html, /stroke="var\(--border\)" stroke-dasharray="4"/);
  assert.match(html, /fill="var\(--success\)" opacity="0\.22"/);
  assert.match(html, /fill="var\(--primary\)" opacity="0\.35"/);
});

test('custom glide chart supports waypoint dots and step geometry', () => {
  assert.match(html, /const wpDots=\(getEffectiveWdGlideMode\(\)==='custom'\)/);
  assert.match(html, /eqLineParts\.push\(`L \$\{toX\(point\.age\)\.toFixed\(1\)\} \$\{toY\(schedule\[index-1\]\.eqPct\)\.toFixed\(1\)\}`\)/);
  assert.match(html, /const isStep=glideInterp==='step'/);
});

test('glide chart hover uses getScreenCTM for accurate coordinate mapping', () => {
  assert.match(html, /getScreenCTM/);
  assert.match(html, /glide-hover-rect/);
  assert.match(html, /createSVGPoint/);
  assert.match(html, /matrixTransform/);
});

/* ==== Regression: showWithdrawalSuggestions declares contribution variables ==== */
suite('Spending suggestions — contribution variable declarations');

test('showWithdrawalSuggestions declares contribEnabled from saved settings', () => {
  const fnMatch = html.match(/function showWithdrawalSuggestions\(\)\{[\s\S]*?^\}/m);
  assert.ok(fnMatch, 'showWithdrawalSuggestions function found');
  const fn = fnMatch[0];
  assert.match(fn, /const contribEnabled=/, 'contribEnabled must be declared');
  assert.match(fn, /const contribMode=/, 'contribMode must be declared');
  assert.match(fn, /const contribStartAge=/, 'contribStartAge must be declared');
  assert.match(fn, /const contribEndAge=/, 'contribEndAge must be declared');
  assert.match(fn, /const contrib401k=/, 'contrib401k must be declared');
  assert.match(fn, /const contribMatch=/, 'contribMatch must be declared');
  assert.match(fn, /const contribIRA=/, 'contribIRA must be declared');
  assert.match(fn, /const contribTaxable=/, 'contribTaxable must be declared');
  assert.match(fn, /const contribHSA=/, 'contribHSA must be declared');
  assert.match(fn, /const contribSchedule=/, 'contribSchedule must be declared');
});

test('suggestions fingerprint uses shared _buildSettingsFp helper', () => {
  // The fingerprint should use the shared helper for consistency with _scenFp
  const fpMatch = html.match(/const _suggFp=_buildSettingsFp\(/);
  assert.ok(fpMatch, 'Suggestions fingerprint uses _buildSettingsFp helper');
  // Verify _scenFp also uses the same helper
  const scenMatch = html.match(/const _scenFp=_buildSettingsFp\(/);
  assert.ok(scenMatch, 'Scenario fingerprint uses _buildSettingsFp helper');
});

/* ==== Regression: glide dropdown width and return field UX ==== */
suite('Glide panel — dropdown width and disabled field UX');

test('glide strategy dropdown has wider CSS override (220px)', () => {
  assert.match(html, /#wdGlidePanel\s*\.wd-field\s*select\s*\{\s*width:\s*220px/);
});

test('return/vol fields get title tooltip when glide is active', () => {
  assert.match(html, /retEl\.title=usingGlide\?'Auto-calculated from Glide Path/);
  assert.match(html, /volEl\.title=usingGlide\?'Auto-calculated from Glide Path/);
});

test('glide-display fields have CSS opacity and not-allowed cursor', () => {
  assert.match(html, /data-glide-display="true"\].*opacity:\s*0\.55.*cursor:\s*not-allowed/);
});

/* ==== Regression: glide chart age ticks every 2 years ==== */
suite('Glide chart — age tick density');

test('x-axis ticks use step of 2 for denser labels', () => {
  assert.match(html, /for\(let age=startAge;age<=endAge;age\+=2\)/);
});

/* ==== Regression: glide details table uses wd-tbl styling ==== */
suite('Glide details table — matches SS table');

test('glide details table uses wd-tbl-wrap and wd-tbl classes', () => {
  assert.match(html, /glide-chart-details.*wd-tbl-wrap.*wd-tbl/);
});

test('glide table retirement row uses success-bg like SS table', () => {
  assert.match(html, /isBest\?'background:var\(--success-bg\);font-weight:600'/);
});

test('glide table retirement row label includes Retirement text', () => {
  assert.match(html, /\$\{point\.age\}\$\{isBest\?' — Retirement':''\}/);
});

/* ==== Regression: tooltip accuracy (code review findings) ==== */
suite('Tooltip accuracy — review findings');

test('Filing Status tooltip does NOT suggest MFS users select Single', () => {
  // MFS has different brackets from Single — tooltip must not mislead
  assert.doesNotMatch(html, /if spouse files separately/i,
    'Filing Status tooltip should not suggest MFS users pick Single');
});

test('Conv. End Age tooltip mentions all birth-year-dependent RMD ages', () => {
  // RMD start: 72 (born ≤1950), 73 (1951-1959), 75 (1960+)
  assert.match(html, /Born 1950/, 'Should mention born 1950 or earlier rule');
  assert.match(html, /Born 1951/, 'Should mention born 1951-1959 rule');
  assert.match(html, /Born 1960/, 'Should mention born 1960+ rule');
  assert.match(html, /RMDs at 72/, 'Should show RMD age 72');
  assert.match(html, /RMDs at 73/, 'Should show RMD age 73');
  assert.match(html, /RMDs at 75/, 'Should show RMD age 75');
});

test('Conv. End Age tooltip does NOT claim user can extend past cap', () => {
  // The code clamps convEndAge to RMD_START_AGE - 1
  assert.doesNotMatch(html, /You can extend past 72/,
    'Conv. End Age tooltip should not claim conversions can extend past the cap');
});

test('Expected Return tooltip mentions glide path auto-override', () => {
  const retLabel = html.match(/Expected Return %<\/label>/);
  assert.ok(retLabel, 'Expected Return label should exist');
  // Find the tooltip on the label before it
  const retTooltip = html.match(/title="[^"]*glide[^"]*"[^>]*>Expected Return %/i);
  assert.ok(retTooltip, 'Expected Return tooltip should mention glide path');
});

test('Volatility tooltip mentions glide path auto-override', () => {
  const volTooltip = html.match(/title="[^"]*glide[^"]*"[^>]*>Volatility %/i);
  assert.ok(volTooltip, 'Volatility tooltip should mention glide path');
});

/* ==== Regression: PV column in Roth Optimizer ==== */
suite('Roth Optimizer — PV column');

test('optimizer results include endTotalPV and endRothPV fields', () => {
  assert.match(html, /endTotalPV:lastRow\.bTotal\/Math\.pow\(1\+inflPct/);
  assert.match(html, /endRothPV:lastRow\.bRoth\/Math\.pow\(1\+inflPct/);
});

test('Roth optimizer table uses pv-mid/pv-end data attributes for PV toggle', () => {
  assert.match(html, /id="wd-roth-opt-tbl"/, 'Table has id for PV refresh');
  assert.match(html, /class="pv-mid".*data-fv=/, 'Has pv-mid cells with data-fv');
  assert.match(html, /class="pv-end".*data-fv=/, 'Has pv-end cells with data-fv');
});

test('Roth optimizer removed dedicated PV column', () => {
  assert.ok(!html.includes('Ending Total (PV)</th>'), 'No dedicated PV column header');
});

/* ==== Regression: withdrawal input section order ==== */
suite('Withdrawal input order — You → Spouse → Income → Assumptions → Glide');

test('You section appears before Spouse toggle', () => {
  const youIdx = html.indexOf('You</div>');
  const spouseIdx = html.indexOf('Include Spouse');
  assert.ok(youIdx > 0, 'You section should exist');
  assert.ok(spouseIdx > 0, 'Spouse toggle should exist');
  assert.ok(youIdx < spouseIdx, 'You section must come before Spouse toggle');
});

test('Spouse toggle appears before Income toggle', () => {
  const spouseIdx = html.indexOf('id="wdSpouseToggle"');
  const incomeIdx = html.indexOf('id="wdContribToggle"');
  assert.ok(spouseIdx > 0, 'Spouse toggle should exist');
  assert.ok(incomeIdx > 0, 'Income toggle should exist');
  assert.ok(spouseIdx < incomeIdx, 'Spouse toggle must come before Income toggle');
});

test('Income section appears before Plan Assumptions', () => {
  const incomeIdx = html.indexOf('\u{1F4B0} Include Income');
  const assumIdx = html.indexOf('Plan Assumptions');
  assert.ok(assumIdx > 0, 'Plan Assumptions section should exist');
  assert.ok(incomeIdx < assumIdx, 'Income must come before Plan Assumptions');
});

test('Plan Assumptions appears before Glide Path toggle', () => {
  const assumIdx = html.indexOf('Plan Assumptions');
  const glideIdx = html.indexOf('Enable Retirement Glide Path');
  assert.ok(glideIdx > 0, 'Glide Path toggle should exist');
  assert.ok(assumIdx < glideIdx, 'Plan Assumptions must come before Glide Path');
});

/* ==== Regression: every withdrawal label has a tooltip ==== */
suite('Withdrawal labels — all have tooltips');

test('all You section labels have title attributes (scoped by ID)', () => {
  // Scope to the actual You fields by checking tooltip is adjacent to the specific input ID
  const youFields = [
    {id: 'wdAge', label: 'Current Age'},
    {id: 'wdRetire', label: 'Retirement Age'},
    {id: 'wdLife', label: 'Life Expectancy'},
    {id: 'wdSSIncome', label: 'Monthly SS Income'},
    {id: 'wdSSAge', label: 'SS Starting Age'},
  ];
  youFields.forEach(({id, label}) => {
    const re = new RegExp(`title="[^"]+">${label.replace(/[()]/g, '\\$&')}</label>.*?id="${id}"`);
    assert.match(html, re, `"${label}" (${id}) in You section should have a tooltip`);
  });
});

test('all Plan Assumptions labels have title attributes', () => {
  ['Expected Return %', 'Volatility %', 'Inflation %', 'Filing Status', 'Roth Conversion'].forEach(label => {
    const re = new RegExp(`title="[^"]+">\\s*${label.replace(/[()%]/g, '\\$&')}`);
    assert.match(html, re, `"${label}" should have a tooltip`);
  });
});

test('Conv Start/End Age labels have title attributes', () => {
  ['Conv. Start Age', 'Conv. End Age'].forEach(label => {
    const re = new RegExp(`title="[^"]+">\\s*${label.replace(/\./g, '\\.')}`);
    assert.match(html, re, `"${label}" should have a tooltip`);
  });
});

/* ==== Regression: What-If Glide Path field alignment ==== */
suite('What-If page — Glide Path alignment');

test('Glide Path field in What-If has margin-bottom:0 like siblings', () => {
  // Find the HTML element line with id="scSharedGlide" (the select), verify its wrapper has margin-bottom:0
  assert.match(html, /margin-bottom:0[^`]*id="scSharedGlide"/,
    'Glide Path field wrapper should have margin-bottom:0 before scSharedGlide select');
});

test('Glide Path select has consistent padding with other profile inputs', () => {
  assert.match(html, /id="scSharedGlide"[^>]*padding:5px 6px/,
    'Glide Path select should have padding:5px 6px');
});

test('What-If profile inputs are at least 90px wide', () => {
  const profileInputs = html.match(/id="scShared(Age|Vol|SpAge|SpLife|SpSSAge)"[^>]*/g) || [];
  assert.ok(profileInputs.length >= 4, 'Should find multiple profile inputs');
  profileInputs.forEach(inp => {
    const w = inp.match(/width:(\d+)px/);
    assert.ok(w, `Input should have width: ${inp.slice(0,40)}`);
    assert.ok(parseInt(w[1]) >= 90, `Width should be >= 90px: ${inp.slice(0,40)}`);
  });
});

/* ==== Regression: 457(b)/403(b) bucket classification ==== */
suite('Account bucket — 457(b) and 403(b) classification');

test('TAX_DEFERRED_TYPES includes 457(b) and 403(b)', () => {
  assert.match(html, /Tax-Deferred 457\(b\)/);
  assert.match(html, /Tax-Deferred 403\(b\)/);
  // Both should be in the TAX_DEFERRED_TYPES array
  const typesMatch = html.match(/TAX_DEFERRED_TYPES\s*=\s*\[([^\]]+)\]/);
  assert.ok(typesMatch, 'TAX_DEFERRED_TYPES constant should exist');
  assert.match(typesMatch[1], /457\(b\)/, '457(b) should be in TAX_DEFERRED_TYPES');
  assert.match(typesMatch[1], /403\(b\)/, '403(b) should be in TAX_DEFERRED_TYPES');
});

test('TAX_GROUPS deferred uses TAX_DEFERRED_TYPES not hardcoded list', () => {
  // Tax treatment table should reference TAX_DEFERRED_TYPES to stay in sync
  assert.match(html, /types:TAX_DEFERRED_TYPES/,
    'TAX_GROUPS deferred should reference TAX_DEFERRED_TYPES constant');
});

/* ==== Regression: POST-RETIRE badge refresh ==== */
suite('POST-RETIRE badge — dynamic refresh');

test('refreshContribPostRetireBadges function exists', () => {
  assert.match(html, /function refreshContribPostRetireBadges\(\)/);
});

test('refreshContribPostRetireBadges is called in computeWithdrawalPlan', () => {
  assert.match(html, /function computeWithdrawalPlan[\s\S]*?refreshContribPostRetireBadges\(\)/);
});

test('wdRetire change triggers badge refresh', () => {
  assert.match(html, /wdRetire.*addEventListener.*change.*refreshContribPostRetireBadges|retireEl.*addEventListener.*change.*refreshContribPostRetireBadges/);
});

/* ==== Regression: DCP help notes ==== */
suite('DCP help notes');

test('account selector has DCP help note', () => {
  assert.match(html, /DCP.*Deferred Comp.*deselect.*Year-by-Year/s);
});

test('Income section has DCP help note', () => {
  assert.match(html, /contribPanel[\s\S]*?DCP.*Deferred Comp.*Year-by-Year/);
});

/* ==== Regression: global formatters for methodology panels ==== */
suite('Global formatters — _fmtK and _fmtD');

test('_fmtD global function is defined', () => {
  assert.match(html, /function _fmtD\(v\)\{/);
});

test('_fmtK global function is defined', () => {
  assert.match(html, /function _fmtK\(v\)\{/);
});

test('_fmtK handles millions and thousands', () => {
  assert.match(html, /_fmtK.*v>=1e6/);
  assert.match(html, /_fmtK.*v>=1e3/);
});

/* ==== Regression: methodology panels use global formatters (not out-of-scope locals) ==== */
suite('Methodology panels — use global _fmtK/_fmtD');

test('Account Type methodology uses _fmtK not bare fmtK', () => {
  const fn = html.match(/renderAcctTypePivot\(\)\{[\s\S]*?computeInsights\('acctType'\)/);
  assert.ok(fn, 'renderAcctTypePivot not found');
  const meth = fn[0].substring(fn[0].indexOf('Data-driven methodology'));
  assert.ok(meth.includes('_fmtK('), 'Should use _fmtK');
  assert.ok(!meth.match(/[^_]fmtK\(/), 'Must not use bare fmtK (out of scope)');
});

test('Category methodology uses _fmtK not bare fmtK', () => {
  const fn = html.match(/renderCategoryPivot\(\)\{[\s\S]*?computeInsights\('category'\)/);
  assert.ok(fn, 'renderCategoryPivot not found');
  const meth = fn[0].substring(fn[0].indexOf('Data-driven methodology'));
  assert.ok(meth.includes('_fmtK('), 'Should use _fmtK');
  assert.ok(!meth.match(/[^_]fmtK\(/), 'Must not use bare fmtK');
});

test('By Account methodology uses _fmtK not bare fmtK', () => {
  const fn = html.match(/renderAcctNamePivot\(\)\{[\s\S]*?computeInsights\('acctName'\)/);
  assert.ok(fn, 'renderAcctNamePivot not found');
  const meth = fn[0].substring(fn[0].indexOf('Data-driven methodology'));
  assert.ok(meth.includes('_fmtK('), 'Should use _fmtK');
  assert.ok(!meth.match(/[^_]fmtK\(/), 'Must not use bare fmtK');
});

test('Fund X-Ray methodology uses _fmtK not bare fmtK', () => {
  const block = html.match(/const methXray=\[\];[\s\S]*?buildMethodologyPanel\('Fund X-Ray/);
  assert.ok(block, 'X-Ray methodology not found');
  assert.ok(block[0].includes('_fmtK('), 'Should use _fmtK');
  assert.ok(!block[0].match(/[^_]fmtK\(/), 'Must not use bare fmtK');
});

test('Rebalance methodology uses _fmtK not bare fmtK', () => {
  const block = html.match(/const methRebal=\[\];[\s\S]*?buildMethodologyPanel\('Rebalance/);
  assert.ok(block, 'Rebalance methodology not found');
  assert.ok(block[0].includes('_fmtK('), 'Should use _fmtK');
  assert.ok(!block[0].match(/[^_]fmtK\(/), 'Must not use bare fmtK');
});

test('Suggestions methodology uses _fmtK not bare fmtK', () => {
  const block = html.match(/const methSugg=\[\];[\s\S]*?buildMethodologyPanel\('Suggestions/);
  assert.ok(block, 'Suggestions methodology not found');
  assert.ok(block[0].includes('_fmtK('), 'Should use _fmtK');
  assert.ok(!block[0].match(/[^_]fmtK\(/), 'Must not use bare fmtK');
});

test('Suggestions methodology uses MODELS[k].name not .label', () => {
  const block = html.match(/const methSugg=\[\];[\s\S]*?buildMethodologyPanel\('Suggestions/);
  assert.ok(block, 'Suggestions methodology not found');
  assert.ok(block[0].includes('MODELS[k].name'), 'Should reference MODELS[k].name');
  assert.ok(!block[0].includes('MODELS[k].label'), 'Must not reference MODELS[k].label (does not exist)');
});

test('Snapshot methodology uses _fmtD not bare fmtD', () => {
  const block = html.match(/const methSnap=\[\];[\s\S]*?buildMethodologyPanel\('Snapshot/);
  assert.ok(block, 'Snapshot methodology not found');
  assert.ok(block[0].includes('_fmtD('), 'Should use _fmtD');
  assert.ok(!block[0].match(/[^_]fmtD\(/), 'Must not use bare fmtD');
});

test('Tax Loss methodology uses _fmtD not bare fmtD', () => {
  const block = html.match(/const methTLH=\[\];[\s\S]*?buildMethodologyPanel\('Tax-Loss/);
  assert.ok(block, 'TLH methodology not found');
  assert.ok(block[0].includes('_fmtD('), 'Should use _fmtD');
  assert.ok(!block[0].match(/[^_]fmtD\(/), 'Must not use bare fmtD');
});

test('Scenario methodology uses _fmtK/_fmtD not bare versions', () => {
  const block = html.match(/const methScen=\[\];[\s\S]*?buildMethodologyPanel\('Scenario/);
  assert.ok(block, 'Scenario methodology not found');
  assert.ok(block[0].includes('_fmtK(') || block[0].includes('_fmtD('), 'Should use global formatters');
  assert.ok(!block[0].match(/[^_]fmtK\(/), 'Must not use bare fmtK');
  assert.ok(!block[0].match(/[^_]fmtD\(/), 'Must not use bare fmtD');
});

/* ==== Regression: methodology panels are data-driven ==== */
suite('Methodology panels — data-driven content');

test('Account Type methodology references actual bucket data', () => {
  assert.match(html, /renderAcctTypePivot[\s\S]*?items\.length.*tax buckets/);
  assert.match(html, /renderAcctTypePivot[\s\S]*?g\.total\/GRAND\*100/);
});

test('Category methodology references actual allocation data', () => {
  assert.match(html, /renderCategoryPivot[\s\S]*?eqPct\.toFixed/);
  assert.match(html, /renderCategoryPivot[\s\S]*?bondPct\.toFixed/);
});

test('Fund X-Ray methodology references actual xray results', () => {
  assert.match(html, /methXray[\s\S]*?xrayFundCount/);
  assert.match(html, /methXray[\s\S]*?covPct\.toFixed/);
});

test('Expenses methodology references actual fee data', () => {
  assert.match(html, /methExp[\s\S]*?weightedER\.toFixed/);
  assert.match(html, /methExp[\s\S]*?annualCost/);
});

test('Snapshot methodology references actual diff data', () => {
  assert.match(html, /methSnap[\s\S]*?diff\.totalBefore/);
  assert.match(html, /methSnap[\s\S]*?diff\.newPositions\.length/);
});

test('Tax Loss methodology references actual harvest data', () => {
  assert.match(html, /methTLH[\s\S]*?taxableLosses\.length/);
  assert.match(html, /methTLH[\s\S]*?harvestable/);
});

test('Scenario methodology references actual scenario results', () => {
  assert.match(html, /methScen[\s\S]*?validResults\.length/);
  assert.match(html, /methScen[\s\S]*?r\.mcSuccess/);
});

/* ==== Collapsible withdrawal panels ==== */
suite('Collapsible withdrawal panels');

test('CSS for wd-collapsible sections exists', () => {
  assert.match(html, /\.wd-panel\.wd-collapsible/);
  assert.match(html, /\.wd-section-toggle/);
  assert.match(html, /\.wd-section-arrow/);
  assert.match(html, /\.wd-panel\.wd-collapsible:not\(\.open\)\s*>\s*\.wd-section-body\s*\{\s*display:\s*none/);
});

test('_wdSecOpen and _wdSecClose helper functions exist', () => {
  assert.match(html, /function _wdSecOpen\(/);
  assert.match(html, /function _wdSecClose\(/);
});

test('_wdToggleSection function exists', () => {
  assert.match(html, /function _wdToggleSection\(/);
});

test('_wdSaveUIState and _wdRestoreUIState functions exist', () => {
  assert.match(html, /function _wdSaveUIState\(/);
  assert.match(html, /function _wdRestoreUIState\(/);
});

test('_wdUIState global object is initialized from localStorage', () => {
  assert.match(html, /window\._wdUIState\s*=\s*_wdSanitizeUIState/);
  assert.match(html, /window\._wdUIState\s*=\s*\{panels:\s*\{\},\s*charts:\s*\{\}\}/);
});

test('_wdSanitizeUIState validates object shape', () => {
  assert.match(html, /function _wdSanitizeUIState\(/);
  // Rejects non-objects
  assert.match(html, /typeof v\s*!==\s*'object'/);
  // Validates panels and charts sub-properties
  assert.match(html, /typeof v\.panels\s*!==\s*'object'/);
  assert.match(html, /typeof v\.charts\s*!==\s*'object'/);
});

test('loadSettings prefers dedicated _WD_UI_KEY over settings blob', () => {
  assert.match(html, /localStorage\.getItem\(_WD_UI_KEY\)/);
  assert.match(html, /_wdSanitizeUIState\(JSON\.parse\(fresh\)\)/);
  assert.match(html, /_wdSanitizeUIState\(s\._wdUIState\)/);
});

test('Roth Conversion section uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('roth-conv'/);
});

test('Social Security Recommendation uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('ss-rec'/);
});

test('Metrics Charts uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('metrics-charts'/);
});

test('SS Break-Even uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('ss-breakeven'/);
});

test('Withdrawal Schedule uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('wd-schedule'/);
});

test('Monte Carlo uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('mc-analysis'/);
});

test('Historical Backtest uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('hist-backtest'/);
});

test('Withdrawal Strategy uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('wd-strategy'/);
});

test('IRMAA uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('irmaa'/);
});

test('_wdSaveUIState is called before wd-results rebuild', () => {
  const block = html.match(/_wdSaveUIState\(\)[\s\S]{0,200}getElementById\('wd-results'\)\.innerHTML/);
  assert.ok(block, '_wdSaveUIState should be called before writing wd-results innerHTML');
});

test('_wdRestoreUIState is called after chart render', () => {
  const block = html.match(/_renderChart\('wd-charts'\)[\s\S]{0,200}_wdRestoreUIState\(\)/);
  assert.ok(block, '_wdRestoreUIState should be called after _renderChart');
});

test('Print styles show collapsed sections', () => {
  assert.match(html, /\.wd-panel\.wd-collapsible\s*>\s*\.wd-section-body\s*\{\s*display:\s*block\s*!important/);
});

test('Input panel uses collapsible wrapper', () => {
  assert.match(html, /_wdSecOpen\('wd-inputs'/);
});

test('_wdToggleAll function exists', () => {
  assert.match(html, /function _wdToggleAll\(/);
});

test('Calculate button is outside the input panel', () => {
  const block = html.match(/_wdSecClose\(\)[\s\S]{0,300}computeWithdrawalPlan/);
  assert.ok(block, 'Calculate button should appear after _wdSecClose for the input panel');
});

test('Section arrow matches methodology arrow size (1.2em, bold)', () => {
  assert.match(html, /\.wd-section-arrow\s*\{[^}]*font-size:\s*1\.2em/);
  assert.match(html, /\.wd-section-arrow\s*\{[^}]*font-weight:\s*700/);
});

/* ==== Panel state localStorage persistence ==== */
suite('Panel state localStorage persistence');

test('_WD_UI_KEY constant is defined for localStorage', () => {
  assert.match(html, /const _WD_UI_KEY\s*=\s*'portfolioWdUIState'/);
});

test('_wdPersistUIState function saves to localStorage', () => {
  assert.match(html, /function _wdPersistUIState\(\)/);
  assert.match(html, /localStorage\.setItem\(_WD_UI_KEY/);
});

test('_wdUIState is loaded from localStorage on init', () => {
  assert.match(html, /localStorage\.getItem\(_WD_UI_KEY\)/);
});

test('_wdToggleSection calls _wdPersistUIState', () => {
  const fn = html.match(/function _wdToggleSection\(id\)\{[\s\S]*?\n\}/);
  assert.ok(fn, '_wdToggleSection function not found');
  assert.ok(fn[0].includes('_wdPersistUIState()'), '_wdToggleSection should call _wdPersistUIState');
});

test('_wdToggleAll calls _wdPersistUIState', () => {
  const fn = html.match(/function _wdToggleAll\(open\)\{[\s\S]*?\n\}/);
  assert.ok(fn, '_wdToggleAll function not found');
  assert.ok(fn[0].includes('_wdPersistUIState()'), '_wdToggleAll should call _wdPersistUIState');
});

test('_wdSaveUIState calls _wdPersistUIState', () => {
  const fn = html.match(/function _wdSaveUIState\(\)\{[\s\S]*?\n\}/);
  assert.ok(fn, '_wdSaveUIState function not found');
  assert.ok(fn[0].includes('_wdPersistUIState()'), '_wdSaveUIState should call _wdPersistUIState');
});

test('saveSettings includes _wdUIState in saved data', () => {
  assert.match(html, /s\._wdUIState\s*=\s*window\._wdUIState/);
});

test('loadSettings restores _wdUIState from saved data', () => {
  assert.match(html, /if\s*\(s\._wdUIState\)/);
  assert.match(html, /_wdSanitizeUIState\(s\._wdUIState\)/);
});

test('_wdRestoreUIState is called after cached results restore (tab switch)', () => {
  const block = html.match(/_wdResultsCache[\s\S]{0,300}_wdRestoreUIState\(\)/);
  assert.ok(block, '_wdRestoreUIState must be called after restoring cached results to fix stale panel state');
});

test('_wdToggleSection updates _wdResultsCache after toggle', () => {
  const fn = html.match(/function _wdToggleSection\(id\)\{[\s\S]*?\n\}/);
  assert.ok(fn, '_wdToggleSection function not found');
  assert.ok(fn[0].includes('_wdResultsCache'), '_wdToggleSection should update _wdResultsCache to keep cache current');
});

test('_wdToggleAll updates _wdResultsCache after toggle', () => {
  const fn = html.match(/function _wdToggleAll\(open\)\{[\s\S]*?\n\}/);
  assert.ok(fn, '_wdToggleAll function not found');
  assert.ok(fn[0].includes('_wdResultsCache'), '_wdToggleAll should update _wdResultsCache to keep cache current');
});

test('saveSettings is called when leaving scenarios tab', () => {
  assert.match(html, /_activeTab===.scenarios.\)\s*saveSettings\(\)/, 'saveSettings should fire when leaving scenarios tab');
});

/* ==== Year-by-Year contribution insert ==== */
suite('Year-by-Year contribution row insertion');

test('insertContribYearFromInput function exists', () => {
  assert.match(html, /function insertContribYearFromInput\(\)/);
});

test('addContribYear inserts at sorted position', () => {
  assert.match(html, /container\.insertBefore\(row,child\)/);
  assert.match(html, /childYear>defYear/);
});

test('addContribYear sets data-year attribute on rows', () => {
  assert.match(html, /row\.dataset\.year\s*=\s*defYear/);
});

test('Insert Year input and button exist in yearly panel', () => {
  assert.match(html, /id="contribInsertYearInput"/);
  assert.match(html, /insertContribYearFromInput\(\)/);
  assert.match(html, /id="contribInsertMsg"/);
});

test('Insert Year validates duplicate years', () => {
  assert.match(html, /Year.*already exists/);
});

test('Insert Year validates year range', () => {
  assert.match(html, /Enter a valid year/);
  assert.match(html, /yearVal<minYear/, 'Should reject years before current year');
});

test('addContribYear uses max existing year for default (not children.length)', () => {
  assert.match(html, /maxY\+1/, 'Default year should be max existing + 1');
  assert.ok(!html.match(/defYear=year\|\|\(curYear\+idx\)/), 'Should not use curYear+idx for default');
});

test('addContribYear rejects duplicate years', () => {
  const fn = html.match(/function addContribYear[\s\S]*?container\.appendChild/);
  assert.ok(fn, 'addContribYear function found');
  assert.ok(fn[0].includes('parseInt(el.value)===defYear') && fn[0].includes('return'), 'Should return early on duplicate year');
});

test('Scenario cache uses scenario-specific fingerprint for staleness check', () => {
  assert.match(html, /window\._scenFP/);
  assert.match(html, /_scenCacheFP===window\._scenFP\(\)/);
  assert.match(html, /sc-pv-toggle/);
  assert.match(html, /pvTog\.style\.display.*flex/);
});

test('Scenario fingerprint covers withdrawal-inherited settings', () => {
  assert.match(html, /_scenFP.*wdGlideToggle/);
  assert.match(html, /_scenFP.*wdGlideMode/);
  assert.match(html, /_scenFP.*wdIRABasis/);
  assert.match(html, /_scenFP.*wdContribToggle/);
  assert.match(html, /_scenFP.*wdContrib401k/);
  assert.match(html, /_scenFP.*wdAge/);
});

test('Scenario fingerprint covers cross-tab dependencies', () => {
  assert.match(html, /_scenFP.*_selectedAccounts/);
  assert.match(html, /_scenFP.*_glideWaypoints/);
  assert.match(html, /_scenFP.*_glideInterp/);
  assert.match(html, /_scenFP.*_contribMode/);
  assert.match(html, /_scenFP.*_contribSchedule/);
  assert.match(html, /_scenFP.*_oneTimeSpendings/);
});

test('Scenario input change clears results DOM', () => {
  const fn=html.split('const onScenarioInputChange')[1]?.split(/\n\s*};/)[0]||'';
  assert.match(fn, /r\.innerHTML\s*=\s*['"][\s]*['"]/, 'onScenarioInputChange should clear scenResults DOM');
});

test('Collapsible comparison table panel exists', () => {
  assert.match(html, /id="sc-compare-panel"/);
  assert.match(html, /class="sc-compare-hdr"/);
  assert.match(html, /class="sc-compare-body"/);
  assert.match(html, /class="sc-chev"/);
});

test('Collapsible charts panel exists', () => {
  assert.match(html, /id="sc-charts-panel"/);
  assert.match(html, /class="sc-charts-hdr"/);
  assert.match(html, /class="sc-charts-body"/);
});

test('Shared collapsible toggle helper exists', () => {
  assert.match(html, /window\._scTogglePanel/);
  assert.match(html, /onclick="_scTogglePanel\(this\)"/);
});

test('Settings import invalidates scenario cache', () => {
  const fn=html.split('function importSettingsFromFile')[1]?.split(/\nfunction /)[0]||'';
  assert.match(fn, /_scenResultsCache\s*=\s*['"]['"]/, 'importSettingsFromFile should clear scenario cache');
});

test('Spending suggestions invalidate scenario cache', () => {
  const fn=html.split('window._applySuggestionsToScenarios=function')[1]?.split(/\nfunction /)[0]||'';
  assert.match(fn, /_scenResultsCache\s*=\s*['"]['"]/, '_applySuggestionsToScenarios should clear scenario cache');
});

test('Account selection change invalidates scenario cache', () => {
  const fn=html.split('function onAcctSelChange')[1]?.split(/\nfunction /)[0]||'';
  assert.match(fn, /_scenResultsCache\s*=\s*['"]['"]/, 'onAcctSelChange should clear scenario cache');
});

test('Cache fingerprint captured synchronously before async delay', () => {
  assert.match(html, /const _cacheFP=window\._scenFP\?window\._scenFP\(\):''/);
  assert.match(html, /window\._scenCacheFP=_cacheFP/);
});

test('Cache restore forces panels expanded and derives chart IDs from DOM', () => {
  assert.match(html, /sc-compare-body,\.sc-charts-body/);
  assert.match(html, /querySelectorAll\('\[id\^="sc-chart-"\]\[id\$="-container"\]'\)/);
  assert.match(html, /el\.id\.replace\('-container',''\)/, 'Should extract chart ID from container element');
});

/* ==== One-Time Spendings ==== */
suite('One-Time Spendings');

test('addOneTimeSpend function exists', () => {
  assert.match(html, /function addOneTimeSpend\(/);
});

test('getOneTimeSpendSchedule function exists', () => {
  assert.match(html, /function getOneTimeSpendSchedule\(/);
});

test('buildOneTimeSpendByAge function exists', () => {
  assert.match(html, /function buildOneTimeSpendByAge\(/);
});

test('One-Time Spendings toggle checkbox exists', () => {
  assert.match(html, /id="wdOneTimeSpendToggle"/);
});

test('One-Time Spendings panel exists', () => {
  assert.match(html, /id="wdOneTimeSpendPanel"/);
});

test('One-Time Spendings row container exists', () => {
  assert.match(html, /id="oneTimeSpendRows"/);
});

test('One-Time Spendings has add button', () => {
  assert.match(html, /addOneTimeSpend\(\);saveSettings\(\)/);
});

test('OTS rows have year, amount, and description fields', () => {
  assert.match(html, /class="ots-year"/);
  assert.match(html, /class="ots-amount"/);
  assert.match(html, /class="ots-desc"/);
});

test('OTS rows have delete button that saves', () => {
  const fn = html.match(/function addOneTimeSpend[\s\S]*?container\.appendChild/);
  assert.ok(fn, 'addOneTimeSpend function found');
  assert.ok(fn[0].includes('.remove();saveSettings()'), 'Delete should remove row and save settings');
});

test('OTS rows are sorted by year', () => {
  const fn = html.match(/function addOneTimeSpend[\s\S]*?\n\}/);
  assert.ok(fn, 'addOneTimeSpend function found');
  assert.ok(fn[0].includes('insertBefore'), 'Should insert rows in sorted order');
});

test('OTS schedule allows duplicate years', () => {
  const fn = html.match(/function addOneTimeSpend[\s\S]*?\n\}/);
  assert.ok(fn);
  assert.ok(!fn[0].includes('already exists'), 'Should NOT reject duplicate years (unlike contrib rows)');
});

test('saveSettings stores _oneTimeSpendings', () => {
  assert.match(html, /s\._oneTimeSpendings\s*=\s*getOneTimeSpendSchedule\(\)/);
});

test('loadSettings restores one-time spendings', () => {
  assert.match(html, /s\._oneTimeSpendings&&Array\.isArray\(s\._oneTimeSpendings\)/);
  assert.match(html, /addOneTimeSpend\(r\.year,r\.amount,r\.desc\)/);
});

test('wdOneTimeSpendToggle is in SETTINGS_FIELDS', () => {
  assert.match(html, /wdOneTimeSpendToggle/);
  const settingsBlock = html.match(/SETTINGS_FIELDS\s*=\s*\[[\s\S]*?\]/);
  assert.ok(settingsBlock, 'SETTINGS_FIELDS found');
  assert.ok(settingsBlock[0].includes('wdOneTimeSpendToggle'), 'wdOneTimeSpendToggle should be in SETTINGS_FIELDS');
});

test('MC engine accepts oneTimeByAge param', () => {
  const mcDestr = html.match(/function runMonteCarlo[\s\S]{0,600}=params;/);
  assert.ok(mcDestr, 'runMonteCarlo destructuring found');
  assert.ok(mcDestr[0].includes('oneTimeByAge'), 'MC should destructure oneTimeByAge');
});

test('Historical engine accepts oneTimeByAge param', () => {
  const histDestr = html.match(/function runHistoricalBacktest[\s\S]{0,500}=params;/);
  assert.ok(histDestr, 'runHistoricalBacktest destructuring found');
  assert.ok(histDestr[0].includes('oneTimeByAge'), 'Historical should destructure oneTimeByAge');
});

test('MC engine adds one-time spendings to need', () => {
  assert.match(html, /mcOts.*oneTimeByAge/);
});

test('Historical engine adds one-time spendings to need', () => {
  assert.match(html, /histOts.*oneTimeByAge/);
});

test('Deterministic engine adds one-time spendings to totalSpendingNeed', () => {
  assert.match(html, /otsForAge.*oneTimeByAge/);
});

test('Scenario engine adds one-time spendings', () => {
  assert.match(html, /scnOts.*oneTimeByAge/);
});

test('OTS CSS styles defined', () => {
  assert.match(html, /\.ots-row\s*\{/);
  assert.match(html, /\.ots-row input/);
});

test('MC NaN guard includes oneTimeByAge validation', () => {
  assert.match(html, /oneTimeByAge.*Object\.values.*isFinite/);
});

test('Historical NaN guard includes oneTimeByAge validation', () => {
  const histBlock = html.match(/function runHistoricalBacktest[\s\S]*?const horizon/);
  assert.ok(histBlock, 'Historical function found');
  assert.ok(histBlock[0].includes('oneTimeByAge') && histBlock[0].includes('Object.values'), 'Historical should validate oneTimeByAge for NaN');
});

/* ==== Scenario cache fix ==== */
suite('Scenario results cache persistence');

test('saveSettings does not unconditionally clear _scenResultsCache', () => {
  const saveSettingsFn = html.match(/function saveSettings\(\)\{[\s\S]*?\n\}/);
  assert.ok(saveSettingsFn, 'saveSettings function found');
  assert.ok(!saveSettingsFn[0].includes("_scenResultsCache=''"), 'saveSettings must not clear _scenResultsCache');
  assert.ok(!saveSettingsFn[0].includes('_scenResultsCache=""'), 'saveSettings must not clear _scenResultsCache');
});

test('Scenario input change handler still clears cache', () => {
  assert.match(html, /onScenarioInputChange[\s\S]*?_scenResultsCache\s*=\s*['"]['"]/, 'Input change should clear cache');
});

/* ==== Context-Aware Help System ==== */
suite('Context-Aware Help System');

test('Help button exists in settings dropdown', () => {
  assert.match(html, /id="helpBtn"/);
  assert.match(html, /Help/);
});

test('Help modal CSS exists', () => {
  assert.match(html, /\.help-modal\s*\{/);
  assert.match(html, /\.help-input-table/);
  assert.match(html, /\.help-output-list/);
  assert.match(html, /\.help-tips/);
  assert.match(html, /\.help-context-badge/);
});

test('HELP_CONTENT registry has all 11 page keys', () => {
  const keys = [
    'holdings/acctName', 'holdings/acctType', 'holdings/category',
    'holdings/xray', 'holdings/suggestions', 'holdings/rebalance',
    'holdings/expenses', 'holdings/taxloss',
    'withdrawals', 'scenarios', 'snapshot'
  ];
  keys.forEach(k => {
    const escaped = k.replace(/\//g, '\\/');
    assert.match(html, new RegExp("'" + escaped + "'\\s*:\\s*\\{"), `HELP_CONTENT missing key: ${k}`);
  });
});

test('Each help entry has title, overview, inputs, outputs, tips', () => {
  const block = html.match(/const HELP_CONTENT\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(block, 'HELP_CONTENT block found');
  const fields = ['title:', 'overview:', 'inputs:', 'outputs:', 'tips:'];
  fields.forEach(f => {
    const count = (block[0].match(new RegExp(f, 'g')) || []).length;
    assert.ok(count >= 11, `Expected at least 11 "${f}" fields, found ${count}`);
  });
});

test('showContextHelp function exists', () => {
  assert.match(html, /function showContextHelp\(\)/);
});

test('_helpKey function detects tab and sub-tab without window prefix', () => {
  assert.match(html, /function _helpKey\(\)/);
  const fn = html.match(/function _helpKey\(\)\{[\s\S]*?\n\}/);
  assert.ok(fn, '_helpKey function found');
  assert.ok(!fn[0].includes('window._activeTab'), '_helpKey should not use window._activeTab (let-scoped variable)');
  assert.ok(fn[0].includes('_activeTab'), '_helpKey should reference _activeTab');
  assert.ok(fn[0].includes('_activeSubPivot'), '_helpKey should reference _activeSubPivot');
});

test('Help modal uses sugg-overlay for consistent styling', () => {
  assert.match(html, /overlay\.className\s*=\s*'sugg-overlay'/);
});

test('Keyboard shortcut ? opens help', () => {
  assert.match(html, /e\.key\s*===\s*'\?'/);
  assert.match(html, /showContextHelp\(\)/);
});

test('Escape key closes overlay', () => {
  assert.match(html, /e\.key\s*===\s*'Escape'/);
});

test('Keyboard shortcut skips when input is focused', () => {
  assert.match(html, /tag\s*===\s*'INPUT'\s*\|\|\s*tag\s*===\s*'TEXTAREA'\s*\|\|\s*tag\s*===\s*'SELECT'/);
});

test('Help button wired to showContextHelp in dropdown handler', () => {
  assert.match(html, /helpBtn.*addEventListener.*showContextHelp/s);
});

test('Help modal has navigation links to other pages', () => {
  assert.match(html, /help-nav-link/);
  assert.match(html, /data-helpkey/);
});

test('_showHelpForKey function exists for cross-page navigation', () => {
  assert.match(html, /function _showHelpForKey\(key\)/);
});

test('Close button uses event listener (not inline onclick)', () => {
  assert.match(html, /id="helpCloseBtn"/);
  assert.match(html, /helpCloseBtn.*addEventListener/s);
});

/* ==== Result Sub-Tabs ==== */
suite('Result Sub-Tabs');

test('CSS: wd-result-tabs and wd-result-tab styles exist', () => {
  assert.match(html, /\.wd-result-tabs\s*\{/);
  assert.match(html, /\.wd-result-tab\s*\{/);
  assert.match(html, /\.wd-result-tab\.active\s*\{/);
  assert.match(html, /\.wd-result-tab-panel\s*\{/);
  assert.match(html, /\.wd-result-tab-panel\.active\s*\{/);
});

test('CSS: sticky cards class exists', () => {
  assert.match(html, /\.wd-sticky-cards\s*\{/);
  assert.match(html, /position:\s*sticky/);
});

test('CSS: print shows all tab panels', () => {
  assert.match(html, /@media\s+print[\s\S]*?\.wd-result-tab-panel\s*\{[^}]*display:\s*block\s*!important/);
});

test('JS: _wdSwitchResultTab function exists', () => {
  assert.match(html, /function _wdSwitchResultTab\(tabId\)/);
});

test('JS: _wdSwitchResultTab persists state', () => {
  const fn = html.match(/function _wdSwitchResultTab\([\s\S]*?\n\}/);
  assert.ok(fn, '_wdSwitchResultTab function found');
  assert.ok(fn[0].includes('_wdUIState.resultTab'), 'Persists resultTab in UI state');
  assert.ok(fn[0].includes('_wdPersistUIState'), 'Calls _wdPersistUIState');
});

test('HTML: 4 result tabs rendered (overview, plan, sims, analysis)', () => {
  assert.match(html, /data-tab="overview"/);
  assert.match(html, /data-tab="plan"/);
  assert.match(html, /data-tab="sims"/);
  assert.match(html, /data-tab="analysis"/);
});

test('HTML: 4 tab panel containers rendered', () => {
  assert.match(html, /id="wd-rtab-overview"/);
  assert.match(html, /id="wd-rtab-plan"/);
  assert.match(html, /id="wd-rtab-sims"/);
  assert.match(html, /id="wd-rtab-analysis"/);
});

test('DOM reorganization moves sections into tab panels', () => {
  const reorgBlock = html.match(/Move sections into their tab panels[\s\S]*?\}\)\(\)/);
  assert.ok(reorgBlock, 'DOM reorganization IIFE exists');
  assert.ok(reorgBlock[0].includes('wd-sec-metrics-charts'), 'Moves metrics charts to overview');
  assert.ok(reorgBlock[0].includes('wd-sec-wd-schedule'), 'Moves schedule to plan');
  assert.ok(reorgBlock[0].includes('wd-sec-mc-analysis'), 'Moves MC to sims');
  assert.ok(reorgBlock[0].includes('wd-sec-hist-backtest'), 'Moves hist to sims');
  assert.ok(reorgBlock[0].includes('wd-sec-ss-rec'), 'Moves SS rec to analysis');
  assert.ok(reorgBlock[0].includes('wd-sec-ss-breakeven'), 'Moves SS breakeven to analysis');
  assert.ok(reorgBlock[0].includes('wd-sec-roth-conv'), 'Moves roth conv to analysis');
  assert.ok(reorgBlock[0].includes('wd-sec-irmaa'), 'Moves IRMAA to analysis');
  assert.ok(reorgBlock[0].includes('wd-sec-wd-strategy'), 'Moves strategy to analysis');
});

test('Result tab restored in _wdRestoreUIState', () => {
  const fn = html.match(/function _wdRestoreUIState\(\)[\s\S]*?\n\}/);
  assert.ok(fn, '_wdRestoreUIState function found');
  assert.ok(fn[0].includes('resultTab'), 'Restores active result tab');
  assert.ok(fn[0].includes('_wdSwitchResultTab'), 'Calls _wdSwitchResultTab');
});

test('Sticky cards wraps summary cards', () => {
  assert.match(html, /class="wd-sticky-cards"[\s\S]*?class="wd-cards"/);
});

test('_wdSanitizeUIState handles subCollapsed', () => {
  const fn = html.match(/function _wdSanitizeUIState[\s\S]*?\n\}/);
  assert.ok(fn, 'sanitizer found');
  assert.ok(fn[0].includes('subCollapsed'), 'Sanitizes subCollapsed');
});

/* ==== Income Breakdown Dialog ==== */
suite('Income Breakdown Dialog');

test('_wdShowIncomeBreakdown function exists', () => {
  assert.match(html, /function _wdShowIncomeBreakdown\(rowIdx\)/);
});

test('Total Income cells have onclick for breakdown', () => {
  assert.match(html, /_wdShowIncomeBreakdown\(/);
});

test('Total Income cells have tooltip with breakdown', () => {
  assert.match(html, /_tiParts/);
  assert.match(html, /_tiTip/);
});

test('_wdRenderedRows is exposed for breakdown dialog', () => {
  assert.match(html, /window\._wdRenderedRows\s*=\s*rRows/);
});

test('Breakdown dialog shows all income source types', () => {
  const fn = html.match(/function _wdShowIncomeBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('taxableW'), 'Shows taxable withdrawals');
  assert.ok(fn[0].includes('deferredW'), 'Shows deferred withdrawals');
  assert.ok(fn[0].includes('rothW'), 'Shows Roth withdrawals');
  assert.ok(fn[0].includes('hsaW'), 'Shows HSA withdrawals');
  assert.ok(fn[0].includes('ssIncome'), 'Shows Social Security');
  assert.ok(fn[0].includes('postRetIncome'), 'Shows side income');
});

test('Breakdown dialog shows stacked bar chart', () => {
  const fn = html.match(/function _wdShowIncomeBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('width:${pct}%'), 'Has percentage-width bar segments');
});

test('Breakdown dialog uses overlay pattern with close button', () => {
  const fn = html.match(/function _wdShowIncomeBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('sugg-overlay'), 'Uses overlay pattern');
  assert.ok(fn[0].includes('ov.remove()'), 'Close button removes overlay');
});

test('Breakdown dialog shows expense section with tax breakdown', () => {
  const fn = html.match(/function _wdShowIncomeBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('Where It Goes'), 'Has expense section header');
  assert.ok(fn[0].includes('Living Expenses'), 'Shows living expenses');
  assert.ok(fn[0].includes('Federal Income Tax'), 'Shows federal income tax');
  assert.ok(fn[0].includes('Capital Gains Tax'), 'Shows capital gains tax');
  assert.ok(fn[0].includes('State Tax'), 'Shows state tax');
  assert.ok(fn[0].includes('Medicare IRMAA'), 'Shows IRMAA');
  assert.ok(fn[0].includes('Effective Tax Rate'), 'Shows effective tax rate');
});

test('Rendered rows include tax breakdown fields', () => {
  assert.match(html, /incomeTax:incTax/, 'rRows has incomeTax');
  assert.match(html, /capGainsTax:capTax/, 'rRows has capGainsTax');
  assert.match(html, /hsaPenalty/, 'rRows has hsaPenalty');
  assert.match(html, /stateTax:recStateTax/, 'rRows has stateTax');
});

test('Expense breakdown separates one-time spendings from regular living', () => {
  const fn = html.match(/function _wdShowIncomeBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('Regular Living Expenses'), 'Shows regular living');
  assert.ok(fn[0].includes('oneTimeItemsByAge'), 'Looks up OTS items by age');
  assert.ok(fn[0].includes('otsAmount'), 'Uses otsAmount from row');
  assert.ok(fn[0].includes('One-time'), 'Shows one-time label');
});

test('buildOneTimeItemsByAge function exists', () => {
  assert.match(html, /function buildOneTimeItemsByAge\(schedule,curAge,curYear\)/);
});

test('oneTimeItemsByAge stored on ctx', () => {
  assert.match(html, /oneTimeItemsByAge/, 'ctx has oneTimeItemsByAge');
});

/* ==== SS Income Breakdown Dialog ==== */
suite('SS Income Breakdown Dialog');

test('_wdShowSSBreakdown function exists', () => {
  assert.match(html, /function _wdShowSSBreakdown\(rowIdx\)/);
});

test('SS cells have onclick for breakdown', () => {
  assert.match(html, /_wdShowSSBreakdown\(/);
});

test('SS breakdown shows all source types', () => {
  const fn = html.match(/function _wdShowSSBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('yourSS'), 'Shows your SS');
  assert.ok(fn[0].includes('spouseSS'), 'Shows spouse SS');
  assert.ok(fn[0].includes('postRetIncome'), 'Shows side income');
});

test('SS breakdown shows taxation note', () => {
  const fn = html.match(/function _wdShowSSBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('taxable this year'), 'Shows SS taxation info');
});

/* ==== Year Column ==== */
suite('Year Column in Withdrawal Table');

test('Year column header exists in withdrawal table', () => {
  assert.match(html, /Calendar year for each row/);
});

test('Year column uses _startYear variable', () => {
  assert.match(html, /const _startYear/);
  assert.match(html, /_startYear\+i/);
});

/* ==== FV/PV Toggle ==== */
suite('FV/PV Global Toggle');

test('_wdToggleTablePV function exists', () => {
  assert.match(html, /function _wdToggleTablePV\(\)/);
});

test('Global PV toggle rendered above tabs with Future/Today labels', () => {
  assert.match(html, /id="wd-pv-toggle"/, 'Has wd-pv-toggle container');
  assert.match(html, /Future \$/, 'Has Future $ button');
  assert.match(html, /Today's \$/, "Has Today's $ button");
});

test('No per-schedule pill toggle (removed)', () => {
  /* The old schedule-local pill toggle was inside renderWdTable;
     now only the global toggle exists above the tabs */
  const fn = html.match(/function renderWdTable[\s\S]*?\nfunction /);
  assert.ok(fn, 'renderWdTable function found');
  assert.ok(!fn[0].includes('_wdToggleTablePV()'), 'No toggle button inside renderWdTable');
});

test('No per-chart PV/FV buttons in buildMetricCharts', () => {
  const fn = html.match(/function buildMetricCharts[\s\S]*?\nfunction /);
  assert.ok(fn, 'buildMetricCharts function found');
  assert.ok(!fn[0].includes('toggleChartPV'), 'No toggleChartPV calls');
  assert.ok(!fn[0].includes('Future Value</button>'), 'No Future Value button');
  assert.ok(!fn[0].includes('Present Value</button>'), 'No Present Value button');
});

test('Charts initialize with global PV state', () => {
  assert.match(html, /usePV:window\._wdUIState/, 'Charts read global PV state');
});

test('tablePV key in UI state sanitizer', () => {
  assert.match(html, /tablePV/, 'tablePV referenced in state');
});

test('PV factor applied conditionally via _usePV', () => {
  assert.match(html, /const _usePV/, '_usePV variable defined');
  assert.match(html, /const pv=_usePV\?pvFactor:1/, 'pv multiplier uses _usePV');
});

test('Dedicated PV columns removed (After-Tax PV, Total Bal PV)', () => {
  assert.ok(!html.includes('After-Tax (PV)</th>'), 'No After-Tax PV header column');
  assert.ok(!html.includes('Total Bal (PV)</th>'), 'No Total Bal PV header column');
});

test('Toggle re-renders all charts via _chartRegistry', () => {
  const fn = html.match(/function _wdToggleTablePV[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('_chartRegistry'), 'Updates all chart registries');
  assert.ok(fn[0].includes('_renderChart'), 'Re-renders charts');
});

test('Toggle refreshes simulation cards via _wdRefreshSimCards', () => {
  const fn = html.match(/function _wdToggleTablePV[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('_wdRefreshSimCards'), 'Calls sim card refresh');
});

test('_wdRefreshSimCards function exists and updates MC/Hist cards', () => {
  const fn = html.match(/function _wdRefreshSimCards[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('wd-mc-cards'), 'Updates MC cards');
  assert.ok(fn[0].includes('wd-hist-cards'), 'Updates hist cards');
  assert.ok(fn[0].includes('pvFactor'), 'Uses pvFactor for conversion');
});

test('Simulation cards show single value (not both FV and PV)', () => {
  /* Old pattern: "PV: $xxx" inline — should no longer exist */
  assert.ok(!html.includes('>PV: ${fmtK(pv'), 'No inline PV: labels in sim cards');
});

test('wdOverride converts PV input back to FV', () => {
  const fn = html.match(/function wdOverride[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('tablePV'), 'Checks PV mode');
  assert.ok(fn[0].includes('dataset.pvf'), 'Reads pvf data attribute');
});

test('All withdrawal cells are read-only without popups', () => {
  assert.ok(!html.includes('class="wd-ovr"'), 'No editable input cells');
  /* mkCell no longer takes acctIdx or adds onclick */
  const fn = html.match(/const mkCell=\(field,val\)=>\{[\s\S]*?\};/);
  assert.ok(fn, 'mkCell has only field,val params (no acctIdx)');
});

test('_wdShowAccountBreakdown function exists', () => {
  assert.match(html, /function _wdShowAccountBreakdown\(rowIdx,acctIdx\)/);
});

test('Account breakdown covers all 4 account types', () => {
  const fn = html.match(/function _wdShowAccountBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('Taxable Account'), 'Has taxable');
  assert.ok(fn[0].includes('Tax-Deferred'), 'Has deferred');
  assert.ok(fn[0].includes('Roth Account'), 'Has Roth');
  assert.ok(fn[0].includes('Health Savings Account'), 'Has HSA');
});

test('Account breakdown shows per-account sequential drain', () => {
  const fn = html.match(/function _wdShowAccountBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('_acctDetail'), 'Reads per-account drain detail');
  assert.ok(fn[0].includes('sequential drain'), 'Shows sequential drain label');
});

test('acctBuckets stored on ctx', () => {
  assert.match(html, /acctBuckets:\{taxable:/, 'ctx has acctBuckets');
});

test('Account popup is PV-aware', () => {
  const fn = html.match(/function _wdShowAccountBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('_wdUIState'), 'Reads PV state');
  assert.ok(fn[0].includes('pvLabel'), 'Shows PV label');
  assert.ok(fn[0].includes("today's dollars"), 'Has today dollars text');
});

test('SS popup is PV-aware', () => {
  const fn = html.match(/function _wdShowSSBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('_usePV'), 'Computes _usePV flag');
  assert.ok(fn[0].includes('pvLabel'), 'Shows PV label');
  assert.ok(fn[0].includes("today's dollars"), 'Has today dollars text');
});

test('Income popup is PV-aware', () => {
  const fn = html.match(/function _wdShowIncomeBreakdown[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('_usePV'), 'Computes _usePV flag');
  assert.ok(fn[0].includes('pvLabel'), 'Shows PV label');
  assert.ok(fn[0].includes("today's dollars"), 'Has today dollars text');
});

test('Scroll position preserved on PV toggle', () => {
  const fn = html.match(/function _wdToggleTablePV[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('scrollLeft'), 'Saves/restores scrollLeft');
  assert.ok(fn[0].includes('savedScroll'), 'Uses savedScroll variable');
});

test('Sequential drain tracking builds _acctDetail on rows', () => {
  assert.match(html, /r\._acctDetail/, 'Rows have _acctDetail property');
  assert.match(html, /_acctBals/, 'Account balances tracked per year');
});

test('_wdRefreshAnalysisPV function exists and updates pv-mid/pv-end cells', () => {
  const fn = html.match(/function _wdRefreshAnalysisPV[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('pv-mid'), 'Updates pv-mid cells');
  assert.ok(fn[0].includes('pv-end'), 'Updates pv-end cells');
  assert.ok(fn[0].includes('midPvF'), 'Uses mid-point PV factor');
  assert.ok(fn[0].includes('endPvF'), 'Uses end-point PV factor');
});

test('Toggle calls _wdRefreshAnalysisPV', () => {
  const fn = html.match(/function _wdToggleTablePV[\s\S]*?\n\}/);
  assert.ok(fn, 'function found');
  assert.ok(fn[0].includes('_wdRefreshAnalysisPV'), 'Calls analysis PV refresh');
});

test('SS table lifetime totals are PV-aware', () => {
  assert.match(html, /class="pv-mid".*data-fv=".*".*fmtK\(s\.lifetime/, 'SS lifetime cells have pv-mid class and data-fv');
});

/* ==== Lifetime Taxes Banner & Tfoot Summary ==== */
suite('Lifetime Taxes Banner & Table Footer');

test('Lifetime Taxes banner card exists with PV subline', () => {
  assert.match(html, /Lifetime Taxes/, 'Banner card label present');
  assert.match(html, /fmtK\(cumTax\)/, 'Banner shows cumTax FV');
  assert.match(html, /_lifetimeTaxPV/, 'Banner computes PV of lifetime taxes');
  assert.match(html, /border-top:3px solid #dc2626/, 'Banner has red top border');
});

test('Lifetime Taxes PV uses r.age not array index', () => {
  assert.match(html, /rows\.reduce\(\(s,r\)=>s\+r\.tax\/Math\.pow\(1\+inflPct,r\.age-curAge\)/, 'Banner PV uses r.age-curAge');
});

test('cumTax includes depleted-year taxes', () => {
  const depBlock = html.split('portfolio depleted')[1]?.split('continue')[0] || '';
  assert.match(depBlock, /cumTax\+=depTax/, 'cumTax accumulates depTax in depleted branch');
});

test('tfoot guarded for empty rRows', () => {
  assert.match(html, /if\(rRows\.length>0\)\{[\s\S]*?<tfoot>/, 'tfoot wrapped in rRows length guard');
});

test('tfoot PV uses r.age for discount factor', () => {
  const tfootBlock = html.split('Summary footer row')[1]?.split('</tfoot>')[0] || '';
  assert.match(tfootBlock, /r\.age-_curAge/, 'tfoot PV uses r.age - _curAge');
  assert.doesNotMatch(tfootBlock, /i\+yearsToRetire/, 'tfoot does NOT use array index for PV');
});

test('tfoot avg W/D% excludes depleted years', () => {
  const tfootBlock = html.split('Summary footer row')[1]?.split('</tfoot>')[0] || '';
  assert.match(tfootBlock, /if\(bb>0\)\{_wdSum/, 'Only accumulates W/D for non-depleted years');
  assert.match(tfootBlock, /_wdCount>0\?_wdSum\/_wdCount:0/, 'Divides by non-depleted year count');
});

test('tfoot shows "Avg" label for W/D% cell', () => {
  assert.match(html, /Avg \$\{_avgWd\.toFixed\(1\)\}%/, 'W/D cell prefixed with Avg');
});

test('tfoot column count accounts for all optional columns', () => {
  const tfootBlock = html.split('Summary footer row')[1]?.split('</tfoot>')[0] || '';
  assert.match(tfootBlock, /let _colCount=15/, 'Base column count is 15');
  assert.match(tfootBlock, /ctx\.hasSpouse.*_colCount\+\+/, 'Adds spouse column');
  assert.match(tfootBlock, /showRetCol.*_colCount\+\+/, 'Adds return % column');
  assert.match(tfootBlock, /hasConv.*_colCount\+=2/, 'Adds 2 conversion columns');
  assert.match(tfootBlock, /hasSSData.*_colCount\+\+/, 'Adds SS column');
  assert.match(tfootBlock, /_colCount-8/, 'Colspan = total - 8 trailing cells');
});

/* ==== Chart cumTotal Opt-In ==== */
suite('Chart cumTotal Annotation');

test('cumTotal flag propagated through buildMetricCharts', () => {
  assert.match(html, /cumTotal:!!s\.cumTotal/, 'buildMetricCharts propagates cumTotal flag');
});

test('Chart annotation gated by s.cumTotal flag', () => {
  assert.match(html, /if\(s\.cumTotal&&vals\[0\]\)/, 'Annotation requires cumTotal opt-in');
  assert.doesNotMatch(html, /s\.type==='bar'\|\|s\.type==='line'.*Lifetime Total/, 'No type-based annotation check');
});

test('Flow series have cumTotal:true, balance series do not', () => {
  const taxSeries = html.match(/key:'tax'[^}]+}/);
  assert.ok(taxSeries && taxSeries[0].includes('cumTotal:true'), 'Annual Taxes has cumTotal');
  const afterTaxSeries = html.match(/key:'afterTax'[^}]+}/);
  assert.ok(afterTaxSeries && afterTaxSeries[0].includes('cumTotal:true'), 'After-Tax Income has cumTotal');
  const ssSeries = html.match(/key:'ssIncome'[^}]+}/);
  assert.ok(ssSeries && ssSeries[0].includes('cumTotal:true'), 'Social Security has cumTotal');
  const rmdSeries = html.match(/key:'rmd'[^}]+}/);
  assert.ok(rmdSeries && rmdSeries[0].includes('cumTotal:true'), 'RMD has cumTotal');
  const balSeries = html.match(/key:'bTotal'[^}]+}/);
  assert.ok(balSeries && !balSeries[0].includes('cumTotal'), 'Total Balance does NOT have cumTotal');
});

test('Override depleted rows include convMarginalRate:0', () => {
  assert.match(html, /rdTax,afterTax:.*rothConv:0,convTax:0,convMarginalRate:0,rmd:0,irmaa:rdIrmaa/, 'Override depleted rows have convMarginalRate:0');
});

/* ==== Hybrid Contribution Mode — UI structure ==== */
suite('Hybrid Contribution Mode — UI structure');

test('hidden wdContribMode field defaults to hybrid', () => {
  assert.match(html, /id="wdContribMode"\s+value="hybrid"/, 'wdContribMode hidden field defaults to hybrid');
});

test('both Recurring and Year-Specific panels are rendered (no mode toggle)', () => {
  assert.match(html, /Recurring Income & Savings/, 'Recurring panel header present');
  assert.match(html, /Additional Year-Specific Entries/, 'Year-Specific panel header present');
  assert.ok(!html.includes('contribModeFlat') && !html.includes('contribModeYearly'),
    'Old mode toggle buttons should not exist');
});

test('Year-Specific description says "added on top" of recurring', () => {
  assert.match(html, /added on top<\/strong> of the recurring amounts/, 'Additive description present');
});

test('getContribForAge is additive — adds flat base + year-specific', () => {
  const fn = html.match(/function getContribForAge\(age\)\{[\s\S]*?^\s{2}\}/m);
  assert.ok(fn, 'getContribForAge function found');
  const body = fn[0];
  assert.match(body, /c\.c401k\+=contrib401k/, 'adds flat 401k');
  assert.match(body, /c\.c401k\+=yr\.c401k/, 'adds year-specific 401k on top');
});

test('buildContribForAge handles hybrid mode with additive logic', () => {
  const fn = html.match(/function buildContribForAge\(settings\)\{[\s\S]*?^}/m);
  assert.ok(fn, 'buildContribForAge function found');
  const body = fn[0];
  assert.match(body, /isOldYearly/, 'checks for old yearly mode to zero flat');
  assert.match(body, /c\.c401k\+=flatContrib\.c401k/, 'additive flat');
  assert.match(body, /c\.c401k\+=yr\.c401k/, 'additive yearly');
});

test('settings restore zeroes flat values for old yearly mode (backward compat)', () => {
  assert.match(html, /s\._contribMode==='yearly'/, 'checks for old yearly mode during restore');
  assert.match(html, /wdContrib401k.*wdContribMatch.*wdContribIRA.*wdContribTaxable.*wdContribHSA/, 'zeroes all flat fields');
});

test('settings restore discards stale schedule for old flat mode', () => {
  assert.match(html, /s\._contribMode==='flat'/, 'checks for old flat mode during restore');
  assert.match(html, /delete s\._contribSchedule/, 'discards stale yearly schedule');
});

test('settings restore sets wdContribMode to hybrid after migration', () => {
  assert.match(html, /_cmEl\.value='hybrid'/, 'explicitly sets hidden field to hybrid after migration');
});

test('settings save always saves _contribMode as hybrid', () => {
  assert.match(html, /s\._contribMode='hybrid'/, 'save sets mode to hybrid');
});

test('setContribMode is a backward-compat no-op that sets hybrid', () => {
  const fn = html.match(/function setContribMode\(mode\)\{[\s\S]*?\n\}/);
  assert.ok(fn, 'setContribMode function found');
  assert.match(fn[0], /modeEl\.value='hybrid'/, 'always sets to hybrid');
});

test('getContribSchedule returns null when no year rows (not based on mode)', () => {
  const fn = html.match(/function getContribSchedule\(\)\{[\s\S]*?^\}/m);
  assert.ok(fn, 'getContribSchedule function found');
  assert.ok(!fn[0].includes("mode==='flat'"), 'should not check for flat mode');
  assert.match(fn[0], /rows\.length===0\) return null/, 'returns null only when no rows');
});

test('recurring contribution validation always runs (not gated by mode)', () => {
  /* R1 fix: validation was gated by contribMode==='flat' which was dead code in computeWithdrawalPlan */
  const fn = html.match(/function computeWithdrawalPlan\(\)\{[\s\S]*?^\}/m);
  assert.ok(fn, 'computeWithdrawalPlan function found');
  assert.ok(!fn[0].includes("contribMode==='flat'"), 'no dead flat-mode guard in validation');
});

test('post-retirement 401k warning fires regardless of year-specific entries', () => {
  /* R1 fix: warning was suppressed by !contribSchedule guard */
  assert.match(html, /contribEndAge>retAge && \(contrib401k>0/, 'warning not gated by !contribSchedule');
});

test('buildContribForAge skips stale schedule for old flat mode', () => {
  const fn = html.match(/function buildContribForAge\(settings\)\{[\s\S]*?^}/m);
  assert.ok(fn, 'buildContribForAge function found');
  assert.match(fn[0], /contribMode!=='flat'/, 'skips schedule for old flat mode');
});

/* ==== Sub-toggle checkboxes for recurring and year-specific ==== */
suite('Contribution Sub-Toggles — UI and Engine');

test('recurring sub-toggle checkbox exists with correct id', () => {
  assert.match(html, /id="wdContribRecurringToggle"/, 'recurring sub-toggle exists');
  assert.match(html, /type="checkbox"[^>]*id="wdContribRecurringToggle"/, 'is a checkbox');
});

test('yearly sub-toggle checkbox exists with correct id', () => {
  assert.match(html, /id="wdContribYearlyToggle"/, 'yearly sub-toggle exists');
  assert.match(html, /type="checkbox"[^>]*id="wdContribYearlyToggle"/, 'is a checkbox');
});

test('sub-toggles are in SETTINGS_FIELDS for persistence', () => {
  assert.match(html, /wdContribRecurringToggle.*type:'checkbox'/, 'recurring toggle in SETTINGS_FIELDS');
  assert.match(html, /wdContribYearlyToggle.*type:'checkbox'/, 'yearly toggle in SETTINGS_FIELDS');
});

test('computeWithdrawalPlan reads sub-toggle states', () => {
  const fn = html.match(/function computeWithdrawalPlan\(\)\{[\s\S]*?^\}/m);
  assert.ok(fn, 'computeWithdrawalPlan found');
  assert.match(fn[0], /contribRecurringOn/, 'reads recurring sub-toggle');
  assert.match(fn[0], /contribYearlyOn/, 'reads yearly sub-toggle');
});

test('buildContribForAge respects sub-toggle settings', () => {
  const fn = html.match(/function buildContribForAge\(settings\)\{[\s\S]*?^}/m);
  assert.ok(fn, 'buildContribForAge found');
  assert.match(fn[0], /recurringOn/, 'checks recurring toggle');
  assert.match(fn[0], /yearlyOn/, 'checks yearly toggle');
});

test('sub-toggles control panel opacity on change', () => {
  assert.match(html, /wdContribRecurringToggle.*contribFlatPanel.*opacity/, 'recurring toggle controls flat panel opacity');
  assert.match(html, /wdContribYearlyToggle.*contribYearlyPanel.*opacity/, 'yearly toggle controls yearly panel opacity');
});

test('scenario fingerprint includes sub-toggle keys', () => {
  assert.match(html, /crt:s\.wdContribRecurringToggle/, 'recurring toggle in fingerprint');
  assert.match(html, /cyt:s\.wdContribYearlyToggle/, 'yearly toggle in fingerprint');
});

/* ================================================================
   Healthcare Costs UI Panel Tests
   ================================================================ */
suite('Healthcare Costs panel');

test('healthcare toggle checkbox exists', () => {
  assert.match(html, /id=["']wdHealthcareToggle["']/, 'healthcare toggle input exists');
});

test('healthcare panel has all 7 input fields', () => {
  const fields = ['wdHcPre65Premium', 'wdHcPre65StartAge', 'wdHcPartB', 'wdHcPartD',
    'wdHcMedigap', 'wdHcOOP', 'wdHcInflation'];
  for (const f of fields) {
    assert.match(html, new RegExp(`id=["']${f}["']`), `field ${f} exists`);
  }
});

test('healthcare fields are in SETTINGS_FIELDS', () => {
  const fields = ['wdHealthcareToggle', 'wdHcPre65Premium', 'wdHcPre65StartAge',
    'wdHcPartB', 'wdHcPartD', 'wdHcMedigap', 'wdHcOOP', 'wdHcInflation'];
  for (const f of fields) {
    assert.match(html, new RegExp(`SETTINGS_FIELDS[^;]*['"]${f}['"]`), `${f} in SETTINGS_FIELDS`);
  }
});

test('healthcare panel has tooltip descriptions', () => {
  assert.match(html, /Pre-65.*premium/i, 'pre-65 premium tooltip text');
  assert.match(html, /Part\s*B/i, 'Part B reference');
  assert.match(html, /Part\s*D/i, 'Part D reference');
  assert.match(html, /Medigap/i, 'Medigap reference');
});

test('buildHealthcareCostForAge function exists', () => {
  assert.match(html, /function buildHealthcareCostForAge/, 'buildHealthcareCostForAge defined');
});

test('buildHealthcareCostFromSettings function exists', () => {
  assert.match(html, /function buildHealthcareCostFromSettings/, 'buildHealthcareCostFromSettings defined');
});

test('scenario fingerprint includes healthcare keys', () => {
  assert.match(html, /hcT:s\.wdHealthcareToggle/, 'hcT in fingerprint');
  assert.match(html, /hcP65:s\.wdHcPre65Premium/, 'hcP65 in fingerprint');
  assert.match(html, /hcI:s\.wdHcInflation/, 'hcI in fingerprint');
});

test('scenario engine builds _scenHcCostFn', () => {
  assert.match(html, /_scenHcCostFn/, 'scenario engine references _scenHcCostFn');
  assert.match(html, /buildHealthcareCostFromSettings/, 'scenario engine calls buildHealthcareCostFromSettings');
});

test('hcCostFn passed in all re-sim param objects', () => {
  const matches = html.match(/hcCostFn:/g);
  assert.ok(matches && matches.length >= 6, `hcCostFn: referenced at least 6 times in param objects, got ${matches ? matches.length : 0}`);
});

summarize('UI Structure');
