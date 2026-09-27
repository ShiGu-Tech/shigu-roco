"""数据层：schema / 引用完整性 / 属性矩阵。"""

from __future__ import annotations


def test_counts(bundle):
    counts = bundle.counts()
    assert counts["sprites"] >= 40
    assert counts["skills"] >= 100
    assert counts["marks"] >= 5
    assert counts["weather"] >= 2


def test_reference_integrity(bundle):
    bad = [w for w in bundle.warnings if "未知技能" in w or "未知印记" in w]
    assert bad == [], bad


def test_element_matrix(bundle):
    assert len(bundle.elements["elements"]) == 18
    assert bundle.type_multiplier("Fire", ["Grass"]) == 2.0
    assert bundle.type_multiplier("Fire", ["Water"]) == 0.5
    assert bundle.type_multiplier("Fire", ["Normal"]) == 1.0


def test_dual_type_multiplies(bundle):
    # 火 打 草/水（双系）→ 2.0 * 0.5 = 1.0
    assert bundle.type_multiplier("Fire", ["Grass", "Water"]) == 1.0


def test_sprite_fields(bundle):
    sp = bundle.sprite("sp-6")
    assert sp["name"] == "Blazework"
    assert sp["elements"] == ["Fire"]
    assert set(sp["race"]) == {"hp", "atk", "defense", "spatk", "spdef", "speed"}


def test_skills_have_dsl(bundle):
    for skill in bundle.skills.values():
        assert isinstance(skill.get("ops"), list)
        assert skill["actionType"] in ("Attack", "Defense", "Status")
        assert skill["category"] in ("Physical", "Magic", "Status", "Defense")
