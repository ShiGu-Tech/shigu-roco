import type { Metadata } from "next";
import { Toaster } from "sonner";

import { AppShell } from "@/components/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "洛克王国世界 · PVP 决策辅助",
  description: "离线人工录入对局状态，MCTS 推演动作胜率。非外挂。",
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
