/**
 * Automatically formats any input phone number to the standard 0XXXXXXXXX format.
 * Examples:
 * +994553373344   →  0553373344
 * 994553373344    →  0553373344
 * (055) 337-33-44 →  0553373344
 * 055 337 33 44   →  0553373344
 * 055-337-33-44   →  0553373344
 * 0553373344      →  0553373344
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return "";
  
  // Keep only digits
  let digits = phone.replace(/\D/g, "");
  
  // Handlers for Azerbaijan phone code structures
  if (digits.startsWith("994")) {
    digits = "0" + digits.substring(3);
  } else if (!digits.startsWith("0")) {
    if (digits.length === 9) {
      digits = "0" + digits;
    }
  }
  
  return digits;
}
