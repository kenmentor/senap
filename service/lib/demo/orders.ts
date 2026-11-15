export type DemoOrder = {
  id: string;
  week: "current" | "previous";
  total: number;
  productId: string;
  customerId: string;
  date: string;
};

export const orders: DemoOrder[] = [
  { id: "ord_101", week: "current", total: 310000, productId: "prod_spark20", customerId: "cus_01", date: "Mon" },
  { id: "ord_102", week: "current", total: 165000, productId: "prod_hot40i", customerId: "cus_02", date: "Tue" },
  { id: "ord_103", week: "current", total: 456000, productId: "prod_iphone11", customerId: "cus_03", date: "Thu" },
  { id: "ord_104", week: "current", total: 49000, productId: "prod_freepods-neo", customerId: "cus_01", date: "Sat" },
  { id: "ord_091", week: "previous", total: 130000, productId: "prod_note11", customerId: "cus_04", date: "Mon" },
  { id: "ord_092", week: "previous", total: 190000, productId: "prod_itel-a300-128", customerId: "cus_05", date: "Wed" },
  { id: "ord_093", week: "previous", total: 340000, productId: "prod_a17", customerId: "cus_02", date: "Fri" }
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
    bestSeller: "Tecno Spark 20 256GB Black",
    newCustomers: 2,
    returning: 2,
    prevRevenue: prevRev,
    growthPct: prevRev === 0 ? 0 : Math.round(((curRev - prevRev) / prevRev) * 100)
  };
})();
