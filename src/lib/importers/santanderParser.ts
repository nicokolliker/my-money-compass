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

export function parseSantander(pdfText: string, fxRate: number): ParsedTransaction[] {
  const yearMatch = pdfText.match(/CIERRE\s+\d+\s+\w+\s+(\d{2,4})/i);
  const rawYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  const blockStart = pdfText.search(/Tarjeta\s+5829/i);
  if (blockStart < 0) return [];
  const tail = pdfText.slice(blockStart + 20);
  const blockEnd = tail.search(/Tarjeta\s+\d{4}|SALDO ACTUAL/i);
  const block = blockEnd >= 0 ? tail.slice(0, blockEnd) : tail;

  const out: ParsedTransaction[] = [];
  const re = /(\d{1,2}\s+[A-Za-záé]+\.?)\s+([\w*]+)\s+(.+?)(?:\s+C\.(\d+\/\d+))?\s+([\d.]+,\d{2})(?:\s+([\d.]+,\d{2}))?(?=\s+\d{1,2}\s+[A-Za-záé]|\s*$)/gs;
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
    out.push({
      date,
      description,
      amountARS,
      amountUSD,
      type: 'expense',
      external_id: `sant5829-${date}-${comprobante}`,
      matched: !!usdRaw,
    });
  }
  return out;
}
