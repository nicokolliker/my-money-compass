-- Ensure unique (recurring_id, expected_date) — backs ON CONFLICT in generate_recurring_instances
CREATE UNIQUE INDEX IF NOT EXISTS recurring_instances_recurring_date_uniq
  ON public.recurring_instances (recurring_id, expected_date);

-- Guarantee a transaction can only be linked to ONE instance (partial unique on non-null)
CREATE UNIQUE INDEX IF NOT EXISTS recurring_instances_matched_tx_uniq
  ON public.recurring_instances (matched_transaction_id)
  WHERE matched_transaction_id IS NOT NULL;

-- Tighten matching thresholds to spec: ±5% amount, ±5 days date for high-confidence
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
    v_amount_tol := GREATEST(inst.expected_amount * 0.05, 0.5);

    -- High-confidence: name overlap + ±5% amount + ±5 days
    SELECT t.* INTO tx FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.type = 'expense'
      AND t.date BETWEEN inst.expected_date - 5 AND inst.expected_date + 5
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
      -- Weak candidate (name overlap, ±10% amount, ±7 days) → needs_review
      SELECT t.* INTO weak_tx FROM public.transactions t
      WHERE t.user_id = p_user_id
        AND t.type = 'expense'
        AND t.date BETWEEN inst.expected_date - 7 AND inst.expected_date + 7
        AND ABS(ABS(t.amount) - inst.expected_amount) <= GREATEST(inst.expected_amount * 0.10, 1.0)
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