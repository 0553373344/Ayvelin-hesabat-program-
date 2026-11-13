/**
 * Formats an order number to ensure it has exactly one '#' character at the start.
 */
export function formatDisplayOrderNumber(num: string | number | undefined | null): string {
  if (num === undefined || num === null) return "";
  let s = String(num).trim();
  
  // Strip any duplicate hashes at the start, then prepend exactly one.
  s = s.replace(/^#+/, "");
  return `#${s}`;
}

/**
 * Normalizes an order number for database storage to be #AYV-YYMMDD-HHMM format.
 * If it doesn't have #AYV- start, this function can sanitize it.
 */
export function cleanOrderNumberForDb(num: string | number | undefined | null): string {
  if (num === undefined || num === null) return "";
  let s = String(num).trim();
  s = s.replace(/^#+/, "");
  return `#${s}`;
}

/**
 * Generates an order number in #AYV-YYMMDD-HHMM format based on Azerbaijan (Baku) local time.
 * If multiple orders exist in the same minute, it appends sequence suffixes (e.g. -1, -2).
 */
export function generateDateTimeOrderNumber(
  createdAtStr: string | undefined, 
  existingSales: Array<{ orderNumber: string }>
): string {
  const dateObj = createdAtStr ? new Date(createdAtStr) : new Date();
  
  let minKey = "";
  try {
    // Format to YYMMDD-HHMM in Asia/Baku (Azerbaijan) timezone
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
    // Fallback to local time values if Intl fails
    const yy = String(dateObj.getFullYear()).slice(-2);
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const min = String(dateObj.getMinutes()).padStart(2, "0");
    minKey = `${yy}${mm}${dd}-${hh}${min}`;
  }

  const basePattern = `#AYV-${minKey}`;
  
  // Find all matches that start with this base pattern
  const matches = existingSales.filter(s => {
    if (!s || !s.orderNumber) return false;
    // Normalize comparison by stripping potential double hashes
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

/**
 * Converts any timestamp, Date, or string to "YYYY-MM-DD" in Asia/Baku (Azerbaijan) timezone.
 */
export function formatToBakuYMD(dateInput: any): string {
  if (!dateInput) return "";
  if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  let dateObj: Date;
  if (dateInput && typeof dateInput.toDate === "function") {
    try {
      dateObj = dateInput.toDate();
    } catch {
      return "";
    }
  } else if (dateInput && typeof dateInput.seconds === "number") {
    dateObj = new Date(dateInput.seconds * 1000);
  } else if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else {
    dateObj = new Date(dateInput);
  }

  if (isNaN(dateObj.getTime())) return "";

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(dateObj);
  } catch {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Baku timezone.
 */
export function getBakuTodayYMD(): string {
  return formatToBakuYMD(new Date());
}

/**
 * Returns year, month (1-12), day, hour, minute, and dayOfWeek (0=Sun..6=Sat) in Asia/Baku timezone.
 */
export function getBakuDateParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10), // 1-12
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    dayOfWeek: weekdayMap[map.weekday] ?? 0
  };
}

/**
 * Calculates start and end bounds in YYYY-MM-DD in Asia/Baku timezone for various standard period names.
 */
export function getBakuDateRange(period: string): {
  start: string;
  end: string;
  compStart: string;
  compEnd: string;
} {
  const parts = getBakuDateParts();
  const todayYMD = getBakuTodayYMD();

  // Anchor to noon UTC for this calendar day to safely perform daily shifts
  const bakuAnchor = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));

  const shiftDays = (days: number): string => {
    const d = new Date(bakuAnchor.getTime() + days * 86400000);
    return formatToBakuYMD(d);
  };

  let startStr = "";
  let endStr = "";
  let compStartStr = "";
  let compEndStr = "";

  switch (period) {
    case "Bu gün": {
      startStr = todayYMD;
      endStr = todayYMD;
      compStartStr = shiftDays(-1);
      compEndStr = shiftDays(-1);
      break;
    }

    case "Son 3 gün": {
      startStr = shiftDays(-2);
      endStr = todayYMD;
      compStartStr = shiftDays(-5);
      compEndStr = shiftDays(-3);
      break;
    }

    case "Son 1 Həftə": {
      startStr = shiftDays(-6);
      endStr = todayYMD;
      compStartStr = shiftDays(-13);
      compEndStr = shiftDays(-7);
      break;
    }

    case "Bu həftə": {
      // Monday to today in Baku
      const dayDiff = parts.dayOfWeek === 0 ? -6 : 1 - parts.dayOfWeek;
      startStr = shiftDays(dayDiff);
      endStr = todayYMD;
      compStartStr = shiftDays(dayDiff - 7);
      compEndStr = shiftDays(dayDiff - 1);
      break;
    }

    case "Bu ay": {
      const mm = String(parts.month).padStart(2, "0");
      startStr = `${parts.year}-${mm}-01`;
      const lastDay = new Date(parts.year, parts.month, 0).getDate();
      endStr = `${parts.year}-${mm}-${String(lastDay).padStart(2, "0")}`;

      let prevYear = parts.year;
      let prevMonth = parts.month - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      const prevMM = String(prevMonth).padStart(2, "0");
      const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
      compStartStr = `${prevYear}-${prevMM}-01`;
      compEndStr = `${prevYear}-${prevMM}-${String(prevLastDay).padStart(2, "0")}`;
      break;
    }

    case "Öncəki ay":
    case "Keçən Ay": {
      let prevYear = parts.year;
      let prevMonth = parts.month - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      const prevMM = String(prevMonth).padStart(2, "0");
      const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
      startStr = `${prevYear}-${prevMM}-01`;
      endStr = `${prevYear}-${prevMM}-${String(prevLastDay).padStart(2, "0")}`;

      let compYear = prevYear;
      let compMonth = prevMonth - 1;
      if (compMonth === 0) {
        compMonth = 12;
        compYear -= 1;
      }
      const compMM = String(compMonth).padStart(2, "0");
      const compLastDay = new Date(compYear, compMonth, 0).getDate();
      compStartStr = `${compYear}-${compMM}-01`;
      compEndStr = `${compYear}-${compMM}-${String(compLastDay).padStart(2, "0")}`;
      break;
    }

    case "Son 3 ay":
    case "Son 3ay": {
      const dStart = new Date(parts.year, parts.month - 1 - 3, parts.day);
      startStr = formatToBakuYMD(dStart);
      endStr = todayYMD;

      const dCompStart = new Date(parts.year, parts.month - 1 - 6, parts.day);
      const dCompEnd = new Date(dStart.getTime() - 86400000);
      compStartStr = formatToBakuYMD(dCompStart);
      compEndStr = formatToBakuYMD(dCompEnd);
      break;
    }

    case "Son 6 ay":
    case "Son 6ay": {
      const dStart = new Date(parts.year, parts.month - 1 - 6, parts.day);
      startStr = formatToBakuYMD(dStart);
      endStr = todayYMD;

      const dCompStart = new Date(parts.year, parts.month - 1 - 12, parts.day);
      const dCompEnd = new Date(dStart.getTime() - 86400000);
      compStartStr = formatToBakuYMD(dCompStart);
      compEndStr = formatToBakuYMD(dCompEnd);
      break;
    }

    case "Bu il": {
      startStr = `${parts.year}-01-01`;
      endStr = `${parts.year}-12-31`;
      compStartStr = `${parts.year - 1}-01-01`;
      compEndStr = `${parts.year - 1}-12-31`;
      break;
    }

    case "Ötən il": {
      startStr = `${parts.year - 1}-01-01`;
      endStr = `${parts.year - 1}-12-31`;
      compStartStr = `${parts.year - 2}-01-01`;
      compEndStr = `${parts.year - 2}-12-31`;
      break;
    }

    case "Bütün dövrlər":
    default:
      startStr = "0000-01-01";
      endStr = "9999-12-31";
      compStartStr = "";
      compEndStr = "";
      break;
  }

  return { start: startStr, end: endStr, compStart: compStartStr, compEnd: compEndStr };
}

function parseSafeDateString(d: any): string {
  if (!d) return "";
  if (typeof d.toDate === "function") {
    try {
      return d.toDate().toISOString();
    } catch (_) {}
  }
  if (d instanceof Date) {
    return d.toISOString();
  }
  if (typeof d === "string") {
    return d;
  }
  try {
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch (_) {}
  return "";
}

/**
 * Determines the relevant date of an order for tracking or operational status checks (raw ISO or string).
 */
export function getOrderTrackingDate(sale: any): string {
  const d = sale.order_date || sale.order_created_at || sale.createdAt || "";
  return parseSafeDateString(d);
}

/**
 * Determines the relevant date of an order for financial reporting of delivered items (raw ISO or string).
 */
export function getOrderReportingDate(sale: any): string {
  if (sale.status === "çatdırılıb") {
    const d = sale.delivery_date || sale.deliveredAt;
    if (d) return parseSafeDateString(d);
  }
  const d = sale.order_date || sale.order_created_at || sale.createdAt || "";
  return parseSafeDateString(d);
}

/**
 * Determines the order's tracking/creation date in YYYY-MM-DD format (Asia/Baku timezone).
 */
export function getOrderTrackingDateYMD(sale: any): string {
  if (!sale) return "";
  const d = sale.order_date || sale.order_created_at || sale.createdAt || "";
  return formatToBakuYMD(d);
}

/**
 * Determines the order's reporting/delivery date in YYYY-MM-DD format (Asia/Baku timezone).
 */
export function getOrderReportingDateYMD(sale: any): string {
  if (!sale) return "";
  if (sale.status === "çatdırılıb") {
    const d = sale.delivery_date || sale.deliveredAt;
    if (d) return formatToBakuYMD(d);
  }
  const d = sale.order_date || sale.order_created_at || sale.createdAt || "";
  return formatToBakuYMD(d);
}


