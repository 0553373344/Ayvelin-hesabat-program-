import React, { useState, useEffect, Suspense, useRef } from "react";
import { HashRouter as Router, useNavigate, useLocation } from "react-router-dom";
import { DataProvider, useData } from "./context/DataContext";
import ProfileMenu from "./components/ProfileMenu";
import BottomNavBar from "./components/BottomNavBar";
import GlobalSearchBar from "./components/GlobalSearchBar";

// Lazy-loaded views for instant initial load & code-splitting
const DashboardView = React.lazy(() => import("./components/DashboardView"));
const SalesView = React.lazy(() => import("./components/SalesView"));
const ProductsView = React.lazy(() => import("./components/ProductsView"));
const CustomersView = React.lazy(() => import("./components/CustomersView"));
const CouriersView = React.lazy(() => import("./components/CouriersView"));
const CourierAnalyticsView = React.lazy(() => import("./components/CourierAnalyticsView"));
const ExpensesView = React.lazy(() => import("./components/ExpensesView"));
const StatisticsView = React.lazy(() => import("./components/StatisticsView"));
const ManagerPanelView = React.lazy(() => import("./components/ManagerPanelView"));
const SettingsView = React.lazy(() => import("./components/SettingsView"));
const AiAnalystView = React.lazy(() => import("./components/AiAnalystView"));
const SalesAuditView = React.lazy(() => import("./components/SalesAuditView"));
const LoyaltyProgramView = React.lazy(() => import("./components/LoyaltyProgramView"));
const BlacklistView = React.lazy(() => import("./components/BlacklistView"));

import { 
  Building2, 
  Menu, 
  X, 
  Home, 
  ShoppingCart, 
  Package, 
  Users, 
  Bike, 
  TrendingUp, 
  ArrowDownCircle, 
  BarChart4, 
  Map, 
  Search, 
  Ticket, 
  Gift,
  Bell, 
  Sliders, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Clock,
  Plus,
  Sparkles,
  CreditCard,
  ClipboardList,
  ShoppingBag,
  User,
  AlertTriangle,
  ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { useTheme } from "./context/ThemeContext";

// Live Online / Offline Cloud Database connection indicator
const NetworkStatusBadge = React.memo(function NetworkStatusBadge() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div 
      className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 text-[10px] font-semibold transition-all select-none ${
        isOnline 
          ? "bg-emerald-50 text-emerald-800 border-emerald-200/90 shadow-xs" 
          : "bg-amber-50 text-amber-800 border-amber-200/90"
      }`}
      title={
        isOnline
          ? "🟢 Online Baza: Firebase Firestore bulud serveri ilə birbaşa əlaqədədir. Daxil edilən bütün sifariş, müştəri və məhsul qeydləri dərhal online buluda yazılır və digər cihazlarla sinxronlaşdırılır."
          : "🟡 Oflayn Rejim: İnternet bağlantısı yoxdur. Qeydlər yerli cihazınızda saxlanılır və internet bərpa olunan kimi avtomatik online bulud bazasına köçürüləcək."
      }
    >
      <span className="relative flex h-2 w-2">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? "bg-emerald-500" : "bg-amber-500"}`}></span>
      </span>
      <span className="hidden sm:inline font-mono tracking-tight">{isOnline ? "Online Baza" : "Oflayn"}</span>
    </div>
  );
});

// Isolated Digital Clock prevents MainAppShell from re-rendering every 1 second
const HeaderClock = React.memo(function HeaderClock() {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white/80 px-3 py-1 rounded-xl border border-[#D4DAE4] hidden md:flex items-center gap-2 text-[#8B95A8] font-mono text-[10px] shadow-xs">
      <Clock className="w-3.5 h-3.5 text-[#1A1F2E]" />
      <span className="text-[#1A1F2E] font-medium">
        {currentTime.toLocaleTimeString("az-AZ", { hour12: false })}{" - "}
        {currentTime.toLocaleDateString("az-AZ", { day: "2-digit", month: "long", year: "numeric" })}
      </span>
    </div>
  );
});

// View component map for instant preserved tab switching
const viewComponents: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  dashboard: DashboardView,
  "ai-analyst": AiAnalystView,
  sales: SalesView,
  "sales-audit": SalesAuditView,
  products: ProductsView,
  customers: CustomersView,
  blacklist: BlacklistView,
  loyalty: LoyaltyProgramView,
  delivery: CouriersView,
  "courier-analytics": CourierAnalyticsView,
  expenses: ExpensesView,
  statistics: StatisticsView,
  manager: ManagerPanelView,
  settings: SettingsView
};

