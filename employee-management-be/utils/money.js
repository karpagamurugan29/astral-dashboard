import { scopeOf } from "./hierarchy.js";

// Fees, billing, cost and margin are for the top level only: Admin, HR, the firm-wide seniors
// (Partners, Directors, Senior Managers, function heads) and Accounts.
export const canSeeMoney = async (req) => {
    if (["Admin", "HR"].includes(req.user.role)) return true;
    const s = await scopeOf(req);
    return s.firm || s.finance;
};
// Raising and changing invoices: Admin, firm-wide seniors and Accounts.
export const canBill = async (req) => {
    if (req.user.role === "Admin") return true;
    const s = await scopeOf(req);
    return s.firm || s.finance;
};

// Indian financial year for a date: Apr–Mar → "2026-27"
export const fyOf = (d = new Date()) => {
    const x = new Date(d);
    const y = x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const three = (n) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " : ""}` : ""}${n % 100 ? two(n % 100) : ""}`;
// Indian numbering (lakh / crore) in words: 125000 → "One Lakh Twenty Five Thousand"
export const rupeesInWords = (amount) => {
    let n = Math.round(Number(amount) || 0);
    if (!n) return "Zero Rupees Only";
    const parts = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(`${three(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (n) parts.push(three(n));
    return `Rupees ${parts.join(" ")} Only`;
};
