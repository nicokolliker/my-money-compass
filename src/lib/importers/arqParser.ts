/**
 * ARQ / DolarApp statement parser — PR3 + PR4
 *
 * Joins an ARS statement with an optional USD statement (same period) and
 * produces ParsedTransaction rows ready to import.
 *
 * Key changes vs previous version:
 *  - Returns ParsedArqResult (transactions + balanceFinalUsd + period)
 *  - Parses "Compra USDc" rows as income (Wise deposits, DolarApp purchases)
 *  - Parses "Comisión N/A N/A" rows from USD statement as fee
 *  - Extracts "Balance Final $X.XX" from USD statement
 *  - Marks Wise deposit rows with isWiseDeposit: true
 */

export interface ParsedTransaction {
  date: string;              // YYYY-MM-DD
  description: string;
  amountUSD: number;         // always positive
  amountARS: number;         // always positive (0 for USD-only rows)
  type: 'expense' | 'transfer' | 'fee' | 'income';
  transferTarget?: string;
  external_id: string;       // stable dedup key
  matched: boolean;          // true if USD twin was found for ARS row
  isWiseDeposit?: boolean;   // true for "WISE US INC" Compra USDc rows
  isIncomingTransfer?: boolean; // true for own-account transfers (e.g. ARQ → MP from "NICOLAS")
}

