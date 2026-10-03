"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { compileMechanism } from "@/modules/engine/graph";
import type { Condition, EffectDefinition, MechanismDefinition } from "@/modules/engine/mechanisms/types";

import { DetailPanel, type EditHandlers } from "./detail-panel";
import {
  addCondition,
  addEffect,
  getCondition,
  removeCondition,
  removeEffect,
  setConditionField,
  setEffectField,
  setOncePerTurn,
} from "./edit-ops";
import { GraphCanvas, graphEdgesOf, graphNodesOf } from "./graph-canvas";
import { MechanismList } from "./mechanism-list";
import { toProgramGraph } from "./program-graph";
import type { WorkbenchMechanism, WorkbenchSchema } from "./types";

interface WorkbenchData {
  schema: WorkbenchSchema;
  items: WorkbenchMechanism[];
  dataVersion: string;
}

interface Validation {
  errors: { node?: string; message: string }[];
  warnings: { node?: string; message: string }[];
}

/** 画布选中 = 节点的 DSL 源头（而非节点 id）——结构编辑后 id 会漂移，source 稳定。 */
function sameSource(a: unknown, b: unknown): boolean {
  if (!a || !b) return false;
  const pick = (s: Record<string, unknown>) => JSON.stringify({ role: s.role, when: s.when, leaf: s.leaf, field: s.field, effect: s.effect });
  return pick(a as Record<string, unknown>) === pick(b as Record<string, unknown>);
}

/** 无选中条件时的「新增条件」起步模板：永真（state.turn ≥ 1），加完立即收紧。 */
const STARTER_CONDITION: Condition = { path: "state.turn", op: "gte", value: 1 };

/** 引擎工作台 · 机制图（G3a 只读浏览 → G3b 程序图编辑写回）。
 *
 * - 画布 = `compileMechanism` 的**真程序**（入口 → 条件子图 → 门 → 写入链），点节点即定位 DSL 字段；
 * - 编辑作用于 `mechanisms.json` 草稿（不可变 edit-ops），校验经 `POST workbench/validate`，
 *   写回 `POST workbench/apply`（按 id 合并磁盘、校验失败不落盘、仅本地）；
 * - 拓扑由编译器决定（v1 不做自由连线）；`data/program.json` 事实源切换属 G2b/G4。
 */
