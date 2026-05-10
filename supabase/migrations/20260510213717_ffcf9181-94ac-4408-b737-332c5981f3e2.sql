-- Track Nico's specific card per account + per-card subtotals in invoices
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS my_card_suffix VARCHAR(4),
  ADD COLUMN IF NOT EXISTS is_own_card BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS card_subtotals JSONB;
