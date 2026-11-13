import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, CheckCircle, Search, Edit3, Save, X, Navigation } from "lucide-react";
import { useData } from "../context/DataContext";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function SalesAuditView() {
  const { sales, expenses, couriers, addToast } = useData();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState<number>(0);

  const missingExpensesSales = useMemo(() => {
    return sales.filter(s => {
      // Sadece çatdırılıb olanları yoxlayırıq.
      if (s.status !== "çatdırılıb") return false;

      // Xərclərdə varlığını yoxlayırıq
      const hasExpense = expenses.some(e => 
        e.linkedOrderId === s.id || 
        e.linkedOrderNumber === s.orderNumber ||
        e.id === `expense_auto_delivery_${s.id}` || 
        e.id === `exp_del_${s.id}` || 
        e.id === `expense_${s.id}` ||
        (e.name && e.name.includes(s.orderNumber))
      );

      return !hasExpense;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales, expenses]);

  const filteredSales = missingExpensesSales.filter(s => 
    s.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSuggestedCost = (sale: any) => {
    if (sale.deliveryCost > 0) return sale.deliveryCost;
    if (sale.deliveryType === "courier" && sale.courierId) {
       const courier = couriers.find((c: any) => c.id === sale.courierId);
       if (courier && courier.standardDeliveryFee > 0) return courier.standardDeliveryFee;
    }
    return 0;
  };

  const handleFixExpense = async (sale: any, fixedCost: number) => {
    try {
      // Update Sale Document if cost changed
      let newNetRevenue = sale.netRevenue || 0;
      if (sale.deliveryCost !== fixedCost) {
         newNetRevenue = Math.max(0, (sale.totalProductPrice || sale.totalAmount) - (sale.discountAmount || 0) - fixedCost);
         await updateDoc(doc(db, "sales", sale.id), {
           deliveryCost: fixedCost,
           netRevenue: newNetRevenue
         });
      }

      // Add Expense Document
      const courier = couriers.find((c: any) => c.id === sale.courierId);
      const isColumba = (sale.deliveryType === "courier" && courier?.isDepotBased === true) || 
                        (sale.courierName || "").toLowerCase().includes("columba") || 
                        (sale.cargoCompany || "").toLowerCase().includes("columba") || 
                        (sale.notes || "").toLowerCase().includes("columba");
      const carrierName = sale.deliveryType === "courier" ? (sale.courierName || "Kuryer") : (sale.cargoCompany || "Kargo");
      const expenseName = isColumba 
        ? `Sifariş #${sale.orderNumber} (${sale.customerName}) -Columba.az`
        : `Sifariş #${sale.orderNumber} (${sale.customerName}) — ${carrierName}`;

      const expId = `expense_auto_delivery_${sale.id}`;
      const nowISO = new Date().toISOString();

      await setDoc(doc(db, "expenses", expId), {
        id: expId,
        name: expenseName,
        amount: fixedCost,
        category: "Çatdırılma",
        paymentMethod: sale.deliveryType === "courier" ? "Kuryer Balansı" : "Kargo Ödənişi",
        date: (sale.deliveredAt || sale.createdAt || nowISO).split("T")[0],
        notes: "Auditor bölməsindən əlavə edildi",
        source: "auto_delivery",
        linkedOrderId: sale.id,
        linkedOrderNumber: sale.orderNumber
      });

      addToast({
        type: "success",
        title: "Xərc Avtomatik Qeyd Edildi",
        content: `#${sale.orderNumber} üçün ${fixedCost} AZN çatdırılma xərci yaradıldı.`
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      addToast({
        type: "error",
        title: "Xəta",
        content: "Xərc əlavə olunarkən gözlənilməz problem yarandı."
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header Info Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none mb-2">Sifariş Auditi: Əskik Xərclər</h1>
            <p className="text-sm text-slate-500 leading-snug">
              Bu bölmədə "çatdırılıb" statusunda olan, lakin "Çatdırılma Xərci" sistemi tərəfindən avtomatik (və ya ümumiyyətlə) qeydə alınmamış sifarişlər lüğəti göstərilir.
            </p>
          </div>
          <div className="text-center p-3 px-5 rounded-2xl bg-amber-50 border border-amber-100">
            <h2 className="text-3xl font-black text-amber-600 tracking-tight leading-none">
              {missingExpensesSales.length}
            </h2>
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Problem</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-80 group">
          <label className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none">
             <Search className="w-4 h-4" />
          </label>
          <input
            type="text"
            placeholder="Sifariş nömrəsi, alıcı..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-medium placeholder:font-normal"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {missingExpensesSales.length === 0 ? (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
               <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Hər şey qaydasındadır!</h3>
            <p className="text-sm text-slate-500">Çatdırılması tamamlanıb xərci yazılmayan heç bir sifariş tapılmadı.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
             <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sifariş & Tarix</th>
                    <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Müştəri</th>
                    <th className="px-5 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Çatdırılma Yolu</th>
                    <th className="px-5 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tövsiyə Edilən Xərc</th>
                    <th className="px-5 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <AnimatePresence>
                    {filteredSales.map((sale: any) => {
                      const suggestedCost = getSuggestedCost(sale);
                      const isEditing = editingId === sale.id;

                      return (
                        <motion.tr 
                          key={sale.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-slate-50 transition-colors group"
                        >
                          <td className="px-5 py-4">
                            <div className="font-bold text-sm text-slate-900">{sale.orderNumber}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                              {new Date(sale.deliveredAt || sale.createdAt).toLocaleDateString("az-AZ")}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-medium text-sm text-slate-800">{sale.customerName}</div>
                            <div className="text-xs text-slate-500">{sale.customerPhone}</div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                               <Navigation className="w-3.5 h-3.5" />
                               {sale.deliveryType === "courier" ? (sale.courierName || "Kuryer") : (sale.cargoCompany || "Kargo")}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            {isEditing ? (
                              <div className="flex justify-end items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={editCost}
                                  onChange={e => setEditCost(Number(e.target.value))}
                                  autoFocus
                                  className="w-20 text-right bg-white border border-slate-300 px-2 py-1.5 rounded-lg text-sm font-mono font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                                />
                                <span className="text-xs font-bold text-slate-500">AZN</span>
                              </div>
                            ) : (
                               <div className="text-sm font-mono font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                 {suggestedCost} <span className="text-[10px] text-slate-400 font-sans tracking-wide">AZN</span>
                               </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right align-middle">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleFixExpense(sale, editCost)}
                                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  Yadda Saxla
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditCost(suggestedCost);
                                  setEditingId(sale.id);
                                }}
                                className="px-3 md:px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold rounded-xl active:scale-95 transition-all flex items-center gap-1.5 ml-auto"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Xərci Əlavə Et
                              </button>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
             </table>
          </div>
        )}
      </div>

    </div>
  );
}
