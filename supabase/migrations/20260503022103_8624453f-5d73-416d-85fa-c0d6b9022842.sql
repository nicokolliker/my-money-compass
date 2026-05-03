ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS linked_category_id uuid REFERENCES public.categories(id);

UPDATE public.recurring_expenses re
SET linked_category_id = c.id
FROM public.categories c
WHERE re.user_id = c.user_id
  AND re.linked_category_id IS NULL
  AND (
    (re.type = 'casa' AND c.name = 'Casa') OR
    (re.type = 'auto' AND c.name = 'Auto') OR
    (re.type = 'salud' AND c.name = 'Salud') OR
    (re.type = 'personal_care' AND c.name = 'Personal Care') OR
    (re.type = 'obligaciones' AND c.name = 'Obligaciones') OR
    (re.type = 'ocio' AND c.name = 'Ocio') OR
    (re.type = 'digital' AND c.name = 'Digital')
  );