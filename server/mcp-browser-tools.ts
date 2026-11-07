/**
 * Simulated in-app browser MCP tools (UI-driven).
 */
import { McpToolDefinition } from '../shared/browser-types.js';

export const MCP_BROWSER_TOOLS: McpToolDefinition[] = [
  {
    name: 'browser_navigate',
    description:
      'Điều hướng tab hiện tại (hoặc tab chỉ định) tới một địa chỉ URL mới. Với website thật hãy dùng https:// đầy đủ (ví dụ https://www.taobao.com). Chỉ dùng browser://search, browser://store, browser://forms, browser://news khi người dùng muốn trang mẫu demo.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Địa chỉ URL cần mở (ví dụ: https://www.taobao.com). Chỉ dùng browser://store khi muốn trang demo NovaTech.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab cần điều hướng (tùy chọn, mặc định là tab đang active).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_open_tab',
    description: 'Mở một thẻ (tab) mới trong trình duyệt với URL tùy chọn và chuyển tiêu điểm sang tab đó.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL ban đầu của tab mới (mặc định là browser://search).',
        },
        title: {
          type: 'string',
          description: 'Tiêu đề ban đầu cho tab mới.',
        },
      },
    },
  },
  {
    name: 'browser_close_tab',
    description: 'Đóng một tab trình duyệt theo tabId.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab cần đóng.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_switch_tab',
    description: 'Chuyển tab đang active sang một tab khác theo tabId.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab muốn chuyển sang.',
        },
      },
      required: ['tabId'],
    },
  },
  {
    name: 'browser_list_tabs',
    description: 'Lấy danh sách tất cả các tab đang mở cùng thông tin ID, URL, tiêu đề và trạng thái active.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_get_dom',
    description:
      'Đọc cây DOM, cấu trúc trang web, cây trợ năng và danh sách các phần tử tương tác (interactive elements) với mã tham chiếu duy nhất (@ref:1, @ref:2...) để click hoặc gõ phím chính xác.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab cần đọc (mặc định: tab active).',
        },
        format: {
          type: 'string',
          enum: ['interactive_elements', 'simplified', 'full', 'text'],
          description:
            'Định dạng trả về: "interactive_elements" (danh sách nút/input với mã @ref), "simplified" (cây phân cấp rút gọn), "text" (toàn bộ nội dung văn bản), hoặc "full".',
        },
      },
    },
  },
  {
    name: 'browser_click',
    description:
      'Thực hiện nhấp chuột (click) vào một phần tử trên trang bằng mã tham chiếu (@ref:N), CSS selector, hoặc tọa độ (x, y). Có kèm hiệu ứng hiển thị trực quan con trỏ chuột.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của phần tử lấy từ browser_get_dom (ví dụ: "@ref:3" hoặc "3").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của phần tử (ví dụ: "button.submit-btn" hoặc "#search-input").',
        },
        x: {
          type: 'number',
          description: 'Tọa độ X (pixel) trên viewport để nhấp chuột.',
        },
        y: {
          type: 'number',
          description: 'Tọa độ Y (pixel) trên viewport để nhấp chuột.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện (tùy chọn).',
        },
      },
    },
  },
  {
    name: 'browser_drag',
    description:
      'Kéo thả (drag) bằng chuỗi sự kiện pointer/mouse thật (pointerdown/mousedown → nhiều bước pointermove/mousemove → pointerup/mouseup, buttons:1). Dùng cho thanh trượt (slider), kéo mảnh ghép, kéo thả trong giao diện và các thử thách tương tác hiển thị cho người dùng. Tọa độ là pixel viewport (giống browser_click). Có thể dùng ref/selector cho điểm đầu (from) và điểm cuối (to). Giới hạn: chỉ tới được iframe cùng origin; widget trong iframe khác origin không nhận được sự kiện — khi đó hãy báo người dùng tự hoàn tất.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X bắt đầu (pixel viewport), ví dụ tâm tay nắm slider.' },
        y: { type: 'number', description: 'Y bắt đầu (pixel viewport).' },
        toX: { type: 'number', description: 'X kết thúc.' },
        toY: { type: 'number', description: 'Y kết thúc (mặc định = y cho slider ngang).' },
        fromRef: { type: 'string', description: 'Ref phần tử bắt đầu (thay cho x,y).' },
        fromSelector: { type: 'string', description: 'CSS selector phần tử bắt đầu.' },
        toRef: { type: 'string', description: 'Ref phần tử đích (thay cho toX,toY).' },
        toSelector: { type: 'string', description: 'CSS selector phần tử đích.' },
        steps: { type: 'number', description: 'Số bước di chuyển (mặc định 25, tối thiểu 2).' },
        tabId: { type: 'string', description: 'ID tab (tùy chọn).' },
      },
    },
  },
  {
    name: 'browser_hover',
    description:
      'Di chuột (hover) vào một phần tử hoặc tọa độ trên trang để kích hoạt hiệu ứng hiển thị menu con, flyout dropdown hoặc tooltip.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của phần tử (ví dụ: "@ref:2").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của phần tử.',
        },
        x: {
          type: 'number',
          description: 'Tọa độ X (pixel).',
        },
        y: {
          type: 'number',
          description: 'Tọa độ Y (pixel).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_type',
    description:
      'Gõ văn bản vào ô nhập liệu (input, textarea) hoặc phần tử đang được chọn. Hỗ trợ xóa text cũ trước khi gõ và tùy chọn nhấn Enter sau khi hoàn thành.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Chuỗi văn bản cần nhập.',
        },
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của ô nhập liệu (ví dụ: "@ref:2" hoặc "2").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của ô nhập liệu.',
        },
        clearFirst: {
          type: 'boolean',
          description: 'Xóa sạch nội dung cũ trong ô trước khi gõ (mặc định: true).',
        },
        pressEnter: {
          type: 'boolean',
          description: 'Tự động gửi phím Enter sau khi nhập xong để submit form (mặc định: false).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện (tùy chọn).',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'browser_press_key',
    description:
      'Gửi phím bàn phím chuyên biệt (như Enter, Escape, Tab, ArrowDown, ArrowUp, Backspace, Space) tới phần tử đang focus hoặc toàn trang.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Tên phím cần nhấn (ví dụ: "Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "Backspace").',
        },
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của phần tử cần nhận phím (tùy chọn).',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của phần tử.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_select_option',
    description: 'Chọn một giá trị (option) trong thẻ <select> dropdown bằng value, label hiển thị, hoặc vị trí index.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Mã tham chiếu của thẻ <select> (ví dụ: "@ref:4").',
        },
        selector: {
          type: 'string',
          description: 'CSS selector của thẻ <select>.',
        },
        value: {
          type: 'string',
          description: 'Giá trị thuộc tính value của option cần chọn.',
        },
        label: {
          type: 'string',
          description: 'Nội dung hiển thị (text) của option cần chọn.',
        },
        index: {
          type: 'number',
          description: 'Vị trí index của option (0, 1, 2...).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_fill_form',
    description:
      'Điền hàng loạt các trường trong form (batch fill) cùng lúc, giúp tiết kiệm lượt gọi tool và tự động submit nếu cần.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description:
            'Bản đồ các trường cần điền, ví dụ: { "@ref:1": "Nguyễn Văn A", "#email": "a@example.com", "role": "developer" }.',
        },
        submitAfter: {
          type: 'boolean',
          description: 'Tự động bấm submit sau khi điền xong form (mặc định false).',
        },
        submitRef: {
          type: 'string',
          description: 'Mã @ref của nút submit cần bấm sau khi điền (nếu submitAfter = true).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['fields'],
    },
  },
  {
    name: 'browser_wait_for',
    description:
      'Chờ đợi một phần tử hoặc văn bản cụ thể xuất hiện trên trang web trước khi thực hiện bước tiếp theo (hữu ích cho SPA và tải dữ liệu bất đồng bộ).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector cần chờ xuất hiện.',
        },
        text: {
          type: 'string',
          description: 'Đoạn văn bản cần chờ xuất hiện.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Thời gian chờ tối đa bằng mili-giây (mặc định 4000ms).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_extract_content',
    description:
      'Trích xuất dữ liệu có cấu trúc từ trang web: danh sách bài viết, bảng dữ liệu biểu đồ, danh sách sản phẩm, các liên kết quan trọng hoặc nội dung chính.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['structured', 'table', 'links', 'full_text'],
          description: 'Chế độ trích xuất dữ liệu.',
        },
        query: {
          type: 'string',
          description: 'Mô tả hoặc bộ chọn phạm vi cần trích xuất (tùy chọn).',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
    },
  },
  {
    name: 'browser_scroll',
    description: 'Cuộn trang web theo các hướng: down (xuống), up (lên), top (đầu trang), bottom (cuối trang) với khoảng cách pixel tùy chọn.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['down', 'up', 'top', 'bottom'],
          description: 'Hướng cuộn trang.',
        },
        amount: {
          type: 'number',
          description: 'Khoảng cách cuộn tính bằng pixel (mặc định 400px). Không áp dụng khi cuộn top/bottom.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab cần cuộn.',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Chụp ảnh màn hình viewport hiện tại của trình duyệt, trả về dữ liệu ảnh Base64 PNG kèm hiệu ứng chớp ống kính trong giao diện.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'string',
          description: 'ID của tab cần chụp (tùy chọn).',
        },
        fullPage: {
          type: 'boolean',
          description: 'Chụp toàn bộ chiều dài trang nếu có thể.',
        },
      },
    },
  },
  {
    name: 'browser_evaluate',
    description: 'Thực thi một đoạn mã JavaScript an toàn trong ngữ cảnh của trang hiện tại và trả về kết quả JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Đoạn mã JavaScript cần thực thi (ví dụ: "document.title" hoặc "window.location.href").',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['script'],
    },
  },
  {
    name: 'browser_history',
    description: 'Điều hướng lịch sử duyệt web: quay lại trang trước (back), tiến tới trang sau (forward), hoặc tải lại trang (reload).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['back', 'forward', 'reload'],
          description: 'Hành động lịch sử.',
        },
        tabId: {
          type: 'string',
          description: 'ID của tab thực hiện.',
        },
      },
      required: ['action'],
    },
  },
];
