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

function extractCardBlock(pdfText: string, cardNumber: string): string | null {
  // En BC Ciudad, las transacciones de la tarjeta N aparecen DESPUÉS del
  // "Total Consumos" de la tarjeta anterior y ANTES del "Total Consumos" de la tarjeta N.

  // Encontrar la línea de cierre de esta tarjeta
  const closingRegex = new RegExp(`Tarjeta\\s+${cardNumber}\\s+Total\\s+Consumos`, 'i');
  const closingIdx = pdfText.search(closingRegex);
  if (closingIdx < 0) return null;

  // En el texto antes del cierre, buscar la última línea "Tarjeta XXXX Total Consumos"
  const textBefore = pdfText.slice(0, closingIdx);
  const prevTotalRegex = /Tarjeta\s+\d{4}\s+Total\s+Consumos[^\n]*\n/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = prevTotalRegex.exec(textBefore)) !== null) {
    lastMatch = m;
  }

  const startIdx = lastMatch ? lastMatch.index + lastMatch[0].length : 0;
  return pdfText.slice(startIdx, closingIdx);
}

export function extractCardTotal(pdfText: string, cardNumber: string): { ars: number; usd: number } {
  const regex = new RegExp(
    `Tarjeta\\s+${cardNumber}\\s+Total\\s+Consumos[^\\d]*(\\d[\\d.,]+)(?:\\s+(\\d[\\d.,]+))?`,
    'i',
  );
  const m = pdfText.match(regex);
  if (!m) return { ars: 0, usd: 0 };
  return {
    ars: parseArsAmount(m[1]),
    usd: m[2] ? parseArsAmount(m[2]) : 0,
  };
}

function parseBlock(
  block: string,
  cardPrefix: string,
  fxRate: number,
  filter?: (desc: string) => boolean,
): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  const re =
    /(\d{2}\.\d{2}\.\d{2})\s+([\w*]+)\s+(.+?)(?:\s+Cuota\s+(\d+\/\d+))?\s+([\d.]+,\d{2})(?:\s+([\d.]+,\d{2}))?(?=\s+\d{2}\.\d{2}\.\d{2}|\s*$)/gs;

  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const [, dateRaw, comprobante, descRaw, cuota, arsRaw, usdRaw] = m;
    const desc = descRaw.replace(/\s+/g, ' ').trim();
    if (SKIP_PATTERNS.some((p) => p.test(desc))) continue;
    if (filter && !filter(desc)) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    const amountARS = parseArsAmount(arsRaw);
    let amountUSD = 0;
    if (usdRaw) amountUSD = parseArsAmount(usdRaw);
    else if (fxRate > 0) amountUSD = +(amountARS * fxRate).toFixed(2);

    const cleanDesc = desc
      .replace(/\s+\d{10,}\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const description = cuota ? `${cleanDesc} (Cuota ${cuota})` : cleanDesc;

    out.push({
      date,
      description,
      amountUSD,
      amountARS,
      type: 'expense',
      external_id: `${cardPrefix}-${date}-${comprobante}`,
      matched: !!usdRaw,
    });
  }
  return out;
}

/**
 * Parse Banco Ciudad credit card statement (PDF text).
 * Only extracts charges from card 1689 (titular IEBRA).
 */
export function parseBancoCiudad(pdfText: string, fxRate = 0): ParsedTransaction[] {
  const block = extractCardBlock(pdfText, '1689');
  if (!block) return [];
  return parseBlock(block, 'bc1689', fxRate);
}

/**
 * Parse Banco Ciudad credit card statement for tarjeta 8157 (titular KOLLIKER ALFREDO).
 * Only keeps lines that contain "OB SOC" or "PODER JUD".
 */
export function parseBancoCiudadObSoc(pdfText: string, fxRate = 0): ParsedTransaction[] {
  const block = extractCardBlock(pdfText, '8157');
  if (!block) return [];
  return parseBlock(block, 'bc8157', fxRate, (desc) => /OB\s*SOC|PODER\s*JUD/i.test(desc));
}
