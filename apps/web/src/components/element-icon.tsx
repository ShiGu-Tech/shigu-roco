import Image from "next/image";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import type { Catalog } from "@/modules/battle/types";

function elementDef(catalog: Catalog, key: string) {
  return catalog.elements.find((el) => el.name === key);
}

/** 系别图标（图鉴 elements.icon）；无图标时不渲染。 */
export function ElementIcon({
  catalog,
  element,
  size = 16,
  className,
}: {
  catalog: Catalog;
  element: string;
  size?: number;
  className?: string;
}) {
  const def = elementDef(catalog, element);
  if (!def?.icon) return null;
  const label = def.nameZh ?? def.name;
  return (
    <Image
      src={def.icon}
      alt={label}
      title={label}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/** 系别徽标：图标 + 文字备注。 */
export function ElementBadge({
  catalog,
  element,
  showText = true,
  className,
}: {
  catalog: Catalog;
  element: string;
  showText?: boolean;
  className?: string;
}) {
  const def = elementDef(catalog, element);
  const label = def?.nameZh ?? element;
  return (
    <Badge variant="outline" className={cn("gap-1", className)}>
      <ElementIcon catalog={catalog} element={element} size={14} />
      {showText ? label : null}
    </Badge>
  );
}
