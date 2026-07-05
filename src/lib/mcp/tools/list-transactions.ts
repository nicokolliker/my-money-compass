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
  name: "list_transactions",
  title: "List transactions",
  description: "List transactions for the signed-in user, optionally filtered by date range or merchant substring. Returns up to `limit` rows (default 50, max 500) sorted newest first.",
  inputSchema: {
    since: z.string().optional().describe("Inclusive start date (YYYY-MM-DD)."),
    until: z.string().optional().describe("Inclusive end date (YYYY-MM-DD)."),
    merchant_contains: z.string().optional().describe("Case-insensitive substring to match against merchant or description."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows to return. Default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ since, until, merchant_contains, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = client(ctx)
      .from("transactions")
      .select("id, date, description, merchant, amount, currency, category_id, subcategory_id, account_id, is_subscription")
      .order("date", { ascending: false })
      .limit(limit ?? 50);
    if (since) q = q.gte("date", since);
    if (until) q = q.lte("date", until);
    if (merchant_contains) q = q.or(`merchant.ilike.%${merchant_contains}%,description.ilike.%${merchant_contains}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { transactions: data ?? [] },
    };
  },
});
