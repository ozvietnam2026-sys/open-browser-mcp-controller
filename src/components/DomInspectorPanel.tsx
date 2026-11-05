/**
 * DOM Inspector & Accessibility Tree Panel
 * Visualizes scanned interactive elements, their @ref identifiers, selectors,
 * and allows instant click/type testing on highlighted targets.
 */

import React, { useState } from 'react';
import { Search, MousePointer, Keyboard, Copy, Check } from 'lucide-react';
import { InteractiveElement, DomSnapshot } from '../../shared/browser-types';

interface DomInspectorPanelProps {
  onClose: () => void;
  snapshot?: DomSnapshot;
  onHoverRef: (refId: string | null) => void;
  onExecuteClick: (refId: string) => void;
  onExecuteType: (refId: string, text: string) => void;
}

export const DomInspectorPanel: React.FC<DomInspectorPanelProps> = ({
  onClose,
  snapshot,
  onHoverRef,
  onExecuteClick,
  onExecuteType,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'elements' | 'tree'>('elements');
  const [typePromptRef, setTypePromptRef] = useState<string | null>(null);
  const [typeText, setTypeText] = useState('');
  const [copied, setCopied] = useState(false);

  const elements = snapshot?.interactiveElements || [];

  const filteredElements = elements.filter(
    (el) =>
      el.refId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      el.tagName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      el.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (el.placeholder && el.placeholder.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (el.id && el.id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const copySimplifiedTree = () => {
    navigator.clipboard.writeText(snapshot?.simplifiedTree || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <aside className="w-96 h-full bg-slate-900 border-l border-slate-800 flex flex-col justify-between select-text shrink-0">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-white">
            <Search className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>DOM & Interactive Inspector</span>
              <span className="text-[10px] font-mono text-sky-400">({elements.length} phần tử)</span>
            </h2>
            <p className="text-[10px] text-slate-400">Các phần tử gắn mã @ref cho Agent điều khiển</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          title="Đóng panel"
        >
          ✕
        </button>
      </div>

      {/* Mode Switch & Search */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 space-y-2">
        <div className="flex bg-slate-800 p-1 rounded-lg gap-1">
          <button
            onClick={() => setViewMode('elements')}
            className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'elements'
                ? 'bg-slate-700 text-sky-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Phần tử tương tác ({elements.length})
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'tree'
                ? 'bg-slate-700 text-sky-400 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Cây phân cấp (Tree)
          </button>
        </div>

        {viewMode === 'elements' && (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Lọc theo ref, tag, id hoặc text..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        )}
      </div>

      {/* List or Tree View */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 font-sans">
        {viewMode === 'elements' ? (
          filteredElements.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              Không tìm thấy phần tử nào phù hợp.
            </div>
          ) : (
            filteredElements.map((el) => (
              <div
                key={el.refId}
                onMouseEnter={() => onHoverRef(el.refId)}
                onMouseLeave={() => onHoverRef(null)}
                className="p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-sky-500/60 transition-all text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white font-mono font-bold text-[10px]">
                      {el.refId}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-amber-300">
                      &lt;{el.tagName}
                      {el.type ? ` type="${el.type}"` : ''}&gt;
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {el.isClickable && (
                      <button
                        onClick={() => onExecuteClick(el.refId)}
                        className="px-2 py-0.5 rounded bg-slate-700 hover:bg-sky-600 text-slate-200 hover:text-white text-[10px] flex items-center gap-1 transition-colors"
                        title="Click phần tử này"
                      >
                        <MousePointer className="w-2.5 h-2.5" />
                        <span>Click</span>
                      </button>
                    )}

                    {el.isInput && (
                      <button
                        onClick={() => {
                          setTypePromptRef(typePromptRef === el.refId ? null : el.refId);
                          setTypeText('');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-700 hover:bg-emerald-600 text-slate-200 hover:text-white text-[10px] flex items-center gap-1 transition-colors"
                        title="Gõ văn bản vào ô này"
                      >
                        <Keyboard className="w-2.5 h-2.5" />
                        <span>Gõ</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Text or placeholder */}
                {el.text && (
                  <p className="text-slate-300 text-[11px] font-medium truncate">
                    "{el.text}"
                  </p>
                )}

                {el.placeholder && (
                  <p className="text-slate-400 text-[10px] italic">
                    placeholder: "{el.placeholder}"
                  </p>
                )}

                {/* Inline type input prompt */}
                {typePromptRef === el.refId && (
                  <div className="mt-2 pt-2 border-t border-slate-700/60 flex gap-1.5 animate-in fade-in duration-150">
                    <input
                      type="text"
                      autoFocus
                      value={typeText}
                      onChange={(e) => setTypeText(e.target.value)}
                      placeholder="Nhập nội dung cần gõ..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => {
                        if (typeText) {
                          onExecuteType(el.refId, typeText);
                          setTypePromptRef(null);
                        }
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium"
                    >
                      Gửi
                    </button>
                  </div>
                )}

                {/* Selector & bounding box details */}
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-700/40">
                  <span className="truncate max-w-[180px]">{el.selector}</span>
                  <span>
                    {el.boundingBox.width}x{el.boundingBox.height}px
                  </span>
                </div>
              </div>
            ))
          )
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Mô tả cây phần tử đã rút gọn:</span>
              <button
                onClick={copySimplifiedTree}
                className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>Sao chép</span>
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap max-h-[70vh]">
              {snapshot?.simplifiedTree || 'Chưa có cấu trúc DOM.'}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
        <span>Tiêu đề trang: {snapshot?.title || 'Chưa xác định'}</span>
        <span className="font-mono text-sky-400">@ref Ready</span>
      </div>
    </aside>
  );
};
