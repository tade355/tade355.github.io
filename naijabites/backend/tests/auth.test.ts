import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { sha256 } from "../src/lib/crypto.js";
import { normalizePhone } from "../src/lib/phone.js";
import { bearer, clock, makeFakes, paidOrder, resetDb, seedWorld } from "./helpers.js";

let fakes: ReturnType<typeof makeFakes>; let app: ReturnType<typeof createApp>; let w: Awaited<ReturnType<typeof seedWorld>>;
beforeEach(async () => {
  await resetDb(); clock.t = new Date("2026-06-10T10:00:00Z");
  fakes = makeFakes(); app = createApp(fakes.deps); w = await seedWorld();
});
const lastCode = () => /(\d{6})/.exec(fakes.sent.at(-1)!.text)![1];
const login = async (phone = "08055555555") => {
  await request(app).post("/auth/otp/request").send({ phone });
  return (await request(app).post("/auth/otp/verify").send({ phone, code: lastCode() })).body as { accessToken: string; refreshToken: string; user: any };
};
const refresh = (t: string) => request(app).post("/auth/refresh").send({ refreshToken: t });
const days = (n: number) => { clock.t = new Date(clock.t.getTime() + n * 86_400_000); };

describe("phone numbers", () => {
  it("normalises Nigerian formats", () => {
    for (const p of ["08031234567", "8031234567", "2348031234567", "+234 803 123 4567", "0803-123-4567"]) expect(normalizePhone(p)).toBe("+2348031234567");
    expect(() => normalizePhone("12345")).toThrow();
  });
});

describe("OTP login", () => {
  it("signs a new user in with the SMS code and returns tokens", async () => {
    const t = await login();
    expect(t.user.phone).toBe("+2348055555555"); expect(t.user.role).toBe("CUSTOMER");
    expect((await request(app).get("/me").set({ Authorization: `Bearer ${t.accessToken}` })).status).toBe(200);
  });
  it("stores only hashes (no plaintext code or refresh token in the DB)", async () => {
    const t = await login();
    const otp = await prisma.otpCode.findFirstOrThrow(); expect(otp.codeHash).not.toContain(lastCode());
    expect(await prisma.refreshToken.count({ where: { tokenHash: t.refreshToken } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { tokenHash: sha256(t.refreshToken) } })).toBe(1);
  });
  it("rejects a wrong code, locks after 5 attempts (even the right code), and a code can't be reused", async () => {
    await request(app).post("/auth/otp/request").send({ phone: "08055555555" });
    const good = lastCode(); const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await request(app).post("/auth/otp/verify").send({ phone: "08055555555", code: bad })).status).toBe(401);
    expect((await request(app).post("/auth/otp/verify").send({ phone: "08055555555", code: good })).status).toBe(401);
    await request(app).post("/auth/otp/request").send({ phone: "08066666666" });
    const c = lastCode();
    expect((await request(app).post("/auth/otp/verify").send({ phone: "08066666666", code: c })).status).toBe(200);
    expect((await request(app).post("/auth/otp/verify").send({ phone: "08066666666", code: c })).status).toBe(401);
  });
  it("expires after 5 minutes", async () => {
    await request(app).post("/auth/otp/request").send({ phone: "08055555555" }); const c = lastCode();
    clock.t = new Date(clock.t.getTime() + 5 * 60_000 + 1000);
    expect((await request(app).post("/auth/otp/verify").send({ phone: "08055555555", code: c })).status).toBe(401);
  });
  it("rate-limits OTP requests per phone", async () => {
    for (let i = 0; i < 3; i++) expect((await request(app).post("/auth/otp/request").send({ phone: "08055555555" })).status).toBe(200);
    expect((await request(app).post("/auth/otp/request").send({ phone: "08055555555" })).status).toBe(429);
  });
});

