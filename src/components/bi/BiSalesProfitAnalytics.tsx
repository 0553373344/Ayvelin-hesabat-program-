import React, { useMemo, useState } from "react";
import { Sale, Product } from "../../types";
import { formatCurrency } from "../../utils/xlsEngine";
import { getOrderReportingDate, getOrderReportingDateYMD, formatToBakuYMD } from "../../utils/orderFormatter";
import { 
  AreaChart, Area, LineChart, Line, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from "recharts";
import SafeResponsiveContainer from "../SafeResponsiveContainer";
import YearlyMonthlyComparisonTable from "../YearlyMonthlyComparisonTable";
import { TrendingUp, Percent, ArrowUpRight, ArrowDownRight, Layers, DollarSign, BookOpen } from "lucide-react";

interface BiSalesProfitAnalyticsProps {
  sales: Sale[];
  products: Product[];
}

export default function BiSalesProfitAnalytics({ sales, products }: BiSalesProfitAnalyticsProps) {
  const [chartType, setChartType] = useState<"daily" | "monthly" | "weekly" | "yoy">("daily");
  const [metricView, setMetricView] = useState<"sales" | "profit" | "both">("both");

  const deliveredSales = useMemo(() => {
    return sales.filter((s) => s.status === "çatdırılıb");
  }, [sales]);

  // Daily Trend calculation (last 31 days)
  const dailyData = useMemo(() => {
    const list: Record<string, { date: string; displayDate: string; Revenue: number; Profit: number }> = {};
    const today = new Date();

    for (let i = 30; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const key = formatToBakuYMD(d);
      const display = d.toLocaleDateString("az-AZ", { day: "2-digit", month: "short" });
      list[key] = { date: key, displayDate: display, Revenue: 0, Profit: 0 };
    }

    deliveredSales.forEach((s) => {
      const key = getOrderReportingDateYMD(s);
      if (list[key]) {
        list[key].Revenue += s.totalAmount;
        
        let cogs = 0;
        s.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const cost = prod?.costPrice ?? prod?.price * 0.4 ?? it.unitPrice * 0.4;
          cogs += it.qty * cost;
        });

        const profit = s.totalAmount - s.deliveryCost - cogs;
        list[key].Profit += profit;
      }
    });

    return Object.values(list).sort((a, b) => a.date.localeCompare(b.date));
  }, [deliveredSales, products]);

  // Weekly Trend calculation (last 12 weeks)
  const weeklyData = useMemo(() => {
    const list: Record<string, { date: string; displayDate: string; Revenue: number; Profit: number }> = {};
    const today = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i * 7);
      const key = `W-${i}`;
      const display = `${i === 0 ? "Cari həftə" : `${i} həftə əvvəl`}`;
      list[key] = { date: key, displayDate: display, Revenue: 0, Profit: 0 };
    }

    deliveredSales.forEach((s) => {
      const saleDate = new Date(getOrderReportingDate(s));
      const diffTime = Math.abs(today.getTime() - saleDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const weekIndex = Math.floor(diffDays / 7);

      if (weekIndex <= 11) {
        const key = `W-${weekIndex}`;
        if (list[key]) {
          list[key].Revenue += s.totalAmount;

          let cogs = 0;
          s.items.forEach((it) => {
            const prod = products.find((p) => p.id === it.productId);
            const cost = prod?.costPrice ?? prod?.price * 0.4 ?? it.unitPrice * 0.4;
            cogs += it.qty * cost;
          });

          list[key].Profit += s.totalAmount - s.deliveryCost - cogs;
        }
      }
    });

    return Object.values(list).reverse();
  }, [deliveredSales, products]);

  // Monthly Trend calculation (last 12 months)
  const monthlyData = useMemo(() => {
    const list: Record<string, { date: string; displayDate: string; Revenue: number; Profit: number }> = {};
    const today = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const display = d.toLocaleDateString("az-AZ", { month: "long", year: "2-digit" });
      list[key] = { date: key, displayDate: display, Revenue: 0, Profit: 0 };
    }

    deliveredSales.forEach((s) => {
      const d = new Date(getOrderReportingDate(s));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (list[key]) {
        list[key].Revenue += s.totalAmount;

        let cogs = 0;
        s.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const cost = prod?.costPrice ?? prod?.price * 0.4 ?? it.unitPrice * 0.4;
          cogs += it.qty * cost;
        });

        list[key].Profit += s.totalAmount - s.deliveryCost - cogs;
      }
    });

    return Object.values(list).sort((a, b) => a.date.localeCompare(b.date));
  }, [deliveredSales, products]);

  // Year-over-Year Comparative Monthly plot (e.g. 2025 vs 2026)
  const yoyData = useMemo(() => {
    const months = [
      "Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", 
      "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"
    ];

    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;

    const data = months.map((m, idx) => ({
      month: m,
      monthIndex: idx,
      [`Reys_${prevYear}`]: 0,
      [`Reys_${currentYear}`]: 0,
    }));

    deliveredSales.forEach((s) => {
      const d = new Date(getOrderReportingDate(s));
      const year = d.getFullYear();
      const monthIdx = d.getMonth();

      if (year === prevYear) {
        data[monthIdx][`Reys_${prevYear}`] += s.totalAmount;
      } else if (year === currentYear) {
        data[monthIdx][`Reys_${currentYear}`] += s.totalAmount;
      }
    });

    return data;
  }, [deliveredSales]);

  // Compute stats on profit margins and trend analysis narrative text
  const insights = useMemo(() => {
    if (deliveredSales.length === 0) return "Sistemdə hələlik kifayət qədər uğurlu sifariş məlumatı yoxdur.";

    // Sort to find peak and low days
    const days = [...dailyData];
    days.sort((a, b) => b.Revenue - a.Revenue);
    const peak = days[0];
    const low = days[days.length - 1];

    const totalRev = dailyData.reduce((sum, d) => sum + d.Revenue, 0);
    const totalProf = dailyData.reduce((sum, d) => sum + d.Profit, 0);
    const averageMargin = totalRev > 0 ? (totalProf / totalRev) * 100 : 0;

    const currentYearStr = new Date().getFullYear().toString();
    const prevYearStr = (new Date().getFullYear() - 1).toString();

    // Sum YoYs
    const currentYearSum = yoyData.reduce((sum, d) => sum + (d[`Reys_${currentYearStr}`] || 0), 0);
    const prevYearSum = yoyData.reduce((sum, d) => sum + (d[`Reys_${prevYearStr}`] || 0), 0);
    const yoyChange = prevYearSum > 0 ? ((currentYearSum - prevYearSum) / prevYearSum) * 100 : 0;

    let narrative = `Son 30 günün analiz icmalı üzrə orta mənfəət marjası **${averageMargin.toFixed(1)}%** səviyyəsində qərarlaşıb. `;
    if (peak && peak.Revenue > 0) {
      narrative += `Ən yüksək günlük satış sürəti **${peak.displayDate}** tarixində **${formatCurrency(peak.Revenue)}** həcmində qeydə alınmışdır. `;
    }

    if (currentYearSum > 0 && prevYearSum > 0) {
      if (yoyChange > 0) {
        narrative += `İllik müqayisədə (YoY), ${currentYearStr} ili üzrə ümumi gəlir ${prevYearStr} ili ilə müqayisədə **${yoyChange.toFixed(1)}% artım** nümayiş etdirir. Bu şirkət miqyasının uğurlu genişlənməsini sübut edir.`;
      } else {
        narrative += `İllik müqayisədə (YoY), ${currentYearStr} ili üzrə gəlirlər ${prevYearStr} ilinə nisbətən **${Math.abs(yoyChange).toFixed(1)}% eniş** göstərir. Reklam və CRM rıçaqları gücləndirilməlidir.`;
      }
    } else {
      narrative += "Kifayət qədər illik müqayisəli verilənlər toplandıqdan sonra biznes tərəqqisi avtopilot rejimində daha dərindən təhlil olunacaq.";
    }

    return narrative;
  }, [deliveredSales, dailyData, yoyData]);

  const activeChartData = useMemo(() => {
    if (chartType === "daily") return dailyData;
    if (chartType === "weekly") return weeklyData;
    return monthlyData;
  }, [chartType, dailyData, weeklyData, monthlyData]);

  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm">
      
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-50">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5ClassName">
            <TrendingUp className="w-4 h-4 text-indigo-600" /> Satış və Mənfəət Trendləri
          </h3>
          <p className="text-[10px] text-slate-400">Şirkətin gəlir dinamikası və təmiz qazanc analizatoru</p>
        </div>

        {/* Dynamic Controls Toggles */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button 
              onClick={() => setChartType("daily")}
              className={`px-3 py-1.5 rounded-lg select-none transition-all ${chartType === "daily" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Günlük
            </button>
            <button 
              onClick={() => setChartType("weekly")}
              className={`px-3 py-1.5 rounded-lg select-none transition-all ${chartType === "weekly" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Həftəlik
            </button>
            <button 
              onClick={() => setChartType("monthly")}
              className={`px-3 py-1.5 rounded-lg select-none transition-all ${chartType === "monthly" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Aylıq
            </button>
            <button 
              onClick={() => setChartType("yoy")}
              className={`px-3 py-1.5 rounded-lg select-none transition-all ${chartType === "yoy" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              İllik Müqayisə (YoY)
            </button>
          </div>

          {chartType !== "yoy" && (
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button 
                onClick={() => setMetricView("both")}
                className={`px-3 py-1.5 rounded-lg select-none transition-all ${metricView === "both" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Hər ikisi
              </button>
              <button 
                onClick={() => setMetricView("sales")}
                className={`px-3 py-1.5 rounded-lg select-none transition-all ${metricView === "sales" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Gəlir
              </button>
              <button 
                onClick={() => setMetricView("profit")}
                className={`px-3 py-1.5 rounded-lg select-none transition-all ${metricView === "profit" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Qazanc
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recharts Chart representation */}
      <div className="h-[320px] w-full text-xs font-mono relative min-h-0 min-w-0">
        {chartType === "yoy" ? (
          <SafeResponsiveContainer width="100%" height="100%">
            <BarChart data={yoyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} />
              <YAxis stroke="#94a3b8" fontSize={9} tickFormatter={(v) => `${v}₼`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey={`Reys_${prevYear}`} name={`${prevYear} Satışları`} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar dataKey={`Reys_${currentYear}`} name={`${currentYear} Satışları`} fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </SafeResponsiveContainer>
        ) : (
          <SafeResponsiveContainer width="100%" height="100%">
            <AreaChart data={activeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="displayDate" stroke="#94a3b8" fontSize={9} />
              <YAxis stroke="#94a3b8" fontSize={9} tickFormatter={(v) => `${v}₼`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              
              {(metricView === "sales" || metricView === "both") && (
                <Area 
                  type="monotone" 
                  dataKey="Revenue" 
                  name="Ümumi Gəlir (₼)" 
                  stroke="#6366f1" 
                  fillOpacity={1} 
                  fill="url(#salesGrad)" 
                  strokeWidth={2.5} 
                />
              )}

              {(metricView === "profit" || metricView === "both") && (
                <Area 
                  type="monotone" 
                  dataKey="Profit" 
                  name="Təmiz Mənfəət (₼)" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#profitGrad)" 
                  strokeWidth={2.5} 
                />
              )}
            </AreaChart>
          </SafeResponsiveContainer>
        )}
      </div>

      {/* AI automatically generated trend text matching prompt rule */}
      <div className="bg-indigo-50/45 border border-indigo-100/50 p-4 rounded-xl flex items-start space-x-3">
        <div className="bg-indigo-600 rounded-lg p-1.5 mt-0.5 shadow-sm text-white shrink-0 flex items-center justify-center">
          <BookOpen className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-800">AI Automatlaşdırılmış Trend Aşkar Etmə</h4>
          <p className="text-xs text-slate-650 leading-relaxed" dangerouslySetInnerHTML={{ __html: insights }} />
        </div>
      </div>

      {/* Single Yearly Monthly Sales Comparison Table requested by user */}
      <div className="pt-4 border-t border-slate-100">
        <YearlyMonthlyComparisonTable />
      </div>

    </div>
  );
}
