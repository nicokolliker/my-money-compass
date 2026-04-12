
-- Recreate the trigger on auth.users for new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add source tracking to accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS integration_id text;

-- Update seed function to include source
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cat_food uuid := gen_random_uuid();
  v_cat_transport uuid := gen_random_uuid();
  v_cat_housing uuid := gen_random_uuid();
  v_cat_entertainment uuid := gen_random_uuid();
  v_cat_subscriptions uuid := gen_random_uuid();
  v_cat_health uuid := gen_random_uuid();
  v_acc_usd uuid := gen_random_uuid();
  v_acc_ars uuid := gen_random_uuid();
  v_acc_wise uuid := gen_random_uuid();
  v_today date := CURRENT_DATE;
BEGIN
  -- Categories
  INSERT INTO public.categories (id, user_id, name, icon, color, sort_order) VALUES
    (v_cat_food, p_user_id, 'Food', 'utensils-crossed', '#EF4444', 1),
    (v_cat_transport, p_user_id, 'Transport', 'car', '#3B82F6', 2),
    (v_cat_housing, p_user_id, 'Housing', 'home', '#F97316', 3),
    (v_cat_entertainment, p_user_id, 'Entertainment', 'gamepad-2', '#8B5CF6', 4),
    (v_cat_subscriptions, p_user_id, 'Subscriptions', 'repeat', '#A855F7', 5),
    (v_cat_health, p_user_id, 'Health', 'heart-pulse', '#22C55E', 6);

  -- Accounts with source
  INSERT INTO public.accounts (id, user_id, name, currency, type, opening_balance, sort_order, source) VALUES
    (v_acc_usd, p_user_id, 'Main USD Account', 'USD', 'bank', 5000, 1, 'manual'),
    (v_acc_ars, p_user_id, 'Banco Galicia ARS', 'ARS', 'bank', 500000, 2, 'manual'),
    (v_acc_wise, p_user_id, 'Wise USD', 'USD', 'digital_wallet', 1200, 3, 'wise');

  -- Transactions
  INSERT INTO public.transactions (user_id, account_id, date, description, merchant, amount, currency, amount_usd, fx_rate, type, category_id) VALUES
    (p_user_id, v_acc_usd, v_today - 2, 'Grocery shopping', 'Whole Foods', -85.50, 'USD', -85.50, 1, 'expense', v_cat_food),
    (p_user_id, v_acc_usd, v_today - 5, 'Monthly salary', 'Employer', 4500, 'USD', 4500, 1, 'income', NULL),
    (p_user_id, v_acc_usd, v_today - 7, 'Uber ride', 'Uber', -22.30, 'USD', -22.30, 1, 'expense', v_cat_transport),
    (p_user_id, v_acc_ars, v_today - 3, 'Supermercado', 'Coto', -15000, 'ARS', -12.50, 0.000833, 'expense', v_cat_food),
    (p_user_id, v_acc_usd, v_today - 10, 'Electric bill', 'ConEd', -120, 'USD', -120, 1, 'expense', v_cat_housing),
    (p_user_id, v_acc_wise, v_today - 1, 'Netflix', 'Netflix', -15.99, 'USD', -15.99, 1, 'expense', v_cat_subscriptions),
    (p_user_id, v_acc_usd, v_today - 12, 'Dinner out', 'Restaurant', -65, 'USD', -65, 1, 'expense', v_cat_food),
    (p_user_id, v_acc_usd, v_today - 15, 'Gym membership', 'Gym', -50, 'USD', -50, 1, 'expense', v_cat_health),
    (p_user_id, v_acc_ars, v_today - 8, 'Taxi', 'Cabify', -8500, 'ARS', -7.08, 0.000833, 'expense', v_cat_transport),
    (p_user_id, v_acc_wise, v_today - 20, 'Freelance payment', 'Client', 800, 'USD', 800, 1, 'income', NULL);

  -- Recurring expenses
  INSERT INTO public.recurring_expenses (user_id, name, amount, currency, frequency, type, category_id, account_id, next_due_date, is_active, status) VALUES
    (p_user_id, 'Netflix', 15.99, 'USD', 'monthly', 'subscription', v_cat_subscriptions, v_acc_wise, (v_today + interval '1 month')::date, true, 'expected'),
    (p_user_id, 'Gym Membership', 50, 'USD', 'monthly', 'fixed', v_cat_health, v_acc_usd, (v_today + interval '15 days')::date, true, 'expected'),
    (p_user_id, 'Rent', 1200, 'USD', 'monthly', 'fixed', v_cat_housing, v_acc_usd, (date_trunc('month', v_today) + interval '1 month')::date, true, 'expected');

  -- Mark profile
  UPDATE public.profiles SET has_demo_data = true WHERE user_id = p_user_id;
END;
$$;
