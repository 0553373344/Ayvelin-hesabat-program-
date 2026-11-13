import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc as firestoreSetDoc, 
  addDoc as firestoreAddDoc, 
  updateDoc as firestoreUpdateDoc, 
  deleteDoc, 
  getDoc,
  query, 
  orderBy,
  runTransaction,
  getDocs,
  Timestamp,
  disableNetwork,
  enableNetwork
} from "firebase/firestore";

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

function setDoc(reference: any, data: any, options?: any) {
  return firestoreSetDoc(reference, cleanUndefined(data), options);
}

function addDoc(reference: any, data: any) {
  return firestoreAddDoc(reference, cleanUndefined(data));
}

function updateDoc(reference: any, data: any) {
  return firestoreUpdateDoc(reference, cleanUndefined(data));
}
import { db, auth, handleFirestoreError, OperationType, enableIndexedDbPersistence } from "../firebase";
import { onAuthStateChanged, User, signInAnonymously } from "firebase/auth";
import { 
  Customer, 
  Product, 
  Courier, 
  Sale, 
  Expense, 
  Settings,
  StockHistoryItem,
  SaleItem,
  Toast,
  StockTransfer
} from "../types";
import { formatPhoneNumber } from "../utils/phoneFormatter";
import { formatDisplayOrderNumber, cleanOrderNumberForDb, generateDateTimeOrderNumber, formatToBakuYMD, getBakuTodayYMD } from "../utils/orderFormatter";
import { syncSaleToGoogleCalendar, deleteSaleFromGoogleCalendar } from "../utils/googleCalendarService";
import { syncCustomerToGoogleContacts, deleteContactFromGoogleContacts } from "../utils/googleContactsService";
import { sendTelegramNewOrder, updateTelegramOrderDelivered, syncOrderStatusToTelegram } from "../utils/telegramService";
import { clearLocalStore } from "../utils/localDb";

