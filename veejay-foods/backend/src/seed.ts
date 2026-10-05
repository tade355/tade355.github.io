import { prisma } from "./db.js";

/**
 * Starter data for Veejay Foods. Launch area: ABUJA MUNICIPAL (AMAC) only.
 *
 * EVERYTHING BELOW IS SAMPLE DATA so the app has something to show:
 *  - the three pickup points are example AMAC districts — replace them with the real outlets
 *    (name, street address, opening hours) from the dashboard's Outlets tab;
 *  - the menu, prices and combo are examples — replace them from the Menu tab.
 *
 * Run with: npm run seed   (ADMIN_PHONE=+234... to choose the first admin)
 */
async function main() {
  const adminPhone = process.env.ADMIN_PHONE ?? "+2348000000001";
  await prisma.user.upsert({ where: { phone: adminPhone }, update: { role: "ADMIN" }, create: { phone: adminPhone, role: "ADMIN", name: "Admin" } });

  const daily = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openMin: 8 * 60, closeMin: 22 * 60 })); // sample hours: 08:00–22:00
  for (const [name, address] of [
    ["Veejay Foods – Wuse II", "Wuse II, Abuja"],
    ["Veejay Foods – Garki", "Garki, Abuja"],
    ["Veejay Foods – Jabi", "Jabi, Abuja"],
  ] as const) {
    if (!(await prisma.outlet.findFirst({ where: { name } }))) await prisma.outlet.create({ data: { name, address, city: "Abuja", hours: { create: daily } } });
  }
  if (await prisma.category.count()) return console.log("menu already seeded");

  const mk = (name: string, sortOrder: number) => prisma.category.create({ data: { name, sortOrder } });
  const [combos, meals, soups, pastries, drinks] = await Promise.all([mk("Combos", 0), mk("Rice & Meals", 1), mk("Soups & Swallow", 2), mk("Pastries", 3), mk("Drinks", 4)]);
  const item = (categoryId: string, name: string, priceNaira: number, description = "") =>
    prisma.menuItem.create({ data: { categoryId, name, description, priceKobo: priceNaira * 100 } });

  const jollof = await item(meals.id, "Jollof Rice", 2000, "Smoky party-style jollof");
  await item(meals.id, "Fried Rice", 2200, "With mixed veg");
  const chicken = await item(meals.id, "Grilled Chicken", 2500, "Peppered, charcoal grilled");
  await item(soups.id, "Egusi + Pounded Yam", 3500, "With assorted meat");
  await item(soups.id, "Ogbono + Eba", 3200, "With assorted meat");
  const pie = await item(pastries.id, "Meat Pie", 800, "Freshly baked, flaky crust");
  await item(pastries.id, "Sausage Roll", 700);
  await item(pastries.id, "Puff-Puff (6)", 600, "Soft and golden");
  await item(pastries.id, "Chin Chin", 500, "Crunchy, lightly sweet");
  const zobo = await item(drinks.id, "Zobo", 700, "Chilled hibiscus drink");
  await item(drinks.id, "Water", 200, "50cl");
  await prisma.menuItem.create({
    data: {
      categoryId: combos.id, name: "Veejay Meal Deal", description: "Jollof rice + grilled chicken + meat pie + zobo", priceKobo: 5500 * 100, isCombo: true,
      components: { create: [jollof, chicken, pie, zobo].map((c) => ({ componentId: c.id, quantity: 1 })) },
    },
  });
  console.log("seeded");
}
main().finally(() => prisma.$disconnect());
