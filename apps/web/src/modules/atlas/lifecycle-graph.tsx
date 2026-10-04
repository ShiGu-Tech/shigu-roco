"use client";

/** 回合生命周期全景图（React Flow 节点-连线）：阶段 = 方块节点，执行先后 = 带箭头连线。
 *
 * **覆盖全部 29 个触发器**：主序列 15（10 个阶段节点）；旁路 7（实体级联 6 + 被动查询 1）；未接线 6（对局结束作收尾节点）。
 *
 * 两种布局：`full`（/engine 全景，蛇形三列 + 触发器小卡）与 `compact`（对战台内嵌小号，两行 + 触发器文字行）。
 * 两种点亮来源：`glow`（轨迹一次性点亮）与 `litTriggers` + `activeTrigger`（回放按序逐个点亮）。
 */

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { cn } from "cn";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import type { TriggerGlow } from "./collect";
import { ATLAS_STAGES, UNWIRED_TRIGGERS, type AtlasStage } from "./lifecycle";
import type { AtlasMechanism } from "./types";

const STAGE_BY_ID = new Map(ATLAS_STAGES.map((stage) => [stage.id, stage]));

const BATTLE_END: AtlasStage = { id: "battle-end", title: triggerMetaOf("battleEnd").title, note: "未接线 · 模拟器暂不派发", triggers: [] };
const UNWIRED_STAGE: AtlasStage = {
  id: "unwired",
  title: "其余未接线",
  note: "词表已有 · 模拟器暂不派发",
  triggers: UNWIRED_TRIGGERS.filter((trigger) => trigger !== "battleEnd"),
};
const SYNTHETIC: Record<string, AtlasStage> = { "battle-end": BATTLE_END, unwired: UNWIRED_STAGE };

const CONDITIONAL: Record<string, string> = {
  switch: "仅换人时",
  damage: "产生伤害时",
  death: "有单位倒下时",
};

const HANDLE = "!h-2 !w-2 !min-h-0 !min-w-0 !border-none !bg-transparent";

/** 触发器小卡数据。 */
export interface TriggerChipData {
  name: string;
  title: string;
  count: number;
  steps: number;
  hit: boolean;
  active: boolean;
}

/** 触发器小卡（full 布局用；可点：打开右侧详情）。 */
export function TriggerChip({ data, selected, onClick }: { data: TriggerChipData; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "nodrag flex min-w-[118px] flex-col gap-0.5 rounded-md border px-1.5 py-0.5 text-left transition-all",
        data.active
          ? "scale-105 border-primary bg-primary/25 ring-2 ring-primary shadow-sm"
          : data.hit
            ? "border-primary bg-primary/10"
            : "border-border bg-background hover:bg-accent/50",
        selected && !data.active && "ring-1 ring-primary",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium">{data.title}</span>
        {data.hit ? (
          <span className="shrink-0 rounded-sm bg-primary px-1 text-[10px] font-medium text-primary-foreground tnum">{data.steps || "·"}</span>
        ) : null}
      </span>
      <span className="text-[10px] text-muted-foreground tnum">{data.count} 条机制</span>
    </button>
  );
}

interface StageNodeData extends Record<string, unknown> {
  index?: number;
  title: string;
  note?: string;
  condition?: string;
  count: number;
  triggers: TriggerChipData[];
  glow: boolean;
  muted?: boolean;
  side?: boolean;
  compact: boolean;
  selectedTrigger: string | null;
  onSelectTrigger: (trigger: string) => void;
}

function Handles() {
  return (
    <>
      <Handle id="tt" type="target" position={Position.Top} className={HANDLE} />
      <Handle id="tb" type="target" position={Position.Bottom} className={HANDLE} />
      <Handle id="tl" type="target" position={Position.Left} className={HANDLE} />
      <Handle id="tr" type="target" position={Position.Right} className={HANDLE} />
      <Handle id="st" type="source" position={Position.Top} className={HANDLE} />
      <Handle id="sb" type="source" position={Position.Bottom} className={HANDLE} />
      <Handle id="sl" type="source" position={Position.Left} className={HANDLE} />
      <Handle id="sr" type="source" position={Position.Right} className={HANDLE} />
    </>
  );
}

