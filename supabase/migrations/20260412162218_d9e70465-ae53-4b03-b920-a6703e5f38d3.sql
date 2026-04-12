
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Account Groups
  v_grp_foreign uuid := gen_random_uuid();
  v_grp_argentina uuid := gen_random_uuid();
  v_grp_cash uuid := gen_random_uuid();
  v_grp_debts uuid := gen_random_uuid();
  -- Categories
  v_cat_food uuid := gen_random_uuid();
  v_cat_groceries uuid := gen_random_uuid();
  v_cat_transport uuid := gen_random_uuid();
  v_cat_shopping uuid := gen_random_uuid();
  v_cat_health uuid := gen_random_uuid();
  v_cat_housing uuid := gen_random_uuid();
  v_cat_entertainment uuid := gen_random_uuid();
  v_cat_subscriptions uuid := gen_random_uuid();
  v_cat_travel uuid := gen_random_uuid();
  v_cat_taxes uuid := gen_random_uuid();
  v_cat_income uuid := gen_random_uuid();
  v_cat_transfers uuid := gen_random_uuid();
  v_cat_debt uuid := gen_random_uuid();
  -- Accounts
  v_acc_wise_usd uuid := gen_random_uuid();
  v_acc_wise_eur uuid := gen_random_uuid();
  v_acc_deel uuid := gen_random_uuid();
  v_acc_jpm uuid := gen_random_uuid();
  v_acc_dolarapp uuid := gen_random_uuid();
  v_acc_mp uuid := gen_random_uuid();
  v_acc_galicia uuid := gen_random_uuid();
  v_acc_cash uuid := gen_random_uuid();
  v_acc_debt_father uuid := gen_random_uuid();
  v_acc_splitwise uuid := gen_random_uuid();
  -- Merchants
  v_m_netflix uuid := gen_random_uuid();
  v_m_spotify uuid := gen_random_uuid();
  v_m_uber uuid := gen_random_uuid();
  v_m_amazon uuid := gen_random_uuid();
  v_m_wholefoods uuid := gen_random_uuid();
  v_m_wework uuid := gen_random_uuid();
  v_m_gym uuid := gen_random_uuid();
  v_m_farmacity uuid := gen_random_uuid();
  v_m_coto uuid := gen_random_uuid();
  v_m_cabify uuid := gen_random_uuid();
  v_m_meli uuid := gen_random_uuid();
  v_m_openai uuid := gen_random_uuid();
  v_m_restaurant uuid := gen_random_uuid();
  v_today date := CURRENT_DATE;
  v_existing int;
