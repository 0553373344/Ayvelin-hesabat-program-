export interface Customer {
  id: string;
  name: string;
  phone: string;
  addresses: string[];
  notes?: string;
  createdAt: string;
  isVIP: boolean;
  orderCount: number;
  totalSpent: number;
  firstOrderDate?: string;
  lastOrderDate?: string;
  googleContactResourceName?: string;
  altPhone?: string;
  city?: string;
  region?: string;
  tags?: string[];
  isBlacklisted?: boolean;
  blacklistReason?: string;
  blacklistedAt?: string;
  loyaltyPointsAdjustment?: number;
  spentPoints?: number;
  redeemedRewards?: {
    id: string;
    rewardId: string;
    rewardName: string;
    pointsCost: number;
    code: string;
    redeemedAt: string;
    status: "active" | "used" | "cancelled";
  }[];
}

export interface StockHistoryItem {
  date: string;
  change: number; // e.g. +10, -5
  reason: "Alış" | "Qaytarılma" | "Ziyan" | "Düzəliş" | "Sifariş Çatdırıldı" | "Sifariş Ləğv Edildi" | "Digər" | string;
  note?: string;
}

export interface Product {
  id: string;
  name: string;
  SKU: string;
  category: string;
  price: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  imageUrl?: string;
  stockHistory: StockHistoryItem[];
  notes?: string;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
  status: "active" | "inactive";
  standardDeliveryFee: number;
  stockBalance: number;
  totalDeliveries: number;
  totalEarnings: number;
  stock_quantity?: number; // Added for depot Stock
  isDepotBased?: boolean; // Columba kimi depolu kuryer üçün
}

export interface SaleItem {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface StatusHistoryItem {
  status: "gözləyir" | "çatdırılıb" | "ləğv edilib";
  changedAt: string;
}

export interface Sale {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  items: SaleItem[];
  deliveryType: "courier" | "cargo" | "expargo" | "Azərpoçt";
  courierId?: string;
  courierName?: string;
  cargoCompany?: string;
  deliveryProvider?: string;
  deliveryBranchId?: string;
  deliveryBranchName?: string;
  deliveryZone?: string;
  deliveryCost: number;
  totalProductPrice: number;
  totalAmount: number;
  netRevenue: number; // totalProductPrice - deliveryCost (netProductRevenue)
  status: "gözləyir" | "çatdırılıb" | "ləğv edilib";
  paymentStatus: string;
  notes?: string;
  createdAt: string;
  deliveredAt?: string;
  order_created_at?: string;
  order_date?: any;
  delivery_date?: any;
  isRevenueCalculated: boolean;
  statusHistory: StatusHistoryItem[];
  source: "manual" | "import";
  discountAmount?: number; // added discount info
  telegramMessageId?: string;
  telegram_message_id?: string;
  incomingTelegramMessageId?: string;
}

export interface DeliveryProvider {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  logoUrl?: string;
  totalDeliveries: number;
  totalCost: number;
  createdAt?: any;
}

export interface DeliveryBranch {
  id: string;
  provider: "expargo" | "azerpost";
  name: string;
  region: string;
  address: string;
  phone?: string;
  isActive: boolean;
  createdAt?: any;
}

export interface DeliveryTariff {
  id: string;
  provider: "expargo" | "azerpost";
  zoneName: string;
  price: number;
  updatedAt?: any;
}

export interface DeliveryRecord {
  id: string;
  orderId: string;
  orderNumber?: string;
  provider: "expargo" | "azerpost" | "courier";
  branchId?: string;
  branchName?: string;
  zoneName?: string;
  cost: number;
  status: "pending" | "inTransit" | "delivered" | "cancelled";
  createdAt?: any;
}

export interface StockTransfer {
  id: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  category: string;
  paymentMethod: string;
  date: string;
  notes?: string;
  source: "manual" | "auto_delivery";
  linkedOrderId?: string;
  linkedOrderNumber?: string;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  pointsCost: number;
  description?: string;
}

export interface Settings {
  id: string; // e.g. "general"
  businessName: string;
  currency: string;
  lowStockThreshold: number;
  vipThreshold: number;
  expenseCategories: string[];
  productCategories: string[];
  logoUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  loyaltyRatio?: number; // AZN spent for 1 Point
  loyaltyRewards?: LoyaltyReward[];
}

export interface Toast {
  id: string;
  type: "success" | "warning" | "info";
  title: string;
  content: string;
}

