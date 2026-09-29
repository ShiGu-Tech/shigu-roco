#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { exportStaticBundle } from "./export-static-data.mjs";

const BASE = process.env.ROCO_SOURCE_URL ?? "https://roco.world/zh";
const outputDir = process.env.ROCO_SYNC_DIR ?? path.resolve("tmp", "roco-world-snapshot");
const registerUrl = process.env.ROCO_REGISTER_URL ?? "http://localhost:26900/api/engine/admin/catalog/register";
const shouldRegister = process.argv.includes("--register");
const concurrency = 8;

function absoluteUrl(value) { return new URL(value, `${BASE}/`).toString(); }
function decode(value) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }
function bootstrap(html) {
  const match = html.match(/<script id="roco-bootstrap" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("中文站页面缺少 roco-bootstrap 数据");
  return JSON.parse(match[1]);
}
async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "shigu-roco-sync/0.2" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}
async function mapConcurrent(items, worker) {
  const out = [];
  let cursor = 0;
  async function run() { while (cursor < items.length) { const index = cursor++; out[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}
function sitemapLinks(xml, pattern) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1])).filter((url) => pattern.test(url));
}
function typeMap(catalog) {
  return new Map((catalog.types?.types ?? []).map((type) => [type.id, type]));
}
function typeName(type) { return type?.name ?? "未知属性"; }
function skillFromData(skill, types) {
  const damage = skill.damage ?? [];
  const category = skill.skill_category?.label ?? "状态";
  const element = typeName(types.get(skill.battle_type_id));
  return {
    id: `sk-${skill.id}`, skillName: skill.name, nameZh: skill.name, element, elementZh: element.replace(/系$/, ""),
    category: category === "物理" ? "Physical" : category === "魔法" ? "Magic" : category === "防御" ? "Defense" : "Status",
    categoryZh: category, actionType: category === "防御" ? "Defense" : category === "状态" ? "Status" : "Attack", actionTypeZh: category === "防御" ? "防御" : category === "状态" ? "状态" : "攻击",
    power: Math.max(...damage.map(Number), 0), powerMin: Math.min(...damage.map(Number), 0), powerMax: Math.max(...damage.map(Number), 0), cost: skill.energy_cost ?? 0,
    cooldown: Math.max(...(skill.cooldown ?? [0]), 0), hitRate: 100, priority: 0, rawText: skill.description ?? "", description: skill.description ?? "",
    icon: skill.image_url ? absoluteUrl(skill.image_url) : null, source: absoluteUrl(`/skill/${skill.id}`), sourceData: skill,
  };
}

async function main() {
  const [sitemap, skillSitemap, glossarySitemap] = await Promise.all([
    get("https://roco.world/sitemap-zh-hans-jini.xml"), get("https://roco.world/sitemap-zh-hans-skills.xml"), get("https://roco.world/sitemap-zh-hans-glossary.xml"),
  ]);
  const spiritUrls = sitemapLinks(sitemap, /\/zh\/jini\/\d+(?:\/form\/\d+)?$/);
  const skillUrls = sitemapLinks(skillSitemap, /\/zh\/skill\/\d+$/);
  const glossaryUrls = sitemapLinks(glossarySitemap, /\/zh\/glossary\/\d+$/);
  if (!spiritUrls.length || !skillUrls.length) throw new Error("中文站 sitemap 未解析到精灵或技能");
  const first = bootstrap(await get(spiritUrls[0]));
  const types = typeMap(first.catalog);
  const spiritPages = await mapConcurrent(spiritUrls, async (url) => bootstrap(await get(url)));
  const skillPages = await mapConcurrent(skillUrls, async (url) => bootstrap(await get(url)));
  const glossaryPages = await mapConcurrent(glossaryUrls, async (url) => bootstrap(await get(url)));
  const spirits = spiritPages.map((page) => {
    const data = page.page.data;
    const skills = [...(data.skills ?? []), ...(data.bloodline_options ?? []).flatMap((option) => option.skills ?? [])];
    return { id: data.handbook_id, formId: data.form_id, name: data.name, form: data.form ?? null, types: (data.unit_types ?? []).map((id) => typeName(types.get(id))), stage: data.evolution_stage ?? 1, stats: { hp: data.stats.hp, atk: data.stats.physical_attack, defense: data.stats.physical_defense, spatk: data.stats.special_attack, spdef: data.stats.special_defense, speed: data.stats.speed }, passive: data.passive_skills?.[0] ? { name: data.passive_skills[0].name, desc: data.passive_skills[0].description } : null, imageOnline: absoluteUrl(data.portrait_medium_url ?? data.image_url), head: absoluteUrl(data.head_image_url), source: absoluteUrl(page.path), sourceData: data, skillIds: skills.map((skill) => ({ id: skill.id, src: skill.source_type === "level" ? "level" : skill.source_type === "blood" ? "blood" : "machine", lv: skill.unlock_level ?? null })) };
  });
  const skills = skillPages.map((page) => skillFromData(page.page.data, types));
  const spiritSkills = Object.fromEntries(spirits.map((spirit) => [`${spirit.id}:${spirit.formId}`, spirit.skillIds]));
  const glossary = glossaryPages.map((page) => ({ id: page.page.data.id, name: page.page.data.note, descPlain: page.page.data.description }));
  const matchups = (first.catalog.types?.matchups ?? []).map((item) => [item.attacking_type_id, item.defending_type_id, item.effect]);
  const snapshot = { meta: { locale: "zh-Hans", catalogVersion: first.catalog.catalogVersion, generatedAt: new Date().toISOString(), origin: "https://roco.world/zh/", types: [...types.values()].map((type) => ({ id: type.id, name: type.name, short: type.short, color: type.color, iconOnline: type.icon_url ? absoluteUrl(type.icon_url) : null })) }, spirits, skills, spiritSkills, skillLearners: {}, matchups, glossary, teams: [] };
  const invalid = spirits.filter((spirit) => !spirit.types.length || Object.values(spirit.stats).some((value) => !Number.isFinite(value)));
  if (invalid.length || !skills.length || !Object.keys(spiritSkills).length) throw new Error(`中文站数据校验失败：精灵异常 ${invalid.length}，技能 ${skills.length}，学习关系 ${Object.keys(spiritSkills).length}`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");
  if (!shouldRegister) { console.log(JSON.stringify({ source: "https://roco.world/zh/", registered: false, snapshot: { spirits: spirits.length, skills: skills.length, glossary: glossary.length }, file: path.join(outputDir, "snapshot.json") }, null, 2)); return; }
  const response = await fetch(registerUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshot, activate: true }) });
  if (!response.ok) throw new Error(`注册失败 ${response.status}: ${await response.text()}`);
  const registered = await response.json();
  const exported = await exportStaticBundle(new URL(registerUrl).origin);
  console.log(JSON.stringify({ source: "https://roco.world/zh/", registered, exported, snapshot: { spirits: spirits.length, skills: skills.length, glossary: glossary.length } }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
