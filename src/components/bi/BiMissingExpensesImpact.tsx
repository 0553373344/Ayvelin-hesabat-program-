import React, { useMemo } from "react";
import { useData } from "../../context/DataContext";
import { AlertCircle, TrendingDown, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";

export default function BiMissingExpensesImpact() {
  const { sales, expenses, couriers } = useData();

  const missingStats = useMemo(() => {
    const missingExpensesSales = sales.filter(s => {
      if (s.status !== "çatdırılıb") return false;

      const hasExpense = expenses.some(e => 
        e.linkedOrderId === s.id || 
        e.linkedOrderNumber === s.orderNumber ||
        e.id === `expense_auto_delivery_${s.id}` || 
        e.id === `exp_del_${s.id}` || 
        e.id === `expense_${s.id}` ||
        (e.name && e.name.includes(s.orderNumber))
      );

      return !hasExpense;
    });

    let totalImpact = 0;
    let missingCount = 0;

    missingExpensesSales.forEach(sale => {
      let cost = sale.deliveryCost || 0;
      if (cost === 0 && sale.deliveryType === "courier" && sale.courierId) {
        const courier = couriers.find(c => c.id === sale.courierId);
        if (courier && courier.standardDeliveryFee > 0) {
          cost = courier.standardDeliveryFee;
        }
      }
      if (cost > 0) {
        totalImpact += cost;
        missingCount++;
      }
    });

    return { totalImpact, missingCount };
  }, [sales, expenses, couriers]);

  if (missingStats.missingCount === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
    >
      <div className="flex items-start sm:items-center gap-3.5">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <div>
          <h3 className="text-red-900 font-bold text-sm sm:text-base tracking-tight mb-0.5">Xərci Qeyd Olunmayan Sifarişlər Riski</h3>
          <p className="text-red-700/80 text-xs sm:text-sm font-medium leading-snug max-w-xl">
             Sistemdə {missingStats.missingCount} ədəd "çatdırılıb" statusunda olan sifarişin çatdırılma xərci yoxdur. Bu məbləğlər net mənfəətinizi olduğundan çox göstərir.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
        <div className="bg-white/60 px-5 py-3 rounded-xl border border-red-100/50 flex flex-col items-end shrink-0 min-w-[140px]">
        <div className="flex items-center gap-1.5 text-red-500 font-bold text-[10px] uppercase tracking-wider mb-1">
          <TrendingDown className="w-3.5 h-3.5" />
          Maliyyə Ziyanı
        </div>
        <div className="text-2xl font-black text-red-600 tracking-tight leading-none">
          -{missingStats.totalImpact.toFixed(2)} <span className="text-sm font-bold text-red-400">AZN</span>
        </div>
      </div>
      <Link to="/sales-audit" className="mt-1 sm:mt-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs flex items-center shrink-0 shadow-sm shadow-red-600/20 transition-colors gap-2 active:scale-95">Sifarişləri Audit Et <ArrowRight className="w-3.5 h-3.5"/></Link>
      </div>
      </motion.div>
  );
}
