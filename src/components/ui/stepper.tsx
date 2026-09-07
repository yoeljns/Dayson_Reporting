"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Big-thumb numeric stepper (e.g. pallets in 0,5 steps). */
export function Stepper({
  value,
  onChange,
  step = 0.5,
  min = 0,
  max = 999,
  disabled,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10));
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-md border bg-card text-foreground hover:bg-accent disabled:opacity-40";
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        className={btn}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - step))}
        aria-label="Azalt"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        className="h-10 w-16 rounded-md border bg-background text-center text-base font-semibold tabular-nums"
      />
      <button
        type="button"
        className={btn}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + step))}
        aria-label="Artır"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
