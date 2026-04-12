import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.1/cors";

const WISE_API = "https://api.wise.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const WISE_API_TOKEN = Deno.env.get("WISE_API_TOKEN");
  if (!WISE_API_TOKEN) {
    return new Response(JSON.stringify({ error: "WISE_API_TOKEN not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "get-profiles") {
      const res = await wiseGet("/v2/profiles", WISE_API_TOKEN);
      return json({ profiles: res });
    }

    if (action === "get-balances") {
      const profileId = body.profileId;
      const res = await wiseGet(`/v4/profiles/${profileId}/balances?types=STANDARD`, WISE_API_TOKEN);
      return json({ balances: res });
    }

    if (action === "sync-transactions") {
      const { profileId, balanceId, accountId, currency, intervalStart, intervalEnd } = body;

      // Fetch statement
      const statement = await wiseGet(
        `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement/json?currency=${currency}&intervalStart=${intervalStart}&intervalEnd=${intervalEnd}`,
        WISE_API_TOKEN
      );

      const transactions = statement.transactions || [];
      let imported = 0;
      const rules = await getRules(supabase);

      for (const tx of transactions) {
        const externalId = `wise_${tx.referenceNumber}`;

        // Check duplicate
        const { data: existing } = await supabase
          .from("transactions")
          .select("id")
          .eq("external_id", externalId)
          .maybeSingle();

        if (existing) continue;

        const amount = tx.amount?.value ?? 0;
        const txCurrency = tx.amount?.currency ?? currency;
        const isExpense = amount < 0;
        const fxRate = tx.exchangeDetails?.rate ?? 1;
        const amountUsd = txCurrency === "USD" ? amount : amount * fxRate;

        // Determine description and merchant
        const description = tx.details?.description || tx.details?.type || "Wise transaction";
        const merchant = tx.details?.merchant?.name || tx.details?.senderName || null;

        // Apply rules
        let categoryId: string | null = null;
        let isSub = false;
        for (const rule of rules) {
          if (!rule.is_active) continue;
          const matchText = rule.match_field === "merchant" ? (merchant || "") : description;
          if (matchText.toUpperCase().includes(rule.keyword.toUpperCase())) {
            categoryId = rule.category_id;
            isSub = rule.mark_as_subscription;
            break;
          }
        }

        const txType = tx.type === "CREDIT" ? "income" : "expense";

        const { error: insertErr } = await supabase.from("transactions").insert({
          date: tx.date ? tx.date.split("T")[0] : new Date().toISOString().split("T")[0],
          description,
          merchant,
          amount,
          currency: txCurrency,
          fx_rate: fxRate,
          amount_usd: amountUsd,
          account_id: accountId,
          category_id: categoryId,
          type: txType,
          is_subscription: isSub,
          external_id: externalId,
          raw_imported_description: JSON.stringify(tx.details || {}),
          notes: tx.details?.paymentReference || null,
        });

        if (!insertErr) imported++;
      }

      // Log sync
      await supabase.from("wise_sync_log").insert({
        profile_id: String(profileId),
        account_id: accountId,
        status: "success",
        transactions_imported: imported,
        last_transaction_date: intervalEnd.split("T")[0],
      });

      return json({ imported, total: transactions.length });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Wise sync error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function wiseGet(path: string, token: string) {
  const res = await fetch(`${WISE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wise API error [${res.status}]: ${body}`);
  }
  return res.json();
}

async function getRules(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.from("rules").select("*").eq("is_active", true);
  return data || [];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