/** Return value of parseArqStatements */
export interface ParsedArqResult {
  transactions: ParsedTransaction[];
  /** USD balance from "Balance Final $X.XX" in the USD statement, or null if not found */
  balanceFinalUsd: number | null;
  /** YYYY-MM-DD start of statement period */
  periodStart: string | null;
  /** YYYY-MM-DD end of statement period */
  periodEnd: string | null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTHS_SHORT: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const MONTHS_LONG: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function extractYear(text: string): number {
  const m = text.match(
    /Fecha de inicio[\s\S]{0,200}?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );
  if (m) return parseInt(m[2], 10);
  const fallback = text.match(/(20\d{2})/);
  return fallback ? parseInt(fallback[1], 10) : new Date().getFullYear();
}

function toIsoDate(monAbbr: string, day: string, year: number): string {
  const m = MONTHS_SHORT[monAbbr];
  if (m === undefined) return '';
  const d = new Date(Date.UTC(year, m, parseInt(day, 10)));
  return d.toISOString().slice(0, 10);
}

/** Strip thousand separators and spaces; keep sign and decimals. */
function normalizeAmountStr(raw: string): string {
  return raw.replace(/[,\s]/g, '');
}

function parseAmount(raw: string): number {
  return parseFloat(normalizeAmountStr(raw));
}

// ─── period extraction ───────────────────────────────────────────────────────

function extractPeriod(text: string): { start: string | null; end: string | null } {
  function toISO(day: string, mon: string, year: string): string | null {
    const m = MONTHS_LONG[mon.toLowerCase()];
    if (m === undefined) return null;
    return `${year}-${String(m + 1).padStart(2, '0')}-${String(parseInt(day, 10)).padStart(2, '0')}`;
  }
  const startM = text.match(/Fecha de inicio\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  const endM   = text.match(/Fecha de fin\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  return {
    start: startM ? toISO(startM[1], startM[2], startM[3]) : null,
    end:   endM   ? toISO(endM[1],   endM[2],   endM[3])   : null,
  };
}

// ─── USD balance final ───────────────────────────────────────────────────────

/**
 * Extract "Balance Final  $ 358.85" from the USD statement.
 * ARS statement has "Balance Final  ARS 1,713.00" — the $ prefix distinguishes them.
 */
function extractUsdBalanceFinal(text: string): number | null {
  const m = text.match(/Balance\s+Final\s+\$\s*([\d,]+\.?\d*)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

// ─── ARS statement parser ────────────────────────────────────────────────────

interface ArsRow {
  date: string;
  monDay: string;
  rawAmount: string;   // digits only, no sign — used for USD cross-match
  amountARS: number;   // positive
  type: 'expense' | 'transfer' | 'fee';
  description: string;
  transferTarget?: string;
}

const MONTH_RE = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

function parseArsStatement(text: string, year: number): ArsRow[] {
  const rows: ArsRow[] = [];
  const re = new RegExp(
    `(${MONTH_RE})\\s+(\\d{2})\\s+(Pago con tarjeta|Retiros|Comisi[oó]n)\\s+([+\\-][\\d.,]+)\\s+ARS\\s+([^\\n]+?)(?=\\s+(?:${MONTH_RE})\\s+\\d{2}\\s+(?:Pago con tarjeta|Retiros|Comisi[oó]n|Recibidos|Venta)|$)`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, mon, day, tipo, rawAmt, descRaw] = m;
    const desc  = descRaw.trim().replace(/\s+/g, ' ');
    const amt   = parseAmount(rawAmt);
    let kind: ArsRow['type'] = 'expense';
    if (/retiro/i.test(tipo))   kind = 'transfer';
    if (/comisi[oó]n/i.test(tipo)) kind = 'fee';
    const iso = toIsoDate(mon, day, year);
    if (!iso) continue;
    rows.push({
      date: iso,
      monDay: `${mon} ${day}`,
      rawAmount: normalizeAmountStr(rawAmt).replace(/^[+-]/, ''),
      amountARS: Math.abs(amt),
      type: kind,
      description: desc,
      transferTarget: kind === 'transfer' ? desc : undefined,
    });
  }
  return rows;
}

// ─── USD statement parser ────────────────────────────────────────────────────

interface UsdRow {
  date: string;
  monDay: string;
  amountUSD: number;         // positive
  rawARS: string;            // for Venta cross-match; empty for Compra/Comision
  rowType: 'venta' | 'compra' | 'comision_usd';
  description: string;
  sourceCurrency?: string;   // USD | MXN | ARS | N/A (for Compra rows)
}

function parseUsdStatement(text: string, year: number): UsdRow[] {
  const rows: UsdRow[] = [];

  // ── "Venta USDc por ARS" — expense rows ──────────────────────────────────
  // "Apr 01  Venta USDc por ARS  -14.97  ARS  -21,757.17"
  const ventaRe = new RegExp(
    `(${MONTH_RE})\\s+(\\d{2})\\s+Venta USDc por ARS\\s+([+\\-]?\\s*[\\d.,]+)\\s+ARS\\s+([+\\-]?\\s*[\\d.,]+)`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = ventaRe.exec(text)) !== null) {
    const [, mon, day, usdRaw, arsRaw] = m;
    const iso = toIsoDate(mon, day, year);
    if (!iso) continue;
    rows.push({
      date: iso,
      monDay: `${mon} ${day}`,
      amountUSD: Math.abs(parseAmount(usdRaw)),
      rawARS: normalizeAmountStr(arsRaw).replace(/^[+-]/, ''),
      rowType: 'venta',
      description: 'Venta USDc a ARS',
      sourceCurrency: 'ARS',
    });
  }

  // ── "Compra USDc" — income rows (Wise deposits, DolarApp internal) ────────
  // "Apr 20  Compra USDc  +400    USD  +400    WISE US INC"
  // "Apr 20  Compra USDc  +25.68  MXN  +445.4  DOLARAPP MEXICO S.A. DE C.V."
  const compraRe = new RegExp(
    `(${MONTH_RE})\\s+(\\d{2})\\s+Compra USDc\\s+([+\\-]?\\s*[\\d.,]+)\\s+(USD|MXN|ARS)\\s+[+\\-]?\\s*[\\d.,]+\\s+([^\\n]+?)(?=\\s+(?:${MONTH_RE})\\s+\\d|$)`,
    'g',
  );
  while ((m = compraRe.exec(text)) !== null) {
    const [, mon, day, usdRaw, srcCurrency, descRaw] = m;
    const iso = toIsoDate(mon, day, year);
    if (!iso) continue;
    rows.push({
      date: iso,
      monDay: `${mon} ${day}`,
      amountUSD: Math.abs(parseAmount(usdRaw)),
      rawARS: '',
      rowType: 'compra',
      description: descRaw.trim().replace(/\s+/g, ' '),
      sourceCurrency: srcCurrency,
    });
  }

  // ── "Comisión … N/A N/A" — fee rows (e.g. "Compra USDc comisión") ────────
  // "Apr 20  Comisión  - 3  N/A  N/A  Compra USDc comisión"
  const comisionRe = new RegExp(
    `(${MONTH_RE})\\s+(\\d{2})\\s+Comisi[oó]n\\s+([+\\-]?\\s*[\\d.,]+)\\s+N\\/A\\s+N\\/A\\s+([^\\n]+?)(?=\\s+(?:${MONTH_RE})\\s+\\d|$)`,
    'g',
  );
  while ((m = comisionRe.exec(text)) !== null) {
    const [, mon, day, usdRaw, descRaw] = m;
    const iso = toIsoDate(mon, day, year);
    if (!iso) continue;
    rows.push({
      date: iso,
      monDay: `${mon} ${day}`,
      amountUSD: Math.abs(parseAmount(usdRaw)),
      rawARS: '',
      rowType: 'comision_usd',
      description: descRaw.trim().replace(/\s+/g, ' '),
    });
  }

  return rows;
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Parse and join ARS + (optional) USD ARQ statements.
 *
 * @param usdPdfText  Full text extracted from the USD statement PDF (may be '')
 * @param arsPdfText  Full text extracted from the ARS statement PDF (required)
 * @param fxRate      ARS→USD rate (USD per 1 ARS) — fallback when no USD twin is found
 */
export function parseArqStatements(
  usdPdfText: string,
  arsPdfText: string,
  fxRate: number = 0,
): ParsedArqResult {
  const combinedText = arsPdfText || usdPdfText;
  const year    = extractYear(combinedText);
  const arsRows = parseArsStatement(arsPdfText, year);
  const usdRows = usdPdfText ? parseUsdStatement(usdPdfText, year) : [];

  const balanceFinalUsd = usdPdfText ? extractUsdBalanceFinal(usdPdfText) : null;
  const period          = extractPeriod(combinedText);

  const usedUsdIdx = new Set<number>();

  // ── ARS rows → expense / transfer / fee transactions ─────────────────────
  const arsTransactions: ParsedTransaction[] = arsRows.map((r) => {
    let matched   = false;
    let amountUSD = 0;

    if (r.type === 'expense' || r.type === 'fee') {
      // Cross-match: same monDay + same ARS amount in USD statement
      const idx = usdRows.findIndex(
        (u, i) =>
          !usedUsdIdx.has(i) &&
          u.rowType === 'venta' &&
          u.monDay === r.monDay &&
          u.rawARS === r.rawAmount,
      );
      if (idx >= 0) {
        usedUsdIdx.add(idx);
        amountUSD = usdRows[idx].amountUSD;
        matched   = true;
      } else if (fxRate > 0) {
        // Fallback: estimate from daily blue rate
        amountUSD = +(r.amountARS * fxRate).toFixed(2);
      }
    }
    // transfer rows keep amountUSD = 0 (no FX conversion needed — shown separately)

    return {
      date:           r.date,
      description:    r.description,
      amountUSD,
      amountARS:      r.amountARS,
      type:           r.type,
      transferTarget: r.transferTarget,
      external_id:    `arq-ARS-${r.date}-${r.rawAmount}`,
      matched,
    };
  });

  // ── "Compra USDc" rows → income transactions ──────────────────────────────
  const incomeTransactions: ParsedTransaction[] = usdRows
    .filter((u) => u.rowType === 'compra')
    .map((u, i) => ({
      date:          u.date,
      description:   u.description,
      amountUSD:     u.amountUSD,
      amountARS:     0,
      type:          'income' as const,
      external_id:   `arq-USD-compra-${u.date}-${u.amountUSD}-${i}`,
      matched:       true,
      isWiseDeposit: /WISE/i.test(u.description),
    }));

  // ── USD "Comisión" rows → fee transactions ────────────────────────────────
  const usdFeeTransactions: ParsedTransaction[] = usdRows
    .filter((u) => u.rowType === 'comision_usd')
    .map((u, i) => ({
      date:        u.date,
      description: u.description,
      amountUSD:   u.amountUSD,
      amountARS:   0,
      type:        'fee' as const,
      external_id: `arq-USD-fee-${u.date}-${i}`,
      matched:     true,
    }));

  return {
    transactions:    [...arsTransactions, ...incomeTransactions, ...usdFeeTransactions],
    balanceFinalUsd,
    periodStart:     period.start,
    periodEnd:       period.end,
  };
}
