import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality, LiveServerMessage } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs as firestoreGetDocs, 
  getDoc as firestoreGetDoc,
  doc, 
  setDoc as firestoreSetDoc, 
  updateDoc as firestoreUpdateDoc,
  query, 
  where,
  limit,
  orderBy,
  initializeFirestore,
  Timestamp,
  onSnapshot
} from "firebase/firestore";

interface LocalFallbackDb {
  sales: Record<string, any>;
  customers: Record<string, any>;
  settings: Record<string, any>;
  products: Record<string, any>;
  couriers: Record<string, any>;
  expenses: Record<string, any>;
  stockTransfers: Record<string, any>;
}

const FALLBACK_DB_PATH = path.join(process.cwd(), "local_db_fallback.json");

let localDb: LocalFallbackDb = {
  sales: {},
  customers: {},
  settings: {},
  products: {},
  couriers: {},
  expenses: {},
  stockTransfers: {}
};

function loadLocalFallbackDb() {
  try {
    if (fs.existsSync(FALLBACK_DB_PATH)) {
      const raw = fs.readFileSync(FALLBACK_DB_PATH, "utf8");
      localDb = JSON.parse(raw);
      console.log("[Fallback DB] Successfully loaded local fallback DB from disk.");
    } else {
      console.log("[Fallback DB] Fallback DB file not found. Initializing defaults.");
      seedLocalFallbackDefaults();
    }
  } catch (err) {
    console.error("[Fallback DB] Error loading fallback DB:", err);
  }
}

function saveLocalFallbackDb() {
  try {
    fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(localDb, null, 2), "utf8");
  } catch (err) {
    console.error("[Fallback DB] Error saving fallback DB to disk:", err);
  }
}

function seedLocalFallbackDefaults() {
  if (!localDb.products || Object.keys(localDb.products).length === 0) {
    localDb.products = {
      "ayvel_100": {
        id: "ayvel_100",
        name: "Ayvelin 100 ml",
        stock: 500,
        price: 40,
        costPrice: 20
      }
    };
  }
  if (!localDb.couriers || Object.keys(localDb.couriers).length === 0) {
    localDb.couriers = {
      "columba_az": {
        id: "columba_az",
        name: "Columba.az",
        standardDeliveryFee: 3,
        status: "active"
      }
    };
  }
  if (!localDb.settings) {
    localDb.settings = {};
  }
  if (!localDb.settings.general) {
    localDb.settings.general = {
      id: "general",
      businessName: "Ayvelin",
      currency: "₼",
      lowStockThreshold: 5,
      vipThreshold: 5,
      expenseCategories: ["Çatdırılma", "Reklam", "Maaş", "Ofis", "İstehsalat", "Digər"],
      productCategories: ["Geyim", "Aksesuar", "Elektronika", "Kosmetika", "Mətbəx", "Digər"],
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
      telegramChatId: process.env.TELEGRAM_GROUP_CHAT_ID || ""
    };
  }
  saveLocalFallbackDb();
}

// Load local DB on startup
loadLocalFallbackDb();

function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Timestamp) return obj;
  if (obj instanceof Date) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefined(item));
  }
  
  const copy: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      copy[key] = cleanUndefined(val);
    }
  }
  return copy;
}

function syncLocalMemory(refPath: string, data: any, merge = false) {
  try {
    if (!refPath) return;
    const parts = refPath.split("/");
    if (parts.length < 2) return;
    const colName = parts[0];
    const docId = parts[1];

    if (!localDb[colName as keyof LocalFallbackDb]) {
      localDb[colName as keyof LocalFallbackDb] = {};
    }

    const currentDoc = localDb[colName as keyof LocalFallbackDb][docId] || {};
    if (merge) {
      localDb[colName as keyof LocalFallbackDb][docId] = { ...currentDoc, ...data };
    } else {
      localDb[colName as keyof LocalFallbackDb][docId] = data;
    }
    saveLocalFallbackDb();
  } catch (err) {
    console.error("[Fallback DB] Error syncing memory:", err);
  }
}

async function setDoc(reference: any, data: any, options?: any) {
  const refPath = reference.path || "";
  const mergeVal = options && options.merge === true;
  syncLocalMemory(refPath, cleanUndefined(data), mergeVal);

  try {
    return await firestoreSetDoc(reference, cleanUndefined(data), options);
  } catch (err: any) {
    console.warn(`[Firestore Fallback Exception] setDoc failed for path "${refPath}". Saved in local fallback file:`, err.message || String(err));
  }
}

async function updateDoc(reference: any, data: any) {
  const refPath = reference.path || "";
  syncLocalMemory(refPath, cleanUndefined(data), true);

  try {
    return await firestoreUpdateDoc(reference, cleanUndefined(data));
  } catch (err: any) {
    console.warn(`[Firestore Fallback Exception] updateDoc failed for path "${refPath}". Saved in local fallback file:`, err.message || String(err));
  }
}

async function getDoc(reference: any): Promise<any> {
  const refPath = reference.path || "";
  try {
    return await firestoreGetDoc(reference);
  } catch (err: any) {
    const isQuota = err.message && (err.message.includes("quota") || err.message.includes("Quota") || err.message.includes("limit") || err.message.includes("EXHAUSTED"));
    if (isQuota) {
      console.warn(`[Firestore Fallback Read] Quota exceeded. Returning cached fallback document for path "${refPath}".`);
      const parts = refPath.split("/");
      const colName = parts[0];
      const docId = parts[1];
      const cachedData = localDb[colName as keyof LocalFallbackDb]?.[docId];
      return {
        exists: () => cachedData !== undefined,
        data: () => cachedData || null,
        id: docId
      };
    }
    throw err;
  }
}

async function getDocs(queryRef: any): Promise<any> {
  const path = queryRef.path || (queryRef.collection && queryRef.collection.path) || (queryRef._query && queryRef._query.path ? queryRef._query.path.toString() : "");
  const parts = path.split("/");
  const colName = parts[0];

  try {
    return await firestoreGetDocs(queryRef);
  } catch (err: any) {
    const isQuota = err.message && (err.message.includes("quota") || err.message.includes("Quota") || err.message.includes("limit") || err.message.includes("EXHAUSTED"));
    if (isQuota) {
      console.warn(`[Firestore Fallback Query] Quota exceeded. Returning cached fallback query snap for collection "${colName}".`);
      const colItems = localDb[colName as keyof LocalFallbackDb] || {};
      const docs = Object.entries(colItems).map(([id, itemData]) => ({
        id,
        data: () => itemData,
        exists: () => true
      }));

      return {
        empty: docs.length === 0,
        size: docs.length,
        docs,
        forEach: (callback: (d: any) => void) => {
          docs.forEach(callback);
        }
      };
    }
    throw err;
  }
}
import { 
  getAuth, 
  signInAnonymously, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
import { startDailyReportScheduler, generateAndSendDailyReport } from "./src/utils/reportScheduler";
import compression from "compression";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const httpServer = createHttpServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/live" });

app.use(compression());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

let isTelegramReady = false;
let isPollingPaused = false;
const processedMessageIds = new Set<string>();

// Dynamic URL Tracker Middleware for Cloud Function webhook forwarding
app.use((req, res, next) => {
  const host = req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || "https";
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1") && !host.includes("0.0.0.0")) {
    const appUrl = `${protocol}://${host}`;
    setDoc(doc(db, "settings", "telegram_polling"), { appUrl }, { merge: true })
      .catch((err) => console.error("[Telegram Dynamic BaseUrl Logger] Error:", err));
  }
  next();
});

// Initialize Firebase client SDK
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const serverApp = initializeApp(firebaseConfig);
const db = initializeFirestore(serverApp, {
  experimentalForceLongPolling: true
}, (firebaseConfig as any).firestoreDatabaseId);
const auth = getAuth(serverApp);

// Run programmatic background authentication
async function initServerAuth() {
  console.log("[Firebase Auth] Initializing server-side client connection...");
  try {
    const email = "telegram-bot@ayvel.com";
    const pass = "bot-password-super-secure-2026!";
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      console.log("[Firebase Auth] Successfully authenticated server via bot account.");
      return;
    } catch (signInErr: any) {
      if (signInErr.code === "auth/user-not-found" || signInErr.code === "auth/invalid-credential" || signInErr.code === "auth/wrong-password") {
        try {
          await createUserWithEmailAndPassword(auth, email, pass);
          console.log("[Firebase Auth] Successfully registered and authenticated bot account.");
          return;
        } catch (regErr) {
          console.warn("[Firebase Auth] Bot registration failed:", regErr);
        }
      } else {
        console.warn("[Firebase Auth] Bot sign-in failed:", signInErr);
      }
    }

    try {
      await signInAnonymously(auth);
      console.log("[Firebase Auth] Successfully authenticated server via Anonymous access.");
      return;
    } catch (anonErr) {
      console.warn("[Firebase Auth] Anonymous sign-in failed:", anonErr);
    }
  } catch (err) {
    console.error("[Firebase Auth] Server auth cycle error:", err);
  }
}

// Initialize Gemini SDK with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Telemetry/constants
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8774875697:AAEfnXAQqUWgY1fGqV12H0DFkGycoM5jEBU";
const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID || "-1003879283343";

