import datetime as dt
from types import SimpleNamespace

import pytest

from src.data.models import InsiderTrade
from src.tools import api


def test_get_prices_reads_local_csv_before_premium_provider(tmp_path, monkeypatch):
    price_dir = tmp_path / "prices"
    price_dir.mkdir()
    (price_dir / "AAPL.csv").write_text(
        "date,open,high,low,close,volume\n"
        "2024-01-01,10,12,9,11,1000\n"
        "2024-01-02,11,13,10,12,1500\n"
        "2024-02-01,50,52,49,51,9999\n"
    )
    monkeypatch.setenv("AI_HEDGE_FUND_PRICE_DATA_DIR", str(price_dir))
    monkeypatch.setenv("AI_HEDGE_FUND_DATA_PROVIDER", "local")
    monkeypatch.setenv("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", "false")
    monkeypatch.setattr(api._cache, "get_prices", lambda _key: None)
    monkeypatch.setattr(api._cache, "set_prices", lambda *_args, **_kwargs: None)

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("premium provider should not be called")

    monkeypatch.setattr(api, "_make_api_request", fail_if_called)

    prices = api.get_prices("AAPL", "2024-01-01", "2024-01-31")

    assert [price.time for price in prices] == ["2024-01-01", "2024-01-02"]
    assert prices[0].open == 10
    assert prices[1].close == 12


