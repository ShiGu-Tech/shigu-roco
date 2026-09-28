import type { Action, Side } from "../types";

export interface QueuedAction {
  id: string;
  actorSide: Side;
  action: Action;
  declaredAt: number;
  priority: number;
  speedSnapshot: number;
  source?: string;
  status: "queued" | "cancelled" | "executing" | "resolved";
}

export class ActionQueue {
  private readonly actions: QueuedAction[] = [];

  enqueue(action: QueuedAction): void {
    this.actions.push({ ...action, status: "queued" });
  }

  cancel(id: string): boolean {
    const action = this.actions.find((entry) => entry.id === id && entry.status === "queued");
    if (!action) return false;
    action.status = "cancelled";
    return true;
  }

  replace(id: string, action: Action): boolean {
    const entry = this.actions.find((candidate) => candidate.id === id && candidate.status === "queued");
    if (!entry) return false;
    entry.action = action;
    return true;
  }

  forceFirst(id: string): boolean {
    const entry = this.actions.find((candidate) => candidate.id === id && candidate.status === "queued");
    if (!entry) return false;
    entry.priority = Number.MAX_SAFE_INTEGER;
    return true;
  }

  ordered(): QueuedAction[] {
    return this.actions
      .filter((entry) => entry.status === "queued")
      .sort((a, b) => b.priority - a.priority || b.speedSnapshot - a.speedSnapshot || a.declaredAt - b.declaredAt || a.id.localeCompare(b.id));
  }

  get(id: string): QueuedAction | undefined {
    return this.actions.find((entry) => entry.id === id);
  }

  all(): QueuedAction[] {
    return this.actions.map((entry) => ({ ...entry, action: { ...entry.action } }));
  }
}
