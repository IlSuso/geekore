-- ============================================================
-- GEEKORE - RLS (Row Level Security) - DA ESEGUIRE SU SUPABASE
-- ============================================================
-- Questo file aggiunge tutte le policy di sicurezza mancanti.
-- Senza RLS chiunque può leggere/scrivere dati altrui via API.
-- ============================================================

-- ── PROFILES ────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ── USER_MEDIA_ENTRIES ───────────────────────────────────────
ALTER TABLE user_media_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Media entries viewable by everyone" ON user_media_entries;
CREATE POLICY "Media entries viewable by everyone"
  ON user_media_entries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own media entries" ON user_media_entries;
CREATE POLICY "Users can insert own media entries"
  ON user_media_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own media entries" ON user_media_entries;
CREATE POLICY "Users can update own media entries"
  ON user_media_entries FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own media entries" ON user_media_entries;
CREATE POLICY "Users can delete own media entries"
  ON user_media_entries FOR DELETE USING (auth.uid() = user_id);

-- ── POSTS ────────────────────────────────────────────────────
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create own posts" ON posts;
CREATE POLICY "Users can create own posts"
  ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own posts" ON posts;
CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE USING (auth.uid() = user_id);

-- ── COMMENTS ─────────────────────────────────────────────────
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create own comments" ON comments;
CREATE POLICY "Users can create own comments"
  ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE USING (auth.uid() = user_id);

-- ── LIKES ────────────────────────────────────────────────────
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Likes are viewable by everyone" ON likes;
CREATE POLICY "Likes are viewable by everyone"
  ON likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own likes" ON likes;
CREATE POLICY "Users can manage own likes"
  ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own likes" ON likes;
CREATE POLICY "Users can delete own likes"
  ON likes FOR DELETE USING (auth.uid() = user_id);

-- ── FOLLOWS ──────────────────────────────────────────────────
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
CREATE POLICY "Follows are viewable by everyone"
  ON follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage own follows" ON follows;
CREATE POLICY "Users can manage own follows"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can delete own follows" ON follows;
CREATE POLICY "Users can delete own follows"
  ON follows FOR DELETE USING (auth.uid() = follower_id);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT USING (auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Authenticated users can send notifications" ON notifications;
CREATE POLICY "Authenticated users can send notifications"
  ON notifications FOR INSERT WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = receiver_id);

-- ── STEAM_ACCOUNTS ───────────────────────────────────────────
-- (già fatto, incluso per completezza)
ALTER TABLE steam_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own steam account" ON steam_accounts;
CREATE POLICY "Users can manage own steam account"
  ON steam_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── NEWS_CACHE / BOARDGAMES_CACHE ────────────────────────────
-- Pubbliche in lettura, solo service_role in scrittura (le API usano service role)
ALTER TABLE news_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "News cache readable by all" ON news_cache;
CREATE POLICY "News cache readable by all"
  ON news_cache FOR SELECT USING (true);

ALTER TABLE boardgames_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Boardgames cache readable by all" ON boardgames_cache;
CREATE POLICY "Boardgames cache readable by all"
  ON boardgames_cache FOR SELECT USING (true);

-- ── SEARCH_HISTORY ───────────────────────────────────────────
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own search history" ON search_history;
CREATE POLICY "Users can manage own search history"
  ON search_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── RECOMMENDATIONS_POOL ─────────────────────────────────────
ALTER TABLE recommendations_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own recommendations pool" ON recommendations_pool;
CREATE POLICY "Users can manage own recommendations pool"
  ON recommendations_pool FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── RECOMMENDATIONS_SHOWN ────────────────────────────────────
ALTER TABLE recommendations_shown ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own shown recommendations" ON recommendations_shown;
CREATE POLICY "Users can manage own shown recommendations"
  ON recommendations_shown FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── RECOMMENDATION_FEEDBACK ──────────────────────────────────
ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own recommendation feedback" ON recommendation_feedback;
CREATE POLICY "Users can manage own recommendation feedback"
  ON recommendation_feedback FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

  -- ══════════════════════════════════════════════════════════
-- PATCH APRILE 2026 — Tabelle senza RLS
-- ══════════════════════════════════════════════════════════

-- ── WISHLIST ──────────────────────────────────────────────
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wishlist viewable by owner" ON wishlist;
CREATE POLICY "Wishlist viewable by owner"
  ON wishlist FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own wishlist" ON wishlist;
CREATE POLICY "Users can manage own wishlist"
  ON wishlist FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── STEAM_IMPORT_LOG ──────────────────────────────────────
ALTER TABLE steam_import_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own import log" ON steam_import_log;
CREATE POLICY "Users can read own import log"
  ON steam_import_log FOR SELECT USING (auth.uid() = user_id);

-- ── LEADERBOARD ───────────────────────────────────────────
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaderboard readable by all" ON leaderboard;
CREATE POLICY "Leaderboard readable by all"
  ON leaderboard FOR SELECT USING (true);

-- ── USER_PREFERENCES ──────────────────────────────────────
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own preferences" ON user_preferences;
CREATE POLICY "Users can manage own preferences"
  ON user_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── RECOMMENDATIONS_CACHE ─────────────────────────────────
ALTER TABLE recommendations_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own recommendations cache" ON recommendations_cache;
CREATE POLICY "Users can manage own recommendations cache"
  ON recommendations_cache FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
