"""数据层加载：把 data/*.json 读成只读 DataBundle，并做引用校验。

数据与代码解耦的落点：所有游戏数值来自 JSON，代码不含游戏数据魔法数字。
未知 op/when 只记 warning，不中断（支持「数据先行、代码后补」）。
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"

REQUIRED_FILES = {
    "sprites": "sprites.json",
    "skills": "skills.json",
    "marks": "marks.json",
    "weather": "weather.json",
    "elements": "elements.json",
    "rules": "rules.json",
}


class DataError(RuntimeError):
    pass


@dataclass
class DataBundle:
    sprites: dict[str, dict[str, Any]]
    skills: dict[str, dict[str, Any]]
    marks: dict[str, dict[str, Any]]
    weather: dict[str, dict[str, Any]]
    elements: dict[str, Any]
    rules: dict[str, Any]
    warnings: list[str] = field(default_factory=list)
    data_version: str = "0.0.0"
    data_updated_at: str = ""

    # --- 查询辅助 ---
    def sprite(self, sprite_id: str) -> dict[str, Any]:
        try:
            return self.sprites[sprite_id]
        except KeyError as exc:
            raise DataError(f"未知精灵 id: {sprite_id}") from exc

    def skill(self, skill_id: str) -> dict[str, Any]:
        try:
            return self.skills[skill_id]
        except KeyError as exc:
            raise DataError(f"未知技能 id: {skill_id}") from exc

    def mark(self, mark_id: str) -> dict[str, Any]:
        return self.marks.get(mark_id, {})

    def weather_def(self, weather_id: str) -> dict[str, Any]:
        return self.weather.get(weather_id, {})

    def counts(self) -> dict[str, int]:
        return {
            "sprites": len(self.sprites),
            "skills": len(self.skills),
            "marks": len(self.marks),
            "weather": len(self.weather),
        }

    def type_multiplier(self, attack_element: str, defend_elements: list[str]) -> float:
        """按 elements.json 计算属性倍率（含双系 combine / override）。"""
        return type_multiplier(self.elements, attack_element, defend_elements)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise DataError(f"缺少数据文件: {path}")
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        raise DataError(f"{path.name} JSON 解析失败: {exc}") from exc


def _index(items: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for item in items:
        k = item.get(key)
        if not k:
            raise DataError(f"条目缺少 {key!r} 字段: {item!r}")
        if k in out:
            raise DataError(f"{key} 重复: {k}")
        out[k] = item
    return out


def load_data(data_dir: str | os.PathLike[str] | None = None) -> DataBundle:
    """加载并校验六份数据文件，返回只读 DataBundle。"""
    root = Path(data_dir) if data_dir else DEFAULT_DATA_DIR
    raw = {name: _read_json(root / fname) for name, fname in REQUIRED_FILES.items()}

    warnings: list[str] = []

    sprites = _index(raw["sprites"].get("sprites", []), "id")
    skills = _index(raw["skills"].get("skills", []), "id")
    marks = _index(raw["marks"].get("marks", []), "id")
    weather = _index(raw["weather"].get("weather", []), "id")

    # --- 引用完整性 ---
    for sid, sprite in sprites.items():
        for skill_id in sprite.get("skillList", []):
            if skill_id not in skills:
                warnings.append(f"精灵 {sid} 引用了未知技能: {skill_id}")
        for elem in sprite.get("elements", []):
            if not _has_element(raw["elements"], elem):
                warnings.append(f"精灵 {sid} 引用了未知属性: {elem}")

    for skill_id, skill in skills.items():
        for mark in skill.get("markAdd", []):
            if mark.get("mark") not in marks:
                warnings.append(f"技能 {skill_id} 引用了未知印记: {mark.get('mark')}")
        for op in skill.get("ops", []):
            _check_op(op, marks, warnings, f"技能 {skill_id}")

    for mark_id, mark in marks.items():
        for op in mark.get("ops", []):
            _check_op(op, marks, warnings, f"印记 {mark_id}")

    version = raw["sprites"].get("version", "0.0.0")
    updated = raw["sprites"].get("updatedAt", "")

    return DataBundle(
        sprites=sprites,
        skills=skills,
        marks=marks,
        weather=weather,
        elements=raw["elements"],
        rules=raw["rules"],
        warnings=warnings,
        data_version=version,
        data_updated_at=updated,
    )


KNOWN_OPS = {
    "stat_mod", "damage", "heal", "add_mark", "remove_mark", "mark_delta",
    "energy", "magic", "status", "weather", "priority", "multi_hit",
    "charge", "force_switch", "wish_boost", "heal_from_damage", "conditional",
    "damage_mult",
}


def _check_op(op: dict[str, Any], marks: dict[str, Any], warnings: list[str], where: str) -> None:
    kind = op.get("kind")
    if kind not in KNOWN_OPS:
        warnings.append(f"{where} 含未知 op kind: {kind}")
    if kind == "conditional":
        for sub in op.get("then", []):
            _check_op(sub, marks, warnings, where)
    if kind in {"add_mark", "remove_mark", "mark_delta"}:
        m = op.get("mark")
        if m and m not in marks:
            warnings.append(f"{where} 引用了未知印记: {m}")


def _has_element(elements: dict[str, Any], name: str) -> bool:
    names = set()
    for t in elements.get("elements", []):
        names.add(t.get("name"))
        names.add(t.get("shortName"))
        names.add(t.get("nameZh"))
    return name in names


def type_multiplier(elements: dict[str, Any], attack: str, defend: list[str]) -> float:
    """双系倍率：逐系相乘，可被 overrides / clampTo 配置覆盖。"""
    matrix = elements.get("matrix", {})
    combine = elements.get("combine", {})
    values = elements.get("values", {"counter": 2.0, "neutral": 1.0, "resisted": 0.5})

    row = matrix.get(attack, {})
    mult = 1.0
    for d in defend:
        entry = row.get(d)
        if entry is None:
            mult *= values["neutral"]
        elif isinstance(entry, str):
            mult *= values.get(entry, 1.0)
        else:
            mult *= float(entry)

    for ov in combine.get("overrides", []):
        if ov.get("attack") == attack and sorted(ov.get("defend", [])) == sorted(defend):
            mult = float(ov["value"])

    clamp = combine.get("clampTo")
    if clamp:
        mult = max(float(clamp[0]), min(float(clamp[1]), mult))
    return mult
