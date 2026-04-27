-- Replace recurring_expenses type check to include 'digital'
ALTER TABLE public.recurring_expenses DROP CONSTRAINT IF EXISTS recurring_expenses_type_check;
ALTER TABLE public.recurring_expenses ADD CONSTRAINT recurring_expenses_type_check
  CHECK (type IN ('casa','auto','salud','personal_care','obligaciones','ocio','digital'));

-- Add subtype column for Digital subcategories
ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS subtype text;