import { classifyChallenge, validateFinalAnswer, type AgentOutcome } from '../shared/challenge-state.js';
/**
 * Autonomous Browser AI Agent powered by Gemini 3.8 Flash
 * Executes multi-step browser tasks using the expanded Browser MCP tools.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { browserState } from './browser-state.js';
import { McpServerHandler } from './mcp-server.js';
import { AgentStep } from '../shared/browser-types.js';


/**
 * Environment-aware copy when GEMINI_API_KEY is missing.
 * Never includes a real key value.
 */
/** Interactive-challenge guidance (exported for tests). */
export const CAPTCHA_INTERACTION_RULES = `
QUY TẮC THỬ THÁCH TƯƠNG TÁC (captcha kéo thả / câu đố đơn giản) — hoàn tất như người dùng thao tác trên trang:
- Slider / swipe: xem ảnh chụp hoặc viewport hiện tại (browser_get_dom / screenshot), xác định tay nắm và rãnh/đích, rồi gọi browser_drag từ tâm tay nắm tới đích. Với ghép mảnh (jigsaw): kéo theo trục X đúng bằng khoảng lệch nhìn thấy của chỗ trống.
- Câu đố đơn giản (simple puzzle): đọc câu hỏi (phép tính, "chọn tất cả đèn giao thông", chọn ảnh khớp, "con vật nào") rồi trả lời bằng browser_click / browser_type / browser_drag.
- Nếu widget rung/lắc hoặc tự reset: thử lại ĐÚNG MỘT lần với khoảng cách điều chỉnh.
- Không dùng dịch vụ giải captcha bên ngoài, không lấy token, không khai thác lỗ hổng.
- Trong lúc captcha còn hiển thị: KHÔNG bịa giá hay bất kỳ dữ liệu trích xuất nào.
- Chỉ báo thành công khi tường xác minh đã biến mất (đọc lại trang để kiểm tra).
- Tường đăng nhập bằng QR / quét ứng dụng điện thoại (ví dụ Taobao "亲，请登录", "Please try again") không thể hoàn tất bằng kéo thả: dừng lại và báo người dùng cần đăng nhập hoặc tự vượt xác minh (theo QUY TẮC GIÁ).
`;

/** Anti-hallucination rule for price/supplier tasks (exported for tests). */
export const PRICE_GROUNDING_RULES = `
QUY TẮC GIÁ — CHỈ DÙNG DỮ LIỆU THẬT TRÊN TRANG (BẮT BUỘC):
- Chỉ báo giá/nhà cung cấp khi giá đó THỰC SỰ xuất hiện trong nội dung trang đã trích xuất (browser_extract_content, browser_get_dom). Mỗi mức giá phải kèm URL nguồn.
- Nếu trích xuất rỗng / không có danh sách sản phẩm, hoặc trang bị chặn bởi captcha, mã QR xác minh, tường đăng nhập (ví dụ "亲，请登录", "Please try again"), hoặc kết quả tìm kiếm bị chặn: TUYỆT ĐỐI KHÔNG bịa, KHÔNG nhớ lại từ kiến thức sẵn có và KHÔNG đưa ra "giá tham khảo", "khoảng giá thị trường" hay "giá điển hình".
- Trong trường hợp đó, hãy nói rõ: không đọc được danh sách sản phẩm từ trang hiện tại, mô tả trở ngại (cần đăng nhập / xác minh QR / captcha) kèm URL, và gợi ý người dùng đăng nhập hoặc vượt xác minh rồi thử lại.
- Ưu tiên ở lại website thật mà người dùng đang mở; được phép tìm kiếm trên chính website đó.
`;

/** Made-in-China search URL shapes (obmc-mic-search-20261107; exported for tests). */
export const MIC_SEARCH_RULES = `
QUY TẮC TÌM KIẾM MADE-IN-CHINA (made-in-china.com):
- Ưu tiên: https://www.made-in-china.com/productdirectory.do?word={từ khóa}&subaction=hunt — BẮT BUỘC có subaction=hunt; thiếu nó site trả 404 / "not available currently".
- Thay thế: https://www.made-in-china.com/products-search/hot-china-products/{Title_Case_With_Underscores}.html (khoảng trắng → "_", ví dụ Gpt_Pro_5000).
- KHÔNG dùng /multi-search/{từ khóa}/1.html có "+" hoặc "%2B" trong đường dẫn. KHÔNG dùng productdirectory.do?word=... thiếu subaction=hunt.
- Nếu trang hiện "The information you are looking for is not available currently": đó là trang không có kết quả do URL sai, KHÔNG phải tường đăng nhập. Thử lại ngay một trong hai dạng URL đúng ở trên; không bảo người dùng đăng nhập và không kết luận site không có nhà cung cấp. "Sign In / Join Free" ở đầu trang chỉ là thanh menu.
- Vẫn KHÔNG bịa giá/MOQ; chỉ báo những gì hiển thị sau khi trang kết quả đúng đã tải.
`;

