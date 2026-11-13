import React, { useState, useMemo } from "react";
import { useData } from "../context/DataContext";
import { getBakuDateRange, getBakuTodayYMD, formatToBakuYMD } from "../utils/orderFormatter";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Search, 
  Trash2, 
  X, 
  DollarSign, 
  HelpCircle, 
  Calendar, 
  Filter,
  ArrowDownCircle,
  Tag,
  Pencil,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Layers,
  Info,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  PieChart as PieIcon
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  Cell, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from "recharts";
import SafeResponsiveContainer from "./SafeResponsiveContainer";
import { Expense } from "../types";
import { formatCurrency, formatDateAZ } from "../utils/xlsEngine";

const AZ_MONTHS: Record<string, string> = {
  "01": "Yanvar",
  "02": "Fevral",
  "03": "Mart",
  "04": "Aprel",
  "05": "May",
  "06": "İyun",
  "07": "İyul",
  "08": "Avqust",
  "09": "Sentyabr",
  "10": "Oktyabr",
  "11": "Noyabr",
  "12": "Dekabr"
};

export default function ExpensesView() {
  const { expenses, sales, saveExpense, deleteExpense, settings } = useData();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [dateFilter, setDateFilter] = useState("Bu ay");
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Dedicated state for monthly category comparison
  const [compareCategory, setCompareCategory] = useState<string>("all");
  const [compareChartType, setCompareChartType] = useState<"bar" | "area">("bar");
  const [isComparisonOpen, setIsComparisonOpen] = useState(true);

  // Form parameters
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState("");
  const [formPrice, setFormPrice] = useState(0);
  const [formDesc, setFormDesc] = useState("");
  const [formDate, setFormDate] = useState(() => getBakuTodayYMD());

  // Sync compare category when main filter category changes (if not "all")
  const handleCategoryFilterChange = (cat: string) => {
    setSelectedCategory(cat);
    setCompareCategory(cat);
  };

  // Date interval calculation for filters
  const dateBounds = useMemo(() => {
    const range = getBakuDateRange(dateFilter);
    return { startStr: range.start, endStr: range.end };
  }, [dateFilter]);

  const filteredExpenses = useMemo(() => {
    return expenses.map(e => {
      if (e.source === "auto_delivery") {
        const matchingSale = sales.find(s => s.id === e.linkedOrderId || s.orderNumber === e.linkedOrderNumber);
        if (matchingSale && matchingSale.customerName) {
          const custName = matchingSale.customerName;
          if (!e.name.toLowerCase().includes(custName.toLowerCase())) {
            let updatedName = e.name;
            if (updatedName.includes(`#${matchingSale.orderNumber}`)) {
              updatedName = updatedName.replace(`#${matchingSale.orderNumber}`, `#${matchingSale.orderNumber} (${custName})`);
            } else if (e.linkedOrderNumber && updatedName.includes(`#${e.linkedOrderNumber}`)) {
              updatedName = updatedName.replace(`#${e.linkedOrderNumber}`, `#${e.linkedOrderNumber} (${custName})`);
            } else {
              updatedName = `${updatedName} (${custName})`;
            }
            return { ...e, name: updatedName };
          }
        }
      }
      return e;
    }).filter(e => {
      const expenseName = e.name || "";
      const matchSearch = expenseName.toLowerCase().includes(searchTerm.toLowerCase()) || (e.linkedOrderNumber && e.linkedOrderNumber.includes(searchTerm));
      const matchCat = selectedCategory === "all" ? true : e.category === selectedCategory;
      
      const expDateOnly = formatToBakuYMD(e.date);
      const matchDate = expDateOnly >= dateBounds.startStr && expDateOnly <= dateBounds.endStr;
      
      return matchSearch && matchCat && matchDate;
    });
  }, [expenses, sales, searchTerm, selectedCategory, dateBounds]);

  const aggregateTotalOutflow = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // ==========================================
  // MONTHLY CATEGORY COMPARISON ANALYTICS
  // ==========================================
  const monthlyCategoryComparison = useMemo(() => {
    // 1. Collect all valid YYYY-MM keys from all expenses
    const monthKeySet = new Set<string>();
    expenses.forEach(e => {
      if (e.date && e.date.length >= 7) {
        const ym = e.date.substring(0, 7);
        if (/^\d{4}-\d{2}$/.test(ym)) {
          monthKeySet.add(ym);
        }
      }
    });

    // Ensure current month is included
    const currentYM = new Date().toISOString().substring(0, 7);
    monthKeySet.add(currentYM);

    // Sort chronologically ascending (e.g. 2025-11, 2025-12, 2026-01 ...)
    const sortedMonthKeys = Array.from(monthKeySet).sort();

    // Calculate total company expenses per month
    const totalCompanyByMonth: Record<string, number> = {};
    expenses.forEach(e => {
      if (e.date && e.date.length >= 7) {
        const ym = e.date.substring(0, 7);
        totalCompanyByMonth[ym] = (totalCompanyByMonth[ym] || 0) + (Number(e.amount) || 0);
      }
    });

    // Filter expenses for the chosen comparison category
    const catExpenses = expenses.filter(e => {
      if (compareCategory === "all") return true;
      if (compareCategory === "auto_delivery") return e.source === "auto_delivery";
      return e.category === compareCategory;
    });

    // Group chosen category expenses by month
    const catAmountByMonth: Record<string, number> = {};
    const catCountByMonth: Record<string, number> = {};

    catExpenses.forEach(e => {
      if (e.date && e.date.length >= 7) {
        const ym = e.date.substring(0, 7);
        catAmountByMonth[ym] = (catAmountByMonth[ym] || 0) + (Number(e.amount) || 0);
        catCountByMonth[ym] = (catCountByMonth[ym] || 0) + 1;
      }
    });

    // Build chronological items with MoM (Month-over-Month) calculation
    const chronologicalList: Array<{
      monthKey: string;
      year: string;
      monthNum: string;
      monthName: string;
      shortLabel: string;
      amount: number;
      totalMonthExpense: number;
      sharePercent: number;
      recordCount: number;
      prevAmount: number;
      diffAmount: number;
      diffPercent: number;
      diffType: "increase" | "decrease" | "neutral" | "initial";
    }> = [];

    for (let i = 0; i < sortedMonthKeys.length; i++) {
      const ym = sortedMonthKeys[i];
      const [year, monthNum] = ym.split("-");
      const monthName = `${AZ_MONTHS[monthNum] || monthNum} ${year}`;
      const shortLabel = `${(AZ_MONTHS[monthNum] || monthNum).slice(0, 3)} ${year.slice(2)}`;
      
      const amount = catAmountByMonth[ym] || 0;
      const totalMonthExpense = totalCompanyByMonth[ym] || 0;
      const sharePercent = totalMonthExpense > 0 ? (amount / totalMonthExpense) * 100 : 0;
      const recordCount = catCountByMonth[ym] || 0;

      let prevAmount = 0;
      let diffAmount = 0;
      let diffPercent = 0;
      let diffType: "increase" | "decrease" | "neutral" | "initial" = "initial";

      if (i > 0) {
        prevAmount = catAmountByMonth[sortedMonthKeys[i - 1]] || 0;
        diffAmount = amount - prevAmount;
        
        if (prevAmount > 0) {
          diffPercent = ((amount - prevAmount) / prevAmount) * 100;
        } else if (amount > 0) {
          diffPercent = 100;
        } else {
          diffPercent = 0;
        }

        if (diffAmount > 0.001) {
          diffType = "increase";
        } else if (diffAmount < -0.001) {
          diffType = "decrease";
        } else {
          diffType = "neutral";
        }
      }

      chronologicalList.push({
        monthKey: ym,
        year,
        monthNum,
        monthName,
        shortLabel,
        amount,
        totalMonthExpense,
        sharePercent,
        recordCount,
        prevAmount,
        diffAmount,
        diffPercent,
        diffType
      });
    }

    // Summary statistics
    const totalSpent = catExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const activeMonths = chronologicalList.filter(m => m.amount > 0);
    const avgMonthly = activeMonths.length > 0 ? totalSpent / activeMonths.length : 0;

    let maxMonthItem = activeMonths[0] || null;
    let minMonthItem = activeMonths[0] || null;

    activeMonths.forEach(m => {
      if (!maxMonthItem || m.amount > maxMonthItem.amount) maxMonthItem = m;
      if (!minMonthItem || m.amount < minMonthItem.amount) minMonthItem = m;
    });

    // Latest month diff
    const latestMonth = chronologicalList[chronologicalList.length - 1];
    const prevMonth = chronologicalList.length >= 2 ? chronologicalList[chronologicalList.length - 2] : null;

    return {
      chronologicalList,
      // Reverse chronological list for table (latest month on top)
      tableList: [...chronologicalList].reverse(),
      totalSpent,
      avgMonthly,
      maxMonthItem,
      minMonthItem,
      latestMonth,
      prevMonth,
      totalRecordCount: catExpenses.length
    };
  }, [expenses, compareCategory]);

  const handleOpenForm = () => {
    setEditingExpense(null);
    setFormCategory(settings.expenseCategories[0] || "Ofis");
    setFormPrice(0);
    setFormDesc("");
    setFormDate(getBakuTodayYMD());
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formPrice <= 0 || !formDesc) {
      alert("Zəhmət olmasa düzgün qiymət və izahat daxil edin.");
      return;
    }

    const payload = {
      ...(editingExpense ? { id: editingExpense.id } : {}),
      name: formDesc,
      amount: Number(formPrice),
      category: formCategory,
      paymentMethod: "Nağd",
      date: formDate,
      notes: editingExpense?.notes || "",
      source: editingExpense ? editingExpense.source : ("manual" as const)
    };

    await saveExpense(payload);
    setIsFormOpen(false);
    setEditingExpense(null);
  };

  return (
    <div className="space-y-6">

      {/* Outflow Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <ArrowDownCircle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Baxılan xərc cəmi</h4>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{formatCurrency(aggregateTotalOutflow)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kuryer Avto Xərcləri</h4>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">
              {formatCurrency(filteredExpenses.filter(e => e.source === "auto_delivery").reduce((sum, e) => sum + e.amount, 0))}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Əl ilə daxil edilən digər</h4>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">
              {formatCurrency(filteredExpenses.filter(e => e.source === "manual").reduce((sum, e) => sum + e.amount, 0))}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Qeydlərin sayı (Siyahı)</h4>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{filteredExpenses.length} ədəd</p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KATEQORİYA ÜZRƏ AYLIQ MÜQAYİSƏ VƏ ARTIM/AZALMA DİNAMİKASI MODULU */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
        {/* Header with Title & Quick Controls */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-indigo-50/30">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-sm">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-800">
                    Kateqoriya Üzrə Aylıq Xərc Müqayisəsi & Dinamika
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                    Aylıq % və ₼ Müqayisə
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Seçilmiş kateqoriyanın aylar üzrə xərc məbləği, artım/azalma faizi (%) və manat fərqi (₼).
                </p>
              </div>
            </div>

            {/* Quick Actions & Category Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => setCompareChartType("bar")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    compareChartType === "bar" 
                      ? "bg-white text-slate-800 shadow-xs" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Sütun Qrafiki
                </button>
                <button
                  type="button"
                  onClick={() => setCompareChartType("area")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    compareChartType === "area" 
                      ? "bg-white text-slate-800 shadow-xs" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Dinamik Trend
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsComparisonOpen(!isComparisonOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                title={isComparisonOpen ? "Paneli yığcamlaşdır" : "Paneli genişləndir"}
              >
                {isComparisonOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>

          </div>

          {/* Interactive Category Selector Pills */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap shrink-0 flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Müqayisə Kateqoriyası:
            </span>

            <button
              type="button"
              onClick={() => setCompareCategory("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                compareCategory === "all"
                  ? "bg-slate-800 text-white shadow-xs scale-102"
                  : "bg-slate-100 hover:bg-slate-200/80 text-slate-600"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Bütün Xərclər (Cəmi)
            </button>

            <button
              type="button"
              onClick={() => setCompareCategory("auto_delivery")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                compareCategory === "auto_delivery"
                  ? "bg-indigo-600 text-white shadow-xs scale-102"
                  : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100"
              }`}
            >
              🚴 Avtomatik Çatdırılma (Kuryer)
            </button>

            {settings.expenseCategories.map(cat => {
              const isSelected = compareCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCompareCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-xs scale-102"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Expandable Comparison Content */}
        <AnimatePresence initial={false}>
          {isComparisonOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="p-5 sm:p-6 space-y-6"
            >
              
              {/* Top Analytical KPI Strip for Chosen Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. Category Total */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Kateqoriya Ümumi Cəmi
                    </span>
                    <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                      <Tag className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="text-xl font-extrabold text-slate-800 font-mono">
                      {formatCurrency(monthlyCategoryComparison.totalSpent)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Cəmi {monthlyCategoryComparison.totalRecordCount} ədəd xərc əməliyyatı
                    </p>
                  </div>
                </div>

                {/* 2. Monthly Average */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Aylıq Orta Xərc
                    </span>
                    <span className="p-1.5 rounded-lg bg-sky-50 text-sky-600">
                      <DollarSign className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="text-xl font-extrabold text-slate-800 font-mono">
                      {formatCurrency(monthlyCategoryComparison.avgMonthly)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Aktiv aylar üzrə orta aylıq büdcə
                    </p>
                  </div>
                </div>

                {/* 3. Peak Month */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Ən Yüksək Xərc Olan Ay
                    </span>
                    <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="text-xl font-extrabold text-slate-800 font-mono">
                      {monthlyCategoryComparison.maxMonthItem ? formatCurrency(monthlyCategoryComparison.maxMonthItem.amount) : "0.00 ₼"}
                    </p>
                    <p className="text-[11px] text-rose-600 font-medium mt-0.5 truncate">
                      {monthlyCategoryComparison.maxMonthItem ? monthlyCategoryComparison.maxMonthItem.monthName : "Qeyd yoxdur"}
                    </p>
                  </div>
                </div>

                {/* 4. Latest MoM Dynamics */}
                <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Son Ayın Dinamikası
                    </span>
                    {monthlyCategoryComparison.latestMonth?.diffType === "increase" ? (
                      <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700 flex items-center gap-0.5 text-[10px] font-bold">
                        <TrendingUp className="w-3 h-3" /> Artım
                      </span>
                    ) : monthlyCategoryComparison.latestMonth?.diffType === "decrease" ? (
                      <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 flex items-center gap-0.5 text-[10px] font-bold">
                        <TrendingDown className="w-3 h-3" /> Qənaət
                      </span>
                    ) : (
                      <span className="p-1.5 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold">
                        <Minus className="w-3 h-3" /> Sabit
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-2">
                      <p className={`text-xl font-extrabold font-mono ${
                        monthlyCategoryComparison.latestMonth?.diffType === "increase"
                          ? "text-rose-600"
                          : monthlyCategoryComparison.latestMonth?.diffType === "decrease"
                          ? "text-emerald-600"
                          : "text-slate-800"
                      }`}>
                        {monthlyCategoryComparison.latestMonth ? (
                          <>
                            {monthlyCategoryComparison.latestMonth.diffAmount > 0 ? "+" : ""}
                            {formatCurrency(monthlyCategoryComparison.latestMonth.diffAmount)}
                          </>
                        ) : "0.00 ₼"}
                      </p>
                      {monthlyCategoryComparison.latestMonth && monthlyCategoryComparison.latestMonth.diffType !== "initial" && (
                        <span className={`text-xs font-bold ${
                          monthlyCategoryComparison.latestMonth.diffPercent > 0 ? "text-rose-600" : "text-emerald-600"
                        }`}>
                          ({monthlyCategoryComparison.latestMonth.diffPercent > 0 ? "+" : ""}
                          {monthlyCategoryComparison.latestMonth.diffPercent.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {monthlyCategoryComparison.prevMonth 
                        ? `${monthlyCategoryComparison.prevMonth.monthName} ayına nəzərən` 
                        : "İlk qeydiyyat ayı"}
                    </p>
                  </div>
                </div>

              </div>

              {/* Visual Graph Section */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      Aylıq Xərc Qrafiki: <span className="text-indigo-600 normal-case">{compareCategory === "all" ? "Bütün Xərclər" : compareCategory}</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Hər bir ayın xərc məbləği (₼) və əvvəlki aya görə artım/azalma nisbəti
                    </p>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <SafeResponsiveContainer width="100%" height="100%">
                    {compareChartType === "bar" ? (
                      <BarChart 
                        data={monthlyCategoryComparison.chronologicalList}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis 
                          dataKey="shortLabel" 
                          tick={{ fontSize: 11, fill: "#64748b" }} 
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: "#64748b" }} 
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tickFormatter={(val) => `${val}₼`}
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[200px]">
                                  <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 flex justify-between">
                                    <span>{data.monthName}</span>
                                    <span className="text-slate-400">{data.recordCount} əməliyyat</span>
                                  </div>
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span>Kateqoriya Xərci:</span>
                                    <span className="font-bold font-mono text-emerald-400">{formatCurrency(data.amount)}</span>
                                  </div>
                                  {data.diffType !== "initial" ? (
                                    <>
                                      <div className="flex justify-between items-center text-slate-300">
                                        <span>Əvvəlki Aya Görə Fərq:</span>
                                        <span className={`font-bold font-mono ${data.diffAmount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                          {data.diffAmount > 0 ? "+" : ""}{formatCurrency(data.diffAmount)}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-slate-300">
                                        <span>Faiz Dəyişimi:</span>
                                        <span className={`font-bold ${data.diffPercent > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                          {data.diffPercent > 0 ? "+" : ""}{data.diffPercent.toFixed(1)}%
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-[10px] text-slate-400 italic">Baza başlanğıc ayı</div>
                                  )}
                                  {data.totalMonthExpense > 0 && (
                                    <div className="flex justify-between items-center text-slate-400 text-[10px] pt-1 border-t border-slate-800">
                                      <span>Ayın Ümumi Xərcindəki Payı:</span>
                                      <span className="font-semibold text-indigo-300">{data.sharePercent.toFixed(1)}%</span>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey="amount" 
                          name="Xərc Məbləği"
                          radius={[6, 6, 0, 0]}
                        >
                          {monthlyCategoryComparison.chronologicalList.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={
                                entry.diffType === "increase" 
                                  ? "#f43f5e" 
                                  : entry.diffType === "decrease" 
                                  ? "#10b981" 
                                  : "#6366f1"
                              } 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart 
                        data={monthlyCategoryComparison.chronologicalList}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis 
                          dataKey="shortLabel" 
                          tick={{ fontSize: 11, fill: "#64748b" }} 
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: "#64748b" }} 
                          tickLine={false}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tickFormatter={(val) => `${val}₼`}
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[200px]">
                                  <div className="font-bold text-slate-200 border-b border-slate-800 pb-1">
                                    {data.monthName}
                                  </div>
                                  <div className="flex justify-between items-center text-slate-300">
                                    <span>Xərc Məbləği:</span>
                                    <span className="font-bold font-mono text-indigo-300">{formatCurrency(data.amount)}</span>
                                  </div>
                                  {data.diffType !== "initial" && (
                                    <div className="flex justify-between items-center text-slate-300">
                                      <span>MoM Dəyişiklik:</span>
                                      <span className={`font-bold ${data.diffPercent > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                        {data.diffAmount > 0 ? "+" : ""}{formatCurrency(data.diffAmount)} ({data.diffPercent > 0 ? "+" : ""}{data.diffPercent.toFixed(1)}%)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="amount" 
                          stroke="#6366f1" 
                          strokeWidth={2.5}
                          fillOpacity={1} 
                          fill="url(#colorExpense)" 
                        />
                      </AreaChart>
                    )}
                  </SafeResponsiveContainer>
                </div>
              </div>

              {/* Detailed Monthly Comparison Table */}
              <div className="overflow-hidden border border-slate-100 rounded-2xl">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    Aylıq Müqayisə Cədvəli ({compareCategory === "all" ? "Bütün Kateqoriyalar" : compareCategory})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Cəmi {monthlyCategoryComparison.tableList.length} ay təhlil edilib
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[10px] font-bold tracking-wider uppercase">
                        <th className="py-3 px-4">Ay / Dövr</th>
                        <th className="py-3 px-4 text-right">Kateqoriya Xərci (₼)</th>
                        <th className="py-3 px-4 text-right">Manat Fərqi (₼)</th>
                        <th className="py-3 px-4 text-right">Faiz Dəyişimi (%)</th>
                        <th className="py-3 px-4 text-center">Dinamika Vəziyyəti</th>
                        <th className="py-3 px-4 text-center">Qeyd Sayı</th>
                        <th className="py-3 px-4 text-right">Ay Üzrə Payı (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-sans">
                      {monthlyCategoryComparison.tableList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                            Heç bir xərc qeydi tapılmadı.
                          </td>
                        </tr>
                      ) : (
                        monthlyCategoryComparison.tableList.map((row) => {
                          const isCurrentMonth = row.monthKey === new Date().toISOString().substring(0, 7);
                          return (
                            <tr 
                              key={row.monthKey} 
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isCurrentMonth ? "bg-indigo-50/20 font-medium" : ""
                              }`}
                            >
                              {/* 1. Month */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">{row.monthName}</span>
                                  {isCurrentMonth && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700">
                                      Cari Ay
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. Amount */}
                              <td className="py-3 px-4 text-right font-extrabold font-mono text-slate-800 whitespace-nowrap">
                                {formatCurrency(row.amount)}
                              </td>

                              {/* 3. Manat Difference */}
                              <td className="py-3 px-4 text-right whitespace-nowrap font-mono">
                                {row.diffType === "initial" ? (
                                  <span className="text-slate-400 text-[11px] italic">— (İlk qeyd)</span>
                                ) : row.diffAmount > 0 ? (
                                  <span className="text-rose-600 font-bold flex items-center justify-end gap-1">
                                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                    +{formatCurrency(row.diffAmount)}
                                  </span>
                                ) : row.diffAmount < 0 ? (
                                  <span className="text-emerald-600 font-bold flex items-center justify-end gap-1">
                                    <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                                    {formatCurrency(row.diffAmount)}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-medium">0.00 ₼</span>
                                )}
                              </td>

                              {/* 4. Percentage Difference */}
                              <td className="py-3 px-4 text-right whitespace-nowrap font-mono">
                                {row.diffType === "initial" ? (
                                  <span className="text-slate-400 text-[11px] italic">—</span>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-block ${
                                    row.diffPercent > 0 
                                      ? "bg-rose-50 text-rose-700 border border-rose-100" 
                                      : row.diffPercent < 0 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                      : "bg-slate-100 text-slate-600"
                                  }`}>
                                    {row.diffPercent > 0 ? "+" : ""}{row.diffPercent.toFixed(1)}%
                                  </span>
                                )}
                              </td>

                              {/* 5. Status / Trend */}
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                {row.diffType === "initial" ? (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500">
                                    🏁 Baza Ayı
                                  </span>
                                ) : row.diffType === "increase" ? (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 inline-flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" /> Artım (+Xərc)
                                  </span>
                                ) : row.diffType === "decrease" ? (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                                    <TrendingDown className="w-3 h-3" /> Qənaət (-Xərc)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 inline-flex items-center gap-1">
                                    <Minus className="w-3 h-3" /> Dəyişməz
                                  </span>
                                )}
                              </td>

                              {/* 6. Record Count */}
                              <td className="py-3 px-4 text-center font-medium text-slate-600 whitespace-nowrap">
                                {row.recordCount} qeyd
                              </td>

                              {/* 7. Share of Monthly Total */}
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                                    <div 
                                      className="bg-indigo-500 h-full rounded-full" 
                                      style={{ width: `${Math.min(100, Math.max(0, row.sharePercent))}%` }} 
                                    />
                                  </div>
                                  <span className="font-mono text-slate-700 font-semibold">
                                    {row.sharePercent.toFixed(1)}%
                                  </span>
                                </div>
                              </td>

                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ========================================================================= */}
      {/* SİYAHI VƏ FİLTRLƏMƏ BÖLMƏSİ (Control bar & Records Table) */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 bg-white rounded-2xl border border-slate-100 shadow-sm gap-4">
        
        <div className="flex flex-1 items-center gap-2 w-full max-w-sm bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200/50">
          <Search className="w-4.5 h-4.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Xərc izahatı və ya sifariş № axtar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-xs text-slate-700 w-full placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap bg-white items-center gap-2 w-full md:w-auto">
          {/* Date filter selector */}
          <select 
            value={dateFilter} 
            onChange={(e) => {
              setDateFilter(e.target.value);
            }}
            className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl text-slate-600 outline-none w-full md:w-auto font-medium cursor-pointer focus:border-slate-300"
          >
            <option value="Bu ay">📅 Bu Ay</option>
            <option value="Bu gün">📅 Bu Gün</option>
            <option value="Son 3 gün">📅 Son 3 Gün</option>
            <option value="Son 1 Həftə">📅 Son 1 Həftə</option>
            <option value="Keçən Ay">📅 Keçən Ay</option>
            <option value="Son 3ay">📅 Son 3 Ay</option>
            <option value="Son 6ay">📅 Son 6 Ay</option>
            <option value="Bu il">📅 Bu İl</option>
            <option value="Bütün dövrlər">📅 Bütün Dövrlər</option>
          </select>

          {/* Category filter */}
          <select 
            value={selectedCategory}
            onChange={(e) => handleCategoryFilterChange(e.target.value)}
            className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl text-slate-600 outline-none w-full md:w-auto font-medium cursor-pointer focus:border-slate-300"
          >
            <option value="all">Bütün Kateqoriyalar</option>
            <option value="auto_delivery">🚴 Avtomatik Çatdırılma (auto_delivery)</option>
            {settings.expenseCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <button 
            onClick={handleOpenForm}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1 shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Yeni Xərc
          </button>
        </div>

      </div>

      {/* Table grid */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[11px] font-bold tracking-wider uppercase">
              <th className="py-4 px-5">Tarix</th>
              <th className="py-4 px-4">Kateqoriya</th>
              <th className="py-4 px-4">Qaynaq (Mənbə)</th>
              <th className="py-4 px-5">İzahat</th>
              <th className="py-4 px-4 text-right">Məbləğ</th>
              <th className="py-4 px-5 text-right">Əməliyyatlar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 font-medium italic">
                  Tələb olunan meyara uyğun heç bir xərc qeydi tapılmadı.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((exp) => {
                const isAuto = exp.source === "auto_delivery";
                return (
                  <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-5 font-mono text-slate-500 whitespace-nowrap">{formatDateAZ(exp.date)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isAuto ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"
                      }`}>
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-slate-400 font-semibold uppercase">
                      {isAuto ? "Avtomatik" : "Sistem kənarı (Manual)"}
                    </td>
                    <td className="py-3 px-5 text-slate-600 max-w-xs truncate" title={exp.name}>
                      {exp.name}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold font-mono text-slate-800 whitespace-nowrap">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <div className="flex justify-end items-center gap-1.5">
                        <button 
                          onClick={() => {
                            setEditingExpense(exp);
                            setFormCategory(exp.category);
                            setFormPrice(exp.amount);
                            setFormDesc(exp.name);
                            setFormDate(exp.date);
                            setIsFormOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition-colors"
                          title="Redaktə et"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={async () => {
                            const conf = window.confirm("Bu xərc elementini silmək istəyirsiniz?");
                            if (conf) {
                              await deleteExpense(exp.id);
                            }
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Create Manual outflow modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsFormOpen(false); setEditingExpense(null); }}
              className="absolute inset-0 bg-black"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full relative z-10 space-y-4"
            >
              <div className="flex justify-between items-center border-b pb-3 border-slate-100">
                <h4 className="font-bold text-slate-800 text-sm">
                  {editingExpense ? "Biznes Xərci Redaktə Et" : "Biznes Xərci Əlavə Et"}
                </h4>
                <button 
                  onClick={() => { setIsFormOpen(false); setEditingExpense(null); }} 
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Tarix</label>
                  <input 
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Kateqoriya</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                    >
                      {settings.expenseCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      {editingExpense && !settings.expenseCategories.includes(editingExpense.category) && (
                        <option value={editingExpense.category}>{editingExpense.category}</option>
                      )}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Məbləğ (₼) *</label>
                    <input 
                      type="number"
                      required
                      min={0.01}
                      step="any"
                      placeholder="Məs: 15"
                      value={formPrice}
                      onChange={(e) => setFormPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Xərcə Aid İzah *</label>
                  <textarea 
                    placeholder="Məs: Ofis üçün işıq pulu, Çay/Şəkər"
                    required
                    rows={2.5}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                  />
                </div>

                <div className="pt-4 flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => { setIsFormOpen(false); setEditingExpense(null); }}
                    className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                  >
                    Ləğv Et
                  </button>
                  <button 
                    type="submit" 
                    className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl"
                  >
                    Yadda Saxla
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

