import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I

export function newCode(n = 10): string {
  return Array.from(randomBytes(n), (x) => ALPHABET[x % ALPHABET.length]).join("");
}

// Keys are compared in upper case without spaces, so "seoul 7k2m" and "SEOUL7K2M" are the same key.
export function normKey(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

export { ROLES, isRole, type RoleName } from "./roles";
