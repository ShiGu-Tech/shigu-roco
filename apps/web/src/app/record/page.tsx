import { PageHeader } from "@/components/page-header";
import { BattleWorkbench } from "@/modules/battle/battle-workbench";

export default function RecordPage() {
  return (
    <>
      <PageHeader title="详细录入 / 复盘" description="手动录入完整对局状态、存档复盘。实时对战请回对战台。" />
      <BattleWorkbench />
    </>
  );
}
