-- Recurring instances table for expected vs actual tracking
CREATE TABLE public.recurring_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  recurring_id UUID NOT NULL REFERENCES public.recurring_expenses(id) ON DELETE CASCADE,
  expected_date DATE NOT NULL,
  expected_amount NUMERIC NOT NULL DEFAULT 0,
  expected_currency TEXT NOT NULL DEFAULT 'USD',
  expected_account_id UUID,
  status TEXT NOT NULL DEFAULT 'expected', -- expected | due_soon | matched | paid_manual | overdue | mismatch | skipped
  matched_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  match_confidence NUMERIC,
  matched_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recurring_id, expected_date)
);

CREATE INDEX idx_recurring_instances_user_date ON public.recurring_instances(user_id, expected_date);
CREATE INDEX idx_recurring_instances_status ON public.recurring_instances(user_id, status);

ALTER TABLE public.recurring_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recurring_instances"
ON public.recurring_instances FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_recurring_instances_updated_at
BEFORE UPDATE ON public.recurring_instances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate instances for a recurring item over a window
CREATE OR REPLACE FUNCTION public.generate_recurring_instances(
  p_user_id UUID,
  p_months_ahead INT DEFAULT 3,
  p_months_back INT DEFAULT 2
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_date DATE;
  v_end DATE;
  v_start DATE;
  v_count INT := 0;
BEGIN
  v_start := (date_trunc('month', CURRENT_DATE) - (p_months_back || ' months')::interval)::date;
  v_end := (date_trunc('month', CURRENT_DATE) + (p_months_ahead || ' months')::interval)::date;

  FOR r IN
    SELECT * FROM public.recurring_expenses
    WHERE user_id = p_user_id AND is_active = true
  LOOP
    -- Seed first date
    IF r.next_due_date IS NOT NULL THEN
      v_date := r.next_due_date;
    ELSE
      v_date := (date_trunc('month', CURRENT_DATE) + ((COALESCE(r.due_day, 1) - 1) || ' days')::interval)::date;
    END IF;

    -- Walk back to v_start
    WHILE v_date > v_start LOOP
      v_date := CASE r.frequency
        WHEN 'weekly' THEN v_date - interval '7 days'
        WHEN 'quarterly' THEN v_date - interval '3 months'
        WHEN 'yearly' THEN v_date - interval '1 year'
        ELSE v_date - interval '1 month'
      END;
    END LOOP;

    -- Walk forward generating
    WHILE v_date <= v_end LOOP
      IF r.end_date IS NULL OR v_date <= r.end_date THEN
        INSERT INTO public.recurring_instances (
          user_id, recurring_id, expected_date, expected_amount,
          expected_currency, expected_account_id, status
        ) VALUES (
          p_user_id, r.id, v_date, ABS(r.amount),
          r.currency, r.account_id,
          CASE WHEN v_date < CURRENT_DATE - 3 THEN 'overdue' ELSE 'expected' END
        ) ON CONFLICT (recurring_id, expected_date) DO NOTHING;
        v_count := v_count + 1;
      END IF;
      v_date := CASE r.frequency
        WHEN 'weekly' THEN v_date + interval '7 days'
        WHEN 'quarterly' THEN v_date + interval '3 months'
        WHEN 'yearly' THEN v_date + interval '1 year'
        ELSE v_date + interval '1 month'
      END;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Auto-match function: link transactions to expected instances
CREATE OR REPLACE FUNCTION public.match_recurring_instances(p_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inst RECORD;
  tx RECORD;
  v_matched INT := 0;
  v_name TEXT;
BEGIN
  FOR inst IN
    SELECT i.*, r.name AS recurring_name, r.account_id AS r_account_id
    FROM public.recurring_instances i
    JOIN public.recurring_expenses r ON r.id = i.recurring_id
    WHERE i.user_id = p_user_id
      AND i.matched_transaction_id IS NULL
      AND i.status NOT IN ('paid_manual', 'skipped')
  LOOP
    v_name := lower(inst.recurring_name);
    SELECT t.* INTO tx FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.type = 'expense'
      AND t.date BETWEEN inst.expected_date - 5 AND inst.expected_date + 5
      AND ABS(ABS(t.amount) - inst.expected_amount) <= GREATEST(inst.expected_amount * 0.05, 0.5)
      AND (
        lower(COALESCE(t.merchant, '')) LIKE '%' || v_name || '%'
        OR lower(COALESCE(t.description, '')) LIKE '%' || v_name || '%'
        OR v_name LIKE '%' || lower(COALESCE(t.merchant, 'xxxxxxxx')) || '%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.recurring_instances i2
        WHERE i2.matched_transaction_id = t.id
      )
    ORDER BY ABS(t.date - inst.expected_date) ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.recurring_instances
      SET matched_transaction_id = tx.id,
          status = 'matched',
          match_confidence = 0.9,
          matched_at = now()
      WHERE id = inst.id;
      v_matched := v_matched + 1;
    ELSIF inst.expected_date < CURRENT_DATE - 3 THEN
      UPDATE public.recurring_instances
      SET status = 'overdue'
      WHERE id = inst.id AND status = 'expected';
    ELSIF inst.expected_date <= CURRENT_DATE + 5 THEN
      UPDATE public.recurring_instances
      SET status = 'due_soon'
      WHERE id = inst.id AND status = 'expected';
    END IF;
  END LOOP;
  RETURN v_matched;
END;
$$;

-- Convenience: regenerate + match in one call
CREATE OR REPLACE FUNCTION public.refresh_recurring_tracking(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_generated INT;
  v_matched INT;
BEGIN
  v_generated := public.generate_recurring_instances(p_user_id);
  v_matched := public.match_recurring_instances(p_user_id);
  RETURN jsonb_build_object('generated', v_generated, 'matched', v_matched);
END;
$$;