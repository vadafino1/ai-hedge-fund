from fastapi import HTTPException
from fastapi.responses import StreamingResponse
import pytest

from app.backend.models.schemas import BacktestRequest, ExecutionMode, SandboxStatusResponse
from app.backend.routes import hedge_fund


def _request(mode):
    return BacktestRequest(tickers=["AAPL"], graph_nodes=[{"id": "agent"}], graph_edges=[], start_date="2024-01-01", end_date="2024-01-31", execution_mode=mode)

class FakeHttpRequest:
    async def receive(self):
        return {"type": "http.disconnect"}

@pytest.mark.asyncio
async def test_backtest_docker_mode_dispatches_to_sandbox(monkeypatch):
    monkeypatch.setattr("app.backend.routes.hedge_fund.SandboxService.status", lambda self: SandboxStatusResponse(available=True, docker_installed=True, docker_running=True, image_available=True, image_name="sandbox:test", message="ok"))
    async def fake_sse(self, request_data, request=None):
        yield "event: start\ndata: {}\n\n"
    monkeypatch.setattr("app.backend.routes.hedge_fund.SandboxService.run_backtest_sse", fake_sse)

    response = await hedge_fund.backtest(_request(ExecutionMode.DOCKER_SANDBOX), FakeHttpRequest(), db=None)

    assert isinstance(response, StreamingResponse)

@pytest.mark.asyncio
async def test_backtest_docker_mode_unavailable_returns_503(monkeypatch):
    monkeypatch.setattr("app.backend.routes.hedge_fund.SandboxService.status", lambda self: SandboxStatusResponse(available=False, docker_installed=False, docker_running=False, image_available=False, image_name="sandbox:test", message="missing"))

    with pytest.raises(HTTPException) as exc:
        await hedge_fund.backtest(_request(ExecutionMode.DOCKER_SANDBOX), FakeHttpRequest(), db=None)

    assert exc.value.status_code == 503
