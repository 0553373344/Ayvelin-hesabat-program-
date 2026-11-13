const admin = require("firebase-admin");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8774875697:AAEfnXAQqUWgY1fGqV12H0DFkGycoM5jEBU";

// Simple helper to fetch the correct collection name
async function getOrdersCollection(db) {
  try {
    const ordersSnap = await db.collection("orders").limit(1).get();
    if (!ordersSnap.empty) return "orders";
    const salesSnap = await db.collection("sales").limit(1).get();
    if (!salesSnap.empty) return "sales";
  } catch (_) {}
  return "orders";
}

/**
 * Standard relative Baku day boundaries calculator
 */
function getBakuDayBoundaries(date = new Date()) {
  let dateStr = "";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(date);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
  } catch (err) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    dateStr = `${y}-${m}-${d}`;
  }

  const startISO = new Date(`${dateStr}T00:00:00+04:00`).toISOString();
  const endISO = new Date(`${dateStr}T23:59:59+04:00`).toISOString();

  return { startISO, endISO, dateStr };
}

/**
 * Send reply text back to chat
 */
async function sendTelegramReply(chatId, text, replyMessageId = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML"
    };
    if (replyMessageId) {
      payload.reply_to_message_id = replyMessageId;
    }
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("[sendTelegramReply] Error replying to message:", err);
  }
}

/**
 * Express Webhook Endpoint for Telegram Updates
 */
async function telegramWebhook(req, res) {
  const db = admin.firestore();
  
  try {
    const update = req.body;
    if (!update || !update.message) {
      return res.status(200).send("No message update found");
    }

    const message = update.message;
    const text = message.text ? message.text.trim() : "";
    const chatId = message.chat.id;
    const replyToId = message.message_id;

    if (message.chat && message.chat.type === "private") {
      if (!text.startsWith("/")) {
        console.log(`[Telegram Webhook] Owner manual message detected in private chat. message_id: ${message.message_id}`);
        await db.collection("settings").doc("telegram_owner").set({
          owner_message_id: String(message.message_id),
          owner_chat_id: String(message.chat.id)
        }, { merge: true });
        
        return res.status(200).send("Captured owner manual message metadata");
      }
    }

    if (!text.startsWith("/")) {
      console.log(`[Telegram Webhook] Incoming non-command message in chat ${chatId}: "${text}"`);
      if (text.length < 8) {
        return res.status(200).send("Text too short");
      }

      // Memory/DB De-duplication Check
      const cleanMessageId = String(message.message_id);
      try {
        const dupCheck = await db.collection("sales").where("incomingTelegramMessageId", "==", cleanMessageId).get();
        if (!dupCheck.empty) {
          console.log(`[Telegram Webhook] Duplicate check hit for msg_id ${cleanMessageId}. Exiting.`);
          return res.status(200).send("DUPLICATE_FOUND");
        }
      } catch (dupErr) {
        console.error("Duplicate check error:", dupErr);
      }

      try {
        const parsed = await parseFreeTextOrder(text);
        if (parsed && parsed.isOrder) {
          console.log("[Telegram Webhook] AI Recognized as dynamic order, registering...", parsed);
          const saleId = await registerParsedOrder(db, parsed, message.message_id);

          if (saleId === "DUPLICATE") {
            console.log("[Telegram Webhook] Order already registered. Skipping.");
            return res.status(200).send("DUPLICATE_DB");
          }

          const newSaleSnap = await db.collection("sales").doc(saleId).get();
          const finalSalesData = newSaleSnap.exists ? newSaleSnap.data() : null;

          if (finalSalesData) {
            // Send Group Notification
            const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID || "-1003879283343";
            const confirmData = await sendTelegramConfirmation(TELEGRAM_GROUP_CHAT_ID, message.message_id, finalSalesData);
            if (confirmData && confirmData.ok && confirmData.result && confirmData.result.message_id) {
              try {
                await db.collection("sales").doc(saleId).update({
                  telegramMessageId: String(confirmData.result.message_id)
                });
              } catch (uErr) {
                console.error("[Telegram Webhook] Failed to update sale", uErr);
              }
            }

            // Delete original user message (owner personal chat or group chat)
            try {
              await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: String(message.chat.id),
                  message_id: message.message_id
                })
              });
              console.log(`[Telegram Webhook] Deleted original user message_id: ${message.message_id}`);
            } catch (delErr) {
              console.error("[Telegram Webhook] Error deleting group/owner message:", delErr);
            }
          }
          return res.status(200).send("REGISTERED");
        } else {
          // Check for business/analytic question
          const isQuery = text.includes("?") || 
                          text.toLowerCase().includes("ai") ||
                          /satış|stok|kuryer|plan|hesabat|xülasə|proqnoz|mənfəət|gəlir|reklam|ədəd|manat|azn|kömək|vəziyyət|anbar|məlumat/i.test(text);

          if (isQuery) {
            try {
              await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: message.chat.id, action: "typing" })
              });
            } catch (_) {}

            const answer = await generateIntelligentBusinessAnswer(db, text);
            await sendTelegramReply(message.chat.id, answer, message.message_id);

            // Delete query message to keep chat visual layout pristine
            try {
              await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: String(message.chat.id),
                  message_id: message.message_id
                })
              });
            } catch (delErr) {
              console.error("[Telegram Webhook] Error deleting query message:", delErr);
            }
            return res.status(200).send("ANSWERED");
          } else {
            console.log("[Telegram Webhook] Non-order message ignored.");
            return res.status(200).send("Ignored non-order non-query message");
          }
        }
      } catch (parseAndRegistryErr) {
        console.error("[Telegram Webhook] Parsing or registration failure:", parseAndRegistryErr);
        return res.status(500).send("Parser internal error");
      }
    }

    const COLL_ORDERS = await getOrdersCollection(db);

    // Parse commands and arguments
    const parts = text.split(" ");
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    // Handle each command explicitly
    switch (command) {
      case "/hesabat": {
        const subCmd = parts[1] ? parts[1].toLowerCase() : "bugun";
        if (subCmd === "bugun") {
          const report = await generateBakuPeriodReport(db, COLL_ORDERS, "bugun");
          await sendTelegramReply(chatId, report, replyToId);
        } else if (subCmd === "bu_həftə" || subCmd === "bu_hefte") {
          const report = await generateBakuPeriodReport(db, COLL_ORDERS, "bu_hefte");
          await sendTelegramReply(chatId, report, replyToId);
        } else if (subCmd === "bu_ay") {
          const report = await generateBakuPeriodReport(db, COLL_ORDERS, "bu_ay");
          await sendTelegramReply(chatId, report, replyToId);
        } else {
          await sendTelegramReply(chatId, "⚠️ Zəhmət olmasa düzgün format seçin:\n<code>/hesabat bugun</code>\n<code>/hesabat bu_həftə</code>\n<code>/hesabat bu_ay</code>", replyToId);
        }
        break;
      }

      case "/gelir": {
        const report = await getFinancialSummary(db, COLL_ORDERS);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/gozleyir": {
        const report = await getOrdersByStatus(db, COLL_ORDERS, "gözləyir");
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/catdirildi": {
        const report = await getDeliveredOrdersToday(db, COLL_ORDERS);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/legv": {
        const report = await getCancelledOrdersToday(db, COLL_ORDERS);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/sifaris": {
        if (!args) {
          await sendTelegramReply(chatId, "⚠️ Zəhmət olmasa sifariş nömrəsini daxil edin. Məsələn: <code>/sifaris 0015</code>", replyToId);
          break;
        }
        const report = await getSpecificOrderDetails(db, COLL_ORDERS, args);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/musteri": {
        if (!args) {
          await sendTelegramReply(chatId, "⚠️ Zəhmət olmasa müştəri adını və ya telefonunu daxil edin. Məsələn: <code>/musteri Feride</code>", replyToId);
          break;
        }
        const report = await searchCustomer(db, COLL_ORDERS, args);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/top_musteriler": {
        const report = await getTopCustomers(db, COLL_ORDERS);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/top_mehsullar": {
        const report = await getTopProducts(db, COLL_ORDERS);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/stok": {
        const report = await getStockStatus(db);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/kuryer": {
        if (!args) {
          await sendTelegramReply(chatId, "⚠️ Zəhmət olmasa kuryer adını daxil edin. Məsələn: <code>/kuryer Columba</code>", replyToId);
          break;
        }
        const report = await getCourierStats(db, COLL_ORDERS, args);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/xercler": {
        const report = await getMonthlyExpensesByCategory(db);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      case "/muqayise": {
        const report = await compareCurrentAndLastMonth(db, COLL_ORDERS);
        await sendTelegramReply(chatId, report, replyToId);
        break;
      }

      default:
        // Do nothing for unrecognized command
        break;
    }

    return res.status(200).send("Processed successfully");
  } catch (error) {
    console.error("[telegramWebhook] Error processing command:", error);
    return res.status(500).send("Webhook internal failure");
  }
}

