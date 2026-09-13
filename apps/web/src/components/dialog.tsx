"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ title, busy, onClose, children }: {
  title: string; busy: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close(); document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      else document.getElementById("add-expense")?.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby="dialog-title" className="expense-dialog" onCancel={(event) => {
    event.preventDefault(); if (!busy) onClose();
  }}>
    <header className="dialog-header"><div><p className="eyebrow">YOUR LEDGER</p><h2 id="dialog-title">{title}</h2></div>
      <button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button>
    </header>{children}
  </dialog>;
}
