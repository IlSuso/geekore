"use client";
// FeedSidebar — right rail desktop più leggero: niente dashboard stagionali,
// solo segnali social utili e suggerimenti, senza rubare scena al feed.

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import {
  TrendingUp,
  Film,
  Gamepad2,
  Tv,
  Layers,
  Sparkles,
  Users,
  Radio,
} from "lucide-react";
import { UserBadge } from "@/components/ui/UserBadge";
import { useLocalizedMediaRows } from "@/lib/i18n/clientMediaLocalization";
import { useLocale } from "@/lib/locale";

interface SuggestedUser {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  badge?: string | null;
}

interface TrendingItem {
  title: string;
  type: string;
  cover_image: string | null;
  external_id?: string | null;
  count: number;
  friendCount: number;
  userIds: string[];
}

const FEED_SIDEBAR_COPY = {
  it: {
    see: "vedi",
    following: "seguiti",
    posts7d: "post 7g",
    toFollow: "Da seguire",
    followed: "Seguito",
    follow: "Segui",
    match: "match",
    activity: "attività",
    friend: "amico",
    friends: "amici",
    trendingFriends: "Trending dagli amici",
  },
  en: {
    see: "see",
    following: "following",
    posts7d: "posts 7d",
    toFollow: "Who to follow",
    followed: "Following",
    follow: "Follow",
    match: "match",
    activity: "activities",
    friend: "friend",
    friends: "friends",
    trendingFriends: "Trending from friends",
  },
} as const;

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film,
  manga: Layers,
  game: Gamepad2,
  tv: Tv,
  movie: Film,
  boardgame: Sparkles,
  board_game: Sparkles,
};

const CATEGORY_LABEL: Record<string, string> = {
  anime: "Anime",
  manga: "Manga",
  game: "Videogioco",
  tv: "Serie TV",
  movie: "Film",
  boardgame: "Board",
  board_game: "Board",
};

function RailCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[24px] border border-[var(--border-subtle)] bg-[rgba(18,18,25,0.72)] p-4 ring-1 ring-white/5 ${className}`}
    >
      {children}
    </section>
  );
}

function RailHeader({
  icon,
  title,
  href,
  seeLabel = "vedi",
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
  seeLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[var(--accent)]">{icon}</span>
        <p className="truncate text-[12px] font-black uppercase tracking-[0.06em] text-[var(--text-secondary)]">
          {title}
        </p>
      </div>
      {href && (
        <Link
          href={href}
          className="gk-mono flex-shrink-0 text-[var(--accent)]"
        >
          {seeLabel}
        </Link>
      )}
    </div>
  );
}

function PulseCard({ currentUserId }: { currentUserId: string | null }) {
  const { locale } = useLocale();
  const copy = FEED_SIDEBAR_COPY[locale];
  const [counts, setCounts] = useState({ following: 0, posts: 0 });

  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("follows")
        .select("following_id", { count: "exact", head: true })
        .eq("follower_id", currentUserId),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        ),
    ])
      .then(([follows, posts]) => {
        setCounts({ following: follows.count || 0, posts: posts.count || 0 });
      })
      .catch(() => {});
  }, [currentUserId]);

  if (!currentUserId) return null;

  return (
    <RailCard className="bg-[linear-gradient(135deg,rgba(230,255,61,0.055),rgba(18,18,25,0.72))]">
      <RailHeader
        icon={<Radio size={14} />}
        title="Community pulse"
        seeLabel={copy.see}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-black/18 p-3">
          <p className="font-mono-data text-[18px] font-black leading-none text-[var(--accent)]">
            {counts.following}
          </p>
          <p className="gk-label mt-1">{copy.following}</p>
        </div>
        <div className="rounded-2xl bg-black/18 p-3">
          <p className="font-mono-data text-[18px] font-black leading-none text-[var(--text-primary)]">
            {counts.posts}
          </p>
          <p className="gk-label mt-1">{copy.posts7d}</p>
        </div>
      </div>
    </RailCard>
  );
}

function localizedCategoryLabel(type: string, locale: "it" | "en") {
  if (locale === "en") {
    const en: Record<string, string> = {
      anime: "Anime",
      manga: "Manga",
      game: "Game",
      tv: "TV Show",
      movie: "Movie",
      boardgame: "Board game",
      board_game: "Board game",
    };
    return en[type] || type;
  }
  return CATEGORY_LABEL[type] || type;
}

function FriendsTrendingCard({ currentUserId }: { currentUserId: string | null }) {
  const { locale } = useLocale();
  const copy = FEED_SIDEBAR_COPY[locale];
  const [items, setItems] = useState<TrendingItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const loadFriendsTrending = async () => {
      if (!currentUserId) {
        setItems([]);
        return;
      }

      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUserId);

      const followingIds = Array.from(
        new Set((follows || []).map((f: any) => f.following_id).filter(Boolean)),
      );

      if (cancelled) return;
      if (!followingIds.length) {
        setItems([]);
        return;
      }

      const twoWeeksAgo = new Date(
        Date.now() - 14 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data } = await supabase
        .from("user_media_entries")
        .select("user_id, external_id, title, type, cover_image, updated_at")
        .in("user_id", followingIds)
        .gte("updated_at", twoWeeksAgo)
        .order("updated_at", { ascending: false })
        .limit(250);

      if (cancelled || !data) return;

      const map = new Map<string, TrendingItem & { userSet: Set<string> }>();
      for (const row of data as any[]) {
        if (!row?.title || !row?.type || !row?.user_id) continue;

        const externalId = typeof row.external_id === "string" && row.external_id.trim()
          ? row.external_id.trim()
          : null;
        const normalizedTitle = String(row.title).trim().toLowerCase();
        const key = `${row.type}::${externalId || normalizedTitle}`;
        const existing = map.get(key);

        if (existing) {
          existing.count += 1;
          existing.userSet.add(row.user_id);
          existing.friendCount = existing.userSet.size;
          if (!existing.cover_image && row.cover_image) existing.cover_image = row.cover_image;
          if (!existing.external_id && externalId) existing.external_id = externalId;
          continue;
        }

        map.set(key, {
          title: row.title,
          type: row.type,
          cover_image: row.cover_image || null,
          external_id: externalId,
          count: 1,
          friendCount: 1,
          userIds: [row.user_id],
          userSet: new Set([row.user_id]),
        });
      }

      const next = [...map.values()]
        .map(({ userSet, ...item }) => ({
          ...item,
          friendCount: userSet.size,
          userIds: [...userSet],
        }))
        .sort((a, b) => {
          if (b.friendCount !== a.friendCount) return b.friendCount - a.friendCount;
          return b.count - a.count;
        })
        .slice(0, 5);

      setItems(next);
    };

    loadFriendsTrending().catch(() => {
      if (!cancelled) setItems([]);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const localizedItems = useLocalizedMediaRows(items, {
    titleKeys: ["title"],
    coverKeys: ["cover_image"],
    idKeys: ["external_id"],
    typeKeys: ["type"],
  });

  if (!localizedItems.length) return null;

  return (
    <RailCard>
      <RailHeader
        icon={<TrendingUp size={14} />}
        title={copy.trendingFriends}
        href="/trending"
        seeLabel={copy.see}
      />
      <div className="space-y-2">
        {localizedItems.map((item, i) => {
          const Icon = TYPE_ICON[item.type] || Film;
          return (
            <Link
              href={`/discover?type=${encodeURIComponent(item.type)}&q=${encodeURIComponent(item.title)}`}
              key={`${locale}-${item.type}-${item.external_id || item.title}`}
              className="group grid grid-cols-[20px_88px_minmax(0,1fr)] items-center gap-3.5 rounded-[22px] p-2.5 transition-colors hover:bg-[var(--bg-elevated)]"
            >
              <span className="text-center font-mono-data text-[10px] font-bold text-[var(--text-muted)]">
                {i + 1}
              </span>
              <div className="h-[124px] w-[88px] shrink-0 overflow-hidden rounded-[18px] bg-[var(--bg-elevated)] ring-1 ring-white/10">
                {item.cover_image ? (
                  <img
                    src={item.cover_image}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Icon size={22} className="text-[var(--text-muted)]" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-3 text-[14.5px] font-black leading-tight text-[var(--text-primary)]">
                  {item.title}
                </p>
                <p className="mt-1.5 text-[11px] font-bold leading-tight text-[var(--text-muted)]">
                  {localizedCategoryLabel(item.type, locale)}
                </p>
                <p className="mt-1 inline-flex rounded-full border border-[rgba(230,255,61,0.16)] bg-[rgba(230,255,61,0.06)] px-2 py-0.5 font-mono-data text-[10px] font-black text-[var(--accent)]">
                  {item.friendCount} {item.friendCount === 1 ? copy.friend : copy.friends}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </RailCard>
  );
}

function SuggestedUsersCard({ currentUserId }: { currentUserId: string }) {
  const { locale } = useLocale();
  const copy = FEED_SIDEBAR_COPY[locale];
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    const fetchSuggested = async () => {
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUserId);
      const followingIds = new Set(
        (follows || []).map((f: any) => f.following_id),
      );
      followingIds.add(currentUserId);
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, badge")
        .order("created_at", { ascending: false })
        .limit(18);
      setUsers(
        (data || []).filter((u: any) => !followingIds.has(u.id)).slice(0, 4),
      );
    };
    fetchSuggested();
  }, [currentUserId]);

  const handleFollow = async (userId: string) => {
    await fetch("/api/social/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: userId, action: "follow" }),
    }).catch(() => {});
    setFollowed((prev) => new Set([...prev, userId]));
  };

  if (!users.length) return null;

  return (
    <RailCard>
      <RailHeader
        icon={<Users size={14} />}
        title={copy.toFollow}
        href="/friends"
        seeLabel={copy.see}
      />
      <div className="space-y-2.5">
        {users.map((user, index) => (
          <div key={user.id} className="flex items-center gap-2.5">
            <Link href={`/profile/${user.username}`} className="shrink-0">
              <Avatar
                src={user.avatar_url}
                username={user.username}
                displayName={user.display_name}
                size={36}
                className="rounded-2xl"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/profile/${user.username}`}>
                <p className="truncate text-[12.5px] font-bold text-[var(--text-primary)] hover:opacity-70">
                  <UserBadge
                    badge={user.badge}
                    displayName={user.display_name || user.username}
                  />
                </p>
              </Link>
              <p className="gk-mono text-[var(--text-muted)]">
                {copy.match} {92 - index * 7}%
              </p>
            </div>
            {followed.has(user.id) ? (
              <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--text-muted)]">
                {copy.followed}
              </span>
            ) : (
              <button
                onClick={() => handleFollow(user.id)}
                className="rounded-full border border-[rgba(230,255,61,0.45)] px-2.5 py-1 text-[10px] font-black text-[var(--accent)] transition-colors hover:bg-[rgba(230,255,61,0.08)]"
              >
                {copy.follow}
              </button>
            )}
          </div>
        ))}
      </div>
    </RailCard>
  );
}

export function FeedSidebar({
  currentUserId,
}: {
  currentUserId: string | null;
}) {
  return (
    <aside className="gk-home-right-rail space-y-3.5">
      <PulseCard currentUserId={currentUserId} />
      <FriendsTrendingCard currentUserId={currentUserId} />
      {currentUserId && <SuggestedUsersCard currentUserId={currentUserId} />}
    </aside>
  );
}
