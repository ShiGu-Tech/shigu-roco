"use client";

import { useEffect, useState } from "react";

import { cn } from "cn";

interface HealthInfo {
  ok: boolean;
  engine?: string;
  version?: string;
  sprites?: number;
  skills?: number;
}

export function EngineStatus() {
  const [info, setInfo] = useState<HealthInfo>({ ok: false });

  useEffect(() => {
    let alive = true;
    fetch("/api/engine/health", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { status?: string; engineVersion?: string; dataVersion?: string; counts?: { sprites?: number; skills?: number } }) => {
        if (!alive) return;
        setInfo({
          ok: data.status === "ok",
          engine: data.engineVersion,
          version: data.dataVersion,
          sprites: data.counts?.sprites,
          skills: data.counts?.skills,
        });
      })
      .catch(() => {
        if (alive) setInfo({ ok: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border bg-card px-2 py-1 text-[11px] text-muted-foreground min-[520px]:gap-2">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", info.ok ? "bg-success" : "bg-destructive")} />
      {info.ok ? (
        <>
          {/* ≥520px：引擎 + 数据 + 精灵/技能计数（≥860px 才出计数） */}
          <span className="tnum hidden min-[520px]:inline">
            引擎 <span className="font-mono">v{info.engine}</span> · 数据 <span className="font-mono">{info.version}</span>
            {info.sprites ? <span className="hidden min-[860px]:inline"> · 精灵 {info.sprites} / 技能 {info.skills}</span> : null}
          </span>
          {/* <520px：只留引擎版本，够判断"能不能用" */}
          <span className="font-mono tnum min-[520px]:hidden">v{info.engine}</span>
        </>
      ) : (
        "引擎未就绪"
      )}
    </span>
  );
}
