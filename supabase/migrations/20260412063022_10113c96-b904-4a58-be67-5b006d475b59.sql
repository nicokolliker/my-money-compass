
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cat_food uuid := gen_random_uuid();
  v_cat_transport uuid := gen_random_uuid();
  v_cat_housing uuid := gen_random_uuid();
  v_cat_entertainment uuid := gen_random_uuid();
  v_cat_subscriptions uuid := gen_random_uuid();
  v_cat_health uuid := gen_random_uuid();
  v_cat_income uuid := gen_random_uuid();
  v_acc_usd uuid := gen_random_uuid();
  v_acc_ars uuid := gen_random_uuid();
  v_acc_wise uuid := gen_random_uuid();
  v_m_netflix uuid := gen_random_uuid();
  v_m_wholefoods uuid := gen_random_uuid();
  v_m_uber uuid := gen_random_uuid();
  v_m_coto uuid := gen_random_uuid();
  v_m_coned uuid := gen_random_uuid();
  v_m_cabify uuid := gen_random_uuid();
  v_m_gym uuid := gen_random_uuid();
  v_m_restaurant uuid := gen_random_uuid();
  v_today date := CURRENT_DATE;
  v_existing int;
BEGIN
  -- Idempotent: skip if user already has accounts
  SELECT count(*) INTO v_existing FROM public.accounts WHERE user_id = p_user_id;
  IF v_existing > 0 THEN
    RETURN;
  END IF;

  -- Clean categories with emoji icons and HSL colors
  INSERT INTO public.categories (id, user_id, name, icon, color, sort_order) VALUES
    (v_cat_food,          p_user_id, 'Food & Drinks',   '🍔', '24, 100%, 50%',  1),
    (v_cat_transport,     p_user_id, 'Transport',        '🚗', '217, 91%, 60%',  2),
    (v_cat_housing,       p_user_id, 'Housing',          '🏠', '38, 92%, 50%',   3),
    (v_cat_entertainment, p_user_id, 'Entertainment',    '🎬', '258, 90%, 66%',  4),
    (v_cat_subscriptions, p_user_id, 'Subscriptions',    '🔄', '292, 84%, 61%',  5),
    (v_cat_health,        p_user_id, 'Health & Fitness',  '💪', '160, 84%, 39%',  6),
    (v_cat_income,        p_user_id, 'Income',           '💰', '142, 71%, 45%',  7);

  -- Accounts
  INSERT INTO public.accounts (id, user_id, name, currency, type, opening_balance, sort_order, source) VALUES
    (v_acc_usd,  p_user_id, 'Main USD Account',   'USD', 'bank',           5000,   1, 'manual'),
    (v_acc_ars,  p_user_id, 'Banco Galicia ARS',  'ARS', 'bank',           500000, 2, 'manual'),
    (v_acc_wise, p_user_id, 'Wise USD',            'USD', 'digital_wallet', 1200,   3, 'wise');

  -- Merchants
  INSERT INTO public.merchants (id, user_id, name, display_name, default_category_id) VALUES
    (v_m_netflix,    p_user_id, 'Netflix',      'Netflix',      v_cat_subscriptions),
    (v_m_wholefoods, p_user_id, 'Whole Foods',  'Whole Foods',  v_cat_food),
    (v_m_uber,       p_user_id, 'Uber',         'Uber',         v_cat_transport),
    (v_m_coto,       p_user_id, 'Coto',         'Coto',         v_cat_food),
    (v_m_coned,      p_user_id, 'ConEd',        'ConEd',        v_cat_housing),
    (v_m_cabify,     p_user_id, 'Cabify',       'Cabify',       v_cat_transport),
    (v_m_gym,        p_user_id, 'Gym',          'Gym',          v_cat_health),
    (v_m_restaurant, p_user_id, 'Restaurant',   'Restaurant',   v_cat_food);

  -- Transactions with merchant_id linked
  INSERT INTO public.transactions (user_id, account_id, date, description, merchant, amount, currency, amount_usd, fx_rate, type, category_id, merchant_id) VALUES
    (p_user_id, v_acc_usd,  v_today - 2,  'Grocery shopping',  'Whole Foods', -85.50,  'USD', -85.50,  1,        'expense', v_cat_food,          v_m_wholefoods),
    (p_user_id, v_acc_usd,  v_today - 5,  'Monthly salary',    'Employer',     4500,    'USD',  4500,   1,        'income',  v_cat_income,        NULL),
    (p_user_id, v_acc_usd,  v_today - 7,  'Uber ride',         'Uber',        -22.30,  'USD', -22.30,  1,        'expense', v_cat_transport,     v_m_uber),
    (p_user_id, v_acc_ars,  v_today - 3,  'Supermercado',      'Coto',        -15000,  'ARS', -12.50,  0.000833, 'expense', v_cat_food,          v_m_coto),
    (p_user_id, v_acc_usd,  v_today - 10, 'Electric bill',     'ConEd',       -120,    'USD', -120,    1,        'expense', v_cat_housing,       v_m_coned),
    (p_user_id, v_acc_wise, v_today - 1,  'Netflix',           'Netflix',     -15.99,  'USD', -15.99,  1,        'expense', v_cat_subscriptions, v_m_netflix),
    (p_user_id, v_acc_usd,  v_today - 12, 'Dinner out',        'Restaurant',  -65,     'USD', -65,     1,        'expense', v_cat_food,          v_m_restaurant),
    (p_user_id, v_acc_usd,  v_today - 15, 'Gym membership',    'Gym',         -50,     'USD', -50,     1,        'expense', v_cat_health,        v_m_gym),
    (p_user_id, v_acc_ars,  v_today - 8,  'Taxi',              'Cabify',      -8500,   'ARS', -7.08,   0.000833, 'expense', v_cat_transport,     v_m_cabify),
    (p_user_id, v_acc_wise, v_today - 20, 'Freelance payment', 'Client',       800,    'USD',  800,    1,        'income',  v_cat_income,        NULL);

  -- Recurring expenses
  INSERT INTO public.recurring_expenses (user_id, name, amount, currency, frequency, type, category_id, account_id, next_due_date, is_active, status) VALUES
    (p_user_id, 'Netflix',        15.99, 'USD', 'monthly', 'subscription', v_cat_subscriptions, v_acc_wise, (v_today + interval '1 month')::date, true, 'expected'),
    (p_user_id, 'Gym Membership', 50,    'USD', 'monthly', 'fixed_cost',   v_cat_health,        v_acc_usd,  (v_today + interval '15 days')::date, true, 'expected'),
    (p_user_id, 'Rent',           1200,  'USD', 'monthly', 'fixed_cost',   v_cat_housing,       v_acc_usd,  (date_trunc('month', v_today) + interval '1 month')::date, true, 'expected');

  UPDATE public.profiles SET has_demo_data = true WHERE user_id = p_user_id;
END;
$function$;
