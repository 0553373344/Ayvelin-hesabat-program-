import React, { useState } from "react";
import { useData } from "../context/DataContext";
import { Sliders, Plus, Trash2, Key, ToggleLeft, ToggleRight, Check, UploadCloud, Building2, Image as ImageIcon, X } from "lucide-react";

export default function ManagerPanelView() {
  const { settings, saveSettings } = useData();

  // Settings states
  const [vipLimit, setVipLimit] = useState(settings.vipThreshold);
  const [lowStockLimit, setLowStockLimit] = useState(settings.lowStockThreshold);
  const [businessName, setBusinessName] = useState(settings.businessName || "Ayvelin");
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || "");
  const [dragActive, setDragActive] = useState(false);
  const [newProdCat, setNewProdCat] = useState("");
  const [newExpCat, setNewExpCat] = useState("");

  const handleUpdateNumericalLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      ...settings,
      vipThreshold: Number(vipLimit),
      lowStockThreshold: Number(lowStockLimit)
    });
    alert("Ayarlar uğurla yeniləndi! ✓");
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleLogoUpload(e.dataTransfer.files[0]);
    }
  };

  const handleLogoUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Xahiş edirik yalnız şəkil faylı seçin!");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 256;
        const MAX_HEIGHT = 256;
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
          setLogoUrl(compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      alert("Biznes adı boş ola bilməz!");
      return;
    }
    await saveSettings({
      ...settings,
      businessName: businessName.trim(),
      logoUrl
    });
    alert("Biznes brendinqi uğurla yeniləndi! ✓");
  };

  const handleAddProductCategory = async () => {
    if (!newProdCat.trim()) return;
    if (settings.productCategories.includes(newProdCat.trim())) {
      alert("Bu kateqoriya artıq mövcuddur!");
      return;
    }
    await saveSettings({
      ...settings,
      productCategories: [...settings.productCategories, newProdCat.trim()]
    });
    setNewProdCat("");
  };

  const handleRemoveProductCategory = async (cat: string) => {
    const conf = window.confirm(`"${cat}" Kateqoriyasını silmək istəyirsiniz? (Məhsulların özləri silinməyəcək)`);
    if (!conf) return;
    await saveSettings({
      ...settings,
      productCategories: settings.productCategories.filter(c => c !== cat)
    });
  };

  const handleAddExpenseCategory = async () => {
    if (!newExpCat.trim()) return;
    if (settings.expenseCategories.includes(newExpCat.trim())) {
      alert("Bu xərc kateqoriyası artıq mövcuddur!");
      return;
    }
    await saveSettings({
      ...settings,
      expenseCategories: [...settings.expenseCategories, newExpCat.trim()]
    });
    setNewExpCat("");
  };

  const handleRemoveExpenseCategory = async (cat: string) => {
    const conf = window.confirm(`"${cat}" Kateqoriyasını xərc sistemindən silmək istəyirsiniz?`);
    if (!conf) return;
    await saveSettings({
      ...settings,
      expenseCategories: settings.expenseCategories.filter(c => c !== cat)
    });
  };

  return (
    <div className="space-y-6">

      {/* Header element */}
      <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-indigo-50 text-[#4f46e5] rounded-xl flex items-center justify-center">
          <Sliders className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800">Sistem Tənzimləmələri</h3>
          <p className="text-xs text-slate-400">Biznes qaydaları, VIP dərəcələri və kateqoriya strukturları</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 0. Business Branding & Logo */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#6bbd87]" /> Biznes Brendinqi (Ad və Logo)
          </h4>

          <form onSubmit={handleSaveBranding} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Biznes Adı</label>
              <input 
                type="text"
                placeholder="Məs: Ayvelin"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Biznes Logosu</label>
              
              {/* Logo preview and management */}
              <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200 overflow-hidden shadow-inner shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-700 block">
                    {logoUrl ? "Brend logosu təyin edilib" : "Varsayılan mətn logosu (AY)"}
                  </span>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl("")}
                      className="px-2.5 py-1 text-[10px] font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Sil
                    </button>
                  )}
                </div>
              </div>

              {/* Drag and drop zone */}
              <div 
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  dragActive 
                    ? "border-[#6bbd87] bg-[#6bbd87]/5" 
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("logoFileInput")?.click()}
              >
                <input 
                  id="logoFileInput"
                  type="file" 
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleLogoUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <UploadCloud className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <p className="font-semibold text-slate-600 mb-0.5">Logonu yükləmək üçün klikləyin və ya faylı sürüşdürün</p>
                <p className="text-[10px] text-slate-400">PNG, JPG, SVG və s. (2-4 MB-a qədər, avtomatik sıxılır)</p>
              </div>
            </div>

            <button 
              type="submit"
              className="px-5 py-2.5 bg-[#2c5a3e] hover:bg-[#224731] text-white font-bold rounded-xl active:scale-95 transition-all text-xs flex items-center gap-1.5 animate-shimmer"
            >
              <Check className="w-4 h-4" /> Brendi Yadda Saxla
            </button>
          </form>
        </div>

        {/* 1. Numerical thresholds */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Ümumi Hədlər və Rejimlər</h4>

          <form onSubmit={handleUpdateNumericalLimits} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Minimal VIP Çatdırılma Limiti</label>
              <input 
                type="number"
                min={1}
                value={vipLimit}
                onChange={(e) => setVipLimit(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
              />
              <p className="text-[9px] text-slate-400 leading-relaxed font-sans">Müştərinin &quot;çatdırılıb&quot; statuslu sifariş sayı bu rəqəmə çatdıqda avtomatik VIP dərəcəsi alır.</p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Anbar Az Stok Xəbərdarlığı Həddi</label>
              <input 
                type="number"
                min={1}
                value={lowStockLimit}
                onChange={(e) => setLowStockLimit(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl outline-none"
              />
              <p className="text-[9px] text-slate-400 leading-relaxed font-sans">Anbarda məhsulun sayı bu rəqəmdən az olduqda sistemdə və sifariş zamanı uyarısı verilir.</p>
            </div>

            <button 
              type="submit"
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl active:scale-95 transition-all text-xs"
            >
              Limitləri Yadda Saxla
            </button>
          </form>
        </div>

        {/* 2. Product Categories */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Məhsul Kateqoriyaları</h4>

          <div className="flex gap-2 text-xs">
            <input 
              type="text"
              placeholder="Məs: Şalvar, Ayaqqabı"
              value={newProdCat}
              onChange={(e) => setNewProdCat(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl outline-none"
            />
            <button 
              onClick={handleAddProductCategory}
              className="px-4 py-1.5 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1 hover:bg-slate-700"
            >
              <Plus className="w-4 h-4" /> Əlavə et
            </button>
          </div>

          <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
            {settings.productCategories.map((cat, idx) => (
              <div key={idx} className="p-2 bg-slate-50 rounded-lg flex justify-between items-center text-xs">
                <span className="font-medium text-slate-700">{cat}</span>
                <button 
                  onClick={() => handleRemoveProductCategory(cat)}
                  className="p-1 hover:bg-rose-50 rounded text-rose-550"
                  aria-label={`Remove product category: ${cat}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Expense Categories */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Xərc Kateqoriyaları</h4>

          <div className="flex gap-2 text-xs">
            <input 
              type="text"
              placeholder="Məs: Vergi, İcarə, İnternet"
              value={newExpCat}
              onChange={(e) => setNewExpCat(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl outline-none"
            />
            <button 
              onClick={handleAddExpenseCategory}
              className="px-4 py-1.5 bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1 hover:bg-slate-700"
            >
              <Plus className="w-4 h-4" /> Əlavə et
            </button>
          </div>

          <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
            {settings.expenseCategories.map((cat, idx) => (
              <div key={idx} className="p-2 bg-slate-50 rounded-lg flex justify-between items-center text-xs">
                <span className="font-medium text-slate-700">{cat}</span>
                <button 
                  onClick={() => handleRemoveExpenseCategory(cat)}
                  className="p-1 hover:bg-rose-50 rounded text-rose-550"
                  aria-label={`Remove expense category: ${cat}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
