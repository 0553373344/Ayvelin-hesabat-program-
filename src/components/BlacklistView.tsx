import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../context/DataContext";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  UserX,
  Plus,
  Search,
  Phone,
  MessageCircle,
  RotateCcw,
  Download,
  Printer,
  Trash2,
  Edit3,
  ExternalLink,
  Ban,
  CheckCircle,
  X,
  Layers,
  ShoppingBag,
  TrendingDown,
  Info,
  ChevronRight,
  Filter,
  Check
} from "lucide-react";
import { Customer, Sale } from "../types";
import { formatCurrency, formatDateAZ } from "../utils/xlsEngine";
import { formatPhoneNumber } from "../utils/phoneFormatter";
import { formatDisplayOrderNumber } from "../utils/orderFormatter";

const PREDEFINED_REASONS = [
  "Sifarişi çatdırılma zamanı qapıda ləğv etdi",
  "Kuryer zənglərinə cavab vermədi / imtina etdi",
  "Ödəniş etməkdən imtina etdi",
  "Saxta / qeyri-ciddi sifariş yerləşdirdi",
  "Ünvanda tapılmadı və əlaqə kəsildi",
  "Sifariş göndərildikdən sonra ləğv etdi",
  "Digər narazılıq və ya qayda pozuntusu"
];

