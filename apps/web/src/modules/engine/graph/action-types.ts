/** 行动域效果类型（独立轻量模块）：写入节点路由与编译器分段共用。
 *
 *  单独成文件是刻意的——`graph/compiler.ts` 与客户端画布只依赖这张表，
 *  不应为此把 `MechanismRuntime`（51KB）拖进浏览器 bundle。
 */

/** 行动域效果类型：只有提供 actions 上下文（actionDeclared / beforeAction 调用点）才经 applyActionCommands 结算。 */
export const ACTION_EFFECT_TYPES: ReadonlySet<string> = new Set([
  "cancelAction",
  "forceFirst",
  "setPriority",
  "replaceAction",
  "insertAction",
  "unsupported",
]);
