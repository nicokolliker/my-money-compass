import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const WISE_BASE = "https://api.wise.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function wiseFetch(path: string, token: string, action: string) {
  let res: Response;
  try {
    res = await fetch(`${WISE_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e: any) {
    throw new Error(
      `No se pudo contactar a Wise (${action}): ${e?.message || String(e)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const snippet = text.slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Wise rechazó el token (${res.status}). Verificá que sea un API token válido. ${snippet}`,
      );
    }
    throw new Error(`Wise API ${action} falló (${res.status}): ${snippet}`);
  }
  return res.json();
}

function cleanWiseText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(raw: string) {
  const compact = raw.replace(/[\s']/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const decimal = lastComma > lastDot ? "," : ".";
  const normalized = compact
    .replace(new RegExp(`\\${decimal === "," ? "." : ","}`, "g"), "")
    .replace(decimal, ".");
  return Number(normalized);
}

function amountFromActivity(activity: any, currency: string) {
  const currencyRe = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fields = [activity.primaryAmount, activity.secondaryAmount].map(cleanWiseText);
  for (const field of fields) {
    const after = field.match(new RegExp(`([+-]?\\d[\\d.,\\s']*)\\s*${currencyRe}\\b`, "i"));
    const before = field.match(new RegExp(`\\b${currencyRe}\\s*([+-]?\\d[\\d.,\\s']*)`, "i"));
    const match = after || before;
    if (!match) continue;
    const parsed = parseMoney(match[1]);
    if (!Number.isFinite(parsed)) continue;

    const text = `${activity.type || ""} ${activity.title || ""} ${activity.description || ""}`.toLowerCase();
    if (parsed < 0) return parsed;
    if (/refund|cashback|interest|received|deposit|top\s*up|added|incoming|reversal|reembolso|recib/.test(text)) return parsed;
    if (/card_payment|cash_withdrawal|direct_debit|fee|sent|send|paid|spent|withdraw|deduct|charge|payment|outgoing|enviado|pagad/.test(text)) return -Math.abs(parsed);
    return parsed;
  }
  return null;
}

async function fetchActivitiesFallback(
  profileId: string | number,
  token: string,
  currency: string,
  since: string,
  until: string,
) {
  const txs: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ since, until, size: "100", status: "COMPLETED" });
    if (cursor) params.set("nextCursor", cursor);
    const payload = await wiseFetch(
      `/v1/profiles/${profileId}/activities?${params.toString()}`,
      token,
      `activities ${since.slice(0, 10)}→${until.slice(0, 10)}`,
    );

    for (const activity of payload?.activities ?? []) {
      const amount = amountFromActivity(activity, currency);
      const date = activity.createdOn || activity.updatedOn;
      if (amount === null || !date) continue;
      const description = cleanWiseText(
        [activity.title, activity.description].filter(Boolean).join(" — "),
      ) || "Wise";
      txs.push({
        id: `activity-${activity.id || activity.resource?.id || `${date}-${amount}`}`,
        referenceNumber: `activity-${activity.id || activity.resource?.id || `${date}-${amount}`}`,
        date,
        amount: { value: amount },
        details: { description, type: activity.type || activity.resource?.type || "ACTIVITY" },
      });
    }

    cursor = payload?.cursor ?? null;
    if (!cursor) break;
  }
  return txs;
}

