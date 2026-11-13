import React, { useState, useRef, useMemo, useEffect } from "react";
import { useData } from "../context/DataContext";
import { 
  Download, 
  Upload, 
  Trash2, 
  FileSpreadsheet, 
  AlertTriangle, 
  Check, 
  Copy, 
  FileCheck2, 
  CheckCircle2, 
  RefreshCw,
  Cloud,
  CloudDownload,
  CloudUpload,
  FileJson,
  LogOut,
  Calendar,
  Users,
  MessageSquare,
  Send,
  ShieldAlert,
  CheckCircle,
  FileText
} from "lucide-react";
import { exportToExcel, downloadTemplate, formatCurrency } from "../utils/xlsEngine";
import * as XLSX from "xlsx-js-style";
import { googleSignInForDrive, db, handleFirestoreError, OperationType } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { verifyTelegramBotConnection, sendTelegramTestMessage, sendTelegramReportTest, triggerTelegramManualSync } from "../utils/telegramService";

const formatFirebaseErrorForUser = (err: any): { title: string; desc: string; solution: string } => {
  const errMsg = String(err?.message || err || "").toLowerCase();
  
  if (errMsg.includes("quota") || errMsg.includes("exhausted") || errMsg.includes("limit") || err?.code === "resource-exhausted") {
    return {
      title: "Firebase Günlük Yazma Limiti Dolub (Quota Exceeded)",
      desc: "İdxal etmək istədiyiniz faylda çox sayda məlumat var, yaxud sistem bugünlük Google Firestore üzərindəki pulsuz limitini (50,050 yazma hüququ) tamamilə doldurub.",
      solution: "Bu limit adətən növbəti gün Sakit Okean vaxtı ilə gecə yarısı (Bakı vaxtı ilə səhər 08:00 - 09:00 radələrində) tamamilə sıfırlanır. Prosesi icra etmək üçün sabah cəhd edə bilərsiniz, yaxud administrator panelindən Firebase üçün 'Blaze' (ödənişli/istifadə etdiyin qədər ödə) tarif planına keçid edərək limitləri tamamilə qaldıra bilərsiniz."
    };
  }
  
  if (errMsg.includes("permission") || errMsg.includes("denied") || err?.code === "permission-denied") {
    return {
      title: "Giriş İcazəsi Səhvdir (Permission Denied)",
      desc: "Verilənlər bazasına yazmaq və ya onu tamamlamaq üçün kifayət qədər hüququnuz yoxdur.",
      solution: "İstifadəçi hesabınızın tam idarəçi (administrator) statusunda olduğundan əmin olun."
    };
  }

  if (errMsg.includes("network") || errMsg.includes("offline") || errMsg.includes("failed to get document")) {
    return {
      title: "Şəbəkə Bağlantısı Xətası (Network Error)",
      desc: "İnternet bağlantısında problem yarandı və Google serverləri ilə əlaqə qurulmadı.",
      solution: "Xahiş edirik internet bağlantınızı və VPN xidmətlərini (əgər varsa) yoxlayıb yenidən cəhd edin."
    };
  }

  return {
    title: "Gözlənilməz Bir Xəta Baş Verdi",
    desc: err?.message || String(err),
    solution: "Sənədin sütun strukturunun doğru olduğunu və sistem şablonuna uyğun gəldiyini yoxlayın. Əgər problem davam edərsə, səhifəni yeniləyib yenidən daxil edin."
  };
};