let cachedCredentials: { botToken: string; chatId: string; lastFetched: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Dynamically resolves Telegram bot token and Group Chat ID, checking Firestore first. Cached with 5 min TTL.
 */
async function getTelegramCredentials() {
  const now = Date.now();
  if (cachedCredentials && (now - cachedCredentials.lastFetched < CACHE_TTL_MS)) {
    return cachedCredentials;
  }

  let botToken = TELEGRAM_BOT_TOKEN;
  let chatId = TELEGRAM_GROUP_CHAT_ID;
  try {
    const settingsDoc = await getDoc(doc(db, "settings", "general"));
    if (settingsDoc && typeof settingsDoc.exists === "function" && settingsDoc.exists()) {
      const data = settingsDoc.data();
      if (data) {
        if (data.telegramBotToken) botToken = data.telegramBotToken;
        if (data.telegramChatId) chatId = data.telegramChatId;
      }
    }
    cachedCredentials = { botToken, chatId, lastFetched: now };
  } catch (err) {
    console.error("[Telegram Credentials Fetch Error]:", err);
    if (cachedCredentials) {
      return cachedCredentials;
    }
  }
  return { botToken, chatId };
}

/**
 * Executes a Telegram API request with an automatic retry block up to maxAttempts (3 attempts)
 */
async function fetchTelegramWithRetry(url: string, options: any, maxAttempts = 3, delayMs = 2000): Promise<any> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let isPermanentError = false;
    let desc = "";
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      if (response.ok && data.ok) {
        return data;
      }
      desc = data.description || `Uğursuz Telegram API cavabı (Status: ${response.status})`;
      if (desc.toLowerCase().includes("message is not modified")) {
        console.log("[Telegram API] Message is already up to date. Treating as success.");
        return { ok: true, result: true };
      }
      lastError = new Error(desc);
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        isPermanentError = true;
      }
    } catch (err: any) {
      lastError = err;
    }

    if (isPermanentError) {
      console.warn(`[Telegram API Fast Fail] Permanent client error: ${desc}. Aborting retry loop.`);
      throw lastError;
    }

    if (attempt < maxAttempts) {
      console.warn(`[Telegram API Retry] Attempt ${attempt}/${maxAttempts} failed. Error: ${lastError?.message || String(lastError)}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error("Naməlum Telegram tətbiq xətası.");
}

/**
 * Standard formats and utilities inside node
 */
function formatPhoneNumber(phone: string): string {
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

function generateDateTimeOrderNumber(createdAtStr: string | undefined, existingSales: any[]): string {
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

async function findOrCreateCustomer(name: string, phone: string): Promise<string> {
  const cleanPhone = formatPhoneNumber(phone);
  let matchedCustomerId = "";

  try {
    const snap = await getDocs(
      query(collection(db, "customers"), where("phone", "==", cleanPhone))
    );
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
    await setDoc(doc(db, "customers", newId), {
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
 * Endpoint to parse free-form order text from Azerbaijan to JSON structure.
 */
app.post("/api/gemini/parse-order", async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Sifariş mətni boş olmamalıdır." });
  }

  try {
    const parsed = await parseFreeTextOrder(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("Gemini parse-order error:", error);
    res.status(500).json({ error: "Sifariş mətni oxunarkən xəta baş verdi.", details: error.message });
  }
});

// Serve local fallback database to client context in case of Firestore outage
app.get("/api/fallback-data", (req, res) => {
  return res.json({ success: true, data: localDb });
});

// Secure Server-side Telegram Bot Proxies to bypass client CORS restrictions
app.get("/api/telegram/status", async (req, res) => {
  try {
    const { botToken } = await getTelegramCredentials();
    const data = await fetchTelegramWithRetry(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: "GET"
    });
    const botName = data.result.username || data.result.first_name;
    return res.json({ success: true, botName });
  } catch (err: any) {
    console.error("[Telegram Proxy Status Error]:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/telegram/webhook", async (req, res) => {
  const update = req.body;
  const message = update?.message || update?.channel_post || update?.edited_message || update?.edited_channel_post;
  if (!update || !message) {
    return res.status(200).send("No message update found");
  }

  try {
    const { botToken, chatId } = await getTelegramCredentials();
    if (message && message.message_id && typeof update.update_id === "number") {
      await saveTelegramOffsetToDb(update.update_id + 1);
    }
    await handleSingleTelegramUpdate(update, botToken, chatId, "");
    return res.status(200).send("Processed successfully");
  } catch (error) {
    console.error("[Telegram Webhook Event Error]:", error);
    return res.status(200).send("Processed with error logging");
  }
});

app.post("/api/telegram/test", async (req, res) => {
  const { text } = req.body;
  try {
    const { botToken, chatId } = await getTelegramCredentials();
    const payload = {
      chat_id: chatId,
      text: text || "Ayvel Diaqnostika sınaq mesajı."
    };
    const data = await fetchTelegramWithRetry(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (data.result && data.result.message_id) {
      return res.json({ success: true, messageId: String(data.result.message_id) });
    }
    return res.json({ success: false, error: "Uğursuz API cavabı." });
  } catch (err: any) {
    console.error("[Telegram Proxy Test Error]:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/telegram/report-test", async (req, res) => {
  try {
    const success = await generateAndSendDailyReport(db);
    if (success) {
      return res.json({ success: true });
    } else {
      return res.json({ success: false, error: "Günlük hesabat hazırlanarkən və ya Telegram-a göndərilərkən xəta baş verdi." });
    }
  } catch (err: any) {
    console.error("[Telegram Proxy Report Test Error]:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/telegram/manual-check", async (req, res) => {
  try {
    const report = await runTelegramSyncCheck();
    return res.json({
      success: true,
      processedCount: report.processedCount,
      duplicatedCount: report.duplicatedCount,
      info: report.info || "Sinxronizasiya uğurla tamamlandı."
    });
  } catch (err: any) {
    console.error("[Manual Sync API Error]:", err);
    return res.status(500).json({
      success: false,
      error: err.message || String(err)
    });
  }
});

app.post("/api/telegram/send", async (req, res) => {
  const { text, chat_id } = req.body;
  try {
    const { botToken, chatId } = await getTelegramCredentials();
    const targetChatId = chat_id || chatId;
    const payload = {
      chat_id: targetChatId,
      text: text
    };
    if (!isTelegramReady) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    const data = await fetchTelegramWithRetry(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (data.result && data.result.message_id) {
      return res.json({ success: true, message_id: String(data.result.message_id) });
    }
    return res.json({ success: false, error: "Göndərilə bilmədi." });
  } catch (err: any) {
    console.error("[Telegram Proxy Send Error]:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/telegram/send-order", async (req, res) => {
  const { sale } = req.body;
  if (!sale) return res.status(400).json({ success: false, error: "Sifariş obyekti tapılmadı" });

  const baseText = buildOriginalMessageText(sale);
  const message = `🆕 Sistem Yoxlanışı (Avtomatik Bərpa)\n\n${baseText}`;

  try {
    const { botToken, chatId } = await getTelegramCredentials();
    // 1. Send straight to active telegram group using fetchTelegramWithRetry wrapper
    const data = await fetchTelegramWithRetry(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
         chat_id: chatId,
         text: message
      })
    });
    
    if (data.result && data.result.message_id) {
       return res.json({ success: true, message_id: String(data.result.message_id) });
    }
    return res.json({ success: false, error: "Telegram API mesajı qəbul etmədi." });
  } catch (err: any) {
    console.error("[Telegram Order Send Error]:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

app.post("/api/telegram/edit", async (req, res) => {
  const { message_id, text, chat_id } = req.body;
  try {
    const { botToken, chatId } = await getTelegramCredentials();
    const targetChatId = chat_id || chatId;
    const payload = {
      chat_id: targetChatId,
      message_id: Number(message_id),
      text: text
    };
    await fetchTelegramWithRetry(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[Telegram Proxy Edit Error]:", err);
    return res.json({ success: false, error: err.message || String(err) });
  }
});

/**
 * Gather live business figures from Firestore to ground AI reasoning
 */
async function getLiveContextData() {
  let sales: any[] = [];
  let expenses: any[] = [];
  let couriers: any[] = [];
  let products: any[] = [];
  let customers: any[] = [];

  try {
    const salesSnap = await getDocs(collection(db, "sales"));
    salesSnap.forEach(s => {
      sales.push({ id: s.id, ...s.data() });
    });
  } catch (err) {
    console.warn("[getLiveContextData] Sales fetch failed, using localDb cache:", err);
    sales = Object.entries(localDb.sales || {}).map(([id, val]) => ({ id, ...val }));
  }

  try {
    const expensesSnap = await getDocs(collection(db, "expenses"));
    expensesSnap.forEach(e => {
      expenses.push({ id: e.id, ...e.data() });
    });
  } catch (err) {
    console.warn("[getLiveContextData] Expenses fetch failed, using localDb cache:", err);
    expenses = Object.entries(localDb.expenses || {}).map(([id, val]) => ({ id, ...val }));
  }

  try {
    const couriersSnap = await getDocs(collection(db, "couriers"));
    couriersSnap.forEach(c => {
      couriers.push({ id: c.id, ...c.data() });
    });
  } catch (err) {
    console.warn("[getLiveContextData] Couriers fetch failed, using localDb cache:", err);
    couriers = Object.entries(localDb.couriers || {}).map(([id, val]) => ({ id, ...val }));
  }

  try {
    const productsSnap = await getDocs(collection(db, "products"));
    productsSnap.forEach(p => {
      products.push({ id: p.id, ...p.data() });
    });
  } catch (err) {
    console.warn("[getLiveContextData] Products fetch failed, using localDb cache:", err);
    products = Object.entries(localDb.products || {}).map(([id, val]) => ({ id, ...val }));
  }

  try {
    const customersSnap = await getDocs(collection(db, "customers"));
    customersSnap.forEach(c => {
      customers.push({ id: c.id, ...c.data() });
    });
  } catch (err) {
    customers = Object.entries(localDb.customers || {}).map(([id, val]) => ({ id, ...val }));
  }

  // Calculate stats using Asia/Baku timezone parameters
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`; // YYYY-MM-DD
  const curMonth = todayStr.substring(0, 7); // YYYY-MM

  // Today stats
  const todaySales = sales.filter((s: any) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 10) : "";
    return sDate === todayStr && s.status === "çatdırılıb";
  });
  const todayRev = todaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  
  const todayCount = sales.filter((s: any) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 10) : "";
    return sDate === todayStr;
  }).length;

  const todayExp = expenses.filter((e: any) => {
    const eDate = e.date ? e.date.substring(0, 10) : "";
    return eDate === todayStr;
  }).reduce((acc, e) => acc + (e.amount || 0), 0);

  // Weekly stats (last 7 days / weekly report)
  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - (7 * 24 * 60 * 60 * 1000);
  const weekSales = sales.filter((s: any) => {
    const dStr = s.createdAt || s.date;
    if (!dStr) return false;
    const t = new Date(dStr).getTime();
    return !isNaN(t) && t >= sevenDaysAgoMs;
  });
  const weekDeliveredSales = weekSales.filter((s: any) => s.status === "çatdırılıb");
  const weekRev = weekDeliveredSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  const weekPendingCount = weekSales.filter((s: any) => s.status === "gözləyir").length;
  const weekCancelledCount = weekSales.filter((s: any) => s.status === "ləğv edilib").length;

  const weekExp = expenses.filter((e: any) => {
    const dStr = e.date || e.createdAt;
    if (!dStr) return false;
    const t = new Date(dStr).getTime();
    return !isNaN(t) && t >= sevenDaysAgoMs;
  }).reduce((acc, e) => acc + (e.amount || 0), 0);
  const weekNet = weekRev - weekExp;

  // Breakdown of top products sold this week
  const weekProdCount: Record<string, number> = {};
  weekDeliveredSales.forEach((s: any) => {
    if (Array.isArray(s.items)) {
      s.items.forEach((it: any) => {
        const name = it.productName || it.name || "Ayvelin 100 ml";
        weekProdCount[name] = (weekProdCount[name] || 0) + (Number(it.qty) || 1);
      });
    }
  });
  const weekProductsSummary = Object.entries(weekProdCount)
    .map(([pName, q]) => `${pName}: ${q} ədəd`)
    .join(", ") || (products.length > 0 ? `${products[0].name}: 0 ədəd` : "Ayvelin 100 ml");

  // Month stats
  const monthSales = sales.filter((s: any) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 7) : "";
    return sDate === curMonth && s.status === "çatdırılıb";
  });
  const monthRev = monthSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  
  const monthCount = sales.filter((s: any) => {
    const sDate = s.createdAt ? s.createdAt.substring(0, 7) : "";
    return sDate === curMonth;
  }).length;

  const monthExp = expenses.filter((e: any) => {
    const eDate = e.date ? e.date.substring(0, 7) : "";
    return eDate === curMonth;
  }).reduce((acc, e) => acc + (e.amount || 0), 0);

  const courierSummary = couriers.map((c: any) => `- ${c.name}: Status=${c.status || "active"}, Telefon=${c.phone || "yoxdur"}, Balans=${c.stockBalance ?? 0} ədəd, Sifarişlər=${c.totalDeliveries ?? 0}`).join("\n");
  const productSummary = products.map((p: any) => `- ${p.name}: Stok=${p.stock ?? 0} ədəd, Satış Qiyməti=${p.price ?? 40} AZN, Maya Dəyəri=${p.costPrice ?? 20} AZN`).join("\n");

  return {
    todayStr,
    curMonth,
    todayRev,
    todayCount,
    todayExp,
    todayNet: todayRev - todayExp,
    weekRev,
    weekDeliveredCount: weekDeliveredSales.length,
    weekTotalCount: weekSales.length,
    weekPendingCount,
    weekCancelledCount,
    weekExp,
    weekNet,
    weekProductsSummary,
    monthRev,
    monthCount,
    monthExp,
    monthNet: monthRev - monthExp,
    courierSummary,
    productSummary,
    rawSalesCount: sales.length,
    rawExpensesCount: expenses.length,
    customerCount: customers.length
  };
}

/**
 * Highly resilient, self-healing Gemini API wrapper with exponential retries and fallback models.
 * Gracefully switches to "gemini-3.1-flash-lite" if "gemini-3.5-flash" experiences transient 503 high demand or 429 rate limiting.
 */
async function generateContentWithFallback(params: { contents: any; config?: any }): Promise<any> {
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    const attempts = modelName === "gemini-3.5-flash" ? 3 : 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(`[Gemini Resilient API] Invoking generation using "${modelName}" (Attempt ${attempt}/${attempts})...`);
        const response = await ai.models.generateContent({
          ...params,
          model: modelName,
        });
        if (response && (response.text || response.candidates)) {
          console.log(`[Gemini Resilient API] Successfully generated response with model "${modelName}"!`);
          return response;
        }
        throw new Error("Empty response received from the Gemini API.");
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || JSON.stringify(err);
        console.warn(`[Gemini Resilient API Warning] Attempt ${attempt}/${attempts} failed for "${modelName}": ${errMsg}`);

        // If it's the last attempt of the last model, don't wait
        if (modelName === modelsToTry[modelsToTry.length - 1] && attempt === attempts) {
          break;
        }

        // Exponential backoff
        const sleepMs = attempt * 1200;
        console.log(`[Gemini Resilient API] Backing off for ${sleepMs}ms before retrying...`);
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
    }
    console.log(`[Gemini Resilient API Warning] All attempts for "${modelName}" exhausted. Escalating to alternative fallback...`);
  }

  throw lastError || new Error("All robust Gemini content generation paths failed.");
}

/**
 * Core business analyst response generator using live data
 */