export default function BlacklistView() {
  const navigate = useNavigate();
  const { 
    customers, 
    sales, 
    toggleCustomerBlacklist, 
    syncAllCancelledCustomersToBlacklist, 
    saveCustomer, 
    addToast 
  } = useData();

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "multi_cancel" | "single_cancel" | "high_loss">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "cancels_desc" | "loss_desc" | "name_asc">("date_desc");

  // Phone Checker state
  const [checkerQuery, setCheckerQuery] = useState("");

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditReasonModalOpen, setIsEditReasonModalOpen] = useState(false);
  const [isUnblacklistModalOpen, setIsUnblacklistModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [customReason, setCustomReason] = useState("");

  // Add modal state
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [selectedExistingCustId, setSelectedExistingCustId] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newReason, setNewReason] = useState(PREDEFINED_REASONS[0]);
  const [newCustomReason, setNewCustomReason] = useState("");

  // Pre-calculate sales grouped by customer clean phone
  const cleanPhone = (p?: string) => (p || "").replace(/\D/g, "");

  const customerCancelledSalesMap = useMemo(() => {
    const map = new Map<string, Sale[]>();
    sales.forEach(sale => {
      if (sale.status === "ləğv edilib") {
        const phone = cleanPhone(sale.customerPhone);
        if (phone) {
          const list = map.get(phone) || [];
          list.push(sale);
          map.set(phone, list);
        }
        if (sale.customerId) {
          const listCust = map.get(sale.customerId) || [];
          if (!listCust.includes(sale)) {
            listCust.push(sale);
            map.set(sale.customerId, listCust);
          }
        }
      }
    });
    return map;
  }, [sales]);

  // All blacklisted customers
  const blacklistedCustomers = useMemo(() => {
    return customers.filter(c => c.isBlacklisted === true);
  }, [customers]);

  // Total detected cancelled orders in database
  const totalCancelledOrders = useMemo(() => {
    return sales.filter(s => s.status === "ləğv edilib");
  }, [sales]);

  // Calculate total lost value across all blacklisted customers
  const totalLostAmount = useMemo(() => {
    let total = 0;
    blacklistedCustomers.forEach(cust => {
      const phone = cleanPhone(cust.phone);
      const cSales = (phone ? customerCancelledSalesMap.get(phone) : null) || 
                     (cust.id ? customerCancelledSalesMap.get(cust.id) : null) || [];
      const sum = cSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
      total += sum;
    });
    return total;
  }, [blacklistedCustomers, customerCancelledSalesMap]);

  // Repeat cancellers (2+ cancellations)
  const repeatCancellersCount = useMemo(() => {
    return blacklistedCustomers.filter(cust => {
      const phone = cleanPhone(cust.phone);
      const cSales = (phone ? customerCancelledSalesMap.get(phone) : null) || 
                     (cust.id ? customerCancelledSalesMap.get(cust.id) : null) || [];
      return cSales.length >= 2;
    }).length;
  }, [blacklistedCustomers, customerCancelledSalesMap]);

  // Detected unsynced cancelled customers count
  const unsyncedCancelledCount = useMemo(() => {
    const blacklistedPhoneSet = new Set(blacklistedCustomers.map(c => cleanPhone(c.phone)));
    let count = 0;
    const processedPhones = new Set<string>();
    totalCancelledOrders.forEach(s => {
      const p = cleanPhone(s.customerPhone);
      if (p && !blacklistedPhoneSet.has(p) && !processedPhones.has(p)) {
        processedPhones.add(p);
        count++;
      }
    });
    return count;
  }, [blacklistedCustomers, totalCancelledOrders]);

  // Filtered & Sorted blacklisted customers
  const processedCustomers = useMemo(() => {
    let list = [...blacklistedCustomers];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const qCleanPhone = cleanPhone(q);
      list = list.filter(c => {
        const nameMatch = (c.name || "").toLowerCase().includes(q);
        const phoneMatch = cleanPhone(c.phone).includes(qCleanPhone);
        const reasonMatch = (c.blacklistReason || "").toLowerCase().includes(q);
        const addressMatch = (c.addresses || []).some(a => a.toLowerCase().includes(q));
        return nameMatch || phoneMatch || reasonMatch || addressMatch;
      });
    }

    // Filter Type
    if (filterType === "multi_cancel") {
      list = list.filter(c => {
        const p = cleanPhone(c.phone);
        const sList = (p ? customerCancelledSalesMap.get(p) : null) || 
                      (c.id ? customerCancelledSalesMap.get(c.id) : null) || [];
        return sList.length >= 2;
      });
    } else if (filterType === "single_cancel") {
      list = list.filter(c => {
        const p = cleanPhone(c.phone);
        const sList = (p ? customerCancelledSalesMap.get(p) : null) || 
                      (c.id ? customerCancelledSalesMap.get(c.id) : null) || [];
        return sList.length === 1;
      });
    } else if (filterType === "high_loss") {
      list = list.filter(c => {
        const p = cleanPhone(c.phone);
        const sList = (p ? customerCancelledSalesMap.get(p) : null) || 
                      (c.id ? customerCancelledSalesMap.get(c.id) : null) || [];
        const sum = sList.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        return sum >= 50;
      });
    }

    // Sort
    list.sort((a, b) => {
      const pA = cleanPhone(a.phone);
      const pB = cleanPhone(b.phone);
      const sListA = (pA ? customerCancelledSalesMap.get(pA) : null) || 
                     (a.id ? customerCancelledSalesMap.get(a.id) : null) || [];
      const sListB = (pB ? customerCancelledSalesMap.get(pB) : null) || 
                     (b.id ? customerCancelledSalesMap.get(b.id) : null) || [];
      const sumA = sListA.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
      const sumB = sListB.reduce((acc, s) => acc + (s.totalAmount || 0), 0);

      if (sortBy === "cancels_desc") {
        return sListB.length - sListA.length;
      }
      if (sortBy === "loss_desc") {
        return sumB - sumA;
      }
      if (sortBy === "name_asc") {
        return (a.name || "").localeCompare(b.name || "");
      }
      // date_desc
      const dateA = a.blacklistedAt || a.createdAt || "";
      const dateB = b.blacklistedAt || b.createdAt || "";
      return dateB.localeCompare(dateA);
    });

    return list;
  }, [blacklistedCustomers, searchQuery, filterType, sortBy, customerCancelledSalesMap]);

  // Checker query analysis
  const checkerResult = useMemo(() => {
    if (!checkerQuery.trim()) return null;
    const qClean = cleanPhone(checkerQuery);
    const qText = checkerQuery.toLowerCase().trim();

    // Check if blacklisted
    const matchCust = customers.find(c => {
      const cp = cleanPhone(c.phone);
      const ap = cleanPhone(c.altPhone || "");
      const name = (c.name || "").toLowerCase();
      return (qClean && (cp.includes(qClean) || ap.includes(qClean))) || (qText && name.includes(qText));
    });

    // Check cancelled sales
    const matchedSales = sales.filter(s => {
      const sp = cleanPhone(s.customerPhone);
      const sn = (s.customerName || "").toLowerCase();
      return (qClean && sp.includes(qClean)) || (qText && sn.includes(qText));
    });

    const cancelledSales = matchedSales.filter(s => s.status === "ləğv edilib");
    const deliveredSales = matchedSales.filter(s => s.status === "çatdırılıb");

    const isBlacklisted = matchCust?.isBlacklisted === true;

    return {
      customer: matchCust,
      isBlacklisted,
      totalOrders: matchedSales.length,
      cancelledOrders: cancelledSales,
      deliveredOrders: deliveredSales,
      lostAmount: cancelledSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0)
    };
  }, [checkerQuery, customers, sales]);

  // Handler for syncing all cancelled customers
  const handleBatchSync = async () => {
    setIsSyncing(true);
    try {
      await syncAllCancelledCustomersToBlacklist();
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler for manual add
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = newReason === "Digər narazılıq və ya qayda pozuntusu" && newCustomReason.trim()
      ? newCustomReason.trim()
      : newReason;

    if (addMode === "existing") {
      if (!selectedExistingCustId) {
        addToast({
          type: "warning",
          title: "Xəbərdarlıq",
          content: "Zəhmət olmasa müştəri seçin."
        });
        return;
      }
      await toggleCustomerBlacklist(selectedExistingCustId, true, finalReason);
    } else {
      if (!newName.trim() || !newPhone.trim()) {
        addToast({
          type: "warning",
          title: "Xəbərdarlıq",
          content: "Müştəri adı və telefon nömrəsi mütləqdir."
        });
        return;
      }
      const newCust: any = {
        name: newName.trim(),
        phone: formatPhoneNumber(newPhone),
        addresses: newAddress.trim() ? [newAddress.trim()] : [],
        notes: "Əllə qara siyahıya əlavə edildi",
        isBlacklisted: true,
        blacklistReason: finalReason,
        blacklistedAt: new Date().toISOString(),
        tags: ["Qara Siyahı"]
      };
      await saveCustomer(newCust);
      addToast({
        type: "warning",
        title: "🚫 Qara Siyahıya Əlavə Edildi",
        content: `${newName} uğurla qara siyahıya salındı.`
      });
    }

    // Reset form
    setIsAddModalOpen(false);
    setSelectedExistingCustId("");
    setNewName("");
    setNewPhone("");
    setNewAddress("");
    setNewReason(PREDEFINED_REASONS[0]);
    setNewCustomReason("");
  };

  // Handler for edit reason
  const handleSaveReason = async () => {
    if (!selectedCustomer) return;
    const finalReason = reasonInput === "Digər narazılıq və ya qayda pozuntusu" && customReason.trim()
      ? customReason.trim()
      : reasonInput;

    await toggleCustomerBlacklist(selectedCustomer.id, true, finalReason);
    setIsEditReasonModalOpen(false);
    setSelectedCustomer(null);
  };

  // Handler for unblacklist
  const handleConfirmUnblacklist = async () => {
    if (!selectedCustomer) return;
    await toggleCustomerBlacklist(selectedCustomer.id, false);
    setIsUnblacklistModalOpen(false);
    setSelectedCustomer(null);
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const dataToExport = processedCustomers.map((cust, idx) => {
        const p = cleanPhone(cust.phone);
        const cSales = (p ? customerCancelledSalesMap.get(p) : null) || 
                       (cust.id ? customerCancelledSalesMap.get(cust.id) : null) || [];
        const lost = cSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        const orderNums = cSales.map(s => formatDisplayOrderNumber(s.orderNumber)).join(", ");

        return {
          "№": idx + 1,
          "Müştəri Adı": cust.name || "",
          "Telefon": cust.phone || "",
          "Əlavə Nömrə": cust.altPhone || "",
          "Şəhər / Ünvan": (cust.addresses || []).join("; ") || cust.city || "",
          "Ləğv Sayı": cSales.length,
          "Ləğv Edilmiş Sifarişlər": orderNums,
          "İtirilmiş Məbləğ (AZN)": lost,
          "Qara Siyahı Səbəbi": cust.blacklistReason || "Qeyd edilməyib",
          "Qara Siyahıya Salınma Tarixi": cust.blacklistedAt ? formatDateAZ(cust.blacklistedAt) : ""
        };
      });

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Qara Siyahı");
      XLSX.writeFile(wb, `Ayvelin_Qara_Siyahi_${new Date().toISOString().split("T")[0]}.xlsx`);

      addToast({
        type: "success",
        title: "Excel İxrac Edildi",
        content: `${dataToExport.length} qara siyahı qeydi Excel faylına yazıldı.`
      });
    } catch (err) {
      console.error("Export error:", err);
      addToast({
        type: "warning",
        title: "Xəta",
        content: "Excel ixrac edilərkən xəta baş verdi."
      });
    }
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header & Primary Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-[#151922] p-5 sm:p-6 rounded-2xl border border-rose-100 dark:border-rose-950/40 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex items-start gap-4">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center text-white shadow-lg shadow-rose-500/25 flex-shrink-0">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Qara Siyahı (Blacklist)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">
                {blacklistedCustomers.length} Müştəri
              </span>
              {unsyncedCancelledCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 animate-pulse">
                  +{unsyncedCancelledCount} yeni ləğv aşkarlandı
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Sifarişləri ləğv edən, kuryeri gözlədib qəbul etməyən və problemli müştərilərin mərkəzləşdirilmiş idarəetmə və avtomatik xəbərdarlıq sistemi.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="relative z-10 flex items-center gap-2.5 flex-wrap">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleBatchSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-medium text-xs sm:text-sm shadow-md shadow-rose-600/20 cursor-pointer transition-all disabled:opacity-60"
            title="Ləğv edən bütün müştəriləri avtomatik qara siyahıya əlavə edir"
          >
            <RotateCcw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? "Sinxron edilir..." : "Bütün Ləğv Edənləri Əlavə Et"}</span>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/15 text-white font-medium text-xs sm:text-sm border border-slate-800 dark:border-white/10 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Əllə Əlavə Et</span>
          </motion.button>

          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={handleExportExcel}
              className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              title="Excel İxrac (.xlsx)"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrint}
              className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              title="Çap Et"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="bg-white dark:bg-[#151922] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Qara Siyahıdakılar
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
              {blacklistedCustomers.length}
            </span>
            <span className="text-xs text-slate-500">müştəri</span>
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 flex items-center gap-1 font-medium">
            <Ban className="w-3.5 h-3.5" />
            <span>Sifariş qəbulunda xəbərdarlıq verilir</span>
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-white dark:bg-[#151922] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Ləğv Edilmiş Sifarişlər
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
              {totalCancelledOrders.length}
            </span>
            <span className="text-xs text-slate-500">sifariş</span>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Sistemdə qeydiyyatdan keçmiş ləğvlər</span>
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-white dark:bg-[#151922] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              İtirilmiş Məbləğ
            </span>
            <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 font-mono">
              {formatCurrency(totalLostAmount)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Ləğv edilmiş sifarişlərin ümumi potensialı
          </p>
        </div>

        {/* Card 4 */}
        <div className="bg-white dark:bg-[#151922] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Təkrar Ləğv Edənlər
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono">
              {repeatCancellersCount}
            </span>
            <span className="text-xs text-slate-500">müştəri (≥2 ləğv)</span>
          </div>
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 font-medium">
            Yüksək risk daşıyan müştərilər
          </p>
        </div>
      </div>

      {/* Live Phone & Customer Verification Checker */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-lg relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm sm:text-base font-semibold text-white">
                Sürətli Müştəri və Nömrə Yoxlama Paneli
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              Yeni sifariş götürməzdən əvvəl nömrəni daxil edərək risk səviyyəsini yoxlayın
            </span>
          </div>

          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={checkerQuery}
              onChange={(e) => setCheckerQuery(e.target.value)}
              placeholder="Telefon nömrəsi və ya müştəri adı yazın (məs: 050 123 45 67)..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-12 pr-10 py-3 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all font-mono"
            />
            {checkerQuery && (
              <button
                onClick={() => setCheckerQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Verification Result Display */}
          <AnimatePresence>
            {checkerResult && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="mt-3"
              >
                {checkerResult.isBlacklisted || checkerResult.cancelledOrders.length > 0 ? (
                  <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center flex-shrink-0">
                          <Ban className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">
                              ⚠️ DİQQƏT: BU MÜŞTƏRİ QARA SİYAHIDADIR!
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500 text-white">
                              {checkerResult.cancelledOrders.length} Ləğv Edilmiş Sifariş
                            </span>
                          </div>
                          <p className="text-xs text-rose-300 mt-0.5">
                            Ad: <strong className="text-white">{checkerResult.customer?.name || checkerResult.cancelledOrders[0]?.customerName || "Naməlum"}</strong> | 
                            Nömrə: <strong className="text-white">{checkerResult.customer?.phone || checkerQuery}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {checkerResult.customer && (
                          <button
                            onClick={() => {
                              setSelectedCustomer(checkerResult.customer!);
                              setReasonInput(checkerResult.customer!.blacklistReason || PREDEFINED_REASONS[0]);
                              setIsEditReasonModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-800/80 hover:bg-rose-700 text-white text-xs font-medium transition-colors"
                          >
                            Səbəbi Dəyiş
                          </button>
                        )}
                        {checkerResult.customer && (
                          <button
                            onClick={() => {
                              setSelectedCustomer(checkerResult.customer!);
                              setIsUnblacklistModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
                          >
                            Qara Siyahıdan Çıxar
                          </button>
                        )}
                      </div>
                    </div>

                    {checkerResult.customer?.blacklistReason && (
                      <div className="bg-rose-900/40 p-2.5 rounded-lg text-xs border border-rose-800/50">
                        <strong className="text-rose-200">Qara siyahı səbəbi:</strong>{" "}
                        <span className="text-rose-100">{checkerResult.customer.blacklistReason}</span>
                      </div>
                    )}

                    <div className="text-xs space-y-1 text-rose-200">
                      <p>
                        <strong>Tarixçə:</strong> Cəmi {checkerResult.totalOrders} sifarişdən{" "}
                        <span className="text-rose-400 font-bold">{checkerResult.cancelledOrders.length} ləğv</span>,{" "}
                        <span className="text-emerald-400 font-bold">{checkerResult.deliveredOrders.length} çatdırılmış</span>.
                        İtirilmiş məbləğ: <strong className="text-white">{formatCurrency(checkerResult.lostAmount)}</strong>.
                      </p>
                      {checkerResult.cancelledOrders.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          <span className="text-[11px] text-rose-300">Ləğv olunmuş sifarişlər:</span>
                          {checkerResult.cancelledOrders.map(s => (
                            <span key={s.id} className="px-2 py-0.5 rounded bg-black/40 text-[11px] font-mono text-rose-300 border border-rose-800">
                              {formatDisplayOrderNumber(s.orderNumber)} ({formatCurrency(s.totalAmount)})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-amber-950/60 border border-amber-700/60 p-2.5 rounded-lg text-xs text-amber-200 flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>
                        Tövsiyə: Bu müştəriyə yalnız 100% öncədən kartla ödəniş və ya beh alındıqdan sonra kuryer göndərilməsi tövsiyə olunur.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-white text-base">
                          ✅ MÜŞTƏRİ TƏMİZDİR
                        </div>
                        <p className="text-xs text-emerald-300">
                          Bu nömrə qara siyahıda qeyd olunmayıb və ləğv edilmiş sifarişi yoxdur.
                          {checkerResult.deliveredOrders.length > 0 && ` (Uğurlu çatdırılmış sifariş sayı: ${checkerResult.deliveredOrders.length})`}
                        </p>
                      </div>
                    </div>
                    {checkerResult.customer && (
                      <button
                        onClick={() => {
                          setSelectedCustomer(checkerResult.customer!);
                          setReasonInput(PREDEFINED_REASONS[0]);
                          setIsEditReasonModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-medium transition-colors"
                      >
                        Qara Siyahıya Sal
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Search, Filter & Sort Bar */}
      <div className="bg-white dark:bg-[#151922] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ad, telefon, səbəb və ya ünvan axtar..."
              className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-500 whitespace-nowrap">Sıralama:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm rounded-xl px-3 py-2 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="date_desc">Ən son əlavə edilənlər</option>
              <option value="cancels_desc">Ən çox ləğv edənlər</option>
              <option value="loss_desc">Ən yüksək itirilmiş məbləğ</option>
              <option value="name_asc">Əlifba sırası (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
              filterType === "all"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            Hamısı ({blacklistedCustomers.length})
          </button>
          <button
            onClick={() => setFilterType("multi_cancel")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
              filterType === "multi_cancel"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            Təkrar Ləğv Edənlər (≥2) ({repeatCancellersCount})
          </button>
          <button
            onClick={() => setFilterType("single_cancel")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
              filterType === "single_cancel"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            1 Dəfə Ləğv Edənlər
          </button>
          <button
            onClick={() => setFilterType("high_loss")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer ${
              filterType === "high_loss"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            Yüksək İtki (&gt;50 ₼)
          </button>
        </div>
      </div>

      {/* Main Blacklist Table */}
      <div className="bg-white dark:bg-[#151922] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {processedCustomers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
              <ShieldCheck className="w-7 h-7 text-emerald-500" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-white">
              {blacklistedCustomers.length === 0 
                ? "Qara siyahıda heç bir müştəri yoxdur" 
                : "Axtarışa uyğun qara siyahı qeydi tapılmadı"}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              {blacklistedCustomers.length === 0
                ? "Ləğv edilmiş sifarişləri aşkar etmək və qara siyahıya əlavə etmək üçün yuxarıdakı 'Bütün Ləğv Edənləri Əlavə Et' düyməsinə klikləyin."
                : "Axtarış sözünü dəyişin və ya filtri sıfırlayın."}
            </p>
            {blacklistedCustomers.length === 0 && (
              <button
                onClick={handleBatchSync}
                className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm transition-all"
              >
                Bütün Ləğv Edənləri Əlavə Et
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Müştəri Məlumatı</th>
                  <th className="py-3 px-4">Ləğv Sayı & Sifarişlər</th>
                  <th className="py-3 px-4">İtirilmiş Məbləğ</th>
                  <th className="py-3 px-4">Qara Siyahı Səbəbi</th>
                  <th className="py-3 px-4">Tarix</th>
                  <th className="py-3 px-4 text-right">Əməliyyatlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {processedCustomers.map((cust) => {
                  const p = cleanPhone(cust.phone);
                  const cSales = (p ? customerCancelledSalesMap.get(p) : null) || 
                                 (cust.id ? customerCancelledSalesMap.get(cust.id) : null) || [];
                  const lost = cSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
                  const cleanP = cleanPhone(cust.phone);
                  const waLink = cleanP ? `https://wa.me/994${cleanP.startsWith("994") ? cleanP.slice(3) : cleanP.startsWith("0") ? cleanP.slice(1) : cleanP}` : "";

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Customer info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-400 font-bold flex items-center justify-center text-sm border border-rose-200 dark:border-rose-800 flex-shrink-0">
                              {cust.name ? cust.name.slice(0, 2).toUpperCase() : "Q"}
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-rose-600 rounded-full flex items-center justify-center text-white text-[9px]" title="Qara Siyahı">
                              <Ban className="w-2.5 h-2.5" />
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{cust.name || "Naməlum Müştəri"}</span>
                              {cSales.length >= 2 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                  Təkrar Ləğv
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-mono">
                              <span>{cust.phone}</span>
                              {waLink && (
                                <a
                                  href={waLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-600 hover:text-emerald-700 p-0.5"
                                  title="WhatsApp-da yaz"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              )}
                              {cust.phone && (
                                <a
                                  href={`tel:${cust.phone}`}
                                  className="text-blue-600 hover:text-blue-700 p-0.5"
                                  title="Zəng et"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                            {cust.addresses && cust.addresses.length > 0 && (
                              <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                                📍 {cust.addresses[0]}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Cancelled orders & count */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full font-mono font-bold text-xs bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                              {cSales.length} dəfə ləğv
                            </span>
                          </div>
                          {cSales.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap max-w-xs">
                              {cSales.slice(0, 3).map(s => (
                                <span
                                  key={s.id}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                  title={`${formatDateAZ(s.createdAt)} - ${formatCurrency(s.totalAmount)}`}
                                >
                                  {formatDisplayOrderNumber(s.orderNumber)}
                                </span>
                              ))}
                              {cSales.length > 3 && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  +{cSales.length - 3} daha
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Lost potential revenue */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-rose-600 dark:text-rose-400">
                          {formatCurrency(lost)}
                        </div>
                        <span className="text-[10px] text-slate-400">İtirilmiş sifariş</span>
                      </td>

                      {/* Blacklist Reason */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 p-2 rounded-xl">
                          <p className="text-xs text-rose-900 dark:text-rose-200 line-clamp-2 leading-relaxed">
                            {cust.blacklistReason || "Ləğv edilmiş sifariş əsasında əlavə edildi"}
                          </p>
                        </div>
                      </td>

                      {/* Blacklist Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap font-mono">
                        {cust.blacklistedAt ? formatDateAZ(cust.blacklistedAt) : (cust.createdAt ? formatDateAZ(cust.createdAt) : "—")}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setReasonInput(cust.blacklistReason || PREDEFINED_REASONS[0]);
                              setIsEditReasonModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Səbəbi Dəyiş"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setIsUnblacklistModalOpen(true);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer border border-emerald-200 dark:border-emerald-800/60"
                            title="Qara siyahıdan çıxar (Ağ siyahıya sal)"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Çıxar</span>
                          </button>

                          <button
                            onClick={() => navigate(`/customers?q=${encodeURIComponent(cust.phone || cust.name)}`)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Müştəri profilinə get"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Add Customer to Blacklist */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1A1F2C] w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                    <UserX className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Qara Siyahıya Müştəri Əlavə Et
                  </h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mode Toggle: Existing vs New */}
              <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                <button
                  type="button"
                  onClick={() => setAddMode("existing")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    addMode === "existing"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Mövcud Müştərilərdən Seç
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("new")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    addMode === "new"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Yeni Müştəri Daxil Et
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-4">
                {addMode === "existing" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Müştəri Seçin
                    </label>
                    <select
                      value={selectedExistingCustId}
                      onChange={(e) => setSelectedExistingCustId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                      required
                    >
                      <option value="">-- Müştəri seçin --</option>
                      {customers
                        .filter(c => !c.isBlacklisted)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone})
                          </option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Müştəri Adı
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ad və Soyad"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Telefon Nömrəsi
                      </label>
                      <input
                        type="text"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="050 123 45 67"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Ünvan (İstəyə bağlı)
                      </label>
                      <input
                        type="text"
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                        placeholder="Məs: Bakı, Nərimanov r."
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </>
                )}

                {/* Reason Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Qara Siyahıya Salınma Səbəbi
                  </label>
                  <select
                    value={newReason}
                    onChange={(e) => setNewReason(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                  >
                    {PREDEFINED_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {newReason === "Digər narazılıq və ya qayda pozuntusu" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Xüsusi Səbəb Qeydi
                    </label>
                    <textarea
                      value={newCustomReason}
                      onChange={(e) => setNewCustomReason(e.target.value)}
                      placeholder="Müştərinin qara siyahıya salınma səbəbini ətraflı yazın..."
                      rows={3}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                      required
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Ləğv Et
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    Qara Siyahıya Əlavə Et
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Edit Blacklist Reason */}
      <AnimatePresence>
        {isEditReasonModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1A1F2C] w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Qara Siyahı Səbəbini Dəyiş
                </h3>
                <button
                  onClick={() => setIsEditReasonModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400">
                Müştəri: <strong className="text-slate-900 dark:text-white">{selectedCustomer.name}</strong> ({selectedCustomer.phone})
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Səbəb Seçin
                  </label>
                  <select
                    value={reasonInput}
                    onChange={(e) => setReasonInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                  >
                    {PREDEFINED_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Səbəb Mətni / Əlavə Qeydlər
                  </label>
                  <textarea
                    value={customReason || (reasonInput === "Digər narazılıq və ya qayda pozuntusu" ? "" : selectedCustomer.blacklistReason || "")}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Səbəb təfərrüatları..."
                    rows={3}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-800 dark:text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditReasonModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  Ləğv Et
                </button>
                <button
                  type="button"
                  onClick={handleSaveReason}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md transition-all"
                >
                  Yadda Saxla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 3: Unblacklist Confirmation */}
      <AnimatePresence>
        {isUnblacklistModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-[#1A1F2C] w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1.5">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Qara Siyahıdan Çıxarmaq İstəyirsiniz?
                </h3>
                <p className="text-xs text-slate-500">
                  <strong className="text-slate-800 dark:text-white">{selectedCustomer.name}</strong> ({selectedCustomer.phone}) adlı müştəri qara siyahıdan çıxarılacaq və etibarlı müştərilər sırasına qaytarılacaqdır.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUnblacklistModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  Xeyr, Saxla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnblacklist}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  Bəli, Qara Siyahıdan Çıxar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
