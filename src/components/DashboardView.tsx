import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../context/DataContext";
import { motion, AnimatePresence } from "motion/react";
import ReusableCard from "./ReusableCard";
import YearlyMonthlyComparisonTable from "./YearlyMonthlyComparisonTable";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingBag, 
  Users, 
  Percent, 
  Megaphone, 
  Truck, 
  AlertTriangle,
  Clock,
  Briefcase,
  Layers,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  Circle,
  CheckCircle2,
  Calendar,
  Check,
  FolderOpen,
  Sparkles,
  MessageSquare,
  Send,
  X,
  RefreshCw,
  Zap,
  Award,
  Trophy,
  Package,
  Bike,
  BarChart3,
  ArrowUpRight,
  Activity
} from "lucide-react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  BarChart, Bar, Cell, PieChart, Pie, LineChart, Line, Legend,
  RadialBarChart, RadialBar
} from "recharts";
import SafeResponsiveContainer from "./SafeResponsiveContainer";
import { formatCurrency, formatDateAZ } from "../utils/xlsEngine";
import { 
  formatDisplayOrderNumber, 
  getOrderReportingDate, 
  getOrderTrackingDate, 
  getOrderReportingDateYMD, 
  getOrderTrackingDateYMD, 
  getBakuDateRange, 
  getBakuTodayYMD, 
  formatToBakuYMD, 
  getBakuDateParts 
} from "../utils/orderFormatter";
import { Sale, Expense, Product } from "../types";

interface CardTooltipProps {
  isVisible: boolean;
  title: string;
  items: { label: string; value: string | number; valueClass?: string }[];
  footer?: string;
}

