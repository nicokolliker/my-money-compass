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
      signal: AbortSignal.timeout(12000),
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
      throw new Error(`HTTP ${res.status} en ${action}. Body: ${snippet || '(vacío)'}`);
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
  // Wise's Activities API always formats numbers US-style: comma = thousands
  // separator, period = decimal separator — never the reverse. The previous
  // "infer from whichever separator appears last" heuristic broke on
  // whole-thousand amounts with no decimal point (e.g. "6,000" has only a
  // comma, so it got treated AS the decimal point → parsed as 6.000 = 6,
  // silently shrinking deposits like Deel's $6,000 payroll down to $6).
  const compact = raw.replace(/[\s']/g, "").replace(/,/g, "");
  return Number(compact);
}

function amountFromActivity(activity: any, currency: string) {
  const currencyRe = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rawFields = [activity.primaryAmount, activity.secondaryAmount];
  const fields = rawFields.map(cleanWiseText);
  for (let fi = 0; fi < fields.length; fi += 1) {
    const field = fields[fi];
    if (!field) continue;
    const raw = String(rawFields[fi] || "");
    const after = field.match(new RegExp(`([+-]?\\d[\\d.,\\s']*)\\s*${currencyRe}\\b`, "i"));
    const before = field.match(new RegExp(`\\b${currencyRe}\\s*([+-]?\\d[\\d.,\\s']*)`, "i"));
    // Fallback: Wise sometimes shows a deposit's own-currency amount with NO
    // currency code at all (e.g. "+ 6,000.00" instead of "+ 6,000.00 USD"),
    // since the Activities feed is already scoped to `?currency=<currency>`
    // server-side. If the currency-anchored patterns fail, trust a bare
    // signed number as belonging to the requested currency.
    const bare = !after && !before ? field.match(/([+-]\s?\d[\d.,\s']*)/) : null;
    const match = after || before || bare;
    if (!match) continue;
    const parsed = parseMoney(match[1]);
    if (!Number.isFinite(parsed)) continue;

    // Wise wraps amounts in <positive>/<negative> tags — the most reliable
    // sign signal, far better than guessing from title words like "sent"
    // (which also appears in INCOMING titles: "Deel sent you 4,000 USD").
    if (/<positive>/i.test(raw)) return Math.abs(parsed);
    if (/<negative>/i.test(raw)) return -Math.abs(parsed);

    const rawType = (activity.type || activity.resource?.type || "").toLowerCase();
    const text = `${rawType} ${activity.title || ""} ${activity.description || ""}`.toLowerCase();
    if (parsed < 0) return parsed;
    if (/^(deposit|money_added|balance_credit|top_up|topup)$/.test(rawType)) return Math.abs(parsed);
    if (/refund|cashback|interest|received|deposit|top\s*up|added|money added|incoming|reversal|reembolso|recib|sent you/.test(text)) return parsed;
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
  const unmatched: Array<{ type: string | null; title: string | null; primaryAmount: string | null }> = [];
  const rawSample: Array<Record<string, unknown>> = [];
  const diagnostics_target: any[] = [];
  let cursor: string | null = null;
  // Paginate until Wise stops returning a cursor (safety cap: 60 pages =
  // 3000 activities) — the user wants the FULL history, not a window.
  for (let page = 0; page < 60; page += 1) {
    // No status filter: incoming transfers can sit IN_PROGRESS for days in
    // Wise while already visible in the user's app. Cancelled/failed are
    // excluded per-activity below.
    const params = new URLSearchParams({ since, until, size: "50" });
    if (cursor) params.set("nextCursor", cursor);
    const payload = await wiseFetch(
      `/v1/profiles/${profileId}/activities?${params.toString()}`,
      token,
      `activities ${since.slice(0, 10)}→${until.slice(0, 10)}`,
    );

    for (const activity of payload?.activities ?? []) {
      const searchable = `${activity.title || ""} ${activity.description || ""}`.toLowerCase();
      if (/deel|dental/.test(searchable)) {
        diagnostics_target.push(activity);
      }
      if (rawSample.length < 5) {
        rawSample.push({
          type: activity.type || activity.resource?.type || null,
          status: activity.status || null,
          title: String(activity.title || "").slice(0, 60),
          primaryAmount: String(activity.primaryAmount || "").slice(0, 50),
          date: activity.createdOn || activity.updatedOn || null,
        });
      }
      const st = (activity.status || "").toUpperCase();
      if (st === "CANCELLED" || st === "FAILED" || st === "DECLINED") continue;
      const amount = amountFromActivity(activity, currency);
      const date = activity.createdOn || activity.updatedOn;
      if (amount === null || !date) {
        unmatched.push({
          type: activity.type || activity.resource?.type || null,
          title: activity.title || null,
          primaryAmount: activity.primaryAmount || null,
        });
        continue;
      }
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
  return { txs, unmatched, rawSample, diagnostics_target };
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
          if (!diagnostics.some((d) => d.startsWith("Statement error body:"))) {
            diagnostics.push(`Statement error body: ${e.message}`);
          }
        }
        windowEnd = windowStart;
      }

      if (!statementOk) {
        diagnostics.push("Wise bloqueó balance-statements; intentando fallback con Activities API.");
        try {
          // Full 2-year range, same as the (blocked) statement endpoint —
          // the fallback is the only data source, so it must cover everything.
          const fallbackSince = new Date(now - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
          const fb = await fetchActivitiesFallback(
            profileId,
            token,
            currency,
            fallbackSince,
            new Date(now).toISOString(),
          );
          txs = fb.txs;
          statementOk = txs.length > 0;
          const dates = txs.map((t: any) => (t.date || "").slice(0, 10)).filter(Boolean).sort();
          diagnostics.push(
            `Activities API devolvió ${txs.length} movimientos para ${currency}` +
              (dates.length ? ` (rango ${dates[0]} → ${dates[dates.length - 1]}).` : "."),
          );
          diagnostics.push(`Muestra cruda (${currency}): ${JSON.stringify(fb.rawSample)}`);
          if (fb.diagnostics_target.length > 0) {
            diagnostics.push(`RAW Deel/Dental (${currency}): ${JSON.stringify(fb.diagnostics_target)}`);
          }
          if (fb.unmatched.length > 0) {
            // Surface the raw shape of anything we couldn't parse an amount
            // from — this is exactly what we need to see if a real deposit
            // (e.g. from Deel) is silently being dropped by amountFromActivity.
            diagnostics.push(
              `${fb.unmatched.length} actividades sin monto reconocido: ` +
                JSON.stringify(fb.unmatched.slice(0, 8)),
            );
          }
        } catch (e: any) {
          diagnostics.push(`Activities API falló: ${e.message}`);
        }
      }

      if (!statementOk) {
        return json({
          error: `Wise no permitió leer transacciones. ${diagnostics.join(" | ")}`,
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

      // Fetch user's rules once for auto-categorization
      const { data: rulesData } = await admin
        .from("rules")
        .select("keyword, match_field, category_id")
        .eq("user_id", userId);
      const rules: Array<{ keyword: string; match_field: string | null; category_id: string | null }> = (rulesData as any) || [];
      const matchRule = (description: string) => {
        const desc = (description || "").toLowerCase();
        for (const r of rules) {
          if (!r.keyword || !r.category_id) continue;
          if (desc.includes(r.keyword.toLowerCase().trim())) return r.category_id;
        }
        return null;
      };

      // Digital category + subcategory map for inferring subcategory_id
      const { data: digitalCatRow } = await admin
        .from("categories")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", "digital")
        .maybeSingle();
      const digitalCategoryId: string | null = (digitalCatRow as any)?.id ?? null;
      const digitalSubByLabel: Record<string, string> = {};
      if (digitalCategoryId) {
        const { data: subs } = await admin
          .from("subcategories")
          .select("id, name")
          .eq("category_id", digitalCategoryId);
        for (const s of (subs || []) as Array<{ id: string; name: string }>) {
          digitalSubByLabel[(s.name || "").toLowerCase()] = s.id;
        }
      }
      // Keep in sync with src/lib/digitalSubtypes.ts (single source of truth on the client).
      const DIGITAL_NAME_OVERRIDES: Record<string, string[]> = {
        "Otros": ["amazon prime", "oura"],
      };
      const DIGITAL_NAME_MAP: Record<string, string[]> = {
        "IA": ["chatgpt", "claude", "gemini", "perplexity", "copilot", "openai", "google ai", "midjourney", "runway", "gamma", "notebooklm"],
        "Entretenimiento": ["netflix", "spotify", "youtube", "disney", "hbo", "apple tv", "paramount", "crunchyroll", "blinkist"],
        "Creatividad & Productividad": ["adobe", "figma", "canva", "notion", "loom", "grammarly", "icloud", "apple one", "lovable", "granola"],
        "Marketplace & Movilidad": ["uber", "didi", "rappi", "pedidos ya", "glovo", "cabify", "amazon", "mercadolibre", "meli", "aliexpress", "ebay"],
      };
      const resolveSubcat = (categoryId: string | null, signal: string): string | null => {
        if (!categoryId || !digitalCategoryId || categoryId !== digitalCategoryId) return null;
        const lower = (signal || "").toLowerCase();
        for (const [label, patterns] of Object.entries(DIGITAL_NAME_OVERRIDES)) {
          if (patterns.some(p => lower.includes(p))) {
            return digitalSubByLabel[label.toLowerCase()] || null;
          }
        }
        for (const [label, patterns] of Object.entries(DIGITAL_NAME_MAP)) {
          if (patterns.some(p => lower.includes(p))) {
            return digitalSubByLabel[label.toLowerCase()] || null;
          }
        }
        // Fallback: anything Digital without a specific match goes to "Otros"
        return digitalSubByLabel["otros"] || null;
      };

      // Occurrence counter: if Wise omits referenceNumber, the fallback
      // (date+amount) can collide for identical purchases on the same day.
      // First occurrence keeps the legacy format so existing rows still dedup;
      // subsequent ones get a -2/-3 suffix and finally get imported.
      const seenIds = new Map<string, number>();
      // Fresh data per external_id for the pending->settled pass below.
      const batchById = new Map<string, { description: string; merchant: string | null; amount: number; amount_usd: number; date: string; type: string }>();
      // Fresh data keyed by date+description for the date/description repair
      // pass below — needed because rows imported months ago (when the
      // now-blocked statement.json endpoint was still working) used a bare
      // reference-number external_id, while today's Activities fallback
      // constructs a different "activity-<id>" one. That mismatch means
      // external_id-based matching NEVER finds these older rows, so any
      // sign/type/amount correction silently no-ops for exactly the rows
      // that most need it. Date+description is a stable identifier that
      // matches regardless of which external_id scheme produced the row —
      // BUT it can collide when the same merchant appears more than once
      // on the same day (e.g. two OXXO purchases). ambiguousDD tracks keys
      // seen more than once so the repair pass skips them entirely rather
      // than risk applying one transaction's amount to a different one.
      const byDateDesc = new Map<string, { amount: number; amount_usd: number; type: string; description: string; merchant: string | null }>();
      const ddCount = new Map<string, number>();

      for (const tx of txs) {
        const ref =
          tx.referenceNumber || tx.id || `${tx.date}-${tx.amount?.value}`;
        const baseId = `wise-${ref}`;
        const occ = (seenIds.get(baseId) || 0) + 1;
        seenIds.set(baseId, occ);
        const external_id = occ === 1 ? baseId : `${baseId}-${occ}`;
        const amount = Number(tx.amount?.value ?? 0);
        const date = (tx.date || "").split("T")[0];
        const merchantName: string | null = tx.details?.merchant?.name || null;
        const description =
          tx.details?.description ||
          merchantName ||
          tx.details?.type ||
          "Wise";
        // NOTE: Wise's activity/statement 'type' field says "TRANSFER" for
        // ANY cross-border wire — including third-party income like a Deel
        // payroll deposit, not just self-transfers between the user's own
        // balances. Overriding to type='transfer' here hid real income.
        // Amount sign is the correct, authoritative signal.
        let type: "income" | "expense" | "transfer" = amount >= 0 ? "income" : "expense";
        const category_id = matchRule(`${merchantName || ""} ${description}`);
        const subcategory_id = resolveSubcat(category_id, `${merchantName || ""} ${description}`);

        // Self-transfer to the user's own ARQ/DolarApp account: this is
        // money moving pockets, not real spending. Narrow, description-based
        // detection (NOT the generic Wise 'TRANSFER' flag, which also covers
        // third-party payments like Deel and would wrongly hide real income/
        // expense if reused here). Excluded from Budget via type='transfer';
        // reconciled later against the ARQ statement import.
        const isArqOutgoing = amount < 0 && /dolarapp|arq\b/i.test(description);
        if (isArqOutgoing) type = "transfer";

        const amountUsd = amount * fxRate;

        const ddKey = `${date}::${description}`;
        ddCount.set(ddKey, (ddCount.get(ddKey) || 0) + 1);
        byDateDesc.set(ddKey, { amount, amount_usd: amountUsd, type, description, merchant: merchantName });

        const { error: insErr, data: insData } = await admin
          .from("transactions")
          .upsert(
            {
              user_id: userId,
              account_id: accountId,
              date,
              description,
              merchant: merchantName,
              amount,
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
          continue;
        }
        let txRowId: string | null = null;
        if (insData && insData.length > 0) {
          imported += 1;
          sumImported += amount;
          txRowId = insData[0].id;
        } else {
          skipped += 1;
          batchById.set(external_id, { description, merchant: merchantName, amount, amount_usd: amountUsd, date, type });
        }

        if (isArqOutgoing) {
          if (!txRowId) {
            const { data: existingRow } = await admin
              .from("transactions")
              .select("id")
              .eq("external_id", external_id)
              .eq("user_id", userId)
              .maybeSingle();
            txRowId = existingRow?.id ?? null;
          }
          if (txRowId) {
            await admin.from("arq_reconciliations").upsert(
              {
                user_id: userId,
                wise_tx_id: txRowId,
                wise_amount_usd: Math.abs(amountUsd),
                wise_date: date,
                wise_description: description,
                status: "pending",
              },
              { onConflict: "wise_tx_id", ignoreDuplicates: true },
            );
          }
        }
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }

      // Pending -> Settled: Wise keeps the same referenceNumber when a card
      // charge settles, but updates description (drops ' — Pending') and may
      // adjust the amount. ignoreDuplicates freezes the row at its pending
      // version forever — so re-check existing rows that still look pending
      // and refresh their NEUTRAL fields only (never category/subtype, which
      // may be user-set).
      let settledUpdated = 0;
      let signFixed = 0;
      let typeFixed = 0;
      let amountFixed = 0;
      try {
        const skippedIds = [...batchById.keys()];
        for (let i = 0; i < skippedIds.length; i += 200) {
          const chunk = skippedIds.slice(i, i + 200);
          const { data: existingRows } = await admin
            .from("transactions")
            .select("id, external_id, description, amount, type")
            .in("external_id", chunk)
            .eq("user_id", userId);
          for (const row of (existingRows || []) as Array<{ id: string; external_id: string; description: string; amount: number; type: string }>) {
            const fresh = batchById.get(row.external_id);
            if (!fresh) continue;

            const rowPending = /pending/i.test(row.description || "");
            const freshPending = /pending/i.test(fresh.description);
            const settleCase = rowPending && !freshPending;

            // Sign correction: earlier parser versions classified some
            // incoming deposits as negative ("Deel sent you..." → 'sent').
            // The fresh parse is authoritative — fix amount/type in place.
            const signCase =
              Math.sign(Number(fresh.amount)) !== Math.sign(Number(row.amount)) &&
              Number(fresh.amount) !== 0 && Number(row.amount) !== 0;

            // Rows stuck as type='transfer' from the old blanket TRANSFER
            // override (e.g. a Deel deposit correctly signed +, but
            // classified as 'transfer' instead of 'income') — reclassify
            // using today's amount-sign-is-authoritative rule.
            // Any direction: transfer->income/expense (Deel-style third-party
            // payments wrongly hidden) OR income/expense->transfer (ARQ/
            // DolarApp self-transfers wrongly counted as real spending).
            const typeCase = fresh.type !== row.type;

            // Magnitude fix: the old parseMoney bug silently divided
            // whole-thousand amounts by 1000 (e.g. Deel's $6,000 deposit
            // got stored as $6). Any real difference vs. the freshly
            // (correctly) parsed amount gets corrected.
            const amountCase = Math.abs(Number(fresh.amount) - Number(row.amount)) > 0.005;

            if (!settleCase && !signCase && !typeCase && !amountCase) continue;

            const { error: updErr } = await admin
              .from("transactions")
              .update({
                description: fresh.description,
                merchant: fresh.merchant,
                amount: fresh.amount,
                amount_usd: fresh.amount_usd,
                date: fresh.date,
                type: fresh.type,
              })
              .eq("id", row.id);
            if (!updErr) {
              if (settleCase) settledUpdated += 1;
              if (signCase) signFixed += 1;
              if (typeCase) typeFixed += 1;
              if (amountCase) amountFixed += 1;
            }
          }
        }
        if (settledUpdated > 0) {
          diagnostics.push(`${settledUpdated} transacciones pending liquidadas (actualizadas).`);
        }
        if (signFixed > 0) {
          diagnostics.push(`${signFixed} transacciones con signo corregido.`);
        }
        if (typeFixed > 0) {
          diagnostics.push(`${typeFixed} transacciones reclasificadas de 'transfer' a income/expense.`);
        }
        if (amountFixed > 0) {
          diagnostics.push(`${amountFixed} transacciones con monto corregido (bug de parseo de miles).`);
        }
      } catch (e: any) {
        diagnostics.push(`Settle pass falló: ${e.message}`);
      }

      // Date+description repair pass — catches rows the external_id-based
      // pass above can never reach (old reference-number scheme vs today's
      // Activities-fallback scheme). Scoped to this account+currency and
      // the exact dates seen in this batch, so it never touches unrelated
      // transactions.
      let ddFixed = 0;
      let ddSkippedAmbiguous = 0;
      try {
        const dates = [...new Set([...byDateDesc.keys()].map((k) => k.split("::")[0]))];
        for (let i = 0; i < dates.length; i += 50) {
          const chunk = dates.slice(i, i + 50);
          const { data: rows } = await admin
            .from("transactions")
            .select("id, description, amount, amount_usd, type, date")
            .eq("user_id", userId)
            .eq("account_id", accountId)
            .in("date", chunk);

          // Group existing rows by the same key to detect same-day
          // same-description duplicates on the DB side too.
          const existingByKey = new Map<string, Array<{ id: string; description: string; amount: number; amount_usd: number; type: string; date: string }>>();
          for (const row of (rows || []) as Array<{ id: string; description: string; amount: number; amount_usd: number; type: string; date: string }>) {
            const key = `${row.date}::${row.description}`;
            const arr = existingByKey.get(key) || [];
            arr.push(row);
            existingByKey.set(key, arr);
          }

          for (const [key, group] of existingByKey) {
            const fresh = byDateDesc.get(key);
            if (!fresh) continue;
            // Skip entirely if EITHER side is ambiguous (same merchant more
            // than once that day) — we cannot safely tell which is which.
            if ((ddCount.get(key) || 0) > 1 || group.length > 1) {
              ddSkippedAmbiguous += 1;
              continue;
            }
            const row = group[0];
            const amountDiff = Math.abs(Number(fresh.amount) - Number(row.amount)) > 0.005;
            // Any direction: transfer<->income/expense (Deel-style vs
            // ARQ-self-transfer-style corrections).
            const typeDiff = fresh.type !== row.type;
            const signDiff =
              Math.sign(Number(fresh.amount)) !== Math.sign(Number(row.amount)) &&
              Number(fresh.amount) !== 0 && Number(row.amount) !== 0;
            if (!amountDiff && !typeDiff && !signDiff) continue;
            const { error: updErr } = await admin
              .from("transactions")
              .update({
                amount: fresh.amount,
                amount_usd: fresh.amount_usd,
                type: fresh.type,
                merchant: fresh.merchant,
              })
              .eq("id", row.id);
            if (!updErr) {
              ddFixed += 1;
              // Newly reclassified as an ARQ self-transfer: create the
              // pending reconciliation too, so it shows up for the user
              // exactly like a fresh one would.
              if (fresh.type === "transfer" && /dolarapp|arq\b/i.test(fresh.description)) {
                await admin.from("arq_reconciliations").upsert(
                  {
                    user_id: userId,
                    wise_tx_id: row.id,
                    wise_amount_usd: Math.abs(Number(fresh.amount_usd)),
                    wise_date: row.date,
                    wise_description: fresh.description,
                    status: "pending",
                  },
                  { onConflict: "wise_tx_id", ignoreDuplicates: true },
                );
              }
            }
          }
        }
        if (ddFixed > 0) {
          diagnostics.push(`${ddFixed} transacciones reparadas por fecha+descripción (bug histórico de external_id).`);
        }
        if (ddSkippedAmbiguous > 0) {
          diagnostics.push(`${ddSkippedAmbiguous} claves fecha+descripción ambiguas (mismo comercio repetido el mismo día) — omitidas por seguridad.`);
        }
      } catch (e: any) {
        diagnostics.push(`Repair pass (date+desc) falló: ${e.message}`);
      }

      // Auto-create merchants from this batch (non-fatal on failure)
      try {
        // Keep in sync with normalizeMerchantName in src/lib/merchantSync.ts
        const STATE_SUFFIX_RE = /\s*[—–-]\s*(pending|withdrawn|moved|reversed|cancelled|declined)\s*$/i;
        const BLOCKLIST_RE = /^(to\s+[a-z]{3}|liquidaci[oó]n\b.*|transferencia\b.*|balance cashback)$/i;
        const normalizeName = (raw: string): string | null => {
          let n = (raw || "").trim().replace(/\s+/g, " ").replace(STATE_SUFFIX_RE, "").trim();
          if (n.length < 2 || BLOCKLIST_RE.test(n)) return null;
          return n;
        };
        const wanted = new Map<string, { name: string; category_id: string | null }>();
        for (const tx of txs) {
          const name = normalizeName(tx.details?.merchant?.name || "");
          if (!name) continue;
          const key = name.toLowerCase();
          if (!wanted.has(key)) {
            const catId = matchRule(name);
            wanted.set(key, { name, category_id: catId });
          }
        }
        if (wanted.size > 0) {
          const { data: existingM } = await admin
            .from("merchants")
            .select("name")
            .eq("user_id", userId);
          const have = new Set(
            ((existingM || []) as Array<{ name: string }>).map((m) =>
              (m.name || "").toLowerCase(),
            ),
          );
          const toInsert = [...wanted.values()]
            .filter((w) => !have.has(w.name.toLowerCase()))
            .map((w) => ({
              user_id: userId,
              name: w.name,
              default_category_id: w.category_id,
            }));
          if (toInsert.length > 0) {
            await admin.from("merchants").insert(toInsert);
            diagnostics.push(`${toInsert.length} merchants nuevos creados.`);
          }
        }
      } catch (e: any) {
        diagnostics.push(`Merchant sync falló: ${e.message}`);
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

      // Ground-truth check: query the DB directly for anything matching
      // "Deel" or "Dental", bypassing all external_id/matching logic. This
      // shows exactly what's stored right now, no inference.
      try {
        const { data: deelRows } = await admin
          .from("transactions")
          .select("id, description, merchant, amount, amount_usd, type, currency, date, category_id, account_id")
          .eq("user_id", userId)
          .or("description.ilike.%deel%,description.ilike.%dental%,merchant.ilike.%deel%,merchant.ilike.%dental%");
        diagnostics.push(`DB actual (Deel/Dental): ${JSON.stringify(deelRows || [])}`);
      } catch (e: any) {
        diagnostics.push(`DB check falló: ${e.message}`);
      }

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
