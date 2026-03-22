# Portfolio Analysis & Insights

Generate an interactive, single-file HTML report from a Fidelity portfolio positions CSV. The report provides holdings analysis, tax-efficient withdrawal planning, what-if scenarios, and snapshot comparisons — all in one portable HTML file that runs entirely in the browser.

## Prerequisites

- **Python 3** with `yfinance` (`pip install yfinance`)
- **PowerShell 7** (Windows alternative — `pwsh.exe`, not `powershell.exe`)
- **Node.js** (for running tests only)

## Quick Start

### 1. Download your CSV from Fidelity

Go to **Fidelity.com → Positions** and download as CSV. The file will look like:

```
Account Number,Account Name,Symbol,Description,Quantity,Last Price,...,Current Value,...
X41385276,INDIVIDUAL,MSFT,MICROSOFT CORP,525.30,$398.55,...,"$209,359.70",...
```

### 2. Generate the report

**Python (cross-platform — recommended):**

```bash
python scripts/main.py "/path/to/Portfolio_Positions.csv" --refresh-all
```

**PowerShell (Windows):**

```powershell
& "C:\Program Files\PowerShell\7\pwsh.exe" -NoProfile -File scripts\main.ps1 `
    -CsvPath "C:\path\to\Portfolio_Positions.csv" `
    -RefreshAll
```

### 3. Open the report

Open the generated HTML file in any browser. No server needed.

## Command Reference

### Python

```bash
python scripts/main.py <CsvPath> [options]
```

| Option | Description |
|--------|-------------|
| `<CsvPath>` | Path to Fidelity positions CSV (required) |
| `--output <path>` | Output HTML path (default: alongside CSV with `_Report.html` suffix) |
| `--refresh-risk` | Refresh risk classification data from Yahoo Finance |
| `--refresh-suggestions` | Refresh fund suggestion metrics from Yahoo Finance |
| `--refresh-all` | Refresh both risk and suggestions data |

### PowerShell

```powershell
pwsh -NoProfile -File scripts\main.ps1 -CsvPath <path> [options]
```

| Parameter | Description |
|-----------|-------------|
| `-CsvPath <path>` | Path to Fidelity positions CSV (required) |
| `-OutputPath <path>` | Output HTML path (default: alongside CSV with `_Report.html` suffix) |
| `-RefreshRisk` | Refresh risk classification data from Yahoo Finance |
| `-RefreshSuggestions` | Refresh fund suggestion metrics from Yahoo Finance |
| `-RefreshAll` | Refresh both risk and suggestions data |

### Examples

```bash
# Generate with default output path and fresh data
python scripts/main.py ~/Downloads/Portfolio_Positions_Mar-12-2026.csv --refresh-all

# Generate to a specific location without refreshing cached data
python scripts/main.py ~/Downloads/Portfolio_Positions.csv --output ~/reports/my-portfolio.html

# PowerShell: generate all sample reports
Get-ChildItem samples\inputs\*.csv | ForEach-Object {
    pwsh -NoProfile -File scripts\main.ps1 -CsvPath $_.FullName `
        -OutputPath "samples\reports\$($_.BaseName).html"
}
```

## What's in the Report

The generated HTML file contains four main tabs:

| Tab | What it shows |
|-----|--------------|
| **Holdings** | Portfolio breakdown by account, account type, and investment category. Sub-tabs for Fund X-Ray, Suggestions, Rebalance, Expenses, and Tax-Loss Harvesting. |
| **Withdrawals** | Tax-efficient withdrawal planner with Roth conversions, Social Security optimization, healthcare costs, Monte Carlo simulation, historical backtesting, and spending suggestions. |
| **Scenarios** | Side-by-side comparison of up to 3 what-if retirement scenarios with different assumptions. |
| **Snapshot Diff** | Upload a previous CSV to see what changed — new positions, closed positions, and value changes. |

### Key Features

- **Single-file HTML** — no server, no dependencies, works offline
- **Settings persistence** — all inputs auto-save to browser localStorage
- **Settings export/import** — save and load settings as JSON files via the gear menu
- **Three themes** — Cool Blue, Warm Coral, Dark Mode
- **PDF export** — print-optimized layout via the gear menu
- **Context-aware help** — press `?` on any page for documentation

## Input Format

The tool accepts Fidelity CSV exports with or without an `Account Type` column. Required columns:

```
Account Number, Account Name, Symbol, Description, Quantity, Last Price,
Current Value, Total Gain/Loss Dollar, Total Gain/Loss Percent,
Cost Basis Total, Average Cost Basis, Type
```

When `Account Type` is absent, it is inferred from `Account Name` (e.g., "ROLLOVER IRA" → Tax-Deferred IRA, "ROTH" → Roth).

## Sample Reports

Pre-generated sample reports are in `samples/reports/`:

| File | Portfolio Size |
|------|---------------|
| `2-Million-Portfolio.html` | $2,000,000 |
| `3-Million-Portfolio.html` | $3,000,000 |
| `4-Million-Portfolio.html` | $4,000,000 |
| `5-Million-Portfolio.html` | $5,000,000 |

Regenerate them:

```powershell
Get-ChildItem samples\inputs\*.csv | ForEach-Object {
    pwsh -NoProfile -File scripts\main.ps1 -CsvPath $_.FullName `
        -OutputPath "samples\reports\$($_.BaseName).html"
}
```

## Running Tests

```powershell
pwsh -File scripts/run-all-tests.ps1
```

Or individually:

```bash
node scripts/test_ui.js          # 404 UI structure tests
node scripts/test_engine.js      # 123 withdrawal engine tests
node scripts/test_tax.js         # 53 tax & financial tests
node scripts/test_snapshot.js    # 43 snapshot diff tests
node scripts/test_withdrawal.js  # 54 withdrawal & retirement tests
node scripts/test_csv_export.js  # 24 CSV export tests
node scripts/test_formatting.js  # 22 formatting tests
node scripts/test_allocation.js  # 21 allocation & rebalance tests
node scripts/test_skill_accuracy.js # 12 SKILL.md accuracy tests
node scripts/test_bounds.js      # 6 bounds tests
```

**Total: 762 tests**

## Project Structure

```
portfolio-report/
├── assets/
│   ├── template.html          # The single-file HTML app (~11,000 lines)
│   ├── risk_cache.json         # Cached risk classification data
│   └── suggestions_cache.json  # Cached fund suggestion metrics
├── scripts/
│   ├── main.ps1               # PowerShell report generator (authoritative)
│   ├── main.py                # Python report generator (cross-platform)
│   ├── fetch_risk_data.py     # Yahoo Finance risk data fetcher
│   ├── fetch_suggestions.py   # Yahoo Finance suggestions fetcher
│   ├── run-all-tests.ps1      # Test runner
│   └── test_*.js              # Test suite (10 files, 762 tests)
├── samples/
│   ├── inputs/                # Sample Fidelity CSV files
│   └── reports/               # Pre-generated HTML reports
├── docs/
│   └── DESIGN.md              # Comprehensive system design document
├── SKILL.md                   # AI agent maintenance guide
└── README.md                  # This file
```

## License

Private — not for redistribution.
