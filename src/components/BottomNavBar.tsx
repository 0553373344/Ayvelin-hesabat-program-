import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Receipt, Plus, ShoppingBag, BarChart2 } from "lucide-react";
import { useData } from "../context/DataContext";

const navItems = [
  { id: "dashboard", icon: Home, route: "/dashboard", label: "Ana səhifə" },
  { id: "expenses", icon: Receipt, route: "/expenses", label: "Xərclər" },
  { id: "new_order", icon: Plus, isFab: true, label: "Yeni sifariş" },
  { id: "sales", icon: ShoppingBag, route: "/sales", label: "Satışlar" },
  { id: "statistics", icon: BarChart2, route: "/statistics", label: "Maliyyə" },
] as const;

const routeImports: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("./DashboardView"),
  "/expenses": () => import("./ExpensesView"),
  "/sales": () => import("./SalesView"),
  "/statistics": () => import("./StatisticsView"),
};

function BottomNavBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { setIsNewOrderOpen } = useData();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white lg:hidden"
      style={{
        borderRadius: "28px 28px 0 0",
        boxShadow: "0 -10px 30px rgba(14,14,14,0.08)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="relative flex items-end justify-between h-[68px] max-w-md mx-auto px-3">
        {navItems.map((item) => {
          const Icon = item.icon;

          if ("isFab" in item && item.isFab) {
            return (
              <div key={item.id} className="relative flex flex-col items-center w-16 shrink-0 pb-2">
                <button
                  type="button"
                  aria-label={item.label}
                  onPointerDown={() => routeImports["/sales"]?.()}
                  onClick={() => {
                    navigate("/sales");
                    setTimeout(() => setIsNewOrderOpen(true), 50);
                  }}
                  className="w-14 h-14 -mt-7 rounded-full bg-ink text-lime flex items-center justify-center active:scale-90 transition-transform ring-[6px] ring-white shadow-lg"
                >
                  <Icon className="w-6 h-6" strokeWidth={2.5} />
                </button>
                <span className="mt-1 text-[10px] font-semibold text-ink">{item.label}</span>
              </div>
            );
          }

          const route = "route" in item ? item.route : "";
          const isActive = pathname === route;
          return (
            <button
              key={item.id}
              type="button"
              onPointerDown={() => routeImports[route]?.()}
              onClick={() => { if (!isActive) navigate(route); }}
              className="flex flex-col items-center justify-center gap-1 w-16 h-full pb-2 active:scale-90 transition-transform"
            >
              <span
                className={`flex items-center justify-center w-10 h-7 rounded-full transition-colors ${
                  isActive ? "bg-lime text-ink" : "text-slate-400"
                }`}
              >
                <Icon className="w-[20px] h-[20px]" strokeWidth={isActive ? 2.4 : 1.8} />
              </span>
              <span className={`text-[10px] font-semibold ${isActive ? "text-ink" : "text-slate-400"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(BottomNavBar);
