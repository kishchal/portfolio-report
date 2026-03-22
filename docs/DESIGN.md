# Portfolio Report — Complete System Design Document

> **Purpose**: This document captures every architectural decision, algorithm, data structure, and implementation detail of the Portfolio Report system. An AI agent given this document and a Fidelity CSV file should be able to recreate the entire system from scratch.

**Version**: 7.0.0  
**Architecture**: Single-file HTML application generated from Fidelity portfolio CSV exports  
**Stack**: PowerShell 7 + Python 3 (generators), vanilla JavaScript + CSS (client), Node.js (tests)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Directory Structure](#2-directory-structure)
3. [Data Flow](#3-data-flow)
4. [Report Generation Pipeline](#4-report-generation-pipeline)
   - 4.1 [CLI Interface](#41-cli-interface)
   - 4.2 [Cache Management](#42-cache-management)
   - 4.3 [CSV Parsing](#43-csv-parsing)
   - 4.4 [Holdings Classification](#44-holdings-classification)
   - 4.5 [Tax-Lot Aggregation](#45-tax-lot-aggregation)
   - 4.6 [Hierarchy Construction](#46-hierarchy-construction)
   - 4.7 [JavaScript Data Injection](#47-javascript-data-injection)
   - 4.8 [Fund X-Ray Live Enrichment](#48-fund-x-ray-live-enrichment)
   - 4.9 [Template Placeholders](#49-template-placeholders)
5. [HTML Template Architecture](#5-html-template-architecture)
   - 5.1 [File Structure](#51-file-structure)
   - 5.2 [CSS Architecture](#52-css-architecture)
   - 5.3 [Tab System](#53-tab-system)
   - 5.4 [Panel System](#54-panel-system)
   - 5.5 [Settings Persistence](#55-settings-persistence)
   - 5.6 [Chart System](#56-chart-system)
   - 5.7 [Auto-Recalculate System](#57-auto-recalculate-system)
   - 5.8 [Sidebar Navigation](#58-sidebar-navigation)
   - 5.9 [Context-Aware Help](#59-context-aware-help)
   - 5.10 [PDF/Print Export](#510-pdfprint-export)
6. [Holdings Views](#6-holdings-views)
   - 6.1 [Account / Account Type / Category Pivots](#61-account--account-type--category-pivots)
   - 6.2 [Fund X-Ray](#62-fund-x-ray)
   - 6.3 [Rebalance](#63-rebalance)
   - 6.4 [Expenses](#64-expenses)
   - 6.5 [Suggestions](#65-suggestions)
   - 6.6 [Tax-Loss Harvesting](#66-tax-loss-harvesting)
7. [Withdrawal Engine](#7-withdrawal-engine)
   - 7.1 [Financial Constants](#71-financial-constants)
   - 7.2 [Tax Computation](#72-tax-computation)
   - 7.3 [Pre-Retirement Growth](#73-pre-retirement-growth)
   - 7.4 [Annual Simulation Loop](#74-annual-simulation-loop)
   - 7.5 [Withdrawal Sequencing](#75-withdrawal-sequencing)
   - 7.6 [Roth Conversions](#76-roth-conversions)
   - 7.7 [Social Security Modeling](#77-social-security-modeling)
   - 7.8 [Healthcare Cost Modeling](#78-healthcare-cost-modeling)
   - 7.9 [Monte Carlo Simulation](#79-monte-carlo-simulation)
   - 7.10 [Historical Backtest](#710-historical-backtest)
   - 7.11 [Glide Path](#711-glide-path)
   - 7.12 [Spending Phases & One-Time Spendings](#712-spending-phases--one-time-spendings)
   - 7.13 [Editable Withdrawal Table](#713-editable-withdrawal-table)
8. [Scenario Comparator](#8-scenario-comparator)
9. [Snapshot Diff](#9-snapshot-diff)
10. [Cache Data Sources](#10-cache-data-sources)
11. [Test Architecture](#11-test-architecture)
12. [JavaScript Function Reference](#12-javascript-function-reference)
13. [Known Gaps & Design Notes](#13-known-gaps--design-notes)

---

## 1. System Overview

The Portfolio Report is a **single-file HTML application generator**. It takes a Fidelity portfolio positions CSV and produces a self-contained, interactive HTML report with:

- **Holdings analysis**: Multiple pivot views, allocation bars, drill-down cards
- **Fund X-Ray**: Stock-level decomposition of funds, overlap heatmap, concentration alerts
- **Rebalance**: Model portfolio comparison with trade generation
- **Expense analysis**: Fee drag computation and cheaper alternative suggestions
- **Suggestions**: Fund research with model portfolio comparison
- **Tax-Loss Harvesting**: Identifies harvestable losses and computes tax savings
- **Retirement withdrawal planner**: Full deterministic simulation with tax modeling, RMDs, Roth conversions, Social Security optimization, healthcare costs, Monte Carlo analysis, and historical backtesting
- **Scenario comparator**: Side-by-side what-if retirement scenarios
- **Snapshot diff**: Period-over-period portfolio comparison
- **Settings persistence**: localStorage + JSON export/import

The report requires **no server** after generation — all computation happens in the browser.

---

## 2. Directory Structure

```
portfolio-report/
├── assets/
│   ├── template.html            # THE app (~11,000 lines: CSS + HTML + JS)
│   ├── risk_cache.json           # Yahoo Finance stock risk classifications
│   └── suggestions_cache.json    # Yahoo Finance fund performance metrics
├── scripts/
│   ├── main.ps1                  # Primary report generator (PowerShell 7)
│   ├── main.py                   # Cross-platform generator (Python 3)
│   ├── fetch_risk_data.py        # Builds risk_cache.json from yfinance
│   ├── fetch_suggestions.py      # Builds suggestions_cache.json from yfinance
│   ├── run-all-tests.ps1         # Test runner (all test_*.js)
│   ├── test-helpers.js           # Shared test harness + template extraction
│   ├── test_allocation.js        # 21 tests: allocation, rebalance, expense, TLH math
│   ├── test_bounds.js            # 6 tests: withdrawal solver bounds
│   ├── test_csv_export.js        # 24 tests: CSV round-trip validation
│   ├── test_engine.js            # 123 tests: deep engine integration
│   ├── test_formatting.js        # 22 tests: fmt/esc/pct/ylink utilities
│   ├── test_skill_accuracy.js    # 12 tests: SKILL.md vs codebase alignment
│   ├── test_snapshot.js          # 43 tests: snapshot diff parsing/engine
│   ├── test_tax.js               # 53 tests: tax brackets, LTCG, IRMAA, SS, RMD
│   ├── test_ui.js                # 404 tests: template structure/regression
│   └── test_withdrawal.js        # 54 tests: spending phases, glide, MC, historical
├── samples/
│   ├── inputs/                   # 4 sample Fidelity CSVs (2M/3M/4M/5M)
│   └── reports/                  # 4 generated HTML reports
├── docs/
│   └── DESIGN.md                 # This file
└── SKILL.md                      # Maintenance guide + test matrix
```

---

## 3. Data Flow

```
┌─────────────────┐
│  Fidelity CSV   │
│  (positions)    │
└────────┬────────┘
         │
    ┌────▼────┐        ┌──────────────────┐
    │ main.ps1│◄───────│ risk_cache.json   │ ◄── fetch_risk_data.py (yfinance)
    │ main.py │◄───────│ suggestions_cache │ ◄── fetch_suggestions.py (yfinance)
    └────┬────┘        └──────────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  Parse CSV → Classify → Aggregate     │
    │  → Build hierarchy → Serialize JS     │
    │  → Fetch live fund holdings (Yahoo)   │
    │  → Inject into template.html          │
    └────┬──────────────────────────────────┘
         │
    ┌────▼─────────────┐
    │  Output: .html    │
    │  (self-contained) │
    └────┬─────────────┘
         │
    ┌────▼───────────────────────────────────────────┐
    │  Browser Runtime                                │
    │  ├─ Holdings pivots (from injected DATA)        │
    │  ├─ X-Ray (from FUND_HOLDINGS_DB + live data)   │
    │  ├─ Rebalance / Expenses / Suggestions          │
    │  ├─ Withdrawal Engine (full JS simulation)      │
    │  ├─ Monte Carlo + Historical Backtest           │
    │  ├─ Scenario Comparator                         │
    │  ├─ Snapshot Diff (upload older CSV)             │
    │  └─ Settings ↔ localStorage ↔ JSON export       │
    └────────────────────────────────────────────────┘
```

---

## 4. Report Generation Pipeline

### 4.1 CLI Interface

**PowerShell** (primary, most complete):
```powershell
pwsh -NoProfile -File scripts/main.ps1 -CsvPath <path> [-OutputPath <path>] [-RefreshRisk] [-RefreshSuggestions] [-RefreshAll]
```

**Python** (cross-platform):
```bash
python scripts/main.py <csv_path> [--output <path>] [--refresh-risk] [--refresh-suggestions] [--refresh-all]
```

**Output path derivation** (when not specified):
- Directory = CSV directory
- Filename = CSV basename with `_Positions` replaced by `_Report`, extension `.html`

### 4.2 Cache Management

#### Risk Cache (`assets/risk_cache.json`)
- Built by `fetch_risk_data.py` using yfinance
- Refreshed when: `-RefreshRisk` flag, cache missing, or explicitly requested
- Schema:
```json
{
  "_meta": { "fetched": "<ISO timestamp>", "source": "yfinance / Yahoo Finance", "symbol_count": 45 },
  "symbols": {
    "AAPL": {
      "beta": 1.24, "trailingPE": 28.5, "forwardPE": 26.1,
      "marketCap": 2800000000000, "revenueGrowth": 0.08,
      "profitMargins": 0.26, "dividendYield": 0.005,
      "sector": "Technology", "risk": "Blue Chip / Core"
    }
  }
}
```

#### Risk Classification Rules (`fetch_risk_data.py:classify(info)`):
| Label | Criteria |
|-------|----------|
| High Risk / Speculative | `beta > 1.8` OR `trailingPE < 0` OR `trailingPE > 100` OR `profitMargins < 0` OR `0 < marketCap < 5B` |
| Growth | `revenueGrowth > 0.15` AND `beta > 1.0` AND `marketCap > 20B` |
| Dividend / Value | `beta < 1.0` AND `5 ≤ trailingPE ≤ 25` AND `profitMargins > 0.10` |
| Blue Chip / Core | Default fallback |

#### Suggestions Cache (`assets/suggestions_cache.json`)
- Built by `fetch_suggestions.py` using yfinance
- Auto-refreshes if older than 7 days
- Fund universe: `VTI, VOO, FXAIX, FSKAX, AVUV, VXF, SCHD, QQQM, COWZ, DGRW, VXUS, VEA, VWO, FTIHX, AVDV, SCHE, IEMG, EFA, BND, FXNAX, VGSH, SCHP, BNDX, HYG, AGG, VCSH, VTIP, MUB, TLT, VNQ, VNQI, GLD, PDBC`
- Metrics per fund: `ret1y, ret2y, ret3y, ret5y, vol3y, maxDD, beta, divYield`

### 4.3 CSV Parsing

**Expected Fidelity CSV columns**:
- Required: `Account Number`, `Account Name`, `Current Value`, `Description` or `Symbol`
- Optional: `Account Type`, `Total Gain/Loss Dollar`, `Total Gain/Loss Percent`, `Cost Basis Total`
- Encoding: UTF-8 (with BOM support via `utf-8-sig`)

**Row filtering** — skip row if:
- Missing account number or current value
- Value is `N/A`, `n/a`, or `--`
- Both symbol and description are missing
- Description/symbol matches `pending activity` (case-insensitive)
- Row is a workplace plan wrapper with BrokerageLink duplicate:
  - Account name matches `(401K|403B|457B?|TSP)\s*PLAN$`
  - Description matches `BROKERAGELINK`

**Currency parsing** (`parse_currency(s)` / `ConvertTo-JsValue`):
- Strips `$`, commas, spaces, parentheses
- Handles negatives: `($1,000)`, `-$500`, `$-500`
- Returns float

### 4.4 Holdings Classification

#### Account Type Inference (`get_account_type(name)` / `Get-AccountType`)

Priority-ordered regex matching on account name:

| Pattern | Account Type |
|---------|-------------|
| `roth` | Roth |
| `health savings\|^HSA` | HSA |
| `college savings\|529` | 529 College Savings |
| `UTMA\|Uniform Transfers to Minor` | Custodial (UTMA) |
| `403(b)` | Tax-Deferred 403(b) |
| `457(b)` | Tax-Deferred 457(b) |
| `TSP\|thrift savings` | Tax-Deferred TSP |
| `401k` | Tax-Deferred 401(k) |
| `brokeragelink` | Tax-Deferred 401(k) |
| `DCP\|deferred comp` | Tax-Deferred DCP |
| `rollover ira\|traditional ira\|sep ira\|simple ira` | Tax-Deferred IRA |
| `self-employed 401` | Tax-Deferred 401(k) |
| generic `ira` | Tax-Deferred IRA |
| `individual\|joint\|wros\|trust\|living trust\|revocable` | Taxable Investment |
| fallback | Other |

#### Asset Category Classification

**Static category map** (`CATEGORY_MAP` / `$CategoryMap`):
Hardcoded symbol → category mapping for known funds/ETFs. Categories:
- US Index Funds
- International Funds
- Bond Funds
- Tech Sector Fund
- Growth / Leveraged ETFs
- Cash / Money Market
- Unspecified

**Heuristic fallbacks** (when symbol not in map):
1. BrokerageLink cash symbols → Cash / Money Market
2. CDs (description contains "CD" patterns) → Cash / Money Market
3. Stock detection (short uppercase symbol, not in fund list) → Individual Stocks
4. Else → Other

#### Risk Tag Assignment (stocks only)

Hard-coded symbol sets with cache override:

| Set | Symbols (examples) |
|-----|-------------------|
| HIGH_RISK | PLTR, HOOD, RBLX, CVNA, NET, SNOW, COIN, ARKK, SMCI... |
| GROWTH | NVDA, GOOGL, AVGO, AMD, META, AMZN, NFLX, CRM, UBER... |
| DIVIDEND_VALUE | XOM, CVX, T, VZ, KO, PEP, O, ED, PFE, ABBV, INTC... |
| Default | Blue Chip / Core |

### 4.5 Tax-Lot Aggregation

Multiple lots of the same symbol in the same account are merged:
- Key: `AccountNumber|Symbol`
- Summed: `Value`, `GainLoss`, `CostBasis`
- Recomputed: `GainLossPct = round(GainLoss / CostBasis * 100, 2)`

### 4.6 Hierarchy Construction

The final data structure is a nested hierarchy:

```
Category[]
  ├─ cat: string (category name)
  ├─ total: number (category total value)
  └─ accounts: Account[]
       ├─ num: string (account number)
       ├─ type: string (account type)
       ├─ name: string (account name)
       ├─ val: number (account total)
       └─ tickers: Ticker[]
            ├─ sym: string
            ├─ name: string (description)
            ├─ val: number
            ├─ risk: string (risk tag, stocks only)
            ├─ gl: number|null (gain/loss $)
            ├─ glPct: number|null (gain/loss %)
            └─ cb: number|null (cost basis)
```

### 4.7 JavaScript Data Injection

Data is serialized as **JavaScript object literals** (not JSON):
- Keys are unquoted: `{cat:'US Index Funds', total:100000.0, ...}`
- Strings are single-quoted with HTML entity escaping (`<` → `\u003c`, `>` → `\u003e`, `&` → `\u0026`, `'` → `\u0027`)
- Numbers are rounded to 2 decimals
- `None`/`$null` → `null`
- Trailing commas are left in place (valid JS)

### 4.8 Fund X-Ray Live Enrichment

1. Identify fund symbols from holdings (exclude cash-like: `SPAXX, FDRXX, FZFXX, VMFXX, SWVXX, CORE, FZDXX`)
2. Authenticate with Yahoo Finance:
   - Hit `https://fc.yahoo.com/` for consent cookies
   - Fetch crumb from `https://query2.finance.yahoo.com/v1/test/getcrumb`
3. For each fund, fetch `topHoldings` + `quoteType` from Yahoo quoteSummary API
4. Build structure: `{ "VOO": { "n": "Vanguard S&P 500 ETF", "h": {"AAPL": 7.01, "MSFT": 6.54} } }`
5. Inject as `{{FUND_HOLDINGS_LIVE_JSON}}`

### 4.9 Template Placeholders

| Placeholder | Content |
|-------------|---------|
| `{{REPORT_DATE}}` | Date from CSV filename (e.g., "Mar-12-2026") |
| `{{GENERATED_AT}}` | Generation timestamp |
| `{{GRAND_TOTAL}}` | Formatted total (e.g., "$2,000,000.03") |
| `{{GRAND_TOTAL_NUM}}` | Raw number |
| `{{DATA_JSON}}` | Holdings hierarchy JS literal |
| `{{RAW_CSV_JSON}}` | Original CSV data for re-export |
| `{{SUGGESTIONS_JSON}}` | Fund metrics cache JSON |
| `{{SOURCE_FILE}}` | Input CSV filename |
| `{{FUND_HOLDINGS_LIVE_JSON}}` | Live fund holdings for X-Ray |

---

## 5. HTML Template Architecture

### 5.1 File Structure

```
template.html (~11,225 lines)
├─ <style> block (lines 10-849)
│   ├─ CSS custom properties / theming (11-141)
│   ├─ Component styles (142-807)
│   └─ Print styles (808-849)
├─ <body> static shell (851-952)
│   ├─ .header (title, subtitle with generated timestamp + source file, total, settings gear)
│   ├─ #headerSpacer (reserves space below fixed header)
│   ├─ .container
│   │   ├─ .pivot-tabs (4 main tabs — position:fixed globally)
│   │   ├─ #pivotTabsSpacer (reserves space below fixed tabs)
│   │   ├─ #holdingsSubPivot (8 sub-tabs)
│   │   ├─ #allocOverview (allocation bar + legend)
│   │   ├─ #drilldown (dynamic content area)
│   │   ├─ #xrayContent, #rebalanceContent, etc.
│   │   └─ .insights
└─ <script> block (953-11225)
    ├─ Data bootstrapping (1047-1055)
    ├─ Utility functions (955-1090)
    ├─ Holdings renderers (1100-2050)
    ├─ Fund X-Ray engine (2061-2450)
    ├─ Rebalance engine (2451-3084)
    ├─ Expenses renderer (3085-3400)
    ├─ Export/CSV helpers (3406-3483)
    ├─ Suggestions renderer (3485-3735)
    ├─ Financial constants (3738-3910)
    ├─ Monte Carlo engine (3911-4092)
    ├─ Historical backtest (4093-4425)
    ├─ Settings persistence (4426-4870)
    ├─ Help system (4872-5160)
    ├─ Snapshot diff engine (5164-5840)
    ├─ Spending/glide/contrib helpers (5841-6670)
    ├─ Withdrawal renderer (6671-7087)
    ├─ Auto-recalculate system (7071-7087)
    ├─ Withdrawal engine (7088-7800)
    ├─ Withdrawal results rendering (7800-8470)
    ├─ Editable table + overrides (8471-9280)
    ├─ Tax-loss harvesting (9285-9470)
    ├─ Spending suggestions panel + modal (9473-9900)
    ├─ Scenario comparator (9905-10845)
    └─ Boot / tab switching / IIFE (10847-11225)
```

### 5.2 CSS Architecture

#### Theming System

Three themes via `data-theme` attribute on `<html>`:

| Theme | Selector | Characteristics |
|-------|----------|----------------|
| Default (Blue) | `:root` | Light background, blue primary |
| Coral | `[data-theme="coral"]` | Warm coral/orange primary |
| Dark | `[data-theme="dark"]` | Dark backgrounds, adjusted contrast |

**Core CSS custom properties**:
```css
/* Surfaces */
--bg, --bg-secondary, --card, --border
/* Text */
--text, --text-muted, --text-light
/* Brand */
--primary, --primary-light, --primary-hover, --accent
/* Shadows & spacing */
--shadow-sm, --shadow, --shadow-lg
--radius-sm, --radius, --radius-lg
--sp-xs, --sp-sm, --sp-md, --sp-lg, --sp-xl
/* Tables */
--th-bg, --row-alt, --row-hover
/* Semantic */
--success, --danger, --warning, --info (+ light variants)
/* Charts */
--mc-color, --mc-hover, --mc-median, --xray-hover
```

**Layout approach**:
- Full viewport width (no max-width)
- `html { scrollbar-gutter: stable }` prevents horizontal shifting
- Desktop-first with `@media (max-width: 900px)` breakpoint for withdrawals sidebar → column

**Print styles** (`@media print`):
- Hide interactive UI (tabs, buttons, inputs, settings)
- Force withdrawal sections open
- Disable sticky/fixed layouts
- `@page { size: landscape; margin: 0.4in }`

### 5.3 Tab System

#### Top-Level Tabs

| Tab ID | Label | Renderer |
|--------|-------|----------|
| `holdings` | Holdings | `_renderHoldingsSubPivot()` |
| `withdrawals` | Withdrawals | `renderWithdrawals()` |
| `scenarios` | Scenarios | `renderScenarios()` |
| `snapshot` | Snapshot Diff | `renderSnapshotDiff()` |

**State**: `_activeTab` global variable (persisted in settings)

**Tab switch flow**:
1. Save current tab settings
2. Cache current tab HTML via `_saveTab()`
3. If leaving withdrawals, call `_wdUnfixLayout()`
4. Toggle active CSS
5. Show/hide holdings sub-pivot bar
6. If cached, restore via `_restoreTab()`; else call renderer
7. Set `_activeTab`
8. If entering withdrawals, call `_wdFixLayout()` and drain dirty recalc flag

#### Holdings Sub-Tabs

| Sub-Tab ID | Label | Container |
|------------|-------|-----------|
| `acctName` | By Account | `#drilldown` |
| `acctType` | By Account Type | `#drilldown` |
| `category` | By Investment Category | `#drilldown` |
| `xray` | Fund X-Ray | `#xrayContent` |
| `suggestions` | Suggestions | `#suggestionsContent` |
| `rebalance` | Rebalance | `#rebalanceContent` |
| `expenses` | Expenses | `#expensesContent` |
| `taxloss` | Tax-Loss | `#taxlossContent` |

### 5.4 Panel System

The withdrawal planner uses 3 distinct panel types:

#### Type A: Always-On Panels (You, Assumptions)

```html
<div class="wd-opt-panel">
  <div class="wd-opt-header" onclick="_wdPanelToggle('wdYouBody')">
    <svg class="wd-sub-chevron expanded" data-sub-panel="wdYouPanel">...</svg>
    <span>👤 You</span>
  </div>
  <div class="wd-opt-body" id="wdYouBody">
    <!-- Fields always enabled -->
  </div>
</div>
```

- Collapse/expand via `_wdPanelToggle(panelId)`
- Chevron starts `expanded`
- No enable/disable toggle

#### Type B: Inner-Toggle Panels (Spouse, Income, Healthcare, One-Time)

```html
<div class="wd-opt-panel">
  <div class="wd-opt-header" onclick="_wdPanelToggle('wdSpouseBody')">
    <svg class="wd-sub-chevron expanded" data-sub-panel="wdSpousePanel">...</svg>
    <span>👫 Spouse</span>
  </div>
  <div class="wd-opt-body" id="wdSpouseBody">
    <label class="wd-panel-toggle">
      <input type="checkbox" onchange="_wdInnerToggle(this,'wdSpouseFields')">
      Enable spouse parameters
    </label>
    <div class="wd-panel-fields disabled" id="wdSpouseFields" inert>
      <!-- Fields here -->
    </div>
  </div>
</div>
```

- Header collapses entire panel (same as Type A)
- Checkbox inside body enables/disables field wrapper
- `_wdInnerToggle(cb, fieldsId)` toggles `.disabled` class + `inert` attribute
- Disabled fields use reduced opacity + `pointer-events: none` + `inert` for accessibility

#### Type C: Nested Checkbox Panel (Glide Path)

```html
<div class="wd-opt-panel" style="background:transparent">
  <label class="wd-opt-header">
    <input type="checkbox" id="wdGlideToggle"
      onchange="_wdSubCheckChanged('wdGlideToggle','wdGlidePanel',onGlideToggleChange)">
    <svg class="wd-sub-chevron" data-sub-panel="wdGlidePanel"
      onclick="_wdSubToggle('wdGlideToggle','wdGlidePanel')">...</svg>
    Enable Retirement Glide Path
  </label>
  <div id="wdGlidePanel" class="disabled">
    <!-- Glide mode select, waypoints, mini chart -->
  </div>
</div>
```

- Nested inside Assumptions panel with transparent background
- Header label contains checkbox directly
- `_wdSubCheckChanged()` handles enable/disable + extra callback
- `_wdSubToggle()` handles collapse/expand without changing checked state

### 5.5 Settings Persistence

**Storage keys**:
| Key | Purpose |
|-----|---------|
| `portfolioReportSettings` | All app settings blob |
| `portfolioWdUIState` | Withdrawal panel open/closed state |
| `portfolioTheme` | Active theme name |
| `portfolioSnapshotCSV` | Cached snapshot diff CSV |

#### `saveSettings(opts)`
Serializes into localStorage:
- All `SETTINGS_FIELDS` (numbers, selects, checkboxes by ID)
- Fixed return/vol fallback values
- Navigation state: `_activeTab`, `_activeSubPivot`
- Dynamic structures: `_spendPhases`, `_contribSchedule`, `_oneTimeSpendings`, `_selectedAccounts`, `_glideWaypoints`, `_glideInterp`, `_scenarios`, `_wdUIState`, `_rebalModel`, `_rebalCustomTargets`, `_theme`
- Calls `_wdScheduleRecalc()` unless `opts.skipRecalc === true`

#### `loadSettings()`
Restores all saved fields, handles migration/compatibility for older formats, restores UI toggle states for inner-toggle panels (sets/removes `disabled` class and `inert` attribute on `*Fields` wrappers).

#### JSON Export/Import
- `exportSettingsToFile()`: Saves settings → adds `_exportedAt` → downloads JSON blob
- `importSettingsFromFile(file)`: Reads JSON → writes to localStorage → restores theme → calls `loadSettings()` → rerenders active tab

### 5.6 Chart System

**No external charting library**. All charts are hand-built SVG + CSS:

| Chart Type | Used In |
|------------|---------|
| Inline SVG line/bar/stacked bar | Withdrawal metrics, Scenario details |
| SVG donut | Rebalance allocation |
| SVG fan chart (percentile bands) | Monte Carlo, Historical backtest |
| SVG histogram | MC ending balance distribution |
| CSS circular ring | Success rate indicator |
| CSS segmented bar | Allocation overview, X-Ray, drift |
| CSS heatmap table | Fund overlap matrix |
| SVG mini chart | Glide path preview |

**Chart registry** (`window._chartRegistry`):
- Charts registered by `buildMetricCharts()` with series definitions
- Rendered by `_renderChart(cid)` reading from registry
- Switched by `switchChart(cid, idx)` for tab-like chart selection
- Supports PV mode via `pvFactors` array (inflation-discounted display)

**Series definition format**:
```javascript
// Line or bar:
{ key: 'bTotal', label: 'Total Balance', color: '#2563eb', type: 'line' }

// Stacked:
{
  type: 'stacked', label: 'Account Balances',
  stack: [
    { key: 'bTaxable', label: 'Taxable', color: '#f59e0b' },
    { key: 'bDeferred', label: 'Deferred', color: '#3b82f6' },
    { key: 'bRoth', label: 'Roth', color: '#10b981' },
    { key: 'bHSA', label: 'HSA', color: '#8b5cf6' }
  ]
}
```

### 5.7 Auto-Recalculate System

**Architecture**: Debounced auto-recalculation on any input change.

```
User changes input → saveSettings() → _wdScheduleRecalc()
                                           │
                                    ┌──────▼──────┐
                                    │ 800ms timer  │
                                    └──────┬──────┘
                                           │
                              ┌────────────▼────────────┐
                              │ computeWithdrawalPlan()  │
                              │ _wdRecalcInProgress=true │
                              └────────────┬────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │ finally:                 │
                              │ _wdRecalcInProgress=false│
                              │ if(dirty) reschedule     │
                              └─────────────────────────┘
```

**Key variables**:
- `_wdAutoRecalcTimer`: setTimeout handle for debounce
- `_wdRecalcInProgress`: boolean re-entry guard
- `_wdRecalcDirty`: boolean deferred-recalc flag

**Behavior**:
- If not on withdrawals tab: set dirty flag, return
- If recalc already in progress: set dirty flag, return
- Otherwise: clear timer, start new 800ms debounce
- On completion: if dirty flag set, schedule another recalc
- On tab re-entry: drain dirty flag with 50ms delay

**skipRecalc**: Panel collapse/expand operations pass `{skipRecalc: true}` to `saveSettings()` to avoid unnecessary recalculation on UI-only state changes.

### 5.8 Sidebar Navigation

The withdrawals tab has a fixed sidebar with navigation links:

**`_wdNavTo(id)`**: Scrolls `.wd-main` to target section, compensating for `.wd-sticky-cards` height + 8px padding. Opens collapsed sections if needed.

**`_wdNavSpy()`**: Highlights the active sidebar link based on scroll position. Threshold = main container top + sticky cards height + 40px buffer. Uses `requestAnimationFrame` throttle.

**`_wdFixLayout()`**: On desktop (>900px), locks withdrawals into fixed sidebar + scrolling main region. Sets `.wd-page-layout` to `position: fixed` below header + pivot-tabs, `body.overflow = 'hidden'`. On mobile (≤900px), delegates to `_wdUnfixLayout()`.

**`_wdUnfixLayout()`**: Restores normal document flow — clears fixed positioning from `.wd-page-layout` and restores `body.overflow`.

**`syncFixedBars()`**: Runs on DOMContentLoaded and window resize. Sets correct `top` offsets for `.pivot-tabs` (below `.header`) and `#holdingsSubPivot` (below tabs). Sets spacer heights for `#headerSpacer` and `#pivotTabsSpacer`.

**`_wdUpdateResultNav()`**: Enables only sidebar links whose corresponding result sections exist in the DOM.

### 5.9 Context-Aware Help

**Data source**: `HELP_CONTENT` object with entries per page/sub-tab.

**Keys**: `holdings/acctName`, `holdings/xray`, `withdrawals`, `scenarios`, `snapshot`, etc.

**Entry structure**:
```javascript
{
  title: "Fund X-Ray",
  overview: "Decomposes your funds into...",
  inputs: [["Fund Holdings", "Live or cached fund composition data"]],
  outputs: [["Stock Concentration", "Your top underlying stock exposures"]],
  tips: ["Click heatmap cells to see overlap detail"]
}
```

**Resolution**: `_helpKey()` returns `holdings/<subpivot>` or `_activeTab`.

**Keyboard shortcuts**:
- `?` opens help (unless in input/textarea/select)
- `Esc` closes overlay
- `Ctrl+Enter` / `Cmd+Enter` runs withdrawal calc

### 5.10 PDF/Print Export

No PDF library — uses browser print-to-PDF:
1. For withdrawals: builds hidden `#wd-print-params` with summary of all inputs
2. Calls `window.print()`
3. `@media print` CSS hides interactive elements, forces sections open

---

## 6. Holdings Views

### 6.1 Account / Account Type / Category Pivots

Each pivot builds grouped data from `DATA` and renders expandable cards:
- `buildAcctTypePivot()` → groups by account type (collapses Tax-Deferred subtypes into "Tax-Deferred Savings")
- `buildAcctNamePivot()` → groups by account
- `renderCards()` → generic card renderer with allocation bar, badge, inner tickers

The Tax-Deferred grouping list:
```javascript
const TAX_DEFERRED_TYPES = [
  'Tax-Deferred 401(k)', 'Tax-Deferred IRA', 'Tax-Deferred DCP',
  'Tax-Deferred 457(b)', 'Tax-Deferred 403(b)'
];
```

Percentages computed in-browser: `pct(v) = (v / GRAND * 100).toFixed(1) + '%'`

### 6.2 Fund X-Ray

**`computeFundXRay()`** decomposes fund holdings:
1. For each holding in `DATA`, check if symbol exists in `FUND_HOLDINGS_DB`
2. If fund: decompose into underlying stocks with proportional values
3. If direct stock: add as 100% direct exposure
4. Build: `stockExposure[sym] = {name, totalVal, sources: [{fundSym, fundName, pct, val}]}`
5. Compute pairwise fund overlap matrix
6. Generate concentration/redundancy/diversification alerts

**Found In column**: For each stock, shows source funds with the stock's weight within that fund:
```html
<a>VTI <span>6.3%</span></a>  <!-- AAPL is 6.3% of VTI -->
```

### 6.3 Rebalance

- Model portfolio selector (Conservative, Moderate, Aggressive, custom)
- Current vs target allocation visualization
- Trade generation: `generateRebalTrades(targetPcts, curPcts)` → buy/sell/hold instructions
- SVG donut charts for visual comparison

### 6.4 Expenses

- Weighted average expense ratio across funds
- Annual fee drag computation
- 10-year projected drag with assumed 7% growth
- Per-fund savings from switching to cheaper alternatives

### 6.5 Suggestions

- Scores funds on multiple dimensions (returns, volatility, drawdown, fees)
- Compares against model portfolios
- `computeCurrentAlloc()` → current equity/bond/intl/cash breakdown

### 6.6 Tax-Loss Harvesting

- Identifies positions with unrealized losses
- Computes LTCG offset savings, ordinary income offset (capped at $3,000/year)
- Tracks carryover
- Deep-loss hold rule: loss > 50% of basis in tax-advantaged account → recommend holding

---

## 7. Withdrawal Engine

The retirement withdrawal engine is **entirely client-side JavaScript** embedded in `template.html`. There is no Python withdrawal engine.

### 7.1 Financial Constants

#### RMD Table (`RMD_TABLE`)
IRS Uniform Lifetime Table — maps age to distribution period:
- Age 72 → 27.4, Age 73 → 26.5, Age 75 → 24.6, Age 80 → 20.2, Age 90 → 12.2, Age 100 → 6.4, Age 120 → 2.0

#### Federal Tax Brackets (2025)

**Married Filing Jointly** (`TAX_BRACKETS_MFJ`):
```javascript
[[23850, 0.10], [97100, 0.12], [190750, 0.22], [364200, 0.24],
 [462500, 0.32], [693750, 0.35], [Infinity, 0.37]]
```

**Single** (`TAX_BRACKETS_SINGLE`):
```javascript
[[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
 [250525, 0.32], [626350, 0.35], [Infinity, 0.37]]
```

#### Long-Term Capital Gains Brackets (2025)

**MFJ**: 0% up to $96,700 taxable; 15% up to $600,050; 20% above  
**Single**: 0% up to $48,350; 15% up to $533,400; 20% above

#### Standard Deduction (2025)
- MFJ: $30,000 (base) + $1,600 per spouse ≥65
- Single: $15,000 (base) + $2,000 if ≥65
- OBBBA senior deduction phaseout at high MAGI

#### Capital Market Assumptions (`CMA`)
```javascript
{
  stock: { ret: 0.10, vol: 0.15 },   // 10% return, 15% volatility
  bond:  { ret: 0.04, vol: 0.05 }    // 4% return, 5% volatility
}
```

#### Historical Returns (`HIST_RETURNS`)
Array of `{y, s, b, i}` objects from 1926-2024:
- `y`: year, `s`: stock return, `b`: bond return, `i`: inflation

#### IRMAA Brackets
Medicare Part B + Part D surcharges based on MAGI (2-year lookback):
```javascript
// MFJ thresholds: [206000, 258000, 322000, 386000, 750000]
// Single thresholds: [103000, 129000, 161000, 193000, 500000]
// Per-person annual surcharges: [0, 1044, 2614.80, 4185.60, 5756.40, 7046.40]
```

#### Social Security Age Factors (`SS_AGE_FACTOR`)
Benefit multiplier relative to FRA (age 67 = 1.0):
- Age 62: 0.70 (30% reduction)
- Age 67: 1.00 (full retirement age)
- Age 70: 1.24 (delayed credits)

### 7.2 Tax Computation

**`calcTax(ordinaryIncome, brackets)`**: Progressive bracket calculation — applies each rate to the income within that bracket.

**`calcLTCG(ltcgAmount, taxableIncome, filing)`**: Stacks capital gains on top of ordinary taxable income to determine 0%/15%/20% rate.

**`getStdDeduction(filing, age, spouseAge, hasSpouse, magi)`**: Returns applicable standard deduction with age-65 additions and MAGI phaseout.

**`calcIRMAA(magi, filing, numPeople)`**: Uses tiered surcharge brackets with 2-year MAGI lookback.

**`calcSSTaxableAmount(ssIncome, otherOrdinaryIncome, filing)`**: Implements IRS Publication 915 provisional income test:
- Below threshold: 0% taxable
- Tier 1: up to 50% taxable
- Tier 2: up to 85% taxable (hard ceiling)

### 7.3 Pre-Retirement Growth

For each year before retirement:
1. Apply inflation-adjusted contributions (401k, match, IRA, taxable, HSA) per `buildContribForAge()` schedule
2. Apply one-time spendings (withdrawals from pre-retirement balances)
3. Grow balances by annual return (glide-path-aware if enabled)
4. Inflate spending target

### 7.4 Annual Simulation Loop (`runSimulation()`)

For each retirement year:
1. Compute current age + spouse age
2. Inflate Social Security benefits using claim-age factor
3. Add post-retirement side income
4. Determine spending need:
   - From spending phases if defined
   - Else: 4% rule with guardrails (3.5% floor / 5.5% ceiling)
5. Add one-time spendings for this age
6. Add healthcare costs for this age
7. Compute target withdrawal = spending + healthcare − SS − side income
8. Calculate RMD if applicable
9. Execute withdrawal sequencing (see §7.5)
10. Execute Roth conversion if applicable (see §7.6)
11. Compute taxes:
    - Ordinary income tax (progressive brackets)
    - Taxable Social Security
    - Long-term capital gains tax
    - HSA penalty if pre-65
    - Flat state tax rate
    - IRMAA surcharge (2-year lookback)
12. Surplus RMD/SS cash reinvested to taxable account
13. Pay taxes: waterfall from taxable → deferred → Roth → HSA
14. Grow remaining balances by annual return

### 7.5 Withdrawal Sequencing

**Pre-RMD order** (maximize tax-deferred growth):
1. HSA for qualified medical expenses first
2. Taxable account
3. Tax-deferred up to low-bracket room (avoid higher brackets)
4. Roth (tax-free)
5. Extra tax-deferred if still needed

**Post-RMD order** (mandatory distributions first):
1. Mandatory RMD from tax-deferred
2. Taxable account
3. Extra tax-deferred
4. Roth
5. HSA as last resort

### 7.6 Roth Conversions

- Only executed pre-RMD age
- Bracket-capped: converts up to a target tax bracket ceiling
- Binary search includes Social Security re-taxation effect
- Pro-rata IRA basis handling
- Standard-deduction harvest reserve can withhold conversion amount
- User can select: no conversion, specific bracket %, custom dollar amount

### 7.7 Social Security Modeling

- FRA monthly benefit × age factor (62=0.70, 67=1.00, 70=1.24)
- Annual inflation adjustment
- Taxation: 0%/50%/85% based on provisional income
- Spouse SS: independent claim age and FRA benefit
- Break-even analysis: cumulative comparison of claim at 62 vs 67 vs 70

### 7.8 Healthcare Cost Modeling

`buildHealthcareCostForAge(params)`:

**Pre-65** (before Medicare):
- Base monthly premium × 12, inflated annually at medical inflation rate
- Default medical inflation: separate from general CPI

**Post-65** (Medicare):
- Medicare Part B + Part D premiums
- Out-of-pocket costs (Medigap/supplement)
- IRMAA surcharges (from income-based brackets)
- All inflated annually

**Spouse-aware**: If spouse is younger, pre-65 costs extend until spouse turns 65.

### 7.9 Monte Carlo Simulation

**`runMonteCarlo(params)`**:
- Log-normal model: `mu = ln(1 + ret) - vol²/2`
- Annual random draw via Box-Muller transform
- Glide-path-aware (adjusts return/vol per age)
- Default: 1,000 iterations
- Per-year tracking of all balance percentiles
- Simplified but tax-aware annual sequencing

**Output**:
```javascript
{
  bands: [{ age, p10, p25, p50, p75, p90 }],
  successRate: 0.87,    // % of sims not depleted
  endingBalances: [...], // final balance per sim
  median: 1500000
}
```

### 7.10 Historical Backtest

**`runHistoricalBacktest(params)`**:
- Replays retirement across all rolling periods from `HIST_RETURNS` (1926-2024)
- Uses actual stock/bond/inflation data per year
- Glide-path-aware blending
- Same withdrawal/tax/RMD/conversion framework as deterministic engine

**Output**: Same shape as Monte Carlo (bands, success rate, worst 5 outcomes)

### 7.11 Glide Path

**`buildGlideSchedule(retAge, lifeExp, mode, waypoints, curAge, interp)`**:

| Mode | Behavior |
|------|----------|
| `fixed` | No schedule (null) — uses static return/vol |
| `glidepath` | Auto: equity% = `110 - age`, clamped 20-80% |
| `custom` | User-defined waypoints with `linear` or `step` interpolation |

**`blendGlideAllocation(eqPct)`**: Converts equity percentage to blended return/volatility:
```javascript
ret = eqPct * CMA.stock.ret + (1 - eqPct) * CMA.bond.ret
vol = eqPct * CMA.stock.vol + (1 - eqPct) * CMA.bond.vol
```

### 7.12 Spending Phases & One-Time Spendings

**Spending phases**: User defines annual spending amounts by age range:
- Each phase: `{ age: number, amount: number }`
- Phases apply in order; latest applicable phase wins
- Phase tags: Go-Go (< 72), Slow-Go (72-82), No-Go (83+)
- If no phases defined: 4% rule with 3.5%/5.5% guardrails

**One-time spendings**: Age-keyed lump sums (home repair, car purchase, etc.):
- Each entry: `{ year: number, amount: number, desc: string }`
- Converted to age-keyed map for simulation
- Added on top of regular spending for that year

### 7.13 Editable Withdrawal Table

**`renderWdTable()`**: Year-by-year schedule showing:
- Age, spending, SS, withdrawals by account type, taxes, balances
- PV/FV toggle via `_wdToggleTablePV()`
- CSV export via `downloadWdTableCSV()`

**`wdOverride(el)`**: Inline editing of table cells:
- Stores field/row overrides
- Reruns forward calculation from override point
- Maintains per-account detail breakdowns

---

## 8. Scenario Comparator

**`renderScenarios()`**: Three side-by-side retirement scenarios sharing a common profile.

Each scenario can vary:
- Return/volatility assumptions
- Spending amount
- Roth conversion strategy
- Social Security claim age
- Retirement age

**`runScenarioComparison()`**: Runs all scenarios, produces comparison tables/charts.
Each scenario uses `_scenarioSim(p)` which runs the same engine as the withdrawal planner.

Results cached in `_scenResultsCache` with fingerprint-based invalidation.

---

## 9. Snapshot Diff

**Purpose**: Compare current portfolio against an older Fidelity CSV to see changes.

**Flow**:
1. Upload older Fidelity CSV
2. Parse with `sdParseFidelityCSV(text)` → same schema as generated data
3. Flatten current `DATA` via `sdFlattenCurrentData()`
4. Compute diff via `sdComputeDiff(before, after)`

**Diff output**:
```javascript
{
  totalBefore, totalAfter, totalChange, totalChangePct,
  newPositions: [...],
  closedPositions: [...],
  changedPositions: [...],
  categoryDiff: { catName: { before, after, change, changePct } },
  accountDiff: { acctNum: { ... } },
  hierarchy: { /* category → account → holdings */ },
  accountHierarchy: { /* account → holdings */ }
}
```

**Persistence**: Uploaded CSV cached in `localStorage.portfolioSnapshotCSV`.

---

## 10. Cache Data Sources

| Cache File | Builder | Source | Refresh Trigger |
|-----------|---------|--------|-----------------|
| `risk_cache.json` | `fetch_risk_data.py` | yfinance stock fundamentals | `-RefreshRisk` or cache missing |
| `suggestions_cache.json` | `fetch_suggestions.py` | yfinance fund returns | `-RefreshSuggestions`, cache missing, or > 7 days old |
| Live fund holdings | In-memory (generator) | Yahoo Finance quoteSummary API | Every generation run |

---

## 11. Test Architecture

**Harness**: Custom minimal test framework in `test-helpers.js`:
- `test(name, fn)`, `suite(name)`, `summarize(label)`
- Node.js `assert` module
- Template JS extraction via marker strings + `eval` with mocked browser globals

**Test extraction helpers**:
| Helper | Extracts |
|--------|----------|
| `extractFormattingFunctions()` | `fmt`, `fmt2`, `esc`, `pct`, `ylink` |
| `extractFinancialFunctions()` | Tax, RMD, SS, MC, historical, IRMAA, percentile, chart builders |
| `extractSnapshotFunctions()` | CSV parsers, diff engine, account type inference |
| `extractSpendingFunctions()` | Spending phases, glide path, contributions, healthcare |
| `extractAllocationFunctions()` | Allocation bucketing, rebalance, expense, TLH math |
| `extractScenarioHelpers()` | Scenario simulation, bracket limit computation |

**Test matrix** (761 total):

| File | Count | Focus |
|------|-------|-------|
| `test_formatting.js` | 22 | Currency formatting, HTML escaping, percentage display, Yahoo links |
| `test_tax.js` | 53 | Tax brackets (MFJ/Single), LTCG rates, standard deduction, IRMAA, SS taxation, RMD table |
| `test_allocation.js` | 21 | Allocation bucketing, rebalance drift, expense drag, TLH savings |
| `test_withdrawal.js` | 54 | Spending phases, glide path, MC shape, historical shape, withdrawal sequencing |
| `test_engine.js` | 123 | Deep integration: glide blending, contributions, Roth bracket, deterministic engine, cross-engine consistency, edge cases, healthcare, HSA |
| `test_snapshot.js` | 43 | CSV parsing, currency parsing, classification, account inference, diff engine |
| `test_csv_export.js` | 24 | Round-trip: input CSV → generated report → re-exported CSV validation (4 samples × 6 checks) |
| `test_bounds.js` | 6 | Withdrawal solver upper-bound sanity |
| `test_ui.js` | 404 | Template structure, function presence, settings wiring, panel structure, accessibility, auto-recalc |
| `test_skill_accuracy.js` | 12 | SKILL.md alignment: tab counts, script mentions, test counts |

**Run**: `pwsh -File scripts/run-all-tests.ps1`

---

## 12. JavaScript Function Reference

### Utilities
| Function | Purpose |
|----------|---------|
| `setTheme(name)` | Apply theme, persist to localStorage |
| `showToast(msg, type)` | Display notification toast |
| `fmt(v)` | Format currency with 2 decimals |
| `fmt2(v)` | Format rounded currency |
| `esc(s)` | HTML-escape string |
| `pct(v)` | Portfolio percentage display |
| `ylink(sym)` | Yahoo Finance anchor HTML |
| `_fmtD(v)` | Rounded dollar display |
| `_fmtK(v)` | Compact dollar (K/M) |
| `initColResize(tbl)` | Draggable column resize |
| `buildMethodologyPanel(title, bullets)` | Reusable expandable methodology section |

### Holdings Rendering
| Function | Purpose |
|----------|---------|
| `buildAcctTypePivot()` | Group holdings by account type |
| `buildAcctNamePivot()` | Group holdings by account |
| `renderAllocBar(items, colorFn)` | Segmented allocation bar |
| `renderCards(groups, colorFn, badgeFn, innerColorFn)` | Generic card renderer |
| `renderAcctTypePivot()` | Render account type view + insights |
| `renderCategoryPivot()` | Render category view + insights |
| `renderAcctNamePivot()` | Render account view + insights |
| `computeInsights(pivot)` | Auto-generated holdings insights |

### Fund X-Ray
| Function | Purpose |
|----------|---------|
| `computeFundXRay()` | Decompose funds, compute overlap/alerts |
| `showOverlapDetail(symA, symB)` | Modal with shared/unique holdings |
| `renderFundXRay()` | Full X-Ray page render |

### Rebalance
| Function | Purpose |
|----------|---------|
| `renderRebalance()` | Model selector + UI |
| `selectRebalModel(key)` | Choose rebalance model |
| `renderRebalResult()` | Current vs target + trades |
| `generateRebalTrades(target, current)` | Buy/sell instructions |
| `_rebalDonut(data, size, label)` | SVG donut chart |

### Expenses / Suggestions
| Function | Purpose |
|----------|---------|
| `renderExpenses()` | Fee analysis page |
| `computeCurrentAlloc()` | Current equity/bond breakdown |
| `renderSuggestions()` | Fund research page |

### Tax/Finance
| Function | Purpose |
|----------|---------|
| `calcTax(income, brackets)` | Progressive tax calc |
| `calcLTCG(amount, taxableIncome, filing)` | Capital gains tax |
| `getStdDeduction(filing, age, ...)` | Standard deduction |
| `calcIRMAA(magi, filing, numPeople)` | Medicare surcharge |
| `calcSSTaxableAmount(ss, other, filing)` | SS taxation (0/50/85%) |

### Simulation Engines
| Function | Purpose |
|----------|---------|
| `runMonteCarlo(params)` | Randomized retirement simulation |
| `runHistoricalBacktest(params)` | Rolling-period historical replay |
| `randNormal()` | Box-Muller normal random |
| `percentile(arr, p)` | Generic percentile |
| `buildSimulationFanChart(opts)` | SVG percentile-band chart |

### Glide / Contributions / Healthcare
| Function | Purpose |
|----------|---------|
| `blendGlideAllocation(eqPct)` | Equity% → blended return/vol |
| `buildGlideSchedule(retAge, lifeExp, mode, wp, curAge, interp)` | Age-by-age allocation schedule |
| `buildContribForAge(settings)` | Annual contribution schedule |
| `buildHealthcareCostForAge(params)` | Age-by-age healthcare costs |
| `renderGlideMiniChart()` | Interactive glide SVG |

### Withdrawal Planner
| Function | Purpose |
|----------|---------|
| `renderWithdrawals()` | Full planner page |
| `computeWithdrawalPlan()` | Main deterministic engine |
| `runSimulation(enableConversions, limit)` | Annual simulation loop |
| `renderWdTable()` | Editable year-by-year schedule |
| `wdOverride(el)` | Inline cell edit + recompute |
| `buildSSBreakEven(...)` | SS claim-age comparison chart |
| `showWithdrawalSuggestions()` | Spending suggestion modal |

### Settings
| Function | Purpose |
|----------|---------|
| `saveSettings(opts)` | Persist all state to localStorage |
| `loadSettings()` | Restore all state |
| `exportSettingsToFile()` | Download settings JSON |
| `importSettingsFromFile(file)` | Upload and apply settings |
| `_wdScheduleRecalc()` | Debounced auto-recalc trigger |

### Panel / Navigation
| Function | Purpose |
|----------|---------|
| `_wdPanelToggle(panelId)` | Collapse/expand always-on panel |
| `_wdInnerToggle(cb, fieldsId)` | Enable/disable inner-toggle panel |
| `_wdSubCheckChanged(checkId, panelId, extra)` | Nested checkbox toggle |
| `_wdSubToggle(checkId, panelId)` | Collapse nested without changing checked |
| `_wdNavTo(id)` | Scroll to section with sticky offset |
| `_wdNavSpy()` | Update active sidebar link |

### Snapshot Diff
| Function | Purpose |
|----------|---------|
| `sdParseFidelityCSV(text)` | Parse uploaded CSV |
| `sdFlattenCurrentData()` | Convert DATA to snapshot schema |
| `sdComputeDiff(before, after)` | Full diff computation |
| `renderSnapshotDiff()` | Upload UI or results |

### Scenarios
| Function | Purpose |
|----------|---------|
| `renderScenarios()` | Comparator UI |
| `_scenarioSim(p)` | Run one scenario |
| `runScenarioComparison()` | Execute all + render |

---

## 13. Known Gaps & Design Notes

### Python vs PowerShell Parity
- Both generators (`main.ps1` and `main.py`) produce identical output for all 9 placeholders
- **PowerShell (`main.ps1`) is the authoritative generator** — Python is the cross-platform alternative

### Account Type Grouping
- Python infers `Tax-Deferred TSP` but the template's `TAX_DEFERRED_TYPES` list omits TSP
- No unified `Tax-Exempt` bucket in UI — Roth, HSA, 529 remain separate labels

### No External Dependencies in Report
- Zero external JS libraries (no Chart.js, D3, React)
- Zero external CSS frameworks
- All charts are hand-built SVG
- Only external dependency: browser's built-in print-to-PDF

### State Architecture
Global mutable state (by design — single-file app):
- `_activeTab`, `_activeSubPivot`
- `_wdUIState`, `_wdSubCollapsed`
- `_tabCache`, `_wdResultsCache`, `_scenResultsCache`
- `_wdRecalcInProgress`, `_wdRecalcDirty`, `_wdAutoRecalcTimer`
- `window._chartRegistry`, `window._xrayResult`, `window._wdSimData`

### Test Methodology
- Tests extract production JS from `template.html` and evaluate with mocked browser globals
- No real DOM/browser testing (Playwright, Puppeteer, etc.)
- UI tests are primarily regex/string assertions against raw HTML
- `test_csv_export.js` validates against actual sample files on disk
