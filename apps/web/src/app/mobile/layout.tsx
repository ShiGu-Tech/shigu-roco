import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "洛克 PVP 助手 - 移动版",
  description: "对战决策辅助，不读内存",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // 刘海屏适配
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {children}
    </div>
  );
}
