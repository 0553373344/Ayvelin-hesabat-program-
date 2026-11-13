import { useState, useEffect, useMemo } from "react";
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc,
  getDocs,
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  Timestamp 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { DeliveryProvider, DeliveryBranch, DeliveryTariff, DeliveryRecord } from "../types";

// Helper to determine zone name by region
export function getZoneNameByRegion(region: string, provider: "expargo" | "azerpost"): string {
  const norm = region.toLowerCase().trim();
  if (norm.includes("naxç") || norm.includes("naxc") || norm.includes("nakhchivan")) {
    return "Naxçıvan";
  }
  if (provider === "expargo") {
    if (norm.includes("bakı") || norm.includes("baku") || norm.includes("yasamal") || norm.includes("nərimanov") || norm.includes("xətai") || norm.includes("binəqədi") || norm.includes("nizami") || norm.includes("səbail") || norm.includes("suraxanı") || norm.includes("səb") || norm.includes("sabunçu") || norm.includes("qaradağ")) {
      return "Bakı şəhər daxili";
    }
    if (norm.includes("abşeron") || norm.includes("absheron") || norm.includes("sumqayıt") || norm.includes("sumqayit") || norm.includes("xırdalan") || norm.includes("xirdalan")) {
      return "Abşeron ərazisi";
    }
    return "Rayonlar";
  } else {
    // azerpost only has Rayonlar and Naxçıvan
    return "Rayonlar";
  }
}

// Guard to ensure delivery collections are only checked and seeded once
let hasSeededDelivery = false;

