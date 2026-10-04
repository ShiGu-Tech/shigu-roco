/** 工作台展示汉化字典（纯展示层，不参与结算）。
 *
 * 边界：只翻译「给人看的标签」——节点角色 / 连线端口 / 参数枚举值 / 归属类型 / 节点标题算子。
 * **不翻译**字段与 ID：取值路径（`event.action.skillId`）、机制 / 技能 / 状态 / 印记 id、
 * DSL 字段名（`effects[0]` / `when[i]`）、JSON 原文——它们是编辑与定位依据，翻了反而对不上。
 * 查表未命中一律原样返回（未知枚举 / 自由字符串不改写）。
 */

import { CONDITION_OP_LABELS } from "@/modules/engine/mechanisms/vocabulary";

/** 画布 / 详情面板的节点角色（ViewNode.kind），也是节点副标题。 */
export const KIND_LABELS: Record<string, string> = {
  trigger: "触发器",
  condition: "条件",
  combinator: "结构",
  effect: "效果",
};

/** 机制归属类型（detail 头部徽章 / 列表筛选同口径）。 */
export const OWNER_TYPE_LABELS: Record<string, string> = {
  skill: "技能",
  trait: "特性",
  status: "状态",
  mark: "印记",
  weather: "天气",
  system: "系统",
};

/** 数据边端口名（`edge.from.port`）→ 中文连线标签。 */
export const EDGE_PORT_LABELS: Record<string, string> = {
  value: "值",
  cond: "条件",
};

/** 节点类型前缀 → 副标题分类词（`on.*` / `write.*` 有专属副标题，不走此表）。 */
export const PREFIX_LABELS: Record<string, string> = {
  flow: "流程",
  read: "取值",
  cmp: "比较",
  logic: "逻辑",
  math: "运算",
  query: "查询",
  rng: "随机",
  resource: "资源",
};

/** math 节点算子 → 中文（`运算 · add` 标题用）。 */
export const MATH_OP_LABELS: Record<string, string> = {
  add: "加",
  sub: "减",
  mul: "乘",
  div: "除",
  min: "取小",
  max: "取大",
};

/** `stat` 参数键的属性值 → 中文（与 `STAT_LABEL` 同口径；裸值语境以属性为主）。 */
const STAT_VALUE_LABELS: Record<string, string> = {
  hp: "生命",
  atk: "物攻",
  spatk: "魔攻",
  defense: "物防",
  spdef: "魔防",
  speed: "速度",
  spd: "速度",
};

/** `scope` 参数键的值域 → 中文（技能作用域语境，与属性语境分开）。 */
const SCOPE_VALUE_LABELS: Record<string, string> = {
  all: "全体",
  attack: "攻击技能",
  defense: "防御技能",
  skill: "技能",
  outgoing: "攻方输出",
  incoming: "承伤方",
};

/** DSL 参数枚举值 → 中文（通用语言级值域，与具体游戏内容无关）。
 *  键冲突按参数键特判（`stat` / `scope`），此处只放无歧义的裸值。
 */
export const VALUE_LABELS: Record<string, string> = {
  // 阵营 / 目标
  self: "自身",
  target: "目标",
  opponent: "对手",
  enemy: "敌方",
  player: "我方",
  actor: "本方",
  // 伤害类别 / 技能分类（大写为 damageType / category 值域）
  Physical: "物理",
  Magic: "魔法",
  Passive: "被动",
  Attack: "攻击",
  Defense: "防御",
  Status: "状态",
  // 属性键（裸值语境以属性为主；scope 语境由 SCOPE_VALUE_LABELS 特判）
  hp: "生命",
  atk: "物攻",
  spatk: "魔攻",
  defense: "物防",
  spdef: "魔防",
  speed: "速度",
  // 方式
  flat: "固定值",
  multiply: "乘算",
  percent: "百分比",
  set: "置值",
  add: "相加",
  // 取值基准
  currentHp: "当前HP",
  maxHp: "最大HP",
  stack: "按层数",
  // 作用域（裸值兜底；stat / scope 键优先特判）
  all: "全体",
  attack: "攻击",
  outgoing: "攻方输出",
  incoming: "承伤方",
  // 极性 / 时效 / 时机 / 衰减
  buff: "增益",
  debuff: "减益",
  permanent: "永久",
  turns: "按回合",
  nextAction: "下次行动",
  aura: "光环",
  turnStart: "回合开始",
  half: "减半",
  // 行动类型
  switch: "换人",
  defend: "防御",
  wish: "愿力魔法",
  leader: "首领化",
  energy: "聚能",
  skill: "技能",
  // 元素键（引擎英文 key → 中文短名）
  Normal: "普通",
  Grass: "草",
  Fire: "火",
  Water: "水",
  Light: "光",
  Earth: "地",
  Ice: "冰",
  Dragon: "龙",
  Electric: "电",
  Poison: "毒",
  Insect: "虫",
  Fighting: "武",
  Wing: "翼",
  Cute: "萌",
  Ghost: "幽",
  Dark: "恶",
  Mechanic: "机械",
  Psychic: "幻",
  Rock: "石",
  // 布尔
  true: "是",
  false: "否",
};

/** 枚举值查表：未命中原样返回。 */
export function labelValue(value: string): string {
  return VALUE_LABELS[value] ?? value;
}

/** 按参数键查表（`stat` / `scope` 值域有键内歧义，按键特判后回退裸值表）。 */
export function labelParamValue(key: string, value: string): string {
  if (key === "stat") return STAT_VALUE_LABELS[value] ?? labelValue(value);
  if (key === "scope") return SCOPE_VALUE_LABELS[value] ?? labelValue(value);
  return labelValue(value);
}

/** schema 节点目录标题汉化：只处理已知英文算子后缀（`比较 · eq` → `比较 · 等于`）。
 *  目录缺失时回退的原始 `node.type`（如 `cmp.eq`）不在这里处理——那是兜底路径，UI 正常总有目录。
 */
export function localizeNodeTitle(title: string): string {
  const cmp = /^比较 · (.+)$/.exec(title);
  if (cmp) return `比较 · ${CONDITION_OP_LABELS[cmp[1]] ?? cmp[1]}`;
  const math = /^运算 · (.+)$/.exec(title);
  if (math) return `运算 · ${MATH_OP_LABELS[math[1]] ?? math[1]}`;
  if (title === "取整 · floor") return "取整";
  return title;
}
