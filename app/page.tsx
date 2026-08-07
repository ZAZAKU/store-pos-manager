"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Category = {
  id: string;
  name: string;
  color: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
  categoryId: string;
};

type CartItem = {
  productId: string;
  quantity: number;
};

type PaymentMethod = "card" | "cash" | "transfer";
type ReservationStatus = "reserved" | "confirmed" | "preparing" | "delivering" | "done" | "cancelled";
type ReservationPaymentStatus = "paid" | "partial" | "unpaid" | "refunded";

type SaleLine = {
  productId: string;
  name: string;
  categoryName: string;
  price: number;
  quantity: number;
  total: number;
};

type DayRecordLine = SaleLine & {
  id: string;
  paymentMethod: PaymentMethod;
};

type Sale = {
  id: string;
  soldAt: string;
  cancelledAt?: string;
  paymentMethod?: PaymentMethod;
  lines: SaleLine[];
  total: number;
};

type Purchase = {
  id: string;
  purchasedAt: string;
  cancelledAt?: string;
  paymentMethod?: PaymentMethod;
  memo: string;
  lines: SaleLine[];
  total: number;
};

type DayRecord = {
  date: string;
  note: string;
  card: number;
  cash: number;
  transfer: number;
  lines?: DayRecordLine[];
};

type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  addressDetail?: string;
  birthday?: string;
  memo?: string;
};

type Reservation = {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerAddressDetail?: string;
  deliveryTime?: string;
  memo: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: ReservationPaymentStatus;
  status?: ReservationStatus;
  lines: DayRecordLine[];
  total: number;
  completedAt?: string;
};

type RankItem = {
  name: string;
  quantity: number;
  total: number;
};

type AppView = "sales" | "purchase" | "reservation";
type ProductSort = "createdDesc" | "createdAsc" | "nameAsc" | "nameDesc" | "priceAsc" | "priceDesc";

type StoredData = {
  categories?: Category[];
  products?: Product[];
  purchaseCategories?: Category[];
  purchaseProducts?: Product[];
  sales?: Sale[];
  purchases?: Purchase[];
  dayRecords?: DayRecord[];
  customers?: Customer[];
  reservations?: Reservation[];
  activeCategory?: string;
  purchaseActiveCategory?: string;
  productSort?: ProductSort;
  updatedAt?: string;
};

type SyncState = "checking" | "cloud" | "local";

const STORAGE_KEY = "store-pos-v1";
const STORAGE_BACKUP_KEY = "store-pos-v1-backup";
const MAX_CATEGORIES = 10;
const colors = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#be123c", "#4f46e5", "#0f766e", "#a16207"];

const seedCategories: Category[] = [
  { id: "cat-drink", name: "음료", color: "#2563eb" },
  { id: "cat-food", name: "식사", color: "#16a34a" },
  { id: "cat-dessert", name: "디저트", color: "#ea580c" },
];

const seedProducts: Product[] = [
  { id: "prod-americano", name: "아메리카노", price: 3500, categoryId: "cat-drink" },
  { id: "prod-latte", name: "카페라떼", price: 4500, categoryId: "cat-drink" },
  { id: "prod-sandwich", name: "샌드위치", price: 6500, categoryId: "cat-food" },
  { id: "prod-cake", name: "조각 케이크", price: 5800, categoryId: "cat-dessert" },
];

const formatter = new Intl.NumberFormat("ko-KR");
const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", { weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const paymentLabels: Record<PaymentMethod, string> = {
  card: "카드",
  cash: "현금",
  transfer: "계좌이체",
};

const reservationStatusLabels: Record<ReservationStatus, string> = {
  reserved: "예약",
  confirmed: "예약확정",
  preparing: "배송준비",
  delivering: "배송중",
  done: "배송완료",
  cancelled: "취소",
};

const reservationPaymentStatusLabels: Record<ReservationPaymentStatus, string> = {
  paid: "결제완료",
  partial: "일부결제",
  unpaid: "미결제",
  refunded: "환불",
};

const productSortLabels: Record<ProductSort, string> = {
  createdDesc: "등록순 내림차순",
  createdAsc: "등록순 오름차순",
  nameAsc: "이름 오름차순",
  nameDesc: "이름 내림차순",
  priceAsc: "가격 오름차순",
  priceDesc: "가격 내림차순",
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value: number) {
  return `${formatter.format(value)}원`;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date) {
  return dateKey(date).slice(0, 7);
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(date: Date) {
  const end = startOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getWeekKey(date: Date) {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  return `${dateKey(start)} ~ ${dateKey(end)}`;
}

function rankSales(sales: Sale[], dayRecordsForRank: DayRecord[] = []) {
  const map = new Map<string, RankItem>();
  const addLine = (line: SaleLine) => {
    const current = map.get(line.productId) ?? { name: line.name, quantity: 0, total: 0 };
    current.quantity += line.quantity;
    current.total += line.total;
    map.set(line.productId, current);
  };
  sales.forEach((sale) =>
    sale.lines.forEach((line) => {
      addLine(line);
    }),
  );
  dayRecordsForRank.forEach((record) => {
    const lines = record.lines?.length ? record.lines : legacyDayRecordLines(record);
    lines.forEach((line) => {
      addLine(line);
    });
  });
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total).slice(0, 5);
}

function rankPurchases(purchases: Purchase[]) {
  const map = new Map<string, RankItem>();
  purchases.forEach((purchase) =>
    purchase.lines.forEach((line) => {
      const current = map.get(line.productId) ?? { name: line.name, quantity: 0, total: 0 };
      current.quantity += line.quantity;
      current.total += line.total;
      map.set(line.productId, current);
    }),
  );
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total).slice(0, 5);
}

function rankReservations(reservations: Reservation[]) {
  const map = new Map<string, RankItem>();
  reservations.forEach((reservation) =>
    reservation.lines.forEach((line) => {
      const current = map.get(line.productId) ?? { name: line.name, quantity: 0, total: 0 };
      current.quantity += line.quantity;
      current.total += line.total;
      map.set(line.productId, current);
    }),
  );
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total).slice(0, 5);
}

function normalizeSales(sales: Sale[] = []) {
  return sales.map((sale) => ({
    ...sale,
    paymentMethod: sale.paymentMethod ?? "card",
  }));
}

function normalizePurchases(purchases: Purchase[] = []) {
  return purchases.map((purchase) => ({
    ...purchase,
    paymentMethod: purchase.paymentMethod ?? "card",
    memo: purchase.memo ?? "",
    lines: purchase.lines ?? [],
    total: Number(purchase.total) || 0,
  }));
}

function normalizeCustomers(customers: Customer[] = []) {
  return customers.map((customer) => ({
    id: customer.id ?? makeId("customer"),
    name: customer.name ?? "",
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    addressDetail: customer.addressDetail ?? "",
    birthday: customer.birthday ?? "",
    memo: customer.memo ?? "",
  }));
}

function normalizeReservations(reservations: Reservation[] = []) {
  return reservations.map((reservation) => ({
    ...reservation,
    customerAddressDetail: reservation.customerAddressDetail ?? "",
    deliveryTime: reservation.deliveryTime ?? "",
    memo: reservation.memo ?? "",
    paymentMethod: reservation.paymentMethod ?? "card",
    paymentStatus: reservation.paymentStatus ?? "paid",
    status: reservation.status ?? (reservation.completedAt ? "done" : "reserved"),
    lines: (reservation.lines ?? []).map((line) => ({
      ...line,
      id: line.id ?? makeId("reservation-line"),
      paymentMethod: line.paymentMethod ?? reservation.paymentMethod ?? "card",
    })),
    total: Number(reservation.total) || 0,
  }));
}

function normalizeDayRecords(records: DayRecord[] = []) {
  return records
    .filter((record) => record.date)
    .map((record) => {
      const lines = (record.lines ?? []).map((line) => ({
        ...line,
        id: line.id ?? makeId("day-line"),
        paymentMethod: line.paymentMethod ?? "card",
      }));
      const totals = summarizeDayRecordLines(lines);
      const hasLines = lines.length > 0;
      return {
        date: record.date,
        note: record.note ?? "",
        card: hasLines ? totals.card : Number(record.card) || 0,
        cash: hasLines ? totals.cash : Number(record.cash) || 0,
        transfer: hasLines ? totals.transfer : Number(record.transfer) || 0,
        lines,
      };
    });
}

function getProductCreatedAt(product: Product) {
  const [, timestamp] = product.id.match(/^prod-(\d+)/) ?? [];
  return timestamp ? Number(timestamp) : 0;
}

function sortProducts(products: Product[], sort: ProductSort) {
  return [...products].sort((a, b) => {
    if (sort === "nameAsc" || sort === "nameDesc") {
      const value = a.name.localeCompare(b.name, "ko-KR", { numeric: true });
      return sort === "nameAsc" ? value : -value;
    }
    if (sort === "priceAsc" || sort === "priceDesc") {
      const value = a.price - b.price || a.name.localeCompare(b.name, "ko-KR", { numeric: true });
      return sort === "priceAsc" ? value : -value;
    }
    const value = getProductCreatedAt(a) - getProductCreatedAt(b);
    return sort === "createdAsc" ? value : -value;
  });
}

function dayRecordTotal(record?: DayRecord) {
  return record ? record.card + record.cash + record.transfer : 0;
}

function summarizeDayRecordLines(lines: DayRecordLine[]) {
  return lines.reduce(
    (sum, line) => {
      sum[line.paymentMethod] += line.total;
      return sum;
    },
    { card: 0, cash: 0, transfer: 0 },
  );
}

function legacyDayRecordLines(record: DayRecord) {
  return (["card", "cash", "transfer"] as PaymentMethod[])
    .filter((method) => record[method] > 0)
    .map((method) => ({
      id: makeId("day-line"),
      productId: `manual-${method}`,
      name: "직접 입력",
      categoryName: "달력 수정",
      price: record[method],
      quantity: 1,
      total: record[method],
      paymentMethod: method,
    }));
}

function normalizeStoredData(parsed: StoredData) {
  const categories = parsed.categories?.length ? parsed.categories.slice(0, MAX_CATEGORIES) : seedCategories;
  const purchaseCategories = (parsed.purchaseCategories?.length ? parsed.purchaseCategories : categories).slice(0, MAX_CATEGORIES);
  const activeCategory =
    parsed.activeCategory === "all" || categories.some((category) => category.id === parsed.activeCategory) ? parsed.activeCategory : "all";
  const purchaseActiveCategory =
    parsed.purchaseActiveCategory === "all" || purchaseCategories.some((category) => category.id === parsed.purchaseActiveCategory)
      ? parsed.purchaseActiveCategory
      : "all";

  return {
    categories,
    products: parsed.products?.length ? parsed.products : seedProducts,
    purchaseCategories,
    purchaseProducts: parsed.purchaseProducts?.length ? parsed.purchaseProducts : parsed.products?.length ? parsed.products : seedProducts,
    sales: normalizeSales(parsed.sales ?? []),
    purchases: normalizePurchases(parsed.purchases ?? []),
    dayRecords: normalizeDayRecords(parsed.dayRecords ?? []),
    customers: normalizeCustomers(parsed.customers ?? []),
    reservations: normalizeReservations(parsed.reservations ?? []),
    activeCategory,
    purchaseActiveCategory,
    productSort: parsed.productSort ?? "createdDesc",
    updatedAt: parsed.updatedAt ?? "",
  };
}

function makeStoredData(
  categories: Category[],
  products: Product[],
  sales: Sale[],
  activeCategory = "all",
  dayRecords: DayRecord[] = [],
  productSort: ProductSort = "createdDesc",
  purchases: Purchase[] = [],
  customers: Customer[] = [],
  reservations: Reservation[] = [],
  purchaseCategories: Category[] = categories,
  purchaseProducts: Product[] = products,
  purchaseActiveCategory = "all",
): Required<StoredData> {
  return {
    categories,
    products,
    purchaseCategories,
    purchaseProducts,
    sales,
    purchases,
    dayRecords,
    customers,
    reservations,
    activeCategory,
    purchaseActiveCategory,
    productSort,
    updatedAt: new Date().toISOString(),
  };
}

function readStoredData() {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_BACKUP_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as StoredData;
    return normalizeStoredData(parsed);
  } catch {
    return null;
  }
}

function writeStoredData(
  categories: Category[],
  products: Product[],
  sales: Sale[],
  activeCategory = "all",
  dayRecords: DayRecord[] = [],
  productSort: ProductSort = "createdDesc",
  purchases: Purchase[] = [],
  customers: Customer[] = [],
  reservations: Reservation[] = [],
  purchaseCategories?: Category[],
  purchaseProducts?: Product[],
  purchaseActiveCategory?: string,
) {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_BACKUP_KEY);
    const previous = stored ? normalizeStoredData(JSON.parse(stored) as StoredData) : null;
    const data = makeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories ?? previous?.purchaseCategories ?? categories,
      purchaseProducts ?? previous?.purchaseProducts ?? products,
      purchaseActiveCategory ?? previous?.purchaseActiveCategory ?? "all",
    );
    const payload = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, payload);
    localStorage.setItem(STORAGE_BACKUP_KEY, payload);
    return data;
  } catch {
    return null;
  }
}

function storedTime(data?: Pick<StoredData, "updatedAt"> | null) {
  return data?.updatedAt ? new Date(data.updatedAt).getTime() : 0;
}

function isNewerStoredData(next: StoredData | null, currentUpdatedAt: string) {
  return storedTime(next) > storedTime({ updatedAt: currentUpdatedAt });
}

async function readCloudData(signal?: AbortSignal) {
  try {
    const response = await fetch("/api/pos-data", { cache: "no-store", signal });
    if (!response.ok) return null;
    const result = (await response.json()) as { data?: StoredData | null };
    return result.data ? normalizeStoredData(result.data) : null;
  } catch {
    return null;
  }
}

async function writeCloudData(data: Required<StoredData>) {
  try {
    const response = await fetch("/api/pos-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function escapeCell(value: string | number) {
  return String(value).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char] ?? char));
}