// Function to seed collections if they do not exist
export async function seedDeliveryCollections() {
  if (hasSeededDelivery || (typeof window !== "undefined" && localStorage.getItem("ayvelin_delivery_seeded"))) {
    return;
  }
  hasSeededDelivery = true;
  try {
    // 1. Seed providers
    const expargoRef = doc(db, "deliveryProviders", "expargo");
    const expargoSnap = await getDoc(expargoRef);
    if (!expargoSnap.exists()) {
      await setDoc(expargoRef, {
        id: "expargo",
        name: "Expargo",
        slug: "expargo",
        isActive: true,
        logoUrl: "",
        totalDeliveries: 0,
        totalCost: 0,
        createdAt: Timestamp.now()
      });
    }

    const azerpostRef = doc(db, "deliveryProviders", "azerpost");
    const azerpostSnap = await getDoc(azerpostRef);
    if (!azerpostSnap.exists()) {
      await setDoc(azerpostRef, {
        id: "azerpost",
        name: "Azərpoçt",
        slug: "azerpost",
        isActive: true,
        logoUrl: "",
        totalDeliveries: 0,
        totalCost: 0,
        createdAt: Timestamp.now()
      });
    }

    // 2. Seed Tariffs
    const tariffsToSeed = [
      { id: "expargo_baku", provider: "expargo", zoneName: "Bakı şəhər daxili", price: 2.50 },
      { id: "expargo_absheron", provider: "expargo", zoneName: "Abşeron ərazisi", price: 2.50 },
      { id: "expargo_regions", provider: "expargo", zoneName: "Rayonlar", price: 3.50 },
      { id: "expargo_nakhchivan", provider: "expargo", zoneName: "Naxçıvan", price: 5.00 },
      { id: "azerpost_regions", provider: "azerpost", zoneName: "Rayonlar", price: 3.00 },
      { id: "azerpost_nakhchivan", provider: "azerpost", zoneName: "Naxçıvan", price: 5.00 },
    ];

    for (const t of tariffsToSeed) {
      const tariffRef = doc(db, "deliveryTariffs", t.id);
      const tariffSnap = await getDoc(tariffRef);
      if (!tariffSnap.exists()) {
        await setDoc(tariffRef, {
          provider: t.provider,
          zoneName: t.zoneName,
          price: t.price,
          updatedAt: Timestamp.now()
        });
      }
    }

    // 3. Seed Branches (only if collection is completely empty)
    const branchesSnap = await getDocs(collection(db, "deliveryBranches"));
    if (branchesSnap.empty) {
      const branchesToSeed = [
        // Expargo
        { id: "expargo_1", provider: "expargo" as const, name: "28 May Filialı", region: "Bakı", address: "Nəsimi r., 28 May küç. 76B (ABB ilə üzbəüz)", phone: "012 210 00 85", isActive: true },
        { id: "expargo_2", provider: "expargo" as const, name: "Gənclik Filialı", region: "Bakı", address: "Həsən Əliyev 94, Beynəlxalq Bankın yanı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_3", provider: "expargo" as const, name: "İçərişəhər Filialı", region: "Bakı", address: "Əhməd Cavad 15, City Center TM, 1ci mərtəbə", phone: "012 210 00 85", isActive: true },
        { id: "expargo_4", provider: "expargo" as const, name: "Xətai Filialı", region: "Bakı", address: "Sənan Kərimov küç. 13C, Xətai m/s çıxışı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_5", provider: "expargo" as const, name: "Nərimanov Filialı", region: "Bakı", address: "Ağa Neymətulla küç. 49a", phone: "012 210 00 85", isActive: true },
        { id: "expargo_6", provider: "expargo" as const, name: "Həzi Aslanov Filialı", region: "Bakı", address: "Məhəmməd Hadi küç. 63A (KFC və Ukrayna dairəsi arası)", phone: "012 210 00 85", isActive: true },
        { id: "expargo_7", provider: "expargo" as const, name: "Əcəmi Filialı", region: "Bakı", address: "Cavadxan 23A, Əcəmi m/s əsas çıxışı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_8", provider: "expargo" as const, name: "Metro 8 Noyabr T/M", region: "Bakı", address: "Nəsimi r., Ceyhun Səlimov küç., giriş 35A", phone: "012 210 00 85", isActive: true },
        { id: "expargo_9", provider: "expargo" as const, name: "Əhmədli Filialı", region: "Bakı", address: "Xətai r., Sarayevo küç. 2325ci məh., Nərmin TM", phone: "012 210 00 85", isActive: true },
        { id: "expargo_10", provider: "expargo" as const, name: "Elmlər-Statistika Filialı", region: "Bakı", address: "Nəriman Nərimanov pr. 205, Statistika dairəsi", phone: "012 210 00 85", isActive: true },
        { id: "expargo_11", provider: "expargo" as const, name: "Bakıxanov Filialı", region: "Bakı", address: "Səməd bəy Mehmandarov 140", phone: "012 210 00 85", isActive: true },
        { id: "expargo_12", provider: "expargo" as const, name: "İnşaatçılar Filialı", region: "Bakı", address: "Şərifzadə 174, Kontakt Home mağazasının altı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_13", provider: "expargo" as const, name: "20 Yanvar Filialı", region: "Bakı", address: "Tbilisi pr. 44C, 20 Yanvar m/s Velotrek çıxışı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_14", provider: "expargo" as const, name: "Sədərək Filialı", region: "Bakı", address: "Sədərək TM, Zona 1, 10cu sıra, 1ci korpus 1/1B", phone: "070 644 49 93", isActive: true },
        { id: "expargo_15", provider: "expargo" as const, name: "Azadlıq Filialı", region: "Bakı", address: "Binəqədi r., Süleyman Sani Axundov küç. 3b", phone: "012 210 00 85", isActive: true },
        { id: "expargo_16", provider: "expargo" as const, name: "Neftçilər Filialı", region: "Bakı", address: "R. Rüstəmov 25/63, Neftçilər m/s çıxışı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_17", provider: "expargo" as const, name: "Q.Qarayev Filialı", region: "Bakı", address: "Azər Manafov küç. 60/66", phone: "012 210 00 85", isActive: true },
        { id: "expargo_18", provider: "expargo" as const, name: "Bayıl T/M", region: "Bakı", address: "Səbail r., Bayıl qəs., Mikayıl Hüseynov küç., Bravo yanı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_19", provider: "expargo" as const, name: "Keşlə Filialı", region: "Bakı", address: "Nizami r., Keşlə qəs., Məşədi Hilal Kazımov küç. 43A", phone: "012 210 00 85", isActive: true },
        { id: "expargo_20", provider: "expargo" as const, name: "Suraxanı - Yeni Filialı", region: "Bakı", address: "Yeni Suraxanı qəs., 14 İyul küç. (Həsən bəy Zərdabi 1)", phone: "012 210 00 85", isActive: true },
        { id: "expargo_21", provider: "expargo" as const, name: "Albalılıq T/M", region: "Abşeron", address: "Xəzər r., Buzovna qəs., Ağaəmi Rəhimov küç., giriş 2A", phone: "012 210 00 85", isActive: true },
        { id: "expargo_22", provider: "expargo" as const, name: "Şüvəlan T/M", region: "Abşeron", address: "Xəzər r., Almas İldırım küç. 34", phone: "+994 50 679 01 27", isActive: true },
        { id: "expargo_23", provider: "expargo" as const, name: "Mərdəkan T/M", region: "Abşeron", address: "Xəzər r., Mərdəkan qəs., 28 May küç. 33A", phone: "+994 50 476 15 21", isActive: true },
        { id: "expargo_24", provider: "expargo" as const, name: "Masazır T/M", region: "Abşeron", address: "Abşeron r., Masazır, Qurtuluş 93, İnteqral yaşayış massivi", phone: "012 210 00 85", isActive: true },
        { id: "expargo_25", provider: "expargo" as const, name: "Hövsan T/M", region: "Abşeron", address: "Xəzər r., Hövsan qəs.", phone: "012 210 00 85", isActive: true },
        { id: "expargo_26", provider: "expargo" as const, name: "Pirallahı T/M", region: "Abşeron", address: "Xəzər r., Pirallahı", phone: "012 210 00 85", isActive: true },
        { id: "expargo_27", provider: "expargo" as const, name: "Xırdalan Filialı", region: "Abşeron", address: "Xırdalan ş., 27ci məh., ev 2A (Bizim Marketin yaxınlığı)", phone: "012 210 00 85", isActive: true },
        { id: "expargo_28", provider: "expargo" as const, name: "Sumqayıt Filialı", region: "Abşeron", address: "Sumqayıt, 45ci məh., Dostluq küç. 5/81 (Samsungun yanı)", phone: "012 210 00 85", isActive: true },
        { id: "expargo_29", provider: "expargo" as const, name: "Sumqayıt 2 Filialı", region: "Abşeron", address: "Sumqayıt, 21ci məh., ev 18/31 (Sufle Şirniyyatın arxası)", phone: "012 210 00 85", isActive: true },
        { id: "expargo_30", provider: "expargo" as const, name: "Sumqayıt 3 Filialı", region: "Abşeron", address: "Sumqayıt, Məhəmməd Əsədov küç., giriş 88 (18ci mkr.)", phone: "012 210 00 85", isActive: true },
        { id: "expargo_31", provider: "expargo" as const, name: "Gəncə Filialı", region: "Gəncə", address: "Gəncə, Heydər Əliyev pr. 165 (Mega Martın qarşısı)", phone: "+994 55 708 77 00", isActive: true },
        { id: "expargo_32", provider: "expargo" as const, name: "Gəncə 2 Filialı", region: "Gəncə", address: "Gəncə, Nizami r., Gülüstan qəs., Bülbül 28", phone: "+994 55 708 77 00", isActive: true },
        { id: "expargo_33", provider: "expargo" as const, name: "Lənkəran Filialı", region: "Lənkəran", address: "Lənkəran, Məmmədqulu Ələkbərov küç. 8 (LDU-nun arxası)", phone: "+994 50 805 85 41", isActive: true },
        { id: "expargo_34", provider: "expargo" as const, name: "Lənkəran 2 T/M", region: "Lənkəran", address: "Lənkəran, Liman şəhəri, 2 Nömrəli Məktəbə gedən yol", phone: "+994 99 779 00 15", isActive: true },
        { id: "expargo_35", provider: "expargo" as const, name: "Zaqatala Filialı", region: "Rayonlar", address: "Zaqatala, H.Əliyev pr. 80 (Rus məktəbi ilə üzbəüz)", phone: "+994 50 299 11 96", isActive: true },
        { id: "expargo_36", provider: "expargo" as const, name: "Mingəçevir Filialı", region: "Rayonlar", address: "Mingəçevir, Naxçıvan küç. 45C", phone: "+994 77 715 43 15", isActive: true },
        { id: "expargo_37", provider: "expargo" as const, name: "Yevlax Filialı", region: "Rayonlar", address: "Yevlax, Xaldan kəndi, Ağdaş kruqu, OBA Market yanı", phone: "+994 77 350 40 60", isActive: true },
        { id: "expargo_38", provider: "expargo" as const, name: "Qax Filialı", region: "Rayonlar", address: "Qax r., Əlibəyli kəndi", phone: "+994 77 763 00 34", isActive: true },
        { id: "expargo_39", provider: "expargo" as const, name: "Xudat Filialı", region: "Rayonlar", address: "Xaçmaz r., Xudat, Mirzə Fətəli Axundzadə küç., giriş 38", phone: "+994 70 672 62 60", isActive: true },
        { id: "expargo_40", provider: "expargo" as const, name: "Türkan T/M", region: "Abşeron", address: "Xəzər r., Türkan kəndi, Firdovsi küç. 20", phone: "+994 70 207 29 28", isActive: true },
        { id: "expargo_41", provider: "expargo" as const, name: "Naxçıvan Filialı", region: "Naxçıvan", address: "Naxçıvan ş., İstiqlal küç. 105, ev 25", phone: "+994 60 288 56 86", isActive: true },

        // Azərpoçt
        { id: "azerpost_1", provider: "azerpost" as const, name: "Mərkəzi Poçt Şöbəsi №1", region: "Bakı", address: "Ü.Hacıbəyov 36, Səbail", phone: "AZ1000", isActive: true },
        { id: "azerpost_2", provider: "azerpost" as const, name: "Poçt Şöbəsi №2", region: "Bakı", address: "Nəsimi r.", phone: "AZ1002", isActive: true },
        { id: "azerpost_3", provider: "azerpost" as const, name: "Poçt Şöbəsi №3", region: "Bakı", address: "Nəsimi r.", phone: "AZ1003", isActive: true },
        { id: "azerpost_4", provider: "azerpost" as const, name: "Poçt Şöbəsi №4 (Yasamal)", region: "Bakı", address: "Yasamal r.", phone: "AZ1004", isActive: true },
        { id: "azerpost_5", provider: "azerpost" as const, name: "Poçt Şöbəsi №5", region: "Bakı", address: "Binəqədi r.", phone: "AZ1005", isActive: true },
        { id: "azerpost_6", provider: "azerpost" as const, name: "Poçt Şöbəsi №6", region: "Bakı", address: "Nizami r.", phone: "AZ1006", isActive: true },
        { id: "azerpost_7", provider: "azerpost" as const, name: "Poçt Şöbəsi №7", region: "Bakı", address: "Sabunçu r.", phone: "AZ1007", isActive: true },
        { id: "azerpost_8", provider: "azerpost" as const, name: "Poçt Şöbəsi №8", region: "Bakı", address: "Suraxanı r.", phone: "AZ1008", isActive: true },
        { id: "azerpost_9", provider: "azerpost" as const, name: "Poçt Şöbəsi №9", region: "Bakı", address: "Xəzər r.", phone: "AZ1009", isActive: true },
        { id: "azerpost_10", provider: "azerpost" as const, name: "Poçt Şöbəsi №10", region: "Bakı", address: "Nərimanov r.", phone: "AZ1010", isActive: true },
        { id: "azerpost_11", provider: "azerpost" as const, name: "Poçt Şöbəsi №11", region: "Bakı", address: "Qaradağ r.", phone: "AZ1011", isActive: true },
        { id: "azerpost_12", provider: "azerpost" as const, name: "Poçt Şöbəsi №12", region: "Bakı", address: "Xətai r.", phone: "AZ1012", isActive: true },
        { id: "azerpost_13", provider: "azerpost" as const, name: "Poçt Şöbəsi №61", region: "Bakı", address: "Xəzər r., Kuzinski QRES", phone: "AZ1061", isActive: true },
        { id: "azerpost_14", provider: "azerpost" as const, name: "Poçt Şöbəsi №62", region: "Bakı", address: "Qaradağ r., Puta qəs.", phone: "AZ1062", isActive: true },
        { id: "azerpost_15", provider: "azerpost" as const, name: "Poçt Şöbəsi №63", region: "Bakı", address: "Qaradağ r., Lökbatan", phone: "AZ1063", isActive: true },
        { id: "azerpost_16", provider: "azerpost" as const, name: "Poçt Şöbəsi №67", region: "Bakı", address: "Suraxanı r., Yusif Eyvazov 1", phone: "AZ1067", isActive: true },
        { id: "azerpost_17", provider: "azerpost" as const, name: "Abşeron Mərkəzi PŞ", region: "Abşeron", address: "Abşeron r., Mərkəzi", phone: "AZ0100", isActive: true },
        { id: "azerpost_18", provider: "azerpost" as const, name: "Abşeron PŞ №1", region: "Abşeron", address: "Abşeron r.", phone: "AZ0101", isActive: true },
        { id: "azerpost_19", provider: "azerpost" as const, name: "Abşeron PŞ №2", region: "Abşeron", address: "Abşeron r.", phone: "AZ0102", isActive: true },
        { id: "azerpost_20", provider: "azerpost" as const, name: "Aşağı Güzdək PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0111", isActive: true },
        { id: "azerpost_21", provider: "azerpost" as const, name: "Ceyranbatan PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0112", isActive: true },
        { id: "azerpost_22", provider: "azerpost" as const, name: "Fatmayi PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0113", isActive: true },
        { id: "azerpost_23", provider: "azerpost" as const, name: "Masazır-1 PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0116", isActive: true },
        { id: "azerpost_24", provider: "azerpost" as const, name: "Masazır-2 PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0123", isActive: true },
        { id: "azerpost_25", provider: "azerpost" as const, name: "Novxanı PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0119", isActive: true },
        { id: "azerpost_26", provider: "azerpost" as const, name: "Saray-1 PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0121", isActive: true },
        { id: "azerpost_27", provider: "azerpost" as const, name: "Saray-2 PŞ", region: "Abşeron", address: "Abşeron r.", phone: "AZ0128", isActive: true },
        { id: "azerpost_28", provider: "azerpost" as const, name: "Sumqayıt Mərkəzi PŞ", region: "Sumqayıt", address: "Sumqayıt ş., Mərkəzi", phone: "AZ5000", isActive: true },
        { id: "azerpost_29", provider: "azerpost" as const, name: "Sumqayıt PŞ №1", region: "Sumqayıt", address: "Sumqayıt ş.", phone: "AZ5001", isActive: true },
        { id: "azerpost_30", provider: "azerpost" as const, name: "Sumqayıt PŞ №2", region: "Sumqayıt", address: "Sumqayıt ş.", phone: "AZ5002", isActive: true },
        { id: "azerpost_31", provider: "azerpost" as const, name: "Sumqayıt PŞ №3", region: "Sumqayıt", address: "Sumqayıt ş.", phone: "AZ5003", isActive: true },
        { id: "azerpost_32", provider: "azerpost" as const, name: "Gəncə Mərkəzi PŞ", region: "Gəncə", address: "Gəncə ş., Mərkəzi", phone: "AZ2000", isActive: true },
        { id: "azerpost_33", provider: "azerpost" as const, name: "Gəncə PŞ №1", region: "Gəncə", address: "Gəncə ş.", phone: "AZ2001", isActive: true },
        { id: "azerpost_34", provider: "azerpost" as const, name: "Gəncə PŞ №2", region: "Gəncə", address: "Gəncə ş.", phone: "AZ2002", isActive: true },
        { id: "azerpost_35", provider: "azerpost" as const, name: "Gəncə PŞ №3", region: "Gəncə", address: "Gəncə ş.", phone: "AZ2003", isActive: true },
        { id: "azerpost_36", provider: "azerpost" as const, name: "Naxçıvan Mərkəzi PŞ", region: "Naxçıvan", address: "Naxçıvan ş., Mərkəzi", phone: "AZ7000", isActive: true },
        { id: "azerpost_37", provider: "azerpost" as const, name: "Naxçıvan PŞ №1", region: "Naxçıvan", address: "Naxçıvan ş.", phone: "AZ7001", isActive: true },
        { id: "azerpost_38", provider: "azerpost" as const, name: "Şərur PŞ", region: "Naxçıvan", address: "Şərur r.", phone: "AZ7011", isActive: true },
        { id: "azerpost_39", provider: "azerpost" as const, name: "Ordubad PŞ", region: "Naxçıvan", address: "Ordubad r.", phone: "AZ7021", isActive: true },
        { id: "azerpost_40", provider: "azerpost" as const, name: "Culfa PŞ", region: "Naxçıvan", address: "Culfa r.", phone: "AZ7031", isActive: true },
        { id: "azerpost_41", provider: "azerpost" as const, name: "Sədərək PŞ", region: "Naxçıvan", address: "Sədərək r.", phone: "AZ7041", isActive: true },
        { id: "azerpost_42", provider: "azerpost" as const, name: "Ağdaş Mərkəzi PŞ", region: "Rayon", address: "Ağdaş r.", phone: "AZ0300", isActive: true },
        { id: "azerpost_43", provider: "azerpost" as const, name: "Ağcabədi Mərkəzi PŞ", region: "Rayon", address: "Ağcabədi r.", phone: "AZ0400", isActive: true },
        { id: "azerpost_44", provider: "azerpost" as const, name: "Ağstafa Mərkəzi PŞ", region: "Rayon", address: "Ağstafa r.", phone: "AZ0500", isActive: true },
        { id: "azerpost_45", provider: "azerpost" as const, name: "Ağsu Mərkəzi PŞ", region: "Rayon", address: "Ağsu r.", phone: "AZ0600", isActive: true },
        { id: "azerpost_46", provider: "azerpost" as const, name: "Astara Mərkəzi PŞ", region: "Rayon", address: "Astara r.", phone: "AZ4200", isActive: true },
        { id: "azerpost_47", provider: "azerpost" as const, name: "Balakən Mərkəzi PŞ", region: "Rayon", address: "Balakən r.", phone: "AZ3800", isActive: true },
        { id: "azerpost_48", provider: "azerpost" as const, name: "Beyləqan Mərkəzi PŞ", region: "Rayon", address: "Beyləqan r.", phone: "AZ4700", isActive: true },
        { id: "azerpost_49", provider: "azerpost" as const, name: "Bərdə Mərkəzi PŞ", region: "Rayon", address: "Bərdə r.", phone: "AZ4600", isActive: true },
        { id: "azerpost_50", provider: "azerpost" as const, name: "Biləsuvar Mərkəzi PŞ", region: "Rayon", address: "Biləsuvar r.", phone: "AZ4900", isActive: true },
        { id: "azerpost_51", provider: "azerpost" as const, name: "Cəlilabad Mərkəzi PŞ", region: "Rayon", address: "Cəlilabad r.", phone: "AZ4300", isActive: true },
        { id: "azerpost_52", provider: "azerpost" as const, name: "Daşkəsən Mərkəzi PŞ", region: "Rayon", address: "Daşkəsən r.", phone: "AZ2300", isActive: true },
        { id: "azerpost_53", provider: "azerpost" as const, name: "Füzuli Mərkəzi PŞ", region: "Rayon", address: "Füzuli r.", phone: "AZ1600", isActive: true },
        { id: "azerpost_54", provider: "azerpost" as const, name: "Gədəbəy Mərkəzi PŞ", region: "Rayon", address: "Gədəbəy r.", phone: "AZ2200", isActive: true },
        { id: "azerpost_55", provider: "azerpost" as const, name: "Goranboy Mərkəzi PŞ", region: "Rayon", address: "Goranboy r.", phone: "AZ2500", isActive: true },
        { id: "azerpost_56", provider: "azerpost" as const, name: "Göyçay Mərkəzi PŞ", region: "Rayon", address: "Göyçay r.", phone: "AZ2700", isActive: true },
        { id: "azerpost_57", provider: "azerpost" as const, name: "Göy-Göl Mərkəzi PŞ", region: "Rayon", address: "Göy-Göl r.", phone: "AZ2400", isActive: true },
        { id: "azerpost_58", provider: "azerpost" as const, name: "Hacıqabul Mərkəzi PŞ", region: "Rayon", address: "Hacıqabul r.", phone: "AZ5100", isActive: true },
        { id: "azerpost_59", provider: "azerpost" as const, name: "Xaçmaz Mərkəzi PŞ", region: "Rayon", address: "Xaçmaz r.", phone: "AZ3600", isActive: true },
        { id: "azerpost_60", provider: "azerpost" as const, name: "İmişli Mərkəzi PŞ", region: "Rayon", address: "İmişli r.", phone: "AZ4800", isActive: true },
        { id: "azerpost_61", provider: "azerpost" as const, name: "İsmayıllı Mərkəzi PŞ", region: "Rayon", address: "İsmayıllı r.", phone: "AZ3200", isActive: true },
        { id: "azerpost_62", provider: "azerpost" as const, name: "Kürdəmir Mərkəzi PŞ", region: "Rayon", address: "Kürdəmir r.", phone: "AZ2900", isActive: true },
        { id: "azerpost_63", provider: "azerpost" as const, name: "Lənkəran Mərkəzi PŞ", region: "Rayon", address: "Lənkəran r.", phone: "AZ4100", isActive: true },
        { id: "azerpost_64", provider: "azerpost" as const, name: "Lerik Mərkəzi PŞ", region: "Rayon", address: "Lerik r.", phone: "AZ4400", isActive: true },
        { id: "azerpost_65", provider: "azerpost" as const, name: "Masallı Mərkəzi PŞ", region: "Rayon", address: "Masallı r.", phone: "AZ4500", isActive: true },
        { id: "azerpost_66", provider: "azerpost" as const, name: "Mingəçevir PŞ", region: "Rayon", address: "Mingəçevir ş.", phone: "AZ2600", isActive: true },
        { id: "azerpost_67", provider: "azerpost" as const, name: "Neftçala Mərkəzi PŞ", region: "Rayon", address: "Neftçala r.", phone: "AZ5400", isActive: true },
        { id: "azerpost_68", provider: "azerpost" as const, name: "Oğuz Mərkəzi PŞ", region: "Rayon", address: "Oğuz r.", phone: "AZ3100", isActive: true },
        { id: "azerpost_69", provider: "azerpost" as const, name: "Qax Mərkəzi PŞ", region: "Rayon", address: "Qax r.", phone: "AZ3700", isActive: true },
        { id: "azerpost_70", provider: "azerpost" as const, name: "Qazax Mərkəzi PŞ", region: "Rayon", address: "Qazax r.", phone: "AZ0700", isActive: true },
        { id: "azerpost_71", provider: "azerpost" as const, name: "Qəbələ Mərkəzi PŞ", region: "Rayon", address: "Qəbələ r.", phone: "AZ3000", isActive: true },
        { id: "azerpost_72", provider: "azerpost" as const, name: "Qobustan Mərkəzi PŞ", region: "Rayon", address: "Qobustan r.", phone: "AZ3300", isActive: true },
        { id: "azerpost_73", provider: "azerpost" as const, name: "Quba Mərkəzi PŞ", region: "Rayon", address: "Quba r.", phone: "AZ3500", isActive: true },
        { id: "azerpost_74", provider: "azerpost" as const, name: "Qusar Mərkəzi PŞ", region: "Rayon", address: "Qusar r.", phone: "AZ3400", isActive: true },
        { id: "azerpost_75", provider: "azerpost" as const, name: "Saatlı Mərkəzi PŞ", region: "Rayon", address: "Saatlı r.", phone: "AZ5200", isActive: true },
        { id: "azerpost_76", provider: "azerpost" as const, name: "Sabirabad Mərkəzi PŞ", region: "Rayon", address: "Sabirabad r.", phone: "AZ5300", isActive: true },
        { id: "azerpost_77", provider: "azerpost" as const, name: "Salyan Mərkəzi PŞ", region: "Rayon", address: "Salyan r.", phone: "AZ5600", isActive: true },
        { id: "azerpost_78", provider: "azerpost" as const, name: "Samux Mərkəzi PŞ", region: "Rayon", address: "Samux r.", phone: "AZ2800", isActive: true },
        { id: "azerpost_79", provider: "azerpost" as const, name: "Şabran Mərkəzi PŞ", region: "Rayon", address: "Şabran r.", phone: "AZ3900", isActive: true },
        { id: "azerpost_80", provider: "azerpost" as const, name: "Şamaxı Mərkəzi PŞ", region: "Rayon", address: "Şamaxı r.", phone: "AZ3200", isActive: true },
        { id: "azerpost_81", provider: "azerpost" as const, name: "Şəki Mərkəzi PŞ", region: "Rayon", address: "Şəki ş.", phone: "AZ1500", isActive: true },
        { id: "azerpost_82", provider: "azerpost" as const, name: "Şəmkir Mərkəzi PŞ", region: "Rayon", address: "Şəmkir r.", phone: "AZ2100", isActive: true },
        { id: "azerpost_83", provider: "azerpost" as const, name: "Şirvan PŞ", region: "Rayon", address: "Şirvan ş.", phone: "AZ1800", isActive: true },
        { id: "azerpost_84", provider: "azerpost" as const, name: "Siyəzən Mərkəzi PŞ", region: "Rayon", address: "Siyəzən r.", phone: "AZ4000", isActive: true },
        { id: "azerpost_85", provider: "azerpost" as const, name: "Tər-Tər Mərkəzi PŞ", region: "Rayon", address: "Tər-Tər r.", phone: "AZ2000", isActive: true },
        { id: "azerpost_86", provider: "azerpost" as const, name: "Tovuz Mərkəzi PŞ", region: "Rayon", address: "Tovuz r.", phone: "AZ0900", isActive: true },
        { id: "azerpost_87", provider: "azerpost" as const, name: "Ucar Mərkəzi PŞ", region: "Rayon", address: "Ucar r.", phone: "AZ2800", isActive: true },
        { id: "azerpost_88", provider: "azerpost" as const, name: "Yardımlı Mərkəzi PŞ", region: "Rayon", address: "Yardımlı r.", phone: "AZ4400", isActive: true },
        { id: "azerpost_89", provider: "azerpost" as const, name: "Yevlax Mərkəzi PŞ", region: "Rayon", address: "Yevlax ş.", phone: "AZ1700", isActive: true },
        { id: "azerpost_90", provider: "azerpost" as const, name: "Zaqatala Mərkəzi PŞ", region: "Rayon", address: "Zaqatala r.", phone: "AZ3800", isActive: true },
        { id: "azerpost_91", provider: "azerpost" as const, name: "Zərdab Mərkəzi PŞ", region: "Rayon", address: "Zərdab r.", phone: "AZ2700", isActive: true },
        { id: "azerpost_92", provider: "azerpost" as const, name: "Xızı Mərkəzi PŞ", region: "Rayon", address: "Xızı r.", phone: "AZ3900", isActive: true },
        { id: "azerpost_93", provider: "azerpost" as const, name: "Ağdam Mərkəzi PŞ", region: "Rayon", address: "Ağdam r.", phone: "AZ0200", isActive: true }
      ];

      await Promise.all(
        branchesToSeed.map((b) =>
          setDoc(doc(db, "deliveryBranches", b.id), {
            provider: b.provider,
            name: b.name,
            region: b.region,
            address: b.address,
            phone: b.phone,
            isActive: b.isActive,
            createdAt: Timestamp.now()
          })
        )
      );
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("ayvelin_delivery_seeded", "true");
    }
  } catch (err) {
    console.error("Seeding delivery data failed:", err);
  }
}

