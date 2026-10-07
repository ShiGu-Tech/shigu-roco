"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "cn";

const ITEMS = [
  { href: "/", label: "对战台" },
  { href: "/lab", label: "试验台" },
  { href: "/warehouse", label: "精灵仓库" },
  { href: "/data", label: "基础数据" },
  { href: "/engine", label: "引擎" },
  { href: "/replays", label: "对战记录" },
  { href: "/record", label: "复盘" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-sm px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
