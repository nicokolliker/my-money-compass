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