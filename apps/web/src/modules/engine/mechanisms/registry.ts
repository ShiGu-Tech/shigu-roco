import type { Dict } from "../types";
import { conditionsMatch } from "./conditions";
import type { EffectCommand, MechanismContext, MechanismDefinition, TriggerName } from "./types";

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
    return this.definitions
      .filter((definition) => definition.trigger === context.trigger && conditionsMatch(context, definition.when))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
      .flatMap((definition) =>
        definition.effects.map((effect) => ({
          type: effect.type,
          definition: effect,
          mechanismId: definition.id,
          trigger: context.trigger,
          actorSide: context.actorSide,
          targetSide: context.targetSide,
        })),
      );
  }
}

export function mechanismsFromData(value: unknown): MechanismDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MechanismDefinition => {
    const entry = item as Dict;
    return typeof entry.id === "string" && typeof entry.ownerType === "string" && typeof entry.ownerId === "string" && typeof entry.trigger === "string" && Array.isArray(entry.effects);
  });
}
