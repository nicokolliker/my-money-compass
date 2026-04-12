import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WISE_API = "https://api.wise.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const WISE_API_TOKEN = Deno.env.get("WISE_API_TOKEN");
  if (!WISE_API_TOKEN) {
    return json({ error: "WISE_API_TOKEN not configured" }, 500);
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
      const res = await wiseGet(
        `/v4/profiles/${profileId}/balances?types=STANDARD`,
        WISE_API_TOKEN
      );
      return json({ balances: res });
    }

    if (action === "sync-transactions") {
      const { profileId, balanceId, accountId, currency } = body;
      const diagnostics: string[] = [];

      // 1. Get official balance from Wise API
      diagnostics.push(`Fetching balances for profile ${profileId}`);
      const balances = await wiseGet(
        `/v4/profiles/${profileId}/balances?types=STANDARD`,
        WISE_API_TOKEN
      );
      const matchedBalance = balances.find(
        (b: any) => b.id === balanceId || b.currency === currency
      );
      const officialBalance = matchedBalance?.amount?.value ?? null;
      diagnostics.push(`Official balance for ${currency}: ${officialBalance}`);

      // Store official balance on the account
      if (officialBalance !== null) {
        await supabase
          .from("accounts")
          .update({
            official_balance: officialBalance,
            official_balance_updated_at: new Date().toISOString(),
          })
          .eq("id", accountId);
      }

      // 2. Try statement API first, fall back to activities API
      let allTransactions: any[] = [];
      let fetchErrors: string[] = [];

      // Try balance statement first
      try {
        const stmtResult = await fetchStatementTransactions(
          profileId, balanceId, currency, WISE_API_TOKEN
        );
        allTransactions = stmtResult.transactions;
        fetchErrors = stmtResult.errors;
        diagnostics.push(`Statement API: ${allTransactions.length} transactions, ${fetchErrors.length} errors`);
      } catch (e) {
        diagnostics.push(`Statement API failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      // If statement API failed (403 = missing scope), use activities API
      if (allTransactions.length === 0 && fetchErrors.some(e => e.includes("403"))) {
        diagnostics.push("Falling back to Activities API...");
        try {
          const actResult = await fetchActivitiesTransactions(
            profileId, currency, WISE_API_TOKEN
          );
          allTransactions = actResult.transactions;
          fetchErrors = actResult.errors;
          diagnostics.push(`Activities API: ${allTransactions.length} transactions`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          diagnostics.push(`Activities API failed: ${msg}`);
          fetchErrors.push(msg);
        }
      }

      diagnostics.push(`Total fetched: ${allTransactions.length}`);

      // 4. Get existing external_ids to deduplicate
      const { data: existingTxs } = await supabase
        .from("transactions")
        .select("external_id")
        .eq("account_id", accountId)
        .not("external_id", "is", null);

      const existingIds = new Set(
        (existingTxs || []).map((t: any) => t.external_id)
      );

      // 5. Get rules for auto-categorization
      const rules = await getRules(supabase);

      // 6. Import new transactions
      let imported = 0;
      let skipped = 0;
      const batch: any[] = [];

      for (const tx of allTransactions) {
        const externalId = buildExternalId(tx);
        if (existingIds.has(externalId)) {
          skipped++;
          continue;
        }
        existingIds.add(externalId);

        const amount = tx.amount?.value ?? 0;
        const txCurrency = tx.amount?.currency ?? currency;
        const fxRate = tx.exchangeDetails?.rate ?? 1;
        const amountUsd = txCurrency === "USD" ? amount : amount * fxRate;

        const description =
          tx.details?.description ||
          tx.details?.type ||
          tx.type ||
          "Wise transaction";
        const merchant =
          tx.details?.merchant?.name ||
          tx.details?.senderName ||
          tx.details?.recipientName ||
          null;

        // Apply rules
        let categoryId: string | null = null;
        let isSub = false;
        for (const rule of rules) {
          if (!rule.is_active) continue;
          const matchText =
            rule.match_field === "merchant" ? merchant || "" : description;
          if (matchText.toUpperCase().includes(rule.keyword.toUpperCase())) {
            categoryId = rule.category_id;
            isSub = rule.mark_as_subscription;
            break;
          }
        }

        const txType = tx.type === "CREDIT" ? "income" : "expense";

        batch.push({
          date: tx.date
            ? tx.date.split("T")[0]
            : new Date().toISOString().split("T")[0],
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
      }

      // Insert in batches of 200
      const insertErrors: string[] = [];
      for (let i = 0; i < batch.length; i += 200) {
        const chunk = batch.slice(i, i + 200);
        const { error: insertErr, data: inserted } = await supabase
          .from("transactions")
          .insert(chunk)
          .select("id");
        if (!insertErr && inserted) {
          imported += inserted.length;
        } else if (insertErr) {
          insertErrors.push(insertErr.message);
          console.error("Batch insert error:", insertErr.message);
        }
      }
      if (insertErrors.length > 0) {
        diagnostics.push(`Insert errors: ${insertErrors.join("; ")}`);
      }

      // 7. Compute sum & date range
      const { data: txSums } = await supabase
        .from("transactions")
        .select("amount")
        .eq("account_id", accountId);

      const sumImported = (txSums || []).reduce(
        (acc: number, t: any) => acc + Number(t.amount),
        0
      );

      const { data: dateRangeStart } = await supabase
        .from("transactions")
        .select("date")
        .eq("account_id", accountId)
        .order("date", { ascending: true })
        .limit(1);

      const { data: dateRangeEnd } = await supabase
        .from("transactions")
        .select("date")
        .eq("account_id", accountId)
        .order("date", { ascending: false })
        .limit(1);

      const txCount = txSums?.length || 0;

      const hasData = txCount > 0 || officialBalance !== null;
      const hasErrors = fetchErrors.length > 0 || insertErrors.length > 0;
      const status = !hasData && hasErrors ? "failed" : hasErrors ? "partial" : "success";

      await supabase.from("wise_sync_log").insert({
        profile_id: String(profileId),
        account_id: accountId,
        status,
        transactions_imported: imported,
        last_transaction_date: new Date().toISOString().split("T")[0],
      });

      return json({
        imported,
        skipped,
        total_fetched: allTransactions.length,
        official_balance: officialBalance,
        sum_imported: sumImported,
        tx_count: txCount,
        date_range: {
          start: dateRangeStart?.[0]?.date || null,
          end: dateRangeEnd?.[0]?.date || null,
        },
        reconciled:
          officialBalance !== null
            ? Math.abs(officialBalance - sumImported) < 0.01
            : null,
        status,
        diagnostics,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Wise sync error:", message);
    return json({ error: message }, 500);
  }
});

/**
 * Try statement API with 3-month windows
 */
async function fetchStatementTransactions(
  profileId: number,
  balanceId: number,
  currency: string,
  token: string
): Promise<{ transactions: any[]; errors: string[] }> {
  const allTx: any[] = [];
  const seenIds = new Set<string>();
  const errors: string[] = [];

  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);

  const windows: { s: Date; e: Date }[] = [];
  let cursor = new Date(start);
  while (cursor < end) {
    const windowEnd = new Date(cursor);
    windowEnd.setMonth(windowEnd.getMonth() + 3);
    if (windowEnd > end) windowEnd.setTime(end.getTime());
    windows.push({ s: new Date(cursor), e: new Date(windowEnd) });
    cursor = new Date(windowEnd);
  }

  for (const w of windows) {
    try {
      const url =
        `/v1/profiles/${profileId}/balance-statements/${balanceId}/statement.json` +
        `?currency=${currency}` +
        `&intervalStart=${w.s.toISOString()}` +
        `&intervalEnd=${w.e.toISOString()}` +
        `&type=COMPACT`;

      const statement = await wiseGet(url, token);
      const transactions = statement.transactions || [];
      for (const tx of transactions) {
        const id = buildExternalId(tx);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allTx.push(tx);
        }
      }
    } catch (err) {
      const msg = `Window ${w.s.toISOString().split("T")[0]}→${w.e.toISOString().split("T")[0]}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
    }
  }

  return { transactions: allTx, errors };
}

