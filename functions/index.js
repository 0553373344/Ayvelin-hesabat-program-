const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const express = require("express");
const cors = require("cors");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Import separate modular service files
const { 
  sendNewOrderToTelegram, 
  markOrderDelivered 
} = require("./telegramService");

const { 
  generateAndSendDailyReport 
} = require("./dailyReport");

const { 
  telegramWebhook 
} = require("./webhookHandler");

// Initialize Express for the Webhook handler
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Main webhook route
app.post("/", telegramWebhook);

// Export Cloud Functions
exports.telegramWebhookEndpoint = onRequest(
  { cors: true, maxInstances: 10 },
  app
);

exports.telegramWebhook = onRequest(
  { cors: true, maxInstances: 10 },
  app
);

exports.nightlyAutomaticReport = onSchedule(
  {
    schedule: "0 21 * * *", // 21:00 Baku Time (UTC+4)
    timeZone: "Asia/Baku"
  },
  async (event) => {
    await generateAndSendDailyReport();
  }
);

// Auto-delete helpers and Firestore onCreate triggers
async function processManualMessageAutoDelete(db) {
  try {
    const docSnap = await db.collection("settings").doc("telegram_owner").get();
    if (!docSnap.exists) {
      console.log("[Auto-Delete] No telegram_owner settings found.");
      return;
    }

    const data = docSnap.data();
    const owner_message_id = data.owner_message_id;
    const owner_chat_id = data.owner_chat_id;

    if (!owner_message_id || !owner_chat_id) {
      console.log("[Auto-Delete] No active owner_message_id or owner_chat_id stored.");
      return;
    }

    console.log(`[Auto-Delete] Stored owner message detected. ID: ${owner_message_id}, Chat: ${owner_chat_id}. Calling deleteMessage API...`);

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8774875697:AAEfnXAQqUWgY1fGqV12H0DFkGycoM5jEBU";
    
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: owner_chat_id,
        message_id: Number(owner_message_id)
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Auto-Delete] Telegram deleteMessage failed: ${errText}`);
    } else {
      const resJson = await response.json();
      console.log(`[Auto-Delete] Telegram deleteMessage succeeded:`, resJson);
    }
  } catch (err) {
    console.error("[Auto-Delete] Error deleting manual message:", err);
  } finally {
    try {
      // STEP 5 — CLEANUP:
      // After successful deletion, set owner_message_id = null in Firestore.
      await db.collection("settings").doc("telegram_owner").set({
        owner_message_id: null
      }, { merge: true });
      console.log("[Auto-Delete] Cleanup completed: owner_message_id set to null in Firestore.");
    } catch (cleanupErr) {
      console.error("[Auto-Delete] Cleanup error:", cleanupErr);
    }
  }
}

exports.onSaleCreatedTrigger = onDocumentCreated("sales/{saleId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return null;
  const saleData = snapshot.data();
  const db = admin.firestore();

  // Run the manual message auto delete logic
  await processManualMessageAutoDelete(db);

  // Send Telegram new order notification if telegramMessageId doesn't exist and not cancelled
  if (saleData && !saleData.telegramMessageId && saleData.status !== "ləğv edilib") {
    try {
      console.log(`[Telegram Trigger] Sending new order message for #${saleData.orderNumber}...`);
      const msgId = await sendNewOrderToTelegram(saleData);
      if (msgId) {
        await snapshot.ref.update({ telegramMessageId: msgId });
        console.log(`[Telegram Trigger] Sent. Message ID saved: ${msgId}`);

        // If it was created directly in delivered status, edit the message to Delivered immediately
        if (saleData.status === "çatdırılıb") {
          console.log(`[Telegram Trigger] Sale created as completed. Translating/editing message to Delivered...`);
          await markOrderDelivered(msgId, saleData);
        }
      }
    } catch (err) {
      console.error("[Telegram Trigger] Failed to send/edit Telegram new order notification:", err);
    }
  }

  return null;
});

exports.onSaleUpdatedTrigger = onDocumentUpdated("sales/{saleId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return null;

  const dataBefore = snapshot.before.data();
  const dataAfter = snapshot.after.data();

  if (!dataBefore || !dataAfter) return null;

  // If status changes to any state (çatdırılıb, ləğv edilib, gözləyir), update Telegram message
  if (dataBefore.status !== dataAfter.status) {
    const msgId = dataAfter.telegramMessageId || dataAfter.incomingTelegramMessageId || dataAfter.telegram_message_id;
    if (msgId) {
      try {
        console.log(`[Telegram Trigger] Order #${dataAfter.orderNumber} status changed from "${dataBefore.status}" to "${dataAfter.status}". Editing Telegram message_id: ${msgId}...`);
        await markOrderDelivered(msgId, dataAfter);
      } catch (err) {
        console.error("[Telegram Trigger] Error editing telegram message status:", err);
      }
    } else {
      console.log(`[Telegram Trigger] Order #${dataAfter.orderNumber} status changed, but no telegramMessageId found.`);
    }
  }

  return null;
});

exports.deleteOwnerManualMessageByOrder = onDocumentCreated("orders/{orderId}", async (event) => {
  const db = admin.firestore();
  await processManualMessageAutoDelete(db);
  return null;
});

// Explicitly re-export helper functions so they can be imported elsewhere
module.exports = {
  ...module.exports,
  sendNewOrderToTelegram,
  markOrderDelivered,
  generateAndSendDailyReport
};
