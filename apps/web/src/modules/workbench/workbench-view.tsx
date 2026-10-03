"use client";

import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/panel";

import { DetailPanel } from "./detail-panel";
import { toMechanismGraph, type ViewNode } from "./dsl-graph";
import { GraphCanvas, graphEdgesOf, graphNodesOf } from "./graph-canvas";
import { MechanismList } from "./mechanism-list";
import type { WorkbenchMechanism, WorkbenchSchema } from "./types";

interface WorkbenchData {
  schema: WorkbenchSchema;
  items: WorkbenchMechanism[];
  dataVersion: string;
}

/** 引擎工作台 · 机制图只读浏览（G3a）。
 *
 * 图 = `mechanisms.json` DSL 的展示投影（非程序事实源）；拖拽 / 连线 / 写回属 G3b（依赖 G2）。
 */
export function WorkbenchView() {
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [schemaRes, mechanismsRes] = await Promise.all([
          fetch("/api/engine/workbench/schema", { cache: "no-store" }),
          fetch("/api/engine/workbench/mechanisms", { cache: "no-store" }),
        ]);
        if (!schemaRes.ok || !mechanismsRes.ok) throw new Error(`引擎接口不可用（${schemaRes.status}/${mechanismsRes.status}）`);
        const schema = (await schemaRes.json()) as WorkbenchSchema;
        const payload = (await mechanismsRes.json()) as { dataVersion: string; mechanisms: WorkbenchMechanism[] };
        if (cancelled) return;
        setData({ schema, items: payload.mechanisms, dataVersion: payload.dataVersion });
        // 深链：?m=<mechanismId> 直接打开对应机制图
        const wanted = new URLSearchParams(window.location.search).get("m");
        if (wanted && payload.mechanisms.some((item) => item.id === wanted)) setSelectedId(wanted);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mechanism = useMemo(
    () => (data && selectedId ? data.items.find((item) => item.id === selectedId) ?? null : null),
    [data, selectedId],
  );

  const graph = useMemo(() => (mechanism ? toMechanismGraph(mechanism.def) : null), [mechanism]);

  const selectedNode: ViewNode | null = useMemo(
    () => (graph && selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [graph, selectedNodeId],
  );

  const selectMechanism = (id: string) => {
    setSelectedId(id);
    setSelectedNodeId(null);
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
        机制图 = <code className="tnum">data/mechanisms.json</code> 的只读投影（DSL → 节点图），不是引擎执行的程序事实源；图上{" "}
        <span className="font-medium">ƒ</span> 标记的参数为动态取值。数据版本 <span className="tnum">{data.dataVersion}</span>，共{" "}
        <span className="tnum">{data.items.length}</span> 条机制。
      </p>

      <div className="grid grid-cols-1 gap-3 min-[860px]:h-[calc(100vh-232px)] min-[860px]:min-h-[480px] min-[860px]:grid-cols-[240px_minmax(0,1fr)_280px]">
        <Panel title="机制列表" className="min-h-[240px]" bodyClassName="min-h-0">
          <MechanismList items={data.items} triggers={data.schema.triggers} selectedId={selectedId} onSelect={selectMechanism} />
        </Panel>

        <Panel
          title={mechanism ? `机制图 · ${mechanism.ownerName}` : "机制图"}
          actions={mechanism ? <span className="tnum text-[11px] text-muted-foreground">{mechanism.id}</span> : undefined}
          className="min-h-[420px]"
          bodyClassName="min-h-0 p-0"
        >
          {graph ? (
            <GraphCanvas
              nodes={graphNodesOf(graph.nodes, selectedNodeId)}
              edges={graphEdgesOf(graph.edges)}
              onSelect={setSelectedNodeId}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-[12px] text-muted-foreground">
              左侧选择一条机制，在此查看它的触发条件与效果节点图。
            </div>
          )}
        </Panel>

        <Panel title="详情" className="min-h-[240px]" bodyClassName="min-h-0 overflow-y-auto">
          <DetailPanel
            mechanism={mechanism}
            node={selectedNode}
            payload={selectedNode && graph ? graph.payloads[selectedNode.id] : mechanism?.def}
          />
        </Panel>
      </div>
    </div>
  );
}
