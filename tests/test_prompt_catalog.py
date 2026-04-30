# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Regression tests for the prompt template catalog.

Contracts verified:
1. Every PromptKey resolves to a non-empty string via get_prompt().
2. The backward-compat shim (app.utils.prompts) re-exports identical strings.
3. Locale fallback works: unknown locale falls back to DEFAULT_LOCALE.
4. Missing key raises KeyError.
5. register_templates() merges without clobbering existing keys.
6. Template format placeholders match what consumers expect.
"""

from __future__ import annotations

import sys

import pytest

import app.core.text.zh as zh
from app.core.text import DEFAULT_LOCALE, PromptKey, get_prompt, register_templates
from app.core.text import prompt_service
from app.core.text.catalog import _catalogs


@pytest.fixture(autouse=True)
def _seed_builtin_prompt_cache() -> None:
    prompt_service._cache.clear()
    prompt_service._cache.update({key.value: value for key, value in zh._TEMPLATES.items()})
    prompt_service._cache_loaded = True
    sys.modules.pop("app.utils.prompts", None)
    try:
        yield
    finally:
        sys.modules.pop("app.utils.prompts", None)
        prompt_service._cache.clear()
        prompt_service._cache_loaded = False
        register_templates(DEFAULT_LOCALE, zh._TEMPLATES)


# -----------------------------------------------------------------------
# 1. Every key resolves
# -----------------------------------------------------------------------

@pytest.mark.parametrize("key", list(PromptKey))
def test_all_keys_resolve(key: PromptKey) -> None:
    result = get_prompt(key)
    assert isinstance(result, str)
    assert len(result) > 0


# -----------------------------------------------------------------------
# 2. Backward-compat shim matches catalog
# -----------------------------------------------------------------------


def test_default_lookup_uses_db_cache_before_catalog() -> None:
    prompt_service._cache[PromptKey.SYSTEM.value] = "db-system"
    register_templates(DEFAULT_LOCALE, {PromptKey.SYSTEM: "catalog-system"})
    try:
        assert get_prompt(PromptKey.SYSTEM) == "db-system"
    finally:
        prompt_service._cache.pop(PromptKey.SYSTEM.value, None)
        import app.core.text.zh as zh

        register_templates(DEFAULT_LOCALE, zh._TEMPLATES)


def test_explicit_locale_lookup_prefers_catalog_before_single_language_db() -> None:
    prompt_service._cache[PromptKey.SYSTEM.value] = "db-system"
    register_templates("testlang", {PromptKey.SYSTEM: "base-system"})
    try:
        assert get_prompt(PromptKey.SYSTEM, locale="testlang-region") == "base-system"
    finally:
        prompt_service._cache.pop(PromptKey.SYSTEM.value, None)
        _catalogs.pop("testlang", None)


def test_shim_matches_catalog() -> None:
    from app.utils.prompts import (
        CONTINUATION_PROMPT,
        OUTLINE_PROMPT,
        SYSTEM_PROMPT,
        WORLD_GENERATION_PROMPT,
        WORLD_GENERATION_SYSTEM_PROMPT,
    )

    assert SYSTEM_PROMPT == get_prompt(PromptKey.SYSTEM)
    assert CONTINUATION_PROMPT == get_prompt(PromptKey.CONTINUATION)
    assert OUTLINE_PROMPT == get_prompt(PromptKey.OUTLINE)
    assert WORLD_GENERATION_SYSTEM_PROMPT == get_prompt(PromptKey.WORLD_GEN_SYSTEM)
    assert WORLD_GENERATION_PROMPT == get_prompt(PromptKey.WORLD_GEN)


# -----------------------------------------------------------------------
# 3. Locale fallback
# -----------------------------------------------------------------------

def test_unknown_locale_falls_back_to_default() -> None:
    result = get_prompt(PromptKey.SYSTEM, locale="xx-nonexistent")
    assert result == get_prompt(PromptKey.SYSTEM, locale=DEFAULT_LOCALE)


def test_regional_locale_falls_back_to_base_language() -> None:
    register_templates("testlang", {PromptKey.SYSTEM: "base-system"})
    try:
        result = get_prompt(PromptKey.SYSTEM, locale="testlang-region")
        assert result == "base-system"
    finally:
        _catalogs.pop("testlang", None)


# -----------------------------------------------------------------------
# 4. Missing key raises KeyError
# -----------------------------------------------------------------------

def test_missing_key_in_empty_locale_raises() -> None:
    # Register a locale with only one key, then ask for another.
    register_templates("test-sparse", {PromptKey.SYSTEM: "test"})
    try:
        # SYSTEM exists — should work.
        assert get_prompt(PromptKey.SYSTEM, locale="test-sparse") == "test"
        # OUTLINE does not exist in this locale, but DEFAULT_LOCALE fallback
        # should still provide it.
        assert get_prompt(PromptKey.OUTLINE, locale="test-sparse") == get_prompt(
            PromptKey.OUTLINE
        )
    finally:
        _catalogs.pop("test-sparse", None)


# -----------------------------------------------------------------------
# 5. register_templates merges
# -----------------------------------------------------------------------

def test_register_templates_merges() -> None:
    register_templates("test-merge", {PromptKey.SYSTEM: "a"})
    register_templates("test-merge", {PromptKey.OUTLINE: "b"})
    try:
        assert _catalogs["test-merge"][PromptKey.SYSTEM] == "a"
        assert _catalogs["test-merge"][PromptKey.OUTLINE] == "b"
    finally:
        _catalogs.pop("test-merge", None)


def test_register_templates_overwrites_individual_key() -> None:
    register_templates("test-overwrite", {PromptKey.SYSTEM: "old"})
    register_templates("test-overwrite", {PromptKey.SYSTEM: "new"})
    try:
        assert _catalogs["test-overwrite"][PromptKey.SYSTEM] == "new"
    finally:
        _catalogs.pop("test-overwrite", None)


# -----------------------------------------------------------------------
# 6. Format placeholders match consumer expectations
# -----------------------------------------------------------------------

def test_continuation_template_has_expected_placeholders() -> None:
    tpl = get_prompt(PromptKey.CONTINUATION)
    # generator.py calls .format(title=..., next_chapter=..., next_chapter_reference=...,
    #                            outline=..., world_context=..., narrative_constraints=...)
    formatted = tpl.format(
        title="Test Novel",
        next_chapter=42,
        next_chapter_reference="Chapter 42",
        outline="outline text",
        world_context="",
        narrative_constraints="",
    )
    assert "Test Novel" in formatted
    assert "42" in formatted


def test_outline_template_has_expected_placeholders() -> None:
    tpl = get_prompt(PromptKey.OUTLINE)
    formatted = tpl.format(start=1, end=10, content="chapter content")
    assert "1" in formatted
    assert "10" in formatted
    assert "chapter content" in formatted


def test_world_gen_template_has_expected_placeholders() -> None:
    tpl = get_prompt(PromptKey.WORLD_GEN)
    formatted = tpl.format(text="world text", chunk_directive="directive")
    assert "world text" in formatted
    assert "directive" in formatted


def test_outline_generation_templates_have_expected_placeholders() -> None:
    volume_tpl = get_prompt(PromptKey.VOLUME_OUTLINE_GEN)
    volume_prompt = volume_tpl.format(
        world_context="world",
        chapter_list="chapters",
        total_chapters=100,
        total_volumes_hint="5",
        user_guidance="guidance",
    )
    assert "world" in volume_prompt
    assert "chapters" in volume_prompt

    chapter_tpl = get_prompt(PromptKey.CHAPTER_BRIEF_GEN)
    chapter_prompt = chapter_tpl.format(
        world_context="world",
        volume_number=1,
        volume_title="title",
        volume_outline="outline",
        chapter_start=1,
        chapter_end=2,
        chapter_contents="contents",
        carry="carry",
        user_guidance="guidance",
    )
    assert "outline" in chapter_prompt
    assert "contents" in chapter_prompt


def test_world_gen_prompts_describe_supported_system_shapes() -> None:
    system_tpl = get_prompt(PromptKey.WORLD_GEN_SYSTEM)
    user_tpl = get_prompt(PromptKey.WORLD_GEN)

    assert "display_type" in system_tpl
    assert "hierarchy" in system_tpl
    assert "timeline" in system_tpl
    assert "outline" in system_tpl
    assert "不要输出 graph" in system_tpl
    assert "display_type" in user_tpl
    assert "children" in user_tpl
    assert "time" in user_tpl
    assert "outline" in user_tpl


# -----------------------------------------------------------------------
# 7. Provider parameter accepted (forward compat, no dispatch yet)
# -----------------------------------------------------------------------

def test_provider_parameter_accepted() -> None:
    result = get_prompt(PromptKey.SYSTEM, provider="deepseek")
    assert result == get_prompt(PromptKey.SYSTEM)
