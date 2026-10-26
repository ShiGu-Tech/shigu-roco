"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function MobileManualPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        返回
      </button>
      <div className="text-center py-20">
        <p className="text-slate-600 dark:text-slate-400">手动输入阵容（开发中）</p>
      </div>
    </div>
  );
}
