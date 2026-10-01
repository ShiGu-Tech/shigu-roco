"use client";

import { PetSelector } from "@/components/pet-selector";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "cn";
import type { Catalog, CatalogSprite } from "@/modules/battle/types";

export interface PetSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  /** 当前选中的精灵 id（用于高亮）。 */
  value?: string;
  /** 选中即回调，并自动关闭弹窗。 */
  onSelect: (spriteId: string, sprite: CatalogSprite) => void;
  title?: string;
  description?: string;
  contentClassName?: string;
}

/**
 * 通用「选择精灵（图鉴模板）」弹窗：内部复用 PetSelector，选中即关闭。
 * 统一的选精灵入口，供队伍配置 / 仓库新增等场景使用。
 */
export function PetSelectorDialog({
  open,
  onOpenChange,
  catalog,
  value,
  onSelect,
  title = "选择精灵",
  description,
  contentClassName,
}: PetSelectorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-[720px]", contentClassName)}>
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle className="text-base">{title}</DialogTitle>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </DialogHeader>
        <DialogBody>
          <PetSelector
            catalog={catalog}
            value={value}
            onSelect={(spriteId, sprite) => {
              onSelect(spriteId, sprite);
              onOpenChange(false);
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
