/**
 * AMEX Santander Río statement parser — extracts SALDO ACTUAL (ARS).
 * Format example: "SALDO ACTUAL | $ 487.615,05 | U$S 0,00"
 */
export function parseAmexTotal(pdfText: string): number {
  if (!pdfText) return 0;
  // Normalize whitespace
  const text = pdfText.replace(/\s+/g, ' ');
  // Find SALDO ACTUAL followed by $ amount (ARS first column)
  const m = text.match(/SALDO\s+ACTUAL[^$]*\$\s*([\d.]+,\d{2})/i);
  if (!m) return 0;
  const raw = m[1];
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}
