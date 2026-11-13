import React from "react";
import { PeriodMetrics } from "../../utils/biCalculations";
import { formatCurrency } from "../../utils/xlsEngine";
import { 
  DollarSign, ShoppingBag, ArrowUpRight, ArrowDownRight, 
  Layers, Percent, Activity, AlertCircle, Sparkles, CheckCircle2, UserCheck, HelpCircle, RefreshCw
} from "lucide-react";

interface BiExecutiveDashboardProps {
  metrics: PeriodMetrics;
  prevMetrics: PeriodMetrics;
  periodLabel: string;
  prevLabel: string;
  onRefresh: () => void;
  isLoading: boolean;
}

export default function BiExecutiveDashboard({
  metrics,
  prevMetrics,
  periodLabel,
  prevLabel,
  onRefresh,
  isLoading
}: BiExecutiveDashboardProps) {

  // Helper to compute percentage change
  const renderTrend = (current: number, previous: number, invert = false) => {
    if (previous === 0) {
      if (current === 0) return <span className="text-[10px] text-slate-400 font-medium">0% (Önceki yoxdur)</span>;
      return (
        <span className="flex items-center text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md">
          <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +100%
        </span>
      );
    }
    const ratio = ((current - previous) / previous) * 100;
    const isUp = ratio >= 0;
    const isNeutral = Math.abs(ratio) < 0.1;

    if (isNeutral) {
      return <span className="text-[10px] text-slate-400 font-medium font-mono">0.0% vs {prevLabel}</span>;
    }

    const colorClass = (isUp && !invert) || (!isUp && invert)
      ? "text-emerald-600 bg-emerald-50 border border-emerald-100" 
      : "text-rose-600 bg-rose-50 border border-rose-100";

    const Icon = isUp ? ArrowUpRight : ArrowDownRight;

    return (
      <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-lg select-none ${colorClass}`}>
        <Icon className="w-3.5 h-3.5 mr-0.5" /> 
        {isUp ? "+" : ""}{ratio.toFixed(1)}%
      </span>
    );
  };

  // Generate automated smart alert triggers based on metrics comparisons
  const getAiAlerts = () => {
    const alerts: Array<{ type: "danger" | "warning" | "success" | "info"; msg: string; label: string }> = [];

    // Alert 1: Revenue decline
    if (prevMetrics.revenue > 0 && metrics.revenue < prevMetrics.revenue) {
      const drop = (((prevMetrics.revenue - metrics.revenue) / prevMetrics.revenue) * 100).toFixed(1);
      alerts.push({
        type: "danger",
        label: "Satış Həcmi Azalıb",
        msg: `Satış gəlirləri öncəki dövrlə müqayisədə **${drop}%** səviyyəsində eniş göstərir. Reklam kanallarını yoxlayın.`,
      });
    }

    // Alert 2: Profit margin decline
    if (metrics.profitMargin < 20) {
      alerts.push({
        type: "warning",
        label: "Aşağı Mənfəət Marjası",
        msg: `Cari dövr üzrə xalis mənfəət marjası **${metrics.profitMargin.toFixed(1)}%** təşkil edir, bu hədəf 25% altındadır.`,
      });
    }

    // Alert 3: Order cancellation rate high
    if (metrics.cancellationRate > 15) {
      alerts.push({
        type: "danger",
        label: "Ləğv Oranı Yüksəkdir",
        msg: `Sifarişlərin ləğv edilmə faizi **${metrics.cancellationRate.toFixed(1)}%** həddinə çatıb. Çatdırılma problemlərini araşdırın.`,
      });
    }

    // Alert 4: Great AOV trend
    if (prevMetrics.aov > 0 && metrics.aov > prevMetrics.aov * 1.05) {
      alerts.push({
        type: "success",
        label: "Orta Səbət Artımı",
        msg: `Müştərilərin orta sifariş dəyəri (AOV) **${metrics.aov.toFixed(1)} AZN** rəqəminə yüksəlib. Əla nəticədir!`,
      });
    }

    // Alert 5: Heavy other expenses
    if (metrics.otherExpenses > metrics.revenue * 0.20 && metrics.revenue > 0) {
      alerts.push({
        type: "warning",
        label: "Qeyri-istehsal Xərcləri Yüksək",
        msg: "Ofis, kargo və maaş kimi qeyri-maya xərcləri dövriyyənin 20%-dən çoxunu təşkil edir.",
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        type: "info",
        label: "Sistem Stabil",
        msg: "Bütün əməliyyat göstəriciləri norma daxilindədir. Biznes fəaliyyətiniz müsbət marja ilə inkişaf edir.",
      });
    }

    return alerts.slice(0, 4); // return top 4 alerts
  };

  const getAiRecommendations = () => {
    const recs: string[] = [];
    if (metrics.cancellationRate > 10) {
      recs.push("Gözləyən və ləğv riski daşıyan sifarişlər üçün zəng mərkəzində müştəri sorğuları gücləndirilməlidir.");
    }
    if (metrics.profitMargin < 30) {
      recs.push("Maya dəyəri yüksək olan C kateqoriyalı məhsullarda qiymət artımına gedilməli və ya stokdan çıxarılmalıdır.");
    }
    if (metrics.newCustomersCount < metrics.activeCustomersCount * 0.2) {
      recs.push("Yeni müştərilərin alış dinamikasını sürətləndirmək üçün Google Search və Meta Retargeting reklam büdcəsi 15% artırılmalıdır.");
    }
    if (metrics.repeatCustomersCount < metrics.activeCustomersCount * 0.3) {
      recs.push("Təkrar alış edən müştərilərə xüsusi endirim promo-kodları və loyalty kampaniyaları sms vasitəsi ilə göndərilməlidir.");
    }
    if (metrics.aov < 45) {
      recs.push("Orta səbət dəyərini artırmaq üçün 'Birlikdə Al' cross-sell (çarpaz satış) paket təklifləri tətbiq edilməlidir.");
    }

    // Fallbacks
    if (recs.length < 3) {
      recs.push("Sosial şəbəkələrdən gələn trafikdə qayıtma faizini azaltmaq üçün məhsul kartlarında video rəyləri artırın.");
      recs.push("Ən çox gəlir gətirən bölgələrdə lokal Instagram reklam hədəflərini incəldin.");
    }
    return recs.slice(0, 4);
  };

  const alerts = getAiAlerts();
  const recs = getAiRecommendations();

  return (
    <div className="space-y-6">
      
      {/* 2xX grid for metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card: Total Sales Revenue */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 bg-indigo-500/10 rounded-full translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform" />
          <div className="relative z-10 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Cəmi Satış Gəliri</span>
              <DollarSign className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-2xl font-black font-mono tracking-tight text-white">{formatCurrency(metrics.revenue)}</p>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] text-slate-400">Öncə: {formatCurrency(prevMetrics.revenue)}</span>
                {renderTrend(metrics.revenue, prevMetrics.revenue)}
              </div>
            </div>
          </div>
        </div>

        {/* Card: Net Profit */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm relative group">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Xalis Mənfəət</span>
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-black font-mono tracking-tight text-slate-850">{formatCurrency(metrics.netProfit)}</p>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] text-slate-400">Öncə: {formatCurrency(prevMetrics.netProfit)}</span>
                {renderTrend(metrics.netProfit, prevMetrics.netProfit)}
              </div>
            </div>
          </div>
        </div>

        {/* Card: Profit Margin */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm relative group">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mənfəət Marjası (%)</span>
              <Percent className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-black font-mono tracking-tight text-indigo-600">{metrics.profitMargin.toFixed(1)}%</p>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] text-slate-400">Öncə: {prevMetrics.profitMargin.toFixed(1)}%</span>
                {renderTrend(metrics.profitMargin, prevMetrics.profitMargin)}
              </div>
            </div>
          </div>
        </div>

        {/* Card: AOV (Average Order Value) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm relative group">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Orta Sifariş Dəyəri (AOV)</span>
              <ShoppingBag className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-black font-mono tracking-tight text-slate-850">{metrics.aov.toFixed(1)} ₼</p>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] text-slate-400">Öncə: {prevMetrics.aov.toFixed(1)} ₼</span>
                {renderTrend(metrics.aov, prevMetrics.aov)}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Additional Minor Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between space-y-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Çatdırılma / Ləğv Faizi</span>
          <div className="flex items-baseline space-x-1.5">
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.successRate.toFixed(1)}%</span>
            <span className="text-[9px] text-slate-400 font-mono">/ {metrics.cancellationRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full" style={{ width: `${metrics.successRate}%` }} />
            <div className="bg-rose-500 h-full" style={{ width: `${metrics.cancellationRate}%` }} />
          </div>
        </div>

        <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between space-y-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Aktiv Müştərilər</span>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.activeCustomersCount}</span>
            <span className="text-[9px] text-slate-400">Öncə: {prevMetrics.activeCustomersCount}</span>
          </div>
          <div className="text-[9px] text-slate-400">Sözügedən dövrdə alış veriş edəm kəslər</div>
        </div>

        <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between space-y-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Yeni Müştərilər</span>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.newCustomersCount}</span>
            <span className="text-[9px] text-slate-400">Öncə: {prevMetrics.newCustomersCount}</span>
          </div>
          <div className="text-[9px] text-slate-400">Qeydiyyatdan keçən yeni profillər</div>
        </div>

        <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 flex flex-col justify-between space-y-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Təkrar Alış Sayı</span>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-bold text-slate-800 font-mono">{metrics.repeatCustomersCount}</span>
            <span className="text-[9px] text-slate-400">Loyalty: {((metrics.repeatCustomersCount / Math.max(1, metrics.activeCustomersCount)) * 100).toFixed(0)}%</span>
          </div>
          <div className="text-[9px] text-slate-400">Birdən çox uğurlu sifarişi olanlar</div>
        </div>

      </div>

      {/* Dynamic Alerts System & Ai Recommendation Center */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Module: AI Alert System (AI Xəbərdarlıq Sistemi) */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <AlertCircle className="w-4 h-4 text-indigo-600 mr-1.5" /> AI Avtomatik Xəbərdarlıq Sistemi
              </h3>
              <p className="text-[10px] text-slate-400">Sistem anomaliyaları və əməliyyat riskləri analizi</p>
            </div>
            <span className="bg-slate-100 text-slate-650 text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
              {alerts.length} bildiriş
            </span>
          </div>

          <div className="space-y-3 my-2 flex-grow">
            {alerts.map((alert, idx) => {
              const borderTheme = alert.type === "danger" 
                ? "border-rose-100 bg-rose-50/40 text-rose-850"
                : alert.type === "warning"
                ? "border-amber-100 bg-amber-50/30 text-amber-850"
                : alert.type === "success"
                ? "border-emerald-100 bg-emerald-50/30 text-emerald-850"
                : "border-indigo-100 bg-indigo-50/20 text-indigo-850";

              const badgeTheme = alert.type === "danger" 
                ? "bg-rose-500 text-white"
                : alert.type === "warning"
                ? "bg-amber-500 text-slate-900"
                : alert.type === "success"
                ? "bg-emerald-500 text-white"
                : "bg-indigo-600 text-white";

              return (
                <div key={idx} className={`p-3.5 rounded-xl border flex items-start space-x-3 transition-all hover:translate-x-1 duration-200 ${borderTheme}`}>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md mt-0.5 shadow-sm inline-block shrink-0 ${badgeTheme}`}>
                    {alert.type === "danger" ? "RİSK" : alert.type === "warning" ? "DİQQƏT" : "UĞURLU"}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{alert.label}</h4>
                    <p className="text-[11px] text-slate-550 mt-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: alert.msg }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Module: AI Recommendation Center (AI Tövsiyə Mərkəzi) */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center pb-2 border-b border-slate-50">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <Sparkles className="w-4 h-4 text-amber-500 mr-1.5" /> AI Biznes Tövsiyə Mərkəzi
              </h3>
              <p className="text-[10px] text-slate-400">Biznes böyüməsi və xərclərin azaldılması yolları</p>
            </div>
            <span className="text-[10px] text-amber-600 font-extrabold flex items-center bg-amber-50 rounded-xl px-2 py-1 border border-amber-100">
              <Sparkles className="w-3.5 h-3.5 mr-1" /> OPTİMALLAŞDIRMA
            </span>
          </div>

          <div className="space-y-3.5 my-2 flex-grow">
            {recs.map((rec, idx) => (
              <div key={idx} className="flex gap-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100 items-start select-none hover:bg-slate-50 transition-colors">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-650 mt-0.5 font-mono">
                  {idx + 1}
                </span>
                <p className="text-xs text-slate-650 font-normal leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>

          <div className="bg-indigo-50/50 border border-indigo-100/50 p-3 rounded-xl flex items-center justify-between text-xs text-indigo-700">
            <span className="font-medium font-sans">Daha detallı tövsiyə və analizlər üçün altda yerləşən AI Agent ilə söhbət edin!</span>
          </div>
        </div>

      </div>

    </div>
  );
}
