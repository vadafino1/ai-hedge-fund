import datetime
import logging
import os
import pandas as pd
import requests
import re
import time

logger = logging.getLogger(__name__)

from src.data.cache import get_cache
from src.data.models import (
    CompanyNews,
    CompanyNewsResponse,
    FinancialMetrics,
    FinancialMetricsResponse,
    Price,
    PriceResponse,
    LineItem,
    LineItemResponse,
    InsiderTrade,
    InsiderTradeResponse,
    CompanyFactsResponse,
)

# Global cache instance
_cache = get_cache()


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _configured_providers() -> list[str]:
    raw = os.environ.get("AI_HEDGE_FUND_DATA_PROVIDER", "local,yfinance")
    return [part.strip().lower() for part in raw.split(",") if part.strip()]


def _financialdatasets_enabled(api_key: str | None = None) -> bool:
    return _env_flag("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", False) and bool(api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY"))


def _price_data_dir() -> str:
    return os.environ.get("AI_HEDGE_FUND_PRICE_DATA_DIR", "data/prices")


def _safe_ticker_for_filename(ticker: str) -> str | None:
    symbol = ticker.strip()
    if not re.fullmatch(r"[A-Za-z0-9._-]+", symbol):
        logger.warning("Rejecting unsafe ticker for local price lookup: %r", ticker)
        return None
    return symbol


def _load_local_prices(ticker: str, start_date: str, end_date: str) -> list[Price]:
    safe_ticker = _safe_ticker_for_filename(ticker)
    if not safe_ticker:
        return []
    price_dir = os.path.abspath(_price_data_dir())
    candidates = [
        os.path.abspath(os.path.join(price_dir, f"{safe_ticker.upper()}.csv")),
        os.path.abspath(os.path.join(price_dir, f"{safe_ticker.lower()}.csv")),
    ]
    path = next((candidate for candidate in candidates if os.path.commonpath([price_dir, candidate]) == price_dir and os.path.exists(candidate)), None)
    if not path:
        return []
    try:
        df = pd.read_csv(path)
    except Exception as exc:
        logger.warning("Failed to read local price CSV for %s: %s", ticker, exc)
        return []

    lower_to_original = {str(col).lower(): col for col in df.columns}
    date_col = lower_to_original.get("date") or lower_to_original.get("time")
    if not date_col:
        logger.warning("Local price CSV for %s has no date/time column", ticker)
        return []

    required = ["open", "high", "low", "close", "volume"]
    if any(col not in lower_to_original for col in required):
        logger.warning("Local price CSV for %s is missing one of %s", ticker, required)
        return []

    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    start = pd.to_datetime(start_date)
    end = pd.to_datetime(end_date)
    df = df[(df[date_col] >= start) & (df[date_col] <= end)].copy()
    df.sort_values(date_col, inplace=True)

    prices: list[Price] = []
    for _, row in df.iterrows():
        if pd.isna(row[date_col]):
            continue
        try:
            prices.append(
                Price(
                    time=row[date_col].strftime("%Y-%m-%d"),
                    open=float(row[lower_to_original["open"]]),
                    high=float(row[lower_to_original["high"]]),
                    low=float(row[lower_to_original["low"]]),
                    close=float(row[lower_to_original["close"]]),
                    volume=int(row[lower_to_original["volume"]]),
                )
            )
        except Exception as exc:
            logger.warning("Skipping invalid local price row for %s: %s", ticker, exc)
    return prices


def _load_yfinance_prices(ticker: str, start_date: str, end_date: str) -> list[Price]:
    try:
        import yfinance as yf  # type: ignore
    except Exception:
        return []
    try:
        end_exclusive = (pd.to_datetime(end_date) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        df = yf.download(ticker, start=start_date, end=end_exclusive, progress=False, auto_adjust=False)
    except Exception as exc:
        logger.warning("Failed to fetch yfinance prices for %s: %s", ticker, exc)
        return []
    if df is None or df.empty:
        return []
    if isinstance(df.columns, pd.MultiIndex):
        lookup = ticker.strip().upper()
        if lookup in df.columns.get_level_values(-1):
            df = df.xs(lookup, axis=1, level=-1)
        elif lookup in df.columns.get_level_values(0):
            df = df[lookup]
        else:
            df.columns = df.columns.get_level_values(0)
    prices: list[Price] = []
    for index, row in df.iterrows():
        try:
            prices.append(
                Price(
                    time=pd.to_datetime(index).strftime("%Y-%m-%d"),
                    open=float(row.get("Open")),
                    high=float(row.get("High")),
                    low=float(row.get("Low")),
                    close=float(row.get("Close")),
                    volume=int(row.get("Volume", 0)),
                )
            )
        except Exception as exc:
            logger.warning("Skipping invalid yfinance price row for %s: %s", ticker, exc)
    return prices


def _fetch_fintel_symbol_payload(command: str, symbol: str, country: str = "us") -> dict | list | None:
    try:
        provider_path = os.environ.get("AI_HEDGE_FUND_FINTEL_PROVIDER_PATH")
        if provider_path:
            import sys
            provider_path = os.path.abspath(provider_path)
            if not os.path.isdir(provider_path):
                logger.warning("Configured Fintel provider path does not exist: %s", provider_path)
                return None
            if provider_path not in sys.path:
                sys.path.append(provider_path)
        from mykm.hedgefund.providers.fintel_api import fetch_symbol_payload  # type: ignore
        return fetch_symbol_payload(command, symbol, country=country)
    except Exception as exc:
        logger.warning("Fintel %s lookup failed for %s: %s", command, symbol, exc)
        return None


def _payload_items(payload: dict | list | None) -> list[dict]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("data", "rows", "results", "insider_trades", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return [payload]


def _first_value(row: dict, *keys: str):
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _to_float(value):
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", ""))
    except Exception:
        return None


def _map_fintel_insider_trades(ticker: str, payload: dict | list | None, start_date: str | None, end_date: str, limit: int) -> list[InsiderTrade]:
    trades: list[InsiderTrade] = []
    start_dt = pd.to_datetime(start_date) if start_date else None
    end_dt = pd.to_datetime(end_date)
    for row in _payload_items(payload):
        filing_date = _first_value(row, "filing_date", "filingDate", "filed", "filedDate", "date")
        transaction_date = _first_value(row, "transaction_date", "transactionDate", "transactionDateDt", "date")
        effective_date = filing_date or transaction_date
        if not effective_date:
            continue
        parsed = pd.to_datetime(effective_date, errors="coerce")
        if pd.isna(parsed):
            continue
        if start_dt is not None and parsed < start_dt:
            continue
        if parsed > end_dt:
            continue
        trades.append(
            InsiderTrade(
                ticker=ticker,
                issuer=_first_value(row, "issuer", "issuerName", "company"),
                name=_first_value(row, "name", "ownerName", "insider", "reportingOwner"),
                title=_first_value(row, "title", "officerTitle", "relationship"),
                is_board_director=None,
                transaction_date=str(transaction_date or effective_date)[:10],
                transaction_shares=_to_float(_first_value(row, "transaction_shares", "transactionShares", "shares")),
                transaction_price_per_share=_to_float(_first_value(row, "transaction_price_per_share", "transactionPricePerShare", "price")),
                transaction_value=_to_float(_first_value(row, "transaction_value", "transactionValue", "value")),
                shares_owned_before_transaction=_to_float(_first_value(row, "shares_owned_before_transaction", "sharesOwnedBeforeTransaction")),
                shares_owned_after_transaction=_to_float(_first_value(row, "shares_owned_after_transaction", "sharesOwnedAfterTransaction", "sharesOwned")),
                security_title=_first_value(row, "security_title", "securityTitle"),
                filing_date=str(filing_date or effective_date)[:10],
            )
        )
        if len(trades) >= limit:
            break
    return trades


def _make_api_request(url: str, headers: dict, method: str = "GET", json_data: dict = None, max_retries: int = 3) -> requests.Response:
    """
    Make an API request with rate limiting handling and moderate backoff.
    
    Args:
        url: The URL to request
        headers: Headers to include in the request
        method: HTTP method (GET or POST)
        json_data: JSON data for POST requests
        max_retries: Maximum number of retries (default: 3)
    
    Returns:
        requests.Response: The response object
    
    Raises:
        Exception: If the request fails with a non-429 error
    """
    for attempt in range(max_retries + 1):  # +1 for initial attempt
        if method.upper() == "POST":
            response = requests.post(url, headers=headers, json=json_data)
        else:
            response = requests.get(url, headers=headers)
        
        if response.status_code == 429 and attempt < max_retries:
            # Linear backoff: 60s, 90s, 120s, 150s...
            delay = 60 + (30 * attempt)
            print(f"Rate limited (429). Attempt {attempt + 1}/{max_retries + 1}. Waiting {delay}s before retrying...")
            time.sleep(delay)
            continue
        
        # Return the response (whether success, other errors, or final 429)
        return response


def get_prices(ticker: str, start_date: str, end_date: str, api_key: str = None) -> list[Price]:
    """Fetch daily OHLCV from cache, local/free providers, or optional premium provider."""
    cache_key = f"{ticker}_{start_date}_{end_date}"
    if cached_data := _cache.get_prices(cache_key):
        return [Price(**price) for price in cached_data]

    prices: list[Price] = []
    providers = _configured_providers()
    if "local" in providers:
        prices = _load_local_prices(ticker, start_date, end_date)
    if not prices and "yfinance" in providers:
        prices = _load_yfinance_prices(ticker, start_date, end_date)

    if prices:
        _cache.set_prices(cache_key, [p.model_dump() for p in prices])
        return prices

    if not _financialdatasets_enabled(api_key) or "financialdatasets" not in providers:
        return []

    headers = {"X-API-KEY": api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")}
    url = f"https://api.financialdatasets.ai/prices/?ticker={ticker}&interval=day&interval_multiplier=1&start_date={start_date}&end_date={end_date}"
    response = _make_api_request(url, headers)
    if response.status_code != 200:
        return []

    try:
        price_response = PriceResponse(**response.json())
        prices = price_response.prices
    except Exception as e:
        logger.warning("Failed to parse price response for %s: %s", ticker, e)
        return []

    if not prices:
        return []

    _cache.set_prices(cache_key, [p.model_dump() for p in prices])
    return prices

def get_financial_metrics(
    ticker: str,
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
    api_key: str = None,
) -> list[FinancialMetrics]:
    """Fetch financial metrics from cache or API."""
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{ticker}_{period}_{end_date}_{limit}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_financial_metrics(cache_key):
        return [FinancialMetrics(**metric) for metric in cached_data]

    if not _financialdatasets_enabled(api_key):
        return []

    headers = {"X-API-KEY": api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")}
    url = f"https://api.financialdatasets.ai/financial-metrics/?ticker={ticker}&report_period_lte={end_date}&limit={limit}&period={period}"
    response = _make_api_request(url, headers)
    if response.status_code != 200:
        return []

    # Parse response with Pydantic model
    try:
        metrics_response = FinancialMetricsResponse(**response.json())
        financial_metrics = metrics_response.financial_metrics
    except Exception as e:
        logger.warning("Failed to parse financial metrics response for %s: %s", ticker, e)
        return []

    if not financial_metrics:
        return []

    # Cache the results as dicts using the comprehensive cache key
    _cache.set_financial_metrics(cache_key, [m.model_dump() for m in financial_metrics])
    return financial_metrics


def search_line_items(
    ticker: str,
    line_items: list[str],
    end_date: str,
    period: str = "ttm",
    limit: int = 10,
    api_key: str = None,
) -> list[LineItem]:
    """Fetch line items from API."""
    if not _financialdatasets_enabled(api_key):
        return []

    headers = {"X-API-KEY": api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")}
    url = "https://api.financialdatasets.ai/financials/search/line-items"

    body = {
        "tickers": [ticker],
        "line_items": line_items,
        "end_date": end_date,
        "period": period,
        "limit": limit,
    }
    response = _make_api_request(url, headers, method="POST", json_data=body)
    if response.status_code != 200:
        return []
    
    try:
        data = response.json()
        response_model = LineItemResponse(**data)
        search_results = response_model.search_results
    except Exception as e:
        logger.warning("Failed to parse line items response for %s: %s", ticker, e)
        return []
    if not search_results:
        return []

    # Cache the results
    return search_results[:limit]


def get_insider_trades(
    ticker: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 1000,
    api_key: str = None,
) -> list[InsiderTrade]:
    """Fetch insider trades from cache, optional Fintel enrichment, or optional premium provider."""
    cache_key = f"{ticker}_{start_date or 'none'}_{end_date}_{limit}"

    if cached_data := _cache.get_insider_trades(cache_key):
        return [InsiderTrade(**trade) for trade in cached_data]

    if _env_flag("AI_HEDGE_FUND_ENABLE_FINTEL", False):
        try:
            fintel_payload = _fetch_fintel_symbol_payload("insider", ticker)
            fintel_trades = _map_fintel_insider_trades(ticker, fintel_payload, start_date, end_date, limit)
            if fintel_trades:
                _cache.set_insider_trades(cache_key, [trade.model_dump() for trade in fintel_trades])
                return fintel_trades
        except Exception as exc:
            logger.warning("Fintel insider trades unavailable for %s: %s", ticker, exc)

    if not _financialdatasets_enabled(api_key):
        return []

    headers = {"X-API-KEY": api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")}
    all_trades = []
    current_end_date = end_date

    while True:
        url = f"https://api.financialdatasets.ai/insider-trades/?ticker={ticker}&filing_date_lte={current_end_date}"
        if start_date:
            url += f"&filing_date_gte={start_date}"
        url += f"&limit={limit}"

        response = _make_api_request(url, headers)
        if response.status_code != 200:
            break

        try:
            data = response.json()
            response_model = InsiderTradeResponse(**data)
            insider_trades = response_model.insider_trades
        except Exception as e:
            logger.warning("Failed to parse insider trades response for %s: %s", ticker, e)
            break

        if not insider_trades:
            break

        all_trades.extend(insider_trades)

        if not start_date or len(insider_trades) < limit:
            break

        current_end_date = min(trade.filing_date for trade in insider_trades).split("T")[0]

        if current_end_date <= start_date:
            break

    if not all_trades:
        return []

    _cache.set_insider_trades(cache_key, [trade.model_dump() for trade in all_trades])
    return all_trades

def get_company_news(
    ticker: str,
    end_date: str,
    start_date: str | None = None,
    limit: int = 1000,
    api_key: str = None,
) -> list[CompanyNews]:
    """Fetch company news from cache or API."""
    # Create a cache key that includes all parameters to ensure exact matches
    cache_key = f"{ticker}_{start_date or 'none'}_{end_date}_{limit}"
    
    # Check cache first - simple exact match
    if cached_data := _cache.get_company_news(cache_key):
        return [CompanyNews(**news) for news in cached_data]

    if not _financialdatasets_enabled(api_key):
        return []

    headers = {"X-API-KEY": api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")}
    all_news = []
    current_end_date = end_date

    while True:
        url = f"https://api.financialdatasets.ai/news/?ticker={ticker}&end_date={current_end_date}"
        if start_date:
            url += f"&start_date={start_date}"
        url += f"&limit={limit}"

        response = _make_api_request(url, headers)
        if response.status_code != 200:
            break

        try:
            data = response.json()
            response_model = CompanyNewsResponse(**data)
            company_news = response_model.news
        except Exception as e:
            logger.warning("Failed to parse company news response for %s: %s", ticker, e)
            break

        if not company_news:
            break

        all_news.extend(company_news)

        # Only continue pagination if we have a start_date and got a full page
        if not start_date or len(company_news) < limit:
            break

        # Update end_date to the oldest date from current batch for next iteration
        current_end_date = min(news.date for news in company_news).split("T")[0]

        # If we've reached or passed the start_date, we can stop
        if current_end_date <= start_date:
            break

    if not all_news:
        return []

    # Cache the results using the comprehensive cache key
    _cache.set_company_news(cache_key, [news.model_dump() for news in all_news])
    return all_news


def get_market_cap(
    ticker: str,
    end_date: str,
    api_key: str = None,
) -> float | None:
    """Fetch market cap from the API."""
    # Check if end_date is today
    if end_date == datetime.datetime.now().strftime("%Y-%m-%d"):
        if not _financialdatasets_enabled(api_key):
            return None
        headers = {"X-API-KEY": api_key or os.environ.get("FINANCIAL_DATASETS_API_KEY")}
        url = f"https://api.financialdatasets.ai/company/facts/?ticker={ticker}"
        response = _make_api_request(url, headers)
        if response.status_code != 200:
            print(f"Error fetching company facts: {ticker} - {response.status_code}")
            return None

        data = response.json()
        response_model = CompanyFactsResponse(**data)
        return response_model.company_facts.market_cap

    financial_metrics = get_financial_metrics(ticker, end_date, api_key=api_key)
    if not financial_metrics:
        return None

    market_cap = financial_metrics[0].market_cap

    if not market_cap:
        return None

    return market_cap


def prices_to_df(prices: list[Price]) -> pd.DataFrame:
    """Convert prices to a DataFrame."""
    if not prices:
        empty = pd.DataFrame(columns=["open", "close", "high", "low", "volume"])
        empty.index = pd.DatetimeIndex([], name="Date")
        return empty
    df = pd.DataFrame([p.model_dump() for p in prices])
    df["Date"] = pd.to_datetime(df["time"])
    df.set_index("Date", inplace=True)
    numeric_cols = ["open", "close", "high", "low", "volume"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df.sort_index(inplace=True)
    return df


# Update the get_price_data function to use the new functions
def get_price_data(ticker: str, start_date: str, end_date: str, api_key: str = None) -> pd.DataFrame:
    prices = get_prices(ticker, start_date, end_date, api_key=api_key)
    return prices_to_df(prices)
