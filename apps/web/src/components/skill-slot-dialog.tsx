"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SkillSelector } from "@/components/skill-selector";
import type { Catalog } from "@/modules/battle/types";

export interface SkillSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  spriteId: string;
  slotIndex: number;
  value?: string;
  onSelect: (skillId: string) => void;
  onClear: () => void;
}

/** 技能槽选择弹窗：复用通用 SkillSelector（手机上是分栏切换，PC 是四列）。 */
export function SkillSlotDialog({
  open,
  onOpenChange,
  catalog,
  spriteId,
  slotIndex,
  value,
  onSelect,
  onClear,
}: SkillSlotDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[960px]">
        <DialogHeader>
          <DialogTitle className="text-base">第 {slotIndex + 1} 个技能槽</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <SkillSelector
            catalog={catalog}
            spriteId={spriteId}
            value={value}
            onSelect={(skillId) => {
              onSelect(skillId);
              onOpenChange(false);
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onClear();
              onOpenChange(false);
            }}
          >
            清空该槽
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
