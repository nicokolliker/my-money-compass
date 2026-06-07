import { supabase } from '@/integrations/supabase/client';

/**
 * AI-based merchant → category inference.
 *
 * Replaces the legacy hardcoded keyword map. Each unique merchant name is
 * classified at most once per browser session — results live in module-level
 * Maps so React re-mounts don't re-fetch. Fallbacks to `null` on any error
 * or timeout; the caller treats `null` as "no suggestion".
 */

type CacheValue = string | null;

const cache = new Map<string, CacheValue>();              // key → category name | null
const inflight = new Map<string, Promise<CacheValue>>();   // key → in-flight promise
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

export function subscribeInferredCategory(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function getCachedInferredCategory(merchant: string): CacheValue | undefined {
  return cache.get(merchant.trim().toUpperCase());
}

/**
 * Kick off AI classification for a merchant. Returns the cached value if
 * available; otherwise fetches once and notifies subscribers when ready.
 */
export function inferCategoryAI(
  merchant: string,
  categoryNames: string[],
): Promise<CacheValue> {
  const key = merchant.trim().toUpperCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  if (inflight.has(key)) return inflight.get(key)!;
  if (!key || categoryNames.length === 0) return Promise.resolve(null);

  const p = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('infer-category', {
        body: { merchant, categories: categoryNames },
      });
      if (error) throw error;
      const value: CacheValue =
        data && typeof data.category === 'string' && data.category
          ? data.category
          : null;
      cache.set(key, value);
      return value;
    } catch (e) {
      console.warn('inferCategoryAI failed', e);
      cache.set(key, null);
      return null;
    } finally {
      inflight.delete(key);
      notify();
    }
  })();

  inflight.set(key, p);
  return p;
}

/** Test/debug helper. */
export function _clearAiCategoryCache() {
  cache.clear();
  inflight.clear();
  notify();
}
