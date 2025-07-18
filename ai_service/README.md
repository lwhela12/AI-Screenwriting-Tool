# AI Service

This directory contains the Python-based AI microservice built with FastAPI.
It exposes several endpoints used by the main application. The current
implementation uses simple placeholder logic that will later be replaced with
real AI models.

## Running

Install the dependencies and start the service with Uvicorn:

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

## Endpoints

- `GET /status` – Health check returning `{"status": "ok"}`.
- `POST /analyze` – Accepts a JSON body with a `script` field and optional
  `outline`. Returns basic statistics about the script and placeholder
  suggestions.
- `POST /autocomplete` – Accepts `script` and `current_text`. Returns a list of
  simple autocompletion strings.

These endpoints currently perform minimal text processing and should be replaced
with real AI logic in the future.
