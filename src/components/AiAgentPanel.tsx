/**
 * AI Browser Agent Panel
 * Powered by Gemini 3.8 Flash server-side agent.
 * Dispatches autonomous browsing tasks and displays step-by-step reasoning, tool invocations, and answers.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Bot,
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Terminal,
  RotateCcw,
  MousePointer,
  Keyboard,
  Globe,
  Camera,
  Layers,
} from 'lucide-react';
import { AgentStep, AgentState } from '../../shared/browser-types';

interface AiAgentPanelProps {
  onClose: () => void;
  activeTabUrl: string;
}

export const AiAgentPanel: React.FC<AiAgentPanelProps> = ({ onClose, activeTabUrl }) => {
  const [taskInput, setTaskInput] = useState('');
  const [agentState, setAgentState] = useState<AgentState>({
    isRunning: false,
    status: 'idle',
    task: '',
    steps: [],
    currentStepIndex: 0,
  });

  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const activeJobIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as new steps arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agentState.steps]);

  const presetTasks = [
    {
      title: 'Mua Laptop trên NovaTech Store',
      prompt: 'Mở cửa hàng browser://store, tìm laptop NovaBook Pro 16 AI Studio và bấm Thêm vào giỏ hàng.',
    },
    {
      title: 'Tìm thời tiết trên AeroSearch',
      prompt: 'Vào browser://search, gõ tìm kiếm "thời tiết hôm nay", bấm tìm kiếm và tóm tắt nhiệt độ.',
    },
    {
      title: 'Điền form đăng ký Test Lab',
      prompt: 'Vào browser://forms, điền họ tên "Nguyễn Văn An", email "an.nguyen@example.com", bấm nút Gửi thông tin.',
    },
    {
      title: 'Đọc tin tức công nghệ',
      prompt: 'Mở browser://news, đọc bài viết về MCP, bấm thích bài viết và bình luận "MCP rất tiện lợi".',
    },
  ];

  const handleStartTask = async (taskToRun?: string) => {
    const finalTask = taskToRun || taskInput;
    if (!finalTask.trim() || agentState.isRunning) return;

    const jobId = 'agent-' + Date.now();
    activeJobIdRef.current = jobId;

    setAgentState({
      isRunning: true,
      status: 'running',
      task: finalTask,
      steps: [],
      currentStepIndex: 0,
    });

    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: finalTask, jobId }),
      });

      if (!response.body) {
        throw new Error('No readable stream received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          if (!block.trim()) continue;
          const eventMatch = block.match(/event:\s*([^\n]+)/);
          const dataMatch = block.match(/data:\s*([\s\S]+)/);

          const eventType = eventMatch ? eventMatch[1].trim() : 'message';
          const rawData = dataMatch ? dataMatch[1].trim() : '';

          // obmc-human-assist-20261107 — agent paused for a human action in the pane
          if (eventType === 'agent_waiting' && rawData) {
            try {
              const waitObj = JSON.parse(rawData);
              setAgentState((prev) => ({
                ...prev,
                isRunning: true,
                status: 'waiting_user',
                waitingReason: waitObj.reason || 'Agent cần bạn thao tác trên trang rồi bấm Tiếp tục',
              }));
            } catch (e) {}
          }

          if (eventType === 'agent_step' && rawData) {
            try {
              const step: AgentStep = JSON.parse(rawData);
              setAgentState((prev) => {
                const existingIdx = prev.steps.findIndex((s) => s.stepNumber === step.stepNumber);
                let newSteps = [...prev.steps];
                if (existingIdx >= 0) {
                  newSteps[existingIdx] = step;
                } else {
                  newSteps.push(step);
                }
                return {
                  ...prev,
                  steps: newSteps,
                  currentStepIndex: step.stepNumber,
                  status: prev.status === 'waiting_user' ? 'running' : prev.status,
                };
              });

              // Auto expand newest step
              setExpandedSteps((prev) => ({ ...prev, [step.stepNumber]: true }));
            } catch (err) {
              console.error('Failed to parse agent step:', err);
            }
          }

          if (eventType === 'agent_done' && rawData) {
            setAgentState((prev) => ({
              ...prev,
              isRunning: false,
              status: 'completed',
            }));
          }

          if (eventType === 'agent_error' && rawData) {
            try {
              const errObj = JSON.parse(rawData);
              setAgentState((prev) => ({
                ...prev,
                isRunning: false,
                status: 'error',
                error: errObj.error,
              }));
            } catch (e) {}
          }
        }
      }
    } catch (err: any) {
      setAgentState((prev) => ({
        ...prev,
        isRunning: false,
        status: 'error',
        error: err?.message || 'Lỗi kết nối Agent',
      }));
    } finally {
      setAgentState((prev) => ({ ...prev, isRunning: false }));
    }
  };

  const handleResumeTask = async () => {
    if (!activeJobIdRef.current) return;
    await fetch('/api/agent/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: activeJobIdRef.current }),
    }).catch(() => {});
    setAgentState((prev) => ({ ...prev, status: 'running', waitingReason: undefined }));
  };

  const handleStopTask = async () => {
    if (activeJobIdRef.current) {
      await fetch('/api/agent/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: activeJobIdRef.current }),
      });
    }
    setAgentState((prev) => ({
      ...prev,
      isRunning: false,
      status: 'paused',
    }));
  };

  const toggleStepExpand = (stepNum: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }));
  };

  const getToolIcon = (name?: string) => {
    if (!name) return <Terminal className="w-3.5 h-3.5 text-slate-400" />;
    if (name.includes('navigate') || name.includes('tab'))
      return <Globe className="w-3.5 h-3.5 text-sky-400" />;
    if (name.includes('click')) return <MousePointer className="w-3.5 h-3.5 text-amber-400" />;
    if (name.includes('type')) return <Keyboard className="w-3.5 h-3.5 text-emerald-400" />;
    if (name.includes('screenshot')) return <Camera className="w-3.5 h-3.5 text-purple-400" />;
    return <Layers className="w-3.5 h-3.5 text-indigo-400" />;
  };

  return (
    <aside className="w-96 h-full bg-slate-900 border-l border-slate-800 flex flex-col justify-between select-text shrink-0">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-600 flex items-center justify-center text-white">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Autonomous Browser Agent</span>
              <span className="text-[9px] font-mono font-normal text-sky-400 bg-sky-950 px-1 py-0.2 rounded border border-sky-800">
                Gemini 3.8
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">Điều khiển tự động qua Model Context Protocol</p>
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

      {/* Steps Execution Feed */}
      <div ref={scrollRef} className="flex-1 p-3.5 overflow-y-auto space-y-3 font-sans">
        {agentState.steps.length === 0 && !agentState.isRunning && (
          <div className="py-6 text-center">
            <Sparkles className="w-8 h-8 mx-auto text-sky-400 mb-2 opacity-60" />
            <h3 className="text-xs font-semibold text-slate-200">Sẵn sàng nhận tác vụ duyệt web</h3>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
              Agent AI sẽ tự động phân tích mục tiêu, đọc DOM, click, gõ phím và điều hướng để hoàn thành tác vụ cho bạn.
            </p>

            {/* Presets */}
            <div className="mt-4 space-y-1.5 text-left">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block px-1">
                Gợi ý tác vụ nhanh:
              </span>
              {presetTasks.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTaskInput(preset.prompt);
                    handleStartTask(preset.prompt);
                  }}
                  className="w-full text-left p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:border-sky-500/50 transition-colors group"
                >
                  <div className="text-[11px] font-medium text-slate-200 group-hover:text-sky-300">
                    {preset.title}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{preset.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Task Banner */}
        {agentState.task && (
          <div className="p-2.5 rounded-lg bg-slate-800/90 border border-slate-700 text-xs">
            <span className="text-[10px] text-sky-400 uppercase font-semibold block mb-0.5">Mục tiêu:</span>
            <p className="text-slate-100 font-medium text-[11px]">{agentState.task}</p>
          </div>
        )}

        {/* Steps List */}
        {agentState.steps.map((step) => {
          const isExpanded = expandedSteps[step.stepNumber] ?? true;
          return (
            <div
              key={step.stepNumber}
              className="rounded-lg bg-slate-800/70 border border-slate-700/70 overflow-hidden text-xs"
            >
              <button
                type="button"
                onClick={() => toggleStepExpand(step.stepNumber)}
                className="w-full p-2.5 flex items-center justify-between hover:bg-slate-800 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center font-mono text-[10px] font-bold text-slate-300">
                    {step.stepNumber}
                  </span>
                  {getToolIcon(step.toolCall?.name)}
                  <span className="font-semibold text-slate-200 text-[11px]">
                    {step.toolCall?.name ? step.toolCall.name : 'Suy luận & Phân tích'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {step.toolResult ? (
                    step.toolResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    )
                  ) : step.finalAnswer ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                  )}
                  {isExpanded ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="p-2.5 pt-0 border-t border-slate-700/50 space-y-2 text-[11px]">
                  {/* Thought */}
                  {step.thought && (
                    <div className="text-slate-300 italic bg-slate-900/50 p-2 rounded border border-slate-800">
                      "{step.thought}"
                    </div>
                  )}

                  {/* Tool Arguments */}
                  {step.toolCall && (
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block mb-0.5">Tham số gọi:</span>
                      <pre className="p-1.5 rounded bg-slate-950 text-[10px] font-mono text-amber-300 overflow-x-auto">
                        {JSON.stringify(step.toolCall.arguments, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Tool Result */}
                  {step.toolResult && (
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 block mb-0.5">Kết quả MCP:</span>
                      <div className="p-1.5 rounded bg-slate-950 text-[10px] font-mono text-slate-300 max-h-28 overflow-y-auto whitespace-pre-wrap">
                        {typeof step.toolResult.output === 'string'
                          ? step.toolResult.output
                          : JSON.stringify(step.toolResult.output, null, 2)}
                      </div>
                    </div>
                  )}

                  {/* Final answer if reached */}
                  {step.finalAnswer && (
                    <div className="p-2.5 rounded bg-sky-950/60 border border-sky-800/60 text-sky-200">
                      <span className="font-bold text-[10px] uppercase tracking-wider block mb-1 text-sky-400">
                        Tổng kết kết quả:
                      </span>
                      <p className="leading-relaxed">{step.finalAnswer}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {agentState.isRunning && (
          <div className="flex items-center gap-2 text-xs text-sky-400 p-2 rounded-lg bg-sky-950/30 border border-sky-800/40">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Agent đang quan sát trình duyệt và thực thi...</span>
          </div>
        )}

        {agentState.error && (
          <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/60 text-xs text-rose-300">
            {agentState.error}
          </div>
        )}
      </div>

      {/* obmc-human-assist-20261107 — waiting-for-user banner + Continue */}
      {agentState.status === 'waiting_user' && (
        <div className="mx-3 mb-2 p-3 rounded-lg bg-amber-950/60 border border-amber-700/70">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 text-lg leading-none">⏸</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-amber-300">Agent cần bạn can thiệp</div>
              <div className="text-[11px] text-amber-200/90 mt-1 break-words">
                {agentState.waitingReason || 'Thao tác trên trang (đăng nhập / quét QR / bấm nút cần click thật), rồi bấm Tiếp tục.'}
              </div>
              <button
                onClick={handleResumeTask}
                className="mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow"
                title="Tôi đã xử lý xong — agent tiếp tục"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Tiếp tục (đã xử lý xong)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Input & Controls */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/90">
        <div className="flex gap-1.5 mb-2">
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleStartTask();
              }
            }}
            disabled={agentState.isRunning}
            placeholder="Mô tả tác vụ (ví dụ: 'Tìm laptop rẻ nhất và thêm vào giỏ')..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 disabled:opacity-50"
          />

          {agentState.isRunning ? (
            <button
              onClick={handleStopTask}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow"
              title="Dừng tác vụ"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Dừng</span>
            </button>
          ) : (
            <button
              onClick={() => handleStartTask()}
              disabled={!taskInput.trim()}
              className="px-3 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow"
              title="Chạy Agent"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Chạy</span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
          <span>Tab hiện tại: {activeTabUrl}</span>
          {agentState.steps.length > 0 && (
            <button
              onClick={() =>
                setAgentState({
                  isRunning: false,
                  status: 'idle',
                  task: '',
                  steps: [],
                  currentStepIndex: 0,
                })
              }
              className="text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Xóa nhật ký</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
