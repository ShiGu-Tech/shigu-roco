"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "cn";
import { Panel } from "@/components/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SIDE_NAME } from "@/modules/battle/side-labels";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import { aggregateTrace } from "./collect";
import { LifecycleGraph } from "./lifecycle-graph";
import { clearAtlasTrace, readAtlasTrace } from "./storage";
import type { AtlasMechanism, AtlasTrace } from "./types";

const OWNER_LABELS: Record<string, string> = {
  skill: "技能",
  trait: "特性",
  status: "状态",
  mark: "印记",
  weather: "天气",
  system: "系统",
};

const ACTION_KIND_LABELS: Record<string, string> = {
  skill: "技能",
  switch: "换人",
  defend: "防御",
  energy: "聚能",
  wish: "愿力魔法",
  leader: "首领化",
};

/** 顶部轨迹条：来源 / 步数 / 最近操作 + 清除。 */
function TraceBar({ trace, onClear }: { trace: AtlasTrace | null; onClear: () => void }) {
  if (!trace) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
        还没有轨迹——去<a className="mx-1 text-primary underline-offset-4 hover:underline" href="/engine/debug">调试沙盒</a>单步，或在
        <a className="mx-1 text-primary underline-offset-4 hover:underline" href="/record">对战台</a>打一回合，回来点亮此图。
      </div>
    );
  }
  const last = trace.steps[trace.steps.length - 1];
  const actionsText =
    last?.actions
      .map((action) => `${action.side === "player" ? SIDE_NAME.player : SIDE_NAME.enemy} ${action.label ?? ACTION_KIND_LABELS[action.kind] ?? action.kind}`)
      .join(" · ") ?? "—";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2 text-[12px]">
      <Badge variant="outline" className="px-1.5 py-0.5 text-[10px]">{trace.source === "debug" ? "调试沙盒" : "对战台"}</Badge>
      <span className="text-muted-foreground tnum">
        {trace.steps.length} 步 · 最近回合 {last?.turn ?? "—"}
      </span>
      <span className="min-w-0 truncate text-foreground/80">
        最近操作：<span className="tnum">{actionsText}</span>
      </span>
      <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-[11px] text-muted-foreground" onClick={onClear}>
        清除轨迹
      </Button>
    </div>
  );
}

