"use client";

import { cn } from "cn";

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  onValueChange?: (value: number) => void;
}

/** 轻量滑条：原生 range + 语义色 token（与 ui/progress 同风格，不引入额外依赖）。 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  onValueChange,
  "aria-label": ariaLabel,
}: SliderProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onValueChange?.(Number(e.target.value))}
      className={cn("w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40", className)}
    />
  );
}
