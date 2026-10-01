"use client";

import { useEffect, useState, type ReactElement } from "react";

import { PetDetailCard } from "@/components/pet-detail-card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "cn";
import type { ActiveSpriteState, Catalog, CatalogSprite } from "@/modules/battle/types";

/** 是否具备「悬停」能力（桌面精确指针）；初始 false，effect 内探测，保证 SSR 一致。 */
export function useHoverCapable(): boolean {
  const [capable, setCapable] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCapable(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return capable;
}

/** 精灵详情弹窗（触屏 / 无悬停平台用）。 */
export function PetDetailDialog({
  open,
  onOpenChange,
  catalog,
  sprite,
  active,
  headline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  sprite?: CatalogSprite;
  active?: ActiveSpriteState;
  headline?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="text-base">{headline ?? sprite?.name ?? "精灵详情"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="p-0">
          <PetDetailCard catalog={catalog} sprite={sprite} active={active} headline={headline} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 精灵悬浮详情（分平台）：桌面用 HoverCard 移入浮出；触屏在右上角补一个「i」按钮打开详情弹窗。
 * 触发元素本身的可点击行为（如场下头像=换人）不受影响。
 */
export function PetHoverCard({
  catalog,
  sprite,
  active,
  headline,
  className,
  children,
}: {
  catalog: Catalog;
  sprite?: CatalogSprite;
  active?: ActiveSpriteState;
  headline?: string;
  className?: string;
  children: ReactElement;
}) {
  const hover = useHoverCapable();
  const [open, setOpen] = useState(false);

  if (hover) {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>{children}</HoverCardTrigger>
        <HoverCardContent>
          <PetDetailCard catalog={catalog} sprite={sprite} active={active} headline={headline} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {children}
      <button
        type="button"
        aria-label="查看详情"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute right-0.5 top-0.5 z-10 grid h-5 w-5 place-items-center rounded-full border bg-card/90 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        i
      </button>
      <PetDetailDialog
        open={open}
        onOpenChange={setOpen}
        catalog={catalog}
        sprite={sprite}
        active={active}
        headline={headline}
      />
    </div>
  );
}