export function WorkbenchView() {
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<Map<string, MechanismDefinition>>(new Map());
  const [editMode, setEditMode] = useState(false);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [schemaRes, mechanismsRes] = await Promise.all([
      fetch("/api/engine/workbench/schema", { cache: "no-store" }),
      fetch("/api/engine/workbench/mechanisms", { cache: "no-store" }),
    ]);
    if (!schemaRes.ok || !mechanismsRes.ok) throw new Error(`引擎接口不可用（${schemaRes.status}/${mechanismsRes.status}）`);
    const schema = (await schemaRes.json()) as WorkbenchSchema;
    const payload = (await mechanismsRes.json()) as { dataVersion: string; mechanisms: WorkbenchMechanism[] };
    return { schema, items: payload.mechanisms, dataVersion: payload.dataVersion };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await load();
        if (cancelled) return;
        setData(next);
        // 深链：?m=<mechanismId> 直接打开对应机制图
        const wanted = new URLSearchParams(window.location.search).get("m");
        if (wanted && next.items.some((item) => item.id === wanted)) setSelectedId(wanted);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const item = useMemo(
    () => (data && selectedId ? data.items.find((entry) => entry.id === selectedId) ?? null : null),
    [data, selectedId],
  );
  const currentDef: MechanismDefinition | null = useMemo(
    () => (item ? drafts.get(item.id) ?? item.def : null),
    [item, drafts],
  );
  const dirty = !!item && drafts.has(item.id);
  const dirtyCount = drafts.size;

  /** 当前定义 → 真程序 → 视图图。编译异常退回 null（草稿结构由 edit-ops 保证，正常不会发生）。 */
  const graph = useMemo(() => {
    if (!currentDef || !data) return null;
    try {
      const compiled = compileMechanism(currentDef);
      return toProgramGraph(compiled.program, compiled.sources, data.schema.nodes ?? []);
    } catch (err) {
      toast.error(`编译失败：${(err as Error).message}`);
      return null;
    }
  }, [currentDef, data]);

  const selectedNodeId = useMemo(
    () => (graph && selectedSource ? graph.nodes.find((node) => sameSource(node.source, selectedSource))?.id ?? null : null),
    [graph, selectedSource],
  );
  const selectedNode = useMemo(
    () => (graph && selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [graph, selectedNodeId],
  );

  const selectMechanism = (id: string) => {
    setSelectedId(id);
    setSelectedSource(null);
    setValidation(null);
    setConfirming(false);
  };

  /** 编辑入口：不可变修改 → 立即本地编译（结构合法性）→ 落草稿；失败 toast 不落。 */
  const mutate = useCallback(
    (fn: () => MechanismDefinition) => {
      if (!item || !currentDef) return;
      if (item.registered) {
        toast.error("自动生成的基础伤害机制由图鉴装配派生，不在此编辑");
        return;
      }
      try {
        const next = fn();
        compileMechanism(next); // 结构自检：非法直接抛
        setDrafts((prev) => {
          const map = new Map(prev);
          map.set(item.id, next);
          return map;
        });
        setValidation(null);
        setConfirming(false);
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [item, currentDef],
  );

  const edit: EditHandlers = useMemo(
    () => ({
      conditionField: (ref, field, value) => mutate(() => setConditionField(currentDef!, ref, field, value)),
      removeCondition: (ref) => mutate(() => removeCondition(currentDef!, ref)),
      addCondition: () =>
        mutate(() => {
          // 选中条件则复制之，否则用永真模板。
          const source = selectedSource as { role?: string; when?: number; leaf?: number[] } | null;
          const base: Condition =
            source?.role === "condition" && typeof source.when === "number"
              ? structuredClone(getCondition(currentDef!, { when: source.when, leaf: source.leaf ?? [] }))
              : STARTER_CONDITION;
          return addCondition(currentDef!, base);
        }),
      effectField: (effectIndex, key, value) => mutate(() => setEffectField(currentDef!, effectIndex, key, value)),
      removeEffect: (effectIndex) => mutate(() => removeEffect(currentDef!, effectIndex)),
      addEffect: (type) =>
        mutate(() => addEffect(currentDef!, { type, target: "target" } as unknown as EffectDefinition)),
      oncePerTurn: (value) => mutate(() => setOncePerTurn(currentDef!, value)),
    }),
    [mutate, currentDef, selectedSource],
  );

  const validate = async () => {
    if (!currentDef) return;
    setBusy(true);
    try {
      const res = await fetch("/api/engine/workbench/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ def: currentDef }),
      });
      const payload = (await res.json()) as Validation & { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error ?? `HTTP ${res.status}`);
      setValidation(payload);
      if (payload.errors.length) toast.error(`校验未通过：${payload.errors.length} 项错误`);
      else if (payload.warnings.length) toast.success(`校验通过（${payload.warnings.length} 条警告）`);
      else toast.success("校验通过");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!dirtyCount) {
      toast.info("没有待写回的改动");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/engine/workbench/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mechanisms: [...drafts.values()] }),
      });
      const payload = (await res.json()) as { ok?: boolean; changed?: number; version?: string; errors?: Validation["errors"]; error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error ?? `HTTP ${res.status}`);
      if (!payload.ok) {
        setValidation({ errors: payload.errors ?? [], warnings: [] });
        toast.error(`校验未通过（${(payload.errors ?? []).length} 项），未写回`);
        return;
      }
      const next = await load();
      setData(next);
      setDrafts(new Map());
      setValidation(null);
      setConfirming(false);
      toast.success(`已写回 ${payload.changed} 条机制（数据版本 ${payload.version}）`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revert = () => {
    if (!item || !dirty) return;
    setDrafts((prev) => {
      const map = new Map(prev);
      map.delete(item.id);
      return map;
    });
    setValidation(null);
    toast.info("已撤销当前机制的改动");
  };

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
        {error}　请先启动开发服务（`pwsh scripts/dev.ps1`）或查看 `/api/engine/health`。
      </div>
    );
  }

  if (!data) {
    return <p className="text-[13px] text-muted-foreground">正在加载机制数据…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        机制图 = <code className="tnum">compileMechanism</code> 产出的<strong>真程序</strong>（入口 → 条件子图 → 门 → 写入链），点节点即定位{" "}
        <code className="tnum">when[i]</code> / <code className="tnum">effects[j]</code> 字段；编辑写回{" "}
        <code className="tnum">data/mechanisms.json</code>（校验失败不落盘，仅本地）。数据版本{" "}
        <span className="tnum">{data.dataVersion}</span>，共 <span className="tnum">{data.items.length}</span> 条机制
        {dirtyCount ? ` · 草稿改动 ${dirtyCount} 条` : ""}。
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          className="h-7 px-2.5 text-[12px]"
          onClick={() => {
            setEditMode((prev) => !prev);
            setValidation(null);
          }}
        >
          {editMode ? "编辑中" : "编辑"}
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[12px]" disabled={busy || !currentDef} onClick={validate}>
          校验
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[12px]" disabled={!dirty} onClick={revert}>
          撤销当前
        </Button>
        {confirming ? (
          <span className="flex flex-wrap items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1">
            <span className="text-[11px]">写回 {dirtyCount} 条改动到 <code className="tnum">mechanisms.json</code>？</span>
            <Button size="sm" className="h-6 px-2 text-[11px]" disabled={busy} onClick={save}>
              确认写入
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setConfirming(false)}>
              取消
            </Button>
          </span>
        ) : (
          <Button size="sm" className="h-7 px-2.5 text-[12px]" disabled={!dirtyCount || busy} onClick={() => setConfirming(true)}>
            保存{dirtyCount ? `（${dirtyCount}）` : ""}
          </Button>
        )}
        {dirty ? <span className="text-[11px] text-amber-600 dark:text-amber-400">当前机制有未写回改动</span> : null}
      </div>

      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) ? (
        <div
          className={
            validation.errors.length
              ? "rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px]"
              : "rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground"
          }
        >
          {validation.errors.slice(0, 8).map((issue, index) => (
            <div key={index} className="tnum">✕ {issue.node ? `${issue.node}：` : ""}{issue.message}</div>
          ))}
          {validation.errors.length > 8 ? <div className="tnum">… 共 {validation.errors.length} 项错误</div> : null}
          {validation.warnings.slice(0, 4).map((issue, index) => (
            <div key={index} className="tnum">△ {issue.message}</div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[860px]:h-[calc(100vh-288px)] min-[860px]:min-h-[480px] min-[860px]:grid-cols-[240px_minmax(0,1fr)_300px]">
        <Panel title="机制列表" className="min-h-[240px]" bodyClassName="min-h-0">
          <MechanismList items={data.items} triggers={data.schema.triggers} selectedId={selectedId} onSelect={selectMechanism} />
        </Panel>

        <Panel
          title={item ? `程序图 · ${item.ownerName}` : "程序图"}
          actions={item ? <span className="tnum text-[11px] text-muted-foreground">{item.id}</span> : undefined}
          className="min-h-[420px]"
          bodyClassName="min-h-0 p-0"
        >
          {graph ? (
            <GraphCanvas
              nodes={graphNodesOf(graph.nodes, selectedNodeId)}
              edges={graphEdgesOf(graph.edges)}
              onSelect={(nodeId) => {
                const node = graph.nodes.find((entry) => entry.id === nodeId);
                setSelectedSource(node?.source ?? null);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-[12px] text-muted-foreground">
              左侧选择一条机制，在此查看它的程序图（入口 → 条件 → 门 → 写入链）。
            </div>
          )}
        </Panel>

        <Panel title="详情" className="min-h-[240px]" bodyClassName="min-h-0 overflow-y-auto">
          <DetailPanel
            mechanism={item}
            def={currentDef}
            node={selectedNode}
            payload={selectedNode && graph ? graph.payloads[selectedNode.id] : currentDef}
            edit={editMode ? edit : null}
          />
        </Panel>
      </div>
    </div>
  );
}
