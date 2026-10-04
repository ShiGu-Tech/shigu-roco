"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import { cn } from "cn";

import { WorkbenchView } from "@/modules/workbench/workbench-view";

import { AtlasView } from "./atlas-view";

type Tab = "atlas" | "mechanism";

/** `/engine` 容器：默认全景 tab；带 `?m=<id>` 深链直落机制图 tab（兼容现有链接与冒烟）。
 *  URL 改写用 `history.replaceState`（免整页导航）；`WorkbenchView` 挂载时自读 `?m`。 */
export function EngineTabs() {
  // useSearchParams 在 SSR 与客户端同源，初始值无水合差异（无需 effect）。
  const deepLink = useSearchParams().get("m");
  const [tab, setTab] = useState<Tab>(deepLink ? "mechanism" : "atlas");
  const [mechanismId, setMechanismId] = useState<string | null>(deepLink);

  const openMechanism = useCallback((id: string) => {
    setMechanismId(id);
    setTab("mechanism");
    window.history.replaceState(null, "", `/engine?m=${encodeURIComponent(id)}`);
  }, []);

  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    if (next === "atlas") {
      setMechanismId(null);
      window.history.replaceState(null, "", "/engine");
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {(
          [
            ["atlas", "全景"],
            ["mechanism", "机制图"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-[12px] transition-colors",
              tab === key ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent/50",
            )}
          >
            {label}
          </button>
        ))}
        {tab === "mechanism" && mechanismId ? <span className="tnum text-[11px] text-muted-foreground">{mechanismId}</span> : null}
      </div>

      {tab === "atlas" ? <AtlasView onOpenMechanism={openMechanism} /> : <WorkbenchView />}
    </div>
  );
}
