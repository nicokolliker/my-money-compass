-- PR1: exclude_from_net_worth
-- Lets tracking accounts (e.g. "Viejo") be hidden from Net Worth calculation
-- without deleting or deactivating them.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS exclude_from_net_worth boolean NOT NULL DEFAULT false;

-- Mark any existing "Viejo" debt tracking account as excluded.
-- These accounts exist solely to track the monthly breakdown paid to the viejo;
-- the real cash impact is already captured in the Cash USD outgoing transactions.
UPDATE public.accounts
SET exclude_from_net_worth = true
WHERE name ILIKE '%viejo%'
  AND type = 'debt';