// 1. Hook to listen to deliveryProviders
export function useDeliveryProviders() {
  const [providers, setProviders] = useState<DeliveryProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Seed on mount to verify schema setup
    seedDeliveryCollections();

    const unsub = onSnapshot(collection(db, "deliveryProviders"), (snap) => {
      const list: DeliveryProvider[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DeliveryProvider);
      });
      setProviders(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "deliveryProviders"));

    return unsub;
  }, []);

  return { providers, loading };
}

// 2. Hook to get deliveryBranches by provider
export function useDeliveryBranches(provider: "expargo" | "azerpost" | null) {
  const [branches, setBranches] = useState<DeliveryBranch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = query(collection(db, "deliveryBranches"));
    if (provider) {
      q = query(collection(db, "deliveryBranches"), where("provider", "==", provider));
    }

    const unsub = onSnapshot(q, (snap) => {
      const list: DeliveryBranch[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DeliveryBranch);
      });
      setBranches(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "deliveryBranches"));

    return unsub;
  }, [provider]);

  return { branches, loading };
}

// 3. Hook to get deliveryTariffs by provider
export function useDeliveryTariffs(provider: "expargo" | "azerpost" | null) {
  const [tariffs, setTariffs] = useState<DeliveryTariff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let q = query(collection(db, "deliveryTariffs"));
    if (provider) {
      q = query(collection(db, "deliveryTariffs"), where("provider", "==", provider));
    }

    const unsub = onSnapshot(q, (snap) => {
      const list: DeliveryTariff[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DeliveryTariff);
      });
      setTariffs(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "deliveryTariffs"));

    return unsub;
  }, [provider]);

  return { tariffs, loading };
}

