# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Prompt template catalog with locale/provider-aware lookup.

The catalog is a two-level registry: locale -> PromptKey -> template string.
Lookup falls back to DEFAULT_LOCALE when the requested locale has no entry.

Provider is accepted by get_prompt() but not yet dispatched — reserved for
provider-specific template variants (e.g. different formatting for different
LLM backends).
"""

from __future__ import annotations

from enum import Enum

from app.language import DEFAULT_LANGUAGE, get_language_fallback_chain

DEFAULT_LOCALE = DEFAULT_LANGUAGE

# ---------------------------------------------------------------------------
# Prompt keys — one per template slot
# ---------------------------------------------------------------------------


class PromptKey(str, Enum):
    SYSTEM = "system"
    CONTINUATION = "continuation"
    OUTLINE = "outline"
    WORLD_GEN_SYSTEM = "world_gen_system"
    WORLD_GEN = "world_gen"
    BOOTSTRAP_REFINEMENT = "bootstrap_refinement"
    VOLUME_OUTLINE_GEN = "volume_outline_gen"
    CHAPTER_BRIEF_GEN = "chapter_brief_gen"


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_catalogs: dict[str, dict[PromptKey, str]] = {}


def register_templates(locale: str, templates: dict[PromptKey, str]) -> None:
    """Merge *templates* into the catalog for *locale*.

    Safe to call multiple times for the same locale (e.g. when a new domain
    adds its own prompts).  Later calls overwrite individual keys, not the
    entire locale.
    """
    if locale not in _catalogs:
        _catalogs[locale] = {}
    _catalogs[locale].update(templates)


# ---------------------------------------------------------------------------
# Lookup
# ---------------------------------------------------------------------------


def get_prompt(
    key: PromptKey,
    *,
    locale: str | None = None,
    provider: str | None = None,
) -> str:
    """Return the template string for *key*.

    Lookup order:
    1. DB-backed cache (production path, warmed at startup).
    2. Legacy in-memory catalog (fallback for tests without a DB).

    *provider* is accepted for forward compatibility but does not yet
    influence selection.

    Raises ``KeyError`` if no template is found.
    """
    candidates = get_language_fallback_chain(locale, default=DEFAULT_LOCALE)

    # Path 1: Preserve explicit non-default locale catalogs until prompt storage
    # grows a locale column. Default-language lookups still use DB first so
    # runtime edits are visible to existing consumers that pass locale="zh".
    if locale is not None:
        for candidate in candidates:
            if candidate == DEFAULT_LOCALE:
                continue
            catalog = _catalogs.get(candidate)
            if catalog and key in catalog:
                return catalog[key]

    # Path 2: DB-backed cache for the default single-language runtime path.
    try:
        from app.core.text.prompt_service import get_cached_prompt

        return get_cached_prompt(key)
    except (KeyError, ImportError):
        pass

    # Path 3: Legacy in-memory catalog (tests / no-DB environments).
    for candidate in candidates:
        catalog = _catalogs.get(candidate)
        if catalog and key in catalog:
            return catalog[key]

    raise KeyError(
        f"No template for {key!r} (locale={locale or DEFAULT_LOCALE!r})"
    )
