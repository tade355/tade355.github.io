export type OrderStatus = "PENDING_PAYMENT" | "PLACED" | "PREPARING" | "READY" | "COLLECTED" | "CANCELLED";
export interface Outlet { id: string; name: string; address: string; city: string; prepMinutes: number; hours: { dayOfWeek: number; openMin: number; closeMin: number }[] }
export interface MenuItem { id: string; name: string; description: string; imageUrl: string | null; priceKobo: number; isCombo: boolean; available: boolean; components: { name: string; quantity: number }[] }
export interface Category { id: string; name: string; items: MenuItem[] }
export interface Slot { startsAt: string; available: boolean; reason?: "past" | "full" }
export interface Order {
  id: string; code: string; status: OrderStatus; pickupAt: string; note: string; totalKobo: number; paidAt: string | null; createdAt: string; expiresAt: string | null;
  outlet: { id: string; name: string; address: string };
  items: { id: string; name: string; unitPriceKobo: number; quantity: number }[];
  events: { status: OrderStatus; at: string }[];
}
export interface User { id: string; phone: string; name: string | null; role: "CUSTOMER" | "STAFF" | "ADMIN" }
