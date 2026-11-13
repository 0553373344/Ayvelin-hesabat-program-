import { db } from "./src/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

async function run() {
  const logsRef = collection(db, "telegram_logs");
  const q = query(logsRef, where("orderNumber", "==", "#AYV-260710-0847"));
  const snapshot = await getDocs(q);

  snapshot.docs.forEach(doc => console.log(doc.data()));
}

run().catch(console.error);
