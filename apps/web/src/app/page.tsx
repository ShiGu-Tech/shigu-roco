import { BattleBoard } from "@/modules/board/board";

export default function Home() {
  return (
    <main className="app-shell mx-auto min-h-screen max-w-[1280px] px-4 py-5 min-[520px]:px-6 min-[520px]:py-8">
      <header className="mb-7 flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-end min-[520px]:justify-between">
        <div className="space-y-2">
          <div className="eyebrow">Offline battle intelligence</div>
          <h1 className="text-2xl font-bold tracking-tight min-[520px]:text-3xl">洛克王国世界 · PVP 对战台</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            手动选择双方动作，逐回合查看推演胜率与战斗状态。离线运行，不读取画面，不自动操作。
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm min-[520px]:self-auto">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_oklch(0.8_0.12_150_/_0.35)]" />
          引擎就绪 · 本地模式
        </div>
      </header>
      <BattleBoard />
    </main>
  );
}
