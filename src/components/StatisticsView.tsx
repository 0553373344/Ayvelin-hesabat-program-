import React, { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import { getComparativeMetrics, getPeriodMetrics } from "../utils/biCalculations";

// Modular BI components
import BiExecutiveDashboard from "./bi/BiExecutiveDashboard";
import BiSalesProfitAnalytics from "./bi/BiSalesProfitAnalytics";
import BiProductCostAnalytics from "./bi/BiProductCostAnalytics";
import BiCustomerAnalytics from "./bi/BiCustomerAnalytics";
import BiMarketingAnalytics from "./bi/BiMarketingAnalytics";
import BiForecastingRoom from "./bi/BiForecastingRoom";
import BiChatAgent from "./bi/BiChatAgent";
import BiReportGenerator from "./bi/BiReportGenerator";
import BiCourierPerformance from "./bi/BiCourierPerformance";
import BiMissingExpensesImpact from "./bi/BiMissingExpensesImpact";

import { 
  Sparkles, Bot, BarChart3, TrendingUp, Layers, Users, Target, Calendar, ClipboardList, 
  RotateCcw, Info, ArrowUpRight, HelpCircle, Activity
} from "lucide-react";

type TimeRangePreset = "today" | "yesterday" | "7db" | "30db" | "this_month" | "prev_month" | "this_year" | "prev_year";

type BIActiveTab = "executive" | "sales" | "products" | "customers" | "marketing" | "forecast" | "ai" | "export" | "performance";

export default function StatisticsView() {
  const { sales, expenses, products, customers, settings } = useData();

  // Selected tab & Time range states
  const [activeTab, setActiveTab] = useState<BIActiveTab>("executive");
  const [timePreset, setTimePreset] = useState<TimeRangePreset>("30db");

  // Custom date range states (active if custom is modified)
  const [isCustomDateActive, setIsCustomDateActive] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [customEndDate, setCustomEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Compute calculated metrics for active range and comparator period
  const { currentMetrics, prevMetrics, labelCurrent, labelPrevious } = useMemo(() => {
    if (isCustomDateActive) {
      const start = new Date(customStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999);

      // Previous period has matching duration shifted backwards
      const deltaMs = end.getTime() - start.getTime();
      const pStart = new Date(start.getTime() - deltaMs - 1000);
      const pEnd = new Date(start.getTime() - 1000);

      const current = getPeriodMetrics(sales, expenses, products, customers, start, end);
      const previous = getPeriodMetrics(sales, expenses, products, customers, pStart, pEnd);

      return {
        currentMetrics: current,
        prevMetrics: previous,
        labelCurrent: "Fərdi dövrlər",
        labelPrevious: "Əvvəlki fərdi dövr",
      };
    } else {
      const { current, previous, labels } = getComparativeMetrics(
        sales,
        expenses,
        products,
        customers,
        timePreset
      );
      return {
        currentMetrics: current,
        prevMetrics: previous,
        labelCurrent: labels.current,
        labelPrevious: labels.previous,
      };
    }
  }, [sales, expenses, products, customers, timePreset, isCustomDateActive, customStartDate, customEndDate]);

  // Clean filters reset helper
  const handleResetFilters = () => {
    setIsCustomDateActive(false);
    setTimePreset("30db");
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Header Toolbar with presets and custom date filters */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider">
            Enterprise BI Platforma
          </span>
          <h2 className="text-xl font-black text-slate-850 mt-1.5 leading-tight">Maliyyə & Satış Statistika Mərkəzi</h2>
          <p className="text-xs text-slate-400 mt-0.5">Müəssisənin bütün gəlirlərini, xərclərini və böyümə sürətini ölçən real-vaxt paneli</p>
        </div>

        {/* Filters Controls Box */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          
          {/* Preset Buttons Picker */}
          {!isCustomDateActive && (
            <select
              value={timePreset}
              onChange={(e) => setTimePreset(e.target.value as TimeRangePreset)}
              className="bg-slate-50 border border-slate-100 text-xs font-semibold p-2.5 rounded-xl text-slate-705 focus:outline-none focus:ring-1 focus:ring-indigo-600 transition-all cursor-pointer min-w-[130px]"
            >
              <option value="today">Bu gün</option>
              <option value="yesterday">Dünən</option>
              <option value="7db">Son 7 gün</option>
              <option value="30db">Son 30 gün</option>
              <option value="this_month">Bu ay</option>
              <option value="prev_month">Öncəki ay</option>
              <option value="this_year">Bu il</option>
              <option value="prev_year">Öncəki il</option>
            </select>
          )}

          {/* Custom Date Picker inputs */}
          <div className="flex items-center space-x-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-100 text-xs">
            <input 
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                setIsCustomDateActive(true);
              }}
              className="bg-transparent text-slate-700 font-bold focus:outline-none cursor-pointer"
            />
            <span className="text-slate-400 font-bold">-</span>
            <input 
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                setIsCustomDateActive(true);
              }}
              className="bg-transparent text-slate-700 font-bold focus:outline-none cursor-pointer"
            />
          </div>

          {/* Reset Filters Trigger button */}
          {(isCustomDateActive || timePreset !== "30db") && (
            <button
              onClick={handleResetFilters}
              title="Filtrləri sıfırla"
              className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors p-2.5 rounded-xl text-xs font-bold"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <BiMissingExpensesImpact />

      {/* 2. Interactive Nested BI Sub-Navigation menu tabs layout */}
      <div className="flex bg-slate-100/80 max-w-full overflow-x-auto p-1.5 rounded-2xl gap-1 text-xs font-bold scrollbar-none whitespace-nowrap">
        {[
          { id: "executive", label: "İcra Paneli", icon: BarChart3 },
          { id: "sales", label: "Satış & Mənfəət", icon: TrendingUp },
          { id: "products", label: "Məhsul & Xərc", icon: Layers },
          { id: "customers", label: "Müştəri & Region", icon: Users },
          { id: "marketing", label: "Reklam Optimizasiyası", icon: Target },
          { id: "forecast", label: "AI Proqnozlaşdırma", icon: Calendar },
          { id: "ai", label: "AI Söhbət Agent", icon: Bot },
          { id: "export", label: "Hesabat & İxrac", icon: ClipboardList },
          { id: "performance", label: "Performans (D3)", icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const style = isActive 
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
            : "text-slate-550 hover:bg-slate-200/50 hover:text-slate-800";
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as BIActiveTab)}
              className={`px-4 py-2.5 rounded-xl transition-all duration-200 select-none flex items-center gap-1.5 cursor-pointer ${style}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Nested tab routing content viewport */}
      <div className="transition-opacity duration-300">
        
        {activeTab === "executive" && (
          <BiExecutiveDashboard 
            metrics={currentMetrics}
            prevMetrics={prevMetrics}
            periodLabel={labelCurrent}
            prevLabel={labelPrevious}
            onRefresh={handleResetFilters}
            isLoading={false}
          />
        )}

        {activeTab === "sales" && (
          <BiSalesProfitAnalytics 
            sales={sales}
            products={products}
          />
        )}

        {activeTab === "products" && (
          <BiProductCostAnalytics 
            sales={sales}
            products={products}
            expenses={expenses}
          />
        )}

        {activeTab === "customers" && (
          <BiCustomerAnalytics 
            customers={customers}
            sales={sales}
            settings={settings}
          />
        )}

        {activeTab === "marketing" && (
          <BiMarketingAnalytics 
            sales={sales}
            expenses={expenses}
            products={products}
          />
        )}

        {activeTab === "forecast" && (
          <BiForecastingRoom 
            sales={sales}
          />
        )}

        {activeTab === "ai" && (
          <BiChatAgent 
            sales={sales}
            products={products}
            customers={customers}
            expenses={expenses}
          />
        )}

        {activeTab === "export" && (
          <BiReportGenerator 
            sales={sales}
            expenses={expenses}
            products={products}
            customers={customers}
          />
        )}

        {activeTab === "performance" && (
          <BiCourierPerformance sales={sales} />
        )}

      </div>

    </div>
  );
}
