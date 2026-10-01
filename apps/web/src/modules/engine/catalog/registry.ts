import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ExternalSnapshot, RegisteredCatalog, RegistryIndex } from "./types";
import { normalizeSnapshot } from "./normalize";
import { resolveDataDir } from "../data-node";

const NORMALIZER_VERSION = "n7";

function registryDir(): string {
  const root = process.env.ROCO_CATALOG_REGISTRY_DIR ?? path.join(resolveDataDir(), "registry", "catalogs");
  mkdirSync(root, { recursive: true });
  return root;
}

function indexPath(): string { return path.join(registryDir(), "index.json"); }

function readIndex(): RegistryIndex {
  const file = indexPath();
  if (!existsSync(file)) return { activeRegistrationId: null, registrations: [] };
  return JSON.parse(readFileSync(file, "utf8")) as RegistryIndex;
}

function writeAtomic(file: string, value: unknown): void {
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  renameSync(temp, file);
}

export function readSnapshotDir(sourceDir: string): ExternalSnapshot {
  const raw = (name: string) => {
    const file = path.join(sourceDir, name);
    if (!existsSync(file)) throw new Error(`图鉴快照缺少文件: ${file}`);
    return JSON.parse(readFileSync(file, "utf8"));
  };
  return { meta: raw("meta.json"), spirits: raw("spirits.json"), skills: raw("skills.json"), spiritSkills: raw("spirit-skills.json"), skillLearners: raw("skill-learners.json"), matchups: raw("matchups.json"), glossary: raw("glossary.json"), teams: raw("teams.json") };
}

export function registerSnapshot(snapshot: ExternalSnapshot, activate = true): RegisteredCatalog {
  const now = new Date().toISOString();
  const registrationId = `${snapshot.meta.catalogVersion}-${snapshot.meta.generatedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${NORMALIZER_VERSION}`;
  const root = registryDir();
  const dir = path.join(root, registrationId);
  const existing = path.join(dir, "catalog.json");
  if (existsSync(existing)) {
    if (activate) activateRegistration(registrationId);
    return JSON.parse(readFileSync(existing, "utf8")) as RegisteredCatalog;
  }
  const catalog = normalizeSnapshot(snapshot, registrationId, now);
  mkdirSync(dir, { recursive: true });
  writeAtomic(existing, catalog);
  const index = readIndex();
  index.registrations = [...index.registrations.filter((item) => item.registrationId !== registrationId), { registrationId, catalogVersion: catalog.catalogVersion, generatedAt: catalog.generatedAt, registeredAt: catalog.registeredAt, counts: catalog.counts, warnings: catalog.warnings }];
  writeAtomic(indexPath(), index);
  if (activate) activateRegistration(registrationId);
  return catalog;
}

export function listRegistrations(): RegistryIndex { return readIndex(); }

export function activateRegistration(registrationId: string): RegistryIndex {
  const index = readIndex();
  if (!index.registrations.some((item) => item.registrationId === registrationId)) throw new Error(`未注册图鉴版本: ${registrationId}`);
  index.activeRegistrationId = registrationId;
  writeAtomic(indexPath(), index);
  return index;
}

export function getRegisteredCatalog(registrationId: string): RegisteredCatalog {
  const file = path.join(registryDir(), registrationId, "catalog.json");
  if (!existsSync(file)) throw new Error(`未注册图鉴版本: ${registrationId}`);
  return JSON.parse(readFileSync(file, "utf8")) as RegisteredCatalog;
}

export function getActiveCatalog(): RegisteredCatalog | null {
  const id = readIndex().activeRegistrationId;
  return id ? getRegisteredCatalog(id) : null;
}
