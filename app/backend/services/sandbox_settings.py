from dataclasses import dataclass
import os


@dataclass(frozen=True)
class SandboxSettings:
    image: str
    network: str
    timeout_seconds: int
    retain_run_dirs: bool


def _parse_timeout(value: str) -> int:
    try:
        timeout = int(value)
    except (TypeError, ValueError):
        return 900
    return timeout if timeout > 0 else 900


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_sandbox_settings() -> SandboxSettings:
    return SandboxSettings(
        image=os.getenv("AI_HEDGE_FUND_SANDBOX_IMAGE", "ai-hedge-fund:latest"),
        network=os.getenv("AI_HEDGE_FUND_SANDBOX_NETWORK", "bridge"),
        timeout_seconds=_parse_timeout(os.getenv("AI_HEDGE_FUND_SANDBOX_TIMEOUT_SECONDS", "900")),
        retain_run_dirs=_parse_bool(os.getenv("AI_HEDGE_FUND_SANDBOX_RETAIN_RUN_DIRS", "false")),
    )
