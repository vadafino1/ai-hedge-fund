from fastapi import APIRouter

from app.backend.models.schemas import SandboxStatusResponse
from app.backend.services.sandbox_service import SandboxService
from app.backend.services.sandbox_settings import get_sandbox_settings

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


@router.get("/status", response_model=SandboxStatusResponse)
def get_sandbox_status():
    settings = get_sandbox_settings()
    return SandboxService(settings).status()
