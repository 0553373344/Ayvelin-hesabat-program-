import React, { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import { motion, AnimatePresence } from "motion/react";
import { 
  Gift, 
  Search, 
  Settings2, 
  TrendingUp, 
  Award, 
  Coins, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  X, 
  Copy, 
  Check, 
  RotateCcw, 
  User, 
  Ticket, 
  History, 
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Undo2,
  Trash2,
  Info,
  ChevronRight
} from "lucide-react";
import { Customer, LoyaltyReward } from "../types";

const DEFAULT_REWARDS: LoyaltyReward[] = [
  { id: "r1", name: "5 AZN Endirim Kuponu", pointsCost: 50, description: "Bütün sifarişlərdə keçərli 5 ₼ nağd endirim" },
  { id: "r2", name: "15 AZN Endirim Kuponu", pointsCost: 120, description: "Bütün sifarişlərdə keçərli 15 ₼ nağd endirim" },
  { id: "r3", name: "Pulsuz Çatdırılma", pointsCost: 30, description: "Növbəti sifarişinizdə pulsuz kuryer çatdırılması" },
  { id: "r4", name: "Xüsusi Müştəri Hədiyyəsi", pointsCost: 200, description: "Mağazamız tərəfindən xüsusi premium korporativ hədiyyə" }
];

export default function LoyaltyProgramView() {
  const { 
    customers, 
    sales,
    settings, 
    saveSettings, 
    saveCustomer, 
    addToast 
  } = useData();

  // Settings & Ratio
  const currentRatio = settings.loyaltyRatio || 10;
  const rewardsList = settings.loyaltyRewards || DEFAULT_REWARDS;

  // Local component UI states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newRatio, setNewRatio] = useState<number>(currentRatio);
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardPoints, setNewRewardPoints] = useState<number>(50);
  const [newRewardDesc, setNewRewardDesc] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<"all" | "bronze" | "silver" | "gold" | "platinum">("all");
  const [sortBy, setSortBy] = useState<"points" | "spend" | "orders" | "name">("points");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Selected customer for Loyalty modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  // Point adjustment form states
  const [adjustAmount, setAdjustAmount] = useState<number>(10);
  const [adjustType, setAdjustType] = useState<"add" | "sub">("add");
  const [adjustReason, setAdjustReason] = useState("");

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Helper: Calculate customer tier dynamically
  const getCustomerLoyaltyInfo = (customer: Customer) => {
    const cleanPhone = (p: string) => p ? p.replace(/\D/g, "") : "";
    const cPhoneClean = cleanPhone(customer.phone);
    const custSales = sales.filter(s => {
      const sPhoneClean = cleanPhone(s.customerPhone || "");
      if (!cPhoneClean || !sPhoneClean) return false;
      return sPhoneClean === cPhoneClean || 
             (sPhoneClean.length >= 9 && cPhoneClean.length >= 9 && 
              sPhoneClean.slice(-9) === cPhoneClean.slice(-9));
    });
    const deliveredSales = custSales.filter(s => s.status === "çatdırılıb");
    const orders = deliveredSales.length;
    const spent = deliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

    let tier: "bronze" | "silver" | "gold" | "platinum" = "bronze";
    let tierName = "Tunc";
    let colorClass = "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/30";
    let nextTierText = "";
    let progressToNext = 100;

    if (orders >= 15 || spent >= 800) {
      tier = "platinum";
      tierName = "Platin ✨";
      colorClass = "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/30";
      nextTierText = "Maksimum dərəcə!";
      progressToNext = 100;
    } else if (orders >= 7 || spent >= 350) {
      tier = "gold";
      tierName = "Qızıl 🏆";
      colorClass = "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/30";
      const remainingOrders = 15 - orders;
      const remainingSpent = 800 - spent;
      nextTierText = `Platin dərəcə üçün: ${remainingOrders} sifariş və ya ${remainingSpent > 0 ? remainingSpent.toFixed(0) : 0} ₼ qaldı`;
      progressToNext = Math.min(100, Math.round(((orders - 7) / 8) * 100));
    } else if (orders >= 3 || spent >= 150) {
      tier = "silver";
      tierName = "Gümüş 🥈";
      colorClass = "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700/50";
      const remainingOrders = 7 - orders;
      const remainingSpent = 350 - spent;
      nextTierText = `Qızıl dərəcə üçün: ${remainingOrders} sifariş və ya ${remainingSpent > 0 ? remainingSpent.toFixed(0) : 0} ₼ qaldı`;
      progressToNext = Math.min(100, Math.round(((orders - 3) / 4) * 100));
    } else {
      tier = "bronze";
      tierName = "Tunc 🥉";
      colorClass = "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/10";
      const remainingOrders = 3 - orders;
      const remainingSpent = 150 - spent;
      nextTierText = `Gümüş dərəcə üçün: ${remainingOrders} sifariş və ya ${remainingSpent > 0 ? remainingSpent.toFixed(0) : 0} ₼ qaldı`;
      progressToNext = Math.min(100, Math.round((orders / 3) * 100));
    }

    // Points calculations
    const pointsFromSpent = Math.floor(spent / currentRatio);
    const adjustment = customer.loyaltyPointsAdjustment || 0;
    const earnedPoints = pointsFromSpent + adjustment;
    const spentPoints = customer.spentPoints || 0;
    const availablePoints = Math.max(0, earnedPoints - spentPoints);

    return {
      tier,
      tierName,
      colorClass,
      nextTierText,
      progressToNext,
      earnedPoints,
      spentPoints,
      availablePoints,
      orders,
      spent
    };
  };

  // Process all loyalty members
  const loyaltyMembers = useMemo(() => {
    return customers.map(c => {
      const stats = getCustomerLoyaltyInfo(c);
      return {
        ...c,
        orderCount: stats.orders,
        totalSpent: stats.spent,
        loyaltyStats: stats
      };
    });
  }, [customers, sales, currentRatio]);

  // Filters and search
  const filteredMembers = useMemo(() => {
    return loyaltyMembers.filter(m => {
      const matchSearch = 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.phone.includes(searchQuery);
      
      const matchTier = selectedTier === "all" || m.loyaltyStats.tier === selectedTier;

      return matchSearch && matchTier;
    }).sort((a, b) => {
      let multiplier = sortOrder === "desc" ? -1 : 1;
      if (sortBy === "points") {
        return (a.loyaltyStats.availablePoints - b.loyaltyStats.availablePoints) * multiplier;
      } else if (sortBy === "spend") {
        return (a.totalSpent - b.totalSpent) * multiplier;
      } else if (sortBy === "orders") {
        return (a.orderCount - b.orderCount) * multiplier;
      } else {
        return a.name.localeCompare(b.name) * multiplier;
      }
    });
  }, [loyaltyMembers, searchQuery, selectedTier, sortBy, sortOrder]);

  // General statistics
  const loyaltyStatsSum = useMemo(() => {
    let totalMembers = loyaltyMembers.length;
    let totalPoints = 0;
    let totalSpentPoints = 0;
    let totalCoupons = 0;
    let activeCoupons = 0;

    let bronzeCount = 0;
    let silverCount = 0;
    let goldCount = 0;
    let platinumCount = 0;

    loyaltyMembers.forEach(m => {
      totalPoints += m.loyaltyStats.earnedPoints;
      totalSpentPoints += m.loyaltyStats.spentPoints;
      
      if (m.loyaltyStats.tier === "bronze") bronzeCount++;
      else if (m.loyaltyStats.tier === "silver") silverCount++;
      else if (m.loyaltyStats.tier === "gold") goldCount++;
      else if (m.loyaltyStats.tier === "platinum") platinumCount++;

      if (m.redeemedRewards) {
        totalCoupons += m.redeemedRewards.length;
        activeCoupons += m.redeemedRewards.filter(r => r.status === "active").length;
      }
    });

    return {
      totalMembers,
      totalPoints,
      totalSpentPoints,
      totalCoupons,
      activeCoupons,
      bronzeCount,
      silverCount,
      goldCount,
      platinumCount
    };
  }, [loyaltyMembers]);

  // Selected Customer details
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return loyaltyMembers.find(m => m.id === selectedCustomerId) || null;
  }, [selectedCustomerId, loyaltyMembers]);

  // Actions
  const handleSaveRatio = async () => {
    if (newRatio <= 0) {
      addToast({ type: "warning", title: "Səhv", content: "Xal nisbəti sıfırdan böyük olmalıdır!" });
      return;
    }
    await saveSettings({
      ...settings,
      loyaltyRatio: newRatio
    });
    addToast({ type: "success", title: "Uğurlu", content: `Xal qazanma dərəcəsi yeniləndi: 1 Xal = ${newRatio} ₼` });
  };

  const handleAddReward = async () => {
    if (!newRewardName.trim()) {
      addToast({ type: "warning", title: "Səhv", content: "Hədiyyə adı boş ola bilməz!" });
      return;
    }
    if (newRewardPoints <= 0) {
      addToast({ type: "warning", title: "Səhv", content: "Tələb olunan xal sıfırdan böyük olmalıdır!" });
      return;
    }

    const newReward: LoyaltyReward = {
      id: `rew_${Date.now()}`,
      name: newRewardName,
      pointsCost: newRewardPoints,
      description: newRewardDesc
    };

    const updated = [...rewardsList, newReward];
    await saveSettings({
      ...settings,
      loyaltyRewards: updated
    });

    setNewRewardName("");
    setNewRewardDesc("");
    setNewRewardPoints(50);
    addToast({ type: "success", title: "Uğurlu", content: "Yeni hədiyyə kataloqa əlavə edildi!" });
  };

  const handleDeleteReward = async (id: string) => {
    const updated = rewardsList.filter(r => r.id !== id);
    await saveSettings({
      ...settings,
      loyaltyRewards: updated
    });
    addToast({ type: "success", title: "Uğurlu", content: "Hədiyyə kataloqdan silindi!" });
  };

  const handleAdjustPoints = async () => {
    if (!selectedCustomer) return;
    const finalAmount = adjustType === "add" ? adjustAmount : -adjustAmount;
    const currentAdjust = selectedCustomer.loyaltyPointsAdjustment || 0;
    
    // Check if adjustment makes points negative
    const pointsFromSpent = Math.floor(selectedCustomer.totalSpent / currentRatio);
    const newTotalEarned = pointsFromSpent + currentAdjust + finalAmount;
    if (newTotalEarned < (selectedCustomer.spentPoints || 0)) {
      addToast({ type: "warning", title: "Xəta", content: "Müştərinin istifadə edilmiş xalları var, cəmi xalı mənfiyə düşə bilməz!" });
      return;
    }

    const updatedNote = selectedCustomer.notes 
      ? `${selectedCustomer.notes}\n[Xal düzəlişi: ${finalAmount > 0 ? "+" : ""}${finalAmount} xal (${adjustReason || "Düzəliş"})]`
      : `[Xal düzəlişi: ${finalAmount > 0 ? "+" : ""}${finalAmount} xal (${adjustReason || "Düzəliş"})]`;

    await saveCustomer({
      ...selectedCustomer,
      notes: updatedNote,
      loyaltyPointsAdjustment: currentAdjust + finalAmount
    });

    setAdjustReason("");
    addToast({ type: "success", title: "Uğurlu", content: `Xal balansı yeniləndi: ${finalAmount > 0 ? "+" : ""}${finalAmount} Xal` });
  };

  const handleRedeemReward = async (reward: LoyaltyReward) => {
    if (!selectedCustomer) return;
    const avail = selectedCustomer.loyaltyStats.availablePoints;
    if (avail < reward.pointsCost) {
      addToast({ type: "warning", title: "Kifayət qədər xal yoxdur", content: `Müştərinin balansı (${avail}) bu kupon üçün kifayət deyil (${reward.pointsCost}).` });
      return;
    }

    // Generate random coupon code
    const randCode = `LOY-${reward.name.substring(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newCoupon = {
      id: `coup_${Date.now()}`,
      rewardId: reward.id,
      rewardName: reward.name,
      pointsCost: reward.pointsCost,
      code: randCode,
      redeemedAt: new Date().toISOString(),
      status: "active" as const
    };

    const currentSpent = selectedCustomer.spentPoints || 0;
    const currentCoupons = selectedCustomer.redeemedRewards || [];

    await saveCustomer({
      ...selectedCustomer,
      spentPoints: currentSpent + reward.pointsCost,
      redeemedRewards: [newCoupon, ...currentCoupons]
    });

    addToast({ type: "success", title: "Kupon Yaradıldı", content: `${reward.name} üçün kupon kodu yaradıldı!` });
  };

  const handleUpdateCouponStatus = async (couponId: string, newStatus: "used" | "cancelled") => {
    if (!selectedCustomer) return;
    
    const coupons = selectedCustomer.redeemedRewards || [];
    const couponIndex = coupons.findIndex(c => c.id === couponId);
    if (couponIndex === -1) return;

    const coupon = coupons[couponIndex];
    const updatedCoupons = [...coupons];
    updatedCoupons[couponIndex] = {
      ...coupon,
      status: newStatus
    };

    let spentAdjustment = 0;
    if (newStatus === "cancelled") {
      // Refund points
      spentAdjustment = -coupon.pointsCost;
    }

    const currentSpent = selectedCustomer.spentPoints || 0;

    await saveCustomer({
      ...selectedCustomer,
      spentPoints: Math.max(0, currentSpent + spentAdjustment),
      redeemedRewards: updatedCoupons
    });

    addToast({ 
      type: "success", 
      title: "Kupon Yeniləndi", 
      content: newStatus === "used" ? "Kupon istifadə olunmuş kimi qeyd edildi!" : "Kupon ləğv edildi və xallar geri qaytarıldı!" 
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
    addToast({ type: "info", title: "Kopyalandı", content: `Kupon kodu kopyalandı: ${code}` });
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const dataToExport = filteredMembers.map(m => ({
      "Müştəri Adı": m.name,
      "Telefon No": m.phone,
      "Loyallıq Dərəcəsi": m.loyaltyStats.tierName,
      "Sifariş Sayı": m.orderCount,
      "Ümumi Alış-veriş (₼)": m.totalSpent,
      "Qazanılan Xallar (Cəmi)": m.loyaltyStats.earnedPoints,
      "Xərclənən Xallar": m.loyaltyStats.spentPoints,
      "Mövcud Xal Balansı": m.loyaltyStats.availablePoints,
      "Aktiv Kupon Sayı": m.redeemedRewards ? m.redeemedRewards.filter(r => r.status === "active").length : 0
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Loyallıq Proqramı");
    XLSX.writeFile(workbook, "loyalli_musteriler_list.xlsx");
    addToast({ type: "success", title: "Uğurlu", content: "Müştəri siyahısı Excel formatında ixrac olundu." });
  };

  const handleResetRewardsToDefault = async () => {
    if (window.confirm("Kataloqu ilkin standart hədiyyələrə sıfırlamaq istədiyinizdən əminsiniz?")) {
      await saveSettings({
        ...settings,
        loyaltyRewards: DEFAULT_REWARDS
      });
      addToast({ type: "success", title: "Sıfırlandı", content: "Kataloq standart hədiyyələrə sıfırlandı." });
    }
  };

  const toggleSort = (field: "points" | "spend" | "orders" | "name") => {
    if (sortBy === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  return (
    <div id="loyalty_view_root" className="space-y-6">
      
      {/* 1. Header & Quick Analytics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Gift className="w-6 h-6 text-emerald-600 shrink-0" />
            Müştəri Loyallıq Proqramı
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Müştərilərin alış-veriş həcminə uyğun xal qazanması, dərəcələrinin hesablanması və kupon idarəetməsi.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <Settings2 className="w-4 h-4 text-slate-500" />
            {isSettingsOpen ? "Ayarları Gizlə" : "Qaydalar və Ayarlar"}
            {isSettingsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel İxrac Et
          </button>
        </div>
      </div>

      {/* 2. Collapsible Settings Panel */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Ratio and Auto calculation explanation */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-500" />
                    Xal Nisbəti Konfiqurasiyası
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Hər neçə AZN-lik uğurlu (çatdırılmış) sifariş üçün müştəriyə 1 Loyallıq Xalı (Bal) veriləcəyini təyin edin.
                  </p>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="1"
                        value={newRatio || ""}
                        onChange={(e) => setNewRatio(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono pr-12 focus:outline-none focus:border-emerald-500"
                      />
                      <span className="absolute right-3 top-2 text-[10px] text-slate-400 font-medium">₼ = 1 Xal</span>
                    </div>
                    <button
                      onClick={handleSaveRatio}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Yadda saxla
                    </button>
                  </div>
                </div>

                {/* Adding custom reward */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-600" />
                      Yeni Hədiyyə Əlavə Et
                    </h4>
                    <button
                      onClick={handleResetRewardsToDefault}
                      className="text-[10px] text-red-600 hover:underline font-medium flex items-center gap-0.5"
                    >
                      <RotateCcw className="w-3 h-3" /> Standarta Sıfırla
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-6 space-y-1">
                      <label className="text-[10px] font-bold text-slate-600">Hədiyyə / Kupon Adı</label>
                      <input
                        type="text"
                        placeholder="Məs. 10 AZN Endirim, Pulsuz Hədiyyə"
                        value={newRewardName}
                        onChange={(e) => setNewRewardName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <label className="text-[10px] font-bold text-slate-600">Xal Dəyəri</label>
                      <input
                        type="number"
                        min="1"
                        value={newRewardPoints}
                        onChange={(e) => setNewRewardPoints(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="md:col-span-3 flex items-end">
                      <button
                        onClick={handleAddReward}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus className="w-4 h-4" /> Əlavə et
                      </button>
                    </div>
                    <div className="md:col-span-12 space-y-1">
                      <label className="text-[10px] font-bold text-slate-600">Qısa Açıqlama (Şərtlər)</label>
                      <input
                        type="text"
                        placeholder="Məs. Minimum 30 AZN alış-verişlərdə kupon kodu kimi tətbiq olunur."
                        value={newRewardDesc}
                        onChange={(e) => setNewRewardDesc(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tier definitions information bar */}
              <div className="border-t border-slate-100 pt-4">
                <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5">Loyallıq Dərəcəsi Şərtləri:</h5>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100 flex items-start gap-2">
                    <span className="text-xl">🥉</span>
                    <div>
                      <h6 className="text-xs font-bold text-amber-900">Tunc (Bronze)</h6>
                      <p className="text-[10px] text-amber-700 mt-0.5 leading-normal">Başlanğıc səviyyə. 0 - 2 uğurlu sifariş.</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex items-start gap-2">
                    <span className="text-xl">🥈</span>
                    <div>
                      <h6 className="text-xs font-bold text-slate-800">Gümüş (Silver)</h6>
                      <p className="text-[10px] text-slate-600 mt-0.5 leading-normal">3+ uğurlu sifariş və ya 150+ ₼ ümumi alış.</p>
                    </div>
                  </div>
                  <div className="bg-yellow-50/50 rounded-xl p-3 border border-yellow-200/60 flex items-start gap-2">
                    <span className="text-xl">🏆</span>
                    <div>
                      <h6 className="text-xs font-bold text-yellow-900">Qızıl (Gold)</h6>
                      <p className="text-[10px] text-yellow-700 mt-0.5 leading-normal">7+ uğurlu sifariş və ya 350+ ₼ ümumi alış.</p>
                    </div>
                  </div>
                  <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100 flex items-start gap-2">
                    <span className="text-xl">✨</span>
                    <div>
                      <h6 className="text-xs font-bold text-indigo-900">Platin (Platinum)</h6>
                      <p className="text-[10px] text-indigo-700 mt-0.5 leading-normal">15+ uğurlu sifariş və ya 800+ ₼ ümumi alış.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Loyalty Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <User className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Cəmi Üzvlər</span>
            <span className="text-lg font-bold text-slate-800 font-mono mt-0.5 block">{loyaltyStatsSum.totalMembers}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-500">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Paylanan Xallar</span>
            <span className="text-lg font-bold text-slate-800 font-mono mt-0.5 block">{loyaltyStatsSum.totalPoints}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-500">
            <Ticket className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Yaradılan Kuponlar</span>
            <span className="text-lg font-bold text-slate-800 font-mono mt-0.5 block">{loyaltyStatsSum.totalCoupons}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Aktiv Kuponlar</span>
            <span className="text-lg font-bold text-slate-800 font-mono mt-0.5 block">{loyaltyStatsSum.activeCoupons}</span>
          </div>
        </div>
      </div>

      {/* 4. Reward Catalog Visual Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-emerald-600" />
            Hədiyyə Kataloqu ({rewardsList.length})
          </h3>
          <span className="text-[10px] text-slate-400 font-mono">1 Xal = {currentRatio} ₼ alış-veriş</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {rewardsList.map((reward) => (
            <div 
              key={reward.id} 
              className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group bg-linear-to-b bg-slate-50/40"
            >
              {/* Point cost tag floating right */}
              <div className="absolute top-0 right-0 bg-amber-500 text-white font-mono text-[10px] font-extrabold px-3 py-1 rounded-bl-xl shadow-xs">
                {reward.pointsCost} XAL
              </div>

              <div className="space-y-1.5 pr-14">
                <h4 className="text-xs font-bold text-slate-800 leading-snug">{reward.name}</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed min-h-[32px]">{reward.description || "Açıqlama yoxdur."}</p>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200/60 pt-3 mt-3">
                <span className="text-[9px] text-slate-400 uppercase font-bold">Loyallıq Kuponu</span>
                
                {/* Delete button for custom rewards */}
                {settings.loyaltyRewards?.some(r => r.id === reward.id) && (
                  <button
                    onClick={() => handleDeleteReward(reward.id)}
                    title="Sil"
                    className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Members Loyalty Directory (Main Table) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Directory Controls Header */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-2.5 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Müştəri adı və ya nömrəsi ilə axtar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-emerald-500 placeholder-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            
            {/* Filter by Tier */}
            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedTier}
                onChange={(e: any) => setSelectedTier(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none"
              >
                <option value="all">Bütün Dərəcələr</option>
                <option value="bronze">🥉 Tunc (Bronze)</option>
                <option value="silver">🥈 Gümüş (Silver)</option>
                <option value="gold">🏆 Qızıl (Gold)</option>
                <option value="platinum">✨ Platin (Platinum)</option>
              </select>
            </div>

            {/* Quick Filter Info */}
            <span className="text-[10px] text-slate-400 font-mono ml-2">
              Tapıldı: {filteredMembers.length} müştəri
            </span>
          </div>
        </div>

        {/* Directory Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/20 text-slate-400 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                <th className="py-3 px-4 font-semibold text-slate-500">Müştəri Məlumatı</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-center">
                  <button onClick={() => toggleSort("name")} className="flex items-center gap-1 mx-auto hover:text-slate-700">
                    Dərəcə <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-center">
                  <button onClick={() => toggleSort("orders")} className="flex items-center gap-1 mx-auto hover:text-slate-700">
                    Sifariş <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-right">
                  <button onClick={() => toggleSort("spend")} className="flex items-center gap-1 ml-auto hover:text-slate-700">
                    Ümumi Alış <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-right">
                  <button onClick={() => toggleSort("points")} className="flex items-center gap-1 ml-auto hover:text-slate-700">
                    Xal Balansı <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-center">Aktiv Kupon</th>
                <th className="py-3 px-4 font-semibold text-slate-500 text-right">İdarəetmə</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Siyahı boşdur və ya axtarışa uyğun müştəri tapılmadı.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const activeCouponsCount = member.redeemedRewards 
                    ? member.redeemedRewards.filter(r => r.status === "active").length 
                    : 0;

                  return (
                    <tr 
                      key={member.id} 
                      className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      onClick={() => setSelectedCustomerId(member.id)}
                    >
                      {/* Name and Phone */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 uppercase">
                            {member.name.slice(0, 2)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800 block">{member.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{member.phone}</span>
                          </div>
                        </div>
                      </td>

                      {/* Tier Tag */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full border ${member.loyaltyStats.colorClass}`}>
                          {member.loyaltyStats.tierName}
                        </span>
                      </td>

                      {/* Order Count */}
                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">
                        {member.orderCount}
                      </td>

                      {/* Total Spent */}
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                        {member.totalSpent.toLocaleString('az-AZ')} ₼
                      </td>

                      {/* Points Balance */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono font-bold text-amber-600 flex items-center gap-1 text-sm">
                            <Coins className="w-3.5 h-3.5 text-amber-500" />
                            {member.loyaltyStats.availablePoints}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                            qazanılıb: {member.loyaltyStats.earnedPoints} / xərclənib: {member.loyaltyStats.spentPoints}
                          </span>
                        </div>
                      </td>

                      {/* Active Coupons Count */}
                      <td className="py-3 px-4 text-center">
                        {activeCouponsCount > 0 ? (
                          <span className="inline-block bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded text-[10px] border border-indigo-100 animate-pulse">
                            {activeCouponsCount} AKTİV
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-medium">-</span>
                        )}
                      </td>

                      {/* Manage Button */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedCustomerId(member.id)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                        >
                          İdarə et
                          <ChevronRight className="w-3 h-3 text-slate-400" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Customer Loyalty Detail Modal */}
      <AnimatePresence>
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              
              {/* Modal Header */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800">{selectedCustomer.name} - Loyallıq Kartı</h2>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">Nömrə: {selectedCustomer.phone}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                
                {/* Visual Card / Tier Summary */}
                <div className="bg-slate-900 text-white rounded-2xl p-5 relative overflow-hidden shadow-lg grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Backdrop glowing details */}
                  <div className="absolute right-0 bottom-0 top-0 w-1/3 bg-radial-gradient opacity-10 pointer-events-none" />
                  
                  <div className="md:col-span-8 space-y-4">
                    <div className="space-y-1">
                      <span className="text-[9px] uppercase tracking-widest font-bold text-slate-400">Üzvlük Dərəcəsi</span>
                      <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                        {selectedCustomer.loyaltyStats.tierName}
                      </h3>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-slate-300 font-medium">
                        <span>{selectedCustomer.loyaltyStats.nextTierText}</span>
                        {selectedCustomer.loyaltyStats.tier !== "platinum" && (
                          <span>{selectedCustomer.loyaltyStats.progressToNext}%</span>
                        )}
                      </div>
                      
                      {/* Progress bar to next tier */}
                      {selectedCustomer.loyaltyStats.tier !== "platinum" && (
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${selectedCustomer.loyaltyStats.progressToNext}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-4 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between items-center text-center">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">Mövcud Balans</span>
                    <div className="my-1.5 flex items-center justify-center gap-1 text-3xl font-black font-mono text-amber-400">
                      <Coins className="w-7 h-7 text-amber-400" />
                      {selectedCustomer.loyaltyStats.availablePoints}
                    </div>
                    <span className="text-[9px] text-slate-400 block font-mono">Cəmi Qazanılıb: {selectedCustomer.loyaltyStats.earnedPoints}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Form A: Points Adjustment */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50/30">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      Xal Düzəlişi (Balansı Artır/Azalt)
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Müştəriyə ad günü bonusu, kampaniya bonusu vermək və ya yaranmış xətanı düzəltmək üçün buradan istifadə edin.
                    </p>

                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAdjustType("add")}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${adjustType === "add" ? "bg-emerald-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
                        >
                          Xal Əlavə Et (+)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustType("sub")}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${adjustType === "sub" ? "bg-red-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
                        >
                          Xal Çıx (-)
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1 space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase">Xal sayı</label>
                          <input
                            type="number"
                            min="1"
                            value={adjustAmount || ""}
                            onChange={(e) => setAdjustAmount(Math.max(1, parseInt(e.target.value) || 0))}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] text-slate-400 font-bold uppercase">Səbəb / Qeyd</label>
                          <input
                            type="text"
                            placeholder="Məs. Kampaniya bonusu"
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleAdjustPoints}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 rounded-lg transition-colors cursor-pointer"
                      >
                        Düzəlişi tətbiq et
                      </button>
                    </div>
                  </div>

                  {/* Form B: Redeem Rewards */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Ticket className="w-4 h-4 text-indigo-600" />
                      Kupon / Hədiyyə Ver
                    </h3>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Müştərinin mövcud xalları qarşılığında endirim kuponu yaradın. Yaradılan kod müştəriyə təqdim oluna bilər.
                    </p>

                    <div className="space-y-2.5 max-h-[175px] overflow-y-auto pr-1 scrollbar-thin">
                      {rewardsList.map((reward) => {
                        const canRedeem = selectedCustomer.loyaltyStats.availablePoints >= reward.pointsCost;

                        return (
                          <div 
                            key={reward.id} 
                            className={`border rounded-lg p-2.5 flex items-center justify-between gap-3 transition-colors ${canRedeem ? "bg-white border-slate-200 hover:border-slate-300" : "bg-slate-50/50 border-slate-100 opacity-60"}`}
                          >
                            <div className="space-y-0.5">
                              <h4 className="text-xs font-bold text-slate-800 leading-snug">{reward.name}</h4>
                              <p className="text-[9px] text-slate-400 font-medium">{reward.pointsCost} Xal tələb olunur</p>
                            </div>

                            <button
                              disabled={!canRedeem}
                              onClick={() => handleRedeemReward(reward)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${canRedeem ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs" : "bg-slate-100 text-slate-400"}`}
                            >
                              Kupon Yarat
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Coupon Redemptions Log */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <History className="w-4 h-4 text-slate-500" />
                      Kupon Keçmişi və Redemptions ({selectedCustomer.redeemedRewards?.length || 0})
                    </h3>
                    <span className="text-[10px] text-slate-400">Yaradılan kuponların siyahısı və statusu</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 text-slate-400 font-bold text-[9px] uppercase border-b border-slate-100">
                          <th className="py-2.5 px-3">Kupon Kodu</th>
                          <th className="py-2.5 px-3">Hədiyyə</th>
                          <th className="py-2.5 px-3">Xal Dəyəri</th>
                          <th className="py-2.5 px-3">Yaradılma Tarixi</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3 text-right">Əməliyyat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                        {!selectedCustomer.redeemedRewards || selectedCustomer.redeemedRewards.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-slate-400 font-sans">
                              Hələ ki kupon yaradılmayıb.
                            </td>
                          </tr>
                        ) : (
                          selectedCustomer.redeemedRewards.map((coupon) => (
                            <tr key={coupon.id} className="hover:bg-slate-50/20">
                              <td className="py-2 px-3 font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{coupon.code}</span>
                                <button
                                  onClick={() => handleCopyCode(coupon.code)}
                                  className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                                  title="Kopyala"
                                >
                                  {copiedCode === coupon.code ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-700">{coupon.rewardName}</td>
                              <td className="py-2 px-3 font-bold text-amber-600">{coupon.pointsCost}</td>
                              <td className="py-2 px-3 text-slate-400">{new Date(coupon.redeemedAt).toLocaleString('az-AZ')}</td>
                              <td className="py-2 px-3 text-center">
                                {coupon.status === "active" && (
                                  <span className="inline-block bg-emerald-100 text-emerald-800 font-sans font-bold px-2 py-0.5 rounded text-[9px] border border-emerald-200">
                                    Aktiv ✅
                                  </span>
                                )}
                                {coupon.status === "used" && (
                                  <span className="inline-block bg-slate-100 text-slate-500 font-sans font-bold px-2 py-0.5 rounded text-[9px] border border-slate-200">
                                    İstifadə edilib
                                  </span>
                                )}
                                {coupon.status === "cancelled" && (
                                  <span className="inline-block bg-red-50 text-red-700 font-sans font-bold px-2 py-0.5 rounded text-[9px] border border-red-100">
                                    Ləğv edilib / İadə
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                                {coupon.status === "active" && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateCouponStatus(coupon.id, "used")}
                                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-sans font-bold rounded text-[9px] cursor-pointer"
                                    >
                                      İstifadə et
                                    </button>
                                    <button
                                      onClick={() => handleUpdateCouponStatus(coupon.id, "cancelled")}
                                      className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-sans font-bold rounded text-[9px] cursor-pointer"
                                    >
                                      Ləğv et
                                    </button>
                                  </>
                                )}
                                {coupon.status !== "active" && (
                                  <span className="text-[10px] text-slate-300 font-sans">-</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Bağla
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
