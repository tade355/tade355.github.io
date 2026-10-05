import { prisma } from "./db.js";

/** Demo data: 3 outlets, a menu with combos, and an admin. Run with: npm run seed  (ADMIN_PHONE=+234... to choose admin) */
async function main() {
  const adminPhone = process.env.ADMIN_PHONE ?? "+2348000000001";
  await prisma.user.upsert({ where: { phone: adminPhone }, update: { role: "ADMIN" }, create: { phone: adminPhone, role: "ADMIN", name: "Admin" } });

  const week = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, openMin: d === 0 ? 11 * 60 : 9 * 60, closeMin: 21 * 60 }));
  for (const [name, address, city, lat, lng] of [
    ["Ikeja – Allen Avenue", "12 Allen Avenue", "Lagos", 6.6018, 3.3515],
    ["Victoria Island", "5 Adeola Odeku St", "Lagos", 6.4281, 3.4219],
    ["Ilorin – GRA", "13 Onikanga Street", "Ilorin", 8.4966, 4.5421],
  ] as const) {
    if (!(await prisma.outlet.findFirst({ where: { name } }))) await prisma.outlet.create({ data: { name, address, city, lat, lng, hours: { create: week } } });
  }
  if (await prisma.category.count()) return console.log("menu already seeded");

  const mk = (name: string, sortOrder: number) => prisma.category.create({ data: { name, sortOrder } });
  const [rice, protein, wraps, soups, drinks, combos] = await Promise.all([mk("Rice", 1), mk("Proteins", 2), mk("Wraps", 3), mk("Soups & Swallow", 4), mk("Drinks", 5), mk("Combos", 0)]);
  const item = (categoryId: string, name: string, priceNaira: number, description = "") => prisma.menuItem.create({ data: { categoryId, name, description, priceKobo: priceNaira * 100 } });
  const pjs = await item(rice.id, "Party Jollof (Small)", 1500, "Smoky party-style jollof");
  const pjl = await item(rice.id, "Party Jollof (Large)", 2500, "Generous party portion");
  await item(rice.id, "Fried Rice", 2000, "With mixed veg");
  const chicken = await item(protein.id, "Grilled Chicken", 2200, "Peppered, charcoal grilled");
  await item(protein.id, "Beef", 800);
  const plantain = await item(protein.id, "Fried Plantain", 500, "Sweet dodo");
  await item(wraps.id, "Chicken Shawarma", 3000, "Creamy sauce, cabbage, sausage");
  await item(wraps.id, "Beef Shawarma", 3500);
  await item(soups.id, "Egusi + Pounded Yam", 3500, "With assorted meat");
  await item(soups.id, "Ogbono + Eba", 3200, "With assorted meat");
  const zobo = await item(drinks.id, "Zobo", 700, "Chilled hibiscus drink");
  await item(drinks.id, "Water", 200, "50cl");
  const combo = await prisma.menuItem.create({
    data: {
      categoryId: combos.id, name: "Jollof Party Pack", description: "Large jollof + grilled chicken + plantain + zobo", priceKobo: 5500 * 100, isCombo: true,
      components: { create: [pjl, chicken, plantain, zobo].map((c) => ({ componentId: c.id, quantity: 1 })) },
    },
  });
  void pjs; void combo;
  console.log("seeded");
}
main().finally(() => prisma.$disconnect());
