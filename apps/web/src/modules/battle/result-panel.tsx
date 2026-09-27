"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EChart } from "@/components/charts/echart";
import { CHART_COLORS } from "@/lib/chart-theme";

import type { RecommendResult } from "./types";
import type { EChartsOption } from "echarts";

const CLASS_LABEL: Record<string, string> = { A: "攻击", D: "防御", S: "状态" };

export function ResultPanel({ result }: { result: RecommendResult | null }) {
  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>推演结果</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          录入对局状态后点击「推演」，这里会显示各动作的预估胜率与对手动作概率。
        </CardContent>
      </Card>
    );
  }

  const best = result.actions[0]?.winRate ?? 0;
  const opponentOption: EChartsOption = {
    color: CHART_COLORS,
    tooltip: { trigger: "item" },
    series: [
      {
        type: "bar",
        data: (["A", "D", "S"] as const).map((k) => ({
          value: Number((result.opponent[k] * 100).toFixed(1)),
          name: CLASS_LABEL[k],
        })),
        xAxisIndex: 0,
        barWidth: "45%",
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
    xAxis: { type: "category", data: ["攻击 A", "防御 D", "状态 S"] },
    yAxis: { type: "value", max: 100, name: "%" },
    grid: { left: 40, right: 12, top: 24, bottom: 28 },
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>推荐动作</CardTitle>
          <span className="text-xs text-muted-foreground">
            {result.meta.iterations} 次模拟 · {result.meta.elapsedMs} ms · seed {result.meta.seed}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.actions.length === 0 && (
            <p className="text-sm text-muted-foreground">该状态下没有可执行的合法动作。</p>
          )}
          {result.actions.map((a, i) => (
            <div key={`${a.label}-${i}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {i === 0 && <Badge variant="success">推荐</Badge>}
                  <span className="text-sm font-medium">{a.label || a.action.kind}</span>
                  <Badge variant="outline">{a.action.kind}</Badge>
                </div>
                <span className="text-sm tabular-nums">
                  {(a.winRate * 100).toFixed(1)}%
                  {i > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {((a.winRate - best) * 100).toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
              <Progress value={a.winRate * 100} />
              <span className="text-xs text-muted-foreground">访问 {a.visits} 次</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>对手动作概率（推测）</CardTitle>
        </CardHeader>
        <CardContent>
          <EChart option={opponentOption} className="h-[180px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
