"""Helpers for extracting JSON payloads from LLM responses."""

from __future__ import annotations

import json
import re
from typing import Any

_CODE_FENCE_RE = re.compile(
    r"```[ \t]*(?:json)?[ \t]*(?:\r?\n)?(.*?)\s*```",
    re.IGNORECASE | re.DOTALL,
)


def normalize_llm_json_payload(raw: str) -> str:
    """Extract a JSON payload from common LLM response formats.

    Supports raw JSON, Markdown-fenced JSON, and JSON embedded in surrounding
    text. The returned string is still validated by the caller.
    """
    text = (raw or "").strip()
    if not text:
        return text

    if _is_valid_json(text):
        return text

    fenced = _extract_fenced_json(text)
    if fenced is not None:
        return fenced

    embedded = _extract_embedded_json(text)
    if embedded is not None:
        return embedded

    return text


def parse_llm_json_response(raw: str) -> Any:
    """Parse JSON from a common LLM response wrapper."""
    return json.loads(normalize_llm_json_payload(raw))


def _extract_fenced_json(text: str) -> str | None:
    for match in _CODE_FENCE_RE.finditer(text):
        candidate = match.group(1).strip()
        if _is_valid_json(candidate):
            return candidate
    return None


def _extract_embedded_json(text: str) -> str | None:
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        if _is_inside_unclosed_json_container(text[:index]):
            continue
        candidate = text[index:]
        try:
            value, end = decoder.raw_decode(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, (dict, list)):
            return candidate[:end].strip()
    return None


def _is_inside_unclosed_json_container(prefix: str) -> bool:
    stack: list[str] = []
    in_string = False
    escaped = False
    for char in prefix:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char in "{[":
            stack.append(char)
        elif char in "}]":
            if not stack:
                continue
            opener = stack[-1]
            if (opener, char) in (("{", "}"), ("[", "]")):
                stack.pop()
    return bool(stack) or in_string


def _is_valid_json(text: str) -> bool:
    try:
        json.loads(text)
    except json.JSONDecodeError:
        return False
    return True