// Helper to determine if a date falls in the specified period preset.
function isDateInPeriod(recordDate: Date, preset: string, customStart: Date | null, customEnd: Date | null): boolean {
  const now = new Date();
  const recTime = recordDate.getTime();

  if (preset === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return recTime >= startOfToday.getTime();
  }
  if (preset === "week") {
    const currentDay = now.getDay();
    const distance = currentDay === 0 ? 6 : currentDay - 1; // days since Monday
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distance);
    return recTime >= startOfWeek.getTime();
  }
  if (preset === "month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return recTime >= startOfMonth.getTime();
  }
  if (preset === "custom") {
    let match = true;
    if (customStart) {
      const start = new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate());
      match = match && recTime >= start.getTime();
    }
    if (customEnd) {
      const end = new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate(), 23, 59, 59, 999);
      match = match && recTime <= end.getTime();
    }
    return match;
  }
  return true;
}

// 4. Hook to calculate statistics over deliveryRecords
export function useDeliveryStats(dateRange: { startDate: Date | null, endDate: Date | null, preset: "today" | "week" | "month" | "custom" }) {
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "deliveryRecords"), (snap) => {
      const list: DeliveryRecord[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DeliveryRecord);
      });
      setRecords(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "deliveryRecords"));

    return unsub;
  }, []);

  const stats = useMemo(() => {
    // Filter records by date range
    const filtered = records.filter(r => {
      let createdDate: Date;
      if (r.createdAt && typeof r.createdAt.toDate === "function") {
        createdDate = r.createdAt.toDate();
      } else if (r.createdAt && r.createdAt.seconds) {
        createdDate = new Date(r.createdAt.seconds * 1000);
      } else if (typeof r.createdAt === "string") {
        createdDate = new Date(r.createdAt);
      } else {
        createdDate = new Date();
      }

      return isDateInPeriod(createdDate, dateRange.preset, dateRange.startDate, dateRange.endDate);
    });

    const totalDeliveries = filtered.length;
    const totalCost = filtered.reduce((sum, r) => sum + (r.cost || 0), 0);
    const averageCost = totalDeliveries > 0 ? totalCost / totalDeliveries : 0;

    // Groups stats by provider (expargo, azerpost, courier)
    const providerStats: Record<string, { count: number; cost: number; percentage: number }> = {
      expargo: { count: 0, cost: 0, percentage: 0 },
      azerpost: { count: 0, cost: 0, percentage: 0 },
      courier: { count: 0, cost: 0, percentage: 0 }
    };

    filtered.forEach(r => {
      const p = r.provider || "courier";
      if (!providerStats[p]) {
        providerStats[p] = { count: 0, cost: 0, percentage: 0 };
      }
      providerStats[p].count += 1;
      providerStats[p].cost += r.cost || 0;
    });

    // Percentages
    Object.keys(providerStats).forEach(p => {
      const stat = providerStats[p];
      stat.percentage = totalDeliveries > 0 ? (stat.count / totalDeliveries) * 100 : 0;
    });

    // Breakdown by zone name
    const zoneStats: Record<string, { count: number; cost: number }> = {};
    filtered.forEach(r => {
      const z = r.zoneName || "Kuryer Çatdırılması";
      if (!zoneStats[z]) {
        zoneStats[z] = { count: 0, cost: 0 };
      }
      zoneStats[z].count += 1;
      zoneStats[z].cost += r.cost || 0;
    });

    return {
      totalDeliveries,
      totalCost,
      averageCost,
      providerStats,
      zoneStats
    };
  }, [records, dateRange]);

  return { stats, loading };
}

