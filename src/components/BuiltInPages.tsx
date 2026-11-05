/**
 * Built-in High-Fidelity Interactive Web Destinations
 * Fast, reliable, and rich environments for AI agents and users to test:
 * navigation, clicking, typing, scrolling, screenshots, and DOM inspection.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  ShoppingBag,
  Plus,
  Minus,
  Check,
  Star,
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  CloudSun,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';

interface BuiltInPagesProps {
  url: string;
  onNavigate: (newUrl: string) => void;
  onPageLoaded?: (title: string) => void;
}

export const BuiltInPages: React.FC<BuiltInPagesProps> = ({
  url,
  onNavigate,
  onPageLoaded,
}) => {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.includes('store') || normalizedUrl.includes('novatech')) {
    return <StorePage onNavigate={onNavigate} onPageLoaded={onPageLoaded} />;
  }

  if (normalizedUrl.includes('forms') || normalizedUrl.includes('testlab')) {
    return <FormsPage onPageLoaded={onPageLoaded} />;
  }

  if (normalizedUrl.includes('news') || normalizedUrl.includes('technews')) {
    return <NewsPage onNavigate={onNavigate} onPageLoaded={onPageLoaded} />;
  }

  if (normalizedUrl.includes('wiki') || normalizedUrl.includes('wikipedia')) {
    return <WikipediaPage onNavigate={onNavigate} onPageLoaded={onPageLoaded} />;
  }

  // Default: AeroSearch
  return <SearchPage initialUrl={url} onNavigate={onNavigate} onPageLoaded={onPageLoaded} />;
};

/* -------------------------------------------------------------
 * 1. AeroSearch Page
 * ------------------------------------------------------------- */
