"""
fetch_risk_data.py — Fetch financial metrics via yfinance and classify stock risk.

Usage:
    python fetch_risk_data.py <csv_path> [--cache <cache_path>]

Reads the portfolio CSV to extract unique individual stock symbols,
fetches P/E, beta, market cap, revenue growth, and profit margins from Yahoo Finance,
then classifies each into a risk category and writes a JSON cache file.
"""

import argparse
import csv
import json
import os
import sys
import time

# Known non-stock symbols to skip (funds, ETFs, money market, etc.)
SKIP_SYMBOLS = {
    'FXAIX', 'FSKAX', 'SCHD', 'FTIHX', 'FZILX', 'VFWSX', 'FXNAX', 'FSPTX',
    'TQQQ', 'VOOG', 'PBW', 'NHFSMKX98', 'SPAXX**', 'FDRXX**', 'CORE**',
    'Various', 'BROKERAGELINK', 'FZDXX', 'Pending Activity',
}


def extract_symbols(csv_path):
    """Extract unique stock-like symbols from the portfolio CSV."""
    symbols = set()
    with open(csv_path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            sym = (row.get('Symbol') or '').strip()
            if not sym or sym in SKIP_SYMBOLS:
                continue
            if sym.endswith('**'):
                continue
            # Skip non-ticker text (e.g. "Pending Activity", multi-word descriptions)
            if ' ' in sym or not sym.replace('.','').isalpha() or not sym.isupper():
                continue
            # Skip symbols that look like fund codes (6+ chars with digits)
            if len(sym) > 5 and any(c.isdigit() for c in sym):
                continue
            symbols.add(sym)
    return sorted(symbols)


def classify(info):
    """Classify a stock based on its financial metrics."""
    beta = info.get('beta')
    pe = info.get('trailingPE')
    fwd_pe = info.get('forwardPE')
    mcap = info.get('marketCap') or 0
    rev_growth = info.get('revenueGrowth')  # decimal, e.g. 0.15 = 15%
    profit_margin = info.get('profitMargins')  # decimal
    dividend_yield = info.get('dividendYield') or 0  # decimal

    # High Risk / Speculative
    # - Very high beta, or negative/extreme P/E, or unprofitable, or micro/small cap
    is_high_risk = False
    if beta is not None and beta > 1.8:
        is_high_risk = True
    if pe is not None and (pe < 0 or pe > 100):
        is_high_risk = True
    if profit_margin is not None and profit_margin < 0:
        is_high_risk = True
    if 0 < mcap < 5_000_000_000:  # < $5B
        is_high_risk = True
    if is_high_risk:
        return 'High Risk / Speculative'

    # Growth
    # - Strong revenue growth, above-average beta, sizeable company
    if (rev_growth is not None and rev_growth > 0.15
            and beta is not None and beta > 1.0
            and mcap > 20_000_000_000):
        return 'Growth'

    # Dividend / Value
    # - Low beta, reasonable P/E, profitable, often with dividends
    if (beta is not None and beta < 1.0
            and pe is not None and 5 <= pe <= 25
            and profit_margin is not None and profit_margin > 0.10):
        return 'Dividend / Value'

    # Blue Chip / Core — default for large, moderate-metric stocks
    return 'Blue Chip / Core'


def fetch_all(symbols, batch_pause=0.3):
    """Fetch metrics for all symbols using yfinance."""
    import yfinance as yf

    results = {}
    total = len(symbols)
    for i, sym in enumerate(symbols):
        try:
            ticker = yf.Ticker(sym)
            info = ticker.info or {}
            risk = classify(info)
            results[sym] = {
                'beta': info.get('beta'),
                'trailingPE': info.get('trailingPE'),
                'forwardPE': info.get('forwardPE'),
                'marketCap': info.get('marketCap'),
                'revenueGrowth': info.get('revenueGrowth'),
                'profitMargins': info.get('profitMargins'),
                'dividendYield': info.get('dividendYield'),
                'sector': info.get('sector', ''),
                'risk': risk,
            }
        except Exception as e:
            results[sym] = {'risk': 'Blue Chip / Core', 'error': str(e)}

        # Progress
        if (i + 1) % 10 == 0 or (i + 1) == total:
            print(f'  [{i+1}/{total}] fetched — latest: {sym} → {results[sym].get("risk", "?")}')

        time.sleep(batch_pause)

    return results


def main():
    parser = argparse.ArgumentParser(description='Fetch stock risk data via yfinance')
    parser.add_argument('csv_path', help='Path to the Fidelity portfolio CSV')
    parser.add_argument('--cache', default=None,
                        help='Path for the output JSON cache (default: same dir as script)')
    args = parser.parse_args()

    if not os.path.isfile(args.csv_path):
        print(f'ERROR: CSV not found: {args.csv_path}', file=sys.stderr)
        sys.exit(1)

    cache_path = args.cache or os.path.join(os.path.dirname(__file__), 'risk_cache.json')

    print(f'Extracting symbols from: {args.csv_path}')
    symbols = extract_symbols(args.csv_path)
    print(f'Found {len(symbols)} unique stock symbols to fetch')

    print('Fetching financial data from Yahoo Finance...')
    results = fetch_all(symbols)

    # Add metadata
    from datetime import datetime
    output = {
        '_meta': {
            'fetched': datetime.now().isoformat(),
            'source': 'yfinance / Yahoo Finance',
            'symbol_count': len(results),
        },
        'symbols': results,
    }

    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)

    # Summary
    risk_counts = {}
    for data in results.values():
        r = data.get('risk', 'Unknown')
        risk_counts[r] = risk_counts.get(r, 0) + 1

    print(f'\nCache written to: {cache_path}')
    print(f'Classification summary:')
    for r, c in sorted(risk_counts.items(), key=lambda x: -x[1]):
        print(f'  {r}: {c} stocks')


if __name__ == '__main__':
    main()
