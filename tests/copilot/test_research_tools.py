# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Unit tests for research_tools.py — outline scope."""

from app.core.copilot.research_tools import (
    _chinese_to_int,
    _find_from_outline,
    _parse_outline_query,
)
from app.core.copilot.scope import ScopeSnapshot
from app.models import Novel, WorldSystem


def _make_novel() -> Novel:
    return Novel(id=1, title="test", author="test", file_path="/x", language="zh")


def _make_system(volume_number: int, outline_text: str = "", volume_title: str = "",
                 chapters: list[dict] | None = None) -> WorldSystem:
    return WorldSystem(
        id=volume_number,
        novel_id=1,
        name="大纲体系",
        display_type="outline",
        data={
            "volume_number": volume_number,
            "volume_title": volume_title or f"第{volume_number}卷",
            "outline_text": outline_text or f"卷{volume_number}纲内容。",
            "chapter_start": 1,
            "chapter_end": len(chapters or []) or 2,
            "chapters": chapters or [],
        },
    )


def _empty_snapshot() -> ScopeSnapshot:
    return ScopeSnapshot(
        novel=_make_novel(),
        novel_language="zh",
        entities=[],
        entities_by_id={},
        relationships=[],
        systems=[],
        attributes_by_entity={},
        draft_entities=[],
        draft_relationships=[],
        draft_systems=[],
    )


def _snapshot_with_systems(*systems: WorldSystem) -> ScopeSnapshot:
    snapshot = _empty_snapshot()
    snapshot.systems = list(systems)
    return snapshot


# ── _chinese_to_int ───────────────────────────────────────────────


class TestChineseToInt:
    def test_arabic_digits(self):
        assert _chinese_to_int("1") == 1
        assert _chinese_to_int("30") == 30
        assert _chinese_to_int("123") == 123

    def test_single_digit(self):
        assert _chinese_to_int("一") == 1
        assert _chinese_to_int("九") == 9

    def test_teens(self):
        assert _chinese_to_int("十") == 10
        assert _chinese_to_int("十一") == 11
        assert _chinese_to_int("十九") == 19

    def test_tens(self):
        assert _chinese_to_int("二十") == 20
        assert _chinese_to_int("二十一") == 21
        assert _chinese_to_int("九十九") == 99

    def test_invalid(self):
        assert _chinese_to_int("abc") is None
        assert _chinese_to_int("") is None

    def test_edge_cases(self):
        assert _chinese_to_int("一百") == 100
        assert _chinese_to_int("一百零一") == 101
        assert _chinese_to_int("百") == 100


# ── _parse_outline_query ──────────────────────────────────────────


