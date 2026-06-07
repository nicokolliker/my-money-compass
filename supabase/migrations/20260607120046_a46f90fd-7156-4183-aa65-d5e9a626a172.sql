CREATE TABLE public.installment_debts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_ars NUMERIC NOT NULL,
  current_installment INTEGER NOT NULL,
  total_installments INTEGER NOT NULL,
  remaining_installments INTEGER NOT NULL,
  settlement_month TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.installment_debts TO authenticated;
GRANT ALL ON public.installment_debts TO service_role;

ALTER TABLE public.installment_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own installment_debts"
ON public.installment_debts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_installment_debts_user_source ON public.installment_debts(user_id, source);