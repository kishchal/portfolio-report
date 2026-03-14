---
name: portfolio-report
description: Generate an interactive HTML portfolio analysis report from a Fidelity CSV export with a consolidated Holdings tab (By Account / By Account Type / By Investment Category / Fund X-Ray / Suggestions / Rebalance / Expenses / Tax-Loss eight sub-pivots), Withdrawals, Scenarios, and Snapshot Diff tabs. Features data-driven risk classification via yfinance, 3-level drill-down, auto-generated risk insights, investment suggestions with model portfolios, a retirement withdrawal planner with tax-efficient sequencing and pre-retirement contribution modeling, Social Security income modeling with break-even analysis, BETR Roth conversion analysis, Monte Carlo simulation, Fund X-Ray overlap/concentration analysis with live Yahoo Finance holdings data, rebalancing trade list generator, fund expense drag analysis, tax-loss harvesting analysis, a what-if scenario comparator, and point-in-time portfolio snapshot comparison. Includes settings import/export for portable configuration, Export Data (CSV), three themes (Cool Blue, Warm Coral, Dark Mode), and PDF export on all tabs.
allowed-tools: powershell python
compatibility: Requires Python 3 with yfinance package. Works on Windows, macOS, and Linux.
metadata:
  author: portfolio-report
  version: "7.0.0"
---

# Portfolio Report Skill

Generates a professional, interactive HTML portfolio analysis report ("Portfolio Analysis & Insights") from a Fidelity portfolio positions CSV export.

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
| *403(b)*, 403B*                   | Tax-Deferred 403(b)   |
| *457(b)*, 457B*                   | Tax-Deferred 457(b)   |
| *TSP*, Thrift Savings*            | Tax-Deferred TSP      |
| *401K*                            | Tax-Deferred 401(k)   |
| BrokerageLink*                    | Tax-Deferred 401(k)   |
| *DCP, Deferred Comp*              | Tax-Deferred DCP      |
| Rollover IRA, Traditional IRA, SEP IRA, SIMPLE IRA | Tax-Deferred IRA |
| *IRA* (catch-all)                 | Tax-Deferred IRA      |
| INDIVIDUAL, Joint*, WROS*, Trust* | Taxable Investment    |

### Duplicate Account Filtering

Wrapper accounts whose Description is `BROKERAGELINK` and whose Account Name ends with a workplace plan pattern (e.g. `401K PLAN`, `403B PLAN`, `457B PLAN`, `TSP PLAN`) are automatically excluded to avoid double-counting. The wrapper account is a container for the BrokerageLink sub-account that lists the actual holdings.

### Tax-Lot Aggregation

Multiple rows for the same ticker in the same account (different tax lots with different cost bases) are automatically merged by both `main.py` and `main.ps1`. Values, gain/loss, and cost basis are summed; gain/loss percentage is recalculated from the aggregated totals. This prevents duplicate ticker entries in the drill-down views.

### Output

