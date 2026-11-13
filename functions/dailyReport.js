const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8774875697:AAEfnXAQqUWgY1fGqV12H0DFkGycoM5jEBU";
const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID || "-1003879283343";

/**
 * File logger helper
 */
function logMessage(msg) {
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
function escapeHTML(text) {
  if (text === undefined || text === null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Helper to get date components and string in Asia/Baku timezone
 */
function getBakuNow() {
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
function getBakuDateStrFromISO(isoStr) {
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
function getISOString(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val.toDate === "function") return val.toDate().toISOString();
  if (val.seconds) return new Date(val.seconds * 1000).toISOString();
  return "";
}

/**
 * Determines reporting Date Str for Sales under timezone Asia/Baku
 */
function getReportingBakuDateStr(sale) {
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
function getBakuYesterdayDateString(todayStr) {
  const date = new Date(`${todayStr}T12:00:00+04:00`);
  date.setDate(date.getDate() - 1);
  return getBakuDateStrFromISO(date.toISOString());
}

/**
 * Splits message into Telegram-bound chunks of <= 4000 chars without breaking HTML tags
 */
function chunkMessage(text) {
  const maxChunkSize = 4000;
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const lines = text.split("\n");
  const chunks = [];
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
async function sendTelegramMessage(token, chatId, text) {
  const chunks = chunkMessage(text);
  logMessage(`[Telegram FB] Sending message in ${chunks.length} part(s)...`);

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
          logMessage(`[Telegram FB] Part ${i + 1}/${chunks.length} sent successfully on attempt ${attempts}.`);
        } else {
          logMessage(`[Telegram FB Error] Attempt ${attempts} failed. Code: ${response.status}, Detail: ${JSON.stringify(data)}`);
          if (attempts < 3) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
          }
        }
      } catch (err) {
        logMessage(`[Telegram FB Error] Attempt ${attempts} exception: ${err.message || String(err)}`);
        if (attempts < 3) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }
    }

    if (!success) {
      logMessage(`[Telegram FB Critical] Failed to send report chunk ${i + 1} after 3 retries.`);
      return false;
    }
  }

  return true;
}

/**
 * Core Daily Report Generator
 */
async function generateAndSendDailyReport() {
  logMessage("[Daily Report FB] Gathering data for daily stats report...");
  const db = admin.firestore();

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

    logMessage(`[Daily Report FB] Date mapping: Bugün=${todayStr}, Dünən=${yesterdayStr}, Bu Ay=${currentMonth}, Keçən Ay=${lastMonth}`);

    // Fetch collections
    const salesSnap = await db.collection("sales").get();
    const sales = [];
    salesSnap.forEach(docSnap => {
      sales.push({ id: docSnap.id, ...docSnap.data() });
    });

    const expensesSnap = await db.collection("expenses").get();
    const expenses = [];
    expensesSnap.forEach(docSnap => {
      expenses.push({ id: docSnap.id, ...docSnap.data() });
    });

    logMessage(`[Daily Report FB] Loaded ${sales.length} orders/sales and ${expenses.length} expenses from database.`);

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
    function getExpenseBakuDate(exp) {
      return getBakuDateStrFromISO(getISOString(exp.date || exp.createdAt));
    }
    const todayExpensesList = expenses.filter(e => getExpenseBakuDate(e) === todayStr);
    const todayExpensesAmount = todayExpensesList.reduce((sum, e) => sum + e.amount, 0);

    // Çatdırılma xərclərini delivery_date-ə görə hesabla
    const todayDeliveryCosts = todayDeliveredSales.reduce(
      (sum, s) => sum + (Number(s.deliveryCost) || 0), 0
    );
    // Manual xərclər bu gün qeydə alınanlar
    const todayManualExpenses = todayExpensesList.filter(e => e.source === "manual");
    const todayManualExpensesAmount = todayManualExpenses.reduce((sum, e) => sum + e.amount, 0);
    // Doğru gəlir:
    const todayProfit = todaySalesAmount - todayDeliveryCosts - todayManualExpensesAmount;


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
    const thisMonthExpensesList = expenses.filter(e => getExpenseBakuDate(e).substring(0, 7) === currentMonth);
    const thisMonthExpensesAmount = thisMonthExpensesList.reduce((sum, e) => sum + e.amount, 0);

    const thisMonthDeliveryCosts = thisMonthDeliveredSales.reduce(
      (sum, s) => sum + (Number(s.deliveryCost) || 0), 0
    );
    const thisMonthManualExpenses = thisMonthExpensesList.filter(e => e.source === "manual");
    const thisMonthManualExpensesAmount = thisMonthManualExpenses.reduce((sum, e) => sum + e.amount, 0);
    const thisMonthProfit = thisMonthSalesAmount - thisMonthDeliveryCosts - thisMonthManualExpensesAmount;


    // --- YESTERDAY'S RESULTS FOR COMPARATIVE ANALYSIS ---
    const yesterdayDeliveredSales = sales.filter(s => s.status === "çatdırılıb" && getReportingBakuDateStr(s) === yesterdayStr);
    const yesterdaySalesAmount = yesterdayDeliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

    const yesterdayExpensesList = expenses.filter(e => getExpenseBakuDate(e) === yesterdayStr);
    const yesterdayExpensesAmount = yesterdayExpensesList.reduce((sum, e) => sum + e.amount, 0);
    const yesterdayDeliveryCosts = yesterdayDeliveredSales.reduce(
      (sum, s) => sum + (Number(s.deliveryCost) || 0), 0
    );
    const yesterdayManualExpenses = yesterdayExpensesList.filter(e => e.source === "manual");
    const yesterdayManualExpensesAmount = yesterdayManualExpenses.reduce((sum, e) => sum + e.amount, 0);
    const yesterdayProfit = yesterdaySalesAmount - yesterdayDeliveryCosts - yesterdayManualExpensesAmount;


    // --- LAST MONTH'S RESULTS FOR COMPARATIVE ANALYSIS ---
    const lastMonthDeliveredSales = sales.filter(s => s.status === "çatdırılıb" && getReportingBakuDateStr(s).substring(0, 7) === lastMonth);
    const lastMonthSalesAmount = lastMonthDeliveredSales.reduce((sum, s) => sum + s.totalAmount, 0);

    const lastMonthExpensesList = expenses.filter(e => getExpenseBakuDate(e).substring(0, 7) === lastMonth);
    const lastMonthExpensesAmount = lastMonthExpensesList.reduce((sum, e) => sum + e.amount, 0);
    const lastMonthDeliveryCosts = lastMonthDeliveredSales.reduce(
      (sum, s) => sum + (Number(s.deliveryCost) || 0), 0
    );
    const lastMonthManualExpenses = lastMonthExpensesList.filter(e => e.source === "manual");
    const lastMonthManualExpensesAmount = lastMonthManualExpenses.reduce((sum, e) => sum + e.amount, 0);
    const lastMonthProfit = lastMonthSalesAmount - lastMonthDeliveryCosts - lastMonthManualExpensesAmount;


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
    const formatTrend = (percent) => {
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

    // Today Delivered count
    const deliveredCount = todayDeliveredSales.length;

    // Today Cancelled count
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

    const sendSuccess = await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_CHAT_ID, reportHTML);
    if (sendSuccess) {
      logMessage(`[Daily Report FB] Completed successfully. Logging to Firestore for date ${todayStr}`);
      await db.collection("settings").doc("telegram_report").set({
        lastSentDate: todayStr,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return true;
    } else {
      logMessage("[Daily Report FB] Sending message failed.");
      return false;
    }
  } catch (error) {
    logMessage(`[Daily Report FB Critical] Error: ${error.message || String(error)}`);
    return false;
  }
}

module.exports = {
  generateAndSendDailyReport
};
