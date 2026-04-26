"""Application service for outline-system generation and persistence."""

from __future__ import annotations

from typing import Any, AsyncGenerator

from sqlalchemy.orm import Session, aliased

from app.core.ai_client import ai_client
from app.core.continuation_text import format_chapter_heading_for_prompt
from app.core.outline_domain import (
    ChapterBriefOutput,
    OUTLINE_DISPLAY_TYPE,
    OUTLINE_SYSTEM_NAME,
    OutlineContext,
    OutlineStep,
    VolumeOutlineOutput,
    all_volumes_approved,
    approve_all,
    approve_volume,
    chapter_batches,
    chapters_to_storage,
    clean_optional_text,
    find_chapter,
    find_volume,
    replace_volume_chapter_drafts,
    require_approved_volume_outlines,
    select_volumes,
    validate_outline_data,
    volume_event_payload,
    volumes_to_outline_data,
)
from app.core.text import PromptKey, get_prompt
from app.language import resolve_prompt_locale
from app.models import Chapter, Novel, WorldEntity, WorldRelationship, WorldSystem


def get_outline_state(db: Session, novel_id: int) -> WorldSystem | None:
    return _get_outline_system(db, novel_id, include_draft=True)


def approve_outline_system(db: Session, novel_id: int, *, volume_number: int | None = None) -> WorldSystem:
    system = _require_outline_system(db, novel_id)
    data = _outline_data(system)
    if volume_number is None:
        approve_all(data)
    else:
        volume = find_volume(data, volume_number=volume_number)
        if volume is None:
            raise ValueError(f"Outline volume {volume_number} not found")
        approve_volume(volume)
    system.data = validate_outline_data(data)
    if all_volumes_approved(system.data):
        system.status = "confirmed"
    db.commit()
    db.refresh(system)
    return system


def fetch_outline_context(db: Session, novel_id: int, chapter_number: int) -> OutlineContext | None:
    system = _get_outline_system(db, novel_id, include_draft=False)
    if system is None:
        return None
    data = _outline_data(system)
    volume = find_volume(data, chapter_number=chapter_number)
    if volume is None:
        return None
    return OutlineContext(volume=volume, chapter=find_chapter(volume, chapter_number=chapter_number))


