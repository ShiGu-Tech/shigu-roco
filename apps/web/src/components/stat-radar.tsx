"use client";

import { EChart } from "@/components/charts/echart";
import { AXIS_COLOR, GRID_COLOR, PLAYER_COLOR, resolveColor } from "@/lib/chart-theme";
import { PANEL_ORDER, STAT_LABEL } from "@/modules/engine/calc";
import type { StatKey } from "@/modules/engine/stats";

import type { EChartsOption } from "echarts";

export interface StatRadarProps {
  /** 当前面板（六项）。 */
  panel: Record<StatKey, number>;
  /** 对比基准（中性 / 无加点），可省。 */
  baseline?: Record<StatKey, number> | null;
  className?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const step = v <= 100 ? 10 : v <= 300 ? 25 : 50;
  return Math.ceil(v / step) * step;
}

export function StatRadar({ panel, baseline, className }: StatRadarProps) {
  const values = PANEL_ORDER.map((k) => panel[k]);
  const baseValues = baseline ? PANEL_ORDER.map((k) => baseline[k]) : null;
  const max = niceMax(Math.max(...values, ...(baseValues ?? [])) * 1.1);

  const axis = resolveColor(AXIS_COLOR);
  const grid = resolveColor(GRID_COLOR);
  const player = resolveColor(PLAYER_COLOR);

  const option: EChartsOption = {
    tooltip: {},
    legend: {
      data: baseValues ? ["当前", "中性基准"] : ["当前"],
      top: 0,
      textStyle: { color: axis },
    },
    radar: {
      indicator: PANEL_ORDER.map((k) => ({ name: STAT_LABEL[k], max })),
      center: ["50%", "56%"],
      radius: "62%",
      axisName: { color: axis, fontSize: 11 },
      axisLine: { lineStyle: { color: grid } },
      splitLine: { lineStyle: { color: grid } },
      splitArea: { areaStyle: { color: ["transparent"] } },
    },
    series: [
      {
        type: "radar",
        name: "当前",
        symbolSize: 4,
        data: [
          {
            value: values,
            name: "当前",
            itemStyle: { color: player },
            lineStyle: { color: player },
            areaStyle: { color: player, opacity: 0.18 },
            label: { show: true, color: axis, fontSize: 10 },
          },
        ],
      },
      ...(baseValues
        ? [
            {
              type: "radar" as const,
              name: "中性基准",
              symbolSize: 3,
              data: [
                {
                  value: baseValues,
                  name: "中性基准",
                  itemStyle: { color: axis },
                  lineStyle: { color: axis, type: "dashed" as const },
                  areaStyle: { color: axis, opacity: 0.06 },
                },
              ],
            },
          ]
        : []),
    ],
  };

  return <EChart option={option} className={className ?? "h-[260px] w-full"} />;
}
