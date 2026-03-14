/**
 * Test: CSV Export Round-Trip Validation
 * Migrated from ../../test_csv_export.js — enhanced and relocated to scripts/
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* ---- CSV parser (RFC 4180 compliant) ---- */
function parseCSVLine(line) {
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  });
}

function parseCurrency(str) {
  if (!str || str === '--' || str === 'N/A' || str === 'n/a') return null;
  const negative = /^\(/.test(str) || /^-\$/.test(str) || /^\$-/.test(str) || (/^-/.test(str) && !/^\+/.test(str));
  const num = parseFloat(str.replace(/[$,() +\-]/g, ''));
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

function extractRawCSV(reportHtml) {
  const m = reportHtml.match(/const RAW_CSV = (\[[\s\S]*?\]);\s*\n/);
  if (!m) throw new Error('RAW_CSV not found in report');
  return JSON.parse(m[1]);
}

function filterInputRows(rows) {
  return rows.filter(row => {
    const sym = (row['Symbol'] || '').trim();
    const acctNum = (row['Account Number'] || '').trim();
    const valStr = (row['Current Value'] || '').trim();
    const desc = (row['Description'] || '').trim();
    if (!acctNum || !valStr || ['N/A', 'n/a', '--'].includes(valStr)) return false;
    if (!sym && !desc) return false;
    if (/pending\s*activity/i.test(desc) || /pending\s*activity/i.test(sym)) return false;
    const acctName = (row['Account Name'] || '').trim();
    if (/(?:401K|403B|457B?|TSP)\s*PLAN$/i.test(acctName) && /BROKERAGELINK/i.test(desc)) return false;
    return true;
  });
}

function aggregateRows(rows) {
  const map = new Map();
  for (const row of rows) {
    let sym = (row['Symbol'] || '').trim();
    const desc = (row['Description'] || '').trim();
    if (!sym) sym = desc;
    const key = `${(row['Account Number'] || '').trim()}|${sym}`;
    const val = parseCurrency(row['Current Value']) || 0;
    const gl = parseCurrency(row['Total Gain/Loss Dollar']);
    const cb = parseCurrency(row['Cost Basis Total']);
    if (map.has(key)) {
      const a = map.get(key);
      a.value += val;
      if (a.gl !== null && gl !== null) a.gl += gl;
      else if (gl !== null) a.gl = gl;
      if (a.cb !== null && cb !== null) a.cb += cb;
      else if (cb !== null) a.cb = cb;
    } else {
      map.set(key, { acctNum: (row['Account Number'] || '').trim(), acctName: (row['Account Name'] || '').trim(), sym, value: val, gl, cb });
    }
  }
  return [...map.values()];
}

/* ---- Run tests ---- */
const samplesDir = path.resolve(__dirname, '..', 'samples');
const inputsDir = path.join(samplesDir, 'inputs');
const reportsDir = path.join(samplesDir, 'reports');

let totalTests = 0, passed = 0;

if (!fs.existsSync(inputsDir) || !fs.existsSync(reportsDir)) {
  console.log('WARNING: samples/inputs or samples/reports not found — CSV export tests skipped');
  console.log('Run report generation first to create test data.');
  console.log(`\n${'='.repeat(50)}`);
  console.log('0 CSV export tests ran (SKIPPED — no test data).');
  process.exit(0);
}

const csvFiles = fs.readdirSync(inputsDir).filter(f => f.endsWith('.csv'));

csvFiles.forEach(csvFile => {
  const baseName = csvFile.replace('.csv', '');
  /* Try both naming conventions: BaseName.html (current) and BaseName_report.html (legacy) */
  let reportPath = path.join(reportsDir, baseName + '.html');
  if (!fs.existsSync(reportPath)) {
    reportPath = path.join(reportsDir, baseName + '_report.html');
  }

  if (!fs.existsSync(reportPath)) {
    console.log(`SKIP: ${baseName}.html not found`);
    return;
  }

  console.log(`\nTesting: ${csvFile}`);

  const inputText = fs.readFileSync(path.join(inputsDir, csvFile), 'utf8');
  const filteredRows = filterInputRows(parseCSV(inputText));
  const aggregated = aggregateRows(filteredRows);
  const reportHtml = fs.readFileSync(reportPath, 'utf8');
  const rawCSV = extractRawCSV(reportHtml);

  /* Test 1: Row count */
  totalTests++;
  try {
    assert.strictEqual(rawCSV.length, aggregated.length);
    console.log(`  ✓ Row count: ${rawCSV.length}`);
    passed++;
  } catch (e) { console.log(`  ✗ Row count: ${e.message}`); }

  /* Test 2: Column headers */
  totalTests++;
  try {
    const inputHeaders = Object.keys(parseCSV(inputText)[0] || {});
    const exportHeaders = Object.keys(rawCSV[0] || {});
    assert.deepStrictEqual(exportHeaders, inputHeaders);
    console.log(`  ✓ Column headers match (${exportHeaders.length})`);
    passed++;
  } catch (e) { console.log(`  ✗ Headers: ${e.message}`); }

  /* Test 3: Account+Symbol pairs */
  totalTests++;
  try {
    const inputKeys = new Set(aggregated.map(r => `${r.acctNum}|${r.sym}`));
    const exportKeys = new Set(rawCSV.map(r => `${(r['Account Number']||'').trim()}|${(r['Symbol']||'').trim()}`));
    const missing = [...inputKeys].filter(k => !exportKeys.has(k));
    assert.strictEqual(missing.length, 0, `Missing: ${missing.slice(0,3).join(', ')}`);
    console.log(`  ✓ Account+Symbol pairs (${exportKeys.size})`);
    passed++;
  } catch (e) { console.log(`  ✗ Pairs: ${e.message}`); }

  /* Test 4: Current Values */
  totalTests++;
  try {
    const exportByKey = new Map();
    rawCSV.forEach(r => exportByKey.set(`${(r['Account Number']||'').trim()}|${(r['Symbol']||'').trim()}`, r));
    let mismatches = 0;
    for (const agg of aggregated) {
      const exp = exportByKey.get(`${agg.acctNum}|${agg.sym}`);
      if (!exp) continue;
      const expVal = parseCurrency(exp['Current Value']);
      if (Math.abs(agg.value - (expVal || 0)) > 0.02) mismatches++;
    }
    assert.strictEqual(mismatches, 0, `${mismatches} value mismatches`);
    console.log(`  ✓ Current Values match`);
    passed++;
  } catch (e) { console.log(`  ✗ Values: ${e.message}`); }

  /* Test 5: Gain/Loss */
  totalTests++;
  try {
    const exportByKey = new Map();
    rawCSV.forEach(r => exportByKey.set(`${(r['Account Number']||'').trim()}|${(r['Symbol']||'').trim()}`, r));
    let mismatches = 0;
    for (const agg of aggregated) {
      const exp = exportByKey.get(`${agg.acctNum}|${agg.sym}`);
      if (!exp) continue;
      const expGL = parseCurrency(exp['Total Gain/Loss Dollar']);
      if (agg.gl === null && expGL === null) continue;
      if (agg.gl === null || expGL === null || Math.abs(agg.gl - expGL) > 0.02) mismatches++;
    }
    assert.strictEqual(mismatches, 0, `${mismatches} G/L mismatches`);
    console.log(`  ✓ Gain/Loss match`);
    passed++;
  } catch (e) { console.log(`  ✗ G/L: ${e.message}`); }

  /* Test 6: Cost Basis */
  totalTests++;
  try {
    const exportByKey = new Map();
    rawCSV.forEach(r => exportByKey.set(`${(r['Account Number']||'').trim()}|${(r['Symbol']||'').trim()}`, r));
    let mismatches = 0;
    for (const agg of aggregated) {
      const exp = exportByKey.get(`${agg.acctNum}|${agg.sym}`);
      if (!exp) continue;
      const expCB = parseCurrency(exp['Cost Basis Total']);
      if (agg.cb === null && expCB === null) continue;
      if (agg.cb === null || expCB === null || Math.abs(agg.cb - expCB) > 0.02) mismatches++;
    }
    assert.strictEqual(mismatches, 0, `${mismatches} CB mismatches`);
    console.log(`  ✓ Cost Basis match`);
    passed++;
  } catch (e) { console.log(`  ✗ CB: ${e.message}`); }
});

console.log(`\n${'='.repeat(50)}`);
if (passed === totalTests) {
  console.log(`All ${totalTests} CSV export tests passed.`);
} else {
  console.log(`${passed}/${totalTests} tests passed, ${totalTests - passed} FAILED.`);
  process.exit(1);
}
