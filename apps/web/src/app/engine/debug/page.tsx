import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { DebugView } from "@/modules/workbench/debug-view";

export default function EngineDebugPage() {
  return (
    <>
      <PageHeader
        title="调试沙盒"
        description="手动设定双方状态与行动，用真实引擎逐回合结算，按触发时机查看事件与伤害分解。"
        actions={
          <Link href="/engine" className="text-[13px] text-primary underline-offset-4 hover:underline">
            返回机制图
          </Link>
        }
      />
      <DebugView />
    </>
  );
}
