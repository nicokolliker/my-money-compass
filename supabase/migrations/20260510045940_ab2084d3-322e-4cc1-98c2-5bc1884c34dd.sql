CREATE TABLE IF NOT EXISTS public.arq_reconciliations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wise_tx_id uuid UNIQUE REFERENCES public.transactions(id) ON DELETE SET NULL,
  wise_amount_usd numeric(10,2) NOT NULL,
  wise_date date NOT NULL,
  wise_description text,
  import_log_id uuid REFERENCES public.import_log(id) ON DELETE SET NULL,
  period text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reconciled')),
  reconciled_at timestamptz,
  total_spent_usd numeric(10,2),
  balance_after_usd numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.arq_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own arq_reconciliations" ON public.arq_reconciliations FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_arq_reconciliations_updated_at
BEFORE UPDATE ON public.arq_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();