An interactive HTML report titled **"Portfolio Analysis & Insights"** featuring:
1. **Header** with total portfolio value, source CSV filename in the footer, and a settings gear menu (top-right) for Save Settings (export all inputs to JSON), Load Settings (import JSON to restore all inputs), Export Data (CSV) for downloading the portfolio as a Fidelity-style CSV, and a theme switcher (Cool Blue / Warm Coral / Dark Mode)
2. **Horizontal allocation bar** with hover tooltips — updates dynamically per active pivot
3. **Tab navigation** with underline-style main tabs and segmented-control sub-tabs:
   - **Holdings** (default) — consolidated tab with eight sub-pivot views:
     - **By Account** (default sub-pivot) — Each individual account (by account number/name) as a top-level card, with investment categories as children and tickers within each category.
     - **By Account Type** — Tax-Deferred Savings, Taxable Investment, Roth, Cash / Money Market, HSA, 529 College Savings, Custodial (UTMA). Cash/money market holdings (SPAXX**, FDRXX**, CORE**) are separated into their own top-level group to avoid double-counting within accounts.
     - **By Investment Category** — US Index Funds, Individual Stocks, International Funds, Bond Funds, etc.
     - **Fund X-Ray 🔬** — deep analysis of fund overlap and hidden stock concentration:
       - **Hidden Stock Concentration** — table of top stock exposures across all funds, showing effective dollar value, portfolio percentage, bar-chart visualization, fund sources (with Yahoo Finance links), and risk level (High/Moderate/Low). Expandable to show all stocks beyond top 25.
       - **Fund Overlap Heatmap** — pairwise overlap matrix between all portfolio funds using min-weight method. Color-coded: green (<30%), amber (30–60%), red (>60%). Each cell is clickable — opens a detail modal showing common holdings with per-stock weights in each fund, overlap contribution bars, and unique holdings for each fund.
       - **Redundancy & Concentration Alerts** — auto-generated warnings for high single-stock concentration (>5%), high fund overlap (>50%), and portfolio health indicators.
       - **Live Data** — fund top-10 holdings fetched from Yahoo Finance at report generation (via `fc.yahoo.com` consent cookie + `quoteSummary` API). Falls back to a static embedded database (~60 popular ETFs/mutual funds) when API is unavailable. A status indicator shows whether live or static data is displayed.
     - **Rebalance ⚖️** — generates a tax-aware trade list to reach a target allocation:
       - **Target Model Selection** — dropdown to select High Growth, Balanced, Conservative, or Custom allocation percentages (must sum to 100%)
       - **Current vs Target Bars** — side-by-side allocation bars with per-category drift indicators showing dollar amounts
       - **Trade List** — table of SELL/BUY trades with symbol, account, amount, category, reason, and tax notes. Sells prioritize tax-advantaged accounts first, then losses, then smallest positions. Buys use model-recommended funds with tax-efficient account placement.
       - **Summary Card** — portfolio drift %, trades needed, estimated tax impact
       - **Copy Trade List** — clipboard export for easy pasting into brokerage order screens
     - **Expenses 💰** — fund expense drag analysis:
       - **Summary Cards** — weighted average expense ratio, annual dollar cost, 10-year compound drag estimate, potential annual savings from cheaper alternatives
       - **Expense Contribution Bar Chart** — horizontal bars showing which funds cost the most annually
       - **Full Holdings Table** — every fund ranked by expense drag with ER, annual cost, cheaper alternative (if available), alternative ER, and annual savings. High-ER funds highlighted in red.
       - **Cheaper Alternatives Database** — maps expensive funds to low-cost index equivalents (e.g., active funds → FXAIX/VTI, sector funds → VGT)
     - **Suggestions 💡** — Investment research and portfolio construction guidance featuring:
        - **Current vs Model Allocation** — visual bar chart comparing your portfolio's asset class breakdown (US Equity, International, Bonds, Cash, Real Estate, Alternatives, Other) against three model portfolios. All holdings always sum to 100% — unmapped categories (CDs, Unspecified) are captured in the "Other" bucket.
        - **Fund-by-Fund Analysis** — table of 19 recommended ETFs/index funds/bond funds with performance metrics (1Y/3Y returns, volatility, max drawdown), expense ratios, and suitability scores (Growth, Risk, Diversification, Cost on 1–10 scale)
        - **Three Model Portfolios** — High Risk/High Growth, Medium Risk/Balanced, Low Risk/Capital Preservation with specific ticker allocations, weighted expense ratios, and volatility expectations
        - **Account-Specific Guidance** — tax-efficient placement recommendations for 401(k), Traditional IRA, and Roth IRA with target allocation ranges and rationale
        - **Disclaimers** — educational research notice, not personalized financial advice
     - **Tax-Loss 🏷️** — Analyzes unrealized losses in taxable accounts: summary metric cards (harvestable losses, unrealized gains, net gain/loss, est. tax savings), harvestable positions table with replacement fund suggestions, wash sale warnings, cross-account duplicate flags. PDF export button.
   - **Withdrawals** — Interactive retirement withdrawal planner featuring:
     - **Input Panel** — shared fields (expected return %, inflation %, filing status, Roth conversion strategy) plus per-participant sections for You and Spouse (toggle): current age, retirement age, life expectancy, monthly SS income, SS starting age (62–70)
     - **Pre-Retirement Contributions** — collapsible section for annual savings until retirement: 401k/403b, employer match, IRA/Roth IRA, taxable brokerage, HSA. Contributions are inflation-adjusted each year and applied per tax bucket during the growth-to-retirement phase. Persisted in settings.
     - **Summary Cards** — projected portfolio at retirement, year-1 total income (portfolio + combined SS), effective tax rate, combined Social Security card (per-participant breakdown), portfolio longevity
     - **Social Security Break-Even Chart** — SVG line chart comparing cumulative lifetime SS income at claiming ages 62/67/70. Shows crossover points where delayed claiming overtakes earlier claiming. Includes your chosen age marker, summary cards with monthly amounts and lifetime totals, and advantage/disadvantage comparison. Spouse break-even shown separately if enabled.
     - **Social Security Age Recommendation** — per-participant comparison tables showing benefits at ages 62/67/70 with monthly/annual amounts, % of FRA, years collecting, inflation-adjusted lifetime totals, and optimal claiming age recommendation based on each person's life expectancy
     - **Account Balance Projection Chart** — stacked bar chart showing Taxable/Tax-Deferred/Roth/HSA depletion over time (default chart, shown first among metric charts)
     - **Monte Carlo Analysis** — 500 randomized simulations with log-normal return distributions:
       - Summary cards: success rate (with visual ring), median ending balance, 10th/90th percentile outcomes
       - Percentile fan chart (SVG): 10th–90th and 25th–75th percentile bands with median line and deterministic overlay
       - Ending balance distribution histogram
       - Interpretation notes with actionable guidance based on success rate
       - Tax estimation in MC: simplified income tax + LTCG + HSA penalty per simulated year
     - **Year-by-Year Withdrawal Table** — detailed schedule with editable withdrawal cells (Taxable, Tax-Deferred, Roth, HSA) per bucket, SS income column, estimated tax (including SS taxation), after-tax income (nominal and present value), W/D % (annual withdrawal rate as percentage of beginning portfolio balance, color-coded: green ≤4%, amber 4-5%, red >5%), running balances (nominal and present value); RMD years highlighted. Override any withdrawal amount to recalculate the entire table forward — overridden cells highlighted in orange. All column headers have detailed formula tooltips showing exactly how each value is calculated.
     - **Spending Suggestions** — "See Spending Suggestions" button opens a modal with three scenarios: Die with Zero, Leave $2.50M Legacy, Leave $4.50M Legacy. All three use deterministic binary-search solvers (`_scenarioSim()` at the expected return rate) for consistent results every time. Monte Carlo success rate shown as informational risk indicator. Metrics include ending balance (nominal + PV), lifetime after-tax income, lifetime taxes, Roth conversions, BETR. "Compare in What-If Scenarios" button passes results to the Scenarios tab with full cache fingerprint validation (return%, inflation, SS, Roth strategy, ages, state tax).
     - **Tab State Persistence** — Withdrawal results (summary cards, charts, year-by-year table) are cached after computation and restored when navigating back from other tabs, avoiding re-calculation.
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
       - **Spending Phases**: User-defined spending by age (e.g., go-go/slow-go/no-go) with per-phase monthly amounts in today's dollars; auto-populated default = 4% of projected portfolio deflated to today's dollars; phases inflate from today; 4% guardrails disabled when phases active
       - Excess RMD surplus reinvested into taxable brokerage account
       - Dual-participant SS with independent benefit age scaling (62–70) and spouse age column in withdrawal table
       - Household planning horizon extending to the longer-surviving spouse (with info banner when extended)
       - Monte Carlo engine (1000 sims, log-normal returns, Box-Muller transform) with tiered LTCG, age-aware deductions, IRMAA
       - **Deterministic Spending Solvers**: Binary search on `_scenarioSim()` for spending amounts: DWZ targets ending balance = $0, legacy targets ending balance ≥ target FV. Both include SS income in upper bound. Zero-portfolio guard returns 0 when portfolio empty. Converges to $10/mo in 35 iterations with adaptive rounding.
       - **Suggestion-to-Scenario Cache**: Full parameter fingerprint (return%, inflation, SS, Roth strategy, retire/life ages, state tax) ensures cached spending suggestions are invalidated when any assumption changes. Target metadata (`_target`/`_targetMonthly`) persisted in localStorage with spending-match validation.
       - **BETR (Break-Even Tax Rate)**: Vanguard-research-inspired Roth conversion analysis — State Tax % input, IRA Basis ($) input with pro-rata rule, cumConvTax includes federal + state tax (consistent across all engines), BETR column in optimizer table, Conv % column in year-by-year table, BETR insight card comparing BETR vs estimated retirement rate
       - **Account Selector**: Multi-select dropdown to choose which accounts to include; persisted in localStorage
       - **Interactive Metric Charts**: SVG bar charts with tab switching and PV/FV toggle (present value vs projected)
       - **PDF Export**: Print-optimized layout with parameter summary and chart labels
       - **Settings persistence**: All inputs saved to browser localStorage via `input`/`change` events and `beforeunload` handler. Auto-restore on reload.
   - **Scenarios** — What-if scenario comparator: 3-scenario grid with per-scenario retirement age, life expectancy, SS claiming age, monthly SS income, annual return, inflation, Roth conversion strategy (None/Conservative/Moderate/Aggressive/Custom with bracket %, start/end age), state tax %, and multi-phase spending plans (age-based monthly spend phases with add/remove). Side-by-side comparison table (MC success, BETR, lifetime taxes/income, ending balance with PV). Per-scenario metric charts (Account Balances default) with global chart controls (Apply to All / Individual toggle for FV/PV and chart type). Tab state persistence (comparison results, charts cached across tab switches). PDF export, localStorage persistence.
   - **Snapshot Diff** — Upload a previous Fidelity CSV to compare against the current report. Shows Previous/Current summary panels with source filenames, change banner (total change, % change, time span), allocation drift bar chart with percentage labels (≥5% segments labeled), and two hierarchical drilldown sections:
     - **By Category** — groups changed positions by investment category → account → symbol
     - **By Account** — groups changed positions by account → symbol
     Each section has its own divider card header with a distinct background color. PDF export and Clear Comparison buttons in toolbar.
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
8. **Settings Import/Export** — gear menu (top-right) with Save Settings (exports all user inputs from all tabs as a timestamped JSON file, e.g., `portfolio-settings-2026-03-13-01-30-00.json`), Load Settings (imports JSON file to restore all inputs and update localStorage), Export Data (CSV) for downloading portfolio as a Fidelity-style CSV with timestamp, and a theme switcher (Cool Blue / Warm Coral / Dark Mode) with persistence across sessions. Enables sharing configurations across report files.
9. **PDF Export** — available on all Holdings sub-tabs, Withdrawals, Scenarios, and Snapshot Diff tabs. Print-optimized CSS hides interactive controls.
10. **Footer** — shows generation date and source CSV filename

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

