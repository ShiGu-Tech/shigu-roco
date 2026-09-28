"use client";

import { EChart } from "@/components/charts/echart";
import { AXIS_COLOR, ENEMY_COLOR, GRID_COLOR, PLAYER_COLOR } from "@/lib/chart-theme";

import type { EChartsOption } from "echarts";

export interface TrendPoint {
  turn: number;
  myWin: number;
  enemyWin: number;
}

export function TrendChart({ history }: { history: TrendPoint[] }) {
  const option: EChartsOption = {
    tooltip: { trigger: "axis", valueFormatter: (v) => `${Number(v).toFixed(1)}%` },
    legend: { data: ["我方胜率", "敌方胜率"], top: 0, textStyle: { color: AXIS_COLOR } },
    grid: { left: 48, right: 16, top: 34, bottom: 28 },
    xAxis: {
      type: "category",
      name: "回合",
      data: history.map((h) => h.turn),
      axisLine: { lineStyle: { color: GRID_COLOR } },
      axisLabel: { color: AXIS_COLOR },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { formatter: "{value}%", color: AXIS_COLOR },
      splitLine: { lineStyle: { color: GRID_COLOR } },
    },
    series: [
      {
        name: "我方胜率",
        type: "line",
        smooth: true,
        symbolSize: 7,
        itemStyle: { color: PLAYER_COLOR },
        lineStyle: { color: PLAYER_COLOR },
        areaStyle: { color: PLAYER_COLOR, opacity: 0.1 },
        data: history.map((h) => Number((h.myWin * 100).toFixed(1))),
      },
      {
        name: "敌方胜率",
        type: "line",
        smooth: true,
        symbolSize: 7,
        itemStyle: { color: ENEMY_COLOR },
        lineStyle: { color: ENEMY_COLOR },
        areaStyle: { color: ENEMY_COLOR, opacity: 0.08 },
        data: history.map((h) => Number((h.enemyWin * 100).toFixed(1))),
      },
    ],
  };

  return <EChart option={option} className="h-[240px] w-full" />;
}
