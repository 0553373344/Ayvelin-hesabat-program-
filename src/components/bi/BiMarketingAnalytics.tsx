import React, { useState, useMemo } from "react";
import { formatCurrency } from "../../utils/xlsEngine";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import SafeResponsiveContainer from "../SafeResponsiveContainer";
import { Target, DollarSign, ToggleLeft, ToggleRight, AlertCircle, Sparkles, TrendingUp, Info } from "lucide-react";
import { Sale, Expense, Product } from "../../types";

interface BiMarketingAnalyticsProps {
  sales: Sale[];
  expenses: Expense[];
  products: Product[];
}

export default function BiMarketingAnalytics({ sales, expenses, products }: BiMarketingAnalyticsProps) {
  // 1. Dynamic Extraction of Real "Reklam" category expenses from database
  const realAdExpenses = useMemo(() => {
    return expenses.filter(
      (e) => e.category === "Reklam" || (e.name && e.name.toLowerCase().includes("reklam"))
    );
  }, [expenses]);

  // Group real ad expenses matching Name to determine custom channels
  const realChannels = useMemo(() => {
    if (realAdExpenses.length === 0) return [];

    const groups: { [key: string]: number } = {};
    realAdExpenses.forEach((exp) => {
      const rawName = exp.name || "Digər Reklam";
      const name = rawName.trim().substring(0, 1).toUpperCase() + rawName.trim().substring(1);
      groups[name] = (groups[name] || 0) + exp.amount;
    });

    const totalSpend = Object.values(groups).reduce((acc, v) => acc + v, 0);

    // Calculate total completed revenue & COGS
    const completedSales = sales.filter((s) => s.status === "çatdırılıb");
    const totalRevenue = completedSales.reduce((acc, s) => acc + s.totalProductPrice, 0);

    const productCostMap: { [key: string]: number } = {};
    products.forEach((p) => {
      productCostMap[p.id] = p.costPrice || 0;
    });

    const totalCogs = completedSales.reduce((acc, s) => {
      let saleCogs = 0;
      if (s.items && Array.isArray(s.items)) {
        s.items.forEach((item) => {
          const cost = productCostMap[item.productId] || 0;
          saleCogs += item.qty * cost;
        });
      }
      return acc + saleCogs;
    }, 0);

    return Object.keys(groups).map((name) => {
      const spend = groups[name];
      const spendShare = totalSpend > 0 ? spend / totalSpend : 0;
      const revenue = totalRevenue * spendShare;
      const cogs = totalCogs * spendShare;
      // Estimate leads based on average typical cost representation
      const leads = Math.round(spend / 3.5) || 1;

      return {
        name,
        spend,
        revenue,
        leads,
        cogs,
      };
    });
  }, [realAdExpenses, sales, products]);

  // 2. Simulated baseline default settings to act as a strategy planning simulation if needed
  const [simulationChannels, setSimulationChannels] = useState([
    { name: "Meta Ads (Ssenari)", spend: 350, revenue: 1480, leads: 110, cogs: 590 },
    { name: "Instagram Sponsor (Ssenari)", spend: 400, revenue: 1980, leads: 145, cogs: 805 },
    { name: "TikTok Promo (Ssenari)", spend: 250, revenue: 850, leads: 95, cogs: 340 },
    { name: "Google Search (Ssenari)", spend: 500, revenue: 3100, leads: 180, cogs: 1140 },
  ]);

  // State: Use Real Data (default to true if real metrics exist, else default false with banner)
  const isRealDataAvailable = realChannels.length > 0;
  const [useRealData, setUseRealData] = useState<boolean>(isRealDataAvailable);

  const [activeTab, setActiveTab] = useState<number>(0);

  // Active dataset select
  const currentDataset = useMemo(() => {
    if (useRealData && isRealDataAvailable) {
      return realChannels;
    }
    return simulationChannels;
  }, [useRealData, isRealDataAvailable, realChannels, simulationChannels]);

  // Safe tab adjustment index bounds protector
  const safeActiveTab = activeTab >= currentDataset.length ? 0 : activeTab;

  // Compile calculations with financial ratios
  const calculatedChannels = useMemo(() => {
    return currentDataset.map((ch) => {
      const roas = ch.spend > 0 ? ch.revenue / ch.spend : 0;
      const profit = ch.revenue - ch.cogs - ch.spend;
      const roi = ch.spend > 0 ? (profit / ch.spend) * 100 : 0;
      const cac = ch.leads > 0 ? ch.spend / ch.leads : 0;
      return {
        ...ch,
        roas,
        roi,
        cac,
        profit,
      };
    });
  }, [currentDataset]);

  const totals = useMemo(() => {
    const totalSpend = calculatedChannels.reduce((sum, ch) => sum + ch.spend, 0);
    const totalRevenue = calculatedChannels.reduce((sum, ch) => sum + ch.revenue, 0);
    const totalProfit = calculatedChannels.reduce((sum, ch) => sum + ch.profit, 0);
    const averageRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const averageRoi = totalSpend > 0 ? (totalProfit / totalSpend) * 100 : 0;
    return {
      spend: totalSpend,
      revenue: totalRevenue,
      profit: totalProfit,
      roas: averageRoas,
      roi: averageRoi,
    };
  }, [calculatedChannels]);

  // Slider change triggers (permitted on Simulation mode only)
  const handleUpdate = (index: number, field: "spend" | "revenue" | "leads" | "cogs", value: number) => {
    if (useRealData && isRealDataAvailable) return; // Read-only for real database records
    const copy = [...simulationChannels];
    copy[index][field] = Math.max(0, value);
    setSimulationChannels(copy);
  };

  const activeChannel = calculatedChannels[safeActiveTab] || {
    name: "Məlumat yoxdur",
    spend: 0,
    revenue: 0,
    leads: 1,
    cogs: 0,
    roas: 0,
    roi: 0,
    cac: 0,
    profit: 0,
  };

  const getAiMarketingRecommendation = (name: string, roas: number, roi: number) => {
    if (roas < 1.0) {
      return `🛑 **Kritik Zərər**: Bu kanal zərər çəkir. Hər yatırılan xərc gəliri qarşılamır. Büdcəni tam saxlamaq üçün fəaliyyəti dayandırın və ya hədəfləri kəskin yeniləyin.`;
    }
    if (roas < 2.2) {
      return `🛑 **Zəif Səmərəlilik**: ${name} kanalının ROAS göstəricisi aşağıdır (${roas.toFixed(1)}x). Reklam kreativlərini yeniləyin və ya daha məhsuldar kanallara büdcə yönəldin.`;
    }
    if (roas < 4.0) {
      return `⚠️ **Orta Stabil Performans**: ${name} kanalı normal dövriyyə təmin edir (${roas.toFixed(1)}x ROAS). Büdcəni sabit saxlamaq məsləhətdir.`;
    }
    return `🚀 **Mükəmməl Performans**: ${name} kanalı böyük uğurla işləyir (${roas.toFixed(1)}x ROAS, ROI: ${roi.toFixed(0)}%). Müəssisənin inkişafı üçün bu kanalın büdcəsini dərhal **60%-dək artırın!**`;
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Data Validity Banner */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-1.5">
              <Target className="w-4 h-4 text-indigo-600" /> Mağaza Reklam & Kanal Analitikası
            </h3>
            {useRealData && isRealDataAvailable ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                <span>●</span> Canlı Məlumat bazası
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1">
                <span>●</span> Ssenari Simulyatoru
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Xərclər modulundakı <strong className="text-slate-600">"Reklam"</strong> kateqoriyalı qeydlərinizin uğurlu satışlardakı ROAS və ROI payını hesablayır.
          </p>
        </div>

        {/* Dynamic Mode Switcher */}
        {isRealDataAvailable && (
          <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 text-xs">
            <span className="text-[10px] text-slate-500 font-bold">Simulyator Mode</span>
            <button
              onClick={() => {
                setUseRealData(!useRealData);
                setActiveTab(0);
              }}
              className="text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {useRealData ? (
                <ToggleRight className="w-8 h-8 text-emerald-500" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-slate-400" />
              )}
            </button>
            <span className="text-[10px] text-slate-800 font-black">Canlı Analitika</span>
          </div>
        )}
      </div>

      {!isRealDataAvailable && (
        <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-100 flex items-start space-x-3 text-xs leading-relaxed text-amber-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-amber-900">Diqqət: Sistemdə "Reklam" kateqoriyalı heç bir real xərc qeydə alınmayıb!</p>
            <p className="text-slate-600">
              Uğurlu satışların və COGS-un real analizini görmək üçün <strong className="text-slate-800">"Xərclər"</strong> səhifəsinə keçib kateqoriyası <strong className="text-slate-800">"Reklam"</strong> olan xərclər (Məsələn: TikTok sponsor, Facebook Reklam, Vərəqə çapı) qeyd edin. Hazırda görünün datalar aşağıdakı <strong className="text-slate-850">"Ssenari Simulyatoru"</strong> vasitəsilə strateji planlaşdırma aparmağınız üçündür.
            </p>
          </div>
        </div>
      )}

      {/* Main Core Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Control Sidebar */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              📬 Reklam Kanalları Siyahısı
            </h3>
            <p className="text-[10px] text-slate-400">
              {useRealData && isRealDataAvailable ? "Həqiqi xərc qeydləri üzrə bölmələr" : "Ssenari üzrə tənzimlənə bilən test kanalları"}
            </p>
          </div>

          {/* List layout of channels */}
          <div className="space-y-2">
            {calculatedChannels.map((ch, idx) => (
              <div
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`p-3.5 rounded-xl border cursor-pointer select-none transition-all flex items-center justify-between ${
                  safeActiveTab === idx ? "border-indigo-200 bg-indigo-50/30" : "border-slate-50 hover:bg-slate-50/40"
                }`}
              >
                <div className="space-y-0.5">
                  <p className="text-xs font-black text-slate-800 truncate max-w-[140px]">{ch.name}</p>
                  <span className="text-[10px] text-slate-400 font-mono">Xərc: {formatCurrency(ch.spend)}</span>
                </div>
                <div className="text-right">
                  <span
                    className={`text-[10px] font-mono font-black ${
                      ch.roas >= 4.0 ? "text-emerald-600" : ch.roas >= 2.0 ? "text-amber-600" : "text-rose-500"
                    }`}
                  >
                    ROAS: {ch.roas.toFixed(1)}x
                  </span>
                  <p className="text-[8px] text-slate-400">P: {formatCurrency(ch.profit)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* SSliders Controls Panel - ONLY for strategy simulation fallback */}
          {(!useRealData || !isRealDataAvailable) && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3.5 mt-2">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <span>🛠️</span> Simulyator parametrləri
              </h4>
              <p className="text-[9px] text-slate-400">Ölçüləri redaktə edərək test edin:</p>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-450 font-bold block flex justify-between">
                  <span>Reklam Xərci</span>
                  <span className="font-mono text-slate-700">{formatCurrency(activeChannel.spend)}</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={2500}
                  step={50}
                  value={activeChannel.spend}
                  onChange={(e) => handleUpdate(safeActiveTab, "spend", Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-450 font-bold block flex justify-between">
                  <span>Gözlənilən Gəlir</span>
                  <span className="font-mono text-slate-705">{formatCurrency(activeChannel.revenue)}</span>
                </label>
                <input
                  type="range"
                  min={100}
                  max={12050}
                  step={100}
                  value={activeChannel.revenue}
                  onChange={(e) => handleUpdate(safeActiveTab, "revenue", Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-450 font-bold block flex justify-between">
                  <span>Məhsul maya dəyəri (COGS)</span>
                  <span className="font-mono text-slate-705">{formatCurrency(activeChannel.cogs)}</span>
                </label>
                <input
                  type="range"
                  min={50}
                  max={5000}
                  step={50}
                  value={activeChannel.cogs}
                  onChange={(e) => handleUpdate(safeActiveTab, "cogs", Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Interactive Analytics Display */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm flex flex-col justify-between">
          {/* Header overall KPI cards row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Ümumi Reklam</span>
              <p className="text-xs font-black text-slate-800 font-mono mt-0.5">{formatCurrency(totals.spend)}</p>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Uğurlu Satış</span>
              <p className="text-xs font-black text-slate-800 font-mono mt-0.5">{formatCurrency(totals.revenue)}</p>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block">Ümumi ROI %</span>
              <p className="text-xs font-black text-indigo-600 font-mono mt-0.5">{totals.roi.toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-450 block">Ümumi ROAS</span>
              <p className="text-xs font-black text-emerald-600 font-mono mt-0.5">{totals.roas.toFixed(1)}x</p>
            </div>
          </div>

          {/* Diagnostic results section */}
          <div className="space-y-3.5">
            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" /> "{activeChannel.name}" Detallı Göstəriciləri
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                <span className="text-[9px] text-slate-450 font-bold block bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md w-max">ROAS ÇARPANI</span>
                <span className="text-base font-black font-mono text-slate-800 block">{activeChannel.roas.toFixed(2)}x</span>
                <p className="text-[8px] text-slate-400">Hər reklam 1 AZN üçün mağazaya gələn ticarət gəliri.</p>
              </div>
              <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                <span className="text-[9px] text-slate-450 font-bold block bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md w-max">ROI GƏLİRLİLİK</span>
                <span className="text-base font-black font-mono text-slate-800 block">{activeChannel.roi.toFixed(0)}%</span>
                <p className="text-[8px] text-slate-400">Yatırılmış reklamın təmiz xalis gəlirliliyi.</p>
              </div>
              <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                <span className="text-[9px] text-slate-450 font-bold block bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md w-max">MƏNFƏƏT</span>
                <span className="text-base font-black font-mono text-slate-800 block">{formatCurrency(activeChannel.profit)}</span>
                <p className="text-[8px] text-slate-400">Gəlir və Maya / Reklam xərcləri çıxıldıqdan sonra qalan xalis.</p>
              </div>
            </div>

            {/* Business recommendations wrapper */}
            {activeChannel.spend > 0 ? (
              <div className="bg-indigo-50/50 p-4 border border-indigo-100/40 rounded-xl text-[11px] leading-relaxed text-indigo-950">
                <span className="font-extrabold text-indigo-900 block mb-1">📍 Biznes Tövsiyəsi:</span>
                <p className="italic text-slate-600" dangerouslySetInnerHTML={{ __html: getAiMarketingRecommendation(activeChannel.name, activeChannel.roas, activeChannel.roi) }} />
              </div>
            ) : (
              <div className="bg-slate-50 p-4 rounded-xl text-[11px] leading-relaxed text-slate-500 italic flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-450 shrink-0" />
                Dəyərləndirmə aparmaq üçün aktiv kanal seçin və yaxud xərc qeydə alın.
              </div>
            )}
          </div>

          {/* Recharts dynamic comparison chart of active channels list */}
          <div className="space-y-2 mt-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Kanallar üzrə ROAS və Xalis qazanc payı</span>
            <div className="h-[140px] w-full text-[9px] font-mono relative min-h-0 min-w-0">
              {calculatedChannels.length > 0 ? (
                <SafeResponsiveContainer width="100%" height="100%">
                  <BarChart data={calculatedChannels} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                    <XAxis dataKey="name" stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} dy={4} />
                    <YAxis stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "#fff", 
                        border: "1px solid #E9EFF6", 
                        borderRadius: "12px",
                        boxShadow: "0 8px 20px rgba(26, 31, 46, 0.08)",
                        fontSize: "11px",
                        fontFamily: "var(--font-sans)"
                      }}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: "9px" }} />
                    <Bar dataKey="roas" name="ROAS Çarpanı (x)" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={12} />
                    <Bar dataKey="profit" name="Təmiz Qazanc Məbləği (₼)" fill="#10b981" radius={[6, 6, 0, 0]} barSize={12} />
                  </BarChart>
                </SafeResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">Göstəriləcək reklam datası yoxdur.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
