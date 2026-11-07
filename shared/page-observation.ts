/** obmc-deep-read-20261107 — collapsed-content affordances and read-progress helpers.
 * A page's key data (spec tables, HS codes, supplier details) is routinely hidden
 * behind "View More" toggles or lazy-loaded sections; these helpers let the scanner
 * expand them before snapshotting and tell the model exactly what it has NOT read. */

export const EXPAND_LABEL_RE =
  /(view more|show more|show all|read more|see more|expand( all)?|查看更多|展开|显示更多|xem thêm)/i;

export const READ_CHUNK = 2000;
export const FULL_TEXT_CAP = 64000;
export const MAX_AUTO_EXPAND = 8;

export interface ExpandControlShape {
  tagName?: string;
  text?: string;
  ariaLabel?: string;
  ariaExpanded?: string | null;
  hasHref?: boolean;
  type?: string | null;
}

/**
 * A click target that only reveals more in-page content — never navigation or form submit.
 * Conservative on purpose: short labels matching the generic expand wording, no <a href>,
 * no submit inputs, not already expanded.
 */
export function isExpandControl(attrs: ExpandControlShape): boolean {
  if (attrs.type === 'submit' || attrs.hasHref) return false;
  const label = `${attrs.text || ''} ${attrs.ariaLabel || ''}`.trim();
  if (!label || label.length > 60) return false;
  if (!EXPAND_LABEL_RE.test(label)) return false;
  return attrs.ariaExpanded == null || attrs.ariaExpanded === 'false';
}

/** Read-progress meta so the model knows what it has NOT seen yet (anti "tưởng đã đọc hết"). */
export function formatReadProgress(opts: { read: number; total: number; collapsed?: number }): string {
  const total = opts.total > 0 ? String(opts.total) : '?';
  const parts = [`đã đọc ${opts.read}/${total} ký tự`];
  if (opts.total > opts.read) parts.push('còn nội dung chưa đọc: gọi browser_get_dom với offset để đọc tiếp');
  if (opts.collapsed && opts.collapsed > 0) parts.push(`${opts.collapsed} mục vẫn còn thu gọn`);
  return parts.join(' · ');
}

/** Paginated slice of the document text; falls back to the excerpt when fullText is absent. */
export function sliceDocumentText(
  fullText: string | undefined,
  excerpt: string,
  offset = 0,
  maxLen = READ_CHUNK
): string {
  const src = fullText && fullText.length ? fullText : excerpt;
  const safeOffset = Math.max(0, Math.min(offset, Math.max(0, src.length - 1)));
  return src.slice(safeOffset, safeOffset + maxLen);
}
