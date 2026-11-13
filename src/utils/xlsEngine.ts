import * as XLSX from "xlsx-js-style";
import { Sale, Expense, Product, Courier, Customer } from "../types";
import { getOrderReportingDate, getOrderReportingDateYMD, formatToBakuYMD, getBakuTodayYMD } from "./orderFormatter";

// Format currency as AZN ₼ (for browser UI display fallback)
export const formatCurrency = (amount: number, currency = "₼") => {
  return `${amount.toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};

// Format date as DD.MM.YYYY in Asia/Baku timezone
export const formatDateAZ = (isoString: string) => {
  if (!isoString) return "—";
  try {
    const ymd = formatToBakuYMD(isoString);
    if (!ymd || ymd.length < 10) return isoString;
    const parts = ymd.split("-");
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return isoString;
  } catch {
    return isoString;
  }
};

export const exportToExcel = (
  data: {
    sales: Sale[];
    expenses: Expense[];
    products: Product[];
    couriers: Courier[];
    customers: Customer[];
  },
  options: {
    sheetSelections: {
      sales: boolean;
      expenses: boolean;
      products: boolean;
      couriers: boolean;
      customers: boolean;
    };
    dateRange?: { start: string; end: string } | null;
  }
) => {
  const wb = XLSX.utils.book_new();

  // Get current date formatted as DD.MM.YYYY
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const todayStr = `${day}.${month}.${year}`;

  let { sales, expenses, products, couriers, customers } = data;
  
  // Filter lists based on date range if specified (optional date filter)
  if (options.dateRange) {
    const { start, end } = options.dateRange;
    if (start) {
      sales = sales.filter(s => getOrderReportingDateYMD(s) >= start);
      expenses = expenses.filter(e => formatToBakuYMD(e.date) >= start);
      customers = customers.filter(c => formatToBakuYMD(c.createdAt) >= start);
    }
    if (end) {
      sales = sales.filter(s => getOrderReportingDateYMD(s) <= end);
      expenses = expenses.filter(e => formatToBakuYMD(e.date) <= end);
      customers = customers.filter(c => formatToBakuYMD(c.createdAt) <= end);
    }
  }

  // 1. Sales Sheet (Sifarişlər)
  if (options.sheetSelections.sales) {
    const salesRows = sales.flatMap((sale) => {
      const isCancelled = sale.status === "ləğv edilib";

      return sale.items.map((item) => ({
        "Tarix": formatDateAZ(getOrderReportingDate(sale)),
        "Müştəri Adı": sale.customerName,
        "Telefon": sale.customerPhone,
        "Ünvan": sale.address,
        "Məhsul": item.productName,
        "Miqdar": item.qty,
        "Vahid Qiymət": item.unitPrice || 0,
        "Çatdırılma Xərci": isCancelled ? 0 : sale.deliveryCost,
        "Yekun Məbləğ": isCancelled ? 0 : sale.totalAmount,
        "Xalis Gəlir": isCancelled ? 0 : sale.netRevenue,
        "Çatdırılma Növü": sale.deliveryType === "cargo" ? (sale.cargoCompany === "Expargo" ? "Expargo" : "Kargo") : (sale.deliveryType === "expargo" ? "Expargo" : (sale.deliveryType === "Azərpoçt" ? "Azərpoçt" : "Kuryer")),
        "Kuryer": sale.deliveryType === "courier" ? (sale.courierName || "—") : (sale.cargoCompany || "—"),
        "Status": sale.status,
        "Qeydlər": sale.notes || ""
      }));
    });

    const wsSales = XLSX.utils.json_to_sheet(salesRows);
    styleSheet(wsSales);
    XLSX.utils.book_append_sheet(wb, wsSales, "Sifarişlər");
  }

  // 2. Expenses Sheet (Xərclər)
  if (options.sheetSelections.expenses) {
    const expensesRows = expenses.map(exp => ({
      "Tarix": formatDateAZ(exp.date),
      "Xərcin Adı": exp.name,
      "Məbləğ": exp.amount,
      "Kateqoriya": exp.category,
      "Növ (Avtomatik/Manuel)": exp.source === "auto_delivery" ? "Avtomatik" : "Manuel",
      "Qeydlər": exp.notes || ""
    }));

    const wsExpenses = XLSX.utils.json_to_sheet(expensesRows);
    styleSheet(wsExpenses);
    XLSX.utils.book_append_sheet(wb, wsExpenses, "Xərclər");
  }

  // 3. Products Sheet (Məhsullar)
  if (options.sheetSelections.products) {
    const productsRows = products.map(prod => {
      const totalUnitsSold = sales
        .filter(s => s.status === "çatdırılıb")
        .reduce((acc, s) => {
          const matchingItem = s.items.find(i => i.productId === prod.id);
          return acc + (matchingItem ? matchingItem.qty : 0);
        }, 0);

      return {
        "Ad": prod.name,
        "SKU": prod.SKU,
        "Kateqoriya": prod.category,
        "Stok": prod.stock,
        "Satış Qiyməti": prod.price,
        "Alış Qiyməti": prod.costPrice,
        "Ümumi Satış": totalUnitsSold
      };
    });

    const wsProducts = XLSX.utils.json_to_sheet(productsRows);
    styleSheet(wsProducts);
    XLSX.utils.book_append_sheet(wb, wsProducts, "Məhsullar");
  }

  // 4. Couriers Sheet (Kuryerlər)
  if (options.sheetSelections.couriers) {
    const couriersRows = couriers.map(c => ({
      "Ad": c.name,
      "Telefon": c.phone,
      "Status": c.status === "active" ? "Aktiv" : "Deaktiv",
      "Stok": c.stockBalance,
      "Standart Haqqı": c.standardDeliveryFee,
      "Çatdırılma sayı": c.totalDeliveries,
      "Qazanc": c.totalEarnings
    }));

    const wsCouriers = XLSX.utils.json_to_sheet(couriersRows);
    styleSheet(wsCouriers);
    XLSX.utils.book_append_sheet(wb, wsCouriers, "Kuryerlər");
  }

  // 5. Customers Sheet (Müştərilər)
  if (options.sheetSelections.customers) {
    const customersRows = customers.map(c => ({
      "Ad": c.name,
      "Telefon": c.phone,
      "Qeydiyyat": formatDateAZ(c.createdAt),
      "Sifariş sayı": c.orderCount,
      "Ümumi Xərclənən": c.totalSpent,
      "VIP": c.isVIP ? "VIP" : "Standart",
      "İlk Sifariş": formatDateAZ(c.firstOrderDate || ""),
      "Son Sifariş": formatDateAZ(c.lastOrderDate || "")
    }));

    const wsCustomers = XLSX.utils.json_to_sheet(customersRows);
    styleSheet(wsCustomers);
    XLSX.utils.book_append_sheet(wb, wsCustomers, "Müştərilər");
  }

  // File name: Ayvelin_Məlumatlar_DD.MM.YYYY.xlsx
  XLSX.writeFile(wb, `Ayvelin_Məlumatlar_${todayStr}.xlsx`);
};

// Generates an empty model workbook for template downloads matching import structure
export const downloadTemplate = () => {
  const wb = XLSX.utils.book_new();

  // Reference Column Sequence
  const emptySales = [
    {
      "Tarix": "29.05.2026",
      "Müştəri Adı": "Elman Məmmədov",
      "Telefon": "0503332211",
      "Ünvan": "Nizami küçəsi 41, Bakı",
      "Məhsul": "Klassik Ağ Köynək",
      "Miqdar": 2,
      "Vahid Qiymət": 45,
      "Çatdırılma Xərci": 5,
      "Yekun Məbləğ": 95,
      "Xalis Gəlir": 85,
      "Çatdırılma Növü": "Kuryer",
      "Kuryer": "Kamran Səlimov",
      "Status": "gözləyir",
      "Qeydlər": "Təcili çatdırılma"
    }
  ];
  const wsSales = XLSX.utils.json_to_sheet(emptySales);
  styleSheet(wsSales);
  XLSX.utils.book_append_sheet(wb, wsSales, "Sifarişlər");

  const emptyExpenses = [
    {
      "Tarix": "29.05.2026",
      "Xərcin Adı": "Instagram Reklamı May qrupu",
      "Məbləğ": 150,
      "Kateqoriya": "Reklam",
      "Növ (Avtomatik/Manuel)": "Manuel",
      "Qeydlər": "Aylıq hədəf kütlə reklamı"
    }
  ];
  const wsExp = XLSX.utils.json_to_sheet(emptyExpenses);
  styleSheet(wsExp);
  XLSX.utils.book_append_sheet(wb, wsExp, "Xərclər");

  const emptyProd = [
    {
      "Ad": "Klassik Ağ Köynək",
      "SKU": "K-AK-01",
      "Kateqoriya": "Geyim",
      "Stok": 40,
      "Satış Qiyməti": 45,
      "Alış Qiyməti": 18,
      "Ümumi Satış": 0
    }
  ];
  const wsProd = XLSX.utils.json_to_sheet(emptyProd);
  styleSheet(wsProd);
  XLSX.utils.book_append_sheet(wb, wsProd, "Məhsullar");

  XLSX.writeFile(wb, "Ayvelin_Şablon_Yüklə.xlsx");
};

// Simple column auto-sizing and workbook decoration helper
function styleSheet(ws: XLSX.WorkSheet) {
  if (!ws["!ref"]) return;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  
  // Set freeze pane at row 2 so header row (row 1) is frozen
  ws['!views'] = [{ state: 'frozen', ySplit: 1, xSplit: 0, topLeftCell: 'A2', activePane: 'bottomLeft' }];

  // Auto column width calculation
  const cols = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = 12;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.v !== undefined) {
        maxLen = Math.max(maxLen, String(cell.v).length);
      }
    }
    cols.push({ wch: maxLen + 4 });
  }
  ws["!cols"] = cols;

  const headers: string[] = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
    headers.push(headerCell ? String(headerCell.v) : "");
  }

  // Iterate cell values and inject custom style objects for xlsx-js-style
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[address];
      if (!cell) continue;

      if (R === 0) {
        // Headers: Bold, white text, dark blue `#1E3A5F` background, centered
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, name: "Inter", sz: 10 },
          fill: { patternType: "solid", fgColor: { rgb: "1E3A5F" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            bottom: { style: "medium", color: { rgb: "020617" } },
            right: { style: "thin", color: { rgb: "1E293B" } }
          }
        };
      } else {
        // Data row styling with alternating (zebra) backgrounds
        const isAlternate = R % 2 === 0;
        cell.s = {
          font: { name: "Inter", sz: 10, color: { rgb: "1E293B" } },
          fill: isAlternate ? { patternType: "solid", fgColor: { rgb: "F8FAFC" } } : undefined,
          alignment: { vertical: "center" },
          border: {
            bottom: { style: "thin", color: { rgb: "F1F5F9" } },
            right: { style: "thin", color: { rgb: "F1F5F9" } }
          }
        };

        const headerName = headers[C];

        // Format currency fields as numbers with custom Excel currency mask
        const currencyHeaders = [
          "Vahid Qiymət",
          "Çatdırılma Xərci",
          "Yekun Məbləğ",
          "Xalis Gəlir",
          "Məbləğ",
          "Satış Qiyməti",
          "Alış Qiyməti",
          "Standart Haqqı",
          "Qazanc",
          "Ümumi Xərclənən"
        ];
        
        if (currencyHeaders.includes(headerName)) {
          if (typeof cell.v === "number") {
            cell.t = "n";
            cell.z = '#,##0.00 "₼"';
            cell.s.alignment = { horizontal: "right", vertical: "center" };
          }
        }

        // Highlight status values
        if (headerName === "Status") {
          const val = String(cell.v).toLowerCase().trim();
          cell.s.font = cell.s.font || {};
          cell.s.font.bold = true;
          if (val === "çatdırılıb" || val === "aktif" || val === "active" || val === "aktiv" || val === "çatdırıldı") {
            cell.s.font.color = { rgb: "15803D" }; // Green
          } else if (val === "gözləyir" || val === "pending") {
            cell.s.font.color = { rgb: "B45309" }; // Orange/Amber
          } else if (val === "ləğv edilib" || val === "cancelled" || val === "ləğv" || val === "deaktiv") {
            cell.s.font.color = { rgb: "B91C1C" }; // Red
          }
        }
      }
    }
  }
}
