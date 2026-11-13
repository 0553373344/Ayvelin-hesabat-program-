import { Firestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import fs from "fs";
import path from "path";
import cron from "node-cron";

// Define the shape of data we query from Firestore to make the TypeScript compiler happy
interface StatusHistoryItem {
  status: "gözləyir" | "çatdırılıb" | "ləğv edilib";
  changedAt: string;
}

interface SaleItem {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Sale {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  items: SaleItem[];
  totalAmount: number;
  deliveryCost: number;
  status: "gözləyir" | "çatdırılıb" | "ləğv edilib";
  createdAt: string;
  statusHistory?: StatusHistoryItem[];
  delivery_date?: any;
  deliveredAt?: string;
  order_created_at?: string;
}

interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  createdAt: string;
  date?: string;
}

/**
 * File logger helper
 */
export function logMessage(msg: string) {
  const now = new Date();
  let bakuLogTime = now.toISOString();
  try {
    bakuLogTime = now.toLocaleString("az-AZ", { timeZone: "Asia/Baku" });
  } catch (_) {}

  const formattedMsg = `[${bakuLogTime}] ${msg}\n`;
  console.log(formattedMsg.trim());

  try {
    const logFilePath = path.join(process.cwd(), "report_scheduler.log");
    fs.appendFileSync(logFilePath, formattedMsg, "utf-8");
  } catch (err) {
    console.error("Failed to append to log file:", err);
  }
}

/**
 * HTML Escaper to prevent Telegram parsing errors
 */
function escapeHTML(text: any): string {
  if (text === undefined || text === null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Helper to get date components and string in Asia/Baku timezone
 */
export function getBakuNow() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(now);
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
    hour: parseInt(partMap.hour, 10),
    minute: parseInt(partMap.minute, 10),
    second: parseInt(partMap.second, 10),
    dateStr: `${partMap.year}-${partMap.month}-${partMap.day}`, // YYYY-MM-DD
    displayDate: `${partMap.day}.${partMap.month}.${partMap.year}` // DD.MM.YYYY
  };
}

/**
 * Converts ISO string (UTC) to Baku Date string (YYYY-MM-DD)
 */
function getBakuDateStrFromISO(isoStr: string | undefined): string {
  if (!isoStr) return "";
  try {
    const date = new Date(isoStr);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(date);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${partMap.year}-${partMap.month}-${partMap.day}`;
  } catch (_) {
    return isoStr.split("T")[0]; // fallback
  }
}

/**
 * Coerces date values (String or Timestamp) to ISO string
 */
function getISOString(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val.toDate === "function") return val.toDate().toISOString();
  if (val.seconds) return new Date(val.seconds * 1000).toISOString();
  return "";
}

/**
 * Determines reporting Date Str for Sales under timezone Asia/Baku
 */
function getReportingBakuDateStr(sale: Sale): string {
  if (sale.status === "çatdırılıb") {
    const delDate = sale.delivery_date || sale.deliveredAt;
    if (delDate) {
      return getBakuDateStrFromISO(getISOString(delDate));
    }
  }
  return getBakuDateStrFromISO(getISOString(sale.createdAt || sale.order_created_at));
}

/**
 * Calculate yesterday's Baku date string
 */
function getBakuYesterdayDateString(todayStr: string): string {
  const date = new Date(`${todayStr}T12:00:00+04:00`);
  date.setDate(date.getDate() - 1);
  return getBakuDateStrFromISO(date.toISOString());
}

/**
 * Splits message into Telegram-bound chunks of <= 4000 chars without breaking HTML tags
 */
function chunkMessage(text: string): string[] {
  const maxChunkSize = 4000;
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const lines = text.split("\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    if ((currentChunk + "\n" + line).length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n" + line : line;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * Sends messages with retry mechanism (3 attempts)
 */
async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<boolean> {
  const chunks = chunkMessage(text);
  logMessage(`[Telegram] Sending message in ${chunks.length} part(s)...`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let success = false;
    let attempts = 0;

    while (!success && attempts < 3) {
      attempts++;
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: "HTML"
          })
        });

        const data = await response.json();
        if (response.ok && data.ok) {
          success = true;
          logMessage(`[Telegram] Part ${i + 1}/${chunks.length} sent successfully on attempt ${attempts}.`);
        } else {
          logMessage(`[Telegram Error] Attempt ${attempts} failed. Code: ${response.status}, Detail: ${JSON.stringify(data)}`);
          if (attempts < 3) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
        }
      } catch (err: any) {
        logMessage(`[Telegram Error] Attempt ${attempts} exception: ${err.message || String(err)}`);
        if (attempts < 3) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }
    }

    if (!success) {
      logMessage(`[Telegram Critical] Failed to send report chunk ${i + 1} after 3 retries.`);
      return false;
    }
  }

  return true;
}

/**
 * Core Daily Report Generator
 */
export async function generateAndSendDailyReport(db: Firestore): Promise<boolean> {
  logMessage("[Daily Report] Gathering data for daily stats report...");

  try {
    const bakuNow = getBakuNow();
    const todayStr = bakuNow.dateStr; // YYYY-MM-DD
    const yesterdayStr = getBakuYesterdayDateString(todayStr); // YYYY-MM-DD
    const currentMonth = todayStr.substring(0, 7); // YYYY-MM

    // Determine Last Month year-month key
    const [year, month] = todayStr.split("-").map(Number);
    const lastMonthYear = month === 1 ? year - 1 : year;
    const lastMonthVal = month === 1 ? 12 : month - 1;
    const lastMonth = `${lastMonthYear}-${String(lastMonthVal).padStart(2, "0")}`;

    logMessage(`[Daily Report] Date mapping: Bugün=${todayStr}, Dünən=${yesterdayStr}, Bu Ay=${currentMonth}, Keçən Ay=${lastMonth}`);

    // Fetch collections
    const salesSnap = await getDocs(collection(db, "sales"));
    const sales: Sale[] = [];
    salesSnap.forEach(docSnap => {
      sales.push({ id: docSnap.id, ...docSnap.data() } as Sale);
    });

    const expensesSnap = await getDocs(collection(db, "expenses"));
    const expenses: Expense[] = [];
    expensesSnap.forEach(docSnap => {
      expenses.push({ id: docSnap.id, ...docSnap.data() } as Expense);
    });

    logMessage(`[Daily Report] Loaded ${sales.length} orders/sales and ${expenses.length} expenses from database.`);

    // --- TODAY'S RESULTS ---
    // Sifariş sayı (Registered today count)
    const todayCreatedSales = sales.filter(s => getBakuDateStrFromISO(getISOString(s.createdAt)) === todayStr);
    const todayOrderCount = todayCreatedSales.length;

    // Məhsul sayı (Sum of all item quantities registered today, excluding cancelled)
    const todayProductCount = todayCreatedSales
      .filter(s => s.status !== "ləğv edilib")
      .reduce((acc, s) => acc + (s.items || []).reduce((sum, item) => sum + item.qty, 0), 0);

    // Günlük satış məbləği (Gross sales of delivered orders today)
    const todayDeliveredSales = sales.filter(s => s.status === "çatdırılıb" && getReportingBakuDateStr(s) === todayStr);
    const todaySalesAmount = todayDeliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

    // Günlük xərc
    function getExpenseBakuDate(exp: Expense): string {
      return getBakuDateStrFromISO(getISOString(exp.date || exp.createdAt));
    }
    const todayExpenses = expenses.filter(e => getExpenseBakuDate(e) === todayStr);
    const todayExpensesAmount = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Günlük gəlir: Sales Amount - Expenses Amount
    const todayProfit = todaySalesAmount - todayExpensesAmount;


    // --- MONTHLY RESULTS ---
    // Bu ay sifariş sayı (Registered this month)
    const thisMonthCreatedSales = sales.filter(s => getBakuDateStrFromISO(getISOString(s.createdAt)).substring(0, 7) === currentMonth);
    const thisMonthOrderCount = thisMonthCreatedSales.length;

    // Bu ay satılan məhsul sayı (sold product count of non-cancelled orders of this month)
    const thisMonthProductCount = thisMonthCreatedSales
      .filter(s => s.status !== "ləğv edilib")
      .reduce((acc, s) => acc + (s.items || []).reduce((sum, item) => sum + item.qty, 0), 0);

    // Bu ay satış məbləği (Delivered this month)
    const thisMonthDeliveredSales = sales.filter(s => s.status === "çatdırılıb" && getReportingBakuDateStr(s).substring(0, 7) === currentMonth);
    const thisMonthSalesAmount = thisMonthDeliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

    // Bu ay xərc
    const thisMonthExpenses = expenses.filter(e => getExpenseBakuDate(e).substring(0, 7) === currentMonth);
    const thisMonthExpensesAmount = thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Bu ay gəlir
    const thisMonthProfit = thisMonthSalesAmount - thisMonthExpensesAmount;


    // --- YESTERDAY'S RESULTS FOR COMPARATIVE ANALYSIS ---
    const yesterdayDeliveredSales = sales.filter(s => s.status === "çatdırılıb" && getReportingBakuDateStr(s) === yesterdayStr);
    const yesterdaySalesAmount = yesterdayDeliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

    const yesterdayExpenses = expenses.filter(e => getExpenseBakuDate(e) === yesterdayStr);
    const yesterdayExpensesAmount = yesterdayExpenses.reduce((sum, e) => sum + e.amount, 0);
    const yesterdayProfit = yesterdaySalesAmount - yesterdayExpensesAmount;


    // --- LAST MONTH'S RESULTS FOR COMPARATIVE ANALYSIS ---
    const lastMonthDeliveredSales = sales.filter(s => s.status === "çatdırılıb" && getReportingBakuDateStr(s).substring(0, 7) === lastMonth);
    const lastMonthSalesAmount = lastMonthDeliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

    const lastMonthExpenses = expenses.filter(e => getExpenseBakuDate(e).substring(0, 7) === lastMonth);
    const lastMonthExpensesAmount = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const lastMonthProfit = lastMonthSalesAmount - lastMonthExpensesAmount;


    // --- COMPARATIVE CALS ---
    // Today vs Yesterday Sales
    const salesTodayYesterdayDiff = todaySalesAmount - yesterdaySalesAmount;
    const salesTodayYesterdayPercent = yesterdaySalesAmount > 0 
      ? (salesTodayYesterdayDiff / yesterdaySalesAmount) * 100 
      : (todaySalesAmount > 0 ? 100 : 0);

    // Today vs Yesterday Profit
    const profitTodayYesterdayDiff = todayProfit - yesterdayProfit;
    const profitTodayYesterdayPercent = yesterdayProfit !== 0 
      ? (profitTodayYesterdayDiff / Math.abs(yesterdayProfit)) * 100 
      : (todayProfit !== 0 ? 100 : 0);

    // This Month vs Last Month Sales
    const salesMonthDiff = thisMonthSalesAmount - lastMonthSalesAmount;
    const salesMonthPercent = lastMonthSalesAmount > 0 
      ? (salesMonthDiff / lastMonthSalesAmount) * 100 
      : (thisMonthSalesAmount > 0 ? 100 : 0);

    // This Month vs Last Month Profit
    const profitMonthDiff = thisMonthProfit - lastMonthProfit;
    const profitMonthPercent = lastMonthProfit !== 0 
      ? (profitMonthDiff / Math.abs(lastMonthProfit)) * 100 
      : (thisMonthProfit !== 0 ? 100 : 0);


    // Formatting trends
    const formatTrend = (percent: number) => {
      const rounded = Math.round(percent * 10) / 10;
      if (percent >= 0) {
        return `📈 +${rounded}%`;
      } else {
        return `📉 -${Math.round(Math.abs(percent) * 10) / 10}%`;
      }
    };


    // --- STATUS DETAILS & LISTS ---
    // Qeydə Alınmış Sifarişlər List (Sales registered/created today)
    const registeredCount = todayCreatedSales.length;
    let registeredListStr = "";
    if (registeredCount === 0) {
      registeredListStr = "<i>Siyahı boşdur</i>";
    } else {
      registeredListStr = todayCreatedSales.map((o, idx) => {
        const name = escapeHTML(o.customerName || "Simsiz Müştəri");
        const phone = escapeHTML(o.customerPhone || "Nömrə yoxdur");
        const addr = escapeHTML(o.address || "Ünvan yoxdur");
        return `${idx + 1}. <b>${name}</b>\n   📱 Nömrə: ${phone}\n   📍 Ünvan: ${addr}`;
      }).join("\n");
    }

    // Gözləyən Sifarişlər List (Pending orders)
    const pendingOrders = sales.filter(s => s.status === "gözləyir");
    const pendingCount = pendingOrders.length;
    let pendingListStr = "";
    if (pendingCount === 0) {
      pendingListStr = "<i>Siyahı boşdur</i>";
    } else {
      pendingListStr = pendingOrders.map((o, idx) => {
        const name = escapeHTML(o.customerName || "Simsiz Müştəri");
        const phone = escapeHTML(o.customerPhone || "Nömrə yoxdur");
        const addr = escapeHTML(o.address || "Ünvan yoxdur");
        return `${idx + 1}. <b>${name}</b>\n   📱 Nömrə: ${phone}\n   📍 Ünvan: ${addr}`;
      }).join("\n");
    }

    // Today Delivered count (Çatdırılan Sifarişlər)
    const deliveredCount = todayDeliveredSales.length;

    // Today Cancelled count (Ləğv Edilmiş Sifarişlər)
    const todayCancelledSales = sales.filter(s => {
      if (s.status !== "ləğv edilib") return false;
      let changedDate = "";
      if (s.statusHistory && s.statusHistory.length > 0) {
        const cancelHist = s.statusHistory.filter(h => h.status === "ləğv edilib");
        if (cancelHist.length > 0) {
          changedDate = cancelHist[cancelHist.length - 1].changedAt;
        }
      }
      if (!changedDate) {
        changedDate = s.createdAt;
      }
      return getBakuDateStrFromISO(getISOString(changedDate)) === todayStr;
    });
    const cancelledCount = todayCancelledSales.length;


    // --- BUILD SUMMARY HTML TAZA FORMAT ---
    const reportHTML = `📅 <b>Tarix:</b> ${bakuNow.displayDate}

<b><u>Günlük Nəticə</u></b>
📦 <b>Məhsul sayı:</b> ${todayProductCount}
🛒 <b>Sifariş sayı:</b> ${todayOrderCount}
💰 <b>Günlük satış məbləği:</b> ${todaySalesAmount} AZN
💸 <b>Günlük xərc:</b> ${todayExpensesAmount} AZN
📈 <b>Günlük gəlir:</b> ${todayProfit} AZN

<b><u>Aylıq Nəticə</u></b>
📦 <b>Bu ay satılan məhsul sayı:</b> ${thisMonthProductCount}
🛒 <b>Bu ay sifariş sayı:</b> ${thisMonthOrderCount}
💰 <b>Bu ay satış məbləği:</b> ${thisMonthSalesAmount} AZN
💸 <b>Bu ay xərc:</b> ${thisMonthExpensesAmount} AZN
📈 <b>Bu ay gəlir:</b> ${thisMonthProfit} AZN

<b><u>Müqayisəli Analitika</u></b>
Bugünkü satış dünənlə müqayisədə:
${formatTrend(salesTodayYesterdayPercent)}

Bugünkü gəlir dünənlə müqayisədə:
${formatTrend(profitTodayYesterdayPercent)}

Bu ayın satışları keçən ayla müqayisədə:
${formatTrend(salesMonthPercent)}

Bu ayın gəliri keçən ayla müqayisədə:
${formatTrend(profitMonthPercent)}

<b><u>Sifariş Statusları</u></b>
<b>Qeydə Alınmış Sifarişlər</b>
<b>Say:</b> ${registeredCount}
<b>Siyahı:</b>
${registeredListStr}

<b>Gözləyən Sifarişlər</b>
<b>Say:</b> ${pendingCount}
<b>Siyahı:</b>
${pendingListStr}

<b>Çatdırılan Sifarişlər</b>
<b>Say:</b> ${deliveredCount}

<b>Ləğv Edilmiş Sifarişlər</b>
<b>Say:</b> ${cancelledCount}

📅 <i>Ayvel Sistem | Ağıllı Hesabat</i>`;

    // Read BOT configuration dynamically from Firestore settings
    let botToken = process.env.TELEGRAM_BOT_TOKEN || "8774875697:AAEfnXAQqUWgY1fGqV12H0DFkGycoM5jEBU";
    let chatId = process.env.TELEGRAM_GROUP_CHAT_ID || "-1003879283343";

    try {
      const settingsSnap = await getDoc(doc(db, "settings", "general"));
      if (settingsSnap.exists()) {
        const settingsData = settingsSnap.data();
        if (settingsData.telegramBotToken) botToken = settingsData.telegramBotToken;
        if (settingsData.telegramChatId) chatId = settingsData.telegramChatId;
      }
    } catch (dbErr) {
      logMessage(`[Daily Report Settings Fetch Error]: ${String(dbErr)}`);
    }

    logMessage(`[Daily Report] Triggering delivery to Telegram chat ID: ${chatId}`);
    
    const sendSuccess = await sendTelegramMessage(botToken, chatId, reportHTML);
    if (sendSuccess) {
      logMessage(`[Daily Report] Completed successfully. Marking date ${todayStr} as sent...`);
      return true;
    } else {
      logMessage("[Daily Report] Delivery to Telegram failed.");
      return false;
    }
  } catch (error: any) {
    logMessage(`[Daily Report Critical] Exception occurred during report calculation/delivery: ${error.message || String(error)}`);
    return false;
  }
}

/**
 * Run Daily Report Job
 * Verifies Firestore setting 'last_report_date'/'lastSentDate' to avoid duplication
 */
export async function runDailyReportJob(db: Firestore): Promise<void> {
  try {
    const bakuNow = getBakuNow();
    const todayStr = bakuNow.dateStr;

    logMessage(`[Scheduler Job] Executing check for report dispatch on date: ${todayStr}...`);

    // Verify in Firestore to guarantee that the daily message is not duplicated
    let alreadySent = false;
    try {
      const reportSettingsSnap = await getDoc(doc(db, "settings", "telegram_report"));
      if (reportSettingsSnap.exists()) {
        const data = reportSettingsSnap.data();
        if (data && (data.last_report_date === todayStr || data.lastSentDate === todayStr)) {
          alreadySent = true;
          logMessage(`[Scheduler Job] Duplicate prevented! Report was already registered as sent in Firestore settings for date: ${todayStr}.`);
          return;
        }
      }
    } catch (dbErr: any) {
      logMessage(`[Scheduler Job Warning] Failed to check Firestore for duplicate. Proceeding with caution: ${dbErr.message || String(dbErr)}`);
    }

    if (!alreadySent) {
      logMessage(`[Scheduler Job] Daily report marker for ${todayStr} not found. Triggering calculation & delivery...`);
      const success = await generateAndSendDailyReport(db);
      if (success) {
        logMessage(`[Scheduler Job] Daily report completed successfully. Archiving dispatch status in Firestore...`);
        try {
          await setDoc(doc(db, "settings", "telegram_report"), {
            last_report_date: todayStr,
            lastSentDate: todayStr,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          logMessage("[Scheduler Job] Duplicate prevention markers successfully established in Firestore.");
        } catch (dbErr: any) {
          logMessage(`[Scheduler Job Critical] Failed to write safe-guard markers to Firestore: ${dbErr.message || String(dbErr)}`);
        }
      } else {
        logMessage("[Scheduler Job] Daily report generation and delivery returned false.");
      }
    }
  } catch (err: any) {
    logMessage(`[Scheduler Job Critical] Error executing runDailyReportJob: ${err.message || String(err)}`);
  }
}

/**
 * Background Scheduler initialization with node-cron
 * Runs at 21:00 (Asia/Baku) timezone
 */
export async function startDailyReportScheduler(db: Firestore) {
  logMessage("[Scheduler] Initializing node-cron reporter daemon... (Asia/Baku timezone active)");

  // Register cron task: runs every day at 21:00 (9:00 PM) Baku time
  cron.schedule("0 21 * * *", async () => {
    logMessage("[Scheduler] Scheduled time (21:00 Baku time) reached. Initiating automatic report dispatch...");
    await runDailyReportJob(db);
  }, {
    timezone: "Asia/Baku"
  });

  logMessage("[Scheduler] node-cron task registration complete. Targeted time: 21:00 Asia/Baku daily.");

  // Startup Safeguard: If the server restarts or starts up past 21:00, verify if today's report has already been delivered
  try {
    const bakuNow = getBakuNow();
    if (bakuNow.hour >= 21) {
      logMessage(`[Scheduler Startup Check] Current Baku hour is ${bakuNow.hour}:${bakuNow.minute} (>= 21:00). Checking if today's (${bakuNow.dateStr}) report needs to be sent...`);
      await runDailyReportJob(db);
    } else {
      logMessage(`[Scheduler Startup Check] Current Baku hour is ${bakuNow.hour}:${bakuNow.minute} (< 21:00). Waiting for scheduled trigger.`);
    }
  } catch (err: any) {
    logMessage(`[Scheduler Startup Check Error] Startup checking failed: ${err.message || String(err)}`);
  }
}
