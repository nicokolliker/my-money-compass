

## Personal Finance App — Refined V1 Plan

### Database Schema

**accounts**
- id (uuid PK), name, type (enum: bank, digital_wallet, cash, credit_card, debt, receivable, investment, manual), institution, currency, opening_balance (default 0), notes, is_active, created_at, updated_at

Balance is computed from `opening_balance + sum(transactions)`. No `current_balance` column.

**categories**
- id, name, icon, color, is_system, sort_order, created_at

**subcategories**
- id, category_id (FK), name, created_at

**tags**
- id, name, color, created_at

**transactions**
- id, date, description, merchant, amount, currency, fx_rate, amount_usd, account_id (FK), category_id (FK), subcategory_id (FK), type (enum: **expense, income, transfer, adjustment**), notes, is_subscription, linked_transfer_id (FK self-ref, nullable), raw_imported_description, created_at, updated_at

Transfer logic: A transfer creates **two transactions** (one per account) linked via `linked_transfer_id`. Each stores its own currency/amount/fx_rate. Neither counts as expense or income. Debt increases/repayments are just transfers to/from a liability account.

**transaction_tags** (junction)
- transaction_id, tag_id

**transaction_splits**
- id, transaction_id (FK), category_id, subcategory_id, amount, amount_usd, notes

**fx_rates**
- id, from_currency, to_currency, rate, date, source (manual/api), created_at

**rules**
- id, keyword, match_field (merchant/description), category_id, subcategory_id, tag_ids (jsonb), mark_as_subscription, is_active, created_at

**import_logs**
- id, filename, account_id, row_count, imported_at

**net_worth_snapshots**
- id, date, total_assets_usd, total_liabilities_usd, net_worth_usd, snapshot_data (jsonb), created_at

No separate `subscriptions` table in v1 — subscriptions view queries transactions where `is_subscription = true`, grouped by merchant/description.

### Core Screens (7 tabs, bottom nav on mobile)

1. **Dashboard** — Net worth in USD, assets vs liabilities, net worth trend (Recharts), account balances (computed), month spending summary, currency breakdown
2. **Accounts** — Grouped by type, each showing computed native balance + USD equivalent, tap to see account transactions, add/edit account sheet
3. **Transactions** — Searchable list, quick-add FAB, inline edit, bulk categorize, duplicate, split, filter by account/category/date/tags
4. **Analytics** — Monthly spending bar chart, category donut, month-over-month, top merchants, income vs expenses, filter bar
5. **Subscriptions** — Derived view from `is_subscription` transactions, grouped by name, showing monthly USD cost, last/next charge estimates
6. **Rules** — Simple CRUD list for auto-categorization keywords
7. **Settings** — Three clear sub-sections: **Categories & Tags**, **FX Rates**, **CSV Import** (each as separate sub-pages/tabs, not one big form)

### Key User Flows

**Quick-add transaction (mobile-optimized)**
FAB → bottom sheet → date (default today), amount, account (default last-used), category (recent first), type toggle (expense default) → save. Under 5 taps for common entries.

**Transfer between accounts**
FAB → select "Transfer" → from account, to account, amount, FX rate (auto-suggested if cross-currency) → creates two linked transactions automatically.

**Debt workflow**
Create liability account "Debt to father" → Transfer from any account to debt account = debt increase → Transfer from debt account back = repayment. Dashboard shows liability balance naturally.

**CSV Import**
Settings → Import → Upload → Map columns → Set account → Preview rows → Confirm → Rules auto-applied on import.

### V1 Scope

**In scope:** Accounts, transactions (4 types), linked transfers, computed balances, categories/subcategories/tags, rules engine, FX rates (manual), CSV import with column mapping, dashboard with net worth + spending, analytics charts, subscription view (derived), seed data, mobile-first responsive UI, light theme with CSS vars ready for dark mode.

**Deferred:** Auth, auto FX fetch, bank sync, recurring detection, merchant normalization, dark mode, scheduled snapshots, separate subscriptions table.

### Seed Data
- 8 accounts (Wise USD, Wise EUR, Mercado Pago ARS, Galicia ARS, DolarApp USD, Cash USD, Debt to father, Splitwise)
- 12 default categories with subcategories
- ~30 transactions including linked transfers and debt flows
- Sample FX rates, 4 rules, a few `is_subscription` transactions

### Tech
React + TypeScript + Tailwind + shadcn/ui + Recharts + Supabase + React Query. Bottom tab nav on mobile, sidebar on desktop.

