"""Smoke tests for the streaming module.

These tests do not require PySpark to be installed; they only verify that the
configuration object behaves and that the schema-builder can be imported behind
a guard when pyspark is absent.
"""

from __future__ import annotations

import importlib

import pytest

from streaming.consumer import StreamConfig


def test_stream_config_defaults_are_reasonable():
    cfg = StreamConfig()
    assert cfg.topic == "tx-events"
    assert "checkpoints" in cfg.checkpoint_path
    assert cfg.max_offsets_per_trigger > 0


def test_stream_config_overrides_via_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("KAFKA_TOPIC", "alt-topic")
    monkeypatch.setenv("MAX_OFFSETS_PER_TRIGGER", "1")
    importlib.reload(importlib.import_module("streaming.consumer"))
    from streaming.consumer import StreamConfig as Reloaded

    cfg = Reloaded()
    assert cfg.topic == "alt-topic"
    assert cfg.max_offsets_per_trigger == 1


def test_event_schema_importable_only_with_pyspark():
    pyspark = pytest.importorskip("pyspark")
    assert pyspark is not None
    from streaming.consumer import event_schema

    schema = event_schema()
    field_names = {f.name for f in schema.fields}
    assert {"event_id", "account_id", "amount", "ts"} <= field_names
