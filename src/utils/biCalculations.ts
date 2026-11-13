import { Sale, Expense, Product, Customer } from "../types";

export interface PeriodMetrics {
  revenue: number; // Delivered totalAmount
  productRevenue: number; // Delivered totalProductPrice
  cogs: number; // Cost of sold products
  grossProfit: number; // productRevenue - cogs
  deliveryCost: number; // cost paid to courier/cargo
  otherExpenses: number; // non-delivery expenses in period
  totalExpenses: number; // cogs + deliveryCost + otherExpenses
  netProfit: number; // revenue - totalExpenses
  profitMargin: number; // (netProfit / revenue) * 100
  deliveredCount: number;
  cancelledCount: number;
  pendingCount: number;
  successRate: number; // delivered / (delivered + cancelled) * 100
  cancellationRate: number; // cancelled / (delivered + cancelled) * 100
  orderCount: number; // total orders
  aov: number; // average order value (revenue / deliveredCount)
  activeCustomersCount: number; // unique phones of customers in delivered orders
  newCustomersCount: number; // created within period
  repeatCustomersCount: number; // customers with more than 1 delivered order
  totalItemsSold: number;
}

// Convert a date string/Date to UTC beginning of day for robust comparisons
export function getStartOfDay(date: string | Date | number): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseSafeDate(d: any): number {
  if (!d) return 0;
  if (typeof d.toDate === "function") {
    try {
      return d.toDate().getTime();
    } catch (_) {}
  }
  const parsed = new Date(d).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export function filterByDateRange<T extends { createdAt?: any; date?: any }>(
  items: T[],
  start: Date,
  end: Date
): T[] {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return items.filter((item) => {
    const timeVal = item.createdAt || item.date;
    if (!timeVal) return false;
    const itemTime = parseSafeDate(timeVal);
    return itemTime >= startTime && itemTime <= endTime;
  });
}

// Strictly calculates metrics for any given date range
export function getPeriodMetrics(
  sales: Sale[],
  expenses: Expense[],
  products: Product[],
  customers: Customer[],
  start: Date,
  end: Date
): PeriodMetrics {
  const startTime = start.getTime();
  const endTime = end.getTime();

  // Gəlir hesabatı üçün: delivery_date üzrə filtrə
  const deliveredInPeriod = sales.filter((s) => {
    if (s.status !== "çatdırılıb") return false;
    const reportDate = s.delivery_date || s.deliveredAt || s.createdAt;
    if (!reportDate) return false;
    const t = parseSafeDate(reportDate);
    return t >= startTime && t <= endTime;
  });

  // Sifariş sayı üçün: order_date üzrə filtrə
  const ordersInPeriod = sales.filter((s) => {
    const trackDate = s.order_date || s.order_created_at || s.createdAt;
    if (!trackDate) return false;
    const t = parseSafeDate(trackDate);
    return t >= startTime && t <= endTime;
  });

  // Xərcləri tarix üzrə filtrə
  const periodExpenses = expenses.filter((e) => {
    const t = parseSafeDate(e.date);
    return t >= startTime && t <= endTime;
  });

  const delivered = deliveredInPeriod;
  const cancelled = ordersInPeriod.filter((s) => s.status === "ləğv edilib");
  const pending = ordersInPeriod.filter((s) => s.status === "gözləyir");

  const revenue = delivered.reduce((sum, s) => sum + s.totalAmount, 0);
  const productRevenue = delivered.reduce((sum, s) => sum + s.totalProductPrice, 0);
  const deliveryCost = delivered.reduce((sum, s) => sum + s.deliveryCost, 0);

  // COGS computation
  let cogs = 0;
  let totalItemsSold = 0;
  delivered.forEach((sale) => {
    sale.items.forEach((item) => {
      totalItemsSold += item.qty;
      const prod = products.find((p) => p.id === item.productId);
      const cost = prod?.costPrice ?? prod?.price * 0.4 ?? item.unitPrice * 0.4;
      cogs += item.qty * cost;
    });
  });

  const grossProfit = productRevenue - cogs;

  // Other Expenses: expenses with source === "manual" (or non-delivery) within this period
  const otherExpenses = periodExpenses
    .filter((e) => e.source === "manual")
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpenses = cogs + deliveryCost + otherExpenses;
  const netProfit = revenue - totalExpenses;
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const totalClosed = delivered.length + cancelled.length;
  const successRate = totalClosed > 0 ? (delivered.length / totalClosed) * 100 : 100;
  const cancellationRate = totalClosed > 0 ? (cancelled.length / totalClosed) * 100 : 0;

  const aov = delivered.length > 0 ? revenue / delivered.length : 0;

  // Customers in delivered orders
  const activePhones = new Set(delivered.map((s) => s.customerPhone));
  const activeCustomersCount = activePhones.size;

  // New customers in period
  const newCustomersCount = customers.filter((c) => {
    const created = parseSafeDate(c.createdAt);
    return created >= startTime && created <= endTime;
  }).length;

  // Repeat purchasing customers
  const repeatCustomersCount = customers.filter((c) => c.orderCount > 1).length;

  return {
    revenue,
    productRevenue,
    cogs,
    grossProfit,
    deliveryCost,
    otherExpenses,
    totalExpenses,
    netProfit,
    profitMargin,
    deliveredCount: delivered.length,
    cancelledCount: cancelled.length,
    pendingCount: pending.length,
    successRate,
    cancellationRate,
    orderCount: ordersInPeriod.length,
    aov,
    activeCustomersCount,
    newCustomersCount,
    repeatCustomersCount,
    totalItemsSold,
  };
}

// Return comparative metrics and change percentages
export function getComparativeMetrics(
  sales: Sale[],
  expenses: Expense[],
  products: Product[],
  customers: Customer[],
  range: "today" | "yesterday" | "7db" | "30db" | "this_month" | "prev_month" | "this_year" | "prev_year" | "legacy"
): { current: PeriodMetrics; previous: PeriodMetrics; labels: { current: string; previous: string } } {
  const now = new Date();
  let currentStart = new Date();
  let currentEnd = new Date();
  let prevStart = new Date();
  let prevEnd = new Date();

  let labelCurrent = "Seçilmiş dövr";
  let labelPrevious = "Əvvəlki dövr";

  switch (range) {
    case "today":
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setHours(23, 59, 59, 999);
      prevStart.setDate(prevStart.getDate() - 1);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevEnd.setHours(23, 59, 59, 999);
      labelCurrent = "Bu gün";
      labelPrevious = "Dünən";
      break;

    case "yesterday":
      currentStart.setDate(currentStart.getDate() - 1);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setDate(currentEnd.getDate() - 1);
      currentEnd.setHours(23, 59, 59, 999);
      prevStart.setDate(prevStart.getDate() - 2);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(prevEnd.getDate() - 2);
      prevEnd.setHours(23, 59, 59, 999);
      labelCurrent = "Dünən";
      labelPrevious = "Srağagün";
      break;

    case "7db":
      currentStart.setDate(currentStart.getDate() - 7);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setHours(23, 59, 59, 999);
      prevStart.setDate(prevStart.getDate() - 14);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(prevEnd.getDate() - 7);
      prevEnd.setHours(0, 0, 0, 0);
      labelCurrent = "Son 7 gün";
      labelPrevious = "Əvvəlki 7 gün";
      break;

    case "30db":
      currentStart.setDate(currentStart.getDate() - 30);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd.setHours(23, 59, 59, 999);
      prevStart.setDate(prevStart.getDate() - 60);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(prevEnd.getDate() - 30);
      prevEnd.setHours(0, 0, 0, 0);
      labelCurrent = "Son 30 gün";
      labelPrevious = "Əvvəlki 30 gün";
      break;

    case "this_month":
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      labelCurrent = "Bu ay";
      labelPrevious = "Öncəki ay";
      break;

    case "prev_month":
      currentStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
      labelCurrent = "Öncəki ay";
      labelPrevious = "2 ay əvvəl";
      break;

    case "this_year":
      currentStart = new Date(now.getFullYear(), 0, 1);
      currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      labelCurrent = "Bu il";
      labelPrevious = "Öncəki il";
      break;

    case "prev_year":
      currentStart = new Date(now.getFullYear() - 1, 0, 1);
      currentEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear() - 2, 0, 1);
      prevEnd = new Date(now.getFullYear() - 2, 11, 31, 23, 59, 59, 999);
      labelCurrent = "Öncəki il";
      labelPrevious = "2 il əvvəl";
      break;

    default: // All Time
      currentStart = new Date(currentStart.getFullYear() - 5, 0, 1);
      labelCurrent = "Ümumi";
      labelPrevious = "N/A";
  }

  const current = getPeriodMetrics(sales, expenses, products, customers, currentStart, currentEnd);
  const previous = getPeriodMetrics(sales, expenses, products, customers, prevStart, prevEnd);

  return { current, previous, labels: { current: labelCurrent, previous: labelPrevious } };
}

