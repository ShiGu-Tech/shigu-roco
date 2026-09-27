"""效果 DSL：对外出口。"""

from .damage import DamageResult, base_stat, compute_damage, effective_stat
from .interpreter import EffectContext, apply_op, apply_ops, eval_when

__all__ = [
    "DamageResult",
    "EffectContext",
    "apply_op",
    "apply_ops",
    "base_stat",
    "compute_damage",
    "effective_stat",
    "eval_when",
]