BEGIN
  SELECT count(*) INTO v_existing FROM public.accounts WHERE user_id = p_user_id;
  IF v_existing > 0 THEN RETURN; END IF;

  -- Account Groups
  INSERT INTO public.account_groups (id, user_id, name, icon, sort_order) VALUES
    (v_grp_foreign,   p_user_id, 'Foreign Accounts',    '🌎', 1),
    (v_grp_argentina,  p_user_id, 'Argentina Accounts',  '🇦🇷', 2),
    (v_grp_cash,       p_user_id, 'Cash',                '💵', 3),
    (v_grp_debts,      p_user_id, 'Debts & Loans',       '📋', 4);

  -- Categories
  INSERT INTO public.categories (id, user_id, name, icon, color, sort_order) VALUES
    (v_cat_food,          p_user_id, 'Food & Drinks',    '🍔', '24, 100%, 50%',   1),
    (v_cat_groceries,     p_user_id, 'Groceries',        '🛒', '145, 63%, 42%',   2),
    (v_cat_transport,     p_user_id, 'Transport',        '🚗', '217, 91%, 60%',   3),
    (v_cat_shopping,      p_user_id, 'Shopping',         '🛍️', '330, 80%, 60%',   4),
    (v_cat_health,        p_user_id, 'Health & Fitness', '💪', '160, 84%, 39%',   5),
    (v_cat_housing,       p_user_id, 'Housing',          '🏠', '38, 92%, 50%',    6),
    (v_cat_entertainment, p_user_id, 'Entertainment',    '🎬', '258, 90%, 66%',   7),
    (v_cat_subscriptions, p_user_id, 'Subscriptions',    '🔄', '292, 84%, 61%',   8),
    (v_cat_travel,        p_user_id, 'Travel',           '✈️', '200, 80%, 50%',   9),
    (v_cat_taxes,         p_user_id, 'Taxes & Fees',     '🏛️', '0, 0%, 45%',     10),
    (v_cat_income,        p_user_id, 'Income',           '💰', '142, 71%, 45%',  11),
    (v_cat_transfers,     p_user_id, 'Transfers',        '↔️',  '210, 40%, 50%',  12),
    (v_cat_debt,          p_user_id, 'Debt / Loans',     '📋', '0, 70%, 50%',    13);

  -- Accounts
  INSERT INTO public.accounts (id, user_id, name, currency, type, opening_balance, sort_order, source, institution, group_id) VALUES
    (v_acc_wise_usd,   p_user_id, 'Wise USD',           'USD', 'digital_wallet', 6004.51,  1, 'manual', 'Wise',       v_grp_foreign),
    (v_acc_wise_eur,   p_user_id, 'Wise EUR',           'EUR', 'digital_wallet', 850.00,   2, 'manual', 'Wise',       v_grp_foreign),
    (v_acc_deel,       p_user_id, 'Deel USD',           'USD', 'digital_wallet', 3200.00,  3, 'manual', 'Deel',       v_grp_foreign),
    (v_acc_jpm,        p_user_id, 'JPM Checking',       'USD', 'bank',           12500.00, 4, 'manual', 'JPMorgan',   v_grp_foreign),
    (v_acc_dolarapp,   p_user_id, 'DolarApp USD',       'USD', 'digital_wallet', 1500.00,  5, 'manual', 'DolarApp',   v_grp_argentina),
    (v_acc_mp,         p_user_id, 'Mercado Pago',       'ARS', 'digital_wallet', 450000,   6, 'manual', 'Mercado Pago', v_grp_argentina),
    (v_acc_galicia,    p_user_id, 'Galicia ARS',        'ARS', 'bank',           280000,   7, 'manual', 'Banco Galicia', v_grp_argentina),
    (v_acc_cash,       p_user_id, 'Cash USD',           'USD', 'cash',           800.00,   8, 'manual', NULL,         v_grp_cash),
    (v_acc_debt_father,p_user_id, 'Debt to Father',     'USD', 'debt',           -2000.00, 9, 'manual', NULL,         v_grp_debts),
    (v_acc_splitwise,  p_user_id, 'Splitwise',          'USD', 'receivable',     150.00,  10, 'manual', 'Splitwise',  v_grp_debts);

  -- Merchants
  INSERT INTO public.merchants (id, user_id, name, display_name, default_category_id) VALUES
    (v_m_netflix,    p_user_id, 'Netflix',       'Netflix',        v_cat_subscriptions),
    (v_m_spotify,    p_user_id, 'Spotify',       'Spotify',        v_cat_subscriptions),
    (v_m_uber,       p_user_id, 'Uber',          'Uber',           v_cat_transport),
    (v_m_amazon,     p_user_id, 'Amazon',        'Amazon',         v_cat_shopping),
    (v_m_wholefoods, p_user_id, 'Whole Foods',   'Whole Foods',    v_cat_groceries),
    (v_m_wework,     p_user_id, 'WeWork',        'WeWork',         v_cat_housing),
    (v_m_gym,        p_user_id, 'Gym',           'Gym',            v_cat_health),
    (v_m_farmacity,  p_user_id, 'Farmacity',     'Farmacity',      v_cat_health),
    (v_m_coto,       p_user_id, 'Coto',          'Coto',           v_cat_groceries),
    (v_m_cabify,     p_user_id, 'Cabify',        'Cabify',         v_cat_transport),
    (v_m_meli,       p_user_id, 'MercadoLibre',  'MercadoLibre',   v_cat_shopping),
    (v_m_openai,     p_user_id, 'OpenAI',        'OpenAI',         v_cat_subscriptions),
    (v_m_restaurant, p_user_id, 'Restaurant',    'Restaurant',     v_cat_food);

  -- Transactions (realistic spread over last 2 months)
  INSERT INTO public.transactions (user_id, account_id, date, description, merchant, amount, currency, amount_usd, fx_rate, type, category_id, merchant_id) VALUES
    -- Income
    (p_user_id, v_acc_deel,       v_today - 5,  'Freelance invoice - March',    'Deel',       4500,    'USD',  4500,    1,        'income',  v_cat_income,        NULL),
    (p_user_id, v_acc_jpm,        v_today - 35, 'Freelance invoice - February', 'Deel',       4500,    'USD',  4500,    1,        'income',  v_cat_income,        NULL),
    (p_user_id, v_acc_wise_usd,   v_today - 12, 'Client payment',              'Client',      1200,   'USD',  1200,    1,        'income',  v_cat_income,        NULL),
    -- Subscriptions
    (p_user_id, v_acc_wise_usd,   v_today - 1,  'Netflix',                     'Netflix',    -15.99,  'USD', -15.99,   1,        'expense', v_cat_subscriptions, v_m_netflix),
    (p_user_id, v_acc_wise_usd,   v_today - 3,  'Spotify Premium',             'Spotify',    -9.99,   'USD', -9.99,    1,        'expense', v_cat_subscriptions, v_m_spotify),
    (p_user_id, v_acc_wise_usd,   v_today - 2,  'ChatGPT Plus',               'OpenAI',     -20.00,  'USD', -20.00,   1,        'expense', v_cat_subscriptions, v_m_openai),
    -- Housing
    (p_user_id, v_acc_jpm,        v_today - 1,  'Rent payment',                'Landlord',   -1800,   'USD', -1800,    1,        'expense', v_cat_housing,       NULL),
    (p_user_id, v_acc_wise_usd,   v_today - 8,  'WeWork day pass',             'WeWork',     -29.00,  'USD', -29.00,   1,        'expense', v_cat_housing,       v_m_wework),
    -- Groceries
    (p_user_id, v_acc_jpm,        v_today - 2,  'Grocery shopping',            'Whole Foods',-87.34,  'USD', -87.34,   1,        'expense', v_cat_groceries,     v_m_wholefoods),
    (p_user_id, v_acc_jpm,        v_today - 9,  'Weekly groceries',            'Whole Foods',-62.18,  'USD', -62.18,   1,        'expense', v_cat_groceries,     v_m_wholefoods),
    (p_user_id, v_acc_mp,         v_today - 4,  'Supermercado',                'Coto',       -18500,  'ARS', -15.42,   0.000833, 'expense', v_cat_groceries,     v_m_coto),
    (p_user_id, v_acc_galicia,    v_today - 7,  'Supermercado semanal',        'Coto',       -22300,  'ARS', -18.58,   0.000833, 'expense', v_cat_groceries,     v_m_coto),
    -- Transport
    (p_user_id, v_acc_wise_usd,   v_today - 3,  'Uber ride',                   'Uber',       -18.50,  'USD', -18.50,   1,        'expense', v_cat_transport,     v_m_uber),
    (p_user_id, v_acc_wise_usd,   v_today - 10, 'Uber ride',                   'Uber',       -22.30,  'USD', -22.30,   1,        'expense', v_cat_transport,     v_m_uber),
    (p_user_id, v_acc_mp,         v_today - 6,  'Cabify viaje',                'Cabify',     -4200,   'ARS', -3.50,    0.000833, 'expense', v_cat_transport,     v_m_cabify),
    -- Food
    (p_user_id, v_acc_jpm,        v_today - 4,  'Dinner with friends',         'Restaurant', -78.00,  'USD', -78.00,   1,        'expense', v_cat_food,          v_m_restaurant),
    (p_user_id, v_acc_wise_usd,   v_today - 11, 'Lunch meeting',              'Restaurant', -45.00,  'USD', -45.00,   1,        'expense', v_cat_food,          v_m_restaurant),
    (p_user_id, v_acc_mp,         v_today - 2,  'Café y medialunas',           'Restaurant', -3800,   'ARS', -3.17,    0.000833, 'expense', v_cat_food,          v_m_restaurant),
    -- Shopping
    (p_user_id, v_acc_jpm,        v_today - 14, 'Amazon order',                'Amazon',     -129.99, 'USD', -129.99,  1,        'expense', v_cat_shopping,      v_m_amazon),
    (p_user_id, v_acc_mp,         v_today - 10, 'MercadoLibre compra',         'MercadoLibre',-35000, 'ARS', -29.17,   0.000833, 'expense', v_cat_shopping,      v_m_meli),
    -- Health
    (p_user_id, v_acc_jpm,        v_today - 6,  'Gym membership',              'Gym',        -75.00,  'USD', -75.00,   1,        'expense', v_cat_health,        v_m_gym),
    (p_user_id, v_acc_mp,         v_today - 5,  'Farmacia',                    'Farmacity',  -8900,   'ARS', -7.42,    0.000833, 'expense', v_cat_health,        v_m_farmacity),
    -- Travel
    (p_user_id, v_acc_wise_eur,   v_today - 20, 'Train ticket',               'Renfe',      -45.00,  'EUR', -48.60,   1.08,     'expense', v_cat_travel,        NULL),
    (p_user_id, v_acc_wise_eur,   v_today - 22, 'Hotel booking',              'Booking.com',-189.00, 'EUR', -204.12,  1.08,     'expense', v_cat_travel,        NULL),
    -- Taxes
    (p_user_id, v_acc_galicia,    v_today - 15, 'Monotributo',                 'AFIP',       -12000,  'ARS', -10.00,   0.000833, 'expense', v_cat_taxes,         NULL),
    -- Transfers
    (p_user_id, v_acc_wise_usd,   v_today - 18, 'Transfer to JPM',            'Transfer',   -500,    'USD', -500,     1,        'transfer', v_cat_transfers,    NULL),
    (p_user_id, v_acc_jpm,        v_today - 18, 'Transfer from Wise',         'Transfer',    500,    'USD',  500,     1,        'transfer', v_cat_transfers,    NULL),
    -- Debt repayment
    (p_user_id, v_acc_debt_father,v_today - 25, 'Repayment to dad',           'Transfer',    500,    'USD',  500,     1,        'adjustment', v_cat_debt,       NULL),
    -- Entertainment
    (p_user_id, v_acc_jpm,        v_today - 8,  'Movie tickets',              'AMC',        -32.00,  'USD', -32.00,   1,        'expense', v_cat_entertainment, NULL),
    (p_user_id, v_acc_mp,         v_today - 12, 'Cine',                       'Cinemark',   -6500,   'ARS', -5.42,    0.000833, 'expense', v_cat_entertainment, NULL);

  -- Recurring Expenses
  INSERT INTO public.recurring_expenses (user_id, name, amount, currency, frequency, type, category_id, account_id, next_due_date, is_active, status, due_day) VALUES
    (p_user_id, 'Netflix',           15.99,  'USD', 'monthly', 'subscription', v_cat_subscriptions, v_acc_wise_usd, (v_today + interval '28 days')::date, true, 'paid',     1),
    (p_user_id, 'Spotify Premium',   9.99,   'USD', 'monthly', 'subscription', v_cat_subscriptions, v_acc_wise_usd, (v_today + interval '25 days')::date, true, 'paid',     3),
    (p_user_id, 'ChatGPT Plus',      20.00,  'USD', 'monthly', 'subscription', v_cat_subscriptions, v_acc_wise_usd, (v_today + interval '26 days')::date, true, 'paid',     2),
    (p_user_id, 'Gym Membership',    75.00,  'USD', 'monthly', 'fixed_cost',   v_cat_health,        v_acc_jpm,      (v_today + interval '24 days')::date, true, 'expected', 6),
    (p_user_id, 'Rent',              1800,   'USD', 'monthly', 'fixed_cost',   v_cat_housing,       v_acc_jpm,      (date_trunc('month', v_today) + interval '1 month')::date, true, 'paid', 1),
    (p_user_id, 'Monotributo',       12000,  'ARS', 'monthly', 'tax_fee',      v_cat_taxes,         v_acc_galicia,  (v_today + interval '15 days')::date, true, 'expected', 15),
    (p_user_id, 'WeWork Day Pass',   29.00,  'USD', 'weekly',  'fixed_cost',   v_cat_housing,       v_acc_wise_usd, (v_today + interval '5 days')::date,  true, 'expected', 1);

  -- Budgets for current month
  INSERT INTO public.budgets (user_id, category_id, month, amount, currency) VALUES
    (p_user_id, v_cat_food,          date_trunc('month', v_today)::date, 400,  'USD'),
    (p_user_id, v_cat_groceries,     date_trunc('month', v_today)::date, 600,  'USD'),
    (p_user_id, v_cat_transport,     date_trunc('month', v_today)::date, 200,  'USD'),
    (p_user_id, v_cat_entertainment, date_trunc('month', v_today)::date, 150,  'USD'),
    (p_user_id, v_cat_shopping,      date_trunc('month', v_today)::date, 300,  'USD'),
    (p_user_id, v_cat_health,        date_trunc('month', v_today)::date, 150,  'USD'),
    (p_user_id, v_cat_subscriptions, date_trunc('month', v_today)::date, 100,  'USD');

  UPDATE public.profiles SET has_demo_data = true WHERE user_id = p_user_id;
END;
$function$;