class TestParseOutlineQuery:
    # ── legacy (阿拉伯数字) ──

    def test_empty_query(self):
        assert _parse_outline_query("") == []
        assert _parse_outline_query("  ") == []

    def test_single_volume_digit(self):
        assert _parse_outline_query("2") == [(2, None)]

    def test_volume_chapter_pair_digit(self):
        assert _parse_outline_query("2-30") == [(2, 30)]

    def test_multiple_tokens_comma_separated(self):
        result = _parse_outline_query("1, 3-5, 4")
        assert result == [(1, None), (3, 5), (4, None)]

    def test_chinese_comma_separator(self):
        result = _parse_outline_query("1，2-3")
        assert result == [(1, None), (2, 3)]

    def test_deduplicate_identical_tokens(self):
        result = _parse_outline_query("2, 2, 2-5, 2-5")
        assert result == [(2, None), (2, 5)]

    def test_invalid_input_returns_empty(self):
        assert _parse_outline_query("abc") == []

    def test_mixed_valid_invalid(self):
        result = _parse_outline_query("2, abc, 3-4")
        assert result == [(2, None), (3, 4)]

    def test_partial_match_ignored(self):
        assert _parse_outline_query("2-abc") == []

    def test_leading_trailing_delimiters(self):
        result = _parse_outline_query(",2-5,")
        assert result == [(2, 5)]

    # ── 中文 第X卷 / 第X章 ──

    def test_chinese_volume_arabic_digit(self):
        assert _parse_outline_query("第1卷") == [(1, None)]

    def test_chinese_volume_cn_numeral(self):
        assert _parse_outline_query("第一卷") == [(1, None)]

    def test_chinese_chapter_with_explicit_volume(self):
        result = _parse_outline_query("第一卷 第2章")
        assert result == [(1, None), (1, 2)]

    def test_chinese_chapter_inherits_volume_context(self):
        result = _parse_outline_query("第一卷 第5章 第8章")
        assert result == [(1, None), (1, 5), (1, 8)]

    def test_chinese_chapter_cn_numeral(self):
        result = _parse_outline_query("第一卷 第三章")
        assert result == [(1, None), (1, 3)]

    def test_user_example(self):
        result = _parse_outline_query("第一卷 第2章 第三章")
        assert result == [(1, None), (1, 2), (1, 3)]

    def test_chinese_chapter_no_volume_context(self):
        result = _parse_outline_query("第5章")
        assert result == [(None, 5)]

    def test_chinese_chapter_multiple_digits_cn(self):
        result = _parse_outline_query("第一卷 第二三章")
        assert result == [(1, None), (1, 2), (1, 3)]

    def test_chinese_chapter_teens(self):
        result = _parse_outline_query("第一卷 第十二章")
        assert result == [(1, None), (1, 12)]

    def test_chinese_volume_switch_resets_context(self):
        result = _parse_outline_query("第一卷 第2章 第二卷 第3章")
        assert result == [(1, None), (1, 2), (2, None), (2, 3)]

    def test_chinese_volume_switch_by_chapter_reset(self):
        result = _parse_outline_query("第一卷 第5章 第3卷 第7章")
        assert result == [(1, None), (1, 5), (3, None), (3, 7)]

    def test_chinese_mixed_arabic_cn(self):
        result = _parse_outline_query("第1卷 第二章")
        assert result == [(1, None), (1, 2)]


# ── _find_from_outline ────────────────────────────────────────────