def test_get_prices_does_not_call_financialdatasets_when_disabled(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_HEDGE_FUND_PRICE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_HEDGE_FUND_DATA_PROVIDER", "local")
    monkeypatch.setenv("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", "false")
    monkeypatch.delenv("FINANCIAL_DATASETS_API_KEY", raising=False)
    monkeypatch.setattr(api._cache, "get_prices", lambda _key: None)

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("FinancialDatasets request should be gated off")

    monkeypatch.setattr(api, "_make_api_request", fail_if_called)

    assert api.get_prices("MSFT", "2024-01-01", "2024-01-31") == []


def test_get_prices_can_use_financialdatasets_when_explicitly_enabled(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_HEDGE_FUND_PRICE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_HEDGE_FUND_DATA_PROVIDER", "financialdatasets")
    monkeypatch.setenv("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", "true")
    monkeypatch.setattr(api._cache, "get_prices", lambda _key: None)
    captured = {}

    def fake_request(url, headers, **_kwargs):
        captured["url"] = url
        captured["headers"] = headers
        return SimpleNamespace(
            status_code=200,
            json=lambda: {
                "ticker": "MSFT",
                "prices": [
                    {"time": "2024-01-03", "open": 1, "high": 2, "low": 1, "close": 2, "volume": 100}
                ],
            },
        )

    monkeypatch.setattr(api, "_make_api_request", fake_request)
    monkeypatch.setattr(api._cache, "set_prices", lambda *_args, **_kwargs: None)

    prices = api.get_prices("MSFT", "2024-01-01", "2024-01-31", api_key="premium-test")

    assert len(prices) == 1
    assert "financialdatasets.ai/prices" in captured["url"]
    assert captured["headers"] == {"X-API-KEY": "premium-test"}


def test_premium_helpers_return_empty_when_financialdatasets_disabled(monkeypatch):
    monkeypatch.setenv("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", "false")
    monkeypatch.delenv("FINANCIAL_DATASETS_API_KEY", raising=False)
    monkeypatch.setattr(api._cache, "get_financial_metrics", lambda _key: None)
    monkeypatch.setattr(api._cache, "get_insider_trades", lambda _key: None)
    monkeypatch.setattr(api._cache, "get_company_news", lambda _key: None)

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("FinancialDatasets request should be gated off")

    monkeypatch.setattr(api, "_make_api_request", fail_if_called)

    assert api.get_financial_metrics("AAPL", "2024-01-31") == []
    assert api.search_line_items("AAPL", ["revenue"], "2024-01-31") == []
    assert api.get_company_news("AAPL", "2024-01-31") == []
    assert api.get_market_cap("AAPL", "2024-01-31") is None


def test_get_insider_trades_uses_fintel_when_enabled(monkeypatch):
    monkeypatch.setenv("AI_HEDGE_FUND_ENABLE_FINTEL", "true")
    monkeypatch.setenv("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", "false")
    monkeypatch.setattr(api._cache, "get_insider_trades", lambda _key: None)
    monkeypatch.setattr(api._cache, "set_insider_trades", lambda *_args, **_kwargs: None)

    def fake_fintel(command, symbol, country="us"):
        assert command == "insider"
        assert symbol == "AAPL"
        return {
            "data": [
                {
                    "name": "Jane Insider",
                    "title": "CEO",
                    "transactionDate": "2024-01-10",
                    "transactionShares": 10,
                    "transactionPricePerShare": 20,
                    "transactionValue": 200,
                    "sharesOwnedAfterTransaction": 100,
                    "filingDate": "2024-01-11",
                }
            ]
        }

    monkeypatch.setattr(api, "_fetch_fintel_symbol_payload", fake_fintel)

    trades = api.get_insider_trades("AAPL", "2024-01-31", start_date="2024-01-01")

    assert trades == [
        InsiderTrade(
            ticker="AAPL",
            issuer=None,
            name="Jane Insider",
            title="CEO",
            is_board_director=None,
            transaction_date="2024-01-10",
            transaction_shares=10,
            transaction_price_per_share=20,
            transaction_value=200,
            shares_owned_before_transaction=None,
            shares_owned_after_transaction=100,
            security_title=None,
            filing_date="2024-01-11",
        )
    ]


def test_get_prices_reads_yfinance_single_ticker_multiindex(monkeypatch, tmp_path):
    import pandas as pd

    monkeypatch.setenv("AI_HEDGE_FUND_PRICE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_HEDGE_FUND_DATA_PROVIDER", "yfinance")
    monkeypatch.setattr(api._cache, "get_prices", lambda _key: None)
    monkeypatch.setattr(api._cache, "set_prices", lambda *_args, **_kwargs: None)

    columns = pd.MultiIndex.from_tuples(
        [("Open", "CADL"), ("High", "CADL"), ("Low", "CADL"), ("Close", "CADL"), ("Volume", "CADL")],
        names=["Price", "Ticker"],
    )
    frame = pd.DataFrame([[7.04, 7.05, 6.395, 6.50, 1690800]], index=pd.to_datetime(["2026-04-24"]), columns=columns)
    monkeypatch.setitem(__import__("sys").modules, "yfinance", SimpleNamespace(download=lambda *args, **kwargs: frame))

    prices = api.get_prices("CADL", "2026-04-24", "2026-04-24")

    assert len(prices) == 1
    assert prices[0].time == "2026-04-24"
    assert prices[0].open == 7.04
    assert prices[0].close == 6.50
    assert prices[0].volume == 1690800


def test_get_price_data_returns_empty_dataframe_when_no_provider_has_prices(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_HEDGE_FUND_PRICE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_HEDGE_FUND_DATA_PROVIDER", "local")
    monkeypatch.setenv("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", "false")
    monkeypatch.setattr(api._cache, "get_prices", lambda _key: None)

    df = api.get_price_data("MISSING", "2024-01-01", "2024-01-31")

    assert list(df.columns) == ["open", "close", "high", "low", "volume"]
    assert df.empty


def test_get_insider_trades_degrades_when_fintel_fails(monkeypatch):
    monkeypatch.setenv("AI_HEDGE_FUND_ENABLE_FINTEL", "true")
    monkeypatch.setenv("AI_HEDGE_FUND_ALLOW_FINANCIAL_DATASETS", "false")
    monkeypatch.setattr(api._cache, "get_insider_trades", lambda _key: None)

    def fail_fintel(*_args, **_kwargs):
        raise RuntimeError("fintel unavailable")

    def fail_premium(*_args, **_kwargs):
        raise AssertionError("FinancialDatasets request should remain disabled")

    monkeypatch.setattr(api, "_fetch_fintel_symbol_payload", fail_fintel)
    monkeypatch.setattr(api, "_make_api_request", fail_premium)

    assert api.get_insider_trades("AAPL", "2024-01-31") == []
