import Link from "next/link";

import { AppNav } from "./app-nav";
import { EngineStatus } from "./engine-status";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-12 w-full max-w-[1440px] items-center gap-3 px-3 min-[520px]:px-5 min-[860px]:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-sm bg-primary text-[11px] font-bold text-primary-foreground">
              洛
            </span>
            <span className="hidden text-[13px] font-semibold tracking-tight min-[520px]:inline">洛克王国 · PVP 决策台</span>
          </Link>
          <AppNav />
          <div className="ml-auto flex items-center gap-2">
            <EngineStatus />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-4 min-[520px]:px-5 min-[860px]:px-8 min-[860px]:py-6">{children}</main>
    </div>
  );
}
