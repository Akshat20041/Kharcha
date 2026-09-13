import type { PrismaClient } from "../src/generated/prisma/client.js";

export const defaultCategories = [
  "Food & Dining", "Groceries", "Transport", "Housing", "Utilities",
  "Household / Essentials", "Health", "Fitness", "Shopping", "Entertainment",
  "Subscriptions", "Travel", "Education", "Gifts", "Personal Care", "Other",
];

export async function seedCategories(db: PrismaClient) {
  // A repeat run adds missing defaults without deleting records or changing IDs.
  await db.category.createMany({
    data: defaultCategories.map((name) => ({ name })),
    skipDuplicates: true,
  });
}
