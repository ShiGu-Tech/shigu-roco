"""贝叶斯对手模型：Dirichlet–Multinomial，估计对手 A/D/S 动作分布。"""

from __future__ import annotations

from dataclasses import dataclass, field

CLASSES = ("A", "D", "S")


@dataclass
class OpponentModel:
    alpha: list[float] = field(default_factory=lambda: [1.0, 1.0, 1.0])
    counts: list[int] = field(default_factory=lambda: [0, 0, 0])

    def observe(self, action_class: str) -> None:
        if action_class in CLASSES:
            self.counts[CLASSES.index(action_class)] += 1

    def probabilities(self) -> dict[str, float]:
        totals = [a + c for a, c in zip(self.alpha, self.counts)]
        s = sum(totals) or 1.0
        return {cls: totals[i] / s for i, cls in enumerate(CLASSES)}

    def sample_class(self, rng) -> str:
        import random  # noqa: F401

        probs = self.probabilities()
        r = rng.random()
        acc = 0.0
        for cls in CLASSES:
            acc += probs[cls]
            if r <= acc:
                return cls
        return CLASSES[-1]

    @classmethod
    def from_dict(cls, raw: dict[str, float] | None) -> "OpponentModel":
        if not raw:
            return cls()
        # 允许传入先验α或历史计数；这里按计数处理（>0 的整数）
        counts = [int(raw.get(c, 0)) for c in CLASSES]
        return cls(counts=counts)

    def to_dict(self) -> dict[str, float]:
        return self.probabilities()