const viewImports: Record<string, () => Promise<any>> = {
  dashboard: () => import("./components/DashboardView"),
  "ai-analyst": () => import("./components/AiAnalystView"),
  sales: () => import("./components/SalesView"),
  "sales-audit": () => import("./components/SalesAuditView"),
  products: () => import("./components/ProductsView"),
  customers: () => import("./components/CustomersView"),
  blacklist: () => import("./components/BlacklistView"),
  loyalty: () => import("./components/LoyaltyProgramView"),
  delivery: () => import("./components/CouriersView"),
  "courier-analytics": () => import("./components/CourierAnalyticsView"),
  expenses: () => import("./components/ExpensesView"),
  statistics: () => import("./components/StatisticsView"),
  manager: () => import("./components/ManagerPanelView"),
  settings: () => import("./components/SettingsView")
};

function MainAppShell() {
  const { settings, isNewOrderOpen, setIsNewOrderOpen } = useData();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileOrTablet(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Tabs layout registries - soldan sağa məntiqi ardıcıllıqla sıralanmış
  const tabRegistry = [
    { id: "dashboard", label: "Dashboard", category: "Biznes", icon: Home },
    { id: "sales", label: "Satışlar (Sifarişlər)", category: "Biznes", icon: ShoppingCart },
    { id: "products", label: "Anbar Məhsulları", category: "Biznes", icon: Package },
    { id: "customers", label: "Müştəri Portfeli", category: "Biznes", icon: Users },
    { id: "delivery", label: "Çatdırılma", category: "Kuryer", icon: Bike },
    { id: "courier-analytics", label: "Kuryer Analitikası", category: "Kuryer", icon: TrendingUp },
    { id: "expenses", label: "Xərclər və İtirilənlər", category: "Maliyyə", icon: ArrowDownCircle },
    { id: "statistics", label: "Maliyyə Statistika", category: "Maliyyə", icon: BarChart4 },
    { id: "sales-audit", label: "Sifariş Auditi", category: "Biznes", icon: AlertTriangle },
    { id: "loyalty", label: "Loyallıq Proqramı", category: "Biznes", icon: Gift },
    { id: "blacklist", label: "Qara Siyahı (Blacklist)", category: "Biznes", icon: ShieldAlert },
    { id: "ai-analyst", label: "Ağıllı Köməkçi (AI)", category: "Biznes", icon: Sparkles },
    { id: "manager", label: "Menencer Ayarları", category: "Sistem", icon: Sliders },
    { id: "settings", label: "Səlahiyyətli İdarəetmə", category: "Sistem", icon: Settings }
  ];

  // Derive activeTab from router's pathname
  const rawPath = location.pathname.substring(1);
  const activeTab = tabRegistry.some(t => t.id === rawPath) ? rawPath : "dashboard";

  // Preload all chunk components during idle time so every tab click is instant with 0ms delay
  useEffect(() => {
    const preload = () => {
      import("./components/SalesView");
      import("./components/ProductsView");
      import("./components/CustomersView");
      import("./components/CouriersView");
      import("./components/CourierAnalyticsView");
      import("./components/ExpensesView");
      import("./components/StatisticsView");
      import("./components/SalesAuditView");
      import("./components/LoyaltyProgramView");
      import("./components/BlacklistView");
      import("./components/AiAnalystView");
      import("./components/ManagerPanelView");
      import("./components/SettingsView");
    };
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(preload);
    } else {
      setTimeout(preload, 150);
    }
  }, []);

  useEffect(() => {
    // Lightly trigger resize for charts in newly active tab
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }, [activeTab]);

  useEffect(() => {
    if (location.pathname === "/" || location.pathname === "") {
      navigate("/dashboard", { replace: true });
    }
  }, [location.pathname, navigate]);

  // Auto-scroll the active tab into view in the top navigation bar
  const navScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (navScrollRef.current) {
      const activeEl = navScrollRef.current.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeTab]);

  return (
    <div 
      className="min-h-screen w-full bg-[#E8EDF2] text-slate-850 flex overflow-hidden font-sans select-none antialiased md:relative"
    >
      {/* 2. Main content block canvas */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden w-full">
        
        {/* Top Header navbar with digital timer */}
        <header className="h-14 border-b border-[#D4DAE4] bg-[#E8EDF2] flex items-center justify-between px-4 sm:px-6 z-20 shrink-0 gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Clickable Brand Logo & Dashboard Nav item */}
            <div 
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 cursor-pointer group select-none p-1 rounded-xl hover:bg-white/60 transition-all"
              title="Ana səhifəyə keç (Dashboard)"
            >
              <div className="w-8 h-8 bg-[#1A1F2E] rounded-lg flex items-center justify-center font-bold text-white shadow-sm overflow-hidden select-none shrink-0 group-hover:scale-105 transition-transform">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  (settings.businessName || "Ayvel").slice(0, 2).toUpperCase()
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {(() => {
                  const activeItem = tabRegistry.find(t => t.id === activeTab);
                  if (activeItem) {
                    const Icon = activeItem.icon;
                    return <Icon className="w-4 h-4 text-[#1A1F2E] group-hover:text-indigo-600 transition-colors shrink-0" />;
                  }
                  return null;
                })()}
                <h2 className="text-sm font-semibold text-[#1A1F2E] group-hover:text-indigo-600 transition-colors hidden sm:block">
                  {tabRegistry.find(t => t.id === activeTab)?.label || "Dashboard"}
                </h2>
              </div>
            </div>
          </div>

          {/* Centered Global Search Bar */}
          <div className="flex-1 max-w-xs md:max-w-md mx-1 sm:mx-6">
            <GlobalSearchBar />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={toggleTheme}
              title="Mövzunu Dəyiş"
              className="p-2 bg-white/80 border border-[#D4DAE4] rounded-xl text-[#1A1F2E] hover:bg-white transition-all shadow-xs shrink-0 cursor-pointer"
            >
              {theme === "light" ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
            </button>
            <NetworkStatusBadge />
            <HeaderClock />

            <ProfileMenu onNavigate={(tabId) => navigate("/" + tabId)} />
          </div>
        </header>

        {/* Top Horizontal Navigation Bar - Bölmələr üstdə görünən və soldan sağa sıralanmış */}
        <nav 
          aria-label="Əsas Bölmələr"
          className="bg-white/95 dark:bg-[#12161F] border-b border-[#D4DAE4] dark:border-slate-800 px-3 sm:px-6 py-2 flex items-center z-10 shrink-0 gap-2 overflow-x-auto scrollbar-none shadow-xs select-none"
        >
          <div ref={navScrollRef} className="flex items-center gap-1.5 shrink-0">
            {tabRegistry.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-active={isActive}
                  onMouseEnter={() => {
                    const imp = viewImports[tab.id];
                    if (imp) imp();
                  }}
                  onPointerDown={() => {
                    const imp = viewImports[tab.id];
                    if (imp) imp();
                  }}
                  onClick={() => {
                    if (activeTab !== tab.id) {
                      navigate("/" + tab.id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap active:scale-95 transition-all duration-100 cursor-pointer select-none shrink-0 ${
                    isActive
                      ? "bg-[#1A1F2E] text-white dark:bg-emerald-600 dark:text-white shadow-sm ring-1 ring-black/5 font-semibold scale-[1.02]"
                      : "bg-[#E8EDF2]/90 hover:bg-[#E8EDF2] text-slate-700 hover:text-slate-900 dark:bg-slate-800/80 dark:hover:bg-slate-800 dark:text-slate-300 dark:hover:text-white border border-[#D4DAE4]/80 dark:border-slate-700 shadow-xs"
                  }`}
                  title={tab.label}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-emerald-400 dark:text-white" : "text-slate-500 dark:text-slate-400"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Major view body area with instant, 0ms preserved tab switches */}
        <main className="flex-1 overflow-y-auto bg-[#E8EDF2] p-3 sm:p-6 pb-24 lg:pb-8">
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center min-h-[300px] w-full text-slate-500 gap-3 py-16">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium">Bölmə yüklənir...</span>
              </div>
            }
          >
            {(() => {
              const ActiveComponent = viewComponents[activeTab] || DashboardView;
              return (
                <div key={activeTab} className="w-full">
                  <ActiveComponent />
                </div>
              );
            })()}
          </Suspense>
        </main>

        <BottomNavBar />

      </div>

      {/* Floating high-fidelity bottom-right notification toast system */}
      <DataProviderToastPortal />

    </div>
  );
}

// Microsubcomponent linking global toasts to context logs
function DataProviderToastPortal() {
  const { toasts, removeToast } = useData();

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none space-y-2 flex flex-col items-end">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", damping: 15, stiffness: 200 }}
            className="pointer-events-auto max-w-xs toast-item-neumorphic p-4 flex items-start gap-3"
          >
            <div className={`p-1.5 rounded-lg text-xs ${
              t.type === "warning" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
              t.type === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
              "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
            }`}>
              <Bell className="w-4 h-4" />
            </div>

            <div className="flex-1 space-y-1">
              <h5 className="font-bold text-xs">{t.title}</h5>
              <p className="text-[10px] text-slate-400 leading-normal">{t.content}</p>
            </div>

            <button 
              onClick={() => removeToast(t.id)}
              className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-slate-300"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

import { ThemeProvider } from "./context/ThemeContext";

// Wrap complete app workspace in central context and router
export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <DataProvider>
          <MainAppShell />
        </DataProvider>
      </Router>
    </ThemeProvider>
  );
}
