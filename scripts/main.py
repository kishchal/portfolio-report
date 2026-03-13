#!/usr/bin/env python3
"""
Generates an interactive HTML portfolio allocation report from a Fidelity CSV export.

Reads a Fidelity portfolio positions CSV, categorizes holdings, and produces
a professional HTML report with 3-level drill-down (Category -> Account -> Ticker),
allocation bar, four pivot views, and data-driven risk classification.

Usage:
    python main.py <CsvPath> [--output <OutputPath>] [--refresh-risk] [--refresh-suggestions] [--refresh-all]
"""

import csv, json, os, re, sys, subprocess, math, argparse, time
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), 'assets')

# --- Account-type inference from Account Name ---
def get_account_type(name):
    n = name.strip()
    if re.search(r'(?i)roth', n):                                    return 'Roth'
    if re.search(r'(?i)health\s*savings|^HSA', n):                   return 'HSA'
    if re.search(r'(?i)college\s*savings|529', n):                   return '529 College Savings'
    if re.search(r'(?i)UTMA|Uniform\s*Transfers?\s*to\s*Minor', n):  return 'Custodial (UTMA)'
    if re.search(r'(?i)403\s*\(?b\)?', n):                           return 'Tax-Deferred 403(b)'
    if re.search(r'(?i)457\s*\(?b\)?', n):                           return 'Tax-Deferred 457(b)'
    if re.search(r'(?i)\bTSP\b|thrift\s*savings', n):                return 'Tax-Deferred TSP'
    if re.search(r'(?i)401[Kk]', n):                                 return 'Tax-Deferred 401(k)'
    if re.search(r'(?i)brokeragelink', n):                           return 'Tax-Deferred 401(k)'
    if re.search(r'(?i)DCP|deferred\s*comp', n):                     return 'Tax-Deferred DCP'
    if re.search(r'(?i)rollover\s*ira|traditional\s*ira|sep\s*ira|simple\s*ira', n): return 'Tax-Deferred IRA'
    if re.search(r'(?i)self.employed\s*401', n):                     return 'Tax-Deferred 401(k)'
    if re.search(r'(?i)\bira\b', n):                                 return 'Tax-Deferred IRA'
    if re.search(r'(?i)individual|joint|wros|trust|living\s*trust|revocable', n): return 'Taxable Investment'
    return 'Other'

# --- Category mapping ---
# NOTE: Entries below cover common Fidelity fund symbols. Plan-specific symbols
# (e.g. 59515R401, 31617E471, NHFSMKX98) are employer-plan pooled funds that
# may not exist in your portfolio — unknown symbols fall through to heuristic
# classification (stocks, CDs, cash) so the report still works without them.
CATEGORY_MAP = {
    'FXAIX':      ('US Index Funds',          'Fidelity 500 Index (S&P 500)'),
    'FSKAX':      ('US Index Funds',          'Fidelity Total Market Index'),
    'SCHD':       ('US Index Funds',          'Schwab US Dividend Equity ETF'),
    'FTIHX':      ('International Funds',     'Fidelity Total International Index'),
    'FZILX':      ('International Funds',     'Fidelity ZERO International Index'),
    'VFWSX':      ('International Funds',     'Vanguard FTSE All-World ex-US'),
    'FXNAX':      ('Bond Funds',              'Fidelity US Bond Index'),
    'FSPTX':      ('Tech Sector Fund',        'Fidelity Select Technology'),
    'TQQQ':       ('Growth / Leveraged ETFs', 'ProShares UltraPro QQQ (3x Nasdaq)'),
    'VOOG':       ('Growth / Leveraged ETFs', 'Vanguard S&P 500 Growth ETF'),
    'PBW':        ('Growth / Leveraged ETFs', 'Invesco WilderHill Clean Energy ETF'),
    'SPAXX**':    ('Cash / Money Market',     'Fidelity Government Money Market'),
    'FDRXX**':    ('Cash / Money Market',     'Fidelity Government Money Market'),
    'CORE**':     ('Cash / Money Market',     'FDIC-Insured Deposit Sweep'),
    'FZDXX':      ('Cash / Money Market',     'Fidelity Money Market Premium Class'),
    'NHFSMKX98':  ('US Index Funds',          'NH Fidelity 500 Index (529 plan-specific)'),
    '59515R401':  ('US Index Funds',          'Vanguard 500 Index Trust (plan-specific)'),
    '31617E471':  ('US Index Funds',          'Fidelity Growth Company Pool Cl S (plan-specific)'),
    'INTL GROWTH ACCOUNT': ('International Funds', 'International Growth Account (plan-specific)'),
    'SMID CAP GROWTH ACCT': ('US Index Funds',     'SMID Cap Growth Account (plan-specific)'),
    'Various':    ('Unspecified',              'Various / Unspecified'),
}

