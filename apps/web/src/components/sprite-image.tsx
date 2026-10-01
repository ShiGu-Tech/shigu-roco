import type { CatalogSprite } from "@/modules/battle/types";

export function SpriteImage({
  sprite,
  size = "md",
  className = "",
}: {
  sprite?: CatalogSprite;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const src = sprite?.image || sprite?.head;
  const dimensions = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-24 w-24" : "h-16 w-16";

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/50 ${dimensions} ${className}`}>
      {src ? (
        // The catalog can contain URLs from different registered snapshots; plain img keeps all of them renderable.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-contain" loading="lazy" />
      ) : (
        <span className="text-lg font-semibold text-muted-foreground">{sprite?.name?.slice(0, 1) ?? "?"}</span>
      )}
    </span>
  );
}
