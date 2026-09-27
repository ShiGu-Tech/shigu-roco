"""从 roco.world 抓取精灵 / 技能 / 属性表，转换为本项目 data/*.json。

原理：站点为 Vite SPA，每个页面内嵌
``<script id="roco-bootstrap" type="application/json">``，其中
``catalog.types`` 是完整属性克制矩阵，``page.data`` 是精灵详情（种族值 / 特性 / 技能）。

用法：
  python -m roco_engine.ingest.fetch_roco_world --ids 1-40
  python -m roco_engine.ingest.fetch_roco_world --ids 5,6,7 --base https://roco.world

礼貌抓取：串行 + 固定延时，仅取公开页面；原始 JSON 存 engine/ingest/raw/ 供离线复核。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE = "https://roco.world"
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATA_DIR = REPO_ROOT / "data"
RAW_DIR = REPO_ROOT / "engine" / "ingest" / "raw"

USER_AGENT = "ShiGuRock/0.1 (offline PVP helper; polite single-user fetch)"
BOOTSTRAP_RE = re.compile(
    r'<script id="roco-bootstrap" type="application/json">(.*?)</script>', re.DOTALL
)

CATEGORY_MAP = {"physical": "Physical", "magic": "Magic", "status": "Status", "defense": "Defense"}
ACTION_MAP = {"Physical": "Attack", "Magic": "Attack", "Defense": "Defense", "Status": "Status"}

MARK_ALIASES = {
    "burn": "burn",
    "poison": "poison",
    "freeze": "freeze",
    "parasitism": "parasitism",
    "conductive charge": "conductive-charge",
    "starfall mark": "starfall",
    "starfall": "starfall",
}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def fetch_bootstrap(base: str, path: str, timeout: int = 30) -> dict[str, Any]:
    url = f"{base}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (本机工具)
        html = resp.read().decode("utf-8", "replace")
    m = BOOTSTRAP_RE.search(html)
    if not m:
        raise RuntimeError(f"{url} 未找到 roco-bootstrap")
    return json.loads(m.group(1))


def parse_ids(spec: str) -> list[int]:
    ids: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            ids.extend(range(int(a), int(b) + 1))
        elif part:
            ids.append(int(part))
    return ids


# ------------------------------------------------------------------ 属性表
def build_elements(catalog: dict[str, Any]) -> dict[str, Any]:
    types = catalog["types"]["types"]
    matchups = catalog["types"]["matchups"]
    by_id = {t["id"]: t for t in types}
    effect_name = {1: "counter", 0: "neutral", -1: "resisted"}

    elements = []
    for t in types:
        imun = [
            {"id": s.get("note_id"), "name": s.get("name"), "description": s.get("description"), "iconKey": s.get("icon_key")}
            for s in t.get("status_immunities", [])
        ]
        elements.append(
            {
                "id": t["id"],
                "name": t["short_name"],
                "nameZh": "",
                "color": t.get("color"),
                "statusImmunities": imun,
            }
        )

    matrix: dict[str, dict[str, str]] = {}
    for m in matchups:
        a = by_id.get(m["attacking_type_id"])
        d = by_id.get(m["defending_type_id"])
        if not a or not d:
            continue
        matrix.setdefault(a["short_name"], {})[d["short_name"]] = effect_name[m["effect"]]

    return {
        "$schemaVersion": "0.1",
        "version": "0.1.0",
        "updatedAt": time.strftime("%Y-%m-%d"),
        "values": {"counter": 2.0, "neutral": 1.0, "resisted": 0.5},
        "elements": elements,
        "matrix": matrix,
        "combine": {
            "mode": "multiply",
            "clampTo": [0.25, 4.0],
            "overrides": [],
            "note": "双系叠加规则【待校准】：来源只给单系 effect，双系为逐系相乘后 clamp。",
        },
    }


# ------------------------------------------------------------------ 技能解析
def parse_ops(skill: dict[str, Any], element: str) -> dict[str, Any]:
    desc = skill.get("description", "")
    cat = CATEGORY_MAP.get(skill.get("skill_category", {}).get("key", ""), "Status")
    ops: list[dict[str, Any]] = []
    mark_add: list[dict[str, Any]] = []
    special: list[str] = []
    priority = 0

    # 先制
    m = re.search(r"Priority \+(\d+)", desc)
    if m:
        priority = int(m.group(1))
        ops.append({"kind": "priority", "value": priority})

    # 应对状态 / 应对防御 / 应对攻击 的威力倍数
    for tag, cls in (("Status Counter", "Status"), ("Defense Counter", "Defense"), ("Attack Counter", "Attack")):
        if tag in desc:
            special.append(tag)
            pool = re.findall(r"(\d+(?:\.\d+)?)\s*[x×]\s*power", desc)
            if pool:
                factor = float(pool[0])
                ops.append({"kind": "damage_mult", "when": {"tag": "action", "value": cls}, "factor": factor})

    # 连击
    m = re.search(r"with (\d+) combo hit", desc)
    if m:
        ops.append({"kind": "multi_hit", "times": int(m.group(1))})

    # 蓄力
    if "Charge" in desc and "charge" not in desc.lower().replace("charge:", ""):
        ops.append({"kind": "charge", "turns": 1})
    if desc.startswith("Charge") or "Charge," in desc:
        ops.append({"kind": "charge", "turns": 1})

    # 吸血
    m = re.search(r"Lifesteal[^0-9]*(\d+)%", desc)
    if m:
        ops.append({"kind": "heal_from_damage", "ratio": int(m.group(1)) / 100.0})

    # 自身增益：+X% to both attacks / +X% Physical ATK / +X Speed
    for m in re.finditer(r"gains? \+(\d+)% (?:to both attacks|Physical ATK|Magic ATK|Armor|Magic Resist)", desc):
        ops.append({"kind": "stat_mod", "target": "self", "stat": "atk", "mode": "percent", "value": int(m.group(1))})
    for m in re.finditer(r"gains? \+(\d+)% to both defenses", desc):
        ops.append({"kind": "stat_mod", "target": "self", "stat": "defense", "mode": "percent", "value": int(m.group(1))})
    for m in re.finditer(r"gains? \+(\d+) Speed", desc):
        ops.append({"kind": "stat_mod", "target": "self", "stat": "speed", "mode": "flat", "value": int(m.group(1))})

    # 敌方减益：loses X% Armor and X% Magic Resist
    for m in re.finditer(r"loses (\d+)% Armor", desc):
        ops.append({"kind": "stat_mod", "target": "enemy", "stat": "defense", "mode": "percent", "value": -int(m.group(1))})
    for m in re.finditer(r"loses (\d+)% Magic Resist", desc):
        ops.append({"kind": "stat_mod", "target": "enemy", "stat": "spdef", "mode": "percent", "value": -int(m.group(1))})

    # 印记：gains N stacks of X / gains stacks of X equal to ...
    for m in re.finditer(r"(?:enemy|this Jini) gains (\d+) stacks? of ([A-Za-z ]+?)(?:\.|,|$)", desc):
        mark = MARK_ALIASES.get(m.group(2).strip().lower())
        if mark:
            ops.append({"kind": "add_mark", "target": "enemy", "mark": mark, "stack": int(m.group(1))})
            mark_add.append({"target": "enemy", "mark": mark, "stack": int(m.group(1))})

    # 天气
    m = re.search(r"Changes the weather to ([A-Za-z ]+?) for (\d+) turns", desc)
    if m:
        wid = slug(m.group(1))
        ops.append({"kind": "weather", "weather": wid, "turns": int(m.group(2))})
        special.append(f"weather:{wid}")

    return {
        "ops": ops,
        "markAdd": mark_add,
        "specialRules": special,
        "priority": priority,
    }


def build_skill(skill: dict[str, Any], type_by_id: dict[int, str], element_fallback: str) -> dict[str, Any]:
    cat = CATEGORY_MAP.get(skill.get("skill_category", {}).get("key", ""), "Status")
    element = type_by_id.get(skill.get("battle_type_id"), element_fallback)
    damage = skill.get("damage") or [0]
    power = int(max(damage)) if damage else 0
    parsed = parse_ops(skill, element)
    return {
        "id": f"sk-{skill['id']}",
        "skillName": skill.get("name"),
        "element": element,
        "category": cat,
        "actionType": ACTION_MAP.get(cat, "Status"),
        "power": 0 if cat in ("Status", "Defense") else power,
        "cost": int(skill.get("energy_cost", 0) or 0),
        "hitRate": 100,
        "priority": parsed["priority"],
        "powerIsVariable": bool(skill.get("power_is_variable")),
        "targetType": skill.get("target_type"),
        "cooldown": (skill.get("cooldown") or [0])[0],
        "markAdd": parsed["markAdd"],
        "buffSelf": {},
        "debuffEnemy": {},
        "specialRules": parsed["specialRules"],
        "ops": parsed["ops"],
        "rawText": skill.get("description", ""),
        "sourceType": skill.get("source_type"),
        "source": "",
    }


def build_sprite(page: dict[str, Any], type_by_id: dict[int, str]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    d = page["data"]
    elements = [type_by_id[t] for t in d.get("unit_types", []) if t in type_by_id]
    stats = d.get("stats", {})
    race = {
        "hp": int(stats.get("hp", 0)),
        "atk": int(stats.get("physical_attack", 0)),
        "defense": int(stats.get("physical_defense", 0)),
        "spatk": int(stats.get("special_attack", 0)),
        "spdef": int(stats.get("special_defense", 0)),
        "speed": int(stats.get("speed", 0)),
    }
    passive = (d.get("passive_skills") or [{}])[0]
    form_id = int(d.get("form_id", 1))
    sprite_id = f"sp-{d['handbook_id']}" if form_id == 1 else f"sp-{d['handbook_id']}-f{form_id}"

    skills: list[dict[str, Any]] = []
    skill_ids: list[str] = []
    seen: set[str] = set()
    for skill in d.get("skills", []):
        if skill.get("source_type") != "level":
            continue
        built = build_skill(skill, type_by_id, elements[0] if elements else "")
        if built["id"] in seen:
            continue
        seen.add(built["id"])
        skills.append(built)
        skill_ids.append(built["id"])
    skills.sort(key=lambda s: s["id"])

    sprite = {
        "id": sprite_id,
        "no": d.get("handbook_id"),
        "name": d.get("name"),
        "nameZh": "",
        "stage": d.get("evolution_stage"),
        "elements": elements,
        "race": race,
        "trait": {"name": passive.get("name", ""), "desc": passive.get("description", ""), "params": {}},
        "skillList": skill_ids,
        "leaderAllowed": True,
        "source": "",
    }
    return sprite, skills


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="fetch_roco_world")
    parser.add_argument("--ids", default="1-40", help="handbook id 列表，如 5,6,7 或 1-40")
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--delay", type=float, default=0.6, help="请求间隔秒")
    parser.add_argument("--merge", action="store_true", help="与已有 sprites/skills 合并")
    args = parser.parse_args(argv)

    data_dir = Path(args.data_dir)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    first = fetch_bootstrap(args.base, "/jini/6")
    catalog = first["catalog"]
    type_by_id = {t["id"]: t["short_name"] for t in catalog["types"]["types"]}

    write_json(data_dir / "elements.json", build_elements(catalog))
    print(f"[elements] {len(type_by_id)} 属性，矩阵已写入 elements.json")

    sprites: dict[str, dict[str, Any]] = {}
    skills: dict[str, dict[str, Any]] = {}
    if args.merge:
        sp = data_dir / "sprites.json"
        sk = data_dir / "skills.json"
        if sp.exists():
            for s in json.loads(sp.read_text(encoding="utf-8")).get("sprites", []):
                sprites[s["id"]] = s
        if sk.exists():
            for s in json.loads(sk.read_text(encoding="utf-8")).get("skills", []):
                skills[s["id"]] = s

    ids = parse_ids(args.ids)
    today = time.strftime("%Y-%m-%d")
    for n in ids:
        try:
            boot = first if n == 6 else None
            if boot is None:
                boot = fetch_bootstrap(args.base, f"/jini/{n}")
            if boot.get("page", {}).get("kind") != "spirit-detail":
                print(f"  #{n} 跳过（非精灵页）")
                continue
            page = boot["page"]
            (RAW_DIR / f"jini-{n}.json").write_text(json.dumps(boot, ensure_ascii=False), encoding="utf-8")
            sprite, sks = build_sprite(page, type_by_id)
            sprite["source"] = f"{args.base}/jini/{n}"
            for s in sks:
                s["source"] = f"{args.base}/jini/{n}"
                skills.setdefault(s["id"], s)
            sprites[sprite["id"]] = sprite
            print(f"  #{n} {sprite['name']} 种族 {sprite['race']} 技能 {len(sks)}")
        except urllib.error.HTTPError as exc:
            print(f"  #{n} HTTP {exc.code} 跳过")
        except Exception as exc:  # noqa: BLE001
            print(f"  #{n} 失败：{exc}")
        if n != ids[-1]:
            time.sleep(args.delay)

    write_json(data_dir / "sprites.json", {
        "$schemaVersion": "0.1",
        "version": "0.1.0",
        "updatedAt": today,
        "sprites": list(sprites.values()),
    })
    write_json(data_dir / "skills.json", {
        "$schemaVersion": "0.1",
        "version": "0.1.0",
        "updatedAt": today,
        "skills": list(skills.values()),
    })
    print(f"[done] 精灵 {len(sprites)}，技能 {len(skills)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
