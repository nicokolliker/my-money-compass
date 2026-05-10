ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS monotributo_config jsonb,
  ADD COLUMN IF NOT EXISTS ignored_suggestion_ids jsonb DEFAULT '[]'::jsonb;