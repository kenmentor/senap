export type Product = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  category: string;
  status: "Available" | "Low" | "Out";
  description: string;
  /** Dealer condition, like a Jiji listing. Absent = Brand New. */
  condition?: string;
  /** Real photo URL (or /public path). Absent = generated placeholder art. */
  image?: string;
};

export const products: Product[] = [
  {
    id: "prod_spark20",
    name: "Tecno Spark 20 256GB Black",
    sku: "TEC-001",
    quantity: 12,
    unitPrice: 155000,
    costPrice: 124000,
    category: "Smartphones",
    condition: "Used",
    status: "Available",
    description: "Very clean, 256GB + 8GB RAM. No fault, no crack. Available in stock.",
    image: "/products/jiji-01.jpg",
  }
];

export const stockValue = products.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

export function formatNaira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}