// ABC Analysis Implementation over Products
export interface AbcProductItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  qtySold: number;
  revenue: number;
  profit: number;
  share: number;
  cumulativeShare: number;
  abcClass: "A" | "B" | "C";
}

export function performAbcAnalysis(sales: Sale[], products: Product[]): AbcProductItem[] {
  // 1. Gather sales metrics for all products
  const productStats: Record<string, { qty: number; revenue: number; profit: number }> = {};

  const deliveredSales = sales.filter((s) => s.status === "çatdırılıb");

  deliveredSales.forEach((sale) => {
    sale.items.forEach((item) => {
      if (!productStats[item.productId]) {
        productStats[item.productId] = { qty: 0, revenue: 0, profit: 0 };
      }
      const stats = productStats[item.productId];
      stats.qty += item.qty;
      stats.revenue += item.total;

      const prod = products.find((p) => p.id === item.productId);
      const cost = prod?.costPrice ?? prod?.price * 0.4 ?? item.unitPrice * 0.4;
      const itemCogs = item.qty * cost;
      stats.profit += item.total - itemCogs;
    });
  });

  // Calculate global total product revenue
  const totalRev = Object.values(productStats).reduce((sum, s) => sum + s.revenue, 0);

  // Structure all active/inactive inventory items
  let list: AbcProductItem[] = products.map((p) => {
    const stats = productStats[p.id] || { qty: 0, revenue: 0, profit: 0 };
    const share = totalRev > 0 ? (stats.revenue / totalRev) * 100 : 0;
    return {
      id: p.id,
      name: p.name,
      sku: p.SKU,
      category: p.category,
      qtySold: stats.qty,
      revenue: stats.revenue,
      profit: stats.profit,
      share: share,
      cumulativeShare: 0,
      abcClass: "C",
    };
  });

  // Sort by revenue descending
  list.sort((a, b) => b.revenue - a.revenue);

  // Compute cumulative values and assign ABC classes
  // Class A: Top 80% cumulative
  // Class B: Next 15% (80% - 95% cumulative)
  // Class C: Bottom 5% or zero sales (95% - 100% cumulative)
  let cumulative = 0;
  list = list.map((item) => {
    cumulative += item.share;
    let cls: "A" | "B" | "C" = "C";
    if (cumulative <= 80 || item.share >= 20) {
      cls = "A";
    } else if (cumulative <= 95) {
      cls = "B";
    } else {
      cls = "C";
    }
    return {
      ...item,
      cumulativeShare: cumulative,
      abcClass: cls,
    };
  });

  return list;
}

