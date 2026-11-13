import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutGrid, 
  Home, 
  Sparkles, 
  ShoppingCart, 
  AlertTriangle, 
  Package, 
  Users, 
  Bike, 
  TrendingUp, 
  ArrowDownCircle, 
  BarChart2, 
  SlidersHorizontal, 
  ShieldCheck,
  ShieldAlert,
  Gift
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const sections = [
  {
    category: "BİZNES",
    items: [
      { id: "dashboard", label: "Dashboard", route: "/dashboard", icon: Home },
      { id: "sales", label: "Satışlar (Sifarişlər)", route: "/sales", icon: ShoppingCart },
      { id: "products", label: "Anbar Məhsulları", route: "/products", icon: Package },
      { id: "customers", label: "Müştəri Portfeli", route: "/customers", icon: Users },
      { id: "sales-audit", label: "Sifariş Auditi", route: "/sales-audit", icon: AlertTriangle },
      { id: "loyalty", label: "Loyallıq Proqramı", route: "/loyalty", icon: Gift },
      { id: "blacklist", label: "Qara Siyahı (Blacklist)", route: "/blacklist", icon: ShieldAlert },
      { id: "ai-analyst", label: "Master AI Agent (Bütün Datalar)", route: "/ai-analyst", icon: Sparkles },
    ]
  },
  {
    category: "KURYER",
    items: [
      { id: "delivery", label: "Çatdırılma", route: "/delivery", icon: Bike },
      { id: "courier-analytics", label: "Kuryer Analitikası", route: "/courier-analytics", icon: TrendingUp },
    ]
  },
  {
    category: "MALİYYƏ",
    items: [
      { id: "expenses", label: "Xərclər və İtirilənlər", route: "/expenses", icon: ArrowDownCircle },
      { id: "statistics", label: "Maliyyə Statistika", route: "/statistics", icon: BarChart2 },
    ]
  },
  {
    category: "SİSTEM",
    items: [
      { id: "manager", label: "Menencer Ayarları", route: "/manager", icon: SlidersHorizontal },
      { id: "settings", label: "Səlahiyyətli İdarəetmə", route: "/settings", icon: ShieldCheck },
    ]
  }
];

export default function AllSectionsPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const popoverRef = useRef<HTMLDivElement>(null);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    let timer: number;
    if (isOpen) {
      timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    }
    return () => clearInterval(timer);
  }, [isOpen]);

  // Format date for popover footer
  const formatDate = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleDateString('az-AZ', { month: 'short' });
    return `${hours}:${minutes}:${seconds} - ${day} ${month}`;
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Reliable click-outside transparent backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]" 
          onClick={() => setIsOpen(false)} 
        />
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative z-40 flex items-center justify-center w-[38px] h-[38px] rounded-full text-white cursor-pointer transition-transform active:scale-90 select-none"
        style={{
          background: "rgba(255, 255, 255, 0.08)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.14)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"}
        title="Bütün Bölmələr"
      >
        <LayoutGrid className="w-[18px] h-[18px] text-slate-800 dark:text-white" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-[48px] left-0 w-[240px] z-50 flex flex-col overflow-hidden text-white"
            style={{
              maxHeight: "75vh",
              background: "rgba(14, 28, 14, 0.97)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "18px",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div className="flex-1 overflow-y-auto scrollbar-none pb-2">
              {sections.map((section, sIdx) => (
                <div key={section.category}>
                  {sIdx > 0 && <div className="mx-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }} />}
                  <h4 className="text-[10px] tracking-[0.12em] uppercase opacity-35 px-4 pt-4 pb-1 font-semibold">
                    {section.category}
                  </h4>
                  <div className="px-2 space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = location.pathname === item.route;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            navigate(item.route);
                            setIsOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-[10px] transition-all active:scale-95 cursor-pointer text-left select-none"
                          style={{
                            background: isActive ? "rgba(255,255,255,0.12)" : "transparent",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <Icon 
                            className="w-4 h-4 shrink-0" 
                            style={{ 
                              color: isActive ? "#34d399" : "rgba(255,255,255,0.7)" 
                            }} 
                          />
                          <span className="text-[13px] font-medium" style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.85)" }}>
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div 
              className="px-4 py-3 flex items-center justify-between mt-auto"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.06)",
                fontSize: "10px",
                opacity: 0.4
              }}
            >
              <div className="flex flex-col gap-0.5">
                <span>{formatDate(currentTime)}</span>
                <span>Sistem Durumu: Aktiv ✅</span>
              </div>
              <span className="self-end">v1.5</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
