<#
.SYNOPSIS
    Generates an interactive HTML portfolio allocation report from a Fidelity CSV export.
.DESCRIPTION
    Reads a Fidelity portfolio positions CSV, categorizes holdings, and produces
    a professional HTML report with 3-level drill-down (Category → Account → Ticker),
    allocation bar, dual pivot views, and data-driven risk classification.
    Supports CSVs with or without an "Account Type" column — when missing, account
    type is auto-inferred from the Account Name.
.PARAMETER CsvPath
    Full path to the Fidelity portfolio positions CSV file.
.PARAMETER OutputPath
    Full path for the output HTML report. Defaults to CSV directory with _Report suffix.
.PARAMETER RefreshRisk
    When set, fetches fresh financial data (P/E, beta, market cap, growth) from Yahoo
    Finance via yfinance and updates the local risk classification cache.
.PARAMETER RefreshSuggestions
    When set, fetches fresh fund metrics from Yahoo Finance for the Suggestions tab.
.PARAMETER RefreshAll
    When set, refreshes all cached data (equivalent to -RefreshRisk -RefreshSuggestions).
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath,

    [switch]$RefreshRisk,

    [switch]$RefreshSuggestions,

    [switch]$RefreshAll
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- RefreshAll implies both ---
if ($RefreshAll) {
    $RefreshRisk = $true
    $RefreshSuggestions = $true
}

# --- Validate input ---
if (-not (Test-Path $CsvPath)) {
    Write-Error "CSV file not found: $CsvPath"
    exit 1
}

# --- Derive output path ---
if (-not $OutputPath) {
    $dir = Split-Path $CsvPath -Parent
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($CsvPath) -replace '_Positions', '_Report'
    if ($baseName -notmatch 'Report') { $baseName += '_Report' }
    $OutputPath = Join-Path $dir "$baseName.html"
}

# --- Risk cache: fetch or load ---
$riskCachePath = Join-Path $PSScriptRoot "risk_cache.json"
$fetchScript   = Join-Path $PSScriptRoot "fetch_risk_data.py"
$riskCache     = @{}

if ($RefreshRisk -or -not (Test-Path $riskCachePath)) {
    if (Test-Path $fetchScript) {
        Write-Host "Fetching risk data from Yahoo Finance (this may take a few minutes)..."
        python $fetchScript $CsvPath --cache $riskCachePath
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Risk data fetch failed; falling back to static classification."
        }
    } else {
        Write-Warning "fetch_risk_data.py not found; using static risk classification."
    }
}

if (Test-Path $riskCachePath) {
    $cacheJson = Get-Content $riskCachePath -Raw | ConvertFrom-Json
    if ($cacheJson.symbols) {
        foreach ($prop in $cacheJson.symbols.PSObject.Properties) {
            $riskCache[$prop.Name] = $prop.Value.risk
        }
    }
    Write-Host "Loaded risk cache: $($riskCache.Count) symbols (fetched: $($cacheJson._meta.fetched))"
}

# --- Suggestions cache: fetch or load ---
$suggCachePath  = Join-Path $PSScriptRoot "suggestions_cache.json"
$suggFetchScript = Join-Path $PSScriptRoot "fetch_suggestions.py"
$suggJson = "null"

if ($RefreshSuggestions -or -not (Test-Path $suggCachePath)) {
    if (Test-Path $suggFetchScript) {
        Write-Host "Fetching suggestions data from Yahoo Finance..."
        python $suggFetchScript --cache $suggCachePath
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Suggestions data fetch failed; suggestions tab will show static data only."
        }
    }
} elseif (Test-Path $suggCachePath) {
    $cacheAgeDays = ((Get-Date) - (Get-Item $suggCachePath).LastWriteTime).TotalDays
    if ($cacheAgeDays -gt 7) {
        Write-Host "Suggestions cache is $([math]::Round($cacheAgeDays)) days old (>7 days) - auto-refreshing..."
        if (Test-Path $suggFetchScript) {
            python $suggFetchScript --cache $suggCachePath
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "Suggestions data fetch failed; using stale cache."
            }
        }
    }
}

if (Test-Path $suggCachePath) {
    $suggJson = Get-Content $suggCachePath -Raw
    $suggMeta = $suggJson | ConvertFrom-Json
    Write-Host "Loaded suggestions cache: $($suggMeta._meta.fund_count) funds (fetched: $($suggMeta._meta.fetched))"
}

