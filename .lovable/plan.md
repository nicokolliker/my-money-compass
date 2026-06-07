# Sync installments → recurring expenses

## Goal
After the Viejo wizard finishes, every installment row with `remaining_installments > 0` becomes (or updates) a row in `recurring_expenses` marked as an installment. Items that hit `remaining = 0` are deactivated. Manually-added recurrings need no extra wiring — they already feed budget tracking via their category.

## Identification scheme
- `subtype = 'installment'` marks the row as installment-managed.
- `notes` stores a stable key: `installment:<source>:<stripped-description>` where the description has any `Cuota X/Y` token removed and is trimmed/collapsed.
- Matching is done by `(user_id, subtype='installment', notes=<key>)`. This survives the monthly `Cuota 03/06 → 04/06` change.

## Sync logic (runs at end of Viejo wizard `handleConfirm`, after `installment_debts` upsert)

For each of the three sources (`mama`, `papa`, `sant`):

```text
1. Load existing recurring_expenses where user_id=me AND subtype='installment'
   AND notes LIKE 'installment:<source>:%'   → existingBySource map by notes key.

2. For each installment row in this source's selection:
   - parse Cuota X/Y → current, total, remaining = total - current
   - key  = `installment:${source}:${stripCuota(description)}`
   - name = stripCuota(description)             (clean display name)
   - amount = amount_ars, currency = 'ARS'
   - end_date = addMonths(today, remaining)     (date-fns)
   - category_id =
        inferCategoryName(description) → categories.find(name) → id
        ?? categories.find(name ILIKE 'casa' OR 'hogar').id
        ?? null
   - type = 'casa'
   - frequency = 'monthly'
   - is_active = remaining > 0

   If remaining === 0:
     - if existing row found → UPDATE is_active=false (do not delete, to preserve history/matches)
     - else skip
   Else:
     - if existing row found → UPDATE (name, amount, end_date, category_id, is_active=true)
     - else INSERT new row with the fields above + notes=key + subtype='installment'

3. After processing this source's current rows, any leftover row in
   existingBySource that was NOT touched this run → UPDATE is_active=false
   (the installment was fully paid off or removed in a prior cycle).
```

All writes go through `supabase.from('recurring_expenses')` directly inside `handleConfirm` (same pattern as the existing transaction inserts). At the end, invalidate `['recurring-expenses']` alongside `['installment-debts']`.

## Manual recurring → budget
Confirmed in clarifying questions: no schema or auto-budget code. Existing budgets already roll up spend from transactions in the category, so a manually-added recurring with a `category_id` will naturally appear in the matching budget row when its transactions land. No change needed.

## Technical details
- New helper (top of `ViejoSettlementWizard.tsx` or `src/lib/installmentRecurring.ts`):
  - `stripCuota(desc: string): string` — removes `\s*cuota\s*\d+\s*\/\s*\d+\s*` (case-insensitive), collapses spaces, trims.
  - `buildInstallmentKey(source, desc)` returning `installment:${source}:${stripCuota(desc).toLowerCase()}`.
- `end_date`: `format(addMonths(new Date(), remaining), 'yyyy-MM-dd')`.
- Fallback "Casa/Hogar" category: case-insensitive lookup against the already-loaded `categories` array; if missing, leave `category_id` null (do not auto-create).
- `next_due_date`: leave existing value if updating; on insert set to first of next month so the recurring tracker picks it up.
- Cast to `as any` only where necessary; `subtype` and `notes` are already typed on the table.

## Files touched
- `src/components/debts/ViejoSettlementWizard.tsx` — extend `handleConfirm` with the sync block right after the installment_debts insert loop; add `qc.invalidateQueries({ queryKey: ['recurring-expenses'] })`.
- (Optional) `src/lib/installmentRecurring.ts` — extract `stripCuota` + `buildInstallmentKey` + the sync function so the wizard file stays readable.

## Out of scope
- Migrations (no schema change).
- Auto-creating budget rows.
- Changing the manual "Add recurring expense" form (no new behavior needed there).
