# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_llm_config_dep, verify_novel_access
from app.core.auth import QuotaScope, check_generation_quota, get_current_user_or_default
from app.core.events import record_event
from app.core.llm_semaphore import acquire_llm_slot, release_llm_slot
from app.core.outline_gen import (
    approve_outline_system,
    generate_outline_system_stream,
    get_outline_state,
)
from app.database import get_db
from app.models import User
from app.schemas import OutlineApproveRequest, OutlineGenerateRequest, OutlineSystemStateResponse, WorldSystemResponse

router = APIRouter(
    prefix="/api/novels/{novel_id}/outline",
    tags=["outline"],
    dependencies=[Depends(verify_novel_access)],
)

logger = logging.getLogger(__name__)


@router.get("", response_model=OutlineSystemStateResponse)
def get_outline_system_state(
    novel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_default),
):
    del current_user
    systems = get_outline_state(db, novel_id)
    serialized = [WorldSystemResponse.model_validate(system) for system in systems]
    return OutlineSystemStateResponse(exists=bool(systems), systems=serialized)


@router.post("/approve", response_model=WorldSystemResponse)
def approve_outline(
    novel_id: int,
    body: OutlineApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_default),
):
    try:
        systems = approve_outline_system(db, novel_id, volume_number=body.volume_number)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail={"code": "outline_not_found", "message": str(exc)}) from exc
    record_event(
        db,
        current_user.id,
        "world_edit",
        novel_id=novel_id,
        meta={"action": "approve_outline", "volume_number": body.volume_number},
    )
    return systems[0]


@router.post("/generate/stream")
async def generate_outline_stream(
    novel_id: int,
    body: OutlineGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_default),
    llm_config: dict | None = Depends(get_llm_config_dep),
    _quota_user: User = Depends(check_generation_quota),
):
    current_user = _quota_user
    await acquire_llm_slot()
    quota = QuotaScope(db, current_user.id, count=1)
    try:
        quota.reserve()
    except Exception:
        release_llm_slot()
        raise

    request_id = getattr(request.state, "request_id", None)

    async def event_generator():
        success = False
        try:
            async for event in generate_outline_system_stream(
                db=db,
                novel_id=novel_id,
                step=body.step,
                volume_number=body.volume_number,
                total_volumes_hint=body.total_volumes_hint,
                user_guidance=body.user_guidance,
                batch_size=body.batch_size,
                llm_config=llm_config,
                user_id=current_user.id,
            ):
                if event.get("type") == "done":
                    success = True
                if request_id:
                    event.setdefault("request_id", request_id)
                yield json.dumps(event, ensure_ascii=False) + "\n"
            if success:
                quota.charge(1)
                record_event(db, current_user.id, "generation", novel_id=novel_id, meta={"outline_step": body.step})
        except ValueError as exc:
            logger.info("outline generation rejected: %s", exc)
            yield json.dumps({"type": "error", "code": "outline_invalid_request", "message": str(exc)}, ensure_ascii=False) + "\n"
        except Exception:
            logger.exception("outline generation failed (novel_id=%s, step=%s)", novel_id, body.step)
            yield json.dumps({"type": "error", "code": "outline_generation_failed", "message": "大纲生成失败，请重试"}, ensure_ascii=False) + "\n"
        finally:
            quota.finalize()
            release_llm_slot()

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")
