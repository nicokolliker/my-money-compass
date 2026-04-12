
What I already verified

- This exact preview is connected to this exact backend/project. The preview network traffic, `supabase/config.toml`, and the backend project ref all match, so this is not a wrong preview/project problem.
- The current session is authenticated correctly. The live session shows the logged-in user as `nicolaskolliker@gmail.com` with user id `88c3c139-7a95-43e0-ae95-8a755e8e7f54`.
- The frontend is reading that same authenticated user’s backend state correctly:
  - `profiles.has_demo_data` returns `false`
  - `accounts` returns `[]`
  - `transactions` returns `[]`
  - `recurring_expenses` returns `[]`
  - `net_worth_snapshots` returns `[]`
- So the current issue is not “data exists but the UI is reading another user”. The UI is hitting the right backend and reading the current auth session correctly.
- Important timing clue: the current user was created at `05:42 UTC`, but the demo-data migration was added later (`20260412054837...`, about `05:48 UTC`). That means this specific user was never seeded retroactively.
- There is also a backend consistency warning: the migration files define `handle_new_user` + `on_auth_user_created`, but the live backend schema snapshot reports no database triggers. That strongly suggests signup seeding is not reliably installed in the live backend right now.

Conclusion

- A) is the current real problem for the logged-in user: demo data was not created.
- B) is not the main issue in the current session: the UI is reading the logged-in user correctly.
- C) does not look like a wrong preview/project: code, preview, and backend match. The mismatch is backend rollout/state, not the route/project.

Plan to fix once approved

1. Repair signup seeding in the backend
- Create a migration that safely re-creates `handle_new_user` and the `on_auth_user_created` trigger on `auth.users`.
- Make `seed_demo_data` idempotent so it can be re-run safely without duplicates.
- Ensure the profile row is created/upserted first, then seed rows are created for that same `auth.uid`, then `has_demo_data` is set to `true`.

2. Backfill already-affected users
- Add a one-time repair path for users who already exist, have a profile, but have zero seeded rows and `has_demo_data = false`.
- This is necessary because fixing the trigger alone will not help users who signed up before demo seeding was added, including the currently affected user.

3. Harden frontend auth/data refresh
- Add auth-ready gating so user-scoped queries only run after auth initialization is complete.
- Add `user.id` into React Query keys for user-scoped hooks (`useDemoData`, accounts, transactions, recurring, budgets, account groups, FX, sync logs).
- Invalidate/reset user-scoped queries on auth changes so switching users cannot keep stale empty data or stale previous-user data.

4. Add the temporary debug indicator
- Add a small debug panel in the protected app shell showing:
  - current logged-in email
  - current user id
  - `has_demo_data`
  - accounts loaded
  - transactions loaded
- Keep it clearly temporary and preview-focused so we can confirm whether the issue is backend creation or frontend rendering/cache.

5. Re-verify end to end
- Sign up a brand new user
- Confirm email
- Log in
- Confirm the profile row exists for that exact user id
- Confirm seeded accounts, transactions, and recurring rows exist for that same user id
- Confirm the UI shows them immediately
- Confirm the demo banner appears
- Test “Clear demo data” and verify counts drop to zero and `has_demo_data` flips to `false`

Technical notes

- The demo banner is already implemented across the key pages; it is not appearing because `has_demo_data` is currently `false`.
- The read hooks mostly rely on RLS instead of explicit `.eq('user_id', user.id)`, which is acceptable, but their query keys are not yet user-scoped. That is risky after auth changes and should be corrected in this pass.
- There is a separate console warning in Settings (`Badge`/ref forwarding). It appears unrelated to the seed/auth issue, so I would keep that as a separate cleanup unless you want it bundled into the same implementation pass.

Because I’m in read-only mode, I can’t execute the live repair or complete the mutating sign-up test from here. But the evidence above is enough to isolate the current problem and define the exact fix path.
