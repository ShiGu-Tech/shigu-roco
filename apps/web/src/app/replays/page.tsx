import { PageHeader } from "@/components/page-header";
import { ReplayView } from "@/modules/replays/replay-view";

export default function ReplaysPage() {
  return (
    <>
      <PageHeader title="对战记录" description="保存在浏览器本地的对局录像；离线回放，基于当时的数据快照，不受后续更新影响。" />
      <ReplayView />
    </>
  );
}
