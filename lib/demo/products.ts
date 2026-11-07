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
};

export const products: Product[] = [
  {
    id: "prod_tote",
    name: "Everyday Tote",
    sku: "BAG-001",
    quantity: 5,
    unitPrice: 4000,
    costPrice: 2500,
    category: "Bags",
    status: "Available",
    description: "Everyday tote bag. Available now while stock lasts."
  }
];

export const stockValue = products.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

export function formatNaira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}
