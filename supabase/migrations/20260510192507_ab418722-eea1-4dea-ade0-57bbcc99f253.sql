ALTER TABLE public.account_reconciliations ADD COLUMN IF NOT EXISTS last_import_date TEXT;
ALTER TABLE public.arq_reconciliations ADD COLUMN IF NOT EXISTS last_import_date TEXT;