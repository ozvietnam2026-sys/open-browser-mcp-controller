/**
 * Browser Viewport Component
 * Renders web pages (built-in or proxied iframe), scans and tags interactive DOM elements,
 * executes MCP commands, and displays high-fidelity visual action overlays (AI cursor, ripple, typing toast).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { matchesDocument, iframeCommandError } from '../../shared/challenge-state';
import { buildDragPath } from '../../shared/drag-path';
import { BuiltInPages } from './BuiltInPages';
import {
  InteractiveElement,
  DomSnapshot,
  BrowserCommand,
  VisualActionIndicator,
} from '../../shared/browser-types';
import { Camera, MousePointer, Keyboard } from 'lucide-react';
import { sseClient } from '../services/sseClient';

interface BrowserViewportProps {
  activeTabId: string;
  url: string;
  /** Bumped by App on Reload to remount the proxied iframe. */
  reloadNonce?: number;
  navigationId?: number;
  onNavigate: (url: string) => void;
  onTitleChange: (title: string) => void;
  showInspectorOverlay: boolean;
  hoveredRefId?: string | null;
  onSelectElement?: (element: InteractiveElement) => void;
  visualAction?: VisualActionIndicator | null;
  onSnapshotUpdated?: (snapshot: DomSnapshot) => void;
}

