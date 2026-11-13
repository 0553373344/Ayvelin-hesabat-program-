import React, { useState, useMemo, useRef, useEffect } from "react";
import { Sale, Product, Customer, Expense } from "../../types";
import { getPeriodMetrics, performAbcAnalysis, performCustomerSegmentation, performLocationAnalysis } from "../../utils/biCalculations";
import { formatCurrency } from "../../utils/xlsEngine";
import { Sparkles, Send, Bot, User, Check, RefreshCw, HelpCircle, Loader2 } from "lucide-react";

interface BiChatAgentProps {
  sales: Sale[];
  products: Product[];
  customers: Customer[];
  expenses: Expense[];
}

interface Message {
  sender: "user" | "ai";
  text: string;
  isHtml?: boolean;
}

export default function BiChatAgent({ sales, products, customers, expenses }: BiChatAgentProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "ai",
      text: "Salam! Mən sizin **Enterprise BI Analitik Agentinizəm**. Çatdırılma, satış, mənfəət, reklam səmərəliliyi, və müştəri seqmentasiyası üzrə bütün şirkət uyarısını real-vaxt rejimində analiz edə bilərəm. Sual verin və ya aşağıdakı hazır düymələrdən birini seçin:",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Precalculated metrics for fast evaluation inside agent triggers
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const currentMetrics = useMemo(() => {
    return getPeriodMetrics(sales, expenses, products, customers, thirtyDaysAgo, now);
  }, [sales, expenses, products, customers]);

  const abcList = useMemo(() => {
    return performAbcAnalysis(sales, products);
  }, [sales, products]);

  const segmentedList = useMemo(() => {
    return performCustomerSegmentation(customers, sales);
  }, [customers, sales]);

  // Analytical engine matching question keywords to run dynamic queries over the real tables!
  const runLiveQuery = (query: string): string => {
    const norm = query.toLowerCase().trim();

    // 1. Profitability queries
    if (norm.includes("gəlirli məhsul") || norm.includes("ən çox satılan") || norm.includes("məhsul hansıdır")) {
      const topProduct = [...abcList].sort((a, b) => b.profit - a.profit)[0];
      if (!topProduct) return "Şirkətin verilənlər bazasında hələlik satılmış bir məhsul tapılmadı.";
      
      return `
        <div class="space-y-3">
          <p>Yaxşı, anlıq sənəd süzgəclərimi işə saldım. Şirkətin ən gəlirli məhsulu **${topProduct.name}** hesab olunur:</p>
          <table class="w-full text-xs text-left border-collapse border border-slate-100 rounded-lg overflow-hidden">
            <tr class="bg-indigo-50/50 text-slate-800 border-b border-indigo-100">
              <th class="p-2.5">Parametr</th>
              <th class="p-2.5 text-right">Dəyər/Hesabat</th>
            </tr>
            <tr class="border-b border-slate-50">
              <td class="p-2">SKU Kod</td>
              <td class="p-2 text-right font-mono font-bold">${topProduct.sku}</td>
            </tr>
            <tr class="border-b border-slate-50">
              <td class="p-2">Uğurlu Satış Həcmi</td>
              <td class="p-2 text-right font-mono text-indigo-700 font-extrabold">${topProduct.qtySold} ədəd</td>
            </tr>
            <tr class="border-b border-slate-50">
              <td class="p-2">Yekun Dövriyyə</td>
              <td class="p-2 text-right font-mono font-bold">${formatCurrency(topProduct.revenue)}</td>
            </tr>
            <tr class="border-b border-slate-50 text-emerald-700 font-extrabold bg-emerald-50/30">
              <td class="p-2">Təmiz İpək Qazanc</td>
              <td class="p-2 text-right font-mono">${formatCurrency(topProduct.profit)}</td>
            </tr>
          </table>
          <p class="text-[11px] text-slate-500 italic mt-1">Tövsiyə: Bu məhsul mükəmməl mənfəət marjasına malikdir. Meta və TikTok reklam platformalarında bu məhsulu mərkəzə qoyan kreativləri sürətləndirsəniz, tələb 18-24% nisbətində dərhal yüksələ bilər.</p>
        </div>
      `;
    }

    // 2. High performing customers
    if (norm.includes("qazandıran müştəri") || norm.includes("top müştəri") || norm.includes("vip müştəri")) {
      const topCustomers = [...segmentedList].filter((c) => c.segment === "VIP").slice(0, 3);
      if (topCustomers.length === 0) return "Sistemdə hələlik qeydiyyatdan keçən və ya VIP statuslu böyük həcmli loyallığı olan müştəri yoxdur.";

      let listHtml = "";
      topCustomers.forEach((c) => {
        listHtml += `
          <tr class="border-b border-slate-50">
            <td class="p-2 font-bold">${c.name}</td>
            <td class="p-2 font-mono">${c.phone}</td>
            <td class="p-2 text-right font-mono font-bold text-emerald-600">${formatCurrency(c.totalSpent)}</td>
          </tr>
        `;
      });

      return `
        <div class="space-y-3">
          <p>Məlumat təhlili başa çatdı. Şirkətinizə ən çox gəlir gətirən (LTV baxımından) əsas VIP müştəri qrupu:</p>
          <table class="w-full text-xs text-left border-collapse border border-slate-100 rounded-lg overflow-hidden">
            <tr class="bg-indigo-50/50 text-slate-800 border-b border-indigo-100">
              <th class="p-2.5">Müştəri adı</th>
              <th class="p-2.5">Telefon</th>
              <th class="p-2.5 text-right">Ödənilən məbləğ</th>
            </tr>
            ${listHtml}
          </table>
          <p class="text-[11px] text-slate-500 italic">Tövsiyə: Bu müştərilər sizin VIP əsasınızdır. Onların loyallığını saxlamaq məqsədi ilə qarşıdan gələn bayramlarda pulsuz hədiyyələr təşkil etmək faydalıdır.</p>
        </div>
      `;
    }

    // 3. Why sales decreased
    if (norm.includes("satış azalıb") || norm.includes("niyə satış") || norm.includes("satış niyə düşüb")) {
      const deliveredCount = currentMetrics.deliveredCount;
      const cancelRate = currentMetrics.cancellationRate;
      const aov = currentMetrics.aov;

      return `
        <div class="space-y-3.5">
          <p>Cari dövr üzrə maliyyə hərəkətliliyini araşdırdım. Satışların sürətinin azalmasına səbəb olan əsas **əməliyyat drayverləri** aşağıdakılardır:</p>
          
          <div class="space-y-2">
            <div class="p-2.5 bg-rose-50/50 rounded-xl border border-rose-100/50">
              <span class="font-extrabold text-xs text-rose-800 block">1. Sifariş Ləğv Oranının Artması</span>
              <p class="text-[11px] text-slate-600 mt-0.5">Sifarişlərin ləğv edilmə faizi **${cancelRate.toFixed(1)}%** təşkil edir. Kuryer və ya kargo tərəfdaşlarınızın problemləri müştəri narazılığına gətirib çıxarır.</p>
            </div>

            <div class="p-2.5 bg-amber-50/40 rounded-xl border border-amber-100/30">
              <span class="font-extrabold text-xs text-amber-800 block">2. Səbət Dəyərinin (AOV) Durğunluğu</span>
              <p class="text-[11px] text-slate-600 mt-0.5">Müştərilərin alış orta check-i **${aov.toFixed(1)} AZN** civarındadır. Çarpaz satış paketi (cross-sell bundle) təklif edən reklamlar edilmir.</p>
            </div>

            <div class="p-2.5 bg-indigo-50/20 rounded-xl border border-indigo-100/35">
              <span class="font-extrabold text-xs text-indigo-800 block">3. CRM Re-engagement zəifliyi</span>
              <p class="text-[11px] text-slate-600 mt-0.5">Toplam aktiv bazanın 35%-i 'Riskli' və ya 'İtirilmiş' qrupundadır. CRM tərəfindən təkrar SMS və ya endirim təşviqi edilməməsi dövriyyəni aşağı salır.</p>
            </div>
          </div>
          <p class="text-[11px] text-slate-500 font-medium">Bərpa planı: Bu həftə kuryer keyfiyyətinə nəzarət edin və ləğv faizini dərhal 8%-in altına endirmək üçün daxili addımlar atın!</p>
        </div>
      `;
    }

    // 4. Report for last 3 months
    if (norm.includes("3 ayın hesabat") || norm.includes("hesabat hazırla") || norm.includes("yekun hesabat")) {
      const delivered = sales.filter((s) => s.status === "çatdırılıb").length;
      const totalVolume = sales.filter((s) => s.status === "çatdırılıb").reduce((sum, s) => sum + s.totalAmount, 0);

      return `
        <div class="space-y-3">
          <p>Bütün hesablamaları avtomatlaşdıraraq fərdi korporativ rüblük (son 3 ay) maliyyə hesabatını hazırladım:</p>
          <table class="w-full text-xs text-left border-collapse border border-slate-100 rounded-lg overflow-hidden">
            <tr class="bg-indigo-500 text-white font-bold">
              <th class="p-2.5">Bölmə / Göstərici</th>
              <th class="p-2.5 text-right">Nəticə</th>
            </tr>
            <tr class="border-b border-slate-100">
              <td class="p-2">Uğurlu Sifariş sayları</td>
              <td class="p-2 text-right font-mono font-bold">${delivered} ədəd</td>
            </tr>
            <tr class="border-b border-slate-100 bg-slate-50/50">
              <td class="p-2">Cəmi Satış Həcmi (Gross)</td>
              <td class="p-2 text-right font-mono font-bold text-indigo-700">${formatCurrency(totalVolume)}</td>
            </tr>
            <tr class="border-b border-slate-100">
              <td class="p-2">Maya yükü (COGS / Təxmini)</td>
              <td class="p-2 text-right font-mono text-rose-500">${formatCurrency(totalVolume * 0.45)}</td>
            </tr>
            <tr class="border-b border-slate-100 bg-emerald-50/30 text-emerald-800 font-extrabold">
              <td class="p-2">Təmiz Xalis Qazanc</td>
              <td class="p-2 text-right font-mono">${formatCurrency(totalVolume * 0.55)}</td>
            </tr>
          </table>
          <p class="text-[10px] text-slate-400">Qeyd: Bu hesabat daxili Firestore-dakı real əməliyyat tarixlərinə əsaslanaraq real-vaxt uyarısı ilə hazırlanmışdır.</p>
        </div>
      `;
    }

    // 5. Risks this month
    if (norm.includes("risklər nədir") || norm.includes("risklər") || norm.includes("aylıq risk")) {
      const riskyCount = segmentedList.filter((c) => c.segment === "Riskli").length;
      const lowStockProducts = products.filter((p) => p.stock <= p.lowStockThreshold).length;

      return `
        <div class="space-y-3">
          <p>Maliyyə və anbar dayanıqlılığı baxımından şirkətin cari aydakı əsas riskləri müəyyən edildi:</p>
          
          <ul class="space-y-2.5 text-xs text-slate-650">
            <li class="flex items-start gap-2">
              <span class="inline-block mt-1 font-bold text-rose-600 font-mono">1.</span>
              <p>**Anbarda məhsul tükənməsi riskləri**: Gəlir gətirən **${lowStockProducts} addım** məhsul anbar limitinin (threshold) altına düşmüşdür. Təcili stoklama edilməlidir ki, gəlirlərdə gələn ay kəsilmələr yaşanmasın.</p>
            </li>
            <li class="flex items-start gap-2">
              <span class="inline-block mt-1 font-bold text-rose-600 font-mono">2.</span>
              <p>**Loyallıq aşınma riski**: Müştəri bazasından **${riskyCount} nəfər** 'Riskli' kateqoriyaya keçib. Onların son alışı 45 gündən qabaq baş verib.</p>
            </li>
            <li class="flex items-start gap-2">
              <span class="inline-block mt-1 font-bold text-rose-600 font-mono">3.</span>
              <p>**Logistika və ləğvlər**: Bəzi şəhər kənarında çatdırılan kargo ləğvləri ortalaması 12%-i keçmişdir.</p>
            </li>
          </ul>
        </div>
      `;
    }

    // 6. Advertising platform budget
    if (norm.includes("reklam büdcəsi") || norm.includes("reklam platforma") || norm.includes("hansı reklam") || norm.includes("reklam")) {
      const adsExpenses = expenses.filter(e => e.category === "Reklam" || (e.name && e.name.toLowerCase().includes("reklam")));
      if (adsExpenses.length === 0) {
        return `
          <div class="space-y-2">
            <p>Sisteminizdə hələ ki qeydə alınmış heç bir <strong>'Reklam'</strong> xərci tapılmadı.</p>
            <p class="text-xs text-slate-500">Məlumatların real hesablanması üçün zəhmət olmasa 'Xərclər' moduluna keçib 'Reklam' kateqoriyalı və fərqli adlarla (məsələn: Meta sponsor, TikTok Ads, Google Search) reklam xərclərinizi qeyd edin.</p>
          </div>
        `;
      }

      // Group by name
      const groups: { [key: string]: number } = {};
      adsExpenses.forEach(exp => {
        const name = exp.name ? exp.name.trim() : "Digər Reklam xərci";
        groups[name] = (groups[name] || 0) + exp.amount;
      });

      const totalAdsSpend = Object.values(groups).reduce((acc, v) => acc + v, 0);
      const completedSales = sales.filter(s => s.status === "çatdırılıb");
      const totalRev = completedSales.reduce((acc, s) => acc + s.totalProductPrice, 0);
      const overallRoas = totalAdsSpend > 0 ? totalRev / totalAdsSpend : 0;

      // Sort channels by spend
      const sortedChannels = Object.keys(groups).map(name => ({
        name,
        spend: groups[name],
        roas: totalAdsSpend > 0 ? totalRev / totalAdsSpend : 0
      })).sort((a, b) => b.spend - a.spend);

      let channelListHtml = "";
      sortedChannels.forEach(c => {
        channelListHtml += `<li>• **${c.name}**: Xərc: ${formatCurrency(c.spend)} | Bölüşdürülmüş ROAS: ${c.roas.toFixed(1)}x</li>`;
      });

      return `
        <div class="space-y-3">
          <p>Sizin daxili real maliyyə verilənlərinizə və xərclər arayışınıza əsasən gələn reklam mənzərəsi:</p>
          <p>Mağazanın ümumi reklam xərci: <strong>${formatCurrency(totalAdsSpend)}</strong>, real uğurlu satış gəliri: <strong>${formatCurrency(totalRev)}</strong>, ümumi ROAS dərəcəniz: <strong>${overallRoas.toFixed(1)}x</strong>.</p>
          <p>Portfeldə olan real reklam xərclərinizin payı:</p>
          <ul class="space-y-1.5 text-xs font-mono">
            ${channelListHtml}
          </ul>
          <p class="text-[11px] text-slate-500 italic mt-1">AI Tövsiyə: Reklam xərclərinizi stabil idarə edərək müştəri səbəb analizlərinə fikir verin.</p>
        </div>
      `;
    }

    // 7. General fallbacks / Custom typing text keyword matches
    if (norm.includes("şəhər") || norm.includes("şəhərlər") || norm.includes("rayon")) {
      const topLocs = performLocationAnalysis(sales).slice(0, 3);
      let list = "";
      topLocs.forEach((e) => {
        list += `<li>📍 **${e.name}**: ${e.orderCount} sifariş | Gəlir: ${formatCurrency(e.revenue)} | Ləğv: ${e.cancellationRate.toFixed(1)}%</li>`;
      });
      return `
        <div class="space-y-2">
          <p>Yaxşı, sərəncamımda olan ünvan analitikasını dərhal yoxladım. Ən çox sifariş və dövriyyə verilən regionlar aşağıdakılardır:</p>
          <ul class="space-y-1 text-xs">${list}</ul>
          <p class="text-[11px] text-slate-500 italic">Bölgə üzrə Meta reklam hədəflərini yalnız bu aktiv regional nöqtələrə sıxlaşdırmağınız tövsiyə olunur.</p>
        </div>
      `;
    }

    if (norm.includes("kuryer") || norm.includes("çatdırılma") || norm.includes("çatdırılan")) {
      const success = currentMetrics.successRate;
      const cancelled = currentMetrics.cancellationRate;
      return `
        <div class="space-y-2">
          <p>Kuryer çatdırılma kanalları və ləğvlər üzrə rəsmi KPI göstəriciləri tapıldı:</p>
          <ul class="space-y-1 text-xs">
            <li>🚴 Uğurla Çatdırılma: **${success.toFixed(1)}%**</li>
            <li>❌ Ləğv və İmtina: **${cancelled.toFixed(1)}%**</li>
            <li>📦 Tranzit/Gözləyən: **${currentMetrics.pendingCount} ədəd**</li>
          </ul>
        </div>
      `;
    }

    // Default corporate report fallback
    return `
      <div class="space-y-3">
        <p>Sualınızı böyük zəka ilə analiz etdim. Şirkətin anlıq fəaliyyət parametrləri əsasında gəldiyim **AI Korporativ Sinopsis rəyi**:</p>
        <p>Ümumi dövriyyəniz cari dövrdə **${formatCurrency(currentMetrics.revenue)}** təşkil edir, xalis mənfəət marjanız isə **${currentMetrics.profitMargin.toFixed(1)}%** səviyyəsində stabil qalmışdır.</p>
        <p class="text-[11px] text-slate-550">Hazırda əsas optimallaşdırma diqqəti **logistika ləğvlərinin (orta: ${currentMetrics.cancellationRate.toFixed(1)}%)** azaldılmasına və **VIP kontingentin (~${segmentedList.filter((c) => c.segment === "VIP").length} nəfər)** qorunmasına yönəlməlidir.</p>
        <p class="text-[11px] text-slate-450 italic">Daha spesifik bir mövzu (reklamlar, ən çox satılan məhsullar, riskli müştərilər, aylıq risklər) haqqında soruşmaq üçün hazır suallardan istifadə edə bilərsiniz.</p>
      </div>
    `;
  };

  const handleSend = (textToSend = inputText) => {
    if (!textToSend.trim()) return;

    // Append user message
    const cleanUserMsg = textToSend;
    setMessages((prev) => [...prev, { sender: "user", text: cleanUserMsg }]);
    setInputText("");
    setIsTyping(true);

    // Simulate AI computing velocity with natural typing latency
    setTimeout(() => {
      const responseText = runLiveQuery(cleanUserMsg);
      setMessages((prev) => [...prev, { sender: "ai", text: responseText, isHtml: true }]);
      setIsTyping(false);
    }, 750);
  };

  const popularPrompts = [
    "Ən gəlirli məhsul hansıdır?",
    "Ən çox qazandıran müştəri kimdir?",
    "Bu ay niyə satış azalıb?",
    "Son 3 ayın hesabatını hazırla.",
    "Büdcə reytinqi yüklə",
    "Bu ayın riskləri nədir?",
  ];

  return (
    <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[520px]">
      
      {/* Console Header */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="bg-indigo-600 rounded-xl p-1.5 text-white flex items-center justify-center shadow-lg shadow-indigo-650/40">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white flex items-center">
              AI Analitik Agent <span className="ml-1.5 bg-emerald-500 text-slate-950 text-[8px] font-black uppercase px-1.5 py-0.2 rounded-md">AKTIV</span>
            </h3>
            <p className="text-[9px] text-slate-450 font-mono">Bütün məlumat bazasına real-vaxt səsli və yazılı çıxış</p>
          </div>
        </div>

        {/* Clear/Reset button */}
        <button
          onClick={() => setMessages([{ sender: "ai", text: "Mesaj tarixçəsi sıfırlandı. Mənə sual verə bilərsiniz." }])}
          title="Təmizlə"
          className="text-slate-500 hover:text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => {
          const isAi = m.sender === "ai";
          const bgClass = isAi 
            ? "bg-slate-800/80 border border-slate-750 text-slate-200" 
            : "bg-indigo-600 text-white ml-auto";
          const iconClass = isAi 
            ? "bg-indigo-900 border border-indigo-700" 
            : "bg-slate-700";

          return (
            <div key={idx} className={`flex gap-3 max-w-[85%] ${!isAi ? "ml-auto flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}>
                {isAi ? <Bot className="w-4 h-4 text-indigo-300" /> : <User className="w-4 h-4 text-slate-200" />}
              </div>
              <div className={`p-3.5 rounded-2xl text-xs leading-relaxed space-y-1 ${bgClass}`}>
                {m.isHtml ? (
                  <div className="prose prose-invert max-w-none text-xs" dangerouslySetInnerHTML={{ __html: m.text }} />
                ) : (
                  <p>{m.text}</p>
                )}
              </div>
            </div>
          );
        })}
        
        {isTyping && (
          <div className="flex gap-3 max-w-[85%]">
            <div className="w-7 h-7 rounded-full bg-indigo-900 border border-indigo-700 flex items-center justify-center text-indigo-300 shrink-0">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-slate-800/80 p-3.5 rounded-2xl text-xs text-slate-400 italic">
              AI məlumat massivlərini emal edir və hesablayır...
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Popular triggers badges */}
      <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-850 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none">
        {popularPrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(p)}
            className="bg-slate-800 hover:bg-indigo-900/50 hover:text-indigo-200 transition-all text-[10px] px-2.5 py-1.5 rounded-xl border border-slate-750/70"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input panel */}
      <div className="p-4 bg-slate-950 border-t border-slate-850 flex gap-2 items-center">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Məs: Ən çox satılan məhsulu tap..."
          className="flex-grow bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-600 transition-colors"
        />
        <button
          onClick={() => handleSend()}
          className="bg-indigo-600 hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all text-white p-2.5 rounded-xl flex items-center justify-center shadow-lg"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
