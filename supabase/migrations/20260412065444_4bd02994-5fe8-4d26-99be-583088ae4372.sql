
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS official_balance numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS official_balance_updated_at timestamptz DEFAULT NULL;
