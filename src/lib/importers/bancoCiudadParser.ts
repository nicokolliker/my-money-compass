import type { ParsedTransaction } from './arqParser';

const SKIP_PATTERNS = [
  /^INTERESES/i,
  /^IVA\b/i,
  /^COM\.?ADM/i,
  /^IIBB/i,
  /^DB\.?RG/i,
  /^SU PAGO/i,
];

function parseArsAmount(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(/,/g, '.'));
}

function parseDate(raw: string): string {
  const m = raw.match(/(\d{2})\.(\d{2})\.(\d{2})/);
  if (!m) return '';
  return `20${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Parse Banco Ciudad credit card statement (PDF text).
 * Only extracts charges from card 1689.
 */
export function parseBancoCiudad(pdfText: string, fxRate = 0): ParsedTransaction[] {
  // Isolate "Tarjeta 1689" block: from that marker until next "Tarjeta XXXX" or "SALDO ACTUAL"
  const startIdx = pdfText.search(/Tarjeta\s+1689/i);
  if (startIdx < 0) return [];
  const tail = pdfText.slice(startIdx);
  const endMatch = tail.slice(20).search(/Tarjeta\s+\d{4}|SALDO ACTUAL/i);
  const block = endMatch >= 0 ? tail.slice(0, 20 + endMatch) : tail;

  const out: ParsedTransaction[] = [];
  const re =
    /(\d{2}\.\d{2}\.\d{2})\s+([\w*]+)\s+(.+?)(?:\s+Cuota\s+(\d+\/\d+))?\s+([\d.]+,\d{2})(?:\s+([\d.]+,\d{2}))?(?=\s+\d{2}\.\d{2}\.\d{2}|\s*$)/gs;

  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const [, dateRaw, comprobante, descRaw, cuota, arsRaw, usdRaw] = m;
    const desc = descRaw.replace(/\s+/g, ' ').trim();
    if (SKIP_PATTERNS.some((p) => p.test(desc))) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    const amountARS = parseArsAmount(arsRaw);
    let amountUSD = 0;
    if (usdRaw) amountUSD = parseArsAmount(usdRaw);
    else if (fxRate > 0) amountUSD = +(amountARS * fxRate).toFixed(2);

    const description = cuota ? `${desc} (Cuota ${cuota})` : desc;

    out.push({
      date,
      description,
      amountUSD,
      amountARS,
      type: 'expense',
      external_id: `bc1689-${date}-${comprobante}`,
      matched: !!usdRaw,
    });
  }

  return out;
}
