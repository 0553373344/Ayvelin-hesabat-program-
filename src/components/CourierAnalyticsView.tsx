import React, { useMemo } from "react";
import { useData } from "../context/DataContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import SafeResponsiveContainer from "./SafeResponsiveContainer";
import { Bike, TrendingUp, Award, DollarSign } from "lucide-react";
import { formatCurrency } from "../utils/xlsEngine";

export default function CourierAnalyticsView() {
  const { couriers, sales } = useData();

  // Prepare active statistics
  const courierPerfData = useMemo(() => {
    return couriers.map(c => {
      const isColumba = c.isDepotBased === true;
      // Find delivered sales for this courier
      const runs = sales.filter(s => {
        if (s.status !== "çatdırılıb") return false;
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
      const totalAmountDelivered = runs.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalFee = runs.reduce((sum, s) => sum + (s.deliveryCost !== undefined && s.deliveryCost !== null ? s.deliveryCost : c.standardDeliveryFee), 0);

      return {
        name: c.name,
        "Çatdırılma Sayı": runs.length,
        "Kassa Məbləği": totalAmountDelivered,
        "Qazanc (Yol)": totalFee,
        standardFee: c.standardDeliveryFee,
        phone: c.phone
      };
    }).sort((a, b) => b["Çatdırılma Sayı"] - a["Çatdırılma Sayı"]);
  }, [couriers, sales]);

  // Star performer
  const starCourier = useMemo(() => {
    if (courierPerfData.length === 0) return null;
    return courierPerfData[0];
  }, [courierPerfData]);

  // Total courier spendings
  const totalPaidToCouriers = useMemo(() => {
    return courierPerfData.reduce((sum, item) => sum + item["Qazanc (Yol)"], 0);
  }, [courierPerfData]);

  // Calculate total runs for average calculation
  const totalRuns = useMemo(() => {
    return courierPerfData.reduce((sum, item) => sum + item["Çatdırılma Sayı"], 0);
  }, [courierPerfData]);

  return (
    <div className="space-y-6">

      {/* Analytics Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {starCourier && (
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-yellow-50 text-yellow-600 rounded-xl">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-[10px] text-slate-400 font-bold uppercase">Lider Kuryer (Həcm)</h4>
              <p className="text-base font-extrabold text-slate-800 mt-0.5">{starCourier.name}</p>
              <p className="text-[9px] text-slate-400 font-mono mt-0.5">{starCourier["Çatdırılma Sayı"]} qeydə alınmış çatdırılma</p>
            </div>
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-650 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] text-slate-400 font-bold uppercase">Ödənilmiş Yol Haqqı Cəmi</h4>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">{formatCurrency(totalPaidToCouriers)}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Avtomat loglar əsasında</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] text-slate-400 font-bold uppercase">Kuryer Başına Orta Çatdırış</h4>
            <p className="text-xl font-extrabold text-slate-800 font-mono mt-0.5">
              {couriers.length > 0 
                ? (totalRuns / couriers.length).toFixed(1) 
                : 0} ədəd
            </p>
          </div>
        </div>

      </div>

      {/* Recharts chart representation */}
      <div className="bg-white p-6 rounded-[24px] border border-[#E9EFF6] shadow-[0_8px_24px_rgba(233,239,246,0.4)] space-y-4">
        <h4 className="text-xs font-bold text-slate-800 font-heading">Çatdırılma Paylaşım Qrafiki</h4>
        
        <div className="h-[280px] w-full text-xs relative min-h-0 min-w-0">
          <SafeResponsiveContainer width="100%" height="100%">
            <BarChart
              data={courierPerfData}
              margin={{ top: 20, right: 10, left: -20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.6} />
              <XAxis dataKey="name" stroke="#8B95A8" fontSize={9} tickLine={false} axisLine={false} dy={4} />
              <YAxis yAxisId="left" stroke="#4f46e5" fontSize={9} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={9} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "#fff", 
                  border: "1px solid #E9EFF6", 
                  borderRadius: "12px",
                  boxShadow: "0 8px 20px rgba(26, 31, 46, 0.08)",
                  fontSize: "11px"
                }}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
              <Bar yAxisId="left" dataKey="Çatdırılma Sayı" fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={16} />
              <Bar yAxisId="right" dataKey="Kassa Məbləği" fill="#10b981" radius={[6, 6, 0, 0]} barSize={16} />
            </BarChart>
          </SafeResponsiveContainer>
        </div>
      </div>

      {/* Table grid analysis */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50">
          <h4 className="text-xs font-bold text-slate-800">Performans Analiz Matrisi</h4>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[11px] font-bold tracking-wider uppercase">
              <th className="py-4 px-5">Adı</th>
              <th className="py-4 px-4">Telefon</th>
              <th className="py-4 px-4 text-center">Çatdırılma Sayı</th>
              <th className="py-4 px-4 text-right">Müştəridən Toplanan</th>
              <th className="py-4 px-4 text-right">Hesablanmış Yol Haqqı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
            {courierPerfData.map((item, index) => (
              <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3 px-5 font-semibold text-slate-850">{item.name}</td>
                <td className="py-3 px-4 font-mono text-slate-500">{item.phone}</td>
                <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">{item["Çatdırılma Sayı"]}</td>
                <td className="py-3 px-4 text-right font-bold font-mono text-slate-800">{formatCurrency(item["Kassa Məbləği"])}</td>
                <td className="py-3 px-4 text-right font-semibold font-mono text-indigo-700">{formatCurrency(item["Qazanc (Yol)"])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
