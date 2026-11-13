import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Receipt, Plus, ShoppingBag, BarChart2 } from "lucide-react";
import { motion } from "motion/react";
import { useData } from "../context/DataContext";

const navItems = [
  { id: "dashboard", icon: Home, route: "/dashboard", label: "Ana səhifə" },
  { id: "expenses", icon: Receipt, route: "/expenses", label: "Xərclər" },
  { id: "new_order", icon: Plus, isFab: true, label: "Yeni Sifariş" },
  { id: "sales", icon: ShoppingBag, route: "/sales", label: "Satışlar" },
  { id: "statistics", icon: BarChart2, route: "/statistics", label: "Maliyyə" },
];

const routeImports: Record<string, () => Promise<any>> = {
  "/dashboard": () => import("./DashboardView"),
  "/expenses": () => import("./ExpensesView"),
  "/sales": () => import("./SalesView"),
  "/statistics": () => import("./StatisticsView"),
};

export default function BottomNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname } = location;
  const { setIsNewOrderOpen } = useData();

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 px-2 sm:px-6 bg-[#1A1F2E] dark:bg-[#0B0C0E] lg:hidden"
      style={{
        height: "72px",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "24px 24px 0 0",
        boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.3)",
        paddingBottom: "env(safe-area-inset-bottom)"
      }}
    >
      <div 
        className="absolute inset-0 z-0 pointer-events-none" 
        style={{ background: "rgba(255, 255, 255, 0.06)", borderRadius: "24px 24px 0 0" }} 
      />
      <div className="relative flex items-center justify-between h-full max-w-md mx-auto z-10">
        {navItems.map((item) => {
          const isActive = pathname === item.route;
          const Icon = item.icon;

          if (item.isFab) {
            return (
              <div key={item.id} className="relative flex flex-col items-center flex-shrink-0" style={{ transform: "translateY(-20px)" }}>
                <button
                  type="button"
                  onMouseEnter={() => {
                    const imp = routeImports["/sales"];
                    if (imp) imp();
                  }}
                  onPointerDown={() => {
                    const imp = routeImports["/sales"];
                    if (imp) imp();
                  }}
                  onClick={() => {
                    navigate("/sales");
                    setTimeout(() => setIsNewOrderOpen(true), 50);
                  }}
                  className="w-[58px] h-[58px] rounded-full flex items-center justify-center text-white cursor-pointer active:scale-90 transition-transform border-[3px] border-white/10 select-none"
                  style={{
                    background: "linear-gradient(135deg, #1a3d1a, #2d6e2d)",
                    boxShadow: "0 8px 24px rgba(30, 90, 30, 0.55)"
                  }}
                  title={item.label}
                >
                  <Icon className="w-7 h-7 stroke-[2.5]" />
                </button>
                <span className="absolute -bottom-4 text-[10px] font-medium text-emerald-600/90 whitespace-nowrap tracking-wider shadow-sm select-none">
                  {item.label}
                </span>
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => {
                if (item.route) {
                  const imp = routeImports[item.route];
                  if (imp) imp();
                }
              }}
              onPointerDown={() => {
                if (item.route) {
                  const imp = routeImports[item.route];
                  if (imp) imp();
                }
              }}
              onClick={() => {
                if (item.route && pathname !== item.route) {
                  navigate(item.route);
                }
              }}
              className="flex flex-col items-center justify-center space-y-1 w-16 cursor-pointer active:scale-90 transition-transform select-none"
            >
              <div className="relative">
                <Icon 
                  className={`w-[22px] h-[22px] transition-all duration-200 ${
                    isActive 
                      ? "text-emerald-500 scale-115 drop-shadow-md stroke-[2.5]" 
                      : "stroke-[2]"
                  }`} 
                  style={{ color: isActive ? "" : "rgba(255,255,255,0.4)" }}
                />
              </div>
              <span 
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? "text-emerald-500" : ""
                }`}
                style={{ color: isActive ? "" : "rgba(255,255,255,0.4)" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
