type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>;
  from: (table: string) => any;
};

export type SwipeExclusionSets = {
  ownedIds: Set<string>;
  ownedTitles: Set<string>;
  skippedIds: Set<string>;
};

const emptySets = (): SwipeExclusionSets => ({
  ownedIds: new Set(),
  ownedTitles: new Set(),
  skippedIds: new Set(),
});

function addClean(set: Set<string>, value: unknown, normalize = false) {
  if (typeof value !== "string") return;
  const clean = value.trim();
  if (!clean) return;
  set.add(normalize ? clean.toLowerCase() : clean);
}

function setsFromRpcRows(rows: any[]): SwipeExclusionSets {
  const sets = emptySets();
  for (const row of rows || []) {
    if (row?.kind === "owned_id") addClean(sets.ownedIds, row.value);
    else if (row?.kind === "owned_title") addClean(sets.ownedTitles, row.value, true);
    else if (row?.kind === "skipped_id") addClean(sets.skippedIds, row.value);
  }
  return sets;
}

export async function loadSwipeExclusions(
  supabase: SupabaseLike,
  userId: string,
): Promise<SwipeExclusionSets> {
  const { data, error } = await supabase.rpc("get_swipe_exclusions");
  if (!error && Array.isArray(data)) return setsFromRpcRows(data);

  const [{ data: entries }, { data: skipped }] = await Promise.all([
    supabase
      .from("user_media_entries")
      .select("external_id,title")
      .eq("user_id", userId),
    supabase
      .from("swipe_skipped")
      .select("external_id")
      .eq("user_id", userId),
  ]);

  const sets = emptySets();
  for (const entry of entries || []) {
    addClean(sets.ownedIds, entry?.external_id);
    addClean(sets.ownedTitles, entry?.title, true);
  }
  for (const entry of skipped || []) addClean(sets.skippedIds, entry?.external_id);
  return sets;
}

export async function loadSwipeSkippedIds(
  supabase: SupabaseLike,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("get_swipe_skipped_ids");
  if (!error && Array.isArray(data)) {
    const ids = new Set<string>();
    for (const row of data) addClean(ids, row?.external_id);
    return ids;
  }

  const { data: skipped } = await supabase
    .from("swipe_skipped")
    .select("external_id")
    .eq("user_id", userId);

  const ids = new Set<string>();
  for (const entry of skipped || []) addClean(ids, entry?.external_id);
  return ids;
}