function downloadExcel(filename: string, rows: Array<Array<string | number>>) {
  const htmlRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeCell(cell)}</td>`).join("")}</tr>`).join("");
  const worksheet = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${htmlRows}</table></body></html>`;
  const blob = new Blob([worksheet], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [activeView, setActiveView] = useState<AppView>("sales");
  const [categories, setCategories] = useState<Category[]>(seedCategories);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [purchaseCart, setPurchaseCart] = useState<CartItem[]>([]);
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<PaymentMethod>("card");
  const [purchaseMemo, setPurchaseMemo] = useState("");
  const [purchaseDayEditCart, setPurchaseDayEditCart] = useState<CartItem[]>([]);
  const [purchaseDayEditCategory, setPurchaseDayEditCategory] = useState("all");
  const [purchaseDayEditPaymentMethod, setPurchaseDayEditPaymentMethod] = useState<PaymentMethod>("card");
  const [purchaseDayEditOpen, setPurchaseDayEditOpen] = useState(true);
  const [purchaseRecordLinesOpen, setPurchaseRecordLinesOpen] = useState(true);
  const [dayEditCart, setDayEditCart] = useState<CartItem[]>([]);
  const [dayEditPaymentMethod, setDayEditPaymentMethod] = useState<PaymentMethod>("card");
  const [dayEditCategory, setDayEditCategory] = useState("all");
  const [reservationCart, setReservationCart] = useState<CartItem[]>([]);
  const [reservationCategory, setReservationCategory] = useState("all");
  const [reservationPaymentMethod, setReservationPaymentMethod] = useState<PaymentMethod>("card");
  const [selectedReservationDate, setSelectedReservationDate] = useState(dateKey(new Date()));
  const [reservationMonth, setReservationMonth] = useState(monthKey(new Date()));
  const [reservationEditorOpen, setReservationEditorOpen] = useState(false);
  const [reservationCartOpen, setReservationCartOpen] = useState(true);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", address: "", addressDetail: "", birthday: "", memo: "" });
  const [reservationForm, setReservationForm] = useState({
    customerId: "",
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerAddressDetail: "",
    deliveryTime: "",
    paymentStatus: "paid" as ReservationPaymentStatus,
    status: "reserved" as ReservationStatus,
    memo: "",
  });
  const [editingReservationId, setEditingReservationId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [editingProductId, setEditingProductId] = useState("");
  const [productEditForm, setProductEditForm] = useState({ name: "", price: "", categoryId: seedCategories[0].id });
  const [dayEditOpen, setDayEditOpen] = useState(true);
  const [dayRecordLinesOpen, setDayRecordLinesOpen] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [purchaseCategories, setPurchaseCategories] = useState<Category[]>(seedCategories);
  const [purchaseProducts, setPurchaseProducts] = useState<Product[]>(seedProducts);
  const [activePurchaseCategory, setActivePurchaseCategory] = useState("all");
  const [productSort, setProductSort] = useState<ProductSort>("createdDesc");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(dateKey(new Date()));
  const [selectedPurchaseMonth, setSelectedPurchaseMonth] = useState(monthKey(new Date()));
  const [selectedPurchaseDate, setSelectedPurchaseDate] = useState(dateKey(new Date()));
  const [selectedPurchaseRankMonth, setSelectedPurchaseRankMonth] = useState(monthKey(new Date()));
  const [selectedPurchaseRankDate, setSelectedPurchaseRankDate] = useState(dateKey(new Date()));
  const [selectedRankMonth, setSelectedRankMonth] = useState(monthKey(new Date()));
  const [selectedRankDate, setSelectedRankDate] = useState(dateKey(new Date()));
  const [productForm, setProductForm] = useState({ name: "", price: "", categoryId: seedCategories[0].id });
  const [categoryForm, setCategoryForm] = useState("");
  const [purchaseProductForm, setPurchaseProductForm] = useState({ name: "", price: "", categoryId: seedCategories[0].id });
  const [purchaseCategoryForm, setPurchaseCategoryForm] = useState("");
  const [notice, setNotice] = useState("오늘 첫 판매를 기다리는 중입니다.");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("checking");
  const [ready, setReady] = useState(false);

  function applyStoredData(data: ReturnType<typeof normalizeStoredData>) {
    setCategories(data.categories);
    setProducts(data.products);
    setPurchaseCategories(data.purchaseCategories);
    setPurchaseProducts(data.purchaseProducts);
    setSales(data.sales);
    setPurchases(data.purchases);
    setDayRecords(data.dayRecords);
    setCustomers(data.customers);
    setReservations(data.reservations);
    setActiveCategory(data.activeCategory);
    setActivePurchaseCategory(data.purchaseActiveCategory);
    setProductSort(data.productSort);
    setLastSavedAt(data.updatedAt);
    setProductForm((current) => ({
      ...current,
      categoryId: data.categories[0]?.id ?? seedCategories[0].id,
    }));
    setPurchaseProductForm((current) => ({
      ...current,
      categoryId: data.purchaseCategories[0]?.id ?? seedCategories[0].id,
    }));
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    const saved = readStoredData();
    if (saved) {
      applyStoredData(saved);
      setNotice("저장된 매장 데이터를 불러왔습니다.");
    }

    async function loadInitialData() {
      const cloudData = await readCloudData(controller.signal);
      window.clearTimeout(timer);
      if (!active) return;

      if (cloudData && (!saved || isNewerStoredData(cloudData, saved.updatedAt))) {
        applyStoredData(cloudData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
        localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(cloudData));
        setSyncState("cloud");
        setNotice("공용 저장소에서 최신 매장 데이터를 불러왔습니다.");
      } else if (saved) {
        const uploaded = await writeCloudData(saved);
        if (active) setSyncState(uploaded ? "cloud" : "local");
      } else {
        setSyncState(cloudData ? "cloud" : "local");
      }

      if (active) setReady(true);
    }

    loadInitialData();

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const saved = writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    if (!saved) {
      setNotice("브라우저 저장소를 사용할 수 없습니다. 시크릿 모드나 저장소 차단 설정을 확인해 주세요.");
      return;
    }
    setLastSavedAt(saved.updatedAt);
    writeCloudData(saved).then((uploaded) => {
      setSyncState(uploaded ? "cloud" : "local");
    });
  }, [activeCategory, activePurchaseCategory, categories, customers, dayRecords, productSort, products, purchaseCategories, purchaseProducts, purchases, ready, reservations, sales]);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;

    async function pullLatestData() {
      const cloudData = await readCloudData();
      if (stopped) return;
      if (!cloudData) {
        setSyncState("local");
        return;
      }
      setSyncState("cloud");
      if (isNewerStoredData(cloudData, lastSavedAt)) {
        applyStoredData(cloudData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
        localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(cloudData));
        setNotice("다른 기기에서 변경한 내용을 반영했습니다.");
      }
    }

    pullLatestData();
    const interval = window.setInterval(pullLatestData, 5000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [lastSavedAt, ready]);

  useEffect(() => {
    if (!ready) return;
    const persistBeforeClose = () => {
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        purchaseCategories,
        purchaseProducts,
        activePurchaseCategory,
      );
    };
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persistBeforeClose();
    };

    window.addEventListener("pagehide", persistBeforeClose);
    document.addEventListener("visibilitychange", persistWhenHidden);

    return () => {
      window.removeEventListener("pagehide", persistBeforeClose);
      document.removeEventListener("visibilitychange", persistWhenHidden);
    };
  }, [activeCategory, activePurchaseCategory, categories, customers, dayRecords, productSort, products, purchaseCategories, purchaseProducts, purchases, ready, reservations, sales]);

  const activeSales = useMemo(() => sales.filter((sale) => !sale.cancelledAt), [sales]);
  const recentSales = sales.slice(0, 8);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const purchaseCategoryMap = useMemo(() => new Map(purchaseCategories.map((category) => [category.id, category])), [purchaseCategories]);
  const dayRecordMap = useMemo(() => new Map(dayRecords.map((record) => [record.date, record])), [dayRecords]);

  const visibleProducts = useMemo(
    () => sortProducts(products.filter((product) => activeCategory === "all" || product.categoryId === activeCategory), productSort),
    [activeCategory, productSort, products],
  );
  const visibleDayEditProducts = useMemo(
    () => sortProducts(products.filter((product) => dayEditCategory === "all" || product.categoryId === dayEditCategory), productSort),
    [dayEditCategory, productSort, products],
  );
  const visiblePurchaseDayEditProducts = useMemo(
    () => sortProducts(purchaseProducts.filter((product) => purchaseDayEditCategory === "all" || product.categoryId === purchaseDayEditCategory), productSort),
    [productSort, purchaseProducts, purchaseDayEditCategory],
  );
  const visiblePurchaseProducts = useMemo(
    () => sortProducts(purchaseProducts.filter((product) => activePurchaseCategory === "all" || product.categoryId === activePurchaseCategory), productSort),
    [activePurchaseCategory, productSort, purchaseProducts],
  );
  const visibleReservationProducts = useMemo(
    () => sortProducts(products.filter((product) => reservationCategory === "all" || product.categoryId === reservationCategory), productSort),
    [productSort, products, reservationCategory],
  );
  const sortedProducts = useMemo(() => sortProducts(products, productSort), [productSort, products]);
  const sortedPurchaseProducts = useMemo(() => sortProducts(purchaseProducts, productSort), [productSort, purchaseProducts]);

  const cartLines = useMemo(
    () =>
      cart
        .map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          if (!product) return null;
          const category = categoryMap.get(product.categoryId);
          return {
            ...item,
            product,
            categoryName: category?.name ?? "미분류",
            total: product.price * item.quantity,
          };
        })
        .filter(Boolean),
    [cart, categoryMap, products],
  );

  const cartTotal = cartLines.reduce((sum, item) => sum + (item?.total ?? 0), 0);
  const purchaseCartLines = useMemo(
    () =>
      purchaseCart
        .map((item) => {
          const product = purchaseProducts.find((entry) => entry.id === item.productId);
          if (!product) return null;
          const category = purchaseCategoryMap.get(product.categoryId);
          return {
            ...item,
            product,
            categoryName: category?.name ?? "미분류",
            total: product.price * item.quantity,
          };
        })
        .filter(Boolean),
    [purchaseCart, purchaseCategoryMap, purchaseProducts],
  );
  const purchaseCartTotal = purchaseCartLines.reduce((sum, item) => sum + (item?.total ?? 0), 0);
  const purchaseDayEditCartLines = useMemo(
    () =>
      purchaseDayEditCart
        .map((item) => {
          const product = purchaseProducts.find((entry) => entry.id === item.productId);
          if (!product) return null;
          const category = purchaseCategoryMap.get(product.categoryId);
          return {
            ...item,
            product,
            categoryName: category?.name ?? "미분류",
            total: product.price * item.quantity,
          };
        })
        .filter(Boolean),
    [purchaseCategoryMap, purchaseDayEditCart, purchaseProducts],
  );
  const purchaseDayEditCartTotal = purchaseDayEditCartLines.reduce((sum, item) => sum + (item?.total ?? 0), 0);
  const dayEditCartLines = useMemo(
    () =>
      dayEditCart
        .map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          if (!product) return null;
          const category = categoryMap.get(product.categoryId);
          return {
            ...item,
            product,
            categoryName: category?.name ?? "미분류",
            total: product.price * item.quantity,
          };
        })
        .filter(Boolean),
    [categoryMap, dayEditCart, products],
  );
  const dayEditCartTotal = dayEditCartLines.reduce((sum, item) => sum + (item?.total ?? 0), 0);
  const reservationCartLines = useMemo(
    () =>
      reservationCart
        .map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          if (!product) return null;
          const category = categoryMap.get(product.categoryId);
          return {
            ...item,
            product,
            categoryName: category?.name ?? "미분류",
            total: product.price * item.quantity,
          };
        })
        .filter(Boolean),
    [categoryMap, products, reservationCart],
  );
  const reservationCartTotal = reservationCartLines.reduce((sum, item) => sum + (item?.total ?? 0), 0);
  const activePurchases = useMemo(() => purchases.filter((purchase) => !purchase.cancelledAt), [purchases]);
  const recentPurchases = purchases.slice(0, 8);
  const todayPurchaseTotal = activePurchases
    .filter((purchase) => dateKey(new Date(purchase.purchasedAt)) === dateKey(new Date()))
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const todayPurchaseCardTotal = activePurchases
    .filter((purchase) => dateKey(new Date(purchase.purchasedAt)) === dateKey(new Date()) && (purchase.paymentMethod ?? "card") === "card")
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const todayPurchaseCashTotal = activePurchases
    .filter((purchase) => dateKey(new Date(purchase.purchasedAt)) === dateKey(new Date()) && (purchase.paymentMethod ?? "card") === "cash")
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const todayPurchaseTransferTotal = activePurchases
    .filter((purchase) => dateKey(new Date(purchase.purchasedAt)) === dateKey(new Date()) && (purchase.paymentMethod ?? "card") === "transfer")
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const selectedPurchaseMonthItems = activePurchases.filter((purchase) => monthKey(new Date(purchase.purchasedAt)) === selectedPurchaseMonth);
  const selectedPurchaseMonthTotal = selectedPurchaseMonthItems.reduce((sum, purchase) => sum + purchase.total, 0);
  const selectedPurchaseMonthCardTotal = selectedPurchaseMonthItems
    .filter((purchase) => (purchase.paymentMethod ?? "card") === "card")
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const selectedPurchaseMonthCashTotal = selectedPurchaseMonthItems
    .filter((purchase) => (purchase.paymentMethod ?? "card") === "cash")
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const selectedPurchaseMonthTransferTotal = selectedPurchaseMonthItems
    .filter((purchase) => (purchase.paymentMethod ?? "card") === "transfer")
    .reduce((sum, purchase) => sum + purchase.total, 0);
  const purchaseDailyTotals = useMemo(() => {
    const map = new Map<string, { total: number; card: number; cash: number; transfer: number }>();
    selectedPurchaseMonthItems.forEach((purchase) => {
      const key = dateKey(new Date(purchase.purchasedAt));
      const current = map.get(key) ?? { total: 0, card: 0, cash: 0, transfer: 0 };
      current.total += purchase.total;
      if ((purchase.paymentMethod ?? "card") === "transfer") current.transfer += purchase.total;
      else if ((purchase.paymentMethod ?? "card") === "cash") current.cash += purchase.total;
      else current.card += purchase.total;
      map.set(key, current);
    });
    return map;
  }, [selectedPurchaseMonthItems]);
  const selectedPurchaseItems = activePurchases.filter((purchase) => dateKey(new Date(purchase.purchasedAt)) === selectedPurchaseDate);
  const selectedPurchaseAmount = purchaseDailyTotals.get(selectedPurchaseDate) ?? { total: 0, card: 0, cash: 0, transfer: 0 };
  const purchaseRankMonthItems = activePurchases.filter((purchase) => monthKey(new Date(purchase.purchasedAt)) === selectedPurchaseRankMonth);
  const selectedPurchaseRankWeekDate = new Date(selectedPurchaseRankDate);
  const selectedPurchaseWeekStart = startOfWeek(selectedPurchaseRankWeekDate);
  const selectedPurchaseWeekEnd = endOfWeek(selectedPurchaseRankWeekDate);
  const selectedPurchaseWeekLabel = getWeekKey(selectedPurchaseRankWeekDate);
  const purchaseRankWeekItems = activePurchases.filter((purchase) => {
    const purchasedAt = new Date(purchase.purchasedAt);
    return purchasedAt >= selectedPurchaseWeekStart && purchasedAt <= selectedPurchaseWeekEnd;
  });
  const monthlyPurchaseRank = useMemo(() => rankPurchases(purchaseRankMonthItems), [purchaseRankMonthItems]);
  const weeklyPurchaseRank = useMemo(() => rankPurchases(purchaseRankWeekItems), [purchaseRankWeekItems]);
  const selectedReservationItems = reservations.filter((reservation) => reservation.date === selectedReservationDate);
  const selectedReservationMonthItems = reservations.filter((reservation) => reservation.date.startsWith(reservationMonth));
  const selectedReservationMonthTotal = selectedReservationMonthItems.reduce((sum, reservation) => sum + reservation.total, 0);
  const selectedReservationMonthCardTotal = selectedReservationMonthItems
    .filter((reservation) => reservation.paymentMethod === "card" && reservation.paymentStatus !== "unpaid")
    .reduce((sum, reservation) => sum + reservation.total, 0);
  const selectedReservationMonthCashTotal = selectedReservationMonthItems
    .filter((reservation) => reservation.paymentMethod === "cash" && reservation.paymentStatus !== "unpaid")
    .reduce((sum, reservation) => sum + reservation.total, 0);
  const selectedReservationMonthTransferTotal = selectedReservationMonthItems
    .filter((reservation) => reservation.paymentMethod === "transfer" && reservation.paymentStatus !== "unpaid")
    .reduce((sum, reservation) => sum + reservation.total, 0);
  const selectedReservationMonthUnpaidTotal = selectedReservationMonthItems
    .filter((reservation) => reservation.paymentStatus === "unpaid")
    .reduce((sum, reservation) => sum + reservation.total, 0);
  const filteredCustomers = customers.filter((customer) => {
    const keyword = customerSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [customer.name, customer.phone, customer.address, customer.addressDetail ?? "", customer.memo ?? ""].some((value) => value.toLowerCase().includes(keyword));
  });
  const reservationWeekDate = new Date(`${selectedReservationDate}T00:00:00`);
  const reservationWeekStart = startOfWeek(reservationWeekDate);
  const reservationWeekEnd = endOfWeek(reservationWeekDate);
  const reservationWeekLabel = getWeekKey(reservationWeekDate);
  const selectedReservationWeekItems = reservations.filter((reservation) => {
    const date = new Date(`${reservation.date}T00:00:00`);
    return date >= reservationWeekStart && date <= reservationWeekEnd;
  });
  const monthlyReservationRank = useMemo(() => rankReservations(selectedReservationMonthItems), [selectedReservationMonthItems]);
  const weeklyReservationRank = useMemo(() => rankReservations(selectedReservationWeekItems), [selectedReservationWeekItems]);
  const reservationCalendarCells = [
    ...Array.from({ length: new Date(Number(reservationMonth.slice(0, 4)), Number(reservationMonth.slice(5, 7)) - 1, 1).getDay() }).map((_, index) => ({
      type: "blank" as const,
      key: `reservation-blank-${index}`,
    })),
    ...Array.from({ length: new Date(Number(reservationMonth.slice(0, 4)), Number(reservationMonth.slice(5, 7)), 0).getDate() }).map((_, index) => {
      const day = index + 1;
      const key = `${reservationMonth}-${String(day).padStart(2, "0")}`;
      const dayReservations = reservations.filter((reservation) => reservation.date === key);
      const total = dayReservations.reduce((sum, reservation) => sum + reservation.total, 0);
      const allDone =
        dayReservations.length > 0 && dayReservations.every((reservation) => Boolean(reservation.completedAt) || reservation.status === "done");
      return { type: "day" as const, key, day, count: dayReservations.length, total, reservations: dayReservations, allDone };
    }),
  ];
  const todayRecord = dayRecordMap.get(dateKey(new Date()));
  const todayTotal = activeSales
    .filter((sale) => dateKey(new Date(sale.soldAt)) === dateKey(new Date()))
    .reduce((sum, sale) => sum + sale.total, 0) + dayRecordTotal(todayRecord);
  const todayCardTotal = activeSales
    .filter((sale) => dateKey(new Date(sale.soldAt)) === dateKey(new Date()) && (sale.paymentMethod ?? "card") === "card")
    .reduce((sum, sale) => sum + sale.total, 0) + (todayRecord?.card ?? 0);
  const todayCashTotal = activeSales
    .filter((sale) => dateKey(new Date(sale.soldAt)) === dateKey(new Date()) && (sale.paymentMethod ?? "card") === "cash")
    .reduce((sum, sale) => sum + sale.total, 0) + (todayRecord?.cash ?? 0);
  const todayTransferTotal = activeSales
    .filter((sale) => dateKey(new Date(sale.soldAt)) === dateKey(new Date()) && (sale.paymentMethod ?? "card") === "transfer")
    .reduce((sum, sale) => sum + sale.total, 0) + (todayRecord?.transfer ?? 0);

  const selectedMonthSales = activeSales.filter((sale) => monthKey(new Date(sale.soldAt)) === selectedMonth);
  const selectedMonthDayRecords = dayRecords.filter((record) => record.date.startsWith(selectedMonth));
  const monthlyTotal =
    selectedMonthSales.reduce((sum, sale) => sum + sale.total, 0) + selectedMonthDayRecords.reduce((sum, record) => sum + dayRecordTotal(record), 0);
  const monthlyCardTotal =
    selectedMonthSales.filter((sale) => (sale.paymentMethod ?? "card") === "card").reduce((sum, sale) => sum + sale.total, 0) +
    selectedMonthDayRecords.reduce((sum, record) => sum + record.card, 0);
  const monthlyCashTotal =
    selectedMonthSales.filter((sale) => (sale.paymentMethod ?? "card") === "cash").reduce((sum, sale) => sum + sale.total, 0) +
    selectedMonthDayRecords.reduce((sum, record) => sum + record.cash, 0);
  const monthlyTransferTotal =
    selectedMonthSales.filter((sale) => (sale.paymentMethod ?? "card") === "transfer").reduce((sum, sale) => sum + sale.total, 0) +
    selectedMonthDayRecords.reduce((sum, record) => sum + record.transfer, 0);
  const rankMonthSales = activeSales.filter((sale) => monthKey(new Date(sale.soldAt)) === selectedRankMonth);
  const rankMonthDayRecords = dayRecords.filter((record) => record.date.startsWith(selectedRankMonth));
  const selectedRankWeekDate = new Date(selectedRankDate);
  const selectedWeekStart = startOfWeek(selectedRankWeekDate);
  const selectedWeekEnd = endOfWeek(selectedRankWeekDate);
  const selectedWeekLabel = getWeekKey(selectedRankWeekDate);
  const selectedWeekSales = activeSales.filter((sale) => {
    const soldAt = new Date(sale.soldAt);
    return soldAt >= selectedWeekStart && soldAt <= selectedWeekEnd;
  });
  const selectedWeekDayRecords = dayRecords.filter((record) => {
    const recordDate = new Date(`${record.date}T00:00:00`);
    return recordDate >= selectedWeekStart && recordDate <= selectedWeekEnd;
  });
  const monthlyRank = useMemo(() => rankSales(rankMonthSales, rankMonthDayRecords), [rankMonthDayRecords, rankMonthSales]);
  const weeklyRank = useMemo(() => rankSales(selectedWeekSales, selectedWeekDayRecords), [selectedWeekDayRecords, selectedWeekSales]);

  const dailyTotals = useMemo(() => {
    const map = new Map<string, { total: number; card: number; cash: number; transfer: number }>();
    selectedMonthSales.forEach((sale) => {
      const key = dateKey(new Date(sale.soldAt));
      const current = map.get(key) ?? { total: 0, card: 0, cash: 0, transfer: 0 };
      current.total += sale.total;
      if ((sale.paymentMethod ?? "card") === "transfer") {
        current.transfer += sale.total;
      } else if ((sale.paymentMethod ?? "card") === "cash") {
        current.cash += sale.total;
      } else {
        current.card += sale.total;
      }
      map.set(key, current);
    });
    selectedMonthDayRecords.forEach((record) => {
      const current = map.get(record.date) ?? { total: 0, card: 0, cash: 0, transfer: 0 };
      current.card += record.card;
      current.cash += record.cash;
      current.transfer += record.transfer;
      current.total += dayRecordTotal(record);
      map.set(record.date, current);
    });
    return map;
  }, [selectedMonthDayRecords, selectedMonthSales]);

  const selectedDayRecord = dayRecordMap.get(selectedCalendarDate);
  const selectedDaySales = activeSales.filter((sale) => dateKey(new Date(sale.soldAt)) === selectedCalendarDate);
  const selectedDayAmount = dailyTotals.get(selectedCalendarDate) ?? { total: 0, card: 0, cash: 0, transfer: 0 };

  function addToCart(productId: string) {
    setCart((items) => {
      const existing = items.find((item) => item.productId === productId);
      if (existing) {
        return items.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...items, { productId, quantity: 1 }];
    });
  }

  function addToDayEditCart(productId: string) {
    setDayEditCart((items) => {
      const existing = items.find((item) => item.productId === productId);
      if (existing) {
        return items.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...items, { productId, quantity: 1 }];
    });
  }

  function addToPurchaseCart(productId: string) {
    setPurchaseCart((items) => {
      const existing = items.find((item) => item.productId === productId);
      if (existing) return items.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item));
      return [...items, { productId, quantity: 1 }];
    });
  }

  function addToPurchaseDayEditCart(productId: string) {
    setPurchaseDayEditCart((items) => {
      const existing = items.find((item) => item.productId === productId);
      if (existing) return items.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item));
      return [...items, { productId, quantity: 1 }];
    });
  }

  function addToReservationCart(productId: string) {
    setReservationCart((items) => {
      const existing = items.find((item) => item.productId === productId);
      if (existing) return items.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item));
      return [...items, { productId, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((items) => items.filter((item) => item.productId !== productId));
      return;
    }
    setCart((items) => items.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  }

  function changeDayEditQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setDayEditCart((items) => items.filter((item) => item.productId !== productId));
      return;
    }
    setDayEditCart((items) => items.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  }

  function changePurchaseQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setPurchaseCart((items) => items.filter((item) => item.productId !== productId));
      return;
    }
    setPurchaseCart((items) => items.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  }

  function changePurchaseDayEditQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setPurchaseDayEditCart((items) => items.filter((item) => item.productId !== productId));
      return;
    }
    setPurchaseDayEditCart((items) => items.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  }

  function changeReservationQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setReservationCart((items) => items.filter((item) => item.productId !== productId));
      return;
    }
    setReservationCart((items) => items.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  }

  function checkout() {
    if (!cartLines.length) {
      setNotice("선택된 상품이 없습니다.");
      return;
    }
    const lines: SaleLine[] = cartLines.map((item) => ({
      productId: item!.product.id,
      name: item!.product.name,
      categoryName: item!.categoryName,
      price: item!.product.price,
      quantity: item!.quantity,
      total: item!.total,
    }));
    const sale: Sale = {
      id: makeId("sale"),
      soldAt: new Date().toISOString(),
      paymentMethod,
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
    };
    const nextSales = [sale, ...sales];
    setSales(nextSales);
    writeStoredData(
      categories,
      products,
      nextSales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setCart([]);
    setNotice(`${paymentLabels[paymentMethod]} ${money(sale.total)} 결제가 기록되었습니다. 잘못 눌렀다면 최근 계산 내역에서 취소하세요.`);
  }

  function cancelSale(saleId: string) {
    const sale = sales.find((entry) => entry.id === saleId);
    if (!sale || sale.cancelledAt) return;
    const nextSales = sales.map((entry) => (entry.id === saleId ? { ...entry, cancelledAt: new Date().toISOString() } : entry));
    setSales(nextSales);
    writeStoredData(
      categories,
      products,
      nextSales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${timeFormatter.format(new Date(sale.soldAt))} 결제 ${money(sale.total)}를 취소했습니다.`);
  }

  function recordPurchase() {
    if (!purchaseCartLines.length) {
      setNotice("매입할 상품을 선택해 주세요.");
      return;
    }
    const lines: SaleLine[] = purchaseCartLines.map((item) => ({
      productId: item!.product.id,
      name: item!.product.name,
      categoryName: item!.categoryName,
      price: item!.product.price,
      quantity: item!.quantity,
      total: item!.total,
    }));
    const purchase: Purchase = {
      id: makeId("purchase"),
      purchasedAt: new Date().toISOString(),
      paymentMethod: purchasePaymentMethod,
      memo: purchaseMemo.trim(),
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
    };
    const nextPurchases = [purchase, ...purchases];
    setPurchases(nextPurchases);
    setPurchaseCart([]);
    setPurchaseMemo("");
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      nextPurchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`매입 ${money(purchase.total)}를 기록했습니다.`);
  }

  function selectPurchaseDate(date: string) {
    setSelectedPurchaseDate(date);
    setSelectedPurchaseMonth(date.slice(0, 7));
    setPurchaseDayEditCart([]);
    setPurchaseDayEditOpen(true);
    setPurchaseRecordLinesOpen(true);
  }

  function changePurchaseMonth(month: string) {
    setSelectedPurchaseMonth(month);
    if (!selectedPurchaseDate.startsWith(month)) {
      setSelectedPurchaseDate(`${month}-01`);
    }
  }

  function addPurchaseDayEditCartToRecord() {
    if (!purchaseDayEditCartLines.length) {
      setNotice("선택한 날짜에 추가할 매입 상품이 없습니다.");
      return;
    }
    const lines: SaleLine[] = purchaseDayEditCartLines.map((item) => ({
      productId: item!.product.id,
      name: item!.product.name,
      categoryName: item!.categoryName,
      price: item!.product.price,
      quantity: item!.quantity,
      total: item!.total,
    }));
    const purchase: Purchase = {
      id: makeId("purchase"),
      purchasedAt: `${selectedPurchaseDate}T12:00:00.000`,
      paymentMethod: purchaseDayEditPaymentMethod,
      memo: "달력 내용 수정",
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
    };
    const nextPurchases = [purchase, ...purchases];
    setPurchases(nextPurchases);
    setPurchaseDayEditCart([]);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      nextPurchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${selectedPurchaseDate}에 ${paymentLabels[purchaseDayEditPaymentMethod]} 매입 ${money(purchase.total)}를 추가했습니다.`);
  }

  function updatePurchaseMemo(purchaseId: string, memo: string) {
    const nextPurchases = purchases.map((purchase) => (purchase.id === purchaseId ? { ...purchase, memo } : purchase));
    setPurchases(nextPurchases);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      nextPurchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function removePurchaseLine(purchaseId: string, productId: string) {
    const nextPurchases = purchases
      .map((purchase) => {
        if (purchase.id !== purchaseId) return purchase;
        const lines = purchase.lines.filter((line) => line.productId !== productId);
        return { ...purchase, lines, total: lines.reduce((sum, line) => sum + line.total, 0) };
      })
      .filter((purchase) => purchase.lines.length > 0);
    setPurchases(nextPurchases);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      nextPurchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${selectedPurchaseDate} 매입 내역을 수정했습니다.`);
  }

  function cancelPurchase(purchaseId: string) {
    const purchase = purchases.find((entry) => entry.id === purchaseId);
    if (!purchase || purchase.cancelledAt) return;
    const nextPurchases = purchases.map((entry) => (entry.id === purchaseId ? { ...entry, cancelledAt: new Date().toISOString() } : entry));
    setPurchases(nextPurchases);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      nextPurchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`매입 ${money(purchase.total)}를 취소했습니다.`);
  }

  function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = activeView === "purchase" ? purchaseProductForm : productForm;
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name || !Number.isFinite(price) || price <= 0) {
      setNotice("상품명과 0원보다 큰 가격을 입력해 주세요.");
      return;
    }
    if (activeView === "purchase") {
      const nextProducts = [{ id: makeId("purchase-prod"), name, price: Math.round(price), categoryId: purchaseProductForm.categoryId }, ...purchaseProducts];
      setPurchaseProducts(nextProducts);
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        purchaseCategories,
        nextProducts,
        activePurchaseCategory,
      );
      setPurchaseProductForm({ name: "", price: "", categoryId: purchaseProductForm.categoryId });
      setNotice(`${name} 매입 상품을 등록했습니다.`);
      return;
    }
    const nextProducts = [{ id: makeId("prod"), name, price: Math.round(price), categoryId: productForm.categoryId }, ...products];
    setProducts(nextProducts);
    writeStoredData(
      categories,
      nextProducts,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setProductForm({ name: "", price: "", categoryId: productForm.categoryId });
    setNotice(`${name} 상품을 등록했습니다.`);
  }

  function beginEditProduct(product: Product) {
    setEditingProductId(product.id);
    setProductEditForm({ name: product.name, price: String(product.price), categoryId: product.categoryId });
  }

  function saveProductEdit(productId: string) {
    const name = productEditForm.name.trim();
    const price = Number(productEditForm.price);
    if (!name || !Number.isFinite(price) || price <= 0) {
      setNotice("수정할 상품명과 0원보다 큰 가격을 입력해 주세요.");
      return;
    }
    if (activeView === "purchase") {
      const nextProducts = purchaseProducts.map((product) =>
        product.id === productId ? { ...product, name, price: Math.round(price), categoryId: productEditForm.categoryId } : product,
      );
      setPurchaseProducts(nextProducts);
      setEditingProductId("");
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        purchaseCategories,
        nextProducts,
        activePurchaseCategory,
      );
      setNotice(`${name} 매입 상품을 수정했습니다.`);
      return;
    }
    const nextProducts = products.map((product) =>
      product.id === productId ? { ...product, name, price: Math.round(price), categoryId: productEditForm.categoryId } : product,
    );
    setProducts(nextProducts);
    setEditingProductId("");
    writeStoredData(
      categories,
      nextProducts,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${name} 상품을 수정했습니다.`);
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeView === "purchase") {
      if (purchaseCategories.length >= MAX_CATEGORIES) {
        setNotice(`매입 카테고리는 최대 ${MAX_CATEGORIES}개까지 추가할 수 있습니다.`);
        return;
      }
      const name = purchaseCategoryForm.trim();
      if (!name) {
        setNotice("매입 카테고리 이름을 입력해 주세요.");
        return;
      }
      const category = { id: makeId("purchase-cat"), name, color: colors[purchaseCategories.length % colors.length] };
      const nextCategories = [...purchaseCategories, category];
      setPurchaseCategories(nextCategories);
      setActivePurchaseCategory(category.id);
      setPurchaseProductForm((current) => ({ ...current, categoryId: category.id }));
      setPurchaseCategoryForm("");
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        nextCategories,
        purchaseProducts,
        category.id,
      );
      setNotice(`${name} 매입 카테고리를 추가했습니다. 현재 ${purchaseCategories.length + 1}/${MAX_CATEGORIES}개입니다.`);
      return;
    }
    if (categories.length >= MAX_CATEGORIES) {
      setNotice(`카테고리는 최대 ${MAX_CATEGORIES}개까지 추가할 수 있습니다.`);
      return;
    }
    const name = categoryForm.trim();
    if (!name) {
      setNotice("카테고리 이름을 입력해 주세요.");
      return;
    }
    const category = { id: makeId("cat"), name, color: colors[categories.length % colors.length] };
    const nextCategories = [...categories, category];
    setCategories(nextCategories);
    setActiveCategory(category.id);
    setProductForm((current) => ({ ...current, categoryId: category.id }));
    setCategoryForm("");
    writeStoredData(
      nextCategories,
      products,
      sales,
      category.id,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${name} 카테고리를 추가했습니다. 현재 ${categories.length + 1}/${MAX_CATEGORIES}개입니다.`);
  }

  function deleteProduct(productId: string) {
    if (activeView === "purchase") {
      const nextProducts = purchaseProducts.filter((item) => item.id !== productId);
      setPurchaseProducts(nextProducts);
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        purchaseCategories,
        nextProducts,
        activePurchaseCategory,
      );
      setPurchaseCart((items) => items.filter((item) => item.productId !== productId));
      setPurchaseDayEditCart((items) => items.filter((item) => item.productId !== productId));
      return;
    }
    const nextProducts = products.filter((item) => item.id !== productId);
    setProducts(nextProducts);
    writeStoredData(
      categories,
      nextProducts,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setCart((items) => items.filter((item) => item.productId !== productId));
    setDayEditCart((items) => items.filter((item) => item.productId !== productId));
    setReservationCart((items) => items.filter((item) => item.productId !== productId));
  }

  function deleteCategory(categoryId: string) {
    if (activeView === "purchase") {
      if (purchaseCategories.length === 1) {
        setNotice("매입 카테고리는 최소 1개가 필요합니다.");
        return;
      }
      const nextCategory = purchaseCategories.find((category) => category.id !== categoryId);
      const nextProducts = purchaseProducts.map((item) => (item.categoryId === categoryId ? { ...item, categoryId: nextCategory!.id } : item));
      const nextCategories = purchaseCategories.filter((item) => item.id !== categoryId);
      setPurchaseProducts(nextProducts);
      setPurchaseCategories(nextCategories);
      setActivePurchaseCategory("all");
      setPurchaseProductForm((current) => ({ ...current, categoryId: nextCategory!.id }));
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        nextCategories,
        nextProducts,
        "all",
      );
      return;
    }
    if (categories.length === 1) {
      setNotice("카테고리는 최소 1개가 필요합니다.");
      return;
    }
    const nextCategory = categories.find((category) => category.id !== categoryId);
    const nextProducts = products.map((item) => (item.categoryId === categoryId ? { ...item, categoryId: nextCategory!.id } : item));
    const nextCategories = categories.filter((item) => item.id !== categoryId);
    setProducts(nextProducts);
    setCategories(nextCategories);
    setActiveCategory("all");
    setProductForm((current) => ({ ...current, categoryId: nextCategory!.id }));
    writeStoredData(
      nextCategories,
      nextProducts,
      sales,
      "all",
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function renameCategory(categoryId: string, name: string) {
    if (activeView === "purchase") {
      const nextCategories = purchaseCategories.map((item) => (item.id === categoryId ? { ...item, name } : item));
      setPurchaseCategories(nextCategories);
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        nextCategories,
        purchaseProducts,
        activePurchaseCategory,
      );
      return;
    }
    const nextCategories = categories.map((item) => (item.id === categoryId ? { ...item, name } : item));
    setCategories(nextCategories);
    writeStoredData(
      nextCategories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function selectCategory(categoryId: string) {
    if (activeView === "purchase") {
      setActivePurchaseCategory(categoryId);
      writeStoredData(
        categories,
        products,
        sales,
        activeCategory,
        dayRecords,
        productSort,
        purchases,
        customers,
        reservations,
        purchaseCategories,
        purchaseProducts,
        categoryId,
      );
      return;
    }
    setActiveCategory(categoryId);
    writeStoredData(
      categories,
      products,
      sales,
      categoryId,
      dayRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function changeProductSort(sort: ProductSort) {
    setProductSort(sort);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      sort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function selectCalendarDate(date: string) {
    setSelectedCalendarDate(date);
    setSelectedMonth(date.slice(0, 7));
    setDayEditCart([]);
  }

  function changeSettlementMonth(month: string) {
    setSelectedMonth(month);
    if (!selectedCalendarDate.startsWith(month)) {
      setSelectedCalendarDate(`${month}-01`);
    }
  }

  function saveDayRecord(date: string, nextRecord: DayRecord) {
    const keepRecord = nextRecord.note.trim() || dayRecordTotal(nextRecord) > 0 || (nextRecord.lines?.length ?? 0) > 0;
    const nextRecords = keepRecord
      ? [...dayRecords.filter((record) => record.date !== date), nextRecord].sort((a, b) => a.date.localeCompare(b.date))
      : dayRecords.filter((record) => record.date !== date);
    setDayRecords(nextRecords);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      nextRecords,
      productSort,
      purchases,
      customers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function updateDayRecordNote(date: string, note: string) {
    const current = dayRecordMap.get(date) ?? { date, note: "", card: 0, cash: 0, transfer: 0, lines: [] };
    const nextRecord = {
      ...current,
      date,
      note,
    };
    saveDayRecord(date, nextRecord);
    setNotice(`${date} 내용을 저장했습니다.`);
  }

  function addDayEditCartToRecord() {
    if (!dayEditCartLines.length) {
      setNotice("선택한 날짜에 추가할 상품이 없습니다.");
      return;
    }
    const current = dayRecordMap.get(selectedCalendarDate) ?? { date: selectedCalendarDate, note: "", card: 0, cash: 0, transfer: 0, lines: [] };
    const newLines: DayRecordLine[] = dayEditCartLines.map((item) => ({
      id: makeId("day-line"),
      productId: item!.product.id,
      name: item!.product.name,
      categoryName: item!.categoryName,
      price: item!.product.price,
      quantity: item!.quantity,
      total: item!.total,
      paymentMethod: dayEditPaymentMethod,
    }));
    const existingLines = current.lines?.length ? current.lines : legacyDayRecordLines(current);
    const lines = [...existingLines, ...newLines];
    const totals = summarizeDayRecordLines(lines);
    saveDayRecord(selectedCalendarDate, {
      ...current,
      ...totals,
      lines,
    });
    setDayEditCart([]);
    setNotice(`${selectedCalendarDate}에 ${paymentLabels[dayEditPaymentMethod]} ${money(dayEditCartTotal)}를 추가했습니다.`);
  }

  function removeDayRecordLine(lineId: string) {
    const current = dayRecordMap.get(selectedCalendarDate);
    if (!current) return;
    const lines = (current.lines ?? []).filter((line) => line.id !== lineId);
    const totals = summarizeDayRecordLines(lines);
    saveDayRecord(selectedCalendarDate, {
      ...current,
      ...totals,
      lines,
    });
    setNotice(`${selectedCalendarDate} 내역을 수정했습니다.`);
  }

  function selectReservationDate(date: string) {
    setSelectedReservationDate(date);
    setReservationMonth(date.slice(0, 7));
    resetReservationForm(date);
  }

  function changeReservationMonth(month: string) {
    setReservationMonth(month);
    if (!selectedReservationDate.startsWith(month)) {
      setSelectedReservationDate(`${month}-01`);
    }
  }

  function resetReservationForm(date = selectedReservationDate) {
    setSelectedReservationDate(date);
    setReservationCart([]);
    setReservationPaymentMethod("card");
    setEditingReservationId("");
    setReservationForm({
      customerId: "",
      customerName: "",
      customerPhone: "",
      customerAddress: "",
      customerAddressDetail: "",
      deliveryTime: "",
      paymentStatus: "paid",
      status: "reserved",
      memo: "",
    });
    setReservationEditorOpen(true);
    setReservationCartOpen(true);
  }

  function applyCustomerToReservation(customerId: string) {
    const customer = customers.find((entry) => entry.id === customerId);
    setReservationForm((current) => ({
      ...current,
      customerId,
      customerName: customer?.name ?? current.customerName,
      customerPhone: customer?.phone ?? current.customerPhone,
      customerAddress: customer?.address ?? current.customerAddress,
      customerAddressDetail: customer?.addressDetail ?? current.customerAddressDetail,
    }));
  }

  function editReservation(reservation: Reservation) {
    setSelectedReservationDate(reservation.date);
    setReservationMonth(reservation.date.slice(0, 7));
    setEditingReservationId(reservation.id);
    setReservationPaymentMethod(reservation.paymentMethod ?? "card");
    setReservationCart(
      reservation.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      })),
    );
    setReservationForm({
      customerId: reservation.customerId,
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone,
      customerAddress: reservation.customerAddress,
      customerAddressDetail: reservation.customerAddressDetail ?? "",
      deliveryTime: reservation.deliveryTime ?? "",
      paymentStatus: reservation.paymentStatus ?? "paid",
      status: reservation.status ?? (reservation.completedAt ? "done" : "reserved"),
      memo: reservation.memo ?? "",
    });
    setReservationEditorOpen(true);
    setReservationCartOpen(true);
  }

  function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = customerForm.name.trim();
    if (!name) {
      setNotice("회원 이름을 입력해 주세요.");
      return;
    }
    const customer: Customer = {
      id: makeId("customer"),
      name,
      phone: customerForm.phone.trim(),
      address: customerForm.address.trim(),
      addressDetail: customerForm.addressDetail.trim(),
      birthday: customerForm.birthday.trim(),
      memo: customerForm.memo.trim(),
    };
    const nextCustomers = [customer, ...customers];
    setCustomers(nextCustomers);
    setReservationForm((current) => ({
      ...current,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      customerAddressDetail: customer.addressDetail ?? "",
    }));
    setCustomerForm({ name: "", phone: "", address: "", addressDetail: "", birthday: "", memo: "" });
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      nextCustomers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${name} 회원을 주소록에 추가했습니다.`);
  }

  function updateCustomer(customerId: string, field: keyof Omit<Customer, "id">, value: string) {
    const nextCustomers = customers.map((customer) => (customer.id === customerId ? { ...customer, [field]: value } : customer));
    setCustomers(nextCustomers);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      nextCustomers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function deleteCustomer(customerId: string) {
    if (reservations.some((reservation) => reservation.customerId === customerId)) {
      setNotice("예약 이력이 있는 고객은 삭제할 수 없습니다. 예약 내역을 먼저 정리해 주세요.");
      return;
    }
    const nextCustomers = customers.filter((customer) => customer.id !== customerId);
    setCustomers(nextCustomers);
    if (reservationForm.customerId === customerId) setReservationForm((current) => ({ ...current, customerId: "" }));
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      nextCustomers,
      reservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
  }

  function saveReservation() {
    if (!reservationCartLines.length) {
      setNotice("예약할 상품을 선택해 주세요.");
      return;
    }
    const selectedCustomer = customers.find((customer) => customer.id === reservationForm.customerId);
    const customerName = (selectedCustomer?.name ?? reservationForm.customerName).trim();
    const customerPhone = (selectedCustomer?.phone ?? reservationForm.customerPhone).trim();
    const customerAddress = (selectedCustomer?.address ?? reservationForm.customerAddress).trim();
    const customerAddressDetail = (selectedCustomer?.addressDetail ?? reservationForm.customerAddressDetail).trim();
    if (!customerName || !customerPhone) {
      setNotice("예약 고객 이름과 연락처를 입력해 주세요.");
      return;
    }
    let nextCustomers = customers;
    let customerId = selectedCustomer?.id ?? "";
    if (!customerId) {
      const duplicate = customers.find((customer) => customer.phone && customer.phone === customerPhone);
      if (duplicate) {
        customerId = duplicate.id;
      } else {
        const customer: Customer = {
          id: makeId("customer"),
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
          addressDetail: customerAddressDetail,
          birthday: "",
          memo: "",
        };
        customerId = customer.id;
        nextCustomers = [customer, ...customers];
        setCustomers(nextCustomers);
      }
    }
    const lines: DayRecordLine[] = reservationCartLines.map((item) => ({
      id: makeId("reservation-line"),
      productId: item!.product.id,
      name: item!.product.name,
      categoryName: item!.categoryName,
      price: item!.product.price,
      quantity: item!.quantity,
      total: item!.total,
      paymentMethod: reservationPaymentMethod,
    }));
    const reservation: Reservation = {
      id: editingReservationId || makeId("reservation"),
      date: selectedReservationDate,
      customerId,
      customerName,
      customerPhone,
      customerAddress,
      customerAddressDetail,
      deliveryTime: reservationForm.deliveryTime,
      memo: reservationForm.memo.trim(),
      paymentMethod: reservationPaymentMethod,
      paymentStatus: reservationForm.paymentStatus,
      status: reservationForm.status,
      lines,
      total: lines.reduce((sum, line) => sum + line.total, 0),
      completedAt: reservationForm.status === "done" ? new Date().toISOString() : undefined,
    };
    const nextReservations = editingReservationId
      ? reservations.map((entry) => (entry.id === editingReservationId ? { ...reservation, completedAt: entry.completedAt ?? reservation.completedAt } : entry))
      : [reservation, ...reservations];
    setReservations(nextReservations);
    resetReservationForm(selectedReservationDate);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      nextCustomers,
      nextReservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${selectedReservationDate} 예약을 ${editingReservationId ? "수정" : "저장"}했습니다.`);
  }

  function deleteReservation(reservationId: string) {
    if (!window.confirm("선택한 예약을 삭제하시겠습니까? 삭제한 데이터는 복구할 수 없습니다.")) return;
    const nextReservations = reservations.filter((reservation) => reservation.id !== reservationId);
    setReservations(nextReservations);
    if (editingReservationId === reservationId) resetReservationForm(selectedReservationDate);
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      nextReservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice("예약을 삭제했습니다.");
  }

  function confirmReservation(reservationId: string) {
    const reservation = reservations.find((entry) => entry.id === reservationId);
    if (!reservation) return;
    const nextReservations = reservations.map((entry) => (entry.id === reservationId ? { ...entry, status: "confirmed" as ReservationStatus } : entry));
    setReservations(nextReservations);
    setReservationForm((current) => (editingReservationId === reservationId ? { ...current, status: "confirmed" } : current));
    writeStoredData(
      categories,
      products,
      sales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      nextReservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${reservation.customerName} 예약을 확인 처리했습니다.`);
  }

  function completeReservation(reservationId: string) {
    const reservation = reservations.find((entry) => entry.id === reservationId);
    if (!reservation || reservation.completedAt) return;
    const sale: Sale = {
      id: makeId("sale"),
      soldAt: new Date().toISOString(),
      paymentMethod: reservation.paymentMethod,
      lines: reservation.lines.map(({ id, paymentMethod: _paymentMethod, ...line }) => line),
      total: reservation.total,
    };
    const nextSales = [sale, ...sales];
    const nextReservations = reservations.map((entry) => (entry.id === reservationId ? { ...entry, status: "done" as ReservationStatus, completedAt: sale.soldAt } : entry));
    setSales(nextSales);
    setReservations(nextReservations);
    writeStoredData(
      categories,
      products,
      nextSales,
      activeCategory,
      dayRecords,
      productSort,
      purchases,
      customers,
      nextReservations,
      purchaseCategories,
      purchaseProducts,
      activePurchaseCategory,
    );
    setNotice(`${reservation.customerName} 예약을 계산 완료하고 매출에 반영했습니다.`);
  }

  function exportSales() {
    if (activeView === "reservation") {
      const rows: Array<Array<string | number>> = [
        ["예약/배송 관리"],
        ["예약일", "배송시간", "고객명", "연락처", "주소", "상세주소", "상품", "결제수단", "결제상태", "예약상태", "금액", "특이사항"],
      ];
      selectedReservationMonthItems
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((reservation) => {
          rows.push([
            reservation.date,
            reservation.deliveryTime ?? "",
            reservation.customerName,
            reservation.customerPhone,
            reservation.customerAddress,
            reservation.customerAddressDetail ?? "",
            reservation.lines.map((line) => `${line.name} ${line.quantity}개`).join(", "),
            paymentLabels[reservation.paymentMethod],
            reservationPaymentStatusLabels[reservation.paymentStatus ?? "paid"],
            reservationStatusLabels[reservation.status ?? (reservation.completedAt ? "done" : "reserved")],
            reservation.total,
            reservation.memo,
          ]);
        });
      rows.push([]);
      rows.push(["고객 리스트"]);
      rows.push(["이름", "연락처", "주소", "상세주소", "생일", "특이사항", "예약건수", "누적금액", "최근예약일"]);
      customers.forEach((customer) => {
        const customerReservations = reservations.filter((reservation) => reservation.customerId === customer.id);
        rows.push([
          customer.name,
          customer.phone,
          customer.address,
          customer.addressDetail ?? "",
          customer.birthday ?? "",
          customer.memo ?? "",
          customerReservations.length,
          customerReservations.reduce((sum, reservation) => sum + reservation.total, 0),
          customerReservations.map((reservation) => reservation.date).sort().at(-1) ?? "",
        ]);
      });
      downloadExcel(`예약배송관리_${reservationMonth}.xls`, rows);
      return;
    }
    const rows: Array<Array<string | number>> = [["판매 집계"], ["구분", "기간", "결제수단", "상품명", "카테고리", "판매수량", "판매금액"]];
    const grouped = new Map<string, { scope: string; period: string; method: PaymentMethod; line: SaleLine }>();
    activeSales.forEach((sale) => {
      const soldDate = new Date(sale.soldAt);
      const method = sale.paymentMethod ?? "card";
      sale.lines.forEach((line) => {
        [
          ["일별", dateKey(soldDate)],
          ["주별", getWeekKey(soldDate)],
          ["월별", monthKey(soldDate)],
        ].forEach(([scope, period]) => {
          const key = `${scope}-${period}-${method}-${line.productId}`;
          const current = grouped.get(key);
          if (current) {
            current.line.quantity += line.quantity;
            current.line.total += line.total;
          } else {
            grouped.set(key, { scope, period, method, line: { ...line } });
          }
        });
      });
    });
    grouped.forEach((entry) => {
      rows.push([entry.scope, entry.period, paymentLabels[entry.method], entry.line.name, entry.line.categoryName, entry.line.quantity, entry.line.total]);
    });

    rows.push([]);
    rows.push(["일별 정산 요약"]);
    rows.push(["날짜", "카드 매출", "현금 매출", "계좌이체 매출", "총 매출"]);
    const settlement = new Map<string, { card: number; cash: number; transfer: number; total: number }>();
    activeSales.forEach((sale) => {
      const key = dateKey(new Date(sale.soldAt));
      const current = settlement.get(key) ?? { card: 0, cash: 0, transfer: 0, total: 0 };
      current.total += sale.total;
      if ((sale.paymentMethod ?? "card") === "transfer") {
        current.transfer += sale.total;
      } else if ((sale.paymentMethod ?? "card") === "cash") {
        current.cash += sale.total;
      } else {
        current.card += sale.total;
      }
      settlement.set(key, current);
    });
    dayRecords.forEach((record) => {
      const current = settlement.get(record.date) ?? { card: 0, cash: 0, transfer: 0, total: 0 };
      current.card += record.card;
      current.cash += record.cash;
      current.transfer += record.transfer;
      current.total += dayRecordTotal(record);
      settlement.set(record.date, current);
    });
    [...settlement.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, amount]) => {
        rows.push([date, amount.card, amount.cash, amount.transfer, amount.total]);
      });

    rows.push([]);
    rows.push(["달력 추가/수정 내역"]);
    rows.push(["날짜", "결제수단", "상품명", "카테고리", "수량", "금액", "메모"]);
    dayRecords
      .filter((record) => record.note.trim() || dayRecordTotal(record) > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((record) => {
        if (record.lines?.length) {
          record.lines.forEach((line) => {
            rows.push([record.date, paymentLabels[line.paymentMethod], line.name, line.categoryName, line.quantity, line.total, record.note]);
          });
        } else {
          rows.push([record.date, "직접 입력", "", "", "", dayRecordTotal(record), record.note]);
        }
      });

    rows.push([]);
    rows.push(["취소 내역"]);
    rows.push(["취소일시", "판매일시", "결제수단", "판매금액", "상품"]);
    sales
      .filter((sale) => sale.cancelledAt)
      .forEach((sale) => {
        rows.push([
          sale.cancelledAt ?? "",
          sale.soldAt,
          paymentLabels[sale.paymentMethod ?? "card"],
          sale.total,
          sale.lines.map((line) => `${line.name} ${line.quantity}개`).join(", "),
        ]);
      });
    downloadExcel(`판매집계_${dateKey(new Date())}.xls`, rows);
  }

  function renderRankList(items: RankItem[], emptyText: string) {
    if (items.length === 0) {
      return <p className="empty small-empty">{emptyText}</p>;
    }
    return items.map((item, index) => (
      <div key={`${item.name}-${index}`}>
        <b>{index + 1}</b>
        <span>{item.name}</span>
        <small>
          {item.quantity}개 · {money(item.total)}
        </small>
      </div>
    ));
  }

  const [year, month] = selectedMonth.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDay.getDay() }, (_, index) => ({ type: "blank", key: `blank-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = `${selectedMonth}-${String(day).padStart(2, "0")}`;
      return { type: "day", key, day, amount: dailyTotals.get(key) ?? { total: 0, card: 0, cash: 0, transfer: 0 } };
    }),
  ];
  const [purchaseYear, purchaseMonth] = selectedPurchaseMonth.split("-").map(Number);
  const purchaseFirstDay = new Date(purchaseYear, purchaseMonth - 1, 1);
  const purchaseDaysInMonth = new Date(purchaseYear, purchaseMonth, 0).getDate();
  const purchaseCalendarCells = [
    ...Array.from({ length: purchaseFirstDay.getDay() }, (_, index) => ({ type: "blank" as const, key: `purchase-blank-${index}` })),
    ...Array.from({ length: purchaseDaysInMonth }, (_, index) => {
      const day = index + 1;
      const key = `${selectedPurchaseMonth}-${String(day).padStart(2, "0")}`;
      return { type: "day" as const, key, day, amount: purchaseDailyTotals.get(key) ?? { total: 0, card: 0, cash: 0, transfer: 0 } };
    }),
  ];

  return (
    <main className="pos-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Store POS</p>
          <h1>{activeView === "reservation" ? "고객관리/예약/배송 관리" : activeView === "purchase" ? "매장 매입 관리" : "매장 판매 관리"}</h1>
        </div>
        <div className="summary-strip">
          <div>
            <span>{activeView === "reservation" ? `${reservationMonth} 예약 총건수` : activeView === "purchase" ? "오늘 매입" : "오늘 매출"}</span>
            <strong>{activeView === "reservation" ? money(selectedReservationMonthTotal) : activeView === "purchase" ? money(todayPurchaseTotal) : money(todayTotal)}</strong>
            <small>
              {activeView === "reservation"
                ? `카드 ${money(selectedReservationMonthCardTotal)} · 현금 ${money(selectedReservationMonthCashTotal)} · 이체 ${money(selectedReservationMonthTransferTotal)} · 미결제 ${money(selectedReservationMonthUnpaidTotal)}`
                : activeView === "purchase"
                  ? `카드 ${money(todayPurchaseCardTotal)} · 현금 ${money(todayPurchaseCashTotal)} · 이체 ${money(todayPurchaseTransferTotal)}`
                  : `카드 ${money(todayCardTotal)} · 현금 ${money(todayCashTotal)} · 이체 ${money(todayTransferTotal)}`}
            </small>
          </div>
          <div>
            <span>{activeView === "reservation" ? "고객수" : activeView === "purchase" ? "선택 월 매입" : "등록 상품"}</span>
            <strong>{activeView === "reservation" ? `${customers.length}개` : activeView === "purchase" ? money(selectedPurchaseMonthTotal) : `${products.length}개`}</strong>
            {activeView === "purchase" ? (
              <small>
                카드 {money(selectedPurchaseMonthCardTotal)} · 현금 {money(selectedPurchaseMonthCashTotal)} · 이체 {money(selectedPurchaseMonthTransferTotal)}
              </small>
            ) : null}
          </div>
          <button className="ghost-button" onClick={exportSales} type="button">
            Excel 내보내기
          </button>
          <span className={`sync-pill ${syncState}`}>
            {syncState === "checking" ? "저장 확인 중" : syncState === "cloud" ? "공용 저장 중" : "이 기기에만 저장"}
          </span>
        </div>
      </section>

      <nav className="module-tabs" aria-label="관리 화면 이동">
        <button className={activeView === "sales" ? "active" : ""} onClick={() => setActiveView("sales")} type="button">
          매출관리
        </button>
        <button className={activeView === "purchase" ? "active" : ""} onClick={() => setActiveView("purchase")} type="button">
          매입관리
        </button>
        <button className={activeView === "reservation" ? "active" : ""} onClick={() => setActiveView("reservation")} type="button">
          예약·배송관리
        </button>
      </nav>

      {activeView === "sales" ? (
        <>
      <section className="workspace">
        <div className="catalog-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Order</p>
              <h2>상품 선택</h2>
            </div>
            <div className="panel-tools">
              <label>
                정렬
                <select value={productSort} onChange={(event) => changeProductSort(event.target.value as ProductSort)}>
                  {Object.entries(productSortLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="notice">{notice}</span>
            </div>
          </div>

          <div className="category-tabs" aria-label="카테고리 필터">
            <button className={activeCategory === "all" ? "active" : ""} onClick={() => selectCategory("all")} type="button">
              전체
            </button>
            {categories.map((category) => (
              <button
                className={activeCategory === category.id ? "active" : ""}
                key={category.id}
                onClick={() => selectCategory(category.id)}
                style={{ "--accent": category.color } as React.CSSProperties}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>

          <div className="product-grid">
            {visibleProducts.map((product) => {
              const category = categoryMap.get(product.categoryId);
              return (
                <button className="product-tile" key={product.id} onClick={() => addToCart(product.id)} type="button">
                  <span className="swatch" style={{ background: category?.color }} />
                  <strong>{product.name}</strong>
                  <small>{category?.name ?? "미분류"}</small>
                  <b>{money(product.price)}</b>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="cart-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Cart</p>
              <h2>계산</h2>
            </div>
            <button className="text-button" onClick={() => setCart([])} type="button">
              비우기
            </button>
          </div>

          <div className="cart-list">
            {cartLines.length === 0 ? (
              <p className="empty">상품을 누르면 여기에 담깁니다.</p>
            ) : (
              cartLines.map((item) => (
                <div className="cart-line" key={item!.product.id}>
                  <div>
                    <strong>{item!.product.name}</strong>
                    <span>{money(item!.product.price)}</span>
                  </div>
                  <div className="stepper">
                    <button onClick={() => changeQuantity(item!.product.id, item!.quantity - 1)} type="button">
                      -
                    </button>
                    <input
                      aria-label={`${item!.product.name} 수량`}
                      min="1"
                      onChange={(event) => changeQuantity(item!.product.id, Number(event.target.value))}
                      type="number"
                      value={item!.quantity}
                    />
                    <button onClick={() => changeQuantity(item!.product.id, item!.quantity + 1)} type="button">
                      +
                    </button>
                  </div>
                  <b>{money(item!.total)}</b>
                </div>
              ))
            )}
          </div>

          <div className="checkout-box">
            <span>합계</span>
            <strong>{money(cartTotal)}</strong>
            <div className="payment-toggle" aria-label="결제수단 선택">
              <button className={paymentMethod === "card" ? "active" : ""} onClick={() => setPaymentMethod("card")} type="button">
                카드 결제
              </button>
              <button className={paymentMethod === "cash" ? "active" : ""} onClick={() => setPaymentMethod("cash")} type="button">
                현금 결제
              </button>
              <button className={paymentMethod === "transfer" ? "active" : ""} onClick={() => setPaymentMethod("transfer")} type="button">
                계좌이체
              </button>
            </div>
            <button className="primary-button" onClick={checkout} type="button">
              {paymentLabels[paymentMethod]} 계산 완료
            </button>
          </div>

          <div className="history-box">
            <div className="panel-head compact-head">
              <div>
                <p className="eyebrow">History</p>
                <h2>최근 계산 내역</h2>
              </div>
            </div>
            <div className="history-list">
              {recentSales.length === 0 ? (
                <p className="empty small-empty">아직 계산 내역이 없습니다.</p>
              ) : (
                recentSales.map((sale) => (
                  <div className={sale.cancelledAt ? "sale-row cancelled" : "sale-row"} key={sale.id}>
                    <div>
                      <strong>{money(sale.total)}</strong>
                      <span>{paymentLabels[sale.paymentMethod ?? "card"]} · {timeFormatter.format(new Date(sale.soldAt))}</span>
                      <small>{sale.lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}</small>
                    </div>
                    {sale.cancelledAt ? (
                      <b className="sale-status">취소됨</b>
                    ) : (
                      <button className="danger-button" onClick={() => cancelSale(sale.id)} type="button">
                        취소
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </section>

      <section className="management-grid">
        <div className="manage-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Products</p>
              <h2>상품 등록</h2>
            </div>
          </div>
          <form className="form-grid" onSubmit={addProduct}>
            <input placeholder="상품명" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
            <input
              inputMode="numeric"
              placeholder="가격"
              type="number"
              value={productForm.price}
              onChange={(event) => setProductForm({ ...productForm, price: event.target.value })}
            />
            <select value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button className="primary-button" type="submit">
              등록
            </button>
          </form>
          <div className="compact-list">
            {sortedProducts.map((product) => (
              <div key={product.id}>
                {editingProductId === product.id ? (
                  <div className="edit-product-row">
                    <input
                      aria-label={`${product.name} 상품명 수정`}
                      value={productEditForm.name}
                      onChange={(event) => setProductEditForm({ ...productEditForm, name: event.target.value })}
                    />
                    <input
                      aria-label={`${product.name} 가격 수정`}
                      inputMode="numeric"
                      type="number"
                      value={productEditForm.price}
                      onChange={(event) => setProductEditForm({ ...productEditForm, price: event.target.value })}
                    />
                    <select
                      aria-label={`${product.name} 카테고리 수정`}
                      value={productEditForm.categoryId}
                      onChange={(event) => setProductEditForm({ ...productEditForm, categoryId: event.target.value })}
                    >
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => saveProductEdit(product.id)} type="button">
                      저장
                    </button>
                    <button onClick={() => setEditingProductId("")} type="button">
                      취소
                    </button>
                  </div>
                ) : (
                  <>
                    <span>{product.name}</span>
                    <small>{money(product.price)}</small>
                    <button onClick={() => beginEditProduct(product)} type="button">
                      수정
                    </button>
                    <button onClick={() => deleteProduct(product.id)} type="button">
                      삭제
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="manage-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Categories</p>
              <h2>카테고리 설정</h2>
            </div>
            <span className="limit-badge">{categories.length}/{MAX_CATEGORIES}</span>
          </div>
          <form className="inline-form" onSubmit={addCategory}>
            <input
              disabled={categories.length >= MAX_CATEGORIES}
              placeholder={categories.length >= MAX_CATEGORIES ? "카테고리 최대 개수 도달" : "새 카테고리"}
              value={categoryForm}
              onChange={(event) => setCategoryForm(event.target.value)}
            />
            <button className="primary-button" disabled={categories.length >= MAX_CATEGORIES} type="submit">
              추가
            </button>
          </form>
          <div className="category-list">
            {categories.map((category) => (
              <div key={category.id}>
                <span className="swatch" style={{ background: category.color }} />
                <input
                  aria-label={`${category.name} 이름`}
                  value={category.name}
                  onChange={(event) => renameCategory(category.id, event.target.value)}
                />
                <button onClick={() => deleteCategory(category.id)} type="button">
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="settlement-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Settlement</p>
              <h2>정산 달력</h2>
            </div>
            <input aria-label="정산 월" type="month" value={selectedMonth} onChange={(event) => changeSettlementMonth(event.target.value)} />
          </div>
          <div className="monthly-total">
            <div>
              <span>월별 매출</span>
              <small>카드 {money(monthlyCardTotal)} · 현금 {money(monthlyCashTotal)} · 이체 {money(monthlyTransferTotal)}</small>
            </div>
            <strong>{money(monthlyTotal)}</strong>
          </div>
          <div className="calendar-weekdays">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarCells.map((cell) =>
              cell.type === "blank" ? (
                <div className="calendar-day blank" key={cell.key} />
              ) : (
                <button
                  className={[
                    "calendar-day",
                    cell.amount.total ? "has-sale" : "",
                    dayRecordMap.get(cell.key)?.note ? "has-note" : "",
                    selectedCalendarDate === cell.key ? "selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={cell.key}
                  onClick={() => selectCalendarDate(cell.key)}
                  type="button"
                >
                  <span>{cell.day}</span>
                  <strong>{cell.amount.total ? money(cell.amount.total) : ""}</strong>
                  {cell.amount.total ? (
                    <div className="day-payment-breakdown">
                      <em>카드 {money(cell.amount.card)}</em>
                      <em>현금 {money(cell.amount.cash)}</em>
                      <em>이체 {money(cell.amount.transfer)}</em>
                    </div>
                  ) : null}
                  {dayRecordMap.get(cell.key)?.note ? <em className="day-note-mark">메모</em> : null}
                  <small>{weekdayFormatter.format(new Date(cell.key))}</small>
                </button>
              ),
            )}
          </div>
          <div className="day-editor">
            <div className="day-editor-head">
              <div>
                <p className="eyebrow">Day Edit</p>
                <h3>{selectedCalendarDate} 내용 수정</h3>
                <small>
                  판매 {selectedDaySales.length}건 · 합계 {money(selectedDayAmount.total)}
                </small>
              </div>
              <button className="collapse-button" onClick={() => setDayEditOpen((open) => !open)} type="button">
                {dayEditOpen ? "접기" : "펼치기"}
              </button>
            </div>
            {dayEditOpen ? (
              <div className="day-edit-workspace">
              <section>
                <div className="category-tabs compact-tabs" aria-label="날짜 편집 카테고리 필터">
                  <button className={dayEditCategory === "all" ? "active" : ""} onClick={() => setDayEditCategory("all")} type="button">
                    전체
                  </button>
                  {categories.map((category) => (
                    <button
                      className={dayEditCategory === category.id ? "active" : ""}
                      key={category.id}
                      onClick={() => setDayEditCategory(category.id)}
                      style={{ "--accent": category.color } as React.CSSProperties}
                      type="button"
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
                <div className="day-product-grid">
                  {visibleDayEditProducts.map((product) => {
                    const category = categoryMap.get(product.categoryId);
                    return (
                      <button className="day-product-tile" key={product.id} onClick={() => addToDayEditCart(product.id)} type="button">
                        <span className="swatch" style={{ background: category?.color }} />
                        <strong>{product.name}</strong>
                        <small>{category?.name ?? "미분류"}</small>
                        <b>{money(product.price)}</b>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="day-edit-cart">
                <div className="day-edit-cart-head">
                  <strong>선택 상품</strong>
                  <button className="text-button" onClick={() => setDayEditCart([])} type="button">
                    비우기
                  </button>
                </div>
                <div className="day-edit-lines">
                  {dayEditCartLines.length === 0 ? (
                    <p className="empty small-empty">날짜에 추가할 상품을 선택하세요.</p>
                  ) : (
                    dayEditCartLines.map((item) => (
                      <div className="cart-line" key={item!.product.id}>
                        <div>
                          <strong>{item!.product.name}</strong>
                          <span>{money(item!.product.price)}</span>
                        </div>
                        <div className="stepper">
                          <button onClick={() => changeDayEditQuantity(item!.product.id, item!.quantity - 1)} type="button">
                            -
                          </button>
                          <input
                            aria-label={`${item!.product.name} 날짜 추가 수량`}
                            min="1"
                            onChange={(event) => changeDayEditQuantity(item!.product.id, Number(event.target.value))}
                            type="number"
                            value={item!.quantity}
                          />
                          <button onClick={() => changeDayEditQuantity(item!.product.id, item!.quantity + 1)} type="button">
                            +
                          </button>
                        </div>
                        <b>{money(item!.total)}</b>
                      </div>
                    ))
                  )}
                </div>
                <div className="payment-toggle" aria-label="날짜 추가 결제수단 선택">
                  <button className={dayEditPaymentMethod === "card" ? "active" : ""} onClick={() => setDayEditPaymentMethod("card")} type="button">
                    카드
                  </button>
                  <button className={dayEditPaymentMethod === "cash" ? "active" : ""} onClick={() => setDayEditPaymentMethod("cash")} type="button">
                    현금
                  </button>
                  <button
                    className={dayEditPaymentMethod === "transfer" ? "active" : ""}
                    onClick={() => setDayEditPaymentMethod("transfer")}
                    type="button"
                  >
                    이체
                  </button>
                </div>
                <div className="day-edit-total">
                  <span>추가 합계</span>
                  <strong>{money(dayEditCartTotal)}</strong>
                </div>
                <button className="primary-button" onClick={addDayEditCartToRecord} type="button">
                  {selectedCalendarDate}에 추가
                </button>
              </section>
              </div>
            ) : null}
            {(selectedDayRecord?.lines?.length ?? 0) > 0 ? (
              <div className="day-record-lines">
                <div className="day-record-lines-head">
                  <strong>추가된 품목</strong>
                  <button className="collapse-button" onClick={() => setDayRecordLinesOpen((open) => !open)} type="button">
                    {dayRecordLinesOpen ? "접기" : "펼치기"}
                  </button>
                </div>
                {dayRecordLinesOpen
                  ? selectedDayRecord!.lines!.map((line) => (
                      <div key={line.id}>
                        <span>
                          {line.name} {line.quantity}개
                        </span>
                        <small>
                          {paymentLabels[line.paymentMethod]} · {money(line.total)}
                        </small>
                        <button onClick={() => removeDayRecordLine(line.id)} type="button">
                          삭제
                        </button>
                      </div>
                    ))
                  : null}
              </div>
            ) : null}
            <label className="day-note-field">
              메모
              <textarea
                placeholder="해당 날짜에 남길 내용"
                value={selectedDayRecord?.note ?? ""}
                onChange={(event) => updateDayRecordNote(selectedCalendarDate, event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="manage-panel rank-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Rank</p>
              <h2>판매 순위</h2>
            </div>
          </div>
          <div className="rank-columns">
            <section>
              <div className="rank-heading">
                <div>
                  <h3>월별 판매 순위</h3>
                  <span>{selectedRankMonth}</span>
                </div>
                <input
                  aria-label="월별 판매 순위 조회 월"
                  type="month"
                  value={selectedRankMonth}
                  onChange={(event) => setSelectedRankMonth(event.target.value)}
                />
              </div>
              <div className="rank-list">{renderRankList(monthlyRank, "선택한 월의 판매 기록이 없습니다.")}</div>
            </section>
            <section>
              <div className="rank-heading">
                <div>
                  <h3>주간 판매 순위</h3>
                  <span>{selectedWeekLabel}</span>
                </div>
                <input
                  aria-label="주간 판매 순위 기준일"
                  type="date"
                  value={selectedRankDate}
                  onChange={(event) => setSelectedRankDate(event.target.value)}
                />
              </div>
              <div className="rank-list">{renderRankList(weeklyRank, "이번 주 판매 기록이 없습니다.")}</div>
            </section>
          </div>
        </div>
      </section>
        </>
      ) : null}

      {activeView === "purchase" ? (
        <section className="workspace module-page">
          <div className="catalog-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Purchase</p>
                <h2>매입 상품 선택</h2>
              </div>
              <span className="notice">{notice}</span>
            </div>
            <div className="category-tabs" aria-label="매입 카테고리 필터">
              <button className={activePurchaseCategory === "all" ? "active" : ""} onClick={() => selectCategory("all")} type="button">
                전체
              </button>
              {purchaseCategories.map((category) => (
                <button
                  className={activePurchaseCategory === category.id ? "active" : ""}
                  key={category.id}
                  onClick={() => selectCategory(category.id)}
                  style={{ "--accent": category.color } as React.CSSProperties}
                  type="button"
                >
                  {category.name}
                </button>
              ))}
            </div>
            <div className="product-grid">
              {visiblePurchaseProducts.map((product) => {
                const category = purchaseCategoryMap.get(product.categoryId);
                return (
                  <button className="product-tile purchase-tile" key={product.id} onClick={() => addToPurchaseCart(product.id)} type="button">
                    <span className="swatch" style={{ background: category?.color }} />
                    <strong>{product.name}</strong>
                    <small>{category?.name ?? "미분류"}</small>
                    <b>{money(product.price)}</b>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="cart-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Purchase Cart</p>
                <h2>매입 기록</h2>
              </div>
              <button className="text-button" onClick={() => setPurchaseCart([])} type="button">
                비우기
              </button>
            </div>
            <div className="cart-list">
              {purchaseCartLines.length === 0 ? (
                <p className="empty">매입할 상품을 누르면 여기에 담깁니다.</p>
              ) : (
                purchaseCartLines.map((item) => (
                  <div className="cart-line" key={item!.product.id}>
                    <div>
                      <strong>{item!.product.name}</strong>
                      <span>{money(item!.product.price)}</span>
                    </div>
                    <div className="stepper">
                      <button onClick={() => changePurchaseQuantity(item!.product.id, item!.quantity - 1)} type="button">
                        -
                      </button>
                      <input
                        aria-label={`${item!.product.name} 매입 수량`}
                        min="1"
                        onChange={(event) => changePurchaseQuantity(item!.product.id, Number(event.target.value))}
                        type="number"
                        value={item!.quantity}
                      />
                      <button onClick={() => changePurchaseQuantity(item!.product.id, item!.quantity + 1)} type="button">
                        +
                      </button>
                    </div>
                    <b>{money(item!.total)}</b>
                  </div>
                ))
              )}
            </div>
            <div className="checkout-box">
              <span>매입 합계</span>
              <strong>{money(purchaseCartTotal)}</strong>
              <div className="payment-toggle" aria-label="매입 입금수단 선택">
                <button className={purchasePaymentMethod === "card" ? "active" : ""} onClick={() => setPurchasePaymentMethod("card")} type="button">
                  카드입금
                </button>
                <button className={purchasePaymentMethod === "cash" ? "active" : ""} onClick={() => setPurchasePaymentMethod("cash")} type="button">
                  현금입금
                </button>
                <button className={purchasePaymentMethod === "transfer" ? "active" : ""} onClick={() => setPurchasePaymentMethod("transfer")} type="button">
                  계좌이체
                </button>
              </div>
              <textarea placeholder="매입 메모" value={purchaseMemo} onChange={(event) => setPurchaseMemo(event.target.value)} />
              <button className="primary-button" onClick={recordPurchase} type="button">
                매입 완료
              </button>
            </div>
            <div className="history-box">
              <div className="panel-head compact-head">
                <div>
                  <p className="eyebrow">Purchase History</p>
                  <h2>최근 매입 내역</h2>
                </div>
              </div>
              <div className="history-list">
                {recentPurchases.length === 0 ? (
                  <p className="empty small-empty">아직 매입 내역이 없습니다.</p>
                ) : (
                  recentPurchases.map((purchase) => (
                    <div className={purchase.cancelledAt ? "sale-row cancelled" : "sale-row"} key={purchase.id}>
                      <div>
                        <strong>{money(purchase.total)}</strong>
                        <span>{paymentLabels[purchase.paymentMethod ?? "card"]} · {timeFormatter.format(new Date(purchase.purchasedAt))}</span>
                        <small>{purchase.lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}</small>
                      </div>
                      {purchase.cancelledAt ? (
                        <b className="sale-status">취소됨</b>
                      ) : (
                        <button className="danger-button" onClick={() => cancelPurchase(purchase.id)} type="button">
                          취소
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {activeView === "purchase" ? (
        <section className="management-grid">
          <div className="manage-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Products</p>
                <h2>매입 상품 등록</h2>
              </div>
            </div>
            <form className="form-grid" onSubmit={addProduct}>
              <input placeholder="상품명" value={purchaseProductForm.name} onChange={(event) => setPurchaseProductForm({ ...purchaseProductForm, name: event.target.value })} />
              <input
                inputMode="numeric"
                placeholder="금액"
                type="number"
                value={purchaseProductForm.price}
                onChange={(event) => setPurchaseProductForm({ ...purchaseProductForm, price: event.target.value })}
              />
              <select value={purchaseProductForm.categoryId} onChange={(event) => setPurchaseProductForm({ ...purchaseProductForm, categoryId: event.target.value })}>
                {purchaseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button className="primary-button" type="submit">
                등록
              </button>
            </form>
            <div className="compact-list">
              {sortedPurchaseProducts.map((product) => (
                <div key={`purchase-${product.id}`}>
                  {editingProductId === product.id ? (
                    <div className="edit-product-row">
                      <input
                        aria-label={`${product.name} 매입 상품명 수정`}
                        value={productEditForm.name}
                        onChange={(event) => setProductEditForm({ ...productEditForm, name: event.target.value })}
                      />
                      <input
                        aria-label={`${product.name} 매입 금액 수정`}
                        inputMode="numeric"
                        type="number"
                        value={productEditForm.price}
                        onChange={(event) => setProductEditForm({ ...productEditForm, price: event.target.value })}
                      />
                      <select
                        aria-label={`${product.name} 매입 카테고리 수정`}
                        value={productEditForm.categoryId}
                        onChange={(event) => setProductEditForm({ ...productEditForm, categoryId: event.target.value })}
                      >
                        {purchaseCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => saveProductEdit(product.id)} type="button">
                        저장
                      </button>
                      <button onClick={() => setEditingProductId("")} type="button">
                        취소
                      </button>
                    </div>
                  ) : (
                    <>
                      <span>{product.name}</span>
                      <small>{money(product.price)}</small>
                      <button onClick={() => beginEditProduct(product)} type="button">
                        수정
                      </button>
                      <button onClick={() => deleteProduct(product.id)} type="button">
                        삭제
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="manage-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Categories</p>
                <h2>매입 카테고리 설정</h2>
              </div>
              <span className="limit-badge">{purchaseCategories.length}/{MAX_CATEGORIES}</span>
            </div>
            <form className="inline-form" onSubmit={addCategory}>
              <input
                disabled={purchaseCategories.length >= MAX_CATEGORIES}
                placeholder={purchaseCategories.length >= MAX_CATEGORIES ? "카테고리 최대 개수 도달" : "새 카테고리"}
                value={purchaseCategoryForm}
                onChange={(event) => setPurchaseCategoryForm(event.target.value)}
              />
              <button className="primary-button" disabled={purchaseCategories.length >= MAX_CATEGORIES} type="submit">
                추가
              </button>
            </form>
            <div className="category-list">
              {purchaseCategories.map((category) => (
                <div key={`purchase-${category.id}`}>
                  <span className="swatch" style={{ background: category.color }} />
                  <input aria-label={`${category.name} 매입 카테고리 이름`} value={category.name} onChange={(event) => renameCategory(category.id, event.target.value)} />
                  <button onClick={() => deleteCategory(category.id)} type="button">
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="settlement-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Purchase Settlement</p>
                <h2>매입 정산 달력</h2>
              </div>
              <input aria-label="매입 정산 월" type="month" value={selectedPurchaseMonth} onChange={(event) => changePurchaseMonth(event.target.value)} />
            </div>
            <div className="monthly-total purchase-total">
              <div>
                <span>월별 매입</span>
                <small>카드 {money(selectedPurchaseMonthCardTotal)} · 현금 {money(selectedPurchaseMonthCashTotal)} · 이체 {money(selectedPurchaseMonthTransferTotal)}</small>
              </div>
              <strong>{money(selectedPurchaseMonthTotal)}</strong>
            </div>
            <div className="calendar-weekdays">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <span key={`purchase-weekday-${day}`}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {purchaseCalendarCells.map((cell) =>
                cell.type === "blank" ? (
                  <div className="calendar-day blank" key={cell.key} />
                ) : (
                  <button
                    className={["calendar-day", cell.amount.total ? "has-sale" : "", selectedPurchaseDate === cell.key ? "selected" : ""].filter(Boolean).join(" ")}
                    key={cell.key}
                    onClick={() => selectPurchaseDate(cell.key)}
                    type="button"
                  >
                    <span>{cell.day}</span>
                    <strong>{cell.amount.total ? money(cell.amount.total) : ""}</strong>
                    {cell.amount.total ? (
                      <div className="day-payment-breakdown">
                        <em>카드 {money(cell.amount.card)}</em>
                        <em>현금 {money(cell.amount.cash)}</em>
                        <em>이체 {money(cell.amount.transfer)}</em>
                      </div>
                    ) : null}
                    <small>{weekdayFormatter.format(new Date(cell.key))}</small>
                  </button>
                ),
              )}
            </div>
            <div className="day-editor">
              <div className="day-editor-head">
                <div>
                  <p className="eyebrow">Purchase Day Edit</p>
                  <h3>{selectedPurchaseDate} 내용 수정</h3>
                  <small>매입 {selectedPurchaseItems.length}건 · 합계 {money(selectedPurchaseAmount.total)}</small>
                </div>
                <button className="collapse-button" onClick={() => setPurchaseDayEditOpen((open) => !open)} type="button">
                  {purchaseDayEditOpen ? "접기" : "펼치기"}
                </button>
              </div>
              {purchaseDayEditOpen ? (
                <div className="day-edit-workspace">
                  <section>
                    <div className="category-tabs compact-tabs" aria-label="매입 날짜 편집 카테고리 필터">
                      <button className={purchaseDayEditCategory === "all" ? "active" : ""} onClick={() => setPurchaseDayEditCategory("all")} type="button">
                        전체
                      </button>
                      {purchaseCategories.map((category) => (
                        <button
                          className={purchaseDayEditCategory === category.id ? "active" : ""}
                          key={`purchase-day-${category.id}`}
                          onClick={() => setPurchaseDayEditCategory(category.id)}
                          style={{ "--accent": category.color } as React.CSSProperties}
                          type="button"
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                    <div className="day-product-grid">
                      {visiblePurchaseDayEditProducts.map((product) => {
                        const category = purchaseCategoryMap.get(product.categoryId);
                        return (
                          <button className="day-product-tile" key={`purchase-day-${product.id}`} onClick={() => addToPurchaseDayEditCart(product.id)} type="button">
                            <span className="swatch" style={{ background: category?.color }} />
                            <strong>{product.name}</strong>
                            <small>{category?.name ?? "미분류"}</small>
                            <b>{money(product.price)}</b>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="day-edit-cart">
                    <div className="day-edit-cart-head">
                      <strong>선택 매입 품목</strong>
                      <button className="text-button" onClick={() => setPurchaseDayEditCart([])} type="button">
                        비우기
                      </button>
                    </div>
                    <div className="day-edit-lines">
                      {purchaseDayEditCartLines.length === 0 ? (
                        <p className="empty small-empty">날짜에 추가할 매입 상품을 선택하세요.</p>
                      ) : (
                        purchaseDayEditCartLines.map((item) => (
                          <div className="cart-line" key={`purchase-day-line-${item!.product.id}`}>
                            <div>
                              <strong>{item!.product.name}</strong>
                              <span>{money(item!.product.price)}</span>
                            </div>
                            <div className="stepper">
                              <button onClick={() => changePurchaseDayEditQuantity(item!.product.id, item!.quantity - 1)} type="button">
                                -
                              </button>
                              <input
                                aria-label={`${item!.product.name} 매입 날짜 추가 수량`}
                                min="1"
                                onChange={(event) => changePurchaseDayEditQuantity(item!.product.id, Number(event.target.value))}
                                type="number"
                                value={item!.quantity}
                              />
                              <button onClick={() => changePurchaseDayEditQuantity(item!.product.id, item!.quantity + 1)} type="button">
                                +
                              </button>
                            </div>
                            <b>{money(item!.total)}</b>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="payment-toggle" aria-label="매입 날짜 추가 입금수단 선택">
                      <button className={purchaseDayEditPaymentMethod === "card" ? "active" : ""} onClick={() => setPurchaseDayEditPaymentMethod("card")} type="button">
                        카드입금
                      </button>
                      <button className={purchaseDayEditPaymentMethod === "cash" ? "active" : ""} onClick={() => setPurchaseDayEditPaymentMethod("cash")} type="button">
                        현금입금
                      </button>
                      <button className={purchaseDayEditPaymentMethod === "transfer" ? "active" : ""} onClick={() => setPurchaseDayEditPaymentMethod("transfer")} type="button">
                        계좌이체
                      </button>
                    </div>
                    <div className="day-edit-total">
                      <span>추가 합계</span>
                      <strong>{money(purchaseDayEditCartTotal)}</strong>
                    </div>
                    <button className="primary-button" onClick={addPurchaseDayEditCartToRecord} type="button">
                      {selectedPurchaseDate}에 추가
                    </button>
                  </section>
                </div>
              ) : null}
              {selectedPurchaseItems.length > 0 ? (
                <div className="day-record-lines">
                  <div className="day-record-lines-head">
                    <strong>매입 내역</strong>
                    <button className="collapse-button" onClick={() => setPurchaseRecordLinesOpen((open) => !open)} type="button">
                      {purchaseRecordLinesOpen ? "접기" : "펼치기"}
                    </button>
                  </div>
                  {purchaseRecordLinesOpen
                    ? selectedPurchaseItems.map((purchase) => (
                        <div key={`purchase-record-${purchase.id}`}>
                          <span>{purchase.lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}</span>
                          <small>
                            {paymentLabels[purchase.paymentMethod ?? "card"]} · {money(purchase.total)}
                          </small>
                          <input aria-label="매입 메모 수정" value={purchase.memo} onChange={(event) => updatePurchaseMemo(purchase.id, event.target.value)} />
                          <button onClick={() => cancelPurchase(purchase.id)} type="button">
                            취소
                          </button>
                        </div>
                      ))
                    : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="manage-panel rank-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Rank</p>
                <h2>매입 순위</h2>
              </div>
            </div>
            <div className="rank-columns">
              <section>
                <div className="rank-heading">
                  <div>
                    <h3>월별 매입 순위</h3>
                    <span>{selectedPurchaseRankMonth}</span>
                  </div>
                  <input
                    aria-label="월별 매입 순위 조회 월"
                    type="month"
                    value={selectedPurchaseRankMonth}
                    onChange={(event) => setSelectedPurchaseRankMonth(event.target.value)}
                  />
                </div>
                <div className="rank-list">{renderRankList(monthlyPurchaseRank, "선택한 월의 매입 기록이 없습니다.")}</div>
              </section>
              <section>
                <div className="rank-heading">
                  <div>
                    <h3>주간 매입 순위</h3>
                    <span>{selectedPurchaseWeekLabel}</span>
                  </div>
                  <input
                    aria-label="주간 매입 순위 기준일"
                    type="date"
                    value={selectedPurchaseRankDate}
                    onChange={(event) => setSelectedPurchaseRankDate(event.target.value)}
                  />
                </div>
                <div className="rank-list">{renderRankList(weeklyPurchaseRank, "이번 주 매입 기록이 없습니다.")}</div>
              </section>
            </div>
          </div>
        </section>
      ) : null}

      {activeView === "reservation" ? (
        <section className="reservation-page">
          <section className="reservation-board">
            <div className="reservation-main-column">
            <div className="settlement-panel reservation-calendar-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Order</p>
                <h2>예약/배송</h2>
              </div>
              <div className="reservation-tools">
                <select aria-label="지점 선택">
                  <option>오늘자순</option>
                  <option>예약 많은 순</option>
                  <option>배송완료 우선</option>
                </select>
                <strong>{reservationMonth} ★예약 {selectedReservationMonthItems.length}건</strong>
                <input aria-label="예약 월" type="month" value={reservationMonth} onChange={(event) => changeReservationMonth(event.target.value)} />
              </div>
            </div>
            <div className="reservation-status-guide">
              <span className="status-red">★예약</span>
              <span>→</span>
              <span className="status-dark">완료</span>
            </div>
            <div className="calendar-weekdays">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {reservationCalendarCells.map((cell) =>
                cell.type === "blank" ? (
                  <div className="calendar-day blank" key={cell.key} />
                ) : (
                  <button
                    className={["calendar-day", cell.count ? "has-sale" : "", cell.allDone ? "reservation-all-done" : "", selectedReservationDate === cell.key ? "selected" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    key={cell.key}
                    onClick={() => selectReservationDate(cell.key)}
                    type="button"
                  >
                    <span>{cell.day}</span>
                    <small>{weekdayFormatter.format(new Date(`${cell.key}T00:00:00`))}</small>
                    <strong>{cell.count ? (cell.allDone ? `완료 ${cell.count}건` : `★예약 ${cell.count}건`) : ""}</strong>
                    {cell.reservations.slice(0, 5).map((reservation, index) => (
                      <em
                        className={reservation.completedAt || reservation.status === "done" ? "reservation-done" : "reservation-line-mark"}
                        key={`reservation-mark-${reservation.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          editReservation(reservation);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            editReservation(reservation);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title={`${reservation.customerName} 예약을 CART에서 확인/수정`}
                      >
                        {index + 1}.주문: {reservation.customerName}
                      </em>
                    ))}
                    {cell.count > 5 ? <em className="reservation-more">+{cell.count - 5}건 더보기</em> : null}
                    {cell.total ? <small>{money(cell.total)}</small> : null}
                  </button>
                ),
              )}
            </div>
            </div>

            <div className="manage-panel reservation-selected-list">
              <div className="day-record-lines">
                <div className="day-record-lines-head">
                  <strong>{selectedReservationDate} 예약 목록</strong>
                  <button className="collapse-button" onClick={() => resetReservationForm(selectedReservationDate)} type="button">
                    새 예약
                  </button>
                </div>
                {selectedReservationItems.length === 0 ? (
                  <p className="empty small-empty">선택한 날짜의 예약이 없습니다.</p>
                ) : (
                  selectedReservationItems.map((reservation) => (
                    <div key={reservation.id}>
                      <span>
                        {reservation.customerName} · {reservation.lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}
                      </span>
                      <small>
                        {paymentLabels[reservation.paymentMethod]} · {reservationPaymentStatusLabels[reservation.paymentStatus ?? "paid"]} · {reservationStatusLabels[reservation.status ?? (reservation.completedAt ? "done" : "reserved")]} · {money(reservation.total)} · {reservation.customerAddress}
                      </small>
                      {reservation.completedAt || reservation.status === "done" ? (
                        <b className="sale-status">완료</b>
                      ) : (
                        <button onClick={() => completeReservation(reservation.id)} type="button">
                          계산 완료
                        </button>
                      )}
                      <button onClick={() => editReservation(reservation)} type="button">
                        수정
                      </button>
                      <button onClick={() => deleteReservation(reservation.id)} type="button">
                        삭제
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            </div>

            <aside className="cart-panel reservation-order-panel">
              <div className="day-editor-head">
                <div>
                  <p className="eyebrow">Cart</p>
                  <h3>예약 주문 현황</h3>
                  <small>예약 {selectedReservationItems.length}건 · 합계 {money(selectedReservationItems.reduce((sum, item) => sum + item.total, 0))}</small>
                </div>
                <button className="collapse-button" onClick={() => setReservationEditorOpen((open) => !open)} type="button">
                  {reservationEditorOpen ? "접기" : "펼치기"}
                </button>
              </div>
              {reservationEditorOpen ? (
                <div className="reservation-form-card">
                  {editingReservationId ? (
                    <div className="reservation-editing-banner">
                      <strong>{reservationForm.customerName || "선택한 예약"}</strong>
                      <span>CART에서 주문 내역 확인/수정 중</span>
                    </div>
                  ) : null}
                  <label className="day-note-field">
                    배송날짜
                    <input
                      type="date"
                      value={selectedReservationDate}
                      onChange={(event) => {
                        setSelectedReservationDate(event.target.value);
                        setReservationMonth(event.target.value.slice(0, 7));
                      }}
                    />
                  </label>
                  <label className="day-note-field">
                    고객 선택
                    <select value={reservationForm.customerId} onChange={(event) => applyCustomerToReservation(event.target.value)}>
                      <option value="">회원 선택</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name} {customer.phone}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input placeholder="1.이름" value={reservationForm.customerName} onChange={(event) => setReservationForm({ ...reservationForm, customerName: event.target.value, customerId: "" })} />
                  <input placeholder="2.연락처" value={reservationForm.customerPhone} onChange={(event) => setReservationForm({ ...reservationForm, customerPhone: event.target.value, customerId: "" })} />
                  <input placeholder="3.배송지 주소" value={reservationForm.customerAddress} onChange={(event) => setReservationForm({ ...reservationForm, customerAddress: event.target.value, customerId: "" })} />
                  <input placeholder="4.상세주소" value={reservationForm.customerAddressDetail} onChange={(event) => setReservationForm({ ...reservationForm, customerAddressDetail: event.target.value, customerId: "" })} />
                  <input placeholder="5.배송시간 예: 오후3시" value={reservationForm.deliveryTime} onChange={(event) => setReservationForm({ ...reservationForm, deliveryTime: event.target.value })} />
                  <div className="category-tabs compact-tabs" aria-label="예약 카테고리 필터">
                    <button className={reservationCategory === "all" ? "active" : ""} onClick={() => setReservationCategory("all")} type="button">
                      전체
                    </button>
                    {categories.map((category) => (
                      <button
                        className={reservationCategory === category.id ? "active" : ""}
                        key={category.id}
                        onClick={() => setReservationCategory(category.id)}
                        style={{ "--accent": category.color } as React.CSSProperties}
                        type="button"
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                  <div className="day-edit-cart-head">
                    <strong>상품</strong>
                    <div className="button-pair">
                      <button className="collapse-button" onClick={() => setReservationCartOpen((open) => !open)} type="button">
                        {reservationCartOpen ? "접기" : "펼치기"}
                      </button>
                      <button className="text-button" onClick={() => setReservationCart([])} type="button">
                        비우기
                      </button>
                    </div>
                  </div>
                  {reservationCartOpen ? (
                    <>
                      <div className="reservation-product-picker">
                        {visibleReservationProducts.map((product) => {
                          const category = categoryMap.get(product.categoryId);
                          return (
                            <button key={product.id} onClick={() => addToReservationCart(product.id)} type="button">
                              <span className="swatch" style={{ background: category?.color }} />
                              <strong>{product.name}</strong>
                              <small>{money(product.price)}</small>
                            </button>
                          );
                        })}
                      </div>
                      <div className="day-edit-lines">
                        {reservationCartLines.length === 0 ? (
                          <p className="empty small-empty">예약할 상품을 선택하세요.</p>
                        ) : (
                          reservationCartLines.map((item) => (
                            <div className="cart-line" key={item!.product.id}>
                              <div>
                                <strong>{item!.product.name}</strong>
                                <span>{money(item!.product.price)}</span>
                              </div>
                              <div className="stepper">
                                <button onClick={() => changeReservationQuantity(item!.product.id, item!.quantity - 1)} type="button">
                                  -
                                </button>
                                <input
                                  aria-label={`${item!.product.name} 예약 수량`}
                                  min="1"
                                  onChange={(event) => changeReservationQuantity(item!.product.id, Number(event.target.value))}
                                  type="number"
                                  value={item!.quantity}
                                />
                                <button onClick={() => changeReservationQuantity(item!.product.id, item!.quantity + 1)} type="button">
                                  +
                                </button>
                              </div>
                              <b>{money(item!.total)}</b>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  ) : null}
                  <div className="payment-toggle" aria-label="예약 결제수단 선택">
                    <button className={reservationPaymentMethod === "card" ? "active" : ""} onClick={() => setReservationPaymentMethod("card")} type="button">
                      카드
                    </button>
                    <button className={reservationPaymentMethod === "cash" ? "active" : ""} onClick={() => setReservationPaymentMethod("cash")} type="button">
                      현금
                    </button>
                    <button className={reservationPaymentMethod === "transfer" ? "active" : ""} onClick={() => setReservationPaymentMethod("transfer")} type="button">
                      이체
                    </button>
                  </div>
                  <div className="reservation-two-col">
                    <select value={reservationForm.paymentStatus} onChange={(event) => setReservationForm({ ...reservationForm, paymentStatus: event.target.value as ReservationPaymentStatus })}>
                      {Object.entries(reservationPaymentStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select value={reservationForm.status} onChange={(event) => setReservationForm({ ...reservationForm, status: event.target.value as ReservationStatus })}>
                      {Object.entries(reservationStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    placeholder="6.특이사항"
                    value={reservationForm.memo}
                    onChange={(event) => setReservationForm({ ...reservationForm, memo: event.target.value })}
                  />
                  <div className="day-edit-total">
                    <span>예약 합계</span>
                    <strong>{money(reservationCartTotal)}</strong>
                  </div>
                  <div className="reservation-actions">
                    <button className="primary-button" onClick={saveReservation} type="button">
                      {editingReservationId ? "수정완료" : "입력완료"}
                    </button>
                    {editingReservationId ? (
                      <button className="ghost-button" onClick={() => confirmReservation(editingReservationId)} type="button">
                        예약확인
                      </button>
                    ) : null}
                    {editingReservationId && !reservations.find((entry) => entry.id === editingReservationId)?.completedAt ? (
                      <button className="ghost-button" onClick={() => completeReservation(editingReservationId)} type="button">
                        계산완료
                      </button>
                    ) : null}
                    {editingReservationId ? (
                      <button className="danger-button" onClick={() => deleteReservation(editingReservationId)} type="button">
                        삭제
                      </button>
                    ) : null}
                    <button className="ghost-button" onClick={() => resetReservationForm()} type="button">
                      초기화
                    </button>
                  </div>
                </div>
              ) : (
                <p className="empty small-empty reservation-prompt">달력에서 날짜를 누르면 예약 입력창이 열립니다.</p>
              )}
              <div className="day-record-lines reservation-history">
                <div className="day-record-lines-head">
                  <strong>최근입력내역</strong>
                </div>
                {reservations.length === 0 ? (
                  <p className="empty small-empty">최근 입력 내역이 없습니다.</p>
                ) : (
                  reservations.slice(0, 10).map((reservation) => (
                    <div key={`recent-${reservation.id}`} onClick={() => editReservation(reservation)} role="button" tabIndex={0}>
                      <span>
                        {reservation.customerName} · {reservation.lines.map((line) => `${line.name} ${line.quantity}개`).join(", ")}
                      </span>
                      <small>
                        {reservation.date} · {reservationStatusLabels[reservation.status ?? (reservation.completedAt ? "done" : "reserved")]} · {money(reservation.total)}
                      </small>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </section>

          <div className="manage-panel rank-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Rank</p>
                <h2>예약순위</h2>
              </div>
            </div>
            <div className="rank-columns">
              <section>
                <div className="rank-heading">
                  <div>
                    <h3>월별 예약순위</h3>
                    <span>{reservationMonth}</span>
                  </div>
                  <input aria-label="월별 예약 순위 조회 월" type="month" value={reservationMonth} onChange={(event) => changeReservationMonth(event.target.value)} />
                </div>
                <div className="rank-list">{renderRankList(monthlyReservationRank, "선택한 월의 예약 기록이 없습니다.")}</div>
              </section>
              <section>
                <div className="rank-heading">
                  <div>
                    <h3>주간 예약순위</h3>
                    <span>{reservationWeekLabel}</span>
                  </div>
                  <input aria-label="주간 예약 순위 기준일" type="date" value={selectedReservationDate} onChange={(event) => selectReservationDate(event.target.value)} />
                </div>
                <div className="rank-list">{renderRankList(weeklyReservationRank, "이번 주 예약 기록이 없습니다.")}</div>
              </section>
            </div>
          </div>

          <section className="customer-management">
            <div className="manage-panel customer-list-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Rank</p>
                  <h2>고객리스트</h2>
                </div>
                <input placeholder="고객검색" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
              </div>
              <div className="customer-table">
                <div className="customer-row customer-head">
                  <span>번호</span>
                  <span>이름</span>
                  <span>연락처</span>
                  <span>주소</span>
                  <span>생일</span>
                  <span>특이사항</span>
                  <span>누적</span>
                  <span>관리</span>
                </div>
                {filteredCustomers.length === 0 ? (
                  <p className="empty small-empty">등록된 고객이 없습니다.</p>
                ) : (
                  filteredCustomers.map((customer, index) => {
                    const customerReservations = reservations.filter((reservation) => reservation.customerId === customer.id);
                    return (
                      <div className="customer-row" key={customer.id}>
                        <span>{index + 1}</span>
                        <input aria-label={`${customer.name} 이름`} value={customer.name} onChange={(event) => updateCustomer(customer.id, "name", event.target.value)} />
                        <input aria-label={`${customer.name} 연락처`} value={customer.phone} onChange={(event) => updateCustomer(customer.id, "phone", event.target.value)} />
                        <input aria-label={`${customer.name} 주소`} value={customer.address} onChange={(event) => updateCustomer(customer.id, "address", event.target.value)} />
                        <input aria-label={`${customer.name} 생일`} value={customer.birthday ?? ""} onChange={(event) => updateCustomer(customer.id, "birthday", event.target.value)} />
                        <input aria-label={`${customer.name} 특이사항`} value={customer.memo ?? ""} onChange={(event) => updateCustomer(customer.id, "memo", event.target.value)} />
                        <small>{customerReservations.length}건 · {money(customerReservations.reduce((sum, reservation) => sum + reservation.total, 0))}</small>
                        <div className="button-pair">
                          <button className="text-button" onClick={() => applyCustomerToReservation(customer.id)} type="button">
                            예약
                          </button>
                          <button className="text-button danger-text" onClick={() => deleteCustomer(customer.id)} type="button">
                            삭제
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="manage-panel customer-form-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Customer</p>
                  <h2>고객정보입력란</h2>
                </div>
              </div>
              <form className="customer-input-form" onSubmit={addCustomer}>
                <input placeholder="1.이름" value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} />
                <input placeholder="2.연락처" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} />
                <input placeholder="3.주소" value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} />
                <input placeholder="4.상세주소" value={customerForm.addressDetail} onChange={(event) => setCustomerForm({ ...customerForm, addressDetail: event.target.value })} />
                <input placeholder="5.생일" value={customerForm.birthday} onChange={(event) => setCustomerForm({ ...customerForm, birthday: event.target.value })} />
                <textarea placeholder="6.특이사항" value={customerForm.memo} onChange={(event) => setCustomerForm({ ...customerForm, memo: event.target.value })} />
                <button className="primary-button" type="submit">
                  입력완료
                </button>
              </form>
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}