// Normalization helper for direct matching of phone numbers
function normalizePhone(num: string | undefined): string {
  if (!num) return "";
  const cleaned = num.replace(/\D/g, ""); // keep only digits
  // If it starts with 994, strip it
  if (cleaned.startsWith("994")) {
    return cleaned.slice(3);
  }
  // If it starts with 0, strip it
  if (cleaned.startsWith("0")) {
    return cleaned.slice(1);
  }
  return cleaned;
}

// Segmentation for Customer Base
export interface CustomerSegmentItem {
  id: string;
  name: string;
  phone: string;
  city: string;
  region: string;
  totalOrders: number;
  totalSpent: number;
  clv: number; // Customer Lifetime Value (Spent + estimated value)
  lastOrderDays: number;
  segment: "VIP" | "Aktiv" | "Riskli" | "İtirilmiş";
}

export function performCustomerSegmentation(customers: Customer[], sales: Sale[]): CustomerSegmentItem[] {
  const now = new Date().getTime();

  // Create a record for each customer
  const customerDeliveredMap: Record<string, { lastDate?: string; count: number; total: number }> = {};
  
  // Pre-initialize for all existing customers
  customers.forEach((c) => {
    customerDeliveredMap[c.id] = { count: 0, total: 0 };
  });

  const normalizedCustPhones = customers.map((c) => ({
    id: c.id,
    phoneNorm: normalizePhone(c.phone)
  })).filter((x) => x.phoneNorm.length > 0);

  // Group real delivered sales
  sales
    .filter((s) => s.status === "çatdırılıb")
    .forEach((s) => {
      let cId = s.customerId;
      
      // If customerId is not found/not matched, try matching by phone number
      if (!cId || !customerDeliveredMap[cId]) {
        const sPhoneNorm = normalizePhone(s.customerPhone);
        const match = normalizedCustPhones.find((p) => p.phoneNorm === sPhoneNorm);
        if (match) {
          cId = match.id;
        }
      }

      if (cId && customerDeliveredMap[cId]) {
        const entry = customerDeliveredMap[cId];
        entry.count += 1;
        entry.total += s.totalAmount;
        if (!entry.lastDate || new Date(s.createdAt).getTime() > new Date(entry.lastDate).getTime()) {
          entry.lastDate = s.createdAt;
        }
      }
    });

  return customers.map((c) => {
    const sDetail = customerDeliveredMap[c.id] || { count: 0, total: 0 };
    const lastDateVal = sDetail.lastDate || c.createdAt;
    const daysSinceLast = Math.max(0, Math.floor((now - new Date(lastDateVal).getTime()) / (1000 * 60 * 60 * 24)));

    // STRICT RE-CALCULATION SEGMENTATION
    // Let's use computed totalSpent and totalOrders from actual delivered sales (sDetail)
    // rather than the cached c.totalSpent/c.orderCount which might be stale or incorrect.
    const actualSpent = sDetail.total;
    const actualOrders = sDetail.count;

    let segment: "VIP" | "Aktiv" | "Riskli" | "İtirilmiş" = "Aktiv";

    if (actualSpent >= 800 || c.isVIP || actualOrders >= 8) {
      segment = "VIP";
    } else if (daysSinceLast > 90 || actualOrders === 0) {
      segment = "İtirilmiş";
    } else if (daysSinceLast > 45) {
      segment = "Riskli";
    } else {
      segment = "Aktiv";
    }

    // CLV = totalSpent * repeat purchasing multiplier (VIP gets higher multiplier)
    const multiplier = segment === "VIP" ? 1.4 : segment === "Aktiv" ? 1.25 : 1.0;
    const clv = actualSpent * multiplier;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone || "Telefon qeyd edilməyib",
      city: c.city || "Bakı",
      region: c.region || "Mərkəz",
      totalOrders: actualOrders,
      totalSpent: actualSpent,
      clv,
      lastOrderDays: daysSinceLast,
      segment,
    };
  });
}

