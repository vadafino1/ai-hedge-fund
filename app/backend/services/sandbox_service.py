from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncIterator, Literal

from app.backend.models.events import CompleteEvent, ErrorEvent, ProgressUpdateEvent, StartEvent
from app.backend.models.schemas import BacktestRequest, HedgeFundRequest, SandboxStatusResponse
from app.backend.services.sandbox_settings import SandboxSettings

SandboxKind = Literal["hedge_fund", "backtest"]
SENSITIVE_KEYS = ("api_key", "apikey", "token", "secret", "password", "key_value")


@dataclass(frozen=True)
class SandboxRun:
    run_id: str
    container_name: str
    run_dir: Path
    input_dir: Path
    output_dir: Path
    request_file: Path


def redact_secrets(value):
    if isinstance(value, dict):
        return {k: ("<redacted>" if any(s in k.lower() for s in SENSITIVE_KEYS) else redact_secrets(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact_secrets(item) for item in value]
    if isinstance(value, str):
        redacted = value
        for marker in ("dummy-secret-value",):
            redacted = redacted.replace(marker, "<redacted>")
        return redacted
    return value


def parse_ndjson_event(line: str):
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return ErrorEvent(message="Malformed sandbox event received")

    event = payload.get("event") or payload.get("type")
    data = redact_secrets(payload.get("data", {}))
    if event == "start":
        return StartEvent(**data)
    if event == "progress":
        return ProgressUpdateEvent(**data)
    if event == "complete":
        return CompleteEvent(data=data.get("data", data))
    if event == "error":
        return ErrorEvent(message=data.get("message", "Sandbox execution failed"))
    return ErrorEvent(message=f"Unknown sandbox event type: {event}")


class SandboxService:
    def __init__(self, settings: SandboxSettings):
        self.settings = settings

    def docker_installed(self) -> bool:
        return shutil.which("docker") is not None

    def docker_running(self) -> bool:
        if not self.docker_installed():
            return False
        try:
            result = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            return False
        return result.returncode == 0

    def image_available(self) -> bool:
        if not self.docker_running():
            return False
        try:
            result = subprocess.run(["docker", "image", "inspect", self.settings.image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            return False
        return result.returncode == 0

    def status(self) -> SandboxStatusResponse:
        installed = self.docker_installed()
        if not installed:
            return SandboxStatusResponse(available=False, docker_installed=False, docker_running=False, image_available=False, image_name=self.settings.image, message="Docker CLI is not installed or not on PATH")
        running = self.docker_running()
        if not running:
            return SandboxStatusResponse(available=False, docker_installed=True, docker_running=False, image_available=False, image_name=self.settings.image, message="Docker daemon is not running")
        image = self.image_available()
        if not image:
            return SandboxStatusResponse(available=False, docker_installed=True, docker_running=True, image_available=False, image_name=self.settings.image, message=f"Docker image {self.settings.image} is not available; build it with docker build -f docker/Dockerfile -t {self.settings.image} .")
        return SandboxStatusResponse(available=True, docker_installed=True, docker_running=True, image_available=True, image_name=self.settings.image, message="Docker sandbox is available")

    def prepare_run(self, kind: SandboxKind, request_data: HedgeFundRequest | BacktestRequest) -> SandboxRun:
        run_id = uuid.uuid4().hex
        run_dir = Path(tempfile.mkdtemp(prefix=f"ai-hedge-fund-sandbox-{run_id}-"))
        os.chmod(run_dir, 0o700)
        input_dir = run_dir / "input"
        output_dir = run_dir / "output"
        input_dir.mkdir(mode=0o700)
        output_dir.mkdir(mode=0o700)
        request_file = input_dir / "request.json"
        request_payload = redact_secrets(request_data.model_dump(mode="json"))
        # Keep real API keys in the mounted request; redaction is for diagnostics only, not for execution.
        request_payload = request_data.model_dump(mode="json")
        request_file.write_text(json.dumps(request_payload), encoding="utf-8")
        os.chmod(request_file, 0o600)
        return SandboxRun(run_id=run_id, container_name=f"ai-hedge-fund-sandbox-{run_id}", run_dir=run_dir, input_dir=input_dir, output_dir=output_dir, request_file=request_file)

    def build_docker_argv(self, run: SandboxRun, kind: SandboxKind) -> list[str]:
        argv = [
            "docker", "run", "--rm",
            "--name", run.container_name,
            "--network", self.settings.network,
            "--cpus", "2",
            "--memory", "4g",
            "--pids-limit", "512",
            "--read-only",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m",
            "--security-opt", "no-new-privileges",
            "--cap-drop", "ALL",
            "-e", "PYTHONPATH=/app",
            "-v", f"{run.input_dir}:/sandbox/input:ro",
        ]
        env_file = Path.cwd() / ".env"
        if env_file.exists():
            argv += ["-v", f"{env_file}:/sandbox/.env:ro"]
        if self.settings.retain_run_dirs:
            argv += ["-v", f"{run.output_dir}:/sandbox/output:rw"]
        argv += [
            self.settings.image,
            "python", "-m", "app.backend.sandbox.runner",
            "--kind", kind,
            "--request", "/sandbox/input/request.json",
        ]
        if self.settings.retain_run_dirs:
            argv += ["--output", "/sandbox/output/events.ndjson"]
        return argv

    async def force_remove_container(self, container_name: str) -> None:
        try:
            process = await asyncio.create_subprocess_exec("docker", "rm", "-f", container_name, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await process.wait()
        except Exception:
            pass

    def cleanup_run(self, run: SandboxRun) -> None:
        if not self.settings.retain_run_dirs:
            shutil.rmtree(run.run_dir, ignore_errors=True)

    async def run_stream(self, kind: SandboxKind, request_data: HedgeFundRequest | BacktestRequest) -> AsyncIterator[str]:
        run = self.prepare_run(kind, request_data)
        process = None
        try:
            argv = self.build_docker_argv(run, kind)
            process = await asyncio.create_subprocess_exec(*argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                while True:
                    line = await asyncio.wait_for(process.stdout.readline(), timeout=self.settings.timeout_seconds)
                    if not line:
                        break
                    yield parse_ndjson_event(line.decode("utf-8", errors="replace").strip()).to_sse()
                returncode = await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                if process:
                    process.kill()
                await self.force_remove_container(run.container_name)
                yield ErrorEvent(message="Docker sandbox execution timed out").to_sse()
                return
            if returncode != 0:
                stderr = b""
                if process.stderr:
                    stderr = await process.stderr.read()
                diagnostic = redact_secrets(stderr.decode("utf-8", errors="replace"))[:500]
                yield ErrorEvent(message=f"Docker sandbox execution failed: {diagnostic}" if diagnostic else "Docker sandbox execution failed").to_sse()
        except asyncio.CancelledError:
            if process and process.returncode is None:
                process.kill()
            await self.force_remove_container(run.container_name)
            raise
        except Exception as exc:
            yield ErrorEvent(message=f"Docker sandbox execution failed: {redact_secrets(str(exc))}").to_sse()
        finally:
            await self.force_remove_container(run.container_name)
            self.cleanup_run(run)

    async def run_hedge_fund_sse(self, request_data: HedgeFundRequest, request=None) -> AsyncIterator[str]:
        async for event in self.run_stream("hedge_fund", request_data):
            if request is not None and await request.is_disconnected():
                break
            yield event

    async def run_backtest_sse(self, request_data: BacktestRequest, request=None) -> AsyncIterator[str]:
        async for event in self.run_stream("backtest", request_data):
            if request is not None and await request.is_disconnected():
                break
            yield event