STOCK_SYMBOLS = {'AAPL','AMD','AMZN','CWBHF','GOOG','GOOGL','LCID','META','MSFT','NFLX','NIO','NVDA','PLTR','TSLA','PSNY'}

HIGH_RISK = {'PLTR','HOOD','RBLX','CVNA','NET','SNOW','MDB','TEAM','DDOG','DOCU',
    'DASH','ABNB','TTD','APP','VRT','VST','CEG','GEV','LCID','NIO','PSNY','CWBHF','PBW',
    'RIVN','MARA','COIN','ARKK','SMCI'}

GROWTH = {'NVDA','GOOGL','GOOG','AVGO','AMD','AMAT','MU','KLAC','MPWR','NOW',
    'CDNS','SNPS','LRCX','DELL','ON','ISRG','CRWD','META','AMZN','NFLX','ADBE','CRM',
    'INTU','ORCL','FTNT','PANW','FICO','SHOP','UBER','MA','V','BX'}

DIVIDEND_VALUE = {'XOM','CVX','T','VZ','MO','PM','O','KO','PEP','ED','DUK','SO',
    'AEP','EVRG','NEE','ATO','DTE','SRE','EXC','WMB','HAL','SLB','OVV','FANG','COP','PSX',
    'MPC','KR','WY','DOW','LYB','IFF','BMY','PFE','KVUE','CLX','CHD','KDP','MRK','GILD',
    'ABBV','AMGN','MMM','F','HPE','CMCSA','WFC','USB','KEY','TFC','PNC','C','BAC','PRU',
    'TROW','WBD','INTC'}


def get_risk_tag(sym, risk_cache):
    if sym in risk_cache:
        return risk_cache[sym]
    if sym in HIGH_RISK:     return 'High Risk / Speculative'
    if sym in GROWTH:        return 'Growth'
    if sym in DIVIDEND_VALUE: return 'Dividend / Value'
    return 'Blue Chip / Core'


def parse_currency(s):
    s = s.strip()
    negative = s.startswith('(') or s.startswith('-') or s.startswith('$-') or s.startswith('-$')
    val = float(re.sub(r'[$ ,()\\-]', '', s) or '0')
    return -val if negative else val


def js_val(val):
    if val is None:
        return 'null'
    if isinstance(val, str):
        escaped = val.replace("\\", "\\\\").replace("'", "\\u0027").replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
        return f"'{escaped}'"
    return str(round(val, 2))