async function generateIntelligentBusinessAnswer(queryText: string): Promise<string> {
  let contextInfo;
  try {
    contextInfo = await getLiveContextData();
  } catch (err) {
    console.error("Error gathering business data for AI:", err);
    contextInfo = { todayStr: "Məlum deyil" } as any;
  }

  const systemInstruction = `Sən Ayvel Biznes Sisteminin baş analitiki və ağıllı proqnozlaşdırma köməkçisisən (AI Business Intelligence).
Sənə Ayvel şirkətinin real vaxt verilənlər bazasından gələn mühüm statistik rəqəmlər təqdim olunur. Sənin vəzifən: adminin və ya sual verən komanda üzvünün suallarına tam dəqiq, rəqəmlərə əsaslanan, proqnozlaşdırıcı və optimist cavablar verməkdir.

🔴 ƏN VACİB QADAĞA (ANTİ-HALÜSİNASİYA):
1. Ayvel şirkəti kosmetika/sağlamlıq və qulluq məhsulları (əsasən "Ayvelin 100 ml") və anbardakı real məhsulların satışını aparır.
2. BİZDƏ QƏHVƏ DƏNƏLƏRİ (COFFEE BEANS), qəhvə, çay, kənar ərzaq malları QƏTİYYƏN YOXDUR və heç vaxt olmayıb! Əsla qəhvə dənələri və ya sistemə aid olmayan məhsullar barədə danışma.
3. YALNIZ və YALNIZ təqdim olunan rəsmi baza rəqəmləri əsasında danış.

Cari tarix statusu: ${contextInfo.todayStr || "Məlum deyil"}
Bu ay: ${contextInfo.curMonth || "Məlum deyil"}

HƏFTƏLİK METRİKLƏR (Son 7 Günlük Hesabat):
- Həftəlik Çatdırılmış Satış Gəliri: ${contextInfo.weekRev ?? 0} AZN
- Həftəlik Çatdırılmış Sifariş Sayı: ${contextInfo.weekDeliveredCount ?? 0} ədəd
- Həftəlik Cəmi Daxil Olan Sifariş: ${contextInfo.weekTotalCount ?? 0} ədəd (Gözləyən: ${contextInfo.weekPendingCount ?? 0}, Ləğv edilən: ${contextInfo.weekCancelledCount ?? 0})
- Həftəlik Xərclər: ${contextInfo.weekExp ?? 0} AZN
- Həftəlik Xalis Mənfəət: ${contextInfo.weekNet ?? 0} AZN
- Həftə Ərzində Ən Çox Satılan Real Məhsullar: ${contextInfo.weekProductsSummary || "Ayvelin 100 ml"}

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
2. Əgər istifadəçi "həftəlik hesabat" istəyirsə, yuxarıdakı həftəlik metrikləri (gəlir, sifariş sayı, xərc, xalis mənfəət, satılan Ayvelin məhsulları) dəqiq təhlil et!
3. Əgər istifadəçi "proqnoz" (forecasting, sales forecast) istəyirsə, rəqəmlərlə riyazi təxminlər apar. Məsələn, bugünkü satış temposunu ayın qalan günlərinə proqnozlaşdır, mənfəəti proqnoz et və hədəflərə necə çatmağı rəqəmli göstər!
4. Əgər istifadəçi "plan" (strategic targets, sales plan, market entry plan) istəyirsə, satışları artırmaq, kuryer stoku idarəçiliyini gücləndirmək, məhsul qalıqlarını optimallaşdırmaq və reklam xərclərinə nəzarət etmək üçün konkret 4-5 addımlıq, rəqəmsəl, fəaliyyət hədəfli və müddətli STRATEJİ PLAN yarat!
5. ÇOX VACİB: Telegram-da cavabın problemsiz göstərilməsi və teq xətalarının qarşısını almaq üçün Cavab teqləri tam bağlanmalıdır. YALNIZ aşağıdakı HTML etiketlərini istifadə edə bilərsən: <b>bold</b>, <i>italic</i>, <u>underline</u>, <code>code</code> və yeni sətirlər (\n). Heç vaxt markdown ulduzları (**) və s. yazma! HTML və simvol ziddiyyəti olmamalıdır. Cavab səliqəli paraqraflar şəklində olmalıdır.`;

  try {
    const response = await generateContentWithFallback({
      contents: [
        { text: `Sual: "${queryText}"\nReal göstəricilərə söykənərək mükəmməl analiz və proqnoz xülasəsi hazırla:` }
      ],
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return response.text || "Suallara cavab verməkdə müvəqqəti xəta baş verdi.";
  } catch (err) {
    console.error("Gemini analyst generation failure:", err);
    return "Üzr istəyirik, analitik sistem hazırda suala cavab verə bilmir.";
  }
}

app.post("/api/gemini/analyst", async (req, res) => {
  const { prompt, type } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Sual daxil edilməlidir." });
  }

  try {
    const answer = await generateIntelligentBusinessAnswer(prompt);
    res.json({ result: answer });
  } catch (err: any) {
    console.error("Error in /api/gemini/analyst:", err);
    res.status(500).json({ error: err.message || "Analiz generatoru işləmədi." });
  }
});

/**
 * Maps Grounding API endpoint using gemini-3.5-flash with googleMaps tool
 */
app.post("/api/gemini/maps-grounding", async (req, res) => {
  const { prompt, lat, lng } = req.body;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Sual və ya ünvan daxil edilməlidir." });
  }

  try {
    const latitude = typeof lat === "number" ? lat : 40.4093; // Default Baku lat
    const longitude = typeof lng === "number" ? lng : 49.8671; // Default Baku lng

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude,
              longitude
            }
          }
        }
      }
    });

    const text = response.text || "";
    const candidate = response.candidates?.[0];
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];

    res.json({
      result: text,
      groundingChunks: groundingChunks
    });
  } catch (err: any) {
    console.error("Error in /api/gemini/maps-grounding:", err);
    res.status(500).json({ error: err.message || "Xəritə məlumatlarının alınmasında xəta baş verdi." });
  }
});

/**
 * Gather full database context (sales, customers, products, couriers, expenses, settings)
 */
async function getFullDatabaseContext(clientContext?: any) {
  let sales: any[] = clientContext?.sales || [];
  let customers: any[] = clientContext?.customers || [];
  let products: any[] = clientContext?.products || [];
  let couriers: any[] = clientContext?.couriers || [];
  let expenses: any[] = clientContext?.expenses || [];
  let settings: any = clientContext?.settings || {};

  if (!sales || sales.length === 0) {
    try {
      const snap = await getDocs(collection(db, "sales"));
      snap.forEach(d => sales.push({ id: d.id, ...d.data() }));
    } catch {
      sales = Object.entries(localDb.sales || {}).map(([id, val]) => ({ id, ...val }));
    }
  }

  if (!customers || customers.length === 0) {
    try {
      const snap = await getDocs(collection(db, "customers"));
      snap.forEach(d => customers.push({ id: d.id, ...d.data() }));
    } catch {
      customers = Object.entries(localDb.customers || {}).map(([id, val]) => ({ id, ...val }));
    }
  }

  if (!products || products.length === 0) {
    try {
      const snap = await getDocs(collection(db, "products"));
      snap.forEach(d => products.push({ id: d.id, ...d.data() }));
    } catch {
      products = Object.entries(localDb.products || {}).map(([id, val]) => ({ id, ...val }));
    }
  }

  if (!couriers || couriers.length === 0) {
    try {
      const snap = await getDocs(collection(db, "couriers"));
      snap.forEach(d => couriers.push({ id: d.id, ...d.data() }));
    } catch {
      couriers = Object.entries(localDb.couriers || {}).map(([id, val]) => ({ id, ...val }));
    }
  }

  if (!expenses || expenses.length === 0) {
    try {
      const snap = await getDocs(collection(db, "expenses"));
      snap.forEach(d => expenses.push({ id: d.id, ...d.data() }));
    } catch {
      expenses = Object.entries(localDb.expenses || {}).map(([id, val]) => ({ id, ...val }));
    }
  }

  const totalSalesCount = sales.length;
  const deliveredSales = sales.filter((s: any) => s.status === "çatdırılıb");
  const totalRevenue = deliveredSales.reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);
  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const totalProfit = totalRevenue - totalExpenses;

  const productsFormatted = products.map((p: any) => {
    const cost = p.costPrice ?? (p.price ? p.price * 0.4 : 0);
    const marginPct = p.price > 0 ? (((p.price - cost) / p.price) * 100).toFixed(1) : "0";
    return `• [${p.id}] Ad: ${p.name} | Satış Qiyməti: ${p.price} AZN | Maya Dəyəri: ${cost} AZN | Mənfəət Marşası: ${marginPct}% | Stok Qalığı: ${p.stock ?? 0} ədəd | Kod: ${p.code || "yoxdur"}`;
  }).join("\n");

  const couriersFormatted = couriers.map((c: any) => {
    return `• [${c.id}] Ad: ${c.name} | Status: ${c.status || "active"} | Telefon: ${c.phone || "yoxdur"} | Əlindəki Stok: ${c.stockBalance ?? 0} ədəd | Çatdırılma Sayı: ${c.totalDeliveries ?? 0} | Borc/Balans: ${c.balance ?? 0} AZN`;
  }).join("\n");

  const customersFormatted = customers.map((cust: any) => {
    return `• [${cust.id}] Ad: ${cust.name} | Tel: ${cust.phone} | Sifariş Sayı: ${cust.totalOrders ?? 0} | Xərclədiyi Cəmi: ${cust.totalSpent ?? 0} AZN | Loyallıq Balı: ${cust.loyaltyPoints ?? 0} | Ünvan: ${cust.address || "qeyd olunmayıb"}`;
  }).join("\n");

  const expensesFormatted = expenses.map((e: any) => {
    return `• Tarix: ${e.date || "yoxdur"} | Kateqoriya: ${e.category || "Genel"} | Məbləğ: ${e.amount} AZN | Qeyd: ${e.description || e.recipient || "-"}`;
  }).join("\n");

  const recentSalesFormatted = sales.slice(0, 100).map((s: any) => {
    const itemsList = Array.isArray(s.items) 
      ? s.items.map((i: any) => `${i.productName || i.name || 'Məhsul'} (${i.qty || 1} ədəd x ${i.unitPrice || i.price || 0} AZN)`).join(", ")
      : "detal yoxdur";
    return `• Sifariş #${s.orderNumber || s.id} | Tarix: ${s.createdAt || s.date || "yoxdur"} | Müştəri: ${s.customerName || "Naməlum"} (${s.customerPhone || "-"}) | Məbləğ: ${s.totalAmount} AZN | Çatdırılma: ${s.deliveryCost || 0} AZN | Status: ${s.status} | Kuryer: ${s.courierName || s.courierId || "-"} | Məhsullar: [${itemsList}] | Ünvan: ${s.address || "-"}`;
  }).join("\n");

  return `AYVEL MASTER DATABASE VERİLƏNLƏR BAZASI FAYLI (FULL DATABASE ACCESS):

--- 1. BAZA ÜMUMİ İCMALİ ---
• Cəmi Sifariş Sayı: ${totalSalesCount}
• Çatdırılmış Satış Həcmi: ${totalRevenue} AZN
• Ümumi Qeydə Alınmış Xərclər: ${totalExpenses} AZN
• Net Mənfəət: ${totalProfit} AZN
• Qeydiyyatlı Müştəri Sayı: ${customers.length} nəfər
• Məhsul Çeşidi Sayı: ${products.length} çeşid
• Kuryer Sayı: ${couriers.length} nəfər
• Xərc Qeydi Sayı: ${expenses.length} ədəd

--- 2. MƏHSULLAR VƏ ANBAR STOQU (${products.length} Məhsul) ---
${productsFormatted || "Məhsul məlumatı yoxdur"}

--- 3. KURYERLƏR VƏ STOK BALANSLARI (${couriers.length} Kuryer) ---
${couriersFormatted || "Kuryer məlumatı yoxdur"}

--- 4. MÜŞTƏRİLƏR VƏ LOYALLIQ VƏZİYYƏTİ (${customers.length} Müştəri) ---
${customersFormatted || "Müştəri məlumatı yoxdur"}

--- 5. XƏRCLƏR SİYAHISI (${expenses.length} Xərc Qeydi) ---
${expensesFormatted || "Xərc məlumatı yoxdur"}

--- 6. SATIŞLAR VƏ SİFARİŞLƏR SİYAHISI (Son ${sales.slice(0, 100).length} Sifariş) ---
${recentSalesFormatted || "Satış məlumatı yoxdur"}
`;
}

/**
 * Master Data AI Agent Endpoint with Full Database Access
 */
app.post("/api/gemini/master-agent", async (req, res) => {
  const { prompt, clientContext, history } = req.body;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Sual daxil edilməlidir." });
  }

  try {
    const fullDatabaseDump = await getFullDatabaseContext(clientContext);

    const systemInstruction = `Sən Ayvel Şirkətinin BÜTÜN BAZASINA TAM VƏ AÇIQ ÇIXIŞI OLAN BAŞ SÜNİ İNTELLEKT AGENTİSƏN (Ayvel Master Database AI Agent).
Sənin ixtiyarındakı baza verilənlərinə aşağıdakılar DAXİLDİR:
1. SATIŞLAR: Bütün keçmiş və günümüzdəki sifarişlər, məbləğlər, statuslar, müştəri adları, kuryerlər, tarixlər, ödəniş növləri, məhsul tərkibi.
2. MÜŞTƏRİLƏR: Müştəri siyahısı, telefonları, ümumi xərcləmələri, sifariş sayı, müştəri loyallıq balları, ünvanları.
3. MƏHSULLAR: Bütün anbar məhsulları (əsasən "Ayvelin 100 ml"), satış qiymətləri, maya dəyərləri (costPrice), stok sayları, maya mənfəəti marşası.
4. KURYERLƏR: Kuryerlərin adları (məs: Columba.az), aktivlik statusu, əlindəki məhsul stoku, çatdırılma sayı və balansı.
5. XƏRCLƏR: Şirkətin bütün xərc qeydləri, kateqoriyaları, tarixləri və məbləğləri.

🔴 QƏTİ QADAĞA:
Şirkətimizdə QƏHVƏ DƏNƏLƏRİ (COFFEE BEANS), qəhvə, çay, kənar ərzaq məhsulları QƏTİYYƏN YOXDUR! Əsla qəhvə dənələri və ya sistemə aid olmayan məhsullar barədə danışma. YALNIZ və YALNIZ təqdim olunan baza verilənlərinə əsaslan.

AŞAĞIDA BÜTÜN BAZANIN TƏFƏRRÜATLI VƏ MÜKƏMMƏL DUMP MƏLUMATLARI VERİLİR:
${fullDatabaseDump}

MÜHÜM QAYDALAR VƏ CAVAB STRATEGİYASI:
1. Sualı həmişə Azərbaycan dilində, olduqca səliqəli, rəsmi-işgüzar, dəqiq və peşəkar tonla cavabla.
2. Sualın cavabını birbaşa verilmiş BAZA MƏLUMATLARI ƏSASINDA tap. Müştəri adlarını, kuryer adlarını, məhsul kodlarını, qiymət və faizləri dəqiq göstər!
3. Lazım gəldikdə cədvəl, siyahı, məbləğ və faiz hesablamalarını aydın şəkildə strukturlaşdır.
4. Cavabda YALNIZ aşağıdakı HTML etiketlərindən istifadə et: <b>qalın yazılar</b>, <i>kursiv</i>, <code>kod/rəqəmlər</code>, <u>alt xətt</u>. Telegram və veb brauzer ilə 100% uyğunlaşan HTML istifadə et.
5. Dəqiq statistik nəticə verdikdən sonra 1-2 cümləlik strateji tövsiyə və ya xəbərdarlıq (məs: stok bitməsi, borc xəbərdarlığı, müştəri loyallığı) əlavə et.`;

    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      history.forEach((msg: any) => {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        });
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: `Sorğu/Sual: "${prompt}"\nBütün bazaya çıxış imkanından istifadə edərək ən dəqiq cavabı tərtib et:` }]
    });

    const response = await generateContentWithFallback({
      contents,
      config: {
        systemInstruction
      }
    });

    const answer = response.text || "Suallara cavab verməkdə müvəqqəti xəta baş verdi.";
    res.json({ result: answer });
  } catch (err: any) {
    console.error("Error in /api/gemini/master-agent:", err);
    res.status(500).json({ error: err.message || "Master AI Agent cavab verə bilmədi." });
  }
});

