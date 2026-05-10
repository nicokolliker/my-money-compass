-- arq_reconciliations
-- Tracks Wise → ARQ pending transfers and their reconciliation state.
-- Created automatically by sync-wise when it detects an outgoing Wise transfer
-- to DolarApp/ARQ. Closed by Import.tsx after a successful ARQ statement import.

CREATE TABLE IF NOT EXISTS public.arq_reconciliations (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source: the Wise outgoing transfer transaction
  wise_tx_id         uuid UNIQUE REFERENCES public.transactions(id) ON DELETE SET NULL,
  wise_amount_usd    numeric(10,2) NOT NULL,
  wise_date          date NOT NULL,
  wise_description   text,

  -- What closed this reconciliation
  import_log_id      uuid REFERENCES public.import_log(id) ON DELETE SET NULL,
  period             text,    -- 'YYYY-MM' of the ARQ statement that reconciled it

  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'reconciled')),
  reconciled_at      timestamptz,

  -- Summary snapshot (set when reconciled)
  total_spent_usd    numeric(10,2),
  balance_after_usd  numeric(10,2),

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.arq_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own arq_reconciliations"
  ON public.arq_reconciliations FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_arq_recon_user_status
  ON public.arq_reconciliations(user_id, status);

CREATE INDEX IF NOT EXISTS idx_arq_recon_wise_date
  ON public.arq_reconciliations(user_id, wise_date);

-- Reuse the existing updated_at trigger function
CREATE TRIGGER arq_recon_updated_at
  BEFORE UPDATE ON public.arq_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