def main():
    parser = argparse.ArgumentParser(description='Generate portfolio allocation report')
    parser.add_argument('csv_path', help='Path to Fidelity portfolio positions CSV')
    parser.add_argument('--output', help='Output HTML path (default: derived from CSV name)')
    parser.add_argument('--refresh-risk', action='store_true', help='Refresh risk data from Yahoo Finance')
    parser.add_argument('--refresh-suggestions', action='store_true', help='Refresh suggestions data from Yahoo Finance')
    parser.add_argument('--refresh-all', action='store_true', help='Refresh all cached data (risk + suggestions)')
    args = parser.parse_args()

    # --refresh-all implies both
    if args.refresh_all:
        args.refresh_risk = True
        args.refresh_suggestions = True

    csv_path = args.csv_path
    if not os.path.isfile(csv_path):
        print(f"Error: CSV file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    # --- Derive output path ---
    if args.output:
        output_path = args.output
    else:
        d = os.path.dirname(csv_path) or '.'
        base = os.path.splitext(os.path.basename(csv_path))[0].replace('_Positions', '_Report')
        if 'Report' not in base:
            base += '_Report'
        output_path = os.path.join(d, base + '.html')

    # --- Risk cache ---
    risk_cache_path = os.path.join(ASSETS_DIR, 'risk_cache.json')
    fetch_risk_script = os.path.join(SCRIPT_DIR, 'fetch_risk_data.py')
    risk_cache = {}

    if args.refresh_risk or not os.path.isfile(risk_cache_path):
        if os.path.isfile(fetch_risk_script):
            print("Fetching risk data from Yahoo Finance (this may take a few minutes)...")
            rc = subprocess.run([sys.executable, fetch_risk_script, csv_path, '--cache', risk_cache_path])
            if rc.returncode != 0:
                print("Warning: Risk data fetch failed; falling back to static classification.")

    if os.path.isfile(risk_cache_path):
        try:
            with open(risk_cache_path) as f:
                cache_json = json.load(f)
            for sym, data in cache_json.get('symbols', {}).items():
                risk_cache[sym] = data.get('risk') or 'Blue Chip / Core'
            print(f"Loaded risk cache: {len(risk_cache)} symbols (fetched: {cache_json.get('_meta', {}).get('fetched', 'N/A')})")
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Warning: Risk cache is corrupt ({e}); falling back to static classification.")

    # --- Suggestions cache ---
    sugg_cache_path = os.path.join(ASSETS_DIR, 'suggestions_cache.json')
    sugg_fetch_script = os.path.join(SCRIPT_DIR, 'fetch_suggestions.py')
    sugg_json = 'null'

    # Auto-refresh if cache is older than 7 days
    sugg_stale = False
    if os.path.isfile(sugg_cache_path):
        cache_age_days = (time.time() - os.path.getmtime(sugg_cache_path)) / 86400
        if cache_age_days > 7:
            sugg_stale = True
            print(f"Suggestions cache is {cache_age_days:.0f} days old (>7 days) — auto-refreshing...")

    if args.refresh_suggestions or sugg_stale or not os.path.isfile(sugg_cache_path):
        if os.path.isfile(sugg_fetch_script):
            print("Fetching suggestions data from Yahoo Finance...")
            rc = subprocess.run([sys.executable, sugg_fetch_script, '--cache', sugg_cache_path])
            if rc.returncode != 0:
                print("Warning: Suggestions data fetch failed; suggestions tab will show static data only.")

    if os.path.isfile(sugg_cache_path):
        try:
            with open(sugg_cache_path) as f:
                sugg_json = f.read().strip()
            sugg_meta = json.loads(sugg_json)
            meta = sugg_meta.get('_meta', {})
            print(f"Loaded suggestions cache: {meta.get('fund_count', '?')} funds (fetched: {meta.get('fetched', 'unknown')})")
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Warning: Suggestions cache is corrupt ({e}); suggestions tab will show static data only.")
            sugg_json = 'null'

    # --- Read CSV ---
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        print("Error: CSV is empty.", file=sys.stderr)
        sys.exit(1)

    has_account_type = 'Account Type' in rows[0]
    holdings = []

    for row in rows:
        sym = (row.get('Symbol') or '').strip()
        acct_num = (row.get('Account Number') or '').strip()
        acct_name = (row.get('Account Name') or '').strip()
        desc = (row.get('Description') or '').strip()
        val_str = (row.get('Current Value') or '').strip()

        if not acct_num or not val_str or val_str in ('N/A', 'n/a', '--'):
            continue
        if not sym and not desc:
            continue
        # Skip non-holding rows (e.g. "Pending Activity")
        if re.search(r'(?i)pending\s*activity', desc) or re.search(r'(?i)pending\s*activity', sym):
            continue

        # Skip duplicate wrapper accounts
        if re.search(r'(?i)(401K|403B|457B?|TSP)\s*PLAN$', acct_name) and re.search(r'(?i)BROKERAGELINK', desc):
            continue

        # Determine account type
        if has_account_type:
            acct_type = (row.get('Account Type') or '').strip()
            if not acct_type:
                acct_type = get_account_type(acct_name)
        else:
            acct_type = get_account_type(acct_name)

        val = parse_currency(val_str)
        if not sym:
            sym = desc

        # Extract gain/loss and cost basis data
        gl_str = (row.get('Total Gain/Loss Dollar') or '').strip()
        glp_str = (row.get('Total Gain/Loss Percent') or '').strip()
        cb_str = (row.get('Cost Basis Total') or '').strip()
        gain_loss = parse_currency(gl_str) if gl_str and gl_str not in ('--', 'N/A', 'n/a') else None
        gain_loss_pct = float(glp_str.replace('%', '').replace('+', '')) if glp_str and glp_str not in ('--', 'N/A', 'n/a') else None
        cost_basis = parse_currency(cb_str) if cb_str and cb_str not in ('--', 'N/A', 'n/a') else None

        # Determine category
        if sym in CATEGORY_MAP:
            cat, detail = CATEGORY_MAP[sym]
        elif sym.startswith('BROKERAGELINK'):
            cat, detail = 'Cash / Money Market', 'BrokerageLink Cash'
        elif re.search(r'(?i)certificate.of.deposit|^CD\b|\bCD$|brokered\s*cd', desc):
            cat, detail = 'Cash / Money Market', desc
        elif sym in STOCK_SYMBOLS or (re.match(r'^[A-Z]{1,5}$', sym) and '*' not in sym):
            cat, detail = 'Individual Stocks', desc
        else:
            cat, detail = 'Other', desc

        risk = ''
        if cat == 'Individual Stocks':
            risk = get_risk_tag(sym, risk_cache)

        holdings.append({
            'AccountNumber': acct_num, 'AccountType': acct_type, 'AccountName': acct_name,
            'Symbol': sym, 'FundName': detail, 'Value': val, 'Category': cat, 'Risk': risk,
            'GainLoss': gain_loss, 'GainLossPct': gain_loss_pct, 'CostBasis': cost_basis,
        })

    if not holdings:
        print("Error: No valid holdings found in CSV.", file=sys.stderr)
        sys.exit(1)

    # --- Aggregate tax lots: merge rows with same (AccountNumber, Symbol) ---
    from collections import defaultdict, OrderedDict
    agg_key = lambda h: (h['AccountNumber'], h['Symbol'])
    agg_map = OrderedDict()
    for h in holdings:
        k = agg_key(h)
        if k in agg_map:
            a = agg_map[k]
            a['Value'] += h['Value']
            if a['GainLoss'] is not None and h['GainLoss'] is not None:
                a['GainLoss'] += h['GainLoss']
            elif h['GainLoss'] is not None:
                a['GainLoss'] = h['GainLoss']
            if a['CostBasis'] is not None and h['CostBasis'] is not None:
                a['CostBasis'] += h['CostBasis']
            elif h['CostBasis'] is not None:
                a['CostBasis'] = h['CostBasis']
        else:
            agg_map[k] = dict(h)  # shallow copy
    # Recalculate gain/loss percentage from aggregated values
    for h in agg_map.values():
        if h['CostBasis'] and h['CostBasis'] > 0 and h['GainLoss'] is not None:
            h['GainLossPct'] = round(h['GainLoss'] / h['CostBasis'] * 100, 2)
        else:
            h['GainLossPct'] = None
    holdings = list(agg_map.values())

    grand_total = sum(h['Value'] for h in holdings)

    # --- Build hierarchical data: Category -> Account -> Tickers ---
    cat_groups = defaultdict(list)
    for h in holdings:
        cat_groups[h['Category']].append(h)

    categories = []
    for cat_name, group in cat_groups.items():
        cat_total = sum(h['Value'] for h in group)
        acct_groups = defaultdict(list)
        for h in group:
            acct_groups[h['AccountNumber']].append(h)
        accounts = []
        for acct_num, acct_holdings in acct_groups.items():
            acct_total = sum(h['Value'] for h in acct_holdings)
            first = acct_holdings[0]
            tickers = sorted(acct_holdings, key=lambda h: -h['Value'])
            tickers = [{'sym': h['Symbol'], 'name': h['FundName'], 'val': h['Value'], 'risk': h['Risk'],
                        'gl': h['GainLoss'], 'glPct': h['GainLossPct'], 'cb': h['CostBasis']} for h in tickers]
            accounts.append({
                'num': first['AccountNumber'], 'type': first['AccountType'],
                'name': first['AccountName'], 'val': acct_total, 'tickers': tickers,
            })
        accounts.sort(key=lambda a: -a['val'])
        categories.append({'cat': cat_name, 'total': cat_total, 'accounts': accounts})
    categories.sort(key=lambda c: -c['total'])

    # --- Generate JS data ---
    js_data = "["
    for c in categories:
        js_data += f"\n  {{cat:{js_val(c['cat'])},total:{round(c['total'],2)},accounts:["
        for a in c['accounts']:
            js_data += f"\n    {{num:{js_val(a['num'])},type:{js_val(a['type'])},name:{js_val(a['name'])},val:{round(a['val'],2)},tickers:["
            for t in a['tickers']:
                js_data += f"\n      {{sym:{js_val(t['sym'])},name:{js_val(t['name'])},val:{round(t['val'],2)},risk:{js_val(t['risk'])},gl:{js_val(t['gl'])},glPct:{js_val(t['glPct'])},cb:{js_val(t['cb'])}}},"
            js_data += "]},"
        js_data += "]},"
    js_data += "]"

    # --- Report date ---
    m = re.search(r'(\w{3}-\d{1,2}-\d{4})', os.path.basename(csv_path))
    report_date = m.group(1).replace('-', ' ') if m else datetime.now().strftime('%b %d, %Y')

    total_formatted = '${:,.2f}'.format(grand_total)
    if grand_total >= 1e9:
        total_short = '${:.2f}B'.format(grand_total / 1e9)
    elif grand_total >= 1e6:
        total_short = '${:.2f}M'.format(grand_total / 1e6)
    else:
        total_short = total_formatted

    # --- Read and fill template ---
    template_path = os.path.join(ASSETS_DIR, 'template.html')
    if not os.path.isfile(template_path):
        print(f"Error: HTML template not found at: {template_path}", file=sys.stderr)
        sys.exit(1)

    with open(template_path, encoding='utf-8') as f:
        html = f.read()

    html = html.replace('{{REPORT_DATE}}', report_date)
    html = html.replace('{{GENERATED_AT}}', datetime.now().strftime('%b %d, %Y at %I:%M %p'))
    html = html.replace('{{GRAND_TOTAL}}', total_formatted)
    html = html.replace('{{GRAND_TOTAL_SHORT}}', total_short)
    html = html.replace('{{DATA_JSON}}', js_data)
    html = html.replace('{{GRAND_TOTAL_NUM}}', str(round(grand_total, 2)))
    html = html.replace('{{SUGGESTIONS_JSON}}', sugg_json.replace('</script', '<\\/script'))
    html = html.replace('{{SOURCE_FILE}}', os.path.basename(csv_path))

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Portfolio report generated: {output_path}")
    print(f"Holdings: {len(holdings)} | Categories: {len(categories)} | Grand Total: {total_formatted}")


if __name__ == '__main__':
    main()
