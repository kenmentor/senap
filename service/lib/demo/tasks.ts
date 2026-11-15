export type DemoTask = {
  id: string;
  title: string;
  detail: string;
};

export const demoTasks: DemoTask[] = [
  { id: "t1", title: "Check product inventory", detail: "Tecno Spark 20 · 12 @ ₦155,000" },
  { id: "t2", title: "Prepare product promotion", detail: "Draft · awaiting discount" },
  { id: "t3", title: "Review sales records", detail: "Seeded sample records" },
  { id: "t4", title: "Create sales report", detail: "For Mr Chi · approval required" }
];

export const ownerMessage =
  "Amaka, we have twelve of the Tecno Spark 20 left at ₦155,000 each. Prepare a promotion, check our sales and create a report for Mr Chi.";

export const employeeMessage =
  "I'm here to help. I'll check the stock, prepare the promotion and put together the sales report. I'll ask you before publishing or sharing anything.";

export const employeeConfirm =
  "Yes. I'll handle the steps I can complete and bring anything that needs your approval to you.";
