"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * A button that asks for confirmation via a non-blocking in-app modal instead
 * of window.confirm() (which blocks the main thread and hurts INP).
 */
export function ConfirmButton({
  onConfirm,
  message,
  confirmText = "Onayla",
  cancelText = "Vazgeç",
  children,
  ...props
}: ButtonProps & {
  onConfirm: () => Promise<void> | void;
  message: string;
  confirmText?: string;
  cancelText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button type="button" {...props} onClick={() => setOpen(true)}>
        {children}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border bg-card p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm">{message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {cancelText}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await onConfirm();
                    setOpen(false);
                  })
                }
              >
                {pending ? "…" : confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
