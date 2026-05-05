import json
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models import Chapter, Novel, User, WorldSystem

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def novel(db):
    novel = Novel(title="测试小说", author="测试", file_path="/tmp/test.txt", total_chapters=5)
    db.add(novel)
    db.commit()
    db.refresh(novel)
    db.add_all(
        [
            Chapter(novel_id=novel.id, chapter_number=1, title="初遇", content="主角初入山门。"),
            Chapter(novel_id=novel.id, chapter_number=2, title="试炼", content="主角参加试炼。"),
            Chapter(novel_id=novel.id, chapter_number=3, title="远行", content="主角离开山门。"),
            Chapter(novel_id=novel.id, chapter_number=4, title="破局", content="主角发现阴谋。"),
        ]
    )
    db.commit()
    return novel


@pytest.fixture
def client(db):
    from app.api import outline
    from app.core.auth import check_generation_quota, get_current_user_or_default

    test_app = FastAPI()
    test_app.include_router(outline.router)

    def override_get_db():
        yield db

    fake_user = User(
        id=1,
        username="testuser",
        hashed_password="x",
        role="admin",
        is_active=True,
        generation_quota=999,
        feedback_submitted=False,
    )
    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[get_current_user_or_default] = lambda: fake_user
    test_app.dependency_overrides[check_generation_quota] = lambda: fake_user

    with TestClient(test_app) as test_client:
        yield test_client
    test_app.dependency_overrides.clear()


def outline_volume_data(volume_number: int, start: int, end: int, *, chapters: list[dict] | None = None) -> dict:
    return {
        "volume_number": volume_number,
        "volume_title": f"第{volume_number}卷",
        "chapter_start": start,
        "chapter_end": end,
        "outline_text": f"第{volume_number}卷卷纲。",
        "chapters": chapters or [],
    }


@pytest.mark.asyncio
async def test_outline_stream_generates_one_system_per_volume_and_chapters(db, novel, monkeypatch):
    from app.core import outline_gen
    from app.core.outline_domain import ChapterBriefOutput, OutlineChapterDraft, OutlineVolumeDraft, VolumeOutlineOutput

    outputs = [
        VolumeOutlineOutput(
            total_volumes=2,
            volumes=[
                OutlineVolumeDraft(volume_number=1, volume_title="第一卷", chapter_start=1, chapter_end=2, outline_text="入门与试炼。"),
                OutlineVolumeDraft(volume_number=2, volume_title="第二卷", chapter_start=3, chapter_end=4, outline_text="远行与破局。"),
            ],
        ),
        ChapterBriefOutput(
            chapters=[
                OutlineChapterDraft(chapter_number=3, chapter_title="远行", brief_text="离开山门。", suspense_density="平稳", cognitive_twist=1),
                OutlineChapterDraft(chapter_number=4, chapter_title="破局", brief_text="发现阴谋。", suspense_density="紧凑", cognitive_twist=3),
            ]
        ),
    ]
    mock = AsyncMock(side_effect=outputs)
    monkeypatch.setattr(outline_gen.ai_client, "generate_structured", mock)

    volume_events = [
        event
        async for event in outline_gen.generate_outline_system_stream(db=db, novel_id=novel.id, step="volume")
    ]
    assert [event["type"] for event in volume_events] == ["start", "volume_outline", "volume_outline", "done"]

    systems = db.query(WorldSystem).filter(WorldSystem.novel_id == novel.id, WorldSystem.display_type == "outline").order_by(WorldSystem.id).all()
    assert len(systems) == 2
    assert [system.data["volume_number"] for system in systems] == [1, 2]
    assert systems[1].data["outline_text"] == "远行与破局。"

    with pytest.raises(ValueError, match="Approve volume outlines"):
        async for _event in outline_gen.generate_outline_system_stream(
            db=db,
            novel_id=novel.id,
            step="chapter",
            volume_number=2,
        ):
            pass

    outline_gen.approve_outline_system(db, novel.id, volume_number=2)

    chapter_events = [
        event
        async for event in outline_gen.generate_outline_system_stream(db=db, novel_id=novel.id, step="chapter", volume_number=2)
    ]
    assert [event["type"] for event in chapter_events] == [
        "start",
        "volume_start",
        "chapter_brief",
        "chapter_brief",
        "volume_done",
        "done",
    ]
    db.refresh(systems[1])
    assert len(systems[1].data["chapters"]) == 2
    assert systems[1].status == "draft"
    assert "status" not in systems[1].data
    assert all("status" not in chapter for chapter in systems[1].data["chapters"])


