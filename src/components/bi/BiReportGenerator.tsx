import React, { useState, useMemo } from "react";
import { Sale, Expense, Product, Customer } from "../../types";
import { getPeriodMetrics, performAbcAnalysis, performCustomerSegmentation } from "../../utils/biCalculations";
import { formatCurrency } from "../../utils/xlsEngine";
import { ArrowDownToLine, Printer, Sparkles, AlertCircle, FileSpreadsheet, Check } from "lucide-react";

interface BiReportGeneratorProps {
  sales: Sale[];
  expenses: Expense[];
  products: Product[];
  customers: Customer[];
}

export default function BiReportGenerator({ sales, expenses, products, customers }: BiReportGeneratorProps) {
  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly" | "quarterly" | "yearly">("monthly");
  const [generatedReport, setGeneratedReport] = useState<any | null>(null);

  // Generate the active period boundary objects
  const calculateReportData = () => {
    const now = new Date();
    let start = new Date();
    let label = "Aylıq";

    if (reportType === "daily") {
      start.setHours(0, 0, 0, 0);
      label = "Günlük";
    } else if (reportType === "weekly") {
      start.setDate(start.getDate() - 7);
      label = "Həftəlik";
    } else if (reportType === "monthly") {
      start.setDate(start.getDate() - 30);
      label = "Aylıq (Son 30 gün)";
    } else if (reportType === "quarterly") {
      start.setDate(start.getDate() - 90);
      label = "Rüblük (Son 90 gün)";
    } else {
      start.setDate(start.getDate() - 365);
      label = "İllik";
    }

    const metrics = getPeriodMetrics(sales, expenses, products, customers, start, now);
    const abc = performAbcAnalysis(sales, products).slice(0, 5); // top 5 products for preview
    const segments = performCustomerSegmentation(customers, sales);
    const totalRisky = segments.filter((c) => c.segment === "Riskli" || c.segment === "İtirilmiş").length;

    // AI suggestions dynamically created based on data ratios!
    const recommendations = [];
    if (metrics.cancellationRate > 12) {
      recommendations.push("🛑 Çatdırılma keyfiyyət tərəfdaşını dəyişin: Ləğv dərəcələri biznes dayanıqlılığını ciddi boğur.");
    } else {
      recommendations.push("🟢 Logistika normal səviyyədədir: Müştəri reytinqlərini artırmaq üçün kuryer sürətləndirilməsinə davam edin.");
    }

    if (metrics.profitMargin < 25) {
      recommendations.push("🛑 Premium qiymət paketi dizaynı: Məhsul gəlirlilik marjası çox aşağıdır, anbar maya bərpasını artırın.");
    } else {
      recommendations.push("🟢 Yüksək gəlir dərəcəsi: Mövcud qiymət strategiyasını qoruya və reklamları genişləndirə bilərsiniz.");
    }

    setGeneratedReport({
      label,
      metrics,
      abc,
      totalRisky,
      recommendations,
      date: now.toLocaleDateString("az-AZ", { hour: "2-digit", minute: "2-digit" }),
    });
  };

  // Raw file exporters
  const exportAsCsv = () => {
    if (!generatedReport) return;
    const { metrics } = generatedReport;
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Metrika, Dəyər\n"
      + `Sifarişlər, ${metrics.deliveredCount} ədəd\n`
      + `Cəmi Gəlir, ${metrics.revenue} AZN\n`
      + `COGS Maya, ${metrics.cogs} AZN\n`
      + `Təmiz Qazanc, ${metrics.netProfit} AZN\n`
      + `Marja Həddi, ${metrics.profitMargin.toFixed(1)}%\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `BI_Hesabat_${reportType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportAsJson = () => {
    if (!generatedReport) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(generatedReport, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `BI_Hesabat_${reportType}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Beautiful clean browser print/PDF triggered via styled iframe or window trigger
  const triggerPrintPdf = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-5 shadow-sm">
      
      {/* Header configurations */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-50">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
            <Printer className="w-4 h-4 text-indigo-600" /> AI Hesabat Generatoru və Export
          </h3>
          <p className="text-[10px] text-slate-400">Bir kliklə biznes idarəetmə sənədinin (Excel, Print-ready PDF, CSV) çıxarılması</p>
        </div>

        {/* Picker report type controls */}
        <div className="flex bg-slate-100 p-1 rounded-xl text-[10px] font-semibold">
          {[
            { id: "daily", label: "Günlük" },
            { id: "weekly", label: "Həftəlik" },
            { id: "monthly", label: "Aylıq" },
            { id: "quarterly", label: "Rüblük" },
            { id: "yearly", label: "İllik" },
          ].map((type) => (
            <button
              key={type.id}
              onClick={() => {
                setReportType(type.id as any);
                setGeneratedReport(null);
              }}
              className={`px-3 py-1.5 rounded-lg select-none transition-all ${reportType === type.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compile button or presentation */}
      {!generatedReport ? (
        <div className="py-12 border-2 border-dashed border-slate-150 rounded-2xl flex flex-col items-center justify-center space-y-3.5 bg-slate-50/20">
          <div className="bg-indigo-600 rounded-full p-3 text-white shadow-xl shadow-indigo-600/10">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="text-center space-y-1 max-w-sm">
            <h4 className="text-xs font-bold text-slate-800">Dərin Maliyyə Hesabatını Tərtib Et!</h4>
            <p className="text-[11px] text-slate-450 leading-relaxed font-sans">Sistem bütün anbar və CRM məlumatlarını süzgəcdən keçirib rəsmi rəhbərlik hesabatını hazırlayacaqdır.</p>
          </div>
          <button
            onClick={calculateReportData}
            className="bg-indigo-600 hover:bg-indigo-500 transition-all text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md"
          >
            Hesabatı Tərtib Et
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Main Printable Area Block styling */}
          <div id="print-area" className="p-5 border border-slate-100 rounded-2xl bg-zinc-50/45 space-y-4">
            <div className="flex justify-between items-start pb-4 border-b border-slate-200">
              <div>
                <span className="text-[9px] font-black uppercase text-indigo-700 font-mono tracking-widest bg-indigo-50 px-2 py-0.5 rounded-lg">BI AVTOMATİK ŞİRKƏT HESABATI</span>
                <h4 className="text-sm font-black text-slate-900 mt-1">{generatedReport.label} Fəaliyyət Sinopsisi</h4>
                <p className="text-[9px] text-slate-450 mt-0.5">Tərtib tarixi: {generatedReport.date} | Sistem Versiyası: Enterprise v3.8</p>
              </div>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1">REAL-VAXT VERISİ</span>
            </div>

            {/* Financial indicators table preview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2">
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold block">Uğurlu Sifariş</span>
                <p className="text-sm font-black text-slate-850 mt-0.5">{generatedReport.metrics.deliveredCount} ədəd</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold block">Ümumi Gəlir</span>
                <p className="text-sm font-black text-indigo-700 mt-0.5">{formatCurrency(generatedReport.metrics.revenue)}</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold block">COGS Maya Yükü</span>
                <p className="text-sm font-black text-slate-800 mt-0.5">{formatCurrency(generatedReport.metrics.cogs)}</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100">
                <span className="text-[9px] text-slate-400 font-bold block">Təmiz Qazanc</span>
                <p className="text-sm font-black text-emerald-600 mt-0.5">{formatCurrency(generatedReport.metrics.netProfit)}</p>
              </div>
            </div>

            {/* Top performing products preview */}
            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-100">
              <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Top Satış Məhsulları Preview</span>
              <div className="divide-y divide-slate-100 text-[11px]">
                {generatedReport.abc.map((p: any, idx: number) => (
                  <div key={idx} className="py-1.5 flex justify-between">
                    <span className="text-slate-800 font-medium">{p.name}</span>
                    <span className="font-mono text-slate-600">Satılıb: {p.qtySold} ədəd | {formatCurrency(p.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI recommendation in Print documents */}
            <div className="bg-violet-50/50 border border-violet-100/50 p-4 rounded-xl space-y-1 text-xs text-violet-900 font-sans">
              <span className="font-extrabold text-violet-950 flex items-center gap-1"><Sparkles className="w-4 h-4 text-violet-600" /> AI İdarəetmə Tövsiyə Şərhləri:</span>
              <ul className="space-y-1.5 italic font-medium text-slate-650 pt-1">
                {generatedReport.recommendations.map((rec: string, idx: number) => (
                  <li key={idx}>• {rec}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Document export menu controls */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={exportAsCsv}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 transition-all rounded-xl text-xs font-semibold text-slate-800 flex items-center space-x-1.5"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>CSV Karta yüklə</span>
            </button>
            <button
              onClick={exportAsJson}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 transition-all rounded-xl text-xs font-semibold text-slate-800 flex items-center space-x-1.5"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>JSON Karta yüklə</span>
            </button>
            <button
              onClick={triggerPrintPdf}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 transition-all rounded-xl text-xs font-semibold text-white flex items-center space-x-1.5 ml-auto shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>PDF Çıxart / Çap Et</span>
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
