-- ============================================================
-- GEEKORE — Supabase Schema
-- Esegui questo nell'editor SQL di Supabase
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Profiles ────────────────────────────────────────────────
create table public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  username     text unique not null,
  display_name text not null,
  avatar_url   text,
  bio          text,
  steam_id     text,
  created_at   timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Media ───────────────────────────────────────────────────
create table public.media (
  id               uuid default uuid_generate_v4() primary key,
  type             text not null check (type in ('anime','manga','game','board')),
  title            text not null,
  cover_url        text,
  external_id      text,  -- AniList ID, Steam AppID, IGDB ID, BGG ID
  year             int,
  total_episodes   int,
  total_chapters   int,
  total_volumes    int,
  created_at       timestamptz default now(),
  unique(type, external_id)
);

-- ─── User Media Entries ───────────────────────────────────────
create table public.user_media_entries (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  media_id     uuid references public.media(id) on delete cascade not null,
  status       text not null check (status in ('watching','reading','playing','completed','paused','dropped','wishlist')),
  progress     int default 0,
  score        int check (score between 1 and 10),
  notes        text,
  started_at   timestamptz,
  completed_at timestamptz,
  updated_at   timestamptz default now(),
  unique(user_id, media_id)
);

-- ─── Follows ─────────────────────────────────────────────────
create table public.follows (
  follower_id  uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id)
);

-- ─── Feed Activities ─────────────────────────────────────────
create table public.feed_activities (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  entry_id     uuid references public.user_media_entries(id) on delete cascade not null,
  type         text not null check (type in ('progress_update','status_change','new_entry','score_given','wishlist_add')),
  created_at   timestamptz default now()
);

-- ─── Likes ───────────────────────────────────────────────────
create table public.activity_likes (
  activity_id  uuid references public.feed_activities(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (activity_id, user_id)
);

-- ─── RLS Policies ────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.media             enable row level security;
alter table public.user_media_entries enable row level security;
alter table public.follows           enable row level security;
alter table public.feed_activities   enable row level security;
alter table public.activity_likes    enable row level security;

-- Profiles: public read, own write
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Media: public read, authenticated insert
create policy "Media is viewable by everyone" on public.media for select using (true);
create policy "Authenticated users can insert media" on public.media for insert with check (auth.role() = 'authenticated');

-- User entries: public read, own write
create policy "Entries are viewable by everyone" on public.user_media_entries for select using (true);
create policy "Users can manage own entries" on public.user_media_entries for all using (auth.uid() = user_id);

-- Follows: public read, own write
create policy "Follows are viewable by everyone" on public.follows for select using (true);
create policy "Users can manage own follows" on public.follows for all using (auth.uid() = follower_id);

-- Feed: public read, own write
create policy "Activities are viewable by everyone" on public.feed_activities for select using (true);
create policy "Users can manage own activities" on public.feed_activities for all using (auth.uid() = user_id);

-- Likes: public read, own write
create policy "Likes are viewable by everyone" on public.activity_likes for select using (true);
create policy "Users can manage own likes" on public.activity_likes for all using (auth.uid() = user_id);
