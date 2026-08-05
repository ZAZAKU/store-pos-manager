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

type DayRecord = {
  date: string;
  note: string;
  card: number;
  cash: number;
  transfer: number;
  lines?: DayRecordLine[];
};

type RankItem = {
  name: string;
  quantity: number;
  total: number;
};

type ProductSort = "createdDesc" | "createdAsc" | "nameAsc" | "nameDesc" | "priceAsc" | "priceDesc";

type StoredData = {
  categories?: Category[];
  products?: Product[];
  sales?: Sale[];
  dayRecords?: DayRecord[];
  activeCategory?: string;
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

function rankSales(sales: Sale[]) {
  const map = new Map<string, RankItem>();
  sales.forEach((sale) =>
    sale.lines.forEach((line) => {
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
  const activeCategory =
    parsed.activeCategory === "all" || categories.some((category) => category.id === parsed.activeCategory) ? parsed.activeCategory : "all";

  return {
    categories,
    products: parsed.products?.length ? parsed.products : seedProducts,
    sales: normalizeSales(parsed.sales ?? []),
    dayRecords: normalizeDayRecords(parsed.dayRecords ?? []),
    activeCategory,
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
): Required<StoredData> {
  return {
    categories,
    products,
    sales,
    dayRecords,
    activeCategory,
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
) {
  if (typeof window === "undefined") return null;
  try {
    const data = makeStoredData(categories, products, sales, activeCategory, dayRecords, productSort);
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
  const [categories, setCategories] = useState<Category[]>(seedCategories);
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [dayEditCart, setDayEditCart] = useState<CartItem[]>([]);
  const [dayEditPaymentMethod, setDayEditPaymentMethod] = useState<PaymentMethod>("card");
  const [dayEditCategory, setDayEditCategory] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [productSort, setProductSort] = useState<ProductSort>("createdDesc");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(dateKey(new Date()));
  const [selectedRankMonth, setSelectedRankMonth] = useState(monthKey(new Date()));
  const [selectedRankDate, setSelectedRankDate] = useState(dateKey(new Date()));
  const [productForm, setProductForm] = useState({ name: "", price: "", categoryId: seedCategories[0].id });
  const [categoryForm, setCategoryForm] = useState("");
  const [notice, setNotice] = useState("오늘 첫 판매를 기다리는 중입니다.");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("checking");
  const [ready, setReady] = useState(false);

  function applyStoredData(data: ReturnType<typeof normalizeStoredData>) {
    setCategories(data.categories);
    setProducts(data.products);
    setSales(data.sales);
    setDayRecords(data.dayRecords);
    setActiveCategory(data.activeCategory);
    setProductSort(data.productSort);
    setLastSavedAt(data.updatedAt);
    setProductForm((current) => ({
      ...current,
      categoryId: data.categories[0]?.id ?? seedCategories[0].id,
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
    const saved = writeStoredData(categories, products, sales, activeCategory, dayRecords, productSort);
    if (!saved) {
      setNotice("브라우저 저장소를 사용할 수 없습니다. 시크릿 모드나 저장소 차단 설정을 확인해 주세요.");
      return;
    }
    setLastSavedAt(saved.updatedAt);
    writeCloudData(saved).then((uploaded) => {
      setSyncState(uploaded ? "cloud" : "local");
    });
  }, [activeCategory, categories, dayRecords, productSort, products, sales, ready]);

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
      writeStoredData(categories, products, sales, activeCategory, dayRecords, productSort);
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
  }, [activeCategory, categories, dayRecords, productSort, products, sales, ready]);

  const activeSales = useMemo(() => sales.filter((sale) => !sale.cancelledAt), [sales]);
  const recentSales = sales.slice(0, 8);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const dayRecordMap = useMemo(() => new Map(dayRecords.map((record) => [record.date, record])), [dayRecords]);

  const visibleProducts = useMemo(
    () => sortProducts(products.filter((product) => activeCategory === "all" || product.categoryId === activeCategory), productSort),
    [activeCategory, productSort, products],
  );
  const visibleDayEditProducts = useMemo(
    () => sortProducts(products.filter((product) => dayEditCategory === "all" || product.categoryId === dayEditCategory), productSort),
    [dayEditCategory, productSort, products],
  );
  const sortedProducts = useMemo(() => sortProducts(products, productSort), [productSort, products]);

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
  const selectedRankWeekDate = new Date(selectedRankDate);
  const selectedWeekStart = startOfWeek(selectedRankWeekDate);
  const selectedWeekEnd = endOfWeek(selectedRankWeekDate);
  const selectedWeekLabel = getWeekKey(selectedRankWeekDate);
  const selectedWeekSales = activeSales.filter((sale) => {
    const soldAt = new Date(sale.soldAt);
    return soldAt >= selectedWeekStart && soldAt <= selectedWeekEnd;
  });
  const monthlyRank = useMemo(() => rankSales(rankMonthSales), [rankMonthSales]);
  const weeklyRank = useMemo(() => rankSales(selectedWeekSales), [selectedWeekSales]);

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
    writeStoredData(categories, products, nextSales, activeCategory, dayRecords, productSort);
    setCart([]);
    setNotice(`${paymentLabels[paymentMethod]} ${money(sale.total)} 결제가 기록되었습니다. 잘못 눌렀다면 최근 계산 내역에서 취소하세요.`);
  }

  function cancelSale(saleId: string) {
    const sale = sales.find((entry) => entry.id === saleId);
    if (!sale || sale.cancelledAt) return;
    const nextSales = sales.map((entry) => (entry.id === saleId ? { ...entry, cancelledAt: new Date().toISOString() } : entry));
    setSales(nextSales);
    writeStoredData(categories, products, nextSales, activeCategory, dayRecords, productSort);
    setNotice(`${timeFormatter.format(new Date(sale.soldAt))} 결제 ${money(sale.total)}를 취소했습니다.`);
  }

  function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = productForm.name.trim();
    const price = Number(productForm.price);
    if (!name || !Number.isFinite(price) || price <= 0) {
      setNotice("상품명과 0원보다 큰 가격을 입력해 주세요.");
      return;
    }
    const nextProducts = [{ id: makeId("prod"), name, price: Math.round(price), categoryId: productForm.categoryId }, ...products];
    setProducts(nextProducts);
    writeStoredData(categories, nextProducts, sales, activeCategory, dayRecords, productSort);
    setProductForm({ name: "", price: "", categoryId: productForm.categoryId });
    setNotice(`${name} 상품을 등록했습니다.`);
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    writeStoredData(nextCategories, products, sales, category.id, dayRecords, productSort);
    setNotice(`${name} 카테고리를 추가했습니다. 현재 ${categories.length + 1}/${MAX_CATEGORIES}개입니다.`);
  }

  function deleteProduct(productId: string) {
    const nextProducts = products.filter((item) => item.id !== productId);
    setProducts(nextProducts);
    writeStoredData(categories, nextProducts, sales, activeCategory, dayRecords, productSort);
    setCart((items) => items.filter((item) => item.productId !== productId));
    setDayEditCart((items) => items.filter((item) => item.productId !== productId));
  }

  function deleteCategory(categoryId: string) {
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
    writeStoredData(nextCategories, nextProducts, sales, "all", dayRecords, productSort);
  }

  function renameCategory(categoryId: string, name: string) {
    const nextCategories = categories.map((item) => (item.id === categoryId ? { ...item, name } : item));
    setCategories(nextCategories);
    writeStoredData(nextCategories, products, sales, activeCategory, dayRecords, productSort);
  }

  function selectCategory(categoryId: string) {
    setActiveCategory(categoryId);
    writeStoredData(categories, products, sales, categoryId, dayRecords, productSort);
  }

  function changeProductSort(sort: ProductSort) {
    setProductSort(sort);
    writeStoredData(categories, products, sales, activeCategory, dayRecords, sort);
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
    writeStoredData(categories, products, sales, activeCategory, nextRecords, productSort);
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

  function exportSales() {
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

  return (
    <main className="pos-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Store POS</p>
          <h1>매장 판매 관리</h1>
        </div>
        <div className="summary-strip">
          <div>
            <span>오늘 매출</span>
            <strong>{money(todayTotal)}</strong>
            <small>카드 {money(todayCardTotal)} · 현금 {money(todayCashTotal)} · 이체 {money(todayTransferTotal)}</small>
          </div>
          <div>
            <span>등록 상품</span>
            <strong>{products.length}개</strong>
          </div>
          <button className="ghost-button" onClick={exportSales} type="button">
            Excel 내보내기
          </button>
          <span className={`sync-pill ${syncState}`}>
            {syncState === "checking" ? "저장 확인 중" : syncState === "cloud" ? "공용 저장 중" : "이 기기에만 저장"}
          </span>
        </div>
      </section>

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
                <span>{product.name}</span>
                <small>{money(product.price)}</small>
                <button onClick={() => deleteProduct(product.id)} type="button">
                  삭제
                </button>
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
            <div>
              <p className="eyebrow">Day Edit</p>
              <h3>{selectedCalendarDate} 내용 수정</h3>
              <small>
                판매 {selectedDaySales.length}건 · 합계 {money(selectedDayAmount.total)}
              </small>
            </div>
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
            {(selectedDayRecord?.lines?.length ?? 0) > 0 ? (
              <div className="day-record-lines">
                <strong>추가된 품목</strong>
                {selectedDayRecord!.lines!.map((line) => (
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
                ))}
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
    </main>
  );
}
