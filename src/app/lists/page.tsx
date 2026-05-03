"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { androidBack } from "@/hooks/androidBack";
import {
  List,
  Plus,
  Trash2,
  Edit3,
  Globe,
  Lock,
  X,
  Check,
  ChevronRight,
  Loader2,
  Search,
  Sparkles,
  Trophy,
  Film,
  Gamepad2,
} from "lucide-react";
import { PageScaffold } from "@/components/ui/PageScaffold";

interface UserList {
  id: string;
  title: string;
  description?: string;
  is_public: boolean;
  cover_image?: string;
  created_at: string;
  item_count?: number;
}

const LIST_TEMPLATES = [
  {
    icon: <Trophy size={16} />,
    title: "Top personali",
    text: "Classifiche dei tuoi preferiti per ogni medium.",
  },
  {
    icon: <Film size={16} />,
    title: "Serate film",
    text: "Raccolte pronte da condividere con amici.",
  },
  {
    icon: <Gamepad2 size={16} />,
    title: "Backlog",
    text: "Giochi, anime e serie da recuperare senza perderli.",
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function ListModal({
  list,
  onClose,
  onSaved,
}: {
  list?: UserList;
  onClose: () => void;
  onSaved: (list: UserList) => void;
}) {
  const [title, setTitle] = useState(list?.title || "");
  const [description, setDescription] = useState(list?.description || "");
  const [isPublic, setIsPublic] = useState(list?.is_public ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    androidBack.push(onClose);
    return () => androidBack.pop(onClose);
  }, [onClose]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    const res = await fetch("/api/lists", {
      method: list ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: list?.id,
        title,
        description,
        is_public: isPublic,
      }),
    }).catch(() => null);

    if (res?.ok) {
      const data = await res.json();
      if (data.list) onSaved(data.list);
    }

    setSaving(false);
    onClose();
  };

  const canSave = title.trim().length > 0 && !saving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      data-no-swipe="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[var(--bg-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="border-b border-[var(--border)] bg-[rgba(230,255,61,0.04)] p-5">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div>
              <div className="mb-2 gk-section-eyebrow">
                <Sparkles size={12} />
                Nuova raccolta
              </div>
              <h3 className="gk-title text-[var(--text-primary)]">
                {list ? "Modifica lista" : "Nuova lista"}
              </h3>
            </div>
            <button
              type="button"
              data-no-swipe="true"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/20 text-[var(--text-secondary)] hover:text-white"
              aria-label="Chiudi modal lista"
            >
              <X size={17} />
            </button>
          </div>
          <p className="gk-caption">
            Crea raccolte tematiche da usare nel profilo e da condividere con la
            community.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="gk-label mb-2 block">Titolo *</label>
            <input
              data-no-swipe="true"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="Es. Top 10 anime di sempre"
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
              maxLength={100}
            />
            <p className="gk-mono mt-1 text-right text-[var(--text-muted)]">
              {title.length}/100
            </p>
          </div>

          <div>
            <label className="gk-label mb-2 block">Descrizione</label>
            <textarea
              data-no-swipe="true"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Breve descrizione della lista..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
              maxLength={500}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex min-w-0 items-center gap-2">
              {isPublic ? (
                <Globe size={16} className="text-emerald-400" />
              ) : (
                <Lock size={16} className="text-[var(--text-muted)]" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {isPublic ? "Pubblica" : "Privata"}
                </p>
                <p className="gk-caption truncate">
                  {isPublic ? "Visibile a tutti" : "Solo tu puoi vederla"}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => setIsPublic((v) => !v)}
              className="h-6 w-12 rounded-full p-0.5 transition-colors"
              style={{
                background: isPublic ? "var(--accent)" : "var(--bg-card-hover)",
              }}
              aria-label="Cambia visibilità lista"
            >
              <div
                className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${isPublic ? "translate-x-6" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-3 border-t border-[var(--border)] p-5">
          <button
            type="button"
            data-no-swipe="true"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-[var(--border)] py-3 font-bold text-[var(--text-secondary)] transition hover:text-white"
          >
            Annulla
          </button>
          <button
            type="button"
            data-no-swipe="true"
            onClick={handleSave}
            disabled={!canSave}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 font-black transition disabled:cursor-not-allowed disabled:bg-[var(--bg-card-hover)] disabled:text-[var(--text-muted)] disabled:opacity-60"
            style={
              canSave
                ? { background: "var(--accent)", color: "#0B0B0F" }
                : undefined
            }
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {list ? "Salva" : "Crea"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListCard({
  list,
  onEdit,
  onDelete,
}: {
  list: UserList;
  onEdit: (list: UserList) => void;
  onDelete: (id: string) => void;
}) {
  const count = list.item_count ?? 0;

  return (
    <div className="group rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-colors hover:border-[rgba(230,255,61,0.24)] hover:bg-[var(--bg-card-hover)]">
      <div className="flex items-start gap-3">
        <Link
          href={`/lists/${list.id}`}
          data-no-swipe="true"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-[rgba(230,255,61,0.16)] bg-[rgba(230,255,61,0.07)] text-[var(--accent)] transition-transform group-hover:scale-[1.03]"
          aria-label={`Apri lista ${list.title}`}
        >
          <List size={20} />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/lists/${list.id}`}
            data-no-swipe="true"
            className="block min-w-0"
          >
            <div className="mb-1 flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[15px] font-black leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                {list.title}
              </h3>
              <span className="flex-shrink-0 rounded-full border border-[var(--border)] bg-black/18 px-2 py-0.5 font-mono-data text-[10px] font-black text-[var(--text-muted)]">
                {count}
              </span>
            </div>
            {list.description ? (
              <p className="line-clamp-2 text-[12px] leading-5 text-[var(--text-muted)]">
                {list.description}
              </p>
            ) : (
              <p className="gk-mono text-[var(--text-muted)]">
                raccolta personale
              </p>
            )}
          </Link>

          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${list.is_public ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.04] text-[var(--text-muted)]"}`}
            >
              {list.is_public ? <Globe size={11} /> : <Lock size={11} />}
              {list.is_public ? "Pubblica" : "Privata"}
            </span>
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => onEdit(list)}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 text-[11px] font-bold text-[var(--text-secondary)] transition-colors hover:text-white"
            >
              <Edit3 size={12} /> Modifica
            </button>
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => onDelete(list.id)}
              className="inline-flex h-8 items-center justify-center rounded-xl border border-[var(--border)] px-2.5 text-[var(--text-muted)] transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
              aria-label="Elimina lista"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        <Link
          href={`/lists/${list.id}`}
          data-no-swipe="true"
          className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)] sm:flex"
          aria-label={`Apri lista ${list.title}`}
        >
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function ListsStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-black/14 px-3 py-2 ring-1 ring-white/5">
      <p
        className={`font-mono-data text-[18px] font-black leading-none ${accent ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}
      >
        {value}
      </p>
      <p className="gk-label mt-1 truncate">{label}</p>
    </div>
  );
}

export default function ListsPage() {
  const [lists, setLists] = useState<UserList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingList, setEditingList] = useState<UserList | undefined>();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [query, setQuery] = useState("");
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setIsLoggedIn(true);

      const { data } = await supabase
        .from("user_lists")
        .select("id, title, description, is_public, cover_image, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const listsWithCount = await Promise.all(
        (data || []).map(async (l) => {
          const { count } = await supabase
            .from("user_list_items")
            .select("id", { count: "exact", head: true })
            .eq("list_id", l.id);
          return { ...l, item_count: count || 0 };
        }),
      );

      setLists(listsWithCount);
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return lists;
    return lists.filter((list) =>
      normalize([list.title, list.description || ""].join(" ")).includes(q),
    );
  }, [lists, query]);

  const publicCount = lists.filter((list) => list.is_public).length;
  const totalItems = lists.reduce(
    (sum, list) => sum + (list.item_count || 0),
    0,
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questa lista?")) return;
    const res = await fetch("/api/lists", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (res?.ok) setLists((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSaved = (saved: UserList) => {
    setLists((prev) => {
      const existing = prev.findIndex((l) => l.id === saved.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...saved, item_count: prev[existing].item_count };
        return updated;
      }
      return [{ ...saved, item_count: 0 }, ...prev];
    });
  };

  if (!isLoggedIn && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6 text-center text-white">
        <div>
          <List size={48} className="mx-auto mb-4 text-zinc-600" />
          <h1 className="mb-3 text-2xl font-bold">Le tue liste</h1>
          <p className="mb-6 text-zinc-400">
            Accedi per creare liste personalizzate
          </p>
          <Link
            href="/login"
            data-no-swipe="true"
            className="rounded-2xl px-6 py-3 font-semibold transition"
            style={{ background: "var(--accent)", color: "#0B0B0F" }}
          >
            Accedi
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold
      title="Liste"
      description="Raccolte curate, classifiche personali e collezioni da condividere."
      icon={<List size={16} />}
      contentClassName="mx-auto max-w-screen-lg pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/62 p-4 ring-1 ring-white/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 gk-section-eyebrow">
              <List size={13} /> Raccolte
            </div>
            <h1 className="font-display text-[30px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)]">
              Liste
            </h1>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-[var(--text-muted)]">
              Raccolte curate da mostrare nel profilo o condividere.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:w-[560px]">
            <div className="grid grid-cols-3 gap-2">
              <ListsStat label="liste" value={lists.length} accent />
              <ListsStat label="pubbliche" value={publicCount} />
              <ListsStat label="titoli" value={totalItems} />
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
                <input
                  data-no-swipe="true"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cerca liste..."
                  className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-2.5 pl-10 pr-4 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
                />
              </div>
              <button
                type="button"
                data-no-swipe="true"
                onClick={() => {
                  setEditingList(undefined);
                  setShowModal(true);
                }}
                className="inline-flex h-11 flex-shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition-transform hover:scale-[1.02]"
                style={{ background: "var(--accent)", color: "#0B0B0F" }}
              >
                <Plus size={16} /> Nuova
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-[98px] rounded-2xl bg-[var(--bg-card)] skeleton"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <List size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">
            {lists.length === 0
              ? "Nessuna lista ancora"
              : "Nessuna lista trovata"}
          </p>
          <p className="gk-body mx-auto mb-5 max-w-sm">
            {lists.length === 0
              ? "Crea la tua prima lista oppure parti da un template mentale: top, backlog, serata film o preferiti di sempre."
              : "Prova a cambiare ricerca."}
          </p>
          {lists.length === 0 && (
            <div className="mx-auto mb-6 grid max-w-3xl gap-3 md:grid-cols-3">
              {LIST_TEMPLATES.map((template) => (
                <div
                  key={template.title}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-black/18 p-4 text-left ring-1 ring-white/5"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(230,255,61,0.10)] text-[var(--accent)]">
                    {template.icon}
                  </div>
                  <p className="text-sm font-black text-[var(--text-primary)]">
                    {template.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                    {template.text}
                  </p>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            data-no-swipe="true"
            onClick={() => {
              lists.length === 0 ? setShowModal(true) : setQuery("");
            }}
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]"
          >
            {lists.length === 0 ? "Crea la prima lista" : "Cancella ricerca"}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((list) => (
            <ListCard
              key={list.id}
              list={list}
              onEdit={(l) => {
                setEditingList(l);
                setShowModal(true);
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showModal && (
        <ListModal
          list={editingList}
          onClose={() => {
            setShowModal(false);
            setEditingList(undefined);
          }}
          onSaved={handleSaved}
        />
      )}
    </PageScaffold>
  );
}
