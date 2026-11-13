import React, { useState, useMemo, useRef, useEffect } from "react";
import { useData } from "../context/DataContext";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  UserCheck, 
  Clock, 
  DollarSign, 
  Award, 
  UserPlus, 
  Search, 
  Phone, 
  MessageCircle, 
  Merge, 
  Edit3, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Layers,
  Plus, 
  X, 
  Tag, 
  Calendar, 
  ShoppingBag, 
  ShoppingCart,
  PlusCircle, 
  FileSpreadsheet, 
  Printer, 
  Maximize2, 
  TrendingUp, 
  BarChart2, 
  Compass, 
  CheckCircle, 
  MapPin, 
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  Ban
} from "lucide-react";
import { Customer, Sale, Product } from "../types";
import { formatCurrency, formatDateAZ } from "../utils/xlsEngine";
import { formatPhoneNumber } from "../utils/phoneFormatter";
import { formatDisplayOrderNumber } from "../utils/orderFormatter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from "recharts";
import SafeResponsiveContainer from "./SafeResponsiveContainer";

const AZERBAIJAN_PLACES = [
  "Bakı", "Sumqayıt", "Gəncə", "Xırdalan", "Mingəçevir", "Naxçıvan", "Şirvan", "Lənkəran", "Şəki", "Yevlax",
  "Xaçmaz", "Quba", "Qusar", "Şabran", "Siyəzən", "Xızı", "Qobustan", "Şamaxı", "İsmayıllı", "Göyçay", 
  "Ağsu", "Kürdəmir", "Ucar", "Zərdab", "Goranboy", "Samux", "Göygöl", "Daşkəsən", "Gədəbəy", "Şəmkir", 
  "Tovuz", "Ağstafa", "Qazax", "Bərdə", "Tərtər", "Ağcabədi", "Ağdam", "Füzuli", "Beyləqan", "Xocalı", 
  "Şuşa", "Laçın", "Kəlbəcər", "Zəngilan", "Qubadlı", "Cəbrayıl", "İmişli", "Saatlı", "Sabirabad", "Salyan", 
  "Hacıqabul", "Neftçala", "Biləsuvar", "Cəlilabad", "Masallı", "Yardımlı", "Lerik", "Astara", "Qax", 
  "Zaqatala", "Balakən", "Oğuz", "Qəbələ", "Ağdaş"
];