export interface DataContextType {
  currentUser: User | null;
  loading: boolean;
  customers: Customer[];
  products: Product[];
  couriers: Courier[];
  sales: Sale[];
  expenses: Expense[];
  settings: Settings;
  toasts: Toast[];
  stockTransfers: StockTransfer[];
  isMigrating: boolean;
  transferStockToCourier: (productId: string, courierId: string, quantity: number) => Promise<void>;
  runDataMigration: () => Promise<void>;
  removeToast: (id: string) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  saveCustomer: (customer: Omit<Customer, "orderCount" | "totalSpent" | "isVIP"> & Partial<Pick<Customer, "orderCount" | "totalSpent" | "isVIP">>) => Promise<string>;
  toggleCustomerBlacklist: (customerId: string, isBlacklisted: boolean, reason?: string) => Promise<void>;
  syncAllCancelledCustomersToBlacklist: (defaultReason?: string) => Promise<{ addedCount: number; updatedCount: number }>;
  deleteCustomer: (id: string) => Promise<void>;
  saveProduct: (product: Product) => Promise<string>;
  adjustProductStock: (productId: string, change: number, reason: string, note?: string) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  saveCourier: (courier: Courier) => Promise<string>;
  deleteCourier: (id: string) => Promise<void>;
  createSale: (sale: Omit<Sale, "id" | "orderNumber" | "isRevenueCalculated" | "statusHistory">) => Promise<string>;
  updateSaleStatus: (saleId: string, newStatus: "gözləyir" | "çatdırılıb" | "ləğv edilib") => Promise<void>;
  updateSale: (saleId: string, updatedFields: Partial<Sale>) => Promise<void>;
  copySaleAsNew: (sale: Sale) => Promise<string>;
  deleteSale: (id: string) => Promise<void>;
  saveExpense: (expense: Omit<Expense, "id"> & { id?: string }) => Promise<string>;
  deleteExpense: (id: string) => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
  resetAllData: () => Promise<void>;
  wipeAllSystemData: () => Promise<void>;
  importExcelData: (data: {
    parsedSales: any[];
    parsedExpenses: any[];
    parsedProducts: any[];
    parsedCustomers?: any[];
    parsedCouriers?: any[];
    overriddenCustomerNames: Record<string, string>;
    isOverwrite?: boolean;
    onProgress?: (progress: { phase: string; current: number; total: number; message: string; log?: string }) => void;
  }) => Promise<{
    success: boolean;
    importedSalesCount: number;
    importedExpensesCount: number;
    importedProductsCount: number;
    importedCustomersCount: number;
    importedCouriersCount: number;
    mismatchCount: number;
    errors: string[];
  }>;
  importBackupJSON: (backupData: any, isOverwrite: boolean) => Promise<void>;
  googleAccessToken: string | null;
  setGoogleAccessToken: (token: string | null) => void;
  syncSingleSaleToCalendar: (sale: Sale, customToken?: string) => Promise<void>;
  syncAllSalesToCalendar: (onProgress?: (progress: { current: number; total: number; orderNumber: string }) => void) => Promise<{ successCount: number; errorCount: number }>;
  syncSingleCustomerToContacts: (customer: Customer, customToken?: string) => Promise<void>;
  syncAllCustomersToContacts: (onProgress?: (progress: { current: number; total: number; name: string }) => void) => Promise<{ successCount: number; errorCount: number }>;
  isNewOrderOpen: boolean;
  setIsNewOrderOpen: (val: boolean) => void;
  offlineMode: boolean;
  setOfflineMode: (val: boolean) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
};

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessTokenState] = useState<string | null>(() =>
    localStorage.getItem("gAccessToken") || null
  );

  const setGoogleAccessToken = (token: string | null) => {
    setGoogleAccessTokenState(token);
    if (token) {
      localStorage.setItem("gAccessToken", token);
    } else {
      localStorage.removeItem("gAccessToken");
    }
  };

  const [loadedCount, setLoadedCount] = useState(0);

  // States initialized cleanly - Firestore's native IndexedDB cache provides 0ms initial real data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    id: "general",
    businessName: "Ayvelin",
    currency: "₼",
    lowStockThreshold: 5,
    vipThreshold: 5,
    expenseCategories: ["Çatdırılma", "Reklam", "Maaş", "Ofis", "İstehsalat", "Digər"],
    productCategories: ["Geyim", "Aksesuar", "Elektronika", "Kosmetika", "Mətbəx", "Digər"],
    logoUrl: ""
  });

  const customersRef = useRef(customers);
  customersRef.current = customers;
  const productsRef = useRef(products);
  productsRef.current = products;
  const couriersRef = useRef(couriers);
  couriersRef.current = couriers;
  const salesRef = useRef(sales);
  salesRef.current = sales;
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stockTransfersRef = useRef(stockTransfers);
  stockTransfersRef.current = stockTransfers;

  // Purge any old, stale ad-hoc IndexedDB cache so real Firestore data is always 100% accurate
  useEffect(() => {
    try {
      localStorage.removeItem("ayvelin_fast_cache");
      localStorage.removeItem("ayvelin_fast_cache_v2");
    } catch (_) {}
    clearLocalStore().catch(() => {});
    enableIndexedDbPersistence().catch(() => {});
  }, []);

  // Immediate safety timeout: user never waits more than 250ms on screen
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const columbaFixedRef = useRef(false);
  const financialFixDoneRef = useRef(false);

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const triggerAutoDriveBackup = async (token: string, dateKey: string) => {
    try {
      console.log(`[Auto Backup] Initiating automatic Google Drive backup for ${dateKey}...`);
      const backupPayload = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        customers,
        products,
        couriers,
        sales,
        expenses,
        settings
      };

      const boundary = 'ayvelin_boundary_314159';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = {
        name: `ayvelin_auto_backup_${dateKey}_${new Date().toISOString().replace(/:/g, '-')}.json`,
        mimeType: 'application/json',
        description: `Ayvelin Sifariş və Kuryer İdarəetmə Paneli Avtomatik Gün Sonu Yedəyi (${dateKey})`
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(backupPayload, null, 2) +
        close_delim;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });

      if (!res.ok) {
        throw new Error("Yüklənmə xətası: " + res.status);
      }

      localStorage.setItem("lastAutoDriveBackupDate", dateKey);
      addToast({
        title: "🔄 Avtomatik Yedəkləmə",
        content: `Gün sonu məlumatlarınız uğurla Google Drive-a yedəkləndi! (${dateKey})`,
        type: "success"
      });
      console.log(`[Auto Backup] Succeeded for date: ${dateKey}`);
    } catch (err: any) {
      console.error("[Auto Backup] Automatic Drive backup failed:", err);
    }
  };

  useEffect(() => {
    if (!googleAccessToken) return;

    const checkAndTriggerBackup = () => {
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Baku",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "numeric",
          hour12: false
        });
        const parts = formatter.formatToParts(now);
        const year = parts.find(p => p.type === 'year')?.value || '';
        const month = parts.find(p => p.type === 'month')?.value || '';
        const day = parts.find(p => p.type === 'day')?.value || '';
        const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
        
        const dateKey = `${year}-${month}-${day}`;
        const lastBackupDate = localStorage.getItem("lastAutoDriveBackupDate");

        // End of day is considered hour >= 21 (9:00 PM / 21:00 or later)
        if (hour >= 21) {
          if (lastBackupDate !== dateKey) {
            triggerAutoDriveBackup(googleAccessToken, dateKey);
          }
        }
      } catch (err) {
        console.error("[Auto Backup Check Picker Error]:", err);
      }
    };

    // Check on mount (delayed slightly so context loaded properly)
    const timer = setTimeout(checkAndTriggerBackup, 8000);

    // Also check every 10 minutes
    const interval = setInterval(checkAndTriggerBackup, 10 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [googleAccessToken, customers, products, couriers, sales, expenses, settings]);

  // Track authentication state with automatic anonymous fallback
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecked(true);
      if (!user) {
        signInAnonymously(auth).catch(() => {});
      }
    });
    return unsubAuth;
  }, []);

  const [offlineMode, setOfflineMode] = useState(false);
  const isOfflineModeEnabled = useRef(false);

  const loadOfflineFallbackData = async () => {
    // Firestore's persistentLocalCache in IndexedDB handles offline caching natively.
    // Never overwrite live collections with static dummy test data.
  };

  useEffect(() => {
    // Attach real-time listeners immediately without blocking on authentication handshake
    const unsubCustomers = onSnapshot(collection(db, "customers"), (snap) => {
      const data: Customer[] = [];
      snap.forEach((docSnap) => {
        data.push(docSnap.data() as Customer);
      });
      const sorted = data.sort((a,b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
      setCustomers(sorted);
      setLoadedCount((p) => p + 1);
    }, (err) => {
      console.warn("Customers subscription notice:", err?.message || err);
    });

    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      const data: Product[] = [];
      snap.forEach((docSnap) => {
        data.push(docSnap.data() as Product);
      });
      const sorted = data.sort((a,b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
      setProducts(sorted);
      setLoadedCount((p) => p + 1);
    }, (err) => {
      console.warn("Products subscription notice:", err?.message || err);
    });

    const unsubCouriers = onSnapshot(collection(db, "couriers"), (snap) => {
      const data: Courier[] = [];
      snap.forEach((docSnap) => {
        data.push(docSnap.data() as Courier);
      });
      const sorted = data.sort((a,b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
      setCouriers(sorted);
      setLoadedCount((p) => p + 1);
    }, (err) => {
      console.warn("Couriers subscription notice:", err?.message || err);
    });

    const unsubSales = onSnapshot(collection(db, "sales"), (snap) => {
      const data: Sale[] = [];
      snap.forEach((docSnap) => {
        const rawSale = docSnap.data();
        const sale = { ...rawSale } as Sale;

        let parsedOrderDate = rawSale.createdAt || rawSale.order_created_at || "";
        if (!parsedOrderDate && rawSale.order_date) {
          if (typeof rawSale.order_date.toDate === "function") {
            parsedOrderDate = rawSale.order_date.toDate().toISOString();
          } else if (rawSale.order_date.seconds) {
            parsedOrderDate = new Date(rawSale.order_date.seconds * 1000).toISOString();
          } else {
            parsedOrderDate = String(rawSale.order_date);
          }
        } else if (!parsedOrderDate) {
          parsedOrderDate = new Date().toISOString();
        }

        let parsedDeliveryDate = rawSale.deliveredAt || null;
        if (!parsedDeliveryDate && rawSale.delivery_date) {
          if (typeof rawSale.delivery_date.toDate === "function") {
            parsedDeliveryDate = rawSale.delivery_date.toDate().toISOString();
          } else if (rawSale.delivery_date.seconds) {
            parsedDeliveryDate = new Date(rawSale.delivery_date.seconds * 1000).toISOString();
          } else {
            parsedDeliveryDate = String(rawSale.delivery_date);
          }
        }

        sale.order_date = parsedOrderDate;
        sale.delivery_date = parsedDeliveryDate;

        sale.createdAt = parsedOrderDate;
        sale.order_created_at = parsedOrderDate;
        sale.deliveredAt = parsedDeliveryDate || undefined;

        const computedSubtotal = sale.items ? sale.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) : 0;
        const isCancelled = sale.status === "ləğv edilib";
        const discountInput = sale.discountAmount || 0;
        
        const correctTotalAmount = isCancelled ? 0 : Math.max(0, computedSubtotal - discountInput);
        const correctNetRevenue = isCancelled ? 0 : Math.max(0, computedSubtotal - discountInput - (sale.deliveryCost || 0));

        sale.totalProductPrice = computedSubtotal;
        sale.totalAmount = correctTotalAmount;
        sale.netRevenue = correctNetRevenue;

        data.push(sale);
      });
      const sortedSales = data.sort((a,b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
      setSales(sortedSales);
      setLoadedCount((p) => p + 1);
      // Immediately unblock interface when sales arrives
      setLoading(false);
    }, (err) => {
      console.warn("Sales subscription notice:", err?.message || err);
    });

    const unsubExpenses = onSnapshot(collection(db, "expenses"), (snap) => {
      const data: Expense[] = [];
      snap.forEach((docSnap) => {
        data.push(docSnap.data() as Expense);
      });
      const sorted = data.sort((a,b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
      setExpenses(sorted);
      setLoadedCount((p) => p + 1);
    }, (err) => {
      console.warn("Expenses subscription notice:", err?.message || err);
    });

    const unsubSettings = onSnapshot(doc(db, "settings", "general"), (docSnap) => {
      if (docSnap.exists()) {
        const sett = docSnap.data() as Settings;
        setSettings(sett);
      } else {
        const defaultSettings: Settings = {
          id: "general",
          businessName: "Ayvelin",
          currency: "₼",
          lowStockThreshold: 5,
          vipThreshold: 5,
          expenseCategories: ["Çatdırılma", "Reklam", "Maaş", "Ofis", "İstehsalat", "Digər"],
          productCategories: ["Geyim", "Aksesuar", "Elektronika", "Kosmetika", "Mətbəx", "Digər"]
        };
        setDoc(doc(db, "settings", "general"), defaultSettings)
          .catch((err) => console.warn("Failed to set default settings:", err));
      }
      setLoadedCount((p) => p + 1);
    }, (err) => {
      console.warn("Settings subscription notice:", err?.message || err);
    });

    const unsubTransfers = onSnapshot(collection(db, "stockTransfers"), (snap) => {
      const data: StockTransfer[] = [];
      snap.forEach((docSnap) => {
        data.push(docSnap.data() as StockTransfer);
      });
      const sorted = data.sort((a,b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
      setStockTransfers(sorted);
      setLoadedCount((p) => p + 1);
    }, (err) => {
      console.warn("Stock transfers subscription notice:", err?.message || err);
    });

    return () => {
      unsubCustomers();
      unsubProducts();
      unsubCouriers();
      unsubSales();
      unsubExpenses();
      unsubSettings();
      unsubTransfers();
    };
  }, []);

  // Helper to re-calc specific Customer values on Firestore safely
  const syncCustomerStats = async (customerId: string, allSales: Sale[], vipThreshold: number) => {
    if (!customerId) return;
    const customerSales = allSales.filter(s => s.customerId === customerId && s.status === "çatdırılıb");
    const orderCount = customerSales.length;
    const totalSpent = customerSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const isVIP = orderCount >= vipThreshold;
    
    let firstOrderDate = "";
    let lastOrderDate = "";
    if (orderCount > 0) {
      const dates = customerSales.map(s => s.createdAt).sort();
      firstOrderDate = dates[0];
      lastOrderDate = dates[dates.length - 1];
    }

    try {
      const custDocRef = doc(db, "customers", customerId);
      await updateDoc(custDocRef, {
        orderCount,
        totalSpent,
        isVIP,
        ...(firstOrderDate ? { firstOrderDate, lastOrderDate } : {})
      });
    } catch {
      // customer might have been deleted, ignore
    }
  };

  const syncCourierStats = async (courierId: string, allSales: Sale[]) => {
    if (!courierId) return;
    const targetCourier = couriers.find(c => c.id === courierId);
    const isColumba = targetCourier?.isDepotBased === true;
    const courierSales = allSales.filter(s => {
      if (isColumba) {
        const saleCourier = s.courierId ? couriers.find(c => c.id === s.courierId) : null;
        const hasColumbaText = (s.courierName || "").toLowerCase().includes("columba") || 
                               (s.cargoCompany || "").toLowerCase().includes("columba") || 
                               (s.notes || "").toLowerCase().includes("columba");
        return (
          s.courierId === courierId ||
          saleCourier?.isDepotBased === true ||
          hasColumbaText
        );
      }
      return s.courierId === courierId;
    });
    const deliveredCount = courierSales.filter(s => s.status === "çatdırılıb").length;
    const totalEarnings = courierSales
      .filter(s => s.status === "çatdırılıb" && s.deliveryType === "courier")
      .reduce((acc, s) => acc + s.deliveryCost, 0);
    
    // stockBalance represent active stocks handed to courier (e.g. status is "gözləyir")
    let assignedItemsCount = courierSales
      .filter(s => s.status === "gözləyir")
      .reduce((acc, s) => acc + s.items.reduce((sum, item) => sum + item.qty, 0), 0);
      
    if (isColumba) {
      assignedItemsCount = targetCourier?.stock_quantity || 0;
    }

    try {
      const courierDocRef = doc(db, "couriers", courierId);
      await updateDoc(courierDocRef, {
        totalDeliveries: deliveredCount,
        totalEarnings: totalEarnings,
        stockBalance: assignedItemsCount
      });
    } catch {
      // Ignored
    }
  };

  // CRUD Operations
  const saveCustomer = async (cust: Omit<Customer, "orderCount" | "totalSpent" | "isVIP" | "googleContactResourceName"> & Partial<Pick<Customer, "orderCount" | "totalSpent" | "isVIP" | "googleContactResourceName">>): Promise<string> => {
    const finalId = cust.id || `customer_${Date.now()}`;
    const existing = customers.find(c => c.id === finalId);
    const newDoc: Customer = {
      id: finalId,
      name: cust.name,
      phone: formatPhoneNumber(cust.phone),
      addresses: cust.addresses || [],
      notes: cust.notes || "",
      createdAt: cust.createdAt || new Date().toISOString(),
      orderCount: cust.orderCount || 0,
      totalSpent: cust.totalSpent || 0,
      isVIP: cust.isVIP || false,
      firstOrderDate: cust.firstOrderDate || "",
      lastOrderDate: cust.lastOrderDate || "",
      googleContactResourceName: cust.googleContactResourceName || existing?.googleContactResourceName || "",
      altPhone: cust.altPhone || existing?.altPhone || "",
      city: cust.city || existing?.city || "Bakı",
      region: cust.region || existing?.region || "",
      tags: cust.tags || existing?.tags || [],
      isBlacklisted: cust.isBlacklisted !== undefined ? cust.isBlacklisted : (existing?.isBlacklisted || false),
      blacklistReason: cust.blacklistReason !== undefined ? cust.blacklistReason : (existing?.blacklistReason || ""),
      blacklistedAt: cust.blacklistedAt !== undefined ? cust.blacklistedAt : (existing?.blacklistedAt || ""),
      loyaltyPointsAdjustment: cust.loyaltyPointsAdjustment !== undefined ? cust.loyaltyPointsAdjustment : (existing?.loyaltyPointsAdjustment || 0),
      spentPoints: cust.spentPoints !== undefined ? cust.spentPoints : (existing?.spentPoints || 0),
      redeemedRewards: cust.redeemedRewards !== undefined ? cust.redeemedRewards : (existing?.redeemedRewards || [])
    };
    try {
      await setDoc(doc(db, "customers", finalId), newDoc);

      if (googleAccessToken) {
        syncSingleCustomerToContacts(newDoc, googleAccessToken);
      }

      return finalId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `customers/${finalId}`);
      throw err;
    }
  };

  const toggleCustomerBlacklist = async (customerId: string, isBlacklisted: boolean, reason?: string) => {
    try {
      const cust = customers.find(c => c.id === customerId);
      if (!cust) return;

      const reasonVal = isBlacklisted ? (reason || cust.blacklistReason || "Qara siyahıya əlavə edildi") : "";
      const dateVal = isBlacklisted ? (cust.blacklistedAt || new Date().toISOString()) : "";

      await updateDoc(doc(db, "customers", customerId), {
        isBlacklisted,
        blacklistReason: reasonVal,
        blacklistedAt: dateVal
      });

      addToast({
        type: isBlacklisted ? "warning" : "success",
        title: isBlacklisted ? "🚫 Qara Siyahıya Əlavə Edildi" : "✅ Qara Siyahıdan Çıxarıldı",
        content: isBlacklisted 
          ? `${cust.name} qara siyahıya salındı.`
          : `${cust.name} uğurla qara siyahıdan çıxarıldı.`
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `customers/${customerId}`);
    }
  };

  const syncAllCancelledCustomersToBlacklist = async (defaultReason?: string): Promise<{ addedCount: number; updatedCount: number }> => {
    try {
      const cleanPhone = (p: string) => (p || "").replace(/\D/g, "");
      const cancelledSales = sales.filter(s => s.status === "ləğv edilib");
      
      if (cancelledSales.length === 0) {
        addToast({
          type: "info",
          title: "Qara Siyahı Sinxronizasiyası",
          content: "Ləğv edilmiş heç bir sifariş tapılmadı."
        });
        return { addedCount: 0, updatedCount: 0 };
      }

      // Group cancelled sales by clean phone
      const phoneToSalesMap: Record<string, Sale[]> = {};
      cancelledSales.forEach(s => {
        const p = cleanPhone(s.customerPhone);
        if (p) {
          if (!phoneToSalesMap[p]) phoneToSalesMap[p] = [];
          phoneToSalesMap[p].push(s);
        }
      });

      let addedCount = 0;
      let updatedCount = 0;

      for (const [phone, cSales] of Object.entries(phoneToSalesMap)) {
        const orderNums = cSales.map(s => formatDisplayOrderNumber(s.orderNumber)).join(", ");
        const firstSale = cSales[0];
        const generatedReason = defaultReason || `Ləğv edilmiş sifariş (${cSales.length} ədəd): ${orderNums}`;

        // Check if customer exists in customers list
        const existingCust = customers.find(c => {
          const cp = cleanPhone(c.phone);
          const ap = cleanPhone(c.altPhone || "");
          return cp === phone || ap === phone || 
                 (cp.length >= 9 && phone.length >= 9 && cp.slice(-9) === phone.slice(-9));
        });

        if (existingCust) {
          if (!existingCust.isBlacklisted || !existingCust.blacklistReason) {
            await updateDoc(doc(db, "customers", existingCust.id), {
              isBlacklisted: true,
              blacklistReason: existingCust.blacklistReason ? `${existingCust.blacklistReason}; ${generatedReason}` : generatedReason,
              blacklistedAt: existingCust.blacklistedAt || new Date().toISOString()
            });
            updatedCount++;
          }
        } else {
          // Create new customer record with blacklist flag
          const newId = `customer_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          const newDoc: Customer = {
            id: newId,
            name: firstSale.customerName || "Naməlum Müştəri",
            phone: formatPhoneNumber(firstSale.customerPhone),
            addresses: firstSale.address ? [firstSale.address] : [],
            notes: "Ləğv edilmiş sifariş əsasında avtomatik qara siyahıya salınıb",
            createdAt: firstSale.createdAt || new Date().toISOString(),
            orderCount: 0,
            totalSpent: 0,
            isVIP: false,
            isBlacklisted: true,
            blacklistReason: generatedReason,
            blacklistedAt: new Date().toISOString(),
            tags: ["Qara Siyahı", "Ləğv Edib"]
          };
          await setDoc(doc(db, "customers", newId), newDoc);
          addedCount++;
        }
      }

      addToast({
        type: "success",
        title: "Qara Siyahı Yeniləndi",
        content: `Bütün ləğv edən müştərilər qara siyahıya əlavə edildi: ${updatedCount} mövcud müştəri yeniləndi, ${addedCount} yeni müştəri qeydiyyatı aparıldı.`
      });

      return { addedCount, updatedCount };
    } catch (err) {
      console.error("Blacklist sync error:", err);
      addToast({
        type: "warning",
        title: "Xəta",
        content: "Ləğv edən müştəriləri qara siyahıya əlavə edərkən xəta baş verdi."
      });
      return { addedCount: 0, updatedCount: 0 };
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      const cust = customers.find(c => c.id === id);
      await deleteDoc(doc(db, "customers", id));

      if (cust?.googleContactResourceName && googleAccessToken) {
        await deleteContactFromGoogleContacts(cust.googleContactResourceName, googleAccessToken);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `customers/${id}`);
    }
  };

  const saveProduct = async (prod: Product) => {
    const finalId = prod.id || `product_${Date.now()}`;
    const newDoc: Product = {
      ...prod,
      id: finalId
    };
    try {
      await setDoc(doc(db, "products", finalId), newDoc);
      return finalId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `products/${finalId}`);
    }
  };

  const adjustProductStock = async (productId: string, change: number, reason: string, note?: string) => {
    try {
      await runTransaction(db, async (transaction) => {
        const prodRef = doc(db, "products", productId);
        const prodDoc = await transaction.get(prodRef);
        if (!prodDoc.exists()) return;
        
        const currentData = prodDoc.data() as Product;
        const newStock = Math.max(0, currentData.stock + change);
        
        const historyLog: StockHistoryItem = {
          date: new Date().toISOString(),
          change,
          reason,
          note: note || ""
        };

        const updatedHistory = [historyLog, ...(currentData.stockHistory || [])];
        transaction.update(prodRef, {
          stock: newStock,
          stockHistory: updatedHistory
        });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${productId}`);
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, "products", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${id}`);
    }
  };

  const saveCourier = async (courier: Courier) => {
    const finalId = courier.id || `courier_${Date.now()}`;
    const newDoc: Courier = {
      ...courier,
      phone: formatPhoneNumber(courier.phone),
      stock_quantity: courier.stock_quantity !== undefined ? courier.stock_quantity : 0,
      id: finalId
    };
    try {
      await setDoc(doc(db, "couriers", finalId), newDoc);
      return finalId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `couriers/${finalId}`);
    }
  };

  const deleteCourier = async (id: string) => {
    try {
      await deleteDoc(doc(db, "couriers", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `couriers/${id}`);
    }
  };

  // Sales engine with automation triggers
  const createSale = async (rawSale: Omit<Sale, "id" | "orderNumber" | "isRevenueCalculated" | "statusHistory"> & { createdAt?: string }) => {
    const finalId = `sale_${Date.now()}`;
    const createdAtVal = rawSale.createdAt || new Date().toISOString();
    const orderNumber = generateDateTimeOrderNumber(createdAtVal, sales);
    
    const nowTimestamp = Timestamp.fromDate(new Date(createdAtVal));
    const isReadyDelivered = rawSale.status === "çatdırılıb";
    const sale: Sale = {
      ...rawSale,
      customerPhone: formatPhoneNumber(rawSale.customerPhone),
      id: finalId,
      orderNumber,
      isRevenueCalculated: isReadyDelivered,
      deliveredAt: isReadyDelivered ? createdAtVal : undefined,
      statusHistory: [{ status: rawSale.status, changedAt: new Date().toISOString() }],
      createdAt: createdAtVal,
      order_created_at: createdAtVal,
      order_date: nowTimestamp,
      delivery_date: isReadyDelivered ? nowTimestamp : null,
      notes: rawSale.notes?.trim() || ""
    };

    try {
      await setDoc(doc(db, "sales", finalId), sale);
      
      // Update customers address book if new address added
      if (sale.customerId && sale.address) {
        const currentCust = customers.find(c => c.id === sale.customerId);
        if (currentCust && !currentCust.addresses.includes(sale.address)) {
          const updatedAddresses = [...currentCust.addresses, sale.address];
          await updateDoc(doc(db, "customers", sale.customerId), { addresses: updatedAddresses });
        }
      }

      // If status is "çatdırılıb", execute stock reduces and expense logs immediately!
      if (sale.status === "çatdırılıb") {
        await executeDeliveredActions(sale);
      } else {
        // If "gözləyir" and courier assigned, sync courier balance
        if (sale.courierId) {
          const updatedSalesList = [sale, ...sales];
          await syncCourierStats(sale.courierId, updatedSalesList);
        }
      }

      // Auto sync to Google Calendar if key token is active
      if (googleAccessToken) {
        syncSingleSaleToCalendar(sale, googleAccessToken);
      }

      return finalId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `sales/${finalId}`);
    }
  };

  const executeDeliveredActions = async (sale: Sale) => {
    const nowISO = new Date().toISOString();

    const courier = couriers.find(c => c.id === sale.courierId);
    const isColumba = (sale.deliveryType === "courier" && courier?.isDepotBased === true) || 
                      (sale.courierName || "").toLowerCase().includes("columba") || 
                      (sale.cargoCompany || "").toLowerCase().includes("columba") || 
                      (sale.notes || "").toLowerCase().includes("columba");

    // 2. Reduce stocks and log stock history
    for (const item of sale.items) {
      if (isColumba && sale.courierId) {
        const courierDocRef = doc(db, "couriers", sale.courierId);
        await runTransaction(db, async (trans) => {
          const cSnap = await trans.get(courierDocRef);
          if (cSnap.exists()) {
            const currentStock = cSnap.data().stock_quantity || 0;
            trans.update(courierDocRef, { stock_quantity: Math.max(0, currentStock - item.qty) });
          }
        });
      } else {
        await adjustProductStock(
          item.productId,
          -item.qty,
          "Sifariş Çatdırıldı",
          `Sifariş #${sale.orderNumber} — ${sale.customerName}`
        );
      }
    }

    // 3. Create auto delivery expense (linked matching ID)
    const expId = `expense_auto_delivery_${sale.id}`;
    if (sale.deliveryCost > 0) {
      const carrierName = sale.deliveryType === "courier" ? (sale.courierName || "Kuryer") : (sale.cargoCompany || "Kargo");
      const displayNum = formatDisplayOrderNumber(sale.orderNumber);
      const expenseName = isColumba 
        ? `Sifariş ${displayNum} (${sale.customerName}) -Columba.az`
        : `Sifariş ${displayNum} (${sale.customerName}) — ${carrierName}`;

      const autoExpense: Expense = {
        id: expId,
        name: expenseName,
        amount: sale.deliveryCost,
        category: "Çatdırılma",
        paymentMethod: sale.deliveryType === "courier" ? "Kuryer Balansı" : "Kargo Ödənişi",
        date: formatToBakuYMD(sale.deliveredAt || nowISO),
        notes: "",
        source: "auto_delivery",
        linkedOrderId: sale.id,
        linkedOrderNumber: displayNum
      };
      await setDoc(doc(db, "expenses", expId), autoExpense);
    } else {
      console.log(`[executeDeliveredActions] deliveryCost=0 for sale #${sale.orderNumber} (${sale.deliveryType}). No expense created.`);
      await deleteDoc(doc(db, "expenses", expId));
    }

    // Recalculate customer and courier metrics
    const updatedSalesList = sales.map(s => s.id === sale.id ? { ...s, status: "çatdırılıb" as const, isRevenueCalculated: true } : s);
    if (sales.every(s => s.id !== sale.id)) {
      updatedSalesList.push({ ...sale, status: "çatdırılıb" as const, isRevenueCalculated: true });
    }
    
    if (sale.customerId) {
      await syncCustomerStats(sale.customerId, updatedSalesList, settings.vipThreshold);
    }
    if (sale.courierId) {
      await syncCourierStats(sale.courierId, updatedSalesList);
    }
  };

  const executeCancelledActions = async (sale: Sale) => {
    // 1. Delete linked auto-delivery expense first to prevent race condition with deletion/recreation
    const expId = `expense_auto_delivery_${sale.id}`;
    await deleteDoc(doc(db, "expenses", expId));

    const courier = couriers.find(c => c.id === sale.courierId);
    const isColumba = (sale.deliveryType === "courier" && courier?.isDepotBased === true) || 
                      (sale.courierName || "").toLowerCase().includes("columba") || 
                      (sale.cargoCompany || "").toLowerCase().includes("columba") || 
                      (sale.notes || "").toLowerCase().includes("columba");

    // 3. Revert / restore stocks and log stock history
    for (const item of sale.items) {
      if (isColumba && sale.courierId) {
        const courierDocRef = doc(db, "couriers", sale.courierId);
        await runTransaction(db, async (trans) => {
          const cSnap = await trans.get(courierDocRef);
          if (cSnap.exists()) {
            const currentStock = cSnap.data().stock_quantity || 0;
            trans.update(courierDocRef, { stock_quantity: currentStock + item.qty });
          }
        });
      } else {
        await adjustProductStock(
          item.productId,
          item.qty,
          "Sifariş Ləğv Edildi",
          `Sifariş #${sale.orderNumber} ləğvi üzrə anbara qaytarılma`
        );
      }
    }

    // Recalculate customer and courier metrics
    const updatedSalesList = sales.map(s => s.id === sale.id ? { ...s, status: "ləğv edilib" as const, isRevenueCalculated: false } : s);
    
    if (sale.customerId) {
      await syncCustomerStats(sale.customerId, updatedSalesList, settings.vipThreshold);
    }
    if (sale.courierId) {
      await syncCourierStats(sale.courierId, updatedSalesList);
    }
  };

  const updateSaleStatus = async (saleId: string, newStatus: "gözləyir" | "çatdırılıb" | "ləğv edilib") => {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;

    const oldStatus = sale.status;
    if (oldStatus === newStatus) return;

    const updatedHistory = [
      { status: newStatus, changedAt: new Date().toISOString() },
      ...(sale.statusHistory || [])
    ];

    try {
      // First update status in DB
      const updatePayload: any = {
        status: newStatus,
        statusHistory: updatedHistory
      };
      if (newStatus === "çatdırılıb") {
        updatePayload.delivery_date = Timestamp.now();
        updatePayload.isRevenueCalculated = true;
        updatePayload.deliveredAt = new Date().toISOString();
      } else {
        updatePayload.delivery_date = null;
        updatePayload.isRevenueCalculated = false;
      }
      await updateDoc(doc(db, "sales", saleId), updatePayload);

      // Synconize status of deliveryRecord if any
      try {
        const dRecRef = doc(db, "deliveryRecords", `record_${saleId}`);
        const dRecSnap = await getDoc(dRecRef);
        if (dRecSnap.exists()) {
          await updateDoc(dRecRef, { status: newStatus });
        }
      } catch (err) {
        console.error("Error keeping deliveryRecord status in sync:", err);
      }

      const updatedSaleObject = { 
        ...sale, 
        status: newStatus, 
        statusHistory: updatedHistory,
        ...updatePayload
      };

      // Transition paths:
      if (oldStatus !== "çatdırılıb" && newStatus === "çatdırılıb") {
        // Any status -> Çatdırılıb
        await executeDeliveredActions(updatedSaleObject);
      } else if (oldStatus === "çatdırılıb" && newStatus === "ləğv edilib") {
        // Çatdırılıb -> Ləğv edilib
        await executeCancelledActions(updatedSaleObject);
      } else if (oldStatus === "çatdırılıb" && newStatus === "gözləyir") {
        // Çatdırılıb -> Gözləyir (Revert delivered actions)
        await executeCancelledActions(updatedSaleObject);
      } else {
        // e.g. Gözləyir -> Ləğv edilib, no stock or expense updates needed, just sync courier if assigned
        const updatedSalesList = sales.map(s => s.id === saleId ? updatedSaleObject : s);
        if (sale.customerId) {
          await syncCustomerStats(sale.customerId, updatedSalesList, settings.vipThreshold);
        }
        if (sale.courierId) {
          await syncCourierStats(sale.courierId, updatedSalesList);
        }
      }

      // Automatically sync any status change to Telegram to keep dashboard and Telegram bot in sync
      try {
        await syncOrderStatusToTelegram(updatedSaleObject, oldStatus, newStatus);
      } catch (tgErr) {
        console.error("Error syncing status change to Telegram:", tgErr);
      }

      // Auto-add customer to blacklist when order is cancelled
      if (newStatus === "ləğv edilib") {
        try {
          const cleanP = (sale.customerPhone || "").replace(/\D/g, "");
          const targetCust = customers.find(c => {
            if (sale.customerId && c.id === sale.customerId) return true;
            const cp = (c.phone || "").replace(/\D/g, "");
            return cp === cleanP || (cp.length >= 9 && cleanP.length >= 9 && cp.slice(-9) === cleanP.slice(-9));
          });
          const cancelNote = `Ləğv edilmiş sifariş #${sale.orderNumber}`;
          if (targetCust) {
            await updateDoc(doc(db, "customers", targetCust.id), {
              isBlacklisted: true,
              blacklistReason: targetCust.blacklistReason ? `${targetCust.blacklistReason}; ${cancelNote}` : cancelNote,
              blacklistedAt: targetCust.blacklistedAt || new Date().toISOString()
            });
          }
        } catch (cErr) {
          console.error("Auto blacklist customer on cancel error:", cErr);
        }
      }

      // Auto sync updated status to Google Calendar if active token is set
      if (googleAccessToken) {
        syncSingleSaleToCalendar(updatedSaleObject, googleAccessToken);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sales/${saleId}`);
    }
  };

  const updateSale = async (saleId: string, updatedFields: Partial<Sale>) => {
    const oldSale = sales.find(s => s.id === saleId);
    if (!oldSale) return;

    try {
      // 1. If old sale was "çatdırılıb", revert stock reduction and auto expense
      if (oldSale.status === "çatdırılıb") {
        await executeCancelledActions(oldSale);
      }

      if (updatedFields.customerPhone) {
        updatedFields.customerPhone = formatPhoneNumber(updatedFields.customerPhone);
      }

      // 2. Build final sale object
      const finalSale: Sale = {
        ...oldSale,
        ...updatedFields,
      };

      // Recalculate totals according to user rules
      const discountInput = finalSale.discountAmount || 0;
      const calculatedSubtotal = finalSale.items ? finalSale.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) : 0;
      finalSale.totalProductPrice = calculatedSubtotal;
      
      const isCancelled = finalSale.status === "ləğv edilib";
      finalSale.totalAmount = isCancelled ? 0 : Math.max(0, calculatedSubtotal - discountInput);
      finalSale.netRevenue = isCancelled ? 0 : Math.max(0, calculatedSubtotal - discountInput - (finalSale.deliveryCost || 0));

      // Ensure order_date is set as Firestore Timestamp
      const orderDateObj = finalSale.createdAt ? new Date(finalSale.createdAt) : new Date();
      (finalSale as any).order_date = Timestamp.fromDate(orderDateObj);

      if (finalSale.status === "çatdırılıb") {
        finalSale.isRevenueCalculated = true;
        if (!finalSale.deliveredAt) {
          finalSale.deliveredAt = new Date().toISOString();
        }
        finalSale.delivery_date = Timestamp.fromDate(new Date(finalSale.deliveredAt));
      } else {
        finalSale.isRevenueCalculated = false;
        delete finalSale.deliveredAt;
        finalSale.delivery_date = null;
      }

      // 3. Persist new state to Firestore
      await setDoc(doc(db, "sales", saleId), finalSale);

      // Keep deliveryRecord status in sync if any
      try {
        const dRecRef = doc(db, "deliveryRecords", `record_${saleId}`);
        const dRecSnap = await getDoc(dRecRef);
        if (dRecSnap.exists()) {
          await updateDoc(dRecRef, { 
            status: finalSale.status,
            cost: Number(finalSale.deliveryCost || 0)
          });
        }
      } catch (err) {
        console.error("Error keeping deliveryRecord status in sync during updateSale:", err);
      }

      // Create list with updated sale for syncing
      const updatedSalesList = sales.map(s => s.id === saleId ? finalSale : s);

      // 4. Trigger "çatdırılıb" actions if new status is delivered
      if (finalSale.status === "çatdırılıb") {
        await executeDeliveredActions(finalSale);
      } else {
        // If not delivered but courier is assigned, update courier stock/stats
        if (finalSale.courierId) {
          await syncCourierStats(finalSale.courierId, updatedSalesList);
        }
      }

      // Sync status change with Telegram
      if (oldSale.status !== finalSale.status) {
        try {
          await syncOrderStatusToTelegram(finalSale, oldSale.status, finalSale.status);
        } catch (tgErr) {
          console.error("Error syncing status change to Telegram in updateSale:", tgErr);
        }
      }

      // 5. Sync customer and courier old vs new metrics
      if (oldSale.customerId && oldSale.customerId !== finalSale.customerId) {
        await syncCustomerStats(oldSale.customerId, updatedSalesList, settings.vipThreshold);
      }
      if (finalSale.customerId) {
        await syncCustomerStats(finalSale.customerId, updatedSalesList, settings.vipThreshold);
      }
      if (oldSale.courierId && oldSale.courierId !== finalSale.courierId) {
        await syncCourierStats(oldSale.courierId, updatedSalesList);
      }
      if (finalSale.courierId) {
        await syncCourierStats(finalSale.courierId, updatedSalesList);
      }

      // 6. Update Google Calendar event if active token is set
      if (googleAccessToken) {
        syncSingleSaleToCalendar(finalSale, googleAccessToken);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `sales/${saleId}`);
    }
  };

  const copySaleAsNew = async (sale: Sale) => {
    const { id, orderNumber, isRevenueCalculated, statusHistory, createdAt, ...copiedDetails } = sale;
    return await createSale({
      ...copiedDetails,
      createdAt: new Date().toISOString(),
      status: "gözləyir" // copies default to "gözləyir"
    });
  };

  const deleteSale = async (id: string) => {
    const sale = sales.find(s => s.id === id);
    if (!sale) return;

    try {
      // If was delivered, revert actions before deleting
      if (sale.status === "çatdırılıb") {
        await executeCancelledActions(sale);
      }
      
      // Delete sale doc
      await deleteDoc(doc(db, "sales", id));

      // Delete any leftover connected delivery record
      await deleteDoc(doc(db, "deliveryRecords", `record_${id}`));
      
      // Delete from Google Calendar if event ID exists and accessToken is active
      const calendarEventId = (sale as any).googleCalendarEventId;
      if (calendarEventId && googleAccessToken) {
        await deleteSaleFromGoogleCalendar(calendarEventId, googleAccessToken);
      }
      
      // Delete any leftover link expense
      const expId = `expense_auto_delivery_${id}`;
      await deleteDoc(doc(db, "expenses", expId));

      const updatedSalesList = sales.filter(s => s.id !== id);
      if (sale.customerId) {
        await syncCustomerStats(sale.customerId, updatedSalesList, settings.vipThreshold);
      }
      if (sale.courierId) {
        await syncCourierStats(sale.courierId, updatedSalesList);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sales/${id}`);
    }
  };

  // Expenses management
  const saveExpense = async (exp: Omit<Expense, "id"> & { id?: string }) => {
    const finalId = exp.id || `expense_${Date.now()}`;
    if (exp.amount <= 0) {
      if (exp.id) {
        // If an existing expense was changed to 0 amount, delete it
        await deleteExpense(exp.id);
      }
      return finalId;
    }
    const newDoc: Expense = {
      ...exp,
      id: finalId
    };
    try {
      await setDoc(doc(db, "expenses", finalId), newDoc);
      return finalId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `expenses/${finalId}`);
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, "expenses", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`);
    }
  };

  // Settings
  const saveSettings = async (setDocs: Settings) => {
    try {
      await setDoc(doc(db, "settings", "general"), setDocs);
      setSettings(setDocs);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "settings/general");
    }
  };

  // Danger zone reset
  const resetAllData = async (onProgressLog?: (msg: string) => void) => {
    try {
      if (onProgressLog) onProgressLog("Məlumat bazasının sıfırlanması başladılır...");
      const allDeletes: { col: string; id: string }[] = [];
      customers.forEach(c => allDeletes.push({ col: "customers", id: c.id }));
      products.forEach(p => allDeletes.push({ col: "products", id: p.id }));
      couriers.forEach(cr => allDeletes.push({ col: "couriers", id: cr.id }));
      sales.forEach(s => allDeletes.push({ col: "sales", id: s.id }));
      expenses.forEach(e => allDeletes.push({ col: "expenses", id: e.id }));
      stockTransfers.forEach(st => allDeletes.push({ col: "stockTransfers", id: st.id }));

      if (allDeletes.length === 0) {
        if (onProgressLog) onProgressLog("Məlumat bazasında silinəcək heç bir yazı tapılmadı.");
        return;
      }

      const BATCH_SIZE = 100;
      for (let i = 0; i < allDeletes.length; i += BATCH_SIZE) {
        const chunk = allDeletes.slice(i, i + BATCH_SIZE);
        await Promise.all(chunk.map(d => deleteDoc(doc(db, d.col, d.id))));
        if (onProgressLog) {
          onProgressLog(`Mövcud məlumatlar silinir: ${Math.min(allDeletes.length, i + BATCH_SIZE)} / ${allDeletes.length} sətir silindi...`);
        }
      }
      if (onProgressLog) onProgressLog("Baza təmizləndi! İdxal prosesinə başlanılır...");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "all_collections");
    }
  };

  const wipeAllSystemData = resetAllData;

  const transferStockToCourier = async (productId: string, courierId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    const courier = couriers.find(c => c.id === courierId);
    if (!product || !courier) {
      addToast({
        type: "warning",
        title: "Xəta",
        content: "Məhsul və ya kuryer tapılmadı."
      });
      return;
    }

    if (product.stock < quantity) {
      addToast({
        type: "warning",
        title: "Xəta",
        content: "Anbarda kifayət qədər məhsul yoxdur."
      });
      return;
    }

    try {
      // 1. Subtract product stock (and log stock history)
      await adjustProductStock(productId, -quantity, "Depoya Köçürmə", `${courier.name} kuryerinə köçürmə`);

      // 2. Add courier stock_quantity
      const currentStockQty = courier.stock_quantity || 0;
      await updateDoc(doc(db, "couriers", courierId), {
        stock_quantity: currentStockQty + quantity
      });

      // 3. Write stock history log
      const finalId = `transfer_${Date.now()}`;
      const transfer: StockTransfer = {
        id: finalId,
        date: new Date().toISOString(),
        productId,
        productName: product.name,
        quantity
      };
      await setDoc(doc(db, "stockTransfers", finalId), transfer);

      addToast({
        type: "success",
        title: "Köçürmə uğurlu",
        content: `${product.name} məhsulundan ${quantity} ədəd ${courier.name} kuryerinə köçürüldü.`
      });
    } catch (e: any) {
      addToast({
        type: "warning",
        title: "Xəta",
        content: e.message || "Köçürmə zamanı xəta baş verdi."
      });
      handleFirestoreError(e, OperationType.WRITE, `stockTransfers`);
    }
  };

  const runDataMigration = async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    addToast({
      type: "info",
      title: "Miqrasiya",
      content: "Verilənlərin birləşdirilməsi və nömrələnməsi başladı..."
    });

    try {
      const querySnap = await getDocs(collection(db, "sales"));
      const allSales: Sale[] = [];
      querySnap.forEach(docSnap => {
        allSales.push(docSnap.data() as Sale);
      });

      if (allSales.length === 0) {
        setIsMigrating(false);
        addToast({
          type: "success",
          title: "Miqrasiya tamamlandı",
          content: "Heç bir qeyd tapılmadı."
        });
        return;
      }

      const groups: Record<string, Sale[]> = {};
      allSales.forEach(s => {
        if (!s) return;
        const custName = (s.customerName || "").trim().toLowerCase();
        let datePart = "";
        try {
          const dateObj = new Date(s.createdAt || s.deliveredAt || Date.now());
          datePart = dateObj.getUTCDate() ? dateObj.toISOString().split("T")[0] : "no-date";
        } catch (e) {
          datePart = "no-date";
        }
        const addr = (s.address || "").trim().toLowerCase();
        const key = `${custName}_${datePart}_${addr}`;

        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(s);
      });

      let updatedCount = 0;
      let deletedCount = 0;

      const migrationSalesAccumulator: Sale[] = [];

      for (const key in groups) {
        const groupSales = groups[key];
        groupSales.sort((a,b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

        const baseSale = groupSales[0];
        const duplicates = groupSales.slice(1);

        const mergedItemsMap: Record<string, SaleItem> = {};
        const addItemsToMap = (items: SaleItem[]) => {
          (items || []).forEach(item => {
            if (!item.productId) return;
            if (mergedItemsMap[item.productId]) {
              mergedItemsMap[item.productId].qty += item.qty;
              mergedItemsMap[item.productId].total = mergedItemsMap[item.productId].qty * mergedItemsMap[item.productId].unitPrice;
            } else {
              mergedItemsMap[item.productId] = { ...item };
            }
          });
        };

        addItemsToMap(baseSale.items);
        duplicates.forEach(dup => {
          addItemsToMap(dup.items);
        });

        const finalItems = Object.values(mergedItemsMap);

        let totalDiscount = baseSale.discountAmount || 0;
        duplicates.forEach(dup => {
          totalDiscount += (dup.discountAmount || 0);
        });

        let idealOrderNumber = "";
        for (const s of groupSales) {
          if (s.orderNumber && s.orderNumber.startsWith("#AYV-")) {
            idealOrderNumber = formatDisplayOrderNumber(s.orderNumber.trim());
            break;
          }
        }

        if (!idealOrderNumber) {
          idealOrderNumber = generateDateTimeOrderNumber(
            baseSale.createdAt || new Date().toISOString(), 
            migrationSalesAccumulator.concat(allSales)
          );
        }

        const newOrderNum = idealOrderNumber;

        const computedSubtotal = finalItems.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
        const isCancelled = baseSale.status === "ləğv edilib";
        
        const finalTotalAmount = isCancelled ? 0 : Math.max(0, computedSubtotal - totalDiscount);
        const finalNetRevenue = isCancelled ? 0 : Math.max(0, computedSubtotal - totalDiscount - (baseSale.deliveryCost || 0));

        // Find/resolve creation date of the order
        const srcTimeStr = baseSale.createdAt || (baseSale as any).created_at || (baseSale as any).order_created_at || new Date().toISOString();
        const orderDateTimestamp = Timestamp.fromDate(new Date(srcTimeStr));

        // Calculate migration rules for delivery_date
        let deliveryDateTimestamp = null;
        if (baseSale.status === "çatdırılıb") {
          const existingDeliveryDate = (baseSale as any).delivery_date;
          if (existingDeliveryDate) {
            if (typeof existingDeliveryDate.toDate === "function") {
              deliveryDateTimestamp = existingDeliveryDate;
            } else if (existingDeliveryDate.seconds) {
              deliveryDateTimestamp = new Timestamp(existingDeliveryDate.seconds, existingDeliveryDate.nanoseconds || 0);
            } else {
              deliveryDateTimestamp = Timestamp.fromDate(new Date(existingDeliveryDate));
            }
          } else {
            // IF order has no delivery_date AND status is "çatdırılıb", THEN set delivery_date = created_at
            deliveryDateTimestamp = orderDateTimestamp;
          }
        } else {
          // IF order status = "gözləyir", THEN leave it null
          deliveryDateTimestamp = null;
        }

        const updatedBaseSale: Sale = {
          ...baseSale,
          items: finalItems,
          customerPhone: formatPhoneNumber(baseSale.customerPhone),
          discountAmount: totalDiscount,
          orderNumber: newOrderNum,
          totalProductPrice: computedSubtotal,
          totalAmount: finalTotalAmount,
          netRevenue: finalNetRevenue,
          isRevenueCalculated: baseSale.status === "çatdırılıb",
          order_date: orderDateTimestamp,
          delivery_date: deliveryDateTimestamp
        };

        migrationSalesAccumulator.push(updatedBaseSale);

        await setDoc(doc(db, "sales", baseSale.id), updatedBaseSale);
        updatedCount++;

        for (const dup of duplicates) {
          await deleteDoc(doc(db, "sales", dup.id));
          deletedCount++;
        }
      }

      await setDoc(doc(db, "settings", "general"), {
        id: "general",
        dbMigrated: true
      }, { merge: true });

      addToast({
        type: "success",
        title: "Miqrasiya Tamamlandı",
        content: `${updatedCount} unikal sifariş saxlandı/birləşdirildi, ${deletedCount} dublikat silindi. Bütün nömrələr formatlandı.`
      });
    } catch (e: any) {
      addToast({
        type: "warning",
        title: "Miqrasiya Xətası",
        content: e.message || "Bəzi xətalar baş verdi"
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const syncSingleSaleToCalendar = async (sale: Sale, customToken?: string) => {
    const token = customToken || googleAccessToken;
    if (!token) return;
    try {
      const eventId = await syncSaleToGoogleCalendar(sale, token);
      if (eventId && eventId !== (sale as any).googleCalendarEventId) {
        await updateDoc(doc(db, "sales", sale.id), {
          googleCalendarEventId: eventId
        });
      }
    } catch (err) {
      console.error("Single calendar sync error:", err);
    }
  };

  const syncAllSalesToCalendar = async (
    onProgress?: (progress: { current: number; total: number; orderNumber: string }) => void
  ) => {
    const token = googleAccessToken;
    if (!token) {
      throw new Error("Lütfən əvvəlcə Google Calendar ilə qoşulun.");
    }
    
    // Sort sales to sync in order
    const sortedSales = [...sales].sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < sortedSales.length; i++) {
      const sale = sortedSales[i];
      if (onProgress) {
        onProgress({ current: i + 1, total: sortedSales.length, orderNumber: sale.orderNumber });
      }

      try {
        const eventId = await syncSaleToGoogleCalendar(sale, token);
        if (eventId) {
          successCount++;
          if (eventId !== (sale as any).googleCalendarEventId) {
            await updateDoc(doc(db, "sales", sale.id), {
              googleCalendarEventId: eventId
            });
          }
        } else {
          errorCount++;
        }
      } catch (err) {
        console.error(`Failed to sync bulk sale #${sale.orderNumber}:`, err);
        errorCount++;
      }
      
      // small delay to avoid rate limit hits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { successCount, errorCount };
  };

  const syncSingleCustomerToContacts = async (customer: Customer, customToken?: string) => {
    const token = customToken || googleAccessToken;
    if (!token) return;
    try {
      const resourceName = await syncCustomerToGoogleContacts(
        {
          name: customer.name,
          phone: customer.phone,
          notes: customer.notes || `Müştəri statusu: ${customer.isVIP ? "VIP" : "Standart"}, Sifariş sayı: ${customer.orderCount}`,
          googleContactResourceName: customer.googleContactResourceName
        },
        token
      );
      if (resourceName && resourceName !== customer.googleContactResourceName) {
        await updateDoc(doc(db, "customers", customer.id), {
          googleContactResourceName: resourceName
        });
      }
    } catch (err) {
      console.error("Single customer contacts sync error:", err);
    }
  };

  const syncAllCustomersToContacts = async (
    onProgress?: (progress: { current: number; total: number; name: string }) => void
  ) => {
    const token = googleAccessToken;
    if (!token) {
      throw new Error("Lütfən əvvəlcə Google Hesabı ilə qoşulun.");
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < customers.length; i++) {
      const cust = customers[i];
      if (!cust.phone) continue;

      if (onProgress) {
        onProgress({ current: i + 1, total: customers.length, name: cust.name });
      }

      try {
        const resourceName = await syncCustomerToGoogleContacts(
          {
            name: cust.name,
            phone: cust.phone,
            notes: cust.notes || `Müştəri statusu: ${cust.isVIP ? "VIP" : "Standart"}, Sifariş sayı: ${cust.orderCount}`,
            googleContactResourceName: cust.googleContactResourceName
          },
          token
        );

        if (resourceName) {
          successCount++;
          if (resourceName !== cust.googleContactResourceName) {
            await updateDoc(doc(db, "customers", cust.id), {
              googleContactResourceName: resourceName
            });
          }
        } else {
          errorCount++;
        }
      } catch (err) {
        console.error(`Failed to bulk sync customer ${cust.name}:`, err);
        errorCount++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { successCount, errorCount };
  };

  const importBackupJSON = async (backupData: any, isOverwrite: boolean) => {
    try {
      if (isOverwrite) {
        await resetAllData();
      }

      // Restore Customers
      if (Array.isArray(backupData.customers)) {
        for (const item of backupData.customers) {
          if (item && item.id) {
            await setDoc(doc(db, "customers", item.id), item);
          }
        }
      }

      // Restore Products
      if (Array.isArray(backupData.products)) {
        for (const item of backupData.products) {
          if (item && item.id) {
            await setDoc(doc(db, "products", item.id), item);
          }
        }
      }

      // Restore Couriers
      if (Array.isArray(backupData.couriers)) {
        for (const item of backupData.couriers) {
          if (item && item.id) {
            await setDoc(doc(db, "couriers", item.id), item);
          }
        }
      }

      // Restore Sales
      if (Array.isArray(backupData.sales)) {
        for (const item of backupData.sales) {
          if (item && item.id) {
            await setDoc(doc(db, "sales", item.id), item);
          }
        }
      }

      // Restore Expenses
      if (Array.isArray(backupData.expenses)) {
        for (const item of backupData.expenses) {
          if (item && item.id) {
            await setDoc(doc(db, "expenses", item.id), item);
          }
        }
      }

      // Restore Settings
      if (backupData.settings && typeof backupData.settings === "object") {
        await setDoc(doc(db, "settings", "general"), {
          ...backupData.settings,
          id: "general"
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "restore_backup");
    }
  };

  const importExcelData = async (data: {
    parsedSales: any[];
    parsedExpenses: any[];
    parsedProducts: any[];
    parsedCustomers?: any[];
    parsedCouriers?: any[];
    overriddenCustomerNames: Record<string, string>;
    isOverwrite?: boolean;
    onProgress?: (progress: { phase: string; current: number; total: number; message: string; log?: string }) => void;
  }) => {
    const { 
      parsedSales, 
      parsedExpenses, 
      parsedProducts, 
      parsedCustomers = [], 
      parsedCouriers = [], 
      overriddenCustomerNames, 
      isOverwrite, 
      onProgress 
    } = data;
    
    let importedSalesCount = 0;
    let importedExpensesCount = 0;
    let importedProductsCount = 0;
    let importedCustomersCount = 0;
    let importedCouriersCount = 0;
    let mismatchCount = 0;
    const errors: string[] = [];

    // Helper to extract values based on multiple possible key names
    const getVal = (row: any, keys: string[], defaultVal: any = "") => {
      if (!row) return defaultVal;
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null) return row[k];
        const targetKey = k.toLowerCase().trim();
        for (const rowKey of Object.keys(row)) {
          const formattedRowKey = rowKey.toLowerCase().trim();
          if (formattedRowKey === targetKey) {
            return row[rowKey];
          }
        }
      }
      return defaultVal;
    };

    const cleanNumber = (val: any): number => {
      if (val === null || val === undefined) return 0;
      if (typeof val === "number") return val;
      
      let str = String(val)
        .replace(/₼/g, "")
        .replace(/AZN/gi, "")
        .replace(/[a-zA-ZçıöğüşəIƏ]/g, "")
        .replace(/\s/g, "")
        .trim();
      
      if (!str) return 0;

      const lastComma = str.lastIndexOf(",");
      const lastDot = str.lastIndexOf(".");

      if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) {
          // Dot is thousands, comma is decimal (Azerbaijani/European: 1.234,56)
          str = str.replace(/\./g, "").replace(/,/g, ".");
        } else {
          // Comma is thousands, dot is decimal (English: 1,234.56)
          str = str.replace(/,/g, "");
        }
      } else if (lastComma !== -1) {
        // Only comma resides in string. Is it decimal or thousands?
        const parts = str.split(",");
        if (parts[1] && parts[1].length === 3) {
          // If exactly 3 digits, e.g., "1,049", it's a thousands separator
          str = str.replace(/,/g, "");
        } else {
          // E.g. "12,5" or "12,50", it's a decimal separator
          str = str.replace(/,/g, ".");
        }
      } else if (lastDot !== -1) {
        // Only dot resides in string. Is it decimal or thousands?
        const parts = str.split(".");
        if (parts[1] && parts[1].length === 3 && parts[0].length <= 3) {
          // E.g., "1.049" in European style might be 1049 (since there are no fractional units, and it has 3 digits followed by <=3 digits)
          str = str.replace(/\./g, "");
        }
      }

      const parsed = parseFloat(str);
      return isNaN(parsed) ? 0 : parsed;
    };

    const cleanPhone = (phoneVal: any): string => {
      if (phoneVal === null || phoneVal === undefined) return "";
      let p = String(phoneVal).trim().replace(/[\s\-\(\)]/g, "");
      if (p.startsWith("+994")) {
        return p;
      }
      if (p.length === 9) {
        const codes = ["10", "50", "51", "55", "60", "70", "77", "99"];
        if (codes.includes(p.substring(0, 2))) {
          p = "0" + p;
        }
      }
      return p;
    };

    const parseExcelDateCustom = (dateVal: any): string => {
      if (!dateVal) return new Date().toISOString();
      if (typeof dateVal === "number" && dateVal > 0) {
        try {
          const date = new Date((dateVal - 25569) * 86400 * 1000);
          return date.toISOString();
        } catch {
          // ignore
        }
      }
      const dateStr = String(dateVal).trim();
      
      const matchDotted = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (matchDotted) {
        return `${matchDotted[3]}-${matchDotted[2]}-${matchDotted[1]}T12:00:00.000Z`;
      }
      
      const matchISO = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (matchISO) {
        return `${matchISO[1]}-${matchISO[2]}-${matchISO[3]}T12:00:00.000Z`;
      }

      const matchHyphens = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (matchHyphens) {
        return `${matchHyphens[3]}-${matchHyphens[2]}-${matchHyphens[1]}T12:00:00.000Z`;
      }

      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {
        // ignore
      }
      return new Date().toISOString();
    };

    if (onProgress) {
      onProgress({
        phase: "init",
        current: 5,
        total: 100,
        message: "İdxal başladılır, yaddaş tənzimlənir...",
        log: "Verilənlərin ilkin emalı başlayır..."
      });
    }
    await new Promise(resolve => setTimeout(resolve, 80));

    if (isOverwrite) {
      await resetAllData((msg) => {
        if (onProgress) {
          onProgress({
            phase: "init",
            current: 10,
            total: 100,
            message: msg,
            log: msg
          });
        }
      });
    }

    // Load deep copies of existing state arrays to simulate memory storage
    const localProductsMap = new Map<string, Product>();
    const localCustomersMap = new Map<string, Customer>();
    const localCouriersMap = new Map<string, Courier>();

    if (!isOverwrite) {
      products.forEach(p => localProductsMap.set(p.id, { ...p, stockHistory: [...(p.stockHistory || [])] }));
      customers.forEach(c => localCustomersMap.set(c.id, { ...c, addresses: [...(c.addresses || [])] }));
      couriers.forEach(cr => localCouriersMap.set(cr.id, { ...cr }));
    }

    const docsToWrite: { col: string; id: string; data: any }[] = [];

    // Helper to queue a doc for writing
    const queueWrite = (col: string, id: string, data: any) => {
      docsToWrite.push({ col, id, data });
    };

    // 0. Process Customers sheet first to seed customers!
    if (parsedCustomers && parsedCustomers.length > 0) {
      for (const row of parsedCustomers) {
        let name = getVal(row, ["Ad", "name", "Müştəri Adı"]);
        const phoneInput = getVal(row, ["Telefon", "phone"]);
        const phone = cleanPhone(phoneInput);
        if (!phone) {
          mismatchCount++;
          errors.push("Müştəri sətiri buraxıldı: Telefon nömrəsi tapılmadı.");
          continue;
        }
        if (!name) name = phone;

        const normPhone = phone.replace(/\s+/g, "");
        let matchedCustId = "";
        for (const [id, c] of localCustomersMap.entries()) {
          if (c.phone && c.phone.replace(/\s+/g, "") === normPhone) {
            matchedCustId = id;
            break;
          }
        }

        const date = parseExcelDateCustom(getVal(row, ["Qeydiyyat", "createdAt", "Tarix"]));
        const orderCount = cleanNumber(getVal(row, ["Sifariş sayı", "orderCount"]));
        const totalSpent = cleanNumber(getVal(row, ["Ümumi Xərclənən", "totalSpent"]));
        const isVIP = String(getVal(row, ["VIP", "isVIP"])).toLowerCase().includes("vip") || orderCount >= 5;

        if (matchedCustId) {
          const existing = localCustomersMap.get(matchedCustId)!;
          existing.name = name;
          existing.orderCount = orderCount || existing.orderCount;
          existing.totalSpent = totalSpent || existing.totalSpent;
          existing.isVIP = isVIP || existing.isVIP;
        } else {
          const custId = `customer_import_${crypto.randomUUID()}`;
          const newCust: Customer = {
            id: custId,
            name,
            phone,
            addresses: [],
            createdAt: date,
            orderCount,
            totalSpent,
            isVIP
          };
          localCustomersMap.set(custId, newCust);
        }
        importedCustomersCount++;
      }
    }

    if (onProgress) {
      onProgress({
        phase: "customers",
        current: 15,
        total: 100,
        message: "Müştəri qeydləri təhlil edildi...",
        log: `${importedCustomersCount} müştəri qeydi yoxlanıldı və təsdiqləndi.`
      });
    }
    await new Promise(resolve => setTimeout(resolve, 80));

    // 0.5. Process Couriers sheet
    if (parsedCouriers && parsedCouriers.length > 0) {
      for (const row of parsedCouriers) {
        const name = getVal(row, ["Ad", "name", "Kuryer", "Kuryer Adı"]);
        if (!name) {
          mismatchCount++;
          errors.push("Kuryer sətiri buraxıldı: Ad daxil edilməmişdir.");
          continue;
        }
        const phoneInput = getVal(row, ["Telefon", "phone"], "+994000000000");
        const phone = cleanPhone(phoneInput);
        const statusRaw = String(getVal(row, ["Status", "status"], "active")).toLowerCase().trim();
        const status: "active" | "inactive" = (statusRaw.includes("deaktiv") || statusRaw.includes("inactive")) ? "inactive" : "active";
        const stockBalance = cleanNumber(getVal(row, ["Stok Balansı", "stockBalance"]));
        const standardDeliveryFee = cleanNumber(getVal(row, ["Çatdırılma haqqı", "standardDeliveryFee", "Çatdırılma Qiyməti"], 4));
        const totalDeliveries = cleanNumber(getVal(row, ["Çatdırılma sayı", "totalDeliveries"]));
        const totalEarnings = cleanNumber(getVal(row, ["Qazanc", "totalEarnings"]));

        let matchedId = "";
        const cleanName = name.toLowerCase().trim();
        for (const [id, cr] of localCouriersMap.entries()) {
          if (cr.name && cr.name.toLowerCase().trim() === cleanName) {
            matchedId = id;
            break;
          }
        }

        if (matchedId) {
          const existing = localCouriersMap.get(matchedId)!;
          existing.phone = phone || existing.phone;
          existing.status = status;
          existing.stockBalance = stockBalance || existing.stockBalance;
          existing.standardDeliveryFee = standardDeliveryFee || existing.standardDeliveryFee;
          existing.totalDeliveries = totalDeliveries || existing.totalDeliveries;
          existing.totalEarnings = totalEarnings || existing.totalEarnings;
        } else {
          const courierId = `courier_import_${crypto.randomUUID()}`;
          const newCourier: Courier = {
            id: courierId,
            name,
            phone,
            status,
            stockBalance,
            standardDeliveryFee,
            totalDeliveries,
            totalEarnings
          };
          localCouriersMap.set(courierId, newCourier);
        }
        importedCouriersCount++;
      }
    }

    if (onProgress) {
      onProgress({
        phase: "couriers",
        current: 25,
        total: 100,
        message: "Kuryer qeydləri təhlil edildi...",
        log: `${importedCouriersCount} kuryer qeydi sinxronizasiya olundu.`
      });
    }
    await new Promise(resolve => setTimeout(resolve, 80));

    // 1. Process Products
    for (const row of parsedProducts) {
      const name = getVal(row, ["Ad", "name", "Məhsul Adı"]);
      if (!name) {
        mismatchCount++;
        errors.push("Məhsul: Boş məhsul adı olan sətir aşkarlandı. Buraxıldı.");
        continue;
      }

      const SKU = getVal(row, ["SKU", "sku", "Məhsul SKU"], `SKU_${crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase()}`);
      const category = getVal(row, ["Kateqoriya", "category"], "Digər");
      const stock = cleanNumber(getVal(row, ["Stok", "stock"]));
      const price = cleanNumber(getVal(row, ["Satış Qiyməti", "price", "Qiymət"]));
      const costPrice = cleanNumber(getVal(row, ["Alış Qiyməti", "costPrice", "Alış"]));
      const lowStockThreshold = cleanNumber(getVal(row, ["Az Stok Həddi", "lowStockThreshold"], 5));

      const prodId = `product_${SKU.replace(/\s+/g, "_")}`;
      const prod: Product = {
        id: prodId,
        name,
        SKU,
        category,
        stock,
        price,
        costPrice,
        lowStockThreshold,
        stockHistory: [{
          date: new Date().toISOString(),
          change: stock,
          reason: "İdxal (Excel)",
          note: "Sistem idxalı zamanı bərpa"
        }]
      };

      localProductsMap.set(prodId, prod);
      importedProductsCount++;
    }

    if (onProgress) {
      onProgress({
        phase: "products",
        current: 35,
        total: 100,
        message: "Məhsul siyahısı təhlil edildi...",
        log: `${importedProductsCount} ədəd məhsul emal olundu.`
      });
    }
    await new Promise(resolve => setTimeout(resolve, 80));

    // 2. Process Expenses
    for (const row of parsedExpenses) {
      const name = getVal(row, ["Xərcin Adı", "name", "Ad"]);
      if (!name) {
        mismatchCount++;
        errors.push("Xərc: Boş xərc adı olan sətir aşkarlandı. Buraxıldı.");
        continue;
      }
      const amount = cleanNumber(getVal(row, ["Məbləğ", "amount"]));
      if (amount <= 0) {
        continue;
      }
      const category = getVal(row, ["Kateqoriya", "category"], "Digər");
      const date = parseExcelDateCustom(getVal(row, ["Tarix", "date"]));
      const paymentMethod = getVal(row, ["Ödəniş Üsulu", "paymentMethod"], "Nağd");
      const notes = getVal(row, ["Qeydlər", "notes"], "");
      const sourceRaw = getVal(row, ["Növ (Avtomatik/Manuel)", "source", "Növ"]);
      const source = (sourceRaw !== undefined && sourceRaw !== null && (String(sourceRaw).toLowerCase().trim().includes("avtomat") || String(sourceRaw).toLowerCase().trim().includes("auto"))) 
        ? "auto_delivery" as const 
        : "manual" as const;

      const expId = `expense_import_${crypto.randomUUID()}`;
      const exp: Expense = {
        id: expId,
        name,
        amount,
        category,
        date,
        paymentMethod,
        notes,
        source
      };

      queueWrite("expenses", expId, exp);
      importedExpensesCount++;
    }

    if (onProgress) {
      onProgress({
        phase: "expenses",
        current: 45,
        total: 100,
        message: "Xərclər siyahısı təhlil edildi...",
        log: `${importedExpensesCount} xərc sətiri idxala əlavə edildi.`
      });
    }
    await new Promise(resolve => setTimeout(resolve, 80));

    // 3. Process Sales
    const importSalesAccumulator: Array<{ orderNumber: string }> = isOverwrite ? [] : [...sales];
    let salesProcessed = 0;

    for (const row of parsedSales) {
      const phoneInput = getVal(row, ["Telefon", "phone"]);
      const phone = cleanPhone(phoneInput);
      if (!phone) {
        mismatchCount++;
        errors.push("Sifariş: Telefon nömrəsi tapılmayan sətir buraxıldı.");
        salesProcessed++;
        continue;
      }

      let name = getVal(row, ["Müştəri Adı", "name"]);
      if (!name) {
        name = phone;
      }

      const date = parseExcelDateCustom(getVal(row, ["Tarix", "date"]));
      const address = getVal(row, ["Ünvan", "address"], "");
      const productName = getVal(row, ["Məhsul", "Məhsul SKU (və ya Adı)", "Məhsullar", "productName", "product"], "Sistem Kənarı Məhsul");
      const qty = cleanNumber(getVal(row, ["Miqdar", "qty", "quantity"], 1));

      // Match or automatically create Customer
      const normPhone = phone.replace(/\s+/g, "");
      let custId = "";
      let custName = name;

      // Scan existing map for customer with matching phone
      let matchedCust: Customer | null = null;
      for (const c of localCustomersMap.values()) {
        if (c.phone && c.phone.replace(/\s+/g, "") === normPhone) {
          matchedCust = c;
          break;
        }
      }

      if (!matchedCust) {
        const finalName = overriddenCustomerNames[phone] || name;
        custName = finalName;
        custId = `customer_import_${crypto.randomUUID()}`;
        const newCust: Customer = {
          id: custId,
          name: finalName,
          phone,
          addresses: address ? [address] : [],
          createdAt: date,
          orderCount: 0,
          totalSpent: 0,
          isVIP: false,
        };
        localCustomersMap.set(custId, newCust);
      } else {
        custId = matchedCust.id;
        custName = overriddenCustomerNames[phone] || matchedCust.name;
        matchedCust.name = custName;
        if (address && !matchedCust.addresses.includes(address)) {
          matchedCust.addresses.push(address);
        }
      }

      // Match or create missing Product in memory
      let prodId = "";
      let prodName = productName;
      let matchedPrice = 0;

      let matchedProd: Product | null = null;
      const cleanProdSearch = productName.toLowerCase().trim();
      for (const p of localProductsMap.values()) {
        if (p.name.toLowerCase().trim() === cleanProdSearch || p.SKU.toLowerCase().trim() === cleanProdSearch) {
          matchedProd = p;
          break;
        }
      }

      if (matchedProd) {
        prodId = matchedProd.id;
        prodName = matchedProd.name;
        matchedPrice = matchedProd.price;
      }

      const unitPrice = getVal(row, ["Vahid Qiymət", "unitPrice"]) !== undefined ? cleanNumber(getVal(row, ["Vahid Qiymət", "unitPrice"])) : (matchedPrice || 10);

      if (!prodId) {
        const newSKU = `SKU_${crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase()}`;
        prodId = `product_${newSKU}`;
        const newProduct: Product = {
          id: prodId,
          name: productName,
          SKU: newSKU,
          category: "Digər",
          stock: 100,
          price: unitPrice || 10,
          costPrice: (unitPrice * 0.5) || 5,
          lowStockThreshold: 5,
          stockHistory: []
        };
        localProductsMap.set(prodId, newProduct);
      }

      const totalProductPrice = qty * unitPrice;
      const finalTotalProductPrice = totalProductPrice;

      const item: SaleItem = {
        productId: prodId,
        productName: prodName,
        qty,
        unitPrice,
        total: finalTotalProductPrice
      };

      // Normalize statuses
      const statusRaw = getVal(row, ["Status", "status", "Status (gözləyir/çatdırılıb/ləğv edilib)"], "gözləyir");
      let status: "gözləyir" | "çatdırılıb" | "ləğv edilib" = "gözləyir";
      const normS = String(statusRaw).toLowerCase().trim();
      if (normS.includes("çatdır") || normS.includes("catdir") || normS.includes("ugurl") || normS.includes("uğurl") || normS.includes("deliver")) {
        status = "çatdırılıb";
      } else if (normS.includes("ləğv") || normS.includes("legv") || normS.includes("cancel") || normS.includes("rədd") || normS.includes("redd")) {
        status = "ləğv edilib";
      }

      // Delivery and Courier details
      const deliveryTypeRaw = String(getVal(row, ["Çatdırılma Növü", "deliveryType"], "courier")).toLowerCase().trim();
      let deliveryType: "courier" | "cargo" | "expargo" | "Azərpoçt" = "courier";
      if (deliveryTypeRaw.includes("cargo") || deliveryTypeRaw.includes("kargo")) {
        deliveryType = "cargo";
      } else if (deliveryTypeRaw.includes("expargo")) {
        deliveryType = "expargo";
      } else if (deliveryTypeRaw.includes("azer") || deliveryTypeRaw.includes("azər") || deliveryTypeRaw.includes("poct") || deliveryTypeRaw.includes("poçt")) {
        deliveryType = "Azərpoçt";
      }

      let carrierInfo: any = {};
      const carrierName = String(getVal(row, ["Kuryer", "Kuryer/Kargo Adı", "courierName"], "")).trim();
      
      if (deliveryType === "courier") {
        if (carrierName) {
          let matchedCourier: Courier | null = null;
          const cleanCourierSearch = carrierName.toLowerCase().trim();
          for (const c of localCouriersMap.values()) {
            if (c.name && c.name.toLowerCase().trim() === cleanCourierSearch) {
              matchedCourier = c;
              break;
            }
          }

          if (matchedCourier) {
            carrierInfo = { courierId: matchedCourier.id, courierName: matchedCourier.name };
          } else {
            const newCourierId = `courier_import_${crypto.randomUUID()}`;
            const newCourier: Courier = {
              id: newCourierId,
              name: carrierName,
              phone: "+994000000000",
              status: "active",
              stockBalance: 0,
              standardDeliveryFee: 4,
              totalDeliveries: 0,
              totalEarnings: 0
            };
            localCouriersMap.set(newCourierId, newCourier);
            carrierInfo = { courierId: newCourierId, courierName: carrierName };
          }
        }
      } else {
        carrierInfo = { cargoCompany: carrierName || (deliveryType === "expargo" ? "Expargo" : "Kargo") };
      }

      const isCancelled = status === "ləğv edilib";
      const isDelivered = status === "çatdırılıb";

      // Resolve delivery cost, discount, total amount, net revenue
      let deliveryCost = cleanNumber(getVal(row, ["Çatdırılma Xərci", "deliveryCost"], 0));
      if (deliveryCost === 0 && deliveryType === "courier" && carrierInfo.courierId) {
        const targetCourier = localCouriersMap.get(carrierInfo.courierId);
        deliveryCost = targetCourier?.standardDeliveryFee || 4; // Default 4 AZN
      }

      const discountAmount = cleanNumber(getVal(row, ["Endirim", "discountAmount", "Discount"], 0));
      const parsedTotalAmount = Math.max(0, totalProductPrice - discountAmount);
      const parsedNetRevenue = Math.max(0, parsedTotalAmount - deliveryCost);

      // Assign Order Number in #AYV-Tarix-Saat format
      const rawOrderVal = getVal(row, ["Sifariş №", "orderNumber"]);
      let orderNumber = "";
      if (rawOrderVal !== undefined && rawOrderVal !== null && String(rawOrderVal).trim() !== "") {
        const rawStr = String(rawOrderVal).trim();
        if (rawStr.startsWith("AYV-") || rawStr.startsWith("#AYV-") || rawStr.startsWith("##AYV-")) {
          orderNumber = formatDisplayOrderNumber(rawStr);
        } else {
          orderNumber = generateDateTimeOrderNumber(date, importSalesAccumulator);
        }
      } else {
        orderNumber = generateDateTimeOrderNumber(date, importSalesAccumulator);
      }
      
      importSalesAccumulator.push({ orderNumber });
      const saleId = `sale_import_${crypto.randomUUID()}`;

      // Perform in-memory side effects (stocks, customer stats, courier stats)
      const targetCustomer = localCustomersMap.get(custId);
      if (targetCustomer) {
        if (isDelivered) {
          targetCustomer.orderCount += 1;
          targetCustomer.totalSpent += parsedTotalAmount;
        }
        const vipThreshold = settings.vipThreshold || 5;
        if (targetCustomer.orderCount >= vipThreshold) {
          targetCustomer.isVIP = true;
        }
      }

      const targetProduct = localProductsMap.get(prodId);
      if (targetProduct && isDelivered) {
        const oldStock = targetProduct.stock;
        targetProduct.stock = Math.max(0, oldStock - qty);
        targetProduct.stockHistory.push({
          date: date,
          change: -qty,
          reason: "İdxal (Sifariş Çatdırıldı)",
          note: `Sifariş #${orderNumber} (${custName}) idxal anında stokdan silindi.`
        });
      }

      // If delivered and there is a courier, update courier stats and log courier delivery cost as auto expense. Always create, handle deduplication
      if (isDelivered && deliveryType === "courier" && carrierInfo.courierId) {
        const targetCourier = localCouriersMap.get(carrierInfo.courierId);
        if (targetCourier) {
          targetCourier.totalDeliveries += 1;
          const earnVal = deliveryCost || targetCourier.standardDeliveryFee || 4;
          targetCourier.totalEarnings += earnVal;
          targetCourier.stockBalance += isCancelled ? 0 : qty; // Courier holds package quantity
          
          const expId = `expense_auto_delivery_${saleId}`;
          const saleNotes = getVal(row, ["Qeydlər", "notes"], "");
          const isColumba = (targetCourier.isDepotBased === true) || 
                            (carrierInfo.courierName || "").toLowerCase().includes("columba") || 
                            (carrierInfo.cargoCompany || "").toLowerCase().includes("columba") || 
                            (saleNotes || "").toLowerCase().includes("columba");
          const expenseName = isColumba 
            ? `Sifariş #${orderNumber} (${custName}) -Columba.az`
            : `Kuryer Çatdırılma Xərci: Sifariş #${orderNumber} (${custName})`;

          const deliveryExpense: Expense = {
            id: expId,
            name: expenseName,
            amount: earnVal,
            category: "Çatdırılma",
            date: date,
            paymentMethod: "Nağd",
            notes: `Avtomatik kuryer xərci daxil edildi. Sifariş: #${orderNumber}, Kuryer: ${targetCourier.name}`,
            source: "auto_delivery"
          };
          queueWrite("expenses", expId, deliveryExpense);
        }
      }

      const builtSale: Sale = {
        id: saleId,
        orderNumber,
        customerId: custId,
        customerName: custName,
        customerPhone: phone,
        address,
        items: [item],
        deliveryType,
        deliveryCost: isCancelled ? 0 : deliveryCost,
        totalProductPrice: isCancelled ? 0 : finalTotalProductPrice,
        discountAmount: isCancelled ? 0 : discountAmount,
        totalAmount: isCancelled ? 0 : parsedTotalAmount,
        netRevenue: isCancelled ? 0 : parsedNetRevenue,
        status,
        paymentStatus: isDelivered ? "Ödənilib" : "Gözləyir",
        notes: getVal(row, ["Qeydlər", "notes"], ""),
        createdAt: date,
        deliveredAt: isDelivered ? date : undefined,
        source: "import",
        isRevenueCalculated: isDelivered,
        statusHistory: [{ status, changedAt: date }],
        ...carrierInfo
      };

      queueWrite("sales", saleId, builtSale);
      importedSalesCount++;
      salesProcessed++;

      // Non-blocking yield periodic tick during CPU intensive parsing loops (so React renders progress!)
      if (salesProcessed % 150 === 0) {
        if (onProgress) {
          const currentPercent = 45 + Math.min(45, Math.floor((salesProcessed / parsedSales.length) * 45));
          onProgress({
            phase: "sales",
            current: currentPercent,
            total: 100,
            message: `Sifarişlər emal edilir: ${salesProcessed} / ${parsedSales.length} sətir tamamlandı...`,
            log: `Sifariş analizi davam edir: ${salesProcessed} sətir yoxlanıldı.`
          });
        }
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }

    // Now push all updated in-memory customers, products and couriers to write queue
    for (const [id, c] of localCustomersMap.entries()) {
      queueWrite("customers", id, c);
    }
    for (const [id, p] of localProductsMap.entries()) {
      queueWrite("products", id, p);
    }
    for (const [id, cr] of localCouriersMap.entries()) {
      queueWrite("couriers", id, cr);
    }

    if (onProgress) {
      onProgress({
        phase: "uploading",
        current: 0,
        total: docsToWrite.length,
        message: `Məlumatlar emal edildi və hazırlandı. ${docsToWrite.length} ədəd yazı bazaya saniyələr içində yüklənir...`,
        log: `Yükləməyə hazır: ${importedSalesCount} Sifariş, ${importedProductsCount} Məhsul, ${importedExpensesCount} Xərc, ${importedCustomersCount} Müştəri, ${importedCouriersCount} Kuryer`
      });
    }
    await new Promise(resolve => setTimeout(resolve, 80));

    // 4. Bulk upload in concurrent chunks for high acceleration
    const BATCH_SIZE = 45; 
    for (let i = 0; i < docsToWrite.length; i += BATCH_SIZE) {
      const chunk = docsToWrite.slice(i, i + BATCH_SIZE);
      await Promise.all(chunk.map(d => setDoc(doc(db, d.col, d.id), d.data)));
      
      const uploadedCount = Math.min(docsToWrite.length, i + BATCH_SIZE);
      if (onProgress) {
        onProgress({
          phase: "uploading",
          current: uploadedCount,
          total: docsToWrite.length,
          message: `Məlumatlar verilənlər bazasına yazılır (${uploadedCount} / ${docsToWrite.length}) tamamlandı...`,
          log: `${uploadedCount} / ${docsToWrite.length} qeyd bazaya köçürüldü.`
        });
      }
      await new Promise(resolve => setTimeout(resolve, 40)); // Let the main UI thread keep rendering actively!
    }

    if (onProgress) {
      onProgress({
        phase: "completed",
        current: docsToWrite.length,
        total: docsToWrite.length,
        message: "İdxal prosesi tam olaraq başa çatdı! Sistem yeniləndi.",
        log: "Bütün məlumatlar uğurla yazıldı!"
      });
    }

    return {
      success: true,
      importedSalesCount,
      importedExpensesCount,
      importedProductsCount,
      importedCustomersCount,
      importedCouriersCount,
      mismatchCount,
      errors
    };
  };

  return (
    <DataContext.Provider
      value={{
        currentUser,
        loading,
        customers,
        products,
        couriers,
        sales,
        expenses,
        settings,
        toasts,
        stockTransfers,
        isMigrating,
        transferStockToCourier,
        runDataMigration,
        removeToast,
        addToast,
        saveCustomer,
        toggleCustomerBlacklist,
        syncAllCancelledCustomersToBlacklist,
        deleteCustomer,
        saveProduct,
        adjustProductStock,
        deleteProduct,
        saveCourier,
        deleteCourier,
        createSale,
        updateSaleStatus,
        updateSale,
        copySaleAsNew,
        deleteSale,
        saveExpense,
        deleteExpense,
        saveSettings,
        resetAllData,
        wipeAllSystemData,
        importExcelData,
        importBackupJSON,
        googleAccessToken,
        setGoogleAccessToken,
        syncSingleSaleToCalendar,
        syncAllSalesToCalendar,
        syncSingleCustomerToContacts,
        syncAllCustomersToContacts,
        isNewOrderOpen,
        setIsNewOrderOpen,
        offlineMode,
        setOfflineMode
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
