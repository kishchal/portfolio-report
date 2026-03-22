/**
 * Test: SKILL.md Accuracy — validates SKILL.md claims against actual template/scripts
 *
 * This test module prevents SKILL.md from drifting out of sync with the codebase.
 * If a feature is added/removed/renamed in template.html, these tests will fail
 * until SKILL.md is updated to match.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { test, suite, summarize } = require('./test-helpers');

const BASE = path.resolve(__dirname, '..');
const TEMPLATE = fs.readFileSync(path.join(BASE, 'assets', 'template.html'), 'utf8');
const SKILL = fs.readFileSync(path.join(BASE, 'SKILL.md'), 'utf8');
const SCRIPTS_DIR = path.join(BASE, 'scripts');

/* ==== Tab structure ==== */
suite('SKILL.md — tab structure accuracy');

/* Extract actual main tabs from template (only HTML buttons, not JS references) */
const mainTabMatches = [...TEMPLATE.matchAll(/<button[^>]+data-pivot="(\w+)"/g)].map(m => m[1]);

test('SKILL.md lists correct number of main tabs', () => {
  /* SKILL should mention exactly the main tabs that exist */
  assert.strictEqual(mainTabMatches.length, 4, `Template has ${mainTabMatches.length} main tabs`);
  for (const tab of mainTabMatches) {
    /* Map data-pivot values to display names for SKILL.md search */
    const nameMap = { holdings: 'Holdings', withdrawals: 'Withdrawals', scenarios: 'Scenarios', snapshot: 'Snapshot Diff' };
    const name = nameMap[tab] || tab;
    assert.ok(SKILL.includes(name), `SKILL.md should mention main tab: ${name}`);
  }
});

/* Extract actual holdings sub-tabs from template (only HTML buttons) */
const subTabMatches = [...TEMPLATE.matchAll(/<button[^>]+data-sub="(\w+)"/g)].map(m => m[1]);

test('SKILL.md lists correct number of Holdings sub-tabs', () => {
  assert.strictEqual(subTabMatches.length, 8, `Template has ${subTabMatches.length} sub-tabs`);
  /* SKILL should say "eight" sub-pivot views */
  assert.ok(SKILL.match(/eight sub-pivot/i), 'SKILL.md should say "eight sub-pivot views"');
});

test('SKILL.md mentions all Holdings sub-tabs', () => {
  const expectedNames = ['By Account Type', 'By Investment Category', 'By Account',
    'Fund X-Ray', 'Rebalance', 'Expenses', 'Suggestions', 'Tax-Loss'];
  for (const name of expectedNames) {
    assert.ok(SKILL.includes(name), `SKILL.md should mention sub-tab: ${name}`);
  }
});

test('Default sub-tab matches SKILL.md', () => {
  /* Find which sub-tab button has class="active" in the template */
  const activeMatch = TEMPLATE.match(/class="[^"]*sub-pivot-tab[^"]*active[^"]*"[^>]*data-sub="(\w+)"/);
  assert.ok(activeMatch, 'Should find an active sub-tab in template');
  const defaultSub = activeMatch[1];
  assert.strictEqual(defaultSub, 'acctName', 'Default sub-tab should be acctName (By Account)');
  assert.ok(SKILL.match(/By Account.*default/i) || SKILL.match(/default.*By Account/i),
    'SKILL.md should state By Account is the default sub-pivot');
});

test('Suggestions and Tax-Loss are documented as sub-tabs not top-level', () => {
  /* Find the Holdings description block. It starts with **Holdings** and ends before the next
     same-level tab (Withdrawals, Scenarios, Snapshot Diff) */
  const holdingsStart = SKILL.indexOf('**Holdings**');
  assert.ok(holdingsStart > -1, 'Should find **Holdings** in SKILL.md');
  /* Find where the next main tab starts at the same indentation */
  const afterHoldings = SKILL.slice(holdingsStart);
  const nextTabMatch = afterHoldings.match(/\n\s{2,4}- \*\*(Withdrawals|Scenarios|Snapshot)/);
  const holdingsSection = nextTabMatch
    ? afterHoldings.slice(0, nextTabMatch.index)
    : afterHoldings.slice(0, 3000); /* fallback: check first 3000 chars */
  assert.ok(holdingsSection.includes('Suggestions'), 'Suggestions should be inside Holdings section');
  assert.ok(holdingsSection.includes('Tax-Loss'), 'Tax-Loss should be inside Holdings section');
});

/* ==== Settings menu ==== */
suite('SKILL.md — settings menu accuracy');

