from subprocess import CompletedProcess

from app.backend.models.schemas import SandboxStatusResponse
from app.backend.services.sandbox_service import SandboxService
from app.backend.services.sandbox_settings import SandboxSettings


def _service():
    return SandboxService(SandboxSettings(image="sandbox:test", network="bridge", timeout_seconds=5, retain_run_dirs=False))


def test_status_when_docker_missing(monkeypatch):
    monkeypatch.setattr("app.backend.services.sandbox_service.shutil.which", lambda _: None)

    status = _service().status()

    assert status == SandboxStatusResponse(
        available=False,
        docker_installed=False,
        docker_running=False,
        image_available=False,
        image_name="sandbox:test",
        message="Docker CLI is not installed or not on PATH",
    )


def test_status_when_daemon_down(monkeypatch):
    monkeypatch.setattr("app.backend.services.sandbox_service.shutil.which", lambda _: "/usr/bin/docker")
    monkeypatch.setattr("app.backend.services.sandbox_service.subprocess.run", lambda *a, **k: CompletedProcess(a, 1))

    status = _service().status()

    assert status.available is False
    assert status.docker_installed is True
    assert status.docker_running is False
    assert "daemon" in status.message.lower()


def test_status_when_image_missing(monkeypatch):
    calls = []
    monkeypatch.setattr("app.backend.services.sandbox_service.shutil.which", lambda _: "/usr/bin/docker")
    def fake_run(argv, **kwargs):
        calls.append(argv)
        return CompletedProcess(argv, 0 if argv == ["docker", "info"] else 1)
    monkeypatch.setattr("app.backend.services.sandbox_service.subprocess.run", fake_run)

    status = _service().status()

    assert status.available is False
    assert status.docker_running is True
    assert status.image_available is False
    assert ["docker", "image", "inspect", "sandbox:test"] in calls


def test_status_available(monkeypatch):
    monkeypatch.setattr("app.backend.services.sandbox_service.shutil.which", lambda _: "/usr/bin/docker")
    monkeypatch.setattr("app.backend.services.sandbox_service.subprocess.run", lambda argv, **kwargs: CompletedProcess(argv, 0))

    status = _service().status()

    assert status.available is True
    assert status.message == "Docker sandbox is available"
