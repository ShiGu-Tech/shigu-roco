import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";

import { AppShell } from "@/components/app-shell";

import "./globals.css";
import "@/modules/shop/shop-theme.css";

export const metadata: Metadata = {
  title: "洛克王国世界 · PVP 决策辅助",
  description: "离线人工录入对局状态，MCTS 推演动作胜率。非外挂。",
};

// viewportFit: "cover" 让 iPhone 刘海/灵动岛下的 env(safe-area-inset-*) 生效（外壳与底部抽屉都用它做内边距）
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f9fc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <AppShell>{children}</AppShell>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
