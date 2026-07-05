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
  name: "list_budgets",
  title: "List budgets",
  description: "List monthly per-category budget limits for the signed-in user, optionally scoped to a specific month (YYYY-MM).",
  inputSchema: {
    month: z.string().optional().describe("Month in YYYY-MM format. Omit to return all budgets."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ month }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = client(ctx).from("budgets").select("id, category_id, subcategory_id, month, amount, currency");
    if (month) q = q.eq("month", month);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: { budgets: data ?? [] } };
  },
});
