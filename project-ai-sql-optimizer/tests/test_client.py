"""Tests for the Anthropic client wrapper - mocks the SDK call."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from sql_optimizer.analyzer import analyze
from sql_optimizer.client import AnthropicClient, _parse_suggestion


def _resp(text: str):
    return SimpleNamespace(content=[SimpleNamespace(text=text, type="text")])


def test_parse_suggestion_extracts_json_object():
    text = '{"rewrite": "SELECT 1", "reasoning": "ok", "confidence": "high"}'
    s = _parse_suggestion(text)
    assert s.rewrite == "SELECT 1"
    assert s.confidence == "high"


def test_parse_suggestion_handles_markdown_fence():
    text = '```json\n{"rewrite": "SELECT 1", "reasoning": "ok", "confidence": "medium"}\n```'
    s = _parse_suggestion(text)
    assert s.rewrite == "SELECT 1"
    assert s.confidence == "medium"


def test_parse_suggestion_falls_back_to_low_confidence():
    s = _parse_suggestion("not json at all")
    assert s.confidence == "low"
    assert "not json" in s.reasoning


def test_client_requires_api_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = AnthropicClient(api_key=None)
    analysis = analyze("SELECT 1", dialect="spark")
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        client.suggest(analysis)


@patch("sql_optimizer.client.AnthropicClient._get_client")
def test_client_suggest_returns_parsed(mock_get_client):
    inner = MagicMock()
    inner.messages.create.return_value = _resp(
        '{"rewrite": "SELECT id FROM t", "reasoning": "narrow scan", "confidence": "high"}'
    )
    mock_get_client.return_value = inner

    client = AnthropicClient(api_key="sk-test")
    analysis = analyze("SELECT * FROM t", dialect="spark")
    suggestion = client.suggest(analysis)

    inner.messages.create.assert_called_once()
    assert suggestion.rewrite == "SELECT id FROM t"
    assert suggestion.confidence == "high"