class TestFindFromOutline:
    def test_no_outline_systems_returns_empty(self):
        snapshot = _empty_snapshot()
        result = _find_from_outline("2", snapshot)
        assert result == []

    def test_empty_query_returns_empty(self):
        system = _make_system(1)
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("", snapshot)
        assert result == []

    def test_find_volume_by_number(self):
        system = _make_system(volume_number=2, outline_text="第二卷：远行与破局。")
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("2", snapshot)
        assert len(result) == 1
        pack = result[0]
        assert pack.pack_id.startswith("pk_vol_")
        assert "远行与破局" in pack.preview_excerpt
        assert pack.anchor_terms == ["volume_2"]

    def test_find_chapter_by_volume_chapter(self):
        system = _make_system(volume_number=2, chapters=[
            {"chapter_number": 30, "chapter_title": "远行", "brief_text": "主角离开山门，踏上旅途。"},
        ])
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("2-30", snapshot)
        assert len(result) == 1
        pack = result[0]
        assert pack.pack_id.startswith("pk_ch_")
        assert "远行" in pack.preview_excerpt
        assert pack.anchor_terms == ["volume_2", "chapter_30"]

    def test_volume_not_found(self):
        system = _make_system(volume_number=1)
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("5", snapshot)
        assert result == []

    def test_chapter_not_found_within_volume(self):
        system = _make_system(volume_number=3, chapters=[
            {"chapter_number": 10, "chapter_title": "X", "brief_text": "Y"},
        ])
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("3-99", snapshot)
        assert result == []

    def test_multiple_outline_systems(self):
        sys2 = _make_system(volume_number=2, outline_text="卷二：远行。")
        sys3 = _make_system(volume_number=3, outline_text="卷三：归来。")
        snapshot = _snapshot_with_systems(sys2, sys3)
        result = _find_from_outline("3", snapshot)
        assert len(result) == 1
        assert "归来" in result[0].preview_excerpt

    def test_multiple_targets_volumes_and_chapters(self):
        sys1 = _make_system(volume_number=1, outline_text="卷一：入门。")
        sys2 = _make_system(volume_number=2, chapters=[
            {"chapter_number": 3, "chapter_title": "试炼", "brief_text": "参加试炼。"},
            {"chapter_number": 5, "chapter_title": "破局", "brief_text": "发现阴谋。"},
        ])
        snapshot = _snapshot_with_systems(sys1, sys2)
        result = _find_from_outline("1, 2-3, 2-5", snapshot)
        assert len(result) == 3
        excerpts = {pack.preview_excerpt for pack in result}
        assert any("卷一" in e for e in excerpts)
        assert any("试炼" in e for e in excerpts)
        assert any("破局" in e for e in excerpts)

    def test_skips_non_outline_systems(self):
        outline_sys = _make_system(volume_number=1, outline_text="大纲内容。")
        other_sys = WorldSystem(
            id=99, novel_id=1, name="时间线", display_type="timeline", data={"volume_number": 1},
        )
        snapshot = _snapshot_with_systems(outline_sys, other_sys)
        result = _find_from_outline("1", snapshot)
        assert len(result) == 1
        assert result[0].pack_id.startswith("pk_vol_")

    def test_skips_system_with_missing_volume_number(self):
        system = WorldSystem(
            id=1, novel_id=1, name="大纲体系", display_type="outline", data={"chapters": []},
        )
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("1", snapshot)
        assert result == []

    def test_skips_system_with_non_int_volume_number(self):
        system = WorldSystem(
            id=1, novel_id=1, name="大纲体系", display_type="outline",
            data={"volume_number": "one"},
        )
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("1", snapshot)
        assert result == []

    def test_volume_chapter_mix_targeting_same_volume(self):
        system = _make_system(volume_number=3, outline_text="卷三纲。", chapters=[
            {"chapter_number": 7, "chapter_title": "转折", "brief_text": "关键转折。"},
        ])
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("3, 3-7", snapshot)
        assert len(result) == 2
        vol_pack = next(p for p in result if p.pack_id.startswith("pk_vol_"))
        ch_pack = next(p for p in result if p.pack_id.startswith("pk_ch_"))
        assert "卷三纲" in vol_pack.preview_excerpt
        assert "关键转折" in ch_pack.preview_excerpt

    # ── 中文 query 集成测试 ──

    def test_chinese_volume_integration(self):
        system = _make_system(volume_number=1, outline_text="第一卷：入门与试炼。")
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("第一卷", snapshot)
        assert len(result) == 1
        assert "入门与试炼" in result[0].preview_excerpt

    def test_chinese_volume_and_chapter_integration(self):
        system = _make_system(volume_number=1, outline_text="卷一纲。", chapters=[
            {"chapter_number": 2, "chapter_title": "试炼", "brief_text": "参加试炼。"},
            {"chapter_number": 3, "chapter_title": "远行", "brief_text": "离开山门。"},
        ])
        snapshot = _snapshot_with_systems(system)
        result = _find_from_outline("第一卷 第2章 第三章", snapshot)
        assert len(result) == 3
        excerpts = {pack.preview_excerpt for pack in result}
        assert any("卷一纲" in e for e in excerpts)
        assert any("试炼" in e for e in excerpts)
        assert any("远行" in e for e in excerpts)

    def test_chapter_no_volume_searches_all(self):
        sys1 = _make_system(volume_number=1, chapters=[
            {"chapter_number": 3, "chapter_title": "A", "brief_text": "AAA"},
        ])
        sys2 = _make_system(volume_number=2, chapters=[
            {"chapter_number": 3, "chapter_title": "B", "brief_text": "BBB"},
        ])
        snapshot = _snapshot_with_systems(sys1, sys2)
        result = _find_from_outline("第3章", snapshot)
        assert len(result) == 2
        excerpts = {pack.preview_excerpt for pack in result}
        assert any("AAA" in e for e in excerpts)
        assert any("BBB" in e for e in excerpts)