// ==========================================
// CORE DATA COMPUTATION HELPERS FOR BOT COMMANDS
// ==========================================

async function generateBakuPeriodReport(db, COLL_ORDERS, type) {
  const today = new Date();
  let startISO = "";
  let endISO = "";
  let title = "";

  if (type === "bugun") {
    const bounds = getBakuDayBoundaries(today);
    startISO = bounds.startISO;
    endISO = bounds.endISO;
    title = `BU GÜNÜN HESABATI (${bounds.dateStr})`;
  } else if (type === "bu_hefte") {
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    startISO = monday.toISOString();
    endISO = new Date().toISOString();
    title = "HƏFTƏLİK SİSTEM HESABATI";
  } else if (type === "bu_ay") {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startISO = firstDay.toISOString();
    endISO = new Date().toISOString();
    title = "AYLIQ SİSTEM HESABATI";
  }

  try {
    const ordersSnap = await db.collection(COLL_ORDERS)
      .where("createdAt", ">=", startISO)
      .where("createdAt", "<=", endISO)
      .get();

    const expensesSnap = await db.collection("expenses")
      .where("createdAt", ">=", startISO)
      .where("createdAt", "<=", endISO)
      .get();

    let totalCount = 0;
    let deliveredCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let totalSales = 0;
    let orderDetailStr = "";

    ordersSnap.forEach(d => {
      const order = d.data();
      totalCount++;
      const amt = Number(order.totalAmount || 0);
      totalSales += amt;

      const status = order.status || "gözləyir";
      let emoji = "⏳";
      if (status === "çatdırıldı") {
        deliveredCount++;
        emoji = "✅";
      } else if (status === "ləğv edildi") {
        cancelledCount++;
        emoji = "❌";
      } else {
        pendingCount++;
      }

      const num = order.orderNumber || "Məlum deyil";
      const name = order.customerName || "Simsiz Müştəri";
      orderDetailStr += `• #${num} ${name} — ${amt} AZN ${emoji}\n`;
    });

    let totalExpenses = 0;
    expensesSnap.forEach(d => {
      totalExpenses += Number(d.data().amount || 0);
    });

    if (!orderDetailStr) {
      orderDetailStr = "Məlumat tapılmadı\n";
    }

    const profit = totalSales - totalExpenses;

    return `<b>📊 ${title}</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>🛍 SİFARİŞLƏR</b>
- Ümumi: ${totalCount} sifariş
- ✅ Çatdırıldı: ${deliveredCount}
- ⏳ Gözləyir: ${pendingCount}
- ❌ Ləğv edildi: ${cancelledCount}

<b>📦 SİFARİŞ DETALLARI</b>
${orderDetailStr}
<b>💰 MALİYYƏ</b>
- Satış: ${totalSales} AZN
- Xərc: ${totalExpenses} AZN
- Xalis Mənfəət: ${profit} AZN`;
  } catch (err) {
    console.error(err);
    return "❌ Hesabat hazırlanarkən xəta baş verdi.";
  }
}

async function getFinancialSummary(db, COLL_ORDERS) {
  try {
    const ordersSnap = await db.collection(COLL_ORDERS).get();
    const expensesSnap = await db.collection("expenses").get();

    let totalSales = 0;
    ordersSnap.forEach(d => {
      totalSales += Number(d.data().totalAmount || 0);
    });

    let totalExpenses = 0;
    expensesSnap.forEach(d => {
      totalExpenses += Number(d.data().amount || 0);
    });

    const netProfit = totalSales - totalExpenses;

    return `<b>💰 ÜMUMİ MALİYYƏ STATİSTİKASI</b>
━━━━━━━━━━━━━━━━━━━━━━
- 💎 Ümumi Satış: <b>${totalSales} AZN</b>
- 💸 Ümumi Xərc: <b>${totalExpenses} AZN</b>
- 📈 Xalis Mənfəət: <b>${netProfit} AZN</b>`;
  } catch (err) {
    console.error(err);
    return "❌ Gəlir məlumatları hesablana bilmədi.";
  }
}

async function getOrdersByStatus(db, COLL_ORDERS, targetStatus) {
  try {
    const snap = await db.collection(COLL_ORDERS)
      .where("status", "==", targetStatus)
      .get();

    if (snap.empty) {
      return `⏳ <b>Gözləyən sifariş yoxdur!</b>`;
    }

    let text = `⏳ <b>GÖZLƏYƏN BÜTÜN SİFARİŞLƏR</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    snap.forEach(d => {
      const o = d.data();
      const num = o.orderNumber || "Məlum deyil";
      const name = o.customerName || "Simsiz Müştəri";
      const addr = o.address || "Ünvan yoxdur";
      const amt = o.totalAmount || 0;
      text += `• #${num} | ${name} | 📍 ${addr} | 💰 ${amt} AZN\n`;
    });

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Gözləyən sifarişlər oxunarkən xəta sənədləşdirildi.";
  }
}

async function getDeliveredOrdersToday(db, COLL_ORDERS) {
  try {
    const { startISO, endISO } = getBakuDayBoundaries(new Date());
    const snap = await db.collection(COLL_ORDERS)
      .where("status", "==", "çatdırıldı")
      .where("createdAt", ">=", startISO)
      .where("createdAt", "<=", endISO)
      .get();

    if (snap.empty) {
      return `✅ <b>Bu gün çatdırılan sifariş yoxdur.</b>`;
    }

    let text = `✅ <b>BU GÜN ÇATDIRILAN SİFARİŞLƏR</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    snap.forEach(d => {
      const o = d.data();
      const num = o.orderNumber || "Məlum deyil";
      const name = o.customerName || "Simsiz Müştəri";
      const amt = o.totalAmount || 0;
      text += `• #${num} — ${name} | 💰 ${amt} AZN\n`;
    });

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Məlumat tapılmadı.";
  }
}

async function getCancelledOrdersToday(db, COLL_ORDERS) {
  try {
    const { startISO, endISO } = getBakuDayBoundaries(new Date());
    const snap = await db.collection(COLL_ORDERS)
      .where("status", "==", "ləğv edildi")
      .where("createdAt", ">=", startISO)
      .where("createdAt", "<=", endISO)
      .get();

    if (snap.empty) {
      return `❌ <b>Bu gün ləğv edilmiş sifariş yoxdur.</b>`;
    }

    let text = `❌ <b>BU GÜN LƏĞV EDİLMİŞ SİFARİŞLƏR</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    snap.forEach(d => {
      const o = d.data();
      const num = o.orderNumber || "Məlum deyil";
      const name = o.customerName || "Simsiz Müştəri";
      const amt = o.totalAmount || 0;
      text += `• #${num} — ${name} | 💰 ${amt} AZN\n`;
    });

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Məlumat tapılmadı.";
  }
}

