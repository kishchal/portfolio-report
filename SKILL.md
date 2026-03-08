---
name: portfolio-report
description: Generate an interactive HTML portfolio allocation report from a Fidelity CSV export with seven pivot views (By Account Type / By Investment Category / By Account / Suggestions / Withdrawals / Tax-Loss Harvesting / Scenarios), data-driven risk classification via yfinance, 3-level drill-down, auto-generated risk insights, investment suggestions with model portfolios and account guidance, a retirement withdrawal planner with tax-efficient sequencing, Social Security income modeling, BETR Roth conversion analysis, Monte Carlo simulation, and a what-if scenario comparator.
allowed-tools: powershell python
compatibility: Requires Python 3 with yfinance package. Works on Windows, macOS, and Linux.
metadata:
  author: portfolio-report
  version: "4.2.0"
---

# Portfolio Report Skill

Generates a professional, interactive HTML portfolio allocation report from a Fidelity portfolio positions CSV export.

## When to Use

Use this skill when the user asks:
- "Generate a portfolio report from my CSV"
- "Create an investment breakdown report"
- "Analyze my Fidelity portfolio positions"
- "Show me my portfolio allocation with drill-down"

## How to Execute

### IMPORTANT: Always Refresh Data for New Reports

**Every time a report is generated from a new or updated CSV, the agent MUST include both refresh flags** to ensure the report uses up-to-date financial data from Yahoo Finance:

```bash
# Python (ALWAYS use --refresh-all for new CSVs)
python ~/.copilot/skills/portfolio-report/scripts/main.py \
    "/path/to/Portfolio_Positions.csv" \
    --refresh-all
```

```powershell
# PowerShell (ALWAYS use -RefreshAll for new CSVs)
& "$env:USERPROFILE\.copilot\skills\portfolio-report\scripts\main.ps1" `
    -CsvPath "C:\path\to\Portfolio_Positions.csv" `
    -RefreshAll
```

This ensures:
- **Risk classification** uses latest P/E, beta, market cap, revenue growth from Yahoo Finance (not stale cache)
- **Suggestions tab** shows current 1Y/3Y returns, volatility, max drawdown for all 33 recommended funds
- Any **new stock tickers** not in the cache get automatically fetched and classified

