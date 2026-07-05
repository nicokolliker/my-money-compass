import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "create_transaction",
  title: "Create transaction",
  description: "Create a new transaction (expense or income) for the signed-in user. Amount is negative for expenses, positive for income.",
  inputSchema: {
    date: z.string().describe("Transaction date, YYYY-MM-DD."),
    amount: z.number().describe("Signed amount. Negative for expenses, positive for income."),
    currency: z.string().describe("ISO currency code, e.g. USD, ARS, EUR."),
    description: z.string().describe("Human-readable description."),
    merchant: z.string().optional().describe("Merchant name."),
    account_id: z.string().optional().describe("Account UUID this transaction belongs to."),
    category_id: z.string().optional().describe("Category UUID."),
    subcategory_id: z.string().optional().describe("Subcategory UUID."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await client(ctx)
      .from("transactions")
      .insert({ ...input, user_id: ctx.getUserId() })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: `Created transaction ${data.id}` }], structuredContent: { transaction: data } };
  },
});