export const BrowserViewport: React.FC<BrowserViewportProps> = ({
  activeTabId,
  url,
  reloadNonce = 0,
  navigationId = 0,
  onNavigate,
  onTitleChange,
  showInspectorOverlay,
  hoveredRefId,
  onSelectElement,
  visualAction,
  onSnapshotUpdated,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [elements, setElements] = useState<InteractiveElement[]>([]);
  const [pageTitle, setPageTitle] = useState('Trang web');

  // Visual effects states
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; visible: boolean; label?: string }>({
    x: 100,
    y: 100,
    visible: false,
    label: 'Agent AI',
  });
  const [clickRipples, setClickRipples] = useState<{ id: string; x: number; y: number }[]>([]);
  const [typingToast, setTypingToast] = useState<{ text: string; visible: boolean }>({
    text: '',
    visible: false,
  });
  const [keyToast, setKeyToast] = useState<{ key: string; visible: boolean }>({
    key: '',
    visible: false,
  });
  const [shutterFlash, setShutterFlash] = useState(false);

  const isBuiltIn = url.startsWith('browser://') || !url.startsWith('http');

  // Trigger visual action feedback
  useEffect(() => {
    if (!visualAction) return;

    if (visualAction.type === 'click') {
      const targetX = visualAction.x ?? 300;
      const targetY = visualAction.y ?? 200;

      setCursorPos({ x: targetX, y: targetY, visible: true, label: 'Click' });
      const rippleId = Math.random().toString(36);
      setClickRipples((prev) => [...prev, { id: rippleId, x: targetX, y: targetY }]);

      setTimeout(() => {
        setClickRipples((prev) => prev.filter((r) => r.id !== rippleId));
      }, 800);

      setTimeout(() => {
        setCursorPos((prev) => ({ ...prev, visible: false }));
      }, 1500);
    }

    if (visualAction.type === 'hover') {
      const targetX = visualAction.x ?? 300;
      const targetY = visualAction.y ?? 200;
      setCursorPos({ x: targetX, y: targetY, visible: true, label: 'Hover' });
      setTimeout(() => {
        setCursorPos((prev) => ({ ...prev, visible: false }));
      }, 1500);
    }

    if (visualAction.type === 'type') {
      setTypingToast({ text: visualAction.text || '', visible: true });
      setTimeout(() => {
        setTypingToast((prev) => ({ ...prev, visible: false }));
      }, 2000);
    }

    if (visualAction.type === 'key') {
      setKeyToast({ key: visualAction.key || '', visible: true });
      setTimeout(() => {
        setKeyToast((prev) => ({ ...prev, visible: false }));
      }, 1500);
    }

    if (visualAction.type === 'screenshot') {
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 300);
    }
  }, [visualAction]);

  // Capture canvas screenshot of viewport
  const captureViewportScreenshot = useCallback(() => {
    if (!containerRef.current) return '';
    try {
      const canvas = document.createElement('canvas');
      const width = containerRef.current.clientWidth || 1024;
      const height = containerRef.current.clientHeight || 768;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);

        // Header bar simulation
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, width, 44);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(pageTitle, 16, 27);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';
        ctx.fillText(url, width - 280, 27);

        // Content excerpt
        ctx.fillStyle = '#f8fafc';
        ctx.font = '13px sans-serif';
        const rawText = containerRef.current.innerText.split('\n').filter(Boolean);
        let yPos = 80;
        for (let i = 0; i < Math.min(rawText.length, 25); i++) {
          ctx.fillText(rawText[i].substring(0, 110), 24, yPos);
          yPos += 24;
        }

        const dataUrl = canvas.toDataURL('image/png');
        fetch('/api/browser/screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tabId: activeTabId, url, navigationId, dataUrl }),
        }).catch(() => {});
        return dataUrl;
      }
    } catch (e) {
      console.error('Screenshot error:', e);
    }
    return '';
  }, [activeTabId, pageTitle, url, navigationId]);

  const onSnapshotUpdatedRef = useRef(onSnapshotUpdated);
  const onTitleChangeRef = useRef(onTitleChange);
  const pageTitleRef = useRef(pageTitle);
  const activeTabIdRef = useRef(activeTabId);
  const isBuiltInRef = useRef(isBuiltIn);
  const lastPostedFingerprintRef = useRef('');
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onSnapshotUpdatedRef.current = onSnapshotUpdated;
    onTitleChangeRef.current = onTitleChange;
    pageTitleRef.current = pageTitle;
    activeTabIdRef.current = activeTabId;
    isBuiltInRef.current = isBuiltIn;
  });

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  // Scan interactive elements in built-in view
  const scanBuiltInElements = useCallback(() => {
    if (!containerRef.current) return;

    const selectors =
      'a, button, input, textarea, select, [role="button"], [role="link"], [data-interactive="true"]';
    const nodes = Array.from(containerRef.current.querySelectorAll(selectors)) as HTMLElement[];
    const containerRect = containerRef.current.getBoundingClientRect();

    const scanned: InteractiveElement[] = [];
    let counter = 1;

    nodes.forEach((node) => {
      if (!node.isConnected) return;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0
      )
        return;
      if (rect.width <= 0 || rect.height <= 0) return;

      const refId = `@ref:${counter}`;
      node.setAttribute('data-mcp-ref', String(counter));
      node.setAttribute('data-mcp-ref-id', refId);

      const tagName = node.tagName.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
      const text = (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ');

      scanned.push({
        refId,
        index: counter,
        tagName,
        type: node.getAttribute('type') || (tagName === 'textarea' ? 'textarea' : undefined),
        id: node.id || undefined,
        name: node.getAttribute('name') || undefined,
        text: text.substring(0, 80),
        value: isInput ? (node as HTMLInputElement).value : undefined,
        placeholder: node.getAttribute('placeholder') || undefined,
        href: node.getAttribute('href') || undefined,
        ariaLabel: node.getAttribute('aria-label') || undefined,
        boundingBox: {
          x: Math.round(rect.left - containerRect.left),
          y: Math.round(rect.top - containerRect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        isClickable: true,
        isInput,
        selector: node.id
          ? `#${node.id}`
          : node.className
          ? `${tagName}.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : tagName,
      });

      counter++;
    });

    setElements(scanned);

    // obmc-deep-read-20261107 — full text + read-progress meta alongside the 2000-char excerpt.
    const bodyText = containerRef.current.innerText || '';
    const collapsedControls = containerRef.current.querySelectorAll('[aria-expanded="false"]').length;
    const textExcerpt = bodyText.substring(0, 2000);
    const snapshot: DomSnapshot = {
      tabId: activeTabId, navigationId,
      url,
      title: pageTitleRef.current,
      interactiveElements: scanned,
      simplifiedTree: scanned
        .map((el) => {
          const details = [
            el.text ? `"${el.text.substring(0, 40)}"` : '',
            el.placeholder ? `placeholder="${el.placeholder}"` : '',
            el.value ? `value="${el.value}"` : '',
            el.id ? `id="${el.id}"` : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `${el.refId} <${el.tagName}${el.type ? ` type="${el.type}"` : ''}> ${details}`;
        })
        .join('\n'),
      textExcerpt,
      fullText: bodyText.substring(0, 64000),
      textTotalLength: bodyText.length,
      collapsedControls,
      scrollPosition: {
        x: containerRef.current.scrollLeft,
        y: containerRef.current.scrollTop,
        maxScrollY: containerRef.current.scrollHeight - containerRef.current.clientHeight,
      },
      timestamp: Date.now(),
    };

    onSnapshotUpdatedRef.current?.(snapshot);

    const fingerprint = `${activeTabId}:${navigationId}|${snapshot.url}|${snapshot.title}|${scanned.length}|${bodyText.length}|${collapsedControls}`;
    if (fingerprint === lastPostedFingerprintRef.current) return;
    lastPostedFingerprintRef.current = fingerprint;

    fetch('/api/browser/dom-snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId: activeTabIdRef.current, snapshot }),
    }).catch(() => {});
  }, [url, activeTabId, navigationId]);

  const scheduleScan = useCallback(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = setTimeout(() => {
      scanTimerRef.current = null;
      scanBuiltInElements();
    }, 350);
  }, [scanBuiltInElements]);

  const handlePageLoaded = useCallback((title: string) => {
    setPageTitle((prev) => (prev === title ? prev : title));
    onTitleChangeRef.current?.(title);
    scheduleScan();
  }, [scheduleScan]);

  useEffect(() => {
    if (isBuiltIn) {
      scheduleScan();
      return () => {
        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      };
    }
  }, [isBuiltIn, url, activeTabId, scheduleScan]);

  // Window postMessage listener for proxied iframe bridge
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || e.source !== iframeRef.current?.contentWindow) return;
      const currentDocument = { id: activeTabId, url, navigationId } as any;

      if (data.type === 'MCP_DOM_SNAPSHOT' && data.snapshot) {
        if (!matchesDocument(currentDocument, data.snapshot)) return;
        const els = data.snapshot.interactiveElements || [];
        setElements(els);
        setPageTitle(data.snapshot.title || 'Trang web');
        onTitleChange(data.snapshot.title || 'Trang web');
        onSnapshotUpdated?.(data.snapshot);

        const fingerprint = `${activeTabId}:${navigationId}|${data.snapshot.url}|${data.snapshot.title}|${els.length}|${(data.snapshot.textExcerpt || '').length}|${data.snapshot.textTotalLength ?? 0}`;
        if (fingerprint === lastPostedFingerprintRef.current) return;
        lastPostedFingerprintRef.current = fingerprint;

        fetch('/api/browser/dom-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tabId: activeTabId, snapshot: data.snapshot }),
        }).catch(() => {});
      }

      if (data.type === 'MCP_NAVIGATE_REQUEST' && data.url) {
        onNavigate(data.url);
      }

      if (data.type === 'MCP_COMMAND_COMPLETED') {
        if (!matchesDocument(currentDocument, data.identity)) return;
        fetch('/api/browser/command-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }).catch(() => {});
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeTabId, url, navigationId, onNavigate, onTitleChange, onSnapshotUpdated]);

  // Execute MCP command locally on the viewport
  const executeLocalCommand = useCallback(
    (cmd: BrowserCommand) => {
      const targetContainer = containerRef.current;
      if (!targetContainer) return;

      if (cmd.type === 'click') {
        let targetNode: HTMLElement | null = null;
        if (cmd.params.ref) {
          const num = cmd.params.ref.replace('@ref:', '');
          targetNode = targetContainer.querySelector(`[data-mcp-ref="${num}"]`);
        }
        if (!targetNode && cmd.params.selector) {
          targetNode = targetContainer.querySelector(cmd.params.selector);
        }
        if (!targetNode && typeof cmd.params.x === 'number' && typeof cmd.params.y === 'number') {
          targetNode = document.elementFromPoint(cmd.params.x, cmd.params.y) as HTMLElement;
        }

        if (targetNode) {
          const rect = targetNode.getBoundingClientRect();
          const containerRect = targetContainer.getBoundingClientRect();
          const clickX = Math.round(rect.left - containerRect.left + rect.width / 2);
          const clickY = Math.round(rect.top - containerRect.top + rect.height / 2);

          setCursorPos({ x: clickX, y: clickY, visible: true, label: 'Click' });
          const rippleId = Math.random().toString(36);
          setClickRipples((prev) => [...prev, { id: rippleId, x: clickX, y: clickY }]);
          setTimeout(() => setClickRipples((prev) => prev.filter((r) => r.id !== rippleId)), 700);

          targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            targetNode!.click();
            if (typeof targetNode!.focus === 'function') targetNode!.focus();
            scanBuiltInElements();

            fetch('/api/browser/command-result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                commandId: cmd.id,
                success: true,
                data: {
                  elementDesc:
                    targetNode!.tagName.toLowerCase() + (targetNode!.id ? `#${targetNode!.id}` : ''),
                  ref: cmd.params.ref,
                },
              }),
            }).catch(() => {});
          }, 150);
        } else {
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: false,
              error: `Không tìm thấy phần tử ${cmd.params.ref || cmd.params.selector}`,
            }),
          }).catch(() => {});
        }
      }

      if (cmd.type === 'drag') {
        const report = (success: boolean, data?: any, error?: string) =>
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandId: cmd.id, success, data, error }),
          }).catch(() => {});
        const find = (ref?: string, sel?: string): HTMLElement | null => {
          if (ref) {
            const el = targetContainer.querySelector(`[data-mcp-ref="${ref.replace('@ref:', '')}"]`);
            if (el) return el as HTMLElement;
          }
          if (sel) {
            try { return targetContainer.querySelector(sel) as HTMLElement | null; } catch { return null; }
          }
          return null;
        };
        const center = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const p = cmd.params || {};
        const fromEl = find(p.fromRef, p.fromSelector);
        const start = fromEl
          ? center(fromEl)
          : typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null;
        const toEl = find(p.toRef, p.toSelector);
        const end = toEl
          ? center(toEl)
          : typeof p.toX === 'number' ? { x: p.toX, y: typeof p.toY === 'number' ? p.toY : start?.y ?? 0 } : null;
        if (!start || !end) {
          report(false, undefined, 'Thiếu điểm đầu/điểm cuối để kéo');
          return;
        }
        // Resolve the element under a viewport point; descend into same-origin iframes.
        const hit = (pt: { x: number; y: number }) => {
          let doc: Document = document;
          let x = pt.x, y = pt.y;
          let view: Window = window;
          let el = doc.elementFromPoint(x, y) as HTMLElement | null;
          for (let depth = 0; el && el.tagName === 'IFRAME' && depth < 3; depth++) {
            const fr = el as HTMLIFrameElement;
            let inner: Document | null = null;
            try { inner = fr.contentDocument; } catch { inner = null; }
            if (!inner || !fr.contentWindow) break; // cross-origin: cannot reach
            const r = fr.getBoundingClientRect();
            x -= r.left; y -= r.top; doc = inner; view = fr.contentWindow;
            el = doc.elementFromPoint(x, y) as HTMLElement | null;
          }
          return { el, x, y, view };
        };
        const first = fromEl ? { el: fromEl, x: start.x, y: start.y, view: window } : hit(start);
        const target = first.el;
        if (!target) {
          report(false, undefined, `Không có phần tử tại (${start.x}, ${start.y})`);
          return;
        }
        const pts = buildDragPath(start, end, p.steps ?? 25);
        const offX = first.x - start.x, offY = first.y - start.y;
        const fire = (el: Element, type: string, pt: { x: number; y: number }, buttons: number) => {
          const init: any = {
            bubbles: true, cancelable: true, composed: true, view: first.view,
            clientX: pt.x + offX, clientY: pt.y + offY, screenX: pt.x, screenY: pt.y,
            button: 0, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true, pressure: buttons ? 0.5 : 0,
          };
          const PE = (first.view as any).PointerEvent || (window as any).PointerEvent;
          const ME = (first.view as any).MouseEvent || MouseEvent;
          if (type.startsWith('pointer') && PE) el.dispatchEvent(new PE(type, init));
          else if (!type.startsWith('pointer')) el.dispatchEvent(new ME(type, init));
        };
        const contRect = targetContainer.getBoundingClientRect();
        const showCursor = (pt: { x: number; y: number }) =>
          setCursorPos({ x: Math.round(pt.x - contRect.left), y: Math.round(pt.y - contRect.top), visible: true, label: 'Drag' });
        showCursor(start);
        fire(target, 'pointerover', start, 0);
        fire(target, 'mouseover', start, 0);
        fire(target, 'pointerdown', start, 1);
        fire(target, 'mousedown', start, 1);
        let i = 1;
        const tick = () => {
          if (i < pts.length) {
            const pt = pts[i++];
            showCursor(pt);
            // move events go to the pressed element and bubble to the doc, like captured pointer
            fire(target, 'pointermove', pt, 1);
            fire(target, 'mousemove', pt, 1);
            setTimeout(tick, 12 + Math.round(Math.random() * 10));
            return;
          }
          fire(target, 'pointerup', end, 0);
          fire(target, 'mouseup', end, 0);
          scanBuiltInElements();
          report(true, { from: start, to: end, steps: pts.length, element: target.tagName.toLowerCase() });
        };
        setTimeout(tick, 30);
      }

      if (cmd.type === 'hover') {
        let targetNode: HTMLElement | null = null;
        if (cmd.params.ref) {
          const num = cmd.params.ref.replace('@ref:', '');
          targetNode = targetContainer.querySelector(`[data-mcp-ref="${num}"]`);
        }
        if (!targetNode && cmd.params.selector) {
          targetNode = targetContainer.querySelector(cmd.params.selector);
        }

        if (targetNode) {
          const rect = targetNode.getBoundingClientRect();
          const containerRect = targetContainer.getBoundingClientRect();
          const hoverX = Math.round(rect.left - containerRect.left + rect.width / 2);
          const hoverY = Math.round(rect.top - containerRect.top + rect.height / 2);

          setCursorPos({ x: hoverX, y: hoverY, visible: true, label: 'Hover' });
          targetNode.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          targetNode.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

          setTimeout(() => {
            fetch('/api/browser/command-result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                commandId: cmd.id,
                success: true,
              }),
            }).catch(() => {});
          }, 150);
        } else {
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: false,
              error: 'Không tìm thấy phần tử để hover',
            }),
          }).catch(() => {});
        }
      }

      if (cmd.type === 'type') {
        let inputNode: HTMLInputElement | HTMLTextAreaElement | null = null;
        if (cmd.params.ref) {
          const num = cmd.params.ref.replace('@ref:', '');
          inputNode = targetContainer.querySelector(`[data-mcp-ref="${num}"]`);
        }
        if (!inputNode && cmd.params.selector) {
          inputNode = targetContainer.querySelector(cmd.params.selector);
        }
        if (!inputNode) {
          inputNode =
            targetContainer.querySelector('input:focus, textarea:focus') ||
            targetContainer.querySelector('input, textarea');
        }

        if (inputNode && (inputNode.tagName === 'INPUT' || inputNode.tagName === 'TEXTAREA')) {
          inputNode.focus();
          setTypingToast({ text: cmd.params.text || '', visible: true });
          setTimeout(() => setTypingToast((prev) => ({ ...prev, visible: false })), 1800);

          if (cmd.params.clearFirst !== false) {
            inputNode.value = '';
          }
          inputNode.value = (inputNode.value || '') + (cmd.params.text || '');

          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(inputNode, inputNode.value);
          }
          inputNode.dispatchEvent(new Event('input', { bubbles: true }));
          inputNode.dispatchEvent(new Event('change', { bubbles: true }));

          if (cmd.params.pressEnter) {
            inputNode.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
            );
            if (inputNode.form) {
              inputNode.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
          }

          scanBuiltInElements();

          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: true,
              data: { value: inputNode.value },
            }),
          }).catch(() => {});
        } else {
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: false,
              error: 'Không tìm thấy ô nhập liệu hợp lệ',
            }),
          }).catch(() => {});
        }
      }

      if (cmd.type === 'press_key') {
        const key = cmd.params.key || 'Enter';
        setKeyToast({ key, visible: true });
        setTimeout(() => setKeyToast((prev) => ({ ...prev, visible: false })), 1500);

        let target = document.activeElement as HTMLElement || targetContainer;
        if (cmd.params.ref) {
          const num = cmd.params.ref.replace('@ref:', '');
          target = targetContainer.querySelector(`[data-mcp-ref="${num}"]`) || target;
        }

        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));

        fetch('/api/browser/command-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commandId: cmd.id,
            success: true,
          }),
        }).catch(() => {});
      }

      if (cmd.type === 'select_option') {
        let selectNode: HTMLSelectElement | null = null;
        if (cmd.params.ref) {
          const num = cmd.params.ref.replace('@ref:', '');
          selectNode = targetContainer.querySelector(`[data-mcp-ref="${num}"]`);
        }
        if (!selectNode && cmd.params.selector) {
          selectNode = targetContainer.querySelector(cmd.params.selector);
        }

        if (selectNode && selectNode.tagName === 'SELECT') {
          if (cmd.params.value !== undefined) {
            selectNode.value = cmd.params.value;
          } else if (typeof cmd.params.index === 'number') {
            selectNode.selectedIndex = cmd.params.index;
          }
          selectNode.dispatchEvent(new Event('change', { bubbles: true }));
          scanBuiltInElements();

          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: true,
              data: { value: selectNode.value },
            }),
          }).catch(() => {});
        } else {
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: false,
              error: 'Không tìm thấy thẻ select',
            }),
          }).catch(() => {});
        }
      }

      if (cmd.type === 'fill_form') {
        const fields = cmd.params.fields || {};
        let filledCount = 0;

        for (const [key, val] of Object.entries(fields)) {
          let fieldNode: HTMLInputElement | HTMLTextAreaElement | null = null;
          if (key.startsWith('@ref:')) {
            const num = key.replace('@ref:', '');
            fieldNode = targetContainer.querySelector(`[data-mcp-ref="${num}"]`);
          } else if (key.startsWith('#') || key.startsWith('.')) {
            fieldNode = targetContainer.querySelector(key);
          } else {
            fieldNode = targetContainer.querySelector(`[name="${key}"]`);
          }

          if (fieldNode && (fieldNode.tagName === 'INPUT' || fieldNode.tagName === 'TEXTAREA')) {
            fieldNode.value = String(val);
            fieldNode.dispatchEvent(new Event('input', { bubbles: true }));
            fieldNode.dispatchEvent(new Event('change', { bubbles: true }));
            filledCount++;
          }
        }

        if (cmd.params.submitAfter && cmd.params.submitRef) {
          const num = cmd.params.submitRef.replace('@ref:', '');
          const submitBtn: HTMLElement | null = targetContainer.querySelector(`[data-mcp-ref="${num}"]`);
          if (submitBtn) {
            submitBtn.click();
          }
        }

        scanBuiltInElements();

        fetch('/api/browser/command-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commandId: cmd.id,
            success: true,
            data: { filledCount },
          }),
        }).catch(() => {});
      }

      if (cmd.type === 'extract_content') {
        const text = targetContainer.innerText.substring(0, 4000);
        const links = Array.from(targetContainer.querySelectorAll('a')).map((a) => ({
          text: a.innerText.trim(),
          href: a.href,
        }));

        fetch('/api/browser/command-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commandId: cmd.id,
            success: !!text.trim(),
            error: text.trim() ? undefined : 'Empty extract; no listing evidence',
            data: {
              tabId: activeTabId, navigationId,
              title: pageTitle,
              url,
              excerpt: text,
              linksCount: links.length,
              links: links.slice(0, 15),
            },
          }),
        }).catch(() => {});
      }

      if (cmd.type === 'scroll') {
        const amount = cmd.params.amount || 400;
        if (cmd.params.direction === 'down') {
          targetContainer.scrollBy({ top: amount, behavior: 'smooth' });
        } else if (cmd.params.direction === 'up') {
          targetContainer.scrollBy({ top: -amount, behavior: 'smooth' });
        } else if (cmd.params.direction === 'top') {
          targetContainer.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (cmd.params.direction === 'bottom') {
          targetContainer.scrollTo({ top: targetContainer.scrollHeight, behavior: 'smooth' });
        }

        setTimeout(() => {
          scanBuiltInElements();
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: true,
            }),
          }).catch(() => {});
        }, 200);
      }

      if (cmd.type === 'screenshot') {
        setShutterFlash(true);
        setTimeout(() => setShutterFlash(false), 300);

        const dataUrl = captureViewportScreenshot();

        fetch('/api/browser/command-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commandId: cmd.id,
            success: true,
            data: { dataUrl },
          }),
        }).catch(() => {});
      }

      if (cmd.type === 'evaluate') {
        try {
          // eslint-disable-next-line no-eval
          const result = eval(cmd.params.script);
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: true,
              data: { result: String(result) },
            }),
          }).catch(() => {});
        } catch (err: any) {
          fetch('/api/browser/command-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              success: false,
              error: err?.message,
            }),
          }).catch(() => {});
        }
      }
    },
    [scanBuiltInElements, captureViewportScreenshot, pageTitle, url, activeTabId, navigationId]
  );

  // Listen for execute_command via singleton sseClient
  useEffect(() => {
    const unsubscribe = sseClient.subscribe('execute_command', (cmd: BrowserCommand) => {
      try {
        if (!cmd) return;
        if (cmd.tabId && cmd.tabId !== activeTabIdRef.current) return;

        const reject = (error: string) => fetch('/api/browser/command-result', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commandId: cmd.id, success: false, error }),
        }).catch(() => {});
        if (!matchesDocument({ id: activeTabId, url, navigationId } as any,
          { tabId: cmd.tabId, url: cmd.url, navigationId: cmd.navigationId })) {
          reject('Stale command: viewport document mismatch'); return;
        }
        if (!isBuiltInRef.current) {
          const error = iframeCommandError(cmd.type);
          if (error) { reject(error); return; }
        }
        if (isBuiltInRef.current) {
          executeLocalCommand(cmd);
        } else if (iframeRef.current && iframeRef.current.contentWindow) {
          if (cmd.type === 'click') {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'MCP_EXECUTE_CLICK',
                commandId: cmd.id,
                ref: cmd.params?.ref,
                selector: cmd.params?.selector,
                x: cmd.params?.x,
                y: cmd.params?.y,
              },
              '*'
            );
          } else if (cmd.type === 'type') {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'MCP_EXECUTE_TYPE',
                commandId: cmd.id,
                ref: cmd.params?.ref,
                selector: cmd.params?.selector,
                text: cmd.params?.text,
                clearFirst: cmd.params?.clearFirst,
                pressEnter: cmd.params?.pressEnter,
              },
              '*'
            );
          } else if (cmd.type === 'scroll') {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'MCP_EXECUTE_SCROLL',
                commandId: cmd.id,
                direction: cmd.params?.direction,
                amount: cmd.params?.amount,
              },
              '*'
            );
          } else if (cmd.type === 'extract_css') {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'MCP_EXECUTE_EXTRACT_CSS',
                commandId: cmd.id,
                baseSelector: cmd.params?.baseSelector,
                fields: cmd.params?.fields,
                maxRows: cmd.params?.maxRows,
              },
              '*'
            );
          }
        }
      } catch (err) {
        console.error('Error handling execute_command:', err);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [executeLocalCommand, activeTabId, url, navigationId]);

  const proxyUrl = `/api/browser/proxy?url=${encodeURIComponent(url)}&tabId=${activeTabId}&navigationId=${navigationId}`;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 select-text">
      {/* Scrollable Viewport Canvas */}
      <div
        ref={containerRef}
        id="browser-viewport-canvas"
        className="w-full h-full overflow-y-auto overflow-x-hidden relative"
      >
        {isBuiltIn ? (
          <BuiltInPages
            url={url}
            onNavigate={onNavigate}
            onPageLoaded={handlePageLoaded}
          />
        ) : (
          <iframe
            key={`${activeTabId}:${url}:${navigationId}:${reloadNonce}`}
            ref={iframeRef}
            src={`${proxyUrl}&_r=${reloadNonce}`}
            title={pageTitle}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
          />
        )}

        {/* DOM Inspector Element Bounding Boxes Overlay */}
        {showInspectorOverlay && isBuiltIn && (
          <div className="absolute inset-0 pointer-events-none z-30">
            {elements.slice(0, 80).map((el) => {
              const isHovered = hoveredRefId === el.refId;
              return (
                <div
                  key={el.refId}
                  style={{
                    left: `${el.boundingBox.x}px`,
                    top: `${el.boundingBox.y}px`,
                    width: `${Math.max(el.boundingBox.width, 24)}px`,
                    height: `${Math.max(el.boundingBox.height, 20)}px`,
                  }}
                  className={`absolute rounded transition-all duration-150 pointer-events-auto cursor-pointer ${
                    isHovered
                      ? 'border-2 border-amber-400 bg-amber-400/20 shadow-lg shadow-amber-500/20 z-40'
                      : 'border border-sky-500/60 bg-sky-500/10 hover:border-amber-400 hover:bg-amber-400/20'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectElement?.(el);
                  }}
                  title={`${el.refId} <${el.tagName}> ${el.text || el.placeholder || ''}`}
                >
                  <span
                    className={`absolute -top-3.5 left-0 px-1 py-0.5 text-[9px] font-mono font-bold rounded shadow-xs select-none ${
                      isHovered
                        ? 'bg-amber-400 text-slate-950 scale-110'
                        : 'bg-sky-600 text-white'
                    }`}
                  >
                    {el.refId}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Visual Feedback: Simulated AI Mouse Cursor */}
      {cursorPos.visible && (
        <div
          style={{
            transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)`,
            transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="pointer-events-none absolute top-0 left-0 z-50 flex items-center gap-1.5"
        >
          <div className="relative">
            <MousePointer className="w-6 h-6 text-indigo-400 fill-indigo-500 drop-shadow-md -translate-x-1 -translate-y-1" />
            <span className="absolute left-4 top-2 px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-bold shadow whitespace-nowrap">
              {cursorPos.label || 'Agent AI'}
            </span>
          </div>
        </div>
      )}

      {/* Visual Feedback: Click Ripple Pulses */}
      {clickRipples.map((ripple) => (
        <div
          key={ripple.id}
          style={{
            left: `${ripple.x}px`,
            top: `${ripple.y}px`,
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-50"
        >
          <div className="w-8 h-8 rounded-full border-2 border-indigo-400 bg-indigo-500/30 animate-ping opacity-90" />
        </div>
      ))}

      {/* Visual Feedback: AI Typing Toast */}
      {typingToast.visible && (
        <div className="pointer-events-none absolute bottom-5 left-6 z-50 flex items-center gap-2 px-3 py-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg shadow-xl backdrop-blur-sm text-xs text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Keyboard className="w-4 h-4 text-sky-400" />
          <span className="text-slate-400">Agent đang gõ:</span>
          <span className="font-mono text-sky-300 font-semibold truncate max-w-xs">
            "{typingToast.text}"
          </span>
        </div>
      )}

      {/* Visual Feedback: Key Toast */}
      {keyToast.visible && (
        <div className="pointer-events-none absolute bottom-5 left-6 z-50 flex items-center gap-2 px-3 py-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg shadow-xl backdrop-blur-sm text-xs text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Keyboard className="w-4 h-4 text-amber-400" />
          <span className="text-slate-400">Phím gửi:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-amber-300 font-bold">
            {keyToast.key}
          </kbd>
        </div>
      )}

      {/* Visual Feedback: Screenshot Camera Shutter Flash */}
      {shutterFlash && (
        <div className="pointer-events-none absolute inset-0 z-50 bg-white/40 backdrop-blur-sm animate-out fade-out duration-300 flex items-center justify-center">
          <div className="p-3 bg-slate-900/80 rounded-full border border-slate-700 shadow-2xl">
            <Camera className="w-8 h-8 text-sky-400" />
          </div>
        </div>
      )}
    </div>
  );
};
