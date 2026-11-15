import { products as seed, type Product } from "./products";
import { orders } from "./orders";

export type Item = Product & { sold: number; updatedAt: number };

export const LOW_AT = 5;

export function statusFor(quantity: number): "Available" | "Low" | "Out" {
  if (quantity <= 0) return "Out";
  if (quantity <= LOW_AT) return "Low";
  return "Available";
}
export const VIEWS = ["Front", "Side", "Detail", "In use"];

/* Placeholder catalogue (merged with the demo seed) */
export const EXTRA: Product[] = [
  {
    id: "prod_spark20-new",
    name: "New Tecno Spark 20 128GB",
    sku: "TEC-002",
    quantity: 8,
    unitPrice: 140000,
    costPrice: 112000,
    category: "Smartphones",
    condition: "New",
    status: "Available",
    description: "Brand new, sealed. Buy and enjoy, no fault. Warranty for enquiries.",
    image: "/products/jiji-02.jpg",
  },
  {
    id: "prod_spark20-pro",
    name: "Tecno Spark 20 Pro 256GB Silver",
    sku: "TEC-003",
    quantity: 6,
    unitPrice: 185000,
    costPrice: 148000,
    category: "Smartphones",
    condition: "Used",
    status: "Available",
    description: "256GB in good condition, nothing to fix. Clean body, sharp camera.",
    image: "/products/jiji-03.jpg",
  },
  {
    id: "prod_spark20c",
    name: "Tecno Spark 20C 256GB White",
    sku: "TEC-004",
    quantity: 7,
    unitPrice: 130000,
    costPrice: 104000,
    category: "Smartphones",
    condition: "Used",
    status: "Available",
    description: "Neatly used, never unscrewed. Device in good working condition.",
    image: "/products/jiji-04.jpg",
  },
  {
    id: "prod_hot40i",
    name: "Infinix Hot 40i 128GB Black",
    sku: "INF-001",
    quantity: 10,
    unitPrice: 165000,
    costPrice: 132000,
    category: "Smartphones",
    condition: "UK Used",
    status: "Available",
    description: "Very clean UK-used phone, 4GB RAM + 128GB, fingerprint by the side. Very sharp.",
    image: "/products/jiji-05.jpg",
  },
  {
    id: "prod_hot40",
    name: "New Infinix Hot 40 256GB",
    sku: "INF-002",
    quantity: 7,
    unitPrice: 216000,
    costPrice: 172800,
    category: "Smartphones",
    condition: "New",
    status: "Available",
    description: "256GB/8GB. New phone, sealed. Available in stock.",
    image: "/products/jiji-06.jpg",
  },
  {
    id: "prod_hot40i-silver",
    name: "Infinix Hot 40i 128GB Silver",
    sku: "INF-003",
    quantity: 5,
    unitPrice: 95000,
    costPrice: 76000,
    category: "Smartphones",
    condition: "Used",
    status: "Low",
    description: "Very clean Infinix Hot 40i, 128GB. Nothing to fix.",
    image: "/products/jiji-07.jpg",
  },
  {
    id: "prod_hot40-pro",
    name: "New Infinix Hot 40 Pro 256GB",
    sku: "INF-004",
    quantity: 4,
    unitPrice: 248000,
    costPrice: 198400,
    category: "Smartphones",
    condition: "New",
    status: "Low",
    description: "Brand new Infinix Hot 40 Pro, 256GB. Available in stock.",
    image: "/products/jiji-08.jpg",
  },
  {
    id: "prod_a17",
    name: "Samsung Galaxy A17 128GB Blue",
    sku: "SAM-001",
    quantity: 4,
    unitPrice: 340000,
    costPrice: 272000,
    category: "Smartphones",
    condition: "New",
    status: "Low",
    description: "Brand new Samsung Galaxy A17, 128GB storage. Sealed with warranty.",
    image: "/products/jiji-09.jpg",
  },
  {
    id: "prod_note13pro",
    name: "Xiaomi Redmi Note 13 Pro 5G 256GB Black",
    sku: "RED-001",
    quantity: 5,
    unitPrice: 235000,
    costPrice: 188000,
    category: "Smartphones",
    condition: "New",
    status: "Low",
    description: "Redmi Note 13 Pro 5G, 256GB. Clean, fast charging, sharp camera.",
    image: "/products/jiji-10.jpg",
  },
  {
    id: "prod_note11",
    name: "Xiaomi Redmi Note 11 256GB Bronze",
    sku: "RED-002",
    quantity: 9,
    unitPrice: 130000,
    costPrice: 104000,
    category: "Smartphones",
    condition: "Used",
    status: "Available",
    description: "Redmi Note 11, 256GB storage. Neatly used, battery strong.",
    image: "/products/jiji-11.jpg",
  },
  {
    id: "prod_iphone12pro",
    name: "Apple iPhone 12 Pro 128GB Black",
    sku: "APP-001",
    quantity: 3,
    unitPrice: 345000,
    costPrice: 276000,
    category: "Smartphones",
    condition: "UK Used",
    status: "Low",
    description: "UK-used iPhone 12 Pro, 128GB. Factory unlocked, battery healthy.",
    image: "/products/jiji-12.jpg",
  },
  {
    id: "prod_iphone11",
    name: "Apple iPhone 11 128GB Green",
    sku: "APP-002",
    quantity: 4,
    unitPrice: 228000,
    costPrice: 182400,
    category: "Smartphones",
    condition: "UK Used",
    status: "Low",
    description: "Neatly used iPhone 11, 128GB. Everything working perfectly.",
    image: "/products/jiji-13.jpg",
  },
  {
    id: "prod_iphone8plus",
    name: "Apple iPhone 8 Plus 256GB Black",
    sku: "APP-003",
    quantity: 6,
    unitPrice: 70000,
    costPrice: 56000,
    category: "Smartphones",
    condition: "Used",
    status: "Available",
    description: "iPhone 8 Plus, 256GB storage. Good working condition, clean body.",
    image: "/products/jiji-14.jpg",
  },
  {
    id: "prod_itel-a300-128",
    name: "New Itel A300+ 128GB Black",
    sku: "ITL-001",
    quantity: 15,
    unitPrice: 190000,
    costPrice: 152000,
    category: "Smartphones",
    condition: "New",
    status: "Available",
    description: "Brand new Itel A300+, 128GB storage. Sealed pack.",
    image: "/products/jiji-15.jpg",
  },
  {
    id: "prod_itel-a300-64",
    name: "New Itel A300+ 64GB Black",
    sku: "ITL-002",
    quantity: 14,
    unitPrice: 170000,
    costPrice: 136000,
    category: "Smartphones",
    condition: "New",
    status: "Available",
    description: "Brand new Itel A300+, 64GB storage. Sealed pack.",
    image: "/products/jiji-16.jpg",
  },
  {
    id: "prod_s20plus",
    name: "Samsung Galaxy S20+ 5G 256GB Black",
    sku: "SAM-002",
    quantity: 3,
    unitPrice: 215000,
    costPrice: 172000,
    category: "Smartphones",
    condition: "UK Used",
    status: "Low",
    description: "UK-used Galaxy S20+ 5G, 256GB. Very clean, strong battery.",
    image: "/products/jiji-17.jpg",
  },
  {
    id: "prod_s20",
    name: "Samsung Galaxy S20 5G 128GB Gray",
    sku: "SAM-003",
    quantity: 4,
    unitPrice: 200000,
    costPrice: 160000,
    category: "Smartphones",
    condition: "UK Used",
    status: "Low",
    description: "UK-used Galaxy S20 5G, 128GB. Clean screen, all functions working.",
    image: "/products/jiji-18.jpg",
  },
  {
    id: "prod_oneplus10t",
    name: "OnePlus 10T 128GB Black",
    sku: "ONE-001",
    quantity: 2,
    unitPrice: 220000,
    costPrice: 176000,
    category: "Smartphones",
    condition: "Used",
    status: "Low",
    description: "OnePlus 10T, 128GB, 5G. Super fast charging, smooth display.",
    image: "/products/jiji-19.jpg",
  },
  {
    id: "prod_reno6pro",
    name: "Oppo Reno6 Pro 5G 256GB Gold",
    sku: "OPP-001",
    quantity: 3,
    unitPrice: 175000,
    costPrice: 140000,
    category: "Smartphones",
    condition: "Used",
    status: "Low",
    description: "Oppo Reno6 Pro 5G, 256GB. Sleek body, great camera.",
    image: "/products/jiji-20.jpg",
  },
  {
    id: "prod_xiaomi14",
    name: "Xiaomi 14 512GB Green",
    sku: "XIA-001",
    quantity: 2,
    unitPrice: 430000,
    costPrice: 344000,
    category: "Smartphones",
    condition: "New",
    status: "Low",
    description: "Flagship Xiaomi 14, 512GB storage. Leica camera, brand new feel.",
    image: "/products/jiji-21.jpg",
  },
  {
    id: "prod_s24",
    name: "Samsung Galaxy S24 256GB Black",
    sku: "SAM-004",
    quantity: 2,
    unitPrice: 600000,
    costPrice: 480000,
    category: "Smartphones",
    condition: "New",
    status: "Low",
    description: "Brand new Galaxy S24, 256GB. Latest AI features, sealed.",
    image: "/products/jiji-22.jpg",
  },
  {
    id: "prod_freepods-neo",
    name: "Oraimo Freepods Neo",
    sku: "ACC-001",
    quantity: 25,
    unitPrice: 24500,
    costPrice: 19600,
    category: "Accessories",
    condition: "New",
    status: "Available",
    description: "Sound360 spatial audio, half-in-ear comfort for long listening. Brand new.",
    image: "/products/jiji-23.jpg",
  },
  {
    id: "prod_freepods4",
    name: "Oraimo Freepods 4 ANC",
    sku: "ACC-002",
    quantity: 12,
    unitPrice: 42000,
    costPrice: 33600,
    category: "Accessories",
    condition: "New",
    status: "Available",
    description: "Active noise cancellation, 35.5-hour playtime. Brand new, sealed.",
    image: "/products/jiji-24.jpg",
  },
  {
    id: "prod_firefly3",
    name: "Oraimo Firefly 3 Fast Charger + Micro USB",
    sku: "ACC-003",
    quantity: 30,
    unitPrice: 5500,
    costPrice: 4400,
    category: "Accessories",
    condition: "New",
    status: "Available",
    description: "Fast charger with micro USB cable. Protects your battery while charging fast.",
    image: "/products/jiji-25.jpg",
  },
  {
    id: "prod_spark-case",
    name: "Tecno Spark 20 Pro Leather Case + Glass",
    sku: "CAS-001",
    quantity: 40,
    unitPrice: 8000,
    costPrice: 6400,
    category: "Accessories",
    status: "Available",
    condition: "New",
    description: "Premium leather phone case with soft TPU stand plus tempered glass guard.",
    image: "/products/jiji-26.jpg",
  },
  {
    id: "prod_iphone13",
    name: "iPhone 13 128GB Blue",
    sku: "APP-004",
    quantity: 3,
    unitPrice: 358000,
    costPrice: 300000,
    category: "Smartphones",
    status: "Low",
    condition: "UK Used",
    description: "UK-used, BH 81%, everything working, Face ID perfect. Just 358k.",
    image: "/products/jiji-27.jpg",
  },
  {
    id: "prod_iphone13pm",
    name: "iPhone 13 Pro Max 128GB White",
    sku: "APP-005",
    quantity: 2,
    unitPrice: 540000,
    costPrice: 460000,
    category: "Smartphones",
    status: "Low",
    condition: "UK Used",
    description: "UK-used 13 Pro Max 128GB. All working, body 10/10. Just 540k.",
    image: "/products/jiji-28.jpg",
  },
  {
    id: "prod_s21",
    name: "New Samsung Galaxy S21 5G 256GB Black",
    sku: "SAM-005",
    quantity: 5,
    unitPrice: 265000,
    costPrice: 212000,
    category: "Smartphones",
    status: "Available",
    condition: "New",
    description: "Brand new S21 5G, 256GB. Sealed, warranty available.",
    image: "/products/jiji-29.jpg",
  },
  {
    id: "prod_s21ultra",
    name: "New Samsung Galaxy S21 Ultra 5G 256GB Silver",
    sku: "SAM-006",
    quantity: 3,
    unitPrice: 415000,
    costPrice: 340000,
    category: "Smartphones",
    status: "Low",
    condition: "New",
    description: "Brand new S21 Ultra 5G, 100x zoom camera. Sealed.",
    image: "/products/jiji-30.jpg",
  },
  {
    id: "prod_camon30",
    name: "Tecno Camon 30 5G 512GB Blue",
    sku: "TEC-005",
    quantity: 3,
    unitPrice: 339999,
    costPrice: 280000,
    category: "Smartphones",
    status: "Low",
    condition: "UK Used",
    description: "Foreign used Camon 30 5G, 512GB + 8GB RAM, AMOLED 120Hz. Extremely neat.",
    image: "/products/jiji-31.jpg",
  },
  {
    id: "prod_camon30s",
    name: "New Tecno Camon 30S Pro 256GB",
    sku: "TEC-006",
    quantity: 4,
    unitPrice: 355000,
    costPrice: 290000,
    category: "Smartphones",
    status: "Low",
    condition: "New",
    description: "Brand new Camon 30S Pro, 20W wireless fast charging. Sealed.",
    image: "/products/jiji-32.jpg",
  },
  {
    id: "prod_note40pro",
    name: "Infinix Note 40 Pro 256GB Gold",
    sku: "INF-005",
    quantity: 4,
    unitPrice: 320000,
    costPrice: 260000,
    category: "Smartphones",
    status: "Low",
    condition: "UK Used",
    description: "UK-used, clean as new Note 40 Pro 256GB + warranty. Just 320k.",
    image: "/products/jiji-33.jpg",
  },
  {
    id: "prod_note40new",
    name: "New Infinix Note 40 Pro 256GB",
    sku: "INF-006",
    quantity: 3,
    unitPrice: 402000,
    costPrice: 330000,
    category: "Smartphones",
    status: "Low",
    condition: "New",
    description: "Brand new Note 40 Pro 256GB. 70W fast charge, AMOLED. Sealed.",
    image: "/products/jiji-34.jpg",
  },
  {
    id: "prod_pb20000",
    name: "Oraimo Power Bank 20000mAh 15W",
    sku: "ACC-005",
    quantity: 20,
    unitPrice: 18000,
    costPrice: 12000,
    category: "Accessories",
    status: "Available",
    condition: "New",
    description: "Original Oraimo 20000mAh power bank, 15W fast charge. Sealed.",
    image: "/products/jiji-35.jpg",
  },
  {
    id: "prod_powernova",
    name: "Oraimo PowerNova L21 30000mAh 30W",
    sku: "ACC-006",
    quantity: 15,
    unitPrice: 36999,
    costPrice: 25000,
    category: "Accessories",
    status: "Available",
    condition: "New",
    description: "Oraimo PowerNova 20000mAh, 30W fast charging. Brand new, sealed.",
    image: "/products/jiji-36.jpg",
  }

];