/**
 * Fetch transactions via Activities API with cursor pagination.
 * Filters by currency via the balance's activities.
 */
async function fetchActivitiesTransactions(
  profileId: number,
  currency: string,
  token: string
): Promise<{ transactions: any[]; errors: string[] }> {
  const allTx: any[] = [];
  const seenIds = new Set<string>();
  const errors: string[] = [];

  const since = new Date();
  since.setFullYear(since.getFullYear() - 2);

  let nextCursor: string | null = null;
  let pageCount = 0;
  const maxPages = 50; // safety limit

  do {
    try {
      let url = `/v1/profiles/${profileId}/activities?size=100&since=${since.toISOString()}`;
      if (nextCursor) {
        url += `&nextCursor=${encodeURIComponent(nextCursor)}`;
      }

      const response = await wiseGet(url, token);
      const activities = response.activities || [];
      pageCount++;
      console.log(`Activities page ${pageCount}: ${activities.length} items`);

      for (const activity of activities) {
        // Filter to monetary activities for our currency
        if (!isMonetaryActivity(activity)) continue;

        const txCurrency = activity.primaryAmount?.currency ||
          activity.amount?.currency;
        if (txCurrency && txCurrency !== currency) continue;

        // Convert activity to our transaction format
        const tx = activityToTransaction(activity);
        if (!tx) continue;

        const id = buildExternalId(tx);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allTx.push(tx);
        }
      }

      nextCursor = response.cursor || null;
    } catch (err) {
      const msg = `Activities page ${pageCount + 1}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      break;
    }
  } while (nextCursor && pageCount < maxPages);

  return { transactions: allTx, errors };
}

function isMonetaryActivity(activity: any): boolean {
  const monetaryTypes = [
    "CARD_TRANSACTION", "BALANCE_TRANSACTION", "TRANSFER",
    "BALANCE_DEPOSIT", "AUTO_CONVERSION", "BALANCE_CASHBACK",
    "BALANCE_INTEREST", "BALANCE_ASSET_FEE", "BALANCE_HOLD_FEE",
    "ACQUIRING_PAYMENT",
  ];
  return monetaryTypes.includes(activity.type);
}

function activityToTransaction(activity: any): any | null {
  const amount = activity.primaryAmount || activity.amount;
  if (!amount) return null;

  const isCredit = amount.value > 0;
  return {
    referenceNumber: activity.id,
    date: activity.createdOn || activity.updatedOn,
    amount: {
      value: amount.value,
      currency: amount.currency,
    },
    type: isCredit ? "CREDIT" : "DEBIT",
    details: {
      description: activity.title?.message || activity.description || activity.type,
      type: activity.type,
      merchant: activity.merchant || null,
      senderName: activity.senderName || null,
      recipientName: activity.recipient?.name || null,
      paymentReference: activity.paymentReference || null,
    },
    exchangeDetails: activity.exchangeDetails || null,
  };
}

function buildExternalId(tx: any): string {
  if (tx.referenceNumber) return `wise_${tx.referenceNumber}`;
  const d = tx.date || "";
  const a = tx.amount?.value ?? 0;
  const t = tx.type || "UNKNOWN";
  return `wise_${t}_${d}_${a}`;
}

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
  const { data } = await supabase
    .from("rules")
    .select("*")
    .eq("is_active", true);
  return data || [];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
