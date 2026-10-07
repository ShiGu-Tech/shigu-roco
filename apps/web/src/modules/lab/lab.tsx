"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { PetConfigDialog } from "@/components/pet-config-dialog";
import { PetSelectorDialog } from "@/components/pet-selector-dialog";
import { SkillSelector } from "@/components/skill-selector";
import { SpriteImage } from "@/components/sprite-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { getCatalog, simulateTurn } from "@/modules/battle/client";
import { emptySetup, profileFromSetup, type PetSetup } from "@/modules/battle/pet";
import { activeFromSprite, emptyActive } from "@/modules/battle/state";
import type { ActiveSpriteState, BattleEvent, BattleState, Catalog, EngineAction, SideState } from "@/modules/battle/types";
import { computeStats } from "@/modules/engine/stats";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import { bloodlineOptions } from "@/modules/pets/instance";
import { actionKey, deriveActions, spriteOf, type ActionOption } from "@/modules/board/util";
import { logRowOf } from "@/modules/board/log";

import { inferOpponent } from "./infer";
import { IntelPanel } from "./intel-panel";
import { StateEditor } from "./state-editor";
import { DEFAULT_MARK_MAX, loadAdapters, markPolarity, type LabAdapters } from "./adapters";
import { loadLab, saveLab } from "./storage";
import {
  intelOf,
  newIntel,
  type InferResult,
  type Interaction,
  type InteractionResult,
  type LabFrame,
  type LabIntel,
  type LabPet,
  type LabSide,
  type LabState,
  type Observation,
  type TalentMap,
} from "./types";

interface LabStateInternal extends LabState {
  intel: Record<string, LabIntel>;
}

type SideKey = "self" | "opp";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function initialEnergy(catalog: Catalog): number {
  const rules = catalog.rules as { energy?: { initial?: number } };
  return Number(rules.energy?.initial ?? 10);
}

function makePet(catalog: Catalog, spriteId: string, setup: PetSetup): LabPet {
  const sprite = spriteOf(catalog, spriteId);
  const state = sprite
    ? activeFromSprite(sprite, catalog.stats, initialEnergy(catalog), profileFromSetup(setup))
    : emptyActive();
  if (setup.skills.length) state.loadout = setup.skills.slice(0, 4);
  return { id: uid(), spriteId, setup, state };
}

function newSide(catalog: Catalog, spriteId: string): LabSide {
  const rules = catalog.rules as { initialMagic?: number; magic?: { initialPerSide?: number }; wishCharges?: number };
  const magic = Number(rules.initialMagic ?? rules.magic?.initialPerSide ?? 4);
  const wish = Number(rules.wishCharges ?? 2);
  const pet = makePet(catalog, spriteId, emptySetup());
  return { pets: [pet], activeId: pet.id, magic, wishChargesLeft: wish, wishCooldown: 0, leaderUsed: false };
}

function newLab(catalog: Catalog): LabStateInternal {
  const first = catalog.sprites[0];
  const second = catalog.sprites[1] ?? catalog.sprites[0];
  return {
    self: newSide(catalog, first?.id ?? ""),
    opp: newSide(catalog, second?.id ?? ""),
    intel: {},
    interactions: [],
    turn: 1,
    weather: null,
    seed: 42,
  };
}

function sideToEngine(side: LabSide): SideState {
  const active = side.pets.find((p) => p.id === side.activeId) ?? side.pets[0];
  const bench = side.pets.filter((p) => p.id !== active?.id);
  return {
    magic: side.magic,
    active: active?.state ?? emptyActive(),
    bench: bench.map((p) => p.state),
    seenEnemy: [],
    wishChargesLeft: side.wishChargesLeft,
    wishCooldown: side.wishCooldown,
    leaderUsed: side.leaderUsed,
  };
}

function toBattle(lab: LabStateInternal): BattleState {
  return {
    turn: lab.turn,
    weather: lab.weather,
    seed: lab.seed,
    player: sideToEngine(lab.self),
    enemy: sideToEngine(lab.opp),
  };
}

/** 结算后把引擎返回的 active / bench 状态按 spriteId 对回花名册（换人 / 阵亡仍记住）。 */
function fromEngineSide(side: LabSide, next: SideState): LabSide {
  const consumed = new Set<string>();
  const take = (spriteId: string) => {
    const pet = side.pets.find((p) => p.spriteId === spriteId && !consumed.has(p.id));
    if (pet) consumed.add(pet.id);
    return pet;
  };
  const pets: LabPet[] = [];
  const activePet = take(next.active.spriteId);
  if (activePet) pets.push({ ...activePet, state: next.active });
  for (const b of next.bench) {
    const pet = take(b.spriteId);
    if (pet) pets.push({ ...pet, state: b });
  }
  for (const p of side.pets) if (!consumed.has(p.id)) pets.push(p);
  return { ...side, pets, activeId: activePet?.id ?? side.activeId };
}

function applySetup(catalog: Catalog, pet: LabPet, setup: PetSetup): LabPet {
  const sprite = spriteOf(catalog, pet.spriteId);
  if (!sprite) return { ...pet, setup };
  const profile = profileFromSetup(setup);
  const ratio = pet.state.maxHp > 0 ? pet.state.hp / pet.state.maxHp : 1;
  const maxHp = Math.max(1, computeStats(catalog.stats ?? {}, { race: sprite.race }, profile).hp);
  const loadout = (setup.skills.length ? setup.skills : pet.state.loadout).slice(0, 4);
  return {
    ...pet,
    setup,
    state: { ...pet.state, profile, maxHp, hp: Math.min(maxHp, Math.round(ratio * maxHp)), loadout },
  };
}

