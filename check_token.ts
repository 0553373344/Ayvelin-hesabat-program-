import dotenv from "dotenv";
dotenv.config();
import { db } from "./src/firebase";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const settingsDoc = await getDoc(doc(db, "settings", "general"));
  const data = settingsDoc.data();
  console.log("telegramBotToken:", data?.telegramBotToken);
  console.log("telegramChatId:", data?.telegramChatId);
  
  const fallbackDoc = await getDoc(doc(db, "settings", "telegram_owner"));
  const fallbackData = fallbackDoc.data();
  console.log("telegram_owner botToken:", fallbackData?.telegramBotToken);
}

run().catch(console.error);