# --- Account-type inference from Account Name ---
function Get-AccountType([string]$name) {
    $n = $name.Trim()
    if ($n -match '(?i)roth')                                   { return 'Roth' }
    if ($n -match '(?i)health\s*savings|^HSA')                  { return 'HSA' }
    if ($n -match '(?i)college\s*savings|529')                  { return '529 College Savings' }
    if ($n -match '(?i)UTMA|Uniform\s*Transfers?\s*to\s*Minor') { return 'Custodial (UTMA)' }
    if ($n -match '(?i)401[Kk]|brokeragelink')                  { return 'Tax-Deferred 401(k)' }
    if ($n -match '(?i)DCP|deferred\s*comp')                    { return 'Tax-Deferred DCP' }
    if ($n -match '(?i)rollover\s*ira|traditional\s*ira')       { return 'Tax-Deferred IRA' }
    if ($n -match '(?i)self.employed\s*401')                    { return 'Tax-Deferred 401(k)' }
    if ($n -match '(?i)individual|joint|wros|^inv')             { return 'Taxable Investment' }
    return 'Other'
}

# --- Category mapping ---
$CategoryMap = @{
    'FXAIX'      = @{ Category = 'US Index Funds';          Detail = 'Fidelity 500 Index (S&P 500)' }
    'FSKAX'      = @{ Category = 'US Index Funds';          Detail = 'Fidelity Total Market Index' }
    'SCHD'       = @{ Category = 'US Index Funds';          Detail = 'Schwab US Dividend Equity ETF' }
    'FTIHX'      = @{ Category = 'International Funds';     Detail = 'Fidelity Total International Index' }
    'FZILX'      = @{ Category = 'International Funds';     Detail = 'Fidelity ZERO International Index' }
    'VFWSX'      = @{ Category = 'International Funds';     Detail = 'Vanguard FTSE All-World ex-US' }
    'FXNAX'      = @{ Category = 'Bond Funds';              Detail = 'Fidelity US Bond Index' }
    'FSPTX'      = @{ Category = 'Tech Sector Fund';        Detail = 'Fidelity Select Technology' }
    'TQQQ'       = @{ Category = 'Growth / Leveraged ETFs'; Detail = 'ProShares UltraPro QQQ (3x Nasdaq)' }
    'VOOG'       = @{ Category = 'Growth / Leveraged ETFs'; Detail = 'Vanguard S&P 500 Growth ETF' }
    'PBW'        = @{ Category = 'Growth / Leveraged ETFs'; Detail = 'Invesco WilderHill Clean Energy ETF' }
    'SPAXX**'    = @{ Category = 'Cash / Money Market';     Detail = 'Fidelity Government Money Market' }
    'FDRXX**'    = @{ Category = 'Cash / Money Market';     Detail = 'Fidelity Government Money Market' }
    'CORE**'     = @{ Category = 'Cash / Money Market';     Detail = 'FDIC-Insured Deposit Sweep' }
    'FZDXX'      = @{ Category = 'Cash / Money Market';     Detail = 'Fidelity Money Market Premium Class' }
    'NHFSMKX98'  = @{ Category = 'US Index Funds';          Detail = 'NH Fidelity 500 Index (529)' }
    '59515R401'  = @{ Category = 'US Index Funds';          Detail = 'Vanguard 500 Index Trust (401k)' }
    '31617E471'  = @{ Category = 'US Index Funds';          Detail = 'Fidelity Growth Company Pool Cl S (401k)' }
    'INTL GROWTH ACCOUNT' = @{ Category = 'International Funds'; Detail = 'International Growth Account (401k)' }
    'SMID CAP GROWTH ACCT' = @{ Category = 'US Index Funds';    Detail = 'SMID Cap Growth Account (401k)' }
    'Various'    = @{ Category = 'Unspecified';              Detail = 'Various / Unspecified' }
}

# Known stock symbols (any symbol not in CategoryMap and not matching these heuristics falls to "Other")
$StockSymbols = @('AAPL','AMD','AMZN','CWBHF','GOOG','GOOGL','LCID','META','MSFT','NFLX','NIO','NVDA','PLTR','TSLA','PSNY')

# --- Risk classification for individual stocks ---
$HighRiskSymbols = @('PLTR','HOOD','RBLX','CVNA','NET','SNOW','MDB','TEAM','DDOG','DOCU',
    'DASH','ABNB','TTD','APP','VRT','VST','CEG','GEV','LCID','NIO','PSNY','CWBHF','PBW',
    'RIVN','MARA','COIN','ARKK','SMCI')

