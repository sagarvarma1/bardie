import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { runAgentTurn } from "../agent/agent.js";
import { withUserLock } from "../agent/lock.js";
import { config } from "../config.js";
import {
  canConnectGoogle,
  completeGoogleConnect,
  googleAuthUrl,
  googleConfigured,
  googleStatus,
  lookupConnectToken,
  REDIRECT_PATH,
} from "../google/oauth.js";
import { notifyUser } from "../notifier.js";
import { db } from "../db.js";
import { findUserById, SIGNUP_TEXT, SignupError, startSignup, type User, WaitlistedError } from "../users.js";
import { homePage, isAppleDevice, messagePage, privacyPage, settingUpPage, successPage, termsPage } from "./pages.js";

const app = new Hono();

app.use("/coast.jpg", serveStatic({ root: "./public", onFound: (_path, c) => c.header("Cache-Control", "public, max-age=86400") }));

app.get("/health", (c) => c.text("ok"));

app.get("/", (c) => c.html(homePage(isAppleDevice(c.req.header("user-agent")))));
app.get("/privacy", (c) => c.html(privacyPage()));
app.get("/terms", (c) => c.html(termsPage()));

app.post("/signup", async (c) => {
  if (!isAppleDevice(c.req.header("user-agent"))) return c.html(homePage(false), 400);
  const form = await c.req.parseBody();
  try {
    const user = await startSignup(String(form.phone ?? ""), String(form.tz ?? ""));
    if (!user.assigned_number) return c.html(settingUpPage());
    return c.html(successPage(user.assigned_number, SIGNUP_TEXT));
  } catch (err) {
    if (err instanceof WaitlistedError) {
      return c.html(
        messagePage("You're on the", "list", `${config.appName} is full right now. We're opening more spots soon, so check back here in a bit.`),
      );
    }
    if (err instanceof SignupError) return c.html(homePage(true, err.message), 400);
    console.error("[web] signup failed:", err);
    return c.html(homePage(true, "Something went wrong on our end. Please try again."), 500);
  }
});

// The link texted to the user goes straight to Google's consent screen.
app.get("/connect/:token", (c) => {
  const token = c.req.param("token");
  const userId = lookupConnectToken(token);
  const user = userId ? findUserById(userId) : undefined;
  if (user && !canConnectGoogle(user)) {
    return c.html(messagePage("Coming", "soon", `Connecting Google isn't open yet. ${config.appName} will let you know when it is.`));
  }
  if (!googleConfigured() || !user) {
    return c.html(
      messagePage("This link", "expired", `Just text ${config.appName} and ask for a new one.`),
      404,
    );
  }
  return c.redirect(googleAuthUrl(token));
});

/** First message after connecting: a quick look at what matters right now, from what they granted. */
async function sendConnectedWelcome(userId: number, email: string): Promise<void> {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User;
  const { granted } = googleStatus(user);
  const look = [
    granted.readMail && "their inbox from the last 3 days",
    granted.calendar && "their calendar for the next 2 days",
  ].filter(Boolean);
  const check = look.length
    ? `then check ${look.join(" and ")} and briefly mention up to 3 things that actually need their attention (if nothing does, say things look calm). `
    : "";
  const watching = granted.readMail ? " and will text them when something important comes in" : "";
  const reply = await withUserLock(userId, () =>
    runAgentTurn(
      user,
      `[event] The user just connected Google (${email}). Text them: a one-line confirmation that you're connected${watching}, ${check}End with one short example of something they can ask you. Keep the whole thing short.`,
    ),
  );
  await notifyUser(userId, reply, undefined, false);
}

app.get(REDIRECT_PATH, async (c) => {
  const { state, code, error } = c.req.query();
  if (error || !state || !code) {
    return c.html(messagePage("No", "worries", `Google wasn't connected. Text ${config.appName} whenever you want to try again.`));
  }
  try {
    const { userId, email } = await completeGoogleConnect(state, code);
    sendConnectedWelcome(userId, email).catch((err) => console.error("[web] connected welcome failed:", err));
    return c.html(messagePage("You're", "all set", `Head back to iMessage. ${config.appName} is texting you now.`));
  } catch (err) {
    console.error("[web] Google connect failed:", err);
    return c.html(messagePage("Something went", "wrong", (err as Error).message), 400);
  }
});

export function startWebServer(): void {
  serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
    console.log(`[web] site on http://localhost:${port}`);
  });
}
