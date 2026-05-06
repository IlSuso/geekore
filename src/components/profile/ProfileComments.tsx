"use client";
// src/components/profile/ProfileComments.tsx

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  MessageSquare,
  Send,
  MoreHorizontal,
  Loader2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { it, enUS } from "date-fns/locale";
import { useLocale } from "@/lib/locale";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author: {
    username: string;
    display_name?: string;
    avatar_url?: string;
  };
}

interface ProfileCommentsProps {
  profileId: string;
  profileUsername: string;
  isOwner: boolean;
}

function CommentAvatar({ author }: { author: Comment["author"] }) {
  return (
    <div className="h-10 w-10 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
      {author?.avatar_url ? (
        <img
          src={author.avatar_url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(230,255,61,0.22),rgba(74,222,128,0.16))] text-sm font-black text-[var(--text-primary)]">
          {(
            author?.display_name?.[0] ||
            author?.username?.[0] ||
            "?"
          ).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function ProfileComments({
  profileId,
  profileUsername,
  isOwner,
}: ProfileCommentsProps) {
  const { locale } = useLocale();
  const dateLocale = locale === "it" ? it : enUS;
  const copy =
    locale === "it"
      ? {
          user: "utente",
          publish: "Pubblica",
          wallEyebrow: "Bacheca profilo",
          wallTitle: "Bacheca",
          wallSubtitle: "Messaggi pubblici lasciati dalla community.",
          placeholder: "Lascia un messaggio su questo profilo...",
          emptyTitle: "Nessun messaggio ancora",
          emptyBody: "Sii il primo a lasciare un commento su questo profilo.",
          commentOptions: "Opzioni commento",
          deleteTitle: "Eliminare il commento?",
          deleteHint: "L’azione non può essere annullata.",
          delete: "Elimina",
          cancel: "Annulla",
        }
      : {
          user: "user",
          publish: "Post",
          wallEyebrow: "Profile wall",
          wallTitle: "Wall",
          wallSubtitle: "Public messages left by the community.",
          placeholder: "Leave a message on this profile...",
          emptyTitle: "No messages yet",
          emptyBody: "Be the first to leave a comment on this profile.",
          commentOptions: "Comment options",
          deleteTitle: "Delete this comment?",
          deleteHint: "This action cannot be undone.",
          delete: "Delete",
          cancel: "Cancel",
        };
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentAuthorProfile, setCurrentAuthorProfile] = useState<{
    username: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    authorId: string;
  } | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", user.id)
          .single();
        setCurrentAuthorProfile({
          username: profile?.username || null,
          display_name: profile?.display_name || undefined,
          avatar_url: profile?.avatar_url || undefined,
        });
      }
      await loadComments();
    };
    init();
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadComments = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profile_comments")
      .select("id, content, created_at, author_id")
      .eq("profile_id", profileId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data || data.length === 0) {
      setComments([]);
      setLoading(false);
      return;
    }

    const authorIds = [...new Set(data.map((c: any) => c.author_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", authorIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    setComments(
      data.map((c: any) => ({
        ...c,
        author: profileMap.get(c.author_id) || {
          username: copy.user,
          display_name: undefined,
          avatar_url: undefined,
        },
      })),
    );
    setLoading(false);
  };

  const handlePost = async () => {
    if (!newComment.trim() || !currentUserId || posting) return;
    if (newComment.trim().length > 500) return;

    setPosting(true);
    const optimistic: Comment = {
      id: `temp-${Date.now()}`,
      content: newComment.trim(),
      created_at: new Date().toISOString(),
      author_id: currentUserId,
      author: {
        username: currentAuthorProfile?.username || "tu",
        display_name: currentAuthorProfile?.display_name || undefined,
        avatar_url: currentAuthorProfile?.avatar_url || undefined,
      },
    };
    setComments((prev) => [optimistic, ...prev]);
    const draft = newComment.trim();
    setNewComment("");

    const res = await fetch("/api/social/profile-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_id: profileId, content: draft }),
    }).catch(() => null);

    if (!res?.ok) {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
    } else {
      const { comment: inserted } = await res.json();
      const stableAuthor = {
        username: currentAuthorProfile?.username || "tu",
        display_name: currentAuthorProfile?.display_name || undefined,
        avatar_url: currentAuthorProfile?.avatar_url || undefined,
      };
      setComments((prev) =>
        prev.map((c) =>
          c.id === optimistic.id ? { ...inserted, author: stableAuthor } : c,
        ),
      );
    }
    setPosting(false);
  };

  const handleDelete = async (commentId: string, authorId: string) => {
    if (!currentUserId) return;
    if (currentUserId !== authorId && !isOwner) return;
    const res = await fetch("/api/social/profile-comment", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id: commentId }),
    }).catch(() => null);
    if (!res?.ok) return;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  return (
    <>
      <div className="mt-12">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 gk-section-eyebrow">
              <Sparkles size={12} />
              {copy.wallEyebrow}
            </div>
            <h3 className="gk-title text-[var(--text-primary)]">
              {copy.wallTitle}
            </h3>
            <p className="gk-caption">{copy.wallSubtitle}</p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 font-mono-data text-xs font-black text-[var(--text-secondary)]">
            {comments.length}
          </span>
        </div>

        {currentUserId && (
          <div className="mb-5 rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value.slice(0, 500))}
              placeholder={copy.placeholder}
              rows={3}
              className="gk-profile-wall-textarea mb-3 max-h-[174px] min-h-[96px] w-full resize-none overflow-y-auto rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
            />
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
              <span
                className={`font-mono-data text-[11px] font-bold ${newComment.length >= 480 ? "text-red-400" : "text-[var(--text-muted)]"}`}
              >
                {500 - newComment.length}
              </span>
              <button
                onClick={handlePost}
                disabled={!newComment.trim() || posting}
                className="inline-flex h-9 items-center gap-2 rounded-2xl px-4 text-xs font-black transition-all disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#0B0B0F" }}
              >
                {posting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {copy.publish}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[86px] rounded-[20px] bg-[var(--bg-card)] skeleton"
              />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
              <MessageSquare size={28} className="text-[var(--text-muted)]" />
            </div>
            <p className="gk-headline mb-1 text-[var(--text-primary)]">
              {copy.emptyTitle}
            </p>
            <p className="gk-body mx-auto max-w-sm">{copy.emptyBody}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {comments.map((comment) => {
              const authorName =
                comment.author?.display_name ||
                comment.author?.username ||
                copy.user;
              const authorHref = `/profile/${comment.author?.username}`;
              const canManageComment =
                currentUserId === comment.author_id || isOwner;

              return (
                <article
                  key={comment.id}
                  className="group flex items-start gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
                >
                  <Link
                    href={authorHref}
                    className="block shrink-0 leading-none"
                    aria-label={authorName}
                  >
                    <CommentAvatar author={comment.author} />
                  </Link>

                  <div className="gk-profile-wall-comment-body min-w-0 flex-1">
                    <div className="gk-profile-wall-comment-header flex min-w-0 items-start justify-between gap-3">
                      <Link
                        href={authorHref}
                        className="gk-profile-wall-comment-author block truncate text-sm font-black text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
                      >
                        {authorName}
                      </Link>

                      <div className="gk-profile-wall-comment-actions flex shrink-0 items-start gap-2">
                        <span className="hidden whitespace-nowrap font-mono-data text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)] sm:inline">
                          {formatDistanceToNow(new Date(comment.created_at), {
                            addSuffix: true,
                            locale: dateLocale,
                          })}
                        </span>
                        {canManageComment && (
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                id: comment.id,
                                authorId: comment.author_id,
                              })
                            }
                            className="gk-profile-wall-comment-menu inline-flex h-6 w-6 items-center justify-center rounded-lg p-0 text-[var(--text-muted)] opacity-55 transition-all hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] hover:opacity-100"
                            aria-label={copy.commentOptions}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="gk-profile-wall-comment-content whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                      {comment.content}
                    </p>

                    <div className="gk-profile-wall-comment-mobile-time whitespace-nowrap font-mono-data text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)] sm:hidden">
                      {formatDistanceToNow(new Date(comment.created_at), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .gk-profile-wall-comment-body {
          padding-top: 0 !important;
          line-height: 1 !important;
        }
        .gk-profile-wall-comment-header {
          min-height: 17px !important;
          height: 17px !important;
          line-height: 17px !important;
        }
        .gk-profile-wall-comment-author {
          margin: 0 !important;
          padding: 0 !important;
          height: 17px !important;
          line-height: 17px !important;
        }
        .gk-profile-wall-comment-actions {
          height: 17px !important;
          line-height: 17px !important;
        }
        .gk-profile-wall-comment-actions span {
          height: 16px !important;
          line-height: 16px !important;
        }
        .gk-profile-wall-comment-menu {
          margin-top: -4px !important;
        }
        .gk-profile-wall-comment-content {
          margin: 3px 0 0 0 !important;
          padding: 0 !important;
          line-height: 18px !important;
        }
        .gk-profile-wall-comment-mobile-time {
          margin-top: 4px !important;
          line-height: 1 !important;
        }
        .gk-profile-wall-textarea {
          scrollbar-width: thin;
          scrollbar-color: rgba(230, 255, 61, 0.44) rgba(255, 255, 255, 0.07);
          scrollbar-gutter: stable;
        }
        .gk-profile-wall-textarea::-webkit-scrollbar {
          display: block !important;
          width: 6px;
        }
        .gk-profile-wall-textarea::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 999px;
        }
        .gk-profile-wall-textarea::-webkit-scrollbar-thumb {
          background: linear-gradient(
            180deg,
            rgba(230, 255, 61, 0.72),
            rgba(230, 255, 61, 0.35)
          );
          border-radius: 999px;
        }
        .gk-profile-wall-textarea::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(
            180deg,
            rgba(230, 255, 61, 0.86),
            rgba(230, 255, 61, 0.44)
          );
        }
      `}</style>

      {confirmDelete !== null &&
        portalMounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[20000] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setConfirmDelete(null)}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[var(--border)] px-5 py-4 text-center">
                <p className="gk-headline text-[var(--text-primary)]">
                  {copy.deleteTitle}
                </p>
                <p className="gk-caption mt-1">{copy.deleteHint}</p>
              </div>
              <button
                onClick={() => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  handleDelete(target.id, target.authorId);
                }}
                className="w-full border-b border-[var(--border-subtle)] px-5 py-4 text-sm font-black text-red-400 transition-colors hover:bg-red-500/10"
              >
                {copy.delete}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="w-full px-5 py-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
              >
                {copy.cancel}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
