import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { BattleWorkbench } from "@/modules/battle/battle-workbench";

export default function RecordPage() {
  return (
    <main className="app-shell mx-auto min-h-screen max-w-[1280px] px-4 py-5 min-[520px]:px-6 min-[520px]:py-8">
      <header className="mb-7 flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-end min-[520px]:justify-between">
        <div className="space-y-1">
          <div className="eyebrow">Match archive</div>
          <h1 className="text-2xl font-bold tracking-tight">详细录入 / 复盘</h1>
          <p className="text-sm text-muted-foreground">
            手动录入完整对局状态、存档复盘。实时对战请看
            <Link href="/" className="ml-1 text-primary hover:underline">
              对战台
            </Link>
            。
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm", className: "self-start min-[520px]:self-auto" })}>
          返回对战台
        </Link>
      </header>
      <BattleWorkbench />
    </main>
  );
}
