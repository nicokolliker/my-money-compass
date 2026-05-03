-- Insert default rules for user (idempotent based on keyword)
INSERT INTO public.rules (user_id, keyword, match_field, category_id, mark_as_subscription)
SELECT '88c3c139-7a95-43e0-ae95-8a755e8e7f54'::uuid, v.keyword, 'description', c.id, v.is_sub
FROM (VALUES
  ('NETFLIX', 'Digital', true),
  ('SPOTIFY', 'Digital', true),
  ('APPLE', 'Digital', true),
  ('GOOGLE', 'Digital', true),
  ('YOUTUBE', 'Digital', true),
  ('CLARO', 'Digital', true),
  ('STARLINK', 'Digital', true),
  ('RAPPI', 'Ocio', false),
  ('PEDIDOSYA', 'Ocio', false),
  ('UBER', 'Travel', false),
  ('CABIFY', 'Travel', false),
  ('COPA AIR', 'Travel', false),
  ('YPF', 'Auto', false),
  ('CARREFOUR', 'Supermercado', false),
  ('COTO', 'Supermercado', false),
  ('OB SOC PODER JUD', 'Salud', true),
  ('VALYRIAHOME', 'Casa', true),
  ('MERPAGO*MELI', 'Ocio', false)
) AS v(keyword, cat_name, is_sub)
JOIN public.categories c ON c.name = v.cat_name AND c.user_id = '88c3c139-7a95-43e0-ae95-8a755e8e7f54'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM public.rules r
  WHERE r.user_id = '88c3c139-7a95-43e0-ae95-8a755e8e7f54'::uuid
    AND upper(r.keyword) = v.keyword
);