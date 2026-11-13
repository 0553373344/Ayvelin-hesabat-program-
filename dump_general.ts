import { db } from "./src/firebase";
import { doc, getDoc } from "firebase/firestore";

async function run() {
  const docSnap = await getDoc(doc(db, "settings", "general"));
  console.log(docSnap.data());
}

run().catch(console.error);