async function getSpecificOrderDetails(db, COLL_ORDERS, orderNumQuery) {
  try {
    let q = orderNumQuery.trim().replace("#", "");
    const snap = await db.collection(COLL_ORDERS)
      .where("orderNumber", "==", q)
      .get();

    if (snap.empty) {
      return `🔍 <b>Sifariş #${q} tapılmadı.</b>`;
    }

    const o = snap.docs[0].data();
    const num = o.orderNumber;
    const name = o.customerName || "Simsiz Müştəri";
    const phone = o.phone || o.customerPhone || "Məlumat yoxdur";
    const address = o.address || "Məlumat yoxdur";
    const amount = o.totalAmount || 0;
    const status = o.status || "gözləyir";
    const courier = o.deliveryType === "courier"
      ? (o.courierName || "Təyin edilməyib")
      : (o.cargoCompany || o.deliveryType || "Təyin edilməyib");
    const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleDateString("az-AZ") : "Tarix yoxdur";

    let productsText = "";
    if (o.products && Array.isArray(o.products)) {
      o.products.forEach(p => {
        productsText += `  ▫️ ${p.name} (${p.quantity} ədəd) — ${p.price} AZN\n`;
      });
    }

    return `📦 <b>SİFARİŞ #${num} TAM DETALLARI</b>
━━━━━━━━━━━━━━━━━━━━━━
👤 <b>Müştəri:</b> ${name}
📱 <b>Telefon:</b> ${phone}
📍 <b>Ünvan:</b> ${address}
🚚 <b>Kuryer:</b> ${courier}
💰 <b>Məbləğ:</b> ${amount} AZN
📅 <b>Tarix:</b> ${dateStr}
⏳ <b>Status:</b> ${status.toUpperCase()}

🛍 <b>Məhsullar:</b>
${productsText || "  ▫️ Məhsul qeydi yoxdur\n"}
📝 <b>Qeyd:</b> ${o.note || "Yoxdur"}`;
  } catch (err) {
    console.error(err);
    return "❌ Sifariş axtarılarkən xəta baş verdi.";
  }
}

async function searchCustomer(db, COLL_ORDERS, queryStr) {
  try {
    const q = queryStr.trim().toLowerCase();
    
    // Search in customers collection
    const custSnap = await db.collection("customers").get();
    const matchedUsers = [];
    custSnap.forEach(d => {
      const c = d.data();
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      if (name.includes(q) || phone.includes(q)) {
        matchedUsers.push(c);
      }
    });

    if (matchedUsers.length === 0) {
      return `👤 <b>Müştəri Məlumatı tapılmadı: "${queryStr}"</b>`;
    }

    let text = `👥 <b>MÜŞTƏRİ AXTARIŞI</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const u of matchedUsers) {
      // Find their orders to list historic context
      const phone = u.phone;
      const ordersSnap = await db.collection(COLL_ORDERS)
        .where("phone", "==", phone)
        .get();

      let orderCount = ordersSnap.size;
      let lastDateText = "Sifariş verməyib";
      
      if (orderCount > 0) {
        let newest = 0;
        ordersSnap.forEach(o => {
          const t = new Date(o.data().createdAt).getTime();
          if (t > newest) newest = t;
        });
        lastDateText = new Date(newest).toLocaleDateString("az-AZ");
      }

      text += `👤 <b>Adı:</b> ${u.name}
📱 <b>Telefon:</b> ${u.phone || "Yoxdur"}
📍 <b>Ünvan:</b> ${u.address || "Yoxdur"}
🛒 <b>Ümumi Sifariş Sayı:</b> ${orderCount}
📅 <b>Son Sifariş Tarixi:</b> ${lastDateText}\n\n`;
    }

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Müştəri axtarışı zamanı xəta oldu.";
  }
}

async function getTopCustomers(db, COLL_ORDERS) {
  try {
    const snap = await db.collection(COLL_ORDERS).get();
    const userRankingMap = {};

    snap.forEach(d => {
      const o = d.data();
      const phone = o.phone || o.customerPhone;
      if (!phone) return;
      const name = o.customerName || "Simsiz Müştəri";

      if (!userRankingMap[phone]) {
        userRankingMap[phone] = { name, count: 0, sum: 0 };
      }
      userRankingMap[phone].count++;
      userRankingMap[phone].sum += Number(o.totalAmount || 0);
    });

    const rankingArr = Object.values(userRankingMap);
    rankingArr.sort((a, b) => b.count - a.count);

    const top10 = rankingArr.slice(0, 10);
    if (top10.length === 0) {
      return "🏆 <b>Məlumat tapılmadı.</b>";
    }

    let text = `👑 <b>ƏN ÇOX SİFARİŞ VERƏN 10 MÜŞTƏRİ</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    top10.forEach((user, index) => {
      text += `${index + 1}. 👤 ${user.name} — 🛍 <b>${user.count} dəfə</b> | 💰 ${user.sum} AZN\n`;
    });

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Müştəri sıralaması hesablana bilmədi.";
  }
}

async function getTopProducts(db, COLL_ORDERS) {
  try {
    const snap = await db.collection(COLL_ORDERS).get();
    const productCountMap = {};

    snap.forEach(d => {
      const o = d.data();
      if (o.products && Array.isArray(o.products)) {
        o.products.forEach(p => {
          const name = p.name || "Ayvelin 100 ml";
          const qty = Number(p.quantity || 1);
          productCountMap[name] = (productCountMap[name] || 0) + qty;
        });
      }
    });

    const productRanking = Object.entries(productCountMap).map(([name, qty]) => ({ name, qty }));
    productRanking.sort((a, b) => b.qty - a.qty);

    const top5 = productRanking.slice(0, 5);
    if (top5.length === 0) {
      return "📦 <b>Məlumat tapılmadı.</b>";
    }

    let text = `🏆 <b>ƏN ÇOX SATILAN 5 MƏHSUL</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    top5.forEach((item, index) => {
      text += `${index + 1}. 📦 ${item.name} — 📈 <b>${item.qty} ədəd</b>\n`;
    });

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Məhsul statistikası hesablana bilmədi.";
  }
}

async function getStockStatus(db) {
  try {
    const snap = await db.collection("products").get();
    if (snap.empty) {
      return "📦 <b>Anbarda heç bir məhsul qeydə alınmayıb.</b>";
    }

    let text = `📦 <b>MƏHSULLARIN ANBAR STOK VƏZİYYƏTİ</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    snap.forEach(d => {
      const p = d.data();
      const name = p.name || "Nəməlum";
      const qty = p.stock !== undefined ? p.stock : "Sonsuz";
      const prc = p.price || 0;
      text += `• ${name} — 🔑 <b>Stok: ${qty}</b> ədəd | 🏷 Qiymət: ${prc} AZN\n`;
    });

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Stok məlumatı çəkilərkən xəta baş verdi.";
  }
}

async function getCourierStats(db, COLL_ORDERS, courierQueryName) {
  try {
    const q = courierQueryName.trim().toLowerCase();
    
    // Calculate stats matching courierName
    const ordersSnap = await db.collection(COLL_ORDERS).get();
    let courierRealName = "";
    let ordersCount = 0;
    let totalCourierAmount = 0;

    ordersSnap.forEach(d => {
      const o = d.data();
      const name = o.courierName || "";
      if (name.toLowerCase().includes(q)) {
        courierRealName = name;
        ordersCount++;
        totalCourierAmount += Number(o.courierFee || 0);
      }
    });

    if (ordersCount === 0) {
      return `🚚 <b>Kuryer tapılmadı: "${courierQueryName}"</b>`;
    }

    return `🚚 <b>KURYER STATİSTİKASI: ${courierRealName}</b>
━━━━━━━━━━━━━━━━━━━━━━
- 📦 Sifariş Sayı: <b>${ordersCount} ədəd</b>
- 💰 Kuryer Qazancı: <b>${totalCourierAmount} AZN</b>`;
  } catch (err) {
    console.error(err);
    return "❌ Kuryer hesabatı hazırlana bilmədi.";
  }
}