### Helper Scripts

| Script | Purpose |
|--------|---------|
| `scripts/main.ps1` | PowerShell report generator — reads CSV, processes holdings, injects into template |
| `scripts/main.py` | Python report generator — same purpose, cross-platform alternative |
| `scripts/fetch_risk_data.py` | Fetches Yahoo Finance metrics (beta, P/E, market cap, margins, revenue growth) and writes `assets/risk_cache.json` for stock risk classification |
| `scripts/fetch_suggestions.py` | Fetches fund metrics (returns, volatility, max drawdown) from Yahoo Finance and writes `assets/suggestions_cache.json` for the Suggestions tab |
| `scripts/run-all-tests.ps1` | Unified test runner — discovers and runs all `test_*.js` files, reports per-file pass/fail with summary |
| `scripts/test-helpers.js` | Shared test harness — mock DOM/browser environment, marker-based function extraction from template.html |

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

Valid account types: `Taxable Investment`, `Tax-Deferred 401(k)`, `Tax-Deferred 403(b)`, `Tax-Deferred 457(b)`, `Tax-Deferred TSP`, `Tax-Deferred IRA`, `Tax-Deferred DCP`, `Roth`, `HSA`, `529 College Savings`, `Custodial (UTMA)`.

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

If new wrapper accounts appear (similar to the employer 401K PLAN / BROKERAGELINK pattern), add filtering logic in `scripts/main.ps1` to exclude them. Look for accounts where the total value exactly matches another account's total.

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

