import { startInboxMonitor } from "./agent/monitor.js";
import { startScheduler } from "./agent/scheduler.js";
import { respond } from "./bot.js";
import { config, requireEnv } from "./config.js";
import { Gateway } from "./gateway.js";
import { googleConfigured } from "./google/oauth.js";
import { setNotifier, setReactor } from "./notifier.js";
import { ConsoleTransport } from "./transport/console.js";
import { sendBubbles } from "./transport/bubbles.js";
import { PhotonTransport } from "./transport/photon.js";
import type { Transport } from "./transport/types.js";
import { startWebServer } from "./web/server.js";

function buildTransport(): Transport {
  if (config.transport === "photon") {
    return new PhotonTransport(
      requireEnv("PHOTON_PROJECT_ID", config.photon.projectId),
      requireEnv("PHOTON_PROJECT_SECRET", config.photon.projectSecret),
    );
  }
  // Console mode pretends to be this phone number; sign it up at the web page first.
  return new ConsoleTransport(process.env.CONSOLE_PHONE ?? "+15555550100");
}

if (!process.env.ANTHROPIC_API_KEY) console.warn("[startup] ANTHROPIC_API_KEY is not set; the agent can't reply yet");
if (googleConfigured()) requireEnv("ENCRYPTION_KEY", config.encryptionKey);
else console.warn("[startup] GOOGLE_CLIENT_ID/SECRET not set; Gmail features are off");

const transport = buildTransport();
setNotifier((conversationId, text) => sendBubbles(transport, conversationId, text));
setReactor((conversationId, messageId, emoji) => transport.react(conversationId, messageId, emoji));
startWebServer();
await new Gateway(respond).attach(transport);
startScheduler();
if (googleConfigured()) startInboxMonitor();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await transport.stop();
    process.exit(0);
  });
}