export default function CustomersView() {
  const { 
    customers, 
    sales, 
    products, 
    couriers, 
    saveCustomer, 
    deleteCustomer, 
    createSale, 
    updateSale, 
    toggleCustomerBlacklist,
    settings 
  } = useData();

  const location = useLocation();

  // Active Screen / UI states
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (q) {
      setSearchQuery(decodeURIComponent(q));
    }
  }, [location.search]);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "passive" | "vip" | "new" | "top" | "blacklisted">("all");
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>("all");
  
  // Searchable City Dropdown filter states
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [citySearchTerm, setCitySearchTerm] = useState("");
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside listener for City Dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target as Node)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const [spendGroupFilter, setSpendGroupFilter] = useState<"all" | "vip" | "regular" | "new">("all");
  const [isGroupedBySpend, setIsGroupedBySpend] = useState(false);
  const [isVipExpanded, setIsVipExpanded] = useState(true);
  const [isRegularExpanded, setIsRegularExpanded] = useState(true);
  const [isLowExpanded, setIsLowExpanded] = useState(true);
  
  // Modals / Drawers states
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isFastOrderModalOpen, setIsFastOrderModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Pagination for Left panel to support massive customer bases (10,000+ records)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Tabs for Right Profile detail
  const [detailTab, setDetailTab] = useState<"profile" | "orders">("profile");

  // Tag Management local draft input
  const [draftTag, setDraftTag] = useState("");

  // Customer Form state
  const [custForm, setCustForm] = useState({
    name: "",
    phone: "",
    altPhone: "",
    city: "Bakı",
    region: "",
    addresses: [""],
    notes: "",
    isVIP: false,
    tags: [] as string[]
  });

  // Merge Form state
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  // Fast Order Form state
  const [fastOrderForm, setFastOrderForm] = useState({
    productId: "",
    qty: 1,
    unitPrice: 0,
    deliveryType: "courier" as "courier" | "cargo" | "expargo" | "Azərpoçt",
    courierId: "",
    cargoCompany: "",
    deliveryCost: 0,
    notes: ""
  });

  // -------------------------------------------------------------
  // CRM STATS CALCULATORS & CLASSIFICATIONS
  // -------------------------------------------------------------
  
  // Memoized complete list of customer metrics combining historical sales data
  const customerEnhancedList = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const cleanPhone = (p: string) => (p ? p.replace(/\D/g, "") : "");

    // Pre-index sales by customer ID and last 9 phone digits for O(1) lookup
    const salesByCustomerId = new Map<string, Sale[]>();
    const salesByPhoneKey = new Map<string, Sale[]>();

    for (let i = 0; i < sales.length; i++) {
      const s = sales[i];
      if (s.customerId) {
        const arr = salesByCustomerId.get(s.customerId);
        if (arr) arr.push(s);
        else salesByCustomerId.set(s.customerId, [s]);
      }
      const sPhoneClean = cleanPhone(s.customerPhone || "");
      if (sPhoneClean) {
        const key = sPhoneClean.length >= 9 ? sPhoneClean.slice(-9) : sPhoneClean;
        const arr = salesByPhoneKey.get(key);
        if (arr) arr.push(s);
        else salesByPhoneKey.set(key, [s]);
      }
    }

    return customers.map(c => {
      // Find order lines in O(1) time
      const cPhoneClean = cleanPhone(c.phone);
      const phoneKey = cPhoneClean.length >= 9 ? cPhoneClean.slice(-9) : cPhoneClean;
      const custSales = (c.id && salesByCustomerId.get(c.id)) || (phoneKey && salesByPhoneKey.get(phoneKey)) || [];
      const deliveredSales = custSales.filter(s => s.status === "çatdırılıb");
      
      const orderCount = deliveredSales.length;
      const totalSpent = deliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

      // Sorting to extract chronological checkpoints
      const sortedSales = [...deliveredSales].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const firstOrderDate = sortedSales.length > 0 ? sortedSales[0].createdAt : undefined;
      const lastOrderDate = sortedSales.length > 0 ? sortedSales[sortedSales.length - 1].createdAt : undefined;

      // Status Indicator Classifications:
      // Gold/VIP: spent >= 1000 AZN or explicit VIP
      // Green/Active: Ordered in the last 60 days
      // Yellow/Normal: Ordered, but older than 60 days 
      // Red/Passive: No deliveries in the last 90 days, or 0 total deliveries
      let durationSinceLastOrderDays = 999;
      if (lastOrderDate) {
        const diffMs = now.getTime() - new Date(lastOrderDate).getTime();
        durationSinceLastOrderDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }

      let crmStatus: "active" | "normal" | "passive" | "vip" = "normal";
      if (c.isVIP) {
        crmStatus = "vip";
      } else if (orderCount === 0 || durationSinceLastOrderDays > 90) {
        crmStatus = "passive";
      } else if (durationSinceLastOrderDays <= 60) {
        crmStatus = "active";
      }

      // Ranking Tier
      let ratingTier: "Bronze" | "Silver" | "Gold" | "VIP" = "Bronze";
      if (c.isVIP || orderCount >= settings.vipThreshold) ratingTier = "VIP";
      else if (totalSpent >= 500) ratingTier = "Gold";
      else if (totalSpent >= 200) ratingTier = "Silver";

      // Created checking
      const createdDate = new Date(c.createdAt);
      const isNewThisMonth = createdDate >= startOfMonth;

      return {
        ...c,
        orderCount,
        totalSpent,
        firstOrderDate,
        lastOrderDate,
        crmStatus,
        ratingTier,
        isNewThisMonth,
        durationSinceLastOrderDays,
        salesHistory: custSales // includes non-delivered for full audit
      };
    });
  }, [customers, sales]);

  // High Level Summary statistics
  const coreStats = useMemo(() => {
    let totalSpentSum = 0;
    let vipCount = 0;
    let activeCount = 0;
    let passiveCount = 0;
    let newMonthCount = 0;
    let returningCount = 0;

    customerEnhancedList.forEach(c => {
      totalSpentSum += c.totalSpent;
      if (c.crmStatus === "vip") vipCount++;
      else if (c.crmStatus === "active") activeCount++;
      else if (c.crmStatus === "passive") passiveCount++;
      
      if (c.isNewThisMonth) newMonthCount++;
      if (c.orderCount > 1) returningCount++;
    });

    const totalCust = customerEnhancedList.length;
    const returningPct = totalCust > 0 ? ((returningCount / totalCust) * 100).toFixed(1) : "0.0";

    return {
      totalCustomers: totalCust,
      activeCustomers: activeCount + vipCount, // VIPs are active too!
      passiveCustomers: passiveCount,
      newCustomersThisMonth: newMonthCount,
      totalSalesRevenue: totalSpentSum,
      vipCustomersCount: vipCount,
      returningCustomersCount: returningCount,
      returningPercentage: returningPct
    };
  }, [customerEnhancedList]);

  // Sort-filter mapping lists of cities
  const uniqueCitiesList = useMemo(() => {
    const placesSet = new Set<string>(AZERBAIJAN_PLACES);
    customers.forEach(c => {
      if (c.city && c.city.trim()) placesSet.add(c.city.trim());
      if (c.region && c.region.trim()) placesSet.add(c.region.trim());
    });
    return Array.from(placesSet).sort((a, b) => a.localeCompare(b, "az"));
  }, [customers]);

  // Filtered cities list for the searchable dropdown
  const filteredCitiesDropdown = useMemo(() => {
    const term = citySearchTerm.toLowerCase().trim();
    if (!term) return uniqueCitiesList;
    return uniqueCitiesList.filter(c => c.toLowerCase().includes(term));
  }, [uniqueCitiesList, citySearchTerm]);

  // -------------------------------------------------------------
  // ADVANCED SEARCH, FILTER AND SORTING LOGIC
  // -------------------------------------------------------------
  const filteredAndSortedList = useMemo(() => {
    setCurrentPage(1); // Reset page on query / filter shift
    let list = [...customerEnhancedList];

    const isSearching = searchQuery.trim() !== "";

    // 1. Text Search matching multi-column indexes (Global across all system)
    if (isSearching) {
      const q = searchQuery.toLowerCase().trim();
      const cleanPhoneQuery = q.replace(/\D/g, "");
      list = list.filter(c => {
        const matchName = c.name.toLowerCase().includes(q);
        const matchPhone = c.phone.includes(q) || (cleanPhoneQuery && c.phone.includes(cleanPhoneQuery));
        const matchAlt = c.altPhone ? c.altPhone.includes(q) : false;
        const matchNotes = c.notes?.toLowerCase().includes(q);
        const matchAddress = c.addresses.some(a => a.toLowerCase().includes(q));
        const matchTags = c.tags?.some(t => t.toLowerCase().includes(q));
        const matchRegion = c.region?.toLowerCase().includes(q);
        const matchCity = c.city?.toLowerCase().includes(q);

        return matchName || matchPhone || matchAlt || matchNotes || matchAddress || matchTags || matchRegion || matchCity;
      });
    }

    // 2a. City Filter (matches either city, region, or address string)
    if (selectedCityFilter !== "all") {
      list = list.filter(c => {
        const target = selectedCityFilter.trim().toLowerCase();
        const customerCity = c.city?.trim().toLowerCase() || "";
        const customerRegion = c.region?.trim().toLowerCase() || "";
        const customerAddress = c.addresses?.join(" ").toLowerCase() || "";

        return customerCity === target || 
               customerRegion === target || 
               customerCity.includes(target) || 
               customerRegion.includes(target) || 
               customerAddress.includes(target);
      });
    }

    // 2b. Tab Filter Category
    if (activeFilter === "active") {
      list = list.filter(c => c.crmStatus === "active" || c.crmStatus === "vip");
    } else if (activeFilter === "passive") {
      list = list.filter(c => c.crmStatus === "passive");
    } else if (activeFilter === "vip") {
      list = list.filter(c => c.crmStatus === "vip");
    } else if (activeFilter === "new") {
      list = list.filter(c => c.isNewThisMonth);
    } else if (activeFilter === "top") {
      // Sort solely by Spent
      list.sort((a, b) => b.totalSpent - a.totalSpent);
    } else if (activeFilter === "blacklisted") {
      list = list.filter(c => c.isBlacklisted === true);
    }

    // 2c. Spend Group Filter
    if (spendGroupFilter === "vip") {
      list = list.filter(c => c.totalSpent >= 1000 || c.isVIP);
    } else if (spendGroupFilter === "regular") {
      list = list.filter(c => c.totalSpent >= 200 && c.totalSpent < 1000 && !c.isVIP);
    } else if (spendGroupFilter === "new") {
      list = list.filter(c => c.totalSpent < 200 && !c.isVIP);
    }

    return list;
  }, [customerEnhancedList, searchQuery, activeFilter, selectedCityFilter, spendGroupFilter]);

  // Paginated Segment of Customers
  const paginatedList = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedList.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredAndSortedList, currentPage]);

  // Grouped customer portfolio by total spend volume
  const groupedBySpend = useMemo(() => {
    const vip: typeof customerEnhancedList = [];
    const regular: typeof customerEnhancedList = [];
    const low: typeof customerEnhancedList = [];

    filteredAndSortedList.forEach(c => {
      if (c.totalSpent >= 1000 || c.isVIP) {
        // VIP Group (1,000+ AZN or manually marked VIP)
        vip.push(c);
      } else if (c.totalSpent >= 200) {
        // Regular Group (200 - 1,000 AZN)
        regular.push(c);
      } else {
        // New / Low spender (< 200 AZN)
        low.push(c);
      }
    });

    return { vip, regular, low };
  }, [filteredAndSortedList]);

  const totalPages = Math.ceil(filteredAndSortedList.length / itemsPerPage) || 1;

  // Selected Active Customer Details lookup
  const selectedCustomer = useMemo(() => {
    // If no ID is selected, auto-select the first from filtered list
    const candidateId = selectedCustomerId || (filteredAndSortedList[0]?.id);
    return customerEnhancedList.find(c => c.id === candidateId);
  }, [customerEnhancedList, selectedCustomerId, filteredAndSortedList]);

  // Top 10 Customers Widget
  const top10Customers = useMemo(() => {
    return [...customerEnhancedList]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);
  }, [customerEnhancedList]);

  // Shared customer list item renderer
  const renderCustomerRow = (c: typeof customerEnhancedList[number]) => {
    const isSelected = selectedCustomer?.id === c.id;
    
    // Status Colors classification 
    let statusDotColor = "bg-slate-300";
    if (c.crmStatus === "vip") statusDotColor = "bg-amber-400 ring-2 ring-amber-100";
    else if (c.crmStatus === "active") statusDotColor = "bg-emerald-500 ring-2 ring-emerald-100";
    else if (c.crmStatus === "normal") statusDotColor = "bg-blue-400";
    else if (c.crmStatus === "passive") statusDotColor = "bg-rose-500 ring-2 ring-rose-100";

    return (
      <div
        key={c.id}
        onClick={() => {
          setSelectedCustomerId(c.id);
          setDetailTab("profile");
        }}
        className={`p-3 border rounded-xl cursor-pointer transition-all select-none relative group ${
          isSelected 
            ? "border-slate-800 bg-slate-50/50 shadow-sm" 
            : "border-slate-100 hover:border-slate-300 hover:bg-slate-50/30"
        }`}
      >
        {/* Selection indicator strip */}
        {isSelected && (
          <div className="absolute left-0 top-3 bottom-3 w-1 bg-slate-800 rounded-r-lg" />
        )}

        <div className="flex justify-between items-start gap-1 pb-1">
          <div>
            <h4 className="font-bold text-slate-800 text-xs break-all truncate w-[160px]">{c.name}</h4>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{c.phone}</p>
          </div>

          <div className="flex flex-col items-end gap-1">
            {c.isBlacklisted ? (
              <span className="text-[8px] px-1.5 py-0.5 bg-rose-100 text-rose-700 font-extrabold rounded flex items-center gap-0.5 border border-rose-200">
                <Ban className="w-2.5 h-2.5" /> QARA SİYAHI
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${statusDotColor}`} />
                <span className="text-[8px] font-extrabold uppercase tracking-wide text-slate-500 font-sans">
                  {c.crmStatus.toUpperCase()}
                </span>
              </div>
            )}
            {c.city && (
              <span className="text-[8px] px-1 py-0.5 bg-slate-100 text-slate-600 rounded">
                📍 {c.city}
              </span>
            )}
          </div>
        </div>

        {/* Small stats segment */}
        <div className="mt-2.5 pt-2 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-500 font-mono">
          <div>
            <span>Sifariş: </span>
            <span className="text-slate-800 font-bold">{c.orderCount} ədəd</span>
          </div>
          <div>
            <span>Cəmi Alış: </span>
            <span className="text-slate-800 font-extrabold text-xs">{formatCurrency(c.totalSpent)}</span>
          </div>
        </div>

        {/* Hover action guide indicator */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all">
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>

      </div>
    );
  };

  // -------------------------------------------------------------
  // CRM ANALYTICS COMPILER FOR THE SELECTED CUSTOMER
  // -------------------------------------------------------------
  const customerAnalyticsData = useMemo(() => {
    if (!selectedCustomer) return { monthlySpent: [], topProducts: [], activity6Months: [] };

    const deliveredSales = selectedCustomer.salesHistory.filter(s => s.status === "çatdırılıb");

    // 1. Compile chronological monthly orders for Recharts (Last 12 months)
    const spentByMonth: Record<string, number> = {};
    const monthsAZ = ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"];

    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const label = `${monthsAZ[d.getMonth()]} ${String(d.getFullYear()).substring(2)}`;
      spentByMonth[label] = 0;
    }

    deliveredSales.forEach(s => {
      const saleDate = new Date(s.createdAt);
      const label = `${monthsAZ[saleDate.getMonth()]} ${String(saleDate.getFullYear()).substring(2)}`;
      if (spentByMonth[label] !== undefined) {
        spentByMonth[label] += s.totalAmount;
      }
    });

    const monthlySpentChart = Object.entries(spentByMonth).map(([month, spent]) => ({
      Ay: month,
      "Alış ($)": spent
    }));

    // 2. Count top purchased items
    const productFrequency: Record<string, number> = {};
    deliveredSales.forEach(s => {
      s.items.forEach(item => {
        productFrequency[item.productName] = (productFrequency[item.productName] || 0) + item.qty;
      });
    });

    const topProductsChart = Object.entries(productFrequency)
      .map(([name, count]) => ({
        Məhsul: name.length > 15 ? name.substring(0, 15) + "..." : name,
        Sayı: count
      }))
      .sort((a, b) => b.Sayı - a.Sayı)
      .slice(0, 5);

    // 3. Compile last 6 months' order counts for activity BarChart
    const activityByMonth: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const label = `${monthsAZ[d.getMonth()]} ${String(d.getFullYear()).substring(2)}`;
      activityByMonth[label] = 0;
    }

    deliveredSales.forEach(s => {
      const saleDate = new Date(s.createdAt);
      const label = `${monthsAZ[saleDate.getMonth()]} ${String(saleDate.getFullYear()).substring(2)}`;
      if (activityByMonth[label] !== undefined) {
        activityByMonth[label] += 1;
      }
    });

    const activityChart = Object.entries(activityByMonth).map(([month, count]) => ({
      Ay: month,
      "Sifariş": count
    }));

    return {
      monthlySpent: monthlySpentChart,
      topProducts: topProductsChart,
      activity6Months: activityChart
    };
  }, [selectedCustomer]);

  // Dynamic values based on selected customer chronological history
  const selectedCrmStats = useMemo(() => {
    if (!selectedCustomer) return { days30: 0, days90: 0, averageCheck: 0 };

    const now = new Date();
    const cut30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cut90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    let days30 = 0;
    let days90 = 0;

    const delivered = selectedCustomer.salesHistory.filter(s => s.status === "çatdırılıb");
    
    delivered.forEach(s => {
      const saleDate = new Date(s.createdAt);
      if (saleDate >= cut30) days30 += s.totalAmount;
      if (saleDate >= cut90) days90 += s.totalAmount;
    });

    const averageCheck = delivered.length > 0 ? selectedCustomer.totalSpent / delivered.length : 0;

    return { days30, days90, averageCheck };
  }, [selectedCustomer]);

  // -------------------------------------------------------------
  // HANDLERS, TRIGGERS & CRM SIDE EFFECTS
  // -------------------------------------------------------------

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setCustForm({
      name: "",
      phone: "",
      altPhone: "",
      city: "Bakı",
      region: "",
      addresses: [""],
      notes: "",
      isVIP: false,
      tags: []
    });
    setIsCustomerModalOpen(true);
  };

  const handleOpenEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setCustForm({
      name: c.name,
      phone: c.phone,
      altPhone: c.altPhone || "",
      city: c.city || "Bakı",
      region: c.region || "",
      addresses: c.addresses.length > 0 ? [...c.addresses] : [""],
      notes: c.notes || "",
      isVIP: c.isVIP || false,
      tags: c.tags || []
    });
    setIsCustomerModalOpen(true);
  };

  const handleSaveCustomerForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custForm.name || !custForm.phone) {
      alert("Ad Soyad və Telefon nömrəsi nüsxəsi daxil edilməlidir!");
      return;
    }

    const cleanedAddresses = custForm.addresses.filter(a => a.trim() !== "");

    const payload: Customer = {
      id: editingCustomer ? editingCustomer.id : `customer_${Date.now()}`,
      name: custForm.name,
      phone: formatPhoneNumber(custForm.phone),
      altPhone: custForm.altPhone ? formatPhoneNumber(custForm.altPhone) : undefined,
      city: custForm.city,
      region: custForm.region,
      addresses: cleanedAddresses,
      notes: custForm.notes,
      createdAt: editingCustomer ? editingCustomer.createdAt : new Date().toISOString(),
      isVIP: custForm.isVIP,
      orderCount: editingCustomer ? (editingCustomer.orderCount || 0) : 0,
      totalSpent: editingCustomer ? (editingCustomer.totalSpent || 0) : 0,
      tags: custForm.tags
    };

    const savedId = await saveCustomer(payload);
    setSelectedCustomerId(savedId);
    setIsCustomerModalOpen(false);
  };

  const handleAddTag = () => {
    if (!draftTag.trim() || !selectedCustomer) return;
    const currentTags = selectedCustomer.tags || [];
    if (currentTags.includes(draftTag.trim())) {
      setDraftTag("");
      return;
    }

    const updatedCustomer: Customer = {
      ...selectedCustomer,
      tags: [...currentTags, draftTag.trim()]
    };

    saveCustomer(updatedCustomer);
    setDraftTag("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!selectedCustomer) return;
    const updatedCustomer: Customer = {
      ...selectedCustomer,
      tags: (selectedCustomer.tags || []).filter(t => t !== tagToRemove)
    };
    saveCustomer(updatedCustomer);
  };

  const handleDeleteTrigger = async (cust: Customer) => {
    const confirmation = window.confirm(`"${cust.name}" adlı müştəri profilini və bütün CRM tarixçəsini silmək istəyirsiniz? Şəbəkə daxili bağlı qeydlər ləğv ediləcək.`);
    if (confirmation) {
      await deleteCustomer(cust.id);
      setSelectedCustomerId("");
    }
  };

  // NATIVE MERGE SYSTEM DIRECTLY WRITES TO FIRESTORE
  const handleMergeAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSourceId || !mergeTargetId) {
      alert("Zəhmət olmasa birləşdiriləcək hər iki müştərini seçin!");
      return;
    }

    if (mergeSourceId === mergeTargetId) {
      alert("Eyni müştərini özü ilə birləşdirə bilməzsiniz!");
      return;
    }

    const source = customerEnhancedList.find(c => c.id === mergeSourceId);
    const target = customerEnhancedList.find(c => c.id === mergeTargetId);

    if (!source || !target) {
      alert("Xəta: Müştərilər tapılmadı!");
      return;
    }

    const confirmCheck = window.confirm(`UĞURLU BİRLƏŞDİRMƏ:\n"${source.name}" müştərisi silinəcək və bütün fəaliyyəti "${target.name}" profilinə köçürüləcək. Bu əməliyyat geri qaytarıla bilməz! Razısınız?`);
    if (!confirmCheck) return;

    try {
      // 1. Union unique values
      const mergedAddresses = Array.from(new Set([...target.addresses, ...source.addresses]));
      const mergedTags = Array.from(new Set([...(target.tags || []), ...(source.tags || [])]));
      const mergedNotes = `${target.notes || ""}\n[Müştəri Birləşdirilib]: ${source.name} (${source.phone}) qeydləri: ${source.notes || ""}`.trim();
      const altPhoneCombined = target.altPhone || source.phone;

      const updatedTarget: Customer = {
        ...target,
        addresses: mergedAddresses,
        tags: mergedTags,
        notes: mergedNotes,
        altPhone: altPhoneCombined !== target.phone ? altPhoneCombined : undefined,
        totalSpent: target.totalSpent + source.totalSpent,
        orderCount: target.orderCount + source.orderCount
      };

      // 2. Loop through and update all sales belonging to source customer
      const sourceSales = sales.filter(s => s.customerPhone === source.phone);
      
      for (const sale of sourceSales) {
        await updateSale(sale.id, {
          customerId: target.id,
          customerName: target.name,
          customerPhone: target.phone,
          address: target.addresses[0] || sale.address
        });
      }

      // 3. Save target and delete source from DB
      await saveCustomer(updatedTarget);
      await deleteCustomer(source.id);

      alert(`Birləşdirilmə tamamlandı! ${sourceSales.length} sifariş köçürüldü.`);
      setSelectedCustomerId(target.id);
      setIsMergeModalOpen(false);
    } catch (err: any) {
      alert("Birləşdirilmə zamanı xəta oldu: " + err.message);
    }
  };

  // NATIVE FAST ORDER CREATION DIALOG
  const handleFastOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    if (!fastOrderForm.productId) {
      alert("Məhsul seçmək vacibdir!");
      return;
    }

    const activeProd = products.find(p => p.id === fastOrderForm.productId);
    if (!activeProd) {
      alert("Məhsul sistemdə tapılmadı!");
      return;
    }

    const saleQty = Number(fastOrderForm.qty);
    const saleUnitPrice = Number(fastOrderForm.unitPrice) || activeProd.price;
    const finalTotalProductPrice = saleQty * saleUnitPrice;
    const finalTotalAmount = finalTotalProductPrice + Number(fastOrderForm.deliveryCost);

    // Build correct items sub-record
    const orderItemsRecord = [{
      productId: activeProd.id,
      productName: activeProd.name,
      qty: saleQty,
      unitPrice: saleUnitPrice,
      total: finalTotalProductPrice
    }];

    try {
      const payload = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        address: selectedCustomer.addresses[0] || "Bakı ş.",
        items: orderItemsRecord,
        deliveryType: fastOrderForm.deliveryType,
        deliveryCost: Number(fastOrderForm.deliveryCost),
        totalProductPrice: finalTotalProductPrice,
        totalAmount: finalTotalAmount,
        netRevenue: finalTotalProductPrice - Number(fastOrderForm.deliveryCost),
        paymentStatus: "Ödənilməyib",
        status: "gözləyir" as const,
        notes: `[CRM Sürətli Sifariş] ${fastOrderForm.notes}`.trim(),
        createdAt: new Date().toISOString(),
        source: "manual" as const,
        courierId: fastOrderForm.deliveryType === "courier" ? fastOrderForm.courierId : undefined,
        courierName: fastOrderForm.deliveryType === "courier" ? couriers.find(c => c.id === fastOrderForm.courierId)?.name : undefined,
        cargoCompany: fastOrderForm.deliveryType !== "courier" ? fastOrderForm.cargoCompany : undefined
      };

      await createSale(payload);
      alert("Sürətli sifariş uğurla yaradıldı!");
      setIsFastOrderModalOpen(false);
    } catch (err: any) {
      alert("Sifariş yaradıla bilmədi: " + err.message);
    }
  };

  // LOCAL XLSX PORTFOLIO EXPORT
  const handleExportXLS = async () => {
    const XLSX = await import("xlsx");
    const dataForExcel = filteredAndSortedList.map(c => ({
      ID: c.id,
      Ad_Soyad: c.name,
      Telefon: c.phone,
      Alternativ_Tel: c.altPhone || "—",
      Şəhər: c.city || "—",
      Rayon: c.region || "—",
      Cari_Status: c.crmStatus.toUpperCase(),
      Reytinq: c.ratingTier,
      Ümumi_Sifariş: c.orderCount,
      Cəmi_Alış_AZN: c.totalSpent,
      İlk_Sifariş: c.firstOrderDate ? formatDateAZ(c.firstOrderDate) : "—",
      Son_Sifariş: c.lastOrderDate ? formatDateAZ(c.lastOrderDate) : "—",
      Qeydlər: c.notes || ""
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Müştərilər");
    XLSX.writeFile(wb, `CRM_Müştəri_Portfeli_${new Date().toISOString().substring(0,10)}.xlsx`);
  };

  // LOCAL PDF DOSSIER PRINT TRIGGER
  const handlePrintDossier = () => {
    if (!selectedCustomer) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const itemsHTML = selectedCustomer.salesHistory.map(s => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px; font-family: monospace; font-size: 11px;">${formatDateAZ(s.createdAt)}</td>
        <td style="padding: 8px; font-size: 11px;">${s.items.map(i => `${i.productName} (x${i.qty})`).join(", ")}</td>
        <td style="padding: 8px; font-size: 11px; text-transform: capitalize;">${s.deliveryType === "courier" ? "Kuryer" : s.deliveryType}</td>
        <td style="padding: 8px; font-size: 11px; text-align: right; font-weight: bold;">${formatCurrency(s.totalAmount)}</td>
        <td style="padding: 8px; font-size: 11px; text-align: center;"><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${s.status}</span></td>
      </tr>
    `).join("");

    const tagsHTML = (selectedCustomer.tags || []).map(t => `<span style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-right: 5px;">${t}</span>`).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Müştəri Dosyesi - ${selectedCustomer.name}</title>
          <style>
            body { font-family: sans-serif; color: #1e293b; padding: 40px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #334155; padding-bottom: 15px; margin-bottom: 25px; }
            .section-title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; margin-top: 30px; margin-bottom: 15px; }
            .grid-2 { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; }
            .data-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
            .data-lbl { color: #64748b; font-weight: 500; }
            .data-val { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f8fafc; font-size: 11px; text-transform: uppercase; padding: 8px; border-bottom: 1px solid #cbd5e1; text-align: left; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div>
              <h1 style="margin: 0; font-size: 22px;">${selectedCustomer.name}</h1>
              <p style="margin: 5px 0 0 0; color: #64748b; font-size: 13px;">CRM Unikal ID: ${selectedCustomer.id} | Qeydiyyat: ${formatDateAZ(selectedCustomer.createdAt)}</p>
            </div>
            <div style="text-align: right;">
              <span style="background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px;">REYTING: ${selectedCustomer.ratingTier}</span>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            ${tagsHTML}
          </div>

          <div class="grid-2">
            <div>
              <div class="section-title">Əlaqə və Ünvan</div>
              <div class="data-row"><span class="data-lbl">Telefon nömrəsi:</span><span class="data-val">${selectedCustomer.phone}</span></div>
              <div class="data-row"><span class="data-lbl">Alternativ Tel:</span><span class="data-val">${selectedCustomer.altPhone || "—"}</span></div>
              <div class="data-row"><span class="data-lbl">Şəhər / Rayon:</span><span class="data-val">${selectedCustomer.city || "—"} / ${selectedCustomer.region || "—"}</span></div>
              <div class="data-row"><span class="data-lbl">Çatdırılma ünvanları:</span><span class="data-val">${selectedCustomer.addresses.join(" | ") || "Qeyd edilməyib"}</span></div>
              <div class="data-row" style="margin-top: 15px;"><span class="data-lbl">Müştəri Qeydləri:</span></div>
              <p style="background: #f8fafc; font-size: 11px; padding: 10px; border-radius: 6px; font-style: italic; border-left: 3px solid #64748b;">${selectedCustomer.notes || "Qeyd yoxdur"}</p>
            </div>

            <div>
              <div class="section-title">CRM Alış Göstəriciləri</div>
              <div class="data-row"><span class="data-lbl">Cəmi Çatdırılma:</span><span class="data-val">${selectedCustomer.orderCount} Sifariş</span></div>
              <div class="data-row"><span class="data-lbl">Toplam Ç dövriyyəsi:</span><span class="data-val">${formatCurrency(selectedCustomer.totalSpent)}</span></div>
              <div class="data-row"><span class="data-lbl">Orta Çek Həcmi:</span><span class="data-val">${formatCurrency(selectedCrmStats.averageCheck)}</span></div>
              <div class="data-row"><span class="data-lbl">İlk Sifariş Çatdırılma:</span><span class="data-val">${selectedCustomer.firstOrderDate ? formatDateAZ(selectedCustomer.firstOrderDate) : "—"}</span></div>
              <div class="data-row"><span class="data-lbl">Son Sifariş Çatdırılma:</span><span class="data-val">${selectedCustomer.lastOrderDate ? formatDateAZ(selectedCustomer.lastOrderDate) : "—"}</span></div>
              <div class="data-row"><span class="data-lbl">Son 30 Gün Alış:</span><span class="data-val" style="color: #16a34a;">${formatCurrency(selectedCrmStats.days30)}</span></div>
              <div class="data-row"><span class="data-lbl">Son 90 Gün Alış:</span><span class="data-val">${formatCurrency(selectedCrmStats.days90)}</span></div>
            </div>
          </div>

          <div class="section-title">Sifariş Tarixçəsi</div>
          <table>
            <thead>
              <tr>
                <th>Tarix</th>
                <th>Məhsullar</th>
                <th>Çatdırılma Növü</th>
                <th style="text-align: right;">Yekun Məbləğ</th>
                <th style="text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML || `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 15px;">Sifariş tarixçəsi tapılmadı.</td></tr>`}
            </tbody>
          </table>

          <div style="margin-top: 50px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 10px;">
            Həssas CRM Müdafiə Qeydi. Bu sənəd yalnız daxili şöbə istifadəsi üçün nəzərdə tutulmuşdur.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // -------------------------------------------------------------
  // VIEW RENDER
  // -------------------------------------------------------------

  return (
    <div className="space-y-6">

      {/* ─────────────────────────────────────────────────────────────
          1. TOP CRM METRICS STATS CARDS
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3.5">
        
        {/* Total Customers */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-xs group scale-100 hover:scale-[1.01] duration-200 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-5 h-5" />
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-bold">Cəmi</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Müştəri Portfeli</p>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{coreStats.totalCustomers} nəfər</p>
          </div>
        </div>

        {/* Active Customers */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-xs group scale-100 hover:scale-[1.01] duration-200 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-md font-bold">Aktiv</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Aktiv Portfel</p>
            <p className="text-xl font-extrabold text-emerald-700 font-mono mt-0.5">{coreStats.activeCustomers} nəfər</p>
          </div>
        </div>

        {/* Returning Customers (2+ purchases) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-xs group scale-100 hover:scale-[1.01] duration-200 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="p-2 bg-teal-50 text-teal-600 rounded-xl">
              <RotateCcw className="w-5 h-5" />
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded-md font-bold">{coreStats.returningPercentage}%</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-teal-600 font-sans">Geri Dönən (2+ Alış)</p>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{coreStats.returningCustomersCount} nəfər</p>
          </div>
        </div>

        {/* New This Month */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-xs group scale-100 hover:scale-[1.01] duration-200 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded-md font-bold">Yeni</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-sans">Bu Ay Qoşulanlar</p>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">+{coreStats.newCustomersThisMonth} nəfər</p>
          </div>
        </div>

        {/* Total Sales Volume */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-xs group scale-100 hover:scale-[1.01] duration-200 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="p-2 bg-violet-50 text-violet-600 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-750 rounded-md font-bold">Dövriyyə</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cəmi Çatdırılma</p>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5 truncate">{formatCurrency(coreStats.totalSalesRevenue)}</p>
          </div>
        </div>

        {/* VIP Count */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-xs group scale-100 hover:scale-[1.01] duration-200 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Award className="w-5 h-5" />
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md font-bold">⭐ VIP</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-amber-600">VIP Alıcılar</p>
            <p className="text-xl font-extrabold text-amber-600 font-mono mt-0.5">{coreStats.vipCustomersCount} nəfər</p>
          </div>
        </div>

        {/* Passive Count */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all shadow-xs group scale-100 hover:scale-[1.01] duration-200 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded-md font-bold">Diqqət</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-rose-600">Passiv Portfel</p>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{coreStats.passiveCustomers} nəfər</p>
          </div>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. FILTERS & CONTROLS PANEL
          ───────────────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-4">
        
        <div className="flex flex-col lg:flex-row gap-3.5 justify-between items-stretch lg:items-center">
          
          {/* Broad textual searcher */}
          <div className="flex flex-1 items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-100 focus-within:border-indigo-400 focus-within:bg-white transition-all">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input 
              type="text"
              placeholder="Ad, nömrə, şəhər, rayon, ünvan, etiket və ya daxili qeydlər üzrə ağıllı axtarış..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-slate-700 w-full placeholder-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="p-0.5 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 divide-x divide-slate-100 overflow-x-auto shrink-0">
            
            {/* City Dropdown filters */}
            <div className="relative flex items-center gap-1.5 pl-1.5 border-r border-slate-150/40" ref={cityDropdownRef} id="city-dropdown-filter">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => {
                  setIsCityDropdownOpen(prev => !prev);
                  setCitySearchTerm("");
                }}
                className="flex items-center gap-1 text-xs text-slate-600 font-semibold cursor-pointer py-1 pr-3 focus:outline-none hover:text-slate-850 transition-colors select-none text-left"
              >
                <span className="truncate max-w-[125px]">
                  {selectedCityFilter === "all" ? "Süzgəc: Bütün Şəhərlər" : `Şəhər: ${selectedCityFilter}`}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 mt-0.5 transition-transform shrink-0 ${isCityDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {isCityDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="absolute top-8 left-0 min-w-[210px] max-w-[250px] bg-white border border-[#D4DAE4] rounded-xl shadow-lg z-50 overflow-hidden py-1 flex flex-col mt-0.5"
                  >
                    {/* Inner Search Box */}
                    <div className="px-2 py-1.5 border-b border-slate-100 flex items-center gap-1.5 bg-slate-50">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Şəhər yazın..."
                        value={citySearchTerm}
                        onChange={(e) => setCitySearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none text-[11px] text-[#1A1F2E] w-full placeholder-slate-400 p-0 font-semibold"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      {citySearchTerm && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCitySearchTerm("");
                          }}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Scrollable List */}
                    <div className="max-h-[220px] overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCityFilter("all");
                          setIsCityDropdownOpen(false);
                          setCitySearchTerm("");
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-semibold transition-colors flex items-center justify-between ${
                          selectedCityFilter === "all"
                            ? "bg-indigo-50 text-[#1A1F2E]"
                            : "hover:bg-slate-50 text-slate-600"
                        }`}
                      >
                        Bütün Şəhərlər
                      </button>
                      
                      {filteredCitiesDropdown.map((city) => (
                        <button
                          key={city}
                          type="button"
                          onClick={() => {
                            setSelectedCityFilter(city);
                            setIsCityDropdownOpen(false);
                            setCitySearchTerm("");
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors flex items-center justify-between ${
                            selectedCityFilter === city
                              ? "bg-indigo-50 text-[#1A1F2E] font-bold"
                              : "hover:bg-slate-50 text-slate-600"
                          }`}
                        >
                          <span>{city}</span>
                        </button>
                      ))}

                      {filteredCitiesDropdown.length === 0 && (
                        <div className="px-3 py-2 text-[10px] text-slate-400 italic text-center">
                          Uyğun şəhər tapılmadı
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Spend Group filter dropdown */}
            <div className="flex items-center gap-1.5 pl-1.5 pr-2">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <select 
                value={spendGroupFilter}
                onChange={(e) => setSpendGroupFilter(e.target.value as any)}
                className="bg-transparent text-xs text-slate-600 outline-none pr-3 font-semibold cursor-pointer border-none py-1"
              >
                <option value="all">Həcm: Hamısı</option>
                <option value="vip">💎 VIP Sərfiyyat (1000+ ₼)</option>
                <option value="regular">📈 Regular (200 - 1000 ₼)</option>
                <option value="new">🌱 Yeni / Aşağı (&lt; 200 ₼)</option>
              </select>
            </div>

            {/* General Export Button */}
            <div className="flex gap-2 pl-2">
              <button 
                onClick={handleExportXLS}
                className="px-3 py-1.5 hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold select-none flex items-center gap-1 hover:text-slate-800 transition-all"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Excel Eksport</span>
              </button>

              <button 
                onClick={() => setIsMergeModalOpen(true)}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-250/20 rounded-lg text-xs font-semibold select-none flex items-center gap-1 transition-all"
              >
                <Merge className="w-3.5 h-3.5 text-slate-500" />
                <span>Dublikat Müştəri Birləşdir</span>
              </button>
            </div>

            {/* Fast Open Form */}
            <button 
              onClick={handleOpenAddModal}
              className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm hover:shadow active:scale-95 transition-all select-none pl-3"
            >
              <UserPlus className="w-4 h-4" />
              <span>Yeni Müştəri</span>
            </button>

          </div>

        </div>

        {/* Tab Filters row */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 overflow-x-auto pb-1 px-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: "all", label: "Hamısı" },
              { id: "active", label: "Aktiv" },
              { id: "passive", label: "Passiv" },
              { id: "vip", label: "VIP alıcı" },
              { id: "new", label: "Bu ay yeni" },
              { id: "top", label: "Ən çox alış edənlər" },
              { id: "blacklisted", label: "🚫 Qara Siyahı" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all border outline-none ${
                  activeFilter === tab.id 
                    ? "bg-slate-800 text-white border-slate-850" 
                    : "bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* New Interactive Group by Spend Toggle */}
          <button
            onClick={() => setIsGroupedBySpend(prev => !prev)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all border flex items-center gap-1.5 outline-none select-none ${
              isGroupedBySpend
                ? "bg-indigo-50 text-indigo-700 border-indigo-200/60 shadow-xs"
                : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            <Layers className={`w-3.5 h-3.5 ${isGroupedBySpend ? "text-indigo-600 animate-pulse" : "text-slate-400"}`} />
            <span>Sərfiyyata görə qruplaşdır</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold ${
              isGroupedBySpend ? "bg-indigo-200/50 text-indigo-800" : "bg-slate-150 text-slate-500"
            }`}>
              {isGroupedBySpend ? "AKTİV" : "DEAKTİV"}
            </span>
          </button>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. CRM SPLIT VIEW AND LAYOUT FOR LARGE SCREENS
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ======================= LEFT PANEL (LIST) ======================= */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-100 shadow-xs p-4 flex flex-col justify-between min-h-[600px]">
          
          <div className="space-y-3.5">
            <div className="flex justify-between items-center px-1 border-b border-slate-50 pb-2">
              <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                {isGroupedBySpend ? "Sərfiyyat Qrupları" : "Müştəri siyahısı"} ({filteredAndSortedList.length})
              </span>
              {!isGroupedBySpend && (
                <span className="text-[10px] font-semibold text-slate-500 font-mono">Limit: {itemsPerPage} sətir/səh.</span>
              )}
            </div>

            {filteredAndSortedList.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs italic">
                Axtarış filtrinə uyğun gələn müştəri tapılmadı.
              </div>
            ) : isGroupedBySpend ? (
              <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                
                {/* 1. VIP Group */}
                <div className="border border-amber-200/60 rounded-xl overflow-hidden bg-amber-500/[0.02]">
                  <button 
                    onClick={() => setIsVipExpanded(prev => !prev)}
                    className="w-full flex items-center justify-between p-3 bg-amber-500/10 text-amber-900 font-bold text-xs select-none border-b border-amber-200/60 outline-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>👑</span>
                      <span>VIP Portfolio ({groupedBySpend.vip.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] bg-amber-500/20 px-1.5 py-0.5 rounded text-amber-805 font-mono font-extrabold">
                        {formatCurrency(groupedBySpend.vip.reduce((acc, c) => acc + c.totalSpent, 0))}
                      </span>
                      {isVipExpanded ? <ChevronUp className="w-3.5 h-3.5 text-amber-700" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-700" />}
                    </div>
                  </button>
                  
                  {isVipExpanded && (
                    <div className="p-2 space-y-2 max-h-[250px] overflow-y-auto bg-white">
                      {groupedBySpend.vip.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">Bu qrupda müştəri yoxdur.</p>
                      ) : (
                        groupedBySpend.vip.map(c => renderCustomerRow(c))
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Regular Group */}
                <div className="border border-indigo-200/60 rounded-xl overflow-hidden bg-indigo-500/[0.02]">
                  <button 
                    onClick={() => setIsRegularExpanded(prev => !prev)}
                    className="w-full flex items-center justify-between p-3 bg-indigo-500/10 text-indigo-900 font-bold text-xs select-none border-b border-indigo-200/60 outline-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>📈</span>
                      <span>Regular Portfolio ({groupedBySpend.regular.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] bg-indigo-500/20 px-1.5 py-0.5 rounded text-indigo-805 font-mono font-extrabold">
                        {formatCurrency(groupedBySpend.regular.reduce((acc, c) => acc + c.totalSpent, 0))}
                      </span>
                      {isRegularExpanded ? <ChevronUp className="w-3.5 h-3.5 text-indigo-700" /> : <ChevronDown className="w-3.5 h-3.5 text-indigo-700" />}
                    </div>
                  </button>
                  
                  {isRegularExpanded && (
                    <div className="p-2 space-y-2 max-h-[250px] overflow-y-auto bg-white">
                      {groupedBySpend.regular.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">Bu qrupda müştəri yoxdur.</p>
                      ) : (
                        groupedBySpend.regular.map(c => renderCustomerRow(c))
                      )}
                    </div>
                  )}
                </div>

                {/* 3. New/Low Group */}
                <div className="border border-emerald-200/60 rounded-xl overflow-hidden bg-emerald-500/[0.02]">
                  <button 
                    onClick={() => setIsLowExpanded(prev => !prev)}
                    className="w-full flex items-center justify-between p-3 bg-emerald-500/10 text-emerald-950 font-bold text-xs select-none border-b border-emerald-200/60 outline-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>🌱</span>
                      <span>New Portfolio ({groupedBySpend.low.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-805 font-mono font-extrabold">
                        {formatCurrency(groupedBySpend.low.reduce((acc, c) => acc + c.totalSpent, 0))}
                      </span>
                      {isLowExpanded ? <ChevronUp className="w-3.5 h-3.5 text-emerald-700" /> : <ChevronDown className="w-3.5 h-3.5 text-emerald-700" />}
                    </div>
                  </button>
                  
                  {isLowExpanded && (
                    <div className="p-2 space-y-2 max-h-[250px] overflow-y-auto bg-white">
                      {groupedBySpend.low.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">Bu qrupda müştəri yoxdur.</p>
                      ) : (
                        groupedBySpend.low.map(c => renderCustomerRow(c))
                      )}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                {paginatedList.map((c) => renderCustomerRow(c))}
              </div>
            )}
          </div>

          {/* Simple left panel page controls */}
          {!isGroupedBySpend && totalPages > 1 && (
            <div className="flex justify-between items-center pt-4 border-t border-slate-50 mt-4 select-none">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1.5 px-3 bg-slate-100 disabled:opacity-40 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all"
              >
                Geri
              </button>
              <span className="text-[10px] font-semibold text-slate-500 font-mono">
                Səhifə {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 px-3 bg-slate-100 disabled:opacity-40 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all"
              >
                İrəli
              </button>
            </div>
          )}

        </div>

        {/* ======================= RIGHT PANEL (CRM DOSSIER) ======================= */}
        <div className="lg:col-span-8 space-y-6">
          
          {selectedCustomer ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6 space-y-6">
              
              {/* Profile Card Header Title */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center border-b border-slate-50 pb-5">
                
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-slate-800">{selectedCustomer.name}</h2>
                    
                    {/* CRM Rating Badges */}
                    {selectedCustomer.isBlacklisted && (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-extrabold uppercase tracking-widest rounded-lg border border-rose-200 flex items-center gap-1 shadow-xs">
                        <Ban className="w-3 h-3" /> Qara Siyahı
                      </span>
                    )}
                    {selectedCustomer.ratingTier === "VIP" && (
                      <span className="px-2 py-0.5 bg-yellow-50 text-amber-700 text-[9px] font-extrabold uppercase tracking-widest rounded-lg border border-yellow-200 shadow-xs">
                        ⭐ VIP Müştəri
                      </span>
                    )}
                    {selectedCustomer.ratingTier === "Gold" && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-extrabold uppercase tracking-widest rounded-lg border border-blue-200">
                        🏆 Gold Portfolio
                      </span>
                    )}
                    {selectedCustomer.ratingTier === "Silver" && (
                      <span className="px-2 py-0.5 bg-slate-50 text-slate-700 text-[9px] font-extrabold uppercase tracking-widest rounded-lg border border-slate-200">
                        Silver
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 font-mono">
                    CRM Müştəri Kodu: <span className="font-bold text-slate-500">{selectedCustomer.id}</span> | Qeydiyyat: {formatDateAZ(selectedCustomer.createdAt)}
                  </p>

                  {/* Badges and classifications */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedCustomer.crmStatus === "vip" && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">⭐ VIP Alıcı</span>}
                    {selectedCustomer.orderCount >= 10 && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md">🔥 Çox Aktiv</span>}
                    {selectedCrmStats.averageCheck >= 150 && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">💰 Böyük Alıcı</span>}
                    {selectedCustomer.orderCount >= 5 && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">📦 Daimi Müştəri</span>}
                    {selectedCustomer.crmStatus === "passive" && <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">⚠️ Passiv Müştəri</span>}
                  </div>
                </div>

                {/* Micro Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 self-stretch md:self-auto justify-end">
                  
                  {/* Call phone trigger */}
                  <a
                    href={`tel:${selectedCustomer.phone}`}
                    className="p-2.5 bg-slate-50 text-slate-600 hover:text-indigo-600 border border-slate-100 hover:bg-indigo-50 rounded-xl transition-all"
                    title="Telefonla Zəng et"
                  >
                    <Phone className="w-4.5 h-4.5" />
                  </a>

                  {/* Whatsapp link */}
                  <a
                    href={`https://wa.me/${selectedCustomer.phone.replace(/[\s\+]/g, "")}`}
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="p-2.5 bg-slate-50 text-slate-600 hover:text-emerald-600 border border-slate-100 hover:bg-emerald-50 rounded-xl transition-all"
                    title="WhatsApp ismarış göndər"
                  >
                    <MessageCircle className="w-4.5 h-4.5" />
                  </a>

                  {/* Print Dossier */}
                  <button
                    onClick={handlePrintDossier}
                    className="p-2.5 bg-slate-50 text-slate-600 hover:text-slate-800 border border-slate-100 hover:bg-slate-100 rounded-xl transition-all"
                    title="PDF/Çap Sənədi"
                  >
                    <Printer className="w-4.5 h-4.5" />
                  </button>

                  <button
                    onClick={() => setIsFastOrderModalOpen(true)}
                    className="px-3 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm hover:shadow"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Sürətli Sifariş</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(selectedCustomer)}
                    className="p-2 bg-slate-150 text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteTrigger(selectedCustomer)}
                    className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                </div>

              </div>

              {/* Blacklist Warning / Action Banner */}
              {selectedCustomer.isBlacklisted ? (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-900 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <div className="font-bold text-rose-900 flex items-center gap-1.5">
                        <span>⚠️ Bu müştəri Qara Siyahıdadır!</span>
                        {selectedCustomer.blacklistedAt && (
                          <span className="text-[10px] text-rose-600 font-normal font-mono">
                            ({formatDateAZ(selectedCustomer.blacklistedAt)})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-rose-700 mt-0.5">
                        <strong>Səbəb:</strong> {selectedCustomer.blacklistReason || "Ləğv edilmiş sifariş əsasında əlavə olunub"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCustomerBlacklist(selectedCustomer.id, false)}
                    className="px-3 py-1.5 bg-white hover:bg-rose-100 border border-rose-300 text-rose-700 rounded-lg text-xs font-semibold shrink-0 cursor-pointer transition-colors shadow-xs"
                  >
                    Qara Siyahıdan Çıxar
                  </button>
                </div>
              ) : (
                <div className="flex justify-end -mt-2">
                  <button
                    onClick={() => {
                      const reason = window.prompt("Qara siyahıya salınma səbəbini qeyd edin:", "Sifarişi ləğv etdi / qapıda imtina etdi");
                      if (reason) toggleCustomerBlacklist(selectedCustomer.id, true, reason);
                    }}
                    className="px-2.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" /> Qara Siyahıya Sal
                  </button>
                </div>
              )}

              {/* STATISTICAL ROW INDICATORS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50 font-mono">
                
                <div>
                  <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase block">İlk Çatdırılma</span>
                  <span className="text-slate-800 font-bold block mt-0.5 text-xs truncate">
                    {selectedCustomer.firstOrderDate ? formatDateAZ(selectedCustomer.firstOrderDate) : "—"}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase block">Son Sifariş Tarixi</span>
                  <span className="text-slate-800 font-bold block mt-0.5 text-xs truncate">
                    {selectedCustomer.lastOrderDate ? formatDateAZ(selectedCustomer.lastOrderDate) : "—"}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase block">Orta Çek Həcmi</span>
                  <span className="text-slate-800 font-extrabold block mt-0.5 text-xs">
                    {formatCurrency(selectedCrmStats.averageCheck)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase block">Keçən 30-90 Gün</span>
                  <span className="text-slate-800 font-bold block mt-0.5 text-[11px] truncate">
                    {formatCurrency(selectedCrmStats.days30)} / {formatCurrency(selectedCrmStats.days90)}
                  </span>
                </div>

              </div>

              {/* Tabs Profile vs Orders History */}
              <div className="flex border-b border-slate-100 gap-1 mt-4">
                <button
                  onClick={() => setDetailTab("profile")}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    detailTab === "profile" 
                      ? "border-slate-800 text-slate-800 font-black" 
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  }`}
                >
                  Profil & CRM Analitika
                </button>
                <button
                  onClick={() => setDetailTab("orders")}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    detailTab === "orders" 
                      ? "border-slate-800 text-slate-800 font-black" 
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  }`}
                >
                  Sifariş Siyahısı ({selectedCustomer.salesHistory.length})
                </button>
              </div>

              {/* ===================== TAB 1: PROFILE & ANALYTICS ===================== */}
              {detailTab === "profile" && (
                <div className="space-y-6">
                  
                  {/* Detailed Field Information Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs leading-relaxed">
                    
                    <div className="space-y-3">
                      <h3 className="font-bold text-slate-400 uppercase tracking-widest text-[9px] border-b border-slate-50 pb-1">Əsas Profil Məlumatları</h3>
                      
                      <div className="flex justify-between p-2.5 bg-slate-50/30 rounded-xl border border-slate-100/50">
                        <span className="text-slate-500 font-medium">Əlaqə Telefonu:</span>
                        <span className="font-bold text-slate-800 font-mono">{selectedCustomer.phone}</span>
                      </div>

                      {selectedCustomer.altPhone && (
                        <div className="flex justify-between p-2.5 bg-slate-50/30 rounded-xl border border-slate-100/50">
                          <span className="text-slate-500 font-medium">Alternativ Telefon:</span>
                          <span className="font-bold text-slate-800 font-mono">{selectedCustomer.altPhone}</span>
                        </div>
                      )}

                      <div className="flex justify-between p-2.5 bg-slate-50/30 rounded-xl border border-slate-100/50">
                        <span className="text-slate-500 font-medium">Şəhər / Region:</span>
                        <span className="font-bold text-slate-800">
                          {selectedCustomer.city || "Bakı"} {selectedCustomer.region ? `/ ${selectedCustomer.region}` : ""}
                        </span>
                      </div>

                      <div className="p-2.5 bg-slate-50/30 rounded-xl border border-slate-100/50 space-y-1">
                        <span className="text-slate-500 font-medium block">Əlaqəli Tam Ünvanlar:</span>
                        {selectedCustomer.addresses.length === 0 ? (
                          <span className="text-slate-400 italic block">Qeyd tapılmadı.</span>
                        ) : (
                          <ul className="space-y-1 pl-3.5 list-disc text-slate-700 font-medium">
                            {selectedCustomer.addresses.map((addr, idx) => (
                              <li key={idx}>{addr}</li>
                            ))}
                          </ul>
                        )}
                      </div>

                    </div>

                    <div className="space-y-3">
                      <h3 className="font-bold text-slate-400 uppercase tracking-widest text-[9px] border-b border-slate-50 pb-1">Daxili CRM Qeydləri və Etiketlər</h3>
                      
                      <div className="p-2.5 bg-amber-50/30 border border-amber-100/50 rounded-xl min-h-[90px] flex flex-col justify-between">
                        <p className="text-slate-700 font-mono text-[11px] leading-relaxed italic">
                          {selectedCustomer.notes || "Bu müştəri haqqında heç bir daxili fəaliyyət qeydi yazılmayıb."}
                        </p>
                      </div>

                      {/* Tag system management */}
                      <div className="space-y-2 pt-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Portfel Etiketləri</span>
                        
                        <div className="flex flex-wrap gap-1.5 min-h-[25px]">
                          {(selectedCustomer.tags || []).length === 0 ? (
                            <span className="text-[10px] text-slate-400 italic">Etiket yazılmayıb.</span>
                          ) : (
                            (selectedCustomer.tags || []).map(tag => (
                              <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-md">
                                <span>{tag}</span>
                                <button onClick={() => handleRemoveTag(tag)} className="text-indigo-400 hover:text-indigo-800">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))
                          )}
                        </div>

                        <div className="flex gap-1 max-w-[200px]">
                          <input 
                            type="text" 
                            placeholder="Yeni Etiket (Məs: VIP)"
                            value={draftTag}
                            onChange={(e) => setDraftTag(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                            className="bg-slate-50 border border-slate-150 text-[10px] px-2.5 py-1 rounded-lg outline-none w-full"
                          />
                          <button onClick={handleAddTag} className="p-1 px-2.5 bg-slate-800 text-white rounded-lg text-[10px] font-bold hover:bg-slate-700">
                            +
                          </button>
                        </div>

                      </div>

                    </div>

                  </div>

                  {/* Detailed Purchase Dates List & Activity Chart Split */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Detailed Purchase Dates List */}
                    <div className="lg:col-span-2 p-5 border border-slate-100 rounded-2xl bg-white shadow-3xs space-y-3.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-indigo-650" />
                          <h4 className="text-xs font-black text-slate-800">Müştərinin Alış Tarixləri Siyahısı (Ətraflı)</h4>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold font-mono">
                          Cəmi {selectedCustomer.salesHistory.length} qeyd
                        </span>
                      </div>

                      {selectedCustomer.salesHistory.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-6">Bu müştərinin heç bir alış tarixi qeydə alınmayıb.</p>
                      ) : (
                        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                          {[...selectedCustomer.salesHistory]
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .map((sale) => {
                              let statusColor = "bg-slate-50 text-slate-500 border border-slate-200/50";
                              if (sale.status === "gözləyir") statusColor = "bg-amber-50 text-amber-700 border border-amber-200";
                              else if (sale.status === "çatdırılıb") statusColor = "bg-emerald-50 text-emerald-700 border border-emerald-250/50";
                              else if (sale.status === "ləğv edilib") statusColor = "bg-rose-50 text-rose-700 border border-rose-250/50";

                              return (
                                <div key={sale.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50/40 hover:bg-slate-50/80 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-extrabold text-slate-800 font-mono">📅 {formatDateAZ(sale.createdAt)}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">| No: {formatDisplayOrderNumber(sale.orderNumber)}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${statusColor}`}>{sale.status}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-600 font-medium">
                                      {sale.items.map(item => `${item.productName} (${item.qty} ədəd x ${formatCurrency(item.unitPrice)})`).join(", ")}
                                    </div>
                                  </div>
                                  <div className="flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-150">
                                    <span className="text-[10px] text-slate-400 font-mono sm:hidden">Yekun Məbləğ:</span>
                                    <span className="text-xs font-black text-indigo-700 font-mono">{formatCurrency(sale.totalAmount)}</span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Small Activity Bar Chart (Last 6 Months) */}
                    <div className="lg:col-span-1 p-5 border border-slate-100 rounded-2xl bg-white shadow-3xs flex flex-col justify-between space-y-3.5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-black text-slate-800">Son 6 Ayın Aktivliyi</h4>
                        </div>
                      </div>

                      <div className="h-[230px] w-full text-[10px] relative min-h-0 min-w-0 flex-1">
                        {selectedCustomer.salesHistory.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-slate-400 italic">Aktivlik məlumatı yoxdur.</div>
                        ) : (
                          <SafeResponsiveContainer width="100%" height="100%">
                            <BarChart data={customerAnalyticsData.activity6Months} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                              <XAxis dataKey="Ay" tickLine={false} axisLine={false} stroke="#94A3B8" fontSize={9} />
                              <YAxis tickLine={false} axisLine={false} stroke="#94A3B8" fontSize={9} allowDecimals={false} />
                              <Tooltip 
                                contentStyle={{ background: "#1E293B", borderRadius: "10px", border: "none", color: "#F8FAFC", fontSize: "11px" }}
                                itemStyle={{ color: "#34D399" }}
                                cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
                              />
                              <Bar dataKey="Sifariş" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={30} />
                            </BarChart>
                          </SafeResponsiveContainer>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 text-center font-semibold pt-1">
                        Aylar üzrə tamamlanmış (çatdırılmış) sifariş sayı
                      </div>
                    </div>

                  </div>

                  {/* CHARTS GRAPHICS SEGMENT USING RECHARTS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    
                    {/* Month Spend Chart */}
                    <div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-3xs space-y-3">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <TrendingUp className="w-4 h-4 text-indigo-650" />
                        <h4 className="text-xs font-bold text-slate-850">Aylıq Alış Tarixçəsi (Son 12 ay)</h4>
                      </div>
                      <div className="h-[200px] w-full text-[10px] relative min-h-0 min-w-0">
                        {customerAnalyticsData.monthlySpent.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-slate-400 italic">Analiz məlumatı yoxdur.</div>
                        ) : (
                          <SafeResponsiveContainer width="100%" height="100%">
                            <AreaChart data={customerAnalyticsData.monthlySpent} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorSpentPremium" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.01}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                              <XAxis dataKey="Ay" stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} dy={4} />
                              <YAxis stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: "#fff", 
                                  border: "1px solid #E9EFF6", 
                                  borderRadius: "12px",
                                  boxShadow: "0 8px 20px rgba(26, 31, 46, 0.08)",
                                  fontSize: "11px"
                                }}
                              />
                              <Area type="monotone" dataKey="Alış ($)" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorSpentPremium)" dot={{ r: 2 }} />
                            </AreaChart>
                          </SafeResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* Top Purchased Products */}
                    <div className="p-4 border border-slate-100 rounded-2xl bg-white shadow-3xs space-y-3">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <BarChart2 className="w-4 h-4 text-emerald-650" />
                        <h4 className="text-xs font-bold text-slate-850">Daimi Məhsullar (Top 5)</h4>
                      </div>
                      <div className="h-[200px] w-full text-[10px] relative min-h-0 min-w-0">
                        {customerAnalyticsData.topProducts.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-slate-400 italic">Sifariş qeydləri mövcud deyil.</div>
                        ) : (
                          <SafeResponsiveContainer width="100%" height="100%">
                            <BarChart data={customerAnalyticsData.topProducts} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
                              <XAxis dataKey="Məhsul" stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} dy={4} />
                              <YAxis stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: "#fff", 
                                  border: "1px solid #E9EFF6", 
                                  borderRadius: "12px",
                                  boxShadow: "0 8px 20px rgba(26, 31, 46, 0.08)",
                                  fontSize: "11px"
                                }}
                              />
                              <Bar dataKey="Sayı" fill="#10b981" radius={[6, 6, 0, 0]} barSize={18} />
                            </BarChart>
                          </SafeResponsiveContainer>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* ===================== TAB 2: ORDER HISTORY LIST ===================== */}
              {detailTab === "orders" && (
                <div className="space-y-4">
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-extrabold uppercase text-[9px] tracking-wider bg-slate-50/50">
                          <th className="p-3">Sifariş № / Tarix</th>
                          <th className="p-3">Məhsullar</th>
                          <th className="p-3">Çatdırılpa Tipi</th>
                          <th className="p-3">Kuryer / Daşıyıcı</th>
                          <th className="p-3 text-right">Məbləğ</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCustomer.salesHistory.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center p-8 text-slate-400 italic">
                              Heç bir sifariş tapılmadı.
                            </td>
                          </tr>
                        ) : (
                          selectedCustomer.salesHistory.map((order) => {
                            
                            // Delivery status color translation
                            let statusBadgeClass = "bg-slate-50 text-slate-500";
                            if (order.status === "gözləyir") statusBadgeClass = "bg-amber-50 text-amber-700 border border-amber-200/50";
                            else if (order.status === "çatdırılıb") statusBadgeClass = "bg-emerald-50 text-emerald-700 border border-emerald-250/50";
                            else if (order.status === "ləğv edilib") statusBadgeClass = "bg-rose-50 text-rose-700 border border-rose-250/50";

                            return (
                              <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-all font-mono">
                                <td className="p-3">
                                  <span className="font-extrabold text-slate-800">{formatDisplayOrderNumber(order.orderNumber)}</span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5">{formatDateAZ(order.createdAt)}</span>
                                </td>
                                <td className="p-3 max-w-[200px] truncate" title={order.items.map(i => `${i.productName} (x${i.qty})`).join(", ")}>
                                  <div className="font-sans font-medium text-slate-700 truncate">
                                    {order.items.map(i => `${i.productName} (x${i.qty})`).join(", ")}
                                  </div>
                                </td>
                                <td className="p-3 capitalize font-sans text-slate-600 font-medium text-[10px]">
                                  {order.deliveryType}
                                </td>
                                <td className="p-3 font-sans text-slate-600 text-[10px] font-medium">
                                  {order.deliveryType === "courier" ? (order.courierName || "—") : (order.cargoCompany || "—")}
                                </td>
                                <td className="p-3 text-right font-bold text-slate-800 text-[11px]">
                                  {formatCurrency(order.totalAmount)}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase ${statusBadgeClass}`}>
                                    {order.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-12 text-center text-slate-400 italic">
              Zəhmət olmasa daxili portfeldən bir müştəri seçin.
            </div>
          )}

          {/* ======================= SIDEBAR WIDGET: TOP 10 PURCHASERS ======================= */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-50 pb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                🏆 Top 10 Alıcı Müştərilər
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase">Məbləğə Görə</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {top10Customers.slice(0, 5).map((topC, idx) => (
                <div 
                  key={topC.id} 
                  onClick={() => setSelectedCustomerId(topC.id)}
                  className="flex items-center justify-between p-2.5 border border-slate-50 rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4 font-mono">{idx + 1}.</span>
                    <div>
                      <h4 className="font-bold text-slate-850 text-[11px] truncate w-[130px]">{topC.name}</h4>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">{topC.orderCount} sifariş</p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-slate-700 font-mono">{formatCurrency(topC.totalSpent)}</span>
                </div>
              ))}

              {top10Customers.slice(5, 10).map((topC, idx) => (
                <div 
                  key={topC.id} 
                  onClick={() => setSelectedCustomerId(topC.id)}
                  className="flex items-center justify-between p-2.5 border border-slate-50 rounded-xl hover:bg-slate-50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4 font-mono">{idx + 6}.</span>
                    <div>
                      <h4 className="font-bold text-slate-850 text-[11px] truncate w-[130px]">{topC.name}</h4>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">{topC.orderCount} sifariş</p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-slate-700 font-mono">{formatCurrency(topC.totalSpent)}</span>
                </div>
              ))}
            </div>

          </div>

        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. ADD / EDIT CUSTOMER MODAL
          ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCustomerModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCustomerModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-xl w-full relative z-10 space-y-4 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-800 text-sm">
                  {editingCustomer ? "Müştəri Qeydini Redaktə Et" : "Yeni CRM Müştəri Profil Kartı Yaradın"}
                </h3>
                <button onClick={() => setIsCustomerModalOpen(false)} className="text-slate-400 hover:text-slate-600 outline-none">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomerForm} className="space-y-4 text-xs">
                
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Müştəri Ad Soyad *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Məs: Kənan Novruzov"
                      value={custForm.name}
                      onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Əlaqə Telefonu *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Məs: +994 50 123 45 67"
                      value={custForm.phone}
                      onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Alternativ Telefon (Varsa)</label>
                    <input 
                      type="text" 
                      placeholder="Məs: +994 55 987 65 43"
                      value={custForm.altPhone}
                      onChange={(e) => setCustForm({ ...custForm, altPhone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Şəhər / Ölkə</label>
                    <input 
                      type="text" 
                      placeholder="Məs: Bakı, Sumqayıt"
                      value={custForm.city}
                      onChange={(e) => setCustForm({ ...custForm, city: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Rayon / Qəsəbə</label>
                    <input 
                      type="text" 
                      placeholder="Məs: Yasamal r., Nərimanov"
                      value={custForm.region}
                      onChange={(e) => setCustForm({ ...custForm, region: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none"
                    />
                  </div>
                </div>

                {/* Sub-addresses dynamic fields */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
                    <span>Əlaqədar Ünvanlar</span>
                    <button 
                      type="button"
                      onClick={() => setCustForm({ ...custForm, addresses: [...custForm.addresses, ""] })}
                      className="text-indigo-650 hover:text-indigo-850"
                    >
                      + Əlavə Et
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-[120px] overflow-y-auto">
                    {custForm.addresses.map((addr, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input 
                          type="text"
                          placeholder={`Ünvan qeydi ${idx+1}`}
                          value={addr}
                          onChange={(e) => {
                            const updated = [...custForm.addresses];
                            updated[idx] = e.target.value;
                            setCustForm({ ...custForm, addresses: updated });
                          }}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg outline-none"
                        />
                        {custForm.addresses.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => {
                              setCustForm({ ...custForm, addresses: custForm.addresses.filter((_, i) => i !== idx) });
                            }}
                            className="p-2 border rounded-lg bg-rose-50 text-rose-600"
                          >
                            Sil
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Daxil Qeydlər</label>
                  <textarea 
                    placeholder="Daxili təşkilat qeydləri yazın"
                    rows={2.5}
                    value={custForm.notes}
                    onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-mono"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-700 block text-xs">Məcburi VIP Təyinatı</span>
                    <span className="text-[9px] text-slate-400 mt-0.5 font-sans">Avtomatik alış həcmini gözləmədən bu istifadəçini dərhal VIP səviyyəsinə qaldırır.</span>
                  </div>
                  <input 
                    type="checkbox"
                    checked={custForm.isVIP}
                    onChange={(e) => setCustForm({ ...custForm, isVIP: e.target.checked })}
                    className="w-4 h-4 text-slate-800 rounded outline-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsCustomerModalOpen(false)}
                    className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                  >
                    Ləğv Et
                  </button>
                  <button 
                    type="submit" 
                    className="w-1/2 py-2.5 bg-slate-850 hover:bg-slate-750 text-white rounded-xl font-black transition-all shadow"
                  >
                    Yadda Saxla
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          5. DUPLICATE CUSTOMER MERGER MODAL
          ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isMergeModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMergeModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full relative z-10 space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-805 text-sm flex items-center gap-1">
                  <Merge className="w-4 h-4 text-slate-600" />
                  <span>Müştəri Məlumat Birləşdiricisi</span>
                </h3>
                <button onClick={() => setIsMergeModalOpen(false)} className="text-slate-400 hover:text-slate-600 outline-none">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                Bu CRM aləti iki müştəri qeydini (Məs. dublikat yaradılanda) birləşdirir. Birinci seçilən müştəri silinəcək və onun bütün sifariş tarixçəsi, ünvan və etiketləri ikinci seçilən müştəri profilinə köçürüləcəkdir.
              </p>

              <form onSubmit={handleMergeAction} className="space-y-4 text-xs">
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">1. Köçürüləcək Müştəri (Silinəcək) *</label>
                  <select 
                    required
                    value={mergeSourceId}
                    onChange={(e) => setMergeSourceId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none"
                  >
                    <option value="">Seçin (Mənbə)</option>
                    {customerEnhancedList.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone}) - {formatCurrency(c.totalSpent)}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">2. Əsas Müştəri (Saxlanılacaq) *</label>
                  <select 
                    required
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none"
                  >
                    <option value="">Seçin (Birləşdiriləcək Target)</option>
                    {customerEnhancedList.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.phone}) - {formatCurrency(c.totalSpent)}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsMergeModalOpen(false)}
                    className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-705 rounded-xl font-bold transition-all"
                  >
                    Ləğv Et
                  </button>
                  <button 
                    type="submit" 
                    className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black transition-all shadow flex items-center justify-center gap-1.1"
                  >
                    <Merge className="w-3.5 h-3.5" />
                    <span>Merge Əməliyyatı</span>
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          6. SÜRƏTLİ SİFARİŞ CREATION MODAL
          ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isFastOrderModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFastOrderModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-lg w-full relative z-10 space-y-4 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                    <ShoppingCart className="w-4.5 h-4.5 text-indigo-650" />
                    <span>Sürətli Sifariş Yarat</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5">Alıcı: <span className="font-bold text-slate-600">{selectedCustomer.name}</span></p>
                </div>
                <button onClick={() => setIsFastOrderModalOpen(false)} className="text-slate-400 hover:text-slate-600 outline-none">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFastOrderSubmit} className="space-y-4 text-xs">
                
                {/* Select Product and pricing */}
                <div className="grid grid-cols-3 gap-3.5">
                  
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Məhsul Seçin *</label>
                    <select
                      required
                      value={fastOrderForm.productId}
                      onChange={(e) => {
                        const matched = products.find(p => p.id === e.target.value);
                        setFastOrderForm({ 
                          ...fastOrderForm, 
                          productId: e.target.value,
                          unitPrice: matched ? matched.price : 0
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none"
                    >
                      <option value="">Məhsul Seçin...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} - SKU: {p.SKU} [Anbar: {p.stock} p.]</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Miqdar *</label>
                    <input 
                      type="number"
                      required
                      min={1}
                      value={fastOrderForm.qty}
                      onChange={(e) => setFastOrderForm({ ...fastOrderForm, qty: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-mono"
                    />
                  </div>

                </div>

                <div className="grid grid-cols-3 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Vahid Qiymət (AZN)</label>
                    <input 
                      type="number"
                      value={fastOrderForm.unitPrice}
                      onChange={(e) => setFastOrderForm({ ...fastOrderForm, unitPrice: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Yol / Çatdırılma Haqqı</label>
                    <input 
                      type="number"
                      value={fastOrderForm.deliveryCost}
                      onChange={(e) => setFastOrderForm({ ...fastOrderForm, deliveryCost: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase font-sans">Yekun Sifariş Qiyməti</label>
                    <div className="w-full bg-indigo-50 border border-indigo-100 text-indigo-950 font-black px-3 py-2.5 rounded-xl font-mono text-center text-sm">
                      {formatCurrency((fastOrderForm.qty * fastOrderForm.unitPrice) + fastOrderForm.deliveryCost)}
                    </div>
                  </div>
                </div>

                {/* Delivery details and Courier mappings */}
                <div className="grid grid-cols-2 gap-3.5 border-t border-slate-50 pt-2.5">
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Çatdırılma Metodu</label>
                    <select
                      value={fastOrderForm.deliveryType}
                      onChange={(e) => setFastOrderForm({ 
                        ...fastOrderForm, 
                        deliveryType: e.target.value as any,
                        courierId: "",
                        cargoCompany: ""
                      })}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-sans"
                    >
                      <option value="courier">🏃 Kuryer vasitəsilə</option>
                      <option value="cargo">📦 Kargo şöbəsi</option>
                      <option value="expargo">✈️ Expargo beynəlxalq</option>
                      <option value="Azərpoçt">✉️ Azərpoçt filialı</option>
                    </select>
                  </div>

                  <div className="space-y-1 justify-center">
                    {fastOrderForm.deliveryType === "courier" && (
                      <>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Daşıyıcı Kuryer</label>
                        <select
                          value={fastOrderForm.courierId}
                          onChange={(e) => setFastOrderForm({ ...fastOrderForm, courierId: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-sans"
                        >
                          <option value="">Kuryer Seçin...</option>
                          {couriers.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                          ))}
                        </select>
                      </>
                    )}

                    {fastOrderForm.deliveryType !== "courier" && (
                      <>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Filial / Şirkət Adı</label>
                        <input
                          type="text"
                          placeholder="Məs: Rayon poçt şöbəsi, kargo qeydi"
                          value={fastOrderForm.cargoCompany}
                          onChange={(e) => setFastOrderForm({ ...fastOrderForm, cargoCompany: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl outline-none font-sans"
                        />
                      </>
                    )}
                  </div>

                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase font-sans">Daxili Sifariş Qeydləri</label>
                  <textarea 
                    placeholder="Sifarişə xüsusi paketləmə və ya kuryer qeydləri daxil edin"
                    rows={2.5}
                    value={fastOrderForm.notes}
                    onChange={(e) => setFastOrderForm({ ...fastOrderForm, notes: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsFastOrderModalOpen(false)}
                    className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all"
                  >
                    Ləğv Et
                  </button>
                  <button 
                    type="submit" 
                    className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black transition-all shadow"
                  >
                    Sifarişi Tamamla
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
