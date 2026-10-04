"use client";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Condition, MechanismDefinition } from "@/modules/engine/mechanisms/types";
import { CONDITION_OP_LABELS, EFFECT_VOCABULARY, effectVocabularyOf, triggerMetaOf } from "@/modules/engine/mechanisms/vocabulary";

import type { ViewNode } from "./dsl-graph";
import { valueText } from "./dsl-graph";
import { coerceFieldValue, getCondition, type ConditionField, type ConditionRef } from "./edit-ops";
import { KIND_LABELS, OWNER_TYPE_LABELS, labelParamValue } from "./labels";
import type { WorkbenchMechanism } from "./types";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-4 tnum">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** 编辑动作：全部作用于当前草稿（不可变 edit-ops），由容器做校验 / 脏态 / 保存。 */
export interface EditHandlers {
  conditionField: (ref: ConditionRef, field: ConditionField, value: unknown) => void;
  removeCondition: (ref: ConditionRef) => void;
  addCondition: () => void;
  effectField: (effectIndex: number, key: string, value: unknown) => void;
  removeEffect: (effectIndex: number) => void;
  addEffect: (type: string) => void;
  oncePerTurn: (value: boolean) => void;
}

const ROW = "border-b last:border-0";
const LABEL_CELL = "w-[76px] py-1 pr-2 align-top text-muted-foreground";

function ReadRow({ label, children, badge }: { label: string; children: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <tr className={ROW}>
      <td className={LABEL_CELL}>{label}</td>
      <td className="py-1 align-top">
        {badge}
        <span className="break-all tnum">{children}</span>
      </td>
    </tr>
  );
}

/** 文本框：失焦 / 回车才提交（避免数字输入中途 NaN 报错），值变化时用 key 重挂载。 */
function CommitField({
  original,
  display,
  onCommit,
  onError,
  placeholder,
}: {
  original: unknown;
  display: string;
  onCommit: (value: unknown) => void;
  onError: (message: string) => void;
  placeholder?: string;
}) {
  const commit = (raw: string) => {
    try {
      onCommit(coerceFieldValue(original, raw));
    } catch (err) {
      onError((err as Error).message);
    }
  };
  return (
    <Input
      key={String(original)}
      defaultValue={display}
      placeholder={placeholder}
      className="h-7 w-full px-1.5 text-[11px]"
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function scalarDisplay(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** 只读展示文本：枚举值汉化（编辑输入框仍用原文，保证写回正确）。 */
function readDisplay(key: string, value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "boolean" || typeof value === "string") return labelParamValue(key, String(value));
  return String(value);
}

type LeafCondition = Extract<Condition, { path: string }>;

function isLeaf(cond: Condition): cond is LeafCondition {
  return !("allOf" in cond || "anyOf" in cond || "not" in cond);
}

/** 新增效果：选效果类型 → 追加到 effects 末尾（必填字段由校验提示补齐）。 */
function AddEffectControl({ disabled, onAdd }: { disabled: boolean; onAdd: (type: string) => void }) {
  return (
    <span className="flex items-center gap-1">
      <NativeSelect
        defaultValue=""
        disabled={disabled}
        className="h-7 w-[132px] px-1 text-[11px]"
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
          e.target.value = "";
        }}
      >
        <option value="">新增效果…</option>
        {EFFECT_VOCABULARY.map((vocab) => (
          <option key={vocab.type} value={vocab.type}>
            {vocab.title}
          </option>
        ))}
      </NativeSelect>
    </span>
  );
}

function combinatorLabel(cond: Condition): string {
  if ("allOf" in cond) return "全部满足（allOf）";
  if ("anyOf" in cond) return "任一满足（anyOf）";
  if ("not" in cond) return "取反（not）";
  return "";
}

