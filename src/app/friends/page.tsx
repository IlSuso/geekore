"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  UserPlus,
  UserCheck,
  X,
  Loader2,
  Activity,
  LogIn,
  MessageCircle,
  Flame,
  Clock3,
  Star,
  Circle,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/context/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { useLocalizedMediaRows } from "@/lib/i18n/clientMediaLocalization";
import { typeLabel } from "@/lib/i18n/uiCopy";
import { useLocale } from "@/lib/locale";
import { useTabActive } from "@/context/TabActiveContext";

type FriendsTab = "activity" | "common" | "suggested";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  updated_at?: string | null;
};

type FriendActivity = {
  id: string;
  user_id: string;
  external_id?: string | null;
  title: string;
  type: string;
  cover_image?: string | null;
  status?: string | null;
  rating?: number | null;
  updated_at: string;
  profiles?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type OnlinePayload = {
  userIds: string[];
  onlineUsers?: Array<{
    user_id?: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    online_at?: string;
  }>;
};

const ONLINE_EVENT = "geekore:presence-users";

const FRIENDS_COPY = {
  it: {
    activeNow: "Stato amici",
    onlineNow: "online ora",
    offline: "Offline",
    online: "Online",
    userFallback: "utente",
    geekoreUser: "Utente Geekore",
    verbs: {
      watching: "sta guardando",
      reading: "sta leggendo",
      playing: "sta giocando",
      completed: "ha completato",
      planning: "ha aggiunto alla wishlist",
      paused: "ha messo in pausa",
      dropped: "ha abbandonato",
      rated: "ha votato",
      started: "ha iniziato",
    },
    now: "ora",
    day: "g",
    week: "sett",
    tasteMatch: "taste match",
    followed: "Seguito",
    follow: "Segui",
    tabs: { activity: "Attività", common: "Seguiti", suggested: "Suggeriti" },
    title: "Friends",
    eyebrow: "Social",
    description:
      "Segui persone con gusti affini e guarda cosa stanno scoprendo.",
    searchPlaceholder: "Cerca utenti, media, attività...",
    clearSearch: "Cancella ricerca amici",
    loginTitle: "Accedi per seguire utenti",
    loginBody: "Puoi esplorare i profili, ma il follow richiede login.",
    login: "Login",
    noActivityTitle: "Nessuna attività recente",
    noActivityBody:
      "Segui utenti o torna più tardi per vedere cosa stanno guardando.",
    noFollowingTitle: "Non segui ancora nessuno",
    noFollowingBody: "Apri i suggeriti per costruire il tuo grafo sociale.",
    noProfilesTitle: "Nessun profilo trovato",
    noProfilesBody:
      "Prova con un altro nome o torna più tardi quando ci saranno nuovi profili affini.",
    clear: "Cancella ricerca",
  },
  en: {
    activeNow: "Friends status",
    onlineNow: "online now",
    offline: "Offline",
    online: "Online",
    userFallback: "user",
    geekoreUser: "Geekore user",
    verbs: {
      watching: "is watching",
      reading: "is reading",
      playing: "is playing",
      completed: "completed",
      planning: "added to wishlist",
      paused: "paused",
      dropped: "dropped",
      rated: "rated",
      started: "started",
    },
    now: "now",
    day: "d",
    week: "w",
    tasteMatch: "taste match",
    followed: "Following",
    follow: "Follow",
    tabs: { activity: "Activity", common: "Following", suggested: "Suggested" },
    title: "Friends",
    eyebrow: "Social",
    description:
      "Follow people with similar taste and see what they are discovering.",
    searchPlaceholder: "Search users, media, activity...",
    clearSearch: "Clear friends search",
    loginTitle: "Log in to follow users",
    loginBody: "You can explore profiles, but following requires login.",
    login: "Login",
    noActivityTitle: "No recent activity",
    noActivityBody:
      "Follow users or come back later to see what they are watching.",
    noFollowingTitle: "You are not following anyone yet",
    noFollowingBody: "Open suggested profiles to build your social graph.",
    noProfilesTitle: "No profiles found",
    noProfilesBody:
      "Try another name or come back later when new matching profiles are available.",
    clear: "Clear search",
  },
} as const;

type FriendsCopy = (typeof FRIENDS_COPY)[keyof typeof FRIENDS_COPY];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function compactTimeAgo(
  dateStr: string | null | undefined,
  copy: FriendsCopy,
): string {
  if (!dateStr) return "—";
  const time = new Date(dateStr).getTime();
  if (!Number.isFinite(time)) return "—";
  const diff = Date.now() - time;
  const m = Math.floor(diff / 60000);
  if (m < 1) return copy.now;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}${copy.day}`;
  return `${Math.floor(d / 7)}${copy.week}`;
}

function actionVerb(activity: FriendActivity, copy: FriendsCopy): string {
  if (activity.rating && activity.rating > 0) return copy.verbs.rated;
  return (
    copy.verbs[(activity.status || "") as keyof typeof copy.verbs] ||
    copy.verbs.started
  );
}

function scoreLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const rounded = Math.round(Number(value) * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : rounded.toFixed(1);
}

function profileDisplayName(profile: ProfileRow, copy: FriendsCopy): string {
  return profile.display_name || profile.username || copy.geekoreUser;
}

function StatusAvatar({
  profile,
  online,
  copy,
}: {
  profile: ProfileRow;
  online: boolean;
  copy: FriendsCopy;
}) {
  const username = profile.username || profile.id;
  const label = profileDisplayName(profile, copy);

  return (
    <Link
      href={`/profile/${username}`}
      data-no-swipe="true"
      className={`group relative flex w-[86px] shrink-0 flex-col items-center rounded-[24px] border p-2.5 transition-all ${
        online
          ? "border-emerald-300/35 bg-emerald-400/[0.075] shadow-[0_0_32px_rgba(16,185,129,0.18)]"
          : "border-white/[0.06] bg-white/[0.025] opacity-75 hover:opacity-100"
      }`}
    >
      <div
        className={`relative grid h-[64px] w-[64px] place-items-center rounded-[24px] transition-all ${
          online
            ? "bg-emerald-300/15 ring-2 ring-emerald-300/70 ring-offset-2 ring-offset-[#0b0b10]"
            : "bg-white/[0.035] grayscale ring-1 ring-white/10"
        }`}
      >
        {online && (
          <span className="pointer-events-none absolute inset-[-7px] rounded-[28px] bg-emerald-300/15 blur-md" />
        )}
        <Avatar
          src={profile.avatar_url}
          username={username}
          displayName={label}
          size={54}
          className="relative rounded-[20px]"
        />
        <span
          className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-[#0b0b10] ${
            online
              ? "bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.95)]"
              : "bg-zinc-600"
          }`}
          aria-hidden="true"
        />
      </div>
      <p className="mt-2 w-full truncate text-center text-[11px] font-black text-[var(--text-primary)]">
        {username}
      </p>
      <p
        className={`mt-0.5 text-[8px] font-black uppercase tracking-[0.16em] ${
          online ? "text-emerald-200" : "text-[var(--text-muted)]"
        }`}
      >
        {online ? copy.online : copy.offline}
      </p>
    </Link>
  );
}

