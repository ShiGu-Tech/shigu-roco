import { BattleBoard } from "@/modules/board/board";
import Link from "next/link";

export default function Home() {
  return (
    <main className="app-shell mx-auto min-h-screen w-full max-w-[1440px] px-3 py-4 min-[520px]:px-5 min-[520px]:py-6 min-[860px]:px-8 min-[860px]:py-8">
      <header className="mb-5 flex flex-col gap-3 min-[520px]:mb-7 min-[520px]:gap-4 min-[860px]:flex-row min-[860px]:items-end min-[860px]:justify-between">
        <div className="space-y-2">
          <div className="eyebrow">Offline battle intelligence</div>
          <h1 className="story-title text-xl font-bold tracking-tight min-[520px]:text-2xl min-[860px]:text-3xl">洛克王国世界 · PVP 对战台</h1>
          <p className="max-w-2xl text-xs leading-5 text-muted-foreground min-[520px]:text-sm min-[520px]:leading-6">
            手动选择双方动作，逐回合查看推演胜率与战斗状态。离线运行，不读取画面，不自动操作。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start min-[520px]:self-auto">
          <Link href="/data" className="text-sm text-primary underline-offset-4 hover:underline">基础数据</Link>
          <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-soft">
            <span className="h-2 w-2 rounded-full bg-success shadow-glow" />
            引擎就绪 · 本地模式
          </div>
        </div>
      </header>
      <BattleBoard />
    </main>
  );
}