async function getMonthlyExpensesByCategory(db) {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    
    const snap = await db.collection("expenses")
      .where("createdAt", ">=", firstDay)
      .get();

    if (snap.empty) {
      return `💸 <b>Bu ay üçün heç bir xərc qeydə alınmayıb.</b>`;
    }

    const expensesMap = {};
    let totalAll = 0;

    snap.forEach(d => {
      const e = d.data();
      const cat = e.category || "Digər/Təyin edilməyib";
      const amt = Number(e.amount || 0);
      totalAll += amt;
      expensesMap[cat] = (expensesMap[cat] || 0) + amt;
    });

    let text = `💸 <b>KATEQORİYA ÜZRƏ AYLIQ XƏRCLƏR</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    Object.entries(expensesMap).forEach(([cat, amount]) => {
      text += `• <b>${cat}:</b> ${amount} AZN\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━━━\n💰 <b>Cəmi Xərc:</b> ${totalAll} AZN`;

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Kateqoriya xərcləri oxunarkən xəta.";
  }
}

async function compareCurrentAndLastMonth(db, COLL_ORDERS) {
  try {
    const today = new Date();
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    
    // Current Month Metrics
    const oSnapThis = await db.collection(COLL_ORDERS).where("createdAt", ">=", thisMonthStart).get();
    const eSnapThis = await db.collection("expenses").where("createdAt", ">=", thisMonthStart).get();

    let salesThis = 0;
    oSnapThis.forEach(d => salesThis += Number(d.data().totalAmount || 0));

    let expThis = 0;
    eSnapThis.forEach(d => expThis += Number(d.data().amount || 0));

    const profitThis = salesThis - expThis;

    // Last Month Metrics
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString();

    const oSnapLast = await db.collection(COLL_ORDERS)
      .where("createdAt", ">=", lastMonthStart)
      .where("createdAt", "<=", lastMonthEnd)
      .get();

    const eSnapLast = await db.collection("expenses")
      .where("createdAt", ">=", lastMonthStart)
      .where("createdAt", "<=", lastMonthEnd)
      .get();

    let salesLast = 0;
    oSnapLast.forEach(d => salesLast += Number(d.data().totalAmount || 0));

    let expLast = 0;
    eSnapLast.forEach(d => expLast += Number(d.data().amount || 0));

    const profitLast = salesLast - expLast;

    return `<b>⚖️ MUQAYİSƏ: BU AY vs KEÇƏN AY</b>
━━━━━━━━━━━━━━━━━━━━━━
<b>🛍 SATIŞLAR:</b>
- Bu ay: <b>${salesThis} AZN</b>
- Keçən ay: <b>${salesLast} AZN</b>
- Fərlilik: ${salesThis >= salesLast ? "+" : ""}${salesThis - salesLast} AZN

<b>💸 XƏRCLƏR:</b>
- Bu ay: <b>${expThis} AZN</b>
- Keçən ay: <b>${expLast} AZN</b>
- Fərlilik: ${expThis >= expLast ? "+" : ""}${expThis - expLast} AZN

<b>📉 MƏNFƏƏT:</b>
- Bu ay: <b>${profitThis} AZN</b>
- Keçən ay: <b>${profitLast} AZN</b>
- Fərlilik: ${profitThis >= profitLast ? "+" : ""}${profitThis - profitLast} AZN`;
  } catch (err) {
    console.error(err);
    return "❌ Müqayisə aparılarkən xəta baş verdi.";
  }
}

/**
 * Executes a Telegram API request with an automatic retry block up to maxAttempts (3 attempts)
 */
async function fetchTelegramWithRetry(url, options, maxAttempts = 3, delayMs = 2000) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return await response.json();
      }
      const errText = await response.text();
      if (errText.toLowerCase().includes("message is not modified")) {
        console.log("[Telegram Webhook] Message is already up to date. Treating as success.");
        return { ok: true, result: true };
      }
      throw new Error(`Telegram API Error ${response.status}: ${errText}`);
    } catch (err) {
      lastError = err;
      console.warn(`[Telegram Webhook Retry] Attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError || new Error("All Telegram fetch attempts failed.");
}

/**
 * Standard formats and utilities inside node
 */
function formatPhoneNumber(phone) {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("994")) {
    digits = "0" + digits.substring(3);
  } else if (!digits.startsWith("0")) {
    if (digits.length === 9) {
      digits = "0" + digits;
    }
  }
  return digits;
}

