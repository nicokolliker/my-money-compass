import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Check if we already have a rate from today to avoid excessive API calls
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("fx_rates")
      .select("*")
      .eq("from_currency", "ARS")
      .eq("to_currency", "USD")
      .eq("source", "bluelytics")
      .eq("date", today)
      .maybeSingle();

    // Check if force refresh requested
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const force = body.force === true;

    if (existing && !force) {
      return new Response(JSON.stringify({
        rate: existing.rate,
        date: existing.date,
        cached: true,
        updated_at: existing.created_at,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch from Bluelytics API
    const res = await fetch("https://api.bluelytics.com.ar/v2/latest");
    if (!res.ok) {
      // Fallback: return last known rate
      const { data: fallback } = await supabase
        .from("fx_rates")
        .select("*")
        .eq("from_currency", "ARS")
        .eq("to_currency", "USD")
        .eq("source", "bluelytics")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fallback) {
        return new Response(JSON.stringify({
          rate: fallback.rate,
          date: fallback.date,
          cached: true,
          fallback: true,
          updated_at: fallback.created_at,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Bluelytics API error: ${res.status}`);
    }

    const data = await res.json();
    const valueBuy = data.blue?.value_buy;
    const valueSell = data.blue?.value_sell;

    if (!valueBuy || !valueSell) {
      throw new Error("Invalid response from Bluelytics API");
    }

    const blueAvg = (valueBuy + valueSell) / 2;
    // Store as ARS->USD rate: 1 ARS = X USD
    const arsToUsd = 1 / blueAvg;

    // Upsert rate for today
    if (existing) {
      await supabase
        .from("fx_rates")
        .update({ rate: arsToUsd, created_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("fx_rates").insert({
        from_currency: "ARS",
        to_currency: "USD",
        rate: arsToUsd,
        date: today,
        source: "bluelytics",
      });
    }

    return new Response(JSON.stringify({
      rate: arsToUsd,
      blue_avg: blueAvg,
      value_buy: valueBuy,
      value_sell: valueSell,
      date: today,
      cached: false,
      updated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("FX rate fetch error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
