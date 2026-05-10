import * as XLSX from 'xlsx';
import type { ParsedTransaction } from './arqParser';

function parseArsAmount(raw: string | number): number {
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return 0;
  // Argentine format: thousands "." and decimal ","
  const normalized = s.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(normalized);
}

function parseDateDDMMYYYY(raw: string): string {
  const m = String(raw).trim().match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseMercadoPago(fileBuffer: ArrayBuffer, fxRate = 0): ParsedTransaction[] {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

  const dataRows = rows.slice(4); // skip 0,1,2 (resumen) and row 3 (headers)
  const out: ParsedTransaction[] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const [releaseDate, txType, refId, netAmountRaw, ,] = row;
    if (!releaseDate) continue;

    const date = parseDateDDMMYYYY(releaseDate);
    if (!date) continue;

    const amount = parseArsAmount(netAmountRaw);
    if (!amount || isNaN(amount)) continue;

    const refStr = String(refId || '').trim();
    const typeStr = String(txType || '').trim();

    if (/Transferencia/i.test(typeStr) && !refStr) continue;

    const amountARS = Math.abs(amount);
    const amountUSD = fxRate > 0 ? +(amountARS * fxRate).toFixed(2) : 0;

    // ── Classify by TRANSACTION_TYPE label ──────────────────────────────────
    let type: ParsedTransaction['type'];
    let isIncomingTransfer = false;
    if (/Transferencia recibida/i.test(typeStr)) {
      // Incoming transfer from own ARQ account → mark as transfer; others = income
      if (/NICOLAS/i.test(typeStr)) {
        type = 'transfer';
        isIncomingTransfer = true;
      } else {
        type = 'income';
      }
    } else if (/Rendimientos/i.test(typeStr)) {
      type = 'income';
    } else if (/Transferencia enviada|Pago de servicio|Pago con QR|Pago/i.test(typeStr)) {
      type = 'expense';
    } else {
      // Fallback to sign
      type = amount > 0 ? 'income' : 'expense';
    }

    const external_id = refStr
      ? `mp-${refStr}`
      : `mp-${date}-${amountARS}`;

    out.push({
      date,
      description: typeStr || 'MercadoPago',
      amountUSD,
      amountARS,
      type,
      isIncomingTransfer: isIncomingTransfer || undefined,
      external_id,
      matched: false,
    });
  }

  return out;
}