function generateDateTimeOrderNumber(createdAtStr, existingSales) {
  const dateObj = createdAtStr ? new Date(createdAtStr) : new Date();
  let minKey = "";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(dateObj);
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const yy = partMap.year.slice(-2);
    const mm = partMap.month;
    const dd = partMap.day;
    const hh = partMap.hour;
    const min = partMap.minute;
    minKey = `${yy}${mm}${dd}-${hh}${min}`;
  } catch (err) {
    const yy = String(dateObj.getFullYear()).slice(-2);
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const min = String(dateObj.getMinutes()).padStart(2, "0");
    minKey = `${yy}${mm}${dd}-${hh}${min}`;
  }

  const basePattern = `#AYV-${minKey}`;
  const matches = existingSales.filter(s => {
    if (!s || !s.orderNumber) return false;
    const normalizedNo = s.orderNumber.replace(/^#+/, "#");
    return normalizedNo === basePattern || normalizedNo.startsWith(basePattern + "-");
  });

  if (matches.length === 0) {
    return basePattern;
  }

  let maxSuffix = 0;
  matches.forEach(m => {
    const normalizedNo = m.orderNumber.replace(/^#+/, "#");
    const suffixStr = normalizedNo.replace(basePattern, "");
    if (suffixStr.startsWith("-")) {
      const num = parseInt(suffixStr.slice(1), 10);
      if (!isNaN(num) && num > maxSuffix) {
        maxSuffix = num;
      }
    }
  });

  return `${basePattern}-${maxSuffix + 1}`;
}

async function findOrCreateCustomer(db, name, phone) {
  const cleanPhone = formatPhoneNumber(phone);
  let matchedCustomerId = "";

  try {
    const snap = await db.collection("customers").where("phone", "==", cleanPhone).get();
    if (!snap.empty) {
      matchedCustomerId = snap.docs[0].id;
    }
  } catch (queryErr) {
    console.error("Error querying customers by phone:", queryErr);
  }

  if (matchedCustomerId) {
    return matchedCustomerId;
  }

  const newId = `cust_${Date.now()}`;
  try {
    await db.collection("customers").doc(newId).set({
      id: newId,
      name: name || "Naməlum Müştəri",
      phone: cleanPhone,
      addresses: [],
      createdAt: new Date().toISOString(),
      isVIP: false,
      orderCount: 0,
      totalSpent: 0,
      systemSecret: "AyvelServiceSecretSuper2026"
    });
  } catch (writeErr) {
    console.error("Error creating new customer:", writeErr);
  }

  return newId;
}

/**
 * Highly resilient, self-healing Gemini API wrapper with exponential retries and fallback models.
 */
async function callGeminiAPI(prompt, systemInstruction = "", responseSchema = null) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error("[Gemini API] GEMINI_API_KEY mühit dəyişəni təyin edilməyib. Firebase Functions config-dən yoxlayın.");
  }
  
  const models = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  let lastError = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Gemini Cloud Function API] Invoking generation with model "${model}" (Attempt ${attempt}/2)...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        
        const payload = {
          contents: [{ parts: [{ text: prompt }] }],
        };

        if (systemInstruction) {
          payload.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const config = {};
        if (responseSchema) {
          config.responseMimeType = "application/json";
          config.responseSchema = responseSchema;
        }
        if (Object.keys(config).length > 0) {
          payload.generationConfig = config;
        }

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "aistudio-build"
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini HTTP Error ${res.status}: ${errText}`);
        }

        const data = await res.json();
        if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
          const text = data.candidates[0].content.parts[0].text;
          console.log(`[Gemini Cloud Function API] Successful generation from ${model}!`);
          return { text };
        }
        
        throw new Error("Could not parse output from model response candidates.");
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini Cloud Function API Warning] ${model} attempt ${attempt} failed: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error("All Gemini generation attempts failed.");
}

/**
 * Parse Azerbaijan free text through Gemini SDK
 */
async function parseFreeTextOrder(text) {
  const prompt = `Azərbaycan dilində yazılmış sərbəst mətndən sifariş məlumatlarını çıxar və JSON formatında qaytar.
Giriş mətni:
"${text}"`;

  const systemInstruction = `Sən Ayvel biznes idarəetmə sisteminin ağıllı və çox qabiliyyətli köməkçi operatorusan.
Sənin yeganə vəzifən: daxil edilən və ya təqdim olunan sərbəst Azərbaycan mətnindən (müştəri müraciəti, sifariş mesajı) sifariş məlumatlarını tam şəkildə çıxarıb strukturlaşdırılmış JSON formatında qaytarmaqdır.

ƏN VACİB QAYDALAR:
1. Yalnız təmiz JSON formatında cavab qaytar. Cavabda heç bir markdown bloku (\`\`\`json kimi), giriş, çıxış, şərh və ya əlavə mətn yazma. Heç bir əlavə simvol olmamalıdır.
2. Əgər daxil edilən mətndə sifarişlə bağlı hər hansı detal (müştəri adı, telefon, yer/ünvan və s.) varsa, 'isOrder' sahəsini true təyin et. Yalnız mətndə tamamilə sifarişlə əlaqəsi olmayan söhbət varsa false təyin et.
3. Heç vaxt sahələrin idarəetmə adlarını (məsələn: "customerName", "phone", "address") xüsusi dəyər (string value) kimi hər hansı bir sahəyə yazma. Əgər məlumat yoxdursa və ya tapılmayıbsa, həmin sahəni mütləq və mütləq null təyin et!

BÖLMƏLƏRİN SƏSİZ VƏ DƏQİQ ANALİZİ:

- customerName (MÜŞTƏRİ ADI):
  Uğurlu şəkildə Azərbaycan ad-soyadlarını çıxar. Mətndə hər hansı bir real şəxs adı və soyadı (məs. "Şəhla Qasımova", "Feride Kerimova", "Gülnarə Əlibəyli", "Əziz Allahverdiyev", "Nərmin Məmmədova" və s.) varsa, bunu mütləq müştərinin adı kimi seç.
  DİQQƏT: Telegram-dan kopyalanıb atılan mətndə lap başda göndəricinin nick-i gələ bilər (məsələn, "Kerimoff", "Ayvelin" və s.). Sən bu nick-i müştəri adı hesab etmə! Həmin nick-in altında və ya davamında yazılan real Azərbaycan ad-soyadını (məsələn, "Şəhla Qasımova") bütöv şəkildə tap və müştəri adı et. Əgər heç bir real ad tapılmasa, null təyin et.

- phone (TELEFON NÖMRƏSİ):
  Mətndəki hər hansı telefon nömrəsini (məs. 055 897 19 97, +994519430005, 0519430005, 055-123-45-67) tapıb 'phone' sahəsinə yaz.

- address (ÇATDIRILMA ÜNVANI):
  Müştərinin çatdırılma ünvanını tam şəkildə tap və 'address' sahəsinə yaz (məs. "Puşkin parkının yanı", "Yasamal rayonu", "Yasamal r.", "Xətai metrosu", "Mətbuat prospekti" və s.). Ünvanı heç vaxt boş buraxma, əgər mətndə hər hansı bir yer adı, ünvan qeydi varsa.

- courierName (KURYER ADI):
  Əgər mətndə kuryer adı və ya xidməti qeyd olunubsa (məs. "Columba", "Columba.az", "Kənan", "Tural"), onu 'courierName' sahəsinə yaz. Əgər kuryer barədə heç bir məlumat yoxdursa, bunu null qaytar. Heç vaxt "customerName" və ya hər hansı başqa sahə adını bura yazma!

- products (MƏHSULLAR):
  Mətndəki məhsulları və onların saylarını dəqiq massiv şəklində çıxar.
  MƏHSUL QAYDASI: Əgər mətndə məhsul adı xüsusi qeyd olunmayıbsa (məsələn, mətndə yalnız ad, telefon və ünvan varsa), DEFAULT olaraq aşağıdakı obyekti products massivinə yaz:
  {
    "name": "Ayvelin 100 ml",
    "quantity": 1,
    "price": 40,
    "note": null
  }
  Əgər qiymət mətndə fərqli yazılıbsa (məsələn, 35 azn, 30 manat), həmin qiyməti 'price' sahəsinə yaz.

NÜMUNƏLƏR (Giriş mətnləri və onlara uyğun dəqiq JSON çıxışları):

NÜMUNƏ 1:
Giriş mətni:
"""
Kerimoff
Şəhla Qasımova 055 897 19 97 Ayvelin 40 Puşkin parkının yanı
"""
Çıxış JSON:
{
  "isOrder": true,
  "customerName": "Şəhla Qasımova",
  "phone": "055 897 19 97",
  "address": "Puşkin parkının yanı",
  "products": [
    {
      "name": "Ayvelin 100 ml",
      "quantity": 1,
      "price": 40,
      "note": null
    }
  ],
  "courierFee": 0,
  "courierName": null,
  "note": null
}

NÜMUNƏ 2:
Giriş mətni:
"""
Tural bəy, +994503332211, Yasamal r., 2 ədəd Ayvelin 35 manatdan. Kuryer Columba.az 3 AZN
"""
Çıxış JSON:
{
  "isOrder": true,
  "customerName": "Tural bəy",
  "phone": "+994503332211",
  "address": "Yasamal r.",
  "products": [
    {
      "name": "Ayvelin 100 ml",
      "quantity": 2,
      "price": 35,
      "note": null
    }
  ],
  "courierFee": 3,
  "courierName": "Columba.az",
  "note": null
}

NÜMUNƏ 3:
Giriş mətni:
"""
Salam, bu güyə çatdıraq. Elvin Məmmədov 077-444-55-66 Nərimanov metrosu çıxışı
"""
Çıxış JSON:
{
  "isOrder": true,
  "customerName": "Elvin Məmmədov",
  "phone": "077-444-55-66",
  "address": "Nərimanov metrosu çıxışı",
  "products": [
    {
      "name": "Ayvelin 100 ml",
      "quantity": 1,
      "price": 40,
      "note": null
    }
  ],
  "courierFee": 0,
  "courierName": null,
  "note": null
}`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      isOrder: { type: "BOOLEAN", description: "Mətnin həqiqətən bir sifariş olub-olmaması" },
      customerName: { type: "STRING", description: "Müştərinin adı soyadı" },
      phone: { type: "STRING", description: "Müştərinin telefon nömrəsi" },
      address: { type: "STRING", description: "Çatdırılma ünvanı" },
      products: {
        type: "ARRAY",
        description: "Sifariş olunmuş məhsullar",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Məhsulun adı" },
            quantity: { type: "INTEGER", description: "Məhsulun miqdarı/Sayı" },
            price: { type: "NUMBER", description: "Məhsulun vahid qiyməti" },
            note: { type: "STRING", description: "Əlavə qeyd" },
          },
          required: ["name", "quantity", "price"]
        }
      },
      courierFee: { type: "NUMBER", description: "Kuryer ödənişi" },
      courierName: { type: "STRING", description: "Kuryerin adı" },
      note: { type: "STRING", description: "Digər xüsusi qeydlər" }
    },
    required: ["isOrder", "customerName", "phone", "address", "products", "courierFee", "courierName"]
  };

  const response = await callGeminiAPI(prompt, systemInstruction, responseSchema);

  try {
    const rawParsed = JSON.parse(response.text || "{}");
    console.log("[Telegram AI Parser] Raw response object from Model:", rawParsed);

    if (rawParsed && rawParsed.isOrder) {
      const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

      // 1. RECOVERY SYSTEM FOR CUSTOMER PHONE NUMBERS
      if (!rawParsed.phone || rawParsed.phone.trim().length < 5) {
        const digitClean = text.replace(/[\(\)\-\s]/g, "");
        const match = digitClean.match(/(0\d{9})|(\+994\d{9})|(994\d{9})/);
        if (match) {
          rawParsed.phone = match[0];
        } else {
          const spaceMatch = text.match(/\d[\d\s\-]{6,15}/);
          if (spaceMatch) {
            rawParsed.phone = spaceMatch[0].trim();
          }
        }
      }

      // 2. RECOVERY SYSTEM FOR THE CUSTOMER NAME
      const curName = String(rawParsed.customerName || "").trim();
      if (!curName || 
          curName === "Simsiz Sifarişçi" || 
          curName === "Simsiz Müştəri" || 
          curName === "Naməlum Müştəri") {
        
        let candidateName = "";
        for (const line of lines) {
          const lower = line.toLowerCase();
          const digitCount = (line.match(/\d/g) || []).length;
          const hasManyDigits = digitCount > 3;
          
          const isProduct = lower.includes("ayvelin") || lower.includes("azn") || lower.includes("manat") || lower.includes("ədəd") || lower.includes("edəd");
          const isAddress = lower.includes("metro") || lower.includes(" r.") || lower.includes("park") || lower.includes("yaxın") || lower.includes("yanın") || lower.includes("küç") || lower.includes("kuc") || lower.includes("bina") || lower.includes("mənzil") || lower.includes("poct") || lower.includes("poçt") || lower.includes("rayon") || lower.includes("şəhər") || lower.includes("weher") || lower.includes("seher") || lower.includes("ünvan") || lower.includes("unvan");
          
          if (!hasManyDigits && !isProduct && !isAddress && line.length > 3 && line.length < 32) {
            if (/[a-zA-ZıİöÖüÜşŞçÇğĞəƏ]/.test(line)) {
              candidateName = line;
              break;
            }
          }
        }
        if (candidateName) {
          console.log(`[Telegram AI Parser] Heuristically recovered Name candidate: "${candidateName}"`);
          rawParsed.customerName = candidateName;
        }
      }

      // 3. RECOVERY SYSTEM FOR PHYSICAL ADDRESS
      const curAddr = String(rawParsed.address || "").trim().toLowerCase();
      if (!rawParsed.address || 
          curAddr === "təyin edilməyib" || 
          curAddr === "məlumat yoxdur" || 
          curAddr === "null") {
        
        let candidateAddress = "";
        for (const line of lines) {
          const lower = line.toLowerCase();
          const isAddrKeyword = lower.includes("metro") || lower.includes(" r.") || lower.includes("park") || lower.includes("yaxın") || lower.includes("yanın") || lower.includes("küç") || lower.includes("kuc") || lower.includes("bina") || lower.includes("mənzil") || lower.includes("poct") || lower.includes("poçt") || lower.includes("rayon") || lower.includes("şəhər") || lower.includes("weher") || lower.includes("seher") || lower.includes("ünvan") || lower.includes("unvan") || lower.includes("poçtu") || lower.includes("poctu");
          
          if (isAddrKeyword && line.length > 4) {
            candidateAddress = line;
            break;
          }
        }
        
        if (!candidateAddress && lines.length >= 2) {
          const lastLine = lines[lines.length - 1];
          const lowerLast = lastLine.toLowerCase();
          const hasDigits = (lastLine.match(/\d/g) || []).length > 4;
          const isProd = lowerLast.includes("ayvelin") || lowerLast.includes("azn") || lowerLast.includes("manat") || lowerLast.includes("ədəd") || lowerLast.includes("edəd");
          
          if (!hasDigits && !isProd && lastLine.length > 4) {
            candidateAddress = lastLine;
          }
        }

        if (candidateAddress) {
          console.log(`[Telegram AI Parser] Heuristically recovered Address candidate: "${candidateAddress}"`);
          rawParsed.address = candidateAddress;
        }
      }

      // 4. AZƏRPOÇT & EXPARGO SMART ROUTING RULES
      const textLower = text.toLowerCase();
      
      const isAzerpoct = textLower.includes("poct") || 
                        textLower.includes("poçt") || 
                        textLower.includes("post") || 
                        textLower.includes("poczta") ||
                        textLower.includes("mərkəzi poçt") || 
                        textLower.includes("merkezi poct");

      if (isAzerpoct) {
        console.log("[Telegram AI Parser] Azerpoct keyword caught. Routing delivery to Azərpoçt...");
        rawParsed.courierName = "Azərpoçt";
        
        const isNakhchivan = textLower.includes("naxçıvan") || 
                             textLower.includes("naxcivan") || 
                             textLower.includes("naxçivan") || 
                             textLower.includes("naxcıvan") || 
                             textLower.includes("naxchivan");
        if (isNakhchivan) {
          rawParsed.courierFee = 5;
        } else {
          rawParsed.courierFee = 3;
        }
      } 
      else if (textLower.includes("kargo") || textLower.includes("expargo")) {
        console.log("[Telegram AI Parser] Expargo/Cargo keyword caught. Selecting Expargo.");
        rawParsed.courierName = "Expargo";
        if (rawParsed.courierFee === undefined || rawParsed.courierFee === null) {
          rawParsed.courierFee = 0;
        }
      }
    }

    return rawParsed;
  } catch (e) {
    console.error("[Telegram AI Parser] Failed to parse generated AI output:", e, response.text);
    return { isOrder: false };
  }
}

