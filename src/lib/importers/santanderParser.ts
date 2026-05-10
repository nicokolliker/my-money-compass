import type { ParsedTransaction } from './arqParser';

const MESES: Record<string, number> = {
  'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
  'julio': 6, 'agosto': 7, 'septiembre': 8, 'setiembre': 8,
  'octubre': 9, 'noviem': 10, 'noviembre': 10, 'diciem': 11, 'diciembre': 11,
};

function parseDate(raw: string, year: number): string {
  const m = raw.toLowerCase().match(/(\d{1,2})\s+([a-záé]+\.?)/);
  if (!m) return '';
  const day = parseInt(m[1], 10);
  const month = MESES[m[2].replace('.', '')];
  if (month === undefined) return '';
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseArsAmount(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
}

const SKIP = [/^SALDO ANTERIOR/i, /^SU PAGO EN PESOS/i, /^INTERESES/i, /^IVA\b/i, /^PLAN V/i];

const TX_REGEX = /(\d{1,2}\s+[A-Za-záé]+\.?)\s+([\w*]+)\s+(.+?)(?:\s+C\.(\d+\/\d+))?\s+([\d.]+,\d{2})(?:\s+([\d.]+,\d{2}))?(?=\s+\d{1,2}\s+[A-Za-záé]|\s*$)/gs;

/** Parse a single card block — returns transactions + total ARS for that card. */
function parseCardBlock(
  block: string,
  suffix: string,
  year: number,
  fxRate: number,
): { transactions: ParsedTransaction[]; totalARS: number } {
  const out: ParsedTransaction[] = [];
  let totalARS = 0;
  const re = new RegExp(TX_REGEX.source, 'gs');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const [, dateRaw, comprobante, descRaw, cuota, arsRaw, usdRaw] = m;
    const desc = (descRaw || '').replace(/\s+/g, ' ').trim();
    if (SKIP.some((p) => p.test(desc))) continue;
    const date = parseDate(dateRaw, year);
    if (!date) continue;
    const amountARS = parseArsAmount(arsRaw);
    const amountUSD = usdRaw ? parseArsAmount(usdRaw) : +(amountARS * fxRate).toFixed(2);
    const description = cuota ? `${desc} (Cuota ${cuota})` : desc;
    totalARS += amountARS;
    out.push({
      date,
      description,
      amountARS,
      amountUSD,
      type: 'expense',
      external_id: `sant${suffix}-${date}-${comprobante}`,
      matched: !!usdRaw,
    });
  }
  return { transactions: out, totalARS };
}

export interface SantanderParseResult {
  transactions: ParsedTransaction[];
  cardSubtotals: Record<string, number>;
}

/**
 * Parse Santander credit card statement.
 *
 * - Without `targetSuffix`: returns ALL card blocks, populates `cardSubtotals` for every detected suffix.
 * - With `targetSuffix`: returns transactions for that card only (still populates the subtotal map).
 *
 * Backward-compat: returns a `ParsedTransaction[]` array that also exposes `.cardSubtotals`
 * via the `parseSantanderWithSubtotals` helper. The default `parseSantander` keeps the old
 * array signature for existing callers.
 */
export function parseSantanderWithSubtotals(
  pdfText: string,
  fxRate: number,
  targetSuffix?: string,
): SantanderParseResult {
  const yearMatch = pdfText.match(/CIERRE\s+\d+\s+\w+\s+(\d{2,4})/i);
  const rawYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  // Find every "Tarjeta XXXX" header position
  const headerRe = /Tarjeta\s+(\d{4})/gi;
  const headers: { suffix: string; start: number }[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(pdfText)) !== null) {
    headers.push({ suffix: hm[1], start: hm.index + hm[0].length });
  }
  if (headers.length === 0) return { transactions: [], cardSubtotals: {} };

  // Determine end boundary
  const endMarker = pdfText.search(/SALDO ACTUAL/i);
  const cardSubtotals: Record<string, number> = {};
  const allTransactions: ParsedTransaction[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const next = headers[i + 1]?.start ?? (endMarker >= 0 ? endMarker : pdfText.length);
    const block = pdfText.slice(h.start, next);
    const { transactions, totalARS } = parseCardBlock(block, h.suffix, year, fxRate);
    // Accumulate (a card may appear more than once in a statement)
    cardSubtotals[h.suffix] = (cardSubtotals[h.suffix] || 0) + totalARS;
    if (!targetSuffix || targetSuffix === h.suffix) {
      allTransactions.push(...transactions);
    }
  }

  return { transactions: allTransactions, cardSubtotals };
}

/** Backward-compatible array signature — defaults to Nico's Santander card 5829. */
export function parseSantander(pdfText: string, fxRate: number): ParsedTransaction[] {
  return parseSantanderWithSubtotals(pdfText, fxRate, '5829').transactions;
}
