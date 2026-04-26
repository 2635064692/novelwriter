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
    novel = Novel(title="测试小说", author="测试", file_path="/tmp/test.txt", total_chapters=3)
    db.add(novel)
    db.commit()
    db.refresh(novel)
    db.add_all(
        [
            Chapter(novel_id=novel.id, chapter_number=1, title="初遇", content="主角初入山门。"),
            Chapter(novel_id=novel.id, chapter_number=2, title="试炼", content="主角参加试炼。"),
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


@pytest.mark.asyncio
async def test_outline_stream_generates_volumes_and_chapters(db, novel, monkeypatch):
    from app.core import outline_gen
    from app.core.outline_domain import ChapterBriefOutput, OutlineChapterDraft, OutlineVolumeDraft, VolumeOutlineOutput

    outputs = [
        VolumeOutlineOutput(
            total_volumes=1,
            volumes=[
                OutlineVolumeDraft(
                    volume_number=1,
                    volume_title="第一卷",
                    chapter_start=1,
                    chapter_end=2,
                    outline_text="入门与试炼。",
                )
            ],
        ),
        ChapterBriefOutput(
            chapters=[
                OutlineChapterDraft(chapter_number=1, chapter_title="初遇", brief_text="进入山门。", suspense_density="平稳", cognitive_twist=1),
                OutlineChapterDraft(chapter_number=2, chapter_title="试炼", brief_text="完成试炼。", suspense_density="紧凑", cognitive_twist=3),
            ]
        ),
    ]
    mock = AsyncMock(side_effect=outputs)
    monkeypatch.setattr(outline_gen.ai_client, "generate_structured", mock)

    volume_events = [
        event
        async for event in outline_gen.generate_outline_system_stream(db=db, novel_id=novel.id, step="volume")
    ]
    assert [event["type"] for event in volume_events] == ["start", "volume_outline", "done"]

    system = db.query(WorldSystem).filter(WorldSystem.novel_id == novel.id, WorldSystem.display_type == "outline").one()
    assert system.status == "draft"
    assert system.data["volumes"][0]["outline_text"] == "入门与试炼。"

    with pytest.raises(ValueError, match="Approve volume outlines"):
        _ = [
            event
            async for event in outline_gen.generate_outline_system_stream(
                db=db,
                novel_id=novel.id,
                step="chapter",
                volume_number=1,
            )
        ]

    system.data["volumes"][0]["status"] = "approved"
    db.commit()

    chapter_events = [
        event
        async for event in outline_gen.generate_outline_system_stream(db=db, novel_id=novel.id, step="chapter", volume_number=1)
    ]
    assert [event["type"] for event in chapter_events] == [
        "start",
        "volume_start",
        "chapter_brief",
        "chapter_brief",
        "volume_done",
        "done",
    ]
    db.refresh(system)
    assert len(system.data["volumes"][0]["chapters"]) == 2
    assert system.status == "draft"
    assert system.data["volumes"][0]["status"] == "draft"


def test_outline_api_state_and_approve(client, db, novel):
    system = WorldSystem(
        novel_id=novel.id,
        name="大纲体系",
        display_type="outline",
        data={
            "total_volumes": 1,
            "volumes": [
                {
                    "volume_number": 1,
                    "volume_title": "第一卷",
                    "chapter_start": 1,
                    "chapter_end": 2,
                    "outline_text": "入门与试炼。",
                    "status": "draft",
                    "chapters": [],
                }
            ],
        },
        visibility="active",
        origin="worldgen",
        status="draft",
    )
    db.add(system)
    db.commit()

    resp = client.get(f"/api/novels/{novel.id}/outline")
    assert resp.status_code == 200
    assert resp.json()["exists"] is True

    resp = client.post(f"/api/novels/{novel.id}/outline/approve", json={})
    assert resp.status_code == 200
    assert resp.json()["status"] == "confirmed"
    db.refresh(system)
    assert system.data["volumes"][0]["status"] == "approved"


@pytest.mark.asyncio
async def test_continuation_prompt_injects_confirmed_outline_context(db, novel):
    from app.core import generator as generator_mod

    db.add(
        WorldSystem(
            novel_id=novel.id,
            name="大纲体系",
            display_type="outline",
            data={
                "total_volumes": 1,
                "volumes": [
                    {
                        "volume_number": 1,
                        "volume_title": "第一卷",
                        "chapter_start": 1,
                        "chapter_end": 3,
                        "outline_text": "卷纲约束。",
                        "status": "approved",
                        "chapters": [
                            {
                                "chapter_number": 3,
                                "chapter_title": "破局",
                                "brief_text": "本章完成破局。",
                                "suspense_density": "紧凑",
                                "cognitive_twist": 4,
                                "status": "approved",
                            }
                        ],
                    }
                ],
            },
            visibility="active",
            origin="worldgen",
            status="confirmed",
        )
    )
    db.commit()

    prompt, _max_tokens, _build_info = await generator_mod._build_continuation_prompt(
        db,
        novel.id,
        use_core_memory=False,
        use_lorebook=False,
        context_chapters=2,
    )

    assert "<outline_context>" in prompt
    assert "卷纲约束" in prompt
    assert "本章完成破局" in prompt
