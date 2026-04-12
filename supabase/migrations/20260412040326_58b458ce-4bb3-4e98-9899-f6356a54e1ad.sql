-- Account groups for custom sections
CREATE TABLE public.account_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  icon text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on account_groups" ON public.account_groups FOR ALL USING (true) WITH CHECK (true);

-- Add group reference and sort_order to accounts
ALTER TABLE public.accounts ADD COLUMN group_id uuid REFERENCES public.account_groups(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD COLUMN sort_order integer NOT NULL DEFAULT 0;