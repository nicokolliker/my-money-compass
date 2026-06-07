CREATE OR REPLACE FUNCTION public.match_recurring_instances(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inst RECORD;
  tx RECORD;
  weak_tx RECORD;
  v_matched INT := 0;
  v_name TEXT;
  v_amount_tol NUMERIC;
  v_month_start DATE;
  v_month_end DATE;
BEGIN
  FOR inst IN
    SELECT i.*, r.name AS recurring_name
    FROM public.recurring_instances i
    JOIN public.recurring_expenses r ON r.id = i.recurring_id
    WHERE i.user_id = p_user_id
      AND i.matched_transaction_id IS NULL
      AND i.status NOT IN ('paid_manual', 'skipped')
  LOOP
    v_name := lower(trim(inst.recurring_name));
    -- 15% tolerance on amount (was 5%)
    v_amount_tol := GREATEST(inst.expected_amount * 0.15, 0.5);
    -- Calendar month of the expected_date
    v_month_start := date_trunc('month', inst.expected_date)::date;
    v_month_end   := (date_trunc('month', inst.expected_date) + interval '1 month - 1 day')::date;

    -- High-confidence: name overlap + ±15% amount + same calendar month
    -- Scans every account (no account filter) so cross-source matches work
    -- (ARQ, MercadoPago, Galicia, cards, etc.). First match wins.
    SELECT t.* INTO tx FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.type = 'expense'
      AND t.date BETWEEN v_month_start AND v_month_end
      AND ABS(ABS(t.amount) - inst.expected_amount) <= v_amount_tol
      AND v_name <> ''
      AND (
        lower(COALESCE(t.merchant, '')) LIKE '%' || v_name || '%'
        OR lower(COALESCE(t.description, '')) LIKE '%' || v_name || '%'
        OR (length(v_name) >= 3 AND v_name LIKE '%' || lower(COALESCE(t.merchant, 'xxxxxxxx')) || '%')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.recurring_instances i2
        WHERE i2.matched_transaction_id = t.id
      )
    ORDER BY ABS(t.date - inst.expected_date) ASC,
             ABS(ABS(t.amount) - inst.expected_amount) ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.recurring_instances
      SET matched_transaction_id = tx.id,
          status = 'matched',
          match_confidence = 0.95,
          matched_at = now()
      WHERE id = inst.id;
      v_matched := v_matched + 1;
    ELSE
      -- Weak candidate: name overlap, ±25% amount, same month → needs_review
      SELECT t.* INTO weak_tx FROM public.transactions t
      WHERE t.user_id = p_user_id
        AND t.type = 'expense'
        AND t.date BETWEEN v_month_start AND v_month_end
        AND ABS(ABS(t.amount) - inst.expected_amount) <= GREATEST(inst.expected_amount * 0.25, 1.0)
        AND v_name <> ''
        AND (
          lower(COALESCE(t.merchant, '')) LIKE '%' || v_name || '%'
          OR lower(COALESCE(t.description, '')) LIKE '%' || v_name || '%'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.recurring_instances i2
          WHERE i2.matched_transaction_id = t.id
        )
      ORDER BY ABS(t.date - inst.expected_date) ASC
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.recurring_instances
        SET status = 'needs_review',
            match_confidence = 0.5,
            notes = COALESCE(notes, '') || ' candidate_tx:' || weak_tx.id::text
        WHERE id = inst.id;
      ELSIF inst.expected_date < CURRENT_DATE - 3 THEN
        UPDATE public.recurring_instances
        SET status = 'overdue'
        WHERE id = inst.id AND status = 'expected';
      ELSIF inst.expected_date <= CURRENT_DATE + 5 THEN
        UPDATE public.recurring_instances
        SET status = 'due_soon'
        WHERE id = inst.id AND status = 'expected';
      END IF;
    END IF;
  END LOOP;
  RETURN v_matched;
END;
$function$;