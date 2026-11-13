import { Sale } from "../types";
import { db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

async function logTelegramAction(
  action: string,
  status: "success" | "error" | "info",
  orderNumber: string,
  details: string,
  payload: any,
  errorMsg?: string
) {
  try {
    const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const logDoc = {
      id: logId,
      timestamp: new Date().toISOString(),
      action,
      status,
      orderNumber: orderNumber || "N/A",
      details,
      payload: JSON.stringify(payload || {}),
      error: errorMsg || ""
    };
    await setDoc(doc(db, "telegram_logs", logId), logDoc);
  } catch (err) {
    console.error("Failed to write telegram diagnostics log to Firestore:", err);
  }
}

function getApiUrl(path: string): string {
  if (typeof window !== "undefined") {
    return path;
  }
  return `http://localhost:3000${path}`;
}

/**
 * Reconstructs the original order message format.
 */
function buildOriginalMessageText(sale: Sale): string {
  const displayOrderNum = sale.orderNumber?.startsWith("#")
    ? sale.orderNumber
    : `#${sale.orderNumber || "?"}`;

  const courier =
    sale.deliveryType === "courier"
      ? sale.courierName || "Kuryer təyin edilməyib"
      : sale.cargoCompany || sale.deliveryType || "Kargo";

  const itemLines = (sale.items && sale.items.length > 0)
    ? sale.items.map((it: any, i: number) => {
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

  let statusText = "Gözləyir ⏳";
  if (sale.status === "çatdırılıb") {
    statusText = "Çatdırıldı ✅";
  } else if (sale.status === "ləğv edilib") {
    statusText = "Ləğv olundu ❌";
  }

  return `🆕 Yeni Sifariş Qeydə Alındı!

🛍 Sifariş: ${displayOrderNum}
👤 Müştəri: ${sale.customerName || "Simsiz Müştəri"}
📱 Telefon: ${customerPhone}
📍 Ünvan: ${sale.address || "Məlumat yoxdur"}

🧾 Məhsullar:
${itemLines}

💰 Cəm: ${sale.totalAmount || 40} AZN${deliveryLine}
🚚 Kuryer: ${courier}${noteLine}

⏳ Status: ${statusText}`;
}

/**
 * Sends a new order notification to the Telegram group.
 * Returns the message_id as a string if successful, otherwise null.
 */
export async function sendTelegramNewOrder(sale: Sale): Promise<string | null> {
  const isDelivered = sale.status === "çatdırılıb";
  const baseText = buildOriginalMessageText(sale);
  const text = baseText;

  const payload = {
    text: text
  };

  try {
    const response = await fetch(getApiUrl("/api/telegram/send"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy replied with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.success && data.message_id) {
      const msgId = String(data.message_id);
      await logTelegramAction(
        "Yeni Sifariş Bildirişi",
        "success",
        sale.orderNumber,
        `Sifariş qrupa göndərildi. Mesaj ID: ${msgId}`,
        payload
      );
      return msgId;
    }
    
    throw new Error(data.error || "Telegram API return ok: false or message_id missing");
  } catch (error: any) {
    console.error("Error sending Telegram notification for order:", sale.orderNumber, error);
    await logTelegramAction(
      "Yeni Sifariş Bildirişi",
      "error",
      sale.orderNumber,
      `Yaratma xətası: ${error.message || error}`,
      payload,
      error.message || String(error)
    );
    return null;
  }
}

/**
 * Automatically syncs any order status change to the Telegram bot,
 * updating the existing Telegram message text via /api/telegram/edit or triggering
 * a fallback status update message to ensure synchronization between dashboard and Telegram.
 */
export async function syncOrderStatusToTelegram(
  sale: Sale,
  oldStatus: string,
  newStatus: "gözləyir" | "çatdırılıb" | "ləğv edilib"
): Promise<boolean> {
  const displayOld = oldStatus === "çatdırılıb" ? "Çatdırıldı ✅" : oldStatus === "ləğv edilib" ? "Ləğv olundu ❌" : "Gözləyir ⏳";
  const displayNew = newStatus === "çatdırılıb" ? "Çatdırıldı ✅" : newStatus === "ləğv edilib" ? "Ləğv olundu ❌" : "Gözləyir ⏳";

  try {
    const docRef = doc(db, "sales", sale.id);
    const snap = await getDoc(docRef);
    let messageId = sale.telegram_message_id || sale.telegramMessageId || (sale as any).incomingTelegramMessageId;
    
    if (snap.exists()) {
      const data = snap.data();
      messageId = messageId || data.telegram_message_id || data.telegramMessageId || data.incomingTelegramMessageId;
    }

    if (!messageId) {
      console.warn(`[Telegram Bot] No registered message ID stored for sale ID ${sale.id}. Triggering fallback status change notification.`);
      
      const notificationText = `🔔 Sifariş Status Yenilənməsi\n\n🛍 Sifariş: #${sale.orderNumber || sale.id}\n👤 Müştəri: ${sale.customerName || "Simsiz Müştəri"}\n🔄 Status: ${displayOld} ➡️ ${displayNew}`;
      
      const response = await fetch(getApiUrl("/api/telegram/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: notificationText })
      });
      
      if (response.ok) {
        await logTelegramAction(
          "Sifariş Status Bildirişi (Yeni Mesaj)",
          "info",
          sale.orderNumber || "N/A",
          `Mesaj id tapılmadı, qrupa qoşulmuş ayrı status-change bildirişi göndərildi: ${displayOld} -> ${displayNew}`,
          { orderId: sale.id, oldStatus, newStatus }
        );
        return true;
      }
      return false;
    }

    // Refresh display details to reflect new status
    const updatedSale = { ...sale, status: newStatus };
    const updatedText = buildOriginalMessageText(updatedSale);

    const payload = {
      message_id: messageId,
      text: updatedText
    };

    const response = await fetch(getApiUrl("/api/telegram/edit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy replied with status ${response.status}: ${errText}`);
    }

    const resData = await response.json();
    if (resData.success) {
      await logTelegramAction(
        "Sifariş Status Sinxronizasiyası",
        "success",
        sale.orderNumber || "N/A",
        `Mesaj güncəlləndi (${displayOld} ➡️ ${displayNew}). Mesaj ID: ${messageId}`,
        payload
      );
      return true;
    }

    throw new Error(resData.error || "Telegram API proxy update returned false");
  } catch (error: any) {
    console.error("Error synchronizing status to Telegram:", sale.orderNumber, error);
    await logTelegramAction(
      "Sifariş Status Sinxronizasiyası (Xəta)",
      "error",
      sale.orderNumber || "N/A",
      `Sinxronizasiya xətası: ${error.message || error}`,
      { orderId: sale.id, oldStatus, newStatus },
      error.message || String(error)
    );
    return false;
  }
}

/**
 * Updates a Telegram message when the order is delivered.
 * Updates the existing Telegram message using the telegram_message_id with editMessageText.
 */
export async function updateTelegramOrderDelivered(sale: Sale): Promise<boolean> {
  return syncOrderStatusToTelegram(sale, "gözləyir", "çatdırılıb");
}

/**
 * Verifies active token connection via Telegram getMe
 */
export async function verifyTelegramBotConnection(): Promise<{ success: boolean; botName?: string; error?: string }> {
  try {
    const response = await fetch("/api/telegram/status");
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Sends a test push message to the chat group and logs the result
 */
export async function sendTelegramTestMessage(text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const payload = {
    text: text
  };

  try {
    const response = await fetch("/api/telegram/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      await logTelegramAction(
        "Sınaq Mesajı Göndərilməsi",
        "success",
        "TEST",
        `Sınaq mesajı qrupa göndərildi. Mesaj ID: ${data.messageId}`,
        payload
      );
      return { success: true, messageId: data.messageId };
    }
    
    const errMsg = data.error || "Uğursuz API cavabı.";
    throw new Error(errMsg);
  } catch (err: any) {
    console.error("Telegram test message failed:", err);
    await logTelegramAction(
      "Sınaq Mesajı Göndərilməsi",
      "error",
      "TEST",
      `Sınaq mesajı xətası: ${err.message || err}`,
      payload,
      err.message || String(err)
    );
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Sends a real-time test of the full daily report and logs the result
 */
export async function sendTelegramReportTest(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("/api/telegram/report-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      await logTelegramAction(
        "Gün Sonu Hesabat Sınağı",
        "success",
        "REPORT_TEST",
        "Sınaq gün sonu hesabatı uğurla qrupa göndərildi.",
        {}
      );
      return { success: true };
    }
    
    const errMsg = data.error || "Uğursuz API hesabat cavabı.";
    throw new Error(errMsg);
  } catch (err: any) {
    console.error("Telegram report test failed:", err);
    await logTelegramAction(
      "Gün Sonu Hesabat Sınağı",
      "error",
      "REPORT_TEST",
      `Hesabat sınaq xətası: ${err.message || err}`,
      {},
      err.message || String(err)
    );
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Triggers a manual sync sweep of the Telegram Bot updates to parse manual entries
 */
export async function triggerTelegramManualSync(): Promise<{ success: boolean; processedCount: number; duplicatedCount: number; info?: string; error?: string }> {
  try {
    const response = await fetch("/api/telegram/manual-check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err: any) {
    return { success: false, processedCount: 0, duplicatedCount: 0, error: err.message || String(err) };
  }
}

