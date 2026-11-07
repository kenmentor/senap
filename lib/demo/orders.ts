export type DemoOrder = {
  id: string;
  week: "current" | "previous";
  total: number;
  productId: string;
  customerId: string;
  date: string;
};

export const orders: DemoOrder[] = [
  { id: "ord_101", week: "current", total: 8000, productId: "prod_tote", customerId: "cus_01", date: "Mon" },
  { id: "ord_102", week: "current", total: 4000, productId: "prod_tote", customerId: "cus_02", date: "Tue" },
  { id: "ord_103", week: "current", total: 12000, productId: "prod_tote", customerId: "cus_03", date: "Thu" },
  { id: "ord_104", week: "current", total: 4000, productId: "prod_tote", customerId: "cus_01", date: "Sat" },
  { id: "ord_091", week: "previous", total: 4000, productId: "prod_tote", customerId: "cus_04", date: "Mon" },
  { id: "ord_092", week: "previous", total: 8000, productId: "prod_tote", customerId: "cus_05", date: "Wed" },
  { id: "ord_093", week: "previous", total: 4000, productId: "prod_tote", customerId: "cus_02", date: "Fri" }
];

export const salesSummary = (() => {
  const cur = orders.filter((o) => o.week === "current");
  const prev = orders.filter((o) => o.week === "previous");
  const revenue = (xs: DemoOrder[]) => xs.reduce((s, o) => s + o.total, 0);
  const curRev = revenue(cur);
  const prevRev = revenue(prev);
  return {
    totalOrders: cur.length,
    revenue: curRev,
    avgOrder: Math.round(curRev / Math.max(1, cur.length)),
    bestSeller: "Everyday Tote",
    newCustomers: 2,
    returning: 2,
    prevRevenue: prevRev,
    growthPct: prevRev === 0 ? 0 : Math.round(((curRev - prevRev) / prevRev) * 100)
  };
})();