export default function SettingsView() {
  const { 
    sales, expenses, products, couriers, customers, settings, saveSettings,
    importExcelData, wipeAllSystemData, importBackupJSON,
    googleAccessToken, setGoogleAccessToken, syncAllSalesToCalendar, syncAllCustomersToContacts,
    isMigrating, runDataMigration
  } = useData();

  // Excel export selection parameters
  const [wbSales, setWbSales] = useState(true);
  const [wbExpenses, setWbExpenses] = useState(true);
  const [wbProducts, setWbProducts] = useState(true);
  const [wbCouriers, setWbCouriers] = useState(true);
  const [wbCustomers, setWbCustomers] = useState(true);

  // Telegram Bot Token and Chat ID integration
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [isSavingTelegram, setIsSavingTelegram] = useState(false);
  const [telegramSaveMessage, setTelegramSaveMessage] = useState("");

  // Sync state with settings
  useEffect(() => {
    if (settings) {
      setTelegramBotToken(settings.telegramBotToken || "");
      setTelegramChatId(settings.telegramChatId || "");
    }
  }, [settings]);

  const handleSaveTelegramSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTelegram(true);
    setTelegramSaveMessage("");
    try {
      await saveSettings({
        ...settings,
        telegramBotToken: telegramBotToken.trim(),
        telegramChatId: telegramChatId.trim()
      });
      setTelegramSaveMessage("✓ Tənzimləmələr uğurla yadda saxlanıldı!");
      setTimeout(() => setTelegramSaveMessage(""), 4000);
    } catch (err: any) {
      setTelegramSaveMessage(`❌ Xəta baş verdi: ${err.message || String(err)}`);
    } finally {
      setIsSavingTelegram(false);
    }
  };

  // Telegram Bot Diagnostics States
  const [telegramLogs, setTelegramLogs] = useState<any[]>([]);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    checked: boolean;
    botName?: string;
    error?: string;
  } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    sent: boolean;
    messageId?: string;
    error?: string;
  } | null>(null);
  const [sendingReportTest, setSendingReportTest] = useState(false);
  const [reportTestResult, setReportTestResult] = useState<{
    success: boolean;
    sent: boolean;
    error?: string;
  } | null>(null);
  const [syncingTelegram, setSyncingTelegram] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    checked: boolean;
    processedCount: number;
    duplicatedCount: number;
    info?: string;
    error?: string;
  } | null>(null);

  // Subscribe to telegram logs in real-time
  useEffect(() => {
    const q = query(
      collection(db, "telegram_logs"),
      orderBy("timestamp", "desc"),
      limit(15)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTelegramLogs(logsList);
    }, (err) => {
      console.error("Error listening to telegram logs:", err);
      handleFirestoreError(err, OperationType.GET, "telegram_logs");
    });
    return () => unsubscribe();
  }, []);

  const handleRunBotCheck = async () => {
    setCheckingConnection(true);
    setConnectionResult(null);
    try {
      const res = await verifyTelegramBotConnection();
      setConnectionResult({
        success: res.success,
        checked: true,
        botName: res.botName,
        error: res.error
      });
    } catch (err: any) {
      setConnectionResult({
        success: false,
        checked: true,
        error: err.message || String(err)
      });
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleSendTestMessage = async () => {
    setSendingTest(true);
    setTestResult(null);
    try {
      const testMsg = `🚨 Ayvel Diaqnostika - Sınaq Mesajı\nTarix: ${new Date().toLocaleString("az-AZ")}\nBağlantı uğurla təmin edildi!`;
      const res = await sendTelegramTestMessage(testMsg);
      setTestResult({
        success: res.success,
        sent: true,
        messageId: res.messageId,
        error: res.error
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        sent: true,
        error: err.message || String(err)
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendReportTest = async () => {
    setSendingReportTest(true);
    setReportTestResult(null);
    try {
      const res = await sendTelegramReportTest();
      setReportTestResult({
        success: res.success,
        sent: true,
        error: res.error
      });
    } catch (err: any) {
      setReportTestResult({
        success: false,
        sent: true,
        error: err.message || String(err)
      });
    } finally {
      setSendingReportTest(false);
    }
  };

  const handleTriggerManualSync = async () => {
    setSyncingTelegram(true);
    setSyncResult(null);
    try {
      const res = await triggerTelegramManualSync();
      setSyncResult({
        success: res.success !== false,
        checked: true,
        processedCount: res.processedCount || 0,
        duplicatedCount: res.duplicatedCount || 0,
        info: res.info,
        error: res.error || (res.success === false ? "Sinxronizasiya icra edilə bilmədi" : undefined)
      });
    } catch (err: any) {
      setSyncResult({
        success: false,
        checked: true,
        processedCount: 0,
        duplicatedCount: 0,
        error: err.message || String(err)
      });
    } finally {
      setSyncingTelegram(false);
    }
  };

  // File import statuses
  const [dragOver, setDragOver] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "parsing" | "verifying" | "resolved" | "completed" | "failed">("idle");
  const [importProgress, setImportProgress] = useState<{
    phase: string;
    current: number;
    total: number;
    message: string;
    log?: string;
  } | null>(null);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importErrorDetails, setImportErrorDetails] = useState<{
    title: string;
    desc: string;
    solution: string;
  } | null>(null);
  const [importSummary, setImportSummary] = useState<{
    salesCount: number;
    expensesCount: number;
    productsCount: number;
    customersCount: number;
    couriersCount: number;
  }>({ salesCount: 0, expensesCount: 0, productsCount: 0, customersCount: 0, couriersCount: 0 });

  // Conflict state management
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [conflictSolutions, setConflictSolutions] = useState<Record<string, "keep" | "overwrite">>({});
  const [validParsedData, setValidParsedData] = useState<any>(null);

  // Conflict / Import Strategy & Report UI States
  const [conflictStrategy, setConflictStrategy] = useState<"merge" | "overwrite">("merge");
  const [importFeedback, setImportFeedback] = useState<{
    importedSalesCount: number;
    importedExpensesCount: number;
    importedProductsCount: number;
    importedCustomersCount: number;
    importedCouriersCount: number;
    mismatchCount: number;
    errors: string[];
  } | null>(null);

  // Google Drive Integration States
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [driveUser, setDriveUser] = useState<any>(null);
  const [driveBackups, setDriveBackups] = useState<any[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveStatusMsg, setDriveStatusMsg] = useState("");

  useEffect(() => {
    if (googleAccessToken) {
      setAccessToken(googleAccessToken);
      fetchBackupFilesList(googleAccessToken);
    } else {
      setAccessToken(null);
      setDriveBackups([]);
    }
  }, [googleAccessToken]);

  const handleConnectGDrive = async () => {
    setDriveLoading(true);
    setDriveStatusMsg("OAuth bağlantısı qurulur...");
    try {
      const result = await googleSignInForDrive();
      if (result) {
        setAccessToken(result.accessToken);
        setGoogleAccessToken(result.accessToken);
        setDriveUser(result.user);
        setDriveStatusMsg("Sinxronizasiya aktivdir.");
        await fetchBackupFilesList(result.accessToken);
      }
    } catch (err: any) {
      alert("Google bulud qoşulması zamanı xəta: " + err.message);
      setDriveStatusMsg("Bağlantı uğursuz oldu.");
    } finally {
      setDriveLoading(false);
    }
  };

  const handleDisconnectGDrive = () => {
    setAccessToken(null);
    setGoogleAccessToken(null);
    setDriveUser(null);
    setDriveBackups([]);
    setDriveStatusMsg("Google Drive bağlantısı kəsildi.");
  };

  // Google Calendar Integration Local States & Handlers
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSyncProgress, setCalendarSyncProgress] = useState<{ current: number; total: number; orderNumber: string } | null>(null);
  const [calendarStatusMsg, setCalendarCalendarStatusMsg] = useState("");

  const handleConnectCalendar = async () => {
    setCalendarLoading(true);
    setCalendarCalendarStatusMsg("Google bağlantısı qurulur...");
    try {
      const result = await googleSignInForDrive();
      if (result) {
        setAccessToken(result.accessToken);
        setGoogleAccessToken(result.accessToken);
        setDriveUser(result.user);
        setCalendarCalendarStatusMsg("Bağlantı uğurla quruldu.");
        await fetchBackupFilesList(result.accessToken);
      }
    } catch (err: any) {
      alert("Google qoşulması zamanı xəta: " + err.message);
      setCalendarCalendarStatusMsg("Qoşulma alınmadı.");
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleSyncAllSales = async () => {
    if (!googleAccessToken) {
      alert("Lütfən əvvəlcə Google Hesabınıza qoşulun.");
      return;
    }

    const confirmed = window.confirm(
      `DİQQƏT: Sistemdə yedəklənmiş hər bir sifariş (${sales.length} ədəd) müvafiq yaradılma tarixlərinə uyğun olaraq Google Təqviminizə (Google Calendar) əlavə ediləcəkdir. Bu proses bir qədər vaxt ala bilər. Davam edilsin?`
    );
    if (!confirmed) return;

    setCalendarLoading(true);
    setCalendarCalendarStatusMsg("Təqvimlə sinxronizasiya icra olunur...");
    try {
      const result = await syncAllSalesToCalendar((progress) => {
        setCalendarSyncProgress(progress);
        setCalendarCalendarStatusMsg(`Sinxronizasiya davam edir: ${progress.current} / ${progress.total} (Sifariş №${progress.orderNumber})`);
      });

      setCalendarCalendarStatusMsg(
        `✓ Sinxronizasiya tamamilə uğurla başa çatdı! ${result.successCount} ədəd sifariş Google Calendar üzərində qeydə alındı. (Xətalı sətir: ${result.errorCount})`
      );
      setCalendarSyncProgress(null);
    } catch (err: any) {
      alert("Calendar Sinxronizasiya xətası: " + err.message);
      setCalendarCalendarStatusMsg("Sinxronizasiya yarıda kəsildi.");
    } finally {
      setCalendarLoading(false);
    }
  };

  // Google Contacts Integration Local States & Handlers
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsSyncProgress, setContactsSyncProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [contactsStatusMsg, setContactsStatusMsg] = useState("");

  const handleSyncAllCustomers = async () => {
    if (!googleAccessToken) {
      alert("Lütfən əvvəlcə Google Hesabınıza qoşulun.");
      return;
    }

    const confirmed = window.confirm(
      `DİQQƏT: Sistemdə qeydə alınmış hər bir müştəri (${customers.length} nəfər) ad və telefon nömrələri daxil olmaqla Google Contacts (Əlaqələr) siyahınıza əlavə ediləcəkdir. Davam edilsin?`
    );
    if (!confirmed) return;

    setContactsLoading(true);
    setContactsStatusMsg("Google Əlaqələri xidməti ilə sinxronizasiya həyata keçirilir...");
    try {
      const result = await syncAllCustomersToContacts((progress) => {
        setContactsSyncProgress(progress);
        setContactsStatusMsg(`Əlaqələr yazılır: ${progress.current} / ${progress.total} (${progress.name})`);
      });

      setContactsStatusMsg(
        `✓ Sinxronizasiya tamamilə uğurla başa çatdı! ${result.successCount} ədəd müştəri Google Contacts əlaqələrinə qeydə alındı. (Xətalı sətir: ${result.errorCount})`
      );
      setContactsSyncProgress(null);
    } catch (err: any) {
      alert("Contacts Sinxronizasiya xətası: " + err.message);
      setContactsStatusMsg("Sinxronizasiya yarıda kəsildi.");
    } finally {
      setContactsLoading(false);
    }
  };

  const fetchBackupFilesList = async (token: string) => {
    setDriveLoading(true);
    try {
      const q = "(name contains 'ayvelin_backup_' or name contains 'ayvelin_auto_backup_') and mimeType = 'application/json' and trashed = false";
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&fields=files(id,name,createdTime,size)`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        let errDetail = "";
        try {
          errDetail = await res.text();
        } catch (_) {}
        console.error("fetchBackupFilesList failed:", res.status, errDetail);
        throw new Error(`Siyahı əldə edilə bilmədi (Status: ${res.status}). Detal: ${errDetail}`);
      }
      const data = await res.json();
      setDriveBackups(data.files || []);
    } catch (err: any) {
      console.error("Fetch backups error:", err);
      setDriveStatusMsg(`Siyahı oxunarkən xəta: ${err.message || err}`);
    } finally {
      setDriveLoading(false);
    }
  };

  const handleCreateGDriveBackup = async () => {
    if (!accessToken) return;
    setDriveLoading(true);
    setDriveStatusMsg("Yedəkləmə hazırlanır...");
    try {
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
        name: `ayvelin_backup_${new Date().toISOString().replace(/:/g, '-')}.json`,
        mimeType: 'application/json',
        description: 'Ayvelin Sifariş və Kuryer İdarəetmə Paneli Bulud Backup'
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
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });

      if (!res.ok) {
        throw new Error("Fayl Drive-a yüklənə bilmədi.");
      }

      setDriveStatusMsg("Yeni bulud yedəyi yaradıldı! ✓");
      await fetchBackupFilesList(accessToken);
    } catch (err: any) {
      alert("Bulud yedəklənməsi zamanı xəta: " + err.message);
      setDriveStatusMsg("Yedəklənmə xətası.");
    } finally {
      setDriveLoading(false);
    }
  };

  const handleRestoreFromDrive = async (fileId: string, fileName: string) => {
    if (!accessToken) return;
    
    const confirmed = window.confirm(
      `DİQQƏT: Google Drive hesabınızdakı "${fileName}" yedək faylını bərpa etmək istəyirsiniz?`
    );
    if (!confirmed) return;

    const useOverwrite = window.confirm(
      "DİQQƏT: Cari məlumatları TAMAMİLƏ sıfırlayıb bu bulud yedəyini sıfırdan yazmaq üçün 'OK' klikləyin.\n" +
      "Məlumatların silinməməsi, sadəcə fərqlilərin əlavə olunub birləşməsi (merge) üçün 'Ləğv et' (Cancel) klikləyin."
    );

    setDriveLoading(true);
    setDriveStatusMsg("Yedək faylı oxunur...");
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error("Yedək faylı yüklənə bilmədi.");
      }

      const backupData = await response.json();
      
      setDriveStatusMsg("Bərpa prosesi başladıldı...");
      await importBackupJSON(backupData, useOverwrite);
      
      alert(
        useOverwrite 
          ? "Sistem tamamilə bərpa olundu və sıfırlandı!" 
          : "Yedək faylı cari məlumatla birləşdirildi!"
      );
      setDriveStatusMsg("Məlumatlar uğurla bərpa olundu ✓");
    } catch (err: any) {
      alert("Yedək bərpa olunarkən xəta yarandı: " + err.message);
      setDriveStatusMsg("Yedək bərpa xətası.");
    } finally {
      setDriveLoading(false);
    }
  };

  const handleDeleteGDriveBackup = async (fileId: string, fileName: string) => {
    if (!accessToken) return;
    
    const confirmed = window.confirm(`"${fileName}" yedək sənədini Google Drive-dan silmək istəyirsiniz?`);
    if (!confirmed) return;

    setDriveLoading(true);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!res.ok) {
        throw new Error("Silinmə rədd edildi.");
      }
      alert("Bulud yedəyi uğurla silindi.");
      await fetchBackupFilesList(accessToken);
    } catch (err: any) {
      alert("Bulud yedəyi silinərkən xəta: " + err.message);
    } finally {
      setDriveLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Export trigger
  const handleExportTrigger = () => {
    exportToExcel(
      { sales, expenses, products, couriers, customers },
      {
        sheetSelections: {
          sales: wbSales,
          expenses: wbExpenses,
          products: wbProducts,
          couriers: wbCouriers,
          customers: wbCustomers
        }
      }
    );
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      parseSpreadsheetFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      parseSpreadsheetFile(files[0]);
    }
  };

  // Live SheetJS parser
  const parseSpreadsheetFile = (file: File) => {
    setImportStatus("parsing");
    setImportFeedback(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        
        let parsedSales: any[] = [];
        let parsedExpenses: any[] = [];
        let parsedProducts: any[] = [];
        let parsedCustomers: any[] = [];
        let parsedCouriers: any[] = [];

        // If simple CSV or single sheet
        if (workbook.SheetNames.length === 1) {
          const singleSheetName = workbook.SheetNames[0];
          const singleSheet = workbook.Sheets[singleSheetName];
          const rawRows = XLSX.utils.sheet_to_json(singleSheet);
          if (rawRows.length > 0) {
            const rowStr = JSON.stringify(rawRows[0]).toLowerCase();
            if (rowStr.includes("xərc") || rowStr.includes("xerc") || rowStr.includes("məbləğ")) {
              parsedExpenses = rawRows;
            } else if (rowStr.includes("sku") || rowStr.includes("stok")) {
              parsedProducts = rawRows;
            } else if (rowStr.includes("kuryer") || rowStr.includes("courier")) {
              parsedCouriers = rawRows;
            } else if (rowStr.includes("müştəri") || rowStr.includes("musteri") || rowStr.includes("customer")) {
              parsedCustomers = rawRows;
            } else {
              parsedSales = rawRows;
            }
          } else {
            parsedSales = rawRows;
          }
        } else {
          // Check Sifarişlər sheet
          if (workbook.SheetNames.includes("Sifarişlər")) {
            parsedSales = XLSX.utils.sheet_to_json(workbook.Sheets["Sifarişlər"]);
          } else {
            const aliasName = workbook.SheetNames.find(n => n.toLowerCase().trim() === "sifarişlər" || n.toLowerCase().trim() === "sifarisler" || n.toLowerCase().trim() === "sales" || n.toLowerCase().trim() === "sifariş" || n.toLowerCase().trim() === "sifaris");
            if (aliasName) {
              parsedSales = XLSX.utils.sheet_to_json(workbook.Sheets[aliasName]);
            }
          }

          // Check Xərclər sheet
          if (workbook.SheetNames.includes("Xərclər")) {
            parsedExpenses = XLSX.utils.sheet_to_json(workbook.Sheets["Xərclər"]);
          } else {
            const aliasName = workbook.SheetNames.find(n => n.toLowerCase().trim() === "xərclər" || n.toLowerCase().trim() === "xercler" || n.toLowerCase().trim() === "expenses" || n.toLowerCase().trim() === "xərc" || n.toLowerCase().trim() === "xerc");
            if (aliasName) {
              parsedExpenses = XLSX.utils.sheet_to_json(workbook.Sheets[aliasName]);
            }
          }

          // Check Məhsullar sheet
          if (workbook.SheetNames.includes("Məhsullar")) {
            parsedProducts = XLSX.utils.sheet_to_json(workbook.Sheets["Məhsullar"]);
          } else {
            const aliasName = workbook.SheetNames.find(n => n.toLowerCase().trim() === "məhsullar" || n.toLowerCase().trim() === "mehsullar" || n.toLowerCase().trim() === "products" || n.toLowerCase().trim() === "məhsul" || n.toLowerCase().trim() === "mehsul");
            if (aliasName) {
              parsedProducts = XLSX.utils.sheet_to_json(workbook.Sheets[aliasName]);
            }
          }

          // Check Müştərilər sheet
          if (workbook.SheetNames.includes("Müştərilər")) {
            parsedCustomers = XLSX.utils.sheet_to_json(workbook.Sheets["Müştərilər"]);
          } else {
            const aliasName = workbook.SheetNames.find(n => {
              const t = n.toLowerCase().trim();
              return t === "müştərilər" || t === "musteriler" || t === "customers" || t === "müştəri" || t === "musteri" || t === "customer";
            });
            if (aliasName) {
              parsedCustomers = XLSX.utils.sheet_to_json(workbook.Sheets[aliasName]);
            }
          }

          // Check Kuryerlər sheet
          if (workbook.SheetNames.includes("Kuryerlər")) {
            parsedCouriers = XLSX.utils.sheet_to_json(workbook.Sheets["Kuryerlər"]);
          } else {
            const aliasName = workbook.SheetNames.find(n => {
              const t = n.toLowerCase().trim();
              return t === "kuryerlər" || t === "kuryerler" || t === "couriers" || t === "kuryer" || t === "courier";
            });
            if (aliasName) {
              parsedCouriers = XLSX.utils.sheet_to_json(workbook.Sheets[aliasName]);
            }
          }
        }

        verifyImportStructures(parsedSales, parsedExpenses, parsedProducts, parsedCustomers, parsedCouriers);

      } catch (err: any) {
        alert("Fayl oxunarkən xəta yarandı: " + err.message);
        setImportStatus("idle");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Structured content verification
  const verifyImportStructures = (
    parsedSales: any[], 
    parsedExpenses: any[], 
    parsedProducts: any[],
    parsedCustomers: any[] = [],
    parsedCouriers: any[] = []
  ) => {
    setImportStatus("verifying");

    const foundConflicts: any[] = [];
    const initialSolutions: Record<string, "keep" | "overwrite"> = {};

    // Validate phone conflicts: same phone in import but matches different name in DB
    parsedSales.forEach((row, idx) => {
      // Find possible phone/name keys
      const getVal = (r: any, keys: string[]) => {
        for (const k of keys) {
          if (r[k] !== undefined && r[k] !== null) return r[k];
          for (const rk of Object.keys(r)) {
            if (rk.toLowerCase().trim() === k.toLowerCase().trim()) return r[rk];
          }
        }
        return undefined;
      };

      const phoneInput = getVal(row, ["Telefon", "phone"]);
      const nameInput = getVal(row, ["Müştəri Adı", "name"]);
      
      if (phoneInput && nameInput) {
        const cleanP = String(phoneInput).trim().replace(/[\s\-\(\)]/g, "");
        const matchCustomer = customers.find(c => c.phone && c.phone.trim().replace(/[\s\-\(\)]/g, "") === cleanP);
        if (matchCustomer && matchCustomer.name !== nameInput) {
          const conflictId = `conflict_${cleanP}_${idx}`;
          foundConflicts.push({
            id: conflictId,
            phone: cleanP,
            sheetName: nameInput,
            dbName: matchCustomer.name
          });
          initialSolutions[conflictId] = "keep"; // Default choice to guard DB
        }
      }
    });

    setConflicts(foundConflicts);
    setConflictSolutions(initialSolutions);
    setValidParsedData({ parsedSales, parsedExpenses, parsedProducts, parsedCustomers, parsedCouriers });
    setImportSummary({
      salesCount: parsedSales.length,
      expensesCount: parsedExpenses.length,
      productsCount: parsedProducts.length,
      customersCount: parsedCustomers.length,
      couriersCount: parsedCouriers.length
    });

    setImportStatus(foundConflicts.length > 0 ? "verifying" : "resolved");
  };

  const handleSetConflictStrategy = (id: string, solution: "keep" | "overwrite") => {
    setConflictSolutions({
      ...conflictSolutions,
      [id]: solution
    });
  };

  // Apply imports and load to Firestore using selected strategy
  const handleApplyImportLoad = async () => {
    if (!validParsedData) return;
    setImportStatus("parsing");
    setImportLogs([]);
    setImportErrorDetails(null);
    setImportProgress({
      phase: "init",
      current: 0,
      total: 100,
      message: "İdxal başladılır...",
      log: "Başlanğıc nöqtəsi."
    });

    // Map resolutions
    const overriddenCustomerNames: Record<string, string> = {};
    conflicts.forEach(conf => {
      const sol = conflictSolutions[conf.id];
      if (sol === "overwrite") {
        overriddenCustomerNames[conf.phone] = conf.sheetName; // write excel values down
      }
    });

    try {
      const result = await importExcelData({
        ...validParsedData,
        overriddenCustomerNames,
        isOverwrite: conflictStrategy === "overwrite",
        onProgress: (prog) => {
          setImportProgress(prog);
          if (prog.log) {
            setImportLogs((prev) => [
              `[${new Date().toLocaleTimeString("az-AZ")}] ${prog.message}`,
              prog.log || "",
              ...prev
            ].filter(Boolean).slice(0, 150));
          }
        }
      });
      setImportFeedback(result);
      setImportStatus("completed");
    } catch (err: any) {
      console.error("İdxal xətası:", err);
      const parsed = formatFirebaseErrorForUser(err);
      setImportErrorDetails(parsed);
      setImportStatus("failed");
      setImportLogs((prev) => [
        `[${new Date().toLocaleTimeString("az-AZ")}] ❌ FATAL XƏTA: ${parsed.title}`,
        `Açıqlama: ${parsed.desc}`,
        `Sistem ssenarisi: ${err?.message || String(err)}`,
        `Tövsiyə olunan həll yolu: ${parsed.solution}`,
        ...prev
      ]);
    }
  };

  // Export report of mismatches / warnings / status
  const handleDownloadErrorReport = () => {
    if (!importFeedback) return;
    const reportText = [
      "===========================================================",
      "          AYVELIN SISTEM IDXAL SƏNƏD HESABATI",
      `          Hesabat Tarixi: ${new Date().toLocaleString("az-AZ")}`,
      "===========================================================",
      "",
      `Uğurlu Sifariş Sətirləri: ${importFeedback.importedSalesCount}`,
      `Uğurlu Məhsul Sətirləri: ${importFeedback.importedProductsCount}`,
      `Uğurlu Xərc Sətirləri: ${importFeedback.importedExpensesCount}`,
      `Uğurlu Müştəri Yazıları: ${importFeedback.importedCustomersCount}`,
      `Uğurlu Kuryer Yazıları: ${importFeedback.importedCouriersCount}`,
      `Müəyyən Edilmiş Uyğunsuzluqlar: ${importFeedback.mismatchCount}`,
      `Strategiya: ${conflictStrategy === "overwrite" ? "Hər şeyi sil və yenidən yüklə (Overwrite)" : "Yalnız yenilərini əlavə et (Merge)"}`,
      "",
      "---------------- Xətalar və Uyğunsuzluqlar Siyahısı ----------------",
      importFeedback.errors.length > 0
        ? importFeedback.errors.map((err, idx) => `[${idx + 1}] ${err}`).join("\n")
        : "Heç bir xəta yaxud uyğunsuzluq qeydə alınmadı. İdxal əməliyyatı tamamilə uğurludur!"
    ].join("\n");

    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Ayvelin_İmport_Xəta_Hesabatı_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Wipe warning
  const handleSystemWipeRisk = async () => {
    const confirmation1 = window.confirm("!!!! DİQQƏT !!!! Bütün sistemi sıfırlamaq istəyirsiniz? Sifarişlər, Müştərilər, Kuryerlər və Xərclər birdəfəlik silinəcək!");
    if (!confirmation1) return;

    const confirmation2 = window.prompt("Təsdiqləmək üçün bura böyük hərflərlə 'AYVELIN-SIFIRLA' yazın:");
    if (confirmation2 === "AYVELIN-SIFIRLA") {
      try {
        await wipeAllSystemData();
        alert("Bütün məlumatlar silindi və təmizləndi! Sistem yeniləndi.");
      } catch (err: any) {
        alert("Sıfırlama zamanı xəta yarandı: " + err.message);
      }
    } else {
      alert("Təsdiqləmə yazısı doğru deyil, sıfırlama rədd edildi.");
    }
  };

  return (
    <div className="space-y-6">

      {/* Main Grid options */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. DATA EXPORT HUB */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Arxiv Fayllarının İxracı (Export)</h4>
              <p className="text-[10px] text-slate-400">Excel formatında bütün anbar və mühasibat məlumatları yükləyin</p>
            </div>
          </div>

          <div className="space-y-3.5 text-xs pt-2">
            
            <label className="flex items-center gap-2.5 p-3.5 hover:bg-slate-50 border rounded-xl cursor-pointer">
              <input 
                type="checkbox" 
                checked={wbSales} 
                onChange={(e) => setWbSales(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-bold text-slate-700 block text-xs">Sifarişlər Vərəqi (Orders)</span>
                <span className="text-[10px] text-slate-400">Tarix, məbləğlər və kuryer status logları</span>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-3.5 hover:bg-slate-50 border rounded-xl cursor-pointer">
              <input 
                type="checkbox" 
                checked={wbExpenses} 
                onChange={(e) => setWbExpenses(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-bold text-slate-700 block text-xs">Xərclər Vərəqi (Expenses)</span>
                <span className="text-[10px] text-slate-400">Ofis xərcləri və avtomatik kuryer yol haqqı logs</span>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-3.5 hover:bg-slate-50 border rounded-xl cursor-pointer">
              <input 
                type="checkbox" 
                checked={wbProducts} 
                onChange={(e) => setWbProducts(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-bold text-slate-700 block text-xs">Məhsullar və Anbar Vərəqi (Products)</span>
                <span className="text-[10px] text-slate-400 font-normal">Active SKU listings, prices, cost values</span>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-3.5 hover:bg-slate-50 border rounded-xl cursor-pointer">
              <input 
                type="checkbox" 
                checked={wbCouriers} 
                onChange={(e) => setWbCouriers(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-bold text-slate-700 block text-xs">Kuryer Hesabatı (Couriers)</span>
                <span className="text-[10px] text-slate-400">Standard fees, runs counts and accrued metrics</span>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-3.5 hover:bg-slate-50 border rounded-xl cursor-pointer">
              <input 
                type="checkbox" 
                checked={wbCustomers} 
                onChange={(e) => setWbCustomers(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-0"
              />
              <div>
                <span className="font-bold text-slate-700 block text-xs">Müştəri Portfeli (Customers list)</span>
                <span className="text-[10px] text-slate-400">Phones, lifetime values, dates and VIP flags</span>
              </div>
            </label>

            <button 
              onClick={handleExportTrigger}
              className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 shadow-sm transition-all"
            >
              Uğurla Excel Formatında Yüklə (.xlsx)
            </button>
          </div>
        </div>

        {/* 2. DATA IMPORT AND DRAG AREA */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Faylların İdxalı (Import)</h4>
                <p className="text-[10px] text-slate-400">Xarici workbookları daxil edib sinxronizasiya edin</p>
              </div>
            </div>

            <button 
              onClick={downloadTemplate}
              className="text-[10px] text-indigo-600 font-bold border border-indigo-100 px-2.5 py-1 rounded-lg hover:bg-indigo-50"
            >
              📥 Nümunə Şablon Yüklə
            </button>
          </div>

          {/* Core drag zone */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-3 cursor-pointer transition-all ${
              dragOver ? "border-emerald-500 bg-emerald-50/10" : "border-slate-200 hover:border-slate-400"
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept=".xlsx, .xls, .csv" 
              className="hidden" 
              aria-label="Upload excel or csv spreadsheet file for data import"
            />
            
            <FileSpreadsheet className="w-12 h-12 text-slate-350" />
            <div>
              <span className="text-xs font-bold text-slate-700 block">Sənədi sürüşdürün və ya klikləyin</span>
              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">Dəstəklənən formatlar: .xlsx, .xls, .csv</p>
            </div>
          </div>

           {/* Import Parser processes */}
          {importStatus === "parsing" && (
            <div className="p-5 bg-white border border-indigo-100 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-700">Canlı İdxal və Yükləmə Prosesi</span>
                </div>
                {importProgress && importProgress.total > 0 && (
                  <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                    {Math.round((importProgress.current / importProgress.total) * 100)}%
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {importProgress && importProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300" 
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                    <span className="truncate max-w-[80%]">{importProgress.message || "Hazırlanır..."}</span>
                    <span>{importProgress.current} / {importProgress.total}</span>
                  </div>
                </div>
              )}

              {/* Real-time stats */}
              <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-semibold text-slate-500">
                <div className="bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <span className="text-[8px] text-slate-400 block font-normal leading-tight">Sifariş</span>
                  <span className="font-bold text-slate-800 font-mono text-[10px]">{importSummary.salesCount}</span>
                </div>
                <div className="bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <span className="text-[8px] text-slate-400 block font-normal leading-tight">Məhsul</span>
                  <span className="font-bold text-slate-800 font-mono text-[10px]">{importSummary.productsCount}</span>
                </div>
                <div className="bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <span className="text-[8px] text-slate-400 block font-normal leading-tight">Xərc</span>
                  <span className="font-bold text-slate-800 font-mono text-[10px]">{importSummary.expensesCount}</span>
                </div>
                <div className="bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <span className="text-[8px] text-slate-400 block font-normal leading-tight">Müştəri</span>
                  <span className="font-bold text-slate-800 font-mono text-[10px]">{importSummary.customersCount}</span>
                </div>
                <div className="bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <span className="text-[8px] text-slate-400 block font-normal leading-tight">Kuryer</span>
                  <span className="font-bold text-slate-800 font-mono text-[10px]">{importSummary.couriersCount}</span>
                </div>
              </div>

              {/* Dynamic Scrolling Log Terminal */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-sans">Sistem Yükləmə Jurnal Logu (Live Feed)</label>
                <div className="shrink-0 h-[170px] bg-slate-900 rounded-xl p-3 overflow-y-auto font-mono text-[9.5px] text-emerald-400 space-y-1 border border-slate-850 scrollbar-thin">
                  {importLogs.length === 0 ? (
                    <div className="text-slate-500 animate-pulse text-center pt-10">Məlumatlar analiz edilir və bazaya hazırlanır...</div>
                  ) : (
                    importLogs.map((logLine, idx) => (
                      <div key={idx} className="leading-relaxed border-b border-white/5 opacity-90 truncate hover:text-white transition-colors duration-150 text-left">
                        {logLine}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Conflicts viewer panels */}
          {importStatus === "verifying" && conflicts.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-amber-850">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="text-xs font-bold">Sinirləndirici Konfliktlər Tapıldı! ({conflicts.length})</span>
              </div>
              <p className="text-[10px] text-amber-700 leading-relaxed font-sans">Eyni nömrəli lakin fərqli yazılmış müştəri qeydləri aşkarlandı. Hansının saxlanılacağına qərar verin:</p>
              
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {conflicts.map(conf => (
                  <div key={conf.id} className="p-3 bg-white border border-amber-100 rounded-xl space-y-2 text-xs">
                    <div>
                      <span className="font-bold font-mono text-slate-500">Nömrə: {conf.phone}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <button 
                        onClick={() => handleSetConflictStrategy(conf.id, "keep")}
                        className={`p-2 border rounded-lg text-left transition-all ${
                          conflictSolutions[conf.id] === "keep" 
                            ? "border-indigo-600 bg-indigo-50 text-indigo-850 font-bold" 
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        Köhnəni saxla: <b className="block mt-0.5">{conf.dbName}</b>
                      </button>

                      <button 
                        type="button"
                        onClick={() => handleSetConflictStrategy(conf.id, "overwrite")}
                        className={`p-2 border rounded-lg text-left transition-all ${
                          conflictSolutions[conf.id] === "overwrite" 
                            ? "border-emerald-600 bg-emerald-50 text-emerald-850 font-bold" 
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        Yeni ilə əvəzlə: <b className="block mt-0.5">{conf.sheetName}</b>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleApplyImportLoad}
                className="w-full py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold"
              >
                Konfliktləri Həll Et və Yükləməyə Davam Et
              </button>
            </div>
          )}

          {/* Completed confirmation cards */}
          {importStatus === "resolved" && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-4 text-left">
              <div className="flex items-center gap-2 text-indigo-800">
                <FileCheck2 className="w-5 h-5 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-indigo-700">Workbook təhlili başa çatdı ✓</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center text-xs text-slate-500 font-semibold">
                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                  <span className="text-[9px] text-slate-400 block leading-tight">Sifariş</span>
                  <p className="mt-0.5 font-bold font-mono text-slate-800 text-[11px]">{importSummary.salesCount}</p>
                </div>
                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                  <span className="text-[9px] text-slate-400 block leading-tight">Məhsul</span>
                  <p className="mt-0.5 font-bold font-mono text-slate-800 text-[11px]">{importSummary.productsCount}</p>
                </div>
                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                  <span className="text-[9px] text-slate-400 block leading-tight">Xərc</span>
                  <p className="mt-0.5 font-bold font-mono text-slate-800 text-[11px]">{importSummary.expensesCount}</p>
                </div>
                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                  <span className="text-[9px] text-slate-400 block leading-tight">Müştəri</span>
                  <p className="mt-0.5 font-bold font-mono text-slate-800 text-[11px]">{importSummary.customersCount}</p>
                </div>
                <div className="bg-white p-2 rounded-xl border border-indigo-100">
                  <span className="text-[9px] text-slate-400 block leading-tight">Kuryer</span>
                  <p className="mt-0.5 font-bold font-mono text-slate-800 text-[11px]">{importSummary.couriersCount}</p>
                </div>
              </div>

              {/* 5 SƏTİR ÖNİZLƏMƏ (5-row preview) */}
              {validParsedData?.parsedSales?.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-705 block">Sifarişlər Sənəd Önizləməsi (İlk 5 Sətir)</span>
                    <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-md">Cəmi: {validParsedData.parsedSales.length} sətir</span>
                  </div>
                  <div className="overflow-x-auto border border-slate-150 rounded-xl">
                    <table className="w-full text-left border-collapse text-[10px] font-sans">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <th className="p-2">Tarix</th>
                          <th className="p-2">Müştəri Adı</th>
                          <th className="p-2">Telefon</th>
                          <th className="p-2">Ünvan</th>
                          <th className="p-2">Məhsul</th>
                          <th className="p-2">Miqdar</th>
                          <th className="p-2">Qiymət</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                        {validParsedData.parsedSales.slice(0, 5).map((row: any, i: number) => {
                          const getRowVal = (r: any, keys: string[]) => {
                            for (const k of keys) {
                              if (r[k] !== undefined && r[k] !== null) return r[k];
                              for (const rk of Object.keys(r)) {
                                if (rk.toLowerCase().trim() === k.toLowerCase().trim()) return r[rk];
                              }
                            }
                            return "—";
                          };
                          return (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="p-2 whitespace-nowrap">{String(getRowVal(row, ["Tarix", "date"]))}</td>
                              <td className="p-2 font-medium">{String(getRowVal(row, ["Müştəri Adı", "name"]))}</td>
                              <td className="p-2 font-mono">{String(getRowVal(row, ["Telefon", "phone"]))}</td>
                              <td className="p-2 max-w-[100px] truncate">{String(getRowVal(row, ["Ünvan", "address"]))}</td>
                              <td className="p-2 max-w-[100px] truncate">{String(getRowVal(row, ["Məhsul", "product"]))}</td>
                              <td className="p-2 font-mono text-center">{String(getRowVal(row, ["Miqdar", "qty"]))}</td>
                              <td className="p-2 font-semibold font-mono text-emerald-600">{String(getRowVal(row, ["Vahid Qiymət", "unitPrice"]))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Konflikt Həlli Strategiyası */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-bold text-slate-700 block text-left">Konflikt Həlli Strategiyası</span>
                
                <div className="grid grid-cols-2 gap-3 text-left">
                  <button
                    type="button"
                    onClick={() => setConflictStrategy("merge")}
                    className={`p-3 border rounded-xl flex flex-col gap-1 transition-all text-xs ${
                      conflictStrategy === "merge"
                        ? "border-indigo-500 bg-indigo-50/20 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className="font-bold text-slate-800">Yalnız yenilərini əlavə et</span>
                    <span className="text-[9px] text-slate-400">Default: Mövcud bazanı qoruyur, yeni daxil edilənləri əlavə edir.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConflictStrategy("overwrite")}
                    className={`p-3 border rounded-xl flex flex-col gap-1 transition-all text-xs ${
                      conflictStrategy === "overwrite"
                        ? "border-rose-500 bg-rose-50/20 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className="font-bold text-rose-750">Hər şeyi sil və yenidən yüklə ⚠️</span>
                    <span className="text-[9px] text-rose-455">Mövcud bütün müştəri, sifariş, kuryer və xərci təmizləyib yenidən daxil edir.</span>
                  </button>
                </div>

                {/* Red warning prompt */}
                {conflictStrategy === "overwrite" && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-[10px] text-rose-800 leading-relaxed font-semibold">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                    <span>DİQQƏT: Bu parametr seçildikdə verilənlər bazasındakı bütün mövcud sifarişlər, xərclər, müştərilər silinəcək və sənəddəki datalar sıfırdan bərpa ediləcək!</span>
                  </div>
                )}
              </div>

              <button 
                onClick={handleApplyImportLoad}
                className={`w-full py-3 text-white font-bold rounded-xl text-xs shadow-md transition-all ${
                  conflictStrategy === "overwrite"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-slate-900 hover:bg-black text-white"
                }`}
              >
                {conflictStrategy === "overwrite" ? "Məlumat Bazalarını TƏMİZLƏ və İdxalı Təsdiqlə" : "Məlumatları Sinxronlaşdır və Yadda Saxla"}
              </button>
            </div>
          )}

          {importStatus === "completed" && importFeedback && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3.5 text-left">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 animate-bounce shrink-0" />
                <span className="text-xs font-bold text-emerald-800">Sənədlər bazaya tam daxil edildi!</span>
              </div>
              
              <div className="bg-white p-3.5 rounded-xl border border-emerald-100/50 space-y-2 text-xs text-slate-650">
                <p className="font-bold text-slate-800 border-b border-slate-150 pb-1.5 mb-1 text-xs text-center">İdxal Hesabatı Xülasəsi</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>✓ Sifariş: <b>{importFeedback.importedSalesCount} sətir</b></div>
                  <div>✓ Xərc: <b>{importFeedback.importedExpensesCount} sətir</b></div>
                  <div>✓ Məhsul: <b>{importFeedback.importedProductsCount} sətir</b></div>
                  <div className="text-amber-700">⚠️ Uyğunsuzluq: <b>{importFeedback.mismatchCount}</b></div>
                </div>
              </div>

              <div className="flex gap-2.5">
                <button 
                  onClick={handleDownloadErrorReport}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-[10px] flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Xəta Hesabatını Yüklə
                </button>
                
                <button 
                  onClick={() => {
                    setImportStatus("idle");
                    setImportFeedback(null);
                    setValidParsedData(null);
                  }}
                  className="border border-slate-200 px-4 py-2 hover:bg-slate-50 text-slate-600 font-bold rounded-xl text-[10px]"
                >
                  Geri Dön
                </button>
              </div>
            </div>
          )}

          {importStatus === "failed" && importErrorDetails && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-4 text-left">
              <div className="flex items-start gap-2.5 text-rose-850">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-rose-900 block">{importErrorDetails.title}</span>
                  <p className="text-[10px] text-rose-700/90 mt-1 leading-relaxed font-sans">{importErrorDetails.desc}</p>
                </div>
              </div>

              {/* Actionable recommendations */}
              <div className="bg-white p-3.5 rounded-2xl border border-rose-100 space-y-2 text-xs text-slate-705">
                <p className="font-bold text-rose-800 border-b border-slate-100 pb-1.5 mb-1 text-xs">📌 Təklif Olunan Həll Yolları</p>
                <p className="text-[10px] leading-relaxed text-slate-600 font-sans">{importErrorDetails.solution}</p>
              </div>

              {/* Terminal Logs View */}
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-sans">Səhv Jurnal Logs (Terminal Feed)</label>
                <div className="shrink-0 h-[110px] bg-slate-900 rounded-xl p-3 overflow-y-auto font-mono text-[9px] text-rose-400 space-y-1 border border-slate-850 scrollbar-thin">
                  {importLogs.map((logLine, idx) => (
                    <div key={idx} className="leading-relaxed border-b border-white/5 opacity-80 truncate hover:text-white transition-colors duration-150 text-left">
                      {logLine}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5">
                <button 
                  onClick={() => {
                    setImportStatus("idle");
                    setImportErrorDetails(null);
                    setValidParsedData(null);
                  }}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-[10px] shadow-sm text-center"
                >
                  Yeni Fayl yüklə
                </button>
                
                <button 
                  onClick={handleApplyImportLoad}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-[10px]"
                >
                  Yenidən yoxla
                </button>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* 3. GOOGLE DRIVE BACKUP & RESTORE */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Google Drive™ Bulud Yedəkləmə (Backup & Restore)</h4>
              <p className="text-[10px] text-slate-400">JSON formatında sistem məlumatlarını Drive üzərində təhlükəsiz saxlayın və istədiyiniz vaxt bərpa edin</p>
            </div>
          </div>

          {!accessToken ? (
            <button 
              onClick={handleConnectGDrive}
              disabled={driveLoading}
              className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-2 hover:bg-black transition-all disabled:opacity-50 select-none cursor-pointer"
            >
              <CloudUpload className="w-4 h-4" /> Google Drive ilə Qoşul
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs font-bold text-slate-800 block">Sinxronizasiya Aktivdir</span>
                <span className="text-[10px] text-slate-400 block font-mono">👤 {driveUser?.email || "Bulud Hesabı"}</span>
              </div>
              <button 
                onClick={handleDisconnectGDrive}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                title="Bağlantını Kəs"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {accessToken && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="p-4 bg-emerald-50/70 border border-emerald-100 rounded-2xl flex items-start gap-3">
              <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold leading-none select-none">AKTİV</div>
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-800 block">Avtomatik Gün Sonu Yedəklənməsi</span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Sistem hər gün Bakı vaxtı ilə saat <strong>21:00-dan sonra (gün sonunda)</strong>, Google Drive bağlantınız aktiv olduqda arxa planda tamamilə avtomatik və səssiz şəkildə bütün məlumatlarınızı Google Drive buludunuza arxivləyib yükləyir.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-800 block">Cari Məlumatları Yedəklə</span>
                <p className="text-[10px] text-slate-400 max-w-md">Bütün sifarişlər, müştərilər, kuryer qeydləri, xərclər, elanlar və parametrləri tək bir JSON faylı olaraq buludda arxivləyin.</p>
              </div>
              <button
                onClick={handleCreateGDriveBackup}
                disabled={driveLoading}
                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4" /> Yeni Arxiv Yedəyi Yarat
              </button>
            </div>

            {driveStatusMsg && (
              <div className="text-xs font-semibold text-indigo-700 flex items-center gap-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50">
                <RefreshCw className={`w-3.5 h-3.5 ${driveLoading ? "animate-spin" : ""}`} />
                <span>{driveStatusMsg}</span>
              </div>
            )}

            <div className="space-y-2">
              <h5 className="font-bold text-slate-700 text-xs">Drive-dakı Bulud Yedək Nüsxələri:</h5>
              {driveBackups.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                  {driveLoading ? "Yedək siyahısı yüklənir..." : "Heç bir JSON yedək nüsxəsi tapılmadı. Yedək yaratmaq üçün yuxarıdakı düyməyə klikləyin."}
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                  {driveBackups.map((bk) => (
                    <div key={bk.id} className="p-3.5 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-105 bg-slate-100 text-slate-500 rounded-xl">
                          <FileJson className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-700 block truncate max-w-xs md:max-w-md" title={bk.name}>
                            {bk.name}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                            <Calendar className="w-3.5 h-3.5 text-slate-300" />
                            {new Date(bk.createdTime).toLocaleString("az-AZ")}
                            {bk.size && ` • ${(Number(bk.size) / 1024).toFixed(1)} KB`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRestoreFromDrive(bk.id, bk.name)}
                          disabled={driveLoading}
                          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold rounded-lg text-[10px] flex items-center gap-1 transition-all"
                          title="Sistemə Bərpa Et"
                        >
                          <CloudDownload className="w-3.5 h-3.5" /> Bərpa Et
                        </button>
                        <button
                          onClick={() => handleDeleteGDriveBackup(bk.id, bk.name)}
                          disabled={driveLoading}
                          className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-all"
                          title="Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. GOOGLE CALENDAR INTEGRATION */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Google Calendar™ İnteqrasiyası (Calendar Sync)</h4>
              <p className="text-[10px] text-slate-400">Bütün qeydə alınmış köhnə və yeni sifarişləri tarixlərinə görə Google Təqviminizə sinxronizasiya edin</p>
            </div>
          </div>

          {!googleAccessToken ? (
            <button 
              onClick={handleConnectCalendar}
              disabled={calendarLoading}
              className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-2 hover:bg-black transition-all disabled:opacity-50 select-none cursor-pointer"
            >
              <Calendar className="w-4 h-4" /> Google Calendar-a Qoşul
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs font-bold text-emerald-600 block">Təqvim Sinxronizasiyası Hazırdır</span>
                <span className="text-[10px] text-slate-400 block font-mono">👤 {driveUser?.email || "Bulud Hesabı"}</span>
              </div>
              <button 
                onClick={handleDisconnectGDrive}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                title="Sinxronizasiyanı Kəs"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {googleAccessToken && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-800 block">Sifarişləri Təqvimə Sinxronizasiya Et</span>
                <p className="text-[10px] text-slate-400 max-w-md">Bütün köhnə və mövcud sistem daxilindəki sifarişləri müvafiq yaradılma tarixlərinə görə Google Təqviminizə (all-day event və ya saatlı cədvəl kimi) yazın.</p>
              </div>
              <button
                onClick={handleSyncAllSales}
                disabled={calendarLoading}
                className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${calendarLoading ? "animate-spin" : ""}`} /> Bütün Sifarişləri Sinxronizasiya Et
              </button>
            </div>

            {calendarStatusMsg && (
              <div className="text-xs flex flex-col gap-2 bg-amber-50/50 p-3 rounded-xl border border-amber-100/50 text-amber-800">
                <div className="flex items-center gap-2 font-semibold">
                  <RefreshCw className={`w-3.5 h-3.5 ${calendarLoading ? "animate-spin" : ""}`} />
                  <span>{calendarStatusMsg}</span>
                </div>
                {calendarSyncProgress && (
                  <div className="w-full bg-amber-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full transition-all duration-150" 
                      style={{ width: `${(calendarSyncProgress.current / calendarSyncProgress.total) * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. GOOGLE CONTACTS INTEGRATION */}
      <div id="settings_google_contacts" className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Google Contacts™ İnteqrasiyası (Contacts Sync)</h4>
              <p className="text-[10px] text-slate-400">Bütün qeydə alınmış kənar və yeni əlavə olunan müştəriləri Google Contacts siyahısı ilə sinxronizasiya edin</p>
            </div>
          </div>

          {!googleAccessToken ? (
            <button 
              onClick={handleConnectCalendar}
              disabled={calendarLoading || contactsLoading}
              className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-2 hover:bg-black transition-all disabled:opacity-50 select-none cursor-pointer"
            >
              <Users className="w-4 h-4" /> Google Contacts-a Qoşul
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs font-bold text-emerald-600 block">Əlaqə Sinxronizasiyası Hazırdır</span>
                <span className="text-[10px] text-slate-400 block font-mono">👤 {driveUser?.email || "Bulud Hesabı"}</span>
              </div>
              <button 
                onClick={handleDisconnectGDrive}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                title="Sinxronizasiyanı Kəs"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {googleAccessToken && (
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-800 block">Müştəriləri Google Contacts-a Sinxronizasiya Et</span>
                <p className="text-[10px] text-slate-400 max-w-md">Bütün daxili sistemdə qeydiyyatdan keçən müştəriləri ad və telefon kütlələri ilə Google Contacts siyahınıza əlavə edin / yeniləyin.</p>
              </div>
              <button
                onClick={handleSyncAllCustomers}
                disabled={contactsLoading}
                className="w-full sm:w-auto px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${contactsLoading ? "animate-spin" : ""}`} /> Bütün Müştəriləri Sinxronizasiya Et
              </button>
            </div>

            {contactsStatusMsg && (
              <div className="text-xs flex flex-col gap-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50 text-indigo-800">
                <div className="flex items-center gap-2 font-semibold">
                  <RefreshCw className={`w-3.5 h-3.5 ${contactsLoading ? "animate-spin" : ""}`} />
                  <span>{contactsStatusMsg}</span>
                </div>
                {contactsSyncProgress && (
                  <div className="w-full bg-indigo-100 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-150" 
                      style={{ width: `${(contactsSyncProgress.current / contactsSyncProgress.total) * 100}%` }}
                    ></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5A. TELEGRAM BOT CREDENTIALS */}
      <div id="settings_telegram_credentials" className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
            <Send className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Telegram Bot Kanalları & API Tənzimləmələri</h4>
            <p className="text-[10px] text-slate-400">Telegram hesabatı və status bildirişləri üçün öz botunuzu konfiqurasiya edin</p>
          </div>
        </div>

        <form onSubmit={handleSaveTelegramSettings} className="space-y-4 text-xs">
          <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100">
            💡 <b>Fərdi Bot daxil edilmədikdə:</b> Sistem fəaliyyətini standart Ayvel diaqnostika kanalı (Bot tərəfdaşımız) ilə davam etdirəcəkdir. Öz müştərilərinizə aid bildirişləri xüsusi qrupda almaq istəyirsinizsə, aşağıda öz Telegram Bot Token və Chat ID-nizi qeyd edin.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Telegram Bot Token (API Token)</label>
              <input 
                type="text"
                placeholder="Məs: 8774875697:AAEfnXAQqUWgY1fGqV..."
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 font-mono text-xs shadow-inner"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Telegram Chat ID (Hədəf Qrup)</label>
              <input 
                type="text"
                placeholder="Məs: -1004561234567"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 font-mono text-xs shadow-inner"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <span className="text-[10px] text-amber-600 font-medium">
              ⚠️ <b>Vacib:</b> Dəyişikliyi yadda saxladıqdan sonra aşağıdakı bölmədə "Bağlantını Yoxla" düyməsi ilə bağlantı fəallığını yoxlayın.
            </span>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end font-sans">
              {telegramSaveMessage && (
                <span className={`text-xs font-semibold ${telegramSaveMessage.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>
                  {telegramSaveMessage}
                </span>
              )}
              <button
                type="submit"
                disabled={isSavingTelegram}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 select-none cursor-pointer"
              >
                {isSavingTelegram ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Konfiqurasiyanı Yadda Saxla
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 5B. TELEGRAM BOT DIAGNOSTICS */}
      <div id="settings_telegram_diagnostics" className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Telegram Bot Diaqnostikası (Bot Status & Logs)</h4>
              <p className="text-[10px] text-slate-400">Telegram botunun bağlantısını yoxlayın, sınaq mesajı göndərin və xətaları canlı izləyin</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRunBotCheck}
              disabled={checkingConnection}
              className="px-4 py-2 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 select-none cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingConnection ? "animate-spin" : ""}`} /> Bağlantını Yoxla
            </button>

            <button
              onClick={handleSendTestMessage}
              disabled={sendingTest}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 select-none cursor-pointer"
            >
              <Send className={`w-3.5 h-3.5 ${sendingTest ? "animate-pulse" : ""}`} /> Sınaq Mesajı Göndər
            </button>

            <button
               onClick={handleSendReportTest}
               disabled={sendingReportTest}
               className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 select-none cursor-pointer"
             >
               <FileText className={`w-3.5 h-3.5 ${sendingReportTest ? "animate-pulse" : ""}`} /> Gün Sonu Hesabat Testi
             </button>

             <button
               onClick={handleTriggerManualSync}
               disabled={syncingTelegram}
               className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 select-none cursor-pointer"
             >
               <RefreshCw className={`w-3.5 h-3.5 ${syncingTelegram ? "animate-spin" : ""}`} /> Sifarişləri İndi Yoxla
             </button>
           </div>
         </div>
 
         {/* Diagnostic Results Feedback UI */}
         {(connectionResult || testResult || reportTestResult || syncResult) && (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
             {syncResult && (
               <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-1.5 ${
                 syncResult.success ? "bg-emerald-50/50 border-emerald-150 text-emerald-800" : "bg-rose-50/50 border-rose-150 text-rose-800"
               }`}>
                 <div className="flex items-center gap-2 font-bold">
                   {syncResult.success ? (
                     <CheckCircle className="w-4 h-4 text-emerald-600" />
                   ) : (
                     <ShieldAlert className="w-4 h-4 text-rose-600" />
                   )}
                   <span>Telegram Sifariş Yoxlanışı:</span>
                 </div>
                 {syncResult.success ? (
                   <div>
                     <span className="block font-medium">✓ Telegram yazılı sifariş qeydləri müvəffəqiyyətlə yoxlanıldı.</span>
                     <ul className="list-disc pl-4 mt-1.5 space-y-0.5 text-slate-700">
                       <li>Yeni Qeydə Alınan: <b>{syncResult.processedCount}</b></li>
                       <li>Dublikat / Keçilmiş: <b>{syncResult.duplicatedCount}</b></li>
                     </ul>
                     {syncResult.info && <span className="block text-[10px] text-slate-500 mt-2 font-mono">Qeyd: {syncResult.info}</span>}
                   </div>
                 ) : (
                   <div>
                     <span className="block font-medium">❌ Yoxlama zamanı xəta baş verdi:</span>
                     <span className="font-mono bg-rose-100/50 px-1.5 py-0.5 rounded text-[10px] break-all">{syncResult.error}</span>
                   </div>
                 )}
               </div>
             )}
            {connectionResult && (
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-1.5 ${
                connectionResult.success ? "bg-emerald-50/50 border-emerald-150 text-emerald-800" : "bg-rose-50/50 border-rose-150 text-rose-800"
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  {connectionResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                  )}
                  <span>Bot Bağlantı Statusu:</span>
                </div>
                {connectionResult.success ? (
                  <div>
                    <span className="block font-medium">✓ Bot uğurla tapıldı və işlək vəziyyətdədir.</span>
                    <span className="font-mono bg-emerald-100/50 px-1.5 py-0.5 rounded text-[10px]">İstifadəçi Adı: @{connectionResult.botName}</span>
                  </div>
                ) : (
                  <div>
                    <span className="block font-medium">❌ API ilə əlaqə qurularkən xəta baş verdi:</span>
                    <span className="font-mono bg-rose-100/50 px-1.5 py-0.5 rounded text-[10px] break-all">{connectionResult.error}</span>
                    <p className="text-[10px] text-rose-700 mt-2 font-sans leading-tight">💡 <b>Tövsiyə olunan həll:</b> Bot Tokeninizi yenidən yoxlayın və ya Telegram serverinin bloklanmadığından əmin olun.</p>
                  </div>
                )}
              </div>
            )}

            {testResult && (
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-1.5 ${
                testResult.success ? "bg-emerald-50/50 border-emerald-150 text-emerald-800" : "bg-rose-50/50 border-rose-150 text-rose-800"
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  {testResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                  )}
                  <span>Sınaq Mesajı Nəticəsi:</span>
                </div>
                {testResult.success ? (
                  <div>
                    <span className="block font-medium">✓ Sınaq mesajı uğurla göndərildi və qəbul edildi!</span>
                    <span className="font-mono bg-emerald-100/50 px-1.5 py-0.5 rounded text-[10px]">Mesaj ID: {testResult.messageId}</span>
                  </div>
                ) : (
                  <div>
                    <span className="block font-medium">❌ Göndərilmə alınmadı:</span>
                    <span className="font-mono bg-rose-100/50 px-1.5 py-0.5 rounded text-[10px] break-all">{testResult.error}</span>
                    <p className="text-[10px] text-rose-700 mt-2 font-sans leading-tight">💡 <b>Tövsiyə olunan həll:</b> Botun hədəf Telegram qrupunda <b>Admin</b> statusda olduğunu və mesaj göndərmə icazəsinin aktiv edildiyini yoxlayın. (Chat ID düzgünlüyünü dəqiqləşdirin).</p>
                  </div>
                )}
              </div>
            )}

            {reportTestResult && (
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed space-y-1.5 ${
                reportTestResult.success ? "bg-emerald-50/50 border-emerald-150 text-emerald-800" : "bg-rose-50/50 border-rose-150 text-rose-800"
              }`}>
                <div className="flex items-center gap-2 font-bold">
                  {reportTestResult.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                  )}
                  <span>Hesabat Sınaq Nəticəsi:</span>
                </div>
                {reportTestResult.success ? (
                  <div>
                    <span className="block font-medium">✓ Sınaq gün sonu hesabatı və analitikası uğurla tərtib edilib Telegram qrupuna göndərildi!</span>
                  </div>
                ) : (
                  <div>
                    <span className="block font-medium">❌ Hesabat hazırlanmadı və ya göndərilmədi:</span>
                    <span className="font-mono bg-rose-100/50 px-1.5 py-0.5 rounded text-[10px] break-all">{reportTestResult.error}</span>
                    <p className="text-[10px] text-rose-700 mt-2 font-sans leading-tight">💡 <b>Tövsiyə olunan həll:</b> Firebase Verilənlər Bazasında 'sales' və 'expenses' kolleksiyalarında məlumat olduğundan və tənzimlənmiş qrup ID-sinin düzgünlüyündən əmin olun.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live Diagnostics Log Log Feed */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-sans">Telegram Sorğuları və Xətaları Jurnalı (Son 15 Log)</label>
          {telegramLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-2xl">
              Hələ fəal Telegram bildiriş və ya diaqnostika qeydi mövcud deyil. Sifariş statusunu dəyişdikdə və ya sınaq mesajı göndərdikdə burada loglar görünəcək.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="p-3">Tarix / Saat</th>
                    <th className="p-3">Əməliyyat</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Sifariş №</th>
                    <th className="p-3">Məlumat / Xəta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {telegramLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 whitespace-nowrap text-[11px] font-mono text-slate-400">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString("az-AZ") : "N/A"}
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{log.action || "N/A"}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 inline-block text-[10px] font-bold uppercase rounded-lg ${
                          log.status === "success" 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50" 
                            : "bg-rose-50 text-rose-700 border border-rose-200/50"
                        }`}>
                          {log.status === "success" ? "✓ Uğurlu" : "⚠️ Xətalı"}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap font-mono text-slate-700 bg-slate-50/40">{log.orderNumber || "TEST"}</td>
                      <td className="p-3 leading-relaxed max-w-xs break-words font-sans">
                        <p className={log.status === "success" ? "text-slate-600" : "text-rose-600 font-medium"}>
                          {log.details}
                        </p>
                        {log.error && (
                          <span className="block font-mono text-[10px] text-rose-500 bg-rose-50 p-1.5 mt-1 rounded border border-rose-100 truncate" title={log.error}>
                            Xəta: {log.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 6. KOOLD DATA MIGRATION (500+ MERGES) */}
      <div id="settings_migration" className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <RefreshCw className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">🔀 Köhnə Data Miqrasiyası (500+ qeyd birləşdirilməsi)</h4>
              <p className="text-[10px] text-slate-400">Eyni müştəri adı + eyni tarix + eyni ünvan üzrə olan təkrar satış qeydlərini bir ümumi səbətə birləşdirin və formatlı nömrələyin</p>
            </div>
          </div>

          <button 
            onClick={runDataMigration}
            disabled={isMigrating}
            className="px-4.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 select-none cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isMigrating ? "animate-spin" : ""}`} /> 
            {isMigrating ? "Miqrasiya aparılır..." : "Miqrasiyanı Başlat"}
          </button>
        </div>
      </div>

      {/* 4. DANGER RISK ZONE */}
      <div className="bg-red-50/40 p-5 rounded-3xl border border-red-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <span className="px-2 py-0.5 bg-rose-600 text-white font-extrabold text-[9px] uppercase tracking-wider rounded">Risk Sahəsi (Risk)</span>
          <h4 className="font-bold text-slate-800 text-sm mt-1.5ClassName">Bütün Məlumatların Tam Təmizlənməsi</h4>
          <p className="text-xs text-slate-400 leading-relaxed font-sans">Layihə daxilindəki bütün kuryer, kassa, sifariş və anbar məlumatlarını birdəfəlik məhv edir.</p>
        </div>

        <button 
          onClick={handleSystemWipeRisk}
          className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 hover:shadow-md transition-all whitespace-nowrap"
        >
          <Trash2 className="w-4 h-4" /> Bazasını Tam Sıfırla
        </button>
      </div>

    </div>
  );
}
