import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 允许用 127.0.0.1 访问 dev 资源；否则 Next 会把 HMR / 客户端 chunk 当跨源请求拦掉，
  // 表现为页面卡在「正在加载」（客户端组件无法水合）。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
