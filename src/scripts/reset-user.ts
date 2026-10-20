// Usage: npm run reset-user -- +15551234567
// Wipes a user (Google connection, history, drafts) so they can sign up fresh.
// Their Photon registration is kept; signing up again reuses it.
import { deleteUser, normalizePhone } from "../users.js";

const phone = normalizePhone(process.argv[2] ?? "");
if (!phone) {
  console.error("Usage: npm run reset-user -- +15551234567");
  process.exit(1);
}
console.log(deleteUser(phone) ? `Reset ${phone}. Sign up again on the website.` : `${phone} isn't signed up.`);
