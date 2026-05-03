import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WISE_BASE = "https://api.wise.com";

async function fetchWise(path: string, token: string) {
  const res = await fetch(`${WISE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Wise API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Determine target user(s).
  // If called with an auth token from a logged-in user → sync just that user.
  // Otherwise (cron) → sync all users with wise_token set.
  let targetUserIds: string[] = [];

  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseAdmin.auth.getUser(jwt);
    if (userData?.user?.id) targetUserIds = [userData.user.id];
  }

  if (targetUserIds.length === 0) {
    const { data: rows } = await supabaseAdmin
      .from("user_settings")
      .select("user_id")
      .not("wise_token", "is", null);
    targetUserIds = (rows || []).map((r: any) => r.user_id);
  }

  const results: Record<string, { ok: boolean; imported?: number; error?: string }> = {};

  for (const userId of targetUserIds) {
    try {
      const { data: setting } = await supabaseAdmin
        .from("user_settings")
        .select("wise_token, wise_profile_id, wise_last_sync")
        .eq("user_id", userId)
        .maybeSingle();

      if (!setting?.wise_token || !setting?.wise_profile_id) {
        results[userId] = { ok: false, error: "Wise no configurado" };
        continue;
      }

      const token = setting.wise_token as string;
      const profileId = setting.wise_profile_id as string;

      // Balances
      const balances = await fetchWise(
        `/v4/profiles/${profileId}/balances?types=STANDARD`,
        token,
      );

      for (const bal of balances || []) {
        const cur = bal?.amount?.currency;
        const val = bal?.amount?.value;
        if (!cur) continue;
        await supabaseAdmin
          .from("accounts")
          .update({
            official_balance: val,
            official_balance_updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
          .ilike("name", "%Wise%")
          .eq("currency", cur);
      }

      // Statements per balance (last 30 days, or since last sync)
      const intervalEnd = new Date().toISOString();
      const intervalStart =
        setting.wise_last_sync ??
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      let importedTotal = 0;

      for (const bal of balances || []) {
        const balanceId = bal?.id;
        const currency = bal?.amount?.currency;
        if (!balanceId || !currency) continue;

        // Find local account
        const { data: localAccount } = await supabaseAdmin
          .from("accounts")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", "%Wise%")
          .eq("currency", currency)
          .maybeSingle();
        if (!localAccount) continue;

        let statement: any;
        try {
          statement = await fetchWise(
            `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json` +
              `?currency=${currency}` +
              `&intervalStart=${intervalStart}` +
              `&intervalEnd=${intervalEnd}` +
              `&type=COMPACT`,
            token,
          );
        } catch (_e) {
          continue;
        }

        const txs = statement?.transactions ?? [];
        for (const tx of txs) {
          const ref = tx.referenceNumber || tx.id || `${tx.date}-${tx.amount?.value}`;
          const external_id = `wise-${ref}`;
          const amount = tx.amount?.value ?? 0;

          let type: "income" | "expense" | "transfer" = amount >= 0 ? "income" : "expense";
          if ((tx.details?.type || "").toUpperCase() === "TRANSFER") type = "transfer";

          const { error: insErr } = await supabaseAdmin
            .from("transactions")
            .upsert(
              {
                user_id: userId,
                account_id: localAccount.id,
                date: (tx.date || "").split("T")[0],
                description:
                  tx.details?.description ||
                  tx.details?.merchant?.name ||
                  tx.details?.type ||
                  "Wise",
                amount: amount,
                currency,
                fx_rate: 1,
                amount_usd: currency === "USD" ? amount : 0,
                type,
                external_id,
              },
              { onConflict: "external_id", ignoreDuplicates: true },
            );
          if (!insErr) importedTotal += 1;
        }
      }

      await supabaseAdmin
        .from("user_settings")
        .update({ wise_last_sync: new Date().toISOString() })
        .eq("user_id", userId);

      results[userId] = { ok: true, imported: importedTotal };
    } catch (e: any) {
      results[userId] = { ok: false, error: e.message || String(e) };
    }
  }

  return json({ ok: true, results });
});
