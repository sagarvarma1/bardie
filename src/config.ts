import "dotenv/config";

export const config = {
  /** "photon" for real iMessage, "console" for local testing. */
  transport: (process.env.TRANSPORT ?? "console") as "photon" | "console",
  photon: {
    projectId: process.env.PHOTON_PROJECT_ID ?? "",
    projectSecret: process.env.PHOTON_PROJECT_SECRET ?? "",
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  /** 32 random bytes, base64. Encrypts Google tokens at rest. */
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  appName: process.env.APP_NAME ?? "Bardie",
  /** Shown on the site and in the privacy policy. */
  supportEmail: process.env.SUPPORT_EMAIL ?? "support@textbardie.com",
  /**
   * A dedicated iMessage number anyone can text (Photon Business line). When
   * set, the website is a single "Text Bardie" button and new numbers are
   * signed up automatically on their first text. Leave empty on the free
   * tier, where each number must be registered through the website first.
   */
  bardieNumber: process.env.BARDIE_NUMBER ?? "",
  /** Where people reach the website. Google redirects back here after sign-in. */
  publicUrl: (process.env.PUBLIC_URL ?? "https://textbardie.com").replace(/\/$/, ""),
  port: Number(process.env.PORT ?? 3000),
  databasePath: process.env.DATABASE_PATH ?? "data/app.db",
  /**
   * Who may connect Google, matching where the OAuth app is in Google's review:
   * "testers" (unverified: only GOOGLE_TESTER_PHONES, whose Gmail must also be
   * a test user in Google Cloud), "basic" (sensitive scopes approved: calendar,
   * contacts, sending email, for everyone), "full" (Gmail review passed: also
   * reading and cleaning up the inbox).
   */
  googleAccess: (process.env.GOOGLE_ACCESS ?? "testers") as "testers" | "basic" | "full",
  googleTesterPhones: (process.env.GOOGLE_TESTER_PHONES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Texts per user per day (their local day) before Bardie rests until tomorrow. */
  dailyMessageLimit: Number(process.env.DAILY_MESSAGE_LIMIT ?? 100),
  /** Signup cap. Photon's free tier allows 10 registered users, Pro 100. */
  maxUsers: Number(process.env.MAX_USERS ?? 10),
  /** Used until we ask users for their own timezone. */
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "America/Los_Angeles",
  /** How often the inbox monitor checks Gmail. */
  monitorIntervalSeconds: Number(process.env.MONITOR_INTERVAL_SECONDS ?? 60),
};

/** New numbers can sign up just by texting (dedicated line, or local console testing). */
export function openSignups(): boolean {
  return Boolean(config.bardieNumber) || config.transport === "console";
}

export function requireEnv(name: string, value: string): string {
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}
