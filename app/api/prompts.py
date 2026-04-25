"""Prompt template management API.

Provides CRUD, version history, and rollback for the 6 PromptKey templates
now stored in the database.  Global endpoints (not scoped to a novel).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PromptVersion
from app.core.text import prompt_service
from app.schemas import (
    PromptTemplateResponse,
    PromptTemplateUpdateRequest,
    PromptVersionResponse,
    PromptRollbackRequest,
)

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


def _not_found(key: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Prompt template '{key}' not found")


@router.get("/", response_model=list[PromptTemplateResponse])
def list_templates(db: Session = Depends(get_db)):
    return prompt_service.list_templates(db)


@router.get("/{key}", response_model=PromptTemplateResponse)
def get_template(key: str, db: Session = Depends(get_db)):
    tmpl = prompt_service.get_template(db, key)
    if tmpl is None:
        raise _not_found(key)
    return tmpl


@router.put("/{key}", response_model=PromptTemplateResponse)
def update_template(
    key: str,
    body: PromptTemplateUpdateRequest,
    db: Session = Depends(get_db),
):
    try:
        return prompt_service.update_prompt(
            db, key, body.template,
            reason=body.reason,
        )
    except ValueError as exc:
        if "not found" in str(exc):
            raise _not_found(key) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{key}/versions", response_model=list[PromptVersionResponse])
def list_versions(key: str, db: Session = Depends(get_db)):
    tmpl = prompt_service.get_template(db, key)
    if tmpl is None:
        raise _not_found(key)
    rows = db.execute(
        select(PromptVersion)
        .where(PromptVersion.prompt_template_id == tmpl.id)
        .order_by(PromptVersion.version.desc())
    ).scalars().all()
    return rows


@router.post("/{key}/rollback", response_model=PromptTemplateResponse)
def rollback_template(
    key: str,
    body: PromptRollbackRequest,
    db: Session = Depends(get_db),
):
    try:
        return prompt_service.rollback_prompt(
            db, key, body.version,
            reason=body.reason,
        )
    except ValueError as exc:
        if "not found" in str(exc):
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{key}", status_code=204)
def delete_template(key: str, db: Session = Depends(get_db)):
    try:
        prompt_service.delete_prompt(db, key)
    except ValueError as exc:
        if "cannot be deleted" in str(exc).lower():
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        raise _not_found(key) from exc
