import json

import pytest

from app.core.llm_json import normalize_llm_json_payload, parse_llm_json_response


def test_normalize_preserves_raw_json_object():
    raw = '{"title": "Scene", "score": 9}'

    assert normalize_llm_json_payload(raw) == raw
    assert parse_llm_json_response(raw) == {"title": "Scene", "score": 9}


def test_normalize_extracts_json_fence():
    raw = '```json\n{"title": "Scene", "score": 9}\n```'

    assert normalize_llm_json_payload(raw) == '{"title": "Scene", "score": 9}'


def test_normalize_extracts_json_fence_with_space_before_language():
    raw = '``` json\n{"title": "Scene", "score": 9}\n```'

    assert normalize_llm_json_payload(raw) == '{"title": "Scene", "score": 9}'


def test_normalize_extracts_bare_markdown_fence():
    raw = '```\n{"title": "Scene", "score": 9}\n```'

    assert normalize_llm_json_payload(raw) == '{"title": "Scene", "score": 9}'


def test_normalize_skips_invalid_fence_and_uses_later_valid_fence():
    raw = """First attempt:
```json
{"title": "Broken",
```

Final answer:
```json
{"title": "Scene", "score": 9}
```"""

    assert normalize_llm_json_payload(raw) == '{"title": "Scene", "score": 9}'


def test_normalize_extracts_embedded_object_from_surrounding_text():
    raw = 'Here is the answer: {"title": "Scene", "score": 9}. Hope this helps.'

    assert normalize_llm_json_payload(raw) == '{"title": "Scene", "score": 9}'


def test_normalize_extracts_embedded_array_from_surrounding_text():
    raw = "Items: [1, 2, 3]."

    assert normalize_llm_json_payload(raw) == "[1, 2, 3]"


def test_normalize_handles_nested_json_object():
    raw = 'Result: {"outer": {"inner": {"title": "Scene"}}, "score": 9}'

    assert parse_llm_json_response(raw) == {
        "outer": {"inner": {"title": "Scene"}},
        "score": 9,
    }


def test_normalize_handles_code_fence_delimiter_inside_json_string():
    payload = {"title": "Scene", "score": 9, "markdown": "```json\n{}\n```"}
    raw = f"```json\n{json.dumps(payload)}\n```"

    assert parse_llm_json_response(raw) == payload


def test_normalize_falls_back_to_embedded_json_for_malformed_opening_fence():
    raw = '```json\n{"title": "Scene", "score": 9}'

    assert normalize_llm_json_payload(raw) == '{"title": "Scene", "score": 9}'


def test_normalize_does_not_promote_nested_object_from_malformed_outer_json():
    raw = 'Partial response: {"data": {"title": "Scene", "score": 9},'

    assert normalize_llm_json_payload(raw) == raw.strip()
    with pytest.raises(json.JSONDecodeError):
        parse_llm_json_response(raw)


def test_normalize_does_not_promote_nested_array_from_malformed_outer_json():
    raw = 'Partial response: {"data": [{"title": "Scene", "score": 9}],'

    assert normalize_llm_json_payload(raw) == raw.strip()
    with pytest.raises(json.JSONDecodeError):
        parse_llm_json_response(raw)


def test_normalize_empty_string_returns_empty_string():
    assert normalize_llm_json_payload("") == ""
    assert normalize_llm_json_payload("   ") == ""


def test_parse_empty_string_raises_json_decode_error():
    with pytest.raises(json.JSONDecodeError):
        parse_llm_json_response("")


def test_parse_malformed_json_raises_json_decode_error():
    with pytest.raises(json.JSONDecodeError):
        parse_llm_json_response("not-json")


def test_parse_valid_scalar_is_left_to_caller_validation():
    assert parse_llm_json_response("true") is True


def test_normalize_ignores_non_json_code_fence_before_embedded_answer():
    raw = """Example:
```python
{"title": "Wrong", "score": 0}
```

Answer: {"title": "Scene", "score": 9}
"""

    assert normalize_llm_json_payload(raw) == '{"title": "Scene", "score": 9}'
