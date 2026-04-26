"""Database-backed prompt template service with in-memory cache.

Replaces the hardcoded _catalogs dict for PromptKey lookups while
keeping the original registration mechanism as fallback for tests.
"""

from __future__ import annotations

import logging
import string
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.text.catalog import PromptKey

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------

_cache: dict[str, str] = {}
_cache_loaded: bool = False


# ---------------------------------------------------------------------------
# Placeholder validation
# ---------------------------------------------------------------------------

def _extract_placeholders(template: str) -> set[str]:
    """Extract all ``{var}`` placeholder names from *template*."""
    return {
        name
        for _, name, _, _ in string.Formatter().parse(template)
        if name is not None
    }


def _required_placeholders_for(key: str) -> set[str]:
    """Return the immutable placeholder contract for a PromptKey template."""
    from app.core.text.zh import _TEMPLATES

    try:
        prompt_key = PromptKey(key)
    except ValueError as exc:
        raise ValueError(f"Prompt template '{key}' not found") from exc

    template = _TEMPLATES.get(prompt_key)
    if template is None:
        raise ValueError(f"Prompt template '{key}' not found")
    return _extract_placeholders(template)


def _validate_placeholder_contract(key: str, new_template: str) -> None:
    required_vars = _required_placeholders_for(key)
    new_vars = _extract_placeholders(new_template)
    missing = required_vars - new_vars
    if missing:
        raise ValueError(f"Template missing required placeholders: {sorted(missing)}")


# ---------------------------------------------------------------------------
# Cache operations
# ---------------------------------------------------------------------------

def refresh_cache(db: Session) -> None:
    """Reload the entire cache from the ``prompt_templates`` table."""
    global _cache, _cache_loaded
    from app.models import PromptTemplate
    rows = db.execute(select(PromptTemplate.key, PromptTemplate.template)).all()
    _cache = {row.key: row.template for row in rows}
    _cache_loaded = True


def get_cached_prompt(key: PromptKey) -> str:
    """Return template for *key* from cache (or DB on miss).

    Raises ``KeyError`` when no row exists — callers should fall back
    to the legacy in-memory catalog.
    """
    if key.value in _cache:
        return _cache[key.value]
    # Lazy load from DB
    from app.database import SessionLocal
    from app.models import PromptTemplate
    db = SessionLocal()
    try:
        row = db.execute(
            select(PromptTemplate.template).where(PromptTemplate.key == key.value)
        ).scalar_one_or_none()
        if row is not None:
            _cache[key.value] = row
            return row
    finally:
        db.close()
    raise KeyError(key.value)


# ---------------------------------------------------------------------------
# Seed / bootstrap
# ---------------------------------------------------------------------------

def seed_defaults(db: Session) -> None:
    """Insert default templates (from zh.py) for keys not yet in DB."""
    from app.core.text.zh import _TEMPLATES
    from app.models import PromptTemplate

    existing = {
        row.key
        for row in db.execute(select(PromptTemplate.key)).scalars().all()
    }

    new_count = 0
    for pk in PromptKey:
        if pk.value in existing:
            continue
        tmpl = _TEMPLATES.get(pk)
        if tmpl is None:
            continue
        db.add(PromptTemplate(
            key=pk.value,
            template=tmpl,
            description=f"Built-in prompt: {pk.value}",
            built_in=True,
            category="generation",
            version=1,
        ))
        new_count += 1

    if new_count:
        db.commit()
        logger.info("Prompt templates seeded: %d new entries.", new_count)


def seed_and_warm_cache() -> None:
    """Startup entrypoint: seed defaults then warm the in-memory cache."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        seed_defaults(db)
        refresh_cache(db)
    finally:
        db.close()
    logger.info("Prompt template cache warmed (%d entries).", len(_cache))


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------

def list_templates(db: Session) -> Sequence["PromptTemplate"]:
    from app.models import PromptTemplate
    return db.execute(select(PromptTemplate).order_by(PromptTemplate.key)).scalars().all()


def get_template(db: Session, key: str) -> "PromptTemplate | None":
    from app.models import PromptTemplate
    return db.execute(
        select(PromptTemplate).where(PromptTemplate.key == key)
    ).scalar_one_or_none()


def update_prompt(
    db: Session,
    key: str,
    new_template: str,
    *,
    operator: str = "user",
    reason: str | None = None,
) -> "PromptTemplate":
    """Update a prompt template with placeholder validation and version snapshot."""
    from app.models import PromptTemplate, PromptVersion

    row = db.execute(
        select(PromptTemplate).where(PromptTemplate.key == key)
    ).scalar_one_or_none()
    if row is None:
        raise ValueError(f"Prompt template '{key}' not found")

    _validate_placeholder_contract(key, new_template)

    # Snapshot current version before overwriting
    db.add(PromptVersion(
        prompt_template_id=row.id,
        template=row.template,
        version=row.version,
        operator=operator,
        reason=reason,
    ))

    row.version += 1
    row.template = new_template
    db.commit()
    db.refresh(row)

    refresh_cache(db)
    return row


def rollback_prompt(
    db: Session,
    key: str,
    target_version: int,
    *,
    operator: str = "user",
    reason: str | None = None,
) -> "PromptTemplate":
    """Restore a template to a specific historical version."""
    from app.models import PromptVersion

    tmpl = get_template(db, key)
    if tmpl is None:
        raise ValueError(f"Prompt template '{key}' not found")

    ver = db.execute(
        select(PromptVersion).where(
            PromptVersion.prompt_template_id == tmpl.id,
            PromptVersion.version == target_version,
        )
    ).scalar_one_or_none()
    if ver is None:
        raise ValueError(f"Version {target_version} not found for '{key}'")

    return update_prompt(
        db, key, ver.template,
        operator=operator,
        reason=reason or f"Rollback to version {target_version}",
    )


def delete_prompt(db: Session, key: str) -> None:
    """Delete a non-built-in prompt template and its version history."""
    from app.models import PromptTemplate

    row = db.execute(
        select(PromptTemplate).where(PromptTemplate.key == key)
    ).scalar_one_or_none()
    if row is None:
        raise ValueError(f"Prompt template '{key}' not found")
    if row.built_in:
        raise ValueError("Built-in prompt templates cannot be deleted")

    db.delete(row)
    db.commit()
    refresh_cache(db)
