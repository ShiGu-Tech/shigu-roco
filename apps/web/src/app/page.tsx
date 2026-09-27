import { BattleWorkbench } from "@/modules/battle/battle-workbench";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1200px] p-4 min-[520px]:p-6">
      <header className="mb-5 space-y-1">
        <h1 className="text-xl font-semibold">洛克王国世界 · PVP 决策辅助</h1>
        <p className="text-sm text-muted-foreground">
          离线 · 人工录入对局状态 · MCTS 推演动作胜率。非外挂：不读取游戏画面、不自动操作、不联网。
        </p>
      </header>
      <BattleWorkbench />
    </main>
  );
}
