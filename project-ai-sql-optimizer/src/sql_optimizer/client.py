"""Thin wrapper around the Anthropic SDK for SQL optimization suggestions.

Reads ``ANTHROPIC_API_KEY`` from the environment. Defaults to the latest Claude
Sonnet model. Calls go through ``messages.create`` with a system prompt loaded
from ``prompts/optimizer_prompt.md`` and a user payload that includes the SQL
plus any heuristic findings.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

from .analyzer import AnalysisResult

DEFAULT_MODEL = "claude-sonnet-4-6"
MAX_RETRIES = 3
INITIAL_RETRY_BACKOFF = 1.0


@dataclass
class Suggestion:
    rewrite: str
    reasoning: str
    confidence: str


def _load_prompt() -> str:
    try:
        with resources.files("sql_optimizer.prompts").joinpath(
            "optimizer_prompt.md"
        ).open("r", encoding="utf-8") as f:
            return f.read()
    except (FileNotFoundError, ModuleNotFoundError):
        # Fallback: read from repo path.
        return Path(__file__).parent.joinpath("prompts/optimizer_prompt.md").read_text("utf-8")


def _build_user_message(analysis: AnalysisResult) -> str:
    parts = [f"## Dialect\n{analysis.dialect}", "## SQL", "```sql", analysis.sql, "```"]
    if analysis.findings:
        parts.append("## Heuristic findings")
        for f in analysis.findings:
            parts.append(f"- ({f.severity.value}) {f.rule}: {f.message}")
    parts.append(
        "Return your answer as a JSON object with keys `rewrite`, `reasoning`, `confidence`."
    )
    return "\n".join(parts)


class AnthropicClient:
    """Stateless wrapper around ``anthropic.Anthropic.messages.create``."""

    def __init__(self, model: str = DEFAULT_MODEL, api_key: str | None = None) -> None:
        self.model = model
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from anthropic import Anthropic
            except ImportError as e:  # pragma: no cover
                raise RuntimeError(
                    "anthropic SDK not installed. Run `make install`."
                ) from e
            if not self.api_key:
                raise RuntimeError(
                    "ANTHROPIC_API_KEY not set. Use --dry-run for offline mode."
                )
            self._client = Anthropic(api_key=self.api_key)
        return self._client

    def suggest(self, analysis: AnalysisResult) -> Suggestion:
        from anthropic import APIStatusError, RateLimitError

        client = self._get_client()
        system = _load_prompt()
        user = _build_user_message(analysis)

        backoff = INITIAL_RETRY_BACKOFF
        last_err: Exception | None = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = client.messages.create(
                    model=self.model,
                    max_tokens=2048,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                )
                text = "".join(b.text for b in resp.content if hasattr(b, "text"))
                return _parse_suggestion(text)
            except (RateLimitError, APIStatusError) as e:  # pragma: no cover
                last_err = e
                if attempt == MAX_RETRIES - 1:
                    break
                time.sleep(backoff)
                backoff *= 2

        raise RuntimeError(f"Anthropic call failed after {MAX_RETRIES} attempts: {last_err}")


def _parse_suggestion(text: str) -> Suggestion:
    """Tolerant JSON parse of the model response.

    The prompt asks for a JSON object, but the model occasionally wraps it in a
    markdown code block. We strip those and parse with ``json``.
    """
    import json
    import re

    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fence:
        cleaned = fence.group(1)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return Suggestion(rewrite="", reasoning=text, confidence="low")

    return Suggestion(
        rewrite=str(data.get("rewrite", "")),
        reasoning=str(data.get("reasoning", "")),
        confidence=str(data.get("confidence", "medium")),
    )
