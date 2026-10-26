"use client";

import { ChevronLeft, ChevronRight, Camera, TrendingUp, Zap, Heart, Shield, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Mock 数据
const mockBattle = {
  turn: 3,
  player: {
    sprite: { name: "迪莫", id: "sp-1-1" },
    hp: 563,
    maxHp: 563,
    energy: 7,
    maxEnergy: 10,
    buffs: [{ name: "物防", value: 2 }],
    debuffs: [{ name: "速度", value: -1 }],
  },
  enemy: {
    sprite: { name: "音速犬", id: "sp-201-1" },
    hp: 420,
    maxHp: 500,
    energy: 6,
    maxEnergy: 10,
    skills: ["火焰喷射", "炽炎爪"],
  },
  recommendations: [
    {
      rank: 1,
      action: { type: "skill", name: "械斗" },
      winRate: 0.603,
      energy: 3,
      damage: { min: 115, max: 138 },
      advantages: ["能量消耗低", "后续能接重击收割"],
      risks: ["对方可能换精灵 (30%)"],
    },
    {
      rank: 2,
      action: { type: "switch", name: "骨龙" },
      winRate: 0.548,
      energy: 0,
      advantages: ["克制对方火系"],
      risks: ["损失一回合行动"],
    },
    {
      rank: 3,
      action: { type: "skill", name: "泥浆" },
      winRate: 0.451,
      energy: 2,
      damage: { min: 22, max: 30 },
      advantages: ["有机会降低对方命中"],
      risks: ["伤害较低"],
    },
  ],
};

export function MobileBattle() {
  const router = useRouter();
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "from-amber-500 to-amber-600";
      case 2:
        return "from-slate-400 to-slate-500";
      case 3:
        return "from-orange-600 to-orange-700";
      default:
        return "from-slate-300 to-slate-400";
    }
  };

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1:
        return "🏆";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return "📊";
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* 顶部状态栏 */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 dark:bg-slate-900/95 dark:border-slate-800">
        <div className="px-4 py-3 safe-area-inset-top">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400"
            >
              <ChevronLeft className="h-4 w-4" />
              返回
            </button>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              回合 {mockBattle.turn}
            </div>
            <button className="text-sm text-blue-600 dark:text-blue-400">
              重拍
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                我方 5♥
              </span>
            </div>
            <div className="rounded-full bg-gradient-to-r from-red-500/10 via-slate-200 to-blue-500/10 px-4 py-1 dark:via-slate-800">
              <span className="text-sm font-bold text-red-600 dark:text-red-400">
                红方胜率 60%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                对方 4♥
              </span>
              <div className="h-2 w-2 rounded-full bg-blue-500" />
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto pb-safe">
        <div className="p-4 space-y-4">
          {/* 我方精灵卡 */}
          <div className="rounded-2xl bg-gradient-to-br from-red-50 to-rose-50 p-4 shadow-sm ring-1 ring-red-200/50 dark:from-red-950/30 dark:to-rose-950/30 dark:ring-red-900/50">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-slate-900">
                <span className="text-2xl">🦎</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {mockBattle.player.sprite.name}
                  </h3>
                  <div className="flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                    <Zap className="h-4 w-4 text-amber-500" />
                    {mockBattle.player.energy}/{mockBattle.player.maxEnergy}
                  </div>
                </div>
                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">生命值</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {mockBattle.player.hp}/{mockBattle.player.maxHp}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-500"
                      style={{ width: `${(mockBattle.player.hp / mockBattle.player.maxHp) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {mockBattle.player.buffs.map((buff, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    >
                      <TrendingUp className="h-3 w-3" />
                      {buff.name} {buff.value > 0 ? "+" : ""}
                      {buff.value}
                    </span>
                  ))}
                  {mockBattle.player.debuffs.map((debuff, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400"
                    >
                      {debuff.name} {debuff.value}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 推荐卡片列表 */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 px-1">
              技能推荐（点击查看详情）
            </h2>
            {mockBattle.recommendations.map((rec, index) => {
              const isExpanded = expandedCard === index;
              return (
                <div
                  key={index}
                  onClick={() => setExpandedCard(isExpanded ? null : index)}
                  className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 transition-all active:scale-[0.98] dark:bg-slate-900 dark:ring-slate-800"
                >
                  {/* 卡片头部 */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ${getRankColor(rec.rank)}`}
                      >
                        <span className="text-lg">{getRankEmoji(rec.rank)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                            {rec.action.name}
                          </h3>
                          {rec.rank === 1 && (
                            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                              推荐
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            胜算 {Math.round(rec.winRate * 100)}%
                          </span>
                          {rec.energy !== undefined && (
                            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                              <Zap className="h-3.5 w-3.5" />
                              需要 {rec.energy}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/50">
                      {rec.damage && (
                        <div className="flex items-center gap-2">
                          <Swords className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            预估伤害：
                            <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">
                              {rec.damage.min} ~ {rec.damage.max}
                            </span>
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                          💡 优势
                        </p>
                        <ul className="space-y-1">
                          {rec.advantages.map((adv, i) => (
                            <li
                              key={i}
                              className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2"
                            >
                              <span className="text-emerald-500 mt-0.5">•</span>
                              {adv}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {rec.risks && rec.risks.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                            ⚠️ 风险
                          </p>
                          <ul className="space-y-1">
                            {rec.risks.map((risk, i) => (
                              <li
                                key={i}
                                className="text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2"
                              >
                                <span className="text-amber-500 mt-0.5">•</span>
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 对方精灵信息 */}
          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 p-4 shadow-sm ring-1 ring-blue-200/50 dark:from-blue-950/30 dark:to-cyan-950/30 dark:ring-blue-900/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-slate-900">
                <span className="text-xl">🐺</span>
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  {mockBattle.enemy.sprite.name}
                </h3>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <Heart className="h-3.5 w-3.5 text-red-500" />
                    {mockBattle.enemy.hp}/{mockBattle.enemy.maxHp}
                  </span>
                  <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    {mockBattle.enemy.energy}/{mockBattle.enemy.maxEnergy}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                已见技能
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mockBattle.enemy.skills.map((skill, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <button className="flex-1 rounded-xl bg-white py-3 px-4 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition-all active:scale-[0.98] dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
              <ChevronLeft className="inline h-4 w-4 mr-1" />
              上回合
            </button>
            <button className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3 px-4 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98]">
              下回合
              <ChevronRight className="inline h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