const SearchPage: React.FC<{
  initialUrl: string;
  onNavigate: (url: string) => void;
  onPageLoaded?: (title: string) => void;
}> = ({ initialUrl, onNavigate, onPageLoaded }) => {
  let initialQ = '';
  try {
    const parsed = new URL(
      initialUrl.startsWith('http')
        ? initialUrl
        : 'http://local' + initialUrl.replace('browser://', '/')
    );
    initialQ = parsed.searchParams.get('q') || '';
  } catch (e) {
    if (initialUrl.includes('?q=')) {
      initialQ = decodeURIComponent(initialUrl.split('?q=')[1].split('&')[0]);
    }
  }

  const [query, setQuery] = useState(initialQ);
  const [activeTab, setActiveTab] = useState<'all' | 'news' | 'tech'>('all');
  const [submittedQuery, setSubmittedQuery] = useState(initialQ);

  const onPageLoadedRef = useRef(onPageLoaded);
  useEffect(() => {
    onPageLoadedRef.current = onPageLoaded;
  });

  useEffect(() => {
    onPageLoadedRef.current?.(
      submittedQuery ? `${submittedQuery} - AeroSearch` : 'AeroSearch - Tìm kiếm thông minh'
    );
  }, [submittedQuery]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim()) {
      setSubmittedQuery(query.trim());
      onNavigate(`browser://search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const sampleResults = [
    {
      title: 'Trí tuệ nhân tạo và Model Context Protocol (MCP) năm 2026',
      url: 'https://technews.io/articles/mcp-protocol-2026',
      snippet:
        'Giao thức Model Context Protocol (MCP) cho phép các agent AI kết nối liền mạch với các công cụ cục bộ và trình duyệt web, biến AI thành trợ lý tự hành có khả năng thao tác giao diện người dùng theo thời gian thực.',
      category: 'Công nghệ',
      date: '4 giờ trước',
    },
    {
      title: 'NovaTech Store - Trung tâm mua sắm thiết bị công nghệ & Laptop',
      url: 'browser://store',
      snippet:
        'Khám phá danh mục Laptop Gaming cao cấp, điện thoại thông minh flagship và tai nghe chống ồn chủ động. Miễn phí vận chuyển toàn quốc và bảo hành chính hãng 24 tháng.',
      category: 'Cửa hàng',
      date: 'Hôm nay',
    },
    {
      title: 'Bách khoa toàn thư mở Wikipedia - Khái niệm Trí tuệ Nhân tạo',
      url: 'browser://wikipedia',
      snippet:
        'Tìm hiểu lịch sử phát triển của trí tuệ nhân tạo, phép thử Turing, máy học sâu và các agent tự hành tương tác với thế giới số.',
      category: 'Bách khoa',
      date: 'Hôm qua',
    },
    {
      title: 'Dự báo thời tiết 3 ngày tới: Nắng ấm và độ ẩm lý tưởng',
      url: 'browser://search?q=thời+tiết',
      snippet:
        'Thời tiết miền Bắc và miền Nam duy trì hình thái dễ chịu, nhiệt độ dao động từ 24°C đến 31°C, thuận lợi cho các hoạt động ngoài trời và du lịch.',
      category: 'Đời sống',
      date: '1 giờ trước',
    },
    {
      title: 'Phòng thí nghiệm kiểm thử Form tương tác - Test Lab',
      url: 'browser://forms',
      snippet:
        'Môi trường tiêu chuẩn kiểm tra khả năng gõ phím, chọn radio, tickbox và submit form tự động cho AI Agent và lập trình viên kiểm thử QA.',
      category: 'Công cụ',
      date: '2 ngày trước',
    },
  ];

  const filteredResults = submittedQuery
    ? sampleResults.filter(
        (r) =>
          r.title.toLowerCase().includes(submittedQuery.toLowerCase()) ||
          r.snippet.toLowerCase().includes(submittedQuery.toLowerCase()) ||
          submittedQuery.toLowerCase().includes('thời tiết') ||
          submittedQuery.toLowerCase().includes('laptop') ||
          submittedQuery.toLowerCase().includes('mcp') ||
          submittedQuery.toLowerCase().includes('wiki')
      )
    : sampleResults;

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center font-bold text-white shadow-sm">
            A
          </div>
          <span className="text-xl font-bold tracking-tight text-white">AeroSearch</span>
          <span className="text-xs text-sky-400 font-mono bg-sky-950/60 border border-sky-800/50 px-2 py-0.5 rounded">
            v2.4 Engine
          </span>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSearch} className="relative mb-6">
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              id="search-input"
              name="query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập từ khóa tìm kiếm (ví dụ: 'laptop gaming', 'thời tiết', 'mcp protocol')..."
              className="w-full bg-slate-800 border border-slate-700 hover:border-slate-600 focus:border-sky-500 rounded-xl pl-12 pr-28 py-3.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none transition-colors shadow-inner"
            />
            <button
              id="search-submit-btn"
              type="submit"
              className="absolute right-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors shadow"
            >
              Tìm kiếm
            </button>
          </div>

          {/* Quick suggestions */}
          <div className="flex items-center gap-2 mt-3 text-xs text-slate-400 flex-wrap">
            <span className="text-slate-400">Gợi ý nhanh:</span>
            <button
              type="button"
              onClick={() => {
                setQuery('laptop gaming');
                setSubmittedQuery('laptop gaming');
                onNavigate('browser://search?q=laptop+gaming');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700/60 transition-colors text-slate-300"
            >
              Laptop Gaming
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery('thời tiết');
                setSubmittedQuery('thời tiết');
                onNavigate('browser://search?q=thời+tiết');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700/60 transition-colors text-slate-300"
            >
              Thời tiết hôm nay
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery('cửa hàng NovaTech');
                onNavigate('browser://store');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700/60 transition-colors text-slate-300"
            >
              Vào NovaTech Store
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery('Bách khoa toàn thư');
                onNavigate('browser://wikipedia');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700/60 transition-colors text-slate-300"
            >
              Mở Wikipedia
            </button>
          </div>
        </form>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'all'
                ? 'bg-slate-800 text-sky-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tất cả kết quả
          </button>
          <button
            onClick={() => setActiveTab('news')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'news'
                ? 'bg-slate-800 text-sky-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tin tức mới nhất
          </button>
          <button
            onClick={() => setActiveTab('tech')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'tech'
                ? 'bg-slate-800 text-sky-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Công nghệ & AI
          </button>
        </div>

        {/* Weather Knowledge Card if query matches */}
        {(submittedQuery.toLowerCase().includes('thời tiết') ||
          submittedQuery.toLowerCase().includes('weather')) && (
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-sky-950/70 to-indigo-950/70 border border-sky-800/40 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs text-sky-400 font-medium">
                <CloudSun className="w-4 h-4" />
                <span>Thời tiết Hà Nội & TP. Hồ Chí Minh</span>
              </div>
              <div className="text-2xl font-bold mt-1 text-white font-mono tabular-nums">
                28°C <span className="text-sm font-normal text-slate-300">· Trời nắng nhẹ</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Độ ẩm: 68% · Gió: 12 km/h · Chỉ số UV: 4 (Trung bình)
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Cập nhật lúc</span>
              <div className="text-xs font-mono text-sky-300">19:40 Hôm nay</div>
            </div>
          </div>
        )}

        {/* Results List */}
        <div className="space-y-6">
          <div className="text-xs text-slate-400">
            Tìm thấy khoảng{' '}
            <span className="font-mono tabular-nums font-semibold text-slate-300">
              {filteredResults.length * 142}
            </span>{' '}
            kết quả (0.04 giây)
          </div>

          {filteredResults.map((result, idx) => (
            <div
              key={idx}
              className="group p-4 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 transition-all"
            >
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                <span className="text-sky-400 font-medium">{result.category}</span>
                <span>·</span>
                <span>{result.date}</span>
                <span>·</span>
                <span className="text-slate-400 font-mono truncate max-w-xs">{result.url}</span>
              </div>
              <h3 className="text-base font-semibold text-sky-400 group-hover:text-sky-300 mb-2">
                <button
                  onClick={() => onNavigate(result.url)}
                  className="text-left hover:underline flex items-center gap-1.5"
                >
                  {result.title}
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </button>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">{result.snippet}</p>
            </div>
          ))}

          {filteredResults.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">Không tìm thấy kết quả phù hợp cho "{submittedQuery}".</p>
              <p className="text-xs mt-1 text-slate-400">
                Thử tìm kiếm với từ khóa khác hoặc khám phá các danh mục sẵn có.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 2. NovaTech E-Commerce Store Page
 * ------------------------------------------------------------- */
interface Product {
  id: string;
  name: string;
  category: 'laptop' | 'phone' | 'audio' | 'accessory';
  priceVnd: number;
  rating: number;
  reviews: number;
  specs: string;
  icon: string;
}

const PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'NovaBook Pro 16 AI Studio',
    category: 'laptop',
    priceVnd: 38990000,
    rating: 4.9,
    reviews: 142,
    specs: 'Core Ultra 9 / 32GB RAM / 1TB SSD / OLED 3.2K 120Hz',
    icon: '💻',
  },
  {
    id: 'prod-2',
    name: 'NovaBook Air 14 Ultralight',
    category: 'laptop',
    priceVnd: 24490000,
    rating: 4.8,
    reviews: 98,
    specs: 'Core Ultra 7 / 16GB RAM / 512GB SSD / Pin 18h / 1.1kg',
    icon: '💻',
  },
  {
    id: 'prod-3',
    name: 'NovaPhone 16 Ultra Titanium',
    category: 'phone',
    priceVnd: 29990000,
    rating: 4.9,
    reviews: 320,
    specs: 'Camera 200MP / 512GB / Snapdragon 8 Elite / 120Hz AMOLED',
    icon: '📱',
  },
  {
    id: 'prod-4',
    name: 'NovaPods Max Active ANC',
    category: 'audio',
    priceVnd: 7490000,
    rating: 4.7,
    reviews: 84,
    specs: 'Chống ồn thông minh -45dB / Hi-Res Audio / Pin 35h',
    icon: '🎧',
  },
  {
    id: 'prod-5',
    name: 'NovaHub 10-in-1 Dual 4K USB-C',
    category: 'accessory',
    priceVnd: 1890000,
    rating: 4.6,
    reviews: 65,
    specs: '100W PD / HDMI 2.1 / 2.5G LAN / SD 4.0 / Vỏ nhôm',
    icon: '🔌',
  },
  {
    id: 'prod-6',
    name: 'NovaStudio Display 27 5K',
    category: 'accessory',
    priceVnd: 28990000,
    rating: 4.8,
    reviews: 47,
    specs: '5K Retina 5120x2880 / 600 nits / P3 / Thunderbolt 4',
    icon: '🖥️',
  },
];

const StorePage: React.FC<{
  onNavigate: (url: string) => void;
  onPageLoaded?: (title: string) => void;
}> = ({ onNavigate, onPageLoaded }) => {
  const [category, setCategory] = useState<string>('all');
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const [customerName, setCustomerName] = useState('Nguyễn Văn An');
  const [customerPhone, setCustomerPhone] = useState('0987654321');
  const [customerAddress, setCustomerAddress] = useState('Số 18 Hoàng Đạo Thúy, Cầu Giấy, Hà Nội');

  const onPageLoadedRef = useRef(onPageLoaded);
  useEffect(() => {
    onPageLoadedRef.current = onPageLoaded;
  });

  useEffect(() => {
    onPageLoadedRef.current?.('NovaTech Electronics - Cửa hàng công nghệ trực tuyến');
  }, []);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as { product: Product; quantity: number }[]
    );
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.product.priceVnd * item.quantity, 0);

  const filteredProducts =
    category === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === category);

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutSuccess(true);
    setTimeout(() => {
      setCart([]);
      setIsCheckoutOpen(false);
      setCheckoutSuccess(false);
    }, 2500);
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Store Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">NovaTech Store</h1>
                <span className="text-[10px] text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded font-mono">
                  CHÍNH HÃNG 100%
                </span>
              </div>
              <p className="text-xs text-slate-400">Thiết bị công nghệ cao cấp & Giải pháp AI</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="view-cart-btn"
              onClick={() => setIsCartOpen(!isCartOpen)}
              className="relative px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <ShoppingBag className="w-4 h-4 text-indigo-400" />
              <span>Giỏ hàng</span>
              {cart.length > 0 && (
                <span
                  id="cart-badge-count"
                  className="bg-indigo-600 text-white font-mono text-[10px] px-1.5 py-0.5 rounded-full"
                >
                  {cart.reduce((a, b) => a + b.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-800 rounded-lg border border-slate-700">
            <button
              id="filter-all"
              onClick={() => setCategory('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                category === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tất cả
            </button>
            <button
              id="filter-laptop"
              onClick={() => setCategory('laptop')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                category === 'laptop'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Laptop
            </button>
            <button
              id="filter-phone"
              onClick={() => setCategory('phone')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                category === 'phone'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Điện thoại
            </button>
            <button
              id="filter-audio"
              onClick={() => setCategory('audio')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                category === 'audio'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tai nghe
            </button>
            <button
              id="filter-accessory"
              onClick={() => setCategory('accessory')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                category === 'accessory'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Phụ kiện
            </button>
          </div>

          <div className="text-xs text-slate-400">
            Hiển thị{' '}
            <span className="font-mono tabular-nums text-slate-200">
              {filteredProducts.length}
            </span>{' '}
            sản phẩm
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              id={`card-${product.id}`}
              className="p-5 rounded-xl bg-slate-800/70 border border-slate-700/60 hover:border-indigo-500/50 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-lg bg-slate-700/60 flex items-center justify-center text-2xl">
                    {product.icon}
                  </div>
                  <div className="flex items-center gap-1 text-amber-400 text-xs font-mono">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{product.rating}</span>
                    <span className="text-slate-400">({product.reviews})</span>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-white mb-1.5">{product.name}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">{product.specs}</p>
              </div>

              <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Giá bán</div>
                  <div className="text-base font-bold text-indigo-400 font-mono tabular-nums">
                    {product.priceVnd.toLocaleString('vi-VN')} đ
                  </div>
                </div>

                <button
                  id={`btn-add-${product.id}`}
                  onClick={() => addToCart(product)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm vào giỏ</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Cart Drawer Modal */}
        {isCartOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
            <div className="w-full max-w-md bg-slate-800 border-l border-slate-700 h-full p-6 flex flex-col justify-between shadow-2xl">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-700 mb-4">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-bold text-white">Giỏ hàng của bạn</h3>
                  </div>
                  <button
                    id="close-cart-btn"
                    onClick={() => setIsCartOpen(false)}
                    className="text-slate-400 hover:text-white text-sm px-2 py-1"
                  >
                    Đóng ✕
                  </button>
                </div>

                {cart.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <ShoppingBag className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
                    <p className="text-sm">Giỏ hàng đang trống.</p>
                    <p className="text-xs mt-1 text-slate-400">Hãy thêm sản phẩm từ danh mục để bắt đầu.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/70 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{item.product.icon}</span>
                          <div>
                            <div className="text-xs font-semibold text-white">{item.product.name}</div>
                            <div className="text-xs text-indigo-400 font-mono tabular-nums">
                              {item.product.priceVnd.toLocaleString('vi-VN')} đ
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-800 rounded-md p-1 border border-slate-700">
                          <button
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-300"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-mono font-bold px-1.5">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-300"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cart.length > 0 && (
                <div className="pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs text-slate-400">Tổng thanh toán:</span>
                    <span
                      id="cart-total-amount"
                      className="text-lg font-bold text-white font-mono tabular-nums"
                    >
                      {totalAmount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>

                  <button
                    id="checkout-btn"
                    onClick={() => {
                      setIsCartOpen(false);
                      setIsCheckoutOpen(true);
                    }}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-colors shadow flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    <span>Tiến hành thanh toán</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Checkout Modal */}
        {isCheckoutOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
                <h3 className="text-base font-bold text-white">Xác nhận đơn hàng</h3>
                <button
                  onClick={() => setIsCheckoutOpen(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {checkoutSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                  <h4 className="text-base font-bold text-white mb-1">Đặt hàng thành công!</h4>
                  <p className="text-xs text-slate-300 mb-2">
                    Mã đơn hàng: #NVT-{Math.floor(100000 + Math.random() * 900000)}
                  </p>
                  <p className="text-xs text-slate-400">Cảm ơn bạn đã mua sắm tại NovaTech Store.</p>
                </div>
              ) : (
                <form onSubmit={handleCheckoutSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Họ và tên người nhận
                    </label>
                    <input
                      id="checkout-name"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Số điện thoại
                    </label>
                    <input
                      id="checkout-phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Địa chỉ nhận hàng
                    </label>
                    <input
                      id="checkout-address"
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60 text-xs">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Số lượng sản phẩm:</span>
                      <span className="text-white font-mono">
                        {cart.reduce((a, b) => a + b.quantity, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 font-semibold">
                      <span>Tổng tiền cần thanh toán:</span>
                      <span className="text-indigo-400 font-mono text-sm">
                        {totalAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCheckoutOpen(false)}
                      className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      id="submit-order-btn"
                      type="submit"
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow"
                    >
                      Xác nhận đặt hàng
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 3. Test Lab Forms Playground Page
 * ------------------------------------------------------------- */
const FormsPage: React.FC<{
  onPageLoaded?: (title: string) => void;
}> = ({ onPageLoaded }) => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'developer',
    country: 'vietnam',
    subscribeNewsletter: true,
    agreeTerms: false,
    bio: '',
  });

  const [submittedJson, setSubmittedJson] = useState<string | null>(null);

  const onPageLoadedRef = useRef(onPageLoaded);
  useEffect(() => {
    onPageLoadedRef.current = onPageLoaded;
  });

  useEffect(() => {
    onPageLoadedRef.current?.('Test Lab - Môi trường kiểm thử Form & DOM');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedJson(JSON.stringify(formData, null, 2));
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white">
            🧪
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Test Lab: Form & Input Testing Playground
            </h1>
            <p className="text-xs text-slate-400">
              Kiểm thử tương tác click, gõ text, chọn checkbox và submit dữ liệu cho AI Agent
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="p-5 rounded-xl bg-slate-800 border border-slate-700 space-y-4"
          >
            <div>
              <label htmlFor="input-fullname" className="block text-xs font-medium text-slate-300 mb-1">
                Họ và tên *
              </label>
              <input
                id="input-fullname"
                name="fullName"
                type="text"
                required
                placeholder="Nhập họ và tên..."
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="input-email" className="block text-xs font-medium text-slate-300 mb-1">
                Địa chỉ Email *
              </label>
              <input
                id="input-email"
                name="email"
                type="email"
                required
                placeholder="agent@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="select-role" className="block text-xs font-medium text-slate-300 mb-1">
                Vai trò (Role)
              </label>
              <select
                id="select-role"
                name="role"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="developer">Lập trình viên (Developer)</option>
                <option value="ai_researcher">Nhà nghiên cứu AI (Researcher)</option>
                <option value="product_manager">Quản lý sản phẩm (PM)</option>
                <option value="qa_tester">Kỹ sư kiểm thử (QA Tester)</option>
              </select>
            </div>

            <div>
              <label htmlFor="textarea-bio" className="block text-xs font-medium text-slate-300 mb-1">
                Ghi chú hoặc giới thiệu ngắn
              </label>
              <textarea
                id="textarea-bio"
                name="bio"
                rows={3}
                placeholder="Nhập mô tả chi tiết..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  id="checkbox-newsletter"
                  type="checkbox"
                  checked={formData.subscribeNewsletter}
                  onChange={(e) => setFormData({ ...formData, subscribeNewsletter: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                />
                <span>Nhận bản tin cập nhật công nghệ hàng tuần</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  id="checkbox-terms"
                  type="checkbox"
                  checked={formData.agreeTerms}
                  onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })}
                  className="rounded border-slate-700 text-emerald-600 focus:ring-0"
                />
                <span>Tôi đồng ý với các điều khoản kiểm thử tự động</span>
              </label>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                id="btn-fill-sample"
                type="button"
                onClick={() =>
                  setFormData({
                    fullName: 'Trần Minh Đức',
                    email: 'duc.tran@novalabs.ai',
                    role: 'ai_researcher',
                    country: 'vietnam',
                    subscribeNewsletter: true,
                    agreeTerms: true,
                    bio: 'Đang thử nghiệm agent tự hành duyệt web với Model Context Protocol.',
                  })
                }
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 rounded-lg transition-colors"
              >
                Điền mẫu nhanh
              </button>

              <button
                id="btn-submit-form"
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-colors shadow"
              >
                Gửi thông tin (Submit)
              </button>
            </div>
          </form>

          {/* Results display */}
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white mb-2">Dữ liệu sau khi Submit</h3>
              <p className="text-xs text-slate-400 mb-3">
                Khi AI Agent nhấn "Gửi thông tin", payload sẽ xuất hiện tại đây để xác minh tính chính xác.
              </p>

              {submittedJson ? (
                <pre
                  id="form-submission-output"
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto"
                >
                  {submittedJson}
                </pre>
              ) : (
                <div className="p-6 rounded-lg bg-slate-900/50 border border-slate-800 text-center text-xs text-slate-400">
                  Chưa có dữ liệu gửi. Điền form bên trái và bấm Gửi thông tin.
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-700/60 text-xs text-slate-400">
              Mã trạng thái HTTP mô phỏng: <span className="font-mono text-emerald-400">200 OK</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 4. TechNews Portal Page
 * ------------------------------------------------------------- */
const NewsPage: React.FC<{
  onNavigate: (url: string) => void;
  onPageLoaded?: (title: string) => void;
}> = ({ onNavigate, onPageLoaded }) => {
  const [upvotes, setUpvotes] = useState(128);
  const [hasUpvoted, setHasUpvoted] = useState(false);
  const [comments, setComments] = useState<string[]>([
    'MCP thực sự là bước đột phá kết nối AI với phần còn lại của hệ sinh thái web.',
    'Agent điều khiển trình duyệt chạy rất mượt và có phản hồi thị giác tốt!',
  ]);
  const [newComment, setNewComment] = useState('');

  const onPageLoadedRef = useRef(onPageLoaded);
  useEffect(() => {
    onPageLoadedRef.current = onPageLoaded;
  });

  useEffect(() => {
    onPageLoadedRef.current?.('TechNews - Kỷ nguyên Trình duyệt AI và MCP');
  }, []);

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      setComments([...comments, newComment.trim()]);
      setNewComment('');
    }
  };

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-sky-400 mb-2">
          <span>Công nghệ phần mềm</span>
          <span>·</span>
          <span>Xuất bản hôm nay</span>
          <span>·</span>
          <span>4 phút đọc</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-4">
          Model Context Protocol (MCP) và Cuộc cách mạng Trình duyệt tự hành 2026
        </h1>

        <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 mb-6 text-xs text-slate-300 leading-relaxed space-y-3">
          <p>
            Trước đây, các mô hình ngôn ngữ lớn (LLM) bị cô lập trong hộp văn bản. Với sự ra đời của Model Context Protocol (MCP) do Anthropic khởi xướng và được cộng đồng đón nhận rộng rãi, các AI Agent giờ đây có khả năng tương tác trực tiếp với giao diện người dùng trình duyệt.
          </p>
          <p>
            Thông qua các cổng MCP chuyên dụng như <code>browser_navigate</code>, <code>browser_click</code>, <code>browser_type</code>, và <code>browser_get_dom</code>, agent có thể duyệt web, so sánh giá cả, điền biểu mẫu phức tạp và thu thập dữ liệu một cách an toàn và có kiểm soát.
          </p>
        </div>

        {/* Upvote & Comment Section */}
        <div className="flex items-center gap-4 mb-6">
          <button
            id="btn-upvote-article"
            onClick={() => {
              if (!hasUpvoted) {
                setUpvotes(upvotes + 1);
                setHasUpvoted(true);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              hasUpvoted
                ? 'bg-rose-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>Thích bài viết</span>
            <span className="font-mono tabular-nums">({upvotes})</span>
          </button>
        </div>

        {/* Comments */}
        <div className="p-5 rounded-xl bg-slate-800/70 border border-slate-700">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <span>Bình luận thảo luận ({comments.length})</span>
          </h3>

          <div className="space-y-2 mb-4">
            {comments.map((cmt, idx) => (
              <div key={idx} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/50 text-xs text-slate-300">
                <span className="text-slate-400 font-mono text-[10px] block mb-0.5">Người dùng #{idx + 1}</span>
                {cmt}
              </div>
            ))}
          </div>

          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              id="input-comment"
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Để lại bình luận của bạn..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
            />
            <button
              id="btn-send-comment"
              type="submit"
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Gửi bình luận
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * 5. Wikipedia Mini Portal Page
 * ------------------------------------------------------------- */
const WikipediaPage: React.FC<{
  onNavigate: (url: string) => void;
  onPageLoaded?: (title: string) => void;
}> = ({ onNavigate, onPageLoaded }) => {
  const [activeArticle, setActiveArticle] = useState<'ai' | 'mcp' | 'turing'>('ai');

  const onPageLoadedRef = useRef(onPageLoaded);
  useEffect(() => {
    onPageLoadedRef.current = onPageLoaded;
  });

  useEffect(() => {
    onPageLoadedRef.current?.('Bách khoa toàn thư mở Wikipedia');
  }, []);

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-6 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xl">
              <BookOpen className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Wikipedia - Bách khoa toàn thư mở</h1>
              <p className="text-xs text-slate-400">Tri thức mở tự do cho nhân loại và AI</p>
            </div>
          </div>

          <div className="flex gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setActiveArticle('ai')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeArticle === 'ai' ? 'bg-sky-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Trí tuệ nhân tạo
            </button>
            <button
              onClick={() => setActiveArticle('mcp')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeArticle === 'mcp' ? 'bg-sky-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Model Context Protocol
            </button>
            <button
              onClick={() => setActiveArticle('turing')}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeArticle === 'turing' ? 'bg-sky-600 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              Alan Turing
            </button>
          </div>
        </div>

        {activeArticle === 'ai' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed bg-slate-800/50 p-6 rounded-xl border border-slate-700/70">
            <h2 className="text-xl font-bold text-white border-b border-slate-700 pb-2">Trí tuệ nhân tạo (AI)</h2>
            <p>
              <strong>Trí tuệ nhân tạo</strong> (tiếng Anh: <em>Artificial Intelligence</em>, viết tắt là <strong>AI</strong>) là trí tuệ được thể hiện bởi máy móc, trái ngược với trí thông minh tự nhiên của con người và động vật.
            </p>
            <p>
              Các ứng dụng tiêu biểu bao gồm các công cụ tìm kiếm web nâng cao (như Google Search, AeroSearch), hệ thống đề xuất (YouTube, Amazon), khả năng hiểu tiếng nói con người (Siri, Google Assistant), xe tự lái và các trợ lý tự hành điều khiển trình duyệt web qua giao thức MCP.
            </p>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span>Khám phá thêm các công nghệ liên quan:</span>
              <button
                onClick={() => setActiveArticle('mcp')}
                className="text-sky-400 hover:underline font-medium"
              >
                Đọc bài viết về MCP →
              </button>
            </div>
          </div>
        )}

        {activeArticle === 'mcp' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed bg-slate-800/50 p-6 rounded-xl border border-slate-700/70">
            <h2 className="text-xl font-bold text-white border-b border-slate-700 pb-2">Model Context Protocol</h2>
            <p>
              <strong>Model Context Protocol (MCP)</strong> là một tiêu chuẩn mở cho phép các ứng dụng cung cấp ngữ cảnh, tài nguyên và công cụ cho các mô hình ngôn ngữ lớn (LLM) một cách an toàn và nhất quán.
            </p>
            <p>
              Trong ngữ cảnh điều khiển trình duyệt (Browser Automation), MCP cung cấp các cổng công cụ như <code>browser_navigate</code>, <code>browser_click</code>, <code>browser_type</code>, <code>browser_scroll</code>, và <code>browser_screenshot</code>, biến AI Agent thành người dùng số có khả năng tương tác với mọi trang web.
            </p>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span>Kiểm thử ngay trong cửa hàng:</span>
              <button
                onClick={() => onNavigate('browser://store')}
                className="text-sky-400 hover:underline font-medium"
              >
                Mở NovaTech Store →
              </button>
            </div>
          </div>
        )}

        {activeArticle === 'turing' && (
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed bg-slate-800/50 p-6 rounded-xl border border-slate-700/70">
            <h2 className="text-xl font-bold text-white border-b border-slate-700 pb-2">Alan Turing</h2>
            <p>
              <strong>Alan Mathison Turing</strong> (1912 – 1954) là một nhà toán học, logic học, mật mã học và nhà khoa học máy tính người Anh. Ông được xem là cha đẻ của ngành khoa học máy tính lý thuyết và trí tuệ nhân tạo.
            </p>
            <p>
              Với cỗ máy Turing (Turing Machine) và phép thử Turing (Turing Test), ông đã đặt nền móng lý thuyết cho khả năng tư duy và giải quyết bài toán của máy tính hiện đại.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