export function hashStr(s: string): number {
  let h = 11;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return h;
}

export function seedItems(): Item[] {
  const now = Date.now();
  const ageHrs = [3, 26, 9, 50, 30, 74, 6, 120, 15, 55];
  return [...seed, ...EXTRA].map((p, i) => {
    const fromOrders = orders.filter((o) => o.productId === p.id).length;
    return {
      ...p,
      sold: fromOrders > 0 ? fromOrders : 5 + (hashStr(p.id) % 58),
      updatedAt: now - (ageHrs[i % ageHrs.length] ?? 12) * 3600000
    };
  });
}

/* Local thumbnails — always load, no network needed. Each product gets its
   own colourway; each of the 4 views shifts the composition. */
export function thumbFor(p: Product, view = 0): string {
  const h = hashStr(p.id);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 3) % 60)) % 360;
  const initials = p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='640'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue1},28%,${20 + view * 3}%)'/>` +
    `<stop offset='1' stop-color='hsl(${hue2},32%,${12 + view * 2}%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='640' height='640' fill='url(#g)'/>` +
    `<circle cx='${120 + view * 90}' cy='140' r='220' fill='white' opacity='0.04'/>` +
    `<circle cx='540' cy='520' r='180' fill='white' opacity='0.05'/>` +
    `<circle cx='320' cy='300' r='118' fill='white' opacity='0.07'/>` +
    `<text x='320' y='322' font-family='Arial,sans-serif' font-size='72' font-weight='bold' fill='white' opacity='0.85' text-anchor='middle'>${initials}</text>` +
    `<text x='40' y='596' font-family='Arial,sans-serif' font-size='26' fill='white' opacity='0.55'>${VIEWS[view] ?? ""}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function statusOf(p: Item): { label: string; color: string; bg: string } {
  if (p.quantity <= 0) return { label: "Out of stock", color: "#e66a6a", bg: "rgba(230,106,106,0.12)" };
  if (p.quantity <= LOW_AT) return { label: `Only ${p.quantity} left`, color: "#e66a6a", bg: "rgba(230,106,106,0.12)" };
  return { label: "In stock", color: "#00a884", bg: "rgba(0,168,132,0.12)" };
}

export function formatUpdated(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const lowCount = { color: "#e66a6a", fontWeight: 700 } as const;