def test_outline_api_generate_stream_persists_volume_systems(client, db, novel, monkeypatch):
    from app.core import outline_gen
    from app.core.outline_domain import OutlineVolumeDraft, VolumeOutlineOutput

    mock = AsyncMock(
        return_value=VolumeOutlineOutput(
            total_volumes=2,
            volumes=[
                OutlineVolumeDraft(volume_number=1, volume_title="第一卷", chapter_start=1, chapter_end=2, outline_text="入门与试炼。"),
                OutlineVolumeDraft(volume_number=2, volume_title="第二卷", chapter_start=3, chapter_end=4, outline_text="远行与破局。"),
            ],
        )
    )
    monkeypatch.setattr(outline_gen.ai_client, "generate_structured", mock)

    resp = client.post(f"/api/novels/{novel.id}/outline/generate/stream", json={"step": "volume"})

    assert resp.status_code == 200
    events = [json.loads(line) for line in resp.text.splitlines() if line.strip()]
    assert [event["type"] for event in events] == ["start", "volume_outline", "volume_outline", "done"]

    systems = db.query(WorldSystem).filter(WorldSystem.novel_id == novel.id, WorldSystem.display_type == "outline").all()
    assert len(systems) == 2
    assert {system.data["volume_number"] for system in systems} == {1, 2}


def test_outline_api_state_and_approve_multiple_systems(client, db, novel):
    systems = [
        WorldSystem(
            novel_id=novel.id,
            name="大纲体系 - 第1卷",
            display_type="outline",
            data=outline_volume_data(1, 1, 2),
            visibility="active",
            origin="worldgen",
            status="draft",
        ),
        WorldSystem(
            novel_id=novel.id,
            name="大纲体系 - 第2卷",
            display_type="outline",
            data=outline_volume_data(2, 3, 4),
            visibility="active",
            origin="worldgen",
            status="draft",
        ),
    ]
    db.add_all(systems)
    db.commit()

    resp = client.get(f"/api/novels/{novel.id}/outline")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["exists"] is True
    assert len(payload["systems"]) == 2

    resp = client.post(f"/api/novels/{novel.id}/outline/approve", json={"volume_number": 2})
    assert resp.status_code == 200
    assert resp.json()["status"] == "confirmed"
    db.refresh(systems[0])
    db.refresh(systems[1])
    assert systems[0].status == "draft"
    assert systems[1].status == "confirmed"
    assert "status" not in systems[1].data


@pytest.mark.asyncio
async def test_continuation_prompt_injects_matching_confirmed_outline_volume(db, novel):
    from app.core import generator as generator_mod

    db.add_all(
        [
            WorldSystem(
                novel_id=novel.id,
                name="大纲体系 - 第1卷",
                display_type="outline",
                data=outline_volume_data(1, 1, 2),
                visibility="active",
                origin="worldgen",
                status="confirmed",
            ),
            WorldSystem(
                novel_id=novel.id,
                name="大纲体系 - 第2卷",
                display_type="outline",
                data=outline_volume_data(
                    2,
                    3,
                    5,
                    chapters=[
                        {
                            "chapter_number": 5,
                            "chapter_title": "终局",
                            "brief_text": "本章完成终局。",
                            "suspense_density": "紧凑",
                            "cognitive_twist": 4,
                        }
                    ],
                ),
                visibility="active",
                origin="worldgen",
                status="confirmed",
            ),
        ]
    )
    db.commit()

    prompt, _max_tokens, _build_info = await generator_mod._build_continuation_prompt(
        db,
        novel.id,
        use_core_memory=False,
        use_lorebook=False,
        context_chapters=2,
    )

    assert "<outline>" in prompt
    assert "<outline_context>" not in prompt
    assert "第2卷卷纲" in prompt
    assert "本章完成终局" in prompt
    assert "第1卷卷纲" not in prompt