function StageNode({ data }: NodeProps<Node<StageNodeData, "stage">>) {
  const frame = cn(
    "rounded-lg border bg-card shadow-sm transition-colors",
    data.glow ? "border-primary ring-2 ring-primary/30" : data.muted ? "border-dashed bg-muted/40" : data.side ? "border-dashed border-foreground/25" : "border-border",
  );

  if (data.compact) {
    return (
      <div className={cn(frame, "w-[168px] p-1.5")}>
        <Handles />
        <div className="flex items-baseline gap-1">
          {data.index ? <span className="text-[9px] font-semibold text-muted-foreground tnum">{data.index}</span> : null}
          <span className="truncate text-[11px] font-semibold">{data.title}</span>
          {data.condition ? <span className="ml-auto shrink-0 rounded-full bg-secondary px-1 text-[8px] text-secondary-foreground">{data.condition}</span> : null}
        </div>
        <div className="mt-1 space-y-0.5">
          {data.triggers.length ? (
            data.triggers.map((trigger) => (
              <div
                key={trigger.name}
                className={cn(
                  "flex items-center gap-1 rounded-sm px-1 text-[9px] leading-4",
                  trigger.active ? "bg-primary font-medium text-primary-foreground" : trigger.hit ? "bg-primary/15 text-foreground" : "text-muted-foreground",
                )}
              >
                {trigger.active ? <span aria-hidden>▶</span> : <span className="opacity-40" aria-hidden>·</span>}
                <span className="truncate">{trigger.title}</span>
              </div>
            ))
          ) : (
            <div className="px-1 text-[9px] text-muted-foreground">{data.muted ? "未接线" : "无触发器"}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(frame, "w-[280px] p-2.5")}>
      <Handles />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {data.index ? <span className="text-[10px] font-semibold text-muted-foreground tnum">{data.index}</span> : null}
        <span className="text-[12px] font-semibold">{data.title}</span>
        {data.condition ? <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] text-secondary-foreground">{data.condition}</span> : null}
        <span className="ml-auto text-[10px] text-muted-foreground tnum">{data.count} 条机制</span>
      </div>
      {data.note ? <div className="mt-0.5 text-[10px] text-muted-foreground">{data.note}</div> : null}
      {data.triggers.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.triggers.map((trigger) => (
            <TriggerChip key={trigger.name} data={trigger} selected={data.selectedTrigger === trigger.name} onClick={() => data.onSelectTrigger(trigger.name)} />
          ))}
        </div>
      ) : (
        <div className="mt-1.5 text-[10px] text-muted-foreground">{data.muted ? "未接线" : "内置动作，无触发器"}</div>
      )}
    </div>
  );
}

const nodeTypes = { stage: StageNode };

interface NodePos { id: string; x: number; y: number; index?: number; muted?: boolean; side?: boolean }

const NODES_FULL: NodePos[] = [
  { id: "open", x: 0, y: 0, index: 1 },
  { id: "turn-start", x: 0, y: 190, index: 2 },
  { id: "wish", x: 0, y: 380, index: 3 },
  { id: "switch", x: 380, y: 380, index: 4 },
  { id: "declare", x: 380, y: 190, index: 5 },
  { id: "resolve", x: 380, y: 0, index: 6 },
  { id: "damage", x: 760, y: 0, index: 7 },
  { id: "turn-end", x: 760, y: 190, index: 8 },
  { id: "death", x: 760, y: 380, index: 9 },
  { id: "battle-end", x: 760, y: 600, index: 10, muted: true },
  { id: "cascade", x: 1140, y: 130, side: true },
  { id: "passive", x: 1140, y: 400, side: true },
  { id: "unwired", x: 1140, y: 600, muted: true },
];

/** 小号布局：两行主序列（1–5 下行 → 6–10 折返）+ 旁路 / 未接线一行。 */
const NODES_COMPACT: NodePos[] = [
  { id: "open", x: 0, y: 0, index: 1 },
  { id: "turn-start", x: 230, y: 0, index: 2 },
  { id: "wish", x: 460, y: 0, index: 3 },
  { id: "switch", x: 690, y: 0, index: 4 },
  { id: "declare", x: 920, y: 0, index: 5 },
  { id: "resolve", x: 920, y: 190, index: 6 },
  { id: "damage", x: 690, y: 190, index: 7 },
  { id: "turn-end", x: 460, y: 190, index: 8 },
  { id: "death", x: 230, y: 190, index: 9 },
  { id: "battle-end", x: 0, y: 190, index: 10, muted: true },
  { id: "cascade", x: 690, y: 380, side: true },
  { id: "passive", x: 920, y: 380, side: true },
  { id: "unwired", x: 0, y: 380, muted: true },
];

interface Link { from: string; fromHandle: string; to: string; toHandle: string; label?: string; dashed?: boolean }

const LINKS_FULL: Link[] = [
  { from: "open", fromHandle: "sb", to: "turn-start", toHandle: "tt" },
  { from: "turn-start", fromHandle: "sb", to: "wish", toHandle: "tt" },
  { from: "wish", fromHandle: "sr", to: "switch", toHandle: "tl" },
  { from: "switch", fromHandle: "st", to: "declare", toHandle: "tb" },
  { from: "declare", fromHandle: "st", to: "resolve", toHandle: "tb" },
  { from: "resolve", fromHandle: "sr", to: "damage", toHandle: "tl" },
  { from: "damage", fromHandle: "sb", to: "turn-end", toHandle: "tt" },
  { from: "turn-end", fromHandle: "sb", to: "death", toHandle: "tt" },
  { from: "death", fromHandle: "sb", to: "battle-end", toHandle: "tt", label: "任一方全灭" },
  { from: "death", fromHandle: "sl", to: "turn-start", toHandle: "tr", label: "下一回合（回环）" },
  { from: "damage", fromHandle: "sr", to: "cascade", toHandle: "tl", label: "效果后 · 随时派发", dashed: true },
  { from: "damage", fromHandle: "sr", to: "passive", toHandle: "tl", label: "按需读取", dashed: true },
];

