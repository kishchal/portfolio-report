#!/usr/bin/env python3
"""Fetch fund metrics for portfolio suggestions using yfinance."""

import json, sys, os, time, argparse
from datetime import datetime, timedelta

try:
    import yfinance as yf
    import numpy as np
except ImportError:
    print("Error: yfinance and numpy required. Install with: pip install yfinance numpy")
    sys.exit(1)

# Fund universe — tickers used in model portfolios and account guidance
FUND_TICKERS = [
    'VTI','VOO','FXAIX','FSKAX',                   # US broad/large
    'AVUV','VXF','SCHD','QQQM','COWZ','DGRW',      # US factor/tilt
    'VXUS','VEA','VWO','FTIHX','AVDV','SCHE','IEMG','EFA',  # International
    'BND','FXNAX','VGSH','SCHP','BNDX','HYG','AGG','VCSH','VTIP','MUB','TLT',  # Bonds
    'VNQ','VNQI','GLD','PDBC',                      # REITs / Alternatives
]

def fetch_fund_metrics(symbols):
    """Fetch performance and risk metrics for each symbol."""
    results = {}
    end = datetime.now()
    start_10y = end - timedelta(days=10*365+30)

    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(start=start_10y.strftime('%Y-%m-%d'),
                                 end=end.strftime('%Y-%m-%d'))
            if hist.empty or len(hist) < 20:
                print(f"  {sym}: insufficient data")
                results[sym] = None
                continue

            prices = hist['Close']
            daily_ret = prices.pct_change().dropna()

            # Returns (1y, 2y, 3y, 5y annualized)
            def ann_return(days):
                cutoff = (end - timedelta(days=days)).strftime('%Y-%m-%d')
                mask = prices.index >= cutoff
                if mask.sum() < 10:
                    return None
                p = prices[mask]
                total = p.iloc[-1] / p.iloc[0]
                yrs = (p.index[-1] - p.index[0]).days / 365.25
                return round((total ** (1/max(yrs,0.25)) - 1) * 100, 2) if yrs > 0 else None

            ret_1y = ann_return(365)
            ret_2y = ann_return(730)
            ret_3y = ann_return(1095)
            ret_5y = ann_return(5*365)

            # Volatility (annualized std dev over full history)
            vol = round(float(daily_ret.std() * (252**0.5) * 100), 2)

            # Max drawdown
            cummax = prices.cummax()
            dd = (prices - cummax) / cummax
            max_dd = round(float(dd.min() * 100), 2)

            # Beta from yfinance info
            info = ticker.info or {}
            beta = info.get('beta', info.get('beta3Year'))
            if beta is not None:
                beta = round(float(beta), 2)

            # Dividend yield
            dy = info.get('yield', info.get('dividendYield'))
            if dy is not None:
                dy = round(float(dy) * 100, 2) if dy < 1 else round(float(dy), 2)

            results[sym] = {
                'ret1y': ret_1y, 'ret2y': ret_2y, 'ret3y': ret_3y, 'ret5y': ret_5y,
                'vol3y': vol, 'maxDD': max_dd,
                'beta': beta, 'divYield': dy,
            }
            print(f"  {sym}: 1y={ret_1y}% 3y={ret_3y}% 5y={ret_5y}% vol={vol}% maxDD={max_dd}%")
            time.sleep(0.3)

        except Exception as e:
            print(f"  {sym}: error - {e}")
            results[sym] = None

    return results

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'suggestions_cache.json'))
    args = parser.parse_args()

    print(f"Fetching metrics for {len(FUND_TICKERS)} funds from Yahoo Finance...")
    metrics = fetch_fund_metrics(FUND_TICKERS)

    output = {
        '_meta': {
            'fetched': datetime.now().strftime('%m/%d/%Y %H:%M:%S'),
            'source': 'yfinance',
            'fund_count': sum(1 for v in metrics.values() if v is not None),
        },
        'funds': {k: v for k, v in metrics.items() if v is not None},
    }

    with open(args.cache, 'w') as f:
        json.dump(output, f, indent=2)

    ok = output['_meta']['fund_count']
    print(f"Suggestions cache saved: {ok}/{len(FUND_TICKERS)} funds ({args.cache})")

if __name__ == '__main__':
    main()
