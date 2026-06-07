# Debts page redesign

## Goal
Restructure `/debts` around the user's actual monthly ritual: two settlements (Viejo + Splitwise) shown as twin cards, with all confirm actions producing real account-affecting transactions.

## New page layout (`src/pages/Debts.tsx`)

```
Liquidaciones — <Month YYYY>

┌──────────────────────┐  ┌──────────────────────┐
│ Al Viejo             │  │ Splitwise            │
│ Last: $X · Month     │  │ Balance: -$X ARS     │
│ [✓ Liquidado | Pend] │  │ Último import: date  │
│                      │  │                      │
│ [💚 Vuelto pendiente │  │ [Registrar pago →]   │
│  +$X.XXX ARS         │  │   (if owes)          │
│  Marcar recibido]    │  │ or "Sin deuda"       │
│                      │  │                      │
│ [Liquidar Month →]   │  │ [Cargar CSV]         │
└──────────────────────┘  └──────────────────────┘

Estado actual
  <CreditCardDebtCard />

Historial
  <UnifiedCycleHistory />
```

Removed: top-level `<PendingCreditsBanner />`, the unused `ViejoDebtCard` / `SplitwiseDebtCard` / `SimpleDebtCard` / `TransferDialog` blocks (dead code from prior refactor).

## Card 1 — `ViejoActionCard` (extended)

- Keep current header (last settlement USD + month, "Liquidar [mes] →" button opening `ViejoSettlementWizard`).
- Add inline status badge:
  - `✓ Liquidado` when a settlement transaction exists for the current `yyyy-MM` (reuse the `liquidacion-check` query already in `ViejoDebtCard`).
  - Otherwise `Pendiente`.
- Inline pending vuelto block (replaces `PendingCreditsBanner`):
  - Source: `usePendingCredits()` filtered to `source = 'viejo_settlement'`, `status = 'pending'`.
  - Renders: `💚 Vuelto pendiente: +$X.XXX ARS · <month>` + `Marcar como recibido` button.
  - Click → confirm dialog → `markVueltoReceived()` (see Behavior section).

## Card 2 — `SplitwiseActionCard` (rebuilt)

- Header: Splitwise logo + name + `Último import: <date>` (from `useImportLog`).
- Balance display (large, centered):
  - `balance < -0.5` → red `-$X.XX USD` with sublabel "Debés".
  - `balance > 0.5` → green `+$X.XX USD` with "Te deben".
  - else → muted "Sin deuda este mes ✓".
- Primary button (only when `balance < -0.5`): `Registrar pago →` opens new `SplitwisePaymentDialog`.
- Secondary button always visible: `Cargar CSV de Splitwise →` opens existing `SplitwiseSettlementWizard`.

### `SplitwisePaymentDialog` (new, inline in Debts.tsx or `src/components/debts/SplitwisePaymentDialog.tsx`)
Fields:
- `Monto ARS` — pre-filled with `Math.round(Math.abs(balance) * tcBlue)` (USD→ARS using latest blue rate) but editable.
- `Memo` — text input, optional (default: `Pago Splitwise — <Month>`).
- Confirm → creates an MP-debit transaction (see Behavior).

## Behavior — real transactions

All three actions use `supabase.from('transactions').insert(...)` directly (same pattern as `ViejoSettlementWizard`).

Account resolution helper (memoized via `useAccountBalances`):
- Cash USD → first account where `currency='USD'` AND `name ILIKE '%cash%'`.
- MercadoPago ARS → first account where `currency='ARS'` AND (`name ILIKE '%mercadopago%'` OR `name ILIKE '%mercado pago%'` OR `name ILIKE '%mp%'`).
- Splitwise USD → already resolved as `splitwiseAccount`.

### 1. Viejo wizard completion (Cash USD debit)
Already implemented in `ViejoSettlementWizard.tsx` lines 424-435 — it inserts a `-usdAPagar` expense on the Cash USD account. **No change required**; we'll just note this in the plan and leave it.

### 2. Marking vuelto as received (MP ARS credit)
Extend `useResolvePendingCredit` (or wrap it in Debts page) so that on confirm we ALSO:
- Insert `transactions` row:
  - `account_id` = MP ARS account
  - `date` = today
  - `description` = `Vuelto liquidación <Month YYYY>`
  - `amount` = `+pc.amount_ars`, `currency='ARS'`
  - `fx_rate` = latest ARS→USD blue rate
  - `amount_usd` = `+pc.amount_ars * fxArsUsd`
  - `type` = `'income'`
  - `notes` = JSON `{ vuelto_for: pc.id, settlement_month: pc.settlement_month }`
- Then call the existing resolve mutation, passing the new `transactionId` so `pending_credits.matched_transaction_id` gets set.

### 3. Splitwise payment confirm (MP ARS debit)
On confirm of `SplitwisePaymentDialog`:
- Insert `transactions` row:
  - `account_id` = MP ARS account
  - `date` = today
  - `description` = memo or `Pago Splitwise — <Month>`
  - `amount` = `-amountARS`, `currency='ARS'`
  - `fx_rate` = latest ARS→USD blue rate
  - `amount_usd` = `-amountARS * fxArsUsd`
  - `type` = `'expense'`
  - `notes` = JSON `{ splitwise_payment: true, settlement_month: '<yyyy-MM>' }`
- Also insert mirroring credit on Splitwise account so the USD owed balance moves toward 0:
  - `account_id` = Splitwise account
  - `amount` = `+amountARS * fxArsUsd` (USD), `currency='USD'`
  - `type` = `'adjustment'`
  - `description` = `Pago Splitwise (MP)`
  - linked via shared `notes` group id.
- Invalidate `['accounts']`, `['transactions']`, `['splitwise-monthly']`.
- Toast `Pago registrado`.

## Edge cases & guards
- If MP ARS or Cash USD account can't be resolved → toast error `No se encontró la cuenta MP/Cash USD`, abort.
- If `tcBlue` (blue rate) unavailable → fall back to `1` for USD column but still record ARS amount; warn in toast.
- All inserts wrapped in try/catch with sonner error toast.
- After success, invalidate React Query keys: `['accounts']`, `['transactions']`, `['pending-credits']`, `['splitwise-monthly']`, `['last-liquidacion-any']`.

## Files touched

- `src/pages/Debts.tsx` — rewrite page body; delete dead `ViejoDebtCard`/`SplitwiseDebtCard`/`SimpleDebtCard`/`TransferDialog` blocks; new `ViejoActionCard` + `SplitwiseActionCard` with new behaviors; mount `SplitwisePaymentDialog`.
- `src/components/debts/SplitwisePaymentDialog.tsx` — **new**.
- `src/hooks/usePendingCredits.ts` — extend `useResolvePendingCredit` to accept an optional `creditTransaction` payload and create the MP credit tx in the same mutation (or add a sibling hook `useReceiveVuelto`).
- No changes to `ViejoSettlementWizard.tsx` (Cash USD debit already in place).
- No DB schema changes.

## Out of scope
- Visual redesign of `CreditCardDebtCard` and `UnifiedCycleHistory` (kept as-is per request).
- Touching the wizard internals beyond what's already implemented.
