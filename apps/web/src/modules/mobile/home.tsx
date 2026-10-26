"use client";

import { Camera, Sparkles, Wand2, Crown, Zap, Shield, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MobileHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePhotoUpload = async () => {
    setLoading(true);
    setTimeout(() => {
      router.push("/mobile/battle");
    }, 2000);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-purple-900 via-indigo-800 to-blue-900">
      {/* 魔法背景动画 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-10 left-10 h-2 w-2 animate-ping rounded-full bg-yellow-300 opacity-75" />
        <div className="absolute top-20 right-20 h-1.5 w-1.5 animate-pulse rounded-full bg-pink-300 opacity-60" style={{ animationDelay: "0.5s" }} />
        <div className="absolute bottom-40 left-1/4 h-2.5 w-2.5 animate-ping rounded-full bg-cyan-300 opacity-50" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/3 right-1/3 h-1 w-1 animate-pulse rounded-full bg-purple-300 opacity-70" style={{ animationDelay: "1.5s" }} />
        {/* 星光轨迹 */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IndoaXRlIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvc3ZnPg==')] opacity-30" />
      </div>

      {/* 主内容 */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* 顶部装饰 */}
        <div className="px-6 pt-12 pb-6 safe-area-inset-top">
          <div className="text-center">
            {/* Logo 区域 */}
            <div className="mb-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 backdrop-blur-md px-6 py-3 border border-white/20">
              <Crown className="h-6 w-6 text-yellow-300" />
              <h1 className="text-2xl font-black text-white tracking-tight">
                洛克王国
              </h1>
              <Sparkles className="h-5 w-5 text-pink-300" />
            </div>
            <p className="text-lg font-bold text-purple-200 mb-1">
              对战助手
            </p>
            <p className="text-sm text-purple-300/80">
              AI 决策 · 不读内存 · 离线可用
            </p>
          </div>
        </div>

        {/* 主操作区 */}
        <main className="flex-1 px-6 py-8">
          {/* 主按钮 - 魔法相机 */}
          <div className="mb-10">
            <button
              onClick={handlePhotoUpload}
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 p-1 shadow-2xl shadow-purple-500/50 transition-all active:scale-95 disabled:opacity-70"
            >
              {/* 内层卡片 */}
              <div className="relative rounded-[22px] bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/50 dark:to-purple-950/50 px-8 py-12">
                {/* 魔法圆环装饰 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-48 w-48 rounded-full border-2 border-dashed border-purple-300/30 animate-spin" style={{ animationDuration: "20s" }} />
                  <div className="absolute h-40 w-40 rounded-full border-2 border-dashed border-pink-300/30 animate-spin" style={{ animationDuration: "15s", animationDirection: "reverse" }} />
                </div>

                <div className="relative z-10 flex flex-col items-center gap-4">
                  {loading ? (
                    <>
                      <div className="relative flex h-24 w-24 items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-400 to-purple-400 opacity-20 blur-xl animate-pulse" />
                        <Wand2 className="h-12 w-12 text-purple-600 dark:text-purple-400 animate-bounce" strokeWidth={2} />
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-black text-purple-900 dark:text-purple-100 mb-2">
                          魔法识别中...
                        </p>
                        <p className="text-sm text-purple-600 dark:text-purple-400">
                          正在召唤精灵信息 ✨
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="relative flex h-24 w-24 items-center justify-center">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-400 to-purple-400 opacity-20 blur-xl group-hover:opacity-30 transition-opacity" />
                        <Camera className="h-14 w-14 text-purple-600 dark:text-purple-300 transition-transform group-hover:scale-110" strokeWidth={2.5} />
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-black text-purple-900 dark:text-purple-100 mb-2">
                          魔法相机
                        </p>
                        <p className="text-base text-purple-700 dark:text-purple-300 font-medium">
                          拍下对战画面，召唤决策精灵
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* 闪光效果 */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          </div>

          {/* 魔法分割线 */}
          <div className="relative mb-10 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-purple-300/30" />
            </div>
            <div className="relative flex items-center gap-2 bg-transparent px-4">
              <Sparkles className="h-4 w-4 text-purple-300" />
              <span className="text-sm font-bold text-purple-200 uppercase tracking-wider">
                其他方式
              </span>
              <Sparkles className="h-4 w-4 text-purple-300" />
            </div>
          </div>

          {/* 次要入口 - 卡片式 */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => router.push("/mobile/manual")}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 backdrop-blur-md p-5 border border-white/10 shadow-lg transition-all active:scale-95"
            >
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/30">
                  <Shield className="h-6 w-6 text-blue-200" />
                </div>
                <p className="text-sm font-bold text-white text-center">
                  手动输入
                </p>
                <p className="text-xs text-blue-200 text-center">
                  自选精灵
                </p>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={() => router.push("/mobile/history")}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-md p-5 border border-white/10 shadow-lg transition-all active:scale-95"
            >
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/30">
                  <Trophy className="h-6 w-6 text-purple-200" />
                </div>
                <p className="text-sm font-bold text-white text-center">
                  历史对局
                </p>
                <p className="text-xs text-purple-200 text-center">
                  查看记录
                </p>
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* 特性卡片 - 游戏风格 */}
          <div className="mt-12 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-yellow-400 animate-pulse" />
              <p className="text-sm font-black text-yellow-200 uppercase tracking-wider">
                为什么选择我们
              </p>
              <div className="h-1 w-1 rounded-full bg-yellow-400 animate-pulse" />
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/20">
                  <Zap className="h-4 w-4 text-emerald-300" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">秒级 AI 决策</p>
                  <p className="text-xs text-purple-200">
                    MCTS 算法 2 秒给出最优行动
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                  <Shield className="h-4 w-4 text-blue-300" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">安全合规</p>
                  <p className="text-xs text-purple-200">
                    不读内存、不读屏幕、不自动操作
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/20">
                  <Sparkles className="h-4 w-4 text-purple-300" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">完全离线</p>
                  <p className="text-xs text-purple-200">
                    本地计算，无需联网，数据安全
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* 底部装饰 */}
        <div className="px-6 pb-6 safe-area-inset-bottom">
          <p className="text-center text-xs text-purple-300/60">
            基于公开规则 · 算法透明 · 开源可审计
          </p>
        </div>
      </div>
    </div>
  );
}