function FriendsStatusRail({
  profiles,
  onlineIds,
  copy,
}: {
  profiles: ProfileRow[];
  onlineIds: Set<string>;
  copy: FriendsCopy;
}) {
  if (profiles.length === 0) return null;

  const sorted = [...profiles].sort((a, b) => {
    const ao = onlineIds.has(a.id) ? 1 : 0;
    const bo = onlineIds.has(b.id) ? 1 : 0;
    if (bo !== ao) return bo - ao;
    return (a.username || a.id).localeCompare(b.username || b.id);
  });
  const onlineCount = sorted.filter((profile) => onlineIds.has(profile.id)).length;

  return (
    <section className="mb-6" data-no-swipe="true">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[var(--accent)]">
          <Flame size={14} />
          <p className="gk-label text-[var(--accent)]">{copy.activeNow}</p>
        </div>
        <div
          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
            onlineCount > 0
              ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
              : "border-white/10 bg-white/[0.035] text-[var(--text-muted)]"
          }`}
        >
          {onlineCount} {copy.onlineNow}
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-2 scrollbar-hide" data-horizontal-scroll="true">
        <div className="flex gap-3">
          {sorted.slice(0, 24).map((profile) => (
            <StatusAvatar
              key={profile.id}
              profile={profile}
              online={onlineIds.has(profile.id)}
              copy={copy}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ActivityCard({
  activity,
  copy,
  locale,
}: {
  activity: FriendActivity;
  copy: FriendsCopy;
  locale: "it" | "en";
}) {
  const profile = activity.profiles;
  const username = profile?.username || activity.user_id;
  const name = profile?.display_name || profile?.username || copy.userFallback;
  const verb = actionVerb(activity, copy);
  const rating = scoreLabel(activity.rating);
  const kind = typeLabel(activity.type, locale);

  return (
    <article
      data-no-swipe="true"
      className="group relative isolate overflow-hidden rounded-[28px] border border-white/[0.075] bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.22)] transition-all hover:-translate-y-0.5 hover:border-[rgba(230,255,61,0.24)] hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))]"
    >
      {activity.cover_image && (
        <>
          <img
            src={activity.cover_image}
            alt=""
            className="pointer-events-none absolute right-0 top-1/2 z-[-2] h-[150%] w-[34%] -translate-y-1/2 object-cover opacity-[0.16] blur-xl"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[-1] w-1/2 bg-gradient-to-l from-black/45 via-black/20 to-transparent" />
        </>
      )}

      <div className="grid grid-cols-[auto_minmax(0,1fr)_72px] items-center gap-3 md:grid-cols-[auto_minmax(0,1fr)_82px]">
        <Link href={`/profile/${username}`} className="shrink-0">
          <Avatar
            src={profile?.avatar_url}
            username={username}
            displayName={name}
            size={46}
            className="rounded-[18px] ring-1 ring-white/10"
          />
        </Link>

        <div className="min-w-0 py-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <Clock3 size={10} />
              {compactTimeAgo(activity.updated_at, copy)}
            </span>
            <span className="inline-flex rounded-full border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.09)] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[var(--accent)]">
              {kind}
            </span>
            {rating && (
              <span className="inline-flex items-center gap-1 rounded-full border border-yellow-300/20 bg-yellow-300/10 px-2 py-1 text-[9px] font-black text-yellow-200">
                <Star size={10} className="fill-current" />
                {rating}
              </span>
            )}
          </div>

          <p className="line-clamp-2 text-[15px] leading-snug text-[var(--text-secondary)] md:text-[16px]">
            <Link
              href={`/profile/${username}`}
              className="font-black text-[var(--text-primary)] hover:text-[var(--accent)]"
            >
              @{username}
            </Link>{" "}
            <span>{verb}</span>{" "}
            <span className="font-black italic text-[var(--text-primary)]">
              {activity.title}
            </span>
          </p>
        </div>

        <div className="relative h-[92px] w-[64px] justify-self-end overflow-hidden rounded-[20px] border border-white/10 bg-[var(--bg-secondary)] shadow-[0_16px_28px_rgba(0,0,0,0.32)] md:h-[104px] md:w-[72px]">
          {activity.cover_image ? (
            <img
              src={activity.cover_image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[var(--text-muted)]">
              <Activity size={18} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ProfileSuggestionCard({
  profile,
  followingIds,
  pendingFollowId,
  authUserId,
  onToggleFollow,
  copy,
}: {
  profile: ProfileRow;
  followingIds: Set<string>;
  pendingFollowId: string | null;
  authUserId?: string;
  onToggleFollow: (profileId: string) => void;
  copy: FriendsCopy;
}) {
  const username = profile.username || profile.id;
  const label = profile.display_name || profile.username || copy.geekoreUser;
  const isFollowing = followingIds.has(profile.id);
  const isPending = pendingFollowId === profile.id;
  const pseudoMatch = Math.max(52, 94 - (username.length % 7) * 6);

  return (
    <div
      data-no-swipe="true"
      className="group flex items-center gap-3 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 transition-colors hover:border-[rgba(230,255,61,0.22)] hover:bg-[var(--bg-card-hover)]"
    >
      <Link
        href={`/profile/${username}`}
        data-no-swipe="true"
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <Avatar
          src={profile.avatar_url}
          username={username}
          displayName={label}
          size={48}
          className="rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
            {label}
          </p>
          <p className="gk-mono truncate text-[var(--text-muted)]">
            @{username}
          </p>
          {profile.bio ? (
            <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--text-muted)]">
              {profile.bio}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-[var(--accent)]">
              {copy.tasteMatch} {pseudoMatch}%
            </p>
          )}
        </div>
      </Link>
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => onToggleFollow(profile.id)}
        disabled={!authUserId || isPending}
        className="inline-flex h-9 min-w-[86px] flex-shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-[11px] font-black transition-all disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        style={
          isFollowing
            ? {
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
                background: "var(--bg-secondary)",
              }
            : {
                borderColor: "rgba(230,255,61,0.45)",
                color: "#0B0B0F",
                background: "var(--accent)",
              }
        }
      >
        {isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : isFollowing ? (
          <UserCheck size={13} />
        ) : (
          <UserPlus size={13} />
        )}
        {isFollowing ? copy.followed : copy.follow}
      </button>
    </div>
  );
}

export default function FriendsPage() {
  const supabase = createClient();
  const { locale } = useLocale();
  const copy = FRIENDS_COPY[locale];
  const authUser = useUser();
  const isActive = useTabActive();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [activities, setActivities] = useState<FriendActivity[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [pendingFollowId, setPendingFollowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FriendsTab>("activity");
  const localizedActivities = useLocalizedMediaRows(activities, {
    titleKeys: ["title"],
    coverKeys: ["cover_image"],
    idKeys: ["external_id"],
    typeKeys: ["type"],
  });

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OnlinePayload>).detail;
      const ids = Array.isArray(detail?.userIds) ? detail.userIds.filter(Boolean) : [];
      setOnlineIds(new Set(ids));
    };

    window.addEventListener(ONLINE_EVENT, handler);
    const latest = (window as any).__geekoreOnlinePresence as OnlinePayload | undefined;
    if (latest?.userIds) setOnlineIds(new Set(latest.userIds.filter(Boolean)));

    return () => window.removeEventListener(ONLINE_EVENT, handler);
  }, []);

  useEffect(() => {
    // PERF: non caricare profili/attività se Friends è solo un panel nascosto.
    if (!isActive) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      const [{ data: profilesData }, { data: followsData }] = await Promise.all(
        [
          supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, bio, updated_at")
            .not("username", "is", null)
            .order("updated_at", { ascending: false })
            .limit(80),
          authUser
            ? supabase
                .from("follows")
                .select("following_id")
                .eq("follower_id", authUser.id)
            : Promise.resolve({ data: [] }),
        ],
      );
      const nextProfiles = (profilesData || []).filter(
        (p: ProfileRow) => p.id !== authUser?.id && !!p.username,
      );
      const nextFollowing = new Set(
        (followsData || []).map((row: any) => row.following_id),
      );
      let nextActivities: FriendActivity[] = [];
      if (authUser && nextFollowing.size > 0) {
        const { data: activityData } = await supabase
          .from("user_media_entries")
          .select(
            "id, user_id, external_id, title, type, cover_image, status, rating, updated_at, profiles:user_id(username, display_name, avatar_url)",
          )
          .in("user_id", Array.from(nextFollowing))
          .order("updated_at", { ascending: false })
          .limit(40);
        nextActivities = (activityData || []) as unknown as FriendActivity[];
      }
      if (cancelled) return;
      setProfiles(nextProfiles);
      setFollowingIds(nextFollowing);
      setActivities(nextActivities);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredProfiles = useMemo(() => {
    const q = normalize(query);
    const sorted = [...profiles].sort((a, b) => {
      const aOnline = onlineIds.has(a.id) ? 1 : 0;
      const bOnline = onlineIds.has(b.id) ? 1 : 0;
      if (bOnline !== aOnline) return bOnline - aOnline;
      const aFollowing = followingIds.has(a.id) ? 1 : 0;
      const bFollowing = followingIds.has(b.id) ? 1 : 0;
      if (bFollowing !== aFollowing) return bFollowing - aFollowing;
      return (
        new Date(b.updated_at || 0).getTime() -
        new Date(a.updated_at || 0).getTime()
      );
    });
    if (!q) return sorted;
    return sorted.filter((profile) =>
      normalize(
        [
          profile.username || "",
          profile.display_name || "",
          profile.bio || "",
        ].join(" "),
      ).includes(q),
    );
  }, [profiles, query, followingIds, onlineIds]);

  const filteredActivities = useMemo(() => {
    const q = normalize(query);
    if (!q) return localizedActivities;
    return localizedActivities.filter((activity) =>
      normalize(
        [
          activity.title,
          activity.type,
          activity.status || "",
          activity.profiles?.username || "",
          activity.profiles?.display_name || "",
        ].join(" "),
      ).includes(q),
    );
  }, [localizedActivities, query]);

  const followingProfiles = filteredProfiles.filter((profile) =>
    followingIds.has(profile.id),
  );
  const suggestedProfiles = filteredProfiles.filter(
    (profile) => !followingIds.has(profile.id),
  );
  const statusProfiles = followingProfiles.length ? followingProfiles : filteredProfiles.slice(0, 12);
  const followingCount = followingIds.size;

  async function toggleFollow(profileId: string) {
    if (!authUser || profileId === authUser.id || pendingFollowId) return;
    const isFollowing = followingIds.has(profileId);
    setPendingFollowId(profileId);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
    const result = isFollowing
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", authUser.id)
          .eq("following_id", profileId)
      : await supabase
          .from("follows")
          .insert({ follower_id: authUser.id, following_id: profileId });
    if (result.error)
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(profileId);
        else next.delete(profileId);
        return next;
      });
    setPendingFollowId(null);
  }

  const tabs: Array<{ id: FriendsTab; label: string; count: number }> = [
    {
      id: "activity",
      label: copy.tabs.activity,
      count: filteredActivities.length,
    },
    { id: "common", label: copy.tabs.common, count: followingProfiles.length },
    {
      id: "suggested",
      label: copy.tabs.suggested,
      count: suggestedProfiles.length,
    },
  ];

  return (
    <PageScaffold
      title={copy.title}
      description={copy.description}
      icon={<Users size={16} />}
      className="gk-friends-page"
      contentClassName="gk-page-density mx-auto max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/70 p-4 ring-1 ring-white/5">
        <div className="min-w-0">
          <div className="mb-2 gk-section-eyebrow">
            <Users size={12} /> {copy.eyebrow}
          </div>
          <h1 className="font-display text-[34px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)] md:text-[40px]">
            {copy.title}
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-6 text-[var(--text-secondary)]">
            {copy.description}
          </p>
        </div>

        <div className="mt-4 grid gap-2 border-t border-white/5 pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div
            className="relative"
            data-no-swipe="true"
            data-interactive="true"
          >
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              data-no-swipe="true"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full rounded-2xl border border-[var(--border)] bg-black/18 py-2.5 pl-10 pr-10 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
            />
            {query && (
              <button
                type="button"
                data-no-swipe="true"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                aria-label={copy.clearSearch}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div
            className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--border-subtle)] bg-black/14 p-1"
            data-no-swipe="true"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-no-swipe="true"
                  onClick={() => setActiveTab(tab.id)}
                  className="rounded-xl px-3 py-2 text-[11px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                  style={
                    active
                      ? { background: "var(--accent)", color: "#0B0B0F" }
                      : { color: "var(--text-muted)" }
                  }
                  aria-pressed={active}
                >
                  {tab.label}{" "}
                  <span className="font-mono-data opacity-70">{tab.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!authUser && (
        <div
          className="mb-5 rounded-[22px] border border-amber-500/20 bg-amber-500/8 p-4"
          data-no-swipe="true"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
              <LogIn size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[var(--text-primary)]">
                {copy.loginTitle}
              </p>
              <p className="gk-caption">{copy.loginBody}</p>
            </div>
            <Link
              href="/login"
              data-no-swipe="true"
              className="rounded-2xl bg-[var(--accent)] px-3 py-2 text-xs font-black text-[#0B0B0F]"
            >
              {copy.login}
            </Link>
          </div>
        </div>
      )}

      <FriendsStatusRail profiles={statusProfiles} onlineIds={onlineIds} copy={copy} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-[124px] rounded-[28px] bg-[var(--bg-card)] skeleton"
            />
          ))}
        </div>
      ) : activeTab === "activity" ? (
        filteredActivities.length > 0 ? (
          <div className="space-y-3">
            {filteredActivities.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} copy={copy} locale={locale} />
            ))}
          </div>
        ) : (
          <div className="gk-empty-state py-14">
            <Activity className="gk-empty-state-icon" />
            <p className="gk-empty-state-title">{copy.noActivityTitle}</p>
            <p className="gk-empty-state-subtitle">{copy.noActivityBody}</p>
          </div>
        )
      ) : activeTab === "common" ? (
        followingProfiles.length > 0 ? (
          <div className="space-y-2.5">
            {followingProfiles.map((profile) => (
              <ProfileSuggestionCard
                key={profile.id}
                profile={profile}
                followingIds={followingIds}
                pendingFollowId={pendingFollowId}
                authUserId={authUser?.id}
                onToggleFollow={toggleFollow}
                copy={copy}
              />
            ))}
          </div>
        ) : (
          <div className="gk-empty-state py-14">
            <MessageCircle className="gk-empty-state-icon" />
            <p className="gk-empty-state-title">{copy.noFollowingTitle}</p>
            <p className="gk-empty-state-subtitle">{copy.noFollowingBody}</p>
          </div>
        )
      ) : suggestedProfiles.length > 0 ? (
        <div className="space-y-2.5">
          {suggestedProfiles.map((profile) => (
            <ProfileSuggestionCard
              key={profile.id}
              profile={profile}
              followingIds={followingIds}
              pendingFollowId={pendingFollowId}
              authUserId={authUser?.id}
              onToggleFollow={toggleFollow}
              copy={copy}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <UserPlus
            size={28}
            className="mx-auto mb-3 text-[var(--text-muted)]"
          />
          <p className="gk-headline mb-1">{copy.noProfilesTitle}</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">{copy.noProfilesBody}</p>
          {query && (
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => setQuery("")}
              className="rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-white"
            >
              {copy.clear}
            </button>
          )}
        </div>
      )}
    </PageScaffold>
  );
}
