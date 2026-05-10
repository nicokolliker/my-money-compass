ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS exclude_from_net_worth boolean NOT NULL DEFAULT false;

UPDATE public.accounts
SET exclude_from_net_worth = true
WHERE name ILIKE '%viejo%'
  AND type = 'debt';