/**
 * Setup WebSocket handling for Live Voice Conversation using gemini-3.1-flash-live-preview
 */
wss.on("connection", async (clientWs) => {
  console.log("[Live API WS] Client connected to live voice session");
  let session: any = null;

  try {
    const contextInfo = await getLiveContextData();

    const liveSystemInstruction = `Sən Ayvel Biznes və Satış İdarəetmə Sisteminin rəsmi səsli süni intellekt köməkçisisən (Live AI Voice Assistant).
İstifadəçi ilə Azərbaycan dilində danışırsan və ona canlı, dəqiq və səlahiyyətli cavablar verirsən.

🔴 ƏN MÜHÜM VƏ QƏTİ QADAĞALAR (ANTİ-HALÜSİNASİYA):
1. Bizim şirkət kosmetika/sağlamlıq və qulluq məhsulları (əsasən "Ayvelin 100 ml") və anbardakı real məhsulların satışını həyata keçirir.
2. BİZDƏ QƏHVƏ DƏNƏLƏRİ (COFFEE BEANS), Kofe, Çay, Ərzaq və ya digər sistemə aid olmayan kənar mallar QƏTİYYƏN YOXDUR və heç vaxt olmayıb! Əsla qəhvə dənələri və ya uydurma məhsullar haqqında danışma!
3. YALNIZ və YALNIZ aşağıda verilmiş REAL BAZA MƏLUMATLARI və RƏQƏMLƏRİ ƏSASINDA cavab ver. Heç bir rəqəm və ya məhsul uydurma!

📊 REAL ŞİRKƏT GÖSTƏRİCİLƏRİ (Real-Time Database):
Cari Tarix: ${contextInfo.todayStr || "Bugün"}

📅 1. HƏFTƏLİK HESABAT (Son 7 Günlük Göstəricilər):
- Həftəlik Çatdırılmış Satış Gəliri: ${contextInfo.weekRev ?? 0} AZN
- Həftəlik Çatdırılmış Sifariş Sayı: ${contextInfo.weekDeliveredCount ?? 0} ədəd
- Həftəlik Cəmi Daxil Olan Sifariş: ${contextInfo.weekTotalCount ?? 0} ədəd (Gözləyən: ${contextInfo.weekPendingCount ?? 0}, Ləğv edilən: ${contextInfo.weekCancelledCount ?? 0})
- Həftəlik Xərclər: ${contextInfo.weekExp ?? 0} AZN
- Həftəlik Xalis Mənfəət: ${contextInfo.weekNet ?? 0} AZN
- Həftə Ərzində Satılan Əsas Məhsullar: ${contextInfo.weekProductsSummary || "Ayvelin 100 ml"}

📆 2. GÜNLÜK HESABAT (Bugünkü Göstəricilər):
- Çatdırılmış Satış Gəliri: ${contextInfo.todayRev ?? 0} AZN (${contextInfo.todayRev > 0 ? "uğurla çatdırılıb" : "hələ çatdırılma tamamlanmayıb"})
- Cəmi Yeni Sifariş: ${contextInfo.todayCount ?? 0} ədəd
- Bugünkü Xərclər: ${contextInfo.todayExp ?? 0} AZN
- Bugünkü Xalis Qazanc: ${contextInfo.todayNet ?? 0} AZN

🗓️ 3. AYLIQ HESABAT (Cari Ay):
- Aylıq Gəlir: ${contextInfo.monthRev ?? 0} AZN
- Aylıq Cəmi Sifariş: ${contextInfo.monthCount ?? 0} ədəd
- Aylıq Xərclər: ${contextInfo.monthExp ?? 0} AZN
- Aylıq Xalis Mənfəət: ${contextInfo.monthNet ?? 0} AZN

📦 4. MƏHSULLAR VƏ ANBAR STOKU:
${contextInfo.productSummary || "Ayvelin 100 ml: Stok mövcuddur, Qiymət 40 AZN"}

🚴 5. KURYERLƏR VƏ LOQİSTİKA:
${contextInfo.courierSummary || "Columba.az: Aktiv kuryer"}

🎙️ SƏSLİ CAVAB QAYDALARI:
- İstifadəçi 'həftəlik hesabat ver', 'bu həftə necə keçdi' dedikdə son 7 günün həftəlik rəqəmlərini (çatdırılan sifariş sayı, gəlir, xərc, xalis mənfəət və satılan əsas məhsul olan Ayvelin) tam aydın səsləndir.
- İstifadəçi 'günlük hesabat' və ya 'bugün necədir' dedikdə bugünkü rəqəmləri de.
- İstifadəçi 'aylıq hesabat' dedikdə cari ayın rəqəmlərini de.
- İstifadəçi kuryerlər və ya anbar stoku barədə soruşduqda yalnız real bazadakı göstəriciləri de.
- Cavabların hər zaman Azərbaycan dilində, təbii, səsli dinləmə üçün xoş, rəsmi-işgüzar və yığcam (2-4 cümlə) olmalıdır.`;

    session = await ai.live.connect({
      model: "gemini-3.1-flash-live-preview",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
        },
        systemInstruction: liveSystemInstruction,
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio && clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ audio }));
          }
          if (message.serverContent?.interrupted && clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onerror: (err) => {
          console.error("[Live API Error]", err);
          if (clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ error: "Live API xətası baş verdi" }));
          }
        },
        onclose: () => {
          console.log("[Live API Session closed]");
        }
      },
    });

    clientWs.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio && session) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" },
          });
        }
      } catch (err) {
        console.error("[Live API Message Parse Error]", err);
      }
    });

    clientWs.on("close", () => {
      console.log("[Live API WS] Client disconnected");
      if (session) {
        try { session.close(); } catch (e) {}
      }
    });
  } catch (err: any) {
    console.error("[Live API Connection Error]", err);
    if (clientWs.readyState === 1) {
      clientWs.send(JSON.stringify({ error: err.message || "Live API qoşulma xətası" }));
    }
  }
});

/**
 * Parse structured Columba.az delivery order messages with zero-latency regex parser.
 * Format:
 * 📦 Columba.az — Yeni Sifariş (#`31852`)
 * ━━━━━━━━━━━━━━━━━━━━━━
 * 👤 Alıcı: Arzu Abuzərova
 * 📞 Əlaqə: 050 355 80 39
 * 🏙 Bölgə: Yasamal rayonu
 * 📍 Ünvan: Respublika İncəsənət Gimnaziyası, Parlament prospekti, Bakı, Azərbaycan
 * 📅 Çatdırılma vaxtı: 05 noy, 2026
 * 💳 Ödəniş: Bəli (40 AZN)
 * 
 * 🛒 Məhsullar:
 * 1. Hair oil mask 100ml (1 ədəd) — 40 AZN
 * ━━━━━━━━━━━━━━━━━━━━━━
 * 💰 Yekun məbləğ: 40 AZN
 */