### 9. Run Tests After Every Change (CRITICAL)

**After ANY change to `assets/template.html` or `scripts/main.ps1`**, the agent MUST run the full test suite to ensure nothing is broken.

```powershell
# Run the complete test suite (287 tests across 8 domain test files + 1 accuracy test)
pwsh -File "$env:USERPROFILE\.copilot\skills\portfolio-report\portfolio-report\scripts\run-all-tests.ps1"
```

The test suite validates:

| Test File | Tests | What It Validates |
|-----------|-------|-------------------|
| `test_formatting.js` | 22 | `fmt`, `fmt2`, `esc`, `pct`, `ylink` formatting utilities |
| `test_tax.js` | 53 | Federal tax brackets, LTCG rates, standard deduction, IRMAA, SS taxation, RMD table, SS age factors, percentile calculation |
| `test_allocation.js` | 21 | Portfolio allocation buckets, rebalance drift, expense ratio formulas, TLH calculations, deep-loss hold rule |
| `test_withdrawal.js` | 35 | Spending phases, 4% rule guardrails, RMD calculations, Monte Carlo engine (structure, success rate, percentile ordering), Roth conversion room, HSA rules, withdrawal sequencing |
| `test_snapshot.js` | 43 | CSV parsing, currency parsing, symbol classification, account type inference, snapshot diff engine |
| `test_csv_export.js` | 24 | CSV round-trip validation (6 checks × 4 sample files) |
| `test_bounds.js` | 6 | Withdrawal solver upper-bound validation |
| `test_ui.js` | 83 | DOM structure, tabs, sub-tabs, icons, placeholders, theme system, settings, print/export, CSS classes, backward compatibility |
| `test_skill_accuracy.js` | 12 | Validates SKILL.md claims against template.html: tab structure, sub-tabs, settings menu, PDF scope, scripts, test counts |

