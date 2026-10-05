import type { Deps } from "../deps.js";
import { badRequest, conflict, HttpError, notFound } from "../lib/errors.js";
import { startRefund } from "./payments.js";

export async function createComplaint(deps: Deps, userId: string, p: { orderId: string; reason: string; description?: string; photoUrl?: string }) {
  const order = await deps.db.order.findFirst({ where: { id: p.orderId, userId }, include: { payments: true } });
  if (!order) throw notFound("Order not found");
  if (!["PLACED", "PREPARING", "READY", "COLLECTED"].includes(order.status) || !order.payments.some((x) => x.status === "SUCCESS"))
    throw conflict("Only paid orders can be reported", "not_reportable");
  const open = await deps.db.complaint.count({ where: { orderId: order.id, status: { in: ["OPEN", "APPROVED"] } } });
  if (open) throw conflict("You already reported this order", "duplicate_complaint");
  if (!p.reason.trim()) throw badRequest("Tell us what was wrong");
  return deps.db.complaint.create({
    data: { orderId: order.id, userId, reason: p.reason.trim().slice(0, 120), description: (p.description ?? "").slice(0, 1000), photoUrl: p.photoUrl },
  });
}

export async function approveComplaint(deps: Deps, complaintId: string, adminId: string, opts: { amountKobo?: number; note?: string } = {}) {
  const c = await deps.db.complaint.findUnique({ where: { id: complaintId }, include: { order: { include: { payments: true } } } });
  if (!c) throw notFound("Complaint not found");
  const claim = await deps.db.complaint.updateMany({ where: { id: c.id, status: "OPEN" }, data: { status: "APPROVED", resolvedById: adminId, resolutionNote: opts.note } });
  if (claim.count !== 1) throw conflict("Complaint already resolved", "already_resolved");
  const payment = c.order.payments.find((x) => x.status === "SUCCESS");
  try {
    if (!payment) throw new HttpError(409, "No successful payment to refund");
    return await startRefund(deps, payment, { reason: c.reason, complaintId: c.id, approvedById: adminId, amountKobo: opts.amountKobo });
  } catch (e) {
    // refund didn't start → put the complaint back so an admin can retry
    await deps.db.complaint.update({ where: { id: c.id }, data: { status: "OPEN", resolvedById: null, resolutionNote: null } });
    await deps.db.refund.deleteMany({ where: { complaintId: c.id, status: "FAILED" } });
    throw e instanceof HttpError ? e : new HttpError(502, "Payment provider refused the refund. Try again.");
  }
}

export async function rejectComplaint(deps: Deps, complaintId: string, adminId: string, note: string) {
  const r = await deps.db.complaint.updateMany({ where: { id: complaintId, status: "OPEN" }, data: { status: "REJECTED", resolvedById: adminId, resolutionNote: note } });
  if (r.count !== 1) throw conflict("Complaint already resolved or not found", "already_resolved");
}