function parseAzerbaijanDateToIso(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const monthMap: Record<string, number> = {
    yan: 0, yanvar: 0,
    fev: 1, fevral: 1,
    mar: 2, mart: 2,
    apr: 3, aprel: 3,
    may: 4,
    iyn: 5, iyun: 5,
    iyl: 6, iyul: 6,
    avq: 7, avqust: 7,
    sen: 8, sentyabr: 8, sent: 8,
    okt: 9, oktyabr: 9,
    noy: 10, noyabr: 10,
    dek: 11, dekabr: 11
  };
  const m = dateStr.match(/(\d{1,2})\s+([a-zA-ZıİöÖüÜşŞçÇğĞəƏ]+)[,\s]+(\d{4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const monStr = m[2].toLowerCase().slice(0, 3);
    const year = parseInt(m[3], 10);
    const month = monthMap[monStr] ?? (monthMap[m[2].toLowerCase()] ?? null);
    if (month !== null) {
      const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
      return d.toISOString();
    }
  }
  return null;
}

function parseColumbaTemplateOrder(str: string): any | null {
  if (!str) return null;
  const isColumbaHeader = /📦\s*Columba\.az\s*—\s*Yeni Sifariş/i.test(str) ||
                          (/Columba\.az/i.test(str) && /Yeni Sifariş/i.test(str));
  if (!isColumbaHeader) return null;

  // Extract order code e.g. (#`31852`) or (#31852)
  const orderNumMatch = str.match(/#`?([A-Za-z0-9_-]+)`?\)?/);
  const columbaOrderNo = orderNumMatch ? orderNumMatch[1] : null;

  // Extract Buyer Name: "👤 Alıcı: Arzu Abuzərova"
  const buyerMatch = str.match(/(?:Alıcı|Müştəri):\s*([^\n\r]+)/i);
  const customerName = buyerMatch ? buyerMatch[1].trim() : "Simsiz Müştəri";

  // Extract Phone: "📞 Əlaqə: 050 355 80 39"
  const phoneMatch = str.match(/(?:Əlaqə|Telefon|Tel):\s*([^\n\r]+)/i);
  const rawPhone = phoneMatch ? phoneMatch[1].trim() : "";

  // Extract Region: "🏙 Bölgə: Yasamal rayonu"
  const regionMatch = str.match(/(?:Bölgə|Rayon):\s*([^\n\r]+)/i);
  const region = regionMatch ? regionMatch[1].trim() : "";

  // Extract Address: "📍 Ünvan: Respublika İncəsənət Gimnaziyası, Parlament prospekti, Bakı, Azərbaycan"
  const addressMatch = str.match(/(?:Ünvan):\s*([^\n\r]+)/i);
  const rawAddress = addressMatch ? addressMatch[1].trim() : "";
  const fullAddress = region && rawAddress && !rawAddress.toLowerCase().includes(region.toLowerCase())
    ? `${region}, ${rawAddress}`
    : (rawAddress || region || "Təyin edilməyib");

  // Extract Delivery Time: "📅 Çatdırılma vaxtı: 05 noy, 2026"
  const deliveryTimeMatch = str.match(/Çatdırılma vaxtı:\s*([^\n\r]+)/i);
  const deliveryTimeStr = deliveryTimeMatch ? deliveryTimeMatch[1].trim() : null;
  const deliveryDateIso = parseAzerbaijanDateToIso(deliveryTimeStr);

  // Extract Payment: "💳 Ödəniş: Bəli (40 AZN)"
  const paymentMatch = str.match(/Ödəniş:\s*([^\n\r]+)/i);
  const paymentStr = paymentMatch ? paymentMatch[1].trim() : "";
  let paymentStatus = "ödənilməyib";
  if (paymentStr && /bəli|ödenilib|ödənilib|yes|kart|pos/i.test(paymentStr)) {
    paymentStatus = "ödənilib";
  }

  // Extract Total Amount: "💰 Yekun məbləğ: 40 AZN"
  const totalMatch = str.match(/Yekun məbləğ:\s*([\d.,]+)\s*AZN/i);
  const totalAmount = totalMatch ? parseFloat(totalMatch[1].replace(",", ".")) : null;

  // Extract Products list:
  // "1. Hair oil mask 100ml (1 ədəd) — 40 AZN"
  const products: any[] = [];
  const prodRegex = /^\s*\d+\.\s*(.+?)\s*\(([\d]+)\s*ədəd\)\s*—\s*([\d.,]+)\s*AZN/gim;
  let m;
  while ((m = prodRegex.exec(str)) !== null) {
    products.push({
      name: m[1].trim(),
      quantity: parseInt(m[2], 10),
      price: parseFloat(m[3].replace(",", ".")),
      note: null
    });
  }

  if (products.length === 0) {
    // If regex couldn't split items individually, add default product from total
    products.push({
      name: "Hair oil mask 100ml",
      quantity: 1,
      price: totalAmount || 40,
      note: null
    });
  }

  console.log(`[Columba Fast Parser] Instant template match recognized for order #${columbaOrderNo || "N/A"}: ${customerName}, ${rawPhone}`);

  return {
    isOrder: true,
    columbaOrderNo,
    customerName,
    phone: rawPhone,
    region,
    address: fullAddress,
    deliveryTimeStr,
    deliveryDateIso,
    paymentStr,
    paymentStatus,
    totalAmount,
    products,
    courierName: "Columba.az",
    courierFee: 4,
    note: columbaOrderNo ? `Columba #${columbaOrderNo}` : (deliveryTimeStr ? `Çatdırılma: ${deliveryTimeStr}` : null)
  };
}

/**
 * Parse Azerbaijan free text through Gemini SDK or instant template matcher
 */
async function parseFreeTextOrder(text: string): Promise<any> {
  // 1. Instant deterministic parsing for Columba.az template orders (Zero latency, 100% precision)
  const templateParsed = parseColumbaTemplateOrder(text);
  if (templateParsed && templateParsed.isOrder) {
    return templateParsed;
  }

  const prompt = `Azərbaycan dilində yazılmış sərbəst mətndən sifariş məlumatlarını çıxar və JSON formatında qaytar.
Giriş mətni:
"${text}"`;

  const response = await generateContentWithFallback({
    contents: prompt,
    config: {
      systemInstruction: `Sən Ayvel biznes idarəetmə sisteminin ağıllı və çox qabiliyyətli köməkçi operatorusan.
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
Salam, bu günə çatdıraq. Elvin Məmmədov 077-444-55-66 Nərimanov metrosu çıxışı
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
}`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isOrder: { type: Type.BOOLEAN, description: "Mətnin həqiqətən bir sifariş olub-olmaması" },
          customerName: { type: Type.STRING, description: "Müştərinin adı soyadı" },
          phone: { type: Type.STRING, description: "Müştərinin telefon nömrəsi" },
          address: { type: Type.STRING, description: "Çatdırılma ünvanı" },
          products: {
            type: Type.ARRAY,
            description: "Sifariş olunmuş məhsullar",
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Məhsulun adı" },
                quantity: { type: Type.INTEGER, description: "Məhsulun miqdarı/Sayı" },
                price: { type: Type.NUMBER, description: "Məhsulun vahid qiyməti" },
                note: { type: Type.STRING, description: "Əlavə qeyd" },
              },
              required: ["name", "quantity", "price"]
            }
          },
          courierFee: { type: Type.NUMBER, description: "Kuryer ödənişi" },
          courierName: { type: Type.STRING, description: "Kuryerin adı" },
          note: { type: Type.STRING, description: "Digər xüsusi qeydlər" }
        },
        required: ["isOrder", "customerName", "phone", "address", "products", "courierFee", "courierName"]
      }
    }
  });

  try {
    const rawParsed = JSON.parse(response.text || "{}");
    console.log("[Telegram AI Parser] Raw response object from Model:", rawParsed);

    // Apply extensive, safe Azerbaijani context-aware heuristics and rules
    if (rawParsed && rawParsed.isOrder) {
      const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

      // 1. RECOVERY SYSTEM FOR CUSTOMER PHONE NUMBERS
      if (!rawParsed.phone || rawParsed.phone.trim().length < 5) {
        // Look up sequences of digits that represent Azerbaijani phones in standard spaces or format-free
        const digitClean = text.replace(/[\(\)\-\s]/g, "");
        const match = digitClean.match(/(0\d{9})|(\+994\d{9})|(994\d{9})/);
        if (match) {
          rawParsed.phone = match[0];
        } else {
          // General check for groupings containing space format (e.g. "055 897 19 97")
          const spaceMatch = text.match(/\d[\d\s\-]{6,15}/);
          if (spaceMatch) {
            rawParsed.phone = spaceMatch[0].trim();
          }
        }
      }

      // 2. RECOVERY SYSTEM FOR THE CUSTOMER NAME (Prevents "Simsiz Sifarişçi" on clear names)
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
          
          // Name lines must not be product details or physical markers
          const isProduct = lower.includes("ayvelin") || lower.includes("azn") || lower.includes("manat") || lower.includes("ədəd") || lower.includes("edəd");
          const isAddress = lower.includes("metro") || lower.includes(" r.") || lower.includes("park") || lower.includes("yaxın") || lower.includes("yanın") || lower.includes("küç") || lower.includes("kuc") || lower.includes("bina") || lower.includes("mənzil") || lower.includes("poct") || lower.includes("poçt") || lower.includes("rayon") || lower.includes("şəhər") || lower.includes("weher") || lower.includes("seher") || lower.includes("ünvan") || lower.includes("unvan");
          
          if (!hasManyDigits && !isProduct && !isAddress && line.length > 3 && line.length < 32) {
            // Check if string contains at least some Azerbaijani alphabetical chars
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
        
        // Fallback to latest line if no markers exist but structure allows it
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
        console.log("[Telegram AI Parser] Azerpoct keyword caught. Routing delivery to Azərpoçt and applying shipping cost structure...");
        rawParsed.courierName = "Azərpoçt";
        
        // Nakhchivan rate of 5 AZN, others are 3 AZN
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
    console.error("Failed to parse response text from AI:", e);
    return null;
  }
}

/**
 * Register automatically parsed order in firestore
 */
async function registerParsedOrder(parsed: any, telegramMessageId: number): Promise<string> {
  const cleanMessageId = String(telegramMessageId);
  const finalId = telegramMessageId ? `sale_tg_${cleanMessageId}` : `sale_${Date.now()}`;

  // 1. Check if an order with this telegramMessageId has already been parsed and registered to prevent duplicates
  if (telegramMessageId) {
    try {
      // Direct look-up by deterministic ID first
      const directSnap = await getDoc(doc(db, "sales", finalId));
      if (directSnap.exists()) {
        console.log(`[Telegram Bot] Order with deterministic ID ${finalId} already exists in Firestore. Exiting order registration to prevent duplication.`);
        return "DUPLICATE";
      }

      // Fallback query matching fields
      const q1 = query(
        collection(db, "sales"),
        where("telegramMessageId", "==", cleanMessageId)
      );
      const q2 = query(
        collection(db, "sales"),
        where("incomingTelegramMessageId", "==", cleanMessageId)
      );
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      if (!snap1.empty || !snap2.empty) {
        console.log(`[Telegram Bot] Order with telegramMessageId ${telegramMessageId} already exists in Firestore. Exiting order registration to prevent duplication.`);
        return "DUPLICATE";
      }
    } catch (checkErr) {
      console.error("[Telegram Bot] Error checking duplicate telegramMessageId:", checkErr);
    }
  }

  // Double-secure: system-wide order content duplicate check
  try {
    const isSystemDuplicate = await checkSystemDuplicateOrder(parsed);
    if (isSystemDuplicate) {
      console.log(`[Telegram Bot] System-wide duplicate order content detected. Exiting registration safely to prevent duplication.`);
      return "DUPLICATE";
    }
  } catch (dupErr) {
    console.error("[Telegram Bot] Error checking system duplicate order:", dupErr);
  }

  const createdAtVal = new Date().toISOString();

  // Highly optimized database lookup for the current Baku minute prefix
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
  const existingSales: any[] = [];
  try {
    const querySnap = await getDocs(
      query(
        collection(db, "sales"),
        where("orderNumber", ">=", basePattern),
        where("orderNumber", "<=", basePattern + "\uf8ff")
      )
    );
    querySnap.forEach((doc) => {
      existingSales.push(doc.data());
    });
  } catch (err) {
    console.error("Failed to query existing sales pattern:", err);
  }

  const orderNumber = generateDateTimeOrderNumber(createdAtVal, existingSales);

  // Parse products
  let dbProducts: any[] = [];
  try {
    const productsSnapshot = await getDocs(collection(db, "products"));
    productsSnapshot.forEach((doc) => {
      dbProducts.push(doc.data());
    });
  } catch (prodErr) {
    console.error("Failed to fetch products catalogue:", prodErr);
  }

  const items = (parsed.products || []).map((parsedProd: any) => {
    const pNameLower = (parsedProd.name || "").toLowerCase();
    const matched = dbProducts.find((p) => {
      const dbNameLower = (p.name || "").toLowerCase();
      if (dbNameLower.includes(pNameLower) || pNameLower.includes(dbNameLower)) return true;
      if ((pNameLower.includes("hair oil") || pNameLower.includes("100ml") || pNameLower.includes("100 ml")) && dbNameLower.includes("ayvelin") && dbNameLower.includes("100")) {
        return true;
      }
      return false;
    });
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

  // Resolve customer
  const phoneFormatted = formatPhoneNumber(parsed.phone || "");
  const customerName = parsed.customerName || "Simsiz Sifarişçi";
  const customerId = await findOrCreateCustomer(customerName, phoneFormatted);

  // Courier / Delivery Type resolve
  let deliveryType: "courier" | "cargo" | "expargo" | "Azərpoçt" = "courier";
  let cargoCompany = "";
  let courierId = "";
  let courierName = "";

  let courierSearchTerm = parsed.courierName ? parsed.courierName.trim() : "";
  const normalizedCourier = courierSearchTerm.toLowerCase();

  let dbCouriers: any[] = [];
  try {
    const couriersSnapshot = await getDocs(collection(db, "couriers"));
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
    // Standard Courier delivery
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

  const totalProductPrice = items.reduce((sum: number, item: any) => sum + item.total, 0);
  let deliveryCost = Number(parsed.courierFee || 0);

  // Əgər kuryer təyin edilib amma qiymət yoxdursa — kuryerin standart haqqını al
  if (deliveryCost === 0 && courierId) {
    const assignedCourier = dbCouriers.find(c => c.id === courierId);
    if (assignedCourier && assignedCourier.standardDeliveryFee > 0) {
      deliveryCost = assignedCourier.standardDeliveryFee;
      console.log(`[registerParsedOrder server] courierFee=0, using standardDeliveryFee=${deliveryCost} from courier "${assignedCourier.name}"`);
    }
  }

  const discountAmount = Number(parsed.discountAmount || parsed.discount || 0);
  const totalAmount = Math.max(0, totalProductPrice - discountAmount); // Align with frontend subtotal logic
  const netRevenue = Math.max(0, totalProductPrice - discountAmount - deliveryCost);

  const initialPaymentStatus = parsed.paymentStatus || "ödənilməyib";
  const initialDeliveryDate = parsed.deliveryDateIso ? Timestamp.fromDate(new Date(parsed.deliveryDateIso)) : null;

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
    paymentStatus: initialPaymentStatus,
    notes: parsed.note || "",
    createdAt: createdAtVal,
    order_date: Timestamp.fromDate(new Date(createdAtVal)),
    delivery_date: initialDeliveryDate,
    isRevenueCalculated: false,
    statusHistory: [{ status: "gözləyir", changedAt: createdAtVal }],
    source: "manual",
    telegramMessageId: String(telegramMessageId),
    incomingTelegramMessageId: String(telegramMessageId),
    systemSecret: "AyvelServiceSecretSuper2026"
  };

  try {
    await setDoc(doc(db, "sales", finalId), sale);
  } catch (writeErr) {
    console.error("Failed to write registered sale into database:", writeErr);
  }

  return finalId;
}

/**
 * System-wide duplicate check to prevent identical sales with different order codes.
 */
async function checkSystemDuplicateOrder(parsed: any): Promise<boolean> {
  if (parsed.columbaOrderNo) {
    const columbaTag = `Columba #${parsed.columbaOrderNo}`;
    try {
      const qColumba = query(
        collection(db, "sales"),
        where("notes", "==", columbaTag),
        limit(5)
      );
      const snapColumba = await getDocs(qColumba);
      if (!snapColumba.empty) {
        console.log(`[Duplicate Check] Order with ${columbaTag} already exists in Firestore.`);
        return true;
      }
    } catch (err) {
      console.error("[Duplicate Check] Columba tag check error:", err);
    }
  }

  const phoneFormatted = formatPhoneNumber(parsed.phone || "");
  if (!phoneFormatted) {
    // If no phone, check by name and address today
    const name = (parsed.customerName || "").trim();
    const address = (parsed.address || "").trim();
    if (!name || name.toLowerCase() === "simsiz sifarişçi" || name.toLowerCase() === "unknown") {
      return false; 
    }

    try {
      const q = query(
        collection(db, "sales"),
        where("customerName", "==", name),
        limit(20)
      );
      const snap = await getDocs(q);
      if (snap.empty) return false;

      const now = new Date();
      for (const d of snap.docs) {
        const sale = d.data();
        const saleCreated = new Date(sale.createdAt);
        const diffHours = Math.abs(now.getTime() - saleCreated.getTime()) / (1000 * 60 * 60);
        if (diffHours < 24) {
          const addrMatch = (sale.address || "").trim().toLowerCase() === address.toLowerCase();
          const itemsMatch = compareParsedItemsWithSaleItems(parsed.products, sale.items);
          if (addrMatch || itemsMatch) {
            console.log(`[Duplicate Check] Found duplicate for customer "${name}" within last 24h.`);
            return true;
          }
        }
      }
    } catch (err) {
      console.error("[Duplicate Check] Error name checker:", err);
    }
    return false;
  }

  try {
    const q = query(
      collection(db, "sales"),
      where("customerPhone", "==", phoneFormatted),
      limit(20)
    );
    const snap = await getDocs(q);
    if (snap.empty) return false;

    const now = new Date();
    for (const d of snap.docs) {
      const sale = d.data();
      const saleCreated = new Date(sale.createdAt);
      const diffHours = Math.abs(now.getTime() - saleCreated.getTime()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        const itemsMatch = compareParsedItemsWithSaleItems(parsed.products, sale.items);
        if (itemsMatch) {
          console.log(`[Duplicate Check] Identical items found for phone "${phoneFormatted}" within last 24h.`);
          return true;
        }
        
        const addrMatch = parsed.address && sale.address && 
          (parsed.address.trim().toLowerCase().includes(sale.address.trim().toLowerCase()) ||
           sale.address.trim().toLowerCase().includes(parsed.address.trim().toLowerCase()));
        if (addrMatch) {
          console.log(`[Duplicate Check] Matching address & phone found for "${phoneFormatted}" within last 24h.`);
          return true;
        }
      }
    }
  } catch (err) {
    console.error("[Duplicate Check] Error phone checker:", err);
  }
  return false;
}

function compareParsedItemsWithSaleItems(parsedProducts: any[], saleItems: any[]): boolean {
  if (!parsedProducts || !saleItems) return false;
  const cleanParsed = parsedProducts.map(p => ({
    name: (p.name || "").toLowerCase().replace(/\s+/g, ""),
    qty: Number(p.quantity || 1)
  }));
  const cleanSale = saleItems.map(p => ({
    name: (p.productName || "").toLowerCase().replace(/\s+/g, ""),
    qty: Number(p.qty || 1)
  }));

  if (cleanParsed.length !== cleanSale.length) return false;
  cleanParsed.sort((a,b) => a.name.localeCompare(b.name));
  cleanSale.sort((a,b) => a.name.localeCompare(b.name));

  for (let i = 0; i < cleanParsed.length; i++) {
    const parsedName = cleanParsed[i].name;
    const saleName = cleanSale[i].name;
    const nameMatch = parsedName.includes(saleName) || saleName.includes(parsedName);
    const qtyMatch = cleanParsed[i].qty === cleanSale[i].qty;
    if (!nameMatch || !qtyMatch) {
      return false;
    }
  }
  return true;
}

/**
 * Runs active sweep check to pull, parse, and process manual updates from Telegram
 */
async function runTelegramSyncCheck(): Promise<{ processedCount: number; duplicatedCount: number; info?: string }> {
  isPollingPaused = true;
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const { botToken, chatId } = await getTelegramCredentials();
    if (!botToken) {
      isPollingPaused = false;
      return { processedCount: 0, duplicatedCount: 0, info: "Telegram konfiqurasiya edilməyib." };
    }

    let webhookUrl = "";
    try {
      const docSnap = await getDoc(doc(db, "settings", "telegram_polling"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.registeredWebhookUrl) {
          webhookUrl = data.registeredWebhookUrl;
        }
      }
    } catch (_) {}

    if (webhookUrl) {
      console.log(`[Telegram Sync] Webhook is active. Temporarily disabling webhook to pull updates...`);
      await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`);
    }

    let lastOffset = await getTelegramOffsetFromDb();
    console.log(`[Telegram Sync] Fetching updates with offset ${lastOffset}...`);
    const updateRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastOffset}&limit=100&timeout=5`);
    
    let processedCount = 0;
    let duplicatedCount = 0;

    if (updateRes.ok) {
      const updateData = await updateRes.json();
      if (updateData.ok && updateData.result.length > 0) {
        for (const update of updateData.result) {
          lastOffset = update.update_id + 1;
          await saveTelegramOffsetToDb(lastOffset);

          const message = update.message || update.channel_post || update.edited_message || update.edited_channel_post;
          if (!message) continue;

          // Process only messages from our specific group/channel (support negative prefix flexibility)
          const msgChatId = String(message.chat?.id || "");
          const isChatMatch = msgChatId === chatId || 
                              msgChatId.replace(/^-100/, "-") === chatId.replace(/^-100/, "-") ||
                              msgChatId.replace(/^-/, "") === chatId.replace(/^-100/, "");
          if (!isChatMatch) continue;

          const textMessage = message.text || message.caption;
          if (!textMessage) continue;

          const messageIdStr = String(message.message_id);
          if (processedMessageIds.has(messageIdStr)) {
            duplicatedCount++;
            continue;
          }

          const q1 = query(collection(db, "sales"), where("incomingTelegramMessageId", "==", messageIdStr));
          const q2 = query(collection(db, "sales"), where("telegramMessageId", "==", messageIdStr));
          const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

          if (!snap1.empty || !snap2.empty) {
            processedMessageIds.add(messageIdStr);
            duplicatedCount++;
            continue;
          }

          if (textMessage.startsWith("/")) {
            await handleTelegramCommand(message.chat.id, textMessage, message.message_id, botToken);
            processedMessageIds.add(messageIdStr);
            processedCount++;
            continue;
          }

          if (textMessage.trim().length >= 8) {
            const parsed = await parseFreeTextOrder(textMessage);
            if (parsed && parsed.isOrder) {
              const saleId = await registerParsedOrder(parsed, message.message_id);
              if (saleId === "DUPLICATE") {
                duplicatedCount++;
              } else {
                processedCount++;
                const newSaleSnap = await getDoc(doc(db, "sales", saleId));
                const finalSalesData = newSaleSnap.exists() ? newSaleSnap.data() : null;

                if (finalSalesData) {
                  const confirmData = await sendTelegramConfirmation(botToken, chatId, message.message_id, finalSalesData);
                  if (confirmData && confirmData.result && confirmData.result.message_id) {
                    try {
                      await updateDoc(doc(db, "sales", saleId), {
                        telegramMessageId: String(confirmData.result.message_id)
                      });
                    } catch (_) {}
                  }

                  try {
                    await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        chat_id: String(message.chat.id),
                        message_id: message.message_id
                      })
                    });
                  } catch (_) {}
                }
              }
            } else {
              // Non-order group maintenance
              try {
                await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: String(message.chat.id),
                    message_id: message.message_id
                  })
                });
              } catch (_) {}
            }
            processedMessageIds.add(messageIdStr);
          }
        }
      }
    }

    // Also scan for messages sent directly by the bot token itself (e.g., Columba.az Bildiriş Boti)
    const botScanReport = await scanRecentBotGroupMessages(botToken, chatId, 10);
    processedCount += botScanReport.processedCount;
    duplicatedCount += botScanReport.duplicatedCount;

    isPollingPaused = false;
    return { processedCount, duplicatedCount };
  } catch (err: any) {
    console.error("[Telegram Sync Error]:", err);
    isPollingPaused = false;
    return { processedCount: 0, duplicatedCount: 0, info: err.message || String(err) };
  }
}

