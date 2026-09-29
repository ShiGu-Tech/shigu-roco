"use client";

import { EChart } from "@/components/charts/echart";
import { AXIS_COLOR, ENEMY_COLOR, GRID_COLOR, PLAYER_COLOR, resolveColor } from "@/lib/chart-theme";

import type { EChartsOption } from "echarts";

export interface TrendPoint {
  turn: number;
  myWin: number;
  enemyWin: number;
}

export function TrendChart({ history }: { history: TrendPoint[] }) {
  const axis = resolveColor(AXIS_COLOR);
  const grid = resolveColor(GRID_COLOR);
  const player = resolveColor(PLAYER_COLOR);
  const enemy = resolveColor(ENEMY_COLOR);

  const option: EChartsOption = {
    tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
    legend: { data: ["我方胜率", "敌方胜率"], top: 0, textStyle: { color: axis } },
    grid: { left: 48, right: 16, top: 34, bottom: 28 },
    xAxis: {
      type: "category",
      name: "回合",
      data: history.map((h) => h.turn),
      axisLine: { lineStyle: { color: grid } },
      axisLabel: { color: axis },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%", color: axis },
      splitLine: { lineStyle: { color: grid } },
    },
    series: [
      {
        name: "我方胜率",
        type: "line",
        smooth: true,
        symbolSize: 7,
        itemStyle: { color: player },
        lineStyle: { color: player, width: 3 },
        areaStyle: { color: player, opacity: 0.12 },
        data: history.map((h) => Number((h.myWin * 100).toFixed(1))),
      },
      {
        name: "敌方胜率",
        type: "line",
        smooth: true,
        symbolSize: 7,
        itemStyle: { color: enemy },
        lineStyle: { color: enemy, width: 3 },
        areaStyle: { color: enemy, opacity: 0.1 },
        data: history.map((h) => Number((h.enemyWin * 100).toFixed(1))),
      },
    ],
  };

  return <EChart option={option} className="h-[240px] w-full" />;
}
