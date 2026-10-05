import { prisma } from "./db.js";

/**
 * Starter data for VeeJay Foods. The OUTLET is real (Kogi Circle, Lokoja — open 24 hours).
 * The MENU, PRICES and combo below are SAMPLE data so the app has something to show —
 * replace them from the admin dashboard (Menu tab) before launch.
 *
 * Run with: npm run seed   (ADMIN_PHONE=+234... to choose the first admin)
 */
async function main() {
  const adminPhone = process.env.ADMIN_PHONE ?? "+2348000000001";
  await prisma.user.upsert({ where: { phone: adminPhone }, update: { role: "ADMIN" }, create: { phone: adminPhone, role: "ADMIN", name: "Admin" } });

  const allDay = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openMin: 0, closeMin: 1440 })); // open 24 hours daily
  const name = "VeeJay Foods – Kogi Circle";
  if (!(await prisma.outlet.findFirst({ where: { name } }))) {
    await prisma.outlet.create({
      data: { name, address: "Kogi Circle, along Ava Hotel, Ali Attah Road", city: "Lokoja", hours: { create: allDay } },
    });
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
      categoryId: combos.id, name: "VeeJay Meal Deal", description: "Jollof rice + grilled chicken + meat pie + zobo", priceKobo: 5500 * 100, isCombo: true,
      components: { create: [jollof, chicken, pie, zobo].map((c) => ({ componentId: c.id, quantity: 1 })) },
    },
  });
  console.log("seeded");
}
main().finally(() => prisma.$disconnect());
