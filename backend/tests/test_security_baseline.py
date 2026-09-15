"""Regression checks for public security controls and unauthenticated access."""
import os
import uuid

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not configured")
    return requests.Session()


def test_status_requires_authentication(api):
    response = api.get(f"{BASE_URL}/api/status")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_status_post_requires_authentication(api):
    response = api.post(f"{BASE_URL}/api/status", json={"client_name": "TEST_unauth"})
    assert response.status_code == 401


def test_api_security_headers_and_cors_are_explicit(api):
    response = api.get(f"{BASE_URL}/api/", headers={"Origin": "https://untrusted.example"})
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "default-src 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers.get("Access-Control-Allow-Origin") != "*"


def test_oversized_state_changing_request_is_rejected(api):
    response = api.post(
        f"{BASE_URL}/api/status",
        data="x" * (1_048_577),
        headers={"Content-Type": "application/json", "Content-Length": str(1_048_577)},
    )
    assert response.status_code == 413


def test_invalid_login_is_generic_and_throttled(api):
    payload = {"email": f"test-missing-{uuid.uuid4().hex}@example.com", "password": "not-a-real-password"}
    statuses = [api.post(f"{BASE_URL}/api/auth/login", json=payload).status_code for _ in range(6)]
    assert statuses[:5] == [401] * 5
    assert statuses[5] == 429