/** 动作选择：面板头显示已选，点击开弹窗挑动作（技能 / 换人 / 聚能 / 愿力）。 */
function ActionPicker({
  title,
  options,
  selected,
  onPick,
  catalog,
  spriteId,
}: {
  title: string;
  options: ActionOption[];
  selected: EngineAction | null;
  onPick: (a: EngineAction) => void;
  catalog: Catalog;
  spriteId: string;
}) {
  const [open, setOpen] = useState(false);
  const [allMode, setAllMode] = useState(false);
  const current = selected ? options.find((o) => actionKey(o.action) === actionKey(selected)) : undefined;
  const skillName =
    selected?.kind === "skill" && selected.skillId ? catalog.allSkills.find((s) => s.id === selected.skillId)?.name : undefined;
  const label = current ? current.label : skillName ?? "选动作";
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={selected ? "default" : "outline"}
        className="h-7 max-w-[180px] px-2 text-[11px]"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{label}</span>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setAllMode(false);
        }}
      >
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="text-base">{allMode ? `${title} · 全部技能` : title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            {allMode ? (
              <SkillSelector
                catalog={catalog}
                spriteId={spriteId}
                value={selected?.skillId}
                onSelect={(skillId) => {
                  onPick({ kind: "skill", skillId });
                  setOpen(false);
                  setAllMode(false);
                }}
              />
            ) : (
              <>
                {options.length === 0 && <p className="text-sm text-muted-foreground">无可选动作。</p>}
                {options.map((o) => {
                  const active = selected ? actionKey(o.action) === actionKey(selected) : false;
                  return (
                    <button
                      key={actionKey(o.action)}
                      type="button"
                      onClick={() => {
                        onPick(o.action);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        active ? "border-primary bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      <span className="font-medium">{o.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{o.kindLabel}</span>
                    </button>
                  );
                })}
                <Button type="button" variant="outline" className="w-full" onClick={() => setAllMode(true)}>
                  从全部技能选（含防御 / 应对 / 任意技能）…
                </Button>
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 去掉完全重复的交互（清理历史反复登记 / 双击留下的旧存档）。 */
function dedupeInteractions(list: Interaction[]): Interaction[] {
  const seen = new Set<string>();
  const out: Interaction[] = [];
  for (const it of list) {
    const key = `${it.turn}|${it.selfSkillId ?? ""}|${it.oppSkillId ?? ""}|${it.counter ? 1 : 0}|${JSON.stringify(it.result ?? null)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** 技能 id → 名称。 */
function skillNameOf(catalog: Catalog, id?: string): string {
  if (!id) return "";
  return catalog.allSkills.find((s) => s.id === id)?.name ?? id;
}

/** 反推结果一行摘要。 */
function describeInfer(r: InferResult): string {
  if (r.conflict) return "区间矛盾，核对掉血% / 技能";
  const fmtN = (n: number) => (Number.isFinite(n) ? String(Math.round(n)) : "∞");
  const parts: string[] = [];
  if (r.defense) parts.push(`防御 [${fmtN(r.defense[0])},${fmtN(r.defense[1])}]`);
  if (r.maxHp) parts.push(`最大HP [${fmtN(r.maxHp[0])},${fmtN(r.maxHp[1])}]`);
  if (r.nature[0]) parts.push(`性格 ${r.nature[0].name} ${Math.round(r.nature[0].p * 100)}%`);
  return parts.length ? parts.join(" · ") : "暂无可推（需带威力的攻击 + 掉血% / 剩余%）";
}

function markNameOf(catalog: Catalog, id: string): string {
  const m = catalog.marks.find((x) => x.id === id);
  return m?.nameZh ?? m?.name ?? id;
}
function statusNameOf(catalog: Catalog, id: string): string {
  const s = catalog.statuses.find((x) => x.id === id);
  return s?.nameZh ?? s?.name ?? id;
}

/** 精灵当前状态 chip（增益 / 减益 / 印记 / 状态 / 计数器）——直接显示在卡上。 */
function StateChips({ catalog, adapters, active }: { catalog: Catalog; adapters: LabAdapters | null; active: ActiveSpriteState }) {
  const chips: { label: string; tone: string }[] = [];
  for (const k of PANEL_ORDER) {
    if (active.buffs[k]) chips.push({ label: `${STAT_LABEL[k]}+${Math.round(active.buffs[k] * 100)}%`, tone: "buff" });
    if (active.debuffs[k]) chips.push({ label: `${STAT_LABEL[k]}${Math.round(active.debuffs[k] * 100)}%`, tone: "debuff" });
  }
  for (const [id, n] of Object.entries(active.marks)) {
    const p = markPolarity(adapters, id);
    chips.push({ label: `${p === "positive" ? "正" : "负"}·${markNameOf(catalog, id)} ×${n}`, tone: p === "positive" ? "buff" : "debuff" });
  }
  for (const [id, n] of Object.entries(active.statuses)) chips.push({ label: `${statusNameOf(catalog, id)} ×${n}`, tone: "status" });
  for (const [k, v] of Object.entries(active.counters ?? {})) chips.push({ label: `${k}=${v}`, tone: "counter" });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <Badge
          key={i}
          variant="outline"
          className={cn("text-[10px] font-normal", c.tone === "buff" && "text-success", c.tone === "debuff" && "text-destructive")}
        >
          {c.label}
        </Badge>
      ))}
    </div>
  );
}

/** 可搜索的技能选择按钮（复用 `SkillSelector`）。 */
function SkillPickButton({
  catalog,
  spriteId,
  value,
  onSelect,
  placeholder = "选技能",
}: {
  catalog: Catalog;
  spriteId?: string;
  value?: string;
  onSelect: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const name = value ? catalog.allSkills.find((s) => s.id === value)?.name : "";
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-8 min-w-0 flex-1 justify-between gap-1 px-2 text-xs font-normal"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{name || placeholder}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">搜索</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="text-base">选择技能</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <SkillSelector
              catalog={catalog}
              spriteId={spriteId}
              value={value}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 选双方技能 → 登记结果的交互录入表单。 */
function InteractionForm({
  catalog,
  selfSpriteId,
  oppSpriteId,
  defaultSelfSkill,
  defaultOppSkill,
  onAdd,
}: {
  catalog: Catalog;
  selfSpriteId?: string;
  oppSpriteId?: string;
  defaultSelfSkill?: string;
  defaultOppSkill?: string;
  onAdd: (rec: { selfSkillId?: string; oppSkillId?: string; defender: SideKey; damage: number; dropPct?: number; remainPct?: number }) => void;
}) {
  const lastSubmit = useRef(0);
  const [selfSkillId, setSelfSkillId] = useState(defaultSelfSkill ?? "");
  const [oppSkillId, setOppSkillId] = useState(defaultOppSkill ?? "");
  const [defender, setDefender] = useState<SideKey>("opp");
  const [damage, setDamage] = useState(0);
  const [hpKind, setHpKind] = useState<"drop" | "remain">("drop");
  const [hpValue, setHpValue] = useState(0);

  function submit() {
    if (!damage) return;
    // 防重复提交（连点 / 重复触发会让同一交互记两条）。
    const now = Date.now();
    if (now - lastSubmit.current < 400) return;
    lastSubmit.current = now;
    onAdd({
      selfSkillId: selfSkillId || undefined,
      oppSkillId: oppSkillId || undefined,
      defender,
      damage,
      ...(hpValue > 0 ? (hpKind === "drop" ? { dropPct: hpValue } : { remainPct: hpValue }) : {}),
    });
    setDamage(0);
    setHpValue(0);
  }

  return (
    <div className="space-y-1.5 rounded-md border p-2">
      <Label className="text-xs">新增交互（选双方技能 → 登记结果）</Label>
      <div className="grid gap-1 min-[520px]:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-[10px] text-muted-foreground">我方技能</span>
          <SkillPickButton catalog={catalog} spriteId={selfSpriteId} value={selfSkillId} onSelect={setSelfSkillId} placeholder="选我方技能" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-[10px] text-muted-foreground">对方技能</span>
          <SkillPickButton catalog={catalog} spriteId={oppSpriteId} value={oppSkillId} onSelect={setOppSkillId} placeholder="选对方技能" />
        </div>
      </div>
      <div className="grid gap-1 min-[520px]:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-[10px] text-muted-foreground">受击方</span>
          <NativeSelect value={defender} onChange={(e) => setDefender(e.target.value as SideKey)} className="h-8 min-w-0 flex-1 text-xs">
            <option value="opp">对方</option>
            <option value="self">我方</option>
          </NativeSelect>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-[10px] text-muted-foreground">实测伤害</span>
          <Input type="number" value={damage || ""} onChange={(e) => setDamage(Number(e.target.value))} className="h-8 min-w-0 flex-1 text-xs" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-[10px] text-muted-foreground">血条</span>
        <NativeSelect value={hpKind} onChange={(e) => setHpKind(e.target.value as "drop" | "remain")} className="h-8 w-[72px] text-xs">
          <option value="drop">掉血%</option>
          <option value="remain">剩余%</option>
        </NativeSelect>
        <Input type="number" value={hpValue || ""} onChange={(e) => setHpValue(Number(e.target.value))} className="h-8 min-w-0 flex-1 text-xs" />
        <Button type="button" size="sm" className="h-8" disabled={!damage} onClick={submit}>
          新增记录
        </Button>
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">
        伤害填单段原始值；「掉血%」= 这一下血条下降几个点，「剩余%」= 打完后血条剩几个点。登记后按受击方自动反推。
      </p>
    </div>
  );
}

/** 只登记结果：受击方 + 伤害 + 血条。 */
function ResultForm({ initial, onSubmit }: { initial?: InteractionResult; onSubmit: (r: InteractionResult) => void }) {
  const [defender, setDefender] = useState<SideKey>(initial?.defender ?? "opp");
  const [damage, setDamage] = useState(initial?.damage ?? 0);
  const [hpKind, setHpKind] = useState<"drop" | "remain">(initial?.dropPct != null ? "drop" : initial?.remainPct != null ? "remain" : "drop");
  const [hpValue, setHpValue] = useState(initial?.dropPct ?? initial?.remainPct ?? 0);

  function submit() {
    if (!damage) return;
    const r: InteractionResult = { defender, damage };
    if (hpValue > 0) {
      if (hpKind === "drop") r.dropPct = hpValue;
      else r.remainPct = hpValue;
    }
    onSubmit(r);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-xs text-muted-foreground">受击方</span>
        <NativeSelect value={defender} onChange={(e) => setDefender(e.target.value as SideKey)} className="h-8 min-w-0 flex-1 text-xs">
          <option value="opp">对方</option>
          <option value="self">我方</option>
        </NativeSelect>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-xs text-muted-foreground">实测伤害</span>
        <Input type="number" value={damage || ""} onChange={(e) => setDamage(Number(e.target.value))} className="h-8 min-w-0 flex-1 text-xs" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-14 shrink-0 text-xs text-muted-foreground">血条</span>
        <NativeSelect value={hpKind} onChange={(e) => setHpKind(e.target.value as "drop" | "remain")} className="h-8 w-[84px] text-xs">
          <option value="drop">掉血%</option>
          <option value="remain">剩余%</option>
        </NativeSelect>
        <Input type="number" value={hpValue || ""} onChange={(e) => setHpValue(Number(e.target.value))} className="h-8 min-w-0 flex-1 text-xs" />
      </div>
      <Button type="button" size="sm" className="w-full" disabled={!damage} onClick={submit}>
        保存结果
      </Button>
    </div>
  );
}

export function PetLab() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [lab, setLab] = useState<LabStateInternal | null>(null);
  const [log, setLog] = useState<BattleEvent[]>([]);
  const [lastActions, setLastActions] = useState<{ self: EngineAction | null; opp: EngineAction | null }>({ self: null, opp: null });
  const [registerFor, setRegisterFor] = useState<Interaction | null>(null);
  const [previews, setPreviews] = useState<Record<string, { text: string; engineDamage?: number }>>({});
  const [adapters, setAdapters] = useState<LabAdapters | null>(null);
  const [frames, setFrames] = useState<LabFrame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfAction, setSelfAction] = useState<EngineAction | null>(null);
  const [oppAction, setOppAction] = useState<EngineAction | null>(null);
  const [addSide, setAddSide] = useState<SideKey | null>(null);
  const [config, setConfig] = useState<{ side: SideKey; id: string } | null>(null);
  const [openState, setOpenState] = useState<SideKey | null>(null);
  const [openIntel, setOpenIntel] = useState<SideKey | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    loadAdapters().then(setAdapters).catch(() => setAdapters(null));
    getCatalog()
      .then((c) => {
        setCatalog(c);
        const saved = loadLab();
        if (saved && saved.self?.pets?.length && saved.opp?.pets?.length) {
          setLab({
            self: saved.self,
            opp: saved.opp,
            intel: saved.intel ?? {},
            interactions: dedupeInteractions(saved.interactions ?? []),
            turn: saved.turn ?? 1,
            weather: saved.weather ?? null,
            seed: saved.seed ?? 42,
          });
        } else {
          setLab(newLab(c));
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // 每次局面变化即持久化（localStorage）。
  useEffect(() => {
    if (!lab) return;
    saveLab({
      self: lab.self,
      opp: lab.opp,
      intel: lab.intel,
      interactions: lab.interactions,
      turn: lab.turn,
      weather: lab.weather,
      seed: lab.seed,
    });
  }, [lab]);

  // 结算快捷键：Ctrl / Cmd + Enter。
  const settleRef = useRef<() => void>(() => {});
  useEffect(() => {
    settleRef.current = () => void settle();
  });

  // 引擎辅助反推（自动 / 手动）的稳定入口。
  const runPreviewRef = useRef<(it: Interaction) => void>(() => {});
  useEffect(() => {
    runPreviewRef.current = (it) => void runPreview(it);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        settleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 有结果、但还没引擎预览的交互，自动补跑（登记即自动反推；也覆盖旧记录）。
  useEffect(() => {
    if (!lab || !catalog) return;
    for (const it of lab.interactions) {
      if (it.result && it.selfSkillId && it.oppSkillId && previews[it.id] === undefined) runPreviewRef.current(it);
    }
  }, [lab, catalog, previews]);

  const selfEngine = useMemo(() => (lab ? sideToEngine(lab.self) : null), [lab]);
  const oppEngine = useMemo(() => (lab ? sideToEngine(lab.opp) : null), [lab]);
  const selfOptions = useMemo(() => (catalog && selfEngine ? deriveActions(selfEngine, catalog) : []), [catalog, selfEngine]);
  const oppOptions = useMemo(() => (catalog && oppEngine ? deriveActions(oppEngine, catalog) : []), [catalog, oppEngine]);

  const oppActivePet = lab ? lab.opp.pets.find((p) => p.id === lab.opp.activeId) ?? lab.opp.pets[0] : undefined;
  const selfActivePet = lab ? lab.self.pets.find((p) => p.id === lab.self.activeId) ?? lab.self.pets[0] : undefined;
  const oppSprite = catalog && oppActivePet ? spriteOf(catalog, oppActivePet.spriteId) : undefined;
  const selfSprite = catalog && selfActivePet ? spriteOf(catalog, selfActivePet.spriteId) : undefined;

  function patchPet(sideKey: SideKey, petId: string, mutate: (a: ActiveSpriteState) => void) {
    setLab((prev) => {
      if (!prev) return prev;
      const side = prev[sideKey];
      const pets = side.pets.map((p) => {
        if (p.id !== petId) return p;
        const next = structuredClone(p.state);
        mutate(next);
        return { ...p, state: next };
      });
      return { ...prev, [sideKey]: { ...side, pets } };
    });
  }

  function updateSetup(sideKey: SideKey, petId: string, setup: PetSetup) {
    if (!catalog) return;
    setLab((prev) => {
      if (!prev) return prev;
      const side = prev[sideKey];
      const pets = side.pets.map((p) => (p.id === petId ? applySetup(catalog, p, setup) : p));
      return { ...prev, [sideKey]: { ...side, pets } };
    });
  }

  function patchIntel(petId: string, mutate: (intel: LabIntel) => LabIntel) {
    setLab((prev) => {
      if (!prev) return prev;
      return { ...prev, intel: { ...prev.intel, [petId]: mutate(intelOf(prev.intel, petId)) } };
    });
  }

  function addPet(sideKey: SideKey, spriteId: string) {
    if (!catalog) return;
    setLab((prev) => {
      if (!prev) return prev;
      const pet = makePet(catalog, spriteId, emptySetup());
      const side = prev[sideKey];
      return { ...prev, [sideKey]: { ...side, pets: [...side.pets, pet] } };
    });
  }

  function removePet(sideKey: SideKey, petId: string) {
    setLab((prev) => {
      if (!prev) return prev;
      const side = prev[sideKey];
      if (side.pets.length <= 1) return prev;
      const pets = side.pets.filter((p) => p.id !== petId);
      const activeId = side.activeId === petId ? pets[0].id : side.activeId;
      return { ...prev, [sideKey]: { ...side, pets, activeId } };
    });
  }

  function setActive(sideKey: SideKey, petId: string) {
    setLab((prev) => (prev ? { ...prev, [sideKey]: { ...prev[sideKey], activeId: petId } } : prev));
  }

  /** 手动登记一条交互（双方技能 + 结果），登记后自动跑引擎辅助反推。 */
  function addInteraction(rec: {
    selfSkillId?: string;
    oppSkillId?: string;
    defender: SideKey;
    damage: number;
    dropPct?: number;
    remainPct?: number;
  }) {
    if (!lab) return;
    const turn = lab.interactions.length ? lab.interactions[lab.interactions.length - 1].turn : lab.turn;
    const result: InteractionResult = { defender: rec.defender, damage: rec.damage };
    if (rec.dropPct != null) result.dropPct = rec.dropPct;
    if (rec.remainPct != null) result.remainPct = rec.remainPct;
    const it: Interaction = { id: uid(), turn, selfSkillId: rec.selfSkillId, oppSkillId: rec.oppSkillId, result };
    setLab((prev) => (prev ? { ...prev, interactions: [...prev.interactions, it] } : prev));
    runPreviewRef.current(it);
  }

  /** 引擎结算预览 + 引擎辅助反推：按当前双方配置（含特性 / 减伤）+ 该交互技能跑一回合。
   *  用引擎预计伤害 / 实测伤害 的比值反推守方防御（伤害 ∝ 1/防御 ⇒ 防御 ≈ 当前防御 × 引擎伤害 / 实测伤害）。 */
  async function runPreview(it: Interaction) {
    if (!lab || !catalog || !it.selfSkillId || !it.oppSkillId) return;
    try {
      const r = await simulateTurn(
        toBattle(lab),
        { kind: "skill", skillId: it.selfSkillId },
        { kind: "skill", skillId: it.oppSkillId },
        lab.seed,
      );
      const dmg = r.log
        .filter((e) => e.type === "damage")
        .map((e) => `${e.side === "player" ? "我方" : "对方"} ${Number((e.data as Record<string, unknown>).value ?? 0)}`);
      let text = dmg.length ? `引擎伤害 ${dmg.join(" · ")}` : "本回合无伤害事件";
      let engineDamage: number | undefined;

      const def = it.result?.defender;
      if (def && it.result) {
        const targetSide = def === "self" ? "player" : "enemy";
        const ev = r.log.find((e) => e.type === "damage" && e.side === targetSide);
        const dSprite = def === "self" ? selfSprite : oppSprite;
        const dPet = def === "self" ? selfActivePet : oppActivePet;
        if (ev && dSprite && dPet) {
          const engineDmg = Number((ev.data as Record<string, unknown>).value ?? 0);
          const curDef = computeStats(catalog.stats ?? {}, { race: dSprite.race }, dPet.state.profile).defense;
          const est = engineDmg > 0 ? Math.round(curDef * (engineDmg / it.result.damage)) : 0;
          engineDamage = engineDmg;
          text += ` · 引擎辅助反推（${def === "self" ? "我方" : "对方"}）防御 ≈ ${est}（实测 ${it.result.damage}）`;
        }
      }
      setPreviews((p) => ({ ...p, [it.id]: { text, engineDamage } }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function settle() {
    if (!lab || !selfAction || !oppAction || !catalog) return;
    setBusy(true);
    try {
      const battle = toBattle(lab);
      const result = await simulateTurn(battle, selfAction, oppAction, lab.seed);
      setFrames((prev) => [...prev, { turn: lab.turn, state: battle, log, label: `第 ${lab.turn} 回合前` }]);
      setLab((prev) => {
        if (!prev) return prev;
        let next: LabStateInternal = {
          ...prev,
          turn: result.state.turn,
          weather: result.state.weather,
          self: fromEngineSide(prev.self, result.state.player),
          opp: fromEngineSide(prev.opp, result.state.enemy),
        };
        for (const [petId, action] of [
          [prev.opp.activeId, oppAction],
          [prev.self.activeId, selfAction],
        ] as const) {
          if (action.kind !== "skill" || !action.skillId) continue;
          const intel = intelOf(next.intel, petId);
          if (intel.skills.some((s) => s.id === action.skillId)) continue;
          next = { ...next, intel: { ...next.intel, [petId]: { ...intel, skills: [...intel.skills, { id: action.skillId, turn: prev.turn }] } } };
        }
        return next;
      });
      setLog(result.log);
      const counter = result.log.some((e) => (e.data as Record<string, unknown> | undefined)?.reacted === true);
      setLab((prev) =>
        prev
          ? {
              ...prev,
              interactions: [
                ...prev.interactions,
                {
                  id: uid(),
                  turn: lab.turn,
                  selfSkillId: selfAction.kind === "skill" ? selfAction.skillId : undefined,
                  oppSkillId: oppAction.kind === "skill" ? oppAction.skillId : undefined,
                  counter,
                },
              ],
            }
          : prev,
      );
      setLastActions({ self: selfAction, opp: oppAction });
      setSelfAction(null);
      setOppAction(null);
      if (result.terminal.ended) toast.success(`对局结束：${result.terminal.reason}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function restoreFrame(index: number) {
    const frame = frames[index];
    if (!frame || !lab) return;
    setLab({
      ...lab,
      turn: frame.state.turn,
      weather: frame.state.weather,
      self: fromEngineSide(lab.self, frame.state.player),
      opp: fromEngineSide(lab.opp, frame.state.enemy),
    });
    setLog(frame.log);
    setFrames((prev) => prev.slice(0, index));
    setLab((prev) => (prev ? { ...prev, interactions: prev.interactions.filter((i) => i.turn < frame.turn) } : prev));
    setLastActions({ self: null, opp: null });
    setSelfAction(null);
    setOppAction(null);
  }

  function resetTurn() {
    if (!lab) return;
    const fresh = newLab(catalog!);
    setLab({ ...fresh, intel: lab.intel });
    setLog([]);
    setLastActions({ self: null, opp: null });
    setFrames([]);
    setSelfAction(null);
    setOppAction(null);
  }

  if (error) {
    return (
      <Panel title="引擎未就绪">
        <p className="text-sm text-muted-foreground">
          {error}。请启动前端：<code className="rounded bg-muted px-1">pwsh scripts/dev.ps1</code>（127.0.0.1:26900）。
        </p>
      </Panel>
    );
  }
  if (!catalog || !lab) {
    return <p className="text-sm text-muted-foreground">正在加载引擎数据…</p>;
  }

  const bloodlines = bloodlineOptions(catalog).map((b) => ({ id: b.id, label: b.label }));
  const configPet = config ? lab[config.side].pets.find((p) => p.id === config.id) ?? null : null;
  const statePet = openState ? lab[openState].pets.find((p) => p.id === lab[openState].activeId) ?? lab[openState].pets[0] ?? null : null;
  const stateSpriteAdapter = statePet ? adapters?.sprites?.[statePet.spriteId] : undefined;
  const stateSpriteMax = stateSpriteAdapter?.marks
    ? {
        positive: stateSpriteAdapter.marks.maxPositive ?? DEFAULT_MARK_MAX,
        negative: stateSpriteAdapter.marks.maxNegative ?? DEFAULT_MARK_MAX,
      }
    : undefined;
  /** 一条交互 → 受击方观测。 */
  function observationFromInteraction(i: Interaction, sideKey: SideKey): Observation {
    const r = i.result as InteractionResult;
    const obs: Observation = {
      id: i.id,
      turn: i.turn,
      kind: "damage",
      attackerSkillId: (sideKey === "self" ? i.oppSkillId : i.selfSkillId) || undefined,
      defenderAction: (sideKey === "self" ? i.selfSkillId : i.oppSkillId) || undefined,
      damage: r.damage,
    };
    if (r.dropPct != null) obs.dropPct = r.dropPct;
    if (r.remainPct != null) obs.remainPct = r.remainPct;
    const p = previews[i.id];
    if (p?.engineDamage && p.engineDamage > 0) obs.engineDamage = p.engineDamage;
    return obs;
  }

  /** 某侧作为受击方的观测（供反推）。 */
  function observationsForSide(sideKey: SideKey): Observation[] {
    if (!lab) return [];
    return lab.interactions.filter((i) => i.result?.defender === sideKey).map((i) => observationFromInteraction(i, sideKey));
  }

  /** 对某侧的给定观测跑一次反推。 */
  function inferFor(sideKey: SideKey, observations: Observation[]): InferResult | null {
    if (!catalog) return null;
    const dSprite = sideKey === "self" ? selfSprite : oppSprite;
    const aSprite = sideKey === "self" ? oppSprite : selfSprite;
    const dPet = sideKey === "self" ? selfActivePet : oppActivePet;
    const aPet = sideKey === "self" ? oppActivePet : selfActivePet;
    if (!dSprite) return null;
    return inferOpponent({
      catalog,
      oppSprite: dSprite,
      oppActive: dPet?.state ?? emptyActive(),
      selfSprite: aSprite,
      selfActive: aPet?.state,
      observations,
    });
  }

  /** 交互记录展示文本。 */
  function interactionText(i: Interaction): string {
    if (!catalog) return "";
    const self = i.selfSkillId ? skillNameOf(catalog, i.selfSkillId) : "—";
    const opp = i.oppSkillId ? skillNameOf(catalog, i.oppSkillId) : "—";
    let text = `我方 ${self} ⚔ 对方 ${opp}`;
    if (i.counter) text += "（应对）";
    if (i.result) {
      const r = i.result;
      const hp = r.dropPct != null ? `（掉 ${r.dropPct}%）` : r.remainPct != null ? `（剩 ${r.remainPct}%）` : "";
      text += ` → ${r.defender === "self" ? "我方" : "对方"}受击 ${r.damage}${hp}`;
    }
    return text;
  }

  /** 一侧上场精灵卡：头像 + HP + 面板 + 场下切换 + 动作 + 状态 / 观测入口。 */
  function renderCard(sideKey: SideKey) {
    if (!catalog || !lab) return null;
    const title = sideKey === "self" ? "我方" : "对方";
    const side = lab[sideKey];
    const pet = side.pets.find((p) => p.id === side.activeId) ?? side.pets[0];
    if (!pet) return null;
    const sprite = spriteOf(catalog, pet.spriteId);
    const panel = sprite && catalog.stats ? computeStats(catalog.stats, { race: sprite.race }, pet.state.profile) : null;
    const pct = pet.state.maxHp > 0 ? Math.round((pet.state.hp / pet.state.maxHp) * 100) : 0;
    const options = sideKey === "self" ? selfOptions : oppOptions;
    const action = sideKey === "self" ? selfAction : oppAction;
    const onPick = sideKey === "self" ? setSelfAction : setOppAction;
    return (
      <Panel
        title={`① ${title}`}
        actions={
          <ActionPicker
            title={`${title}动作`}
            options={options}
            selected={action}
            onPick={onPick}
            catalog={catalog}
            spriteId={pet.spriteId}
          />
        }
        bodyClassName="space-y-3"
      >
        <div className="flex items-start gap-3">
          <SpriteImage sprite={sprite} size="lg" className="h-20 w-20 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{sprite?.name ?? "未选择"}</span>
              <span className="text-[11px] text-muted-foreground">
                {pet.setup.level}级 · {pet.setup.stars}★
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">能量 {pet.state.energy}</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
                <span>HP</span>
                <span>
                  {pet.state.hp} / {pet.state.maxHp}（{pct}%）
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div
                  className={cn("h-full rounded transition-all", pct <= 25 ? "bg-destructive" : "bg-primary")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            {panel && (
              <div className="grid grid-cols-3 gap-1 min-[520px]:grid-cols-6">
                {PANEL_ORDER.map((k) => (
                  <div key={k} className="rounded border bg-muted/30 px-1 py-0.5 text-center">
                    <div className="text-[9px] text-muted-foreground">{STAT_LABEL[k]}</div>
                    <div className="text-[11px] font-semibold tabular-nums">{panel[k]}</div>
                  </div>
                ))}
              </div>
            )}
            {sprite?.trait?.name && (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={sprite.trait.desc}>
                  <span className="text-foreground">特性 · {sprite.trait.name}</span>
                  {sprite.trait.desc ? `：${sprite.trait.desc}` : ""}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={pet.state.traitEnabled === false ? "outline" : "default"}
                  className="h-6 shrink-0 px-2 text-[10px]"
                  aria-pressed={pet.state.traitEnabled !== false}
                  onClick={() => patchPet(sideKey, pet.id, (a) => void (a.traitEnabled = a.traitEnabled === false))}
                >
                  {pet.state.traitEnabled === false ? "已禁用" : "启用"}
                </Button>
              </div>
            )}
            <StateChips catalog={catalog} adapters={adapters} active={pet.state} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">场下</span>
          {side.pets.map((p) => {
            const s = spriteOf(catalog, p.spriteId);
            const isActive = p.id === side.activeId;
            return (
              <button
                key={p.id}
                type="button"
                title={s?.name ?? p.spriteId}
                onClick={() => setActive(sideKey, p.id)}
                className={cn("rounded border p-0.5 transition-colors", isActive ? "ring-1 ring-primary" : "hover:bg-accent")}
              >
                <SpriteImage sprite={s} size="sm" className="h-7 w-7" />
              </button>
            );
          })}
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAddSide(sideKey)}>
            + 加精灵
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => setConfig({ side: sideKey, id: pet.id })}
          >
            配置资质
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            disabled={side.pets.length <= 1}
            onClick={() => removePet(sideKey, pet.id)}
          >
            删除上场
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setOpenState(sideKey)}>
            设置状态 / 技能
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setOpenIntel(sideKey)}>
            情报 / 观测
          </Button>
        </div>
      </Panel>
    );
  }

  /** 某侧 active 的情报卡：观测来源 = 另一侧的进攻（双方资质均未知，对称反推）。 */
  function renderIntel(sideKey: SideKey) {
    if (!catalog || !lab) return null;
    const defender = sideKey === "self" ? selfActivePet : oppActivePet;
    const attacker = sideKey === "self" ? oppActivePet : selfActivePet;
    const defenderSprite = sideKey === "self" ? selfSprite : oppSprite;
    const attackerSprite = sideKey === "self" ? oppSprite : selfSprite;
    if (!defender || !defenderSprite) return null;
    const intel = intelOf(lab.intel, defender.id);
    const infer = inferOpponent({
      catalog,
      oppSprite: defenderSprite,
      oppActive: defender.state,
      selfSprite: attackerSprite,
      selfActive: attacker?.state,
      observations: observationsForSide(sideKey),
    });
    const setup = defender.setup;
    const records = lab.interactions
      .filter((i) => i.result?.defender === sideKey)
      .map((i) => ({ id: i.id, text: interactionText(i) }));
    return (
      <IntelPanel
        key={`${sideKey}-${defender.id}`}
        catalog={catalog}
        intel={intel}
        infer={infer}
        records={records}
        title={sideKey === "self" ? "我方情报" : "对方情报"}
        bloodlines={bloodlines}
        onMarkNature={(nature) => {
          patchIntel(defender.id, (i) => ({ ...i, nature: { level: "known", value: nature, candidates: i.nature.candidates } }));
          updateSetup(sideKey, defender.id, { ...setup, nature });
        }}
        onMarkTalent={(talent: TalentMap) => {
          patchIntel(defender.id, (i) => ({ ...i, talent: { level: "known", value: talent, candidates: i.talent.candidates } }));
          updateSetup(sideKey, defender.id, { ...setup, talent });
        }}
        onMarkBloodline={(id) => {
          patchIntel(defender.id, (i) => ({ ...i, bloodline: { level: "known", value: id } }));
          updateSetup(sideKey, defender.id, { ...setup, bloodline: id ?? undefined });
        }}
        onClear={() => patchIntel(defender.id, () => newIntel())}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="精灵试验台"
        description="1v1 实时设置：自由摆 buff / 印记 / 状态 / 天气 / 技能，回合结算给伤害与血量反馈，并从观测反推双方性格 / 天分。离线运行，不读取画面、不自动操作。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">数据 {catalog.dataVersion}</Badge>
            <Badge variant="outline">回合 {lab.turn}</Badge>
            <Button type="button" size="sm" variant="outline" onClick={resetTurn}>
              重置局面
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 min-[860px]:grid-cols-2">
        {renderCard("self")}
        {renderCard("opp")}
      </div>

      {/* 结算与日志控制条 */}
      <Panel title="② 结算" bodyClassName="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>天气</span>
          <NativeSelect
            value={lab.weather?.id ?? ""}
            className="h-7 w-auto min-w-[110px] text-[11px]"
            onChange={(e) => {
              const id = e.target.value;
              setLab((prev) => (prev ? { ...prev, weather: id ? { id, turnsLeft: 5 } : null } : prev));
            }}
          >
            <option value="">无</option>
            {catalog.weather.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nameZh ?? w.name}
              </option>
            ))}
          </NativeSelect>
          {frames.length > 0 && (
            <>
              <span className="ml-2">回退</span>
              {frames.map((f, i) => (
                <Button key={i} type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => restoreFrame(i)}>
                  {f.label}
                </Button>
              ))}
            </>
          )}
          <span className="ml-auto">
            我方 {selfAction ? "✓" : "—"} · 对方 {oppAction ? "✓" : "—"} · Ctrl+Enter
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={busy || !selfAction || !oppAction} onClick={settle}>
            {busy ? "结算中…" : "结算一回合"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setLogOpen(true)}>
            日志（{log.length}）
          </Button>
        </div>
      </Panel>

      {/* 交互记录：选双方技能 → 登记结果 → 反推 */}
      <Panel
        title="交互记录"
        bodyClassName="space-y-2"
        actions={
          lab.interactions.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => {
                setLab((prev) => (prev ? { ...prev, interactions: [] } : prev));
                setPreviews({});
              }}
            >
              清空记录
            </Button>
          ) : undefined
        }
      >
        <InteractionForm
          key={`${lastActions.self?.skillId ?? ""}-${lastActions.opp?.skillId ?? ""}`}
          catalog={catalog}
          selfSpriteId={selfActivePet?.spriteId}
          oppSpriteId={oppActivePet?.spriteId}
          defaultSelfSkill={lastActions.self?.kind === "skill" ? lastActions.self.skillId : undefined}
          defaultOppSkill={lastActions.opp?.kind === "skill" ? lastActions.opp.skillId : undefined}
          onAdd={addInteraction}
        />
        {(["self", "opp"] as const).map((k) => {
          const obs = observationsForSide(k);
          if (!obs.length) return null;
          const r = inferFor(k, obs);
          return (
            <div key={k} className="rounded-md border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
              当前反推（{k === "self" ? "我方" : "对方"}，{obs.length} 条）：{r ? describeInfer(r) : "—"}
            </div>
          );
        })}
        {lab.interactions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            还没有交互记录。结算会自动记一条；也可在上方选双方技能后登记结果。
          </p>
        ) : (
          <div className="space-y-1">
            {lab.interactions.map((it) => {
              const resultInfer = it.result
                ? inferFor(it.result.defender, [observationFromInteraction(it, it.result.defender)])
                : null;
              return (
                <div key={it.id} className="rounded-md border px-2 py-1.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-14 shrink-0 text-muted-foreground">第 {it.turn} 回合</span>
                    <span className="min-w-0 flex-1">{interactionText(it)}</span>
                    {it.selfSkillId && it.oppSkillId && (
                      <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => void runPreview(it)}>
                        引擎预览
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={it.result ? "ghost" : "outline"}
                      className={cn("h-6 px-2 text-[10px]", it.result && "text-muted-foreground")}
                      onClick={() => setRegisterFor(it)}
                    >
                      {it.result ? "改" : "登记结果"}
                    </Button>
                  </div>
                  {previews[it.id] && (
                    <div className="mt-0.5 pl-[3.5rem] text-[10px] text-muted-foreground">引擎预览：{previews[it.id].text}</div>
                  )}
                  {resultInfer && (
                    <div className="mt-0.5 pl-[3.5rem] text-[10px] text-muted-foreground">
                      → 反推（{it.result?.defender === "self" ? "我方" : "对方"}）：{describeInfer(resultInfer)}
                      {resultInfer.notes.map((n, ni) => (
                        <div key={ni} className="text-amber-600 dark:text-amber-500">
                          · {n}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <PetSelectorDialog
        open={addSide !== null}
        onOpenChange={(open) => !open && setAddSide(null)}
        catalog={catalog}
        onSelect={(spriteId) => {
          if (addSide) addPet(addSide, spriteId);
          setAddSide(null);
        }}
        title="加精灵"
      />

      {config && configPet && (
        <PetConfigDialog
          open
          onOpenChange={(open) => !open && setConfig(null)}
          catalog={catalog}
          spriteId={configPet.spriteId}
          setup={configPet.setup}
          onSetupChange={(setup) => updateSetup(config.side, configPet.id, setup)}
        />
      )}

      {/* 全局弹窗：设置状态 */}
      <Dialog open={openState !== null} onOpenChange={(open) => !open && setOpenState(null)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-base">{openState === "self" ? "我方状态" : "对方状态"}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {statePet ? (
              <StateEditor
                catalog={catalog}
                active={statePet.state}
                adapters={adapters}
                spriteMax={stateSpriteMax}
                onPatch={(mutate) => openState && patchPet(openState, statePet.id, mutate)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">未选择精灵。</p>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* 全局弹窗：情报 / 观测反推 */}
      <Dialog open={openIntel !== null} onOpenChange={(open) => !open && setOpenIntel(null)}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-base">{openIntel === "self" ? "我方情报 / 观测" : "对方情报 / 观测"}</DialogTitle>
          </DialogHeader>
          <DialogBody>{openIntel && renderIntel(openIntel)}</DialogBody>
        </DialogContent>
      </Dialog>

      {/* 全局弹窗：对战日志 */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="text-base">对战日志</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {lab.interactions.length > 0 && (
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">交互记录</div>
                {lab.interactions.map((it) => (
                  <div key={it.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-muted-foreground">第 {it.turn} 回合</span>
                    <span className="min-w-0 flex-1">{interactionText(it)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">事件明细</div>
              {log.length === 0 && <p className="text-sm text-muted-foreground">暂无事件。</p>}
              {log.map((e, i) => {
                const row = logRowOf(e, catalog);
                return (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    {row.kind && <Badge variant="outline" className="shrink-0 text-[10px]">{row.kind}</Badge>}
                    <span className="text-muted-foreground">
                      {row.side !== "system" && (row.side === "player" ? "我方" : "对方")} {row.source ? `${row.source} ` : ""}
                    </span>
                    <span className="min-w-0 flex-1">{row.text}</span>
                  </div>
                );
              })}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* 全局弹窗：登记交互结果 */}
      <Dialog open={registerFor !== null} onOpenChange={(o) => !o && setRegisterFor(null)}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-base">登记结果</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {registerFor && (
              <>
                <p className="mb-2 text-xs text-muted-foreground">{interactionText(registerFor)}</p>
                <ResultForm
                  initial={registerFor.result}
                  onSubmit={(result) => {
                    const updated: Interaction = { ...registerFor, result };
                    setLab((prev) =>
                      prev
                        ? { ...prev, interactions: prev.interactions.map((i) => (i.id === registerFor.id ? updated : i)) }
                        : prev,
                    );
                    setRegisterFor(null);
                    runPreviewRef.current(updated);
                  }}
                />
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
