
-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add user_id to all existing tables
ALTER TABLE public.accounts ADD COLUMN user_id UUID;
ALTER TABLE public.transactions ADD COLUMN user_id UUID;
ALTER TABLE public.categories ADD COLUMN user_id UUID;
ALTER TABLE public.recurring_expenses ADD COLUMN user_id UUID;
ALTER TABLE public.budgets ADD COLUMN user_id UUID;
ALTER TABLE public.rules ADD COLUMN user_id UUID;
ALTER TABLE public.fx_rates ADD COLUMN user_id UUID;
ALTER TABLE public.import_logs ADD COLUMN user_id UUID;
ALTER TABLE public.net_worth_snapshots ADD COLUMN user_id UUID;
ALTER TABLE public.account_groups ADD COLUMN user_id UUID;
ALTER TABLE public.subcategories ADD COLUMN user_id UUID;
ALTER TABLE public.tags ADD COLUMN user_id UUID;
ALTER TABLE public.transaction_splits ADD COLUMN user_id UUID;
ALTER TABLE public.transaction_tags ADD COLUMN user_id UUID;
ALTER TABLE public.wise_sync_log ADD COLUMN user_id UUID;

-- Drop old permissive policies and create user-scoped ones

-- accounts
DROP POLICY IF EXISTS "Allow all on accounts" ON public.accounts;
CREATE POLICY "Users manage own accounts" ON public.accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- transactions
DROP POLICY IF EXISTS "Allow all on transactions" ON public.transactions;
CREATE POLICY "Users manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- categories
DROP POLICY IF EXISTS "Allow all on categories" ON public.categories;
CREATE POLICY "Users manage own categories" ON public.categories FOR ALL USING (auth.uid() = user_id OR is_system = true) WITH CHECK (auth.uid() = user_id);

-- recurring_expenses
DROP POLICY IF EXISTS "Allow all on recurring_expenses" ON public.recurring_expenses;
CREATE POLICY "Users manage own recurring" ON public.recurring_expenses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- budgets
DROP POLICY IF EXISTS "Allow all on budgets" ON public.budgets;
CREATE POLICY "Users manage own budgets" ON public.budgets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- rules
DROP POLICY IF EXISTS "Allow all on rules" ON public.rules;
CREATE POLICY "Users manage own rules" ON public.rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- fx_rates
DROP POLICY IF EXISTS "Allow all on fx_rates" ON public.fx_rates;
CREATE POLICY "Users manage own fx_rates" ON public.fx_rates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- import_logs
DROP POLICY IF EXISTS "Allow all on import_logs" ON public.import_logs;
CREATE POLICY "Users manage own import_logs" ON public.import_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- net_worth_snapshots
DROP POLICY IF EXISTS "Allow all on net_worth_snapshots" ON public.net_worth_snapshots;
CREATE POLICY "Users manage own snapshots" ON public.net_worth_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- account_groups
DROP POLICY IF EXISTS "Allow all on account_groups" ON public.account_groups;
CREATE POLICY "Users manage own groups" ON public.account_groups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- subcategories
DROP POLICY IF EXISTS "Allow all on subcategories" ON public.subcategories;
CREATE POLICY "Users manage own subcategories" ON public.subcategories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- tags
DROP POLICY IF EXISTS "Allow all on tags" ON public.tags;
CREATE POLICY "Users manage own tags" ON public.tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- transaction_splits
DROP POLICY IF EXISTS "Allow all on transaction_splits" ON public.transaction_splits;
CREATE POLICY "Users manage own splits" ON public.transaction_splits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- transaction_tags
DROP POLICY IF EXISTS "Allow all on transaction_tags" ON public.transaction_tags;
CREATE POLICY "Users manage own tx_tags" ON public.transaction_tags FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- wise_sync_log
DROP POLICY IF EXISTS "Allow all on wise_sync_log" ON public.wise_sync_log;
CREATE POLICY "Users manage own wise_log" ON public.wise_sync_log FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Merchants table
CREATE TABLE public.merchants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  logo_url TEXT,
  default_category_id UUID,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own merchants" ON public.merchants FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Payment methods table
CREATE TABLE public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'card',
  linked_account_id UUID,
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payment_methods" ON public.payment_methods FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add merchant_id and payment_method_id to transactions
ALTER TABLE public.transactions ADD COLUMN merchant_id UUID;
ALTER TABLE public.recurring_expenses ADD COLUMN payment_method_id UUID;
ALTER TABLE public.transactions ADD COLUMN payment_method_id UUID;

-- Storage bucket for logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

CREATE POLICY "Anyone can view logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "Authenticated users can upload logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update logos" ON storage.objects FOR UPDATE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete logos" ON storage.objects FOR DELETE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- Add logo_url to accounts
ALTER TABLE public.accounts ADD COLUMN logo_url TEXT;
