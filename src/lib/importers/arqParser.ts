/**
 * ARQ statement parser
 * Joins an ARS statement with an optional USD statement (same period) and
 * produces ParsedTransaction rows ready to import.
 */

export interface ParsedTransaction {
  date: string;             // YYYY-MM-DD
  description: string;
  amountUSD: number;        // always positive
  amountARS: number;        // always positive
  type: 'expense' | 'transfer' | 'fee';
  transferTarget?: string;
  external_id: string;      // "arq-ARS-{date}-{amountARSraw}"
  matched: boolean;         // true if a USD twin row was found
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function extractYear(text: string): number {
  // "Fecha de inicio ... April 2026" or any " <Month> <year>" near "Fecha de inicio"
  const m = text.match(/Fecha de inicio[\s\S]{0,200}?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m) return parseInt(m[2], 10);
  const fallback = text.match(/(20\d{2})/);
  return fallback ? parseInt(fallback[1], 10) : new Date().getFullYear();
}

function toIsoDate(monAbbr: string, day: string, year: number): string {
  const m = MONTHS[monAbbr];
  const d = new Date(Date.UTC(year, m, parseInt(day, 10)));
  return d.toISOString().slice(0, 10);
}

/** Strip thousand separators / spaces but keep sign and decimals. */
function normalizeAmountStr(raw: string): string {
  return raw.replace(/[,\s]/g, '');
}
function parseAmount(raw: string): number {
  return parseFloat(normalizeAmountStr(raw));
}

interface ArsRow {
  date: string;
  monDay: string;       // "Apr 01" — used to match USD rows
  rawAmount: string;    // raw ARS amount string from PDF (used for external_id)
  amountARS: number;    // positive
  signNegative: boolean;
  type: 'expense' | 'transfer' | 'fee';
  description: string;
  transferTarget?: string;
}

interface UsdRow {
  date: string;
  monDay: string;
  rawARS: string;       // ARS string from "Venta USDc por ARS … ARS …"
  amountUSD: number;    // positive
}

const MONTH_RE = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

function parseArsStatement(text: string, year: number): ArsRow[] {
  const rows: ArsRow[] = [];
  // Pattern: "Apr 01  Pago con tarjeta  -1234.56 ARS  MERCHANT NAME"
  const re = new RegExp(
    `(${MONTH_RE})\\s+(\\d{2})\\s+(Pago con tarjeta|Retiros|Comisión|Comision)\\s+([+\\-][\\d.,]+)\\s+ARS\\s+([^\\n]+?)(?=\\s+(?:${MONTH_RE})\\s+\\d{2}\\s+(?:Pago con tarjeta|Retiros|Comisión|Comision|Recibidos|Venta)|$)`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, mon, day, tipo, rawAmt, descRaw] = m;
    const desc = descRaw.trim().replace(/\s+/g, ' ');
    const amt = parseAmount(rawAmt);
    const tipoNorm = tipo.replace('Comision', 'Comisión');
    let kind: ArsRow['type'] = 'expense';
    if (tipoNorm === 'Retiros') kind = 'transfer';
    else if (tipoNorm === 'Comisión') kind = 'fee';
    const iso = toIsoDate(mon, day, year);
    rows.push({
      date: iso,
      monDay: `${mon} ${day}`,
      rawAmount: normalizeAmountStr(rawAmt).replace(/^[+-]/, ''),
      amountARS: Math.abs(amt),
      signNegative: amt < 0,
      type: kind,
      description: desc,
      transferTarget: kind === 'transfer' ? desc : undefined,
    });
  }
  return rows;
}

function parseUsdStatement(text: string, year: number): UsdRow[] {
  const rows: UsdRow[] = [];
  // "Apr 01  Venta USDc por ARS  -12.34  ARS  1,234.56"
  const re = new RegExp(
    `(${MONTH_RE})\\s+(\\d{2})\\s+Venta USDc por ARS\\s+([+\\-]?[\\d.,]+)\\s+ARS\\s+([+\\-]?[\\d.,]+)`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, mon, day, usdRaw, arsRaw] = m;
    rows.push({
      date: toIsoDate(mon, day, year),
      monDay: `${mon} ${day}`,
      rawARS: normalizeAmountStr(arsRaw).replace(/^[+-]/, ''),
      amountUSD: Math.abs(parseAmount(usdRaw)),
    });
  }
  return rows;
}

/**
 * Parse and join ARS + (optional) USD ARQ statements.
 * @param usdPdfText - text extracted from USD statement (may be "")
 * @param arsPdfText - text extracted from ARS statement (required)
 * @param fxRate - ARS→USD rate (USD per 1 ARS) used as fallback when no USD row matches
 */
export function parseArqStatements(
  usdPdfText: string,
  arsPdfText: string,
  fxRate: number = 0,
): ParsedTransaction[] {
  const year = extractYear(arsPdfText || usdPdfText);
  const arsRows = parseArsStatement(arsPdfText, year);
  const usdRows = usdPdfText ? parseUsdStatement(usdPdfText, year) : [];

  const usedUsd = new Set<number>();

  return arsRows.map<ParsedTransaction>((r) => {
    let matched = false;
    let amountUSD = 0;

    if (r.type === 'expense' || r.type === 'fee') {
      const idx = usdRows.findIndex(
        (u, i) => !usedUsd.has(i) && u.monDay === r.monDay && u.rawARS === r.rawAmount,
      );
      if (idx >= 0) {
        usedUsd.add(idx);
        amountUSD = usdRows[idx].amountUSD;
        matched = true;
      } else if (fxRate > 0) {
        amountUSD = +(r.amountARS * fxRate).toFixed(2);
      }
    }

    return {
      date: r.date,
      description: r.description,
      amountUSD,
      amountARS: r.amountARS,
      type: r.type,
      transferTarget: r.transferTarget,
      external_id: `arq-ARS-${r.date}-${r.rawAmount}`,
      matched,
    };
  });
}
