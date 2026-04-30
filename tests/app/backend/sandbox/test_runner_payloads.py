import json

from app.backend.sandbox.runner import event_to_ndjson_line, load_request, parse_args


def test_runner_help_parser_accepts_hedge_fund_kind():
    args = parse_args(["--kind", "hedge_fund", "--request", "/sandbox/input/request.json"])

    assert args.kind == "hedge_fund"


def test_runner_loads_hedge_fund_request(tmp_path):
    request_file = tmp_path / "request.json"
    request_file.write_text(json.dumps({"tickers": ["AAPL"], "graph_nodes": [{"id": "agent"}], "graph_edges": []}))

    request = load_request("hedge_fund", request_file)

    assert request.tickers == ["AAPL"]


def test_runner_invalid_request_produces_error_event_line():
    line = event_to_ndjson_line("error", {"message": "dummy-secret-value failed"})

    assert "dummy-secret-value" not in line
    assert json.loads(line)["event"] == "error"
