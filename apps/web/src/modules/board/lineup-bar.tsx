"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteLineup, listLineups, scopeLabel, saveLineup, type Lineup, type LineupScope } from "./lineups";
import type { TeamEntry } from "./util";

/** 阵容库条：保存当前阵容 / 一键套用已存阵容 / 行内二次确认删除。 */
export function LineupBar({
  scope,
  entries,
  onApply,
}: {
  scope: LineupScope;
  entries: TeamEntry[];
  onApply: (entries: TeamEntry[]) => void;
}) {
  const [list, setList] = useState<Lineup[]>(() => listLineups(scope));
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function refresh() {
    setList(listLineups(scope));
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("先给阵容起个名字");
      return;
    }
    if (entries.length === 0) {
      toast.error("阵容是空的，先加精灵");
      return;
    }
    setList(saveLineup(scope, trimmed, entries));
    setName("");
    toast.success(`已保存${scopeLabel(scope)}阵容「${trimmed}」`);
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          placeholder={`给这套${scopeLabel(scope)}阵容起名（同名覆盖）`}
          className="h-8 min-w-[160px] flex-1 text-xs"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <Button type="button" size="sm" variant="secondary" onClick={save} disabled={entries.length === 0}>
          保存阵容
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">还没有存过{scopeLabel(scope)}阵容。</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {list.map((l) => (
            <span key={l.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onApply(structuredClone(l.entries));
                  toast.success(`已套用「${l.name}」`);
                }}
                className="rounded-md border bg-background px-2 py-1 text-xs hover:border-primary/50 hover:bg-accent"
                title="点击套用这套阵容"
              >
                {l.name}
                <span className="ml-1 text-[10px] text-muted-foreground">{l.entries.length} 只</span>
              </button>
              {pendingDelete === l.id ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      deleteLineup(l.id);
                      refresh();
                      setPendingDelete(null);
                      toast.success(`已删除「${l.name}」`);
                    }}
                    className="rounded-md border border-destructive/60 px-1.5 py-1 text-[10px] text-destructive hover:bg-destructive/10"
                  >
                    删除?
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    className="rounded-md border px-1.5 py-1 text-[10px] hover:bg-accent"
                  >
                    取消
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label={`删除 ${l.name}`}
                  onClick={() => setPendingDelete(l.id)}
                  className="rounded-md border px-1.5 py-1 text-[10px] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
