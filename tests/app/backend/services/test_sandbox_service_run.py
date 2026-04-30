import asyncio
import json
import os

import pytest

from app.backend.models.schemas import HedgeFundRequest
from app.backend.services.sandbox_service import SandboxService, parse_ndjson_event
from app.backend.services.sandbox_settings import SandboxSettings


def _service(retain=False):
    return SandboxService(SandboxSettings(image="sandbox:test", network="bridge", timeout_seconds=5, retain_run_dirs=retain))


def _request():
    return HedgeFundRequest(tickers=["AAPL"], graph_nodes=[{"id": "agent"}], graph_edges=[])


def test_parse_ndjson_event_to_sse():
    event = parse_ndjson_event('{"event":"progress","data":{"agent":"system","status":"ok"}}')

    assert event.to_sse().startswith("event: progress")
    assert '"agent":"system"' in event.to_sse()


def test_parse_malformed_ndjson_to_error_event():
    event = parse_ndjson_event('{not-json')

    assert event.type == "error"
    assert "Malformed sandbox event" in event.message


def test_prepare_run_files_have_restrictive_permissions():
    service = _service(retain=True)
    run = service.prepare_run("hedge_fund", _request())

    try:
        assert oct(run.run_dir.stat().st_mode & 0o777) == "0o700"
        assert oct(run.request_file.stat().st_mode & 0o777) == "0o600"
    finally:
        service.cleanup_run(run)


def test_build_docker_argv_uses_list_and_security_flags(tmp_path):
    service = _service(retain=True)
    run = service.prepare_run("hedge_fund", _request())

    try:
        argv = service.build_docker_argv(run, "hedge_fund")
    finally:
        service.cleanup_run(run)

    assert argv[:2] == ["docker", "run"]
    assert "--env-file" not in argv
    assert "--cap-drop" in argv
    assert "ALL" in argv
    assert "python" in argv
    assert "app.backend.sandbox.runner" in argv

@pytest.mark.asyncio
async def test_run_stream_reads_stdout_and_cleans_up(monkeypatch):
    service = _service(retain=False)
    removed = []

    class FakeStream:
        def __init__(self, lines):
            self.lines = [line.encode() for line in lines]
        async def readline(self):
            if self.lines:
                return self.lines.pop(0)
            return b""

    class FakeProcess:
        def __init__(self):
            self.stdout = FakeStream(['{"event":"start","data":{}}\n', '{"event":"complete","data":{"data":{"ok":true}}}\n'])
            self.stderr = FakeStream([])
            self.returncode = 0
        async def wait(self):
            return 0
        def kill(self):
            pass

    async def fake_exec(*argv, **kwargs):
        return FakeProcess()

    async def fake_cleanup(name):
        removed.append(name)

    monkeypatch.setattr("app.backend.services.sandbox_service.asyncio.create_subprocess_exec", fake_exec)
    monkeypatch.setattr(service, "force_remove_container", fake_cleanup)

    events = [event async for event in service.run_stream("hedge_fund", _request())]

    assert events[0].startswith("event: start")
    assert events[-1].startswith("event: complete")
    assert removed
