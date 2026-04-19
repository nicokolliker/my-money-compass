-- Allow new 'needs_review' status on recurring_instances
-- (status is text, no enum, so just document and use it)

-- Helpful index for matching lookups
CREATE INDEX IF NOT EXISTS idx_transactions_user_date_type
  ON public.transactions (user_id, date, type);

CREATE INDEX IF NOT EXISTS idx_recurring_instances_user_status
  ON public.recurring_instances (user_id, status);

-- Refactored matching: ±3% amount, ±3 days, with needs_review for weak candidates
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
    v_amount_tol := GREATEST(inst.expected_amount * 0.03, 0.5);

    -- High-confidence match: name overlap + ±3% amount + ±3 days
    SELECT t.* INTO tx FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.type = 'expense'
      AND t.date BETWEEN inst.expected_date - 3 AND inst.expected_date + 3
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
      -- Weak candidate (name overlap, amount within ±10%, date ±7 days) → needs_review
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