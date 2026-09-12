"use client";

import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeech } from "@/lib/voice/speech";
import { cn } from "@/lib/utils";

/**
 * Small mic toggle next to a text field: recognised Turkish speech is appended
 * to the field through `onText`. Hidden where the browser has no recogniser.
 */
export function DictateButton({
  onText,
  className,
  size = "sm",
}: {
  onText: (text: string) => void;
  className?: string;
  size?: "sm" | "icon";
}) {
  const { supported, listening, interim, error, start, stop } = useSpeech({ onFinal: onText });
  if (!supported) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={listening ? "destructive" : "outline"}
        size={size}
        onClick={listening ? stop : start}
        title={listening ? "Dinlemeyi durdur" : "Sesle yaz"}
      >
        {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {size === "sm" && <span className="ml-1">{listening ? "Durdur" : "Sesle yaz"}</span>}
      </Button>
      {listening && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {interim || "Dinliyor…"}
        </span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
