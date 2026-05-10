-- Generic account reconciliation table — extends the ARQ pattern to any
-- destination account (e.g. MercadoPago, Galicia). A pending row is created
-- when a transfer from ARQ/DolarApp lands here, and is closed when the user
-- imports the destination account's statement covering that period.

CREATE TABLE public.account_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  from_account_id UUID NOT NULL,
  to_account_id UUID NOT NULL,
  transfer_tx_id UUID,
  transfer_amount_usd NUMERIC NOT NULL DEFAULT 0,
  transfer_date DATE NOT NULL,
  transfer_description TEXT,
  period TEXT,                           -- 'YYYY-MM'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'reconciled'
  import_log_id UUID,
  total_spent_usd NUMERIC,
  balance_after_usd NUMERIC,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own account_reconciliations"
  ON public.account_reconciliations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_account_recons_user_to ON public.account_reconciliations(user_id, to_account_id, status);
CREATE INDEX idx_account_recons_period ON public.account_reconciliations(user_id, to_account_id, period);

CREATE TRIGGER update_account_recons_updated_at
  BEFORE UPDATE ON public.account_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();