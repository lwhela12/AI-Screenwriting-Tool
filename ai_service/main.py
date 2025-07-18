from typing import List, Optional, Union

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class AnalyzeRequest(BaseModel):
    """Request body for the /analyze endpoint."""

    script: str
    outline: Optional[Union[str, List[str]]] = None


class AnalyzeResponse(BaseModel):
    """Response returned by the /analyze endpoint."""

    word_count: int
    character_count: int
    unique_words: int
    suggestions: List[str]


class AutocompleteRequest(BaseModel):
    """Request body for the /autocomplete endpoint."""

    script: str
    current_text: str


class AutocompleteResponse(BaseModel):
    """Response returned by the /autocomplete endpoint."""

    completions: List[str]


@app.get("/status")
def read_status():
    """Simple health check used by the client application."""

    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_script(request: AnalyzeRequest) -> AnalyzeResponse:
    """Return basic statistics about the provided script.

    This placeholder implementation performs simple text processing and
    returns generic suggestions. It should be replaced with real AI logic
    in the future.
    """

    words = request.script.split()
    cleaned_words = [w.strip(".,!?;:\"'").lower() for w in words]
    word_count = len(words)
    character_count = len(request.script)
    unique_words = len(set(cleaned_words))
    suggestions = ["Consider increasing conflict in Act II."]

    return AnalyzeResponse(
        word_count=word_count,
        character_count=character_count,
        unique_words=unique_words,
        suggestions=suggestions,
    )


@app.post("/autocomplete", response_model=AutocompleteResponse)
def autocomplete(request: AutocompleteRequest) -> AutocompleteResponse:
    """Return placeholder autocompletion suggestions for the current text.

    The current implementation simply reverses the last three words of the
    provided text. This will later call an AI model for real suggestions.
    """

    words = request.current_text.split()
    last_three = words[-3:]
    reversed_words = " ".join(reversed(last_three))
    suggestions = [reversed_words]

    return AutocompleteResponse(completions=suggestions)
