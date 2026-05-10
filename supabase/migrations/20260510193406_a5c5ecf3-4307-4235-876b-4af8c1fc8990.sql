CREATE TABLE public.pending_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_ars numeric NOT NULL DEFAULT 0,
  amount_usd numeric NOT NULL DEFAULT 0,
  source text NOT NULL,
  expected_via_account_id uuid,
  settlement_month text,
  status text NOT NULL DEFAULT 'pending',
  matched_transaction_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pending_credits"
ON public.pending_credits
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_pending_credits_user_status ON public.pending_credits(user_id, status);