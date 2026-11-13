import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useData } from "../context/DataContext";
import { 
  Search, 
  X, 
  ShoppingCart, 
  Users, 
  Package, 
  ChevronRight, 
  CornerDownLeft,
  Calendar,
  Phone,
  Tag,
  Hash
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function GlobalSearchBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sales, customers, products } = useData();

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut listener (Ctrl+K or Cmd+K to focus search, Esc to dismiss)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (event.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close search drawer when route changes
  useEffect(() => {
    setIsOpen(false);
    setQuery("");
  }, [location.pathname]);

  // Compute matched items
  const results = useMemo(() => {
    if (!query.trim()) {
      return { sales: [], customers: [], products: [] };
    }

    const q = query.toLowerCase().trim();
    const cleanPhoneQuery = q.replace(/\D/g, "");

    // 1. Match Sales/Orders (Up to 5)
    const matchedSales = sales.filter(s => {
      const orderNum = (s.orderNumber || "").toLowerCase();
      const custName = (s.customerName || "").toLowerCase();
      const custPhone = (s.customerPhone || "").replace(/\D/g, "");
      const addr = (s.address || "").toLowerCase();
      const notes = (s.notes || "").toLowerCase();
      const itemsMatch = s.items?.some(i => (i.productName || "").toLowerCase().includes(q)) || false;

      return (
        orderNum.includes(q) ||
        custName.includes(q) ||
        (cleanPhoneQuery && custPhone.includes(cleanPhoneQuery)) ||
        addr.includes(q) ||
        notes.includes(q) ||
        itemsMatch
      );
    }).slice(0, 5);

    // 2. Match Customers (Up to 5)
    const matchedCustomers = customers.filter(c => {
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "").replace(/\D/g, "");
      const altPhone = (c.altPhone || "").replace(/\D/g, "");
      const city = (c.city || "").toLowerCase();
      const region = (c.region || "").toLowerCase();
      const notes = (c.notes || "").toLowerCase();

      return (
        name.includes(q) ||
        (cleanPhoneQuery && phone.includes(cleanPhoneQuery)) ||
        (cleanPhoneQuery && altPhone.includes(cleanPhoneQuery)) ||
        city.includes(q) ||
        region.includes(q) ||
        notes.includes(q)
      );
    }).slice(0, 5);

    // 3. Match Products (Up to 5)
    const matchedProducts = products.filter(p => {
      const name = (p.name || "").toLowerCase();
      const sku = (p.SKU || "").toLowerCase();
      const cat = (p.category || "").toLowerCase();
      const notes = (p.notes || "").toLowerCase();

      return (
        name.includes(q) ||
        sku.includes(q) ||
        cat.includes(q) ||
        notes.includes(q)
      );
    }).slice(0, 5);

    return {
      sales: matchedSales,
      customers: matchedCustomers,
      products: matchedProducts
    };
  }, [query, sales, customers, products]);

  const hasAnyResults = results.sales.length > 0 || results.customers.length > 0 || results.products.length > 0;

  const handleSelectResult = (type: "sale" | "customer" | "product", item: any) => {
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();

    if (type === "sale") {
      navigate(`/sales?q=${encodeURIComponent(item.orderNumber)}`);
    } else if (type === "customer") {
      navigate(`/customers?q=${encodeURIComponent(item.phone || item.name)}`);
    } else if (type === "product") {
      navigate(`/products?q=${encodeURIComponent(item.SKU || item.name)}`);
    }
  };

  const statusColors = {
    "gözləyir": "bg-amber-100 text-amber-700 border-amber-200",
    "çatdırılıb": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "ləğv edilib": "bg-rose-100 text-rose-700 border-rose-200"
  };

  return (
    <div id="global-search-container" className="relative w-full max-w-sm md:max-w-md z-30" ref={containerRef}>
      {/* Search Input field */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-slate-400 pointer-events-none">
          <Search className="w-4 h-4" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Sifariş, müştəri və ya məhsul axtar..."
          className="w-full bg-white/70 hover:bg-white focus:bg-white border border-[#D4DAE4] focus:border-[#1A1F2E] rounded-xl pl-10 pr-12 py-1.5 text-xs font-medium text-[#1A1F2E] placeholder:text-[#8B95A8] outline-none transition-all shadow-xs"
        />
        <div className="absolute right-3.5 flex items-center gap-1.5 pointer-events-none">
          {query ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setQuery("");
                inputRef.current?.focus();
              }}
              className="pointer-events-auto p-0.5 text-slate-400 hover:text-[#1A1F2E] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-slate-100/80 border border-slate-200 rounded-md font-sans text-[9px] font-semibold text-slate-400">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          )}
        </div>
      </div>

      {/* Dynamic Results Popover */}
      <AnimatePresence>
        {isOpen && query.trim() !== "" && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-11 left-0 w-full mt-1 bg-white border border-[#D4DAE4] rounded-2xl shadow-xl max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="overflow-y-auto divide-y divide-slate-100 max-h-[60vh] md:max-h-[500px]">
              
              {/* No results prompt */}
              {!hasAnyResults && (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                  <div className="p-2.5 bg-slate-50 rounded-full border border-slate-150">
                    <Search className="w-5 h-5 text-slate-400" />
                  </div>
                  <h5 className="font-bold text-xs text-slate-700">Heç bir nəticə tapılmadı</h5>
                  <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed">
                    Sifariş nömrəsi, SKU, telefon nömrəsi və ya adları daxil edərək yenidən yoxlayın.
                  </p>
                </div>
              )}

              {/* SECTION: ORDERS */}
              {results.sales.length > 0 && (
                <div className="p-2">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Sifarişlər ({results.sales.length})</span>
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {results.sales.map((sale) => (
                      <button
                        key={sale.id}
                        onClick={() => handleSelectResult("sale", sale)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 group"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              #{sale.orderNumber}
                            </span>
                            <span className="truncate text-xs font-medium text-slate-600">
                              {sale.customerName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-450 truncate">
                            <span className="flex items-center gap-0.5">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              {new Date(sale.createdAt).toLocaleDateString("az-AZ", { day: "2-digit", month: "short" })}
                            </span>
                            <span>•</span>
                            <span className="truncate font-semibold text-slate-500">
                              {sale.address}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md border ${statusColors[sale.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                            {sale.status === "gözləyir" ? "Gözləyir" : sale.status === "çatdırılıb" ? "Çatdırılıb" : "Ləğv"}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-800 shrink-0">
                            {sale.totalAmount} AZN
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION: CUSTOMERS */}
              {results.customers.length > 0 && (
                <div className="p-2">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Müştərilər ({results.customers.length})</span>
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {results.customers.map((cust) => (
                      <button
                        key={cust.id}
                        onClick={() => handleSelectResult("customer", cust)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 group"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {cust.name}
                            </span>
                            {cust.isVIP && (
                              <span className="bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md uppercase tracking-tight">
                                VIP
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-450 truncate">
                            <span className="flex items-center gap-0.5 font-mono">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {cust.phone}
                            </span>
                            {cust.city && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-medium">
                                  {cust.city}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex flex-col items-end gap-0.2 text-right">
                            <span className="text-[10px] font-bold text-slate-700">
                              {cust.orderCount || 0} sifariş
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {cust.totalSpent || 0} AZN
                            </span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION: PRODUCTS */}
              {results.products.length > 0 && (
                <div className="p-2">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-blue-500" />
                    <span>Məhsullar ({results.products.length})</span>
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {results.products.map((prod) => (
                      <button
                        key={prod.id}
                        onClick={() => handleSelectResult("product", prod)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 group"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {prod.name}
                            </span>
                            <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-semibold px-1 rounded border border-slate-200">
                              {prod.SKU}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-450 truncate">
                            <span className="bg-blue-50 text-blue-700 px-1 py-0.2 rounded text-[9px] font-medium font-sans">
                              {prod.category}
                            </span>
                            <span>•</span>
                            <span className={`font-semibold ${prod.stock <= prod.lowStockThreshold ? "text-amber-600 font-bold" : "text-slate-500"}`}>
                              Stok: {prod.stock} ədəd
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs font-bold text-slate-800 shrink-0">
                            {prod.price} AZN
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
            
            {/* Command Helper Footer */}
            <div className="bg-slate-50/90 px-4 py-2 text-[10px] text-slate-450 border-t border-slate-100 flex items-center justify-between font-sans shrink-0">
              <span className="flex items-center gap-1 font-medium">
                <CornerDownLeft className="w-3 h-3 text-slate-400" />
                <span>Nəticəyə klikləyərək ətraflı baxın</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-slate-400">
                <kbd className="px-1.2 py-0.2 bg-white border border-slate-200 rounded text-[9px] font-bold">Esc</kbd>
                <span>ləğv et</span>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