describe("sessions & refresh tokens", () => {
  it("rotates on refresh and the new token keeps working for weeks (sliding expiry)", async () => {
    let t = await login();
    for (let i = 0; i < 4; i++) { days(20); const r = await refresh(t.refreshToken); expect(r.status).toBe(200); t = { ...t, ...r.body }; }
    expect((await request(app).get("/me").set({ Authorization: `Bearer ${t.accessToken}` })).status).toBe(200);
  });
  it("session lasts at least 24h without any activity", async () => {
    const t = await login(); clock.t = new Date(clock.t.getTime() + 25 * 3600_000);
    expect((await refresh(t.refreshToken)).status).toBe(200);
  });
  it("an idle session past 30 days ends — when there is no active order", async () => {
    const t = await login(); days(31);
    const r = await refresh(t.refreshToken); expect(r.status).toBe(401); expect(r.body.code).toBe("session_expired");
  });
  it("NEVER ends the session while an order is active, even past expiry", async () => {
    const t = await login(); const user = t.user;
    // customer with an active (paid) order
    await prisma.user.update({ where: { id: user.id }, data: { expoPushToken: null } });
    const w2 = { ...w, customer: { ...w.customer, id: user.id } } as typeof w;
    await paidOrder(app, w2); // PLACED
    days(45);
    const r = await refresh(t.refreshToken);
    expect(r.status).toBe(200);
    // and it keeps working through every active status
    await prisma.order.updateMany({ where: { userId: user.id }, data: { status: "READY" } });
    days(45); expect((await refresh(r.body.refreshToken)).status).toBe(200);
    // once collected the normal rules apply again
    await prisma.order.updateMany({ where: { userId: user.id }, data: { status: "COLLECTED" } });
    const rr = await refresh(r.body.refreshToken); expect(rr.status).toBe(200); // fresh 30d window from last refresh
    days(31); expect((await refresh(rr.body.refreshToken)).status).toBe(401);
  });
  it("tolerates a lost refresh response: re-sending the old token within 60s still works", async () => {
    const t = await login();
    const a = await refresh(t.refreshToken); expect(a.status).toBe(200);
    clock.t = new Date(clock.t.getTime() + 20_000);
    const b = await refresh(t.refreshToken); expect(b.status).toBe(200);
    expect((await refresh(a.body.refreshToken)).status).toBe(200); // family not revoked
  });
  it("replaying a rotated token long after is treated as theft and revokes the whole family (no active order)", async () => {
    const t = await login(); const a = await refresh(t.refreshToken);
    clock.t = new Date(clock.t.getTime() + 5 * 60_000);
    expect((await refresh(t.refreshToken)).status).toBe(401);
    expect((await refresh(a.body.refreshToken)).status).toBe(401);
  });
  it("…but with an active order the user is not kicked out by a stale replay", async () => {
    const tk = await login(); const a = await refresh(tk.refreshToken);
    await paidOrder(app, { ...w, customer: { ...w.customer, id: tk.user.id } } as typeof w);
    clock.t = new Date(clock.t.getTime() + 5 * 60_000);
    expect((await refresh(tk.refreshToken)).status).toBe(200);
    expect((await refresh(a.body.refreshToken)).status).toBe(200);
  });
  it("explicit logout revokes the session; unknown tokens are rejected", async () => {
    const t = await login();
    await request(app).post("/auth/logout").send({ refreshToken: t.refreshToken });
    expect((await refresh(t.refreshToken)).status).toBe(401);
    expect((await refresh("x".repeat(40))).status).toBe(401);
  });
  it("expired/invalid access tokens get a 401 with code token_expired so the app knows to refresh", async () => {
    const r = await request(app).get("/me").set({ Authorization: "Bearer nope" });
    expect(r.status).toBe(401); expect(r.body.code).toBe("token_expired");
    expect((await request(app).get("/me")).status).toBe(401);
  });
  it("customers can't reach admin routes", async () => {
    expect((await request(app).get("/admin/menu").set(bearer(w.customer))).status).toBe(403);
    expect((await request(app).get("/admin/menu").set(bearer(w.admin))).status).toBe(200);
  });
});
