ALTER TABLE public.transactions
ADD CONSTRAINT transactions_external_id_unique UNIQUE (external_id);