async def generate_outline_system_stream(
    *,
    db: Session,
    novel_id: int,
    step: OutlineStep,
    volume_number: int | None = None,
    total_volumes_hint: int | None = None,
    user_guidance: str | None = None,
    batch_size: int = 25,
    llm_config: dict | None = None,
    user_id: int | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    novel = _require_novel(db, novel_id)
    world_context = _build_world_context(db, novel_id)
    prompt_locale = resolve_prompt_locale(novel_language=getattr(novel, "language", None))
    if step == "volume":
        async for event in _generate_volume_outlines(
            db=db,
            novel=novel,
            world_context=world_context,
            prompt_locale=prompt_locale,
            total_volumes_hint=total_volumes_hint,
            user_guidance=user_guidance,
            llm_config=llm_config,
            user_id=user_id,
        ):
            yield event
        return

    async for event in _generate_chapter_briefs(
        db=db,
        novel=novel,
        world_context=world_context,
        prompt_locale=prompt_locale,
        volume_number=volume_number,
        user_guidance=user_guidance,
        batch_size=batch_size,
        llm_config=llm_config,
        user_id=user_id,
    ):
        yield event


async def _generate_volume_outlines(
    *,
    db: Session,
    novel: Novel,
    world_context: str,
    prompt_locale: str,
    total_volumes_hint: int | None,
    user_guidance: str | None,
    llm_config: dict | None,
    user_id: int | None,
) -> AsyncGenerator[dict[str, Any], None]:
    chapters = _load_chapters(db, int(novel.id))
    yield {"type": "start", "phase": "volume_outline", "total_chapters": len(chapters)}
    output = await ai_client.generate_structured(
        prompt=get_prompt(PromptKey.VOLUME_OUTLINE_GEN, locale=prompt_locale).format(
            world_context=world_context or "（暂无已确认世界观）",
            chapter_list=_format_chapter_list(chapters, prompt_locale=prompt_locale),
            total_chapters=novel.total_chapters or len(chapters),
            total_volumes_hint=total_volumes_hint or "（未指定）",
            user_guidance=clean_optional_text(user_guidance),
        ),
        response_model=VolumeOutlineOutput,
        system_prompt=get_prompt(PromptKey.SYSTEM, locale=prompt_locale),
        temperature=0.3,
        max_tokens=4000,
        user_id=user_id,
        **(llm_config or {}),
    )
    data = volumes_to_outline_data(output)
    for volume in data["volumes"]:
        yield {"type": "volume_outline", "total_volumes": data.get("total_volumes"), **volume_event_payload(volume)}
    system = _upsert_outline_system(db, int(novel.id), data=data, status="draft")
    yield {
        "type": "done",
        "phase": "volume_outline",
        "system_id": system.id,
        "volumes_generated": len(data["volumes"]),
    }


async def _generate_chapter_briefs(
    *,
    db: Session,
    novel: Novel,
    world_context: str,
    prompt_locale: str,
    volume_number: int | None,
    user_guidance: str | None,
    batch_size: int,
    llm_config: dict | None,
    user_id: int | None,
) -> AsyncGenerator[dict[str, Any], None]:
    system = _require_outline_system(db, int(novel.id))
    data = _outline_data(system)
    volumes = select_volumes(data, volume_number=volume_number)
    require_approved_volume_outlines(volumes)
    yield {"type": "start", "phase": "chapter_brief", "volumes_to_generate": len(volumes)}
    chapters_generated = 0
    for volume in volumes:
        yield {"type": "volume_start", **volume_event_payload(volume)}
        generated: list[dict[str, Any]] = []
        async for event in _generate_chapter_batches(
            db=db,
            novel=novel,
            volume=volume,
            world_context=world_context,
            prompt_locale=prompt_locale,
            user_guidance=user_guidance,
            batch_size=batch_size,
            llm_config=llm_config,
            user_id=user_id,
        ):
            if event.get("type") == "chapter_brief":
                chapter = {key: value for key, value in event.items() if key not in {"type", "volume_number"}}
                generated.append(chapter)
                chapters_generated += 1
            yield event
        replace_volume_chapter_drafts(volume, generated)
        system.status = "draft"
        system.data = validate_outline_data(data)
        db.commit()
        yield {"type": "volume_done", "volume_number": volume["volume_number"], "chapter_count": len(generated)}
    db.refresh(system)
    yield {
        "type": "done",
        "phase": "chapter_brief",
        "volumes_processed": len(volumes),
        "chapters_generated": chapters_generated,
    }


async def _generate_chapter_batches(
    *,
    db: Session,
    novel: Novel,
    volume: dict[str, Any],
    world_context: str,
    prompt_locale: str,
    user_guidance: str | None,
    batch_size: int,
    llm_config: dict | None,
    user_id: int | None,
) -> AsyncGenerator[dict[str, Any], None]:
    generated: list[dict[str, Any]] = []
    batches = chapter_batches(volume["chapter_start"], volume["chapter_end"], batch_size)
    for index, (batch_start, batch_end) in enumerate(batches, start=1):
        output = await ai_client.generate_structured(
            prompt=get_prompt(PromptKey.CHAPTER_BRIEF_GEN, locale=prompt_locale).format(
                world_context=world_context or "（暂无已确认世界观）",
                volume_number=volume["volume_number"],
                volume_title=volume.get("volume_title") or "",
                volume_outline=volume.get("outline_text") or "",
                chapter_start=batch_start,
                chapter_end=batch_end,
                chapter_contents=_format_chapter_summaries(db, int(novel.id), batch_start, batch_end, prompt_locale),
                carry=_format_carry(generated),
                user_guidance=clean_optional_text(user_guidance),
            ),
            response_model=ChapterBriefOutput,
            system_prompt=get_prompt(PromptKey.SYSTEM, locale=prompt_locale),
            temperature=0.3,
            max_tokens=4000,
            user_id=user_id,
            **(llm_config or {}),
        )
        for chapter in chapters_to_storage(output.chapters, batch_start=batch_start, batch_end=batch_end):
            generated.append(chapter)
            yield {"type": "chapter_brief", "volume_number": volume["volume_number"], **chapter}
        if len(batches) > 1:
            yield {"type": "batch_done", "volume_number": volume["volume_number"], "batch": index, "total_batches": len(batches)}


def _require_novel(db: Session, novel_id: int) -> Novel:
    novel = db.query(Novel).filter(Novel.id == novel_id).first()
    if novel is None:
        raise ValueError(f"Novel {novel_id} not found")
    return novel


def _get_outline_system(db: Session, novel_id: int, *, include_draft: bool) -> WorldSystem | None:
    query = db.query(WorldSystem).filter(
        WorldSystem.novel_id == novel_id,
        WorldSystem.display_type == OUTLINE_DISPLAY_TYPE,
    )
    if include_draft:
        return query.order_by((WorldSystem.status == "confirmed").desc(), WorldSystem.id.asc()).first()
    return query.filter(WorldSystem.status == "confirmed").order_by(WorldSystem.id.asc()).first()


def _require_outline_system(db: Session, novel_id: int) -> WorldSystem:
    system = _get_outline_system(db, novel_id, include_draft=True)
    if system is None:
        raise ValueError("Outline system not found. Generate volume outlines first.")
    return system


def _outline_data(system: WorldSystem) -> dict[str, Any]:
    return validate_outline_data(system.data or {})


def _load_chapters(db: Session, novel_id: int) -> list[Chapter]:
    return db.query(Chapter).filter(Chapter.novel_id == novel_id).order_by(Chapter.chapter_number.asc()).all()


def _build_world_context(db: Session, novel_id: int) -> str:
    systems = db.query(WorldSystem).filter(
        WorldSystem.novel_id == novel_id,
        WorldSystem.status == "confirmed",
        WorldSystem.display_type != OUTLINE_DISPLAY_TYPE,
    ).order_by(WorldSystem.id.asc()).all()
    entities = db.query(WorldEntity).filter(WorldEntity.novel_id == novel_id, WorldEntity.status == "confirmed").all()
    relationships = _load_relationship_context_rows(db, novel_id)
    sections = [_format_world_systems(systems), _format_world_entities(entities), _format_world_relationships(relationships)]
    return "\n\n".join(section for section in sections if section)


def _load_relationship_context_rows(db: Session, novel_id: int) -> list[tuple[WorldRelationship, str, str]]:
    source = aliased(WorldEntity)
    target = aliased(WorldEntity)
    return (
        db.query(WorldRelationship, source.name, target.name)
        .join(source, WorldRelationship.source_id == source.id)
        .join(target, WorldRelationship.target_id == target.id)
        .filter(WorldRelationship.novel_id == novel_id, WorldRelationship.status == "confirmed")
        .all()
    )


def _format_world_systems(systems: list[WorldSystem]) -> str:
    lines = [f"- {system.name}（{system.display_type}）：{system.description or ''}\n  data={system.data}" for system in systems]
    return "【体系】\n" + "\n".join(lines) if lines else ""


def _format_world_entities(entities: list[WorldEntity]) -> str:
    lines = [f"- {entity.name}（{entity.entity_type}）：{entity.description or ''}" for entity in entities]
    return "【实体】\n" + "\n".join(lines) if lines else ""


def _format_world_relationships(relationships: list[tuple[WorldRelationship, str, str]]) -> str:
    lines = [f"- {source_name} -[{rel.label}]-> {target_name}：{rel.description or ''}" for rel, source_name, target_name in relationships]
    return "【关系】\n" + "\n".join(lines) if lines else ""


def _format_chapter_list(chapters: list[Chapter], *, prompt_locale: str) -> str:
    if not chapters:
        return "（暂无章节）"
    return "\n".join(
        format_chapter_heading_for_prompt(
            chapter.chapter_number,
            chapter.title,
            locale=prompt_locale,
            source_chapter_label=getattr(chapter, "source_chapter_label", None),
        )
        for chapter in chapters
    )


def _format_chapter_summaries(db: Session, novel_id: int, start: int, end: int, prompt_locale: str) -> str:
    chapters = db.query(Chapter).filter(
        Chapter.novel_id == novel_id,
        Chapter.chapter_number >= start,
        Chapter.chapter_number <= end,
    ).order_by(Chapter.chapter_number.asc()).all()
    if not chapters:
        return "（这些章节尚未写入正文，请根据卷纲规划章纲。）"
    return "\n\n".join(_format_chapter_summary(chapter, prompt_locale=prompt_locale) for chapter in chapters)


def _format_chapter_summary(chapter: Chapter, *, prompt_locale: str) -> str:
    heading = format_chapter_heading_for_prompt(
        chapter.chapter_number,
        chapter.title,
        locale=prompt_locale,
        source_chapter_label=getattr(chapter, "source_chapter_label", None),
    )
    return f"{heading}\n{(chapter.content or '')[:600]}"


def _format_carry(chapters: list[dict[str, Any]]) -> str:
    if not chapters:
        return "（无，当前为本卷首批。）"
    latest = chapters[-1]
    return f"上一章：第{latest.get('chapter_number')}章 {latest.get('chapter_title') or ''}\n{latest.get('brief_text') or ''}"


def _upsert_outline_system(db: Session, novel_id: int, *, data: dict[str, Any], status: str) -> WorldSystem:
    system = _get_outline_system(db, novel_id, include_draft=True)
    if system is None:
        system = WorldSystem(
            novel_id=novel_id,
            name=OUTLINE_SYSTEM_NAME,
            display_type=OUTLINE_DISPLAY_TYPE,
            description="卷纲与章纲，用于续写时注入结构性上下文。",
            data=data,
            constraints=[],
            visibility="active",
            origin="worldgen",
            status=status,
        )
        db.add(system)
    else:
        system.data = data
        system.origin = "worldgen" if system.status == "draft" else system.origin
        system.status = status
    db.commit()
    db.refresh(system)
    return system
