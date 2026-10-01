import Image from "next/image";
import { cn } from "cn";

/** 技能类别图标（物理 / 魔法 / 防御 / 状态）：有图标则渲染图片，否则不渲染。 */
export function SkillCategoryIcon({
  skill,
  size = 16,
  className,
}: {
  skill: { categoryIcon?: string | null; categoryZh?: string; category?: string };
  size?: number;
  className?: string;
}) {
  const label = skill.categoryZh ?? skill.category ?? "";
  if (!skill.categoryIcon) return null;
  return (
    <Image
      src={skill.categoryIcon}
      alt={label}
      title={label}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