/** 引擎全景图：生命周期骨架 + 触发器分组计数 + 轨迹点亮；点机制下钻单机制程序图。 */
export function AtlasView({ onOpenMechanism }: { onOpenMechanism: (id: string) => void }) {
  const [items, setItems] = useState<AtlasMechanism[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<AtlasTrace | null>(null);
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/engine/workbench/mechanisms", { cache: "no-store" });
        if (!res.ok) throw new Error(`引擎接口不可用（${res.status}）`);
        const payload = (await res.json()) as { mechanisms: AtlasMechanism[] };
        if (cancelled) return;
        setItems(payload.mechanisms);
        setTrace(readAtlasTrace());
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, AtlasMechanism[]>();
    for (const item of items ?? []) {
      const list = map.get(item.trigger);
      if (list) list.push(item);
      else map.set(item.trigger, [item]);
    }
    return map;
  }, [items]);

  const glow = useMemo(() => aggregateTrace(trace), [trace]);

  /** 轨迹中每个机制命中过的效果类型（去重），供机制卡片挂标签。 */
  const mechanismEffects = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const step of trace?.steps ?? []) {
      for (const bucket of step.fired) {
        for (const mech of bucket.mechanisms) {
          let set = map.get(mech.id);
          if (!set) {
            set = new Set();
            map.set(mech.id, set);
          }
          for (const effect of mech.effects) set.add(effect);
        }
      }
    }
    return map;
  }, [trace]);

  const clearTrace = useCallback(() => {
    clearAtlasTrace();
    setTrace(null);
    toast.info("已清除轨迹");
  }, []);

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
        {error}　请先启动开发服务（`pwsh scripts/dev.ps1`）。
      </div>
    );
  }
  if (!items) return <p className="text-[13px] text-muted-foreground">正在加载机制数据…</p>;

  const selectedList = selectedTrigger ? (grouped.get(selectedTrigger) ?? []) : [];

  return (
    <div className="space-y-3">
      <TraceBar trace={trace} onClear={clearTrace} />

      <div className="grid grid-cols-1 gap-3 min-[860px]:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="回合生命周期 · 执行流程" className="min-h-[360px]" bodyClassName="space-y-3">
          <LifecycleGraph
            grouped={grouped}
            glow={glow}
            selectedTrigger={selectedTrigger}
            onSelectTrigger={(trigger) => setSelectedTrigger((prev) => (prev === trigger ? null : trigger))}
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground/70">图例</span>
            <span>方块 = 阶段 · 实线箭头 = 执行先后</span>
            <span>虚线框 / 虚线连线 = 未接线 · 旁路</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-primary" /> 主色 = 本轨迹命中
            </span>
            <span>滚轮缩放 · 拖拽平移</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            图内覆盖引擎全部 <span className="tnum">29</span> 个时机（触发器）：左侧 10 个方块是主序列（15 个时机），右上是「实体级联 / 被动查询」两个旁路，右下是「其余未接线」6 个时机（对局结束已作主序列收尾）。小卡里的「N 条机制」= 挂在该时机上的机制条数：一个技能 / 特性 / 状态可拆成多条触发规则（技能自带的基础伤害算一条、额外特效各算一条），单条规则内还可再含多个效果；基础伤害规则由技能自动生成。
          </p>
        </Panel>

        <Panel
          title={selectedTrigger ? `触发器 · ${triggerMetaOf(selectedTrigger).title}` : "详情"}
          className="min-h-[360px]"
          bodyClassName="min-h-0 overflow-y-auto"
        >
          {!selectedTrigger ? (
            <p className="text-[12px] text-muted-foreground">
              点流程图中任一触发器查看其挂载的机制；命中过的机制会高亮并显示次数，点击可进入该机制的程序图。
              {items.length ? <span className="tnum">（共 {items.length} 条机制）</span> : null}
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground tnum">
                {selectedList.length} 条机制
                {glow.get(selectedTrigger)?.mechanisms.size
                  ? ` · 本轨迹命中 ${glow.get(selectedTrigger)!.mechanisms.size} 种`
                  : " · 本轨迹未命中"}
              </p>
              {selectedList.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">该触发器暂无挂载机制。</p>
              ) : (
                <div className="space-y-1">
                  {selectedList.map((item) => {
                    const count = glow.get(selectedTrigger)?.mechanisms.get(item.id) ?? 0;
                    const effects = count ? [...(mechanismEffects.get(item.id) ?? [])] : [];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onOpenMechanism(item.id)}
                        className={cn(
                          "block w-full rounded-md border px-2.5 py-1.5 text-left transition-colors",
                          count ? "border-primary/70 bg-primary/10" : "border-border bg-card hover:bg-accent/50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-medium">{item.ownerName}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {count ? (
                              <span className="rounded-sm bg-primary px-1 py-0.5 text-[10px] font-medium text-primary-foreground tnum">
                                ×{count}
                              </span>
                            ) : null}
                            <span className="text-[10px] text-muted-foreground">{OWNER_LABELS[item.ownerType] ?? item.ownerType}</span>
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="tnum truncate text-[10px] text-muted-foreground">{item.id}</span>
                          {item.unsupported ? (
                            <Badge variant="destructive" className="px-1 py-0 text-[10px]">未支持</Badge>
                          ) : null}
                          {item.registered ? (
                            <Badge variant="outline" className="px-1 py-0 text-[10px]">自动生成</Badge>
                          ) : null}
                          {effects.map((effect) => (
                            <span key={effect} className="rounded-sm bg-secondary px-1 py-0.5 text-[10px] text-secondary-foreground">
                              {effect}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