**If any test fails, DO NOT commit.** The agent MUST:
1. Read the failure output to identify which test(s) failed and why
2. Fix the code in `template.html` or `scripts/main.ps1` that caused the regression
3. Re-run the full test suite to confirm all tests pass
4. Repeat until the suite is fully green — only then proceed to commit

If the failure is in a test itself (e.g., a new feature changed expected behavior), update the test to match the new correct behavior — but verify the new behavior is intentional, not a bug.

**When adding new features:**
- Add corresponding tests to the appropriate `test_*.js` file in `scripts/`
- For new formulas: add to `test_tax.js`, `test_allocation.js`, or `test_withdrawal.js`
- For new UI elements: add to `test_ui.js`
- For new data transformations: add to `test_snapshot.js` or `test_csv_export.js`
- Use the shared test harness `test-helpers.js` to extract functions from the template

### 10. "Review and Commit" Workflow (MANDATORY)

When the user says **"review and commit"** (or any variation like "commit", "review", "push changes"), the agent MUST follow this exact sequence:

#### Step 1: Run Tests
```powershell
pwsh -File "$env:USERPROFILE\.copilot\skills\portfolio-report\portfolio-report\scripts\run-all-tests.ps1"
```
- If any test fails → fix the code → re-run until all 287+ tests pass
- Do NOT proceed to Step 2 until the suite is fully green

#### Step 2: Run the 6-Round Multi-Model Review Gauntlet
Invoke the `review-code` skill. This runs 6 review rounds with rotating models (Claude, GPT, Gemini) with escalating focus:
1. Broad sweep (correctness, security, logic)
2. Architecture & patterns
3. Edge cases & robustness
4. Detailed line-by-line correctness
5. Testing & coverage
6. Polish & hardening

- Fix every issue found in each round
- After fixing, re-run the test suite to ensure fixes didn't break anything
- Proceed to next round only when tests are green

#### Step 3: Commit
Use the `write-commit` skill to generate an exhaustive commit message, then commit.

**Summary: tests → review → tests → commit. Tests gate every transition.**

**IMPORTANT: Keep SKILL.md in sync.** When adding/removing/renaming tabs, sub-tabs, settings menu items, scripts, or changing test counts, update SKILL.md accordingly. The `test_skill_accuracy.js` module validates SKILL.md claims against the actual template — if SKILL.md drifts, the test suite will fail and block the commit.
