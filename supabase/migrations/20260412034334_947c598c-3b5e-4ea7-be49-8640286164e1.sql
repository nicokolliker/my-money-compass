
-- Add external_id to transactions for duplicate prevention
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_external_id ON public.transactions (external_id) WHERE external_id IS NOT NULL;

-- Wise sync log
CREATE TABLE public.wise_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id text,
  account_id uuid REFERENCES public.accounts(id),
  status text NOT NULL DEFAULT 'pending',
  transactions_imported integer NOT NULL DEFAULT 0,
  last_transaction_date date,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wise_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on wise_sync_log" ON public.wise_sync_log FOR ALL USING (true) WITH CHECK (true);
