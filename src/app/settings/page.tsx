// N1: Aura aggiunto nel ciclo temi
"use client";
// src/app/settings/page.tsx
// M5: Sezione "Sicurezza" con cambio password, logout da tutti i dispositivi, ultimo accesso
// #22: Sezione importazione Xbox aggiunta
// #24: Toggle digest email settimanale

import { useState, useEffect } from "react";
import { useLocale } from "@/lib/locale";
import { appCopy } from "@/lib/i18n/appCopy";
import { createClient } from "@/lib/supabase/client";
import {
  List,
  TrendingUp,
  BarChart3,
  Bell,
  Shield,
  KeyRound,
  LogOut,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
  Mail,
  Check,
  Tv,
  Trash2,
  UserRound,
  ExternalLink,
} from "lucide-react";
import { DeleteAccountModal } from "@/components/profile/DeleteAccountModal";
import { useCsrf } from "@/hooks/useCsrf";
import { PushNotificationsToggle } from "@/components/notifications/PushNotificationsToggle";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { SettingsControlHero } from "@/components/settings/SettingsControlHero";
import Link from "next/link";
import { useRouter } from "next/navigation";

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <h2 className="gk-label">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SettingsCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] ${className}`}
    >
      {children}
    </div>
  );
}

function ActionIcon({
  children,
  danger = false,
}: {
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/5 transition-colors"
      style={
        danger
          ? { background: "rgba(248,113,113,0.10)", color: "#f87171" }
          : { background: "rgba(230,255,61,0.08)", color: "var(--accent)" }
      }
    >
      {children}
    </div>
  );
}

const SETTINGS_TEXT = {
  it: {
    logoutTitle: "Esci dall\'account",
    logoutDesc: "Disconnettiti da questo dispositivo",
    changePassword: "Cambia password",
    changePasswordDesc: "Aggiorna le credenziali di accesso",
    currentPassword: "Password attuale",
    newPassword: "Nuova password (min. 8 caratteri)",
    updatingPassword: "Aggiornamento...",
    updatePassword: "Aggiorna password",
    userNotFound: "Utente non trovato",
    globalLogoutConfirm:
      "Verrai disconnesso da tutti i dispositivi. Continuare?",
    globalLogoutTitle: "Esci da tutti i dispositivi",
    globalLogoutDesc: "Invalida tutte le sessioni attive",
    logoutEverywhereLabel: "Esci anche dagli altri dispositivi",
    logoutEverywhereHint: "Se attivo, chiude ogni sessione prima di tornare al login.",
    logoutSubmit: "Esci",
    currentSession: (info: string) => `Sessione corrente iniziata il ${info}`,
    digestTitle: "Digest settimanale",
    digestDesc: "Riepilogo ogni lunedì: gusti, completati, trending",
    digestOff: "Disattiva digest",
    digestOn: "Attiva digest",
    streamingIntro: (
      <>
        Seleziona le piattaforme attive. I consigli di film e serie verranno{" "}
        <span className="font-bold text-[var(--accent)]">boostati</span> se
        disponibili su queste piattaforme.
      </>
    ),
    streamingEmpty:
      "Nessuna piattaforma selezionata: i consigli non terranno conto della disponibilità.",
    saving: "Salvataggio…",
    savePlatforms: "Salva piattaforme",
    deleteAccount: "Elimina account",
    deleteAccountDesc: "Cancella tutti i tuoi dati in modo permanente",
    pageDescription:
      "Lingua, notifiche, sicurezza e piattaforme: il pannello operativo del tuo account.",
    sections: {
      account: "Account e profilo",
      security: "Accesso e sicurezza",
      notifications: "Notifiche e riepiloghi",
      streaming: "Preferenze media",
      other: "Strumenti",
      danger: "Zona pericolosa",
    },
    links: [
      {
        href: "/stats",
        label: "Tempo sprecato",
        desc: "Calcola quante ore hai speso",
      },
      {
        href: "/trending",
        label: "Trending community",
        desc: "I più aggiunti questa settimana",
      },
      {
        href: "/lists",
        label: "Le mie liste",
        desc: "Crea e condividi liste tematiche",
      },
    ],
    madeWith: "Fatto con",
    forNerds: "per i nerd",
    dataProvidedBy: "Dati forniti da",
    profileTitle: "Modifica profilo",
    profileDesc: "Username, nome visibile, avatar e bio",
    accountIntro: "Gestisci identità, lingua e sessione corrente.",
  },
  en: {
    logoutTitle: "Log out",
    logoutDesc: "Sign out from this device",
    changePassword: "Change password",
    changePasswordDesc: "Update your sign-in credentials",
    currentPassword: "Current password",
    newPassword: "New password (min. 8 characters)",
    updatingPassword: "Updating...",
    updatePassword: "Update password",
    userNotFound: "User not found",
    globalLogoutConfirm: "You will be signed out from all devices. Continue?",
    globalLogoutTitle: "Log out from all devices",
    globalLogoutDesc: "Invalidate every active session",
    logoutEverywhereLabel: "Also log out from other devices",
    logoutEverywhereHint: "When enabled, every session is closed before returning to login.",
    logoutSubmit: "Log out",
    currentSession: (info: string) => `Current session started on ${info}`,
    digestTitle: "Weekly digest",
    digestDesc: "Monday recap: taste, completed titles, trending",
    digestOff: "Turn digest off",
    digestOn: "Turn digest on",
    streamingIntro: (
      <>
        Select your active platforms. Movie and TV recommendations will be{" "}
        <span className="font-bold text-[var(--accent)]">boosted</span> when
        available there.
      </>
    ),
    streamingEmpty:
      "No platform selected: recommendations will not consider availability.",
    saving: "Saving…",
    savePlatforms: "Save platforms",
    deleteAccount: "Delete account",
    deleteAccountDesc: "Permanently delete all your data",
    pageDescription:
      "Language, notifications, security and platforms: your account control panel.",
    sections: {
      account: "Account and profile",
      security: "Access and security",
      notifications: "Notifications and recaps",
      streaming: "Media preferences",
      other: "Tools",
      danger: "Danger zone",
    },
    links: [
      {
        href: "/stats",
        label: "Time wasted",
        desc: "Calculate how many hours you spent",
      },
      {
        href: "/trending",
        label: "Community trending",
        desc: "Most added this week",
      },
      {
        href: "/lists",
        label: "My lists",
        desc: "Create and share themed lists",
      },
    ],
    madeWith: "Made with",
    forNerds: "for nerds",
    dataProvidedBy: "Data provided by",
    profileTitle: "Edit profile",
    profileDesc: "Username, display name, avatar and bio",
    accountIntro: "Manage identity, language and current session.",
  },
} as const;

function useSettingsText() {
  const { locale } = useLocale();
  return SETTINGS_TEXT[locale];
}

function LogoutPanel() {
  const st = useSettingsText();
  const [loading, setLoading] = useState(false);
  const [everywhere, setEverywhere] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleLogout = async () => {
    if (everywhere && !confirm(st.globalLogoutConfirm)) return;
    setLoading(true);
    try {
      if (everywhere) {
        await supabase.auth.signOut({ scope: "global" });
      } else {
        await supabase.auth.signOut();
      }
      document.cookie = "geekore_onboarding_done=; path=/; max-age=0";
      router.push("/login");
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-start gap-3">
        <ActionIcon danger>
          <LogOut size={16} />
        </ActionIcon>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {st.logoutTitle}
          </p>
          <p className="gk-caption">{st.logoutDesc}</p>
        </div>
      </div>

      <label
        data-no-swipe="true"
        className="mb-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3 transition-colors hover:border-[rgba(230,255,61,0.28)] hover:bg-[var(--bg-card-hover)]"
      >
        <input
          type="checkbox"
          checked={everywhere}
          onChange={(e) => setEverywhere(e.target.checked)}
          className="sr-only"
        />
        <span
          className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all"
          style={
            everywhere
              ? {
                  background: "var(--accent)",
                  borderColor: "var(--accent)",
                  color: "#0B0B0F",
                }
              : {
                  background: "rgba(255,255,255,0.03)",
                  borderColor: "var(--border)",
                  color: "transparent",
                }
          }
        >
          <Check size={13} strokeWidth={3} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[var(--text-primary)]">
            {st.logoutEverywhereLabel}
          </span>
          <span className="gk-caption block leading-snug">
            {st.logoutEverywhereHint}
          </span>
        </span>
      </label>

      <button
        type="button"
        data-no-swipe="true"
        onClick={handleLogout}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 py-2.5 text-sm font-black text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
        {everywhere ? st.globalLogoutTitle : st.logoutSubmit}
      </button>
    </div>
  );
}

function ChangePasswordSheet() {
  const st = useSettingsText();
  const [open, setOpen] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 8) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error(st.userNotFound);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPass,
      });
      if (signInError) return;

      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;

      setOpen(false);
      setCurrentPass("");
      setNewPass("");
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-[var(--bg-card-hover)]"
      >
        <div className="flex items-center gap-3">
          <ActionIcon>
            <KeyRound size={15} />
          </ActionIcon>
          <div className="text-left">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {st.changePassword}
            </p>
            <p className="gk-caption">{st.changePasswordDesc}</p>
          </div>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-[var(--text-muted)]" />
        ) : (
          <ChevronDown size={16} className="text-[var(--text-muted)]" />
        )}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 border-t border-[var(--border)] px-4 pb-4 pt-4"
        >
          <div className="relative">
            <input
              data-no-swipe="true"
              type={showCurrent ? "text" : "password"}
              placeholder={st.currentPassword}
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
              required
            />
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => setShowCurrent((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="relative">
            <input
              data-no-swipe="true"
              type={showNew ? "text" : "password"}
              placeholder={st.newPassword}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
              minLength={8}
              required
            />
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => setShowNew((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="submit"
            data-no-swipe="true"
            disabled={loading || newPass.length < 8 || currentPass.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border py-2.5 text-sm font-black transition-colors enabled:border-[rgba(230,255,61,0.42)] enabled:bg-[rgba(230,255,61,0.12)] enabled:text-[var(--accent)] enabled:hover:bg-[rgba(230,255,61,0.17)] disabled:border-[var(--border)] disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-muted)]"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? st.updatingPassword : st.updatePassword}
          </button>
        </form>
      )}
    </div>
  );
}

function LastAccessInfo() {
  const { locale } = useLocale();
  const st = useSettingsText();
  const [info, setInfo] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const ts = (user as any)?.last_sign_in_at;
      if (ts) {
        setInfo(
          new Date(ts).toLocaleString(locale === "en" ? "en-US" : "it-IT", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;

  return <p className="gk-caption px-4 py-3">{st.currentSession(info)}</p>;
}

function DigestToggle() {
  const st = useSettingsText();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
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

      const params = new URLSearchParams(window.location.search);
      if (params.get("digest") === "off") {
        await fetch("/api/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ digest_enabled: false }),
        });
        setEnabled(false);
        setLoading(false);
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      const { data } = await supabase
        .from("user_preferences")
        .select("digest_enabled")
        .eq("user_id", user.id)
        .single();

      setEnabled(data?.digest_enabled !== false);
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const next = !enabled;
    setEnabled(next);

    await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest_enabled: next }),
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex min-w-0 items-center gap-3">
        <ActionIcon>
          <Mail size={15} />
        </ActionIcon>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {st.digestTitle}
          </p>
          <p className="gk-caption line-clamp-1">{st.digestDesc}</p>
        </div>
      </div>

      {loading ? (
        <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
      ) : (
        <button
          type="button"
          data-no-swipe="true"
          onClick={toggle}
          className="flex h-8 w-[74px] flex-shrink-0 items-center justify-center rounded-xl border px-3 text-[11px] font-black tracking-[0.14em] transition-colors"
          style={
            enabled
              ? {
                  background: "rgba(230,255,61,0.12)",
                  borderColor: "rgba(230,255,61,0.38)",
                  color: "var(--accent)",
                }
              : {
                  background: "var(--bg-secondary)",
                  borderColor: "var(--border)",
                  color: "var(--text-muted)",
                }
          }
          aria-label={enabled ? st.digestOff : st.digestOn}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      )}
    </div>
  );
}

const STREAMING_PLATFORMS = [
  {
    id: 8,
    name: "Netflix",
    color: "bg-red-600",
    textColor: "text-red-400",
    borderColor: "border-red-500/40",
    logo: "🎬",
  },
  {
    id: 119,
    name: "Prime Video",
    color: "bg-sky-600",
    textColor: "text-sky-400",
    borderColor: "border-sky-500/40",
    logo: "📦",
  },
  {
    id: 337,
    name: "Disney+",
    color: "bg-blue-700",
    textColor: "text-blue-400",
    borderColor: "border-blue-500/40",
    logo: "✨",
  },
  {
    id: 283,
    name: "Crunchyroll",
    color: "bg-orange-600",
    textColor: "text-orange-400",
    borderColor: "border-orange-500/40",
    logo: "⛩️",
  },
  {
    id: 531,
    name: "Paramount+",
    color: "bg-blue-500",
    textColor: "text-blue-300",
    borderColor: "border-blue-400/40",
    logo: "⭐",
  },
  {
    id: 39,
    name: "NOW TV",
    color: "bg-lime-600",
    textColor: "text-lime-400",
    borderColor: "border-lime-500/40",
    logo: "📡",
  },
  {
    id: 35,
    name: "Apple TV+",
    color: "bg-zinc-600",
    textColor: "text-zinc-300",
    borderColor: "border-zinc-500/40",
    logo: "🍎",
  },
  {
    id: 2,
    name: "Apple iTunes",
    color: "bg-zinc-700",
    textColor: "text-zinc-400",
    borderColor: "border-zinc-600/40",
    logo: "💾",
  },
  {
    id: 3,
    name: "Google Play",
    color: "bg-green-600",
    textColor: "text-green-400",
    borderColor: "border-green-500/40",
    logo: "▶️",
  },
  {
    id: 192,
    name: "YouTube",
    color: "bg-red-700",
    textColor: "text-red-400",
    borderColor: "border-red-600/40",
    logo: "📺",
  },
  {
    id: 1773,
    name: "MUBI",
    color: "bg-indigo-600",
    textColor: "text-indigo-400",
    borderColor: "border-indigo-500/40",
    logo: "🎞️",
  },
  {
    id: 188,
    name: "Sky Go",
    color: "bg-violet-700",
    textColor: "text-violet-400",
    borderColor: "border-violet-500/40",
    logo: "☁️",
  },
] as const;

function StreamingPlatformsSelector({
  onSelectedCountChange,
}: {
  onSelectedCountChange?: (count: number) => void;
}) {
  const st = useSettingsText();
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const { data } = await supabase
        .from("user_preferences")
        .select("streaming_platforms")
        .eq("user_id", user.id)
        .single();
      if (data?.streaming_platforms) {
        const platforms = data.streaming_platforms as number[];
        setSelected(platforms);
        onSelectedCountChange?.(platforms.length);
      }
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = prev.includes(id)
        ? prev.filter((p) => p !== id)
        : [...prev, id];
      onSelectedCountChange?.(next.length);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streaming_platforms: selected }),
    });
    setSaving(false);
  };

  return (
    <SettingsCard>
      <div className="px-5 pb-3 pt-4">
        <p className="gk-body max-w-none">{st.streamingIntro}</p>
        {selected.length === 0 && !loading && (
          <p className="gk-caption mt-1">{st.streamingEmpty}</p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2
            size={18}
            className="animate-spin text-[var(--text-muted)]"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          {STREAMING_PLATFORMS.map(
            ({ id, name, textColor, borderColor, logo }) => {
              const isSelected = selected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  data-no-swipe="true"
                  onClick={() => toggle(id)}
                  className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all ${
                    isSelected
                      ? `${borderColor} bg-[var(--bg-secondary)] ${textColor}`
                      : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="text-base leading-none">{logo}</span>
                  <span className="truncate">{name}</span>
                  {isSelected && (
                    <Check
                      size={12}
                      className="ml-auto flex-shrink-0"
                      style={{ color: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            },
          )}
        </div>
      )}

      <div className="px-3 pb-3">
        <button
          type="button"
          data-no-swipe="true"
          onClick={save}
          disabled={saving || loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border py-2.5 text-sm font-black transition-colors enabled:border-[rgba(230,255,61,0.42)] enabled:bg-[rgba(230,255,61,0.12)] enabled:text-[var(--accent)] enabled:hover:bg-[rgba(230,255,61,0.17)] disabled:border-[var(--border)] disabled:bg-[var(--bg-secondary)] disabled:text-[var(--text-muted)]"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          {saving ? st.saving : st.savePlatforms}
        </button>
      </div>
    </SettingsCard>
  );
}

function DeleteAccountSection() {
  const st = useSettingsText();
  const [showModal, setShowModal] = useState(false);
  const { csrfFetch } = useCsrf();
  const supabase = createClient();

  const handleDelete = async () => {
    const res = await csrfFetch("/api/user/delete", { method: "DELETE" });
    if (res.ok) {
      await supabase.auth.signOut();
      document.cookie = "geekore_onboarding_done=; path=/; max-age=0";
      window.location.href = "/";
    }
  };

  return (
    <>
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => setShowModal(true)}
        className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-red-500/5"
      >
        <ActionIcon danger>
          <Trash2 size={16} />
        </ActionIcon>
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)] transition-colors group-hover:text-red-300">
            {st.deleteAccount}
          </p>
          <p className="gk-caption">{st.deleteAccountDesc}</p>
        </div>
      </button>
      {showModal && (
        <DeleteAccountModal
          onConfirm={handleDelete}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}


function SettingsRowLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      data-no-swipe="true"
      className="group flex items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-[var(--bg-card-hover)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <ActionIcon>{icon}</ActionIcon>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">{title}</p>
          <p className="gk-caption line-clamp-1">{description}</p>
        </div>
      </div>
      <ExternalLink size={15} className="flex-shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]" />
    </Link>
  );
}

function LanguageCard() {
  const { locale, setLocale } = useLocale();
  const copy = appCopy(locale);

  return (
    <div className="border-t border-[var(--border)] px-4 pb-4 pt-3">
      <p className="gk-caption mb-3">{copy.settings.productLanguage}</p>
      <div className="grid grid-cols-2 gap-2" data-no-swipe="true">
        {(["it", "en"] as const).map((lang) => {
          const active = locale === lang;
          return (
            <button
              key={lang}
              type="button"
              data-no-swipe="true"
              onClick={() => setLocale(lang)}
              aria-pressed={active}
              className={`flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-black transition-all ${
                active
                  ? "border-[rgba(230,255,61,0.55)] bg-[rgba(230,255,61,0.14)] text-[var(--text-primary)] shadow-[0_0_0_1px_rgba(230,255,61,0.08),0_0_24px_rgba(230,255,61,0.08)]"
                  : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[rgba(230,255,61,0.22)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>{lang === "it" ? copy.settings.italian : copy.settings.english}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { locale, t } = useLocale();
  const st = SETTINGS_TEXT[locale];
  const [selectedPlatformsCount, setSelectedPlatformsCount] = useState(0);

  const toolLinks = st.links.map((link) => ({
    ...link,
    icon: link.href === "/stats" ? BarChart3 : link.href === "/trending" ? TrendingUp : List,
  }));

  return (
    <PageScaffold
      title={t.settings.title}
      description={st.pageDescription}
      icon={<Shield size={16} />}
      contentClassName="gk-settings-page max-w-5xl pt-2 md:pt-8 pb-8 md:pb-10"
    >
      <SettingsControlHero
        localeLabel={locale.toUpperCase()}
        sectionsCount={5}
        selectedPlatformsCount={selectedPlatformsCount}
        digestEnabled
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="space-y-5">
          <SettingsSection icon={<UserRound size={15} />} title={st.sections.account}>
            <SettingsCard>
              <div className="px-4 pb-2 pt-4">
                <p className="gk-body max-w-none">{st.accountIntro}</p>
              </div>
              <div className="divide-y divide-[var(--border)]">
                <SettingsRowLink
                  href="/settings/profile"
                  icon={<UserRound size={16} />}
                  title={st.profileTitle}
                  description={st.profileDesc}
                />
                <LanguageCard />
              </div>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection icon={<Tv size={15} />} title={st.sections.streaming}>
            <StreamingPlatformsSelector onSelectedCountChange={setSelectedPlatformsCount} />
          </SettingsSection>

          <SettingsSection icon={<BarChart3 size={15} />} title={st.sections.other}>
            <SettingsCard>
              <div className="divide-y divide-[var(--border)]">
                {toolLinks.map(({ href, icon: Icon, label, desc }) => (
                  <SettingsRowLink
                    key={href}
                    href={href}
                    icon={<Icon size={16} />}
                    title={label}
                    description={desc}
                  />
                ))}
              </div>
            </SettingsCard>
          </SettingsSection>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6">
          <SettingsSection icon={<Bell size={15} />} title={st.sections.notifications}>
            <div className="space-y-3">
              <PushNotificationsToggle />
              <DigestToggle />
            </div>
          </SettingsSection>

          <SettingsSection icon={<Shield size={15} />} title={st.sections.security}>
            <SettingsCard>
              <div className="divide-y divide-[var(--border)]">
                <ChangePasswordSheet />
                <LogoutPanel />
                <LastAccessInfo />
              </div>
            </SettingsCard>
          </SettingsSection>

          <SettingsSection icon={<Trash2 size={15} />} title={st.sections.danger}>
            <SettingsCard>
              <DeleteAccountSection />
            </SettingsCard>
          </SettingsSection>
        </aside>
      </div>

      <div className="flex flex-col items-center gap-3 pb-0 pt-4">
        <p className="gk-label text-[var(--text-muted)]">{st.dataProvidedBy}</p>
        <div className="flex flex-wrap items-center justify-center gap-4 opacity-40 transition-opacity hover:opacity-70">
          <a href="https://boardgamegeek.com" target="_blank" rel="noopener noreferrer" aria-label="Powered by BoardGameGeek" data-no-swipe="true">
            <img src="/powered-by-bgg.svg" alt="Powered by BGG" className="h-5 w-auto" />
          </a>
          <span className="text-[10px] text-[var(--text-muted)]">TMDb</span>
          <span className="text-[10px] text-[var(--text-muted)]">AniList</span>
          <span className="text-[10px] text-[var(--text-muted)]">IGDB</span>
        </div>
      </div>
    </PageScaffold>
  );
}
