import React, { useState, useRef, useEffect } from "react";
import { useData } from "../context/DataContext";
import { 
  Database, 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  Users, 
  Package, 
  Bike, 
  DollarSign, 
  Receipt, 
  Zap, 
  Copy, 
  Check, 
  RotateCcw, 
  BrainCircuit, 
  ShieldCheck, 
  TrendingUp, 
  AlertTriangle,
  Volume2,
  VolumeX,
  MessageSquare,
  Search
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: string;
}

export default function MasterDataAgentView() {
  const { sales, customers, products, couriers, expenses, settings } = useData();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "agent",
      text: `<b>Salam! Mən Ayvel Bütün Bazaya Çıxışı Olan Baş AI Agentiyəm.</b><br/><br/>
Mənim tətbiqin bütün məlumatlarına (<b>${sales.length} Satış</b>, <b>${customers.length} Müştəri</b>, <b>${products.length} Məhsul</b>, <b>${couriers.length} Kuryer</b>, <b>${expenses.length} Xərc</b>) real vaxtda tam və birbaşa çıxışım var.<br/><br/>
Aşağıdakı hazır sorğulardan birini seçə və ya istədiyiniz mürəkkəb sualı verə bilərsiniz!`,
      timestamp: new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })
    }
  ]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Handle asking Master AI Agent
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInput("");
    setLoading(true);

    try {
      // Send conversation history + optimized live context
      const history = messages
        .filter(m => m.id !== "welcome")
        .slice(-10) // Keep last 10 messages to keep prompt clean
        .map(m => ({ role: m.role, text: m.text }));

      // Send essential fields of entities to keep JSON small & lightweight
      const optimizedSales = sales.slice(0, 150).map(s => ({
        id: s.id,
        orderNumber: s.orderNumber,
        createdAt: s.createdAt,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        totalAmount: s.totalAmount,
        deliveryCost: s.deliveryCost,
        status: s.status,
        courierName: s.courierName || s.courierId,
        items: Array.isArray(s.items) ? s.items.map(i => ({
          productId: i.productId,
          productName: i.productName || i.name,
          qty: i.qty,
          unitPrice: i.unitPrice || i.price
        })) : []
      }));

      const optimizedCustomers = customers.slice(0, 150).map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        totalOrders: c.totalOrders,
        totalSpent: c.totalSpent,
        loyaltyPoints: c.loyaltyPoints,
        address: c.address
      }));

      const optimizedProducts = products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        costPrice: p.costPrice,
        stock: p.stock,
        code: p.code
      }));

      const optimizedCouriers = couriers.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        stockBalance: c.stockBalance,
        totalDeliveries: c.totalDeliveries,
        balance: c.balance
      }));

      const optimizedExpenses = expenses.slice(0, 150).map(e => ({
        date: e.date,
        category: e.category,
        amount: e.amount,
        description: e.description || e.recipient
      }));

      const res = await fetch("/api/gemini/master-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: query,
          history,
          clientContext: {
            sales: optimizedSales,
            customers: optimizedCustomers,
            products: optimizedProducts,
            couriers: optimizedCouriers,
            expenses: optimizedExpenses,
            settings
          }
        })
      });

      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Non-JSON response received:", responseText);
        data = { error: `Server cavabı xəta qaytardı (${res.status} ${res.statusText}). Zəhmət olmasa yenidən cəhd edin.` };
      }

      if (res.ok && data.result) {
        const agentMsg: Message = {
          id: `agent-${Date.now()}`,
          role: "agent",
          text: data.result,
          timestamp: new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })
        };
        setMessages(prev => [...prev, agentMsg]);
      } else {
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: "agent",
          text: `⚠️ <b>Xəta baş verdi:</b> ${data.error || "Master Agent verilənlər bazası ilə əlaqə qura bilmədi."}`,
          timestamp: new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (err) {
      console.error("Master agent request error:", err);
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: "agent",
        text: "⚠️ <b>Şəbəkə xətası:</b> Serverlə əlaqə kəsildi. Zəhmət olmasa yenidən cəhd edin.",
        timestamp: new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    const cleanText = text.replace(/<\/?[^>]+(>|$)/g, "");
    navigator.clipboard.writeText(cleanText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSpeak = (id: string, text: string) => {
    if ("speechSynthesis" in window) {
      if (speakingId === id) {
        window.speechSynthesis.cancel();
        setSpeakingId(null);
        return;
      }
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/<\/?[^>]+(>|$)/g, "");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "az-AZ";
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: "welcome",
        role: "agent",
        text: `<b>Çat tarixçəsi sıfırlandı.</b><br/>
Mən hazırda bütün məlumat bazasına bağlanmışam. Növbəti sualınızı verə bilərsiniz!`,
        timestamp: new Date().toLocaleTimeString("az-AZ", { hour: "2-digit", minute: "2-digit" })
      }
    ]);
  };

  // Quick prompt presets
  const presets = [
    {
      icon: Users,
      label: "Top 5 Müştərilər",
      prompt: "Bazada ən çox alış-veriş edən və ən çox xərcləyən top 5 müştərimizi adları, telefonları, sifariş sayları və cəmi xərclədikləri məbləğlə sırala."
    },
    {
      icon: Package,
      label: "Stoku Bitişən Məhsullar",
      prompt: "Anbarda stoku 5-dən az qalan məhsulları, onların satış qiyməti, maya dəyəri və anbar qalığı ilə göstər. Təcili sifariş verilməli olanları bildir."
    },
    {
      icon: Bike,
      label: "Kuryer Stoqları və Borcları",
      prompt: "Aktiv kuryerlərin əlində olan məhsul stokunu, çatdırılma sayını və kuryer balanslarını/borclarını təfərrüatlı analiz et."
    },
    {
      icon: TrendingUp,
      label: "Mənfəət Marşası Analizi",
      prompt: "Məhsullarımız arasından mənfəət marşası (profit margin) ən yüksək və ən aşağı olan məhsulları müqayisə et, tövsiyələr ver."
    },
    {
      icon: Receipt,
      label: "Ən Böyük Xərclər",
      prompt: "Bazada qeydə alınmış xərclərin kateqoriyalara görə bölgüsünü və ən böyük xərc maddələrini çıxar."
    },
    {
      icon: Search,
      label: "Sonn 10 Sifariş Analizi",
      prompt: "Sistemdəki ən son 10 sifarişin təfərrüatlı tərkibini, müştərilərini, çatdırılma statuslarını və kuryerlərini siyahıla."
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* Top Banner & Scope Overview */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-indigo-500/20">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-10">
          <BrainCircuit className="w-96 h-96 text-indigo-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 px-3.5 py-1 rounded-full text-xs font-bold text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>FULL DATABASE ACCESS ACTIVE</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
              <Bot className="w-8 h-8 text-indigo-400" />
              <span>Bütün Datalara Çıxışlı AI Agent</span>
            </h1>
            <p className="text-slate-300 text-xs md:text-sm max-w-2xl leading-relaxed">
              Ayvel biznes sisteminin bütün satışları, müştəriləri, anbar məhsulları, kuryerləri və xərclərini real vaxtda analiz edən master süni intellekt köməkçisi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearHistory}
              className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tarixçəni Təmizlə</span>
            </button>
          </div>
        </div>

        {/* Live Database Scope Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-5 border-t border-indigo-500/20 text-xs">
          <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-300 shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Satışlar</p>
              <p className="font-extrabold text-white text-sm">{sales.length} ədəd</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 rounded-xl text-blue-300 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Müştərilər</p>
              <p className="font-extrabold text-white text-sm">{customers.length} nəfər</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-300 shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Məhsullar</p>
              <p className="font-extrabold text-white text-sm">{products.length} çeşid</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-300 shrink-0">
              <Bike className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Kuryerlər</p>
              <p className="font-extrabold text-white text-sm">{couriers.length} nəfər</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-2.5 rounded-2xl flex items-center gap-2.5 col-span-2 sm:col-span-1">
            <div className="p-2 bg-rose-500/20 rounded-xl text-rose-300 shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Xərclər</p>
              <p className="font-extrabold text-white text-sm">{expenses.length} qeyd</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Presets Buttons Bar */}
      <div className="space-y-2">
        <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span>Baza Üzrə Sürətli Analiz Sorğuları:</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {presets.map((p, idx) => {
            const IconComponent = p.icon;
            return (
              <button
                key={idx}
                onClick={() => handleSendMessage(p.prompt)}
                disabled={loading}
                className="p-3 bg-white hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-200 rounded-2xl text-left transition-all shadow-xs group cursor-pointer flex flex-col justify-between space-y-1.5"
              >
                <div className="p-1.5 bg-slate-100 group-hover:bg-indigo-100 rounded-xl text-slate-700 group-hover:text-indigo-700 w-fit">
                  <IconComponent className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-900 leading-tight">
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[580px]">
        
        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-slate-50/50">
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
                    <Bot className="w-5 h-5" />
                  </div>
                )}

                <div className={`space-y-1.5 max-w-[85%] md:max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
                  <div className={`flex items-center gap-2 text-[11px] font-bold ${isUser ? "justify-end text-slate-500" : "text-indigo-900"}`}>
                    <span>{isUser ? "Siz" : "Ayvel Master Agent"}</span>
                    <span>•</span>
                    <span className="text-slate-400 font-mono text-[10px]">{msg.timestamp}</span>
                  </div>

                  <div
                    className={`p-4 rounded-2xl text-xs md:text-sm leading-relaxed ${
                      isUser
                        ? "bg-indigo-600 text-white rounded-tr-none font-medium shadow-xs"
                        : "bg-white text-slate-800 border border-slate-200/80 rounded-tl-none shadow-xs"
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div 
                        className="prose prose-xs max-w-none text-slate-800 space-y-2"
                        dangerouslySetInnerHTML={{ __html: msg.text }}
                      />
                    )}
                  </div>

                  {!isUser && (
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-600 flex items-center gap-1 transition-all cursor-pointer"
                        title="Metni kopyala"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Kopyalandı</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Kopyala</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleSpeak(msg.id, msg.text)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          speakingId === msg.id
                            ? "bg-indigo-100 text-indigo-700 border border-indigo-300"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                        }`}
                        title="Səsləndir"
                      >
                        {speakingId === msg.id ? (
                          <>
                            <VolumeX className="w-3 h-3 text-indigo-600" />
                            <span>Dayandır</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>Oxu</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-9 h-9 rounded-2xl bg-slate-800 text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
                    <User className="w-5 h-5" />
                  </div>
                )}
              </motion.div>
            );
          })}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none shadow-xs text-xs font-bold text-indigo-900 flex items-center gap-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                </div>
                <span>Baza verilənləri üzrə dərin sorğu emal edilir...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 bg-white border-t border-slate-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bütün bazaya sual verin (məs: Top 5 müştəri kimdir? Stokda bitən nə var?)..."
              disabled={loading}
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-extrabold rounded-2xl text-xs md:text-sm flex items-center gap-2 transition-all shadow-xs cursor-pointer shrink-0"
            >
              <span>Sorğula</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

      </div>

    </div>
  );
}
