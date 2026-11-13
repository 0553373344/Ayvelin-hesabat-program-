import React, { useMemo, useState } from "react";
import { Sale, Product, Expense } from "../../types";
import { performAbcAnalysis, AbcProductItem } from "../../utils/biCalculations";
import { formatCurrency } from "../../utils/xlsEngine";
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import SafeResponsiveContainer from "../SafeResponsiveContainer";
import { Layers, HelpCircle, ArrowDown, ArrowUp, DollarSign, Activity, ShoppingBag, Eye, Trash2, Megaphone } from "lucide-react";

interface BiProductCostAnalyticsProps {
  sales: Sale[];
  products: Product[];
  expenses: Expense[];
}

const COLORS = ["#4f46e5", "#10b981", "#3b82f6", "#f59e0b", "#9333ea", "#f43f5e", "#14b8a6", "#64748b"];

export default function BiProductCostAnalytics({ sales, products, expenses }: BiProductCostAnalyticsProps) {
  const [abcFilter, setAbcFilter] = useState<"ALL" | "A" | "B" | "C">("ALL");
  const [productSortKey, setProductSortKey] = useState<"qtySold" | "revenue" | "profit">("qtySold");

  // Perform full ABC analysis over dataset
  const abcList = useMemo(() => {
    return performAbcAnalysis(sales, products);
  }, [sales, products]);

  // Sort and filter the ABC list
  const filteredAbcList = useMemo(() => {
    let list = [...abcList];
    if (abcFilter !== "ALL") {
      list = list.filter((item) => item.abcClass === abcFilter);
    }
    list.sort((a, b) => b[productSortKey] - a[productSortKey]);
    return list;
  }, [abcList, abcFilter, productSortKey]);

  // Weak/Worst performers selection (C group items with zero or extremely low sales)
  const weakProducts = useMemo(() => {
    const sortedRising = [...abcList].sort((a, b) => a.qtySold - b.qtySold);
    return sortedRising.slice(0, 5); // Worst 5
  }, [abcList]);

  // Aggregate expenses by category
  const expenseChartData = useMemo(() => {
    const map: Record<string, number> = {
      "Reklam": 0,
      "Maaş": 0,
      "Kargo": 0,
      "Ofis": 0,
      "Digər": 0,
    };

    // Include other expenses from manual inputs
    expenses.forEach((e) => {
      if (e.amount <= 0) return;
      let cat = e.category || "Digər";
      // Map to standardized category names
      const lower = cat.toLowerCase();
      if (lower.includes("reklam") || lower.includes("marketing") || lower.includes("ads")) {
        cat = "Reklam";
      } else if (lower.includes("maaş") || lower.includes("maas") || lower.includes("salary")) {
        cat = "Maaş";
      } else if (lower.includes("kargo") || lower.includes("delivery") || lower.includes("çatdırılma") || lower.includes("kuryer")) {
        cat = "Kargo";
      } else if (lower.includes("ofis") || lower.includes("office") || lower.includes("kirayə") || lower.includes("icarə")) {
        cat = "Ofis";
      } else {
        cat = "Digər";
      }
      map[cat] = (map[cat] || 0) + e.amount;
    });

    // Also inject delivery costs of delivered orders into the "Kargo" category
    sales.filter((s) => s.status === "çatdırılıb").forEach((s) => {
      map["Kargo"] += s.deliveryCost;
    });

    // COGS can also be computed as an optional stack slice, but we focus on operational expenses here
    return Object.entries(map).map(([name, value]) => ({ name, value })).filter((item) => item.value > 0);
  }, [expenses, sales]);

  // AI Automatic Recommendations for items in worst performance bracket
  const getAiProductRec = (item: AbcProductItem) => {
    if (item.qtySold === 0) {
      return {
        action: "STOKDAN ÇIXARMAQ",
        color: "text-rose-600 bg-rose-50 border-rose-100",
        tip: "Məhsulun heç bir dövriyyəsi yoxdur. Anbarda yer tutmaması və maya yükünə çevrilməməsi üçün satışı rəsmən dayandırılmalı və ya təmizlənmə kampaniyası keçirilməlidir.",
      };
    }
    if (item.profit < 0) {
      return {
        action: "REKLAMI DAYANDIR",
        color: "text-amber-600 bg-amber-50 border-amber-100",
        tip: "Məhsul zərər gətirir (qiymətləndirmə maya və logistika xərclərini ödəmir). Satış qiyməti artırılmalı ya da xüsusi reklam xərcləri dərhal səfərbər olunmalıdır.",
      };
    }
    return {
      action: "REKLAMI ARTIR",
      color: "text-indigo-600 bg-indigo-50 border-indigo-100",
      tip: "Satış həcmi zəifdir lakin gəlirlilik pozitivdir. ROI-ni artırmaq üçün sınaq müddətli xüsusi Instagram kampaniyaları təyin edilməlidir.",
    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* ABC and Product Performance Grid */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5Click">
              <Layers className="w-4 h-4 text-indigo-600" /> Məhsul Portfeli Analitiki (ABC Analizi)
            </h3>
            <p className="text-[10px] text-slate-400">Şirkət dövriyyə təminatına görə qruplaşma: A (80%), B (15%), C (5%)</p>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            {/* Filter class */}
            <div className="flex bg-slate-150 rounded-xl p-0.5">
              {(["ALL", "A", "B", "C"] as const).map((cls) => (
                <button
                  key={cls}
                  onClick={() => setAbcFilter(cls)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] ${abcFilter === cls ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {cls === "ALL" ? "Hamısı" : `${cls} Sinfi`}
                </button>
              ))}
            </div>

            {/* Sort Order */}
            <select
              value={productSortKey}
              onChange={(e) => setProductSortKey(e.target.value as any)}
              className="bg-slate-50 border border-slate-100 text-[10px] p-2 rounded-xl focus:outline-none"
            >
              <option value="qtySold">Satış sayına görə</option>
              <option value="revenue">Dövriyyəyə görə</option>
              <option value="profit">Mənfəətə görə</option>
            </select>
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto pr-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400">
                <th className="py-2.5 font-bold uppercase tracking-wider text-[9px]">Məhsul</th>
                <th className="py-2.5 font-bold uppercase tracking-wider text-[9px] text-center">Sinif</th>
                <th className="py-2.5 font-bold uppercase tracking-wider text-[9px] text-right">Satış Sayı</th>
                <th className="py-2.5 font-bold uppercase tracking-wider text-[9px] text-right">Ümumi Gəlir</th>
                <th className="py-2.5 font-bold uppercase tracking-wider text-[9px] text-right">Xalis Qazanc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAbcList.map((item, idx) => {
                const badgeColor = item.abcClass === "A" 
                  ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
                  : item.abcClass === "B"
                  ? "bg-indigo-500/10 text-indigo-700 border-indigo-200"
                  : "bg-slate-500/10 text-slate-700 border-slate-200";

                return (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5">
                      <p className="font-bold text-slate-800 line-clamp-1">{item.name}</p>
                      <span className="text-[10px] text-slate-400 font-mono">SKU: {item.sku} | {item.category}</span>
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-lg border text-[9px] font-black ${badgeColor}`}>
                        {item.abcClass}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-700">{item.qtySold} ədəd</td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-800">{formatCurrency(item.revenue)}</td>
                    <td className="py-2.5 text-right font-mono font-semibold text-emerald-600">
                      {item.profit < 0 ? (
                        <span className="text-rose-500">-{formatCurrency(Math.abs(item.profit))}</span>
                      ) : (
                        formatCurrency(item.profit)
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredAbcList.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">Məlumat tapılmadı.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weak Products Analyzer and Cost Chart */}
      <div className="space-y-6">
        
        {/* Module 1: Weak Performers (Ən zəif Məhsullar) */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-indigo-600" /> Ən Zəif Performans Məhsulları
            </h3>
            <p className="text-[10px] text-slate-400">Biznes zəiflikləri və avtomatik tövsiyə kartları</p>
          </div>

          <div className="space-y-3.5 my-2 max-h-[300px] overflow-y-auto pr-1">
            {weakProducts.map((p, idx) => {
              const rec = getAiProductRec(p);
              return (
                <div key={idx} className="p-3.5 bg-slate-50/55 rounded-xl border border-slate-100 space-y-2 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 line-clamp-1">{p.name}</h4>
                      <div className="flex gap-2 text-[9px] text-slate-400 font-mono mt-0.5">
                        <span>Satılıb: {p.qtySold} ədəd</span>
                        <span>Mənfəət: {formatCurrency(p.profit)}</span>
                      </div>
                    </div>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${rec.color}`}>
                      {rec.action}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-550 leading-relaxed italic">{rec.tip}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Module 2: Cost Breakdowns */}
        <div className="bg-white rounded-[24px] border border-[#E9EFF6] p-6 space-y-4 shadow-[0_8px_24px_rgba(233,239,246,0.4)]">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-heading">
              <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
                <Megaphone className="w-4 h-4" />
              </div>
              <span className="text-[#1A1F2E]">Əməliyyat Xərc Bölgüsü</span>
            </h3>
            <p className="text-[10px] text-zinc-400 mt-1">Logistika, marketinq, ofis və digər dövr xərcləri</p>
          </div>

          <div className="h-[200px] w-full text-xs relative min-h-0 min-w-0">
            {expenseChartData.length === 0 ? (
               <div className="flex h-full items-center justify-center text-slate-400 italic">Cari dövr daxili xərc verisi yoxdur.</div>
            ) : (
              <SafeResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {expenseChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#fff", 
                      border: "1px solid #E9EFF6", 
                      borderRadius: "12px",
                      boxShadow: "0 8px 20px rgba(26, 31, 46, 0.08)",
                      fontSize: "11px"
                    }}
                    formatter={(value) => [formatCurrency(Number(value)), "Məbləğ"]} 
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "9px" }} />
                </PieChart>
              </SafeResponsiveContainer>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
