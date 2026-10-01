import { PageHeader } from "@/components/page-header";
import { BattleBoard } from "@/modules/board/board";

export default function Home() {
  return (
    <>
      <PageHeader
        title="PvP 对战台"
        description="手动选择双方动作，逐回合推演胜率与战斗状态。离线运行，不读取画面、不自动操作。"
      />
      <BattleBoard />
    </>
  );
}
