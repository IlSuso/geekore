"use client";

import { useEffect, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Loader2, X, Send } from "lucide-react";
import { CategorySelector } from "@/components/feed/CategoryControls";
import { useLocale } from "@/lib/locale";
import type { FeedMediaPreview } from "@/components/feed/feedTypes";

type ComposerModalPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
} | null;

type FeedComposerProps = {
  profile: any;
  placeholder: string;
  composerOpen: boolean;
  openComposer: () => void;
  closeComposer: () => void;
  modalPos: ComposerModalPos;
  newPostContent: string;
  setNewPostContent: (value: string) => void;
  newPostCategory: string;
  setNewPostCategory: (value: string) => void;
  setNewPostMediaPreview?: (value: FeedMediaPreview | null) => void;
  selectedImage: File | null;
  setSelectedImage: (value: File | null) => void;
  imagePreview: string | null;
  setImagePreview: (value: string | null) => void;
  isPublishing: boolean;
  handleCreatePost: (event: any) => Promise<void>;
  handleImageSelect: (event: ChangeEvent<HTMLInputElement>) => void;
};

function ProfileAvatar({
  profile,
  className = "h-9 w-9",
  textClassName = "text-xs",
}: {
  profile: any;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div
      className={`${className} flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/10`}
    >
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt="avatar"
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(230,255,61,0.22),rgba(74,222,128,0.16))] font-black text-[var(--text-primary)] ${textClassName}`}
        >
          {(profile?.username?.[0] || "?").toUpperCase()}
        </div>
      )}
    </div>
  );
}

function ComposerProgress({ length }: { length: number }) {
  return (
    <>

      <style jsx global>{`
        .gk-composer-textarea {
          scrollbar-width: thin;
          scrollbar-color: rgba(230, 255, 61, 0.55) rgba(255, 255, 255, 0.06);
        }
        .gk-composer-textarea::-webkit-scrollbar {
          width: 8px;
        }
        .gk-composer-textarea::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.055);
          border-radius: 999px;
          margin: 10px 0;
        }
        .gk-composer-textarea::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(230, 255, 61, 0.78), rgba(230, 255, 61, 0.30));
          border-radius: 999px;
          border: 2px solid rgba(12, 12, 17, 0.92);
        }
        .gk-composer-textarea::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(230, 255, 61, 0.95), rgba(230, 255, 61, 0.45));
        }
      `}</style>

      {length >= 400 && (
        <span
          className={`font-mono-data text-[12px] font-black ${length >= 490 ? "text-red-400" : "text-[var(--text-muted)]"}`}
        >
          {500 - length}
        </span>
      )}
      {length > 0 && (
        <svg width="26" height="26" viewBox="0 0 26 26">
          <circle
            cx="13"
            cy="13"
            r="10"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="2.5"
          />
          <circle
            cx="13"
            cy="13"
            r="10"
            fill="none"
            stroke={
              length >= 490 ? "#f87171" : length >= 450 ? "#fb923c" : "#E6FF3D"
            }
            strokeWidth="2.5"
            strokeDasharray={`${(length / 500) * 62.83} 62.83`}
            strokeLinecap="round"
            transform="rotate(-90 13 13)"
          />
        </svg>
      )}
    </>
  );
}

function PublishButton({
  disabled,
  isPublishing,
  onClick,
  label,
}: {
  disabled: boolean;
  isPublishing: boolean;
  onClick: (e: any) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      data-no-swipe="true"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center justify-center rounded-2xl px-5 text-[13px] font-black transition-all disabled:opacity-30"
      style={{ background: "var(--accent)", color: "#0B0B0F" }}
    >
      {isPublishing ? <Loader2 size={14} className="animate-spin" /> : label}
    </button>
  );
}

export function FeedComposer({
  profile,
  placeholder,
  composerOpen,
  openComposer,
  closeComposer,
  modalPos,
  newPostContent,
  setNewPostContent,
  newPostCategory,
  setNewPostCategory,
  setNewPostMediaPreview,
  selectedImage,
  setSelectedImage,
  imagePreview,
  setImagePreview,
  isPublishing,
  handleCreatePost,
  handleImageSelect,
}: FeedComposerProps) {
  const { locale } = useLocale();
  const copy =
    locale === "en"
      ? {
          cancel: "Cancel",
          composerKicker: "Activity composer",
          activityKicker: "Activity",
          newActivity: "New activity",
          publish: "Publish",
          medium: "Medium",
          placeholder: "What are you watching?",
          previewAlt: "Image preview",
        }
      : {
          cancel: "Annulla",
          composerKicker: "Activity composer",
          activityKicker: "Activity",
          newActivity: "Nuova activity",
          publish: "Pubblica",
          medium: "Medium",
          placeholder: "Cosa stai guardando?",
          previewAlt: "Anteprima immagine",
        };
  const publishDisabled =
    isPublishing || (!newPostContent.trim() && !selectedImage);
  const activityPlaceholder = copy.placeholder;
  const desktopTextareaHeight = imagePreview ? 116 : 150;

  useEffect(() => {
    if (!composerOpen || typeof document === "undefined") return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [composerOpen]);

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setNewPostContent(e.target.value.slice(0, 500));

    // Desktop composer: keep the modal stable. Long text scrolls inside the
    // textarea, so an attached image and the action footer stay visible.
    if (typeof window !== "undefined" && window.innerWidth >= 768) return;

    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  return (
    <>
      <div
        className="sticky top-[58px] z-20 -mx-4 bg-[rgba(11,11,15,0.82)] px-4 py-3 backdrop-blur-2xl md:top-4"
        data-no-swipe="true"
      >
        <button
          type="button"
          data-no-swipe="true"
          className="flex w-full cursor-pointer items-center gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--bg-card)] p-3 text-left transition-all duration-200 hover:border-[rgba(230,255,61,0.35)] hover:bg-[var(--bg-elevated)] active:scale-[0.99]"
          onClick={openComposer}
        >
          <ProfileAvatar
            profile={profile}
            className="h-10 w-10"
            textClassName="text-sm"
          />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[var(--text-secondary)] select-none">
            {activityPlaceholder}
          </span>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[var(--accent)] text-[#0B0B0F]">
            <Send size={17} />
          </span>
        </button>
      </div>

      {composerOpen && (
        <>
          {modalPos &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                data-no-swipe="true"
                className="fixed inset-0 z-[9998] hidden items-center justify-center bg-black/76 px-6 py-8 backdrop-blur-[5px] md:flex"
                onClick={closeComposer}
              >
                <div
                  id="composer-modal-shell"
                  className={`pointer-events-auto relative flex w-full max-w-[920px] flex-col overflow-hidden rounded-[34px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(180deg,rgba(24,24,32,0.98),rgba(12,12,17,0.98))] shadow-[0_44px_120px_rgba(0,0,0,0.78),0_0_0_1px_rgba(255,255,255,0.06),0_0_90px_rgba(230,255,61,0.10)] ${imagePreview ? "h-[min(760px,90vh)]" : "h-auto max-h-[90vh]"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div
                    className="flex flex-shrink-0 items-center justify-between gap-4 px-6 py-5"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      background:
                        "radial-gradient(circle at 50% 0%, rgba(230,255,61,0.10), transparent 45%), rgba(255,255,255,0.025)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={closeComposer}
                      data-no-swipe="true"
                      className="rounded-2xl px-3 py-2 text-[13px] font-black transition-colors hover:bg-white/5 hover:text-white"
                      style={{ color: "rgba(255,255,255,0.55)" }}
                    >
                      {copy.cancel}
                    </button>
                    <div className="min-w-0 flex-1 text-center">
                      <p
                        className="text-[10px] font-black uppercase tracking-[0.16em]"
                        style={{ color: "var(--accent)" }}
                      >
                        {copy.composerKicker}
                      </p>
                      <span className="block truncate text-[20px] font-black leading-tight text-[var(--text-primary)]">
                        {copy.newActivity}
                      </span>
                    </div>
                    <PublishButton
                      disabled={publishDisabled}
                      isPublishing={isPublishing}
                      label={copy.publish}
                      onClick={async (e) => {
                        await handleCreatePost(e as any);
                        closeComposer();
                      }}
                    />
                  </div>

                  <div className={`flex min-h-0 flex-col overflow-hidden ${imagePreview ? "flex-1" : "flex-none"}`}>
                    <div
                      className={`flex flex-shrink-0 gap-4 px-7 ${imagePreview ? "pb-3 pt-5" : "pb-6 pt-6"}`}
                    >
                      <ProfileAvatar
                        profile={profile}
                        className="h-12 w-12 rounded-[20px]"
                        textClassName="text-base"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="mb-3 text-[15px] font-black text-[var(--text-primary)]">
                          {profile?.display_name || profile?.username}
                        </p>
                        <textarea
                          data-testid="post-composer"
                          data-no-swipe="true"
                          autoFocus
                          value={newPostContent}
                          onChange={handleTextChange}
                          placeholder={activityPlaceholder || placeholder}
                          maxLength={500}
                          rows={imagePreview ? 3 : 4}
                          className="gk-composer-textarea no-nav-hide w-full resize-none overflow-y-auto rounded-[22px] border border-[rgba(255,255,255,0.09)] bg-black/18 px-5 py-3 text-[17px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.42)] focus:bg-black/24"
                          style={{
                            height: desktopTextareaHeight,
                            maxHeight: desktopTextareaHeight,
                          }}
                        />
                      </div>
                    </div>
                    {imagePreview && (
                      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden border-y border-[var(--border)] bg-black/28 px-5 py-3">
                        <img
                          src={imagePreview}
                          alt={copy.previewAlt}
                          className="block h-full max-h-full w-auto max-w-full rounded-[18px] object-contain"
                        />
                        <button
                          type="button"
                          data-no-swipe="true"
                          onClick={clearImage}
                          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-2xl bg-black/75 text-white transition-colors hover:bg-red-600"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    className="flex flex-shrink-0 items-center gap-4 px-6 py-4"
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.025)",
                    }}
                  >
                    <label className="flex h-11 w-11 cursor-pointer select-none items-center justify-center rounded-2xl bg-white/[0.04] text-[var(--text-muted)] transition-all hover:bg-[rgba(230,255,61,0.10)] hover:text-[var(--accent)]">
                      <ImageIcon size={22} strokeWidth={1.5} />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </label>
                    <div className="flex flex-1 items-center justify-end gap-3">
                      <ComposerProgress length={newPostContent.length} />
                      <span className="gk-label hidden text-[var(--text-muted)] sm:inline">
                        {copy.medium}
                      </span>
                      <CategorySelector
                        value={newPostCategory}
                        onChange={setNewPostCategory}
                        onMediaSelect={setNewPostMediaPreview}
                        embedded
                      />
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )}

          {!modalPos &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                id="composer-modal-shell"
                data-no-swipe="true"
                className="fixed inset-0 z-[9999] flex flex-col bg-[var(--bg-primary)]"
              >
                <div
                  className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] bg-[rgba(11,11,15,0.92)] px-4 py-3 backdrop-blur-2xl"
                  style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
                >
                  <button
                    type="button"
                    onClick={closeComposer}
                    data-no-swipe="true"
                    className="rounded-2xl px-2 py-2 text-sm font-bold text-[var(--text-muted)]"
                  >
                    {copy.cancel}
                  </button>
                  <div className="text-center">
                    <p className="gk-label text-[var(--accent)]">
                      {copy.activityKicker}
                    </p>
                    <span className="text-[16px] font-black text-[var(--text-primary)]">
                      {copy.newActivity}
                    </span>
                  </div>
                  <PublishButton
                    disabled={publishDisabled}
                    isPublishing={isPublishing}
                    label={copy.publish}
                    onClick={async (e) => {
                      await handleCreatePost(e as any);
                      closeComposer();
                    }}
                  />
                </div>

                <div className={`flex min-h-0 flex-col overflow-hidden ${imagePreview ? "flex-1" : "flex-none"}`}>
                  <div className="flex flex-shrink-0 gap-3 px-5 pb-3 pt-5">
                    <ProfileAvatar
                      profile={profile}
                      className="h-10 w-10"
                      textClassName="text-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="mb-2 text-sm font-black text-[var(--text-primary)]">
                        {profile?.display_name || profile?.username}
                      </p>
                      <textarea
                        data-testid="post-composer"
                        data-no-swipe="true"
                        value={newPostContent}
                        onChange={handleTextChange}
                        placeholder={activityPlaceholder}
                        maxLength={500}
                        rows={imagePreview ? 3 : 4}
                        className="gk-composer-textarea w-full resize-none overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-[16px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
                        style={{ height: imagePreview ? 106 : 118, maxHeight: imagePreview ? 106 : 180 }}
                      />
                    </div>
                  </div>

                  {imagePreview && (
                    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden border-y border-[var(--border)] bg-black/50 px-3 py-3">
                      <img
                        src={imagePreview}
                        alt={copy.previewAlt}
                        className="block h-full max-h-full w-auto max-w-full rounded-2xl object-contain"
                      />
                      <button
                        type="button"
                        data-no-swipe="true"
                        onClick={clearImage}
                        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-2xl bg-black/75 text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className="flex flex-shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3"
                  style={{
                    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                  }}
                >
                  <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl text-[var(--text-muted)] transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]">
                    <ImageIcon size={22} strokeWidth={1.5} />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                  <div className="ml-auto flex min-w-0 items-center justify-end gap-2.5">
                    <ComposerProgress length={newPostContent.length} />
                    <CategorySelector
                      value={newPostCategory}
                      onChange={setNewPostCategory}
                      onMediaSelect={setNewPostMediaPreview}
                      embedded
                    />
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </>
      )}
    </>
  );
}
