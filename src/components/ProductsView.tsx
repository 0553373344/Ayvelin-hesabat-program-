import React, { useState, useMemo, useEffect } from "react";
import { useData } from "../context/DataContext";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Search, 
  LayoutGrid, 
  List, 
  History, 
  TrendingUp, 
  PlusCircle, 
  MinusCircle, 
  Trash2, 
  Edit, 
  X, 
  Sliders,
  DollarSign,
  Barcode,
  UploadCloud,
  Image as ImageIcon
} from "lucide-react";
import { Product, StockHistoryItem } from "../types";
import { formatCurrency, formatDateAZ } from "../utils/xlsEngine";

export default function ProductsView() {
  const { products, saveProduct, adjustProductStock, deleteProduct, settings } = useData();
  
  const location = useLocation();

  // Controls
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (q) {
      setSearchTerm(decodeURIComponent(q));
    }
  }, [location.search]);
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const [formName, setFormName] = useState("");
  const [formSKU, setFormSKU] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPrice, setFormPrice] = useState(0);
  const [formCostPrice, setFormCostPrice] = useState(0);
  const [formStock, setFormStock] = useState(0);
  const [formThreshold, setFormThreshold] = useState(5);
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [productDragActive, setProductDragActive] = useState(false);

  // Quick adjust states
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustReason, setAdjustReason] = useState<"Alış" | "Qaytarılma" | "Ziyan" | "Düzəliş" | "Digər">("Alış");
  const [adjustDirection, setAdjustDirection] = useState<"in" | "out">("in"); // "in" (+) , "out" (-)
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustNote, setAdjustNote] = useState("");

  // History viewer matches
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Product | null>(null);

  // States for editing a stock log item
  const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null);
  const [editLogReason, setEditLogReason] = useState("");
  const [editLogNote, setEditLogNote] = useState("");
  const [editLogChange, setEditLogChange] = useState(0);
  const [editLogDate, setEditLogDate] = useState("");

  const handleDeleteStockHistoryLog = async (product: Product, indexToDelete: number) => {
    const confirmDelete = window.confirm("Bu hərəkət qeydini silmək və məhsulun stokunu buna uyğun geri qaytarmaq istəyirsiniz?");
    if (!confirmDelete) return;

    const logItem = product.stockHistory[indexToDelete];
    const newHistory = product.stockHistory.filter((_, idx) => idx !== indexToDelete);
    // Reverse the log's change on stock
    const newStock = Math.max(0, product.stock - logItem.change);

    const updatedProduct = {
      ...product,
      stock: newStock,
      stockHistory: newHistory
    };

    await saveProduct(updatedProduct);
    setHistoryTarget(updatedProduct);
  };

  const handleSaveLogEdit = async (idx: number) => {
    if (!historyTarget) return;

    const oldLog = historyTarget.stockHistory[idx];
    const newLog: StockHistoryItem = {
      ...oldLog,
      reason: editLogReason,
      note: editLogNote,
      change: editLogChange,
      date: editLogDate
    };

    // Calculate physical stock: subtract the old change, add the new change
    const revertedStock = historyTarget.stock - oldLog.change;
    const newStock = Math.max(0, revertedStock + editLogChange);

    const updatedHistory = historyTarget.stockHistory.map((l, i) => i === idx ? newLog : l);
    const updatedProduct = {
      ...historyTarget,
      stock: newStock,
      stockHistory: updatedHistory
    };

    await saveProduct(updatedProduct);
    setHistoryTarget(updatedProduct);
    setEditingLogIndex(null);
  };

  // Auto set adjustDirection based on reason selection
  useEffect(() => {
    if (adjustReason === "Ziyan") {
      setAdjustDirection("out");
    } else if (adjustReason === "Alış" || adjustReason === "Qaytarılma") {
      setAdjustDirection("in");
    }
  }, [adjustReason]);

  // Filter listings
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.SKU.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCategory === "all" ? true : p.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, searchTerm, selectedCategory]);

  const handleProductImageDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setProductDragActive(true);
    } else if (e.type === "dragleave") {
      setProductDragActive(false);
    }
  };

  const handleProductImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setProductDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProductImageUpload(e.dataTransfer.files[0]);
    }
  };

  const handleProductImageUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Xahiş edirik yalnız şəkil faylı seçin!");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 450;
        const MAX_HEIGHT = 450;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setFormImageUrl(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const openNewProductForm = () => {
    setEditProduct(null);
    setFormName("");
    setFormSKU("");
    setFormCategory(settings.productCategories[0] || "");
    setFormPrice(0);
    setFormCostPrice(0);
    setFormStock(0);
    setFormThreshold(settings.lowStockThreshold || 5);
    setFormImageUrl("");
    setFormNotes("");
    setIsFormOpen(true);
  };

  const openEditProductForm = (p: Product) => {
    setEditProduct(p);
    setFormName(p.name);
    setFormSKU(p.SKU);
    setFormCategory(p.category);
    setFormPrice(p.price);
    setFormCostPrice(p.costPrice);
    setFormStock(p.stock);
    setFormThreshold(p.lowStockThreshold);
    setFormImageUrl(p.imageUrl || "");
    setFormNotes(p.notes || "");
    setIsFormOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formSKU) {
      alert("Ad və SKU vacibdir.");
      return;
    }

    const payload: Product = {
      id: editProduct ? editProduct.id : `product_${Date.now()}`,
      name: formName,
      SKU: formSKU,
      category: formCategory,
      price: Number(formPrice),
      costPrice: Number(formCostPrice),
      stock: Number(formStock),
      lowStockThreshold: Number(formThreshold),
      imageUrl: formImageUrl || `https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3`,
      notes: formNotes,
      stockHistory: editProduct ? editProduct.stockHistory : [{
        date: new Date().toISOString(),
        change: Number(formStock),
        reason: "İlkin daxilolma",
        note: formNotes || "Məhsul sistemə əlavə edildi."
      }]
    };

    await saveProduct(payload);
    setIsFormOpen(false);
  };

  // Perform specific transaction adjustments
  const triggerIncrementStock = async (p: Product, change: number) => {
    const reason = change > 0 ? "Düzəliş (Artım)" : "Düzəliş (Azalma)";
    await adjustProductStock(p.id, change, reason, "Sürətli tənzimləmə panelindən");
  };

  const handlePerformAdjustment = async () => {
    if (!adjustTarget) return;
    const finalChange = adjustDirection === "out" ? -Math.abs(adjustQty) : Math.abs(adjustQty);
    await adjustProductStock(
      adjustTarget.id,
      finalChange,
      adjustReason,
      adjustNote
    );
    setIsAdjustOpen(false);
    setAdjustTarget(null);
    setAdjustQty(1);
    setAdjustNote("");
  };

  return (
    <div className="space-y-6">
      
      {/* Search Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 bg-white rounded-2xl border border-slate-100 shadow-sm gap-4">
        
        <div className="flex flex-1 items-center gap-2 w-full max-w-lg bg-slate-100 px-3.5 py-2.5 bg-slate-100 rounded-xl border border-slate-200/50">
          <Search className="w-4.5 h-4.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Məhsul adı və ya SKU axtar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-xs text-slate-700 w-full placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl text-slate-600 outline-none"
          >
            <option value="all">Bütün Kateqoriyalar</option>
            {settings.productCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Table / Grid switches */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={`p-1.5 rounded-lg transition-all ${viewMode === "grid" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              <LayoutGrid className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => setViewMode("table")}
              aria-label="Table view"
              className={`p-1.5 rounded-lg transition-all ${viewMode === "table" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              <List className="w-4.5 h-4.5" />
            </button>
          </div>

          <button 
            onClick={openNewProductForm}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Yeni Məhsul
          </button>
        </div>

      </div>

      {/* Grid view layout */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredProducts.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 italic">
              Axtarışa uyğun məhsul tapılmadı.
            </div>
          ) : (
            filteredProducts.map(prod => {
              const matchesLowStock = prod.stock <= prod.lowStockThreshold;
              return (
                <div 
                  key={prod.id}
                  className="bg-white rounded-2xl overflow-hidden border border-slate-100 hover:border-slate-300 transition-all shadow-sm flex flex-col justify-between"
                >
                  {/* Card upper image and SKU badge */}
                  <div className="relative h-44 bg-slate-50 overflow-hidden group">
                    <img 
                      src={prod.imageUrl || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3'} 
                      alt={prod.name} 
                      onError={(e) => {
                        e.currentTarget.src = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3';
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-slate-900/80 text-white font-mono text-[9px] font-bold rounded">
                      {prod.SKU}
                    </div>
                    {matchesLowStock && (
                      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 bg-red-600/90 text-white text-[9px] font-bold rounded flex items-center gap-1">
                        Az Stok 🔴
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{prod.category}</span>
                      <h4 className="font-bold text-slate-800 text-sm mt-0.5 truncate">{prod.name}</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-slate-50 py-2.5 font-mono">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Satış Qiyməti:</span>
                        <span className="text-slate-800 font-bold">{formatCurrency(prod.price)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">Alış Maya:</span>
                        <span className="text-slate-500 font-semibold">{formatCurrency(prod.costPrice)}</span>
                      </div>
                    </div>

                    {/* Stock tracker and operations */}
                    <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-slate-400 uppercase font-sans">Stok Qalığı</span>
                        <span className={`text-base font-bold font-mono leading-none mt-1 flex items-center gap-1 ${matchesLowStock ? 'text-red-500 font-extrabold' : 'text-slate-700'}`}>
                          {prod.stock} ədəd {matchesLowStock && "🔴"}
                        </span>
                      </div>

                      {/* Quick stock operations (+ / -) */}
                      <div className="flex items-center gap-1 text-slate-500">
                        <button 
                          onClick={() => triggerIncrementStock(prod, -1)}
                          disabled={prod.stock <= 0}
                          title="Sürətli Azalt (-1)"
                          className="hover:text-rose-600 transition-colors disabled:opacity-40"
                        >
                          <MinusCircle className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => triggerIncrementStock(prod, 1)}
                          title="Sürətli Artır (+1)"
                          className="hover:text-emerald-600 transition-colors"
                        >
                          <PlusCircle className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Footer options */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                      <button 
                        onClick={() => {
                          setHistoryTarget(prod);
                          setIsHistoryOpen(true);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 font-semibold flex items-center gap-1"
                      >
                        <History className="w-3.5 h-3.5" /> Log
                      </button>

                      <div className="flex gap-1.5">
                        <button 
                          onClick={() => {
                            setAdjustTarget(prod);
                            setIsAdjustOpen(true);
                          }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 rounded-lg text-slate-600"
                          title="Ətraflı Stok Tənzimlə"
                        >
                          <Sliders className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openEditProductForm(prod)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 rounded-lg text-slate-600"
                          title="Redaktə Et"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            const conf = window.confirm(`${prod.name} məhsulunu birdəfəlik silmək istədiyinizə əminsiniz?`);
                            if (conf) deleteProduct(prod.id);
                          }}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Table / list layouts */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[11px] font-bold tracking-wider uppercase">
                <th className="py-4 px-5">Məhsul</th>
                <th className="py-4 px-4">SKU Code</th>
                <th className="py-4 px-4">Kateqoriya</th>
                <th className="py-4 px-4">Satış Qiyməti</th>
                <th className="py-4 px-4">Alış Maya</th>
                <th className="py-4 px-4 text-center">Stok</th>
                <th className="py-4 px-5 text-right">Əməliyyatlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
              {filteredProducts.map(prod => {
                const isUnder = prod.stock <= prod.lowStockThreshold;
                return (
                  <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-5 font-semibold text-slate-800">
                      <div className="flex flex-col">
                        <span>{prod.name}</span>
                        {isUnder && <span className="text-[9px] text-red-500 font-bold flex items-center gap-0.5">Az Stok! 🔴</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{prod.SKU}</td>
                    <td className="py-3 px-4">{prod.category}</td>
                    <td className="py-3 px-4 font-bold font-mono">{formatCurrency(prod.price)}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{formatCurrency(prod.costPrice)}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button 
                          onClick={() => triggerIncrementStock(prod, -1)}
                          disabled={prod.stock <= 0}
                          title="Sürətli Azalt (-1)"
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-40 transition-colors"
                        >
                          <MinusCircle className="w-4 h-4" />
                        </button>
                        <span className={`px-2.5 py-0.5 rounded-lg font-bold font-mono min-w-[2.5rem] inline-block text-center ${isUnder ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-50 text-slate-700'}`}>
                          {prod.stock} {isUnder && "🔴"}
                        </span>
                        <button 
                          onClick={() => triggerIncrementStock(prod, 1)}
                          title="Sürətli Artır (+1)"
                          className="text-slate-400 hover:text-emerald-600 transition-colors"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => {
                            setHistoryTarget(prod);
                            setIsHistoryOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            setAdjustTarget(prod);
                            setIsAdjustOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                          <Sliders className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openEditProductForm(prod)}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            const conf = window.confirm("Məhsul silinsin?");
                            if (conf) deleteProduct(prod.id);
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Main product creation Modal form */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full relative z-10 space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm">
                  {editProduct ? "Məhsulu Redaktə Et" : "Yeni Məhsul Daxil Edin"}
                </h3>
                <button onClick={() => setIsFormOpen(false)} className="p-1 ml-auto text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="space-y-3 text-xs">
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Məhsul Adı *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Məs: Klassik Ağ Köynək"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">SKU Code *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Məs: PRD-SH-01"
                      value={formSKU}
                      onChange={(e) => setFormSKU(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Kateqoriya</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                    >
                      {settings.productCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Satış Qiyməti (₼) *</label>
                    <input 
                      type="number" 
                      required
                      min={0}
                      step="any"
                      placeholder="45"
                      value={formPrice}
                      onChange={(e) => setFormPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Alış Maya Dəri (₼) *</label>
                    <input 
                      type="number" 
                      required
                      min={0}
                      step="any"
                      placeholder="18"
                      value={formCostPrice}
                      onChange={(e) => setFormCostPrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">İlkin Anbar Stoku</label>
                    <input 
                      type="number" 
                      min={0}
                      disabled={!!editProduct}
                      placeholder="40"
                      value={formStock}
                      onChange={(e) => setFormStock(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Az Seçim Həddi</label>
                    <input 
                      type="number" 
                      min={1}
                      placeholder="5"
                      value={formThreshold}
                      onChange={(e) => setFormThreshold(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Məhsul Şəkli</label>
                  
                  {/* Current image preview and clear option */}
                  <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200 overflow-hidden shadow-inner shrink-0">
                      {formImageUrl ? (
                        <img src={formImageUrl} alt="Product preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-600 block">
                        {formImageUrl ? "Məhsul şəkli təyin edilib" : "Şəkil təyin edilməyib"}
                      </span>
                      {formImageUrl && (
                        <button
                          type="button"
                          onClick={() => setFormImageUrl("")}
                          className="px-2.5 py-1 text-[10px] font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Sil
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div 
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                      productDragActive 
                        ? "border-[#6bbd87] bg-[#6bbd87]/5" 
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                    onDragEnter={handleProductImageDrag}
                    onDragOver={handleProductImageDrag}
                    onDragLeave={handleProductImageDrag}
                    onDrop={handleProductImageDrop}
                    onClick={() => document.getElementById("productImageInput")?.click()}
                  >
                    <input 
                      id="productImageInput"
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleProductImageUpload(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <UploadCloud className="w-8 h-8 mx-auto text-slate-400 mb-1" />
                    <p className="font-semibold text-slate-600 text-xs">Yükləmək üçün klikləyin və ya faylı sürüşdürün</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Avtomatik olaraq sıxılır və bazada saxlanılır</p>
                  </div>

                  {/* Manual URL input fallback */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">VƏ YA ŞƏKİL URL-İ DAXİL EDİN</span>
                    <input 
                      type="url" 
                      placeholder="https://images.unsplash.com/..."
                      value={formImageUrl}
                      onChange={(e) => setFormImageUrl(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl outline-none text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Qeydlər</label>
                  <textarea 
                    placeholder="Məhsula dair əlavə qeydlər"
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                  />
                </div>

                <div className="pt-4 flex gap-2">
                  <button 
                    type="button" 
                    onClick={() => setIsFormOpen(false)}
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

      {/* Advanced adjustment transactional values modal */}
      <AnimatePresence>
        {isAdjustOpen && adjustTarget && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdjustOpen(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full relative z-10 space-y-4"
            >
              <div className="flex justify-between items-center border-b pb-3 border-slate-100 animate-fade-in">
                <h4 className="font-bold text-slate-800 text-xs">Stok Tənzimləmə: {adjustTarget.name}</h4>
                <button onClick={() => setIsAdjustOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Səbəb</label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                  >
                    <option value="Alış">Alış (Restoklama)</option>
                    <option value="Qaytarılma">Qaytarılma (Anbara İadə)</option>
                    <option value="Ziyan">Ziyan (Zay/İtkilər)</option>
                    <option value="Düzəliş">Düzəliş (Anbar Sayımı)</option>
                    <option value="Digər">Digər qeydlər</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Əməliyyat İstiqaməti</label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl font-medium">
                    <button
                      type="button"
                      onClick={() => setAdjustDirection("in")}
                      className={`py-1.5 rounded-lg text-center transition-all ${
                        adjustDirection === "in" 
                          ? "bg-white text-emerald-700 shadow-sm font-bold" 
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Mədaxil (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustDirection("out")}
                      className={`py-1.5 rounded-lg text-center transition-all ${
                        adjustDirection === "out" 
                          ? "bg-white text-rose-700 shadow-sm font-bold" 
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Məxaric (-)
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Miqdar (Ədəd)</label>
                  <input 
                    type="number"
                    min={1}
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Log Qeydi</label>
                  <textarea 
                    placeholder="Səbəb haqqında qısa izahat yazın"
                    rows={2.5}
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
                  />
                </div>

                <button 
                  onClick={handlePerformAdjustment}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-sm mt-2"
                >
                  ✓ Tənzimlə və Jurnala Yaz
                </button>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History log drawer dialog */}
      <AnimatePresence>
        {isHistoryOpen && historyTarget && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-lg w-full relative z-10 flex flex-col max-h-[500px]"
            >
              <div className="flex justify-between items-center border-b pb-3 border-slate-100 mb-4 flex-shrink-0">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Stok Hərəkət Jurnalı</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">{historyTarget.name} ({historyTarget.SKU})</p>
                </div>
                <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {(!historyTarget.stockHistory || historyTarget.stockHistory.length === 0) ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">Bu məhsula aid heç bir hərəkət qeydə alınmayıb.</p>
                ) : (
                  historyTarget.stockHistory.map((log, index) => {
                    const isEditing = editingLogIndex === index;
                    return (
                      <div key={index} className="p-3.5 bg-slate-50 rounded-2xl flex flex-col gap-2 text-xs border border-slate-200/50">
                        {isEditing ? (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Səbəb</label>
                                <select
                                  value={editLogReason}
                                  onChange={(e) => setEditLogReason(e.target.value)}
                                  className="w-full bg-white border border-slate-200 px-2 py-1 rounded-lg text-[11px] outline-none"
                                >
                                  <option value="Alış">Alış (Restoklama)</option>
                                  <option value="Qaytarılma">Qaytarılma (Anbara İadə)</option>
                                  <option value="Ziyan">Ziyan (Zay/İtkilər)</option>
                                  <option value="Düzəliş">Düzəliş (Anbar Sayımı)</option>
                                  <option value="Sifariş Çatdırıldı">Sifariş Çatdırıldı</option>
                                  <option value="Sifariş Ləğv Edildi">Sifariş Ləğv Edildi</option>
                                  <option value="Digər">Digər</option>
                                </select>
                              </div>
                              <div className="space-y-0.5">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Dəyişiklik (+/-)</label>
                                <input
                                  type="number"
                                  value={editLogChange}
                                  onChange={(e) => setEditLogChange(Number(e.target.value))}
                                  className="w-full bg-white border border-slate-200 px-2 py-1 rounded-lg text-[11px] font-mono outline-none"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Tarix</label>
                                <input
                                  type="datetime-local"
                                  value={editLogDate.substring(0, 16)}
                                  onChange={(e) => setEditLogDate(new Date(e.target.value).toISOString())}
                                  className="w-full bg-white border border-slate-200 px-2 py-1 rounded-lg text-[11px] font-mono outline-none"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Açıqlama</label>
                                <input
                                  type="text"
                                  value={editLogNote}
                                  onChange={(e) => setEditLogNote(e.target.value)}
                                  className="w-full bg-white border border-slate-200 px-2 py-1 rounded-lg text-[11px] outline-none"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-1.5 pt-1">
                              <button
                                onClick={() => setEditingLogIndex(null)}
                                className="px-3 py-1 bg-slate-200 text-slate-700 hover:bg-slate-300 font-semibold rounded-lg text-[10px]"
                              >
                                Ləğv Et
                              </button>
                              <button
                                onClick={() => handleSaveLogEdit(index)}
                                className="px-3 py-1 bg-slate-800 text-white hover:bg-slate-900 font-bold rounded-lg text-[10px]"
                              >
                                Yadda Saxla
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  log.change > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                }`}>
                                  {log.reason}
                                </span>
                                <span className="font-mono text-[10px] text-slate-400">{formatDateAZ(log.date)}</span>
                              </div>
                              <p className="mt-1 text-slate-600 font-medium">{log.note || "Açıqlama yazılmayıb"}</p>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono font-bold text-sm leading-none mr-1.5 ${log.change > 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {log.change > 0 ? `+${log.change}` : log.change}
                              </span>
                              
                              <div className="flex items-center gap-1 border-l border-slate-200 pl-1.5">
                                <button
                                  onClick={() => {
                                    setEditingLogIndex(index);
                                    setEditLogReason(log.reason);
                                    setEditLogNote(log.note || "");
                                    setEditLogChange(log.change);
                                    setEditLogDate(log.date);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-all"
                                  title="Qeydi redaktə et"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStockHistoryLog(historyTarget, index)}
                                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                  title="Qeydi sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