function ConditionForm({
  def,
  conditionRef,
  edit,
  onRemove,
}: {
  def: MechanismDefinition;
  conditionRef: ConditionRef;
  edit: EditHandlers | null;
  onRemove: () => void;
}) {
  const fail = (message: string) => toast.error(message);
  let cond: Condition;
  try {
    cond = getCondition(def, conditionRef);
  } catch (err) {
    return <p className="text-[11px] text-destructive">{(err as Error).message}</p>;
  }
  if (!isLeaf(cond)) {
    return (
      <p className="text-[11px] text-muted-foreground">
        组合子节点（{combinatorLabel(cond)}）——结构由编译器生成，请选择它下方的叶子条件编辑。
      </p>
    );
  }
  const leaf = cond; // isLeaf 已收窄为叶子
  const where = `when[${conditionRef.when}]${conditionRef.leaf.length ? `.${conditionRef.leaf.join(".")}` : ""}`;
  const isDynamic = leaf.valueFrom !== undefined;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground tnum">{where}</p>
      <table className="w-full text-[11px]">
        <tbody>
          <tr className={ROW}>
            <td className={LABEL_CELL}>取值路径</td>
            <td className="py-1 align-top">
              {edit ? (
                <CommitField
                  original={leaf.path}
                  display={leaf.path}
                  placeholder="如 event.action.skillId"
                  onCommit={(value) => edit.conditionField(conditionRef, "path", String(value ?? ""))} onError={fail}
                />
              ) : (
                <span className="break-all tnum">{leaf.path}</span>
              )}
            </td>
          </tr>
          <tr className={ROW}>
            <td className={LABEL_CELL}>算子</td>
            <td className="py-1 align-top">
              {edit ? (
                <NativeSelect
                  value={leaf.op}
                  className="h-7 w-full px-1 text-[11px]"
                  onChange={(e) => edit.conditionField(conditionRef, "op", e.target.value)}
                >
                  {Object.entries(CONDITION_OP_LABELS).map(([op, label]) => (
                    <option key={op} value={op}>
                      {label}（{op}）
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <span className="tnum">
                  {CONDITION_OP_LABELS[leaf.op] ?? leaf.op}（{leaf.op}）
                </span>
              )}
            </td>
          </tr>
          <tr className={ROW}>
            <td className={LABEL_CELL}>{isDynamic ? "比较值·动态" : "比较值"}</td>
            <td className="py-1 align-top">
              {isDynamic ? (
                edit ? (
                  <CommitField
                    original={leaf.valueFrom}
                    display={JSON.stringify(leaf.valueFrom)}
                    onCommit={(value) => edit.conditionField(conditionRef, "valueFrom", value)} onError={fail}
                  />
                ) : (
                  <span className="break-all tnum">{JSON.stringify(leaf.valueFrom)}</span>
                )
              ) : edit ? (
                <CommitField
                  original={leaf.value}
                  display={scalarDisplay(leaf.value)}
                  onCommit={(value) => edit.conditionField(conditionRef, "value", value)} onError={fail}
                />
              ) : (
                <span className="break-all tnum">{leaf.value === undefined ? "—" : valueText(leaf.value)}</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      {edit ? (
        <div className="flex justify-end pt-0.5">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-destructive" onClick={onRemove}>
            删除此条件
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EffectForm({
  def,
  effectIndex,
  edit,
  onRemove,
}: {
  def: MechanismDefinition;
  effectIndex: number;
  edit: EditHandlers | null;
  onRemove: () => void;
}) {
  const fail = (message: string) => toast.error(message);
  const effect = def.effects[effectIndex];
  if (!effect) return <p className="text-[11px] text-destructive">效果不存在：effects[{effectIndex}]</p>;
  const vocab = effectVocabularyOf(effect.type);
  const raw = effect as unknown as Record<string, unknown>;
  const existing = Object.keys(raw).filter((key) => key !== "type");
  const extra = Object.keys(vocab.params ?? {}).filter((key) => key !== "type" && !existing.includes(key));
  // 只读 = 已有字段；编辑 = 已有 ∪ 词汇表可填字段 ∪ chance（去重）。
  const keys = edit ? [...new Set([...existing, ...extra, "chance"])] : existing;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground tnum">
        effects[{effectIndex}] · {vocab.title}
      </p>
      <table className="w-full text-[11px]">
        <tbody>
          <ReadRow label="类型">
            <span className="tnum">{vocab.title}（{effect.type}）</span>
          </ReadRow>
          {keys.map((key) => {
            const original = key === "chance" ? raw.chance : raw[key];
            const label = key === "chance" ? "概率" : (vocab.params?.[key] ?? key);
            return (
              <tr key={key} className={ROW}>
                <td className={LABEL_CELL}>{label}</td>
                <td className="py-1 align-top">
                  {edit ? (
                    <CommitField
                      original={original}
                      display={scalarDisplay(original)}
                      placeholder={original === undefined ? "（空 = 不设）" : undefined}
                      onCommit={(value) => edit.effectField(effectIndex, key, value)} onError={fail}
                    />
                  ) : (
                    <span className="break-all tnum">{readDisplay(key, original)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {edit ? (
        <div className="flex justify-end pt-0.5">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-destructive" onClick={onRemove}>
            删除此效果
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 选中节点 / 机制的详情：只读参数表（G3a）+ 按节点 source 的编辑表单（G3b）。 */
export function DetailPanel({
  mechanism,
  def,
  node,
  payload,
  edit,
}: {
  mechanism: WorkbenchMechanism | null;
  def: MechanismDefinition | null;
  node: ViewNode | null;
  payload: unknown;
  edit: EditHandlers | null;
}) {
  if (!mechanism || !def) {
    return <p className="text-[12px] text-muted-foreground">选择左侧任一机制，查看它的触发条件、效果节点与原始定义。</p>;
  }

  const registered = mechanism.registered;
  const source = node?.source;

  const header = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-semibold">{mechanism.ownerName}</span>
        <Badge variant="outline">{OWNER_TYPE_LABELS[mechanism.ownerType] ?? mechanism.ownerType}</Badge>
        {mechanism.unsupported ? <Badge variant="destructive" className="px-1 py-0 text-[10px]">含未支持</Badge> : null}
        {registered ? <Badge variant="outline" className="px-1 py-0 text-[10px]">自动生成</Badge> : null}
        {def.oncePerTurn ? <Badge variant="secondary" className="px-1 py-0 text-[10px]">每回合一次</Badge> : null}
      </div>
      <p className="text-[11px] text-muted-foreground tnum">{mechanism.id}</p>
      <p className="text-[11px] text-muted-foreground">
        触发：{triggerMetaOf(def.trigger).title}（{def.trigger}）· {def.effects?.length ?? 0} 个效果 · {(def.when ?? []).length} 个条件
      </p>
      {edit && registered ? (
        <p className="text-[11px] text-destructive">自动生成的基础伤害机制由图鉴装配派生，不在此编辑。</p>
      ) : null}
    </div>
  );

  let body: React.ReactNode;

  if (!node) {
    body = edit ? (
      <div className="space-y-2">
        <table className="w-full text-[11px]">
          <tbody>
            <tr className={ROW}>
              <td className={LABEL_CELL}>每回合一次</td>
              <td className="py-1 align-top">
                <NativeSelect
                  value={def.oncePerTurn ? "1" : "0"}
                  className="h-7 w-full px-1 text-[11px]"
                  disabled={registered || def.trigger === "passive"}
                  onChange={(e) => edit.oncePerTurn(e.target.value === "1")}
                >
                  <option value="0">关闭</option>
                  <option value="1">开启（oncePerTurn）</option>
                </NativeSelect>
                {def.trigger === "passive" ? <p className="mt-0.5 text-[10px] text-muted-foreground">passive 触发器按 dispatch 语义不计次</p> : null}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={registered} onClick={edit.addCondition}>
            新增条件
          </Button>
          <AddEffectControl disabled={registered} onAdd={edit.addEffect} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          未选中节点：点画布节点编辑其字段；新增效果先给类型、必填字段在校验里提示。
        </p>
        <JsonBlock value={def} />
      </div>
    ) : (
      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">未选中节点，展示机制完整定义：</p>
        <JsonBlock value={def} />
      </div>
    );
  } else if (!source) {
    // 无 source（防御）：退回只读参数表。
    body = (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold">{node.title}</span>
          <Badge variant="outline" className="text-[10px]">{KIND_LABELS[node.kind] ?? node.kind}</Badge>
        </div>
        <JsonBlock value={payload} />
      </div>
    );
  } else if (source.role === "effect") {
    body = (
      <EffectForm
        def={def}
        effectIndex={source.effect ?? -1}
        edit={registered ? null : edit}
        onRemove={() => edit?.removeEffect(source.effect ?? -1)}
      />
    );
  } else if (source.role === "condition") {
    body = (
      <ConditionForm
        def={def}
        conditionRef={{ when: source.when ?? 0, leaf: source.leaf ?? [] }}
        edit={registered ? null : edit}
        onRemove={() => edit?.removeCondition({ when: source.when ?? 0, leaf: source.leaf ?? [] })}
      />
    );
  } else if (source.role === "gate") {
    body = (
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground">oncePerTurn 门（键 = 阵营 + 机制 id，与 dispatch 一致）</p>
        <table className="w-full text-[11px]">
          <tbody>
            <tr className={ROW}>
              <td className={LABEL_CELL}>开启</td>
              <td className="py-1 align-top">
                <NativeSelect
                  value={def.oncePerTurn ? "1" : "0"}
                  className="h-7 w-full px-1 text-[11px]"
                  disabled={registered}
                  onChange={(e) => edit?.oncePerTurn(e.target.value === "1")}
                >
                  <option value="0">关闭</option>
                  <option value="1">开启</option>
                </NativeSelect>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  } else if (source.role === "entry") {
    body = <p className="text-[11px] text-muted-foreground">触发入口：{triggerMetaOf(def.trigger).title}（{def.trigger}）。触发器修改暂不在画布内（v1）。</p>;
  } else {
    body = <p className="text-[11px] text-muted-foreground">结构节点（{node.subtitle ?? node.title}）——条件组合结构由编译器生成，请选择其下方的叶子条件编辑。</p>;
  }

  return (
    <div className="space-y-3">
      {header}
      {body}
    </div>
  );
}
