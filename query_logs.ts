import { db } from "./src/firebase";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";

async function run() {
  const logsRef = collection(db, "telegram_logs");
  const q = query(logsRef, orderBy("timestamp", "desc"), limit(20));
  const snapshot = await getDocs(q);
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.orderNumber === "#AYV-260710-0847") {
      console.log(data);
    }
  }
}
run().catch(console.error);