function buildOriginalMessageText(sale: any): string {
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

  return `🛍 Sifariş: ${displayOrderNum}
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
 * Send interactive reply back to Telegram Group confirming the safe recording
 */
async function sendTelegramConfirmation(token: string, chatId: string, replyToMessageId: number, sale: any) {
  const baseText = buildOriginalMessageText(sale);
  const message = `🆕 Yeni Sifariş Qeydə Alındı!\n\n${baseText}`;

  try {
    const data = await fetchTelegramWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
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
    if (data && data.result && data.result.message_id) {
      const newMsgId = Number(data.result.message_id);
      processedMessageIds.add(String(newMsgId));
      if (!isNaN(newMsgId) && newMsgId > lastScannedBotMsgId) {
        saveLastScannedMessageIdToDb(newMsgId).catch(() => {});
      }
    }
    return data;
  } catch (err) {
    console.error("[Telegram Bot] Failed to send telegram confirmation message after 3 attempts:", err);
    return null;
  }
}

/**
 * Send an intelligent AI answer back to a user in the Telegram group/private chat
 */
async function sendTelegramAnswer(token: string, chatId: string, replyToMessageId: number, text: string) {
  try {
    await fetchTelegramWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        reply_to_message_id: replyToMessageId,
        parse_mode: "HTML"
      })
    });
    console.log(`[Telegram Bot] Intelligent response successfully replied to message ${replyToMessageId}`);
  } catch (err) {
    console.error(`[Telegram Bot] Failed to send intelligent reply to message ${replyToMessageId}:`, err);
  }
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
 * Direct database reports for Telegram commands
 */
async function generateBakuPeriodReport(type: string) {
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

  let salesDataList: any[] = [];
  let expensesDataList: any[] = [];

  try {
    const salesSnap = await getDocs(collection(db, "sales"));
    salesSnap.forEach(d => salesDataList.push(d.data()));
  } catch (err) {
    console.warn("[Scheduler Report] Sales fetch failed, using localDb fallback:", err);
    salesDataList = Object.values(localDb.sales || {});
  }

  try {
    const expensesSnap = await getDocs(collection(db, "expenses"));
    expensesSnap.forEach(d => expensesDataList.push(d.data()));
  } catch (err) {
    console.warn("[Scheduler Report] Expenses fetch failed, using localDb fallback:", err);
    expensesDataList = Object.values(localDb.expenses || {});
  }

  try {
    let totalCount = 0;
    let deliveredCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let totalSales = 0;
    let orderDetailStr = "";

    salesDataList.forEach(order => {
      const orderTime = order.createdAt;
      if (!orderTime || orderTime < startISO || orderTime > endISO) return;

      totalCount++;
      const amt = Number(order.totalAmount || 0);
      totalSales += amt;

      const status = order.status || "gözləyir";
      let emoji = "⏳";
      if (status === "çatdırılıb") {
        deliveredCount++;
        emoji = "✅";
      } else if (status === "ləğv edilib" || status === "ləğv edildi") {
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
    expensesDataList.forEach(exp => {
      const expTime = exp.createdAt;
      if (expTime && expTime >= startISO && expTime <= endISO) {
        totalExpenses += Number(exp.amount || 0);
      }
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

async function getFinancialSummary() {
  try {
    const salesSnap = await getDocs(collection(db, "sales"));
    const expensesSnap = await getDocs(collection(db, "expenses"));

    let totalSales = 0;
    salesSnap.forEach(d => {
      const order = d.data();
      if (order.status === "çatdırılıb") {
        totalSales += Number(order.totalAmount || 0);
      }
    });

    let totalExpenses = 0;
    expensesSnap.forEach(d => {
      totalExpenses += Number(d.data().amount || 0);
    });

    const netProfit = totalSales - totalExpenses;

    return `<b>💰 ÜMUMİ MALİYYƏ STATİSTİKASI</b>
━━━━━━━━━━━━━━━━━━━━━━
- 💎 Ümumi Satış (Çatdırılanlar): <b>${totalSales} AZN</b>
- 💸 Ümumi Xərc: <b>${totalExpenses} AZN</b>
- 📈 Xalis Mənfəət: <b>${netProfit} AZN</b>`;
  } catch (err) {
    console.error(err);
    return "❌ Gəlir məlumatları hesablana bilmədi.";
  }
}

async function getOrdersByStatus(targetStatus: string) {
  try {
    const salesSnap = await getDocs(query(collection(db, "sales"), where("status", "==", targetStatus)));

    if (salesSnap.empty) {
      return `⏳ <b>Gözləyən sifariş yoxdur!</b>`;
    }

    let text = `⏳ <b>GÖZLƏYƏN BÜTÜN SİFARİŞLƏR</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    salesSnap.forEach(d => {
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

async function getDeliveredOrdersToday() {
  try {
    const { startISO, endISO } = getBakuDayBoundaries(new Date());
    const salesSnap = await getDocs(query(collection(db, "sales"), where("status", "==", "çatdırılıb")));

    let text = `✅ <b>BU GÜN ÇATDIRILAN SİFARİŞLƏR</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    let count = 0;
    salesSnap.forEach(d => {
      const o = d.data();
      if (o.createdAt && o.createdAt >= startISO && o.createdAt <= endISO) {
        count++;
        const num = o.orderNumber || "Məlum deyil";
        const name = o.customerName || "Simsiz Müştəri";
        const amt = o.totalAmount || 0;
        text += `• #${num} — ${name} | 💰 ${amt} AZN\n`;
      }
    });

    if (count === 0) {
      return `✅ <b>Bu gün çatdırılan sifariş yoxdur.</b>`;
    }

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Məlumat tapılmadı.";
  }
}

async function getCancelledOrdersToday() {
  try {
    const { startISO, endISO } = getBakuDayBoundaries(new Date());
    const salesSnap = await getDocs(collection(db, "sales"));

    let text = `❌ <b>BU GÜN LƏĞV EDİLMİŞ SİFARİŞLƏR</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    let count = 0;
    salesSnap.forEach(d => {
      const o = d.data();
      if (o.status === "ləğv edilib" || o.status === "ləğv edildi") {
        if (o.createdAt && o.createdAt >= startISO && o.createdAt <= endISO) {
          count++;
          const num = o.orderNumber || "Məlum deyil";
          const name = o.customerName || "Simsiz Müştəri";
          const amt = o.totalAmount || 0;
          text += `• #${num} — ${name} | 💰 ${amt} AZN\n`;
        }
      }
    });

    if (count === 0) {
      return `❌ <b>Bu gün ləğv edilmiş sifariş yoxdur.</b>`;
    }

    return text;
  } catch (err) {
    console.error(err);
    return "❌ Məlumat tapılmadı.";
  }
}

