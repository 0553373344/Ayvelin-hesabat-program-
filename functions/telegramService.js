const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8774875697:AAEfnXAQqUWgY1fGqV12H0DFkGycoM5jEBU";
const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID || "-1003879283343";

/**
 * Send a new order notification to the Telegram group.
 * @param {object} order - The order document data from Firestore 
 * @returns {Promise<number|null>} - The message_id or null on error
 */
async function sendNewOrderToTelegram(order) {
  try {
    const rawOrderNumber = order.orderNumber || "Məlum deyil";
    const orderNumber = rawOrderNumber.startsWith("#") ? rawOrderNumber : `#${rawOrderNumber}`;
    const customerName = order.customerName || "Simsiz Müştəri";
    const phone = order.phone || order.customerPhone || "Məlumat yoxdur";
    const address = order.address || "Məlumat yoxdur";
    const totalAmount = order.totalAmount !== undefined ? order.totalAmount : 40;
    const courierName = order.deliveryType === "courier"
      ? (order.courierName || "Təyin edilməyib")
      : (order.cargoCompany || order.deliveryType || "Təyin edilməyib");
    const items = order.items || [];
    const itemsText = items.map(it => `📦 Məhsul: ${it.productName}\n🔢 Sayı: ${it.qty} dənə (${it.unitPrice} AZN-dən)`).join("\n");

    const text = `🆕 Yeni Sifariş!
🔢 Sifariş: ${orderNumber}
👤 Müştəri: ${customerName}
📱 Telefon: ${phone}
📍 Ünvan: ${address}
${itemsText}
💰 Məbləğ: ${totalAmount} AZN
🚚 Kuryer: ${courierName}
⏳ Status: Gözləyir`;

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_GROUP_CHAT_ID,
        text: text
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Telegram API Error: ${errText}`);
    }

    const resJson = await response.json();
    if (resJson.ok && resJson.result) {
      return resJson.result.message_id;
    }
    return null;
  } catch (error) {
    console.error("[sendNewOrderToTelegram] Error:", error);
    return null;
  }
}

/**
 * Update/Edit a Telegram order status to Delivered
 * @param {number|string} telegramMessageId - The Telegram message ID to edit
 * @param {object} orderData - The order details to reconstruct the message
 */
async function markOrderDelivered(telegramMessageId, orderData) {
  if (!telegramMessageId) {
    console.error("[markOrderDelivered] Cannot update message: telegramMessageId is missing.");
    return;
  }

  try {
    const rawOrderNumber = orderData.orderNumber || "Məlum deyil";
    const orderNumber = rawOrderNumber.startsWith("#") ? rawOrderNumber : `#${rawOrderNumber}`;
    const customerName = orderData.customerName || "Simsiz Müştəri";
    const phone = orderData.phone || orderData.customerPhone || "Məlumat yoxdur";
    const address = orderData.address || "Məlumat yoxdur";
    const totalAmount = orderData.totalAmount !== undefined ? orderData.totalAmount : 40;
    const courierName = orderData.deliveryType === "courier"
      ? (orderData.courierName || "Təyin edilməyib")
      : (orderData.cargoCompany || orderData.deliveryType || "Təyin edilməyib");
    const items = orderData.items || [];
    const itemsText = items.map(it => `📦 Məhsul: ${it.productName}\n🔢 Sayı: ${it.qty} dənə (${it.unitPrice} AZN-dən)`).join("\n");

    // Format current Baku date & time
    let formattedDate = "";
    try {
      formattedDate = new Date().toLocaleString("az-AZ", {
        timeZone: "Asia/Baku",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      const now = new Date();
      formattedDate = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }

    let statusText = "Gözləyir ⏳";
    if (orderData.status === "çatdırılıb") {
      statusText = "Çatdırıldı ✅";
    } else if (orderData.status === "ləğv edilib") {
      statusText = "Ləğv olundu ❌";
    }

    const updatedText = `🆕 Yeni Sifariş!
🔢 Sifariş: ${orderNumber}
👤 Müştəri: ${customerName}
📱 Telefon: ${phone}
📍 Ünvan: ${address}
${itemsText}
💰 Məbləğ: ${totalAmount} AZN
🚚 Kuryer: ${courierName}
⏳ Status: ${statusText}`;

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_GROUP_CHAT_ID,
        message_id: Number(telegramMessageId),
        text: updatedText
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      if (errText.toLowerCase().includes("message is not modified")) {
        console.log(`[markOrderDelivered] Telegram message already updated.`);
      } else {
        console.error(`[markOrderDelivered] Telegram edit failed: ${errText}`);
      }
    }
  } catch (error) {
    console.error("[markOrderDelivered] Error:", error);
  }
}

module.exports = {
  sendNewOrderToTelegram,
  markOrderDelivered
};
