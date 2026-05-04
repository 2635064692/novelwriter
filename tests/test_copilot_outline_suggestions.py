from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.core.copilot.apply import apply_suggestions
from app.core.copilot.scope import ScopeSnapshot, derive_focus_variant
from app.core.copilot.suggestions import compile_suggestions, serialize_compiled_suggestions
from app.database import Base
from app.models import CopilotRun, CopilotSession, Novel, User, WorldSystem

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def outline_data(*, chapters: list[dict] | None = None) -> dict:
    return {
        "volume_number": 1,
        "volume_title": "第一卷",
        "chapter_start": 1,
        "chapter_end": 3,
        "outline_text": "旧卷纲。",
        "chapters": chapters or [],
    }


def setup_function():
    Base.metadata.create_all(bind=engine)


def teardown_function():
    Base.metadata.drop_all(bind=engine)


def _seed_run(db):
    user = User(username="test", hashed_password="x", role="admin", is_active=True)
    novel = Novel(title="测试小说", author="测试", file_path="/tmp/test.txt", total_chapters=3)
    db.add_all([user, novel])
    db.commit()
    db.refresh(user)
    db.refresh(novel)
    session = CopilotSession(
        session_id="session-outline",
        novel_id=novel.id,
        user_id=user.id,
        mode="outline",
        scope="whole_book",
        interaction_locale="zh",
        signature="outline-signature",
        display_title="大纲探究",
    )
    run = CopilotRun(
        run_id="run-outline",
        copilot_session_id=1,
        novel_id=novel.id,
        user_id=user.id,
        status="completed",
        prompt="补全大纲",
        suggestions_json=[],
    )
    system = WorldSystem(
        novel_id=novel.id,
        name="大纲体系 - 第1卷",
        display_type="outline",
        data=outline_data(chapters=[{"chapter_number": 1, "chapter_title": "旧章", "brief_text": "旧章纲。"}]),
        visibility="active",
        origin="worldgen",
        status="draft",
    )
    db.add_all([session, run, system])
    db.commit()
    db.refresh(run)
    db.refresh(system)
    return novel, run, system


def _snapshot(novel, system):
    return ScopeSnapshot(
        novel=novel,
        novel_language="zh",
        entities=[],
        entities_by_id={},
        relationships=[],
        systems=[system],
        attributes_by_entity={},
        draft_entities=[],
        draft_relationships=[],
        draft_systems=[system],
        profile="broad_exploration",
        focus_variant="outline",
    )


def test_outline_mode_derives_outline_focus():
    assert derive_focus_variant("outline", "whole_book", None) == "outline"


def test_compile_outline_volume_suggestion_builds_outline_action():
    db = TestingSessionLocal()
    try:
        novel, _run, system = _seed_run(db)
        suggestions = compile_suggestions(
            [
                {
                    "kind": "update_outline_volume",
                    "title": "补全卷纲",
                    "summary": "补充卷纲正文。",
                    "target_resource": "system",
                    "target_id": system.id,
                    "delta": {"outline_text": "新卷纲。", "volume_title": "第一卷：新"},
                }
            ],
            [],
            _snapshot(novel, system),
            "outline",
            "outline",
        )

        assert len(suggestions) == 1
        serialized = serialize_compiled_suggestions(suggestions)[0]
        assert serialized["kind"] == "update_outline_volume"
        assert serialized["apply"]["type"] == "update_outline_volume"
        assert serialized["apply"]["data"] == {"outline_text": "新卷纲。", "volume_title": "第一卷：新"}
        assert serialized["preview"]["actionable"] is True
    finally:
        db.close()


def test_apply_outline_chapters_merges_without_deleting_existing_chapters():
    db = TestingSessionLocal()
    try:
        _novel, run, system = _seed_run(db)
        run.suggestions_json = [
            {
                "suggestion_id": "sg_outline_chapters",
                "kind": "update_outline_chapters",
                "title": "补全章纲",
                "summary": "补入章节节点。",
                "evidence_ids": [],
                "target": {"resource": "system", "resource_id": system.id, "label": system.name, "tab": "systems"},
                "preview": {"target_label": system.name, "summary": "", "field_deltas": [], "evidence_quotes": [], "actionable": True},
                "apply": {
                    "type": "update_outline_chapters",
                    "system_id": system.id,
                    "data": {
                        "chapters": [
                            {"chapter_number": 1, "chapter_title": "新章", "brief_text": "更新旧章纲。"},
                            {"chapter_number": 2, "chapter_title": "第二章", "brief_text": "新增章纲。"},
                        ]
                    },
                },
                "status": "pending",
            }
        ]
        db.commit()

        results = apply_suggestions(db, run, ["sg_outline_chapters"])

        assert results[0].success is True
        db.refresh(system)
        chapters = system.data["chapters"]
        assert [chapter["chapter_number"] for chapter in chapters] == [1, 2]
        assert chapters[0]["chapter_title"] == "新章"
        assert system.data["outline_text"] == "旧卷纲。"
    finally:
        db.close()
