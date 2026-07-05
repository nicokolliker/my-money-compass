import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const WISE_BASE = "https://api.wise.com";

// Keep in sync with src/lib/merchantSync.ts normalizeMerchantName.
const STATE_SUFFIX_RE = /\s*[—–-]\s*(pending|withdrawn|moved|reversed|cancelled|declined)\s*$/i;
const BLOCKLIST_RE = /^(to\s+[a-z]{3}|liquidaci[oó]n\b.*|transferencia\b.*|balance cashback)$/i;
function normalizeMerchantName(raw: string): string | null {
  let n = (raw || "").trim().replace(/\s+/g, " ").replace(STATE_SUFFIX_RE, "").trim();
  if (n.length < 2 || BLOCKLIST_RE.test(n)) return null;
  return n;
}

// Keep in sync with src/lib/digitalSubtypes.ts.
const DIGITAL_NAME_OVERRIDES: Record<string, string[]> = {
  "Otros": ["amazon prime", "oura"],
};
const DIGITAL_NAME_MAP: Record<string, string[]> = {
  "IA": ["chatgpt", "claude", "gemini", "perplexity", "copilot", "openai", "google ai", "midjourney", "runway", "gamma", "notebooklm"],
  "Entretenimiento": ["netflix", "spotify", "youtube", "disney", "hbo", "apple tv", "paramount", "crunchyroll", "blinkist"],
  "Creatividad & Productividad": ["adobe", "figma", "canva", "notion", "loom", "grammarly", "icloud", "apple one", "lovable", "granola"],
  "Marketplace & Movilidad": ["uber", "didi", "rappi", "pedidos ya", "glovo", "cabify", "amazon", "mercadolibre", "meli", "aliexpress", "ebay"],
};

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

  const results: Record<
    string,
    { ok: boolean; imported?: number; skipped?: number; error?: string; diagnostics?: string[] }
  > = {};

  for (const userId of targetUserIds) {
    const diagnostics: string[] = [];
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

      // Categories + rules + Digital subcategories, fetched once per user.
      const { data: rulesRows } = await supabaseAdmin
        .from("rules")
        .select("keyword, category_id")
        .eq("user_id", userId);
      const rules = (rulesRows || []) as Array<{ keyword: string; category_id: string }>;
      const matchRule = (text: string): string | null => {
        const lower = (text || "").toLowerCase();
        for (const r of rules) {
          if (r.keyword && lower.includes(r.keyword.toLowerCase())) return r.category_id;
        }
        return null;
      };

      const { data: digitalCatRows } = await supabaseAdmin
        .from("categories")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", "digital")
        .limit(1);
      const digitalCategoryId = digitalCatRows?.[0]?.id ?? null;

      const digitalSubByLabel: Record<string, string> = {};
      if (digitalCategoryId) {
        const { data: subs } = await supabaseAdmin
          .from("subcategories")
          .select("id, name")
          .eq("category_id", digitalCategoryId);
        for (const s of (subs || []) as Array<{ id: string; name: string }>) {
          digitalSubByLabel[(s.name || "").toLowerCase()] = s.id;
        }
      }
      const resolveSubcat = (categoryId: string | null, signal: string): string | null => {
        if (!categoryId || !digitalCategoryId || categoryId !== digitalCategoryId) return null;
        const lower = (signal || "").toLowerCase();
        for (const [label, patterns] of Object.entries(DIGITAL_NAME_OVERRIDES)) {
          if (patterns.some((p) => lower.includes(p))) return digitalSubByLabel[label.toLowerCase()] || null;
        }
        for (const [label, patterns] of Object.entries(DIGITAL_NAME_MAP)) {
          if (patterns.some((p) => lower.includes(p))) return digitalSubByLabel[label.toLowerCase()] || null;
        }
        return digitalSubByLabel["otros"] || null;
      };

      // Balances
      let balances: any[] = [];
      try {
        balances = await fetchWise(
          `/v4/profiles/${profileId}/balances?types=STANDARD`,
          token,
        );
      } catch (e: any) {
        results[userId] = { ok: false, error: `No se pudo leer balances: ${e.message}` };
        continue;
      }

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
      let skippedTotal = 0;
      const wantedMerchants = new Map<string, { name: string; category_id: string | null }>();
      const batchById = new Map<string, { description: string; merchant: string | null; amount: number; amount_usd: number; date: string }>();

      for (const bal of balances || []) {
        const balanceId = bal?.id;
        const currency = bal?.amount?.currency;
        if (!balanceId || !currency) continue;

        const { data: localAccount } = await supabaseAdmin
          .from("accounts")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", "%Wise%")
          .eq("currency", currency)
          .maybeSingle();
        if (!localAccount) {
          diagnostics.push(`Sin cuenta local "Wise" en ${currency} — statement de ese balance omitido.`);
          continue;
        }

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
        } catch (e: any) {
          diagnostics.push(`Statement ${currency} falló: ${e.message}`);
          continue;
        }

        const txs = statement?.transactions ?? [];
        diagnostics.push(`${currency}: ${txs.length} movimientos en ventana ${intervalStart.slice(0, 10)}→${intervalEnd.slice(0, 10)}.`);

        const seenIds = new Map<string, number>();
        for (const tx of txs) {
          const ref = tx.referenceNumber || tx.id || `${tx.date}-${tx.amount?.value}`;
          const baseId = `wise-${ref}`;
          const occ = (seenIds.get(baseId) || 0) + 1;
          seenIds.set(baseId, occ);
          const external_id = occ === 1 ? baseId : `${baseId}-${occ}`;
          const amount = tx.amount?.value ?? 0;

          let type: "income" | "expense" | "transfer" = amount >= 0 ? "income" : "expense";
          if ((tx.details?.type || "").toUpperCase() === "TRANSFER") type = "transfer";

          let amountUsd = amount;
          let fxRate = 1;
          if (currency !== "USD") {
            const { data: rateRow } = await supabaseAdmin
              .from("fx_rates")
              .select("rate")
              .eq("from_currency", currency)
              .eq("to_currency", "USD")
              .order("date", { ascending: false })
              .limit(1)
              .maybeSingle();
            fxRate = rateRow?.rate ?? (currency === "EUR" ? 1.08 : 1);
            amountUsd = amount * fxRate;
          }

          const merchantNameRaw: string | null = tx.details?.merchant?.name || null;
          const description =
            tx.details?.description ||
            merchantNameRaw ||
            tx.details?.type ||
            "Wise";
          const merchantName = merchantNameRaw ? normalizeMerchantName(merchantNameRaw) : null;

          const category_id = matchRule(`${merchantName || ""} ${description}`);
          const subcategory_id = resolveSubcat(category_id, `${merchantName || ""} ${description}`);

          const { data: insData, error: insErr } = await supabaseAdmin
            .from("transactions")
            .upsert(
              {
                user_id: userId,
                account_id: localAccount.id,
                date: (tx.date || "").split("T")[0],
                description,
                merchant: merchantName,
                amount: amount,
                currency,
                fx_rate: fxRate,
                amount_usd: amountUsd,
                type,
                external_id,
                category_id,
                subcategory_id,
              },
              { onConflict: "external_id", ignoreDuplicates: true },
            )
            .select("id");

          if (insErr) {
            diagnostics.push(`Upsert error ${external_id}: ${insErr.message}`);
          } else if (insData && insData.length > 0) {
            importedTotal += 1;
          } else {
            skippedTotal += 1;
            batchById.set(external_id, {
              description,
              merchant: merchantName,
              amount,
              amount_usd: amountUsd,
              date: (tx.date || "").split("T")[0],
            });
          }

          if (merchantName) {
            const key = merchantName.toLowerCase();
            if (!wantedMerchants.has(key)) {
              wantedMerchants.set(key, { name: merchantName, category_id });
            }
          }

          // Wise → ARQ/DolarApp transfer detection
          const isArqOutgoing =
            type === "transfer" &&
            amount < 0 &&
            /dolarapp|arq\b/i.test(description);

          if (isArqOutgoing) {
            const { data: txRow } = await supabaseAdmin
              .from("transactions")
              .select("id")
              .eq("external_id", external_id)
              .eq("user_id", userId)
              .maybeSingle();

            if (txRow?.id) {
              await supabaseAdmin
                .from("arq_reconciliations")
                .upsert(
                  {
                    user_id: userId,
                    wise_tx_id: txRow.id,
                    wise_amount_usd: Math.abs(amountUsd),
                    wise_date: (tx.date || "").split("T")[0],
                    wise_description: description,
                    status: "pending",
                  },
                  { onConflict: "wise_tx_id", ignoreDuplicates: true },
                );
            }
          }
        }
      }

      // Pending -> Settled refresh (see wise-sync for full rationale).
      try {
        const skippedIds = [...batchById.keys()];
        let settledUpdated = 0;
        for (let i = 0; i < skippedIds.length; i += 200) {
          const chunk = skippedIds.slice(i, i + 200);
          const { data: pendingRows } = await supabaseAdmin
            .from("transactions")
            .select("id, external_id, description, amount")
            .in("external_id", chunk)
            .eq("user_id", userId)
            .ilike("description", "%pending%");
          for (const row of (pendingRows || []) as Array<{ id: string; external_id: string; description: string; amount: number }>) {
            const fresh = batchById.get(row.external_id);
            if (!fresh) continue;
            const stillPending = /pending/i.test(fresh.description);
            const changed = fresh.description !== row.description || Number(fresh.amount) !== Number(row.amount);
            if (stillPending || !changed) continue;
            const { error: updErr } = await supabaseAdmin
              .from("transactions")
              .update({
                description: fresh.description,
                merchant: fresh.merchant,
                amount: fresh.amount,
                amount_usd: fresh.amount_usd,
                date: fresh.date,
              })
              .eq("id", row.id);
            if (!updErr) settledUpdated += 1;
          }
        }
        if (settledUpdated > 0) diagnostics.push(`${settledUpdated} pending liquidados.`);
      } catch (e: any) {
        diagnostics.push(`Settle pass falló: ${e.message}`);
      }

      // Auto-create merchants from this batch.
      try {
        if (wantedMerchants.size > 0) {
          const { data: existingM } = await supabaseAdmin
            .from("merchants")
            .select("name")
            .eq("user_id", userId);
          const have = new Set(
            ((existingM || []) as Array<{ name: string }>).map((m) => (m.name || "").toLowerCase()),
          );
          const toInsert = [...wantedMerchants.values()]
            .filter((w) => !have.has(w.name.toLowerCase()))
            .map((w) => ({ user_id: userId, name: w.name, default_category_id: w.category_id }));
          if (toInsert.length > 0) {
            await supabaseAdmin.from("merchants").insert(toInsert);
            diagnostics.push(`${toInsert.length} merchants nuevos.`);
          }
        }
      } catch (e: any) {
        diagnostics.push(`Merchant sync falló: ${e.message}`);
      }

      await supabaseAdmin
        .from("user_settings")
        .update({ wise_last_sync: new Date().toISOString() })
        .eq("user_id", userId);

      results[userId] = { ok: true, imported: importedTotal, skipped: skippedTotal, diagnostics };
    } catch (e: any) {
      results[userId] = { ok: false, error: e.message || String(e), diagnostics };
    }
  }

  return json({ ok: true, results });
});
