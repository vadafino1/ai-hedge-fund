import pytest

from app.backend.models.schemas import BacktestRequest, ExecutionMode, HedgeFundRequest, SandboxStatusResponse


def _base_payload():
    return {
        "tickers": ["AAPL"],
        "graph_nodes": [{"id": "warren_buffett_agent"}],
        "graph_edges": [],
    }


def test_execution_mode_defaults_to_local_for_hedge_fund_requests():
    request = HedgeFundRequest(**_base_payload())

    assert request.execution_mode == ExecutionMode.LOCAL


def test_execution_mode_accepts_docker_sandbox_for_existing_payload_shape():
    payload = _base_payload() | {"execution_mode": "docker_sandbox"}

    request = HedgeFundRequest(**payload)

    assert request.execution_mode == ExecutionMode.DOCKER_SANDBOX


def test_backtest_request_keeps_existing_payload_compatibility():
    payload = _base_payload() | {"start_date": "2024-01-01", "end_date": "2024-01-31"}

    request = BacktestRequest(**payload)

    assert request.execution_mode == ExecutionMode.LOCAL


def test_sandbox_status_response_shape():
    status = SandboxStatusResponse(
        available=False,
        docker_installed=True,
        docker_running=False,
        image_available=False,
        image_name="ai-hedge-fund:latest",
        message="Docker daemon is not running",
    )

    assert status.model_dump()["image_name"] == "ai-hedge-fund:latest"