async function registerParsedOrder(db, parsed, telegramMessageId) {
  const cleanMessageId = String(telegramMessageId);
  const finalId = telegramMessageId ? `sale_tg_${cleanMessageId}` : `sale_${Date.now()}`;

  if (telegramMessageId) {
    try {
      const directSnap = await db.collection("sales").doc(finalId).get();
      if (directSnap.exists) {
        console.log(`[Telegram Bot] Order with deterministic ID ${finalId} already exists in Firestore. Skipping.`);
        return "DUPLICATE";
      }

      const q1 = await db.collection("sales").where("telegramMessageId", "==", cleanMessageId).get();
      const q2 = await db.collection("sales").where("incomingTelegramMessageId", "==", cleanMessageId).get();
      if (!q1.empty || !q2.empty) {
        console.log(`[Telegram Bot] Order with telegramMessageId ${telegramMessageId} already exists in Firestore. Skipping.`);
        return "DUPLICATE";
      }
    } catch (checkErr) {
      console.error("[Telegram Bot] Error checking duplicate telegramMessageId:", checkErr);
    }
  }

  const createdAtVal = new Date().toISOString();

  // Load existing sales around Baku day key pattern
  let minKey = "";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    minKey = `${partMap.year.slice(-2)}${partMap.month}${partMap.day}-${partMap.hour}${partMap.minute}`;
  } catch (e) {
    const dateObj = new Date();
    const yy = String(dateObj.getFullYear()).slice(-2);
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const min = String(dateObj.getMinutes()).padStart(2, "0");
    minKey = `${yy}${mm}${dd}-${hh}${min}`;
  }

  const basePattern = `#AYV-${minKey}`;
  const existingSales = [];
  try {
    const querySnap = await db.collection("sales")
      .where("orderNumber", ">=", basePattern)
      .where("orderNumber", "<=", basePattern + "\uf8ff")
      .get();
    querySnap.forEach((doc) => {
      existingSales.push(doc.data());
    });
  } catch (err) {
    console.error("Failed to query existing sales pattern:", err);
  }

  const orderNumber = generateDateTimeOrderNumber(createdAtVal, existingSales);

  // Fetch products catalogue
  let dbProducts = [];
  try {
    const productsSnapshot = await db.collection("products").get();
    productsSnapshot.forEach((doc) => {
      dbProducts.push(doc.data());
    });
  } catch (prodErr) {
    console.error("Failed to fetch products catalogue:", prodErr);
  }

  const items = (parsed.products || []).map((parsedProd) => {
    const matched = dbProducts.find((p) =>
      p.name.toLowerCase().includes(parsedProd.name.toLowerCase()) ||
      parsedProd.name.toLowerCase().includes(p.name.toLowerCase())
    );
    if (matched) {
      const qty = Number(parsedProd.quantity || 1);
      const unitPrice = typeof parsedProd.price === "number" ? parsedProd.price : matched.price;
      return {
        productId: matched.id,
        productName: matched.name,
        qty,
        unitPrice,
        total: qty * unitPrice
      };
    } else {
      const defaultProd = dbProducts.find(p => p.name.toLowerCase().includes("ayvelin")) || dbProducts[0];
      const qty = Number(parsedProd.quantity || 1);
      const unitPrice = typeof parsedProd.price === "number" ? parsedProd.price : 40;
      return {
        productId: defaultProd ? defaultProd.id : "unknown",
        productName: parsedProd.name || "Ayvelin 100 ml",
        qty,
        unitPrice,
        total: qty * unitPrice
      };
    }
  });

  if (items.length === 0) {
    const defaultProd = dbProducts.find(p => p.name.toLowerCase().includes("ayvelin")) || dbProducts[0];
    items.push({
      productId: defaultProd ? defaultProd.id : "unknown",
      productName: "Ayvelin 100 ml",
      qty: 1,
      unitPrice: 40,
      total: 40
    });
  }

  const phoneFormatted = formatPhoneNumber(parsed.phone || "");
  const customerName = parsed.customerName || "Simsiz Sifarişçi";
  const customerId = await findOrCreateCustomer(db, customerName, phoneFormatted);

  let deliveryType = "courier";
  let cargoCompany = "";
  let courierId = "";
  let courierName = "";

  let courierSearchTerm = parsed.courierName ? parsed.courierName.trim() : "";
  const normalizedCourier = courierSearchTerm.toLowerCase();

  let dbCouriers = [];
  try {
    const couriersSnapshot = await db.collection("couriers").get();
    couriersSnapshot.forEach((doc) => {
      dbCouriers.push(doc.data());
    });
  } catch (courierErr) {
    console.error("Failed to fetch couriers list:", courierErr);
  }

  if (normalizedCourier === "azərpoçt" || normalizedCourier === "azerpoct") {
    deliveryType = "Azərpoçt";
    cargoCompany = "Azərpoçt";
  } else if (normalizedCourier === "expargo") {
    deliveryType = "expargo";
    cargoCompany = "Expargo";
  } else if (normalizedCourier === "cargo" || normalizedCourier === "kargo") {
    deliveryType = "cargo";
    cargoCompany = "Kargo";
  } else {
    deliveryType = "courier";
    if (!courierSearchTerm || 
        normalizedCourier === "təyin edilməyib" || 
        normalizedCourier === "məlumat yoxdur" || 
        normalizedCourier === "null" ||
        normalizedCourier === "customername" ||
        normalizedCourier === "phone" ||
        normalizedCourier === "address") {
      courierSearchTerm = "Columba.az";
    }

    const matchedCourier = dbCouriers.find(c =>
      c.name.toLowerCase().includes(courierSearchTerm.toLowerCase()) ||
      courierSearchTerm.toLowerCase().includes(c.name.toLowerCase())
    );
    if (matchedCourier) {
      courierId = matchedCourier.id;
      courierName = matchedCourier.name;
    } else {
      if (courierSearchTerm.toLowerCase().includes("columba")) {
        courierId = "columba_az";
        courierName = "Columba.az";
      } else {
        courierId = `cour_${Date.now()}`;
        courierName = courierSearchTerm;
      }
    }
  }

  const totalProductPrice = items.reduce((sum, item) => sum + item.total, 0);
  let deliveryCost = Number(parsed.courierFee || 0);

  // Əgər kuryer təyin edilib amma qiymət yoxdursa — kuryerin standart haqqını al
  if (deliveryCost === 0 && courierId) {
    const assignedCourier = dbCouriers.find(c => c.id === courierId);
    if (assignedCourier && assignedCourier.standardDeliveryFee > 0) {
      deliveryCost = assignedCourier.standardDeliveryFee;
      console.log(`[registerParsedOrder] courierFee=0, using standardDeliveryFee=${deliveryCost} from courier "${assignedCourier.name}"`);
    }
  }

  const discountAmount = Number(parsed.discountAmount || parsed.discount || 0);
  const totalAmount = Math.max(0, totalProductPrice - discountAmount);
  const netRevenue = Math.max(0, totalProductPrice - discountAmount - deliveryCost);

  const sale = {
    id: finalId,
    orderNumber,
    customerId,
    customerName,
    customerPhone: phoneFormatted,
    address: parsed.address || "Təyin edilməyib",
    items,
    deliveryType,
    courierId: deliveryType === "courier" ? (courierId || "") : "",
    courierName: deliveryType === "courier" ? (courierName || "") : "",
    cargoCompany: deliveryType !== "courier" ? (cargoCompany || "") : "",
    deliveryCost,
    discountAmount,
    totalProductPrice,
    totalAmount,
    netRevenue,
    status: "gözləyir",
    paymentStatus: "ödənilməyib",
    notes: parsed.note || "",
    createdAt: createdAtVal,
    order_date: admin.firestore.Timestamp.fromDate(new Date(createdAtVal)),
    delivery_date: null,
    isRevenueCalculated: false,
    statusHistory: [{ status: "gözləyir", changedAt: createdAtVal }],
    source: "manual",
    telegramMessageId: String(telegramMessageId),
    incomingTelegramMessageId: String(telegramMessageId),
    systemSecret: "AyvelServiceSecretSuper2026"
  };

  try {
    await db.collection("sales").doc(finalId).set(sale);
  } catch (writeErr) {
    console.error("Failed to write registered sale into database:", writeErr);
  }

  return finalId;
}

