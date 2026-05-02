# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Shared FastAPI dependencies for API routers."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.auth import get_current_user_or_default
from app.core.llm_request import get_llm_config_with_db
from app.database import get_db
from app.models import Novel, User


def verify_novel_access(
    novel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_default),
) -> Novel:
    """Ensure `novel_id` exists and is accessible to the current user.

    - hosted: strict owner_id isolation (404 for cross-user to avoid existence leaks)
    - selfhost: single-user local mode; ignore owner_id for local DB resilience
    """
    novel = db.get(Novel, novel_id)
    if not novel:
        raise HTTPException(status_code=404, detail=f"Novel {novel_id} not found")

    settings = get_settings()
    if settings.deploy_mode == "hosted" and novel.owner_id != current_user.id:
        # Must not leak existence across users.
        raise HTTPException(status_code=404, detail=f"Novel {novel_id} not found")
    return novel


def get_llm_config_dep(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_or_default),
) -> dict[str, Any] | None:
    """FastAPI dependency that resolves LLM config with DB fallback.

    Usage: llm_config: dict | None = Depends(get_llm_config_dep)
    """
    uid = getattr(user, "id", None) if user is not None else None
    return get_llm_config_with_db(request, db=db, user_id=uid)