async function getStockStatus() {
  try {
    const productsSnap = await getDocs(collection(db, "products"));
    if (productsSnap.empty) {
      return "📦 <b>Anbarda heç bir məhsul qeydə alınmayıb.</b>";
    }

    let text = `📦 <b>MƏHSULLARIN ANBAR STOK VƏZİYYƏTİ</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    productsSnap.forEach(d => {
      const p = d.data();
      const name = p.name || "Naməlum";
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

function formatSpecificOrderDetails(o: any, q: string) {
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
  if (o.items && Array.isArray(o.items)) {
    o.items.forEach((p: any) => {
      productsText += `  ▫️ ${p.productName} (${p.qty} ədəd) — ${p.unitPrice} AZN\n`;
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
📝 <b>Qeyd:</b> ${o.notes || "Yoxdur"}`;
}

async function getSpecificOrderDetails(orderNumQuery: string) {
  try {
    let q = orderNumQuery.trim().replace("#", "");
    const salesSnap = await getDocs(query(collection(db, "sales"), where("orderNumber", "==", q)));

    if (salesSnap.empty) {
      const salesSnapWithHash = await getDocs(query(collection(db, "sales"), where("orderNumber", "==", `#${q}`)));
      if (salesSnapWithHash.empty) {
        return `🔍 <b>Sifariş #${q} tapılmadı.</b>`;
      }
      return formatSpecificOrderDetails(salesSnapWithHash.docs[0].data(), q);
    }

    return formatSpecificOrderDetails(salesSnap.docs[0].data(), q);
  } catch (err) {
    console.error(err);
    return "❌ Sifariş axtarılarkən xəta baş verdi.";
  }
}

async function searchCustomer(queryStr: string) {
  try {
    const q = queryStr.trim().toLowerCase();
    
    const custSnap = await getDocs(collection(db, "customers"));
    const matchedUsers: any[] = [];
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
      const phone = u.phone;
      const salesSnap = await getDocs(query(collection(db, "sales"), where("customerPhone", "==", phone)));

      let orderCount = salesSnap.size;
      let lastDateText = "Sifariş verməyib";
      
      if (orderCount > 0) {
        let newest = 0;
        salesSnap.forEach(o => {
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

async function getTopCustomers() {
  try {
    const salesSnap = await getDocs(collection(db, "sales"));
    const userRankingMap: Record<string, { name: string; count: number; sum: number }> = {};

    salesSnap.forEach(d => {
      const o = d.data();
      const phone = o.customerPhone || o.phone;
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

async function getTopProducts() {
  try {
    const salesSnap = await getDocs(collection(db, "sales"));
    const productCountMap: Record<string, number> = {};

    salesSnap.forEach(d => {
      const o = d.data();
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((p: any) => {
          const name = p.productName || "Ayvelin 100 ml";
          const qty = Number(p.qty || 1);
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

async function getMonthlyExpensesByCategory() {
  try {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    
    const expensesSnap = await getDocs(collection(db, "expenses"));

    const expensesMap: Record<string, number> = {};
    let totalAll = 0;
    let count = 0;

    expensesSnap.forEach(d => {
      const e = d.data();
      if (e.createdAt && e.createdAt >= firstDay) {
        count++;
        const cat = e.category || "Digər/Təyin edilməyib";
        const amt = Number(e.amount || 0);
        totalAll += amt;
        expensesMap[cat] = (expensesMap[cat] || 0) + amt;
      }
    });

    if (count === 0) {
      return `💸 <b>Bu ay üçün heç bir xərc qeydə alınmayıb.</b>`;
    }

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

/**
 * Handle slash commands directly on the server level
 */
async function handleTelegramCommand(chatId: any, text: string, replyToId: any, botToken: string) {
  try {
    const parts = text.split(" ");
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    let responseText = "";

    switch (command) {
      case "/hesabat": {
        const subCmd = parts[1] ? parts[1].toLowerCase() : "bugun";
        if (subCmd === "bugun") {
          responseText = await generateBakuPeriodReport("bugun");
        } else if (subCmd === "bu_hefte" || subCmd === "bu_həftə" || subCmd === "hefte" || subCmd === "həftə") {
          responseText = await generateBakuPeriodReport("bu_hefte");
        } else if (subCmd === "bu_ay" || subCmd === "ay") {
          responseText = await generateBakuPeriodReport("bu_ay");
        } else {
          responseText = "⚠️ Zəhmət olmasa düzgün format seçin:\n<code>/hesabat bugun</code>\n<code>/hesabat bu_həftə</code>\n<code>/hesabat bu_ay</code>";
        }
        break;
      }

      case "/gelir": {
        responseText = await getFinancialSummary();
        break;
      }

      case "/gozleyir": {
        responseText = await getOrdersByStatus("gözləyir");
        break;
      }

      case "/catdirildi": {
        responseText = await getDeliveredOrdersToday();
        break;
      }

      case "/legv": {
        responseText = await getCancelledOrdersToday();
        break;
      }

      case "/stok": {
        responseText = await getStockStatus();
        break;
      }

      case "/sifaris": {
        if (!args) {
          responseText = "⚠️ Zəhmət olmasa sifariş nömrəsini daxil edin. Məsələn: <code>/sifaris 0015</code>";
        } else {
          responseText = await getSpecificOrderDetails(args);
        }
        break;
      }

      case "/musteri": {
        if (!args) {
          responseText = "⚠️ Zəhmət olmasa müştəri adını və ya telefonunu daxil edin. Məsələn: <code>/musteri Feride</code>";
        } else {
          responseText = await searchCustomer(args);
        }
        break;
      }

      case "/top_musteriler": {
        responseText = await getTopCustomers();
        break;
      }

      case "/top_mehsullar": {
        responseText = await getTopProducts();
        break;
      }

      case "/xercler": {
        responseText = await getMonthlyExpensesByCategory();
        break;
      }

      default:
        // Do not respond to unrecognized commands
        return;
    }

    if (responseText) {
      await fetchTelegramWithRetry(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: responseText,
          reply_to_message_id: replyToId,
          parse_mode: "HTML"
        })
      });
    }
  } catch (err) {
    console.error("[Telegram Command Error]:", err);
  }
}

/**
 * Handle a single update retrieved either via Webhook or Polling
 */
async function handleSingleTelegramUpdate(update: any, botToken: string, defaultChatId: string, ACTIVE_WEBHOOK_URL: string) {
  const message = update.message || update.channel_post || update.edited_message || update.edited_channel_post;
  if (!message) return;

  // Check if message is in private chat and store owner manual message metadata
  if (message.chat && message.chat.type === "private") {
    const textMessage = (message.text || message.caption || "").trim();
    if (textMessage && !textMessage.startsWith("/")) {
      console.log(`[Telegram] Private owner message detected. Storing message_id ${message.message_id} in Firestore.`);
      try {
        await setDoc(doc(db, "settings", "telegram_owner"), {
          owner_message_id: String(message.message_id),
          owner_chat_id: String(message.chat.id)
        }, { merge: true });
      } catch (err) {
        console.error("[Telegram] Failed to store private owner message metadata in Firestore:", err);
      }
    }
    return;
  }

  // Verify group / channel message matches targeted ID
  const msgChatId = String(message.chat?.id || "");
  const isTargetChat = msgChatId === defaultChatId ||
                       msgChatId.replace(/^-100/, "-") === defaultChatId.replace(/^-100/, "-") ||
                       msgChatId.replace(/^-/, "") === defaultChatId.replace(/^-100/, "");

  if (!isTargetChat) {
    console.log(`[Telegram Update] Message from chat ${msgChatId} ignored. Not matching configured chatId ${defaultChatId}`);
    return;
  }

  const textMessage = message.text || message.caption;
  if (!textMessage) return;

  // Handle CLI commands directly!
  if (textMessage.startsWith("/")) {
    console.log(`[Telegram Bot] CLI Command "${textMessage}" received.`);
    await handleTelegramCommand(message.chat.id, textMessage, message.message_id, botToken);
    
    // Also proxy-forward commands if the webhook URL exists
    if (ACTIVE_WEBHOOK_URL) {
      console.log(`[Telegram Bot] Proxy-forwarding CLI Command to: ${ACTIVE_WEBHOOK_URL}`);
      fetch(ACTIVE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update)
      }).catch(hErr => {
        console.error("[Telegram Bot] Failed to proxy forward command:", hErr);
      });
    }
    return;
  }

  console.log(`[Telegram Bot] Parsing potential group order: "${textMessage}" (ID: ${message.message_id})`);

  // Quick short length check before hitting AI
  if (textMessage.trim().length < 8) {
    console.log("[Telegram Bot] Text too short, skipping AI check.");
    return;
  }

  // Deduplication safeguard
  const messageIdStr = String(message.message_id);
  if (processedMessageIds.has(messageIdStr)) {
    console.log(`[Telegram Bot] Duplicate detected for msg_id ${messageIdStr}. Skipping.`);
    return;
  }
  processedMessageIds.add(messageIdStr);
  if (processedMessageIds.size > 2000) {
    const firstItem = processedMessageIds.values().next().value;
    if (firstItem !== undefined) processedMessageIds.delete(firstItem);
  }

  try {
    const parsed = await parseFreeTextOrder(textMessage);
    if (parsed && parsed.isOrder) {
      console.log("[Telegram Bot] Recognized as dynamic order, registering into Firestore...", parsed);
      const saleId = await registerParsedOrder(parsed, message.message_id);
      
      if (saleId === "DUPLICATE") {
        console.log("[Telegram Bot] Order already registered for message ID " + message.message_id + ". Skipping duplicate notification.");
        return;
      }

      // Load the saved sale document to get its assigned orderNumber
      const newSaleSnap = await getDoc(doc(db, "sales", saleId));
      const finalSalesData = newSaleSnap.exists() ? newSaleSnap.data() : null;

      if (finalSalesData) {
        // Send reply with same format back into the group
        const confirmData = await sendTelegramConfirmation(botToken, defaultChatId, message.message_id, finalSalesData);
        if (confirmData && confirmData.result && confirmData.result.message_id) {
          try {
            await updateDoc(doc(db, "sales", saleId), {
              telegramMessageId: String(confirmData.result.message_id)
            });
            console.log(`[Telegram Bot] Successfully updated order telegramMessageId to bot confirmation message_id: ${confirmData.result.message_id}`);
          } catch (uErr) {
            console.error("[Telegram Bot] Failed to update sale telegramMessageId after confirmation reply:", uErr);
          }
        }

        // Delete original user order message to keep group clean
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: String(message.chat.id),
              message_id: message.message_id
            })
          });
          console.log(`[Telegram] Deleted original user message_id: ${message.message_id}`);
        } catch (delErr) {
          console.error("[Telegram] Error deleting group message:", delErr);
        }
      }
    } else {
      console.log("[Telegram Bot] AI marked message as normal channel discussion/no purchase intent. Checking for business/analytic question...");
      const isQuery = textMessage.includes("?") || 
                      textMessage.trim().toLowerCase().includes("ai") ||
                      /satış|stok|kuryer|plan|hesabat|xülasə|proqnoz|mənfəət|gəlir|reklam|ədəd|manat|azn|kömək|vəziyyət|anbar|məlumat/i.test(textMessage);

      if (isQuery) {
        console.log(`[Telegram Bot] Match detected for question/analytic query: "${textMessage}". Invoking Gemini...`);
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: message.chat.id, action: "typing" })
          });
        } catch (_) {}

        const answer = await generateIntelligentBusinessAnswer(textMessage);
        await sendTelegramAnswer(botToken, String(message.chat.id), message.message_id, answer);

        // Delete custom user question
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: String(message.chat.id),
              message_id: message.message_id
            })
          });
        } catch (delErr) {
          console.error("[Telegram] Error deleting query message:", delErr);
        }
      } else {
        console.log("[Telegram Bot] Ignored non-analytic general comment.");
        // Delete general comment message to enforce "bot silsin" (keeps group clean)
        try {
          await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: String(message.chat.id),
              message_id: message.message_id
            })
          });
        } catch (delErr) {
          console.error("[Telegram] Error deleting comment message:", delErr);
        }
      }
    }
  } catch (parseErr) {
    console.error("[Telegram Bot] Error parsing or saving potential order info:", parseErr);
  }
}

let lastScannedBotMsgId = 0;
let isScanningBotMessages = false;

async function getLastScannedMessageIdFromDb(): Promise<number> {
  if (lastScannedBotMsgId > 0) return lastScannedBotMsgId;
  try {
    const docSnap = await getDoc(doc(db, "settings", "telegram_polling"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && typeof data.lastScannedMessageId === "number" && data.lastScannedMessageId > 0) {
        lastScannedBotMsgId = data.lastScannedMessageId;
        return lastScannedBotMsgId;
      }
    }
  } catch (err) {
    console.error("[Telegram Bot Scanner] Error reading lastScannedMessageId from DB:", err);
  }
  lastScannedBotMsgId = 560;
  return lastScannedBotMsgId;
}

async function saveLastScannedMessageIdToDb(msgId: number): Promise<void> {
  if (msgId > lastScannedBotMsgId) {
    lastScannedBotMsgId = msgId;
  }
  try {
    await setDoc(doc(db, "settings", "telegram_polling"), {
      lastScannedMessageId: lastScannedBotMsgId
    }, { merge: true });
  } catch (err) {
    console.error("[Telegram Bot Scanner] Error saving lastScannedMessageId to DB:", err);
  }
}

/**
 * Scans recent group message IDs for orders sent via the same Bot API token (e.g. Columba.az Bildiriş Boti),
 * which Telegram's getUpdates never returns because a bot does not receive its own outgoing messages.
 */
