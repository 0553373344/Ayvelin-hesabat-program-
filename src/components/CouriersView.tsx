import React, { useState, useMemo, useEffect } from "react";
import { useData } from "../context/DataContext";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Search, 
  Bike, 
  FileEdit, 
  Trash2, 
  X, 
  CheckCircle, 
  RotateCcw,
  History,
  Package,
  ArrowRightLeft,
  Calendar,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Globe,
  Coins,
  MapPin,
  Mail,
  Activity,
  Percent,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  BarChart4
} from "lucide-react";
import { Courier, Sale } from "../types";
import { formatCurrency, formatDateAZ } from "../utils/xlsEngine";
import { formatPhoneNumber } from "../utils/phoneFormatter";
import { getBakuTodayYMD, getOrderReportingDateYMD } from "../utils/orderFormatter";
import { 
  useDeliveryProviders, 
  useDeliveryBranches, 
  useDeliveryTariffs, 
  useDeliveryStats, 
  useUpdateTariff,
  useDeliveryRecords,
  addDeliveryBranch,
  updateDeliveryBranch,
  deleteDeliveryBranch,
  addDeliveryTariff,
  deleteDeliveryTariff
} from "../hooks/useDelivery";

export default function CouriersView() {
  const { 
    couriers, 
    sales, 
    products, 
    stockTransfers, 
    transferStockToCourier, 
    saveCourier, 
    deleteCourier,
    addToast
  } = useData();

  // Primary top tab state that differentiates existing local couriers from cargo integrated companies & statistics!
  const [activeTab, setActiveTab] = useState<"kuryer" | "cargo_post" | "stats">("cargo_post");

  // ==========================================
  // SECTION A: COURIER MANAGEMENT (EXISTING VIEWS & PORTING)
  // ==========================================
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editCourier, setEditCourier] = useState<Courier | null>(null);

  // Form states for Courier Profile
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formFee, setFormFee] = useState(3);
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [formIsDepotBased, setFormIsDepotBased] = useState(false);

  // Depot Panel State
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [transferQty, setTransferQty] = useState(1);
  const [showHistory, setShowHistory] = useState(false);

  // Manual stock tweak state
  const [isEditingColumbaStock, setIsEditingColumbaStock] = useState(false);
  const [manualColumbaStock, setManualColumbaStock] = useState(0);

  const handleSaveManualStock = async () => {
    if (!columbaCourier) return;
    try {
      await saveCourier({ ...columbaCourier, stock_quantity: manualColumbaStock });
      setIsEditingColumbaStock(false);
      addToast({
        type: "success",
        title: "Stok Yeniləndi",
        content: `Columba.az anbar stoku ${manualColumbaStock} olaraq təyin edildi.`
      });
    } catch(err) {
      addToast({
        type: "error",
        title: "Xəta",
        content: "Stok miqdarı təyin olunmadı."
      });
    }
  };

  // Toggle active orders on specific card
  const [expandedCourierId, setExpandedCourierId] = useState<string | null>(null);

  // Find columba.az courier document
  const columbaCourier = useMemo(() => {
    return couriers.find(c => c.isDepotBased === true);
  }, [couriers]);

  // Automated Setup for Columba.az to make onboarding friction-free
  const autoSetupColumba = async () => {
    const columbaPayload: Courier = {
      id: "columba_az",
      name: "Columba.az",
      phone: "0501112233",
      status: "active",
      standardDeliveryFee: 4,
      stockBalance: 0,
      totalDeliveries: 0,
      totalEarnings: 0,
      stock_quantity: 0,
      isDepotBased: true
    };
    await saveCourier(columbaPayload);
    addToast({
      type: "success",
      title: "Columba.az Quruldu",
      content: "Columba.az kuryer profili uğurla yaradıldı!"
    });
  };

  const filteredCouriers = useMemo(() => {
    return couriers.filter(c => {
      const cleanSearch = searchTerm.replace(/\D/g, "");
      const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.phone.replace(/\s+/g, "").includes(searchTerm.replace(/\s+/g, "")) ||
                          (cleanSearch !== "" && c.phone.includes(cleanSearch)) ||
                          (cleanSearch !== "" && c.phone.includes(formatPhoneNumber(searchTerm)));
      return matchSearch;
    });
  }, [couriers, searchTerm]);

  // Dynamic statistics calculations
  const courierStats = useMemo(() => {
    const todayStr = getBakuTodayYMD();
    const monthStr = todayStr.slice(0, 7); // "YYYY-MM"

    const statsMap: Record<string, {
      todayDeliveries: number;
      monthDeliveries: number;
      totalDeliveries: number;
      totalEarnings: number;
      activeOrders: Sale[];
    }> = {};

     couriers.forEach(c => {
      const isColumba = c.isDepotBased === true;
      const courierSales = sales.filter(s => {
        if (isColumba) {
          const saleCourier = s.courierId ? couriers.find(cr => cr.id === s.courierId) : null;
          const hasColumbaText = (s.courierName || "").toLowerCase().includes("columba") || 
                                 (s.cargoCompany || "").toLowerCase().includes("columba") || 
                                 (s.notes || "").toLowerCase().includes("columba");
          return (
            s.courierId === c.id ||
            saleCourier?.isDepotBased === true ||
            hasColumbaText
          );
        }
        return s.courierId === c.id;
      });
      const deliveredSales = courierSales.filter(s => s.status === "çatdırılıb");
      const activeSales = courierSales.filter(s => s.status === "gözləyir");

      const todaySales = deliveredSales.filter(s => getOrderReportingDateYMD(s) === todayStr);
      const monthSales = deliveredSales.filter(s => getOrderReportingDateYMD(s).startsWith(monthStr));

      const totalEarnings = deliveredSales.reduce((sum, s) => sum + (s.deliveryCost || 0), 0);

      statsMap[c.id] = {
        todayDeliveries: todaySales.length,
        monthDeliveries: monthSales.length,
        totalDeliveries: deliveredSales.length,
        totalEarnings,
        activeOrders: activeSales
      };
    });

    return statsMap;
  }, [couriers, sales]);

  // General dashboard metrics
  const aggregateActiveCouriers = useMemo(() => {
    return couriers.filter(c => c.status === "active").length;
  }, [couriers]);

  const aggregateTotalBalance = useMemo(() => {
    return couriers.reduce((sum, c) => sum + (c.stockBalance || 0), 0);
  }, [couriers]);

  const totalDeliveredOrdersAcrossAll = useMemo(() => {
    return sales.filter(s => s.status === "çatdırılıb" && s.courierId).length;
  }, [sales]);

  const openNewCourierForm = () => {
    setEditCourier(null);
    setFormName("");
    setFormPhone("");
    setFormFee(3);
    setFormStatus("active");
    setFormIsDepotBased(false);
    setIsFormOpen(true);
  };

  const openEditCourierForm = (c: Courier) => {
    setEditCourier(c);
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormFee(c.standardDeliveryFee);
    setFormStatus(c.status);
    setFormIsDepotBased(c.isDepotBased || false);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formPhone) {
      alert("Kuryer adı və telefonu daxil edilməlidir.");
      return;
    }

    const payload: Courier = {
      id: editCourier ? editCourier.id : `courier_${Date.now()}`,
      name: formName,
      phone: formPhone,
      standardDeliveryFee: Number(formFee),
      status: formStatus,
      stockBalance: editCourier ? editCourier.stockBalance : 0,
      totalDeliveries: editCourier ? editCourier.totalDeliveries : 0,
      totalEarnings: editCourier ? editCourier.totalEarnings : 0,
      stock_quantity: editCourier ? (editCourier.stock_quantity || 0) : 0,
      isDepotBased: formIsDepotBased
    };

    await saveCourier(payload);
    setIsFormOpen(false);
    addToast({
      type: "success",
      title: editCourier ? "Profil Yeniləndi" : "Yeni Kuryer",
      content: `${formName} uğurla qeyd edildi.`
    });
  };

  const triggerResetBalance = async (c: Courier) => {
    const conf = window.confirm(`${c.name} adlı kuryerin kassa balansını (hesablaşma) sıfırlamaq istəyirsiniz?`);
    if (conf) {
      await saveCourier({
        ...c,
        stockBalance: 0
      });
      addToast({
        type: "success",
        title: "Kasa Balansı Sıfırlandı",
        content: `${c.name} ilə hesablaşma uğurla aparıldı.`
      });
    }
  };

  const handleStockTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!columbaCourier) return;
    if (!selectedProductId || transferQty <= 0) {
      alert("Məhsul və miqdar düzgün daxil edilməlidir.");
      return;
    }
    await transferStockToCourier(selectedProductId, columbaCourier.id, transferQty);
    setIsTransferOpen(false);
    setSelectedProductId("");
    setTransferQty(1);
    addToast({
      type: "success",
      title: "Köçürmə Uğurlu",
      content: "Stok miqdarı kuryer deposuna qeyd edildi."
    });
  };


  // ==========================================
  // SECTION B: INTEGRATED CARGO/MAIL SYSTEMS (EXPARGO / AZERPOST)
  // ==========================================
  const { providers, loading: loadingProviders } = useDeliveryProviders();
  const { records: deliveryRecords, loading: loadingRecords } = useDeliveryRecords();
  const { updateTariff, updating: updatingTariff } = useUpdateTariff();

  // Active records counts & total sum
  const expargoActiveCount = useMemo(() => {
    return deliveryRecords.filter(r => r.provider === "expargo" && r.status === "gözləyir").length;
  }, [deliveryRecords]);

  const expargoTotalCost = useMemo(() => {
    return deliveryRecords.filter(r => r.provider === "expargo" && r.status === "çatdırılıb").reduce((sum, r) => sum + (r.cost || 0), 0);
  }, [deliveryRecords]);

  const azerpostActiveCount = useMemo(() => {
    return deliveryRecords.filter(r => r.provider === "azerpost" && r.status === "gözləyir").length;
  }, [deliveryRecords]);

  const azerpostTotalCost = useMemo(() => {
    return deliveryRecords.filter(r => r.provider === "azerpost" && r.status === "çatdırılıb").reduce((sum, r) => sum + (r.cost || 0), 0);
  }, [deliveryRecords]);


  // Branch network states
  const { branches: allBranches, loading: loadingBranches } = useDeliveryBranches(null);
  const [branchProviderFilter, setBranchProviderFilter] = useState<"all" | "expargo" | "azerpost">("all");
  const [branchSearch, setBranchSearch] = useState("");
  const [branchRegionFilter, setBranchRegionFilter] = useState("all");
  const [branchPage, setBranchPage] = useState(1);
  const branchesPerPage = 5;

  const filteredBranches = useMemo(() => {
    return allBranches.filter(b => {
      const providerMatches = branchProviderFilter === "all" || b.provider === branchProviderFilter;
      const regionMatches = branchRegionFilter === "all" || b.region === branchRegionFilter;
      const searchMatches = branchSearch.trim() === "" || 
        b.name.toLowerCase().includes(branchSearch.toLowerCase()) ||
        b.region.toLowerCase().includes(branchSearch.toLowerCase()) ||
        b.address.toLowerCase().includes(branchSearch.toLowerCase());
      return providerMatches && regionMatches && searchMatches;
    });
  }, [allBranches, branchProviderFilter, branchRegionFilter, branchSearch]);

  const paginatedBranches = useMemo(() => {
    return filteredBranches.slice((branchPage - 1) * branchesPerPage, branchPage * branchesPerPage);
  }, [filteredBranches, branchPage]);

  const totalBranchPages = useMemo(() => {
    return Math.ceil(filteredBranches.length / branchesPerPage) || 1;
  }, [filteredBranches]);

  const uniqueRegions = useMemo(() => {
    const sects = new Set<string>();
    allBranches.forEach(b => { if (b.region) sects.add(b.region); });
    return Array.from(sects).sort();
  }, [allBranches]);

  useEffect(() => {
    setBranchPage(1);
  }, [branchProviderFilter, branchRegionFilter, branchSearch]);


  // Tariff Modal Settings
  const [tariffModalProvider, setTariffModalProvider] = useState<"expargo" | "azerpost" | null>(null);
  const { tariffs: activeTariffs, loading: loadingTariffs } = useDeliveryTariffs(tariffModalProvider);
  const [tariffPricesInput, setTariffPricesInput] = useState<Record<string, number>>({});

  useEffect(() => {
    if (activeTariffs && activeTariffs.length > 0) {
      const initialMap: Record<string, number> = {};
      activeTariffs.forEach(t => {
        initialMap[t.id] = t.price;
      });
      setTariffPricesInput(initialMap);
    }
  }, [activeTariffs]);

  const handleTariffPriceChange = (id: string, val: string) => {
    const rawVal = val.replace(/[^0-9.]/g, "");
    setTariffPricesInput(prev => ({ ...prev, [id]: Number(rawVal) || 0 }));
  };

  const saveTariffUpdate = async (tariffId: string, zoneName: string) => {
    const typedPrice = tariffPricesInput[tariffId];
    if (typedPrice === undefined || typedPrice < 0) {
      alert("Xahiş edirik düzgün qiymət daxil edin.");
      return;
    }
    await updateTariff(tariffId, typedPrice);
    addToast({
      type: "success",
      title: "Tarif Yeniləndi",
      content: `${zoneName} zonası üçün yeni çatdırılma qiyməti ${formatCurrency(typedPrice)} olaraq qeyd edildi.`
    });
  };

  // ==========================================
  // SECTION B2: DYNAMIC BRANCH & TARIFF MANAGEMENT SPECIAL UTILITIES
  // ==========================================
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branchEditingId, setBranchEditingId] = useState<string | null>(null);
  const [branchFormName, setBranchFormName] = useState("");
  const [branchFormRegion, setBranchFormRegion] = useState("");
  const [branchFormAddress, setBranchFormAddress] = useState("");
  const [branchFormPhone, setBranchFormPhone] = useState("");
  const [branchFormProvider, setBranchFormProvider] = useState<"expargo" | "azerpost">("expargo");
  const [branchFormIsActive, setBranchFormIsActive] = useState(true);

  // New Tariff fields
  const [isAddTariffOpen, setIsAddTariffOpen] = useState(false);
  const [tariffFormZoneName, setTariffFormZoneName] = useState("");
  const [tariffFormPrice, setTariffFormPrice] = useState("");

  const handleAddNewBranchClick = () => {
    setBranchEditingId(null);
    setBranchFormName("");
    setBranchFormRegion("Bakı");
    setBranchFormAddress("");
    setBranchFormPhone("");
    setBranchFormProvider(branchProviderFilter === "all" ? "expargo" : branchProviderFilter);
    setBranchFormIsActive(true);
    setIsBranchModalOpen(true);
  };

  const handleEditBranchClick = (b: any) => {
    setBranchEditingId(b.id);
    setBranchFormName(b.name || "");
    setBranchFormRegion(b.region || "");
    setBranchFormAddress(b.address || "");
    setBranchFormPhone(b.phone || "");
    setBranchFormProvider(b.provider || "expargo");
    setBranchFormIsActive(b.isActive !== false);
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchFormName.trim()) {
      alert("Xahiş olunur filial adını daxil edin.");
      return;
    }
    if (!branchFormRegion.trim()) {
      alert("Xahiş olunur regionu daxil edin.");
      return;
    }
    if (!branchFormAddress.trim()) {
      alert("Xahiş olunur ünvanı daxil edin.");
      return;
    }

    try {
      const branchData = {
        provider: branchFormProvider,
        name: branchFormName.trim(),
        region: branchFormRegion.trim(),
        address: branchFormAddress.trim(),
        phone: branchFormPhone.trim(),
        isActive: branchFormIsActive
      };

      if (branchEditingId) {
        await updateDeliveryBranch(branchEditingId, branchData);
        addToast({
          type: "success",
          title: "Filial Yeniləndi",
          content: `"${branchFormName}" filialı uğurla yeniləndi.`
        });
      } else {
        await addDeliveryBranch(branchData);
        addToast({
          type: "success",
          title: "Yeni Filial Əlavə Edildi",
          content: `"${branchFormName}" filialı uğurla əlavə edildi.`
        });
      }
      setIsBranchModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Filial yadda saxlanılarkən xəta baş verdi.");
    }
  };

  const handleDeleteBranchClick = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" filialını sistemdən silmək istədiyinizə əminsiniz?`)) {
      return;
    }
    try {
      await deleteDeliveryBranch(id);
      addToast({
        type: "success",
        title: "Filial Silindi",
        content: `"${name}" filialı uğurla silindi.`
      });
    } catch (err) {
      console.error(err);
      alert("Filial silinərkən xəta baş verdi.");
    }
  };

  const handleSaveNewTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tariffModalProvider) return;
    if (!tariffFormZoneName.trim()) {
      alert("Xahiş olunur zona adını daxil edin.");
      return;
    }
    const numericPrice = Number(tariffFormPrice);
    if (isNaN(numericPrice) || numericPrice < 0) {
      alert("Xahiş olunur düzgün qiymət daxil edin.");
      return;
    }

    try {
      await addDeliveryTariff(tariffModalProvider, tariffFormZoneName.trim(), numericPrice);
      addToast({
        type: "success",
        title: "Yeni Tarif Əlavə Edildi",
        content: `"${tariffFormZoneName}" zonası üçün ${formatCurrency(numericPrice)} tarifi yaradıldı.`
      });
      setTariffFormZoneName("");
      setTariffFormPrice("");
      setIsAddTariffOpen(false);
    } catch (err) {
      console.error(err);
      alert("Yeni tarif əlavə edilərkən xəta baş verdi.");
    }
  };

  const handleDeleteTariffClick = async (id: string, zoneName: string) => {
    if (!window.confirm(`"${zoneName}" tarif zonasını silmək istədiyinizə əminsiniz?`)) {
      return;
    }
    try {
      await deleteDeliveryTariff(id);
      addToast({
        type: "success",
        title: "Tarif Silindi",
        content: `"${zoneName}" tarif zonası uğurla silindi.`
      });
    } catch (err) {
      console.error(err);
      alert("Tarif silinərkən xəta baş verdi.");
    }
  };


  // ==========================================
  // SECTION C: ANALYTICS & STATS ENGINE
  // ==========================================
  const [statsPreset, setStatsPreset] = useState<"today" | "week" | "month" | "custom">("month");
  const [statsStartStr, setStatsStartStr] = useState(() => {
    const today = getBakuTodayYMD();
    return today.slice(0, 7) + "-01";
  });
  const [statsEndStr, setStatsEndStr] = useState(() => {
    return getBakuTodayYMD();
  });

  const statsDateRange = useMemo(() => {
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    if (statsPreset === "custom") {
      if (statsStartStr) startDate = new Date(statsStartStr + "T00:00:00");
      if (statsEndStr) endDate = new Date(statsEndStr + "T23:59:59");
    }
    return { preset: statsPreset, startDate, endDate };
  }, [statsPreset, statsStartStr, statsEndStr]);

  const { stats: mainStats, loading: loadingStats } = useDeliveryStats(statsDateRange);


  return (
    <div className="space-y-6">
      
      {/* 🌟 PAGE HEADER WITH TABS CONTROLLERS */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-6 bg-white rounded-3xl border border-slate-100 shadow-xs gap-5">
        <div>
          <h1 className="text-xl font-black text-slate-850 tracking-tight flex items-center gap-2">
            <span className="p-1.5 bg-slate-900 rounded-lg text-white"><Globe className="w-4 h-4 text-amber-400" /></span>
            Çatdırılma İdarəetmə Mərkəzi
          </h1>
          <p className="text-xs text-slate-400 mt-1">Kuryer, Kargo və Dövlət Poçtu xidmətlərinin tam idarəetməsi, real vaxt tarifləri və filial şəbəkəsi.</p>
        </div>

        {/* Modular Navigation Tabs - Neumorphism Glass elements */}
        <div className="flex bg-slate-100 border border-slate-200/50 p-1.5 rounded-2xl w-full lg:w-auto overflow-x-auto gap-1">
          <button
            onClick={() => setActiveTab("cargo_post")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 w-full lg:w-auto cursor-pointer whitespace-nowrap ${
              activeTab === "cargo_post" 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-500" /> Kargo & Poçt (Sistemlər)
          </button>

          <button
            onClick={() => setActiveTab("kuryer")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 w-full lg:w-auto cursor-pointer whitespace-nowrap ${
              activeTab === "kuryer" 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            <Bike className="w-4 h-4 text-sky-500" /> Kuryerlər & Depo
          </button>

          <button
            onClick={() => setActiveTab("stats")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 w-full lg:w-auto cursor-pointer whitespace-nowrap ${
              activeTab === "stats" 
                ? "bg-white text-slate-900 shadow-sm" 
                : "text-slate-500 hover:text-slate-900 hover:bg-white/40"
            }`}
          >
            <BarChart4 className="w-4 h-4 text-indigo-500" /> Çatdırılma Statistikası
          </button>
        </div>
      </div>


      {/* VIEW CONDITIONAL RENDERS */}
      <AnimatePresence mode="wait">
        
        {/* ==================================================== */}
        {/* TAB B1: INTEGRATED THIRD-PARTY CARGO & MAIL (EXPARGO / AZERPOST) */}
        {/* ==================================================== */}
        {activeTab === "cargo_post" && (
          <motion.div
            key="cargo_post_view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Quick Provider Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Card 1: Expargo */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl border border-slate-800 shadow-lg relative overflow-hidden text-white flex flex-col justify-between min-h-[180px]">
                <div className="absolute top-0 right-0 translate-x-8 -translate-y-8 w-40 h-40 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex justify-between items-start">
                  <div className="flex gap-3.5 items-center">
                    <div className="p-3 bg-orange-500/15 text-orange-400 rounded-2xl border border-orange-500/10 font-bold text-center">
                      <span className="block text-[9px] uppercase tracking-widest font-black leading-none">EXP</span>
                      <span className="block text-lg font-black mt-0.5 leading-none">✈️</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base tracking-tight">Expargo Beynəlxalq Kargo</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] text-slate-400 font-bold">API İnteqrasiya Aktivdir</span>
                      </div>
                    </div>
                  </div>

                  <span className="bg-orange-500/15 text-orange-400 border border-orange-500/10 text-[9px] font-bold px-2 py-0.5 rounded">
                    ÖZƏL SEÇİM
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 my-4 pt-1">
                  <div className="bg-white/5 border border-white/[0.04] p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Aktiv Çatdırılmalar</span>
                    <span className="text-xl font-extrabold text-white mt-1 block font-mono">{expargoActiveCount} sifariş</span>
                  </div>
                  <div className="bg-white/5 border border-white/[0.04] p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Ümumi Ödəniş (Çatdırılıb)</span>
                    <span className="text-xl font-extrabold text-white mt-1 block font-mono">₼ {expargoTotalCost.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => setTariffModalProvider("expargo")}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] transition-all text-slate-950 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-orange-500/10"
                  >
                    <Coins className="w-4 h-4" /> Tarifləri Redaktə Et
                  </button>
                </div>
              </div>

              {/* Card 2: Azərpoçt */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl border border-slate-800 shadow-lg relative overflow-hidden text-white flex flex-col justify-between min-h-[180px]">
                <div className="absolute top-0 right-0 translate-x-8 -translate-y-8 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex justify-between items-start">
                  <div className="flex gap-3.5 items-center">
                    <div className="p-3 bg-blue-500/15 text-blue-400 rounded-2xl border border-blue-500/10 font-bold text-center">
                      <span className="block text-[9px] uppercase tracking-widest font-black leading-none">PST</span>
                      <span className="block text-lg font-black mt-0.5 leading-none">✉️</span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base tracking-tight">Azərpoçt Dövlət Xidməti</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] text-slate-400 font-bold">Respublika daxili çatdırılma</span>
                      </div>
                    </div>
                  </div>

                  <span className="bg-blue-500/15 text-blue-400 border border-blue-500/10 text-[9px] font-bold px-2 py-0.5 rounded">
                    MİLLİ POÇT
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 my-4 pt-1">
                  <div className="bg-white/5 border border-white/[0.04] p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Aktiv Çatdırılmalar</span>
                    <span className="text-xl font-extrabold text-white mt-1 block font-mono">{azerpostActiveCount} sifariş</span>
                  </div>
                  <div className="bg-white/5 border border-white/[0.04] p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">Ümumi Ödəniş (Çatdırılıb)</span>
                    <span className="text-xl font-extrabold text-white mt-1 block font-mono">₼ {azerpostTotalCost.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => setTariffModalProvider("azerpost")}
                    className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 active:scale-[0.98] transition-all text-slate-950 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-blue-500/10"
                  >
                    <Coins className="w-4 h-4" /> Tarifləri Redaktə Et
                  </button>
                </div>
              </div>

            </div>


            {/* PHYSICAL OUTLET CHANNELS / BRANCH NETWORKS LIST */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-indigo-500" /> Filial Şəbəkəsi ({filteredBranches.length} məntəqə)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Sistem üzrə qeydiyyatdan keçmiş rəsmi xidmət məntəqələri və poçt şöbələrinin siyahısı.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between sm:justify-start">
                  {/* Branch type toggle */}
                  <div className="flex bg-slate-100 border border-slate-200/40 p-1 rounded-xl">
                    <button
                      onClick={() => setBranchProviderFilter("all")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${branchProviderFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}
                    >
                      Hamısı
                    </button>
                    <button
                      onClick={() => setBranchProviderFilter("expargo")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${branchProviderFilter === "expargo" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}
                    >
                      Expargo ✈️
                    </button>
                    <button
                      onClick={() => setBranchProviderFilter("azerpost")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${branchProviderFilter === "azerpost" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}
                    >
                      Azərpoçt ✉️
                    </button>
                  </div>

                  <button
                    onClick={handleAddNewBranchClick}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Filial Əlavə Et
                  </button>
                </div>
              </div>

              {/* Filtering bar elements */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pb-2">
                <div className="md:col-span-8 flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/50">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Filial adı, şəhər, rayon və ya ünvan axtar..."
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    className="w-full bg-transparent border-none text-xs outline-none text-slate-700 placeholder-slate-400"
                  />
                  {branchSearch && (
                    <button onClick={() => setBranchSearch("")} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="md:col-span-4 flex items-center gap-2 bg-slate-100 px-3 py-2 border border-slate-200/50 rounded-xl">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={branchRegionFilter}
                    onChange={(e) => setBranchRegionFilter(e.target.value)}
                    className="w-full bg-transparent text-xs text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="all">Bütün Regionlar (Hamısı)</option>
                    {uniqueRegions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table List */}
              {loadingBranches ? (
                <div className="py-24 text-center text-xs text-slate-400 italic">Filiallar yüklənir, xahiş edirik gözləyin...</div>
              ) : filteredBranches.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400 italic border border-dashed border-slate-200 rounded-2xl">
                  Axtarış filtrlərinə uyğun heç bir filial tapılmadı.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-400 font-extrabold uppercase tracking-wider text-[9px] border-b border-slate-100">
                          <th className="p-4">Provayder</th>
                          <th className="p-4">Filial Adı</th>
                          <th className="p-4">Region</th>
                          <th className="p-4">Ünvan</th>
                          <th className="p-4">Telefon</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-center">Fəaliyyətlər</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {paginatedBranches.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="p-4">
                              {b.provider === "expargo" ? (
                                <span className="bg-orange-50 text-orange-700 border border-orange-100 text-[8px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 w-max">
                                  <span>✈️</span> EXPARGO
                                </span>
                              ) : (
                                <span className="bg-blue-50 text-blue-700 border border-blue-100 text-[8px] font-black px-2 py-0.5 rounded-lg flex items-center gap-1 w-max">
                                  <span>✉️</span> AZƏRPOÇT
                                </span>
                              )}
                            </td>
                            <td className="p-4 font-extrabold text-slate-800">{b.name}</td>
                            <td className="p-4 text-slate-600 font-semibold">{b.region}</td>
                            <td className="p-4 text-slate-500 font-mono text-[11px] max-w-xs truncate" title={b.address}>{b.address}</td>
                            <td className="p-4 text-slate-500 font-mono text-[11px]">{b.phone || "—"}</td>
                            <td className="p-4">
                              {b.isActive !== false ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-mono font-bold px-2 py-0.5 rounded-md">
                                  AKTİV
                                </span>
                              ) : (
                                <span className="bg-rose-50 text-rose-700 border border-rose-100 text-[9px] font-mono font-bold px-2 py-0.5 rounded-md">
                                  PASSİV
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleEditBranchClick(b)}
                                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all cursor-pointer"
                                  title="Düzəliş et"
                                >
                                  <FileEdit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteBranchClick(b.id, b.name)}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all cursor-pointer"
                                  title="Sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Clean Pagination */}
                  {totalBranchPages > 1 && (
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100/50">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Səhifə <b>{branchPage}</b> / <b>{totalBranchPages}</b> (Cəmi {filteredBranches.length} məntəqə)
                      </span>

                      <div className="flex gap-1">
                        <button
                          disabled={branchPage === 1}
                          onClick={() => setBranchPage(p => p - 1)}
                          className="p-1.5 bg-white shadow-xs rounded-lg text-slate-600 border border-slate-200/40 hover:bg-slate-50 disabled:opacity-50 active:scale-95 transition-all"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          disabled={branchPage === totalBranchPages}
                          onClick={() => setBranchPage(p => p + 1)}
                          className="p-1.5 bg-white shadow-xs rounded-lg text-slate-600 border border-slate-200/40 hover:bg-slate-50 disabled:opacity-50 active:scale-95 transition-all"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

          </motion.div>
        )}


        {/* ==================================================== */}
        {/* TAB B2: LOCAL COURIER DETAILS & STOCK ASSIGNMENTS (PARALLEL OPERATIONS) */}
        {/* ==================================================== */}
        {activeTab === "kuryer" && (
          <motion.div
            key="kuryer_view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Stats row widget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
                  <Bike className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Aktiv Kuryerlər</h4>
                  <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{aggregateActiveCouriers} nəfər</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center w-11 h-11 border border-emerald-100/55">
                  <span className="text-base font-black leading-none">₼</span>
                </div>
                <div>
                  <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cəmi Balans (Nağd Kassa)</h4>
                  <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{formatCurrency(aggregateTotalBalance)}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kuryer Çatdırılmaları</h4>
                  <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">
                    {totalDeliveredOrdersAcrossAll} sifariş
                  </p>
                </div>
              </div>
            </div>

            {/* 📦 Columba.az Special Depot Panel */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-850 space-y-6 relative overflow-hidden dark-panel">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-slate-800/20 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/15 rounded-2xl text-amber-400 border border-amber-500/10">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-base tracking-tight text-white">Columba.az Depot Paneli</h3>
                      <span className="bg-amber-400/15 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-400/10">SAXLANC</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Sakit rejimdə Columba.az kuryer deposunu izləyin və anbardan stoklar köçürün.</p>
                  </div>
                </div>

                {!columbaCourier ? (
                  <button 
                    onClick={autoSetupColumba}
                    className="px-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold hover:bg-amber-400 active:scale-95 transition-all flex items-center gap-1 shadow-md shadow-amber-500/10"
                  >
                    <Plus className="w-4 h-4" /> Columba.az Profilini Qur
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5 font-sans">
                    <button 
                      onClick={() => setIsTransferOpen(true)}
                      className="px-4.5 py-2.5 bg-white text-slate-900 rounded-xl text-xs font-extrabold hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      <ArrowRightLeft className="w-4 h-4 text-amber-500" /> Depoya Köçür
                    </button>
                    <button 
                      onClick={() => setShowHistory(!showHistory)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${showHistory ? 'bg-slate-800 border-slate-700 text-white' : 'border-slate-800 text-slate-400 hover:text-white'}`}
                    >
                      <History className="w-4 h-4" /> {showHistory ? "Gizlə" : "Köçürmə Tarixi"}
                    </button>
                  </div>
                )}
              </div>

              {columbaCourier && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-slate-950/40 border border-slate-800 p-4.5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Depodakı Ümumi Stok</span>
                        {!isEditingColumbaStock && (
                          <button 
                            onClick={() => {
                              setManualColumbaStock(columbaCourier.stock_quantity || 0);
                              setIsEditingColumbaStock(true);
                            }}
                            className="text-slate-500 hover:text-amber-500 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}
                      </div>
                      
                      {isEditingColumbaStock ? (
                        <div className="flex items-center gap-2 mt-2">
                          <input 
                            type="number"
                            value={manualColumbaStock}
                            onChange={e => setManualColumbaStock(Number(e.target.value))}
                            className="w-20 bg-slate-900 border border-slate-700 text-white px-2 py-1 tracking-widest rounded-lg text-sm font-mono focus:border-amber-500 outline-none"
                          />
                          <button 
                            onClick={handleSaveManualStock}
                            className="bg-amber-500 text-slate-900 px-3 py-1 rounded-lg text-xs font-bold hover:bg-amber-400"
                          >
                            Yaz
                          </button>
                          <button 
                            onClick={() => setIsEditingColumbaStock(false)}
                            className="bg-slate-800 text-slate-300 px-2 py-1 rounded-lg text-xs hover:bg-slate-700"
                          >
                            Ləğv
                          </button>
                        </div>
                      ) : (
                        <span className="text-2xl font-black text-white mt-1 font-mono block">
                          {columbaCourier.stock_quantity || 0} <span className="text-xs text-amber-400 font-sans font-bold">ədəd</span>
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="bg-slate-950/40 border border-slate-800 p-4.5 rounded-2xl">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Bu Ayki Əməliyyatlar</span>
                    <span className="text-2xl font-black text-slate-300 mt-1 font-mono block">
                      {stockTransfers.length} <span className="text-xs text-slate-400 font-sans">köçürülmə</span>
                    </span>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800 p-4.5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Əlaqə & Aktivlik</span>
                      <span className="text-xs text-slate-200 mt-2 font-mono block">
                        {columbaCourier.phone} ({columbaCourier.status === "active" ? "Aktiv" : "Deaktiv"})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Historik köçürmə siyahısı */}
              {showHistory && (
                <div className="bg-slate-950/40 dark-panel border border-slate-850 rounded-2xl p-4.5 space-y-3.5 max-h-64 overflow-y-auto">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                    <History className="w-4 h-4 text-amber-500" /> Depoya köçürülən malların qeydiyyat jurnalı
                  </h4>
                  {stockTransfers.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3 italic">Hələ ki, heç bir köçürmə əməliyyatı qeydə alınmayıb.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead>
                          <tr className="border-b border-slate-800/80 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                            <th className="pb-2">Tarix</th>
                            <th className="pb-2">Məhsul</th>
                            <th className="pb-2 text-right">Miqdar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockTransfers.slice().sort((a,b) => b.date.localeCompare(a.date)).map((t) => (
                            <tr key={t.id} className="border-b border-slate-800/40 hover:bg-slate-800/10">
                              <td className="py-2.5 font-mono text-slate-400">{formatDateAZ(t.date)}</td>
                              <td className="py-2.5 font-bold">{t.productName}</td>
                              <td className="py-2.5 text-right font-mono text-amber-400 font-bold">+{t.quantity} ədəd</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Header bar controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 bg-white rounded-2xl border border-slate-100 shadow-sm gap-4">
              <div className="flex flex-1 items-center gap-2 w-full max-w-sm bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200/50">
                <Search className="w-4.5 h-4.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Kuryer adı və ya telefon nömrəsi axtar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs text-slate-700 w-full placeholder-slate-450"
                />
              </div>

              <button 
                onClick={openNewCourierForm}
                className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Yeni Kuryer
              </button>
            </div>

            {/* Grid of Courier Profiles */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCouriers.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 italic bg-white rounded-2xl border border-dashed border-slate-200">
                  Axtarışa uyğun daxil edilmiş kuryer tapılmadı.
                </div>
              ) : (
                filteredCouriers.map((c) => {
                  const isActive = c.status === "active";
                  const stats = courierStats[c.id] || {
                    todayDeliveries: 0,
                    monthDeliveries: 0,
                    totalDeliveries: 0,
                    totalEarnings: 0,
                    activeOrders: []
                  };

                  const isExpanded = expandedCourierId === c.id;

                  return (
                    <div 
                      key={c.id} 
                      className="bg-white border rounded-3xl border-slate-100 hover:border-slate-300 transition-all p-5 shadow-xs space-y-4 flex flex-col justify-between"
                    >
                      
                      {/* Header status */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-2xl ${isActive ? 'bg-sky-50 text-sky-700' : 'bg-slate-50 text-slate-400'}`}>
                              <Bike className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-extrabold text-slate-850 text-sm flex items-center gap-1.5">
                                {c.name}
                                {c.isDepotBased && (
                                  <span className="bg-amber-100 text-amber-850 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">DEPO</span>
                                )}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{c.phone}</p>
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            {isActive ? "Aktiv" : "Deaktiv"}
                          </span>
                        </div>

                        {/* Dynamic Courier Statistics Panel */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-3 rounded-2xl font-mono">
                          <div className="p-1.5 bg-white rounded-xl border border-slate-100">
                            <span className="text-[9px] text-slate-400 font-sans block">Bu gün</span>
                            <span className="text-slate-800 font-extrabold">{stats.todayDeliveries} yol</span>
                          </div>
                          <div className="p-1.5 bg-white rounded-xl border border-slate-100">
                            <span className="text-[9px] text-slate-400 font-sans block">Bu ay</span>
                            <span className="text-slate-800 font-extrabold">{stats.monthDeliveries} yol</span>
                          </div>
                          <div className="p-1.5 bg-white rounded-xl border border-slate-100">
                            <span className="text-[9px] text-slate-400 font-sans block">Yol Haqqı</span>
                            <span className="text-slate-800 font-extrabold">{formatCurrency(c.standardDeliveryFee)}</span>
                          </div>
                          <div className="p-1.5 bg-white rounded-xl border border-slate-100">
                            <span className="text-[9px] text-slate-400 font-sans block">Ümumi qazanc</span>
                            <span className="text-slate-800 font-extrabold">{formatCurrency(stats.totalEarnings)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Balance & settlement */}
                      <div className="p-3.5 bg-emerald-50 text-emerald-950 rounded-2xl flex justify-between items-center border border-emerald-100/40">
                        <div>
                          <span className="text-[9px] text-emerald-600 block font-bold uppercase tracking-wider">Kuryer Stoku</span>
                          <span className="text-base font-extrabold text-emerald-850 font-mono mt-0.5">{c.stockBalance || 0} ədəd</span>
                        </div>
                        
                        {(c.stockBalance || 0) > 0 && (
                          <button 
                            onClick={() => triggerResetBalance(c)}
                            title="Hesablaşma et (Kassanı Boşalt)"
                            className="p-2 bg-white hover:bg-emerald-100 text-emerald-700 hover:text-emerald-990 border border-emerald-200 rounded-xl transition-all shadow-xs cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4 text-emerald-600" />
                          </button>
                        )}
                      </div>

                      {/* expandable Active Orders list for this courier */}
                      <div className="border border-slate-100 rounded-2xl overflow-hidden text-xs">
                        <button 
                          onClick={() => setExpandedCourierId(isExpanded ? null : c.id)}
                          className="w-full bg-slate-50 hover:bg-slate-100 px-3 py-2.5 flex justify-between items-center transition-all text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                        >
                          <span>⏱ Aktiv Sifarişlər ({stats.activeOrders.length})</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="bg-white border-t border-slate-100 max-h-48 overflow-y-auto"
                            >
                              {stats.activeOrders.length === 0 ? (
                                <div className="p-3 text-center text-[10px] text-slate-400 italic">Hazırda aktiv sifariş tapılmadı.</div>
                              ) : (
                                <div className="divide-y divide-slate-100">
                                  {stats.activeOrders.map(sale => (
                                    <div key={sale.id} className="p-2.5 hover:bg-slate-50/50 flex flex-col gap-0.5">
                                      <div className="flex justify-between text-[11px] font-mono">
                                        <span className="text-slate-700 font-bold">{sale.orderNumber}</span>
                                        <span className="text-amber-600 font-extrabold uppercase">GÖZLƏYİR</span>
                                      </div>
                                      <div className="text-[10px] text-slate-800 font-semibold">{sale.customerName}</div>
                                      <div className="text-[9px] text-slate-500 leading-snug line-clamp-1">{sale.address}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Card actions footer */}
                      <div className="flex gap-2 border-t border-slate-50 pt-4">
                        <button 
                          onClick={() => openEditCourierForm(c)}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 font-semibold border border-slate-200/40 text-slate-700 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer"
                        >
                          <FileEdit className="w-3.5 h-3.5" /> Redaktə Et
                        </button>

                        {!c.isDepotBased && (
                          <button 
                            onClick={() => {
                              if (confirm(`${c.name} adlı kuryeri və onunla bağlı bütün parametrləri silmək istəyirsiniz?`)) {
                                deleteCourier(c.id);
                                addToast({ type: "warning", title: "Kuryer Silindi", content: "Kuryer profili uğurla qaldırıldı." });
                              }
                            }}
                            className="p-2 bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 rounded-xl transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })
              )}
            </div>

          </motion.div>
        )}


        {/* ==================================================== */}
        {/* TAB B3: DYNAMIC REAL-TIME BUSINESS ANALYSIS & METRICS */}
        {/* ==================================================== */}
        {activeTab === "stats" && (
          <motion.div
            key="stats_view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="space-y-6"
          >
            {/* Range Filters Box */}
            <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Tarix Aralığı və Filtrlər</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 font-sans">Statistikanı izləmək üçün vaxt pəncərəsini təyin edin.</p>
              </div>

              {/* Combined Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-3.5 w-full md:w-auto items-stretch">
                <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200/50">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <select
                    value={statsPreset}
                    onChange={(e) => setStatsPreset(e.target.value as any)}
                    className="bg-transparent text-xs text-slate-705 font-bold outline-none cursor-pointer"
                  >
                    <option value="today">Bu gün</option>
                    <option value="week">Bu həftə</option>
                    <option value="month">Bu ay (Cari)</option>
                    <option value="custom">Xüsusi tarix aralığı</option>
                  </select>
                </div>

                {statsPreset === "custom" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={statsStartStr}
                      onChange={(e) => setStatsStartStr(e.target.value)}
                      className="bg-slate-100 border border-slate-200/50 px-3 py-1.5 rounded-xl text-xs text-slate-700 font-mono outline-none"
                    />
                    <span className="text-xs uppercase text-slate-400 px-1 font-bold">Və</span>
                    <input
                      type="date"
                      value={statsEndStr}
                      onChange={(e) => setStatsEndStr(e.target.value)}
                      className="bg-slate-100 border border-slate-200/50 px-3 py-1.5 rounded-xl text-xs text-slate-700 font-mono outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* General metrics widgets */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1 */}
              <div className="bg-white p-6 border border-slate-100 rounded-3xl shadow-xs flex items-center gap-4.5">
                <div className="p-3.5 bg-indigo-50 text-indigo-650 rounded-2xl">
                  <Activity className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-widest">Cəmi Sifariş Sayı</span>
                  <span className="text-2xl font-black mt-1 font-mono text-slate-800 block">
                    {loadingStats ? "..." : `${mainStats.totalDeliveries} ədəd`}
                  </span>
                </div>
              </div>

              {/* Card 2 */}
              <div className="bg-white p-6 border border-slate-100 rounded-3xl shadow-xs flex items-center gap-4.5">
                <div className="p-3.5 bg-emerald-50 text-emerald-650 rounded-2xl">
                  <Coins className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-widest">Ümumi Çatdırılma Xərci</span>
                  <span className="text-2xl font-black mt-1 font-mono text-slate-800 block">
                    {loadingStats ? "..." : formatCurrency(mainStats.totalCost)}
                  </span>
                </div>
              </div>

              {/* Card 3 */}
              <div className="bg-white p-6 border border-slate-100 rounded-3xl shadow-xs flex items-center gap-4.5">
                <div className="p-3.5 bg-purple-50 text-purple-650 rounded-2xl">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase block tracking-widest">Ortalama Yol Xərci</span>
                  <span className="text-2xl font-black mt-1 font-mono text-slate-800 block">
                    {loadingStats ? "..." : formatCurrency(mainStats.averageCost)}
                  </span>
                </div>
              </div>

            </div>


            {/* Split Breakdown Analytics Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Column 1: Provider summary table & percent chart */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-50 pb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Provayderlərin Pay Faizi</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Sifarişlərin kanallara və kuryerlər üzrə paylanmasının analitik təhlili.</p>
                </div>

                {loadingStats ? (
                  <div className="py-24 text-center text-xs text-slate-400 italic">Göstəricilər hesablanır...</div>
                ) : (
                  <div className="space-y-4.5 pt-2">
                    
                    {/* Expargo dynamic bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                          <span className="p-1 bg-orange-400/20 text-orange-600 rounded">✈️</span> Expargo Kargo
                        </span>
                        <span className="font-mono text-slate-500 font-bold">
                          {mainStats.providerStats.expargo.count} ədəd ({mainStats.providerStats.expargo.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-orange-500 rounded-full"
                          style={{ width: `${mainStats.providerStats.expargo.percentage}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block text-right mt-1">Xərc: {formatCurrency(mainStats.providerStats.expargo.cost)}</span>
                    </div>

                    {/* Azerpost dynamic bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                          <span className="p-1 bg-blue-400/20 text-blue-600 rounded">✉️</span> Azərpoçt Dövlət Poçtu
                        </span>
                        <span className="font-mono text-slate-500 font-bold">
                          {mainStats.providerStats.azerpost.count} ədəd ({mainStats.providerStats.azerpost.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${mainStats.providerStats.azerpost.percentage}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block text-right mt-1">Xərc: {formatCurrency(mainStats.providerStats.azerpost.cost)}</span>
                    </div>

                    {/* Private Courier dynamic bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
                          <span className="p-1 bg-sky-400/20 text-sky-600 rounded">🚴</span> Şəxsi Kuryerlər
                        </span>
                        <span className="font-mono text-slate-500 font-bold">
                          {mainStats.providerStats.courier.count} ədəd ({mainStats.providerStats.courier.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-sky-500 rounded-full"
                          style={{ width: `${mainStats.providerStats.courier.percentage}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block text-right mt-1">Xərc: {formatCurrency(mainStats.providerStats.courier.cost)}</span>
                    </div>

                  </div>
                )}
              </div>

              {/* Column 2: Zone breakdown list */}
              <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-50 pb-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Çatdırılma Zonaları</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Sifarişlərin ünvan zonalarına və qiymətlərinə görə bölünməsi.</p>
                </div>

                {loadingStats ? (
                  <div className="py-24 text-center text-xs text-slate-400 italic">Zonalar təhlil olunur...</div>
                ) : Object.keys(mainStats.zoneStats).length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400 italic">Bu aralıqda hər hansı bir kargo sifarişi tapılmadı.</div>
                ) : (
                  <div className="divide-y divide-slate-100 pt-1">
                    {Object.keys(mainStats.zoneStats).map((zoneName) => {
                      const value = mainStats.zoneStats[zoneName];
                      return (
                        <div key={zoneName} className="py-3 flex justify-between items-center hover:bg-slate-50/40 px-1 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">{zoneName}</span>
                          </div>
                          
                          <div className="text-right flex items-center gap-5">
                            <div className="text-[10px] text-slate-450 font-semibold font-mono">
                              {value.count} sifariş
                            </div>
                            <div className="text-xs font-black text-slate-800 font-mono">
                              {formatCurrency(value.cost)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

          </motion.div>
        )}

      </AnimatePresence>


      {/* ==================================================== */}
      {/* 🔮 MODAL 1: COURIER PROFILE FORM DIALOG */}
      {/* ==================================================== */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsFormOpen(false)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black tracking-tight text-slate-800 flex items-center gap-2 mb-1">
              <span className="p-1 px-2 bg-slate-800 rounded text-xs text-white">🚴</span>
              {editCourier ? "Kuryer Profilini Redaktə Et" : "Yeni Şəxsi Kuryer Yaradılması"}
            </h3>
            <p className="text-[10px] text-slate-400 mb-5">Şəxsi kuryerinizin əlaqə və maliyyə qazanc tarifini sistemə qeyd edin.</p>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Kuryer Tam Adı</label>
                <input 
                  type="text" 
                  placeholder="Məs: Emil Məmmədov"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Mobil Telefon Nömrəsi</label>
                <input 
                  type="text" 
                  placeholder="Məs: 055 123 45 67"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-slate-800 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Standart Çatdırılma Qiyməti (₼)</label>
                  <input 
                    type="number" 
                    placeholder="3.00"
                    value={formFee}
                    onChange={(e) => setFormFee(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-slate-800 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Kuryer Aktivlik Durumu</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-slate-800 cursor-pointer"
                  >
                    <option value="active">Aktiv Kuryer</option>
                    <option value="inactive">Deaktiv Kuryer</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 py-1.5 px-1 bg-slate-50/50 rounded-xl border border-slate-100">
                <input 
                  type="checkbox" 
                  id="formIsDepotBased"
                  checked={formIsDepotBased}
                  onChange={(e) => setFormIsDepotBased(e.target.checked)}
                  className="w-4 h-4 text-slate-800 border-slate-300 rounded focus:ring-slate-800 cursor-pointer"
                />
                <label htmlFor="formIsDepotBased" className="text-xs font-bold text-slate-600 select-none cursor-pointer">
                  Depolu kuryer providerdir (Məs: Columba.az)
                </label>
              </div>

              <button 
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer text-center"
              >
                {editCourier ? "Dəyişiklikləri Saxla" : "Kuryer Profilini Yadda Saxla"}
              </button>
            </form>
          </div>
        </div>
      )}


      {/* ==================================================== */}
      {/* 🔮 MODAL 2: DEPOT STOCK TRANSFER FROM STORE DIALOG */}
      {/* ==================================================== */}
      {isTransferOpen && columbaCourier && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setIsTransferOpen(false)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black tracking-tight text-slate-800 flex items-center gap-2 mb-1">
              <span className="p-1 px-2 bg-amber-500 text-slate-950 font-bold rounded text-xs">📦</span>
              Depoya Məhsul Köçürülməsi
            </h3>
            <p className="text-[10px] text-slate-400 mb-5">Əsas anbardan Columba.az xidməti üzrə kuryer saxlanğıcına stok köçürün.</p>

            <form onSubmit={handleStockTransferSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Məhsul Seçimi</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-slate-800 cursor-pointer font-semibold"
                >
                  <option value="">Məhsul seçin...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Anbarda: {p.stock} ədəd)</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Köçürülən Stok Miqdarı (ədəd)</label>
                <input 
                  type="number" 
                  min="1"
                  value={transferQty}
                  onChange={(e) => setTransferQty(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-slate-800 font-mono"
                />
              </div>

              <div className="text-[10px] text-amber-600 bg-amber-50 rounded-xl p-3 border border-amber-100/30 font-semibold leading-normal">
                ⚠️ Diqqət! Köçürülən stok qeyd edildiyi an əsas anbardan silinərək avtomatik olaraq kuryerin deposuna (Columba.az) köçürüləcəkdir.
              </div>

              <button 
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer text-center"
              >
                Stok Köçürməsini Təsdiqlə
              </button>
            </form>
          </div>
        </div>
      )}


      {/* ==================================================== */}
      {/* 🔮 MODAL 3: TARIFF EDITING MODAL (EXPARGO / AZERPOST) */}
      {/* ==================================================== */}
      {tariffModalProvider && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => {
                setTariffModalProvider(null);
                setIsAddTariffOpen(false);
              }}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-between items-center mb-4 pr-6">
              <div>
                <h3 className="text-base font-black tracking-tight text-slate-800 flex items-center gap-2">
                  <span className="p-1 px-2 bg-slate-950 font-bold rounded text-xs text-white flex items-center justify-center"><Coins className="w-3.5 h-3.5 text-amber-400" /></span>
                  {tariffModalProvider === "expargo" ? "Expargo Sifariş Tarifləri" : "Azərpoçt Çatdırılma Tarifləri"}
                </h3>
                <p className="text-[10px] text-slate-400">Zonalar və rayonlar üzrə çatdırılma xərclərini tənzimləyin.</p>
              </div>
              <button
                onClick={() => setIsAddTariffOpen(!isAddTariffOpen)}
                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[10px] uppercase tracking-wider rounded-xl flex items-center gap-1 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3 h-3" /> {isAddTariffOpen ? "İmtina et" : "Yeni Qiymət"}
              </button>
            </div>

            {/* Slide-out/Toggle-able Add Tariff Inline Form */}
            {isAddTariffOpen && (
              <form onSubmit={handleSaveNewTariff} className="bg-slate-50 border border-slate-200/40 p-4 rounded-2xl mb-4 space-y-3">
                <div className="font-extrabold text-[10px] uppercase text-slate-500 tracking-wider">Yeni Ölçü / Regional Zona Qiyməti</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Zona və ya Şöbə Adı</label>
                    <input
                      type="text"
                      required
                      placeholder="Məs: Biləsuvar, Gəncə mərkəz"
                      value={tariffFormZoneName}
                      onChange={(e) => setTariffFormZoneName(e.target.value)}
                      className="w-full bg-white border border-slate-200 px-2.5 py-2 rounded-xl text-xs outline-none focus:border-amber-500 text-slate-700 font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Tarif Qiyməti (AZN)</label>
                    <div className="flex items-center gap-1 w-full bg-white border border-slate-200 px-2 rounded-xl py-1.5">
                      <span className="text-slate-400 font-sans text-xs">₼</span>
                      <input
                        type="text"
                        required
                        placeholder="Məs: 3.50"
                        value={tariffFormPrice}
                        onChange={(e) => setTariffFormPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="bg-transparent border-none outline-none font-mono font-bold text-slate-700 text-xs w-full text-left"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddTariffOpen(false)}
                    className="px-3 py-1.5 bg-slate-200/50 hover:bg-slate-200 text-slate-600 font-bold rounded-lg cursor-pointer transition-all"
                  >
                    Ləğv Et
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-lg cursor-pointer transition-all shadow-sm"
                  >
                    Əlavə Et
                  </button>
                </div>
              </form>
            )}

            {loadingTariffs ? (
              <div className="py-12 text-center text-xs text-slate-400 italic font-medium">Tariflər siyahısı yüklənir...</div>
            ) : activeTariffs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 italic">Qeydə alınmış tarif tapılmadı.</div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-2xl border border-slate-100 max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-extrabold uppercase tracking-wider text-[9px] border-b border-slate-100">
                        <th className="p-3">Zona Adı</th>
                        <th className="p-3">Çatdırılma Qiyməti (AZN)</th>
                        <th className="p-3 text-right">Fəaliyyət</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {activeTariffs.map((t) => {
                        const currentVal = tariffPricesInput[t.id] !== undefined ? tariffPricesInput[t.id] : t.price;
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="p-3 font-extrabold text-slate-800">{t.zoneName}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 w-24 bg-slate-100 border border-slate-200/50 px-2 py-1 rounded-lg">
                                <span className="text-slate-400 text-[10px] font-sans">₼</span>
                                <input
                                  type="text"
                                  value={currentVal}
                                  onChange={(e) => handleTariffPriceChange(t.id, e.target.value)}
                                  className="bg-transparent border-none outline-none font-mono font-bold text-slate-700 text-xs w-full text-left"
                                />
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-1.5 items-center">
                                <button
                                  onClick={() => saveTariffUpdate(t.id, t.zoneName)}
                                  disabled={updatingTariff}
                                  className="px-2.5 py-1.5 bg-slate-850 hover:bg-slate-750 text-white font-bold text-[10px] rounded-lg cursor-pointer disabled:opacity-50 transition-all active:scale-95 whitespace-nowrap"
                                >
                                  Yenilə
                                </button>
                                <button
                                  onClick={() => handleDeleteTariffClick(t.id, t.zoneName)}
                                  className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer transition-all"
                                  title="Qiyməti Sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-50">
                  <button
                    onClick={() => {
                      setTariffModalProvider(null);
                      setIsAddTariffOpen(false);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer active:scale-95 transition-all"
                  >
                    Bağla
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ==================================================== */}
      {/* 🔮 MODAL 4: DYNAMIC BRANCH CREATION / EDITING DIALOG (EXPARGO / AZERPOST) */}
      {/* ==================================================== */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setIsBranchModalOpen(false)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black tracking-tight text-slate-800 flex items-center gap-2 mb-1">
              <span className="p-1 px-2 bg-indigo-600 font-bold rounded text-xs text-white">🏢</span>
              {branchEditingId ? "Filial Məntəqəsini Redaktə Et" : "Yeni Filial Məntəqəsi Əlavə Et"}
            </h3>
            <p className="text-[10px] text-slate-400 mb-5">Expargo və ya Azərpoçt üçün qeydiyyatdan keçmiş yeni fiziki xidmət məntəqəsi yaxud poçt şöbəsi yaradın.</p>

            <form onSubmit={handleSaveBranch} className="space-y-4 text-xs">
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Provayder Növü</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBranchFormProvider("expargo")}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${branchFormProvider === "expargo" ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}
                  >
                    ✈️ Expargo
                  </button>
                  <button
                    type="button"
                    onClick={() => setBranchFormProvider("azerpost")}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${branchFormProvider === "azerpost" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}
                  >
                    ✉️ Azərpoçt
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Filialın / Şöbənin Adı</label>
                <input 
                  type="text" 
                  required
                  placeholder="Məsələn: Nərimanov Filialı, PŞ №10"
                  value={branchFormName}
                  onChange={(e) => setBranchFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-indigo-500 font-semibold text-slate-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Şəhər / Region</label>
                <input 
                  type="text" 
                  required
                  placeholder="Məsələn: Bakı, Abşeron, Sumqayıt"
                  value={branchFormRegion}
                  onChange={(e) => setBranchFormRegion(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-indigo-500 font-semibold text-slate-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tam Ünvan</label>
                <textarea 
                  required
                  rows={2}
                  placeholder="Məsələn: Ağa Neymətulla küç. 49a"
                  value={branchFormAddress}
                  onChange={(e) => setBranchFormAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-indigo-500 font-semibold text-slate-700 resize-none animate-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Əlaqə Telefonu / Poçt İndeksi</label>
                <input 
                  type="text" 
                  placeholder="Məsələn: 012 210 00 85 və ya AZ1010"
                  value={branchFormPhone}
                  onChange={(e) => setBranchFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none focus:border-indigo-500 font-mono font-semibold text-slate-700"
                />
              </div>

              <div className="flex items-center gap-2 py-1.5 px-1 bg-slate-50 rounded-xl border border-slate-100">
                <input 
                  type="checkbox" 
                  id="branchFormIsActive"
                  checked={branchFormIsActive}
                  onChange={(e) => setBranchFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="branchFormIsActive" className="text-xs font-bold text-slate-600 select-none cursor-pointer">
                  Filial aktivdir (Sifariş qəbul edir)
                </label>
              </div>

              <button 
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer text-center text-xs uppercase tracking-wider"
              >
                {branchEditingId ? "Dəyişiklikləri Saxla" : "Filialı Yadda Saxla"}
              </button>
            </form>
          </div>
        </div>
      )}


    </div>
  );
}
