import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { EngineTabs } from "@/modules/atlas/engine-tabs";

export default function EnginePage() {
  return (
    <>
      <PageHeader
        title="引擎全景工作台"
        description="首屏＝引擎整体地图（回合生命周期骨架挂载全部机制），沙盒 / 对战台操作的轨迹回来点亮；点触发器看机制，点机制进程序图。"
        actions={
          <Link href="/engine/debug" className="text-[13px] text-primary underline-offset-4 hover:underline">
            调试沙盒 →
          </Link>
        }
      />
      <Suspense fallback={<p className="text-[13px] text-muted-foreground">正在加载引擎工作台…</p>}>
        <EngineTabs />
      </Suspense>
    </>
  );
}