$GrowthSymbols = @('NVDA','GOOGL','GOOG','AVGO','AMD','AMAT','MU','KLAC','MPWR','NOW',
    'CDNS','SNPS','LRCX','DELL','ON','ISRG','CRWD','META','AMZN','NFLX','ADBE','CRM',
    'INTU','ORCL','FTNT','PANW','FICO','SHOP','UBER','MA','V','BX','SNOW')

$DividendValueSymbols = @('XOM','CVX','T','VZ','MO','PM','O','KO','PEP','ED','DUK','SO',
    'AEP','EVRG','NEE','ATO','DTE','SRE','EXC','WMB','HAL','SLB','OVV','FANG','COP','PSX',
    'MPC','KR','WY','DOW','LYB','IFF','BMY','PFE','KVUE','CLX','CHD','KDP','MRK','GILD',
    'ABBV','AMGN','MMM','F','HPE','CMCSA','WFC','USB','KEY','TFC','PNC','C','BAC','PRU',
    'TROW','WBD','INTC')

function Get-RiskTag([string]$sym) {
    # Prefer cached data-driven classification from yfinance
    if ($riskCache.ContainsKey($sym)) { return $riskCache[$sym] }
    # Fallback to static lists
    if ($sym -in $HighRiskSymbols) { return 'High Risk / Speculative' }
    if ($sym -in $GrowthSymbols)   { return 'Growth' }
    if ($sym -in $DividendValueSymbols) { return 'Dividend / Value' }
    return 'Blue Chip / Core'
}

# --- Detect CSV format (with or without Account Type column) ---
$csvData = Import-Csv -Path $CsvPath
$hasAccountType = $csvData[0].PSObject.Properties.Name -contains 'Account Type'

$holdings = @()

foreach ($row in $csvData) {
    $sym = ($row.Symbol ?? '').Trim()
    $acctNum = ($row.'Account Number' ?? '').Trim()
    $acctName = ($row.'Account Name' ?? '').Trim()
    $desc = ($row.Description ?? '').Trim()
    $valStr = ($row.'Current Value' ?? '').Trim()

    if (-not $acctNum -or -not $valStr) { continue }
    # Allow rows without a symbol if they have a Description (e.g. BROKERAGELINK placeholder)
    if (-not $sym -and -not $desc) { continue }
    # Skip non-holding rows (e.g. "Pending Activity")
    if ($desc -match '(?i)pending\s*activity' -or $sym -match '(?i)pending\s*activity') { continue }

    # Skip duplicate wrapper accounts (e.g. MICROSOFT 401K PLAN whose holdings
    # are already listed under the BrokerageLink sub-account)
    if ($acctName -match '(?i)401K\s*PLAN$' -and $desc -match '(?i)BROKERAGELINK') { continue }

    # Determine account type: use CSV column if present, otherwise infer
    if ($hasAccountType) {
        $acctType = ($row.'Account Type' ?? '').Trim()
        if (-not $acctType) { $acctType = Get-AccountType $acctName }
    } else {
        $acctType = Get-AccountType $acctName
    }

    # Parse currency value
    $val = [double]($valStr -replace '[$ ,()]', '')
    if ($valStr -match '^\(') { $val = -$val }

    # Use description as symbol placeholder for rows like BROKERAGELINK
    if (-not $sym) { $sym = $desc }

    # Determine category
    if ($CategoryMap.ContainsKey($sym)) {
        $cat = $CategoryMap[$sym].Category
        $detail = $CategoryMap[$sym].Detail
    }
    elseif ($sym -match '^BROKERAGELINK') {
        $cat = 'Cash / Money Market'
        $detail = 'BrokerageLink Cash'
    }
    elseif ($sym -in $StockSymbols -or ($sym -match '^[A-Z]{1,5}$' -and $sym -notmatch '\*')) {
        $cat = 'Individual Stocks'
        $detail = $desc
    }
    else {
        $cat = 'Other'
        $detail = $desc
    }

    # Risk classification (meaningful for Individual Stocks)
    $risk = if ($cat -eq 'Individual Stocks') { Get-RiskTag $sym }
            elseif ($cat -match 'Cash|Money') { '' }
            else { '' }

    $holdings += [PSCustomObject]@{
        AccountNumber = $acctNum
        AccountType   = $acctType
        AccountName   = $acctName
        Symbol        = $sym
        FundName      = $detail
        Value         = $val
        Category      = $cat
        Risk          = $risk
    }
}