const LINKS_COMPACT: Link[] = [
  { from: "open", fromHandle: "sr", to: "turn-start", toHandle: "tl" },
  { from: "turn-start", fromHandle: "sr", to: "wish", toHandle: "tl" },
  { from: "wish", fromHandle: "sr", to: "switch", toHandle: "tl" },
  { from: "switch", fromHandle: "sr", to: "declare", toHandle: "tl" },
  { from: "declare", fromHandle: "sb", to: "resolve", toHandle: "tt" },
  { from: "resolve", fromHandle: "sl", to: "damage", toHandle: "tr" },
  { from: "damage", fromHandle: "sl", to: "turn-end", toHandle: "tr" },
  { from: "turn-end", fromHandle: "sl", to: "death", toHandle: "tr" },
  { from: "death", fromHandle: "sl", to: "battle-end", toHandle: "tr", label: "全灭" },
  { from: "death", fromHandle: "st", to: "turn-start", toHandle: "tb", label: "下一回合" },
  { from: "damage", fromHandle: "sb", to: "cascade", toHandle: "tt", label: "效果后", dashed: true },
  { from: "resolve", fromHandle: "sb", to: "passive", toHandle: "tt", label: "按需", dashed: true },
];

function stageOf(id: string): AtlasStage {
  return SYNTHETIC[id] ?? STAGE_BY_ID.get(id)!;
}

interface GraphProps {
  grouped?: Map<string, AtlasMechanism[]>;
  glow?: Map<string, TriggerGlow>;
  selectedTrigger?: string | null;
  onSelectTrigger?: (trigger: string) => void;
  litTriggers?: Set<string>;
  activeTrigger?: string | null;
  layout?: "full" | "compact";
  containerClassName?: string;
}

const EMPTY_GROUPED = new Map<string, AtlasMechanism[]>();
const EMPTY_GLOW = new Map<string, TriggerGlow>();

export function triggerChipDataOf(
  trigger: string,
  grouped: Map<string, AtlasMechanism[]>,
  glow: Map<string, TriggerGlow>,
  litTriggers?: Set<string>,
  activeTrigger?: string | null,
): TriggerChipData {
  const g = glow.get(trigger);
  const hit = !!g || !!litTriggers?.has(trigger);
  return {
    name: trigger,
    title: triggerMetaOf(trigger).title,
    count: grouped.get(trigger)?.length ?? 0,
    steps: g?.steps ?? 0,
    hit,
    active: activeTrigger === trigger,
  };
}

export function LifecycleGraph({
  grouped = EMPTY_GROUPED,
  glow = EMPTY_GLOW,
  selectedTrigger = null,
  onSelectTrigger,
  litTriggers,
  activeTrigger,
  layout = "full",
  containerClassName = "h-[560px] w-full min-[860px]:h-[600px]",
}: GraphProps) {
  const compact = layout === "compact";
  const positions = compact ? NODES_COMPACT : NODES_FULL;
  const links = compact ? LINKS_COMPACT : LINKS_FULL;
  const noop = onSelectTrigger ?? (() => {});

  const chipOf = (trigger: string) => triggerChipDataOf(trigger, grouped, glow, litTriggers, activeTrigger);
  const stageLit = (id: string) => stageOf(id).triggers.some((trigger) => chipOf(trigger).hit);

  const nodes = useMemo<Node<StageNodeData, "stage">[]>(
    () =>
      positions.map(({ id, x, y, index, muted, side }) => {
        const stage = stageOf(id);
        const triggers = stage.triggers.map((trigger) => chipOf(trigger));
        return {
          id,
          type: "stage",
          position: { x, y },
          data: {
            index,
            title: stage.title,
            note: stage.note,
            condition: CONDITIONAL[id],
            count: triggers.reduce((n, trigger) => n + trigger.count, 0),
            triggers,
            glow: triggers.some((trigger) => trigger.hit),
            muted,
            side,
            compact,
            selectedTrigger,
            onSelectTrigger: noop,
          },
          draggable: false,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions, compact, grouped, glow, selectedTrigger, noop, litTriggers, activeTrigger],
  );

  const edges = useMemo<Edge[]>(
    () =>
      links.map(({ from, fromHandle, to, toHandle, label, dashed }, i) => {
        const hit = stageLit(from) && stageLit(to);
        const color = hit ? "var(--primary)" : "var(--border)";
        return {
          id: `e${i}:${from}->${to}`,
          source: from,
          sourceHandle: fromHandle,
          target: to,
          targetHandle: toHandle,
          label,
          type: "smoothstep",
          animated: hit,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
          style: { stroke: color, strokeWidth: hit ? 2 : 1.5, strokeDasharray: dashed ? "5 4" : undefined },
          labelStyle: { fontSize: 11, fill: "var(--muted-foreground)" },
          labelBgStyle: { fill: "var(--card)" },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [links, glow, litTriggers, activeTrigger],
  );

  return (
    <div className={containerClassName}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
