from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_high_risk_routes_to_human_escalation() -> None:
    response = client.post("/v1/routes", json={"tenant_id": "tenant-a", "operator": "returns", "mode": "AUTONOMOUS", "risk": "HIGH", "language": "ar"})
    assert response.status_code == 200
    assert response.json()["requires_human"] is True
