import React, { useState, useMemo, useEffect, useRef } from "react";
import { useData } from "../context/DataContext";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, 
  Search, 
  Trash2, 
  Copy, 
  Printer, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  User, 
  Package, 
  Truck, 
  Check, 
  Edit3, 
  AlertTriangle,
  FileCheck,
  ChevronDown,
  Clock,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Sparkles,
  Bot,
  Send
} from "lucide-react";
import { Sale, Customer, Product, Courier, SaleItem } from "../types";
import { formatCurrency, formatDateAZ } from "../utils/xlsEngine";
import { formatPhoneNumber } from "../utils/phoneFormatter";
import { formatDisplayOrderNumber, getBakuDateRange, getBakuTodayYMD, getOrderReportingDateYMD, formatToBakuYMD } from "../utils/orderFormatter";
import { db } from "../firebase";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, Timestamp } from "firebase/firestore";
import { sendTelegramNewOrder, syncOrderStatusToTelegram } from "../utils/telegramService";
import { useDeliveryBranches, useDeliveryTariffs } from "../hooks/useDelivery";
const SearchableSelect = ({ options, value, onChange, placeholder }: { options: {id: string, label: string}[], value: string, onChange: (val: string) => void, placeholder: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()));
  const selectedOption = options.find(o => o.id === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <div 
        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-slate-800 font-semibold cursor-pointer flex justify-between items-center"
        onClick={() => { setIsOpen(!isOpen); setSearchTerm(""); }}
      >
        <span className="truncate pr-2">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </div>
      
      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 flex flex-col pt-2 pb-0">
          <div className="px-2 pb-2 border-b border-slate-100 shrink-0">
            <input 
              type="text"
              autoFocus
              className="w-full bg-slate-100 border border-transparent rounded-lg px-3 py-2 text-xs outline-none focus:border-slate-300 font-medium"
              placeholder="🔍 Axtar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="overflow-y-auto w-full py-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">Tapılmadı</div>
            ) : (
              filteredOptions.map(option => (
                <div 
                  key={option.id}
                  className={`px-3 py-2 text-xs cursor-pointer transition-colors hover:bg-slate-50 ${option.id === value ? "bg-indigo-50 text-indigo-700 font-bold" : "text-slate-700 font-medium"}`}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function SalesView() {
  const { 
    sales, customers, products, couriers, settings, 
    createSale, updateSaleStatus, updateSale, copySaleAsNew, deleteSale, saveCustomer, addToast,
    isNewOrderOpen, setIsNewOrderOpen
  } = useData();

  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [historyCustomerPhone, setHistoryCustomerPhone] = useState<string | null>(null);

  const historySales = useMemo(() => {
    if (!historyCustomerPhone) return [];
    return sales.filter(s => s.customerPhone === historyCustomerPhone);
  }, [historyCustomerPhone, sales]);

  const historyCustomerName = useMemo(() => {
    if (historySales.length === 0) return "";
    return historySales[0].customerName;
  }, [historySales]);

  const location = useLocation();

  // View settings
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (q) {
      setSearchTerm(decodeURIComponent(q));
    }
  }, [location.search]);
  const [selectedSales, setSelectedSales] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("Bu ay");
  
  // Slide panel layout
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelStep, setPanelStep] = useState(1);

  // AI Assistant states
  const [aiInputText, setAiInputText] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiBox, setShowAiBox] = useState(false);

  // Form states
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [orderItems, setOrderItems] = useState<Omit<SaleItem, "total">[]>([
    { productId: "", productName: "", qty: 1, unitPrice: 0 }
  ]);
  const [deliveryType, setDeliveryType] = useState<"courier" | "cargo" | "expargo" | "Azərpoçt">("courier");
  const [selectedBranchId, setSelectedBranchId] = useState("");

  const { branches: expargoBranches } = useDeliveryBranches("expargo");
  const { branches: azerpostBranches } = useDeliveryBranches("azerpost");
  const { tariffs: expargoTariffs } = useDeliveryTariffs("expargo");
  const { tariffs: azerpostTariffs } = useDeliveryTariffs("azerpost");

  useEffect(() => {
    if (editingSale) {
      if (editingSale.deliveryType === "expargo" || editingSale.deliveryType === "Azərpoçt") {
        const dRecRef = doc(db, "deliveryRecords", `record_${editingSale.id}`);
        getDoc(dRecRef).then(snap => {
          if (snap.exists()) {
            const data = snap.data();
            setSelectedBranchId(data.branchId || "");
          } else {
            setSelectedBranchId("");
          }
        }).catch(err => {
          console.error("Error loading delivery record:", err);
          setSelectedBranchId("");
        });
      } else {
        setSelectedBranchId("");
      }
    } else {
      setSelectedBranchId("");
    }
  }, [editingSale]);

  const handleBranchSelect = (branchId: string, currentProvider: "expargo" | "azerpost") => {
    setSelectedBranchId(branchId);
    const branchList = currentProvider === "expargo" ? expargoBranches : azerpostBranches;
    const tariffList = currentProvider === "expargo" ? expargoTariffs : azerpostTariffs;
    
    const branch = branchList.find(b => b.id === branchId);
    if (branch) {
      // Find matching tariff
      let zoneName = "Rayonlar";
      if (currentProvider === "expargo") {
        if (branch.region === "Bakı") {
          zoneName = "Bakı şəhər daxili";
        } else if (branch.region === "Sumqayıt") {
          zoneName = "Abşeron ərazisi";
        } else if (branch.region === "Naxçıvan") {
          zoneName = "Naxçıvan";
        } else {
          zoneName = "Rayonlar";
        }
      } else {
        // azerpost
        if (branch.region === "Naxçıvan") {
          zoneName = "Naxçıvan";
        } else {
          zoneName = "Rayonlar";
        }
      }
      
      const matchTariff = tariffList.find(t => t.zoneName === zoneName);
      if (matchTariff) {
        setDeliveryCost(matchTariff.price);
      } else {
        setDeliveryCost(currentProvider === "expargo" ? 3 : 3);
      }
      
      setCargoName(branch.name);
    }
  };
  const [courierId, setCourierId] = useState("");
  const [cargoName, setCargoName] = useState("");
  const [deliveryCost, setDeliveryCost] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState("Ödənilməyib");
  const [notes, setNotes] = useState("");
  const [saleStatus, setSaleStatus] = useState<"gözləyir" | "çatdırılıb" | "ləğv edilib">("gözləyir");
  const [saleDate, setSaleDate] = useState(() => getBakuTodayYMD());

  // Invoice display print target
  const [printTarget, setPrintTarget] = useState<Sale | null>(null);

  // Telegram trigger state
  const [sendingTelegramId, setSendingTelegramId] = useState<string | null>(null);

  // Inline dropdown status state
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Address Suggestion states
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const addressContainerRef = useRef<HTMLDivElement | null>(null);

  // Customer match states
  const [showHistoryPopup, setShowHistoryPopup] = useState(false);
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);
  const [lastMatchedPhone, setLastMatchedPhone] = useState("");

  const blacklistedPhonesSet = useMemo(() => {
    const set = new Set<string>();
    customers.forEach(c => {
      if (c.isBlacklisted) {
        if (c.phone) set.add(c.phone.replace(/\D/g, ""));
        if (c.altPhone) set.add(c.altPhone.replace(/\D/g, ""));
      }
    });
    return set;
  }, [customers]);

  // Dynamically compile AddressBook from customers and sales unique logs
  const addressBook = useMemo(() => {
    const list = new Set<string>();
    customers.forEach(c => {
      if (c.addresses) {
        c.addresses.forEach(a => {
          if (a && a.trim()) list.add(a.trim());
        });
      }
    });
    sales.forEach(s => {
      if (s.address && s.address.trim()) {
        list.add(s.address.trim());
      }
    });
    return Array.from(list);
  }, [customers, sales]);

  // Close status dropdown and address suggestion dropdown on outside clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownId(null);
      }
      if (addressContainerRef.current && !addressContainerRef.current.contains(event.target as Node)) {
        setIsAddressDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Customer phone auto-complete trigger + popup trigger on duplicate phone search
  useEffect(() => {
    // If in editingSale mode, do not auto-overwrite customer details with cached values from DB on initial load/phone change
    if (editingSale) {
      const cleaned = customerPhone.replace(/\D/g, "");
      if (cleaned.length >= 6) {
        const matched = customers.find(c => c.phone.replace(/\D/g, "") === cleaned);
        if (matched) {
          setMatchedCustomer(matched);
        } else {
          setMatchedCustomer(null);
        }
      } else {
        setMatchedCustomer(null);
      }
      return;
    }

    const cleaned = customerPhone.replace(/\D/g, "");
    if (cleaned.length >= 6) {
      const matched = customers.find(c => c.phone.replace(/\D/g, "") === cleaned);
      if (matched) {
        setCustomerId(matched.id);
        setCustomerName(matched.name);
        setMatchedCustomer(matched);
        if (cleaned !== lastMatchedPhone) {
          setShowHistoryPopup(true);
          setLastMatchedPhone(cleaned);
        }
        if (matched.addresses.length > 0 && !selectedAddress) {
          setSelectedAddress(matched.addresses[0]);
          setCustomAddress(matched.addresses[0]);
        }
      } else {
        setCustomerId("");
        setMatchedCustomer(null);
      }
    } else {
      setCustomerId("");
      setMatchedCustomer(null);
      setLastMatchedPhone("");
    }
  }, [customerPhone, customers, lastMatchedPhone, selectedAddress, editingSale]);

  // Autofill delivery cost when courier is selected
  useEffect(() => {
    if (editingSale) return; // Edit rejimində auto-fill etmə — istifadəçinin dəyərini saxla

    if (deliveryType === "courier" && courierId) {
      const courier = couriers.find(c => c.id === courierId);
      if (courier && courier.standardDeliveryFee > 0) {
        setDeliveryCost(courier.standardDeliveryFee);
      }
    } else {
      setCourierId("");
      if (deliveryType === "expargo") {
        if (!cargoName.startsWith("Expargo")) {
          setCargoName("Expargo - Nərimanov");
        }
      } else if (deliveryType === "cargo" && cargoName.startsWith("Expargo")) {
        setCargoName("");
      }
    }
  }, [deliveryType, courierId, couriers, cargoName, editingSale]);

  // Math aggregates in form steps
  const formSubtotal = useMemo(() => {
    return orderItems.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
  }, [orderItems]);

  const formTotalAmount = useMemo(() => {
    return Math.max(0, formSubtotal - discountAmount);
  }, [formSubtotal, discountAmount]);

  const formNetRevenue = useMemo(() => {
    return Math.max(0, formSubtotal - discountAmount - deliveryCost);
  }, [formSubtotal, discountAmount, deliveryCost]);

  // Reset form helper
  const openNewSalePanel = () => {
    setEditingSale(null);
    setCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setSelectedAddress("");
    setCustomAddress("");
    setOrderItems([{ productId: "", productName: "", qty: 1, unitPrice: 0 }]);
    setDeliveryType("courier");
    setCourierId("");
    setCargoName("");
    setDeliveryCost(0);
    setDiscountAmount(0);
    setPaymentStatus("Ödənilməyib");
    setNotes("");
    setSaleStatus("gözləyir");
    setSaleDate(getBakuTodayYMD());
    setPanelStep(1);
    setAiInputText("");
    setShowAiBox(false);
    setIsPanelOpen(true);
    setSelectedBranchId("");
  };

  const handleParseAiOrder = async () => {
    if (!aiInputText.trim()) {
      addToast({
        type: "warning",
        title: "Boş Giriş",
        content: "Zəhmət olmasa analiz ediləcək sərbəst mətni daxil edin."
      });
      return;
    }

    setIsAiLoading(true);
    try {
      const response = await fetch("/api/gemini/parse-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: aiInputText }),
      });

      if (!response.ok) {
        throw new Error("Süni İntellekt analiz xidməti cavab vermədi.");
      }

      const parsed = await response.json();

      if (parsed.customerName) setCustomerName(parsed.customerName);
      if (parsed.phone) setCustomerPhone(formatPhoneNumber(parsed.phone));
      if (parsed.address) setCustomAddress(parsed.address);
      if (parsed.note) setNotes(parsed.note);

      if (parsed.courierFee !== undefined && parsed.courierFee !== null) {
        setDeliveryCost(parsed.courierFee);
        setDeliveryType("courier");
      }

      if (parsed.courierName) {
        const matchedCourier = couriers.find(c =>
          c.name.toLowerCase().includes(parsed.courierName.toLowerCase()) ||
          parsed.courierName.toLowerCase().includes(c.name.toLowerCase())
        );
        if (matchedCourier) {
          setCourierId(matchedCourier.id);
        }
      }

      // Products processor
      if (parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
        const mappedItems = parsed.products.map((parsedProd: any) => {
          // Attempt close matching inside products database
          const matched = products.find(p =>
            p.name.toLowerCase().includes(parsedProd.name.toLowerCase()) ||
            parsedProd.name.toLowerCase().includes(p.name.toLowerCase())
          );
          if (matched) {
            return {
              productId: matched.id,
              productName: matched.name,
              qty: Number(parsedProd.qty || parsedProd.quantity || 1),
              unitPrice: typeof parsedProd.price === "number" ? parsedProd.price : matched.price
            };
          } else {
            // Check default Ayvelin match
            const defaultProd = products.find(p => p.name.toLowerCase().includes("ayvelin")) || products[0];
            return {
              productId: defaultProd ? defaultProd.id : "",
              productName: parsedProd.name || "Ayvelin 100 ml",
              qty: Number(parsedProd.qty || parsedProd.quantity || 1),
              unitPrice: typeof parsedProd.price === "number" ? parsedProd.price : 40
            };
          }
        });
        setOrderItems(mappedItems);
      } else {
        // Fallback default Ayvelin if nothing matched
        const defaultProd = products.find(p => p.name.toLowerCase().includes("ayvelin")) || products[0];
        setOrderItems([
          {
            productId: defaultProd ? defaultProd.id : "",
            productName: "Ayvelin 100 ml",
            qty: 1,
            unitPrice: 40
          }
        ]);
      }

      addToast({
        type: "success",
        title: "AI Analiz Uğurludur",
        content: "Sərbəst mətndən bütün sifariş, müştəri və məhsul məlumatları çıxarıldı!"
      });
      setShowAiBox(false);
    } catch (err: any) {
      console.error(err);
      addToast({
        type: "warning",
        title: "Analiz Xətası",
        content: "Məlumat çıxarılarkən xəta yarandı: " + err.message
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  // Sync isNewOrderOpen with internal state after variables are declared
  useEffect(() => {
    // Guard against resetting data when isNewOrderOpen is triggered from openEditSalePanel or during an active edit session
    if (isNewOrderOpen && !isPanelOpen && !editingSale) {
      openNewSalePanel();
    }
  }, [isNewOrderOpen]);

  useEffect(() => {
    if (!isPanelOpen) {
      setIsNewOrderOpen(false);
    }
  }, [isPanelOpen, setIsNewOrderOpen]);

  const openEditSalePanel = (sale: Sale) => {
    setEditingSale(sale);
    setCustomerId(sale.customerId || "");
    setCustomerName(sale.customerName || "");
    setCustomerPhone(sale.customerPhone || "");
    setSelectedAddress("");
    setCustomAddress(sale.address || "");
    setOrderItems(sale.items.map(i => ({
      productId: i.productId,
      productName: i.productName,
      qty: i.qty,
      unitPrice: i.unitPrice
    })));
    setDeliveryType(sale.deliveryType);
    setCourierId(sale.courierId || "");
    setCargoName(sale.cargoCompany || "");
    setDeliveryCost(sale.deliveryCost || 0);
    setDiscountAmount(sale.discountAmount || 0);
    setPaymentStatus(sale.paymentStatus || "Ödənilməyib");
    setNotes(sale.notes || "");
    setSaleStatus(sale.status);
    setSaleDate(sale.createdAt ? formatToBakuYMD(sale.createdAt) : getBakuTodayYMD());
    setPanelStep(1);
    setIsPanelOpen(true);
    setIsNewOrderOpen(true);
  };

  // Stepper handlers
  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...orderItems];
    if (field === "productId") {
      const p = products.find(prod => prod.id === value);
      if (p) {
        updated[index] = {
          productId: p.id,
          productName: p.name,
          qty: 1,
          unitPrice: p.price
        };
      }
    } else if (field === "qty") {
      updated[index].qty = Math.max(1, Number(value));
    } else if (field === "unitPrice") {
      updated[index].unitPrice = Math.max(0, Number(value));
    }
    setOrderItems(updated);
  };

  const addOrderItemRow = () => {
    setOrderItems([...orderItems, { productId: "", productName: "", qty: 1, unitPrice: 0 }]);
  };

  const removeOrderItemRow = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index));
    }
  };

  // Submit sale handler
  const handleFormSubmission = async () => {
    if ((deliveryType === "expargo" || deliveryType === "Azərpoçt") && !selectedBranchId) {
      addToast({
        type: "warning",
        title: "Filial seçilmədi",
        content: `${deliveryType} üçün filial seçilməlidir. Zəhmət olmasa filial seçin.`
      });
      return; // submit dayandır
    }

    if (deliveryCost === 0 && saleStatus === "çatdırılıb" && (courierId || cargoName || deliveryType !== "courier")) {
      // Toast ilə xəbərdar et (bloklama yox, yalnız bildiriş)
      addToast({
        type: "warning",
        title: "Çatdırılma xərci 0 ₼",
        content: "Çatdırılma xərci 0 ₼ olaraq qeydə alındı. Xərc yaradılmayacaq. Düzgündürsə davam edin."
      });
    }

    // 1. Save or locate customer addresses first
    let finalCustId = customerId;
    const finalAddress = customAddress || selectedAddress;

    if (!finalCustId) {
      // create new customer
      const autoId = `customer_${Date.now()}`;
      await saveCustomer({
        id: autoId,
        name: customerName,
        phone: customerPhone,
        addresses: finalAddress ? [finalAddress] : [],
        notes: "Sifariş qeydi əsasında avtomatik yaradıldı.",
        createdAt: new Date().toISOString()
      });
      finalCustId = autoId;
    }

    const itemsWithTotals = orderItems
      .filter(item => item.productId !== "")
      .map(item => ({
        ...item,
        total: item.qty * item.unitPrice
      }));

    if (itemsWithTotals.length === 0) {
      alert("Zəhmət olmasa minimum 1 məhsul əlavə edin.");
      return;
    }

    const selectedCourier = couriers.find(c => c.id === courierId);

    const payload = {
      customerId: finalCustId,
      customerName,
      customerPhone,
      address: finalAddress,
      items: itemsWithTotals,
      deliveryType,
      courierId: courierId || "",
      courierName: selectedCourier ? selectedCourier.name : "",
      cargoCompany: cargoName || "",
      deliveryCost,
      discountAmount,
      totalProductPrice: formSubtotal,
      totalAmount: formTotalAmount,
      netRevenue: formNetRevenue,
      status: saleStatus,
      paymentStatus,
      notes,
      createdAt: (!editingSale && saleDate === getBakuTodayYMD()) 
        ? new Date().toISOString() 
        : new Date(saleDate + "T12:00:00+04:00").toISOString(),
      source: (editingSale ? editingSale.source : "manual") as any
    };

    let targetSaleId = "";
    if (editingSale) {
      targetSaleId = editingSale.id;
      await updateSale(editingSale.id, payload);
      addToast({
        type: "success",
        title: "Sifariş Yeniləndi",
        content: `Sifariş #${editingSale.orderNumber} uğurla yeniləndi.`
      });
    } else {
      const newSaleId = await createSale(payload);
      targetSaleId = newSaleId || "";
      addToast({
        type: "success",
        title: "Sifariş Yaradıldı",
        content: "Yeni sifariş uğurla sistemə daxil edildi."
      });
    }

    // Handle persistent delivery record operations
    try {
      if (targetSaleId) {
        if (deliveryType === "expargo" || deliveryType === "Azərpoçt") {
          const provSlug = deliveryType === "expargo" ? "expargo" : "azerpost";
          const branchList = deliveryType === "expargo" ? expargoBranches : azerpostBranches;
          const branch = branchList.find(b => b.id === selectedBranchId);

          // Get latest orderNumber from DB if it is a new sale
          let orderNum = editingSale ? editingSale.orderNumber : "";
          if (!orderNum) {
            const saleDoc = await getDoc(doc(db, "sales", targetSaleId));
            if (saleDoc.exists()) {
              orderNum = saleDoc.data().orderNumber || "";
            }
          }

          // Determine zoneName
          let zoneName = "Rayonlar";
          if (branch) {
            if (provSlug === "expargo") {
              if (branch.region === "Bakı") {
                zoneName = "Bakı şəhər daxili";
              } else if (branch.region === "Sumqayıt") {
                zoneName = "Abşeron ərazisi";
              } else if (branch.region === "Naxçıvan") {
                zoneName = "Naxçıvan";
              } else {
                zoneName = "Rayonlar";
              }
            } else {
              if (branch.region === "Naxçıvan") {
                zoneName = "Naxçıvan";
              } else {
                zoneName = "Rayonlar";
              }
            }
          }

          const recordPayload = {
            id: `record_${targetSaleId}`,
            orderId: targetSaleId,
            orderNumber: orderNum,
            provider: provSlug,
            branchId: selectedBranchId || "",
            branchName: branch ? branch.name : (cargoName || ""),
            zoneName,
            cost: Number(deliveryCost || 0),
            status: saleStatus,
            createdAt: Timestamp.now()
          };

          await setDoc(doc(db, "deliveryRecords", `record_${targetSaleId}`), recordPayload);
        } else {
          // If deliveryType is courier or cargo, remove any connected deliveryRecord if it existed!
          await deleteDoc(doc(db, "deliveryRecords", `record_${targetSaleId}`));
        }
      }
    } catch (deliverError) {
      console.error("Error writing active deliveryRecord:", deliverError);
    }

    setIsPanelOpen(false);
  };

  // Date interval calculation for filters
  const dateBounds = useMemo(() => {
    const range = getBakuDateRange(dateFilter);
    return { startStr: range.start, endStr: range.end };
  }, [dateFilter]);

  // Filter lists with pre-compiled search terms and courier set for maximum speed
  const filteredSales = useMemo(() => {
    const cleanSearch = searchTerm.replace(/\D/g, "");
    const searchLower = searchTerm.toLowerCase();
    const formattedPhone = cleanSearch !== "" ? formatPhoneNumber(searchTerm) : "";
    const isSearching = searchTerm.trim() !== "";
    const startStr = dateBounds.startStr;
    const endStr = dateBounds.endStr;
    
    // Fast O(1) set of Columba depot courier IDs
    const columbaCourierIds = new Set(
      couriers.filter(c => c.isDepotBased === true).map(c => c.id)
    );

    return sales.filter(s => {
      // 1. Status check first (fastest fail)
      if (statusFilter !== "all" && s.status !== statusFilter) return false;

      // 2. Date check (fast string comparison)
      if (!isSearching) {
        const dateStr = getOrderReportingDateYMD(s);
        if (dateStr < startStr || dateStr > endStr) return false;
      }

      // 3. Search check
      if (isSearching) {
        if (cleanSearch !== "") {
          if (s.customerPhone.includes(cleanSearch) || (formattedPhone && s.customerPhone.includes(formattedPhone))) {
            return true;
          }
        }
        
        const isColumba = s.deliveryType === "courier" && s.courierId && columbaCourierIds.has(s.courierId);
        const hasColumbaInText = (s.notes && s.notes.toLowerCase().includes("columba")) || 
                                (s.courierName && s.courierName.toLowerCase().includes("columba")) || 
                                (s.cargoCompany && s.cargoCompany.toLowerCase().includes("columba"));
        
        const virtualSearchStr = `${s.orderNumber} ${s.customerName} ${s.customerPhone} ${s.address} ${s.notes || ""} ${s.courierName || ""} ${s.cargoCompany || ""} ${s.deliveryType || ""} ${isColumba || hasColumbaInText ? 'columba columba.az' : ''}`.toLowerCase();
        
        return virtualSearchStr.includes(searchLower);
      }

      return true;
    });
  }, [sales, searchTerm, statusFilter, dateBounds, couriers]);

  // Fast pagination to prevent browser freezing on large lists
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const paginatedSales = useMemo(() => {
    if (pageSize >= 99999) return filteredSales;
    const start = (currentPage - 1) * pageSize;
    return filteredSales.slice(start, start + pageSize);
  }, [filteredSales, currentPage, pageSize]);

  // Single-pass O(N) aggregation with O(1) product cost lookup
  const salesStats = useMemo(() => {
    const totalCount = filteredSales.length;
    let pendingCount = 0;
    let deliveredCount = 0;
    let totalAmountSum = 0;
    let totalDeliveryCost = 0;
    let totalNetRevenue = 0;
    let totalNetProfit = 0;

    // Pre-index product cost for O(1) lookup
    const productCostMap = new Map<string, number>();
    for (let i = 0; i < products.length; i++) {
      productCostMap.set(products[i].id, products[i].costPrice || 0);
    }

    for (let i = 0; i < totalCount; i++) {
      const s = filteredSales[i];
      if (s.status === "gözləyir") {
        pendingCount++;
      } else if (s.status === "çatdırılıb") {
        deliveredCount++;
        const amt = s.totalAmount || 0;
        const delCost = s.deliveryCost || 0;
        const netRev = s.netRevenue !== undefined ? s.netRevenue : (amt - delCost);

        totalAmountSum += amt;
        totalDeliveryCost += delCost;
        totalNetRevenue += netRev;

        let itemsCost = 0;
        if (s.items && s.items.length > 0) {
          for (let j = 0; j < s.items.length; j++) {
            const item = s.items[j];
            const costPrice = item.costPrice !== undefined ? item.costPrice : (productCostMap.get(item.productId) || 0);
            itemsCost += costPrice * (item.qty || 1);
          }
        }
        totalNetProfit += (amt - delCost - itemsCost);
      }
    }

    return {
      totalCount,
      pendingCount,
      deliveredCount,
      totalAmountSum,
      totalDeliveryCost,
      totalNetRevenue,
      totalNetProfit
    };
  }, [filteredSales, products]);

  // Select logic
  const handleToggleSelectRow = (id: string) => {
    if (selectedSales.includes(id)) {
      setSelectedSales(selectedSales.filter(x => x !== id));
    } else {
      setSelectedSales([...selectedSales, id]);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedSales.length === filteredSales.length) {
      setSelectedSales([]);
    } else {
      setSelectedSales(filteredSales.map(s => s.id));
    }
  };

  // Bulk status update
  const handleBulkStatusUpdate = async (newStatus: "gözləyir" | "çatdırılıb" | "ləğv edilib") => {
    if (selectedSales.length === 0) return;
    if (newStatus === "ləğv edilib") {
      const conf = window.confirm(`Seçilmiş ${selectedSales.length} sifarişi ləğv etmək istədiyinizə əminsiniz?`);
      if (!conf) return;
    }
    try {
      for (const id of selectedSales) {
        await updateSaleStatus(id, newStatus);
      }
      addToast({
        type: "success",
        title: "Toplu Status Yeniləndi",
        content: `${selectedSales.length} sifarişin statusu yeniləndi ✓`
      });
    } catch (err) {
      console.error(err);
    }
    setSelectedSales([]);
  };

  // Manual Telegram trigger function
  const handleTriggerTelegram = async (e: React.MouseEvent, sale: Sale) => {
    e.stopPropagation();
    const hasMsgId = !!(sale.telegram_message_id || sale.incomingTelegramMessageId || sale.telegramMessageId);

    setSendingTelegramId(sale.id);
    try {
      if (hasMsgId) {
        // Order is already in Telegram -> sync/update with current delivery status
        const ok = await syncOrderStatusToTelegram(sale, sale.status, sale.status);
        if (ok) {
          const statusLabel = sale.status === "çatdırılıb" ? "Çatdırıldı ✅" : sale.status === "ləğv edilib" ? "Ləğv olundu ❌" : "Gözləyir ⏳";
          addToast({
            type: "success",
            title: "Telegram Sinxronizasiyası",
            content: `Sifarişin mövcud statusu (${statusLabel}) Telegram-da yeniləndi ✓`
          });
        } else {
          addToast({
            type: "error",
            title: "Telegram Xətası",
            content: "Telegram mesajı yenilənə bilmədi. Zəhmət olmasa təkrar cəhd edin."
          });
        }
      } else {
        // Order not in Telegram yet -> send new order message
        const msgId = await sendTelegramNewOrder(sale);
        if (msgId) {
          await updateDoc(doc(db, "sales", sale.id), { 
            telegram_message_id: msgId,
            telegramMessageId: msgId 
          });
          addToast({
            type: "success",
            title: "Telegram",
            content: "Sifariş Telegram qrupuna uğurla göndərildi ✓"
          });
        } else {
          addToast({
            type: "error",
            title: "Telegram Xətası",
            content: "Telegram qrupuna göndəriş alınmadı. Ayarları yoxlayın."
          });
        }
      }
    } catch (err) {
      console.error(err);
      addToast({
        type: "error",
        title: "Telegram Xətası",
        content: "Xəta baş verdi. Zəhmət olmasa təkrar cəhd edin."
      });
    } finally {
      setSendingTelegramId(null);
    }
  };

  // Inline status updates with confirm guards
  const triggerStatusChange = async (saleId: string, oldStatus: string, targetStatus: "gözləyir" | "çatdırılıb" | "ləğv edilib", orderNumber: string) => {
    setActiveDropdownId(null);
    if (oldStatus === targetStatus) return;

    if (targetStatus === "ləğv edilib") {
      const msg = oldStatus === "çatdırılıb"
        ? "Bu sifarişi ləğv etmək istədiyinizə əminsiniz? (Gəlir geri alınacak, stok bərpa ediləcək və kuryer xərci silinəcək)"
        : "Bu sifarişi ləğv etmək istədiyinizə əminsiniz? (Gəlir hesablaması sıfırlanacaq və kuryer xərci silinəcək)";
      const conf = window.confirm(msg);
      if (!conf) return;
    } else if (oldStatus === "çatdırılıb" && targetStatus === "gözləyir") {
      const conf = window.confirm("Sifarişi yenidən gözləyir statusuna keçirmək istədiyinizə əminsiniz? (Xərclər və stok dəyişiklikləri geri alınacaq)");
      if (!conf) return;
    }

    try {
      await updateSaleStatus(saleId, targetStatus);
      addToast({
        type: "success",
        title: "Status Yeniləndi",
        content: `Sifariş #${orderNumber} statusu yeniləndi ✓`
      });
    } catch (err) {
      console.error(err);
    }
  };

  const triggerPrinter = (sale: Sale) => {
    setPrintTarget(sale);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-6 relative">

      {/* Sales Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">Toplam Sifariş</h4>
            <p className="text-lg font-extrabold text-slate-800 font-mono mt-0.5">{salesStats.totalCount} ədəd</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">Çatdırılmış</h4>
            <p className="text-lg font-extrabold text-slate-800 font-mono mt-0.5">{salesStats.deliveredCount} ədəd</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">Gözləyən</h4>
            <p className="text-lg font-extrabold text-slate-800 font-mono mt-0.5">{salesStats.pendingCount} ədəd</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">Cəmi Məbləğ</h4>
            <p className="text-lg font-extrabold text-slate-800 font-mono mt-0.5">{formatCurrency(salesStats.totalAmountSum)}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">Çatdırılma Xərci</h4>
            <p className="text-lg font-extrabold text-amber-700 font-mono mt-0.5">{formatCurrency(salesStats.totalDeliveryCost)}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">Yekun Xalis Gəlir</h4>
            <p className="text-lg font-extrabold text-emerald-700 font-mono mt-0.5">{formatCurrency(salesStats.totalNetRevenue)}</p>
            <p className="text-[9px] text-slate-400 font-mono">Mənfəət: {formatCurrency(salesStats.totalNetProfit)}</p>
          </div>
        </div>
      </div>
      
      {/* Search and control bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-5 bg-white rounded-2xl border border-slate-100 shadow-sm gap-4">
        
        <div className="flex flex-1 items-center gap-2 w-full max-w-lg bg-slate-100 px-3.5 py-2.5 rounded-xl border border-slate-200/50">
          <Search className="w-4.5 h-4.5 text-slate-400" />
          <input 
            type="text" 
            placeholder="Sifariş №, müştəri adı, telefon və ya ünvan axtar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-xs text-slate-700 w-full placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date interval filter */}
          <select 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-white border border-slate-200 text-xs px-3 py-[7px] rounded-xl text-slate-600 outline-none font-medium cursor-pointer focus:border-slate-300"
          >
            <option value="Bu ay">📅 Bu Ay</option>
            <option value="Bu gün">📅 Bu Gün</option>
            <option value="Son 3 gün">📅 Son 3 Gün</option>
            <option value="Son 1 Həftə">📅 Son 1 Həftə</option>
            <option value="Keçən Ay">📅 Keçən Ay</option>
            <option value="Son 3ay">📅 Son 3 Ay</option>
            <option value="Son 6ay">📅 Son 6 Ay</option>
            <option value="Bu il">📅 Bu İl</option>
            <option value="Bütün dövrlər">📅 Bütün Dövrlər</option>
          </select>

          {/* Status filters */}
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl text-slate-600 outline-none font-medium cursor-pointer"
          >
            <option value="all">Bütün Statuslar</option>
            <option value="gözləyir">🟡 Gözləyir</option>
            <option value="çatdırılıb">🟢 Çatdırılıb</option>
            <option value="ləğv edilib">🔴 Ləğv olundu</option>
          </select>

          {/* New Sale Button */}
          <button 
            onClick={openNewSalePanel}
            className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 active:scale-95 transition-all flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Yeni Sifariş
          </button>
        </div>
      </div>

      {/* Bulk Operations indicators */}
      {selectedSales.length > 0 && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between animate-fade-in">
          <span className="text-xs text-indigo-700 font-medium font-mono">
            ☑ {selectedSales.length} sifariş seçilmişdir
          </span>
          <div className="flex gap-1.5">
            <button 
              onClick={() => handleBulkStatusUpdate("çatdırılıb")}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-all"
            >
              ✓ Çatdırıldı Et
            </button>
            <button 
              onClick={() => handleBulkStatusUpdate("gözləyir")}
              className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg transition-all"
            >
              ⏱ Gözləyir Et
            </button>
            <button 
              onClick={() => handleBulkStatusUpdate("ləğv edilib")}
              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg transition-all"
            >
              ✗ Ləğv Et
            </button>
          </div>
        </div>
      )}

      {/* Major table catalog */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[11px] font-bold tracking-wider uppercase">
                <th className="py-4.5 px-5 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedSales.length === filteredSales.length && filteredSales.length > 0}
                    onChange={handleToggleSelectAll}
                    aria-label="Toggle select all sales"
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                </th>
                <th className="py-4.5 px-3 w-14">№</th>
                <th className="py-4.5 px-3">Tarix</th>
                <th className="py-4.5 px-4">Müştəri / Tel</th>
                <th className="py-4.5 px-4">Məhsul</th>
                <th className="py-4.5 px-4">Məbləğ / Gəlir</th>
                <th className="py-4.5 px-3 text-center">Çatdırılma Xərci</th>
                <th className="py-4.5 px-3">Kuryer/Kargo</th>
                <th className="py-4.5 px-4 w-32">Status</th>
                <th className="py-4.5 px-5 text-right">Əməliyyatlar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-medium italic">
                    Uyğun sifariş tapılmadı
                  </td>
                </tr>
              ) : (
                paginatedSales.map((sale) => {
                  const isCancelled = sale.status === "ləğv edilib";
                  const itemsSummary = sale.items.map(i => `${i.productName} (x${i.qty})`).join(", ");

                  return (
                    <tr 
                      key={sale.id}
                      className={`hover:bg-slate-50/70 transition-colors ${isCancelled ? 'opacity-45 italic line-through text-slate-400' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-5">
                        <input 
                          type="checkbox"
                          checked={selectedSales.includes(sale.id)}
                          onChange={() => handleToggleSelectRow(sale.id)}
                          aria-label={`Select row for order ${sale.orderNumber}`}
                          className="rounded text-indigo-600 focus:ring-0"
                        />
                      </td>

                      {/* Number & Telegram Trigger */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold font-mono text-slate-500">{formatDisplayOrderNumber(sale.orderNumber)}</span>
                          <button
                            onClick={(e) => handleTriggerTelegram(e, sale)}
                            disabled={sendingTelegramId === sale.id}
                            title={sale.telegram_message_id || sale.incomingTelegramMessageId || sale.telegramMessageId ? "Mövcud statusla Telegram-da güncəllə" : "Telegram kanalına göndər"}
                            className={`p-1 rounded-md transition-colors ${
                              sale.telegram_message_id || sale.incomingTelegramMessageId || sale.telegramMessageId
                                ? "text-emerald-400 bg-emerald-50 cursor-pointer"
                                : "text-sky-500 hover:bg-sky-50 active:bg-sky-100 cursor-pointer"
                            }`}
                          >
                            {sendingTelegramId === sale.id ? (
                              <svg className="animate-spin w-3.5 h-3.5 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      
                      {/* Date */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex flex-col text-left leading-normal">
                          <span className="text-[11px] font-bold text-slate-700 font-mono" title="Sifarişin qeydə alınma tarixi (Order Date)">
                            <span className="text-slate-400 text-[10px] mr-1 font-sans font-normal uppercase select-none">sif:</span>
                            {formatDateAZ(sale.order_date || sale.createdAt)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5" title="Sifarişin çatdırılma tarixi (Delivery Date)">
                            <span className="text-slate-400 text-[10px] mr-1 font-sans font-normal uppercase select-none">çat:</span>
                            {sale.delivery_date ? formatDateAZ(sale.delivery_date) : "—"}
                          </span>
                        </div>
                      </td>
                      
                      {/* Name / Phone */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div 
                            onClick={() => setHistoryCustomerPhone(sale.customerPhone)}
                            className="font-semibold text-slate-800 cursor-pointer hover:text-indigo-600 hover:underline inline-block"
                            title="Müştərinin bütün tarixçəsini göstər"
                          >
                            {sale.customerName}
                          </div>
                          {blacklistedPhonesSet.has((sale.customerPhone || "").replace(/\D/g, "")) && (
                            <span 
                              className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-extrabold rounded border border-rose-200 inline-flex items-center gap-0.5" 
                              title="Bu müştəri Qara Siyahıdadır (Sifarişləri ləğv edib)"
                            >
                              🚫 Qara Siyahı
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{sale.customerPhone}</div>
                      </td>

                      {/* Items */}
                      <td className="py-3 px-4 max-w-[200px] truncate" title={itemsSummary}>
                        {itemsSummary}
                      </td>

                      {/* Sums */}
                      <td className="py-3 px-4 font-bold font-mono text-slate-800 whitespace-nowrap">
                        {isCancelled ? (
                          "—"
                        ) : (
                          <div className="flex flex-col">
                            <span>{formatCurrency(sale.totalAmount)}</span>
                            <span className="text-[10px] text-emerald-600 font-mono font-semibold" title="Xalis Gəlir (Məbləğ - Çatdırılma Xərci)">
                              Gəlir: {formatCurrency(sale.netRevenue !== undefined ? sale.netRevenue : (sale.totalAmount - (sale.deliveryCost || 0)))}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Delivery badge & address */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${
                            sale.deliveryType === "courier" 
                              ? "bg-sky-50 text-sky-700" 
                              : sale.deliveryType === "expargo"
                              ? "bg-emerald-50 text-emerald-700"
                              : sale.deliveryType === "Azərpoçt"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-purple-50 text-purple-700"
                          }`}>
                            {sale.deliveryType === "courier" ? "Kuryer" : sale.deliveryType === "expargo" ? "Expargo" : sale.deliveryType === "Azərpoçt" ? "Azərpoçt" : "Kargo"}
                          </span>

                          {!isCancelled && (
                            <span className="text-[10px] font-bold font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60" title="Çatdırılma Xərci">
                              Xərc: {formatCurrency(sale.deliveryCost || 0)}
                            </span>
                          )}

                          {sale.address ? (
                            <span className="text-[10px] text-slate-500 font-medium max-w-[150px] truncate text-center" title={sale.address}>
                              {sale.address}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">—</span>
                          )}
                        </div>
                      </td>

                      {/* Cargo matches */}
                      <td className="py-3 px-3 truncate max-w-[120px]">
                        {sale.deliveryType === "courier" ? (sale.courierName || "—") : (sale.cargoCompany || "—")}
                      </td>

                      {/* INLINE STATUS BADGE WITH MULTIDROP DOWN CLICK */}
                      <td className="py-3 px-4 relative">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownId(activeDropdownId === sale.id ? null : sale.id);
                          }}
                          className={`px-3 py-1 rounded-full text-[10px] font-extrabold flex items-center justify-between gap-1 border border-transparent shadow-sm cursor-pointer whitespace-nowrap ${
                            sale.status === "çatdırılıb" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80" :
                            sale.status === "gözləyir" ? "bg-amber-50 text-amber-700 hover:bg-amber-100/80" :
                            "bg-red-50 text-red-700 hover:bg-red-100"
                          }`}
                        >
                          <span>
                            {sale.status === "çatdırılıb" ? "🟢 Çatdırılıb" :
                             sale.status === "gözləyir" ? "🟡 Gözləyir" :
                             "🔴 Ləğv olundu"}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </button>

                        {/* Dropdown Options */}
                        {activeDropdownId === sale.id && (
                          <div 
                            ref={dropdownRef}
                            className="absolute left-4 top-10 w-36 bg-white border border-slate-100 shadow-xl rounded-xl p-1 z-50 text-xs font-semibold focus:outline-none"
                          >
                            <button 
                              onClick={() => triggerStatusChange(sale.id, sale.status, "gözləyir", sale.orderNumber)}
                              className="w-full text-left py-2 px-3 text-amber-700 hover:bg-amber-50 rounded-lg flex items-center gap-1.5"
                            >
                              <span className="w-2 h-2 rounded-full bg-amber-400" /> Gözləyir
                            </button>
                            <button 
                              onClick={() => triggerStatusChange(sale.id, sale.status, "çatdırılıb", sale.orderNumber)}
                              className="w-full text-left py-2 px-3 text-emerald-700 hover:bg-emerald-50 rounded-lg flex items-center gap-1.5"
                            >
                              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Çatdırılıb
                            </button>
                            <button 
                              onClick={() => triggerStatusChange(sale.id, sale.status, "ləğv edilib", sale.orderNumber)}
                              className="w-full text-left py-2 px-3 text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-1.5"
                            >
                              <span className="w-2 h-2 rounded-full bg-red-500" /> Ləğv edilib
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Operations */}
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button 
                            onClick={() => openEditSalePanel(sale)}
                            title="Sifarişi Redaktə Et"
                            className="p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              const conf = window.confirm("Bu sifarişin surətini çıxarıb yeni gözləyir statuslu sifariş kimi kopyalamaq istəyirsiniz?");
                              if (conf) copySaleAsNew(sale);
                            }}
                            title="Sifarişi Kopyala"
                            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => triggerPrinter(sale)}
                            title="Səlahiyyətli Çap Görünüşü"
                            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              const conf = window.confirm(`Sifariş #${sale.orderNumber} silinsin? Sifariş silindikdə bağlı Avtomat-Çatdırılma xərcləri də birdəfəlik silinəcək.`);
                              if (conf) deleteSale(sale.id);
                            }}
                            title="Sil"
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot className="bg-slate-50/90 border-t-2 border-slate-200 text-xs font-bold text-slate-700">
              <tr>
                <td colSpan={5} className="py-3.5 px-5 text-right font-extrabold uppercase text-[11px] text-slate-500 tracking-wider">
                  Cəmi (Çatdırılmış Sifarişlər):
                </td>
                <td className="py-3.5 px-4 font-mono font-extrabold text-slate-900 whitespace-nowrap">
                  <div>{formatCurrency(salesStats.totalAmountSum)}</div>
                  <div className="text-[10px] text-emerald-600 font-semibold" title="Xalis Gəlir Cəmi">
                    Gəlir: {formatCurrency(salesStats.totalNetRevenue)}
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center font-mono font-extrabold text-amber-700 whitespace-nowrap">
                  <div className="bg-amber-100/80 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-200 inline-block shadow-2xs">
                    {formatCurrency(salesStats.totalDeliveryCost)}
                  </div>
                </td>
                <td colSpan={3} className="py-3.5 px-4 text-slate-500 text-[11px]">
                  Mənfəət: <span className="font-mono font-extrabold text-emerald-700 text-xs">{formatCurrency(salesStats.totalNetProfit)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredSales.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-50/70 border-t border-slate-200 text-xs text-slate-600 rounded-b-2xl select-none">
            <div className="flex items-center gap-2">
              <span>Göstərilir:</span>
              <span className="font-semibold text-slate-900 font-mono">
                {pageSize >= 99999 ? `1 - ${filteredSales.length}` : `${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredSales.length)}`}
              </span>
              <span>/ Cəmi: <strong className="text-slate-900 font-mono">{filteredSales.length}</strong> sifariş</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-400">Səhifədə:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none cursor-pointer font-medium text-slate-700 shadow-2xs"
                >
                  <option value={30}>30 ədəd</option>
                  <option value={50}>50 ədəd</option>
                  <option value={100}>100 ədəd</option>
                  <option value={99999}>Hamısı</option>
                </select>
              </div>

              {pageSize < 99999 && totalPages > 1 && (
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Əvvəlki səhifə"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 text-xs font-semibold text-slate-700 font-mono">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Növbəti səhifə"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4-Step Slide-in Panel directly mirroring MacOS Quick look / inspector */}
      <AnimatePresence>
        {isPanelOpen && (
          <>
            {/* Dark Backdrop overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPanelOpen(false)}
              className="fixed inset-0 bg-black z-[60]"
            />

            {/* Panel canvas */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] bg-white/95 backdrop-blur-lg border-l border-slate-200/50 shadow-2xl z-[70] flex flex-col"
            >
              {/* Header with macOS step bubbles */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    {editingSale ? `Sifariş № ${editingSale.orderNumber} Redaktə Et` : "Yeni Sifariş Formu"}
                  </h3>
                  <div className="flex gap-1.5 mt-2">
                    {[1, 2, 3, 4].map(num => (
                      <div 
                        key={num}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          panelStep >= num ? "w-8 bg-slate-800" : "w-2 bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => setIsPanelOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step body (Scroller) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                
                {/* STEP 1: CUSTOMER MATRIX */}
                {panelStep === 1 && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4 relative"
                  >
                    {/* AI Assistant Quick Filler Row */}
                    <div className="border border-indigo-100 bg-gradient-to-br from-indigo-50/20 via-white to-slate-50/40 rounded-2xl p-3.5 shadow-xs space-y-2.5">
                      <div className="flex justify-between items-center animate-fade-in">
                        <div className="flex items-center gap-1.5 text-slate-805 font-extrabold text-xs">
                          <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                          <span>AI Köməkçi Operator (Sərbəst Mətn)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAiBox(!showAiBox)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-extrabold flex items-center gap-0.5"
                        >
                          {showAiBox ? "Gizlə ✕" : "Aç ↗"}
                        </button>
                      </div>

                      {showAiBox ? (
                        <div className="space-y-2.5 animate-fade-in">
                          <p className="text-[10px] text-slate-500 leading-normal">
                            Müştəridən gələn mesajı və ya operator qeydini sərbəst şəkildə bura yapışdırın. AI müştəri adını, telefonunu, ünvanını və məhsul siyahısını dərhal çıxaracaq.
                          </p>
                          <textarea
                            rows={3}
                            placeholder="Məsələn: Əziz Allahverdiyev Xətai metrosu 0508095665"
                            value={aiInputText}
                            onChange={(e) => setAiInputText(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-indigo-500 focus:bg-white placeholder-slate-400 font-sans"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleParseAiOrder}
                              disabled={isAiLoading}
                              className="flex-1 py-1.5 bg-[#006bf8] hover:bg-[#005ad0] disabled:bg-[#006bf8]/50 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            >
                              {isAiLoading ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Analiz Edilir...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Analiz Et və Doldur</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAiInputText("");
                                setShowAiBox(false);
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-[11px] font-bold transition-all"
                            >
                              Sıfırla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          onClick={() => setShowAiBox(true)} 
                          className="text-[10px] text-slate-500 hover:text-indigo-650 cursor-pointer italic flex items-center gap-1.5 py-0.5"
                        >
                          <Bot className="w-4 h-4 text-indigo-400" />
                          <span>Mətndən bütün sifariş sahələrini AI ilə avtomatik doldurmaq üçün vurun...</span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl flex items-start gap-2.5">
                      <User className="w-4 h-4 text-slate-500 mt-1" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Addım 1: Müştəri Məlumatları</h4>
                        <p className="text-[10px] text-slate-400">Arxivdən nömrə ilə avtomatik tapın və ünvan daxil edin.</p>
                      </div>
                    </div>

                    {/* Date field */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Tarix</label>
                      <input 
                        type="date"
                        value={saleDate}
                        onChange={(e) => setSaleDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-slate-800"
                      />
                    </div>

                    {/* Phone Input with match warnings */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Telefon Nömrəsi</label>
                        {matchedCustomer && (
                          <button
                            type="button"
                            onClick={() => setShowHistoryPopup(true)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-extrabold underline flex items-center gap-1"
                          >
                            ⏱ Sifariş Tarixçəsi ({sales.filter(s => s.customerId === matchedCustomer.id).length})
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="Məs: +994503332211"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono outline-none focus:border-slate-800"
                        />
                        {matchedCustomer && (
                          <span className="absolute right-3 top-2.5 text-[9px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                            Müştəri tapıldı ✓
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Name Input + VIP badge */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Müştəri Adı</label>
                        {matchedCustomer?.isVIP && (
                          <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded animate-pulse">
                            🌟 VIP MÜŞTƏRİ
                          </span>
                        )}
                      </div>
                      <input 
                        type="text"
                        placeholder="Adı Daxil edin"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-slate-800"
                      />
                    </div>

                    {/* Blacklist Warning in Order Modal */}
                    {(matchedCustomer?.isBlacklisted || blacklistedPhonesSet.has(customerPhone.replace(/\D/g, ""))) && (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-900 shadow-xs">
                        <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-rose-900">⚠️ DİQQƏT: Bu müştəri QARA SİYAHIDADIR!</div>
                          <p className="text-[11px] text-rose-700 mt-0.5">
                            <strong>Səbəb:</strong> {matchedCustomer?.blacklistReason || "Əvvəlki sifarişləri ləğv edib"}
                          </p>
                          <p className="text-[10px] text-rose-600 font-semibold mt-1">
                            Qeyd: Müştəri əvvəl sifarişdən imtina edib. Göndərişdən əvvəl ödəniş və ya dəqiq təsdiq alın.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Address Autocomplete suggestion dropdown (Fills search requirement) */}
                    <div className="space-y-1 relative" ref={addressContainerRef}>
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Ünvan (AddressBook Axtarışlı)</label>
                        <span className="text-[8px] text-slate-400 font-mono">Arxivdə {addressBook.length} ünvan var</span>
                      </div>
                      <textarea 
                        placeholder="Axtarın və ya yeni ünvan yazın..."
                        rows={2}
                        value={customAddress}
                        onFocus={() => setIsAddressDropdownOpen(true)}
                        onChange={(e) => {
                          setCustomAddress(e.target.value);
                          setSelectedAddress("");
                          setIsAddressDropdownOpen(true);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-slate-800"
                      />

                      {/* Dropdown suggester box */}
                      {isAddressDropdownOpen && addressBook.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 shadow-2xl rounded-xl p-1.5 z-50 text-xs max-h-40 overflow-y-auto space-y-0.5">
                          {(() => {
                            const filterText = customAddress.trim().toLowerCase();
                            const matches = addressBook.filter(addr => addr.toLowerCase().includes(filterText));
                            if (matches.length === 0) {
                              return <p className="text-slate-400 text-[10px] italic p-2 text-center">Kitabçada uyğun gələn ünvan yoxdur. Sərbəst yaza bilərsiniz.</p>;
                            }
                            return matches.map((addr, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  setCustomAddress(addr);
                                  setSelectedAddress(addr);
                                  setIsAddressDropdownOpen(false);
                                }}
                                className="w-full text-left p-2 hover:bg-slate-100 hover:text-slate-900 rounded-lg text-slate-700 transition-colors border-b border-slate-50/50"
                              >
                                {addr}
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Duplicate phone history Popup */}
                    {showHistoryPopup && matchedCustomer && (
                      <div className="absolute inset-0 bg-slate-100/95 backdrop-blur-sm z-50 flex flex-col p-4 rounded-xl animate-fade-in border border-slate-200">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800">Müştəri Alış Tarixçəsi</h4>
                            <p className="text-[9px] text-slate-500">{matchedCustomer.name} ({matchedCustomer.phone})</p>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setShowHistoryPopup(false)}
                            className="text-[9px] bg-slate-200 hover:bg-slate-300 px-2.5 py-1 rounded text-slate-700 font-bold transition-all"
                          >
                            X Bağla
                          </button>
                        </div>

                        {/* Summary details */}
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="p-2 bg-white rounded-lg border border-slate-200/50 text-xs">
                            <p className="text-slate-400 text-[8px]">Sifariş sayı:</p>
                            <p className="font-bold text-slate-800">{matchedCustomer.orderCount} ədəd</p>
                          </div>
                          <div className="p-2 bg-white rounded-lg border border-slate-200/50 text-xs">
                            <p className="text-slate-400 text-[8px]">Yekun Alış:</p>
                            <p className="font-bold text-emerald-600">{formatCurrency(matchedCustomer.totalSpent)}</p>
                          </div>
                        </div>

                        {/* Past orders list */}
                        <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1">
                          {sales.filter(s => s.customerId === matchedCustomer.id).length === 0 ? (
                            <p className="text-center text-slate-400 text-[10px] py-6 italic">Əvvəlki sifariş tapılmadı.</p>
                          ) : (
                            sales.filter(s => s.customerId === matchedCustomer.id).map(o => (
                              <div key={o.id} className="p-2 bg-white hover:bg-slate-50/50 border border-slate-100 rounded-lg space-y-0.5 text-[10px]">
                                <div className="flex justify-between font-mono font-bold text-slate-700">
                                  <span>Sifariş {formatDisplayOrderNumber(o.orderNumber)}</span>
                                  <span>{formatCurrency(o.totalAmount)}</span>
                                </div>
                                <div className="text-[9px] text-slate-400 font-mono">{formatDateAZ(o.createdAt)}</div>
                                <div className="text-[9px] text-slate-500 truncate mt-0.5">
                                  {o.items.map(i => `${i.productName} (x${i.qty})`).join(", ")}
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-50 mt-1">
                                  <span className="capitalize text-[8px] text-slate-400">{o.deliveryType === "courier" ? "Kuryer" : "Kargo"}</span>
                                  <span className={`px-1 py-0.2 rounded text-[8px] font-bold ${
                                    o.status === "çatdırılıb" ? "bg-emerald-50 text-emerald-700" :
                                    o.status === "gözləyir" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                                  }`}>
                                    {o.status}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* STEP 2: PRODUCTS MATRIX */}
                {panelStep === 2 && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl flex items-start gap-2.5">
                      <Package className="w-4 h-4 text-slate-500 mt-1" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Addım 2: Məhsullar və Qiymətlər</h4>
                        <p className="text-[10px] text-slate-400">Çoxlu sətir əlavə edib stokları yoxlaya bilərsiniz.</p>
                      </div>
                    </div>

                    {/* Order Rows */}
                    <div className="space-y-3.5 max-h-[350px] overflow-auto pr-1">
                      {orderItems.map((item, index) => {
                        const activeProduct = products.find(p => p.id === item.productId);
                        const isOutOfStock = activeProduct && activeProduct.stock <= 0;
                        const isLowStock = activeProduct && activeProduct.stock <= activeProduct.lowStockThreshold;

                        return (
                          <div key={index} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative">
                            {orderItems.length > 1 && (
                              <button 
                                onClick={() => removeOrderItemRow(index)}
                                className="absolute right-2 top-2 p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                                aria-label={`Remove product row ${index + 1}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Dropdown */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400">Məhsul Seç</label>
                              <select
                                value={item.productId}
                                onChange={(e) => handleItemChange(index, "productId", e.target.value)}
                                className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none"
                              >
                                <option value="">Seçin...</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} (Stok: {p.stock} | {formatCurrency(p.price)})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Alert indicators */}
                            {activeProduct && (
                              <div className="flex gap-2 text-[10px]">
                                {isOutOfStock ? (
                                  <span className="text-red-600 font-bold flex items-center gap-0.5">
                                    <AlertTriangle className="w-3 h-3" /> Stok Tükənib!
                                  </span>
                                ) : isLowStock ? (
                                  <span className="text-amber-600 font-bold flex items-center gap-0.5">
                                    <AlertTriangle className="w-3 h-3" /> Az Stok Qalığı ({activeProduct.stock})
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 font-bold">✓ Rafda var ({activeProduct.stock} ədəd)</span>
                                )}
                              </div>
                            )}

                            {/* Qty and price adjustments */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400">Miqdar</label>
                                <input 
                                  type="number"
                                  min={1}
                                  value={item.qty}
                                  onChange={(e) => handleItemChange(index, "qty", e.target.value)}
                                  className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs outline-none"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400">Vahid Qiymət (₼)</label>
                                <input 
                                  type="number"
                                  min={0}
                                  value={item.unitPrice}
                                  onChange={(e) => handleItemChange(index, "unitPrice", e.target.value)}
                                  className="w-full bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono outline-none"
                                />
                              </div>
                            </div>

                            {/* costPrice & margin business insights */}
                            {activeProduct && (
                              <div className="text-[9px] text-slate-400 flex justify-between pt-1 border-t border-slate-100 font-mono">
                                <span>Maya: {formatCurrency(activeProduct.costPrice)}</span>
                                <span className={item.unitPrice >= activeProduct.costPrice ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                                  Mənfəət: {formatCurrency(item.unitPrice - activeProduct.costPrice)} / sətir
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button 
                      onClick={addOrderItemRow}
                      className="w-full py-2 border border-dashed border-slate-300 hover:border-slate-500 rounded-xl text-xs text-slate-500 font-medium transition-all"
                    >
                      + Mövcud Sifarişə Başqa Məhsul Əlavə Et
                    </button>
                    
                    {/* Sums breakdown widget */}
                    <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2.5 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Məhsul Cəmi:</span>
                        <span className="font-semibold">{formatCurrency(formSubtotal)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-yellow-400">
                          <span className="text-slate-400">Endirim:</span>
                          <span>-{formatCurrency(discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-400">
                        <span>Çatdırılma Xərci (Addım 3-də):</span>
                        <span>{formatCurrency(deliveryCost)}</span>
                      </div>
                      <div className="border-t border-slate-800 my-1" />
                      <div className="flex justify-between text-emerald-400 font-semibold">
                        <span>Xalis Gəlir:</span>
                        <span>{formatCurrency(formNetRevenue)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-2 text-sm font-bold">
                        <span>Yekun Məbləğ:</span>
                        <span className="text-yellow-400">{formatCurrency(formTotalAmount)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: SHIPPING CORNER */}
                {panelStep === 3 && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl flex items-start gap-2.5">
                      <Truck className="w-4 h-4 text-slate-500 mt-1" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Addım 3: Çatdırılma Seçimi</h4>
                        <p className="text-[10px] text-slate-400">Kuryer, Kargo və ya Expargo seçiminizi edin.</p>
                      </div>
                    </div>

                    {/* Radio boxes */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button 
                        type="button"
                        onClick={() => {
                          setDeliveryType("courier");
                          setCargoName("");
                          setDeliveryCost(0);
                        }}
                        className={`p-2.5 border rounded-xl text-left transition-all ${
                          deliveryType === "courier" 
                            ? "border-slate-800 bg-indigo-50/50 text-indigo-950 border-indigo-200" 
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-bold text-xs block">🚴 Kuryer</span>
                        <span className="text-[9px] text-slate-400 mt-0.5 block">Kuryer təyin edin</span>
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          setDeliveryType("cargo");
                          setCourierId("");
                          setCargoName("");
                          setDeliveryCost(0);
                        }}
                        className={`p-2.5 border rounded-xl text-left transition-all ${
                          deliveryType === "cargo" 
                            ? "border-slate-800 bg-indigo-50/50 text-indigo-950 border-indigo-200" 
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-bold text-xs block">📦 Kargo</span>
                        <span className="text-[9px] text-slate-400 mt-0.5 block">Kargo firmaları</span>
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          setDeliveryType("expargo");
                          setCourierId("");
                          setCargoName("");
                          setSelectedBranchId("");
                          setDeliveryCost(0);
                        }}
                        className={`p-2.5 border rounded-xl text-left transition-all ${
                          deliveryType === "expargo" 
                            ? "border-slate-800 bg-indigo-50/50 text-indigo-950 border-indigo-200" 
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-bold text-xs block">✈️ Expargo</span>
                        <span className="text-[9px] text-slate-400 mt-0.5 block">Expargo filialı</span>
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          setDeliveryType("Azərpoçt");
                          setCourierId("");
                          setCargoName("");
                          setSelectedBranchId("");
                          setDeliveryCost(0);
                        }}
                        className={`p-2.5 border rounded-xl text-left transition-all ${
                          deliveryType === "Azərpoçt" 
                            ? "border-slate-800 bg-indigo-50/50 text-indigo-950 border-indigo-200" 
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-bold text-xs block">✉️ Azərpoçt</span>
                        <span className="text-[9px] text-slate-400 mt-0.5 block">Azərpoçt filialı</span>
                      </button>
                    </div>

                    {/* Conditionally display option inputs */}
                    {deliveryType === "courier" && (
                       <div className="space-y-3.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Aktiv Kuryer</label>
                          <select
                            value={courierId}
                            onChange={(e) => {
                              const newCourierId = e.target.value;
                              setCourierId(newCourierId);
                              const courier = couriers.find(c => c.id === newCourierId);
                              if (courier && courier.standardDeliveryFee !== undefined) {
                                setDeliveryCost(courier.standardDeliveryFee);
                              }
                            }}
                            className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-slate-800"
                          >
                            <option value="">Seçin...</option>
                            {couriers.filter(c => c.status === "active").map(c => (
                              <option key={c.id} value={c.id}>{c.name} (Tel: {c.phone})</option>
                            ))}
                          </select>
                        </div>
                        {courierId && (
                          <div className="text-[10px] text-slate-400 font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200/40">
                            Kuryer Telefonu: {couriers.find(c => c.id === courierId)?.phone}
                          </div>
                        )}
                      </div>
                    )}

                    {deliveryType === "cargo" && (
                       <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Kargo Şirkətinin Adı</label>
                        <input 
                          type="text"
                          placeholder="Məs: 166 Kargo, Baku Cargo"
                          value={cargoName}
                          onChange={(e) => setCargoName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-slate-800"
                        />
                      </div>
                    )}

                    {deliveryType === "expargo" && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Expargo Filialı Seçi̇mi̇</label>
                        <SearchableSelect 
                          placeholder="Filial seçin..."
                          value={selectedBranchId}
                          onChange={(val) => handleBranchSelect(val, "expargo")}
                          options={expargoBranches.map(b => ({
                            id: b.id,
                            label: `${b.name} (${b.region} — ${b.address})`
                          }))}
                        />
                      </div>
                    )}

                    {deliveryType === "Azərpoçt" && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Azərpoçt Şöbə Seçi̇mi̇</label>
                        <SearchableSelect 
                          placeholder="Şöbə seçin..."
                          value={selectedBranchId}
                          onChange={(val) => handleBranchSelect(val, "azerpost")}
                          options={azerpostBranches.map(b => ({
                            id: b.id,
                            label: `${b.name} (${b.region} — ${b.address})`
                          }))}
                        />
                      </div>
                    )}

                    {/* Yandex Map of selected branch */}
                    {(() => {
                      const branchData = deliveryType === "expargo" 
                        ? expargoBranches.find(b => b.id === selectedBranchId)
                        : deliveryType === "Azərpoçt"
                          ? azerpostBranches.find(b => b.id === selectedBranchId)
                          : null;

                      if (!branchData) return null;
                      
                      const searchQuery = encodeURIComponent(`${branchData.region} ${branchData.address} ${branchData.name}`);

                      return (
                        <div className="w-full h-48 rounded-xl overflow-hidden border border-slate-200 shadow-inner shrink-0 relative bg-slate-100 flex flex-col items-center justify-center -mt-2 mb-2">
                          <iframe 
                            src={`https://yandex.ru/map-widget/v1/?text=${searchQuery}`} 
                            width="100%" 
                            height="100%" 
                            frameBorder="0"
                            allowFullScreen={true}
                            style={{ position: 'relative' }}
                          ></iframe>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-2 gap-3">
                      {/* Delivery charge */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Çatdırılma Qiyməti (₼)</label>
                        <input 
                          type="number"
                          min={0}
                          step="0.1"
                          value={deliveryCost}
                          onChange={(e) => setDeliveryCost(Math.max(0, Number(e.target.value)))}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono outline-none focus:border-slate-800"
                        />
                      </div>

                      {/* Discount Amount */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Endirim Məbləği (₼)</label>
                        <input 
                          type="number"
                          min={0}
                          step="0.1"
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                          className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs font-mono outline-none focus:border-slate-800"
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Kuryer və Sifariş Qeydləri</label>
                      <textarea 
                        placeholder="Məs: Kodu 412. Giriş 2-ci blok."
                        rows={2.5}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none focus:border-slate-800"
                      />
                    </div>
                  </motion.div>
                )}

                {/* STEP 4: FINAL MATRIX REVIEW */}
                {panelStep === 4 && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl flex items-start gap-2.5">
                      <FileCheck className="w-4 h-4 text-slate-500 mt-1" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Addım 4: Sifariş İcmalı</h4>
                        <p className="text-[10px] text-slate-400">Bütün məlumatları son kez yoxlayıb təsdiqləyin.</p>
                      </div>
                    </div>

                    {/* Info rows */}
                    <div className="p-4 bg-slate-50 rounded-xl space-y-2.5 text-xs">
                      <div>
                        <span className="text-slate-400">Müştəri:</span>{" "}
                        <span className="font-bold text-slate-800">{customerName} ({customerPhone})</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Çatdırılma Yeri:</span>{" "}
                        <span className="font-semibold text-slate-800">{customAddress || selectedAddress}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Yol Növü:</span>{" "}
                        <span className="font-bold text-slate-800">
                          {deliveryType === "courier" ? `Kuryer: ${couriers.find(c => c.id === courierId)?.name || 'Təyin edilməyib'}` : deliveryType === "expargo" ? "Expargo beynəlxalq" : `Kargo: ${cargoName || 'Təyin edilməyib'}`}
                        </span>
                      </div>
                      <div className="border-t border-slate-200 pt-2 font-mono">
                        <span className="text-slate-400">Sifariş Olunan Kateqoriyalar:</span>
                        <div className="mt-1 space-y-1">
                          {orderItems.filter(i => i.productId !== "").map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[11px]">
                              <span>{item.productName} (x{item.qty})</span>
                              <span>{formatCurrency(item.qty * item.unitPrice)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Live calculation result table cards */}
                    <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Məhsul Cəmi:</span>
                        <span>{formatCurrency(formSubtotal)}</span>
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-yellow-400">
                          <span className="text-slate-400">Endirim:</span>
                          <span>-{formatCurrency(discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Çatdırılma Xərci:</span>
                        <span>{formatCurrency(deliveryCost)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-2">
                        <span className="text-emerald-400">Xalis Məhsul Gəliri:</span>
                        <span className="text-emerald-400">{formatCurrency(formNetRevenue)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold mt-1">
                        <span>Yekun Ödəniləcək:</span>
                        <span className="text-yellow-400">{formatCurrency(formTotalAmount)}</span>
                      </div>
                    </div>

                    {/* Payment choices */}
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        type="button"
                        onClick={() => setPaymentStatus("Ödənilib")}
                        className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                          paymentStatus === "Ödənilib" 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800" 
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        ✓ Ödənilib
                      </button>

                      <button 
                        type="button"
                        onClick={() => setPaymentStatus("Ödənilməyib")}
                        className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                          paymentStatus === "Ödənilməyib" 
                            ? "border-amber-500 bg-amber-50 text-amber-800" 
                            : "border-slate-200 text-slate-500"
                        }`}
                      >
                        ⏱ Ödənilməyib
                      </button>
                    </div>

                    {/* Status configuration */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Sifarişin Cari Statusu</label>
                      <select
                        value={saleStatus}
                        onChange={(e) => setSaleStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs outline-none"
                      >
                        <option value="gözləyir">🟡 Gözləyir (Default)</option>
                        <option value="çatdırılıb">🟢 Çatdırılıb (Gəlir hesablanır/Anbardan çıxılır)</option>
                        <option value="ləğv edilib">🔴 Ləğv olundu</option>
                      </select>
                    </div>
                  </motion.div>
                )}

              </div>

              {/* Step footer controls */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPanelStep(Math.max(1, panelStep - 1))}
                  disabled={panelStep === 1}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4 inline mr-1" /> Geri
                </button>

                {panelStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (panelStep === 1 && !customerName) {
                        alert("Müştəri adını daxil edin.");
                        return;
                      }
                      setPanelStep(panelStep + 1);
                    }}
                    className="px-5 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700"
                  >
                    Növbəti <ChevronRight className="w-4 h-4 inline ml-1" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFormSubmission}
                    className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-950 flex items-center gap-1 shadow-md"
                  >
                    ✓ {editingSale ? "Dəyişiklikləri Yadda Saxla" : "Sifarişi Təsdiqlə"}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hidden printable Invoice design block */}
      {printTarget && (
        <div className="hidden print:block p-10 space-y-6 text-black" id="printable-invoice">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-xl font-bold">AYVELIN BIZNES IDARƏETMƏ</h2>
              <p className="text-xs text-slate-500">Sifariş Hesab Fakturası</p>
            </div>
            <div className="text-right">
              <h3 className="text-base font-bold font-mono">Sifariş № {printTarget.orderNumber}</h3>
              <p className="text-xs text-slate-500">{formatDateAZ(printTarget.createdAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-bold text-slate-500">Müştəri:</p>
              <h4 className="font-bold text-sm mt-0.5">{printTarget.customerName}</h4>
              <p>{printTarget.customerPhone}</p>
              <p className="mt-1">{printTarget.address}</p>
            </div>
            <div>
              <p className="font-bold text-slate-500">Çatdırılma Yeri:</p>
              <p className="mt-0.5">{printTarget.deliveryType === "courier" ? "🚴 Kuryer çatdırılması" : printTarget.deliveryType === "expargo" ? "✈️ Expargo beynəlxalq" : printTarget.deliveryType === "Azərpoçt" ? "✉️ Azərpoçt çatdırılması" : "📦 Kargo"}</p>
              <p className="mt-1">Kuryer/Şirkət: {printTarget.deliveryType === "courier" ? (printTarget.courierName || "—") : (printTarget.cargoCompany || "—")}</p>
              <p className="mt-1 text-emerald-600 font-bold">Ödəniş: {printTarget.paymentStatus}</p>
            </div>
          </div>

          <table className="w-full text-left border-collapse border mt-6 text-xs">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="p-3">Sıra</th>
                <th className="p-3">Məhsul</th>
                <th className="p-3 text-center">Miqdar</th>
                <th className="p-3 text-right">Vahid Qiymət</th>
                <th className="p-3 text-right">Cəmi</th>
              </tr>
            </thead>
            <tbody>
              {printTarget.items.map((item, index) => (
                <tr key={index} className="border-b">
                  <td className="p-3">{index + 1}</td>
                  <td className="p-3 font-semibold">{item.productName}</td>
                  <td className="p-3 text-center font-mono">{item.qty}</td>
                  <td className="p-3 text-right font-mono">{formatCurrency(item.unitPrice)}</td>
                  <td className="p-3 text-right font-mono">{formatCurrency(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span>Məhsul Cəmi:</span>
                <span>{formatCurrency(printTarget.totalProductPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Çatdırılma Xərci:</span>
                <span>{formatCurrency(printTarget.deliveryCost)}</span>
              </div>
              {printTarget.discountAmount && printTarget.discountAmount > 0 ? (
                <div className="flex justify-between text-slate-600">
                  <span>Endirim:</span>
                  <span>-{formatCurrency(printTarget.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-slate-300 pt-2 text-sm font-bold">
                <span>Yekun Məbləğ:</span>
                <span>{formatCurrency(printTarget.totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-dashed mt-12 pt-4 text-center text-[10px] text-slate-400">
            Ayvelin ERP sistemi ilə avtomatlaşdırılmışdır. Sənədi təsdiqlədi: {printTarget.source} sistem.
          </div>
        </div>
      )}

      {/* Customer Alış Tarixçəsi Modal */}
      <AnimatePresence>
        {historyCustomerPhone && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryCustomerPhone(null)}
              className="fixed inset-0 bg-black z-[60]"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-x-4 top-10 bottom-10 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:h-auto md:max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 overflow-y-auto z-[70] flex flex-col font-sans"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Müştəri Alış Tarixçəsi: {historyCustomerName}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{historyCustomerPhone}</p>
                </div>
                <button
                  onClick={() => setHistoryCustomerPhone(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Aggregated Stats Card */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Toplam Sifariş</div>
                  <div className="text-2xl font-bold text-slate-800 mt-1 font-mono">
                    {historySales.length}
                  </div>
                </div>
                <div className="bg-indigo-50/55 p-4 rounded-2xl border border-indigo-100/30">
                  <div className="text-[10px] uppercase font-bold text-indigo-500">Ümumi Alış (Çatdırılıb)</div>
                  <div className="text-2xl font-bold text-indigo-600 mt-1 font-mono">
                    {formatCurrency(historySales.filter(s => s.status === "çatdırılıb").reduce((acc, s) => acc + s.totalAmount, 0))}
                  </div>
                </div>
                <div className="bg-emerald-50/55 p-4 rounded-2xl border border-emerald-100/30">
                  <div className="text-[10px] uppercase font-bold text-emerald-600">Tamamlanan Silsilə</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
                    {historySales.filter(s => s.status === "çatdırılıb").length} / {historySales.length}
                  </div>
                </div>
              </div>

              {/* Order Data List */}
              <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Sifariş №</th>
                      <th className="py-3 px-3">Tarix</th>
                      <th className="py-3 px-4">Məhsullar</th>
                      <th className="py-3 px-3 text-right">Məbləğ</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                    {historySales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-slate-400 italic">
                          Tarixçə tapılmadı
                        </td>
                      </tr>
                    ) : (
                      historySales.map((saleItem) => {
                        const isCancelled = saleItem.status === "ləğv edilib";
                        const itemsSummary = saleItem.items.map(i => `${i.productName} (x${i.qty})`).join(", ");
                        return (
                          <tr key={saleItem.id} className={isCancelled ? "opacity-45 line-through italic" : "hover:bg-slate-50/50"}>
                            <td className="py-3 px-4 font-bold font-mono text-slate-500">{formatDisplayOrderNumber(saleItem.orderNumber)}</td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="flex flex-col text-left leading-normal">
                                <span className="text-[11px] font-bold text-slate-600 font-mono" title="Sifarişin qeydə alınma tarixi (Order Date)">
                                  <span className="text-slate-400 text-[10px] mr-1 font-sans font-normal uppercase select-none">sif:</span>
                                  {formatDateAZ(saleItem.order_date || saleItem.createdAt)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5" title="Sifarişin çatdırılma tarixi (Delivery Date)">
                                  <span className="text-slate-400 text-[10px] mr-1 font-sans font-normal uppercase select-none">çat:</span>
                                  {saleItem.delivery_date ? formatDateAZ(saleItem.delivery_date) : "—"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 max-w-[220px] truncate animate-fade" title={itemsSummary}>{itemsSummary}</td>
                            <td className="py-3 px-3 font-bold font-mono text-slate-800 text-right">
                              {isCancelled ? "—" : formatCurrency(saleItem.totalAmount)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold ${
                                saleItem.status === "çatdırılıb" ? "bg-emerald-50 text-emerald-700" :
                                saleItem.status === "gözləyir" ? "bg-amber-50 text-amber-700" :
                                "bg-red-50 text-red-700"
                              }`}>
                                {saleItem.status === "çatdırılıb" ? "Çatdırılıb" :
                                 saleItem.status === "gözləyir" ? "Gözləyir" :
                                 "Ləğv edilib"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Note / Action footer */}
              <div className="mt-4 pt-3 flex justify-end">
                <button
                  onClick={() => setHistoryCustomerPhone(null)}
                  className="px-5 py-2 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-500"
                >
                  Bağla
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
