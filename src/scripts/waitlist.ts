// Usage: npm run waitlist
// Lists numbers that tried to sign up while Bardie was full, oldest first.
// Raise MAX_USERS (e.g. after upgrading Photon) and let them know to sign up again.
import { db } from "../db.js";

const rows = db.prepare("SELECT phone, timezone, created_at FROM waitlist ORDER BY created_at").all() as {
  phone: string;
  timezone: string | null;
  created_at: string;
}[];
if (!rows.length) console.log("The waitlist is empty.");
for (const r of rows) console.log(`${r.created_at}  ${r.phone}${r.timezone ? `  (${r.timezone})` : ""}`);
