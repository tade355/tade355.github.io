import { badRequest } from "./errors.js";

/** Normalize Nigerian numbers to E.164: 0803... / 803... / 234803... / +234803... -> +234803... */
export function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s\-()]/g, "");
  let n: string;
  if (/^\+234\d{10}$/.test(d)) n = d;
  else if (/^234\d{10}$/.test(d)) n = "+" + d;
  else if (/^0\d{10}$/.test(d)) n = "+234" + d.slice(1);
  else if (/^[789]\d{9}$/.test(d)) n = "+234" + d;
  else throw badRequest("Enter a valid Nigerian phone number", "bad_phone");
  return n;
}
