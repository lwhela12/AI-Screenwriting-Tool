import sys, os; sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from fastapi.testclient import TestClient

from ai_service.main import app

client = TestClient(app)


def test_status():
    response = client.get("/status")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze():
    payload = {"script": "Hello world"}
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["word_count"] == 2
    assert data["character_count"] == len("Hello world")
    assert data["unique_words"] == 2
    assert isinstance(data["suggestions"], list)


def test_autocomplete():
    payload = {"script": "", "current_text": "hello amazing world"}
    response = client.post("/autocomplete", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "completions" in data
    assert isinstance(data["completions"], list)
    assert len(data["completions"]) > 0
