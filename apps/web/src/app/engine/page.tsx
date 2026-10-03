import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { WorkbenchView } from "@/modules/workbench/workbench-view";

export default function EnginePage() {
  return (
    <>
      <PageHeader
        title="引擎工作台"
        description="浏览引擎机制（触发器 → 条件 → 效果）的只读节点图；数据驱动的技能 / 特性 / 状态 / 印记 / 天气机制一览。"
        actions={
          <Link href="/engine/debug" className="text-[13px] text-primary underline-offset-4 hover:underline">
            调试沙盒 →
          </Link>
        }
      />
      <WorkbenchView />
    </>
  );
}