function buildOriginalMessageText(sale) {
  const displayOrderNum = sale.orderNumber?.startsWith("#")
    ? sale.orderNumber
    : `#${sale.orderNumber || "?"}`;

  const courier =
    sale.deliveryType === "courier"
      ? sale.courierName || "Kuryer təyin edilməyib"
      : sale.cargoCompany || sale.deliveryType || "Kargo";

  const itemLines = (sale.items && sale.items.length > 0)
    ? sale.items.map((it, i) => {
        const name = it.productName || "Ayvelin 100 ml";
        const qty = it.qty || 1;
        const price = it.unitPrice || 40;
        return `${i + 1}. 📦 ${name} — ${qty} ədəd × ${price} AZN`;
      }).join("\n")
    : "1. 📦 Ayvelin 100 ml — 1 ədəd × 40 AZN";

  const deliveryLine = sale.deliveryCost && sale.deliveryCost > 0
    ? `\n🚛 Çatdırılma: ${sale.deliveryCost} AZN`
    : "";

  const noteLine = sale.notes && sale.notes.trim()
    ? `\n📝 Qeyd: ${sale.notes.trim()}`
    : "";

  const customerPhone = sale.customerPhone
    ? sale.customerPhone
    : "Nömrə yoxdur";

  return `🛍 Sifariş: ${displayOrderNum}
👤 Müştəri: ${sale.customerName || "Simsiz Müştəri"}
📱 Telefon: ${customerPhone}
📍 Ünvan: ${sale.address || "Məlumat yoxdur"}

🧾 Məhsullar:
${itemLines}

💰 Cəm: ${sale.totalAmount || 40} AZN${deliveryLine}
🚚 Kuryer: ${courier}${noteLine}

⏳ Status: Gözləyir`;
}

async function sendTelegramConfirmation(chatId, replyToMessageId, sale) {
  const baseText = buildOriginalMessageText(sale);
  const message = `🆕 Yeni Sifariş Qeydə Alındı!\n\n${baseText}`;

  try {
    const data = await fetchTelegramWithRetry(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        reply_to_message_id: replyToMessageId
      })
    });
    console.log(`[Telegram Bot] Confirmation reply successfully sent to message ${replyToMessageId}`);
    return data;
  } catch (err) {
    console.error("[Telegram Bot] Failed to send telegram confirmation message:", err);
    return null;
  }
}

