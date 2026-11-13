import React, { useMemo, useState } from "react";
import { Customer, Sale, Settings } from "../../types";
import { performCustomerSegmentation, CustomerSegmentItem } from "../../utils/biCalculations";
import { formatCurrency } from "../../utils/xlsEngine";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import SafeResponsiveContainer from "../SafeResponsiveContainer";
import { 
  Users, 
  ShieldCheck, 
  MapPin, 
  Sparkles, 
  Navigation,
  Copy, 
  Check, 
  Map, 
  Layers, 
  Zap, 
  AlertCircle, 
  TrendingUp, 
  LayoutList,
  ChevronRight,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BiCustomerAnalyticsProps {
  customers: Customer[];
  sales: Sale[];
  settings: Settings;
}

interface GeoCoord {
  x: number;
  y: number;
  isBakuRayon: boolean;
  nameAz: string;
}

// Map Coordinates representing key areas of Baku or regional hubs
const geoCoordinates: Record<string, GeoCoord> = {
  "Yasamal": { x: 235, y: 165, isBakuRayon: true, nameAz: "Yasamal rayonu" },
  "Nərimanov": { x: 275, y: 140, isBakuRayon: true, nameAz: "Nərimanov rayonu" },
  "Səbail": { x: 245, y: 195, isBakuRayon: true, nameAz: "Səbail rayonu" },
  "Nəsimi": { x: 265, y: 155, isBakuRayon: true, nameAz: "Nəsimi rayonu" },
  "Xətai": { x: 305, y: 165, isBakuRayon: true, nameAz: "Xətai rayonu" },
  "Nizami": { x: 320, y: 145, isBakuRayon: true, nameAz: "Nizami rayonu" },
  "Binəqədi": { x: 215, y: 120, isBakuRayon: true, nameAz: "Binəqədi rayonu" },
  "Sabunçu": { x: 345, y: 110, isBakuRayon: true, nameAz: "Sabunçu rayonu" },
  "Suraxanı": { x: 380, y: 145, isBakuRayon: true, nameAz: "Suraxanı rayonu" },
  "Qaradağ": { x: 125, y: 200, isBakuRayon: true, nameAz: "Qaradağ rayonu" },
  "Xəzər": { x: 425, y: 135, isBakuRayon: true, nameAz: "Xəzər rayonu" },
  "Pirallahı": { x: 465, y: 115, isBakuRayon: true, nameAz: "Pirallahı rayonu" },

  "Abşeron": { x: 350, y: 115, isBakuRayon: false, nameAz: "Abşeron rayonu" },
  "Xırdalan": { x: 375, y: 130, isBakuRayon: false, nameAz: "Xırdalan şəhəri" },
  "Sumqayıt": { x: 340, y: 70, isBakuRayon: false, nameAz: "Sumqayıt şəhəri" },

  "Gəncə": { x: 140, y: 160, isBakuRayon: false, nameAz: "Gəncə şəhəri" },
  "Naxçıvan": { x: 70, y: 260, isBakuRayon: false, nameAz: "Naxçıvan MR" },
  "Şəki": { x: 180, y: 90, isBakuRayon: false, nameAz: "Şəki şəhəri" },
  "Lənkəran": { x: 310, y: 280, isBakuRayon: false, nameAz: "Lənkəran şəhəri" },
  "Quba": { x: 285, y: 65, isBakuRayon: false, nameAz: "Quba rayonu" },
  "Mingəçevir": { x: 200, y: 130, isBakuRayon: false, nameAz: "Mingəçevir şəhəri" },
  "Bakı": { x: 370, y: 140, isBakuRayon: true, nameAz: "Bakı" }
};

export default function BiCustomerAnalytics({ customers, sales, settings }: BiCustomerAnalyticsProps) {
  const [segmentFilter, setSegmentFilter] = useState<"VIP" | "Aktiv" | "Riskli" | "İtirilmiş">("VIP");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Interactive Map States
  const [mapPreset, setMapPreset] = useState<"all" | "baku" | "regions">("all");
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // Compute segmented customer list
  const segmentedList = useMemo(() => {
    return performCustomerSegmentation(customers, sales);
  }, [customers, sales]);

  // Aggregate stats per segments
  const segmentStats = useMemo(() => {
    const stats = { VIP: 0, Aktiv: 0, Riskli: 0, İtirilmiş: 0 };
    segmentedList.forEach((c) => {
      stats[c.segment] = (stats[c.segment] || 0) + 1;
    });
    return stats;
  }, [segmentedList]);

  // Comprehensive Region Parsing & Grading
  const normalizedRegionStats = useMemo(() => {
    const map: Record<string, { orderCount: number; deliveredCount: number; revenue: number; deliveryCost: number; cancelledCount: number }> = {};

    sales.forEach((s) => {
      let loc = "Bakı";
      const cleanAddress = (s.address || "").toLowerCase();

      if (cleanAddress.includes("yasamal")) loc = "Yasamal";
      else if (cleanAddress.includes("nərimanov") || cleanAddress.includes("nerimanov")) loc = "Nərimanov";
      else if (cleanAddress.includes("səbail") || cleanAddress.includes("sebail")) loc = "Səbail";
      else if (cleanAddress.includes("nəsimi") || cleanAddress.includes("nasimi")) loc = "Nəsimi";
      else if (cleanAddress.includes("xətai") || cleanAddress.includes("khatai")) loc = "Xətai";
      else if (cleanAddress.includes("nizami")) loc = "Nizami";
      else if (cleanAddress.includes("binəqədi") || cleanAddress.includes("bineqedi")) loc = "Binəqədi";
      else if (cleanAddress.includes("sabunçu") || cleanAddress.includes("sabunchu")) loc = "Sabunçu";
      else if (cleanAddress.includes("suraxanı") || cleanAddress.includes("surakhani")) loc = "Suraxanı";
      else if (cleanAddress.includes("qaradağ") || cleanAddress.includes("garadagh")) loc = "Qaradağ";
      else if (cleanAddress.includes("xəzər") || cleanAddress.includes("khazar")) loc = "Xəzər";
      else if (cleanAddress.includes("pirallahı") || cleanAddress.includes("pirallahi")) loc = "Pirallahı";
      else if (cleanAddress.includes("sumqayıt") || cleanAddress.includes("sumqayit")) loc = "Sumqayıt";
      else if (cleanAddress.includes("xırdalan") || cleanAddress.includes("xirdalan")) loc = "Xırdalan";
      else if (cleanAddress.includes("abşeron") || cleanAddress.includes("abseron")) loc = "Abşeron";
      else if (cleanAddress.includes("gəncə") || cleanAddress.includes("gence")) loc = "Gəncə";
      else if (cleanAddress.includes("lənkəran") || cleanAddress.includes("lenkeran")) loc = "Lənkəran";
      else if (cleanAddress.includes("naxçıvan") || cleanAddress.includes("naxcivan")) loc = "Naxçıvan";
      else if (cleanAddress.includes("quba")) loc = "Quba";
      else if (cleanAddress.includes("şəki") || cleanAddress.includes("seki")) loc = "Şəki";
      else if (cleanAddress.includes("mingəçevir") || cleanAddress.includes("mingacevir")) loc = "Mingəçevir";
      else {
        // Fallback checks
        const splitArr = s.address.split(",");
        if (splitArr.length > 0 && splitArr[0].trim().length > 1) {
          let trimmed = splitArr[0].trim();
          trimmed = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
          loc = trimmed;
        } else {
          loc = "Bakı";
        }
      }

      if (!map[loc]) {
        map[loc] = { orderCount: 0, deliveredCount: 0, revenue: 0, deliveryCost: 0, cancelledCount: 0 };
      }

      const m = map[loc];
      m.orderCount++;
      if (s.status === "çatdırılıb") {
        m.deliveredCount++;
        m.revenue += s.totalAmount || 0;
        m.deliveryCost += s.deliveryCost || 0;
      } else if (s.status === "ləğv edilib") {
        m.cancelledCount++;
      }
    });

    return Object.entries(map).map(([name, m]) => {
      const totalClosed = m.deliveredCount + m.cancelledCount;
      const cancellationRate = totalClosed > 0 ? (m.cancelledCount / totalClosed) * 100 : 0;
      
      // Determine Delivery Grade category
      let grade: "critical" | "high" | "medium" | "low" = "low";
      if (m.orderCount >= 15) grade = "critical";
      else if (m.orderCount >= 6) grade = "high";
      else if (m.orderCount >= 2) grade = "medium";

      return {
        name,
        orderCount: m.orderCount,
        deliveredCount: m.deliveredCount,
        revenue: m.revenue,
        deliveryCost: m.deliveryCost,
        cancellationRate: Math.round(cancellationRate),
        grade
      };
    }).sort((a, b) => b.orderCount - a.orderCount);
  }, [sales]);

  const filteredSegmentedList = useMemo(() => {
    return segmentedList.filter((c) => c.segment === segmentFilter)
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [segmentedList, segmentFilter]);

  // Radar representation
  const radarData = useMemo(() => {
    const total = Math.max(1, segmentedList.length);
    return [
      { subject: "Korporativ VIP %", value: Math.round((segmentStats.VIP / total) * 100) },
      { subject: "Aktiv Üzlər %", value: Math.round((segmentStats.Aktiv / total) * 100) },
      { subject: "Xəbərdarlıq (Riskli)", value: Math.round((segmentStats.Riskli / total) * 100) },
      { subject: "itki dərəcəsi %", value: Math.round((segmentStats.İtirilmiş / total) * 100) },
    ];
  }, [segmentStats, segmentedList]);

  // Copy helper
  const handleCopyPhone = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Filter regions to display on the current map preset
  const displayedRegionsOnMap = useMemo(() => {
    return normalizedRegionStats.filter((r) => {
      const coord = geoCoordinates[r.name];
      if (!coord) return false;
      if (mapPreset === "baku") return coord.isBakuRayon;
      if (mapPreset === "regions") return !coord.isBakuRayon;
      return true; // "all"
    });
  }, [normalizedRegionStats, mapPreset]);

  // Derive active region's explicit stats
  const activeRegionMetrics = useMemo(() => {
    if (!selectedRegion) return null;
    return normalizedRegionStats.find(r => r.name === selectedRegion) || {
      name: selectedRegion,
      orderCount: 0,
      deliveredCount: 0,
      revenue: 0,
      deliveryCost: 0,
      cancellationRate: 0,
      grade: "low" as const
    };
  }, [selectedRegion, normalizedRegionStats]);

  // Calculate Region Grade stats helper for the legend
  const gradeCounts = useMemo(() => {
    const cnt = { critical: 0, high: 0, medium: 0, low: 0 };
    normalizedRegionStats.forEach(r => {
      if (cnt[r.grade] !== undefined) cnt[r.grade]++;
    });
    return cnt;
  }, [normalizedRegionStats]);

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: Segments and Portofolio radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Customer Segments Console */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-50">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                <Users className="w-4 h-4 text-indigo-600" /> Müştəri Seqmentləri Portfeli
              </h3>
              <p className="text-[10px] text-slate-400">Yenidən hədəfləmə, VIP və CRM loyallıq bölgüləri</p>
            </div>

            {/* Segment badges */}
            <div className="flex flex-wrap gap-1 bg-slate-105 p-1 rounded-xl text-[10px] font-semibold">
              {(["VIP", "Aktiv", "Riskli", "İtirilmiş"] as const).map((seg) => {
                const count = segmentStats[seg] || 0;
                const activeClass = segmentFilter === seg 
                  ? "bg-white text-slate-800 shadow-xs border border-slate-100"
                  : "text-slate-500 hover:text-slate-700";
                return (
                  <button
                    key={seg}
                    onClick={() => setSegmentFilter(seg)}
                    className={`px-3 py-1.5 rounded-lg select-none transition-all flex items-center space-x-1 ${activeClass}`}
                  >
                    <span className="font-bold">{seg}</span>
                    <span className="bg-slate-100 rounded-full px-1.5 py-0.2 text-[9px] font-mono text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic recommendation context */}
          <div className="bg-amber-50/45 border border-amber-100/40 p-4 rounded-xl flex items-start space-x-3 text-xs leading-relaxed text-amber-905">
            <div className="bg-amber-500 text-slate-900 rounded-lg p-1.5 shadow-sm shrink-0 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-slate-800 block text-[11px]">Hansı müştərilər yenidən aktivləşdirilməlidir?</span>
              {segmentFilter === "Riskli" ? (
                <p className="text-slate-600 text-[10px]">
                  Bu müştərilər son 45-90 gün ərzində heç bir alış etməmişdir. Lakin əvvəllər aktiv olmuşlar.
                  Rabitəni kəsməmək üçün onlara <b>xüsusi re-engagement sms kampaniyası</b> və ya pulsuz kuryer çatdırılması elan edin!
                </p>
              ) : segmentFilter === "İtirilmiş" ? (
                <p className="text-slate-600 text-[10px]">
                  Son 90 gündən çoxdur əməliyyat etməyən kəslərdir. Onları geri qaytarmaq üçün əldə etdiyiniz məlumatlar daxilində zəng eləyin
                  və ya fərdi <b>fokus promo-kodları (20%+)</b> təqdim etməyə çalışın.
                </p>
              ) : segmentFilter === "VIP" ? (
                <p className="text-slate-600 text-[10px]">
                  Biznes dövriyyənizin əsas nüvəsini (80%) təşkil edən VIP müştərilərdir. Onları mükafatlandırmaq üçün bayramlarda
                  hədiyyələrlə təbrik edin, premium xidmət prioritetini qoruyun.
                </p>
              ) : (
                <p className="text-slate-600 text-[10px]">
                  Sistemdə mütəmadi olaraq uğurlu alış-veriş edən aktiv kontingent. Onlara mütəmadi olaraq çarpaz (cross-sell)
                  məhsul yeniliklərini tövsiyə etməyə davam edin.
                </p>
              )}
            </div>
          </div>

          {/* Segmented Customers list */}
          <div className="overflow-y-auto max-h-[190px] pr-1 space-y-2">
            {filteredSegmentedList.map((c, idx) => (
              <div key={idx} className="p-2.5 bg-slate-50/50 rounded-xl border border-slate-100 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="space-y-0.5">
                  <p className="font-extrabold text-slate-800 text-[11px]">{c.name}</p>
                  <div className="text-[9px] text-slate-400 flex items-center space-x-2">
                    <span className="flex items-center"><MapPin className="w-2.5 h-2.5 mr-0.5" /> {c.city}, {c.region}</span>
                    <span>•</span>
                    <span>Son alış: {c.lastOrderDays} gün əvvəl</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="font-extrabold text-[11px] text-slate-800 font-mono">{formatCurrency(c.totalSpent)}</p>
                    <p className="text-[8px] text-slate-400">AOV: {formatCurrency(c.totalOrders > 0 ? c.totalSpent / c.totalOrders : 0)}</p>
                  </div>

                  <button
                    onClick={() => handleCopyPhone(c.phone, c.id)}
                    title="Nömrəni kopyala"
                    className="bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 transition-colors p-1.5 rounded-lg text-slate-500 cursor-pointer"
                  >
                    {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}

            {filteredSegmentedList.length === 0 && (
              <p className="text-center py-6 text-slate-400 italic text-[11px]">Bu seqmentdə heç bir müştəri siyahısı hələ ki yoxdur.</p>
            )}
          </div>
        </div>

        {/* Segment Quality Radar */}
        <div className="bg-white rounded-[24px] border border-[#E9EFF6] p-6 space-y-4 shadow-[0_8px_24px_rgba(233,239,246,0.4)]">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
              <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-[#1A1F2E]">Müştəri Portfelinin Keyfiyyəti</span>
            </h3>
            <p className="text-[10px] text-zinc-400 mt-1">Struktur möhkəmliyi radar diaqramı (%)</p>
          </div>

          <div className="h-[210px] w-full flex items-center justify-center text-xs relative min-h-0 min-w-0">
            {segmentedList.length === 0 ? (
              <span className="text-zinc-400 italic">Məlumat yoxdur</span>
            ) : (
              <SafeResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#E2E8F0" opacity={0.6} />
                  <PolarAngleAxis dataKey="subject" stroke="#8B95A8" fontSize={9} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbd5e1" opacity={0.4} fontSize={8} />
                  <Radar name="Biznes nisbəti" dataKey="value" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </SafeResponsiveContainer>
            )}
          </div>
        </div>

      </div>

      {/* SECTION 2: MAGNIFICENT INTERACTIVE MAP & REGION DENSITY CRITERIA */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5">
        
        {/* Map Section Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-50 pb-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-[9px] uppercase tracking-wider">
              <Map className="w-3 h-3" /> Coğrafi Sıxlıq Təhlili
            </span>
            <h3 className="text-base font-black text-slate-850">Bölgələr və Sifarişlərin Dərəcələndirilməsi Xəritəsi</h3>
            <p className="text-xs text-slate-400">Ən çox çatdırılma olan ünvanların və rayonların sıxlığına görə visual dərəcələndirilməsi</p>
          </div>

          {/* Map Preset Controls */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold self-stretch md:self-auto justify-between gap-1">
            <button
              onClick={() => { setMapPreset("all"); setSelectedRegion(null); }}
              className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg select-none transition-all text-center cursor-pointer ${mapPreset === "all" ? "bg-white text-indigo-700 font-bold shadow-xs border border-indigo-100/50" : "text-slate-550 hover:text-slate-850"}`}
            >
              Hamısı ({normalizedRegionStats.length})
            </button>
            <button
              onClick={() => { setMapPreset("baku"); setSelectedRegion(null); }}
              className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg select-none transition-all text-center cursor-pointer ${mapPreset === "baku" ? "bg-white text-indigo-750 font-bold shadow-xs border border-indigo-100/50" : "text-slate-550 hover:text-slate-850"}`}
            >
              Bakı Rayonları
            </button>
            <button
              onClick={() => { setMapPreset("regions"); setSelectedRegion(null); }}
              className={`flex-1 md:flex-none px-3.5 py-1.5 rounded-lg select-none transition-all text-center cursor-pointer ${mapPreset === "regions" ? "bg-white text-indigo-750 font-bold shadow-xs border border-indigo-100/50" : "text-slate-550 hover:text-slate-850"}`}
            >
              Azərbaycan Regionları
            </button>
          </div>
        </div>

        {/* Map Grid Container & Info blocks */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          
          {/* A: Left 7 Cols: The Interactive SVG Map */}
          <div className="lg:col-span-7 bg-slate-950 rounded-2xl p-4 flex flex-col justify-between min-h-[380px] shadow-inner relative overflow-hidden group">
            
            {/* Tech background map styling details */}
            <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none"></div>
            <div className="absolute top-4 right-4 text-[9px] font-mono text-slate-500 uppercase flex items-center gap-1 bg-slate-900/60 p-1 rounded">
              <Zap className="w-3 h-3 text-indigo-400" /> Telemetriya Aktiv
            </div>

            {/* Title display */}
            <div className="z-10 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/70 max-w-sm">
              <p className="text-[10px] font-bold text-slate-400 tracking-wider">Cari Görünüş: <span className="text-white uppercase font-black">{mapPreset === "all" ? "Bütün Azərbaycan və Bakı" : mapPreset === "baku" ? "Böyük Bakı (Rayonlar)" : "Azərbaycan Şəhərləri"}</span></p>
              <p className="text-[8px] text-slate-400 mt-0.5">Xəritədəki nöqtələrə toxunaraq sıxlığı və dərəcəni yoxlayın.</p>
            </div>

            {/* The SVG graphics representation */}
            <div className="flex-1 flex items-center justify-center py-4 relative min-h-[280px]">
              <svg 
                viewBox="0 0 540 320" 
                className="w-full max-h-[300px] select-none scale-100 transition-transform duration-500"
              >
                <defs>
                  <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#0f172a" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#020617" stopOpacity="1" />
                  </linearGradient>

                  {/* Grading Status Gradients */}
                  <radialGradient id="grad-critical" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff453a" stopOpacity="1" />
                    <stop offset="50%" stopColor="#ff1744" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#d50000" stopOpacity="0.2" />
                  </radialGradient>
                  
                  <radialGradient id="grad-high" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff9f0a" stopOpacity="1" />
                    <stop offset="70%" stopColor="#ff6d00" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#e65100" stopOpacity="0.1" />
                  </radialGradient>

                  <radialGradient id="grad-medium" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#30d158" stopOpacity="1" />
                    <stop offset="80%" stopColor="#00c853" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#1b5e20" stopOpacity="0.1" />
                  </radialGradient>

                  <radialGradient id="grad-low" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#0a84ff" stopOpacity="1" />
                    <stop offset="80%" stopColor="#2979ff" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#0d47a1" stopOpacity="0.1" />
                  </radialGradient>
                </defs>

                {/* Draw the Azerbaijan Map outline or Baku Peninsula outline based on preset */}
                {mapPreset === "baku" ? (
                  // Baku & Absheron Peninsula zoomed beautiful Vector outline path
                  <motion.path 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    d="M 60 70 C 180 80, 240 70, 310 60 C 370 50, 420 90, 450 140 C 475 145, 510 135, 520 150 C 530 165, 515 200, 470 200 C 430 200, 400 235, 360 215 C 320 200, 260 240, 210 240 C 150 240, 120 210, 80 200 C 60 190, 40 130, 60 70 Z" 
                    fill="url(#mapGradient)" 
                    stroke="#4f46e5" 
                    strokeWidth="2.5" 
                    strokeOpacity="0.5"
                    strokeDasharray="4 2"
                  />
                ) : (
                  // Entire Azerbaijan Vector outline representation path
                  <g>
                    {/* Main Land outline */}
                    <motion.path 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      d="M20 120 L80 90 L110 50 L160 30 L220 35 L260 40 L310 35 L335 60 L380 90 L420 110 L445 130 L450 140 L430 155 L405 155 L380 185 L395 240 L365 265 L360 280 L320 280 L315 240 L340 190 L305 180 L290 195 L250 195 L210 195 L175 240 L120 255 L85 240 L100 200 L75 200 L45 150 Z" 
                      fill="url(#mapGradient)" 
                      stroke="#4338ca" 
                      strokeWidth="2" 
                      strokeOpacity="0.4"
                      strokeDasharray="4 2"
                    />
                    
                    {/* Nakhchivan Autonomous Republic separate enclave */}
                    <path 
                      d="M40 245 L70 240 L85 270 L55 285 L35 270 Z" 
                      fill="url(#mapGradient)" 
                      stroke="#4338ca" 
                      strokeWidth="1.5" 
                      strokeOpacity="0.45"
                      strokeDasharray="3 2"
                    />

                    {/* Caspian Sea shoreline decoration */}
                    <path 
                      d="M465 105 Q 490 140, 475 240" 
                      stroke="#1e3a8a" 
                      strokeWidth="3" 
                      fill="none" 
                      opacity="0.3" 
                    />
                  </g>
                )}

                {/* Interactive Pins representing order locations */}
                {displayedRegionsOnMap.map((region, idx) => {
                  const coord = geoCoordinates[region.name];
                  if (!coord) return null;

                  // Define node color & size according to grading category
                  let nodeColor = "fill-sky-500 stroke-sky-700";
                  let radialUrl = "url(#grad-low)";
                  let size = 8;
                  let gradeText = "";

                  if (region.grade === "critical") {
                    nodeColor = "fill-red-500 stroke-red-650";
                    size = 17;
                    radialUrl = "url(#grad-critical)";
                    gradeText = "Çox Yüksək Sifariş Sıxlığı";
                  } else if (region.grade === "high") {
                    nodeColor = "fill-amber-500 stroke-amber-600";
                    size = 13;
                    radialUrl = "url(#grad-high)";
                    gradeText = "Yüksək Sifariş Sıxlığı";
                  } else if (region.grade === "medium") {
                    nodeColor = "fill-emerald-400 stroke-emerald-600";
                    size = 10;
                    radialUrl = "url(#grad-medium)";
                    gradeText = "Orta Aktiv Sektor";
                  } else {
                    size = 7;
                    gradeText = "Aşağı Satış Həcmi";
                  }

                  const isHovered = hoveredRegion === region.name;
                  const isSelected = selectedRegion === region.name;

                  return (
                    <g 
                      key={idx}
                      onMouseEnter={() => setHoveredRegion(region.name)}
                      onMouseLeave={() => setHoveredRegion(null)}
                      onClick={() => setSelectedRegion(region.name)}
                      className="cursor-pointer"
                    >
                      {/* Pulse shadow for high-frequency zones */}
                      {(region.grade === "critical" || region.grade === "high" || isSelected) && (
                        <circle 
                          cx={coord.x} 
                          cy={coord.y} 
                          r={size * (isHovered ? 2.2 : 1.8)} 
                          className=" opacity-25 fill-indigo-400"
                        />
                      )}

                      {/* Broad Radial glowing color backdrop */}
                      <circle 
                        cx={coord.x} 
                        cy={coord.y} 
                        r={size * 1.5} 
                        fill={radialUrl} 
                        opacity={isHovered ? 0.9 : 0.65}
                        className="transition-all duration-300"
                      />

                      {/* Small Core Dot center */}
                      <circle 
                        cx={coord.x} 
                        cy={coord.y} 
                        r={Math.max(3, size / 2)} 
                        fill="#ffffff" 
                        stroke={isHovered ? "#6366f1" : "transparent"}
                        strokeWidth="1.5"
                        className="transition-all duration-300 shadow-sm"
                      />

                      {/* Minimal visual label text helper for highly performant nodes */}
                      {(region.grade === "critical" || isHovered || isSelected) && (
                        <text
                          x={coord.x}
                          y={coord.y - size - 4}
                          textAnchor="middle"
                          fill="#f8fafc"
                          fontSize="9"
                          fontWeight={isSelected ? "900" : "bold"}
                          className="fill-slate-100 drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)] pointer-events-none"
                        >
                          {coord.nameAz} ({region.orderCount})
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Quick guide map legend overlay */}
            <div className="z-10 bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] font-mono text-slate-300 mt-2">
              <span className="text-slate-400 font-bold uppercase mr-1">Nəzarət Dərəcələri:</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> Çox Yüksək (&ge;15 m.)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Yüksək (6-14 m.)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Orta (2-5 m.)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Stabil (1 m.)</span>
            </div>

          </div>

          {/* B: Right 5 Cols: Graded Analysis & Recommendations Dashboard */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-4">
            
            {/* Top Widget: Graded Performance Summary */}
            <div className="bg-slate-50 border border-slate-150/70 p-4 rounded-2xl flex-1 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex justify-between items-center pb-2.5 border-b border-slate-205">
                  <h4 className="text-xs font-bold text-slate-850 flex items-center gap-1.5 leading-none">
                    <Navigation className="w-3.5 h-3.5 text-indigo-600" /> Sektor Detalları & Qiymətləndirmə
                  </h4>
                  <span className="text-[9px] text-slate-400 font-mono">Baza xülasəsi</span>
                </div>

                <AnimatePresence mode="wait">
                  {activeRegionMetrics ? (
                    // Display details of the clicked nodes on map
                    <motion.div
                      key={activeRegionMetrics.name}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3 pt-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-extrabold text-indigo-950 font-sans">
                            {geoCoordinates[activeRegionMetrics.name]?.nameAz || activeRegionMetrics.name}
                          </p>
                          <span className="text-[9px] text-slate-400 font-mono">Təhlil dərəcəsi: </span>
                          <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider ${
                            activeRegionMetrics.grade === "critical" ? "text-rose-600 font-extrabold" :
                            activeRegionMetrics.grade === "high" ? "text-amber-600" :
                            activeRegionMetrics.grade === "medium" ? "text-emerald-600" : "text-sky-600"
                          }`}>
                            {activeRegionMetrics.grade === "critical" ? "🔴 Çox Yüksək Sıxlıq" :
                             activeRegionMetrics.grade === "high" ? "🟠 Yüksək Sifariş Sıxlığı" :
                             activeRegionMetrics.grade === "medium" ? "🟢 Orta Aktiv Sektor" : "🔵 Stabil Coğrafi Sektor"}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-850 font-mono">{formatCurrency(activeRegionMetrics.revenue)}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Ümumi dövriyyə</p>
                        </div>
                      </div>

                      {/* Key Indicators Grid */}
                      <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                        <div className="bg-white border border-slate-100 p-2 rounded-xl">
                          <p className="text-slate-400">Ümumi Sifariş:</p>
                          <p className="font-extrabold text-slate-850 text-xs mt-0.5">{activeRegionMetrics.orderCount} ədəd</p>
                        </div>
                        <div className="bg-white border border-slate-100 p-2 rounded-xl">
                          <p className="text-slate-400">Çatdırılıb:</p>
                          <p className="font-extrabold text-emerald-600 text-xs mt-0.5">{activeRegionMetrics.deliveredCount} ədəd</p>
                        </div>
                        <div className="bg-white border border-slate-100 p-2 rounded-xl">
                          <p className="text-slate-400">Uğurlu Çatdırılma %:</p>
                          <p className="font-extrabold text-indigo-700 text-xs mt-0.5">
                            {activeRegionMetrics.orderCount > 0 ? Math.round((activeRegionMetrics.deliveredCount / activeRegionMetrics.orderCount) * 100) : 0}%
                          </p>
                        </div>
                        <div className="bg-white border border-slate-100 p-2 rounded-xl">
                          <p className="text-slate-400 font-bold">Ləğv Oranı %:</p>
                          <p className={`font-black text-xs mt-0.5 ${activeRegionMetrics.cancellationRate > 20 ? "text-rose-600" : "text-slate-850"}`}>
                            {activeRegionMetrics.cancellationRate}% {activeRegionMetrics.cancellationRate > 20 && "⚠️"}
                          </p>
                        </div>
                      </div>

                      {/* Strategic Logistic suggestion based on real metrics */}
                      <div className="bg-white border border-slate-100/80 p-3 rounded-xl space-y-1 text-[10px] text-slate-650 leading-relaxed">
                        <span className="font-bold text-indigo-800 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" /> Logistika & Qiymət Tövsiyəsi:
                        </span>
                        {activeRegionMetrics.grade === "critical" ? (
                          <p>
                            Bu sektorda sifariş sıxlığı kritik həddədir. Çatdırılma xərclərini azaltmaq üçün kuryerlərin hər kəsə 
                            fərdi getməsi yerinə kuryerin <b>"Bölgə Sifarişlər Paketini"</b> alıb bir səfərdə hamısını paylaması (Group Route) hədəflənməlidir.
                          </p>
                        ) : activeRegionMetrics.cancellationRate > 20 ? (
                          <p className="text-rose-700 font-medium">
                            Diqqət! Bu sektorda ləğv nisbəti olduqca yüksəkdir ({activeRegionMetrics.cancellationRate}%).
                            Sifarişi kuryerə vermədən öncə menecer müştəri ilə zəng təkrarı (voice verification) aparmalı və dəqiqliyi təmin etməlidir.
                          </p>
                        ) : (
                          <p>
                            Sektor stabil və risksizdir. Müştəri loyallığını qorumaq üçün bu bölgədəki aktiv müştərilərin 
                            <b> rəylərini yoxlayın</b> və növbəti dövrlərdə təkrar satış üçün kiçik endirim çekləri planlaşdırın.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    // Default view if no points clicked yet
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                      <div className="p-3 bg-indigo-50 text-indigo-500 rounded-full">
                        <Map className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-slate-800">Sektor Seçilməyib</p>
                      <p className="text-[10px] text-slate-450 max-w-[220px]">
                        Sol xəritədə hər hansı bir coğrafi dairəyə və ya kəsişmə nöqtəsinə klikləyərək reytinq analizini buraya çağırın.
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom Block inside Dashboard: Overall Performance Category Ratings */}
              <div className="space-y-2 pt-3 border-t border-slate-205">
                <p className="text-[10px] font-bold text-slate-505 uppercase tracking-wider">Cari Qiymətləndirmə Bölgüsü:</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-white border border-indigo-50/55 p-2 rounded-xl flex items-center justify-between">
                    <span className="text-slate-450 font-bold">🔴 Çox Yüksək:</span>
                    <span className="font-extrabold text-slate-800 bg-red-50 text-red-650 px-2 py-0.5 rounded-md font-mono">{gradeCounts.critical} bölgə</span>
                  </div>
                  <div className="bg-white border border-indigo-50/55 p-2 rounded-xl flex items-center justify-between">
                    <span className="text-slate-450 font-bold">🟠 Yüksək:</span>
                    <span className="font-extrabold text-slate-800 bg-amber-50 text-amber-650 px-2 py-0.5 rounded-md font-mono">{gradeCounts.high} bölgə</span>
                  </div>
                  <div className="bg-white border border-indigo-50/55 p-2 rounded-xl flex items-center justify-between">
                    <span className="text-slate-455 font-bold">🟢 Orta:</span>
                    <span className="font-extrabold text-slate-850 bg-emerald-50 text-emerald-650 px-2 py-0.5 rounded-md font-mono">{gradeCounts.medium} bölgə</span>
                  </div>
                  <div className="bg-white border border-indigo-50/55 p-2 rounded-xl flex items-center justify-between">
                    <span className="text-slate-450 font-bold">🔵 Coğrafi Stabil:</span>
                    <span className="font-extrabold text-slate-800 bg-sky-50 text-sky-650 px-2 py-0.5 rounded-md font-mono">{gradeCounts.low} bölgə</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Micro Widget: Direct list with collapsible items */}
            <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-indigo-400">
                <TrendingUp className="w-4 h-4 text-indigo-451" />
                <h4 className="text-[10px] font-bold leading-none uppercase tracking-wider">Ən Çox Satış Olan Sektorlar (Liderlər)</h4>
              </div>
              
              <div className="space-y-1.5 font-sans">
                {normalizedRegionStats.slice(0, 3).map((r, idx) => (
                  <div 
                    key={idx}
                    onClick={() => {
                      const coord = geoCoordinates[r.name];
                      if (coord) {
                        setMapPreset(coord.isBakuRayon ? "baku" : "regions");
                      }
                      setSelectedRegion(r.name);
                    }}
                    className={`p-2 rounded-xl transition-all flex items-center justify-between text-xs cursor-pointer ${selectedRegion === r.name ? "bg-indigo-700/60 border border-indigo-500/40" : "bg-slate-850 hover:bg-slate-800"}`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400">#{idx+1}</span>
                      <p className="font-bold text-slate-200">{geoCoordinates[r.name]?.nameAz || r.name}</p>
                    </div>
                    <div className="text-right font-mono flex items-center space-x-1">
                      <span className="text-[10px] text-slate-400 mr-1">({r.orderCount} sifariş)</span>
                      <span className="font-black text-indigo-200 text-[11px]">{formatCurrency(r.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
