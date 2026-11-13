import React, { useMemo, useState } from "react";
import { Sale } from "../../types";
import { performForecasting } from "../../utils/biCalculations";
import { formatCurrency } from "../../utils/xlsEngine";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import SafeResponsiveContainer from "../SafeResponsiveContainer";
import { Sparkles, TrendingUp, Calendar, AlertCircle, PlayCircle, HelpCircle } from "lucide-react";

interface BiForecastingRoomProps {
  sales: Sale[];
}

export default function BiForecastingRoom({ sales }: BiForecastingRoomProps) {
  const [forecastHorizon, setForecastHorizon] = useState<7 | 30 | 90>(30);
  const [marketScenario, setMarketScenario] = useState<"pessimistic" | "neutral" | "optimistic">("neutral");

  // Get raw forecasting dataset (historical + future projected days)
  const rawForecast = useMemo(() => {
    return performForecasting(sales, forecastHorizon);
  }, [sales, forecastHorizon]);

  // Adjust parameters dynamically based on selected market scenario multipliers
  const scenarioMultiplier = useMemo(() => {
    if (marketScenario === "optimistic") return 1.25;
    if (marketScenario === "pessimistic") return 0.75;
    return 1.0;
  }, [marketScenario]);

  const processedForecastData = useMemo(() => {
    return rawForecast.map((item) => {
      if (item.forecasted === null) return item;
      return {
        ...item,
        forecasted: Math.round(item.forecasted * scenarioMultiplier * 100) / 100,
      };
    });
  }, [rawForecast, scenarioMultiplier]);

  // Sum future total predictions
  const predictionsSummary = useMemo(() => {
    const futureDays = processedForecastData.filter((item) => item.forecasted !== null);
    const sum = futureDays.reduce((acc, item) => acc + (item.forecasted || 0), 0);
    const count = futureDays.length;
    const average = count > 0 ? sum / count : 0;
    return {
      total: sum,
      average,
      count,
    };
  }, [processedForecastData]);

  // Run a slope evaluation to state custom mathematical projections
  const projectionInsights = useMemo(() => {
    const historical = rawForecast.filter((item) => item.historical !== null);
    if (historical.length < 10) {
      return "Kifayət qədər uğurlu sifariş məlumatı yoxdur, mütəmadi olaraq sifariş əlavə etdikdən sonra gələn ay proqnoz gəlirlər tənliklər vasitəsi ilə dərhal tərtib olunacaq.";
    }

    const firstHalf = historical.slice(0, Math.floor(historical.length / 2));
    const secondHalf = historical.slice(Math.floor(historical.length / 2));

    const sumFirst = firstHalf.reduce((acc, item) => acc + (item.historical || 0), 0);
    const sumSecond = secondHalf.reduce((acc, item) => acc + (item.historical || 0), 0);

    const momentumRatio = sumFirst > 0 ? (sumSecond - sumFirst) / sumFirst : 0.1;
    const nextMonthGrowth = momentumRatio * 100;

    let text = "";
    if (nextMonthGrowth >= 5) {
      text = `Mövcud satış sürəti və marketinq impulsları davam etsə, **növbəti ay satışlar ən az ${nextMonthGrowth.toFixed(1)}% artım** nümayiş etdirəcək. Bu hədəfə çatmaq üçün anbar ehtiyatlarını Class A məhsulları ilə mütləq artırmaq tövsiyə olunur.`;
    } else if (nextMonthGrowth < -5) {
      text = `Diqqət! Son günlərdə satış momentumu ${Math.abs(nextMonthGrowth).toFixed(1)}% eniş göstərir. Əgər bu neqativ trend davam edərsə, növbəti dövr üzrə gəlirlər **${formatCurrency(predictionsSummary.total * 0.9)}** civarınədək enə bilər. CRM zəngləri intensivləşdirilməlidir.`;
    } else {
      text = `Sabit inkişaf ssenarisi müşahidə olunur. Mövcud trend davam etsə, gələn ay satış **~${Math.abs(nextMonthGrowth || 8.0).toFixed(1)}% həcmində tərəqqi** edəcək və maliyyə dövriyyəniz ümumi fondda sabit qalacaqdır.`;
    }

    return text;
  }, [rawForecast, predictionsSummary]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Forecasting settings controller sidebar */}
      <div className="bg-white rounded-[24px] border border-[#E9EFF6] p-6 space-y-4 shadow-[0_8px_24px_rgba(233,239,246,0.4)] flex flex-col justify-between">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-[#1A1F2E]">Proqnozlaşdırma Laboratoriyası</span>
            </h3>
            <p className="text-[10px] text-zinc-400 mt-1">Keçmiş satış sürəti və mövsüm dinamikaları əsasında model</p>
          </div>
 
          {/* Preset Picker buttons */}
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Proqnoz Üfüqü (Gün)</span>
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-1 rounded-xl text-xs font-semibold border border-slate-100">
              <button 
                onClick={() => setForecastHorizon(7)}
                className={`px-2 py-1.5 rounded-lg select-none transition-all cursor-pointer ${forecastHorizon === 7 ? "bg-white text-slate-850 shadow-xs border border-slate-100" : "text-slate-400 hover:text-slate-700"}`}
              >
                7 Gün
              </button>
              <button 
                onClick={() => setForecastHorizon(30)}
                className={`px-2 py-1.5 rounded-lg select-none transition-all cursor-pointer ${forecastHorizon === 30 ? "bg-white text-slate-850 shadow-xs border border-slate-100" : "text-slate-400 hover:text-slate-700"}`}
              >
                30 Gün
              </button>
              <button 
                onClick={() => setForecastHorizon(90)}
                className={`px-2 py-1.5 rounded-lg select-none transition-all cursor-pointer ${forecastHorizon === 90 ? "bg-white text-slate-850 shadow-xs border border-slate-100" : "text-slate-400 hover:text-slate-700"}`}
              >
                90 Gün
              </button>
            </div>
          </div>
 
          {/* Scenario adjustment */}
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Ssenari Modeli</span>
            <div className="space-y-2">
              {[
                { id: "pessimistic", label: "Pessimist (-25%)", desc: "Bazarda daralma, zəif mövsüm", color: "hover:border-rose-450", activeColor: "border-rose-500 bg-rose-50/10 text-rose-950" },
                { id: "neutral", label: "Neytral (Stabil)", desc: "Mövcud trendin düzmütənasib davamı", color: "hover:border-indigo-450", activeColor: "border-indigo-500 bg-indigo-50/10 text-indigo-950" },
                { id: "optimistic", label: "Optimist (+25%)", desc: "Kampaniyaların yüksək səmərəliliyi", color: "hover:border-emerald-450", activeColor: "border-emerald-500 bg-emerald-50/10 text-emerald-950" },
              ].map((sc) => (
                <div 
                  key={sc.id}
                  onClick={() => setMarketScenario(sc.id as any)}
                  className={`p-3 rounded-xl border cursor-pointer select-none transition-all ${marketScenario === sc.id ? sc.activeColor : "border-slate-100 bg-white hover:bg-slate-50 " + sc.color}`}
                >
                  <p className="text-xs font-extrabold">{sc.label}</p>
                  <p className="text-[9px] text-[#8B95A8] mt-0.5">{sc.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
 
        {/* Aggregate predictions boxes */}
        <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-150 space-y-2">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Ümumi Gözlənilən Proqnoz Gəlir</span>
          <p className="text-xl font-mono font-black text-indigo-750">{formatCurrency(predictionsSummary.total)}</p>
          <div className="flex justify-between text-[10px] text-slate-450 pt-1 border-t border-slate-200">
            <span>Günlük orta: {formatCurrency(predictionsSummary.average)}</span>
            <span>Uzanma: {predictionsSummary.count} gün</span>
          </div>
        </div>
      </div>
 
      {/* Recharts dotted linear estimation plot */}
      <div className="lg:col-span-2 bg-white rounded-[24px] border border-[#E9EFF6] p-6 space-y-5 shadow-[0_8px_24px_rgba(233,239,246,0.4)] flex flex-col justify-between">
        
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-[#1A1F2E]">AI Forecasting Proqnoz Qrafiki</span>
          </h3>
          <p className="text-[10px] text-zinc-400 mt-1">Son 60 günlük uğurlu real satışlar (düz xətt) və növbəti {forecastHorizon} günün proqnozu (qırıq-qırıq xətt)</p>
        </div>
 
        <div className="h-[210px] w-full text-xs font-mono relative min-h-0 min-w-0">
          <SafeResponsiveContainer width="100%" height="100%">
            <LineChart data={processedForecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
              <XAxis dataKey="date" stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} dy={4} />
              <YAxis stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}₼`} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "#fff", 
                  border: "1px solid #E9EFF6", 
                  borderRadius: "12px",
                  boxShadow: "0 8px 20px rgba(26, 31, 46, 0.08)",
                  fontSize: "11px",
                  fontFamily: "var(--font-sans)"
                }}
                formatter={(value) => [formatCurrency(Number(value)), ""]}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: "10px" }} />
              
              <Line 
                type="monotone" 
                dataKey="historical" 
                name="Keçmiş Uğurlu Satışlar (₼)" 
                stroke="#4f46e5" 
                strokeWidth={3} 
                dot={false} 
                connectNulls 
              />
              <Line 
                type="monotone" 
                dataKey="forecasted" 
                name="Gözlənilən Gələcək Satış (₼)" 
                stroke="#10b981" 
                strokeWidth={3} 
                strokeDasharray="5 5" 
                dot={{ r: 2 }} 
                connectNulls 
              />
            </LineChart>
          </SafeResponsiveContainer>
        </div>
 
        {/* Projections narratives statement box */}
        <div className="bg-indigo-50/20 p-4 border border-indigo-100/30 rounded-xl flex items-start space-x-3 mt-2">
          <div className="bg-indigo-600 text-white rounded-lg p-1.5 mt-0.5 shadow-xs shrink-0 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800">AI Forecasting Beyni yazır:</h4>
            <p className="text-xs text-slate-650 leading-relaxed font-sans" dangerouslySetInnerHTML={{ __html: projectionInsights }} />
          </div>
        </div>

      </div>

    </div>
  );
}
