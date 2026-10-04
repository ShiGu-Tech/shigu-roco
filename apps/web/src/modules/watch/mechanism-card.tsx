"use client";

/** 机制定义卡（只读）+ 观战「触发 / 机制 / 效果」胶囊。
 *
 * 胶囊 hover → 轻量定义卡，点击 → 弹窗完整定义（归属 / 触发 / 条件 / 效果）；数据取自
 * `GET /api/engine/workbench/mechanisms`（`WorkbenchMechanism.def`）。词汇汉化复用工作台字典，不引引擎。
 */

import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Condition, EffectDefinition } from "@/modules/engine/mechanisms/types";
import { CONDITION_OP_LABELS, effectVocabularyOf, triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";
import { valueText } from "@/modules/workbench/dsl-graph";
import { OWNER_TYPE_LABELS } from "@/modules/workbench/labels";
import type { WorkbenchMechanism } from "@/modules/workbench/types";

function ConditionView({ cond }: { cond: Condition }) {
  if ("allOf" in cond || "anyOf" in cond) {
    const items = "allOf" in cond ? cond.allOf : cond.anyOf;
    return (
      <div className="text-[11px]">
        <span className="text-muted-foreground">{("allOf" in cond ? "全部满足" : "任一满足") + "："}</span>
        <div className="mt-0.5 space-y-0.5 border-l pl-2">
          {items.map((child, i) => (
            <ConditionView key={i} cond={child} />
          ))}
        </div>
      </div>
    );
  }
  if ("not" in cond) {
    return (
      <div className="text-[11px]">
        <span className="text-muted-foreground">取反：</span>
        <ConditionView cond={cond.not} />
      </div>
    );
  }
  const value = cond.valueFrom !== undefined ? JSON.stringify(cond.valueFrom) : valueText(cond.value);
  return (
    <div className="text-[11px] leading-5">
      <span className="break-all tnum">{cond.path}</span>{" "}
      <span className="text-muted-foreground">{CONDITION_OP_LABELS[cond.op] ?? cond.op}</span>{" "}
      <span className="break-all tnum">{value}</span>
    </div>
  );
}

function EffectView({ effect, highlight }: { effect: EffectDefinition; highlight: boolean }) {
  const vocab = effectVocabularyOf(effect.type);
  const raw = effect as unknown as Record<string, unknown>;
  const keys = Object.keys(raw).filter((key) => key !== "type" && raw[key] !== undefined);
  return (
    <div className={highlight ? "rounded-sm bg-primary/10 p-1.5" : "p-1.5"}>
      <div className="text-[11px] font-medium">{vocab.title}</div>
      {keys.length ? (
        <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
          {keys.map((key) => (
            <span key={key}>
              {vocab.params?.[key] ?? key}：<span className="break-all text-foreground tnum">{valueText(raw[key], key)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 只读机制定义卡（hover 轻量 / dialog 完整）。 */
export function MechanismDefCard({ mech, id, effectType, mode = "dialog" }: { mech: WorkbenchMechanism | null; id: string; effectType?: string; mode?: "hover" | "dialog" }) {
  if (!mech) {
    return (
      <div className="space-y-1 p-3 text-[11px]">
        <p className="font-medium">未找到机制定义</p>
        <p className="break-all text-muted-foreground tnum">{id}</p>
        <p className="text-muted-foreground">该机制可能已下线或为运行时生成。</p>
      </div>
    );
  }
  const def = mech.def;
  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-semibold">{mech.ownerName}</span>
        <Badge variant="outline">{OWNER_TYPE_LABELS[mech.ownerType] ?? mech.ownerType}</Badge>
        {mech.registered ? <Badge variant="outline" className="px-1 py-0 text-[10px]">自动生成</Badge> : null}
        {def.oncePerTurn ? <Badge variant="secondary" className="px-1 py-0 text-[10px]">每回合一次</Badge> : null}
        {mech.unsupported ? <Badge variant="destructive" className="px-1 py-0 text-[10px]">含未支持</Badge> : null}
      </div>
      <p className="break-all text-[11px] text-muted-foreground tnum">{mech.id}</p>
      <p className="text-[11px]">
        <span className="text-muted-foreground">触发：</span>
        {triggerMetaOf(def.trigger).title}
      </p>
      {mode === "dialog" && def.when?.length ? (
        <div>
          <p className="text-[11px] text-muted-foreground">条件</p>
          <div className="mt-0.5 space-y-0.5">
            {def.when.map((cond, i) => (
              <ConditionView key={i} cond={cond} />
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="text-[11px] text-muted-foreground">效果（{def.effects.length}）</p>
        <div className="mt-0.5 space-y-0.5">
          {def.effects.map((effect, i) => (
            <EffectView key={i} effect={effect} highlight={mode === "dialog" && effect.type === effectType} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InteractiveChip({ label, hint, onClick, card, outline }: { label: string; hint: string; onClick: () => void; card: React.ReactNode; outline?: boolean }) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          title={hint}
          onClick={onClick}
          className={`rounded-sm border px-1.5 py-0.5 text-[10px] hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${outline ? "bg-background text-muted-foreground" : "bg-secondary text-secondary-foreground"}`}
        >
          {label}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-[300px] p-0">{card}</HoverCardContent>
    </HoverCard>
  );
}

/** 一条机制命中：`[触发] 机制 [效果]`，机制 / 效果胶囊可查看定义。 */
export function MechanismHit({ hit, byId, onOpen }: { hit: { trigger: string; mechanismId: string; effectType: string }; byId: Map<string, WorkbenchMechanism>; onOpen: (id: string, effectType?: string) => void }) {
  const info = byId.get(hit.mechanismId) ?? null;
  const owner = info?.ownerName ?? hit.mechanismId;
  const effectTitle = effectVocabularyOf(hit.effectType).title;
  const card = <MechanismDefCard mech={info} id={hit.mechanismId} effectType={hit.effectType} mode="hover" />;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{triggerMetaOf(hit.trigger).title}</Badge>
      <InteractiveChip label={owner} hint="查看机制定义" onClick={() => onOpen(hit.mechanismId)} card={card} />
      <InteractiveChip label={effectTitle} hint="查看效果定义" outline onClick={() => onOpen(hit.mechanismId, hit.effectType)} card={card} />
    </div>
  );
}
