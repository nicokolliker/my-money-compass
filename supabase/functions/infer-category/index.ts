// Classify a merchant name into one of the user's categories using Lovable AI Gateway.
// Returns { category: string | null }.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { merchant, categories } = await req.json();
    if (!merchant || !Array.isArray(categories) || categories.length === 0) {
      return new Response(JSON.stringify({ category: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Given these spending categories: ${categories.join(', ')}, what category does the merchant "${merchant}" most likely belong to? Reply with just the category name exactly as listed, or the word null if uncertain. No explanation.`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.error('AI gateway error', res.status, await res.text());
      return new Response(JSON.stringify({ category: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const raw = (data?.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/^["']|["']$/g, '').trim();
    const match = categories.find(
      (c: string) => c.toLowerCase() === cleaned.toLowerCase(),
    );
    const category = match || null;

    return new Response(JSON.stringify({ category }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('infer-category error', e);
    return new Response(JSON.stringify({ category: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
