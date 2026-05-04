"use client";
// src/components/profile/DeleteAccountModal.tsx
// 7.4 — estratto da profile/[username]/page.tsx

import { useState, useEffect } from "react";
import { androidBack } from "@/hooks/androidBack";
import { Trash2, Loader2 } from "lucide-react";
import { useLocale } from "@/lib/locale";

const DELETE_COPY = {
  it: {
    title: "Elimina account",
    irreversible: "irreversibile",
    bodyBefore: "Questa azione è",
    bodyAfter: "Tutti i tuoi dati verranno cancellati permanentemente.",
    labelBefore: "Scrivi",
    labelAfter: "per confermare",
    cancel: "Annulla",
    deleting: "Eliminazione...",
    deleteForever: "Elimina definitivamente",
  },
  en: {
    title: "Delete account",
    irreversible: "irreversible",
    bodyBefore: "This action is",
    bodyAfter: "All your data will be permanently deleted.",
    labelBefore: "Type",
    labelAfter: "to confirm",
    cancel: "Cancel",
    deleting: "Deleting...",
    deleteForever: "Delete permanently",
  },
} as const;

interface DeleteAccountModalProps {
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DeleteAccountModal({
  onConfirm,
  onClose,
}: DeleteAccountModalProps) {
  const { locale } = useLocale();
  const dc = DELETE_COPY[locale];
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    androidBack.push(onClose);
    return () => androidBack.pop(onClose);
  }, [onClose]);

  const handleDelete = async () => {
    if (confirmText !== "elimina") return;
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[70] p-4">
      <div className="bg-zinc-900 border border-red-900/50 rounded-3xl max-w-md w-full p-8">
        <div className="w-14 h-14 bg-red-950 border border-red-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Trash2 size={28} className="text-red-400" />
        </div>
        <h3 className="text-2xl font-bold text-white text-center mb-2">
          {dc.title}
        </h3>
        <p className="text-zinc-400 text-center text-sm mb-6">
          {dc.bodyBefore}{" "}
          <strong className="text-red-400">{dc.irreversible}</strong>.{" "}
          {dc.bodyAfter}
        </p>
        <div className="mb-6">
          <label className="block text-sm text-zinc-500 mb-2">
            {dc.labelBefore}{" "}
            <span className="text-red-400 font-mono font-bold">elimina</span>{" "}
            {dc.labelAfter}
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="elimina"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              onClose();
              setConfirmText("");
            }}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors font-medium"
          >
            {dc.cancel}
          </button>
          <button
            onClick={handleDelete}
            disabled={confirmText !== "elimina" || deleting}
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-30 rounded-2xl transition-colors font-medium text-white flex items-center justify-center gap-2"
          >
            {deleting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {dc.deleting}
              </>
            ) : (
              dc.deleteForever
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
