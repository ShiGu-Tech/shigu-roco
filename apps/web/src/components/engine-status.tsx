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
    <span className="inline-flex items-center gap-2 rounded-sm border bg-card px-2 py-1 text-[11px] text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", info.ok ? "bg-success" : "bg-destructive")} />
      {info.ok ? (
        <span className="tnum">
          引擎 <span className="font-mono">v{info.engine}</span> · 数据 <span className="font-mono">{info.version}</span>
          {info.sprites ? <span className="hidden min-[860px]:inline"> · 精灵 {info.sprites} / 技能 {info.skills}</span> : null}
        </span>
      ) : (
        "引擎未就绪"
      )}
    </span>
  );
}
