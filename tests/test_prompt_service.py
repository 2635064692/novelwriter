# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Regression tests for DB-backed prompt template service."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.text import PromptKey
from app.core.text import prompt_service
from app.core.text.zh import _TEMPLATES
from app.database import Base
from app.models import PromptTemplate, PromptVersion


@pytest.fixture
def prompt_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        prompt_service._cache.clear()
        prompt_service._cache_loaded = False
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        prompt_service._cache.clear()
        prompt_service._cache_loaded = False


def test_seed_defaults_inserts_prompt_keys_and_does_not_overwrite(prompt_db):
    """Scalar key loading must not treat returned strings as row objects."""
    prompt_service.seed_defaults(prompt_db)

    rows = prompt_db.execute(select(PromptTemplate)).scalars().all()
    assert {row.key for row in rows} == {key.value for key in PromptKey}

    system = prompt_db.execute(
        select(PromptTemplate).where(PromptTemplate.key == PromptKey.SYSTEM.value)
    ).scalar_one()
    system.template = "user customized system prompt"
    system.version = 7
    prompt_db.commit()

    prompt_service.seed_defaults(prompt_db)
    system = prompt_db.execute(
        select(PromptTemplate).where(PromptTemplate.key == PromptKey.SYSTEM.value)
    ).scalar_one()
    assert system.template == "user customized system prompt"
    assert system.version == 7


def test_update_prompt_uses_default_placeholder_contract(prompt_db):
    prompt_service.seed_defaults(prompt_db)
    continuation = prompt_db.execute(
        select(PromptTemplate).where(PromptTemplate.key == PromptKey.CONTINUATION.value)
    ).scalar_one()
    continuation.template = "polluted template without required placeholders"
    prompt_db.commit()

    with pytest.raises(ValueError, match="Template missing required placeholders"):
        prompt_service.update_prompt(
            prompt_db,
            PromptKey.CONTINUATION.value,
            "still missing placeholders",
        )

    valid = _TEMPLATES[PromptKey.CONTINUATION] + "\n<!-- edited -->"
    updated = prompt_service.update_prompt(
        prompt_db,
        PromptKey.CONTINUATION.value,
        valid,
        reason="valid edit",
    )

    assert updated.template == valid
    assert updated.version == 2
    snapshots = prompt_db.execute(select(PromptVersion)).scalars().all()
    assert len(snapshots) == 1
    assert snapshots[0].template == "polluted template without required placeholders"
