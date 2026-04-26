"""Pure domain objects and policies for outline systems."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas import normalize_and_validate_system_data

OUTLINE_SYSTEM_NAME = "大纲体系"
OUTLINE_DISPLAY_TYPE = "outline"
OUTLINE_CONTEXT_TAG = "outline_context"
OutlineStep = Literal["volume", "chapter"]


class OutlineChapterDraft(BaseModel):
    chapter_number: int = Field(ge=1)
    chapter_title: str = ""
    brief_text: str = ""
    suspense_density: str | None = None
    cognitive_twist: int | None = Field(default=None, ge=1, le=5)

    def to_storage(self, *, status: str = "draft") -> dict[str, Any]:
        return {
            "chapter_number": self.chapter_number,
            "chapter_title": self.chapter_title,
            "brief_text": self.brief_text,
            "suspense_density": self.suspense_density,
            "cognitive_twist": self.cognitive_twist,
            "status": status,
        }


class OutlineVolumeDraft(BaseModel):
    volume_number: int = Field(ge=1)
    volume_title: str = ""
    chapter_start: int = Field(ge=1)
    chapter_end: int = Field(ge=1)
    outline_text: str = ""
    chapters: list[OutlineChapterDraft] = Field(default_factory=list)

    def to_storage(self, *, status: str = "draft") -> dict[str, Any]:
        return {
            "volume_number": self.volume_number,
            "volume_title": self.volume_title,
            "chapter_start": self.chapter_start,
            "chapter_end": self.chapter_end,
            "outline_text": self.outline_text,
            "status": status,
            "chapters": [chapter.to_storage(status=status) for chapter in self.chapters],
        }


class VolumeOutlineOutput(BaseModel):
    total_volumes: int | None = Field(default=None, ge=0)
    volumes: list[OutlineVolumeDraft] = Field(default_factory=list)


class ChapterBriefOutput(BaseModel):
    chapters: list[OutlineChapterDraft] = Field(default_factory=list)


@dataclass(frozen=True)
class OutlineContext:
    volume: dict[str, Any]
    chapter: dict[str, Any] | None

    def format_for_prompt(self) -> str:
        volume_title = str(self.volume.get("volume_title") or f"第{self.volume.get('volume_number')}卷")
        volume_text = str(self.volume.get("outline_text") or "").strip()
        lines = [f"【当前卷纲】{volume_title}"]
        if volume_text:
            lines.append(volume_text)
        if self.chapter:
            lines.extend(format_chapter_context_lines(self.chapter))
        return f"<{OUTLINE_CONTEXT_TAG}>\n" + "\n".join(lines) + f"\n</{OUTLINE_CONTEXT_TAG}>"


def validate_outline_data(data: dict[str, Any]) -> dict[str, Any]:
    return normalize_and_validate_system_data(OUTLINE_DISPLAY_TYPE, data)


def volumes_to_outline_data(output: VolumeOutlineOutput) -> dict[str, Any]:
    volumes = [volume.to_storage(status="draft") for volume in output.volumes]
    data = {"total_volumes": output.total_volumes or len(volumes), "volumes": volumes}
    return validate_outline_data(data)


def chapters_to_storage(chapters: list[OutlineChapterDraft], *, batch_start: int, batch_end: int) -> list[dict[str, Any]]:
    by_number = {chapter.chapter_number: chapter.to_storage(status="draft") for chapter in chapters}
    return [by_number.get(number) or empty_chapter_storage(number) for number in range(batch_start, batch_end + 1)]


def empty_chapter_storage(chapter_number: int) -> dict[str, Any]:
    return {
        "chapter_number": chapter_number,
        "chapter_title": "",
        "brief_text": "",
        "suspense_density": None,
        "cognitive_twist": None,
        "status": "draft",
    }


def volume_event_payload(volume: dict[str, Any]) -> dict[str, Any]:
    return {
        "volume_number": volume["volume_number"],
        "volume_title": volume.get("volume_title") or "",
        "chapter_start": volume["chapter_start"],
        "chapter_end": volume["chapter_end"],
        "outline_text": volume.get("outline_text") or "",
    }


def chapter_batches(start: int, end: int, batch_size: int) -> list[tuple[int, int]]:
    return [(number, min(number + batch_size - 1, end)) for number in range(start, end + 1, batch_size)]


def select_volumes(data: dict[str, Any], *, volume_number: int | None) -> list[dict[str, Any]]:
    volumes = list(data.get("volumes") or [])
    if volume_number is None:
        return volumes
    selected = [volume for volume in volumes if volume.get("volume_number") == volume_number]
    if not selected:
        raise ValueError(f"Outline volume {volume_number} not found")
    return selected


def find_volume(
    data: dict[str, Any],
    *,
    chapter_number: int | None = None,
    volume_number: int | None = None,
) -> dict[str, Any] | None:
    for volume in data.get("volumes", []):
        if volume_number is not None and volume.get("volume_number") == volume_number:
            return volume
        if chapter_number is not None and volume.get("chapter_start", 0) <= chapter_number <= volume.get("chapter_end", 0):
            return volume
    return None


def find_chapter(volume: dict[str, Any], *, chapter_number: int) -> dict[str, Any] | None:
    for chapter in volume.get("chapters", []):
        if chapter.get("chapter_number") == chapter_number:
            return chapter
    return None


def format_chapter_context_lines(chapter: dict[str, Any]) -> list[str]:
    chapter_title = str(chapter.get("chapter_title") or f"第{chapter.get('chapter_number')}章")
    brief_text = str(chapter.get("brief_text") or "").strip()
    lines = [f"【本章章纲】{chapter_title}"]
    if brief_text:
        lines.append(brief_text)
    suspense = chapter.get("suspense_density")
    twist = chapter.get("cognitive_twist")
    if suspense or twist:
        lines.append(f"悬念密度：{suspense or '未标注'}；认知颠覆：{twist or '未标注'}")
    return lines


def approve_all(data: dict[str, Any]) -> None:
    for volume in data.get("volumes", []):
        approve_volume(volume)


def approve_volume(volume: dict[str, Any]) -> None:
    volume["status"] = "approved"
    for chapter in volume.get("chapters", []):
        chapter["status"] = "approved"


def require_approved_volume_outlines(volumes: list[dict[str, Any]]) -> None:
    pending = [str(volume.get("volume_number")) for volume in volumes if volume.get("status") != "approved"]
    if pending:
        raise ValueError(f"Approve volume outlines before generating chapter briefs: {', '.join(pending)}")


def replace_volume_chapter_drafts(volume: dict[str, Any], chapters: list[dict[str, Any]]) -> None:
    volume["chapters"] = chapters
    volume["status"] = "draft"


def all_volumes_approved(data: dict[str, Any]) -> bool:
    volumes = data.get("volumes") or []
    return bool(volumes) and all(_volume_fully_approved(volume) for volume in volumes)


def _volume_fully_approved(volume: dict[str, Any]) -> bool:
    return volume.get("status") == "approved" and all(
        chapter.get("status") == "approved" for chapter in volume.get("chapters", [])
    )


def clean_optional_text(value: str | None) -> str:
    text = (value or "").strip()
    return text or "（无）"
