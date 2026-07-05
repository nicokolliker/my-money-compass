import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccounts from "./tools/list-accounts";
import listTransactions from "./tools/list-transactions";
import listCategories from "./tools/list-categories";
import listRecurring from "./tools/list-recurring";
import listBudgets from "./tools/list-budgets";
import createTransaction from "./tools/create-transaction";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "my-money-compass-mcp",
  title: "My Money Compass",
  version: "0.1.0",
  instructions:
    "Personal finance tools for My Money Compass. Read the signed-in user's accounts, transactions, categories, recurring expenses, and budgets, or create a new transaction. All data is scoped to the authenticated user via Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAccounts, listTransactions, listCategories, listRecurring, listBudgets, createTransaction],
});
