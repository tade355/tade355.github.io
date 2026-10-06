import { prisma } from "./db.js";
import { normalizePhone } from "./lib/phone.js";

/**
 * Creates (or promotes) ONE admin account and nothing else — safe to run in production,
 * unlike `npm run seed`, which also inserts SAMPLE outlets and menu items.
 *
 *   dev:   npm run admin:create -- 08012345678 "Owner Name"
 *   prod:  node dist/create-admin.js 08012345678 "Owner Name"
 */
async function main() {
  const [rawPhone, ...nameParts] = process.argv.slice(2);
  if (!rawPhone) { console.error('Usage: create-admin <phone> ["Name"]'); process.exit(1); }
  const phone = normalizePhone(rawPhone);
  const name = nameParts.join(" ").trim() || undefined;
  const u = await prisma.user.upsert({ where: { phone }, update: { role: "ADMIN", ...(name ? { name } : {}) }, create: { phone, role: "ADMIN", name } });
  console.log(`Admin ready: ${u.phone}${u.name ? ` (${u.name})` : ""}. They can now sign in on the staff dashboard with an SMS code.`);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); }).finally(() => prisma.$disconnect());