function CardTooltip({ isVisible, title, items, footer }: CardTooltipProps) {
  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="hidden lg:flex absolute bottom-full left-1/2 -translate-x-1/2 mb-3.5 bg-slate-900/95 text-white p-4 rounded-2xl shadow-[0_15px_30px_-5px_rgba(15,23,42,0.3)] border border-slate-800/80 z-50 w-72 pointer-events-none select-none flex-col gap-2 font-sans"
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-[11px] font-bold tracking-wider text-slate-300 uppercase font-sans">{title}</span>
          </div>

          {/* Items */}
          <div className="flex flex-col gap-1.5 py-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-sans">{item.label}</span>
                <span className={`font-mono font-bold ${item.valueClass || "text-slate-100"}`}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          {footer && (
            <div className="border-t border-slate-800/80 pt-2 text-[10px] text-slate-400 italic font-sans text-center">
              {footer}
            </div>
          )}

          {/* Arrow */}
          <div className="absolute top-[calc(100%-6px)] left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900/95 border-r border-b border-slate-800/80 rotate-45" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ==========================================
// REAL-TIME NOTIFICATION SYSTEM (AZERBAIJANI)
// ==========================================
function RealTimeNotificationCenter() {
  const { sales, products, adjustProductStock, updateSaleStatus, createSale, customers, addToast } = useData();
  const [showSimulation, setShowSimulation] = useState(false);
  const [isSimulatingOrder, setIsSimulatingOrder] = useState(false);
  const [isSimulatingStock, setIsSimulatingStock] = useState(false);

  // 1. Calculate Delayed Orders (Created >= 24 hours ago, status still "gözləyir")
  const delayedOrders = useMemo(() => {
    return sales.filter(s => {
      if (s.status !== "gözləyir") return false;
      if (!s.createdAt) return false;
      const createdAtMs = new Date(s.createdAt).getTime();
      if (isNaN(createdAtMs)) return false;
      
      const diffMs = Date.now() - createdAtMs;
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours >= 24; // 24 hours threshold
    }).map(s => {
      const createdAtMs = new Date(s.createdAt).getTime();
      const diffHours = Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60));
      return {
        ...s,
        delayHours: diffHours
      };
    }).sort((a, b) => b.delayHours - a.delayHours);
  }, [sales]);

  // 2. Calculate Low Stock Products (Stock <= Threshold)
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      const threshold = p.lowStockThreshold !== undefined && p.lowStockThreshold > 0 ? p.lowStockThreshold : 5;
      return p.stock <= threshold;
    }).sort((a, b) => a.stock - b.stock);
  }, [products]);

  // Action: Mark order as delivered instantly
  const handleDeliverOrder = async (saleId: string, orderNum: string) => {
    try {
      await updateSaleStatus(saleId, "çatdırılıb");
      addToast?.({
        type: "success",
        title: "Sifariş Çatdırıldı",
        content: `#${orderNum} nömrəli sifariş müvəffəqiyyətlə çatdırılmış olaraq qeyd edildi!`
      });
    } catch (err: any) {
      addToast?.({
        type: "warning",
        title: "Xəta baş verdi",
        content: err.message || "Status yenilənə bilmədi."
      });
    }
  };

  // Action: Cancel order instantly
  const handleCancelOrder = async (saleId: string, orderNum: string) => {
    try {
      await updateSaleStatus(saleId, "ləğv edilib");
      addToast?.({
        type: "info",
        title: "Sifariş Ləğv Edildi",
        content: `#${orderNum} nömrəli sifariş ləğv edildi və xəbərdarlıq ləğv olundu.`
      });
    } catch (err: any) {
      addToast?.({
        type: "warning",
        title: "Xəta baş verdi",
        content: err.message || "Status yenilənə bilmədi."
      });
    }
  };

  // Action: Increment product stock by +25
  const handleRefillStock = async (productId: string, productName: string) => {
    try {
      await adjustProductStock(productId, 25, "Alış", "Real-time tədarük sürətli düyməsi");
      addToast?.({
        type: "success",
        title: "Stok Uğurla Yeniləndi",
        content: `${productName} üçün stok +25 ədəd artırıldı və tədarük qeydə alındı!`
      });
    } catch (err: any) {
      addToast?.({
        type: "warning",
        title: "Xəta baş verdi",
        content: err.message || "Stok artırıla bilmədi."
      });
    }
  };

  // Simulation support for testing
  const handleSimulateOrder = async () => {
    setIsSimulatingOrder(true);
    const date36hAgo = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    
    const custId = customers[0]?.id || "cust_sim_123";
    const custName = customers[0]?.name || "Kamran Ağayev (Simulyasiya)";
    const custPhone = customers[0]?.phone || "+994503214569";
    
    const prodId = products[0]?.id || "prod_sim_123";
    const prodName = products[0]?.name || "Simulyasiya Sınaq Məhsulu";
    const prodPrice = products[0]?.price || 49;

    const mockSale = {
      orderNumber: `AYV-SIM-${Math.floor(1000 + Math.random() * 9000)}`,
      customerId: custId,
      customerName: custName,
      customerPhone: custPhone,
      address: "Bakı, Gənclik metrosu yaxınlığı",
      items: [
        {
          productId: prodId,
          productName: prodName,
          qty: 1,
          unitPrice: prodPrice,
          total: prodPrice
        }
      ],
      deliveryType: "courier" as const,
      deliveryCost: 4,
      totalProductPrice: prodPrice,
      totalAmount: prodPrice + 4,
      netRevenue: prodPrice,
      status: "gözləyir" as const,
      paymentStatus: "Ödənilməyib",
      notes: "Simulyasiya test sifarişi (36 saatlıq süni gecikmə)",
      createdAt: date36hAgo,
      source: "manual" as const,
      isRevenueCalculated: false,
      statusHistory: [{ status: "gözləyir" as const, changedAt: date36hAgo }]
    };

    try {
      await createSale(mockSale);
      addToast?.({
        type: "success",
        title: "Süni Sifariş Yaradıldı",
        content: "36 saat öncə yaradılmış və gecikən bir sınaq sifarişi db-yə yazıldı!"
      });
    } catch (e: any) {
      addToast?.({
        type: "warning",
        title: "Simulyasiya Xətası",
        content: e.message || "Sifariş yaradıla bilmədi."
      });
    } finally {
      setIsSimulatingOrder(false);
    }
  };

  const handleSimulateLowStock = async () => {
    if (products.length === 0) {
      addToast?.({
        type: "warning",
        title: "Sistemdə Məhsul Yoxdur",
        content: "Stok simulyasiyası üçün ilk öncə anbarda məhsul qeydiyyatı edin."
      });
      return;
    }
    
    setIsSimulatingStock(true);
    const targetProduct = products[0];
    const threshold = targetProduct.lowStockThreshold || 5;
    
    // Set stock to threshold - 3
    const targetStock = Math.max(1, threshold - 3);
    const delta = targetStock - targetProduct.stock;
    
    try {
      await adjustProductStock(targetProduct.id, delta, "Düzəliş", "Səmərəli sınama üçün stoku süni azaltmaq");
      addToast?.({
        type: "warning",
        title: "Stok limiti süni azaldı",
        content: `${targetProduct.name} stoku ${targetStock} ədədə endirildi (Limit ${threshold})!`
      });
    } catch (e: any) {
      addToast?.({
        type: "warning",
        title: "Simulyasiya Xətası",
        content: e.message || "Stok tənzimlənə bilmədi."
      });
    } finally {
      setIsSimulatingStock(false);
    }
  };

  const hasAlerts = delayedOrders.length > 0 || lowStockProducts.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-500 opacity-75 top-0.5 right-0.5" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600 top-0.5 right-0.5" />
          </div>
          <div>
            <h3 className="font-heading font-extrabold text-sm text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
              Real-time Analitik Monitorinq & Bildirişlər
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">Bütün gecikmələr və anbar məlumatları avtomatik izlənilir</p>
          </div>
        </div>

        {/* Counter Badges info */}
        <div className="flex items-center gap-2">
          {delayedOrders.length > 0 && (
            <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full border border-rose-100 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {delayedOrders.length} Gecikmə
            </span>
          )}
          {lowStockProducts.length > 0 && (
            <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full border border-amber-100 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {lowStockProducts.length} Kritik Stok
            </span>
          )}
          {!hasAlerts && (
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
              Sistem Normaldır
            </span>
          )}
        </div>
      </div>

      {hasAlerts ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Column Local 1: Delayed Orders Warning */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-rose-50 pb-1.5">
              <Clock className="w-4 h-4 text-red-500" />
              <h4 className="text-xs font-bold text-slate-700">Gecikmiş Sifarişlər (24 saat+)</h4>
            </div>

            {delayedOrders.length > 0 ? (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {delayedOrders.map(order => (
                  <div 
                    key={order.id} 
                    className="p-3 bg-red-50/40 border border-red-100 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-red-50/80 transition-colors"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-800 font-mono">#{order.orderNumber}</span>
                        <span className="text-[10px] font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                          {order.delayHours} saatdır gözləyir
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-650 font-medium">Müştəri: <b className="text-slate-800">{order.customerName}</b></p>
                      <p className="text-[10px] text-slate-450 truncate max-w-xs">{order.address}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleDeliverOrder(order.id, order.orderNumber)}
                        className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        Çatdırıldı
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order.id, order.orderNumber)}
                        className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1.5 rounded-lg transition-all active:scale-95 cursor-pointer"
                      >
                        Ləğv et
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Gözləyən sifarişlərdə hər hansı bir gecikmə qeydə alınmadı.</p>
            )}
          </div>

          {/* Column Local 2: Low Stock Warning */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-amber-50 pb-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h4 className="text-xs font-bold text-slate-700">Stoku Azalmış Məhsullar</h4>
            </div>

            {lowStockProducts.length > 0 ? (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {lowStockProducts.map(prod => {
                  const limit = prod.lowStockThreshold || 5;
                  const ratio = Math.min(100, (prod.stock / limit) * 100);
                  
                  return (
                    <div 
                      key={prod.id} 
                      className="p-3 bg-amber-50/40 border border-amber-105/65 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:bg-amber-50/80 transition-colors"
                    >
                      <div className="space-y-1.5 flex-1 w-full">
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-slate-800 line-clamp-1">{prod.name}</span>
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono shrink-0">
                            Qalan: {prod.stock} / Limit: {limit}
                          </span>
                        </div>
                        
                        {/* Progress Bar of Stock depletion */}
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              prod.stock === 0 ? "bg-red-600" : prod.stock <= 2 ? "bg-red-500" : "bg-amber-500"
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono">SKU: {prod.SKU || "Məlumat yoxdur"}</p>
                      </div>

                      <div className="shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleRefillStock(prod.id, prod.name)}
                          className="text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                        >
                          +25 Stok
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">Bütün anbarda olan malların qalığı verilən limitlərdən yuxarıdır.</p>
            )}
          </div>
        </div>
      ) : (
        /* Empty / Standard Beautiful State */
        <div className="py-8 flex flex-col items-center justify-center text-center space-y-2 bg-emerald-50/20 border border-emerald-150/45 rounded-2xl p-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full animate-bounce">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-xs font-bold text-slate-700">Təhlil Normaldır: Heç Bir Kritik İnsident Tapılmadı</h4>
          <p className="text-[11px] text-slate-400 max-w-sm">
            Sistem tərəfindən 24 saatdan çox gecikən sifariş və ya müəyyən edilmiş limitdən az qalan anbar məhsulu aşkarlanmadı. Hər şey idealdır!
          </p>
        </div>
      )}

      {/* Sınaq / Simulation Toggles */}
      <div className="flex flex-col border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowSimulation(p => !p)}
          className="text-[10px] font-bold text-slate-400 hover:text-slate-650 self-start cursor-pointer flex items-center gap-1 bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors px-2.5 py-1 rounded-lg"
        >
          ⚙️ {showSimulation ? "Simulyasiya Paneli Bağla" : "Sistemi Sınaqdan Keçir (Simulation Panel)"}
        </button>

        {showSimulation && (
          <div className="bg-slate-50/50 rounded-xl p-3 mt-2 border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
            <div className="space-y-0.5">
              <p className="text-[10px] font-bold text-slate-700">Avtomatik Sınaq Modulu</p>
              <p className="text-[9px] text-slate-400">Panelin işləməsini sınamaq üçün süni olaraq verilənlər bazasından sınaq qeydi yaradın:</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSimulatingOrder}
                onClick={handleSimulateOrder}
                className="text-[9px] font-extrabold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSimulatingOrder ? "Yaradılır..." : "⚡ Sifariş Gecikməsi Simulyasiya Et"}
              </button>
              <button
                type="button"
                disabled={isSimulatingStock}
                onClick={handleSimulateLowStock}
                className="text-[9px] font-extrabold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSimulatingStock ? "Yenilənir..." : "📦 Kritik Stok Simulyasiya Et"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardView() {
  const navigate = useNavigate();
  const { sales, expenses, products, couriers, customers, settings, currentUser } = useData();
  const [period, setPeriod] = useState<string>("Bu ay");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // 3 Dynamic Analytical Cards Interactive States
  const [productAnalyticsMetric, setProductAnalyticsMetric] = useState<"qty" | "revenue">("qty");
  const [courierAnalyticsMetric, setCourierAnalyticsMetric] = useState<"status" | "amount">("status");
  const [distributionAnalyticsMode, setDistributionAnalyticsMode] = useState<"courier" | "product">("courier");

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Soft Neumorphic Planner States & Persistent Todos
  const [plannerTab, setPlannerTab] = useState<"unplanned" | "planned" | "all">("unplanned");
  const [newTodo, setNewTodo] = useState("");
  const [todoProject, setTodoProject] = useState("");
  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem("ayvelin_planner_todos");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return [
      { id: "HI-1", text: "Kuryer balansının hesablanması", status: "unplanned", project: "Maliyyə" },
      { id: "HI-2", text: "Stok xəbərdarlıqlarının yoxlanılması", status: "unplanned", project: "" },
      { id: "HI-3", text: "Yeni kuryer müsahibələrinin qeydi", status: "planned", project: "Kuryer" },
      { id: "HI-4", text: "Müştəri rəylərinin analizi", status: "planned", project: "Biznes" },
      { id: "HI-5", text: "Sürətli gəlir statistikası analizi", status: "scheduled", project: "Biznes" },
      { id: "HI-6", text: "Xərclər siyahısının tərtib edilməsi", status: "done", project: "Maliyyə" }
    ];
  });

  useEffect(() => {
    localStorage.setItem("ayvelin_planner_todos", JSON.stringify(todos));
  }, [todos]);

  const [calendarOffset, setCalendarOffset] = useState(0);

  // Determine date bounds relative to current real-time
  const currentDate = new Date();

  const dateFilterBounds = useMemo(() => {
    return getBakuDateRange(period);
  }, [period]);

  // Filtered lists based on bounds
  const currentSales = useMemo(() => {
    if (period === "Bütün dövrlər") return sales;
    return sales.filter(s => {
      const saleDateStr = getOrderReportingDateYMD(s);
      return saleDateStr >= dateFilterBounds.start && saleDateStr <= dateFilterBounds.end;
    });
  }, [sales, dateFilterBounds, period]);

  const compSales = useMemo(() => {
    if (period === "Bütün dövrlər") return [];
    return sales.filter(s => {
      const saleDateStr = getOrderReportingDateYMD(s);
      return saleDateStr >= dateFilterBounds.compStart && saleDateStr <= dateFilterBounds.compEnd;
    });
  }, [sales, dateFilterBounds, period]);

  const currentIntakeSales = useMemo(() => {
    if (period === "Bütün dövrlər") return sales;
    return sales.filter(s => {
      const saleDateStr = getOrderTrackingDateYMD(s);
      return saleDateStr >= dateFilterBounds.start && saleDateStr <= dateFilterBounds.end;
    });
  }, [sales, dateFilterBounds, period]);

  const currentExpenses = useMemo(() => {
    if (period === "Bütün dövrlər") return expenses;
    return expenses.filter(e => {
      const expDateOnly = formatToBakuYMD(e.date);
      return expDateOnly >= dateFilterBounds.start && expDateOnly <= dateFilterBounds.end;
    });
  }, [expenses, dateFilterBounds, period]);

  const compExpenses = useMemo(() => {
    if (period === "Bütün dövrlər") return [];
    return expenses.filter(e => {
      const expDateOnly = formatToBakuYMD(e.date);
      return expDateOnly >= dateFilterBounds.compStart && expDateOnly <= dateFilterBounds.compEnd;
    });
  }, [expenses, dateFilterBounds, period]);

  // Calculations Helper (Current Cohort)
  const currentCalculations = useMemo(() => {
    const delivered = currentSales.filter(s => s.status === "çatdırılıb");
    const grossRevenue = delivered.reduce((acc, s) => acc + s.totalAmount, 0);
    const netRevenue = delivered.reduce((acc, s) => acc + s.netRevenue, 0); // totalProductPrice - deliveryCost
    
    // COGS
    let cogs = 0;
    delivered.forEach((sale) => {
      sale.items.forEach((item) => {
        const matchingProd = products.find(p => p.id === item.productId);
        const cost = matchingProd ? matchingProd.costPrice : (item.unitPrice * 0.4); // fallback 40%
        cogs += cost * item.qty;
      });
    });

    const deliveryCosts = delivered.reduce((acc, s) => acc + (Number(s.deliveryCost) || 0), 0);
    const manualExpenses = currentExpenses.filter(e => e.source === "manual");
    const otherExpenses = manualExpenses.reduce((acc, e) => acc + e.amount, 0);
    
    // Real strict net profit
    const netProfit = grossRevenue - cogs - deliveryCosts - otherExpenses;
    
    // Combined total expenses card (matches Expenses page: manual + auto_delivery)
    const totalExpensesCard = currentExpenses.reduce((acc, e) => acc + e.amount, 0);
    const otherExpSum = totalExpensesCard; // manual + auto

    const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    
    // Reklam ROI
    const reklamXerci = manualExpenses.filter(e => e.category === "Reklam").reduce((acc, e) => acc + e.amount, 0);
    const reklamROI = reklamXerci > 0 ? (grossRevenue / reklamXerci) * 100 : 0;

    const orderCount = currentSales.length;
    const itemsCount = currentSales.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.qty, 0), 0);
    const averageOrderValue = delivered.length > 0 ? (grossRevenue / delivered.length) : 0;

    // Distinct customer count
    const distinctCustCount = new Set(currentSales.map(s => s.customerPhone)).size;

    return {
      grossRevenue,
      netProfit,
      totalExpenses: cogs + deliveryCosts + otherExpenses, // strict for calculations
      displayExpensesFlag: totalExpensesCard, // for general report card
      averageOrderValue,
      profitMargin,
      reklamXerci,
      reklamROI,
      orderCount,
      itemsCount,
      distinctCustCount
    };
  }, [currentSales, currentExpenses, products]);

  // Calculations Helper (Comparison Cohort)
  const compCalculations = useMemo(() => {
    const delivered = compSales.filter(s => s.status === "çatdırılıb");
    const grossRevenue = delivered.reduce((acc, s) => acc + s.totalAmount, 0);
    let cogs = 0;
    delivered.forEach((sale) => {
      sale.items.forEach((item) => {
        const matchingProd = products.find(p => p.id === item.productId);
        const cost = matchingProd ? matchingProd.costPrice : (item.unitPrice * 0.4);
        cogs += cost * item.qty;
      });
    });
    const deliveryCosts = delivered.reduce((acc, s) => acc + (Number(s.deliveryCost) || 0), 0);
    const manualExpenses = compExpenses.filter(e => e.source === "manual");
    const otherExpenses = manualExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossRevenue - cogs - deliveryCosts - otherExpenses;
    const displayExpenses = compExpenses.reduce((acc, e) => acc + e.amount, 0);
    const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const reklamXerci = manualExpenses.filter(e => e.category === "Reklam").reduce((acc, e) => acc + e.amount, 0);

    const orderCount = compSales.length;
    const averageOrderValue = delivered.length > 0 ? (grossRevenue / delivered.length) : 0;

    return {
      grossRevenue,
      netProfit,
      displayExpenses,
      profitMargin,
      reklamXerci,
      averageOrderValue
    };
  }, [compSales, compExpenses, products]);

  // Calculations Helper (Previous Month Cohort for Comparison)
  const prevMonthCalculations = useMemo(() => {
    const curYear = currentDate.getFullYear();
    const curMonth = currentDate.getMonth();
    
    let prevYear = curYear;
    let prevMonth = curMonth - 1;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear--;
    }

    const pmSales = sales.filter(s => {
      const reportingDate = getOrderReportingDate(s);
      if (!reportingDate) return false;
      const d = new Date(reportingDate);
      return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
    });

    const pmExpenses = expenses.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
    });

    const delivered = pmSales.filter(s => s.status === "çatdırılıb");
    const grossRevenue = delivered.reduce((acc, s) => acc + s.totalAmount, 0);

    let cogs = 0;
    delivered.forEach((sale) => {
      sale.items.forEach((item) => {
        const matchingProd = products.find(p => p.id === item.productId);
        const cost = matchingProd ? matchingProd.costPrice : (item.unitPrice * 0.4);
        cogs += cost * item.qty;
      });
    });

    const deliveryCosts = delivered.reduce((acc, s) => acc + (Number(s.deliveryCost) || 0), 0);
    const manualExpenses = pmExpenses.filter(e => e.source === "manual");
    const otherExpenses = manualExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossRevenue - cogs - deliveryCosts - otherExpenses;
    const displayExpenses = pmExpenses.reduce((acc, e) => acc + e.amount, 0);
    const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
    const reklamXerci = manualExpenses.filter(e => e.category === "Reklam").reduce((acc, e) => acc + e.amount, 0);
    const orderCount = pmSales.length;
    const averageOrderValue = delivered.length > 0 ? (grossRevenue / delivered.length) : 0;

    const newCustomersCount = customers.filter(c => {
      if (!c.createdAt) return false;
      const d = new Date(c.createdAt);
      return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
    }).length;

    return {
      grossRevenue,
      netProfit,
      displayExpenses,
      averageOrderValue,
      profitMargin,
      reklamXerci,
      orderCount,
      newCustomersCount
    };
  }, [sales, expenses, products, customers, currentDate]);

  // Percentage and value comparators
  const diffs = useMemo(() => {
    const getChange = (curr: number, prev: number) => {
      const diffVal = curr - prev;
      if (prev === 0) {
        return {
          percent: curr > 0 ? 100 : 0,
          up: curr >= 0,
          val: Math.abs(diffVal)
        };
      }
      const pct = (diffVal / prev) * 100;
      return {
        percent: Math.abs(pct),
        up: diffVal >= 0,
        val: Math.abs(diffVal)
      };
    };

    return {
      sales: getChange(currentCalculations.grossRevenue, compCalculations.grossRevenue),
      profit: getChange(currentCalculations.netProfit, compCalculations.netProfit),
      expenses: getChange(currentCalculations.displayExpensesFlag, compCalculations.displayExpenses),
      averageOrder: getChange(currentCalculations.averageOrderValue, compCalculations.averageOrderValue),
      margin: {
        val: currentCalculations.profitMargin - compCalculations.profitMargin,
        up: currentCalculations.profitMargin >= compCalculations.profitMargin
      },
      reklam: getChange(currentCalculations.reklamXerci, compCalculations.reklamXerci)
    };
  }, [currentCalculations, compCalculations]);

  // Chart data: monthly trend for 6 months
  const monthlyTrendData = useMemo(() => {
    const months = ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"];
    const results: any[] = [];
    
    // Loop last 6 months
    const dObj = new Date(currentDate);
    for (let i = 5; i >= 0; i--) {
      const matchDate = new Date(dObj.getFullYear(), dObj.getMonth() - i, 1);
      const mLabel = `${months[matchDate.getMonth()]} ${matchDate.getFullYear()}`;
      
      const salesInMonth = sales.filter(s => {
        const itemDate = new Date(getOrderReportingDate(s));
        return itemDate.getFullYear() === matchDate.getFullYear() && itemDate.getMonth() === matchDate.getMonth();
      });

      const deliveredInMonth = salesInMonth.filter(s => s.status === "çatdırılıb");
      const rev = deliveredInMonth.reduce((acc, s) => acc + s.totalAmount, 0);

      const expensesInMonth = expenses.filter(e => {
        const itemDate = new Date(e.date);
        return itemDate.getFullYear() === matchDate.getFullYear() && itemDate.getMonth() === matchDate.getMonth();
      });

      let cogs = 0;
      deliveredInMonth.forEach((sale) => {
        sale.items.forEach((item) => {
          const matchingProd = products.find(p => p.id === item.productId);
          const cost = matchingProd ? matchingProd.costPrice : (item.unitPrice * 0.4);
          cogs += cost * item.qty;
        });
      });
      const delCosts = deliveredInMonth.reduce((acc, s) => acc + s.deliveryCost, 0);
      const manualExp = expensesInMonth.filter(e => e.source === "manual").reduce((acc, e) => acc + e.amount, 0);
      const totalExp = cogs + delCosts + manualExp;
      const profit = rev - totalExp;

      results.push({
        name: mLabel,
        "Satış": rev,
        "Xərc": totalExp,
        "Mənfəət": profit
      });
    }
    return results;
  }, [sales, expenses, products]);

  // Chart data: daily trend for selected dates
  const dailyTrendData = useMemo(() => {
    const groups: { [dKey: string]: { dateStr: string; sales: number; count: number } } = {};
    
    // 1. Group sales revenue by delivery_date (using currentSales financial cohort)
    currentSales.forEach((s) => {
      const dayKey = getOrderReportingDateYMD(s);
      if (!dayKey) return;
      if (!groups[dayKey]) {
        groups[dayKey] = { dateStr: formatDateAZ(dayKey), sales: 0, count: 0 };
      }
      if (s.status === "çatdırılıb") {
        groups[dayKey].sales += s.totalAmount;
      }
    });

    // 2. Group order volume intake by order_date (using currentIntakeSales cohort)
    currentIntakeSales.forEach((s) => {
      const dayKey = getOrderTrackingDateYMD(s);
      if (!dayKey) return;
      if (!groups[dayKey]) {
        groups[dayKey] = { dateStr: formatDateAZ(dayKey), sales: 0, count: 0 };
      }
      groups[dayKey].count += 1;
    });

    const sorted = Object.keys(groups).sort().map(k => ({
      name: groups[k].dateStr,
      "Satış (₼)": groups[k].sales,
      "Sifariş (Ədəd)": groups[k].count
    }));

    if (sorted.length === 0) {
      return [{ name: "Məlumat yoxdur", "Satış (₼)": 0, "Sifariş (Ədəd)": 0 }];
    }
    return sorted;
  }, [currentSales, currentIntakeSales]);

  // Category breakdown for pie chart
  const categoryBreakdownData = useMemo(() => {
    const cats: { [cat: string]: number } = {};
    currentExpenses.forEach((e) => {
      if (e.amount <= 0) return;
      const cat = e.category || "Digər";
      cats[cat] = (cats[cat] || 0) + e.amount;
    });

    // Also include COGS if period is selected
    if (currentCalculations.totalExpenses > 0) {
      const cogsVal = currentSales
        .filter(s => s.status === "çatdırılıb")
        .reduce((acc, s) => {
          let cogs = 0;
          s.items.forEach(i => {
            const p = products.find(prod => prod.id === i.productId);
            const prodCost = p ? p.costPrice : (i.unitPrice * 0.4);
            if (prodCost > 0) {
              cogs += prodCost * i.qty;
            }
          });
          return acc + cogs;
        }, 0);
      
      if (cogsVal > 0) {
        cats["Məhsul Maya Dəyəri (COGS)"] = cogsVal;
      }
    }

    const COLORS = ["#1e3a5f", "#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

    return Object.keys(cats)
      .map((k, index) => ({
        name: k,
        value: Math.round(cats[k]),
        color: COLORS[index % COLORS.length]
      }))
      .filter((item) => item.value > 0);
  }, [currentExpenses, currentSales, products, currentCalculations]);

  // Top 5 addresses
  const topAddresses = useMemo(() => {
    const counts: { [addr: string]: number } = {};
    sales.forEach(s => {
      if (!s.address) return;
      const clean = s.address.split(",")[0].trim();
      counts[clean] = (counts[clean] || 0) + 1;
    });

    return Object.keys(counts)
      .map(k => ({ address: k, count: counts[k] }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);
  }, [sales]);

  // Courier workload bar chart
  const courierWorkloadData = useMemo(() => {
    return couriers.map(cr => {
      const isColumba = cr.isDepotBased === true;
      // count sales
      const crSales = sales.filter(s => {
        if (s.status !== "çatdırılıb") return false;
        if (isColumba) {
          const saleCourier = s.courierId ? couriers.find(c => c.id === s.courierId) : null;
          const hasColumbaText = (s.courierName || "").toLowerCase().includes("columba") || 
                                 (s.cargoCompany || "").toLowerCase().includes("columba") || 
                                 (s.notes || "").toLowerCase().includes("columba");
          return (
            s.courierId === cr.id ||
            saleCourier?.isDepotBased === true ||
            hasColumbaText
          );
        }
        return s.courierId === cr.id;
      });
      const deliverySum = crSales.reduce((acc, s) => acc + (s.deliveryCost || 0), 0);
      return {
        name: cr.name,
        "Çatdırılma (Ədəd)": crSales.length,
        "Qazanc (₼)": deliverySum
      };
    }).sort((a, b) => b["Çatdırılma (Ədəd)"] - a["Çatdırılma (Ədəd)"]);
  }, [couriers, sales]);

  // Last order date info block - fast O(1) since sales is already sorted
  const lastOrderStats = useMemo(() => {
    if (sales.length === 0) return { days: "—", dateStr: "Məlumat yoxdur" };
    const newestSale = sales[0];
    const lastDate = new Date(newestSale.createdAt);
    const msDiff = currentDate.getTime() - lastDate.getTime();
    const days = Math.floor(msDiff / (1000 * 60 * 60 * 24));
    return {
      days: days < 0 ? 0 : days,
      dateStr: formatDateAZ(getOrderTrackingDate(newestSale))
    };
  }, [sales]);

  // Low Stock Warnings
  const lowStockWarnings = useMemo(() => {
    return products.filter(p => p.stock <= p.lowStockThreshold);
  }, [products]);

  // Late Orders > 24 hours in waiting status "gözləyir"
  const lateOrders = useMemo(() => {
    const thresholdMs = currentDate.getTime() - 24 * 60 * 60 * 1000;
    return sales.filter(s => {
      if (s.status !== "gözləyir") return false;
      const orderDate = new Date(getOrderTrackingDate(s));
      return orderDate.getTime() <= thresholdMs;
    });
  }, [sales]);

  // No sales streak in Baku current month (Bu ayın satışsız günlərinin sayı) - fast O(1) Set lookups
  const saleslessMonthStats = useMemo(() => {
    const curYear = currentDate.getFullYear();
    const curMonth = currentDate.getMonth();
    
    // Fast O(1) set of delivered sale dates
    const deliveredDates = new Set<string>();
    for (let i = 0; i < sales.length; i++) {
      if (sales[i].status === "çatdırılıb") {
        deliveredDates.add(getOrderReportingDateYMD(sales[i]));
      }
    }
    
    // Current month elapsed days
    const curElapsedDays = currentDate.getDate();
    let currMonthNoSalesDays = 0;
    for (let d = 1; d <= curElapsedDays; d++) {
      const dateStr = `${curYear}-${String(curMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!deliveredDates.has(dateStr)) currMonthNoSalesDays++;
    }

    // Previous month full days
    let prevYear = curYear;
    let prevMonth = curMonth - 1;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear--;
    }
    const prevDaysInMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    let prevMonthNoSalesDays = 0;
    for (let d = 1; d <= prevDaysInMonth; d++) {
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!deliveredDates.has(dateStr)) prevMonthNoSalesDays++;
    }

    return {
      current: currMonthNoSalesDays,
      previous: prevMonthNoSalesDays
    };
  }, [sales]);

  // Ümumi satışsız günlər (Bütün dövrlər üzrə)
  const totalSaleslessDays = useMemo(() => {
    if (sales.length === 0) return 0;
    const oldestSale = sales[sales.length - 1];
    const firstDateStr = getOrderTrackingDateYMD(oldestSale);
    const firstDate = firstDateStr ? new Date(firstDateStr) : currentDate;
    const elapsedMs = currentDate.getTime() - firstDate.getTime();
    const elapsedDays = Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)) + 1;
    
    const activeSalesDays = new Set<string>();
    for (let i = 0; i < sales.length; i++) {
      if (sales[i].status === "çatdırılıb") {
        activeSalesDays.add(getOrderReportingDateYMD(sales[i]));
      }
    }
    
    const totalDaysInRange = elapsedDays > 0 ? elapsedDays : 1;
    return Math.max(0, totalDaysInRange - activeSalesDays.size);
  }, [sales]);

  // Sifariş sayı + Satılan məhsul sayı (bu ay vs ötən ay)
  const ordersAndItemsComparison = useMemo(() => {
    const curYear = currentDate.getFullYear();
    const curMonth = currentDate.getMonth();
    
    let prevYear = curYear;
    let prevMonth = curMonth - 1;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear--;
    }

    // Ay-başı-bugünə-qədər (month-to-date) müqayisə: keçən ayın da yalnız
    // eyni gün nömrəsinə qədər olan hissəsi götürülür, əks halda keçən ayın
    // TAM ayı bu ayın YARIMÇIQ ayı ilə müqayisə olunur ki, bu da səhv nəticə verir.
    const curDay = currentDate.getDate();

    const thisMonthSales = sales.filter(s => {
      const d = new Date(getOrderReportingDate(s));
      return d.getFullYear() === curYear && d.getMonth() === curMonth && d.getDate() <= curDay;
    });

    const prevMonthSales = sales.filter(s => {
      const d = new Date(getOrderReportingDate(s));
      return d.getFullYear() === prevYear && d.getMonth() === prevMonth && d.getDate() <= curDay;
    });

    const thisMonthDelivered = thisMonthSales.filter(s => s.status === "çatdırılıb");
    const prevMonthDelivered = prevMonthSales.filter(s => s.status === "çatdırılıb");

    const thisMonthQty = thisMonthDelivered.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.qty, 0), 0);
    const prevMonthQty = prevMonthDelivered.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.qty, 0), 0);

    return {
      thisMonthOrders: thisMonthSales.length,
      prevMonthOrders: prevMonthSales.length,
      thisMonthQty,
      prevMonthQty
    };
  }, [sales]);

  // Son reklam xərci tarixi + orta günlük reklam xərci
  const reklamExpenseStats = useMemo(() => {
    const ads = expenses.filter(e => e.category === "Reklam");
    const validAds = ads.filter(e => e.date);
    if (validAds.length === 0) {
      return {
        lastDateStr: "Məlumat yoxdur",
        averageDaily: 0
      };
    }
    const sortedAds = [...validAds].sort((a,b) => b.date.localeCompare(a.date));
    const lastDate = sortedAds[0].date;
    
    // Calculate advertisement in current selected period
    const totalReklamInPeriod = currentCalculations.reklamXerci;
    
    // Calculate number of elapsed days in selection period
    // If selecting Bütün dövrlər, use elapsed days since first expense or default to 30 to avoid huge divisor
    let diffDays = 30;
    if (period !== "Bütün dövrlər" && dateFilterBounds.start && dateFilterBounds.end) {
      const diffMs = new Date(dateFilterBounds.end).getTime() - new Date(dateFilterBounds.start).getTime();
      diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) || 1;
    } else {
      const sortedEx = [...expenses].filter(e => e.date).sort((a,b) => a.date.localeCompare(b.date));
      if (sortedEx.length > 0) {
        const earliest = new Date(sortedEx[0].date);
        const ms = currentDate.getTime() - earliest.getTime();
        diffDays = Math.ceil(ms / (1000 * 60 * 60 * 24)) || 30;
      }
    }
    
    const averageDaily = totalReklamInPeriod / diffDays;

    return {
      lastDateStr: formatDateAZ(lastDate),
      averageDaily
    };
  }, [expenses, currentCalculations.reklamXerci, dateFilterBounds, period]);

  // Kargo + Expargo xərcləri cəmi (və kuryer stoku təmiz xülasə verisi)
  const cargoAndExpargoDeliveryCosts = useMemo(() => {
    const delivered = currentSales.filter(s => s.status === "çatdırılıb");
    const cargoSales = delivered.filter(s => s.deliveryType === "cargo");
    const expargoSales = delivered.filter(s => s.deliveryType === "expargo");

    const cargoTotal = cargoSales.reduce((acc, s) => acc + s.deliveryCost, 0);
    const expargoTotal = expargoSales.reduce((acc, s) => acc + s.deliveryCost, 0);

    return {
      cargoTotal,
      expargoTotal,
      combined: cargoTotal + expargoTotal
    };
  }, [currentSales]);

  // Top selling products (Ən çox satılan məhsullar top 5) - O(1) product lookup
  const topSellingProducts = useMemo(() => {
    const prodMap = new Map<string, Product>(products.map(p => [p.id, p]));
    const productSalesMap: { [pId: string]: { name: string; sku: string; qty: number; totalRev: number } } = {};
    
    for (let i = 0; i < currentSales.length; i++) {
      const sale = currentSales[i];
      if (sale.status !== "çatdırılıb") continue;
      if (!sale.items) continue;
      for (let j = 0; j < sale.items.length; j++) {
        const item = sale.items[j];
        if (!productSalesMap[item.productId]) {
          const matchedP = prodMap.get(item.productId);
          productSalesMap[item.productId] = {
            name: item.productName || (matchedP ? matchedP.name : "Naməlum Məhsul"),
            sku: matchedP ? matchedP.SKU : "—",
            qty: 0,
            totalRev: 0
          };
        }
        productSalesMap[item.productId].qty += item.qty;
        productSalesMap[item.productId].totalRev += item.total;
      }
    }

    return Object.values(productSalesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [currentSales, products]);

  // Last orders (Son sifarişlər top 5) - already pre-sorted in DataContext
  const lastOrders = useMemo(() => {
    return currentSales.slice(0, 5);
  }, [currentSales]);

  // Weekly Trend and Day of Week Order Metrics calculation - Single pass O(N)
  const weeklyTrendData = useMemo(() => {
    const daysAndIndices = [
      { name: "B.E", dayIndex: 1, prevIndex: 6 }, // Monday (compare to Sunday)
      { name: "Ç.A", dayIndex: 2, prevIndex: 0 }, // Tuesday (compare to Monday)
      { name: "Ç.", dayIndex: 3, prevIndex: 1 },  // Wednesday (compare to Tuesday)
      { name: "C.A", dayIndex: 4, prevIndex: 2 }, // Thursday (compare to Wednesday)
      { name: "C.", dayIndex: 5, prevIndex: 3 },  // Friday (compare to Thursday)
      { name: "Ş.", dayIndex: 6, prevIndex: 4 },  // Saturday (compare to Friday)
      { name: "B.", dayIndex: 0, prevIndex: 5 }   // Sunday (compare to Saturday)
    ];

    // Single pass tally
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < currentIntakeSales.length; i++) {
      const trackDate = getOrderTrackingDate(currentIntakeSales[i]);
      if (trackDate) {
        const d = new Date(trackDate);
        dayCounts[d.getDay()] = (dayCounts[d.getDay()] || 0) + 1;
      }
    }

    const counts = daysAndIndices.map(day => dayCounts[day.dayIndex] || 0);

    return daysAndIndices.map((day, idx) => {
      const currentVal = counts[idx];
      const prevIdx = day.prevIndex;
      const prevVal = counts[prevIdx];
      
      let pctChange = 0;
      if (prevVal > 0) {
        pctChange = ((currentVal - prevVal) / prevVal) * 100;
      }

      return {
        name: day.name,
        Sifariş: currentVal,
        pctChange: pctChange
      };
    });
  }, [currentIntakeSales]);

  // Last 7 days Status Distribution data - Single pass O(N)
  const last7DaysStatusData = useMemo(() => {
    const bakuFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const dates: string[] = [];
    const dateTally: Record<string, { catdirilib: number; gozleyir: number; legv: number }> = {};
    const today = new Date();
    // Start from 6 days ago up to today
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ymd = bakuFormatter.format(d);
      dates.push(ymd);
      dateTally[ymd] = { catdirilib: 0, gozleyir: 0, legv: 0 };
    }

    for (let i = 0; i < currentIntakeSales.length; i++) {
      const s = currentIntakeSales[i];
      const ymd = getOrderTrackingDateYMD(s);
      const entry = dateTally[ymd];
      if (entry) {
        if (s.status === "çatdırılıb") entry.catdirilib++;
        else if (s.status === "gözləyir") entry.gozleyir++;
        else if (s.status === "ləğv edilib") entry.legv++;
      }
    }
    
    return dates.map(dateStr => {
      const entry = dateTally[dateStr] || { catdirilib: 0, gozleyir: 0, legv: 0 };
      const dateObj = new Date(dateStr);
      const label = dateObj.toLocaleDateString("az-AZ", { day: "numeric", month: "short" });

      return {
        name: label,
        "Çatdırılıb": entry.catdirilib,
        "Gözləyir": entry.gozleyir,
        "Ləğv edilib": entry.legv
      };
    });
  }, [currentIntakeSales]);

  // 1. Dynamic Top Ordered Products Analytics (Recharts dataset)
  const topOrderedProductsAnalytics = useMemo(() => {
    const map: { [pId: string]: { id: string; name: string; sku: string; qty: number; deliveredQty: number; revenue: number; orderCount: number; stock: number } } = {};
    
    currentSales.forEach(sale => {
      const isDelivered = sale.status === "çatdırılıb";
      sale.items.forEach(item => {
        if (!item.productId) return;
        if (!map[item.productId]) {
          const pObj = products.find(p => p.id === item.productId);
          map[item.productId] = {
            id: item.productId,
            name: item.productName || (pObj ? pObj.name : "Naməlum Məhsul"),
            sku: pObj ? pObj.SKU : "—",
            qty: 0,
            deliveredQty: 0,
            revenue: 0,
            orderCount: 0,
            stock: pObj ? (pObj.stock ?? 0) : 0
          };
        }
        map[item.productId].qty += Number(item.qty) || 1;
        map[item.productId].orderCount += 1;
        if (isDelivered) {
          map[item.productId].deliveredQty += Number(item.qty) || 1;
          map[item.productId].revenue += Number(item.total) || (Number(item.unitPrice) * (Number(item.qty) || 1));
        }
      });
    });

    const list = Object.values(map);
    const totalQty = list.reduce((sum, item) => sum + item.qty, 0);
    const totalDeliveredQty = list.reduce((sum, item) => sum + item.deliveredQty, 0);
    const totalRev = list.reduce((sum, item) => sum + item.revenue, 0);

    const sortedByQty = [...list].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const sortedByRev = [...list].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const topProduct = sortedByQty[0] || null;
    const topProductShare = totalQty > 0 && topProduct ? ((topProduct.qty / totalQty) * 100).toFixed(1) : "0";

    return {
      itemsQty: sortedByQty.map((item, idx) => ({
        name: item.name.length > 13 ? item.name.substring(0, 11) + ".." : item.name,
        fullName: item.name,
        sku: item.sku,
        "Miqdar (Ədəd)": item.qty,
        "Çatdırılan": item.deliveredQty,
        "Gəlir (₼)": Math.round(item.revenue),
        orderCount: item.orderCount,
        stock: item.stock,
        rank: idx + 1,
        share: totalQty > 0 ? ((item.qty / totalQty) * 100).toFixed(1) : "0"
      })),
      itemsRev: sortedByRev.map((item, idx) => ({
        name: item.name.length > 13 ? item.name.substring(0, 11) + ".." : item.name,
        fullName: item.name,
        sku: item.sku,
        "Miqdar (Ədəd)": item.qty,
        "Gəlir (₼)": Math.round(item.revenue),
        orderCount: item.orderCount,
        stock: item.stock,
        rank: idx + 1,
        share: totalRev > 0 ? ((item.revenue / totalRev) * 100).toFixed(1) : "0"
      })),
      totalQty,
      totalDeliveredQty,
      totalRev,
      topProduct,
      topProductShare,
      uniqueCount: list.length
    };
  }, [currentSales, products]);

  // 2. Dynamic Courier Performance & Activity Analytics (Recharts dataset)
  const courierActivityAnalytics = useMemo(() => {
    const data = couriers.map(cr => {
      const isColumba = cr.isDepotBased === true;
      const crSales = currentSales.filter(s => {
        if (isColumba) {
          const saleCourier = s.courierId ? couriers.find(c => c.id === s.courierId) : null;
          const hasColumbaText = (s.courierName || "").toLowerCase().includes("columba") || 
                                 (s.cargoCompany || "").toLowerCase().includes("columba") || 
                                 (s.notes || "").toLowerCase().includes("columba");
          return s.courierId === cr.id || saleCourier?.isDepotBased === true || hasColumbaText;
        }
        return s.courierId === cr.id;
      });

      const deliveredCount = crSales.filter(s => s.status === "çatdırılıb").length;
      const pendingCount = crSales.filter(s => s.status === "gözləyir").length;
      const cancelledCount = crSales.filter(s => s.status === "ləğv edilib").length;
      const totalCount = crSales.length;

      const deliveredSales = crSales.filter(s => s.status === "çatdırılıb");
      const totalAmount = deliveredSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const totalEarnings = deliveredSales.reduce((sum, s) => sum + (s.deliveryCost !== undefined && s.deliveryCost !== null ? s.deliveryCost : cr.standardDeliveryFee), 0);
      
      const successRate = totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 100;

      return {
        id: cr.id,
        name: cr.name.length > 12 ? cr.name.substring(0, 10) + ".." : cr.name,
        fullName: cr.name,
        phone: cr.phone,
        "Çatdırılıb": deliveredCount,
        "Gözləyir": pendingCount,
        "Ləğv edilib": cancelledCount,
        "Ümumi Sifariş": totalCount,
        "Kassa (₼)": Math.round(totalAmount),
        "Qazanc (₼)": Math.round(totalEarnings),
        successRate,
        standardFee: cr.standardDeliveryFee,
        isDepot: isColumba
      };
    }).sort((a, b) => b["Çatdırılıb"] - a["Çatdırılıb"]);

    const totalDelivered = data.reduce((sum, c) => sum + c["Çatdırılıb"], 0);
    const totalCollected = data.reduce((sum, c) => sum + c["Kassa (₼)"], 0);
    const totalCourierFees = data.reduce((sum, c) => sum + c["Qazanc (₼)"], 0);
    const totalHandled = data.reduce((sum, c) => sum + c["Ümumi Sifariş"], 0);
    const avgSuccessRate = totalHandled > 0 ? Math.round((totalDelivered / totalHandled) * 100) : 100;
    const starCourier = data[0] || null;

    return {
      couriersList: data,
      totalDelivered,
      totalCollected,
      totalCourierFees,
      avgSuccessRate,
      starCourier
    };
  }, [couriers, currentSales]);

  // 3. Dynamic Distribution & Market Share Analytics (Recharts Pie dataset)
  const distributionAnalytics = useMemo(() => {
    const COLORS = ["#006bf8", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#64748b"];

    // Courier distribution
    const couriersWithSales = courierActivityAnalytics.couriersList.filter(c => c["Çatdırılıb"] > 0);
    const courierTotalDelivered = courierActivityAnalytics.totalDelivered || 1;
    const courierPieData = couriersWithSales.map((c, idx) => {
      const pct = Math.round((c["Çatdırılıb"] / courierTotalDelivered) * 100);
      return {
        name: c.fullName,
        shortName: c.name,
        value: c["Çatdırılıb"],
        amount: c["Kassa (₼)"],
        percentage: pct,
        color: COLORS[idx % COLORS.length]
      };
    });

    const finalCourierPie = courierPieData.length > 0 ? courierPieData : [
      { name: "Kuryer Məlumatı Yoxdur", shortName: "Məlumat Yoxdur", value: 1, amount: 0, percentage: 100, color: "#cbd5e1" }
    ];

    // Products distribution
    const topProducts = topOrderedProductsAnalytics.itemsRev.filter(p => p["Gəlir (₼)"] > 0);
    const prodTotalRev = topOrderedProductsAnalytics.totalRev || 1;
    const productPieData = topProducts.map((p, idx) => {
      const pct = Math.round((p["Gəlir (₼)"] / prodTotalRev) * 100);
      return {
        name: p.fullName,
        shortName: p.name,
        value: p["Gəlir (₼)"],
        qty: p["Miqdar (Ədəd)"],
        percentage: pct,
        color: COLORS[idx % COLORS.length]
      };
    });

    const finalProductPie = productPieData.length > 0 ? productPieData : [
      { name: "Məhsul Satışı Yoxdur", shortName: "Məlumat Yoxdur", value: 1, qty: 0, percentage: 100, color: "#cbd5e1" }
    ];

    const topCourierShare = courierPieData[0]?.percentage || 0;
    const top3ProductShare = productPieData.slice(0, 3).reduce((sum, p) => sum + p.percentage, 0);

    return {
      courierPie: finalCourierPie,
      productPie: finalProductPie,
      topCourierShare,
      top3ProductShare,
      topCourierName: courierPieData[0]?.name || "—",
      topProductName: productPieData[0]?.name || "—"
    };
  }, [courierActivityAnalytics, topOrderedProductsAnalytics]);

  // Dynamic metrics for Repeat Purchases (All-time vs Current month)
  const repeatPurchaseStats = useMemo(() => {
    // Group all delivered sales by customer phone number
    const deliveredSalesByPhone: Record<string, number> = {};
    sales.forEach(s => {
      if (s.status === "çatdırılıb") {
        const phone = s.customerPhone?.trim();
        if (phone) {
          deliveredSalesByPhone[phone] = (deliveredSalesByPhone[phone] || 0) + 1;
        }
      }
    });

    // 1. All-time repeat buyers (customers who have >= 2 delivered orders)
    let allTimeRepeatCount = 0;
    customers.forEach(c => {
      const phone = c.phone?.trim();
      const count = phone ? (deliveredSalesByPhone[phone] || 0) : 0;
      if (count >= 2) {
        allTimeRepeatCount++;
      }
    });

    // 2. Cari ayda təkrar alanlar (Current month repeat buyers)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Find all customers who have placed at least one delivered order in the current month
    const currentMonthDeliveredPhones = new Set<string>();
    const currentMonthOrdersByPhone: Record<string, number> = {};

    sales.forEach(s => {
      if (s.status === "çatdırılıb") {
        const tracking = getOrderTrackingDate(s) || s.createdAt;
        if (tracking) {
          const d = new Date(tracking);
          if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            const phone = s.customerPhone?.trim();
            if (phone) {
              currentMonthDeliveredPhones.add(phone);
              currentMonthOrdersByPhone[phone] = (currentMonthOrdersByPhone[phone] || 0) + 1;
            }
          }
        }
      }
    });

    // Active returning clients: those who have ordered in previous months and ordered in this month too.
    // That means they have >= 2 delivered orders in total, and at least one delivered in the current month.
    let activeRepeatThisMonthCount = 0;
    customers.forEach(c => {
      const phone = c.phone?.trim();
      const totalCount = phone ? (deliveredSalesByPhone[phone] || 0) : 0;
      if (totalCount >= 2 && phone && currentMonthDeliveredPhones.has(phone)) {
        activeRepeatThisMonthCount++;
      }
    });

    // Option B: Multiple order placements inside the current calendar month specifically (2+ delivered orders this month)
    const multipleOrdersThisMonthCount = Object.values(currentMonthOrdersByPhone).filter(cnt => cnt >= 2).length;

    return {
      allTimeRepeatCount,
      activeRepeatThisMonthCount,
      multipleOrdersThisMonthCount
    };
  }, [customers, sales]);

  // Real-time Baku Daily Operations & Stock Telemetry
  const todayOperations = useMemo(() => {
    const todayStr = getBakuTodayYMD(); // e.g. "2026-09-27"

    // 1. Bugun qeyd olunan sifarisler (Registered/Created today)
    const registeredToday = sales.filter(s => {
      const trackingYMD = getOrderTrackingDateYMD(s);
      return trackingYMD === todayStr;
    });

    // 2. Bugün çatdırılan sifarişlər (Delivered today based on reporting date)
    const deliveredToday = sales.filter(s => {
      const reportingYMD = getOrderReportingDateYMD(s);
      return s.status === "çatdırılıb" && reportingYMD === todayStr;
    });

    // 3. Neçə sifariş gözləyir (Cəmi / Gözləyir statusunda olanlar)
    const totalPending = sales.filter(s => s.status === "gözləyir");

    // 4. Bugün qeyd edilib hələ də gözləyən (Today's pending)
    const pendingCreatedToday = registeredToday.filter(s => s.status === "gözləyir");

    // 5. Total Stock count across all products
    const mainStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const columbaStock = couriers.filter(c => c.isDepotBased).reduce((acc, c) => acc + (c.stock_quantity || 0), 0);
    const totalStock = mainStock + columbaStock;
    const lowStockCount = products.filter(p => {
      const threshold = p.lowStockThreshold !== undefined && p.lowStockThreshold > 0 ? p.lowStockThreshold : 5;
      return p.stock <= threshold;
    }).length;

    // 6. Bugun qeyd olunan sifarislerin umumi meblegi (Today's registered potential revenue)
    const registeredTodayAmount = registeredToday.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

    // 7. Bugun xalis deyerle çatdırılan mebleg (Today's actual delivered amount)
    const deliveredTodayAmount = deliveredToday.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

    return {
      todayStr,
      registeredTodayCount: registeredToday.length,
      deliveredTodayCount: deliveredToday.length,
      totalPendingCount: totalPending.length,
      pendingCreatedTodayCount: pendingCreatedToday.length,
      totalStock,
      mainStock,
      columbaStock,
      lowStockCount,
      registeredTodayAmount,
      deliveredTodayAmount
    };
  }, [sales, products, couriers]);

  return (
    <div className="space-y-6">
      {/* Hero: greeting, period filter, profit + revenue summary */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs text-slate-500">
              {(() => {
                const hr = new Date().getHours();
                return hr >= 6 && hr < 12 ? "Sabahınız xeyir" : hr >= 12 && hr < 18 ? "Gününüz xeyir" : "Axşamınız xeyir";
              })()}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{currentUser?.displayName || "İstifadəçi"}!</h1>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-xs font-semibold bg-white rounded-full px-4 py-2.5 outline-none cursor-pointer w-full sm:w-auto"
          >
            {["Bu gün", "Son 3 gün", "Bu həftə", "Bu ay", "Öncəki ay", "Son 3 ay", "Son 6 ay", "Bu il", "Ötən il", "Bütün dövrlər"].map(item => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Black profit card */}
          <div className="card-ink lg:col-span-3 p-5 sm:p-6">
            <svg aria-hidden className="absolute -right-10 -top-10 w-56 h-56 opacity-[0.12]" viewBox="0 0 200 200" fill="none" stroke="#d4f72c">
              {[30, 52, 74, 96].map(r => <circle key={r} cx="100" cy="100" r={r} strokeWidth="1.5" />)}
            </svg>
            <p className="text-xs text-white/60 text-center">Xalis mənfəət ({period.toLowerCase()})</p>
            <p className="text-3xl sm:text-4xl font-semibold text-center mt-1 tracking-tight">
              {formatCurrency(currentCalculations.netProfit)}
            </p>
            <div className="grid grid-cols-3 gap-2.5 mt-5 bg-white/[0.07] rounded-3xl p-2.5">
              {[
                { label: "Sifarişlər", icon: ShoppingBag, to: "/sales", primary: true },
                { label: "Xərclər", icon: TrendingDown, to: "/expenses" },
                { label: "Maliyyə", icon: BarChart3, to: "/statistics" },
              ].map(({ label, icon: Icon, to, primary }) => (
                <button
                  key={to}
                  type="button"
                  onClick={() => navigate(to)}
                  className="flex flex-col items-center gap-1.5 py-2 active:scale-95 transition-transform"
                >
                  <span className={`w-11 h-11 rounded-full flex items-center justify-center ${primary ? "bg-lime text-ink" : "bg-white/10 text-white"}`}>
                    <Icon className="w-[18px] h-[18px]" />
                  </span>
                  <span className="text-[11px] text-white/80">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Lime revenue card */}
          <div className="card-lime lg:col-span-2 p-5 sm:p-6 flex flex-col justify-between gap-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">Ümumi satış</span>
              <span className="text-[11px] font-semibold bg-ink text-lime rounded-full px-2.5 py-1">
                Marja {currentCalculations.profitMargin.toFixed(1)}%
              </span>
            </div>
            <p className="text-3xl font-semibold tracking-tight">{formatCurrency(currentCalculations.grossRevenue)}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70">Sifariş sayı</span>
              <strong className="text-base">{currentCalculations.orderCount}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Elegant Stagger Animation Config */}
      {(() => {
        // We write animations configs inline or inside the scope
        const containerVariants = {
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: { staggerChildren: 0.04, delayChildren: 0.02 }
          }
        };

        const cardVariants = {
          hidden: { opacity: 0, y: 15, scale: 0.98 },
          show: { 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: { type: "spring", stiffness: 180, damping: 16 }
          }
        };

        return (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-6"
          >
            {/* Real-time Notification Alerts Section */}
            <RealTimeNotificationCenter />

            {/* Real-time Daily & Stock Operations Dashboard */}
            <div className="space-y-4" id="daily-operations-telemetry-panel">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-1">
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#006bf8]" />
                    <span>⚡ GÜNDƏLİK ƏMƏLİYYATLAR VƏ ANBAR MONITORU</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Bütün bugünkü kuryer daxilolmaları, gözləyən paylanmalar və cari anbar qalıqları</p>
                </div>
                <div className="text-[10px] font-mono font-bold text-[#006bf8] bg-[#006bf8]/10 border border-[#006bf8]/20 px-3 py-1 rounded-full flex items-center gap-1.5 select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#006bf8]" />
                  Real-Vaxt Bakı: {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date())}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                
                {/* Stat 1: Bugun qeyd olunan sifarisler */}
                <motion.div 
                  variants={cardVariants}
                  whileHover={{ y: -4, scale: 1.015 }}
                  onClick={() => navigate("/sales")}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_20px_rgba(233,239,246,0.4)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none transition-all duration-200"
                  id="card-today-registered-telemetry"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-tight">Bugün Qeydə Alınan</p>
                      <h4 className="text-2xl font-black text-[#1A1F2E] font-mono tracking-tight leading-none mt-1 sm:mt-0">
                        {todayOperations.registeredTodayCount} <span className="text-xs font-normal text-slate-400">sifariş</span>
                      </h4>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100 flex-shrink-0">
                      <ShoppingBag className="w-6 h-6 opacity-80" />
                    </div>
                  </div>
                  <div className="mt-3.5 pt-2.5 border-t border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono gap-1 sm:gap-0 leading-none">
                    <span className="text-slate-400">Məbləğ:</span>
                    <strong className="text-slate-700 font-bold">{formatCurrency(todayOperations.registeredTodayAmount)}</strong>
                  </div>
                </motion.div>

                {/* Stat 2: Bugün çatdırılan sifarişlər */}
                <motion.div 
                  variants={cardVariants}
                  whileHover={{ y: -4, scale: 1.015 }}
                  onClick={() => navigate("/sales")}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_20px_rgba(233,239,246,0.4)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none transition-all duration-200"
                  id="card-today-delivered-telemetry"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-tight">Bugün Çatdırılan</p>
                      <h4 className="text-2xl font-black text-emerald-600 font-mono tracking-tight leading-none mt-1 sm:mt-0">
                        {todayOperations.deliveredTodayCount} <span className="text-xs font-normal text-slate-400">sifariş</span>
                      </h4>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 flex-shrink-0">
                      <CheckCircle2 className="w-6 h-6 opacity-80" />
                    </div>
                  </div>
                  <div className="mt-3.5 pt-2.5 border-t border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono gap-1 sm:gap-0 leading-none">
                    <span className="text-slate-400">Gəlir:</span>
                    <strong className="text-emerald-600 font-bold">{formatCurrency(todayOperations.deliveredTodayAmount)}</strong>
                  </div>
                </motion.div>

                {/* Stat 3: Neçə sifariş gözləyir */}
                <motion.div 
                  variants={cardVariants}
                  whileHover={{ y: -4, scale: 1.015 }}
                  onClick={() => navigate("/sales")}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_20px_rgba(233,239,246,0.4)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none transition-all duration-200"
                  id="card-total-pending-telemetry"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-tight">Gözləyən Sifarişlər</p>
                      <h4 className="text-2xl font-black text-amber-500 font-mono tracking-tight leading-none mt-1 sm:mt-0">
                        {todayOperations.totalPendingCount} <span className="text-xs font-normal text-slate-400">sifariş</span>
                      </h4>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 flex-shrink-0">
                      <Clock className="w-6 h-6 opacity-80" />
                    </div>
                  </div>
                  <div className="mt-3.5 pt-2.5 border-t border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono gap-1 sm:gap-0 leading-none">
                    <span className="text-slate-400">Bugün qeydlərdən:</span>
                    <strong className="text-amber-600 font-bold">{todayOperations.pendingCreatedTodayCount} dənə</strong>
                  </div>
                </motion.div>

                {/* Stat 4: Stok sayı */}
                <motion.div 
                  variants={cardVariants}
                  whileHover={{ y: -4, scale: 1.015 }}
                  onClick={() => navigate("/products")}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_20px_rgba(233,239,246,0.4)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none transition-all duration-200"
                  id="card-total-stock-telemetry"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-tight">Ümumi Anbar Stoku</p>
                      <h4 className="text-2xl font-black text-rose-500 font-mono tracking-tight leading-none mt-1 sm:mt-0">
                        {todayOperations.totalStock} <span className="text-xs font-normal text-slate-400">ədəd</span>
                      </h4>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 flex-shrink-0">
                      <Briefcase className="w-6 h-6 opacity-80" />
                    </div>
                  </div>
                  <div className="mt-3.5 pt-2.5 border-t border-slate-50 flex flex-col gap-1.5 text-xs font-mono leading-none">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Əsas Anbar:</span>
                      <strong className="text-slate-600 font-bold">{todayOperations.mainStock} ədəd</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Columba.az:</span>
                      <strong className="text-slate-600 font-bold">{todayOperations.columbaStock} ədəd</strong>
                    </div>
                    <div className="flex justify-between mt-1 pt-1 border-t border-slate-50">
                      <span className="text-slate-400">Kritik hədd:</span>
                      <strong className="text-rose-500 font-bold">{todayOperations.lowStockCount} növ</strong>
                    </div>
                  </div>
                </motion.div>

              </div>
            </div>

            {/* 2-Row Top Statistic Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 relative">
              
              {/* Card 1: Gross Sales */}
              <motion.div variants={cardVariants} className="relative h-full col-span-2 sm:col-span-1">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/sales")}
                  onMouseEnter={() => setHoveredCard("gross-sale")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-colors duration-250" 
                  id="card-gross-sale"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Ümumi Satış</p>
                      </div>
                      <h3 className="text-2xl font-semibold text-[#1A1F2E] mt-1.5 font-mono leading-none">{formatCurrency(currentCalculations.grossRevenue)}</h3>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-sky-55/40 text-sky-600 rounded-xl border border-sky-100/50 flex-shrink-0">
                      <DollarSign className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono leading-tight text-gray-500">
                    <span className="text-[#8B95A8] font-medium">Sifariş: {currentCalculations.orderCount} • Məhsul: {currentCalculations.itemsCount}</span>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-slate-100">
                      <span className="text-slate-500">Ötən ay: <strong className="text-slate-800">{formatCurrency(prevMonthCalculations.grossRevenue)}</strong></span>
                      {period !== "Bütün dövrlər" && (
                        <span className={`flex items-center gap-0.5 font-bold ${diffs.sales.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {diffs.sales.up ? "↑" : "↓"} {formatCurrency(diffs.sales.val)} ({diffs.sales.percent.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "gross-sale"} 
                  title="Ümumi Satış Təhlili"
                  items={[
                    { label: "Çatdırılan məhsul", value: `${currentCalculations.itemsCount} ədəd` },
                    { label: "Sifarişlərin sayı", value: `${currentCalculations.orderCount} ədəd` },
                    { label: "Orta sebət qiyməti", value: formatCurrency(currentCalculations.averageOrderValue) },
                    { label: "Ötən ayın gəliri", value: formatCurrency(prevMonthCalculations.grossRevenue) },
                    { label: "Öncəki dövr gəliri", value: formatCurrency(compCalculations.grossRevenue) }
                  ]}
                  footer="Ümumi və çatdırılmış dövr satış gəlirləri"
                />
              </motion.div>

              {/* Card 2: Net Profit */}
              <motion.div variants={cardVariants} className="relative h-full col-span-2 sm:col-span-1">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/statistics")}
                  onMouseEnter={() => setHoveredCard("net-profit")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-colors duration-250" 
                  id="card-net-profit"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Xalis Mənfəət</p>
                      </div>
                      <h3 className={`text-2xl font-semibold mt-1.5 font-mono leading-none ${currentCalculations.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-650'}`}>
                        {formatCurrency(currentCalculations.netProfit)}
                      </h3>
                    </div>
                    <div className={`p-2 sm:p-2.5 rounded-xl border flex-shrink-0 ${currentCalculations.netProfit >= 0 ? 'bg-emerald-55/40 text-emerald-600 border-emerald-100/50' : 'bg-rose-55/40 text-rose-605 border-rose-100/50'}`}>
                      <TrendingUp className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono leading-tight text-gray-500">
                    <span className="text-[#8B95A8] font-medium">Marja: {currentCalculations.profitMargin.toFixed(1)}%</span>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-slate-100">
                      <span className="text-slate-500">Ötən ay: <strong className={prevMonthCalculations.netProfit >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>{formatCurrency(prevMonthCalculations.netProfit)}</strong></span>
                      {period !== "Bütün dövrlər" && (
                        <span className={`flex items-center gap-0.5 font-bold ${diffs.profit.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {diffs.profit.up ? "↑" : "↓"} {formatCurrency(diffs.profit.val)} ({diffs.profit.percent.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "net-profit"}
                  title="Xalis Mənfəət Hesablanması"
                  items={[
                    { label: "Dövr gəliri", value: formatCurrency(currentCalculations.grossRevenue) },
                    { label: "Məhsul Mayası (COGS)", value: formatCurrency(currentCalculations.totalExpenses - currentExpenses.reduce((acc, e) => acc + e.amount, 0)), valueClass: "text-amber-500" },
                    { label: "Çatdırılma xərcləri", value: formatCurrency(currentSales.filter(s => s.status === "çatdırılıb").reduce((acc, s) => acc + s.deliveryCost, 0)), valueClass: "text-rose-500" },
                    { label: "Digər xərclər (Manual)", value: formatCurrency(currentExpenses.filter(e => e.source === "manual").reduce((acc, e) => acc + e.amount, 0)), valueClass: "text-rose-500" },
                    { label: "Ötən ayın mənfəəti", value: formatCurrency(prevMonthCalculations.netProfit), valueClass: prevMonthCalculations.netProfit >= 0 ? "text-emerald-600" : "text-rose-600" },
                    { label: "Xalis mənfəət", value: formatCurrency(currentCalculations.netProfit), valueClass: currentCalculations.netProfit >= 0 ? "text-emerald-600" : "text-rose-600" }
                  ]}
                  footer="Xərclər çıxıldıqdan sonra xalis qazanc"
                />
              </motion.div>

              {/* Card 3: Total Expense */}
              <motion.div variants={cardVariants} className="relative h-full">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/expenses")}
                  onMouseEnter={() => setHoveredCard("total-expense")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-colors duration-250" 
                  id="card-total-expense"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Ümumi Xərc</p>
                      </div>
                      <h3 className="text-2xl font-semibold text-[#1A1F2E] mt-1.5 font-mono leading-none">{formatCurrency(currentCalculations.displayExpensesFlag)}</h3>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-purple-55/40 text-purple-600 rounded-xl border border-purple-100/50 flex-shrink-0">
                      <Layers className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono leading-tight text-gray-500">
                    <span className="text-[#8B95A8] font-medium">Çatdırılma + Reklam + Maya</span>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-slate-100">
                      <span className="text-slate-500">Ötən ay: <strong className="text-slate-800">{formatCurrency(prevMonthCalculations.displayExpenses)}</strong></span>
                      {period !== "Bütün dövrlər" && (
                        <span className={`flex items-center gap-0.5 font-bold ${diffs.expenses.up ? 'text-rose-500' : 'text-emerald-600'}`}>
                          {diffs.expenses.up ? "↑" : "↓"} {formatCurrency(diffs.expenses.val)} ({diffs.expenses.percent.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "total-expense"}
                  title="Ətraflı Xərc Strukturu"
                  items={[
                    { label: "Reklam xərcləri", value: formatCurrency(currentExpenses.filter(e => e.category === "Reklam").reduce((acc, e) => acc + e.amount, 0)) },
                    { label: "Əməkhaqqı", value: formatCurrency(currentExpenses.filter(e => e.category === "Əməkhaqqı").reduce((acc, e) => acc + e.amount, 0)) },
                    { label: "Digər əməliyyat", value: formatCurrency(currentExpenses.filter(e => !["Reklam", "Əməkhaqqı"].includes(e.category || "")).reduce((acc, e) => acc + e.amount, 0)) },
                    { label: "Kargo + Expargo çatdırılma", value: formatCurrency(cargoAndExpargoDeliveryCosts.combined) },
                    { label: "Ötən ayın xərci", value: formatCurrency(prevMonthCalculations.displayExpenses) }
                  ]}
                  footer="Ümumi qeydə alınmış fərdi xərclər siyahısı"
                />
              </motion.div>

              {/* Card 4: Average Order Value */}
              <motion.div variants={cardVariants} className="relative h-full">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/sales")}
                  onMouseEnter={() => setHoveredCard("average-order")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-colors duration-250" 
                  id="card-average-order"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Orta Sifariş</p>
                      </div>
                      <h3 className="text-2xl font-semibold text-[#1A1F2E] mt-1.5 font-mono leading-none">{formatCurrency(currentCalculations.averageOrderValue)}</h3>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-indigo-55/40 text-indigo-600 rounded-xl border border-indigo-100/50 flex-shrink-0">
                      <ShoppingBag className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono leading-tight text-gray-500">
                    <span className="text-[#8B95A8] font-medium">Sifariş başına düşən pay</span>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-slate-100">
                      <span className="text-slate-500">Ötən ay: <strong className="text-slate-800">{formatCurrency(prevMonthCalculations.averageOrderValue)}</strong></span>
                      {period !== "Bütün dövrlər" && (
                        <span className={`flex items-center gap-0.5 font-bold ${diffs.averageOrder.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {diffs.averageOrder.up ? "↑" : "↓"} {formatCurrency(diffs.averageOrder.val)} ({diffs.averageOrder.percent.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "average-order"}
                  title="Sifariş Ortalaması"
                  items={[
                    { label: "Ümumi dövr satış", value: formatCurrency(currentCalculations.grossRevenue) },
                    { label: "Uğurlu sifarişlər", value: `${currentCalculations.orderCount} ədəd` },
                    { label: "Ötən ayın ortalaması", value: formatCurrency(prevMonthCalculations.averageOrderValue) },
                    { label: "Öncəki dövr ortalaması", value: formatCurrency(compCalculations.averageOrderValue) },
                    { label: "Ortalama dəyişimi", value: `${diffs.averageOrder.up ? "+" : "-"}${diffs.averageOrder.percent.toFixed(1)}%`, valueClass: diffs.averageOrder.up ? "text-emerald-600" : "text-rose-500" }
                  ]}
                  footer="Sifariş başına düşən orta gəlir məbləği"
                />
              </motion.div>

              {/* Card 5: Profit Margin */}
              <motion.div variants={cardVariants} className="relative h-full">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/statistics")}
                  onMouseEnter={() => setHoveredCard("profit-margin")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-colors duration-250" 
                  id="card-profit-margin"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Xalis Marja</p>
                      </div>
                      <h3 className="text-2xl font-semibold text-[#1A1F2E] mt-1.5 font-mono leading-none">{currentCalculations.profitMargin.toFixed(1)}%</h3>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-amber-55/40 text-amber-600 rounded-xl border border-amber-100/50 flex-shrink-0">
                      <Percent className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono leading-tight text-gray-500">
                    <span className="text-[#8B95A8] font-medium">Dövriyyə mənfəət faizi</span>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-slate-100">
                      <span className="text-slate-500">Ötən ay: <strong className="text-slate-800">{prevMonthCalculations.profitMargin.toFixed(1)}%</strong></span>
                      {period !== "Bütün dövrlər" && (
                        <span className={`flex items-center gap-0.5 font-bold ${diffs.margin.up ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {diffs.margin.up ? "↑" : "↓"} {Math.abs(diffs.margin.val).toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "profit-margin"}
                  title="Rentabellilik Göstəricisi"
                  items={[
                    { label: "Mənfəət nisbəti", value: `${currentCalculations.profitMargin.toFixed(2)}%` },
                    { label: "Xalis mənfəət", value: formatCurrency(currentCalculations.netProfit) },
                    { label: "Ötən ayın marjası", value: `${prevMonthCalculations.profitMargin.toFixed(1)}%` },
                    { label: "Marja dəyişimi", value: `${diffs.margin.up ? "↑" : "↓"} ${Math.abs(diffs.margin.val).toFixed(1)}%`, valueClass: diffs.margin.up ? "text-emerald-600" : "text-rose-600" }
                  ]}
                  footer="Hər ₼ satışdan qalan xalis mənfəət payı"
                />
              </motion.div>

              {/* Card 6: Marketing Cost */}
              <motion.div variants={cardVariants} className="relative h-full col-span-2 sm:col-span-1">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/expenses")}
                  onMouseEnter={() => setHoveredCard("marketing-cost")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-colors duration-250" 
                  id="card-marketing-cost"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Reklam Xərci</p>
                      </div>
                      <h3 className="text-2xl font-semibold text-[#1A1F2E] mt-1.5 font-mono leading-none">{formatCurrency(currentCalculations.reklamXerci)}</h3>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-pink-55/40 text-pink-650 rounded-xl border border-pink-100/50 flex-shrink-0">
                      <Megaphone className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono leading-tight text-gray-500">
                    <span className="text-[#006bf8] font-bold">Gəlir ROI: {currentCalculations.reklamROI.toFixed(0)}%</span>
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-slate-100">
                      <span className="text-slate-500">Ötən ay: <strong className="text-slate-800">{formatCurrency(prevMonthCalculations.reklamXerci)}</strong></span>
                      {period !== "Bütün dövrlər" && (
                        <span className={`flex items-center gap-0.5 font-bold ${diffs.reklam.up ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {diffs.reklam.up ? "↑" : "↓"} {formatCurrency(diffs.reklam.val)}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "marketing-cost"}
                  title="Marketinq Effektivliyi (ROI)"
                  items={[
                    { label: "Gəlir ROI faizi", value: `${currentCalculations.reklamROI.toFixed(0)}%`, valueClass: "text-emerald-500" },
                    { label: "Orta günlük reklam", value: `${formatCurrency(reklamExpenseStats.averageDaily)}/gün` },
                    { label: "Ötən ayın reklamı", value: formatCurrency(prevMonthCalculations.reklamXerci) },
                    { label: "Toplam reklam xərci", value: formatCurrency(currentCalculations.reklamXerci) }
                  ]}
                  footer="Reklam investisiyasının gəlirə çevrilməsi"
                />
              </motion.div>

              {/* Card 7: Registered Customer */}
              <motion.div variants={cardVariants} className="relative h-full col-span-2 sm:col-span-1">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/customers")}
                  onMouseEnter={() => setHoveredCard("customer-info")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-colors duration-250" 
                  id="card-customer-info"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Müştərilər</p>
                      </div>
                      <h3 className="text-2xl font-semibold text-[#1A1F2E] mt-1.5 font-mono leading-none">
                        {period === "Bütün dövrlər" ? customers.length : customers.filter(c => c.createdAt && c.createdAt >= dateFilterBounds.start && c.createdAt <= dateFilterBounds.end).length} Yeni
                      </h3>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-teal-55/40 text-teal-650 rounded-xl border border-teal-100/50 flex-shrink-0">
                      <Users className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1.5 text-xs font-mono leading-tight text-[#8B95A8]">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                      <span className="text-slate-500">Ötən ay: <strong className="text-slate-800">{prevMonthCalculations.newCustomersCount} yeni</strong></span>
                      <span className="text-slate-500">Cəmi: <strong className="text-slate-800">{customers.length}</strong></span>
                    </div>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "customer-info"}
                  title="İstifadəçi Statları"
                  items={[
                    { label: "Dövr ərzində yeni", value: `${customers.filter(c => c.createdAt && c.createdAt >= dateFilterBounds.start && c.createdAt <= dateFilterBounds.end).length} nəfər` },
                    { label: "Ötən ay yeni müştəri", value: `${prevMonthCalculations.newCustomersCount} nəfər` },
                    { label: "Aktiv alış edən", value: `${new Set(currentSales.map(s => s.customerPhone)).size} nəfər` },
                    { label: "Cəmi bazada müştəri", value: `${customers.length} nəfər` }
                  ]}
                  footer="Yeni qeydiyyatlar və aktiv sifarişçilər"
                />
              </motion.div>

              {/* Card 8: Loyalty */}
              <motion.div variants={cardVariants} className="relative h-full col-span-2 sm:col-span-1">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/customers")}
                  onMouseEnter={() => setHoveredCard("repeat-purchase")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-all duration-250" 
                  id="card-repeat-purchase"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div className="w-full">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Təkrar Alış</p>
                      </div>
                      <h3 className="text-[14px] font-bold text-[#1A1F2E] leading-tight mb-2">
                        Ümumi Alış: <span className="font-mono text-base font-extrabold text-indigo-600">{customers.length}</span> <span className="text-[11px] text-slate-400 font-medium lowercase">nəfər</span>
                      </h3>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                          <span>Cəmi təkrar alış:</span>
                          <span className="font-mono font-bold text-slate-800 text-[11.5px]">{repeatPurchaseStats.allTimeRepeatCount} nəfər</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 border-t border-slate-50 pt-1">
                          <span>Cari ayda təkrar:</span>
                          <span className="font-mono font-bold text-slate-800 text-[11.5px]">{repeatPurchaseStats.activeRepeatThisMonthCount} nəfər</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-yellow-55/40 text-yellow-650 rounded-xl border border-yellow-100/50 flex-shrink-0">
                      <CalendarCheck className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-1 text-xs font-mono text-[#8B95A8]">
                    <span>Təkrarlanma: {((repeatPurchaseStats.allTimeRepeatCount / (customers.length || 1)) * 100).toFixed(1)}%</span>
                    <span>VIP (&ge;{settings.vipThreshold}): <strong className="text-slate-700">{customers.filter(c => c.orderCount >= settings.vipThreshold).length} nəfər</strong></span>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "repeat-purchase"}
                  title="Müştəri Sədaqəti (Retention)"
                  items={[
                    { label: "Bütün dövrlər (Cəmi təkrar alanlar)", value: `${repeatPurchaseStats.allTimeRepeatCount} nəfər` },
                    { label: "Cari ayda fəal geri dönənlər", value: `${repeatPurchaseStats.activeRepeatThisMonthCount} nəfər` },
                    { label: "Cari ayda 2+ sifariş edənlər", value: `${repeatPurchaseStats.multipleOrdersThisMonthCount} nəfər` },
                    { label: "Baza üzrə Sədaqət %", value: `${((repeatPurchaseStats.allTimeRepeatCount / (customers.length || 1)) * 100).toFixed(1)}%`, valueClass: "text-amber-500 font-bold" }
                  ]}
                  footer="Periodik və fəal müştəri seqmentləşməsi"
                />
              </motion.div>

              {/* Card 9: Delivery status summary count */}
              <motion.div variants={cardVariants} className="relative col-span-2 sm:col-span-2 lg:col-span-1 xl:col-span-2 h-full">
                <motion.div 
                  whileHover={{ 
                    y: -6,
                    scale: 1.025,
                    boxShadow: "0 15px 35px rgba(26, 31, 46, 0.08), 0 4px 10px rgba(26, 31, 46, 0.02)"
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 350, damping: 18 }}
                  onClick={() => navigate("/couriers")}
                  onMouseEnter={() => setHoveredCard("delivery-status")}
                  onMouseLeave={() => setHoveredCard(null)}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] min-h-[120px] p-4 sm:p-5 rounded-2xl flex flex-col justify-between cursor-pointer select-none h-full transition-all duration-250" 
                  id="card-delivery-status"
                >
                  <div className="flex justify-between items-start gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        <p className="text-xs font-bold text-slate-400 tracking-wider uppercase leading-none">Çatdırılma Statusu</p>
                      </div>
                      <h3 className="text-xs font-semibold text-[#1A1F2E] mt-2 flex gap-2 flex-wrap leading-tight">
                        <span className="bg-emerald-55/35 text-emerald-750 px-2 py-0.5 rounded-lg font-mono border border-emerald-100/20">✓ {currentSales.filter(s => s.status === "çatdırılıb").length} çat</span>
                        <span className="bg-amber-55/35 text-amber-750 px-2 py-0.5 rounded-lg font-mono border border-amber-100/20">⏱ {currentSales.filter(s => s.status === "gözləyir").length} gözlə</span>
                        <span className="bg-rose-55/35 text-rose-750 px-2 py-0.5 rounded-lg font-mono border border-rose-100/20">✗ {currentSales.filter(s => s.status === "ləğv edilib").length} ləğv</span>
                      </h3>
                    </div>
                    <div className="p-2 sm:p-2.5 bg-orange-55/40 text-orange-655 rounded-xl border border-orange-100/50 flex-shrink-0">
                      <Truck className="w-6 h-6 stroke-[2.2] opacity-80" />
                    </div>
                  </div>
                  <div className="mt-4 text-xs font-mono text-[#8B95A8] flex justify-between items-end sm:items-center">
                    <span>Ümumi Sifariş: <strong className="text-slate-700">{currentSales.length}</strong></span>
                    <span className="text-[10px] text-[#8B95A8] italic">Müvəffəqiyyətli olanlar</span>
                  </div>
                </motion.div>
                <CardTooltip 
                  isVisible={hoveredCard === "delivery-status"}
                  title="Sifariş Çatdırılma Təhlili"
                  items={[
                    { label: "Çatdırılıb", value: `${currentSales.filter(s => s.status === "çatdırılıb").length} sifariş`, valueClass: "text-emerald-500" },
                    { label: "Gözləyir (Kuryerdə)", value: `${currentSales.filter(s => s.status === "gözləyir").length} sifariş`, valueClass: "text-amber-500" },
                    { label: "Ləğv olundu", value: `${currentSales.filter(s => s.status === "ləğv edilib").length} sifariş`, valueClass: "text-rose-500" },
                    { label: "Toplam qeydə alınan", value: `${currentSales.length} sifariş` }
                  ]}
                  footer="Seçilmiş dövrdəki çatdırılma faizləri"
                />
              </motion.div>

            </div>
            
            {/* Sales Trend General AreaChart */}
            <motion.div variants={cardVariants} className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.5)] p-4 sm:p-6 rounded-2xl w-full">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-bold text-[#1A1F2E] flex items-center gap-2 uppercase tracking-wider">
                    <TrendingUp className="w-5 h-5 text-sky-500" /> Ümumi Satış Trendi
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Dövr ərzində gündəlik dövriyyə və satış daxilolmaları</p>
                </div>
              </div>
              <div className="w-full h-[250px] sm:h-[300px]">
                <SafeResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSalesTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9EFF6" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#8B95A8', fontSize: 10}}
                      dy={10}
                      minTickGap={20}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#8B95A8', fontSize: 10}}
                      tickFormatter={(val) => `₼${val}`}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #E9EFF6', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                      itemStyle={{ color: '#1A1F2E', fontSize: '13px', fontWeight: 600 }}
                      labelStyle={{ color: '#8B95A8', marginBottom: '8px', fontSize: '11px', fontWeight: 700 }}
                      formatter={(value: any, name: any) => [name === "Satış (₼)" ? formatCurrency(value) : value, name]}
                    />
                    <Area 
                      isAnimationActive={false}
                      type="monotone" 
                      dataKey="Satış (₼)" 
                      stroke="#0ea5e9" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorSalesTrend)" 
                      activeDot={{ r: 6, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </SafeResponsiveContainer>
              </div>
            </motion.div>

            {/* Dynamic Data Modules Navigation Quick Links with Luxury Animation */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <span>🧭</span> Sürətli Keçid Modulları
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { title: "Satışlar", desc: "Sifariş, kuryer", icon: ShoppingBag, route: "/sales", color: "text-sky-600 bg-sky-50 border-sky-100/50", label: `${currentSales.length} Sifariş` },
                  { title: "Anbar", desc: "Maya vao stok", icon: Briefcase, route: "/products", color: "text-emerald-600 bg-emerald-50 border-emerald-100/50", label: `${products.length} Məhsul` },
                  { title: "CRM", desc: "Müştəri analiz", icon: Users, route: "/customers", color: "text-indigo-600 bg-indigo-50 border-indigo-100/50", label: `${customers.length} Müştəri` },
                  { title: "Statistika", desc: "Xalis mənfəət", icon: TrendingUp, route: "/statistics", color: "text-purple-600 bg-purple-50 border-purple-100/50", label: "Görünüş" }
                ].map((mod, idx) => {
                  const Icon = mod.icon;
                  return (
                    <motion.div
                      key={idx}
                      variants={cardVariants}
                      whileHover={{ 
                        y: -5,
                        boxShadow: "0 12px 30px rgba(79, 70, 229, 0.05), 0 2px 8px rgba(79, 70, 229, 0.02)"
                      }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => navigate(mod.route)}
                      className="p-4 sm:p-5 bg-white border border-[#E9EFF6] shadow-[0_4px_16px_rgba(233,239,246,0.25)] rounded-2xl flex flex-col justify-between cursor-pointer transition-all duration-200 group relative overflow-hidden min-h-[120px]"
                    >
                      <div className="absolute top-0 right-0 w-12 h-12 sm:w-16 sm:h-16 bg-[#F8FAFC] rounded-bl-3xl z-0 flex items-center justify-center transition-all group-hover:bg-slate-100/60">
                        <Icon className="w-5 h-5 opacity-80 text-[#8B95A8] stroke-[2]" />
                      </div>
                      <div className="relative z-10 space-y-2.5">
                        <span className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-500 tracking-wider whitespace-nowrap">
                          {mod.label}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-[#1A1F2E] leading-tight mt-2">{mod.title}</h4>
                          <p className="text-xs text-gray-500 mt-1 leading-relaxed font-normal">{mod.desc}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* 3 Ədəd Dinamik Analitik Kart (Recharts): Ən Çox Sifariş Olunan Məhsullar & Kuryer Fəaliyyəti */}
            <div className="space-y-4" id="dynamic-recharts-analytics-section">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-1">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                    <span>🎯 DİNAMİK MƏHSUL & KURYER ANALİTİKASI</span>
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Ən çox sifariş olunan mallar, kuryerlərin çatdırılma fəaliyyəti və bazar paylanması</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>Dinamik Qrafiklər (Recharts)</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* KART 1: Ən Çox Sifariş Olunan Məhsullar */}
                <motion.div 
                  variants={cardVariants}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] rounded-[24px] p-5 flex flex-col justify-between space-y-4"
                  id="card-top-ordered-products-analytics"
                >
                  <div className="space-y-3">
                    {/* Header + Toggle */}
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3 gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/50">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 leading-tight">Top Sifariş Məhsulları</h4>
                          <p className="text-[10px] text-slate-400 font-medium">{topOrderedProductsAnalytics.uniqueCount} növ çeşid dövriyyədə</p>
                        </div>
                      </div>

                      {/* Mode Toggle Button */}
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setProductAnalyticsMetric("qty")}
                          className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                            productAnalyticsMetric === "qty"
                              ? "bg-white text-indigo-700 shadow-xs font-extrabold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Miqdar
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductAnalyticsMetric("revenue")}
                          className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                            productAnalyticsMetric === "revenue"
                              ? "bg-white text-indigo-700 shadow-xs font-extrabold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Gəlir (₼)
                        </button>
                      </div>
                    </div>

                    {/* Leader Highlight Metric */}
                    <div className="p-2.5 bg-indigo-50/50 border border-indigo-100/50 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 truncate max-w-[170px] sm:max-w-none">
                        <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-bold text-slate-800 truncate">{topOrderedProductsAnalytics.topProduct?.name || "Məlumat yoxdur"}</span>
                      </div>
                      <span className="text-[10px] font-extrabold font-mono text-indigo-700 bg-white border border-indigo-100 px-2 py-0.5 rounded-md shrink-0">
                        {topOrderedProductsAnalytics.topProductShare}% pay ({topOrderedProductsAnalytics.topProduct?.qty || 0} ədəd)
                      </span>
                    </div>

                    {/* Recharts Horizontal Bar Chart */}
                    <div className="h-56 relative w-full min-h-0 min-w-0">
                      {topOrderedProductsAnalytics.itemsQty.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                          Cari dövr üçün məhsul satışı qeydə alınmayıb
                        </div>
                      ) : (
                        <SafeResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={productAnalyticsMetric === "qty" ? topOrderedProductsAnalytics.itemsQty : topOrderedProductsAnalytics.itemsRev}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 10, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" opacity={0.6} />
                            <XAxis 
                              type="number" 
                              fontSize={9} 
                              stroke="#8B95A8" 
                              tickLine={false} 
                              axisLine={false}
                            />
                            <YAxis 
                              dataKey="name" 
                              type="category" 
                              fontSize={10} 
                              stroke="#475569" 
                              tickLine={false} 
                              axisLine={false} 
                              width={75}
                            />
                            <Tooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-lg space-y-1 text-xs">
                                      <p className="font-bold text-slate-800">{data.fullName}</p>
                                      <p className="text-[10px] text-slate-400 font-mono">SKU: {data.sku || "—"}</p>
                                      <div className="border-t border-slate-100 pt-1.5 space-y-0.5 font-mono">
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">Cəmi Sifariş:</span>
                                          <strong className="text-indigo-600">{data["Miqdar (Ədəd)"]} ədəd</strong>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">Çatdırılan:</span>
                                          <strong className="text-emerald-600">{data["Çatdırılan"]} ədəd</strong>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">Gəlir:</span>
                                          <strong className="text-slate-700">{formatCurrency(data["Gəlir (₼)"])}</strong>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                          <span className="text-slate-500">Anbar Stoku:</span>
                                          <strong className={data.stock <= 5 ? "text-rose-600" : "text-slate-600"}>{data.stock} ədəd</strong>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar 
                              isAnimationActive={false}
                              dataKey={productAnalyticsMetric === "qty" ? "Miqdar (Ədəd)" : "Gəlir (₼)"} 
                              radius={[0, 6, 6, 0]} 
                              barSize={16}
                            >
                              {(productAnalyticsMetric === "qty" ? topOrderedProductsAnalytics.itemsQty : topOrderedProductsAnalytics.itemsRev).map((entry, index) => {
                                const colors = ["#4f46e5", "#6366f1", "#0284c7", "#0ea5e9", "#64748b"];
                                return <Cell key={`cell-prod-${index}`} fill={colors[index % colors.length]} />;
                              })}
                            </Bar>
                          </BarChart>
                        </SafeResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Footer Drilldown */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Ümumi: <strong>{topOrderedProductsAnalytics.totalQty} ədəd</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate("/products")}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Anbar & Məhsullar</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>

                {/* KART 2: Kuryerlərin Çatdırılma Fəaliyyəti və Reytinqi */}
                <motion.div 
                  variants={cardVariants}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] rounded-[24px] p-5 flex flex-col justify-between space-y-4"
                  id="card-courier-activity-analytics"
                >
                  <div className="space-y-3">
                    {/* Header + Toggle */}
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3 gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100/50">
                          <Bike className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 leading-tight">Kuryer Fəaliyyəti</h4>
                          <p className="text-[10px] text-slate-400 font-medium">{courierActivityAnalytics.couriersList.length} kuryer monitorinqdə</p>
                        </div>
                      </div>

                      {/* Mode Toggle Button */}
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setCourierAnalyticsMetric("status")}
                          className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                            courierAnalyticsMetric === "status"
                              ? "bg-white text-emerald-700 shadow-xs font-extrabold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Status
                        </button>
                        <button
                          type="button"
                          onClick={() => setCourierAnalyticsMetric("amount")}
                          className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                            courierAnalyticsMetric === "amount"
                              ? "bg-white text-emerald-700 shadow-xs font-extrabold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Məbləğ (₼)
                        </button>
                      </div>
                    </div>

                    {/* Courier Performance Leader Card */}
                    <div className="p-2.5 bg-emerald-50/50 border border-emerald-100/50 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 truncate max-w-[170px] sm:max-w-none">
                        <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-bold text-slate-800 truncate">
                          {courierActivityAnalytics.starCourier?.fullName || "Kuryer təyin olunmayıb"}
                        </span>
                      </div>
                      <span className="text-[10px] font-extrabold font-mono text-emerald-700 bg-white border border-emerald-100 px-2 py-0.5 rounded-md shrink-0">
                        {courierActivityAnalytics.starCourier?.["Çatdırılıb"] || 0} çatdırılma ({courierActivityAnalytics.avgSuccessRate}% uğur)
                      </span>
                    </div>

                    {/* Recharts Courier Activity Chart */}
                    <div className="h-56 relative w-full min-h-0 min-w-0">
                      {courierActivityAnalytics.couriersList.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                          Kuryer məlumatı tapılmadı
                        </div>
                      ) : (
                        <SafeResponsiveContainer width="100%" height="100%">
                          {courierAnalyticsMetric === "status" ? (
                            <BarChart
                              data={courierActivityAnalytics.couriersList.slice(0, 5)}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                              <XAxis dataKey="name" fontSize={10} stroke="#8B95A8" tickLine={false} axisLine={false} dy={4} />
                              <YAxis fontSize={9} stroke="#8B95A8" tickLine={false} axisLine={false} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-lg space-y-1 text-xs">
                                        <p className="font-bold text-slate-800">{data.fullName}</p>
                                        <p className="text-[10px] text-slate-400 font-mono">{data.phone || "—"}</p>
                                        <div className="border-t border-slate-100 pt-1.5 space-y-0.5 font-mono">
                                          <div className="flex justify-between gap-4">
                                            <span className="text-emerald-600">✓ Çatdırılıb:</span>
                                            <strong>{data["Çatdırılıb"]} sifariş</strong>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-blue-600">⏱ Gözləyir:</span>
                                            <strong>{data["Gözləyir"]} sifariş</strong>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-rose-600">✕ Ləğv edilib:</span>
                                            <strong>{data["Ləğv edilib"]} sifariş</strong>
                                          </div>
                                          <div className="flex justify-between gap-4 pt-1 border-t border-slate-50">
                                            <span className="text-slate-500">Müvəffəqiyyət:</span>
                                            <strong className="text-emerald-700">{data.successRate}%</strong>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} />
                              <Bar isAnimationActive={false} dataKey="Çatdırılıb" stackId="a" fill="#10b981" radius={[0, 0, 3, 3]} barSize={22} />
                              <Bar isAnimationActive={false} dataKey="Gözləyir" stackId="a" fill="#3b82f6" />
                              <Bar isAnimationActive={false} dataKey="Ləğv edilib" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                            </BarChart>
                          ) : (
                            <BarChart
                              data={courierActivityAnalytics.couriersList.slice(0, 5)}
                              margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                              <XAxis dataKey="name" fontSize={10} stroke="#8B95A8" tickLine={false} axisLine={false} dy={4} />
                              <YAxis fontSize={9} stroke="#8B95A8" tickLine={false} axisLine={false} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-lg space-y-1 text-xs">
                                        <p className="font-bold text-slate-800">{data.fullName}</p>
                                        <div className="border-t border-slate-100 pt-1.5 space-y-0.5 font-mono">
                                          <div className="flex justify-between gap-4">
                                            <span className="text-slate-500">Toplanan Kassa:</span>
                                            <strong className="text-blue-600">{formatCurrency(data["Kassa (₼)"])}</strong>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span className="text-slate-500">Kuryer Yol Haqqı:</span>
                                            <strong className="text-emerald-600">{formatCurrency(data["Qazanc (₼)"])}</strong>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconSize={8} />
                              <Bar isAnimationActive={false} dataKey="Kassa (₼)" fill="#006bf8" radius={[4, 4, 0, 0]} barSize={16} />
                              <Bar isAnimationActive={false} dataKey="Qazanc (₼)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={16} />
                            </BarChart>
                          )}
                        </SafeResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Footer Drilldown */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Çatdırılıb: <strong>{courierActivityAnalytics.totalDelivered} sifariş</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate("/courier-analytics")}
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Kuryer Analitikası</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>

                {/* KART 3: Kuryer & Məhsul Çatdırılma Pay Bölgüsü */}
                <motion.div 
                  variants={cardVariants}
                  className="bg-white border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] rounded-[24px] p-5 flex flex-col justify-between space-y-4"
                  id="card-distribution-share-analytics"
                >
                  <div className="space-y-3">
                    {/* Header + Toggle */}
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3 gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-sky-50 text-sky-600 rounded-xl border border-sky-100/50">
                          <Activity className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 leading-tight">Pay Bölgüsü Analizi</h4>
                          <p className="text-[10px] text-slate-400 font-medium">Bazar və kuryer paylanması</p>
                        </div>
                      </div>

                      {/* Mode Toggle Button */}
                      <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-[10px] font-bold">
                        <button
                          type="button"
                          onClick={() => setDistributionAnalyticsMode("courier")}
                          className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                            distributionAnalyticsMode === "courier"
                              ? "bg-white text-sky-700 shadow-xs font-extrabold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Kuryerlər
                        </button>
                        <button
                          type="button"
                          onClick={() => setDistributionAnalyticsMode("product")}
                          className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                            distributionAnalyticsMode === "product"
                              ? "bg-white text-sky-700 shadow-xs font-extrabold"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Məhsullar
                        </button>
                      </div>
                    </div>

                    {/* Dominance Badge */}
                    <div className="p-2.5 bg-sky-50/50 border border-sky-100/50 rounded-xl flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium truncate max-w-[160px] sm:max-w-none">
                        {distributionAnalyticsMode === "courier" ? "Dominant Kuryer:" : "Top 3 Məhsul Payı:"}
                      </span>
                      <span className="text-[10px] font-extrabold font-mono text-sky-700 bg-white border border-sky-100 px-2 py-0.5 rounded-md shrink-0">
                        {distributionAnalyticsMode === "courier" 
                          ? `${distributionAnalytics.topCourierName} (${distributionAnalytics.topCourierShare}%)`
                          : `${distributionAnalytics.top3ProductShare}% Dövriyyə`
                        }
                      </span>
                    </div>

                    {/* Recharts Donut Pie Chart */}
                    <div className="h-56 flex flex-col sm:flex-row items-center justify-center gap-2 relative">
                      <div className="w-40 h-40 relative shrink-0 flex items-center justify-center">
                        <SafeResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={distributionAnalyticsMode === "courier" ? distributionAnalytics.courierPie : distributionAnalytics.productPie}
                              cx="50%"
                              cy="50%"
                              innerRadius={46}
                              outerRadius={68}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {(distributionAnalyticsMode === "courier" ? distributionAnalytics.courierPie : distributionAnalytics.productPie).map((entry, index) => (
                                <Cell key={`cell-share-${index}`} fill={entry.color} style={{ outline: "none" }} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(val, name, item) => {
                                const p = item.payload;
                                return [
                                  `${val} (${p.percentage}%)`,
                                  p.name
                                ];
                              }}
                            />
                          </PieChart>
                        </SafeResponsiveContainer>
                        
                        {/* Center percentage label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Top 1</span>
                          <span className="text-sm font-black text-slate-800 font-mono">
                            {distributionAnalyticsMode === "courier" ? `${distributionAnalytics.topCourierShare}%` : `${distributionAnalytics.productPie[0]?.percentage || 0}%`}
                          </span>
                        </div>
                      </div>

                      {/* Custom legend list */}
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 flex-1 w-full text-[11px]">
                        {(distributionAnalyticsMode === "courier" ? distributionAnalytics.courierPie : distributionAnalytics.productPie).slice(0, 4).map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-1 rounded-lg hover:bg-slate-50">
                            <div className="flex items-center gap-1.5 truncate max-w-[110px]">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="text-slate-700 font-medium truncate">{item.name}</span>
                            </div>
                            <span className="font-mono font-bold text-slate-800 shrink-0 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.percentage}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer Drilldown */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Pay Bölgüsü: <strong>100%</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate("/sales")}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>Bütün Sifarişlər</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>

              </div>
            </div>

            {/* Graphs Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* 1. Monthly sale trend - Spline Waves with glowing gradients */}
              <div className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">📈 Son 6 Ayın Satış Dinamikası</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Xalis gəlir, xərc və mənfəət axını</p>
                  </div>
                  <span className="text-[10px] bg-slate-50 border border-slate-100 text-slate-500 font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider font-mono">Dövri</span>
                </div>
                
                <div className="h-72 relative w-full min-h-0 min-w-0">
                  <SafeResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSalesPremium" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0.01}/>
                        </linearGradient>
                        <linearGradient id="colorProfitPremium" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                      <XAxis dataKey="name" fontSize={11} stroke="#8B95A8" tickLine={false} axisLine={false} dy={8} />
                      <YAxis fontSize={11} stroke="#8B95A8" tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "#fff", 
                          border: "1px solid #E9EFF6", 
                          borderRadius: "16px",
                          boxShadow: "0 10px 25px rgba(26, 31, 46, 0.08)",
                          fontFamily: "monospace",
                          fontSize: "12px"
                        }}
                        formatter={(value) => [`${value} ₼`]} 
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Area isAnimationActive={false} type="monotone" name="Satış Gəliri" dataKey="Satış" stroke="#1e3a5f" strokeWidth={3} fillOpacity={1} fill="url(#colorSalesPremium)" dot={{ r: 3, strokeWidth: 2, fill: "#fff" }} />
                      <Area isAnimationActive={false} type="monotone" name="Xalis Mənfəət" dataKey="Mənfəət" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfitPremium)" dot={{ r: 3, strokeWidth: 2, fill: "#fff" }} />
                      <Line isAnimationActive={false} type="monotone" name="Baza Xərclər" dataKey="Xərc" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                    </AreaChart>
                  </SafeResponsiveContainer>
                </div>
              </div>

              {/* 2. Daily volume details - Sparkline wave design */}
              <div className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">📅 Günlük Satış & Sifariş Trendi</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Seçilmiş dövrdə gündəlik gedişat</p>
                  </div>
                  <span className="text-[10px] bg-sky-50 text-sky-700 font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider">{period}</span>
                </div>
                
                <div className="h-72 relative w-full min-h-0 min-w-0">
                  <SafeResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyTrendData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                      <XAxis dataKey="name" fontSize={9} stroke="#8B95A8" tickLine={false} axisLine={false} dy={8} />
                      <YAxis yAxisId="left" fontSize={10} stroke="#1e3a5f" tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#f59e0b" tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "#fff", 
                          border: "1px solid #E9EFF6", 
                          borderRadius: "16px",
                          boxShadow: "0 10px 25px rgba(26, 31, 46, 0.08)",
                          fontSize: "12px"
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Line isAnimationActive={false} yAxisId="left" type="monotone" name="Satış (₼)" dataKey="Satış (₼)" stroke="#006bf8" strokeWidth={3} dot={{ r: 4, strokeWidth: 1.5, fill: "#fff" }} activeDot={{ r: 6 }} />
                      <Line isAnimationActive={false} yAxisId="right" type="monotone" name="Sifariş (Ədəd)" dataKey="Sifariş (Ədəd)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 2 }} />
                    </LineChart>
                  </SafeResponsiveContainer>
                </div>
              </div>

              {/* 3. Concentric Circular & Speedometer Gauge Panel (Highly Professional Circular Dashboard) */}
              <div style={{ isolation: 'isolate' }} className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4 mb-6">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">⭕ Dairəvi Diaqram Analitikası (Circle Graph)</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Müvəffəqiyyət və çatdırılma kanalları strukturu</p>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-extrabold bg-emerald-50 rounded-lg px-2.5 py-1">✓ AKTİV</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-auto sm:h-[350px] shrink-0 items-center justify-center">
                  
                  {/* Gauge 1: Delivery success rate semi-circle index */}
                  <div className="relative flex flex-col items-center justify-center h-full bg-slate-50/40 border border-slate-100 rounded-2xl p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Satış Müvəffəqiyyəti</div>
                    <div className="relative w-44 h-32 flex items-center justify-center overflow-hidden">
                      <SafeResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          {(() => {
                            const successRateNum = Math.round(
                              (currentSales.filter(s => s.status === "çatdırılıb").length / 
                              Math.max(1, currentSales.filter(s => s.status !== "ləğv edilib").length)) * 100
                            ) || 82;

                            const data = [
                              { value: successRateNum, color: "#4f46e5" },
                              { value: 100 - successRateNum, color: "#E2E8F0" }
                            ];

                            return (
                              <Pie
                                data={data}
                                cx="50%"
                                cy="85%"
                                startAngle={180}
                                endAngle={0}
                                innerRadius={55}
                                outerRadius={75}
                                dataKey="value"
                                stroke="none"
                              >
                                <Cell fill="#4f46e5" />
                                <Cell fill="#F1F5F9" />
                              </Pie>
                            );
                          })()}
                        </PieChart>
                      </SafeResponsiveContainer>
                      {/* Floating numbers directly in center of arc meter */}
                      <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-end z-10 self-end">
                        <span className="text-2xl font-black text-[#1A1F2E] tracking-tight">
                          {(() => {
                            const successRateNum = Math.round(
                              (currentSales.filter(s => s.status === "çatdırılıb").length / 
                              Math.max(1, currentSales.filter(s => s.status !== "ləğv edilib").length)) * 100
                            );
                            return successRateNum || 82;
                          })()}%
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 mt-0.5 tracking-wider uppercase">Çatdırılma Oranı</span>
                      </div>
                    </div>
                    {/* Small Legend elements */}
                    <div className="flex gap-4 text-[10px] text-slate-500 font-mono mt-2">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#4f46e5]" /> Uğurlu</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#F1F5F9]" /> Ləğv/Risk</span>
                    </div>
                  </div>

                  {/* Circle Graph 2: Layered Concentric Radial Progress Tracks (Concentric Pie resembling visual elements) */}
                  <div 
                    style={{
                      overflow: 'hidden',
                      minHeight: '320px',
                      position: 'relative',
                      isolation: 'isolate'
                    }} 
                    className="relative flex flex-col items-center justify-center h-full bg-slate-50/40 border border-slate-100 rounded-2xl p-4"
                  >
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Çatdırılma Kanalları</div>
                    
                    <div style={{ height: '220px', width: '100%', position: 'relative' }} className="flex items-center justify-center">
                      {(() => {
                        const totalDelivered = Math.max(1, currentSales.filter(s => s.status === "çatdırılıb").length);
                        const courierNum = currentSales.filter(s => s.status === "çatdırılıb" && s.deliveryType === "courier").length;
                        const cargoNum = currentSales.filter(s => s.status === "çatdırılıb" && s.deliveryType === "cargo").length;
                        const otherNum = totalDelivered - courierNum - cargoNum;

                        const courierPct = Math.round((courierNum / totalDelivered) * 100);
                        const cargoPct = Math.round((cargoNum / totalDelivered) * 100);
                        const otherPct = Math.round((otherNum / totalDelivered) * 100);

                        // Concentric radial bars represent the delivery splits beautifully
                        const radialDataArray = [
                          { name: 'Kuryer', value: courierPct, fill: '#4f46e5' },
                          { name: 'Kargo', value: cargoPct, fill: '#10b981' },
                          { name: 'Digər', value: otherPct || 12, fill: '#f59e0b' }
                        ];

                        return (
                          <SafeResponsiveContainer width="100%" height={220}>
                            <RadialBarChart 
                              cx="50%" 
                              cy="50%" 
                              innerRadius="40%" 
                              outerRadius="90%" 
                              barSize={12} 
                              data={radialDataArray}
                              startAngle={90}
                              endAngle={450}
                            >
                              <RadialBar
                                label={isMobile ? false : { position: 'insideStart', fill: '#fff', fontSize: '9px', fontWeight: 'bold' }}
                                background
                                dataKey="value"
                              />
                              {!isMobile && <Tooltip formatter={(value) => `${value}%`} />}
                            </RadialBarChart>
                          </SafeResponsiveContainer>
                        );
                      })()}
                    </div>
                    {/* Concentric helper labels */}
                    <div className="flex justify-center flex-wrap gap-2.5 text-[9px] font-mono font-bold mt-1">
                      <span className="text-[#4f46e5]">■ Kuryer</span>
                      <span className="text-[#10b981]">■ Kargo</span>
                      <span className="text-[#f59e0b]">■ Digərləri</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* 4. Expense breakdown - Luxury donut graph with total absolutely centered in middle hole */}
              <div className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">🍰 Xərclərin Kateqoriyalar üzrə Breakdown</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Dövri kapitalın pay bölgüsü analizi</p>
                  </div>
                  <span className="text-[10px] bg-slate-50 border border-slate-100 text-slate-500 font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider font-mono">Dairəvi</span>
                </div>

                <div className="h-72 flex flex-col sm:flex-row justify-around items-center gap-4 relative">
                  {categoryBreakdownData.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Məlumat yoxdur</p>
                  ) : (
                    <>
                      {/* Pie donut view with central overlay loader */}
                      <div className="w-52 h-52 relative shrink-0 flex items-center justify-center">
                        <SafeResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryBreakdownData}
                              cx="50%"
                              cy="50%"
                              innerRadius={65}
                              outerRadius={88}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {categoryBreakdownData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} style={{ outline: "none" }} />
                              ))}
                            </Pie>
                            {!isMobile && <Tooltip formatter={(value) => `${value} ₼`} />}
                          </PieChart>
                        </SafeResponsiveContainer>
                        
                        {/* ABSOLUTELY CENTERED CAPTION FIELD EXACTLY RESEMBLING THE PROOF IMAGES ("783,590 - total buyer") */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
                          <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-sans">Toplam Xərc</span>
                          <span className="text-lg font-black text-[#1A1F2E] tracking-tight font-mono mt-0.5">
                            {formatCurrency(currentCalculations.displayExpensesFlag)}
                          </span>
                          <span className="text-[8px] bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full mt-1.5 font-bold uppercase tracking-wider font-sans">
                            {categoryBreakdownData.length} Kateqoriya
                          </span>
                        </div>
                      </div>
                      
                      {/* Custom clean color key list right */}
                      <div className="space-y-2 max-h-56 overflow-auto pr-2 flex-grow sm:max-w-[220px]">
                        {categoryBreakdownData.map((item, index) => {
                          const totalExps = categoryBreakdownData.reduce((acc, c) => acc + c.value, 0);
                          const pct = totalExps > 0 ? (item.value / totalExps) * 100 : 0;
                          return (
                            <div key={index} className="flex items-start gap-2.5 text-[11px] hover:bg-slate-50/50 p-1.5 rounded-lg transition-colors">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: item.color }} />
                              <div className="flex-grow min-w-0">
                                <p className="text-slate-650 font-medium truncate leading-none mb-0.5">{item.name}</p>
                                <p className="text-slate-800 font-mono font-bold text-[11px] inline-flex items-center gap-1.5 leading-none">
                                  <span>{item.value} ₼</span>
                                  <span className="text-slate-400 font-normal">({pct.toFixed(0)}%)</span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 5. Top Addresses */}
              <div className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">📍 Ən Çox Satış Olunan Ünvanlar (Top 5)</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Sıralanmış ünvan lokasiyaları</p>
                  </div>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider">Top Ünvanlar</span>
                </div>
                <div className="space-y-2.5">
                  {topAddresses.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4 text-center">Heç bir ünvan verisi yoxdur</p>
                  ) : (
                    topAddresses.map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3.5 bg-slate-50/60 rounded-xl border border-slate-100/40 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-100/50 text-indigo-700 text-xs font-bold flex items-center justify-center font-mono">
                            {i + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px] sm:max-w-none">{item.address}</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100/30 px-3 py-1 rounded-xl">
                          {item.count} Sifariş
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 6. Sale Densities Heatmap concept */}
              <div className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">⚡ Satış Sıxlığı Tracker</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Sifarişlərin saatlıq həftə içi sıxlıq cədvəli</p>
                  </div>
                  <span className="text-[10px] bg-slate-50 border border-slate-100 text-slate-500 font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider font-mono">24H</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {["B.E", "Ç.A", "Ç.", "C.A", "C.", "Ş.", "B."].map((day, dIdx) => {
                    return (
                      <div key={dIdx} className="space-y-1">
                        <div className="text-[10px] text-center font-bold text-slate-450 mb-1.5">{day}</div>
                        {[9, 12, 15, 18, 21].map((hour) => {
                          const hits = sales.filter(s => {
                            const dt = new Date(getOrderTrackingDate(s));
                            const dMatch = dt.getDay() === (dIdx === 6 ? 0 : dIdx + 1);
                            const hVal = dt.getHours();
                            const hMatch = hVal >= hour - 1.5 && hVal < hour + 1.5;
                            return dMatch && hMatch;
                          }).length;

                          let bg = "bg-slate-50/50 hover:bg-slate-100/50";
                          if (hits > 0 && hits <= 2) bg = "bg-[#4f46e5]/15 hover:bg-[#4f46e5]/25 text-[#4f46e5]";
                          else if (hits > 2 && hits <= 5) bg = "bg-[#4f46e5]/35 hover:bg-[#4f46e5]/45 text-[#1e3a5f]";
                          else if (hits > 5) bg = "bg-[#4f46e5] text-white";

                          return (
                            <div 
                              key={hour} 
                              className={`h-8 rounded-lg flex items-center justify-center text-[10px] font-mono leading-none font-bold transition-all cursor-help ${bg}`}
                              title={`${hour}:00 ətrafı, ${hits} sifariş`}
                            >
                              {hits > 0 ? hits : ""}
                            </div>
                          );
                        })}
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-2.5">
                  <span>Səhər 09:00</span>
                  <span>Axşam 21:00</span>
                  <span className="text-[#4f46e5] font-bold">Tünd = Maks Sıxlıq</span>
                </div>
              </div>

              {/* 7. Həftəlik Trend Xətti */}
              <div className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">📈 Həftəlik Trend Xətti</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Günlər üzrə sifariş sayının xətt qrafiki</p>
                  </div>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider font-mono font-bold">Trend</span>
                </div>
                
                <div className="h-72 relative w-full min-h-0 min-w-0">
                  <SafeResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyTrendData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                      <XAxis dataKey="name" fontSize={11} stroke="#8B95A8" tickLine={false} axisLine={false} dy={8} />
                      <YAxis fontSize={11} stroke="#8B95A8" tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "#fff", 
                          border: "1px solid #E9EFF6", 
                          borderRadius: "16px",
                          boxShadow: "0 10px 25px rgba(26, 31, 46, 0.08)",
                          fontSize: "12px"
                        }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const isPos = data.pctChange > 0;
                            const isZero = data.pctChange === 0;
                            const pctText = isZero ? "Dəyişiklik yoxdur" : `${isPos ? "+" : ""}${data.pctChange.toFixed(1)}%`;
                            return (
                              <div className="p-3 bg-white border border-slate-100 rounded-xl shadow-lg space-y-1.5 leading-none">
                                <p className="font-bold text-slate-800 text-xs">{data.name} (Həftəlik Trend)</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[11px] text-slate-500">Sifariş sayı:</span>
                                  <span className="font-mono font-bold text-[#4f46e5]">{data.Sifariş} ədəd</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-slate-500">Dəyişiklik:</span>
                                  <span className={`font-semibold font-mono text-[10px] px-1.5 py-0.5 rounded-md ${
                                    isZero ? "bg-slate-50 text-slate-600" :
                                    isPos ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                                  }`}>
                                    {pctText}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line 
                        isAnimationActive={false}
                        type="monotone" 
                        name="Sifariş sayı" 
                        dataKey="Sifariş" 
                        stroke="#4f46e5" 
                        strokeWidth={3} 
                        dot={{ r: 5, strokeWidth: 1.5, fill: "#fff" }} 
                        activeDot={{ r: 7 }} 
                      />
                    </LineChart>
                  </SafeResponsiveContainer>
                </div>
              </div>

              {/* 8. Sadə Statistika Kartları */}
              <div className="p-6 bg-white rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A1F2E] tracking-tight">🎯 Sadə Statistika Kartları</h3>
                    <p className="text-[11px] text-[#8B95A8] mt-0.5">Hər gün üçün ümumi sifarişlərin sadə paylanması</p>
                  </div>
                  <span className="text-[10px] bg-slate-50 border border-slate-100 text-[#4f46e5] font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider font-mono font-bold">Günlük</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-3 gap-2.5 py-1">
                  {(() => {
                    const totalWeeklySales = weeklyTrendData.reduce((acc, d) => acc + d.Sifariş, 0);

                    return weeklyTrendData.map((dayData, idx) => {
                      const share = totalWeeklySales > 0 ? (dayData.Sifariş / totalWeeklySales) * 100 : 0;
                      const isPos = dayData.pctChange > 0;
                      const isZero = dayData.pctChange === 0;

                      // Choose decorative indicators
                      let accentBg = "bg-slate-50/60 hover:bg-slate-50";
                      let borderStyle = "border-slate-100";
                      let ringColor = "text-slate-700";
                      
                      if (dayData.Sifariş >= 180) {
                        accentBg = "bg-indigo-50/40 hover:bg-indigo-50/60";
                        borderStyle = "border-indigo-100/50";
                        ringColor = "text-indigo-700";
                      } else if (dayData.Sifariş >= 140) {
                        accentBg = "bg-sky-50/30 hover:bg-sky-50/50";
                        borderStyle = "border-sky-100/40";
                        ringColor = "text-sky-700";
                      }

                      return (
                        <div 
                          key={idx} 
                          className={`p-3 rounded-xl border ${borderStyle} ${accentBg} transition-colors flex flex-col justify-between`}
                        >
                          <div className="flex justify-between items-start">
                            <span className={`text-[11px] font-bold ${ringColor} font-sans uppercase`}>
                              {dayData.name}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 font-semibold">
                              {share.toFixed(0)}% pay
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-xl font-black font-mono text-slate-800">
                              {dayData.Sifariş}
                            </span>
                            
                            {/* Short inline representation of trend % */}
                            {!isZero && (
                              <span className={`text-[9px] font-mono font-bold leading-none px-1 py-0.5 rounded-sm ${
                                isPos ? "text-emerald-600 bg-emerald-50/50" : "text-rose-600 bg-rose-50/50"
                              }`}>
                                {isPos ? "↑" : "↓"} {Math.abs(dayData.pctChange).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

            </div>
          </motion.div>
        );
      })()}

      {/* 7 Günlük Sifariş Statusları Sütunlu Qrafik */}
      <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-base font-bold text-[#1A1F2E] tracking-tight">📊 Son 7 Günün Status Bölgüsü</h3>
            <p className="text-xs text-[#8B95A8] mt-1">Sifarişlərin statuslar üzrə paylanması (gözləyir, ləğv, çatdırılıb)</p>
          </div>
          <span className="text-[10px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider font-mono">Bölgü</span>
        </div>
        
        <div className="h-80 relative w-full min-h-0 min-w-0">
          <SafeResponsiveContainer width="100%" height="100%">
            <BarChart
              data={last7DaysStatusData}
              margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
              <XAxis dataKey="name" fontSize={11} stroke="#8B95A8" tickLine={false} axisLine={false} dy={8} />
              <YAxis fontSize={11} stroke="#8B95A8" tickLine={false} axisLine={false} />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ 
                  backgroundColor: "#fff", 
                  border: "1px solid #E9EFF6", 
                  borderRadius: "16px",
                  boxShadow: "0 10px 25px rgba(26, 31, 46, 0.08)",
                  fontSize: "12px",
                  padding: "12px"
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Bar isAnimationActive={false} dataKey="Çatdırılıb" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} barSize={40} />
              <Bar isAnimationActive={false} dataKey="Gözləyir" stackId="a" fill="#3b82f6" />
              <Bar isAnimationActive={false} dataKey="Ləğv edilib" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </SafeResponsiveContainer>
        </div>
      </div>

      {/* İlin Aylarına Göre Satış və Ötən İllə Müqayisə Cədvəli (User Request) */}
      <div className="mb-6">
        <YearlyMonthlyComparisonTable />
      </div>

      {/* Mini Tables (Last Orders, Top Selling Products) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Son Sifarişlər (Last Orders) */}
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-700">📦 Son Sifarişlər (Top 5)</h3>
            <span className="text-[10px] text-slate-400 font-mono">Cari dövr üzrə</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 pb-2">
                  <th className="py-2">No</th>
                  <th>Müştəri</th>
                  <th>Çatdırılma</th>
                  <th className="text-right">Məbləğ</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {lastOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center italic text-slate-400">Heç bir sifariş yoxdur</td>
                  </tr>
                ) : (
                  lastOrders.map((o) => (
                    <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 font-bold text-slate-800 font-mono">{formatDisplayOrderNumber(o.orderNumber)}</td>
                      <td>
                        <div>
                          <p className="font-semibold text-slate-700">{o.customerName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{o.customerPhone}</p>
                        </div>
                      </td>
                      <td className="capitalize text-slate-500">{o.deliveryType === "courier" ? "Kuryer" : o.deliveryType === "cargo" ? "Kargo" : o.deliveryType === "Azərpoçt" ? "Azərpoçt" : "Expargo"}</td>
                      <td className="text-right font-mono font-semibold text-slate-700">{formatCurrency(o.totalAmount)}</td>
                      <td className="text-right">
                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                          o.status === "çatdırılıb" ? "bg-emerald-50 text-emerald-700" :
                          o.status === "gözləyir" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                        }`}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ən Çox Satılan Məhsullar (Top Selling Products) */}
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-700">🔥 Ən Çox Satılan Məhsullar (Top 5)</h3>
            <span className="text-[10px] text-slate-400 font-mono">Çatdırılmışlar əsasında</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 pb-2">
                  <th className="py-2">Məhsul</th>
                  <th>SKU</th>
                  <th className="text-center">Miqdar</th>
                  <th className="text-right">Dövriyyə</th>
                </tr>
              </thead>
              <tbody>
                {topSellingProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center italic text-slate-400">Dövriyyə verisi yoxdur</td>
                  </tr>
                ) : (
                  topSellingProducts.map((p, idx) => (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 font-semibold text-slate-700">{p.name}</td>
                      <td className="font-mono text-slate-500">{p.sku}</td>
                      <td className="text-center font-mono font-bold text-slate-800">{p.qty} ədəd</td>
                      <td className="text-right font-mono font-bold text-emerald-600">{formatCurrency(p.totalRev)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Auxiliary metadata checklists & notifications */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Notification warnings */}
        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm space-y-4 md:col-span-2">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Sürətli Xəbərdarlıqlar və Bildirişlər
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
            {/* Stock Warns */}
            {lowStockWarnings.map(p => (
              <div key={p.id} className="p-3 bg-red-50/60 rounded-xl border border-red-100 flex gap-2 items-start text-xs text-red-800">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Az Stok Warning</p>
                  <p className="mt-0.5">{p.name} ({p.SKU}) stokları tükənir: <span className="font-bold underline">{p.stock}</span> ədəd qalıb!</p>
                </div>
              </div>
            ))}

            {/* Waiting order > 24 hours */}
            {lateOrders.map(o => (
              <div key={o.id} className="p-3 bg-amber-50/60 rounded-xl border border-amber-100 flex gap-2 items-start text-xs text-amber-800">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">24 Saatı Keçmiş Sifariş</p>
                  <p className="mt-0.5">Sifariş {formatDisplayOrderNumber(o.orderNumber)} ({o.customerName}) 24 saatdan çoxdur gözləyir statusundadır!</p>
                </div>
              </div>
            ))}

            {/* VIP Customers automatic congratulation */}
            {customers.filter(c => c.orderCount >= settings.vipThreshold).map(c => (
              <div key={c.id} className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 flex gap-2 items-start text-xs text-emerald-800">
                <div className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">VIP</div>
                <div>
                  <p className="font-semibold">Yeni VIP Müştəri!</p>
                  <p className="mt-0.5">{c.name} {settings.vipThreshold}-ci sifarişə çatdı və avtomatik VIP dərəcəsi aldı ✓</p>
                </div>
              </div>
            ))}

            {/* 3+ Days no sales alert */}
            {lastOrderStats.days !== "—" && Number(lastOrderStats.days) >= 3 && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/50 flex gap-2 items-start text-xs text-slate-700 col-span-1 sm:col-span-2">
                <Briefcase className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Durgunluq Xəbərdarlığı</p>
                  <p className="mt-0.5">Ayvelin anبارlarında son {lastOrderStats.days} gündür heç bir satış təsdiqlənməyib!</p>
                </div>
              </div>
            )}

            {lowStockWarnings.length === 0 && lateOrders.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-400 italic col-span-1 sm:col-span-2">
                Hazırda heç bir kritik sistem xəbərdarlığı yoxdur. Hər şey mükəmməldir! 🎉
              </div>
            )}
          </div>
        </div>

        {/* Sales history metadata info card */}
        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm text-xs space-y-3.5">
          <h4 className="text-sm font-bold text-slate-700">📋 Dövrü İcmal Analizi</h4>
          
          <div className="space-y-2 font-mono">
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Son Satış Günü:</span>
              <span className="text-slate-700 font-bold">{lastOrderStats.dateStr}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Son Satışdan Keçib:</span>
              <span className="text-slate-700 font-bold">{lastOrderStats.days} gün</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Aylıq Satışsız Günlər:</span>
              <span className="text-rose-500 font-semibold">{saleslessMonthStats.current} gün <span className="text-[10px] text-slate-400 font-normal">(Ötən ay: {saleslessMonthStats.previous})</span></span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Ümumi Satışsız Günlər:</span>
              <span className="text-slate-700 font-semibold">{totalSaleslessDays} gün</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Aylıq Sürət (1-{currentDate.getDate()} Cari vs Ötən):</span>
              <span className="text-slate-700 font-semibold">
                {ordersAndItemsComparison.thisMonthOrders}s ({ordersAndItemsComparison.thisMonthQty}m) / {ordersAndItemsComparison.prevMonthOrders}s ({ordersAndItemsComparison.prevMonthQty}m)
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Son Reklam Xərci:</span>
              <span className="text-slate-700 font-semibold">{reklamExpenseStats.lastDateStr}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Günlük Orta Reklam:</span>
              <span className="text-slate-700 font-bold">{formatCurrency(reklamExpenseStats.averageDaily)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Kargo/Expargo Çatdırılma:</span>
              <span className="text-indigo-600 font-bold">{formatCurrency(cargoAndExpargoDeliveryCosts.combined)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100/50">
              <span className="text-slate-400">Kuryer Stok Balansı:</span>
              <span className="text-slate-700 font-semibold">
                {couriers.reduce((acc, c) => acc + c.stockBalance, 0)} ədəd
              </span>
            </div>
          </div>

          <button 
            onClick={() => {
              const report = `AYVELIN GÜNLÜK XÜLASƏ:\n\nÜmumi Satış dövri: ${formatCurrency(currentCalculations.grossRevenue)}\nXalis Mənfəət: ${formatCurrency(currentCalculations.netProfit)}\nSifariş sayı: ${currentCalculations.orderCount}\nAktiv Kuryer Stokları: ${couriers.reduce((acc,c) => acc+c.stockBalance, 0)} ədəd.\n\nTarix: ${formatDateAZ(new Date().toISOString())}`;
              alert(report);
            }}
            className="w-full mt-2 py-2 bg-slate-100 hover:bg-slate-200/80 active:scale-95 text-slate-800 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            📋 Günün Sığortalı Xülasəsi (Çap et)
          </button>
        </div>

      </div>

    </div>
  );
}
