CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  periodo text NOT NULL,
  fecha date,
  monto_usd numeric(10,2) NOT NULL,
  tc_ars numeric(10,2) NOT NULL,
  monto_ars numeric(14,2) GENERATED ALWAYS AS (monto_usd * tc_ars) STORED,
  numero_factura text,
  cliente text NOT NULL DEFAULT 'Empresa UY',
  estado text NOT NULL DEFAULT 'emitida',
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, periodo)
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own invoices" ON public.invoices
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());