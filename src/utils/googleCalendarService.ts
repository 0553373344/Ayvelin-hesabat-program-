import { Sale } from "../types";

/**
 * Syncs a single Sale (order) to Google Calendar.
 * If this Sale has a Google Calendar event ID already, it updates the existing event.
 * If not, or if that event was deleted, it creates a new calendar event.
 * 
 * Returns the created or updated calendar event ID.
 */
export async function syncSaleToGoogleCalendar(sale: Sale, accessToken: string): Promise<string | null> {
  let start: { dateTime?: string; date?: string; timeZone?: string } = {};
  let end: { dateTime?: string; date?: string; timeZone?: string } = {};
  const parsedDate = new Date(sale.createdAt);

  if (!isNaN(parsedDate.getTime())) {
    // Check if the timestamp contains a specific hour/time.
    // Excel/Import formats might only contain dates like 'YYYY-MM-DD'.
    const hasTime = sale.createdAt.includes("T") || (sale.createdAt.includes(":") && sale.createdAt.length > 10);
    if (hasTime) {
      start = { 
        dateTime: parsedDate.toISOString(),
        timeZone: "Asia/Baku"
      };
      end = { 
        dateTime: new Date(parsedDate.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour duration
        timeZone: "Asia/Baku"
      };
    } else {
      // Create an all-day event
      const yyyy = parsedDate.getFullYear();
      const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
      const dd = String(parsedDate.getDate()).padStart(2, "0");

      // For all-day events, the end date is exclusive (next day)
      const nextDate = new Date(parsedDate.getTime() + 24 * 60 * 60 * 1000);
      const nyyyy = nextDate.getFullYear();
      const nmm = String(nextDate.getMonth() + 1).padStart(2, "0");
      const ndd = String(nextDate.getDate()).padStart(2, "0");

      start = { date: `${yyyy}-${mm}-${dd}` };
      end = { date: `${nyyyy}-${nmm}-${ndd}` };
    }
  } else {
    // Fallback to today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tyyyy = tomorrow.getFullYear();
    const tmm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const tdd = String(tomorrow.getDate()).padStart(2, "0");

    start = { date: `${yyyy}-${mm}-${dd}` };
    end = { date: `${tyyyy}-${tmm}-${tdd}` };
  }

  const itemsDesc = sale.items
    .map((item) => `${item.productName} (${item.qty} ədəd)`)
    .join(", ");

  const carrier = 
    sale.deliveryType === "courier" 
      ? (sale.courierName || "Kuryer") 
      : (sale.cargoCompany || "Kargo/Expargo");

  const summary = `🛒 Sifariş #${sale.orderNumber} — ${sale.customerName}`;
  const description = [
    `👤 Müştəri: ${sale.customerName}`,
    `📞 Telefon: ${sale.customerPhone}`,
    `📍 Ünvan: ${sale.address || "Qeyd edilməyib"}`,
    `📦 Məhsullar: ${itemsDesc}`,
    `🚚 Çatdırılma: ${carrier} (${sale.deliveryCost} AZN)`,
    `💰 Məbləğ: ${sale.totalAmount} AZN`,
    `⚡ Status: ${sale.status.toUpperCase()}`,
    `💳 Ödəniş: ${sale.paymentStatus}`,
    `📝 Qeydlər: ${sale.notes || "Heç bir qeyd yoxdur."}`,
    `🕒 Yaradılma Tarixi: ${sale.createdAt}`
  ].join("\n");

  const body = {
    summary,
    location: sale.address || "Ünvan yoxdur",
    description,
    start,
    end,
    colorId: sale.status === "çatdırılıb" ? "10" : sale.status === "ləğv edilib" ? "11" : "5", // 10 is green, 11 is red, 5 is yellow
    reminders: {
      useDefault: true
    }
  };

  const calendarEventId = (sale as any).googleCalendarEventId;
  let url = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  let method = "POST";

  if (calendarEventId) {
    url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`;
    method = "PUT";
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      // If the event was deleted on Google Calendar web side, updating with PUT returns 404.
      // In that case, fall back to POST (creation) as a new event.
      if (response.status === 404 && method === "PUT") {
        const createResponse = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (createResponse.ok) {
          const resJson = await createResponse.json();
          return resJson.id;
        }
      }
      throw new Error(`Google Calendar API error: ${response.status} ${response.statusText}`);
    }

    const resJson = await response.json();
    return resJson.id;
  } catch (error) {
    console.error(`Error syncing sale #${sale.orderNumber} to Google Calendar:`, error);
    throw error;
  }
}

/**
 * Deletes a Sale event from Google Calendar using the token.
 */
export async function deleteSaleFromGoogleCalendar(calendarEventId: string, accessToken: string): Promise<void> {
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${calendarEventId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Calendar API delete error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error deleting calendar event:", error);
  }
}

/**
 * Bulk syncs an array of Sales to Google Calendar.
 * Returns progress data and counts of successes/failures.
 */
export async function syncAllSalesToGoogleCalendar(
  sales: Sale[],
  accessToken: string,
  onProgress?: (progress: { current: number; total: number; orderNumber: string }) => void
): Promise<{ successCount: number; errorCount: number; updatedSales: { saleId: string; calendarEventId: string }[] }> {
  let successCount = 0;
  let errorCount = 0;
  const updatedSales: { saleId: string; calendarEventId: string }[] = [];

  // Sort sales to sync in order
  const sortedSales = [...sales].sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

  for (let i = 0; i < sortedSales.length; i++) {
    const sale = sortedSales[i];
    if (onProgress) {
      onProgress({ current: i + 1, total: sortedSales.length, orderNumber: sale.orderNumber });
    }

    try {
      const eventId = await syncSaleToGoogleCalendar(sale, accessToken);
      if (eventId) {
        successCount++;
        updatedSales.push({ saleId: sale.id, calendarEventId: eventId });
      } else {
        errorCount++;
      }
    } catch (err) {
      console.error(`Failed to sync bulk sale #${sale.orderNumber}:`, err);
      errorCount++;
    }

    // Small sleep to evade high hitting rate-limiters
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { successCount, errorCount, updatedSales };
}
