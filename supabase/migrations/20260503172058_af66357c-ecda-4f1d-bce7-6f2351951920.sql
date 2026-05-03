CREATE TABLE public.import_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source text NOT NULL,
  month text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  transaction_count integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, source, month)
);

ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own import_log"
ON public.import_log
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());