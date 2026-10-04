import { PageHeader } from "@/components/page-header";
import { WatchView } from "@/modules/watch/watch-view";

export default async function WatchPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <>
      <PageHeader
        title="引擎观战"
        description="打开观战链接即可实时观看对局的引擎内部流程；对局结束后同一链接变为回放。"
      />
      <WatchView roomId={roomId} />
    </>
  );
}