export function getMissingGeminiKeyMessage(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL) {
    return 'Chưa cấu hình GEMINI_API_KEY. Trên Vercel: Project Settings → Environment Variables, thêm GEMINI_API_KEY cho Production/Preview, rồi Redeploy.';
  }
  if (env.DISABLE_HMR === 'true' || env.AI_STUDIO === '1' || env.AI_STUDIO === 'true') {
    return 'Chưa cấu hình GEMINI_API_KEY trong hệ thống. Vui lòng kiểm tra tab Settings > Secrets trong AI Studio.';
  }
  return 'Chưa cấu hình GEMINI_API_KEY. Đặt biến môi trường GEMINI_API_KEY trong .env hoặc secrets của host (Render/Docker), rồi khởi động lại máy chủ.';
}

export class GeminiBrowserAgent {
  private static activeJobs: Map<string, { abort: boolean }> = new Map();

  public static stopJob(jobId: string) {
    const job = this.activeJobs.get(jobId);
    if (job) {
      job.abort = true;
    }
  }

  public static async runAutonomousAgent(
    task: string,
    onStep: (step: AgentStep) => void,
    jobId: string = 'job-' + Date.now()
  ): Promise<{ success: boolean; outcome: AgentOutcome; answer: string; steps: AgentStep[] }> {
    const job = { abort: false };
    this.activeJobs.set(jobId, job);

    const steps: AgentStep[] = [];
    const AGENT_MODEL_CASCADE = [
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
].filter(Boolean) as string[];

async function generateWithCascade(ai: any, args: { contents: any; config: any }) {
  let lastErr: any;
  for (const model of AGENT_MODEL_CASCADE) {
    try {
      return await ai.models.generateContent({ model, contents: args.contents, config: args.config });
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (/404|429|503|high demand|no longer available|not found/i.test(msg)) continue;
      throw err;
    }
  }
  throw lastErr || new Error('All Gemini agent models failed');
}

const MAX_STEPS = 14;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const errorMsg = getMissingGeminiKeyMessage();
      const errStep: AgentStep = {
        stepNumber: 1,
        thought: errorMsg,
        finalAnswer: errorMsg,
        timestamp: Date.now(),
      };
      steps.push(errStep);
      onStep(errStep);
      return { outcome: 'failed', success: false, answer: errorMsg, steps };
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const toolDeclarations = [
      {
        name: 'browser_navigate',
        description: 'Điều hướng trình duyệt đến URL người dùng đang cần. Với website thật hãy dùng đúng https:// (ví dụ https://www.taobao.com). Chỉ dùng browser://search, browser://store, browser://forms, browser://news khi người dùng muốn trang mẫu demo.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: 'Địa chỉ URL cần đến' },
          },
          required: ['url'],
        },
      },
      {
        name: 'browser_get_dom',
        description: 'Đọc danh sách các phần tử tương tác (@ref:1, @ref:2...) và cấu trúc trang web hiện tại',
        parameters: {
          type: Type.OBJECT,
          properties: {
            format: {
              type: Type.STRING,
              description: 'interactive_elements hoặc text',
            },
          },
        },
      },
      {
        name: 'browser_click',
        description: 'Click vào một nút, link, hoặc ô trên trang bằng mã tham chiếu ref (ví dụ: "@ref:1", "@ref:2") hoặc selector',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ref: { type: Type.STRING, description: 'Mã tham chiếu (ví dụ "@ref:1" hoặc "1")' },
            selector: { type: Type.STRING, description: 'CSS selector (nếu không có ref)' },
          },
        },
      },
      {
        name: 'browser_drag',
        description:
          'Kéo thả bằng chuỗi pointer/mouse event nhiều bước (dùng cho slider, kéo mảnh ghép, kéo thả). Tọa độ pixel viewport: (x,y) điểm bắt đầu (tay nắm), (toX,toY) điểm kết thúc. Hoặc dùng fromRef/toRef.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            x: { type: Type.NUMBER, description: 'X bắt đầu' },
            y: { type: Type.NUMBER, description: 'Y bắt đầu' },
            toX: { type: Type.NUMBER, description: 'X kết thúc' },
            toY: { type: Type.NUMBER, description: 'Y kết thúc (mặc định = y)' },
            fromRef: { type: Type.STRING, description: 'Ref phần tử bắt đầu' },
            toRef: { type: Type.STRING, description: 'Ref phần tử đích' },
            steps: { type: Type.NUMBER, description: 'Số bước (mặc định 25)' },
          },
        },
      },
      {
        name: 'browser_hover',
        description: 'Di chuột tới phần tử để kích hoạt menu con hoặc hover state',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ref: { type: Type.STRING, description: 'Mã tham chiếu của phần tử' },
            selector: { type: Type.STRING, description: 'CSS selector' },
          },
        },
      },
      {
        name: 'browser_type',
        description: 'Gõ văn bản vào ô nhập liệu bằng mã tham chiếu ref và tùy chọn nhấn Enter',
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: 'Nội dung cần gõ' },
            ref: { type: Type.STRING, description: 'Mã tham chiếu của ô input (ví dụ: "@ref:2")' },
            clearFirst: { type: Type.BOOLEAN, description: 'Xóa text cũ (mặc định true)' },
            pressEnter: { type: Type.BOOLEAN, description: 'Nhấn phím Enter sau khi gõ (để submit form tìm kiếm)' },
          },
          required: ['text'],
        },
      },
      {
        name: 'browser_press_key',
        description: 'Gửi phím bàn phím như Enter, Escape, Tab, ArrowDown, Backspace',
        parameters: {
          type: Type.OBJECT,
          properties: {
            key: { type: Type.STRING, description: 'Tên phím: Enter, Tab, Escape, ArrowDown' },
            ref: { type: Type.STRING, description: 'Mã tham chiếu của phần tử' },
          },
          required: ['key'],
        },
      },
      {
        name: 'browser_select_option',
        description: 'Chọn option trong thẻ select bằng value hoặc label',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ref: { type: Type.STRING, description: 'Mã tham chiếu của thẻ select' },
            value: { type: Type.STRING, description: 'Giá trị value của option' },
            label: { type: Type.STRING, description: 'Nhãn hiển thị của option' },
          },
        },
      },
      {
        name: 'browser_fill_form',
        description: 'Điền hàng loạt các trường trong form cùng lúc',
        parameters: {
          type: Type.OBJECT,
          properties: {
            fields: { type: Type.OBJECT, description: 'Bản đồ các trường: { "@ref:1": "Giá trị" }' },
            submitAfter: { type: Type.BOOLEAN, description: 'Tự động submit sau khi điền' },
            submitRef: { type: Type.STRING, description: 'Mã @ref nút submit' },
          },
          required: ['fields'],
        },
      },
      {
        name: 'browser_scroll',
        description: 'Cuộn trang web (direction: "down", "up", "top", "bottom")',
        parameters: {
          type: Type.OBJECT,
          properties: {
            direction: { type: Type.STRING, description: 'Hướng cuộn: down, up, top, bottom' },
            amount: { type: Type.NUMBER, description: 'Số pixel cuộn (mặc định 400)' },
          },
          required: ['direction'],
        },
      },
      {
        name: 'browser_screenshot',
        description: 'Chụp ảnh màn hình trang hiện tại để kiểm tra giao diện',
        parameters: {
          type: Type.OBJECT,
          properties: {
            fullPage: { type: Type.BOOLEAN, description: 'Chụp toàn trang' },
          },
        },
      },
      {
        name: 'browser_extract_content',
        description: 'Trích xuất nội dung có cấu trúc hoặc dữ liệu từ trang',
        parameters: {
          type: Type.OBJECT,
          properties: {
            mode: { type: Type.STRING, description: 'structured, table, links, hoặc full_text' },
            query: { type: Type.STRING, description: 'Phạm vi cần trích xuất. Nếu kết quả không chứa giá/sản phẩm thật (rỗng, captcha, đăng nhập) thì KHÔNG được tự bịa giá.' },
          },
        },
      },
    ];

    const systemInstruction = `
Bạn là Agent AI điều khiển trình duyệt web thông qua Model Context Protocol (MCP).
Nhiệm vụ của bạn: Hoàn thành mục tiêu của người dùng trên trình duyệt bằng cách thực hiện tuần tự các thao tác (navigate, get DOM, click, hover, type, select, scroll, screenshot).

HỆ THỐNG TRANG WEB MẪU TÍCH HỢP SẴN (chỉ dùng khi người dùng muốn thử demo):
1. "browser://search" (AeroSearch): Công cụ tìm kiếm mẫu trong trình duyệt.
2. "browser://store" (NovaTech Store): Cửa hàng công nghệ MẪU để thử click/giỏ hàng — KHÔNG phải website mua hàng hay nhà cung cấp thật.
3. "browser://forms" (Test Lab Forms): Phòng thí nghiệm form mẫu.
4. "browser://news" (TechNews): Cổng tin mẫu.
5. "browser://wikipedia" hoặc https://vi.wikipedia.org: Bách khoa toàn thư mở.

QUAN TRỌNG — TRANG WEB THẬT:
- Nếu tab hiện tại đã là http/https (ví dụ taobao.com, 1688.com, tmall.com, hoặc bất kỳ website thật nào), bạn PHẢI hoàn thành nhiệm vụ trên chính trang đó hoặc các trang cùng website.
- KHÔNG được điều hướng sang browser://store (NovaTech), browser://search, browser://forms hay browser://news khi người dùng yêu cầu tìm giá, tìm nhà cung cấp, mua hàng, hoặc thao tác trên website thật.
- NovaTech Store chỉ là trang test mặc định — không dùng nó thay cho Taobao/1688 hay bất kỳ nhà cung cấp thật nào.
- Chỉ mở trang mẫu browser:// khi người dùng nêu rõ tên trang demo, hoặc khi tab hiện tại vốn đã là trang mẫu và nhiệm vụ thuộc về trang đó.

${PRICE_GROUNDING_RULES}
${CAPTCHA_INTERACTION_RULES}
${MIC_SEARCH_RULES}
QUY TẮC QUAN SÁT HIỆN TẠI (obmc-challenge-detect-20261107):
- Chỉ dùng DOM thuộc tabId + URL + navigationId hiện tại. Bỏ nội dung của lần điều hướng trước.
- ok chỉ là chưa phát hiện tường, KHÔNG chứng minh mục tiêu hoàn tất. QR phản hồi không phải QR đăng nhập.
- Ảnh browser_screenshot hiện chỉ là canvas mô phỏng, không phải pixel website thật. External iframe chưa hỗ trợ drag/extract; không hứa vượt captcha.
- Khi kết thúc, trả JSON thuần: {"outcome":"completed|blocked|needs_user|failed","answer":"trả lời tiếng Việt","evidence":"trích nguyên văn ít nhất 8 ký tự từ DOM hiện tại chứng minh mục tiêu đạt được"}.
- Chỉ chọn completed khi mục tiêu thực sự đạt được; hết bước / không gọi tool / nội dung rỗng không phải thành công.
NGUYÊN TẮC HÀNH ĐỘNG:
- Sau mỗi thao tác quan trọng (navigate, click, type), hãy quan sát trạng thái mới.
- Để click hoặc gõ phím, hãy sử dụng mã tham chiếu ref (ví dụ: "@ref:1", "@ref:2"...) được cung cấp từ browser_get_dom hoặc quan sát.
- Khi gõ tìm kiếm vào ô input của search, bạn có thể truyền pressEnter: true để tìm kiếm ngay lập tức.
- Khi đã đạt được mục tiêu hoặc thu thập đủ thông tin theo yêu cầu người dùng, hãy ngừng gọi công cụ và trả về câu trả lời tổng kết rõ ràng, súc tích bằng tiếng Việt.
`;

    const conversationContents: any[] = [];
    let lastToolFailed = false;

    const currentTab = browserState.getActiveTab();
    const initialDom = browserState.getDomSnapshot(currentTab.id);

    const initialPrompt = `Mục tiêu của người dùng: "${task}"

Trạng thái trình duyệt hiện tại:
- Tab hiện tại: [${currentTab.id}] "${currentTab.title}"
- URL: ${currentTab.url}
- Quan sát có nguồn: ${JSON.stringify(classifyChallenge(currentTab, initialDom))}
- Tóm tắt DOM: ${initialDom ? initialDom.simplifiedTree.substring(0, 1000) : 'Chưa có thông tin DOM, hãy bắt đầu bằng điều hướng hoặc lấy DOM.'}

Hãy phân tích mục tiêu và quyết định công cụ đầu tiên cần gọi.`;

    conversationContents.push({
      role: 'user',
      parts: [{ text: initialPrompt }],
    });

    try {
      for (let stepIndex = 1; stepIndex <= MAX_STEPS; stepIndex++) {
        if (job.abort) {
          const abortStep: AgentStep = {
            stepNumber: stepIndex,
            thought: 'Nhiệm vụ đã bị dừng bởi người dùng.',
            finalAnswer: 'Nhiệm vụ đã dừng lại theo yêu cầu.',
            timestamp: Date.now(),
          };
          steps.push(abortStep);
          onStep(abortStep);
          return { outcome: 'failed', success: false, answer: 'Đã dừng tác vụ.', steps };
        }

        const response = await generateWithCascade(ai, {
          contents: conversationContents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: toolDeclarations as any }],
          },
        });

        const candidate = response.candidates?.[0];
        const content = candidate?.content;
        const textPart = content?.parts?.find((p: any) => p.text);
        const functionCalls = content?.parts?.filter((p: any) => p.functionCall);

        const thought = textPart?.text || '';

        if (!functionCalls || functionCalls.length === 0) {
          const tab = browserState.getActiveTab();
          const decision = validateFinalAnswer(tab, browserState.getDomSnapshot(tab.id), thought, lastToolFailed);
          const finalAnswer = decision.answer;
          const step: AgentStep = {
            stepNumber: stepIndex,
            thought: thought,
            finalAnswer: finalAnswer,
            timestamp: Date.now(),
          };
          steps.push(step);
          onStep(step);
          return { outcome: decision.outcome, success: decision.outcome === 'completed', answer: finalAnswer, steps };
        }

        const firstPart = functionCalls[0];
        const fnCall = firstPart?.functionCall;
        if (!fnCall || !fnCall.name) {
          continue;
        }

        const toolName: string = fnCall.name;
        const toolArgs: Record<string, any> = (fnCall.args as Record<string, any>) || {};

        const stepRecord: AgentStep = {
          stepNumber: stepIndex,
          thought: thought,
          toolCall: {
            name: toolName,
            arguments: toolArgs,
          },
          timestamp: Date.now(),
        };

        onStep(stepRecord);

        let toolExecutionResult: any;
        try {
          const mcpRes = await McpServerHandler.executeTool(toolName, toolArgs);
          toolExecutionResult = mcpRes?.content?.[0]?.text || JSON.stringify(mcpRes);
          stepRecord.toolResult = {
            success: !mcpRes?.isError,
            output: toolExecutionResult,
          };
        } catch (err: any) {
          toolExecutionResult = `Lỗi thực thi công cụ: ${err?.message || 'Unknown error'}`;
          stepRecord.toolResult = {
            success: false,
            output: toolExecutionResult,
          };
        }

        lastToolFailed = stepRecord.toolResult?.success !== true;
        steps.push(stepRecord);
        onStep(stepRecord);

        await new Promise((r) => setTimeout(r, 350));

        conversationContents.push({
          role: 'model',
          parts: content?.parts || [],
        });

        const updatedTab = browserState.getActiveTab();
        const updatedDom = browserState.getDomSnapshot(updatedTab.id);

        const stateObservation = `[Quan sát sau khi thực hiện ${toolName}]:
Quan sát có nguồn: ${JSON.stringify(classifyChallenge(updatedTab, updatedDom))}
URL hiện tại: ${updatedTab.url}
Tiêu đề: ${updatedTab.title}
${
  updatedDom
    ? `Các phần tử tương tác (@ref):\n${updatedDom.simplifiedTree.substring(0, 1200)}`
    : ''
}`;

        conversationContents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: {
                  result: toolExecutionResult,
                  observation: stateObservation,
                },
              },
            },
          ],
        });
      }

      const tab = browserState.getActiveTab();
      const finalAnswer = `Chưa hoàn thành: đã đạt giới hạn số bước. ${JSON.stringify(classifyChallenge(tab, browserState.getDomSnapshot(tab.id)))}`;
      return { outcome: 'failed', success: false, answer: finalAnswer, steps };
    } catch (err: any) {
      console.error('Agent loop error:', err);
      const errorStep: AgentStep = {
        stepNumber: steps.length + 1,
        thought: `Gặp lỗi khi xử lý: ${err?.message || 'Unknown error'}`,
        finalAnswer: `Không thể hoàn thành do lỗi: ${err?.message}`,
        timestamp: Date.now(),
      };
      steps.push(errorStep);
      onStep(errorStep);
      return { outcome: 'failed', success: false, answer: errorStep.finalAnswer || '', steps };
    } finally {
      this.activeJobs.delete(jobId);
    }
  }
}
