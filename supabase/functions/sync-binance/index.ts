import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchBinance(path: string, apiKey: string, apiSecret: string, params: Record<string, string> = {}) {
  const timestamp = Date.now().toString();
  const queryString = new URLSearchParams({ ...params, timestamp }).toString();
  const signature = await hmacSha256(apiSecret, queryString);
  const url = `https://api.binance.com${path}?${queryString}&signature=${signature}`;
  const res = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const MIN_USD_VALUE = 1;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let targetUserIds: string[] = [];
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.replace("Bearer ", "");
    const { data } = await supabaseAdmin.auth.getUser(jwt);
    if (data?.user?.id) targetUserIds = [data.user.id];
  }
  if (targetUserIds.length === 0) {
    const { data: rows } = await supabaseAdmin
      .from("user_settings").select("user_id").not("binance_api_key", "is", null);
    targetUserIds = (rows || []).map((r: any) => r.user_id);
  }

  const results: Record<string, any> = {};

  for (const userId of targetUserIds) {
    try {
      const { data: setting } = await supabaseAdmin
        .from("user_settings")
        .select("binance_api_key, binance_api_secret")
        .eq("user_id", userId)
        .maybeSingle();

      if (!setting?.binance_api_key || !setting?.binance_api_secret) {
        results[userId] = { ok: false, error: "Binance no configurado" };
        continue;
      }

      const apiKey = setting.binance_api_key as string;
      const apiSecret = setting.binance_api_secret as string;

      const account = await fetchBinance("/api/v3/account", apiKey, apiSecret);
      const balances: { asset: string; free: number; locked: number }[] =
        (account.balances || [])
          .map((b: any) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
          .filter((b: any) => b.free + b.locked > 0);

      if (balances.length === 0) {
        await supabaseAdmin.from("user_settings").upsert({
          user_id: userId,
          binance_balances: [],
          binance_last_sync: new Date().toISOString(),
        }, { onConflict: "user_id" });
        results[userId] = { ok: true, assets: 0 };
        continue;
      }

      const tickersRes = await fetch("https://api.binance.com/api/v3/ticker/price");
      const allTickers: { symbol: string; price: string }[] = await tickersRes.json();
      const tickerMap = new Map(allTickers.map(t => [t.symbol, parseFloat(t.price)]));

      function getUsdPrice(asset: string): number {
        if (asset === "USDT" || asset === "USDC" || asset === "BUSD" || asset === "FDUSD") return 1;
        return tickerMap.get(`${asset}USDT`) || tickerMap.get(`${asset}BUSD`) || 0;
      }

      const enriched = balances
        .map(b => ({
          asset: b.asset,
          free: b.free,
          locked: b.locked,
          total: b.free + b.locked,
          price_usd: getUsdPrice(b.asset),
          value_usd: (b.free + b.locked) * getUsdPrice(b.asset),
        }))
        .filter(b => b.value_usd >= MIN_USD_VALUE)
        .sort((a, b) => b.value_usd - a.value_usd);

      const totalUsd = enriched.reduce((s, b) => s + b.value_usd, 0);

      await supabaseAdmin.from("user_settings").upsert({
        user_id: userId,
        binance_balances: enriched,
        binance_last_sync: new Date().toISOString(),
      }, { onConflict: "user_id" });

      results[userId] = { ok: true, assets: enriched.length, total_usd: totalUsd };
    } catch (e: any) {
      results[userId] = { ok: false, error: e.message };
    }
  }

  return json({ results });
});
