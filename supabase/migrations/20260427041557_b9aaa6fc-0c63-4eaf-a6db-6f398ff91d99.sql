ALTER TABLE public.recurring_expenses DROP CONSTRAINT IF EXISTS recurring_expenses_type_check;

ALTER TABLE public.recurring_expenses
  ADD CONSTRAINT recurring_expenses_type_check
  CHECK (type IN ('casa','auto','salud','personal_care','obligaciones','ocio','subscription','fixed_cost','tax_fee'));

ALTER TABLE public.recurring_expenses ALTER COLUMN type SET DEFAULT 'casa';