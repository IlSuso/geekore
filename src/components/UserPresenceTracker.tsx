"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/context/AuthContext";

type PresencePayload = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  online_at: string;
};

const ONLINE_EVENT = "geekore:presence-users";

function normalizePresenceState(state: Record<string, PresencePayload[]> | null | undefined) {
  const users: PresencePayload[] = [];
  const seen = new Set<string>();

  Object.values(state || {}).forEach((entries) => {
    entries.forEach((entry) => {
      if (!entry?.user_id || seen.has(entry.user_id)) return;
      seen.add(entry.user_id);
      users.push(entry);
    });
  });

  return {
    userIds: users.map((user) => user.user_id),
    onlineUsers: users,
  };
}

function publishPresence(payload: ReturnType<typeof normalizePresenceState>) {
  if (typeof window === "undefined") return;
  (window as any).__geekoreOnlinePresence = payload;
  window.dispatchEvent(new CustomEvent(ONLINE_EVENT, { detail: payload }));
}

export function UserPresenceTracker() {
  const authUser = useUser();
  const trackedRef = useRef(false);

  useEffect(() => {
    const maybeAuthUserId = authUser?.id;

    if (typeof maybeAuthUserId !== "string" || maybeAuthUserId.length === 0) {
      publishPresence({ userIds: [], onlineUsers: [] });
      return;
    }

    // Costante string stabile: TypeScript non mantiene sempre il narrowing
    // dentro funzioni async annidate, quindi usiamo questa variabile dedicata.
    const authUserId: string = maybeAuthUserId;

    let cancelled = false;
    const supabase = createClient();
    const channel = supabase.channel("geekore-online", {
      config: {
        presence: {
          key: authUserId,
        },
      },
    });

    async function start() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", authUserId)
        .maybeSingle();

      if (cancelled) return;

      const ownPresence: PresencePayload = {
        user_id: authUserId,
        username: profile?.username || null,
        display_name: profile?.display_name || null,
        avatar_url: profile?.avatar_url || null,
        online_at: new Date().toISOString(),
      };

      channel
        .on("presence", { event: "sync" }, () => {
          publishPresence(normalizePresenceState(channel.presenceState() as Record<string, PresencePayload[]>));
        })
        .on("presence", { event: "join" }, () => {
          publishPresence(normalizePresenceState(channel.presenceState() as Record<string, PresencePayload[]>));
        })
        .on("presence", { event: "leave" }, () => {
          publishPresence(normalizePresenceState(channel.presenceState() as Record<string, PresencePayload[]>));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !trackedRef.current) {
            trackedRef.current = true;
            await channel.track(ownPresence);
            publishPresence(normalizePresenceState(channel.presenceState() as Record<string, PresencePayload[]>));
          }
        });
    }

    start();

    return () => {
      cancelled = true;
      trackedRef.current = false;
      publishPresence({ userIds: [], onlineUsers: [] });
      supabase.removeChannel(channel);
    };
  }, [authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
