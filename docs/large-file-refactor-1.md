# Large file refactor 1

Dedicated PR for reducing oversized files without changing app behavior.

## Rules

- Preserve behavior first.
- Prefer extraction-only commits.
- Do not combine security hardening, UI redesign, and refactor in the same commit.
- Keep CI green after each step.
- If a file is too large/truncated through the connector, avoid blind replacement.

## Initial targets

1. `src/app/home/page.tsx`
   - Currently oversized and already causing build/typecheck issues from recent UI edits.
   - Best extraction targets:
     - category constants/helpers;
     - `CategoryIcon` / `CategoryBadge`;
     - category search helpers;
     - `CategorySelector`;
     - `CategoryFilter`;
     - post card/comment composer pieces later.

2. Recommendation routes later, only after home is stable:
   - `src/app/api/recommendations/route.ts`
   - `src/app/api/recommendations/similar/route.ts`

## First safe goal

Create extraction files and move only self-contained category/feed helpers from `home/page.tsx` when full context is available. If full context is not available, document exact local/Codex steps instead of making risky blind edits.