test('Settings menu items documented', () => {
  const menuItems = ['Save Settings', 'Load Settings', 'Export Data', 'Export CSV'];
  for (const item of menuItems) {
    /* Check template has the feature */
    const hasInTemplate = TEMPLATE.toLowerCase().includes(item.toLowerCase());
    if (hasInTemplate) {
      assert.ok(SKILL.toLowerCase().includes(item.toLowerCase()),
        `SKILL.md should document settings menu item: ${item}`);
    }
  }
});

test('Theme options documented', () => {
  const themes = ['Cool Blue', 'Warm Coral', 'Dark Mode'];
  for (const theme of themes) {
    assert.ok(TEMPLATE.includes(theme), `Template should have theme: ${theme}`);
    assert.ok(SKILL.includes(theme) || SKILL.toLowerCase().includes(theme.toLowerCase()),
      `SKILL.md should document theme: ${theme}`);
  }
});

/* ==== PDF export ==== */
suite('SKILL.md — PDF export accuracy');

test('PDF export scope includes Holdings', () => {
  /* Check template has PDF export on holdings */
  const holdingsPdf = TEMPLATE.includes('holdingsSubPivot') && TEMPLATE.includes('Export PDF');
  assert.ok(holdingsPdf, 'Template should have PDF export on Holdings');
  /* SKILL should mention PDF on Holdings */
  assert.ok(SKILL.match(/PDF.*Holdings/i) || SKILL.match(/Holdings.*PDF/i) ||
    SKILL.match(/all.*tabs.*PDF/i) || SKILL.match(/PDF.*all.*sub/i) ||
    SKILL.match(/PDF Export.*available on.*Holdings/i),
    'SKILL.md should document PDF export on Holdings');
});

/* ==== Scripts ==== */
suite('SKILL.md — script file accuracy');

test('All script files documented in SKILL.md', () => {
  const scripts = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.py') || f.endsWith('.ps1'));
  for (const script of scripts) {
    assert.ok(SKILL.includes(script), `SKILL.md should mention script: ${script}`);
  }
});

test('All test files exist that SKILL.md references', () => {
  /* Domain test files (excluding this meta-test) should be in SKILL.md */
  const testFiles = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.startsWith('test_') && f.endsWith('.js') && f !== 'test_skill_accuracy.js');
  assert.ok(testFiles.length >= 9, `Should have at least 9 domain test files, found ${testFiles.length}`);
  for (const tf of testFiles) {
    assert.ok(SKILL.includes(tf), `SKILL.md should mention test file: ${tf}`);
  }
});

/* ==== Test counts ==== */
suite('SKILL.md — test count accuracy');

test('test_withdrawal.js count is accurate', () => {
  /* Read the test file and count test() calls */
  const src = fs.readFileSync(path.join(SCRIPTS_DIR, 'test_withdrawal.js'), 'utf8');
  const testCount = (src.match(/\btest\s*\(/g) || []).length;
  /* SKILL should mention the correct count */
  const skillMatch = SKILL.match(/test_withdrawal\.js.*?\|\s*(\d+)/);
  assert.ok(skillMatch, 'SKILL.md should have test_withdrawal.js in the test table');
  assert.strictEqual(parseInt(skillMatch[1]), testCount,
    `SKILL.md says ${skillMatch[1]} but actual is ${testCount} for test_withdrawal.js`);
});

test('Total test count in SKILL.md is approximately correct', () => {
  /* Known actual test counts from runner output (some files use custom counting, not test() calls) */
  const knownCounts = {
    'test_allocation.js': 21,
    'test_bounds.js': 6,
    'test_csv_export.js': 24,
    'test_engine.js': 123,
    'test_formatting.js': 22,
    'test_skill_accuracy.js': 12,
    'test_snapshot.js': 43,
    'test_tax.js': 53,
    'test_ui.js': 404,
    'test_withdrawal.js': 54,
  };
  const totalTests = Object.values(knownCounts).reduce((a, b) => a + b, 0); // 762
  /* Find total count in SKILL.md — look for patterns like "316 tests" or "316+ tests" */
  const countMatches = [...SKILL.matchAll(/(\d+)\+?\s*tests/g)].map(m => parseInt(m[1]));
  assert.ok(countMatches.length > 0, 'SKILL.md should mention total test count');
  /* At least one count reference should be within 10 of the actual total */
  const closeEnough = countMatches.some(c => Math.abs(c - totalTests) <= 10);
  assert.ok(closeEnough,
    `SKILL.md test counts [${countMatches.join(', ')}] should be close to actual ${totalTests}`);
});

summarize('SKILL.md Accuracy');
