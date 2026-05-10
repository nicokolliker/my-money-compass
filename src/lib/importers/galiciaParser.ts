/**
 * Banco Galicia Argentina XLSX statement parser.
 *
 * Sheet: "Cuentas". First 5 rows are metadata, row 6 has headers:
 *   Fecha | Movimiento | Débito | Crédito | Saldo Parcial | Comentarios
 *
 * Date format: DD/MM/YYYY.
 * Amount format (es-AR): "45.700,74" → 45700.74 (. = thousands, , = decimal).
 */

import * as XLSX from 'xlsx';
import type { ParsedTransaction } from './arqParser';

function parseArsAmount(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return 0;
  const negative = /^-/.test(s) || /\(.*\)/.test(s);
  const cleaned = s.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return negative && n > 0 ? -n : n;
}

function parseDateDDMMYYYY(raw: unknown): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  const m = String(raw).trim().match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function classify(movimiento: string, debito: number, credito: number): ParsedTransaction['type'] | null {
  const m = movimiento.trim().toUpperCase();
  if (
    m.startsWith('COMPRA DEBITO') ||
    m.startsWith('TRANSFERENCIA A TERCEROS') ||
    m.startsWith('DEB. AUTOM. DE SERV.') ||
    m.startsWith('DEB AUTOM DE SERV')
  ) {
    return 'expense';
  }
  if (m.startsWith('TRANSFERENCIA DE CUENTA PROPIA') && credito > 0) {
    return 'transfer';
  }
  if (
    m.startsWith('INTERES CAPITALIZADO') ||
    m.startsWith('CREDITOS VARIOS') ||
    m.startsWith('INTERESES COMPENSATORIOS')
  ) {
    return 'income';
  }
  if (debito < 0) return 'expense';
  if (credito > 0) return 'income';
  return null;
}

export function parseGalicia(buffer: ArrayBuffer): ParsedTransaction[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets['Cuentas'] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

  // Skip first 5 metadata rows + row 6 headers → data starts at index 6.
  const dataRows = rows.slice(6);
  const out: ParsedTransaction[] = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const [fechaRaw, movRaw, debRaw, credRaw] = row;
    if (!fechaRaw && !movRaw) continue;

    const date = parseDateDDMMYYYY(fechaRaw);
    if (!date) continue;

    const movimiento = String(movRaw || '').trim();
    if (!movimiento) continue;

    const debito = parseArsAmount(debRaw);
    const credito = parseArsAmount(credRaw);
    if (debito === 0 && credito === 0) continue;

    const type = classify(movimiento, debito, credito);
    if (!type) continue;

    const signedAmount = type === 'expense' ? debito : credito;
    const amountARS = Math.abs(signedAmount);
    if (!amountARS) continue;

    const normalizedAmount = String(signedAmount).replace(/\s+/g, '');
    const descSlice = movimiento.slice(0, 30).replace(/\s+/g, '_');
    const external_id = `galicia-${date}-${descSlice}-${normalizedAmount}`;

    out.push({
      date,
      description: movimiento,
      amountUSD: 0,
      amountARS,
      type,
      external_id,
      matched: false,
    });
  }

  return out;
}
