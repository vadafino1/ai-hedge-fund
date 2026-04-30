from fastapi.testclient import TestClient

from app.backend.main import app
from app.backend.models.schemas import SandboxStatusResponse


def test_sandbox_status_route(monkeypatch):
    expected = SandboxStatusResponse(
        available=True,
        docker_installed=True,
        docker_running=True,
        image_available=True,
        image_name="sandbox:test",
        message="Docker sandbox is available",
    )
    monkeypatch.setattr("app.backend.routes.sandbox.SandboxService.status", lambda self: expected)

    response = TestClient(app).get("/sandbox/status")

    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.json()["image_name"] == "sandbox:test"
