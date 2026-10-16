"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { cn } from "cn";

import { Dialog, DialogBody, DialogHeader, DialogSheet, DialogTitle, DialogTrigger } from "./ui/dialog";

const ITEMS = [
  { href: "/warehouse", label: "精灵仓库" },
  { href: "/lineups", label: "队伍列表" },
  { href: "/replays", label: "对战记录" },
];

function useActiveHref() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/** 桌面横向标签（≥860px）。窄屏不用它——7 项横滚在手机上既挤又看不出还有内容。 */
export function AppNav() {
  const isActive = useActiveHref();
  return (
    <nav className="hidden min-w-0 items-center gap-0.5 overflow-x-auto min-[860px]:flex">
      {ITEMS.map((item) => {
        const active = isActive(item.href);
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

/** 窄屏导航入口（<860px）：菜单按钮 + 底部抽屉；每项 44px 触控高度。 */
export function AppNavMenu() {
  const isActive = useActiveHref();
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="打开导航菜单"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground min-[860px]:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
      </DialogTrigger>
      <DialogSheet aria-describedby={undefined}>
        <DialogHeader className="py-2.5">
          <DialogTitle className="text-sm font-semibold tracking-tight">导航</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-2">
          <div className="grid gap-0.5">
            {ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-11 items-center rounded-md px-3 text-sm transition-colors",
                    active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </DialogBody>
      </DialogSheet>
    </Dialog>
  );
}
