import pytest

from app.backend.services.sandbox_settings import get_sandbox_settings


def test_sandbox_settings_defaults(monkeypatch):
    for key in [
        "AI_HEDGE_FUND_SANDBOX_IMAGE",
        "AI_HEDGE_FUND_SANDBOX_NETWORK",
        "AI_HEDGE_FUND_SANDBOX_TIMEOUT_SECONDS",
        "AI_HEDGE_FUND_SANDBOX_RETAIN_RUN_DIRS",
    ]:
        monkeypatch.delenv(key, raising=False)

    settings = get_sandbox_settings()

    assert settings.image == "ai-hedge-fund:latest"
    assert settings.network == "bridge"
    assert settings.timeout_seconds == 900
    assert settings.retain_run_dirs is False


def test_sandbox_settings_env_overrides(monkeypatch):
    monkeypatch.setenv("AI_HEDGE_FUND_SANDBOX_IMAGE", "custom:dev")
    monkeypatch.setenv("AI_HEDGE_FUND_SANDBOX_NETWORK", "none")
    monkeypatch.setenv("AI_HEDGE_FUND_SANDBOX_TIMEOUT_SECONDS", "42")
    monkeypatch.setenv("AI_HEDGE_FUND_SANDBOX_RETAIN_RUN_DIRS", "true")

    settings = get_sandbox_settings()

    assert settings.image == "custom:dev"
    assert settings.network == "none"
    assert settings.timeout_seconds == 42
    assert settings.retain_run_dirs is True


def test_sandbox_settings_invalid_timeout_falls_back(monkeypatch):
    monkeypatch.setenv("AI_HEDGE_FUND_SANDBOX_TIMEOUT_SECONDS", "not-an-int")

    settings = get_sandbox_settings()

    assert settings.timeout_seconds == 900
