import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // 与 tsconfig 的 "@/*" → "./src/*" 对齐，供 vitest 解析跨模块导入。
    alias: { "@": path.resolve(root, "src") },
  },
});