if ($holdings.Count -eq 0) {
    Write-Error "No valid holdings found in CSV."
    exit 1
}

$grandTotal = ($holdings | Measure-Object -Property Value -Sum).Sum

# --- Build hierarchical data: Category → Account → Tickers ---
$categories = $holdings | Group-Object -Property Category | ForEach-Object {
    $catName = $_.Name
    $catTotal = ($_.Group | Measure-Object -Property Value -Sum).Sum
    $accounts = $_.Group | Group-Object -Property AccountNumber | ForEach-Object {
        $acctTotal = ($_.Group | Measure-Object -Property Value -Sum).Sum
        $first = $_.Group[0]
        $tickers = $_.Group | Sort-Object -Property Value -Descending | ForEach-Object {
            @{ sym = $_.Symbol; name = $_.FundName; val = $_.Value; risk = $_.Risk }
        }
        @{
            num   = $first.AccountNumber
            type  = $first.AccountType
            name  = $first.AccountName
            val   = $acctTotal
            tickers = @($tickers)
        }
    } | Sort-Object { -$_.val }
    @{
        cat      = $catName
        total    = $catTotal
        accounts = @($accounts)
    }
} | Sort-Object { -$_.total }

# --- Generate JSON data for HTML ---
function ConvertTo-JsValue($val) {
    if ($val -is [string]) {
        $escaped = $val.Replace("\", "\\").Replace("'", "\u0027")
        return "'$escaped'"
    }
    return [math]::Round($val, 2)
}

$jsData = "["
foreach ($c in $categories) {
    $jsData += "`n  {cat:$(ConvertTo-JsValue $c.cat),total:$([math]::Round($c.total,2)),accounts:["
    foreach ($a in $c.accounts) {
        $jsData += "`n    {num:$(ConvertTo-JsValue $a.num),type:$(ConvertTo-JsValue $a.type),name:$(ConvertTo-JsValue $a.name),val:$([math]::Round($a.val,2)),tickers:["
        foreach ($t in $a.tickers) {
            $jsData += "`n      {sym:$(ConvertTo-JsValue $t.sym),name:$(ConvertTo-JsValue $t.name),val:$([math]::Round($t.val,2)),risk:$(ConvertTo-JsValue $t.risk)},"
        }
        $jsData += "]},"
    }
    $jsData += "]},"
}
$jsData += "]"

# --- Derive report date from filename or current date ---
$dateMatch = [regex]::Match((Split-Path $CsvPath -Leaf), '(\w{3}-\d{1,2}-\d{4})')
if ($dateMatch.Success) {
    $reportDate = $dateMatch.Value -replace '-', ' '
}
else {
    $reportDate = (Get-Date).ToString("MMM dd, yyyy")
}

$totalFormatted = '$' + [string]::Format("{0:N2}", $grandTotal)
$totalShort = if ($grandTotal -ge 1e9) { '$' + [math]::Round($grandTotal / 1e9, 2).ToString() + 'B' }
              elseif ($grandTotal -ge 1e6) { '$' + [math]::Round($grandTotal / 1e6, 2).ToString() + 'M' }
              else { $totalFormatted }

# --- Read HTML template (always relative to script location) ---
$templatePath = Join-Path $PSScriptRoot "template.html"
if (-not (Test-Path $templatePath)) {
    Write-Error "HTML template not found at: $templatePath"
    exit 1
}

$html = Get-Content -Path $templatePath -Raw
$html = $html -replace '\{\{REPORT_DATE\}\}', $reportDate
$html = $html -replace '\{\{GENERATED_AT\}\}', (Get-Date).ToString("MMM dd, yyyy 'at' hh:mm tt")
$html = $html -replace '\{\{GRAND_TOTAL\}\}', $totalFormatted
$html = $html -replace '\{\{GRAND_TOTAL_SHORT\}\}', $totalShort
$html = $html -replace '\{\{DATA_JSON\}\}', $jsData
$html = $html -replace '\{\{GRAND_TOTAL_NUM\}\}', [math]::Round($grandTotal, 2)
$html = $html -replace '\{\{SUGGESTIONS_JSON\}\}', $suggJson

$html | Out-File -FilePath $OutputPath -Encoding utf8
Write-Host "Portfolio report generated: $OutputPath"
Write-Host "Holdings: $($holdings.Count) | Categories: $($categories.Count) | Grand Total: $totalFormatted"
