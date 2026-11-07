export type DemoCustomer = {
  id: string;
  name: string;
  purchases: number;
  total: number;
  lastSeen: string;
  optedOut: boolean;
};

export const customers: DemoCustomer[] = [
  { id: "cus_01", name: "Adaeze", purchases: 2, total: 12000, lastSeen: "Sat", optedOut: false },
  { id: "cus_02", name: "Tunde", purchases: 2, total: 8000, lastSeen: "Tue", optedOut: false },
  { id: "cus_03", name: "Fatima", purchases: 1, total: 12000, lastSeen: "Thu", optedOut: false },
  { id: "cus_04", name: "Emeka", purchases: 1, total: 4000, lastSeen: "2w ago", optedOut: true },
  { id: "cus_05", name: "Zainab", purchases: 1, total: 8000, lastSeen: "3w ago", optedOut: true }
];

export const eligibleCustomers = customers.filter((c) => !c.optedOut);
