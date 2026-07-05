import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_categories",
  title: "List categories",
  description: "List spending categories and their subcategories for the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = client(ctx);
    const [cats, subs] = await Promise.all([
      sb.from("categories").select("id, name, kind, color, icon").order("name"),
      sb.from("subcategories").select("id, name, category_id").order("name"),
    ]);
    if (cats.error) return { content: [{ type: "text", text: cats.error.message }], isError: true };
    if (subs.error) return { content: [{ type: "text", text: subs.error.message }], isError: true };
    const payload = { categories: cats.data ?? [], subcategories: subs.data ?? [] };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
  },
});