async function getAuthenticatedUserId(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
) {
  const jwt = authHeader.replace("Bearer ", "").trim();
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const auth = userClient.auth as any;

  if (typeof auth.getClaims === "function") {
    const { data, error } = await auth.getClaims(jwt);
    if (!error && data?.claims?.sub) return data.claims.sub as string;
    console.error("wise-sync getClaims failed:", error?.message || "missing claims");
  }

  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data?.user?.id) {
    console.error("wise-sync getUser failed:", error?.message || "missing user");
    return null;
  }
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "No autenticado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("wise-sync missing backend environment variables");
      return json({ error: "Configuración del backend incompleta" }, 500);
    }

    const userId = await getAuthenticatedUserId(supabaseUrl, anonKey, authHeader);
    if (!userId) {
      return json({ error: "Sesión inválida" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const action = body.action as string;
    if (!action) return json({ error: "Falta 'action'" }, 400);

    // Resolve API token: body → stored user_settings
    let token: string | undefined = body.apiToken;
    if (!token) {
      const { data: setting } = await admin
        .from("user_settings")
        .select("wise_token")
        .eq("user_id", userId)
        .maybeSingle();
      token = setting?.wise_token ?? undefined;
    }
    if (!token) {
      return json(
        { error: "Wise API token requerido. Pegalo arriba para conectar." },
        400,
      );
    }

    // Persist token if it came from the body
    if (body.apiToken) {
      await admin
        .from("user_settings")
        .upsert(
          { user_id: userId, wise_token: body.apiToken },
          { onConflict: "user_id" },
        );
    }

    if (action === "get-profiles") {
      const profiles = await wiseFetch("/v2/profiles", token, "get-profiles");
      return json({ profiles });
    }

    if (action === "get-balances") {
      const profileId = body.profileId;
      if (!profileId) return json({ error: "Falta profileId" }, 400);
      const balances = await wiseFetch(
        `/v4/profiles/${profileId}/balances?types=STANDARD`,
        token,
        "get-balances",
      );
      return json({ balances });
    }

    if (action === "sync-transactions") {
      const { profileId, balanceId, accountId, currency } = body;
      if (!profileId || !balanceId || !accountId || !currency) {
        return json(
          { error: "Faltan parámetros (profileId, balanceId, accountId, currency)" },
          400,
        );
      }

      const diagnostics: string[] = [];

      // Official balance
      let officialBalance: number | null = null;
      try {
        const bals = await wiseFetch(
          `/v4/profiles/${profileId}/balances?types=STANDARD`,
          token,
          "get-balances",
        );
        const match = (bals as any[]).find((b) => b.id === balanceId);
        officialBalance = match?.amount?.value ?? null;
      } catch (e: any) {
        diagnostics.push(`No se pudo leer balance oficial: ${e.message}`);
      }

      // Statement — Wise caps each request at ~469 days. Chunk ~2 years
      // into 450-day windows walking backwards from now.
      const WINDOW_MS = 450 * 24 * 60 * 60 * 1000;
      const totalMs = 2 * 365 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let txs: any[] = [];
      let statementOk = false;
      let windowEnd = now;
      const earliest = now - totalMs;
      while (windowEnd > earliest) {
        const windowStart = Math.max(windowEnd - WINDOW_MS, earliest);
        const iStart = new Date(windowStart).toISOString();
        const iEnd = new Date(windowEnd).toISOString();
        try {
          const statement = await wiseFetch(
            `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json` +
              `?currency=${encodeURIComponent(currency)}` +
              `&intervalStart=${encodeURIComponent(iStart)}` +
              `&intervalEnd=${encodeURIComponent(iEnd)}` +
              `&type=COMPACT`,
            token,
            `balance-statement ${iStart.slice(0, 10)}→${iEnd.slice(0, 10)}`,
          );
          const chunk = statement?.transactions ?? [];
          txs = txs.concat(chunk);
          statementOk = true;
        } catch (e: any) {
          diagnostics.push(`Statement falló (${iStart.slice(0, 10)}→${iEnd.slice(0, 10)}): ${e.message}`);
        }
        windowEnd = windowStart;
      }
      if (!statementOk) {
        return json({
          error: `Wise rechazó el statement. ${diagnostics.join(" | ")}`,
          diagnostics,
          status: "failed",
          imported: 0,
          skipped: 0,
          total_fetched: 0,
        });
      }

      // FX rate
      let fxRate = 1;
      if (currency !== "USD") {
        const { data: rateRow } = await admin
          .from("fx_rates")
          .select("rate")
          .eq("from_currency", currency)
          .eq("to_currency", "USD")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        fxRate = rateRow?.rate ?? (currency === "EUR" ? 1.08 : 1);
      }

      let imported = 0;
      let skipped = 0;
      let sumImported = 0;
      let minDate: string | null = null;
      let maxDate: string | null = null;

      for (const tx of txs) {
        const ref =
          tx.referenceNumber || tx.id || `${tx.date}-${tx.amount?.value}`;
        const external_id = `wise-${ref}`;
        const amount = Number(tx.amount?.value ?? 0);
        const date = (tx.date || "").split("T")[0];
        const description =
          tx.details?.description ||
          tx.details?.merchant?.name ||
          tx.details?.type ||
          "Wise";
        let type: "income" | "expense" | "transfer" =
          amount >= 0 ? "income" : "expense";
        if ((tx.details?.type || "").toUpperCase() === "TRANSFER") {
          type = "transfer";
        }

        const amountUsd = amount * fxRate;

        const { error: insErr, data: insData } = await admin
          .from("transactions")
          .upsert(
            {
              user_id: userId,
              account_id: accountId,
              date,
              description,
              amount,
              currency,
              fx_rate: fxRate,
              amount_usd: amountUsd,
              type,
              external_id,
            },
            { onConflict: "external_id", ignoreDuplicates: true },
          )
          .select("id");

        if (insErr) {
          diagnostics.push(`Upsert error ${external_id}: ${insErr.message}`);
          continue;
        }
        if (insData && insData.length > 0) {
          imported += 1;
          sumImported += amount;
        } else {
          skipped += 1;
        }
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }

      // Update account official balance
      await admin
        .from("accounts")
        .update({
          official_balance: officialBalance,
          official_balance_updated_at: new Date().toISOString(),
        })
        .eq("id", accountId)
        .eq("user_id", userId);

      const reconciled =
        officialBalance !== null && txs.length > 0
          ? Math.abs((sumImported) - officialBalance) < 0.5
          : null;

      const status: "success" | "partial" | "failed" =
        diagnostics.length === 0
          ? "success"
          : txs.length > 0
          ? "partial"
          : "failed";

      await admin.from("wise_sync_log").insert({
        user_id: userId,
        profile_id: String(profileId),
        account_id: accountId,
        status,
        transactions_imported: imported,
        last_transaction_date: maxDate,
        error_message: diagnostics.length > 0 ? diagnostics.join(" | ") : null,
      });

      await admin
        .from("user_settings")
        .upsert(
          {
            user_id: userId,
            wise_profile_id: String(profileId),
            wise_last_sync: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      return json({
        imported,
        skipped,
        total_fetched: txs.length,
        official_balance: officialBalance,
        sum_imported: sumImported,
        tx_count: txs.length,
        date_range: { start: minDate, end: maxDate },
        reconciled,
        status,
        diagnostics,
      });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e: any) {
    console.error("wise-sync error:", e?.message, e?.stack);
    return json(
      { error: e?.message || "Error interno en wise-sync" },
      500,
    );
  }
});