Only omit the refresh flags when re-generating the same report within the same day (data won't change).

### Running without refresh (same-day re-generation only)

**Python (default, cross-platform — works on macOS, Linux, Windows):**

```bash
python ~/.copilot/skills/portfolio-report/scripts/main.py \
    "/path/to/Portfolio_Positions.csv" \
    --output "/path/to/Portfolio_Report.html"
```

**PowerShell (alternative, Windows):**

```powershell
& "$env:USERPROFILE\.copilot\skills\portfolio-report\scripts\main.ps1" `
    -CsvPath "C:\path\to\Portfolio_Positions.csv" `
    -OutputPath "C:\path\to\Portfolio_Report.html"
```

If `--output` / `-OutputPath` is omitted, the report is saved alongside the CSV with a `_Report` suffix.

### Parameters

**Python (`scripts/main.py`):**

| Parameter    | Required | Description                                      | Example                                              |
|--------------|----------|--------------------------------------------------|------------------------------------------------------|
| csv_path (positional) | Yes | Full path to the Fidelity portfolio positions CSV | `~/Downloads/Portfolio_Positions_Feb-28-2026.csv` |
| --output     | No       | Full path for the output HTML report              | `~/Downloads/Portfolio_Report.html`                   |
| --refresh-all | No     | Refresh all cached data — risk + suggestions (Recommended) | `--refresh-all` |
| --refresh-risk | No     | Fetch fresh financial data from Yahoo Finance to update risk classification cache | `--refresh-risk` |
| --refresh-suggestions | No | Fetch fresh fund metrics (returns, volatility) from Yahoo Finance for the Suggestions tab | `--refresh-suggestions` |

**PowerShell (`scripts/main.ps1`):**

| Parameter    | Required | Description                                      | Example                                              |
|--------------|----------|--------------------------------------------------|------------------------------------------------------|
| CsvPath      | Yes      | Full path to the Fidelity portfolio positions CSV | `C:\Investments\Portfolio_Positions_Feb-28-2026.csv`  |
| OutputPath   | No       | Full path for the output HTML report              | `C:\Investments\Portfolio_Report.html`                |
| RefreshAll   | No       | Refresh all cached data — risk + suggestions (Recommended) | `-RefreshAll` |
| RefreshRisk  | No       | Fetch fresh financial data from Yahoo Finance to update risk classification cache | `-RefreshRisk` |
| RefreshSuggestions | No | Fetch fresh fund metrics (returns, volatility) from Yahoo Finance for the Suggestions tab | `-RefreshSuggestions` |

### CSV Format Expected

The skill expects a Fidelity portfolio positions CSV. It auto-detects two formats:

**Format A (with Account Type column):**
- `Account Number`, `Account Type`, `Account Name`, `Symbol`, `Description`, `Current Value`, …

**Format B (without Account Type column):**
- `Account Number`, `Account Name`, `Symbol`, `Description`, `Current Value`, …

When the `Account Type` column is missing, the type is **auto-inferred** from the Account Name:

| Account Name Pattern              | Inferred Type         |
|-----------------------------------|-----------------------|
| ROTH IRA, ROTH IRA for Minor      | Roth                  |
| Health Savings Account            | HSA                   |
| *COLLEGE SAVINGS, 529             | 529 College Savings   |
| UTMA, Uniform Transfers to Minors | Custodial (UTMA)      |
| *401K*, BrokerageLink*            | Tax-Deferred 401(k)   |
| *DCP, Deferred Comp*              | Tax-Deferred DCP      |
| Rollover IRA, Traditional IRA     | Tax-Deferred IRA      |
| INDIVIDUAL, Joint*, WROS*         | Taxable Investment    |

### Duplicate Account Filtering

Wrapper accounts whose Description is `BROKERAGELINK` and whose Account Name ends with `401K PLAN` are automatically excluded to avoid double-counting (e.g. MICROSOFT 401K PLAN is a wrapper for the BrokerageLink sub-account that lists the actual holdings).

### Tax-Lot Aggregation

Multiple rows for the same ticker in the same account (different tax lots with different cost bases) are automatically merged by both `main.py` and `main.ps1`. Values, gain/loss, and cost basis are summed; gain/loss percentage is recalculated from the aggregated totals. This prevents duplicate ticker entries in the drill-down views.

### Output

An interactive HTML report featuring:
1. **Header** with total portfolio value
2. **Horizontal allocation bar** with hover tooltips — updates dynamically per active pivot
3. **Pivot selector** (tab toggle) with seven views:
   - **By Account Type** (default) — Tax-Deferred Savings, Taxable Investment, Roth, Cash / Money Market, HSA, 529 College Savings, Custodial (UTMA). Cash/money market holdings (SPAXX**, FDRXX**, CORE**) are separated into their own top-level group to avoid double-counting within accounts.
   - **By Investment Category** — US Index Funds, Individual Stocks, International Funds, Bond Funds, etc.
   - **By Account** — Each individual account (by account number/name) as a top-level card, with investment categories as children and tickers within each category.
   - **Suggestions** — Investment research and portfolio construction guidance featuring:
     - **Current vs Model Allocation** — visual bar chart comparing your portfolio's asset class breakdown (US Equity, International, Bonds, Cash, Real Estate, Alternatives, Other) against three model portfolios. All holdings always sum to 100% — unmapped categories (CDs, Unspecified) are captured in the "Other" bucket.
     - **Fund-by-Fund Analysis** — table of 19 recommended ETFs/index funds/bond funds with performance metrics (1Y/3Y returns, volatility, max drawdown), expense ratios, and suitability scores (Growth, Risk, Diversification, Cost on 1–10 scale)
     - **Three Model Portfolios** — High Risk/High Growth, Medium Risk/Balanced, Low Risk/Capital Preservation with specific ticker allocations, weighted expense ratios, and volatility expectations
     - **Account-Specific Guidance** — tax-efficient placement recommendations for 401(k), Traditional IRA, and Roth IRA with target allocation ranges and rationale
     - **Disclaimers** — educational research notice, not personalized financial advice
   - **Withdrawals** — Interactive retirement withdrawal planner featuring:
     - **Input Panel** — shared fields (expected return %, inflation %, filing status, Roth conversion strategy) plus per-participant sections for You and Spouse (toggle): current age, retirement age, life expectancy, monthly SS income, SS starting age (62–70)
     - **Summary Cards** — projected portfolio at retirement, year-1 total income (portfolio + combined SS), effective tax rate, combined Social Security card (per-participant breakdown), portfolio longevity
     - **Social Security Age Recommendation** — per-participant comparison tables showing benefits at ages 62/67/70 with monthly/annual amounts, % of FRA, years collecting, inflation-adjusted lifetime totals, and optimal claiming age recommendation based on each person's life expectancy
     - **Account Balance Projection Chart** — stacked bar chart showing Taxable/Tax-Deferred/Roth/HSA depletion over time
     - **Monte Carlo Analysis** — 500 randomized simulations with log-normal return distributions:
       - Summary cards: success rate (with visual ring), median ending balance, 10th/90th percentile outcomes
       - Percentile fan chart (SVG): 10th–90th and 25th–75th percentile bands with median line and deterministic overlay
       - Ending balance distribution histogram
       - Interpretation notes with actionable guidance based on success rate
       - Tax estimation in MC: simplified income tax + LTCG + HSA penalty per simulated year
     - **Year-by-Year Withdrawal Table** — detailed schedule with editable withdrawal cells (Taxable, Tax-Deferred, Roth, HSA) per bucket, SS income column, estimated tax (including SS taxation), after-tax income (nominal and present value), running balances (nominal and present value); RMD years highlighted. Override any withdrawal amount to recalculate the entire table forward — overridden cells highlighted in orange. All column headers have detailed formula tooltips showing exactly how each value is calculated.
     - **Strategy Notes** — withdrawal order rationale, SS income integration, Roth conversion window, tax efficiency tips (including SS taxation rules, standard deduction, HSA penalty rules), assumptions & methodology
     - **Financial Engine**:
       - 4% rule with guardrails (3.5% floor, 5.5% ceiling of current portfolio)
       - IRS Uniform Lifetime Table RMDs — dynamic start age: 75 for born 1960+ (SECURE 2.0), 73 for born 1951-1959, 72 for born ≤1950
       - 2025 federal tax brackets (OBBBA) with age-aware standard deduction: base $31,500 MFJ / $15,750 Single + $1,600/person MFJ ($2,000 Single) at 65+ + OBBBA $6,000/person 65+ (2025-2028)
       - Tiered LTCG rates: 0% up to $96,700 MFJ / $48,350 Single, 15% up to $600,050/$533,400, 20% above — stacked on ordinary taxable income
       - SS taxation per IRS Pub 915 — combined income (AGI + LTCG + 50% of SS) determines 0%/50%/85% taxable thresholds ($32K/$44K MFJ, $25K/$34K Single)
       - **IRMAA (Medicare surcharges)**: 2025 CMS brackets (6 tiers, MFJ + Single), Part B + Part D surcharges, 2-year MAGI lookback, per-person calculation for ages 65+
       - HSA tax rules: tax-free for medical ($5K/yr inflation-adjusted at 65+), ordinary income after 65 for non-medical, 20% penalty + ordinary income before age 65
       - **Roth Conversion Optimizer**: Compares None/Conservative(12%)/Moderate(22%)/Aggressive(24%)/Custom strategies with configurable conversion window (start/end ages); bracket room = ceiling + std deduction − ordinary income
       - **Spending Phases**: User-defined spending by age (e.g., go-go/slow-go/no-go) with per-phase monthly amounts; phases inflate from today's dollars; 4% guardrails disabled when phases active
       - Excess RMD surplus reinvested into taxable brokerage account
       - Dual-participant SS with independent benefit age scaling (62–70) and spouse age column in withdrawal table
       - Household planning horizon extending to the longer-surviving spouse (with info banner when extended)
       - Monte Carlo engine (1000 sims, log-normal returns, Box-Muller transform) with tiered LTCG, age-aware deductions, IRMAA
       - **BETR (Break-Even Tax Rate)**: Vanguard-research-inspired Roth conversion analysis — State Tax % input, IRA Basis ($) input with pro-rata rule, BETR column in optimizer table, Conv % column in year-by-year table, BETR insight card comparing BETR vs estimated retirement rate
       - **Account Selector**: Multi-select dropdown to choose which accounts to include; persisted in localStorage
       - **Interactive Metric Charts**: SVG bar charts with tab switching and PV/FV toggle (present value vs projected)
       - **PDF Export**: Print-optimized layout with parameter summary and chart labels
       - **Settings persistence**: All inputs saved to browser localStorage via `input`/`change` events and `beforeunload` handler. Auto-restore on reload.
   - **Tax-Loss Harvesting** — Analyzes unrealized losses in taxable accounts: summary cards, harvestable positions table with replacement fund suggestions, wash sale warnings, cross-account duplicate flags
   - **Scenarios** — What-if scenario comparator: 3-scenario grid with per-scenario retirement age, life expectancy, SS claiming age, monthly SS income, annual return, inflation, Roth conversion strategy (None/Conservative/Moderate/Aggressive/Custom with bracket %, start/end age), state tax %, and multi-phase spending plans (age-based monthly spend phases with add/remove). Side-by-side comparison table (MC success, BETR, lifetime taxes/income, ending balance with PV). Per-scenario metric charts with global chart controls (Apply to All / Individual toggle for FV/PV and chart type). PDF export, localStorage persistence.
4. **3-level drill-down cards**— click top-level group → see Accounts → click Account → see Tickers
5. **Risk classification** — Individual stock tickers are grouped within each account by risk category:
   - **Blue Chip / Core** — Large, stable companies (AAPL, MSFT, JNJ, PG, WMT, etc.)
   - **Growth** — Profitable high-growth tech (NVDA, AVGO, AMD, META, AMZN, CRM, etc.)
   - **Dividend / Value** — Income-oriented (XOM, T, VZ, MO, KO, PEP, O, etc.)
   - **High Risk / Speculative** — High-volatility / momentum names (PLTR, HOOD, RBLX, SNOW, DASH, etc.)
6. **Color-coded badges** per account sub-type (Tax-Deferred 401(k), Tax-Deferred IRA, Tax-Deferred DCP, Taxable Investment, Roth, HSA, 529 College Savings, Custodial UTMA)
7. **Pivot-Aware Risk Insights** — auto-generated analysis at the bottom that changes based on selected pivot:
   - **Both pivots (shared):**
     - **Concentration Risk** — flags single stocks > 10% of portfolio and top-5/10 concentration
     - **Diversification** — flags too many individual stocks
   - **By Account Type pivot:**
     - **Tax Efficiency** — taxable vs tax-advantaged balance, Roth under-utilization, RMD exposure, HSA advice
     - **Account Type Optimization** — per-type risk analysis (e.g., high-risk positions in taxable vs Roth, growth stock placement)
     - **Account Concentration** — flags single accounts holding >20% of portfolio
   - **By Investment Category pivot:**
     - **Asset Allocation vs Recommended Ranges** — compares actual allocation against well-known benchmarks:
       - Equities: recommended 60-70% · Individual Stocks: ≤20% · International: 15-25% · Bonds: 15-30% · Cash: 3-5% · Sector/Thematic: ≤10%
     - **Category Deep Dive** — notes on each category (US stock fund overlap, target-date overlap, sector bets)
     - **Stock Risk Profile** — Growth ≤40%, High Risk ≤10%, Dividend/Value ≥20%, Blue Chip ≥25% recommendations; sector concentration flags

### Account Type Grouping (By Account Type pivot)

In the "By Account Type" view, sub-types are rolled up into top-level groups:

| Top-Level Group       | Sub-Types Included                                     |
|-----------------------|--------------------------------------------------------|
| Tax-Deferred Savings  | Tax-Deferred 401(k), Tax-Deferred IRA, Tax-Deferred DCP |
| Taxable Investment    | Individual, Joint WROS, Individual - TOD               |
| Roth                  | Roth IRA, Roth IRA for Minor                           |
| Cash / Money Market   | SPAXX**, FDRXX**, CORE**, FZDXX, BROKERAGELINK extracted from all accounts |
| HSA                   | Health Savings Account                                 |
| 529 College Savings   | College savings / 529 plans                            |
| Custodial (UTMA)      | Uniform Transfers to Minors                            |

### Category Classification (By Investment Category pivot)

Holdings are automatically categorized:

| Category               | Symbols                                 |
|------------------------|-----------------------------------------|
| US Index Funds         | FXAIX, FSKAX, SCHD, NHFSMKX98          |
| International Funds    | FTIHX, FZILX, VFWSX                    |
| Bond Funds             | FXNAX                                   |
| Tech Sector Fund       | FSPTX                                   |
| Growth / Leveraged ETFs| TQQQ, VOOG, PBW                         |
| Individual Stocks      | AAPL, AMD, MSFT, NVDA, META, etc        |
| Cash / Money Market    | SPAXX**, FDRXX**, CORE**, FZDXX, BROKERAGELINK, CDs (auto-detected by description) |

Unknown symbols default to "Other" category. CDs (Certificates of Deposit) are auto-detected by description pattern ("certificate of deposit", "brokered CD") and classified as Cash / Money Market.

### Risk Classification (Individual Stocks)

Stocks within each account are sub-grouped by risk profile with color-coded headers showing holding count, subtotal, and percentage of account.

**Data-driven classification** (default): Uses financial metrics fetched from Yahoo Finance via `yfinance` and cached to `assets/risk_cache.json`. Metrics used:
- **Beta** — volatility relative to market
- **Trailing P/E** — price-to-earnings ratio
- **Market Cap** — company size
- **Revenue Growth** — year-over-year
- **Profit Margins** — profitability

Classification rules (applied in priority order):

| Risk Category             | Color  | Criteria                                                            |
|---------------------------|--------|---------------------------------------------------------------------|
| High Risk / Speculative   | Red    | beta > 1.8, OR P/E < 0 or > 100, OR negative profit margins, OR market cap < $5B |
| Growth                    | Blue   | revenue growth > 15%, beta > 1.0, market cap > $20B                |
| Dividend / Value          | Green  | beta < 1.0, P/E between 5–25, profit margins > 10%                 |
| Blue Chip / Core          | Purple | Default for large, moderate-metric stocks                           |

**Refreshing the cache**: Use `--refresh-all` / `-RefreshAll` to fetch fresh data for everything (~2-3 min for 250+ symbols):
```bash
# Python
python scripts/main.py "Portfolio_Positions.csv" --refresh-all
# PowerShell
& scripts/main.ps1 -CsvPath "Portfolio_Positions.csv" -RefreshAll
```

If the cache doesn't exist on first run, it is fetched automatically. Static fallback lists in both `scripts/main.py` and `scripts/main.ps1` are used for any symbol not in the cache.

**Dependencies**: Python 3 with `yfinance` package (`pip install yfinance`).

## Post-Generation: Self-Update Checklist

**IMPORTANT**: Every time this skill is executed on a new CSV, the agent MUST perform the following checks and update the skill files accordingly. Input CSVs may contain new accounts, tickers, and fund symbols not seen before.

### 1. Check for Unmapped Symbols

After report generation, scan the CSV for symbols not in `$CategoryMap` in `scripts/main.ps1`. Any **fund or ETF** symbol (mutual funds typically 5+ chars ending in X, or known ETF tickers) that falls through to "Individual Stocks" or "Other" should be added to `$CategoryMap` with the correct category and description.

**How to check**: Look at the generated report for entries in "Other" category or stocks that are actually funds/ETFs misclassified as Individual Stocks.

**How to fix**: Add entries to the `$CategoryMap` hashtable in `scripts/main.ps1`:
```powershell
'NEWSYM' = @{ Category = 'US Index Funds'; Detail = 'Fund Name Here' }
```

Categories to choose from: `US Index Funds`, `International Funds`, `Bond Funds`, `Tech Sector Fund`, `Growth / Leveraged ETFs`, `Sector / Thematic`, `Target-Date / Balanced`, `Cash / Money Market`.

### 2. Check for New Account Types

If new account name patterns appear that don't match existing regex rules in `Get-AccountType` function in `scripts/main.ps1`, add new patterns. Check the report for any accounts showing type "Other" — these need new patterns.

**How to fix**: Add a new `if` clause to `Get-AccountType` in `scripts/main.ps1`:
```powershell
if ($n -match '(?i)new_pattern') { return 'Appropriate Type' }
```

Valid account types: `Taxable Investment`, `Tax-Deferred 401(k)`, `Tax-Deferred IRA`, `Tax-Deferred DCP`, `Roth`, `HSA`, `529 College Savings`, `Custodial (UTMA)`.

### 3. Check for New Individual Stocks Missing from Risk Cache

If new stock symbols appear that aren't in `assets/risk_cache.json`, run with `--refresh-all` / `-RefreshAll` to fetch their financial metrics:
```bash
# Python
python scripts/main.py "C:\path\to\file.csv" --refresh-all
# PowerShell
& "$env:USERPROFILE\.copilot\skills\portfolio-report\scripts\main.ps1" `
    -CsvPath "C:\path\to\file.csv" -RefreshAll
```

Also update the static fallback lists (`$HighRiskSymbols`, `$GrowthSymbols`, `$DividendValueSymbols`) in `scripts/main.ps1` if the risk cache update adds significant new classifications.

### 4. Check for New Cash/Money Market Symbols

If new cash or money market fund symbols appear (e.g., settlement funds, sweep accounts), add them to:
- `$CategoryMap` in `scripts/main.ps1` with `Category = 'Cash / Money Market'`
- `CASH_SYMS` array in `assets/template.html`(used by the Account Type pivot to separate cash into its own top-level group)

### 5. Check for New Duplicate/Wrapper Accounts

If new wrapper accounts appear (similar to the MICROSOFT 401K PLAN / BROKERAGELINK pattern), add filtering logic in `scripts/main.ps1` to exclude them. Look for accounts where the total value exactly matches another account's total.

### 6. Update Documentation

After making any changes to `scripts/main.ps1` or `assets/template.html`, update:
- **SKILL.md** — Update the Category Classification table, Account Type patterns table, and Account Type Grouping table to reflect any new mappings
- **SKILL.md frontmatter** — Bump the version in the `metadata` section (patch for small additions, minor for new features)

### 7. Keep Both Scripts in Sync (CRITICAL)

**`scripts/main.py` and `scripts/main.ps1` must always produce identical output.** Any change to one MUST be mirrored in the other. They are two implementations of the same logic.

When modifying logic in either script, update BOTH:

| Change Type | `scripts/main.py` location | `scripts/main.ps1` location |
|---|---|---|
| New fund/category mapping | `CATEGORY_MAP` dict | `$CategoryMap` hashtable |
| New account type pattern | `get_account_type()` function | `Get-AccountType` function |
| New risk classification rule | `classify_risk()` function | `$HighRiskSymbols` / `$GrowthSymbols` / `$DividendValueSymbols` lists |
| New cash/money market symbol | `CASH_SYMS` set | `$CashSymbols` array |
| Duplicate account filter | CSV parsing loop | CSV parsing loop (line ~182) |
| New JS data fields | `build_js_data()` function | JS generation block (line ~266) |

**Verification**: After making changes to both scripts, run both against the same CSV and confirm the output HTML files are identical (or functionally equivalent — minor whitespace/ordering differences are acceptable).

```bash
# Python
python scripts/main.py Portfolio.csv --output report_py.html
# PowerShell
& scripts/main.ps1 -CsvPath Portfolio.csv -OutputPath report_ps1.html
# Compare key metrics
# Both should show same Holdings count, Categories count, Grand Total
```

### Summary of Files to Check/Update

| File | What to check |
|------|---------------|
| `scripts/main.py` | `CATEGORY_MAP` (new funds), `get_account_type()` (new account patterns), `classify_risk()` (new stocks), duplicate account filters — **must stay in sync with scripts/main.ps1** |
| `scripts/main.ps1` | `$CategoryMap` (new funds), `Get-AccountType` (new account patterns), `$HighRiskSymbols`/`$GrowthSymbols`/`$DividendValueSymbols` (new stocks), duplicate account filters — **must stay in sync with scripts/main.py** |
| `assets/template.html` | `CASH_SYMS` array (new cash symbols), `CATEGORY_COLORS` (new category colors), `ACCT_TYPE_COLORS` (new account type colors) |
| `assets/risk_cache.json` | Run `--refresh-all` / `-RefreshAll` if new stock symbols appear |
| `SKILL.md` | Update tables, examples, and frontmatter version to match current data |

### 8. Ensure New Input Fields Are Cached (CRITICAL)

**Every new user input field** added to any tab (Withdrawals, Scenarios, etc.) **MUST** be cached in localStorage so values persist across page refresh and report files.

**Checklist for new input fields:**

1. **Add to `SETTINGS_FIELDS` array** (`template.html` ~line 1369): Include `{id:'fieldId', type:'number|select|checkbox'}` for Withdrawals tab fields. This handles save/restore via `saveSettings()` / `loadSettings()`.

2. **Event listeners are auto-attached**: Line ~1621 attaches `change` + `input` listeners to ALL inputs in the Withdrawals panel. Line ~3073 does the same for Scenario fields. The `beforeunload` handler also calls `saveSettings()`.

3. **For Scenario tab fields**: Add the key to the `scKeys` array (~line 1400), add to `fields` array (~line 3042), add to `presets` array (~line 3017), and add a default value in the `def` object (~line 2990).

4. **Verify restoration**: After adding a field, test: set a value → refresh page → navigate to tab → confirm value persists. If the tab re-renders from scratch (Withdrawals, Scenarios), `loadSettings()` or `saved._scenarios` restoration handles it. If restored from DOM cache, values are preserved automatically.

5. **Edge case**: When old localStorage lacks the new field, `loadSettings` skips it (`s[f.id]!=null` check) and the HTML default value is used. Ensure the default in HTML is a reasonable fallback.