// 5. Hook to update tariff prices
export function useUpdateTariff() {
  const [updating, setUpdating] = useState(false);

  const updateTariff = async (tariffId: string, price: number) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, "deliveryTariffs", tariffId), {
        price: Number(price),
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `deliveryTariffs/${tariffId}`);
    } finally {
      setUpdating(false);
    }
  };

  return { updateTariff, updating };
}

// 6. Hook to get all delivery records in real-time
export function useDeliveryRecords() {
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "deliveryRecords"), (snap) => {
      const list: DeliveryRecord[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DeliveryRecord);
      });
      setRecords(list);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, "deliveryRecords"));

    return unsub;
  }, []);

  return { records, loading };
}

// 7. Branch Network Management Utilities
export async function addDeliveryBranch(branch: Omit<DeliveryBranch, "id" | "createdAt">) {
  try {
    const id = `${branch.provider}_branch_${Date.now()}`;
    await setDoc(doc(db, "deliveryBranches", id), {
      ...branch,
      isActive: true,
      createdAt: Timestamp.now()
    });
    return id;
  } catch (err) {
    console.error("Error adding delivery branch:", err);
    throw err;
  }
}

export async function updateDeliveryBranch(id: string, branch: Partial<DeliveryBranch>) {
  try {
    const ref = doc(db, "deliveryBranches", id);
    await updateDoc(ref, {
      ...branch,
      updatedAt: Timestamp.now()
    });
  } catch (err) {
    console.error("Error updating delivery branch:", err);
    throw err;
  }
}

export async function deleteDeliveryBranch(id: string) {
  try {
    await deleteDoc(doc(db, "deliveryBranches", id));
  } catch (err) {
    console.error("Error deleting delivery branch:", err);
    throw err;
  }
}

// 8. Tariff Zone Management Utilities
export async function addDeliveryTariff(provider: "expargo" | "azerpost", zoneName: string, price: number) {
  try {
    // Generate an ID based on provider and slugified zoneName
    const slug = zoneName.toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/__+/g, "_")
      .trim();
    const id = `${provider}_tariff_${slug}_${Date.now()}`;
    await setDoc(doc(db, "deliveryTariffs", id), {
      provider,
      zoneName,
      price: Number(price) || 0,
      updatedAt: Timestamp.now()
    });
    return id;
  } catch (err) {
    console.error("Error adding delivery tariff:", err);
    throw err;
  }
}

export async function deleteDeliveryTariff(id: string) {
  try {
    await deleteDoc(doc(db, "deliveryTariffs", id));
  } catch (err) {
    console.error("Error deleting delivery tariff:", err);
    throw err;
  }
}
