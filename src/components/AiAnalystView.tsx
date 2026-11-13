import React, { useState } from "react";
import { useData } from "../context/DataContext";
import { 
  Sparkles, 
  Send, 
  Brain, 
  TrendingUp, 
  FileText, 
  Activity, 
  Layers, 
  HelpCircle,
  Copy,
  Check,
  Bike,
  Package,
  RotateCcw,
  Mic,
  MapPin,
  Bot
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import LiveVoiceModal from "./LiveVoiceModal";
import MapsGroundingView from "./MapsGroundingView";
import MasterDataAgentView from "./MasterDataAgentView";

export default function AiAnalystView() {
  const { sales, expenses, products, couriers, settings } = useData();

  const [activeTab, setActiveTab] = useState<"master_agent" | "analyst" | "maps">("master_agent");
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Client-side quick metrics
  const activeCouriersCount = couriers.filter(c => c.status === "active").length;
  const numProducts = products.length;
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const deliveredSales = sales.filter(s => s.status === "çatdırılıb");
  const totalSalesRev = deliveredSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);

  const today = new Date().toLocaleDateString("az-AZ", { day: "2-digit", month: "long" });

  const presets = [
    {
      title: "📊 Gəlir & Xərc Təhlili",
      prompt: "Bu günün və cari ayın ətraflı maliyyə, gəlir, xərc və xalis mənfəət təhlilini ver, harada qənaət edə biləcəyimizi göstər.",
      desc: "Ətraflı maliyyə sağlamlığı"
    },
    {
      title: "📈 Satış Proqnozu",
      prompt: "Ayın qalan günləri üçün satış temposunu proqnozlaşdır. Hansı göstəricilərə çatacağımızı və hədəfi aşmaq üçün nə etməli olduğumuzu riyazi hesabla.",
      desc: "Satış proqnozu və hədəflər"
    },
    {
      title: "📋 Satışları Artırma Planı",
      prompt: "Biznesimizin satışlarını sürətlə 2 dəfə artırmaq üçün fəaliyyət yönümlü, rəqəmsəl, sosial media reklam xərclərini optimallaşdıran hərtərəfli strategic plan (fəaliyyət hədəfləri planı) tərtib et.",
      desc: "Fəaliyyət hədəfli fəaliyyət planı"
    },
    {
      title: "🚴 Kuryer & Eləcədə Stok",
      prompt: "Aktiv kuryerlərin stoku, anbar məhsullarının qalıq vəziyyətlərini analiz et. Hansı malların bitmək üzrə olduğunu və kuryer balansını necə tənzimləməli olduğumuzu bildir.",
      desc: "Stok və loqistika analizi"
    }
  ];

  const handleAskAI = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;
    setLoading(true);
    setAnswer(null);
    setCopied(false);

    try {
      const res = await fetch("/api/gemini/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: textToSend })
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setAnswer(data.result);
      } else {
        setAnswer(data.error || "Təəssüf ki, sorğunun cavablandırılmasında xəta baş verdi.");
      }
    } catch (err) {
      console.error(err);
      setAnswer("Sistemlə əlaqə qurularkən şəbəkə xətası baş verdi.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!answer) return;
    navigator.clipboard.writeText(answer.replace(/<\/?[^>]+(>|$)/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderFormattedAnswer = (text: string) => {
    const formatted = text.split("\n").map((line, index) => {
      let processed = line
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/<b>(.*?)<\/b>/g, "<strong>$1</strong>")
        .replace(/<i>(.*?)<\/i>/g, "<em>$1</em>")
        .replace(/<u>(.*?)<\/u>/g, "<u class='underline'>$1</u>")
        .replace(/<code>(.*?)<\/code>/g, "<code class='bg-slate-100 px-2 py-0.5 rounded font-mono text-xs text-indigo-700'>$1</code>");

      return (
        <p 
          key={index} 
          className="mb-3 text-slate-700 leading-relaxed text-sm"
          dangerouslySetInnerHTML={{ __html: processed }}
        />
      );
    });

    return <div className="space-y-1">{formatted}</div>;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Voice Live Modal Trigger */}
      <LiveVoiceModal 
        isOpen={isVoiceModalOpen} 
        onClose={() => setIsVoiceModalOpen(false)} 
      />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-1/3 -translate-y-1/3 w-96 h-96 bg-white/5 rounded-full pointer-events-none blur-3xl"></div>
        <div className="space-y-1.5 z-10">
          <div className="inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-blue-300" />
            <span>Ayvel Gemini AI Suite</span>
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">İntellektual AI Köməkçi Qərargahı</h2>
          <p className="text-xs text-blue-100/80 font-medium">Səsli canlı həmsöhbət (Live API), analitika proqnozu və Google Maps ünvan axtarışı.</p>
        </div>

        <div className="flex items-center gap-2 z-10 shrink-0 self-start md:self-auto">
          {/* Live Voice Button */}
          <button
            onClick={() => setIsVoiceModalOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-lg hover:shadow-xl transition-all cursor-pointer"
          >
            <Mic className="w-4 h-4" />
            <span>Canlı Səsli Əlaqə (Live API)</span>
          </button>
        </div>
      </div>

      {/* Module Mode Switcher */}
      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-xs">
        <button
          onClick={() => setActiveTab("master_agent")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "master_agent"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Bot className="w-4 h-4 text-indigo-400" />
          <span>Bütün Datalara Çıxışlı AI Agent</span>
          <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 text-[9px] rounded font-mono font-bold">FULL DATA</span>
        </button>

        <button
          onClick={() => setActiveTab("analyst")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "analyst"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Brain className="w-4 h-4" />
          <span>Analitika & Proqnoz</span>
        </button>

        <button
          onClick={() => setActiveTab("maps")}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "maps"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Google Maps Axtarışı</span>
        </button>

        <button
          onClick={() => setIsVoiceModalOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-800 hover:bg-slate-200 transition-all flex items-center gap-2 cursor-pointer border border-slate-200"
        >
          <Mic className="w-4 h-4 text-emerald-600" />
          <span>Səsli Danışıq</span>
        </button>
      </div>

      {activeTab === "master_agent" ? (
        <MasterDataAgentView />
      ) : activeTab === "maps" ? (
        <MapsGroundingView />
      ) : (
        <>
          {/* Bento Stats Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cəmi Satış</span>
                <div className="p-1 rounded-lg bg-blue-50 text-blue-600"><TrendingUp className="w-3.5 h-3.5" /></div>
              </div>
              <p className="text-lg font-black text-slate-800 mt-2">{totalSalesRev} AZN</p>
              <span className="text-[10px] text-emerald-600 font-semibold">{deliveredSales.length} çatdırılmış sifariş</span>
            </div>

            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cəmi Xərc</span>
                <div className="p-1 rounded-lg bg-rose-50 text-rose-600"><Layers className="w-3.5 h-3.5" /></div>
              </div>
              <p className="text-lg font-black text-slate-800 mt-2">{totalExpenses} AZN</p>
              <span className="text-[10px] text-slate-500">{expenses.length} xərc qeydi</span>
            </div>

            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kuryer Stoqları</span>
                <div className="p-1 rounded-lg bg-amber-50 text-amber-600"><Bike className="w-3.5 h-3.5" /></div>
              </div>
              <p className="text-lg font-black text-slate-800 mt-2">{activeCouriersCount} Aktiv</p>
              <span className="text-[10px] text-slate-500">Hazırda çatdırılmada</span>
            </div>

            <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Anbar Məhsul</span>
                <div className="p-1 rounded-lg bg-indigo-50 text-indigo-600"><Package className="w-3.5 h-3.5" /></div>
              </div>
              <p className="text-lg font-black text-slate-800 mt-2">{numProducts} Çeşid</p>
              <span className="text-[10px] text-indigo-600 font-semibold">{products.reduce((acc,p)=>acc+p.stock, 0)} ədəd ümumi stok</span>
            </div>
          </div>

          {/* Central Workspace Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left Side: Presets and Quick Actions */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-xs space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
                  <Brain className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-950">Sürətli Təhlil Modelləri</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">Aşağıdakı analitika və plan hədəfləri şablonlarından birini klikləyərək sistem rəqəmləri üzərindən avtomatik AI hesabatı yarada bilərsiniz.</p>

                <div className="space-y-2.5 pt-1">
                  {presets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setPrompt(preset.prompt);
                        handleAskAI(preset.prompt);
                      }}
                      disabled={loading}
                      className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-slate-50/50 transition-all cursor-pointer group disabled:opacity-60"
                    >
                      <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 flex items-center justify-between">
                        <span>{preset.title}</span>
                        <Sparkles className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-indigo-500 transition-opacity" />
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{preset.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompting instruction panel */}
              <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
                <div className="absolute -bottom-8 -right-8 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl"></div>
                <div className="flex items-center gap-2 text-indigo-400 mb-2.5">
                  <HelpCircle className="w-4 h-4" />
                  <h4 className="text-xs font-bold leading-none uppercase tracking-wide">Qeyd və Nəzarət</h4>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  AI köməkçimiz birbaşa <b>Telegram</b> qrupunuzla da sinxronlaşdırılıb! Admin və ya menecerlərin Telegram vasitəsilə soruşduğu bütün analitik suallara qrupda real vaxtda cavab verilir.
                </p>
              </div>
            </div>

            {/* Right Side: Interactive AI Assistant Console */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white border border-slate-100 rounded-3xl shadow-xs overflow-hidden flex flex-col min-h-[480px]">
                
                {/* Console Header */}
                <div className="bg-slate-50/75 border-b border-slate-100 px-5 py-4 flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-100 rounded-xl text-indigo-700">
                      <Brain className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 leading-none">Interaktiv Analitik Konsol</h3>
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Gemini Flash engine
                      </span>
                    </div>
                  </div>

                  {answer && (
                    <button
                      onClick={() => {
                        setAnswer(null);
                        setPrompt("");
                      }}
                      className="px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-150 rounded-lg hover:bg-slate-50 flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Yenilə
                    </button>
                  )}
                </div>

                {/* Response Canvas */}
                <div className="flex-1 p-5 overflow-y-auto space-y-4">
                  <AnimatePresence mode="wait">
                    {!answer && !loading && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4"
                      >
                        <div className="w-16 h-16 bg-indigo-50/50 text-indigo-500 rounded-full flex items-center justify-center border-2 border-dashed border-indigo-150">
                          <Brain className="w-8 h-8" />
                        </div>
                        <div className="space-y-1.5 max-w-sm">
                          <h4 className="text-xs font-extrabold text-slate-800">Sual-Cavab və Proqnozlaşdırma</h4>
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            Yuxarıdakı hazır şablonlardan birini seçin və ya aşağıdakı daxiletmə sahəsindən xüsusi proqnoz, analiz və ya hədəf plan sualınızı yazaraq soruşun.
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {loading && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex flex-col items-center justify-center p-12 text-center space-y-3"
                      >
                        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                        <div className="space-y-1 pt-2">
                          <h4 className="text-xs font-bold text-slate-850">Göstəricilər emal olunur...</h4>
                          <p className="text-[10px] text-slate-400 font-mono">Baza göstəriciləri toplanır və Gemini proqnozlaşdırma modeli ilə təhlil aparılır.</p>
                        </div>
                      </motion.div>
                    )}

                    {answer && !loading && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 flex items-start gap-2.5">
                          <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                          <div>
                            <h4 className="text-[11px] font-bold text-indigo-850 leading-none">Analitikin Rəyi və Strategiya Hesabatı</h4>
                            <p className="text-[10px] text-indigo-600 mt-1 font-semibold">{today} tarixində real-vaxt verilənləri ilə generasiya edildi.</p>
                          </div>
                        </div>

                        <div className="bg-white border border-slate-100 p-5 rounded-2xl block relative">
                          {renderFormattedAnswer(answer)}

                          <div className="flex justify-end pt-4 border-t border-slate-50 mt-4 gap-2">
                            <button
                              onClick={handleCopy}
                              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                            >
                              {copied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-emerald-700">Kopyalandı!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Planı Kopyala</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Input Composer */}
                <div className="p-4 bg-slate-50/75 border-t border-slate-100">
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAskAI(prompt);
                    }}
                    className="flex gap-2.5"
                  >
                    <input
                      type="text"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Baş analitikdən soruşun... (Məs: Bu ay sonuna mənfəət proqnozu nədir?)"
                      disabled={loading}
                      className="flex-1 bg-white border border-slate-200 px-4 py-3 rounded-2xl text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-indigo-500 text-slate-800 disabled:opacity-70 shadow-inner"
                    />
                    
                    <button
                      type="submit"
                      disabled={loading || !prompt.trim()}
                      className="px-5 py-3 bg-gradient-to-tr from-blue-750 via-indigo-750 to-indigo-800 hover:from-indigo-800 hover:to-blue-800 text-white rounded-2xl font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? (
                        <span>Təhlil edilir...</span>
                      ) : (
                        <>
                          <span>Göndər</span>
                          <Send className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </form>
                </div>

              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
