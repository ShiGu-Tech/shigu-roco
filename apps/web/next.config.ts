import type { NextConfig } from "next";

// 允许用 127.0.0.1 访问 dev 资源；否则 Next 会把 HMR / 客户端 chunk 当跨源请求拦掉，
// 表现为页面卡在「正在加载」（客户端组件无法水合）。
// 局域网真机调试（手机连同一 WiFi）用 ROCO_DEV_ORIGINS 追加来源，不把 IP 写死进仓库：
//   $env:ROCO_DEV_ORIGINS="192.168.10.20"; pnpm dev
const devOrigins = (process.env.ROCO_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", "localhost", ...devOrigins],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "roco.world", pathname: "/**" }],
  },
};

export default nextConfig;
