-- PR2: Fix Cash USD balance
--
-- Sets opening_balance dynamically so that:
--   opening_balance + sum(existing transactions) = $2,000
--
-- This means computeBalance will return exactly $2,000 today,
-- and future transactions (Viejo payments, Patricia deposits) will
-- correctly add/subtract from that base.
--
-- Also clears official_balance so the transaction-derived computation is used
-- (unlike ARQ which uses official_balance from statement imports).

UPDATE public.accounts a
SET
  opening_balance = 2000 - COALESCE(
    (SELECT SUM(t.amount)
     FROM public.transactions t
     WHERE t.account_id = a.id),
    0
  ),
  official_balance             = NULL,
  official_balance_updated_at  = NULL
WHERE a.currency = 'USD'
  AND (a.name ILIKE '%cash%' OR a.name ILIKE '%efectivo%')
  AND a.user_id IS NOT NULL;
