/** obmc-extract-listings-20261107 — deterministic CSS-schema listing extraction (no LLM).
 * Modeled on Crawl4AI JsonCssExtractionStrategy: one baseSelector per listing card, a list of
 * fields (text or attribute). Every returned value is a verbatim string from the page —
 * missing fields stay empty; nothing is inferred, guessed or translated. */

export interface ExtractField {
  name: string;
  selector?: string;
  attr?: string;
}

export interface ExtractSchema {
  baseSelector: string;
  fields: ExtractField[];
  maxRows?: number;
}

export const MAX_ROWS = 40;
export const MAX_VALUE_CHARS = 220;

export function normalizeExtractSchema(input: any): { schema?: ExtractSchema; error?: string } {
  if (!input || typeof input !== 'object') return { error: 'Schema phải là object { baseSelector, fields }' };
  const baseSelector = typeof input.baseSelector === 'string' ? input.baseSelector.trim() : '';
  if (!baseSelector) return { error: 'Thiếu baseSelector (CSS selector của một ô listing)' };
  if (baseSelector.length > 200) return { error: 'baseSelector quá dài (tối đa 200 ký tự)' };
  if (!Array.isArray(input.fields) || input.fields.length === 0) return { error: 'Thiếu mảng fields (mỗi field: name + selector tùy chọn + attr tùy chọn)' };
  if (input.fields.length > 20) return { error: 'Quá nhiều fields (tối đa 20)' };
  const fields: ExtractField[] = [];
  const seen = new Set<string>();
  for (const f of input.fields) {
    if (!f || typeof f !== 'object' || typeof f.name !== 'string' || !f.name.trim()) {
      return { error: 'Mỗi field cần name (kiểu chữ)' };
    }
    const name = f.name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return { error: `Tên field không hợp lệ: ${name} (chỉ chữ, số, _)` };
    if (seen.has(name)) return { error: `Field trùng tên: ${name}` };
    seen.add(name);
    fields.push({
      name,
      selector: typeof f.selector === 'string' && f.selector.trim() ? f.selector.trim().slice(0, 200) : undefined,
      attr: typeof f.attr === 'string' && f.attr.trim() ? f.attr.trim().slice(0, 60) : undefined,
    });
  }
  const maxRows = Math.max(1, Math.min(Number(input.maxRows) || MAX_ROWS, MAX_ROWS));
  return { schema: { baseSelector, fields, maxRows } };
}

/** Clamp a raw DOM value to a bounded verbatim string. */
export function clampRowValue(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_VALUE_CHARS);
}