async function scanRecentBotGroupMessages(
  botToken: string,
  chatId: string,
  lookahead = 6
): Promise<{ processedCount: number; duplicatedCount: number }> {
  if (isScanningBotMessages || !botToken || !chatId) {
    return { processedCount: 0, duplicatedCount: 0 };
  }
  isScanningBotMessages = true;
  let processedCount = 0;
  let duplicatedCount = 0;

  try {
    const startId = await getLastScannedMessageIdFromDb();
    let highestExistingId = startId;

    for (let candidateId = startId + 1; candidateId <= startId + lookahead; candidateId++) {
      const candidateStr = String(candidateId);
      if (processedMessageIds.has(candidateStr)) {
        if (candidateId === highestExistingId + 1) {
          highestExistingId = candidateId;
        }
        continue;
      }

      // 1. Silent read-only check via stopPoll to see if message_id exists in chat
      const probeRes = await fetch(`https://api.telegram.org/bot${botToken}/stopPoll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: candidateId })
      });
      const probeData = await probeRes.json();
      const desc = String(probeData?.description || "");

      if (!desc.includes("message is not a poll")) {
        // Message does not exist (not sent yet or already deleted)
        continue;
      }

      highestExistingId = Math.max(highestExistingId, candidateId);

      // 2. Check if already recorded in Firestore sales
      const q1 = query(collection(db, "sales"), where("incomingTelegramMessageId", "==", candidateStr));
      const q2 = query(collection(db, "sales"), where("telegramMessageId", "==", candidateStr));
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      if (!snap1.empty || !snap2.empty) {
        processedMessageIds.add(candidateStr);
        duplicatedCount++;
        await saveLastScannedMessageIdToDb(highestExistingId);
        continue;
      }

      // 3. Retrieve bot-authored message object by toggling reply_markup
      const setMarkupRes = await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: candidateId,
          reply_markup: { inline_keyboard: [[{ text: "✓", callback_data: "noop" }]] }
        })
      });
      const setMarkupData = await setMarkupRes.json();

      // Immediately restore empty reply_markup
      await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: candidateId,
          reply_markup: { inline_keyboard: [] }
        })
      }).catch(() => {});

      if (!setMarkupData?.ok || !setMarkupData?.result) {
        processedMessageIds.add(candidateStr);
        await saveLastScannedMessageIdToDb(highestExistingId);
        continue;
      }

      const msgObj = setMarkupData.result;
      const msgText = (msgObj.text || msgObj.caption || "").trim();
      if (!msgText) {
        processedMessageIds.add(candidateStr);
        await saveLastScannedMessageIdToDb(highestExistingId);
        continue;
      }

      // Skip our own confirmation / report / diagnostic messages
      if (
        msgText.startsWith("🆕 Yeni Sifariş Qeydə Alındı!") ||
        msgText.startsWith("🛍 Sifariş:") ||
        msgText.startsWith("📊") ||
        msgText.startsWith("🚨 Ayvel Diaqnostika") ||
        msgText.startsWith("🧪 Columba.az Bildiriş Boti Test")
      ) {
        processedMessageIds.add(candidateStr);
        await saveLastScannedMessageIdToDb(highestExistingId);
        continue;
      }

      console.log(`[Telegram Bot Scanner] Detected unprocessed bot-authored order message #${candidateId} in group!`);
      await handleSingleTelegramUpdate({ message: msgObj }, botToken, chatId, "");
      processedCount++;

      if (lastScannedBotMsgId > highestExistingId) {
        highestExistingId = lastScannedBotMsgId;
      }
      await saveLastScannedMessageIdToDb(highestExistingId);
    }

    if (highestExistingId > startId) {
      await saveLastScannedMessageIdToDb(highestExistingId);
    }
  } catch (err) {
    console.error("[Telegram Bot Scanner] Error scanning recent bot group messages:", err);
  } finally {
    isScanningBotMessages = false;
  }

  return { processedCount, duplicatedCount };
}

/**
 * Retrieve the latest processed Telegram update offset from DB
 */
async function getTelegramOffsetFromDb(): Promise<number> {
  try {
    const docSnap = await getDoc(doc(db, "settings", "telegram_polling"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && typeof data.lastOffset === "number" && data.lastOffset < 800000000) {
        return data.lastOffset;
      }
    }
  } catch (err) {
    console.error("[Telegram Offset] Error reading offset from DB:", err);
  }
  return 0;
}

/**
 * Saves the latest Telegram update offset to DB
 */
async function saveTelegramOffsetToDb(offset: number): Promise<void> {
  if (offset >= 800000000) return;
  try {
    await setDoc(doc(db, "settings", "telegram_polling"), {
      lastOffset: offset
    }, { merge: true });
  } catch (err) {
    console.error("[Telegram Offset] Error saving offset to DB:", err);
  }
}

/**
 * Polling background daemon loop
 */
async function startTelegramPolling() {
  console.log("[Telegram Bot] Initiating continuous polling & bot-message scanner background thread...");

  const ACTIVE_WEBHOOK_URL = "";

  // Ensure any stale webhook is cleared so getUpdates can run without 409 conflict
  try {
    const { botToken } = await getTelegramCredentials();
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const infoJson = await infoRes.json();
    console.log("[Telegram Bot] Webhook status check on boot:", infoJson);
    if (infoJson.ok && infoJson.result && infoJson.result.url) {
      console.warn(`[Telegram Bot] Clearing active Webhook "${infoJson.result.url}" to enable continuous polling...`);
      await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`);
    }
    await setDoc(doc(db, "settings", "telegram_polling"), {
      registeredWebhookUrl: ""
    }, { merge: true });
  } catch (webErr) {
    console.error("[Telegram Bot] Error executing webhook safety diagnostic routine Check:", webErr);
  }

  let lastOffset = await getTelegramOffsetFromDb();
  if (lastOffset === 0) {
    try {
      const { botToken } = await getTelegramCredentials();
      const bootRes = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-1&limit=1`);
      const bootJson = await bootRes.json();
      if (bootJson.ok && bootJson.result.length > 0) {
        lastOffset = bootJson.result[0].update_id + 1;
        await saveTelegramOffsetToDb(lastOffset);
        console.log(`[Telegram Bot] Continuous polling bootstrapped, setting future active index offset: ${lastOffset}`);
      }
    } catch (bootErr) {
      console.error("[Telegram Bot] Polling initial setup failed during bootstrap phase:", bootErr);
    }
  }

  isTelegramReady = true;
  console.log("[Telegram Bot] System hazırdır. Mesaj göndərməyə və qəbul etməyə hazır.");

  while (true) {
    try {
      if (isPollingPaused) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      const { botToken, chatId } = await getTelegramCredentials();

      // 1. Scan for messages posted into the group by the bot token itself (e.g. Columba.az Bildiriş Boti)
      await scanRecentBotGroupMessages(botToken, chatId, 6);

      // 2. Poll Telegram getUpdates for messages sent by users
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastOffset}&timeout=5`);
      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 409) {
          // Clear webhook if a webhook caused the 409 conflict
          try {
            const whCheck = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).then(r => r.json());
            if (whCheck?.result?.url) {
              await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=false`);
              continue;
            }
          } catch (_) {}
          const backoffTime = 10000 + Math.floor(Math.random() * 5000);
          console.warn(`[Telegram Bot] Conflict (status 409): Another bot instance is polling. Backing off for ${Math.round(backoffTime / 1000)}s.`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else {
          console.error(`[Telegram Bot] getUpdates failed with status ${response.status}: ${errText}`);
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
        continue;
      }
      const data = await response.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          lastOffset = update.update_id + 1;
          await saveTelegramOffsetToDb(lastOffset);

          const msg = update.message || update.channel_post;
          if (msg && msg.message_id && Number(msg.message_id) > lastScannedBotMsgId) {
            await saveLastScannedMessageIdToDb(Number(msg.message_id));
          }

          await handleSingleTelegramUpdate(update, botToken, chatId, ACTIVE_WEBHOOK_URL);
        }
      }
    } catch (err) {
      console.error("[Telegram Bot] Continuous update retrieval failure:", err);
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
    // Polite rest between requests
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

/**
 * Automatically delete manual message in private chat when a new sale/order is registered
 */
async function processManualMessageAutoDelete(db: any) {
  try {
    const docSnap = await getDoc(doc(db, "settings", "telegram_owner"));
    if (!docSnap.exists()) {
      console.log("[Auto-Delete] No telegram_owner settings found in Firestore.");
      return;
    }

    const data = docSnap.data();
    if (!data) return;
    const owner_message_id = data.owner_message_id;
    const owner_chat_id = data.owner_chat_id;

    if (!owner_message_id || !owner_chat_id) {
      console.log("[Auto-Delete] No active owner_message_id or owner_chat_id stored.");
      return;
    }

    console.log(`[Auto-Delete] Stored owner message detected (ID: ${owner_message_id}, Chat: ${owner_chat_id}). Calling Telegram deleteMessage...`);

    const { botToken } = await getTelegramCredentials();
    const response = await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: owner_chat_id,
        message_id: Number(owner_message_id)
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Auto-Delete] Telegram deleteMessage API failed: ${errText}`);
    } else {
      const resJson = await response.json();
      console.log(`[Auto-Delete] Telegram deleteMessage API succeeded:`, resJson);
    }
  } catch (err) {
    console.error("[Auto-Delete] Error deleting manual message:", err);
  } finally {
    try {
      // STEP 5 — CLEANUP:
      // After successful deletion, set owner_message_id = null in Firestore.
      await setDoc(doc(db, "settings", "telegram_owner"), {
        owner_message_id: null
      }, { merge: true });
      console.log("[Auto-Delete] Cleanup completed: owner_message_id set to null in Firestore.");
    } catch (cleanupErr) {
      console.error("[Auto-Delete] Cleanup error:", cleanupErr);
    }
  }
}

/**
 * Real-time listener to sync sale status changes to Telegram
 */
function listenForSaleStatusUpdates(db: any) {
  console.log("[Real-Time Status Sync] Starting listener on recent sales for Telegram status synchronization...");
  let isInitial = true;
  try {
    const qRecentSales = query(collection(db, "sales"), orderBy("createdAt", "desc"), limit(50));
    onSnapshot(qRecentSales, (snapshot) => {
      if (isInitial) {
        isInitial = false;
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const saleData = change.doc.data();
          const msgId = saleData.telegramMessageId || saleData.incomingTelegramMessageId || saleData.telegram_message_id;
          if (msgId) {
            console.log(`[Real-Time Status Sync] Sale ${saleData.orderNumber || change.doc.id} modified (Status: ${saleData.status}). Syncing to Telegram msgId ${msgId}...`);
            getTelegramCredentials().then(({ botToken, chatId }) => {
              const baseText = buildOriginalMessageText(saleData);
              const text = `🆕 Yeni Sifariş Qeydə Alındı!\n\n${baseText}`;
              fetchTelegramWithRetry(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_id: Number(msgId),
                  text
                })
              }).then(data => {
                if (data && data.ok) {
                  console.log(`[Real-Time Status Sync] Telegram msgId ${msgId} successfully updated for order ${saleData.orderNumber}.`);
                }
              }).catch(err => {
                console.error("[Real-Time Status Sync] Failed editing Telegram message:", err);
              });
            }).catch(err => {
              console.error("[Real-Time Status Sync] Failed retrieving credentials:", err);
            });
          }
        }
      });
    }, (err) => {
      console.error("[Real-Time Status Sync] Snapshot listener error:", err);
    });
  } catch (err) {
    console.error("[Real-Time Status Sync] Setup failed:", err);
  }
}

/**
 * Real-time listeners to catch new documents added to 'sales' or 'orders' collection
 */
function listenForNewDocAutoDelete(db: any) {
  console.log("[Auto-Delete] Starting real-time Firestore listeners on sales & orders collections with limit(1)...");
  let isInitialSales = true;
  let isInitialOrders = true;

  const qSales = query(collection(db, "sales"), limit(1));
  onSnapshot(qSales, (snapshot) => {
    if (isInitialSales) {
      isInitialSales = false;
      return;
    }
    let hasNewDoc = false;
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        hasNewDoc = true;
      }
    });
    if (hasNewDoc) {
      console.log("[Auto-Delete] Database change trigger: New sale doc added. Initiating auto-delete flow...");
      processManualMessageAutoDelete(db).catch((err) => {
        console.error("[Auto-Delete] Sales trigger handler error:", err);
      });
    }
  }, (err) => {
    console.error("[Auto-Delete] Sales real-time onSnapshot tracking failure:", err);
  });

  const qOrders = query(collection(db, "orders"), limit(1));
  onSnapshot(qOrders, (snapshot) => {
    if (isInitialOrders) {
      isInitialOrders = false;
      return;
    }
    let hasNewDoc = false;
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        hasNewDoc = true;
      }
    });
    if (hasNewDoc) {
      console.log("[Auto-Delete] Database change trigger: New order doc added. Initiating auto-delete flow...");
      processManualMessageAutoDelete(db).catch((err) => {
        console.error("[Auto-Delete] Orders trigger handler error:", err);
      });
    }
  }, (err) => {
    console.error("[Auto-Delete] Orders real-time onSnapshot tracking failure:", err);
  });
}

// Configure Vite middleware or static serving
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });

  // Perform server-side Firebase Authentication cycle
  await initServerAuth();

  // Always start continuous polling + bot-message scanner in both development and production
  console.log("[Telegram Bot] Activating continuous polling and Columba bot-message scanner...");
  startTelegramPolling().catch((err) => {
    console.error("[Telegram Bot] Failed to start continuous polling:", err);
  });

  // Start the real-time auto-delete listener for owners' manual order notes and sale status listener
  try {
    listenForNewDocAutoDelete(db);
    listenForSaleStatusUpdates(db);
  } catch (err) {
    console.error("[Telegram Bot] Failed to activate real-time listeners:", err);
  }

  // Start the daily report scheduler on startup
  startDailyReportScheduler(db).catch((schedErr) => {
    console.error("[Daily Report Scheduler] Fatal background scheduler crash:", schedErr);
  });

  // Start periodic Telegram checking every 5 minutes
  setInterval(async () => {
    console.log("[Telegram Scheduler] Triggering automatic 5-minute periodic Telegram updates sync...");
    try {
      const report = await runTelegramSyncCheck();
      console.log(`[Telegram Scheduler] Automatic sync sweep completed. Processed: ${report.processedCount}, Duplicated: ${report.duplicatedCount}`);
    } catch (err) {
      console.error("[Telegram Scheduler] Periodic automatic check failed:", err);
    }
  }, 5 * 60 * 1000);
}

setupVite().catch((err) => {
  console.error("Failed to boot Express/Vite server:", err);
});
