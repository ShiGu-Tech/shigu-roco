"use client";

import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { cn } from "cn";

import type { ParamView, ViewNode, ViewNodeKind } from "./dsl-graph";

export interface GraphNodeData extends Record<string, unknown> {
  title: string;
  subtitle?: string;
  kind: ViewNodeKind;
  domainLabel?: string;
  params: ParamView[];
}

const KIND_CLASS: Record<ViewNodeKind, string> = {
  trigger: "border-primary/60 bg-primary/10",
  condition: "border-dashed border-border bg-card",
  combinator: "border-dashed border-muted-foreground/40 bg-muted/60",
  effect: "border-border bg-card",
};

function labelClassOf(data: GraphNodeData): string {
  if (data.kind === "effect") return "bg-secondary text-secondary-foreground";
  return "bg-muted text-muted-foreground";
}

const HANDLE_CLASS = "!h-2 !w-2 !rounded-full !border-none !bg-muted-foreground/50";

function MechanismNode({ data }: NodeProps<Node<GraphNodeData, "wb">>) {
  return (
    <div className={cn("w-[210px] rounded-md border px-2.5 py-2 shadow-sm", KIND_CLASS[data.kind])}>
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold leading-4">{data.title}</span>
        {data.domainLabel ? <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px]", labelClassOf(data))}>{data.domainLabel}</span> : null}
      </div>
      {data.subtitle ? <div className="mt-0.5 truncate text-[10px] text-muted-foreground tnum">{data.subtitle}</div> : null}
      {data.params.length ? (
        <div className="mt-1 space-y-0.5 border-t pt-1">
          {data.params.slice(0, 4).map((param) => (
            <div key={param.key} className="flex items-baseline justify-between gap-2 text-[10px] leading-4">
              <span className="shrink-0 text-muted-foreground">{param.label}</span>
              <span className={cn("truncate tnum", param.dynamic ? "font-medium text-foreground" : "text-foreground/80")}>
                {param.dynamic ? "ƒ " : ""}
                {param.display}
              </span>
            </div>
          ))}
          {data.params.length > 4 ? <div className="text-[10px] text-muted-foreground">… 共 {data.params.length} 项</div> : null}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />
    </div>
  );
}

const nodeTypes = { wb: MechanismNode };

export function graphNodesOf(nodes: ViewNode[], selectedId: string | null): Node<GraphNodeData, "wb">[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "wb",
    position: node.position,
    selected: node.id === selectedId,
    data: {
      title: node.title,
      subtitle: node.subtitle,
      kind: node.kind,
      domainLabel: node.domainLabel,
      params: node.params,
    },
  }));
}

export function graphEdgesOf(edges: { id: string; from: string; to: string; label?: string }[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    type: "smoothstep",
    animated: false,
  }));
}

/** 机制 DSL 只读画布：拖拽 / 连线关闭，保留缩放与框选查看。 */
export function GraphCanvas({
  nodes,
  edges,
  onSelect,
}: {
  nodes: Node<GraphNodeData, "wb">[];
  edges: Edge[];
  onSelect: (nodeId: string | null) => void;
}) {
  return (
    <div className="h-full min-h-[360px] w-full rounded-md border bg-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        onNodeClick={(_, node) => onSelect(node.id)}
        onPaneClick={() => onSelect(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
