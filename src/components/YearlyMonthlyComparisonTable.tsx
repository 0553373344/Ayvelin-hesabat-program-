import React, { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import { Sale, Product } from "../types";
import { getOrderReportingDate } from "../utils/orderFormatter";
import { formatCurrency } from "../utils/xlsEngine";
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download, 
  Printer, 
  Copy, 
  Check, 
  Sparkles, 
  FileSpreadsheet, 
  BarChart3, 
  Filter, 
  Layers, 
  DollarSign, 
  CheckCircle2, 
  HelpCircle,
  ShoppingBag,
  Percent
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from "recharts";
import SafeResponsiveContainer from "./SafeResponsiveContainer";

const MONTH_NAMES = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", 
  "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"
];

interface YearlyMonthlyComparisonTableProps {
  title?: string;
  showChart?: boolean;
}

export default React.memo(function YearlyMonthlyComparisonTable({ 
  title = "İlin Aylarına Göre Satış və Ötən İllə Müqayisə Cədvəli", 
  showChart = true 
}: YearlyMonthlyComparisonTableProps) {
  const { sales, products } = useData();

  const currentCalendarYear = new Date().getFullYear();
  
  // States
  const [selectedYear, setSelectedYear] = useState<number>(currentCalendarYear);
  const [statusFilter, setStatusFilter] = useState<"all" | "delivered">("delivered");
  const [viewMode, setViewMode] = useState<"table_chart" | "table_only" | "chart_only">("table_chart");
  const [copied, setCopied] = useState(false);

  const compareYear = selectedYear - 1;

  // Available years extracted dynamically from sales data + default bounds
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([currentCalendarYear, currentCalendarYear - 1, currentCalendarYear - 2]);
    sales.forEach((s) => {
      const d = new Date(getOrderReportingDate(s));
      if (!isNaN(d.getFullYear())) {
        yearsSet.add(d.getFullYear());
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [sales, currentCalendarYear]);

  // Filter sales based on status
  const filteredSales = useMemo(() => {
    if (statusFilter === "delivered") {
      return sales.filter((s) => s.status === "çatdırılıb");
    }
    return sales;
  }, [sales, statusFilter]);

  // COGS helper for profit calculation
  const getSaleProfit = (s: Sale): number => {
    let cogs = 0;
    if (s.items && Array.isArray(s.items)) {
      s.items.forEach((it) => {
        const prod = products.find((p) => p.id === it.productId);
        const cost = prod?.costPrice ?? prod?.price * 0.4 ?? it.unitPrice * 0.4;
        cogs += (it.qty || 1) * cost;
      });
    }
    return s.totalAmount - (s.deliveryCost || 0) - cogs;
  };

  // Main calculations grouped by 12 months
  const monthlyComparison = useMemo(() => {
    const rows = MONTH_NAMES.map((monthName, index) => ({
      monthIndex: index,
      monthName,
      // Selected Year Metrics
      currSales: 0,
      currOrders: 0,
      currProfit: 0,
      // Compare Year Metrics
      prevSales: 0,
      prevOrders: 0,
      prevProfit: 0,
    }));

    filteredSales.forEach((s) => {
      const dateObj = new Date(getOrderReportingDate(s));
      if (isNaN(dateObj.getTime())) return;

      const year = dateObj.getFullYear();
      const monthIdx = dateObj.getMonth();

      if (monthIdx >= 0 && monthIdx < 12) {
        if (year === selectedYear) {
          rows[monthIdx].currSales += s.totalAmount || 0;
          rows[monthIdx].currOrders += 1;
          rows[monthIdx].currProfit += getSaleProfit(s);
        } else if (year === compareYear) {
          rows[monthIdx].prevSales += s.totalAmount || 0;
          rows[monthIdx].prevOrders += 1;
          rows[monthIdx].prevProfit += getSaleProfit(s);
        }
      }
    });

    // Compute differences & percentages
    return rows.map((r) => {
      const diffSales = r.currSales - r.prevSales;
      const growthPct = r.prevSales > 0 ? (diffSales / r.prevSales) * 100 : (r.currSales > 0 ? 100 : 0);
      
      const diffOrders = r.currOrders - r.prevOrders;
      const orderGrowthPct = r.prevOrders > 0 ? (diffOrders / r.prevOrders) * 100 : (r.currOrders > 0 ? 100 : 0);

      const diffProfit = r.currProfit - r.prevProfit;
      const profitGrowthPct = r.prevProfit > 0 ? (diffProfit / r.prevProfit) * 100 : (r.currProfit > 0 ? 100 : 0);

      const currAov = r.currOrders > 0 ? r.currSales / r.currOrders : 0;
      const prevAov = r.prevOrders > 0 ? r.prevSales / r.prevOrders : 0;

      return {
        ...r,
        diffSales,
        growthPct,
        diffOrders,
        orderGrowthPct,
        diffProfit,
        profitGrowthPct,
        currAov,
        prevAov
      };
    });
  }, [filteredSales, selectedYear, compareYear, products]);

  // Yearly totals summary
  const totals = useMemo(() => {
    let currSales = 0;
    let currOrders = 0;
    let currProfit = 0;

    let prevSales = 0;
    let prevOrders = 0;
    let prevProfit = 0;

    monthlyComparison.forEach((m) => {
      currSales += m.currSales;
      currOrders += m.currOrders;
      currProfit += m.currProfit;

      prevSales += m.prevSales;
      prevOrders += m.prevOrders;
      prevProfit += m.prevProfit;
    });

    const diffSales = currSales - prevSales;
    const growthPct = prevSales > 0 ? (diffSales / prevSales) * 100 : (currSales > 0 ? 100 : 0);

    const diffOrders = currOrders - prevOrders;
    const orderGrowthPct = prevOrders > 0 ? (diffOrders / prevOrders) * 100 : (currOrders > 0 ? 100 : 0);

    const diffProfit = currProfit - prevProfit;
    const profitGrowthPct = prevProfit > 0 ? (diffProfit / prevProfit) * 100 : (currProfit > 0 ? 100 : 0);

    const currAov = currOrders > 0 ? currSales / currOrders : 0;
    const prevAov = prevOrders > 0 ? prevSales / prevOrders : 0;

    return {
      currSales,
      currOrders,
      currProfit,
      prevSales,
      prevOrders,
      prevProfit,
      diffSales,
      growthPct,
      diffOrders,
      orderGrowthPct,
      diffProfit,
      profitGrowthPct,
      currAov,
      prevAov
    };
  }, [monthlyComparison]);

  // Chart dataset
  const chartData = useMemo(() => {
    return monthlyComparison.map((m) => ({
      month: m.monthName,
      [`${selectedYear} Satış`]: Math.round(m.currSales),
      [`${compareYear} Satış`]: Math.round(m.prevSales),
      [`${selectedYear} Mənfəət`]: Math.round(m.currProfit),
      [`${compareYear} Mənfəət`]: Math.round(m.prevProfit),
    }));
  }, [monthlyComparison, selectedYear, compareYear]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      "Ay",
      `${selectedYear} Satış (AZN)`,
      `${compareYear} Satış (AZN)`,
      "Gəlir Fərqi (AZN)",
      "Gəlir Böyüməsi (%)",
      `${selectedYear} Sifariş`,
      `${compareYear} Sifariş`,
      `${selectedYear} Mənfəət (AZN)`,
      `${compareYear} Mənfəət (AZN)`
    ];

    const rows = monthlyComparison.map((m) => [
      m.monthName,
      m.currSales.toFixed(2),
      m.prevSales.toFixed(2),
      m.diffSales.toFixed(2),
      m.growthPct.toFixed(1) + "%",
      m.currOrders,
      m.prevOrders,
      m.currProfit.toFixed(2),
      m.prevProfit.toFixed(2)
    ]);

    rows.push([
      "İLLİK YEKUN (TOTAL)",
      totals.currSales.toFixed(2),
      totals.prevSales.toFixed(2),
      totals.diffSales.toFixed(2),
      totals.growthPct.toFixed(1) + "%",
      totals.currOrders,
      totals.prevOrders,
      totals.currProfit.toFixed(2),
      totals.prevProfit.toFixed(2)
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Ayliq_Satis_Muqayisesi_${selectedYear}_vs_${compareYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy to clipboard formatted TSV
  const handleCopyTable = () => {
    let tsv = `Ay\t${selectedYear} Satış (₼)\t${compareYear} Satış (₼)\tFərq (₼)\tBöyümə (%)\t${selectedYear} Sifariş\t${compareYear} Sifariş\t${selectedYear} Mənfəət (₼)\n`;
    monthlyComparison.forEach((m) => {
      tsv += `${m.monthName}\t${m.currSales.toFixed(2)}\t${m.prevSales.toFixed(2)}\t${m.diffSales.toFixed(2)}\t${m.growthPct.toFixed(1)}%\t${m.currOrders}\t${m.prevOrders}\t${m.currProfit.toFixed(2)}\n`;
    });
    tsv += `YEKUN\t${totals.currSales.toFixed(2)}\t${totals.prevSales.toFixed(2)}\t${totals.diffSales.toFixed(2)}\t${totals.growthPct.toFixed(1)}%\t${totals.currOrders}\t${totals.prevOrders}\t${totals.currProfit.toFixed(2)}\n`;

    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Print table
  const handlePrint = () => {
    window.print();
  };

  // Find peak and drop months
  const sortedByGrowth = [...monthlyComparison].sort((a, b) => b.growthPct - a.growthPct);
  const bestMonth = sortedByGrowth[0];
  const lowestMonth = sortedByGrowth[sortedByGrowth.length - 1];

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      
      {/* Header & Controls Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-150 px-3 py-1 rounded-full text-xs font-bold text-indigo-700">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>Aylıq & İllik Müqayisə Paneli (YoY)</span>
          </div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">{title}</h2>
          <p className="text-xs text-slate-500 font-medium">
            {selectedYear}-ci ilin bütün ayları üzrə satış göstəriciləri və {compareYear}-ci ilin eyni ayları ilə dinamik müqayisəsi
          </p>
        </div>

        {/* Toolbar Action Items */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Year Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <span className="text-slate-500 pl-2 text-[11px] uppercase tracking-wider">İl:</span>
            {availableYears.map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  selectedYear === yr
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-700 hover:bg-slate-200/60"
                }`}
              >
                {yr} vs {yr - 1}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setStatusFilter("delivered")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                statusFilter === "delivered"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              Çatdırılanlar
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              Bütün Sifarişlər
            </button>
          </div>

          {/* View Toggles */}
          {showChart && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setViewMode("table_chart")}
                className={`px-2.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                  viewMode === "table_chart" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"
                }`}
                title="Cədvəl + Qrafik"
              >
                Cədvəl & Qrafik
              </button>
              <button
                onClick={() => setViewMode("table_only")}
                className={`px-2.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                  viewMode === "table_only" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500"
                }`}
                title="Ancaq Cədvəl"
              >
                Cədvəl
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCSV}
              className="p-2.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 text-slate-700 rounded-xl transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Excel (CSV) yüklə"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            <button
              onClick={handleCopyTable}
              className="p-2.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-slate-700 rounded-xl transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Cədvəli kopyala"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="hidden sm:inline text-emerald-700">Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-indigo-600" />
                  <span className="hidden sm:inline">Kopyala</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Çap et"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">Çap</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Selected Year Total Sales */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-4 rounded-2xl shadow-xs space-y-1">
          <div className="flex justify-between items-center text-indigo-200 text-[11px] font-bold">
            <span>{selectedYear} Ümumi Satış</span>
            <DollarSign className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-xl font-black">{formatCurrency(totals.currSales)}</p>
          <div className="flex items-center gap-1 text-[10px] text-indigo-300">
            <span>{totals.currOrders} sifariş</span>
            <span>•</span>
            <span>Orta Çek: {formatCurrency(totals.currAov)}</span>
          </div>
        </div>

        {/* Card 2: Compare Year Total Sales */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold">
            <span>{compareYear} Ümumi Satış</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-black text-slate-800">{formatCurrency(totals.prevSales)}</p>
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <span>{totals.prevOrders} sifariş</span>
            <span>•</span>
            <span>Orta Çek: {formatCurrency(totals.prevAov)}</span>
          </div>
        </div>

        {/* Card 3: Difference in Sales */}
        <div className={`p-4 rounded-2xl border shadow-xs space-y-1 ${
          totals.diffSales >= 0 
            ? "bg-emerald-50/60 border-emerald-200 text-emerald-950" 
            : "bg-rose-50/60 border-rose-200 text-rose-950"
        }`}>
          <div className="flex justify-between items-center text-[11px] font-bold">
            <span className={totals.diffSales >= 0 ? "text-emerald-800" : "text-rose-800"}>Gəlir Fərqi (YoY)</span>
            {totals.diffSales >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-600" />
            )}
          </div>
          <p className="text-xl font-black">
            {totals.diffSales >= 0 ? `+${formatCurrency(totals.diffSales)}` : formatCurrency(totals.diffSales)}
          </p>
          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-white/80 border border-current">
            {totals.growthPct >= 0 ? (
              <>
                <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                <span className="text-emerald-700">+{totals.growthPct.toFixed(1)}% Artım</span>
              </>
            ) : (
              <>
                <ArrowDownRight className="w-3 h-3 text-rose-600" />
                <span className="text-rose-700">{totals.growthPct.toFixed(1)}% Azalma</span>
              </>
            )}
          </div>
        </div>

        {/* Card 4: Profit Comparison */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <div className="flex justify-between items-center text-slate-500 text-[11px] font-bold">
            <span>{selectedYear} vs {compareYear} Xalis Mənfəət</span>
            <Percent className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-slate-900">{formatCurrency(totals.currProfit)}</p>
          <p className="text-[10px] text-slate-500 font-medium">
            Ötən il: <span className="font-bold">{formatCurrency(totals.prevProfit)}</span> ({totals.profitGrowthPct >= 0 ? `+${totals.profitGrowthPct.toFixed(1)}%` : `${totals.profitGrowthPct.toFixed(1)}%`})
          </p>
        </div>
      </div>

      {/* Chart Section */}
      {(viewMode === "table_chart" || viewMode === "chart_only") && (
        <div className="bg-slate-50/50 border border-slate-200 p-5 rounded-2xl space-y-3">
          <div className="flex justify-between items-center border-b border-slate-200/80 pb-2.5">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>Aylıq Satış Müqayisəsi Vizual Qrafiki ({selectedYear} vs {compareYear})</span>
            </h3>
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
              Bar Chart (AZN)
            </span>
          </div>

          <div className="h-64 w-full min-h-0 min-w-0">
            <SafeResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" fontSize={11} stroke="#64748B" tickLine={false} />
                <YAxis fontSize={10} stroke="#64748B" tickFormatter={(v) => `${v}₼`} axisLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "#fff", 
                    borderRadius: "12px", 
                    border: "1px solid #CBD5E1", 
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                    fontSize: "12px"
                  }}
                  formatter={(val) => [`${formatCurrency(Number(val))}`]}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                <Bar isAnimationActive={false} dataKey={`${selectedYear} Satış`} fill="#4f46e5" radius={[6, 6, 0, 0]} />
                <Bar isAnimationActive={false} dataKey={`${compareYear} Satış`} fill="#cbd5e1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </SafeResponsiveContainer>
          </div>
        </div>
      )}

      {/* Main Single Comparison Table */}
      {(viewMode === "table_chart" || viewMode === "table_only") && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <th className="py-3.5 px-4 sticky left-0 bg-slate-900 z-10">Ay</th>
                  <th className="py-3.5 px-4 text-right bg-indigo-950/80 text-indigo-200 border-l border-slate-800">
                    {selectedYear} Satış (AZN)
                  </th>
                  <th className="py-3.5 px-4 text-right border-l border-slate-800">
                    {compareYear} Satış (AZN)
                  </th>
                  <th className="py-3.5 px-4 text-right border-l border-slate-800">
                    Gəlir Fərqi (₼)
                  </th>
                  <th className="py-3.5 px-4 text-center border-l border-slate-800">
                    Böyümə (%)
                  </th>
                  <th className="py-3.5 px-4 text-center border-l border-slate-800">
                    Sifariş Sayı ({selectedYear} / {compareYear})
                  </th>
                  <th className="py-3.5 px-4 text-right border-l border-slate-800">
                    {selectedYear} Mənfəət (AZN)
                  </th>
                  <th className="py-3.5 px-4 text-right border-l border-slate-800">
                    {compareYear} Mənfəət (AZN)
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {monthlyComparison.map((m) => {
                  const isPositive = m.diffSales >= 0;
                  const isZero = m.currSales === 0 && m.prevSales === 0;

                  return (
                    <tr 
                      key={m.monthIndex} 
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Month Name */}
                      <td className="py-3 px-4 font-bold text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 transition-colors flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        <span>{m.monthName}</span>
                      </td>

                      {/* Selected Year Sales */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-indigo-950 bg-indigo-50/30">
                        {formatCurrency(m.currSales)}
                      </td>

                      {/* Compare Year Sales */}
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {formatCurrency(m.prevSales)}
                      </td>

                      {/* Difference in AZN */}
                      <td className={`py-3 px-4 text-right font-mono font-bold ${
                        isZero ? "text-slate-400" : isPositive ? "text-emerald-700" : "text-rose-700"
                      }`}>
                        {isZero ? "0.00 ₼" : isPositive ? `+${formatCurrency(m.diffSales)}` : formatCurrency(m.diffSales)}
                      </td>

                      {/* Growth Percentage Badge */}
                      <td className="py-3 px-4 text-center">
                        {isZero ? (
                          <span className="text-slate-400 text-[10px] font-mono">-</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                            isPositive 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}>
                            {isPositive ? (
                              <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3 text-rose-600" />
                            )}
                            <span>{isPositive ? `+${m.growthPct.toFixed(1)}%` : `${m.growthPct.toFixed(1)}%`}</span>
                          </span>
                        )}
                      </td>

                      {/* Orders Count Comparison */}
                      <td className="py-3 px-4 text-center font-mono text-xs">
                        <span className="font-bold text-indigo-900">{m.currOrders}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-slate-500">{m.prevOrders}</span>
                        <span className="text-[10px] text-slate-400 ml-1">ədəd</span>
                      </td>

                      {/* Selected Year Profit */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-800">
                        {formatCurrency(m.currProfit)}
                      </td>

                      {/* Compare Year Profit */}
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {formatCurrency(m.prevProfit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Total Summary Row */}
              <tfoot>
                <tr className="bg-slate-900 text-white font-extrabold text-xs border-t-2 border-slate-800">
                  <td className="py-4 px-4 sticky left-0 bg-slate-900 uppercase tracking-wider text-indigo-300">
                    İLLİK YEKUN (TOTAL)
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-indigo-300 text-sm bg-indigo-950/90">
                    {formatCurrency(totals.currSales)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-slate-300">
                    {formatCurrency(totals.prevSales)}
                  </td>
                  <td className={`py-4 px-4 text-right font-mono text-sm ${
                    totals.diffSales >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {totals.diffSales >= 0 ? `+${formatCurrency(totals.diffSales)}` : formatCurrency(totals.diffSales)}
                  </td>
                  <td className="py-4 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black ${
                      totals.growthPct >= 0 ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                    }`}>
                      {totals.growthPct >= 0 ? `+${totals.growthPct.toFixed(1)}%` : `${totals.growthPct.toFixed(1)}%`}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center font-mono">
                    <span className="text-indigo-300">{totals.currOrders}</span> / <span className="text-slate-400">{totals.prevOrders}</span> ədəd
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-emerald-400">
                    {formatCurrency(totals.currProfit)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-slate-400">
                    {formatCurrency(totals.prevProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* AI Trend Summary Footer */}
      <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl flex items-start gap-3">
        <div className="p-2 bg-indigo-600 text-white rounded-xl shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="space-y-1 text-xs">
          <h4 className="font-extrabold text-slate-900">İllik Satış Trendi və Müqayisə Rəyi</h4>
          <p className="text-slate-700 leading-relaxed">
            {selectedYear}-ci ildə ümumi satış həcmi <span className="font-bold text-indigo-900">{formatCurrency(totals.currSales)}</span> təşkil etmişdir ({compareYear}-ci illə müqayisədə <span className="font-bold text-emerald-700">{totals.growthPct >= 0 ? `+${totals.growthPct.toFixed(1)}% artım` : `${totals.growthPct.toFixed(1)}% azalma`}</span>).
            {bestMonth && bestMonth.currSales > 0 && (
              <> Ən yüksək nisbi artım göstərən ay <span className="font-bold">{bestMonth.monthName}</span> ayıdır ({bestMonth.growthPct >= 0 ? `+${bestMonth.growthPct.toFixed(1)}%` : `${bestMonth.growthPct.toFixed(1)}%`}).</>
            )}
          </p>
        </div>
      </div>

    </div>
  );
});
