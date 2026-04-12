
ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS renewal_notes text;
