import type { Dict } from "../types";
import { conditionScope, conditionsMatchOn, resolveContextPath } from "./conditions";
import { gatePasses } from "./relevance";
import type { EffectCommand, EffectDefinition, MechanismContext, MechanismDefinition } from "./types";

/** 解析 effect 的动态引用（skillIdFrom → skillId），未命中则原样返回。 */
export function resolveEffect(context: MechanismContext, effect: EffectDefinition): EffectDefinition {
  if (effect.type === "modifyCooldown" && effect.skillIdFrom) {
    const resolved = resolveContextPath(context, effect.skillIdFrom);
    if (typeof resolved === "string" && resolved) return { ...effect, skillId: resolved };
  }
  return effect;
}

export class MechanismRegistry {
  private readonly definitions: MechanismDefinition[];

  constructor(definitions: MechanismDefinition[] = []) {
    this.definitions = [...definitions];
  }

  register(definition: MechanismDefinition): void {
    this.definitions.push(definition);
  }

  all(): MechanismDefinition[] {
    return [...this.definitions];
  }

  collect(context: MechanismContext): EffectCommand[] {
    // oncePerTurn：同一回合内同一机制（按侧）只触发一次；`passive` 为按需读取，不计次。
    const fired = context.trigger === "passive" ? undefined : context.state.onceFired;
    // AND 脊门控（G2b-1.5）：作用域批内建一次，脊叶任一为假即跳过——与 conditionsMatch 同叶求值，纯短路提前。
    const scope = conditionScope(context);
    return this.definitions
      .filter((definition) => definition.trigger === context.trigger && gatePasses(scope, definition) && conditionsMatchOn(scope, definition.when))
      .filter((definition) => {
        if (!definition.oncePerTurn || !fired) return true;
        const key = `${context.actorSide ?? "-"}:${definition.id}`;
        if (fired[key]) return false;
        fired[key] = true;
        return true;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
      .flatMap((definition) =>
        definition.effects.map((effect, effectIndex) => ({
          type: effect.type,
          definition: resolveEffect(context, effect),
          mechanismId: definition.id,
          ownerType: definition.ownerType,
          ownerId: definition.ownerId,
          trigger: context.trigger,
          actorSide: context.actorSide,
          targetSide: context.targetSide,
          event: context.event,
          // 效果在机制内的原序：chance 盐粒与程序化 collect 的命令序对齐（缺省回退批内位置）。
          effectIndex,
        })),
      );
  }
}

export function mechanismsFromData(value: unknown): MechanismDefinition[] {
  const entries = Array.isArray(value) ? value : (value && typeof value === "object" ? (value as Dict).mechanisms : undefined);
  if (!Array.isArray(entries)) return [];
  return entries.filter((item): item is MechanismDefinition => {
    const entry = item as Dict;
    return typeof entry.id === "string" && typeof entry.ownerType === "string" && typeof entry.ownerId === "string" && typeof entry.trigger === "string" && Array.isArray(entry.effects);
  });
}
