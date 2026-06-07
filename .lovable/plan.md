## Problem

- Client (`src/hooks/useWiseSync.ts`) calls `supabase.functions.invoke('wise-sync', …)` with actions `get-profiles`, `get-balances`, `sync-transactions`.
- No `wise-sync` function exists in `supabase/functions/`. Only `sync-wise` does, and it's a different cron-style function (no action router, reads token from `user_settings`).
- The invoke 404s without CORS headers → browser surfaces "Failed to fetch".
- `WiseTab.tsx` never asks the user for an API token before calling `Conectar Wise`.

## Changes

### 1. New edge function `supabase/functions/wise-sync/index.ts`

Action-router that the client already expects, with:

- CORS preflight + headers on every response (including errors).
- JWT validation via `supabase.auth.getClaims(token)` (function deploys with default `verify_jwt = false`, so we validate in code).
- API token resolution order:
  1. `apiToken` in request body (UI-provided, per the request).
  2. Fallback: `user_settings.wise_token` for the authenticated user (so existing flows keep working).
  3. If neither is present → 400 with `{ error: "Wise API token requerido" }`.
- When a body `apiToken` is provided, persist it to `user_settings.wise_token` so subsequent calls (and the existing `sync-wise` cron) keep working.
- Actions:
  - `get-profiles` → `GET /v2/profiles`, returns `{ profiles }`.
  - `get-balances` → `GET /v4/profiles/:id/balances?types=STANDARD`, returns `{ balances }`.
  - `sync-transactions` → fetch balance statement, upsert into `transactions` with `external_id = wise-…`, compute `official_balance`, `sum_imported`, `tx_count`, `date_range`, `reconciled`, `status`, `diagnostics`; write a row to `wise_sync_log`; return the `WiseSyncResult` shape the client expects.
- Wrap every action in try/catch; on Wise API failure, include `status`, response text snippet, and the action name in the JSON error so the UI shows a real message instead of "Failed to fetch".
- `console.error` diagnostics for server-side logs.

### 2. `src/components/settings/WiseTab.tsx`

- Add an API token input (password field) shown when not yet connected, with a small helper link to Wise's API tokens page.
- "Conectar Wise" stays disabled until a token is entered; pass `{ apiToken }` into the first `getProfiles` mutate call.
- Once connected, hide the token input; show a "Disconnect / change token" affordance.
- Surface backend error messages directly via the existing `toast.error(e.message)`.

### 3. `src/hooks/useWiseSync.ts`

- Extend `useWiseProfiles` to accept an optional `apiToken` and forward it in the body.
- No other signature changes — `get-balances` and `sync-transactions` continue to use the stored token server-side.

### 4. Deploy

Deploy the new `wise-sync` function after creation so the next "Conectar Wise" click hits the real endpoint.

## Out of scope

- Keep `sync-wise` (cron) untouched.
- No DB schema or RLS changes — `user_settings.wise_token`, `wise_sync_log`, `transactions` already exist.
- No changes to the Wise → ARQ reconciliation path.

## Technical notes

- Function file: `supabase/functions/wise-sync/index.ts`, single file, CORS imported via `npm:@supabase/supabase-js@2/cors`.
- Auth client built per-request with the user's `Authorization` header; service-role client used only for writes that bypass RLS (e.g. `wise_sync_log` insert, `user_settings` upsert of token).
- Token stored only server-side in `user_settings.wise_token`; never returned to the client.
