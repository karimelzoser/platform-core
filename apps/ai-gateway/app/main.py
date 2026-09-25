"""AI gateway: model routing never executes arbitrary SQL, HTTP, or shell commands."""

from enum import Enum

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Platform AI Gateway", version="0.1.0")

class Risk(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class OperatorMode(str, Enum):
    OFF = "OFF"
    COPILOT = "COPILOT"
    APPROVAL = "APPROVAL"
    AUTONOMOUS = "AUTONOMOUS"

class RouteRequest(BaseModel):
    tenant_id: str
    operator: str
    mode: OperatorMode
    risk: Risk
    language: str = Field(pattern="^(en|ar)$")

class RouteDecision(BaseModel):
    tier: int
    requires_human: bool
    reason: str

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-gateway"}

@app.post("/v1/routes", response_model=RouteDecision)
async def route(request: RouteRequest) -> RouteDecision:
    if request.mode is OperatorMode.OFF:
        raise HTTPException(status_code=409, detail="operator_is_off")
    if request.risk in {Risk.HIGH, Risk.CRITICAL}:
        return RouteDecision(tier=4, requires_human=True, reason="high_risk_requires_approval")
    return RouteDecision(tier=2, requires_human=False, reason="economical_general_model")
