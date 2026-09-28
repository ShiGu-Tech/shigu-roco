import { activateRegistration, listRegistrations, readSnapshotDir, registerSnapshot } from "./registry";
import type { ExternalSnapshot } from "./types";
import type { Dict } from "../types";

export function catalogRegistry(): Dict {
  return listRegistrations() as unknown as Dict;
}

export function registerCatalog(body: Dict): Dict {
  const sourceDir = typeof body.sourceDir === "string" ? body.sourceDir : "";
  const snapshot = body.snapshot as ExternalSnapshot | undefined;
  if (!sourceDir && !snapshot) throw new Error("需要 sourceDir 或 snapshot");
  const catalog = registerSnapshot(snapshot ?? readSnapshotDir(sourceDir), body.activate !== false);
  return { registrationId: catalog.registrationId, catalogVersion: catalog.catalogVersion, generatedAt: catalog.generatedAt, registeredAt: catalog.registeredAt, counts: catalog.counts, warnings: catalog.warnings, active: body.activate !== false };
}

export function activateCatalog(body: Dict): Dict {
  const registrationId = typeof body.registrationId === "string" ? body.registrationId : "";
  if (!registrationId) throw new Error("缺少 registrationId");
  return activateRegistration(registrationId) as unknown as Dict;
}