async function getLiveContextData(db) {
  const salesSnap = await db.collection("sales").get();
  const sales = [];
  salesSnap.forEach(s => {
    sales.push({ id: s.id, ...s.data() });
  });

  const expensesSnap = await db.collection("expenses").get();
  const expenses = [];
  expensesSnap.forEach(e => {
    expenses.push({ id: e.id, ...e.data() });
  });

  const couriersSnap = await db.collection("couriers").get();
  const couriers = [];
  couriersSnap.forEach(c => {
    couriers.push({ id: c.id, ...c.data() });
  });

  const productsSnap = await db.collection("products").get();
  const products = [];
  productsSnap.forEach(p => {
    products.push({ id: p.id, ...p.data() });
  });

  let todayStr = "";
  let curMonth = "";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(new Date());
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
    todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`; // YYYY-MM-DD
    curMonth = todayStr.substring(0, 7); // YYYY-MM
  } catch (err) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    todayStr = `${y}-${m}-${d}`;
    curMonth = `${y}-${m}`;
  }

  const todaySales = sales.filter((s) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 10) : "";
    return sDate === todayStr && (s.status === "çatdırıldı" || s.status === "çatdırılıb");
  });
  const todayRev = todaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  
  const todayCount = sales.filter((s) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 10) : "";
    return sDate === todayStr;
  }).length;

  const todayExp = expenses.filter((e) => {
    const eDate = e.date ? e.date.substring(0, 10) : (e.createdAt ? e.createdAt.substring(0, 10) : "");
    return eDate === todayStr;
  }).reduce((acc, e) => acc + (e.amount || 0), 0);

  const monthSales = sales.filter((s) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 7) : "";
    return sDate === curMonth && (s.status === "çatdırıldı" || s.status === "çatdırılıb");
  });
  const monthRev = monthSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  
  const monthCount = sales.filter((s) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 7) : "";
    return sDate === curMonth;
  }).length;

  const monthExp = expenses.filter((e) => {
    const eDate = e.date ? e.date.substring(0, 7) : (e.createdAt ? e.createdAt.substring(0, 7) : "");
    return eDate === curMonth;
  }).reduce((acc, e) => acc + (e.amount || 0), 0);

  const courierSummary = couriers.map((c) => `- ${c.name}: Status=${c.status || "active"}, Telefon=${c.phone || "yoxdur"}, Balans=${c.stockBalance ?? 0} ədəd, Sifarişlər=${c.totalDeliveries ?? 0}`).join("\n");
  const productSummary = products.map((p) => `- ${p.name}: Stok=${p.stock ?? 0} ədəd, Qiymət=${p.price ?? 40} AZN, Mayası=${p.costPrice ?? 20} AZN`).join("\n");

  return {
    todayStr,
    curMonth,
    todayRev,
    todayCount,
    todayExp,
    todayNet: todayRev - todayExp,
    monthRev,
    monthCount,
    monthExp,
    monthNet: monthRev - monthExp,
    courierSummary,
    productSummary,
    rawSalesCount: sales.length,
    rawExpensesCount: expenses.length
  };
}

async function generateIntelligentBusinessAnswer(db, queryText) {
  let contextInfo;
  try {
    contextInfo = await getLiveContextData(db);
  } catch (err) {
    console.error("Error gathering business data for AI:", err);
    contextInfo = { todayStr: "Məlum deyil" };
  }

  const systemInstruction = `Sən Ayvel Biznes Sisteminin baş analitiki və ağıllı proqnozlaşdırma köməkçisisən (AI Business Intelligence).
Sənə Ayvel şirkətinin real vaxt verilənlər bazasından gələn mühüm statistik rəqəmlər təqdim olunur. Sənin vəzifən: adminin və ya sual verən komanda üzvünün suallarına tam dəqiq, rəqəmlərə əsaslanan, proqnozlaşdırıcı və optimist cavablar verməkdir.

Cari tarix statusu: ${contextInfo.todayStr || "Məlum deyil"}
Bu ay: ${contextInfo.curMonth || "Məlum deyil"}

GÜNLÜK METRİKLƏR (Bugün):
- Çatdırılmış satış məbləği (Gəlir): ${contextInfo.todayRev ?? 0} AZN
- Cəmi qeydə alınmış yeni sifariş sayı: ${contextInfo.todayCount ?? 0} ədəd
- Bugünün xərcləri: ${contextInfo.todayExp ?? 0} AZN
- Net qazanc (todayRev - todayExp): ${contextInfo.todayNet ?? 0} AZN

AYLIQ METRİKLƏR (Bu Ay):
- Çatdırılmış satış məbləği (Aylıq Gəlir): ${contextInfo.monthRev ?? 0} AZN
- Aylıq cəmi qeydə alınmış yeni sifariş sayı: ${contextInfo.monthCount ?? 0} ədəd
- Aylıq xərclər: ${contextInfo.monthExp ?? 0} AZN
- Net aylıq gəlir (monthRev - monthExp): ${contextInfo.monthNet ?? 0} AZN

KURYERLƏRİN BİZNES STATUSU VƏ STOK BALANSLARI:
${contextInfo.courierSummary || "Kuryer məlumatı yoxdur"}

ANBARDARI MƏHSUL VƏ STOK VƏZİYYƏTİ:
${contextInfo.productSummary || "Məhsul məlumatı yoxdur"}

ÜMUMİ SİSTEM GÖSTƏRİCİLƏRİ:
Baza üzrə cəmi qeydə alınmış satışlar: ${contextInfo.rawSalesCount ?? 0}
Baza üzrə cəmi qeydə alınmış xərclər: ${contextInfo.rawExpensesCount ?? 0}

CAVABLANDIRMA VƏ FORMAT QAYDALARI:
1. Sualı həmişə Azərbaycan dilində, olduqca nəzakətli, rəsmi-işgüzar və peşəkar tonla cavabla.
2. Əgər istifadəçi "proqnoz" (forecasting, sales forecast) istəyirsə, rəqəmlərlə riyazi təxminlər apar. Məsələn, bugünkü satış temposunu ayın qalan günlərinə proqnozlaşdır, mənfəəti proqnoz et və hədəflərə necə çatmağı rəqəmli göstər!
3. Əgər istifadəçi "plan" (strategic targets, sales plan, market entry plan) istəyirsə, satışları artırmaq, kuryer stoku idarəçiliyini gücləndirmək, məhsul qalıqlarını optimallaşdırmaq və reklam xərclərinə nəzarət etmək üçün konkret 4-5 addımlıq, rəqəmsəl, fəaliyyət hədəfli və müddətli STRETEJİ PLAN yarat!
4. ÇOX VACİB: Telegram-da cavabın problemsiz göstərilməsi və teq xətalarının qarşısını almaq üçün Cavab teqləri tam bağlanmalıdır. YALNIZ aşağıdakı HTML etiketlərini istifadə edə bilərsən: <b>bold</b>, <i>italic</i>, <u>underline</u>, <code>code</code> və yeni sətirlər (\\n). Heç vaxt markdown ulduzları (**) və s. yazma! HTML və simvol ziddiyyəti olmamalıdır. Cavab səliqəli paraqraflar şəklində olmalıdır.`;

  const prompt = `Sual: "${queryText}"\nReal göstəricilərə söykənərək mükəmməl analiz və proqnoz xülasəsi hazırla:`;

  try {
    const response = await callGeminiAPI(prompt, systemInstruction);
    return response.text || "Suallara cavab verməkdə müvəqqəti xəta baş verdi.";
  } catch (err) {
    console.error("Gemini analyst generation failure:", err);
    return "Üzr istəyirik, analitik sistem hazırda suala cavab verə bilmir.";
  }
}

async function sendTelegramReply(chatId, text, replyToMessageId) {
  try {
    await fetchTelegramWithRetry(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_to_message_id: replyToMessageId
      })
    });
    console.log(`[Telegram Bot] Answer reply sent successfully to chat ${chatId}`);
  } catch (err) {
    console.error("[Telegram Bot] Failed to send query response reply message:", err);
  }
}

module.exports = {
  telegramWebhook
};
