from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from app.backend.models.schemas import BacktestRequest, HedgeFundRequest
from app.backend.services.backtest_service import BacktestService
from app.backend.services.graph import create_graph, parse_hedge_fund_response, run_graph_async
from app.backend.services.portfolio import create_portfolio
from src.utils.progress import progress

SENSITIVE_KEYS = ("api_key", "apikey", "token", "secret", "password", "key_value")


def redact_secrets(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("<redacted>" if any(s in k.lower() for s in SENSITIVE_KEYS) else redact_secrets(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_secrets(item) for item in value]
    if isinstance(value, str):
        return value.replace("dummy-secret-value", "<redacted>")
    return value


def event_to_ndjson_line(event: str, data: dict[str, Any]) -> str:
    return json.dumps({"event": event, "data": redact_secrets(data)}, separators=(",", ":")) + "\n"


class EventWriter:
    def __init__(self, output: Path | None = None):
        self._output_handle = output.open("a", encoding="utf-8") if output else None

    def write(self, event: str, data: dict[str, Any]) -> None:
        line = event_to_ndjson_line(event, data)
        sys.stdout.write(line)
        sys.stdout.flush()
        if self._output_handle:
            self._output_handle.write(line)
            self._output_handle.flush()

    def close(self) -> None:
        if self._output_handle:
            self._output_handle.close()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one AI Hedge Fund request and stream NDJSON events")
    parser.add_argument("--kind", choices=["hedge_fund", "backtest"], required=True)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=None)
    return parser.parse_args(argv)


def load_request(kind: str, request_file: Path) -> HedgeFundRequest | BacktestRequest:
    payload = json.loads(request_file.read_text(encoding="utf-8"))
    if kind == "hedge_fund":
        return HedgeFundRequest(**payload)
    return BacktestRequest(**payload)


def _model_provider_value(request_data):
    provider = request_data.model_provider
    return provider.value if hasattr(provider, "value") else provider


async def run_hedge_fund(request_data: HedgeFundRequest, writer: EventWriter) -> None:
    writer.write("start", {})
    writer.write("progress", {"agent": "system", "ticker": None, "status": "Preparing hedge fund run", "timestamp": None, "analysis": None})

    def progress_handler(agent_name, ticker, status, analysis, timestamp):
        writer.write("progress", {"agent": agent_name, "ticker": ticker, "status": status, "timestamp": timestamp, "analysis": analysis})

    progress.register_handler(progress_handler)
    try:
        portfolio = create_portfolio(request_data.initial_cash, request_data.margin_requirement, request_data.tickers, request_data.portfolio_positions)
        graph = create_graph(graph_nodes=request_data.graph_nodes, graph_edges=request_data.graph_edges).compile()
        result = await run_graph_async(
            graph=graph,
            portfolio=portfolio,
            tickers=request_data.tickers,
            start_date=request_data.start_date,
            end_date=request_data.end_date,
            model_name=request_data.model_name,
            model_provider=_model_provider_value(request_data),
            request=request_data,
        )
        if not result or not result.get("messages"):
            writer.write("error", {"message": "Failed to generate hedge fund decisions"})
            return
        writer.write("complete", {"data": {"decisions": parse_hedge_fund_response(result.get("messages", [])[-1].content), "analyst_signals": result.get("data", {}).get("analyst_signals", {}), "current_prices": result.get("data", {}).get("current_prices", {})}})
    finally:
        progress.unregister_handler(progress_handler)


async def run_backtest(request_data: BacktestRequest, writer: EventWriter) -> None:
    writer.write("start", {})

    def progress_handler(agent_name, ticker, status, analysis, timestamp):
        writer.write("progress", {"agent": agent_name, "ticker": ticker, "status": status, "timestamp": timestamp, "analysis": analysis})

    def progress_callback(update):
        if update["type"] == "progress":
            writer.write("progress", {"agent": "backtest", "ticker": None, "status": f"Processing {update['current_date']} ({update['current_step']}/{update['total_dates']})", "timestamp": None, "analysis": None})
        elif update["type"] == "backtest_result":
            writer.write("progress", {"agent": "backtest", "ticker": None, "status": f"Completed {update['data']['date']} - Portfolio: ${update['data']['portfolio_value']:,.2f}", "timestamp": None, "analysis": json.dumps(update["data"])})

    progress.register_handler(progress_handler)
    try:
        portfolio = create_portfolio(request_data.initial_capital, request_data.margin_requirement, request_data.tickers, request_data.portfolio_positions)
        graph = create_graph(graph_nodes=request_data.graph_nodes, graph_edges=request_data.graph_edges).compile()
        service = BacktestService(
            graph=graph,
            portfolio=portfolio,
            tickers=request_data.tickers,
            start_date=request_data.start_date,
            end_date=request_data.end_date,
            initial_capital=request_data.initial_capital,
            model_name=request_data.model_name,
            model_provider=_model_provider_value(request_data),
            request=request_data,
        )
        result = await service.run_backtest_async(progress_callback=progress_callback)
        if not result:
            writer.write("error", {"message": "Failed to complete backtest"})
            return
        writer.write("complete", {"data": {"performance_metrics": result["performance_metrics"], "final_portfolio": result["final_portfolio"], "total_days": len(result["results"])}})
    finally:
        progress.unregister_handler(progress_handler)


async def main_async(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if Path("/sandbox/.env").exists():
        load_dotenv("/sandbox/.env")
    writer = EventWriter(args.output)
    try:
        request_data = load_request(args.kind, args.request)
        if args.kind == "hedge_fund":
            await run_hedge_fund(request_data, writer)
        else:
            await run_backtest(request_data, writer)
        return 0
    except Exception as exc:
        writer.write("error", {"message": f"Sandbox runner failed: {redact_secrets(str(exc))}"})
        return 1
    finally:
        writer.close()


def main() -> int:
    return asyncio.run(main_async())


if __name__ == "__main__":
    raise SystemExit(main())