// Location analysis groupings
export interface LocationMetric {
  name: string;
  orderCount: number;
  revenue: number;
  deliveryCost: number;
  cancellationRate: number;
}

export function performLocationAnalysis(sales: Sale[]): LocationMetric[] {
  const map: Record<string, { orderCount: number; deliveredCount: number; revenue: number; deliveryCost: number; cancelledCount: number }> = {};

  sales.forEach((s) => {
    // Attempt parsing city/region from address or custom fields
    let loc = "Bakı";
    const cleanAddress = s.address.toLowerCase();
    if (cleanAddress.includes("sumqayıt") || cleanAddress.includes("sumqayit")) loc = "Sumqayıt";
    else if (cleanAddress.includes("gəncə") || cleanAddress.includes("gence")) loc = "Gəncə";
    else if (cleanAddress.includes("naxçıvan") || cleanAddress.includes("naxcivan")) loc = "Naxçıvan";
    else if (cleanAddress.includes("xırdalan") || cleanAddress.includes("xirdalan")) loc = "Xırdalan";
    else if (cleanAddress.includes("şəki") || cleanAddress.includes("seki")) loc = "Şəki";
    else if (cleanAddress.includes("lənkəran") || cleanAddress.includes("lenkeran")) loc = "Lənkəran";
    else if (cleanAddress.includes("quba")) loc = "Quba";
    else if (cleanAddress.includes("mingəçevir")) loc = "Mingəçevir";
    else if (cleanAddress.includes("abşeron") || cleanAddress.includes("abseron")) loc = "Abşeron";
    else {
      // Find matches
      const splitArr = s.address.split(",");
      if (splitArr.length > 0 && splitArr[0].trim().length > 1) {
        loc = splitArr[0].trim();
        // keep it simple, cap words
        loc = loc.charAt(0).toUpperCase() + loc.slice(1).toLowerCase();
      }
    }

    if (!map[loc]) {
      map[loc] = { orderCount: 0, deliveredCount: 0, revenue: 0, deliveryCost: 0, cancelledCount: 0 };
    }

    const m = map[loc];
    m.orderCount++;
    if (s.status === "çatdırılıb") {
      m.deliveredCount++;
      m.revenue += s.totalAmount;
      m.deliveryCost += s.deliveryCost;
    } else if (s.status === "ləğv edilib") {
      m.cancelledCount++;
    }
  });

  return Object.entries(map).map(([name, m]) => {
    const totalClosed = m.deliveredCount + m.cancelledCount;
    const cancellationRate = totalClosed > 0 ? (m.cancelledCount / totalClosed) * 100 : 0;
    return {
      name,
      orderCount: m.orderCount,
      revenue: m.revenue,
      deliveryCost: m.deliveryCost,
      cancellationRate,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

// Moving Average Forecasting Engine
export interface ForecastItem {
  date: string;
  historical: number | null;
  forecasted: number | null;
}

export function performForecasting(sales: Sale[], daysToForecast: number = 30): ForecastItem[] {
  // Aggregate daily delivered sales for the past 60 days
  const deliveredSales = sales.filter((s) => s.status === "çatdırılıb");
  const pastDaysMap: Record<string, number> = {};

  // Find range
  const today = new Date();
  const pastLimit = new Date();
  pastLimit.setDate(today.getDate() - 60);

  // Pre-populate daily spots
  for (let i = 60; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split("T")[0];
    pastDaysMap[key] = 0;
  }

  deliveredSales.forEach((s) => {
    const key = (s.delivery_date || s.deliveredAt || s.createdAt).split("T")[0];
    if (pastDaysMap[key] !== undefined) {
      pastDaysMap[key] += s.totalAmount;
    }
  });

  const sortedHistorical = Object.entries(pastDaysMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, revenue]) => ({ date, revenue }));

  // Calculate linear trend: y = mx + b
  const n = sortedHistorical.length;
  if (n === 0) return [];

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  sortedHistorical.forEach((item, index) => {
    sumX += index;
    sumY += item.revenue;
    sumXY += index * item.revenue;
    sumXX += index * index;
  });

  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = (sumY - slope * sumX) / n;

  // Compile final array with both historical and forecasted
  const result: ForecastItem[] = sortedHistorical.map((item) => ({
    date: item.date,
    historical: item.revenue,
    forecasted: null,
  }));

  // Append forecasted days
  for (let i = 1; i <= daysToForecast; i++) {
    const fDate = new Date();
    fDate.setDate(today.getDate() + i);
    const key = fDate.toISOString().split("T")[0];

    // Predict using linear trend + mild sinusoidal seasonality
    const x = n + i - 1;
    // adding seasonality based on day of week (sine wave)
    const dayOfWeek = fDate.getDay();
    const seasonalityMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 1.2 : 0.95; // weekends are typically higher
    const linearPrediction = slope * x + intercept;

    // bounded lower limit to 0
    const forecasted = Math.max(0, linearPrediction * seasonalityMultiplier * (0.95 + Math.random() * 0.1));

    result.push({
      date: key,
      historical: null,
      forecasted: Math.round(forecasted * 100) / 100,
    });
  }

  return result;
}
