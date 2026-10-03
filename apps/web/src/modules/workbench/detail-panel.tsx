"use client";

import { Badge } from "@/components/ui/badge";
import { triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import type { ViewNode } from "./dsl-graph";
import type { WorkbenchMechanism } from "./types";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-4 tnum">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** 选中节点 / 机制的详情：参数表 + 原始 JSON。 */
export function DetailPanel({
  mechanism,
  node,
  payload,
}: {
  mechanism: WorkbenchMechanism | null;
  node: ViewNode | null;
  payload: unknown;
}) {
  if (!mechanism) {
    return <p className="text-[12px] text-muted-foreground">选择左侧任一机制，查看它的触发条件、效果节点与原始定义。</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold">{mechanism.ownerName}</span>
          <Badge variant="outline">{mechanism.ownerType}</Badge>
          {mechanism.unsupported ? <Badge variant="destructive" className="px-1 py-0 text-[10px]">含未支持</Badge> : null}
          {mechanism.registered ? <Badge variant="outline" className="px-1 py-0 text-[10px]">自动生成</Badge> : null}
        </div>
        <p className="text-[11px] text-muted-foreground tnum">{mechanism.id}</p>
        <p className="text-[11px] text-muted-foreground">
          触发：{triggerMetaOf(mechanism.trigger).title}（{mechanism.trigger}）· {mechanism.effectCount} 个效果
        </p>
      </div>

      {node ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-semibold">{node.title}</span>
            <Badge variant="outline" className="text-[10px]">{node.kind}</Badge>
          </div>
          {node.params.length ? (
            <table className="w-full text-[11px]">
              <tbody>
                {node.params.map((param) => (
                  <tr key={param.key} className="border-b last:border-0">
                    <td className="w-[72px] py-1 pr-2 align-top text-muted-foreground">{param.label}</td>
                    <td className="py-1 align-top">
                      {param.dynamic ? <Badge variant="secondary" className="mr-1 px-1 py-0 text-[10px]">动态</Badge> : null}
                      <span className="break-all tnum">{param.display}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[11px] text-muted-foreground">该节点无参数</p>
          )}
          <JsonBlock value={payload} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">未选中节点，展示机制完整定义：</p>
          <JsonBlock value={mechanism.def} />
        </div>
      )}
    </div>
  );
}
