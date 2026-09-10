"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/primitives";

/**
 * Potvrzení destruktivní akce — náhrada za nativní `confirm()`.
 *
 * Vzniklo v Manažerovi (smazání kariéry) a bylo tam zavřené, takže mazání tipu
 * i uloženého porovnání zůstalo na jeden klik bez undo. Tady je to sdílené, aby
 * „nevratná akce se ptá" platilo napříč appkou, ne jen v jedné sekci.
 */
export interface ConfirmDialogData {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * Stav dialogu + otevírák. Volající drží jen `ask({...})`, samotný modal vykreslí
 * `<ConfirmDialog {...confirm} />` na konci svého stromu.
 */
export function useConfirm(): {
  data: ConfirmDialogData | null;
  ask: (d: ConfirmDialogData) => void;
  close: () => void;
} {
  const [data, setData] = useState<ConfirmDialogData | null>(null);
  const close = useCallback(() => setData(null), []);
  return { data, ask: setData, close };
}

export function ConfirmDialog({
  data,
  onClose,
}: {
  data: ConfirmDialogData | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Esc zavírá. Bez toho je modal na klávesnici past – potvrzení jde odkliknout jen myší.
  useEffect(() => {
    if (!data) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [data, onClose]);

  if (!data) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      // Na mobilu u spodního okraje (palec), od `sm` na střed.
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="ui-panel w-full max-w-sm p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-base font-bold text-foreground">Potvrdit akci?</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{data.message}</p>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            Zrušit
          </Button>
          <Button
            type="button"
            autoFocus
            onClick={() => {
              data.onConfirm();
              onClose();
            }}
            variant="danger"
            className="flex-1"
          >
            {data.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
