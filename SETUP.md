# Bardie setup

Three accounts to set up (about 20 minutes total), then run it and text Bardie.
Everything goes into `.env` in this folder. It already exists and has your
`ENCRYPTION_KEY` filled in. Don't share or commit it.

## 1. Photon: the iMessage line (free)

```bash
npm install -g @photon-ai/cli
photon login                          # approve in the browser
photon projects create --name "Bardie" --spectrum
photon projects ls                    # copy your project's id
export PHOTON_PROJECT_ID=<that id>
photon spectrum platforms ls          # iMessage should be listed and enabled
photon spectrum platforms enable imessage   # only if it isn't
photon spectrum profile update --display-name "Bardie"
```

Then open **app.photon.codes**, go to your project's **Settings**, and copy the
**Project ID** and **Secret Key** into `.env`:

```
TRANSPORT=photon
PHOTON_PROJECT_ID=...
PHOTON_PROJECT_SECRET=...
```

You don't add users by hand. The signup page registers each person with
Photon automatically. The free plan allows 10.

## 2. Anthropic: the brain (pay as you go)

1. Go to **console.anthropic.com** and sign up.
2. **Billing**: add a few dollars of credit. Personal use is usually a few dollars a month.
3. **API Keys** → **Create Key** → paste into `.env` as `ANTHROPIC_API_KEY=...`

## 3. Google Cloud: Gmail and Calendar access (free)

1. Go to **console.cloud.google.com** → project picker at the top → **New Project** → name it `Bardie` → Create, and make sure it's selected.
2. Search for **Gmail API** in the top bar → **Enable**. Do the same for **Google Calendar API** and **People API** (contacts).
3. Search for **Google Auth Platform** → **Get started**:
   - App name `Bardie`, your email as support email → Next
   - Audience: **External** → Next
   - Contact email: yours → agree → **Create**
4. **Audience** (left sidebar) → **Test users** → **Add users** → add your Gmail address (and any beta testers' Gmail addresses, up to 100).
5. **Data Access** → **Add or remove scopes** → under "Manually add scopes" paste these (one per line) → Add → **Save**:
   ```
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/calendar.events
   https://www.googleapis.com/auth/contacts.readonly
   https://www.googleapis.com/auth/contacts.other.readonly
   ```
   If you connected Google before a scope was added, Bardie texts you a link to reconnect the first time it needs it.
6. **Clients** → **Create client** → type **Web application**, name `Bardie web`.
   Under **Authorized redirect URIs** add:
   - `http://localhost:3000/oauth/google/callback`
   - `https://textbardie.com/oauth/google/callback` (for later)

   → **Create**, then copy the Client ID and Client secret into `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

When you connect, Google shows **"Google hasn't verified this app."** That's
expected while the app is in Testing. Click **Continue**. In Testing mode Google
also expires the connection every 7 days. Bardie will text you a reconnect link
when that happens. Publishing the app (Google's review) removes both.

While the app is unverified, only test users can get through Google's screen, so
Bardie only offers Google to the phones in `GOOGLE_TESTER_PHONES` (`.env`, comma
separated, e.g. `+15551234567`). Everyone else can use the rest of Bardie and
hears that email and calendar are coming soon. Step 7 opens Google to everyone.

## 3b. Deepgram: voice memos (pay as you go, $200 free credit)

Claude can't hear audio, so voice memos are transcribed by Deepgram first.

1. Sign up at **console.deepgram.com**.
2. **API Keys** → **Create a New API Key** → paste into `.env` as `DEEPGRAM_API_KEY=...`

Without it, Bardie asks people to type instead of sending voice notes.

## 4. Test everything without using your phone number

Leave `TRANSPORT=console` in `.env` for this step. The terminal plays the part
of iMessage, pretending to be the number in `CONSOLE_PHONE`, and everything
else (Claude, Gmail, the inbox monitor) is real.

```bash
npm start
```

Use `npm start` here, not `npm run dev`: dev's file watcher takes over the
keyboard, so you can't type to Bardie.

1. In the terminal, type `Hey Bardie! 👋` and press Enter. That's the same first
   text the website pre-fills in iMessage.
2. Bardie introduces itself and sends a Connect Gmail link. Open it and approve Google
   (click **Continue** past "Google hasn't verified this app").
3. Bardie texts you what's important in your inbox right now.
4. Just talk to it. There are no commands. Ask for anything in plain words,
   including "send me the gmail link again" or "switch to my work gmail".

To start over: `npm run reset-user -- +15555550100`

## 5. Switch to real iMessage

Set `TRANSPORT=photon` in `.env`, restart `npm run dev`, and sign up with your
real number on your iPhone. iMessage opens with Bardie's number and "Hey Bardie! 👋"
filled in. Hit send. If you ever need to redo it: `npm run reset-user -- +1yournumber`.

Until the site is online, open the Connect Gmail link on your laptop:
`localhost` links don't open on your phone.

Try:
- "anything important in my email today?"
- "what's on my calendar tomorrow?" / "add dentist friday 3pm"
- "remind me in 2 minutes to stretch" (Bardie texts you first when it's due)
- "is the apple store on union square open right now?" (web search)
- "move my morning text to 7:30" or "stop the morning texts"
- "my landlord is mark, mark@example.com", then later "email my landlord that rent's coming friday" (memory)
- "find maya's email" (contacts)
- "archive all the promo emails older than a week" (inbox cleanup)
- send a link and "what's this say?" (reading links)
- "thanks!" (Bardie tapbacks instead of replying)

On real iMessage you can also send a photo of a flyer or ticket, a PDF, a voice
memo, or a shared contact card, and tap ❤️ on Bardie's "want me to send it?"
to say yes.
- "what did my landlord say last week?"
- "reply to that and say thursday works" → Bardie shows a draft → "send"
- Send yourself an email that looks important, and within a minute Bardie should text you about it.

Every morning at 8 (in the user's timezone) Bardie looks at the day's calendar and
email and texts a heads-up, but only if something's worth saying.

The inbox monitor, reminders, and morning texts only run while `npm run dev` is
running and your laptop is awake. Hosting it makes it always-on and makes links
work on your phone.

## 6. Host it on Railway at textbardie.com

1. Put the code on GitHub: `git init`, commit, and push to a private repo.
   `.gitignore` already keeps `.env` and `data/` out.
2. **railway.com** → **New Project** → **Deploy from GitHub repo** → pick it.
   `railway.json` sets the start command and the `/health` check.
3. In the service: **Settings → Volumes → Add volume**, mount path `/data`.
   This is where the database lives; without it every deploy wipes your users.
4. **Variables**: add everything from your `.env`, but with these values:
   ```
   TRANSPORT=photon
   PUBLIC_URL=https://textbardie.com
   DATABASE_PATH=/data/app.db
   ```
   Don't set `PORT`; Railway provides it.
5. **Settings → Networking → Custom Domain** → `textbardie.com`. Railway shows a
   DNS record (a CNAME). Add it where you bought the domain, and wait for the
   check mark.
6. Google Cloud already has `https://textbardie.com/oauth/google/callback` as a
   redirect URI if you followed step 3. Add it now if not.
7. Stop `npm run dev` on your laptop first. Only one copy may be connected to
   Photon, or messages get answered twice.

Keep it to one replica: reminders and the inbox monitor run inside the app.

## 7. Going public (anyone can sign up)

Everything except Google already works for anyone who signs up. Two limits remain:

**Photon user cap.** Free allows 10 users. Upgrade to **Pro** (100) in the Photon
dashboard, then set `MAX_USERS=100` on Railway. People who sign up while it's full
land on a waitlist (`npm run waitlist`, or in Railway's shell). For unlimited users
and a single number everyone texts, Photon **Business** ($250/line/month): set
`BARDIE_NUMBER` and the website becomes a one-tap "Text Bardie" button.

**Google review.** Done in two rounds, so calendar and sending email open up first.

*Round 1: calendar, contacts, sending email (no security audit).*
1. Deploy to textbardie.com first (step 6). Google reviews the live site, and
   `/privacy` and `/terms` are already there. Read both and edit them in
   `src/web/pages.ts` if anything should be different.
2. Verify the domain: **search.google.com/search-console** → Add property →
   Domain `textbardie.com` → add the TXT record it shows at your domain
   registrar → Verify. Use the same Google account that owns the Cloud project.
3. Google Auth Platform → **Branding**: upload a 120×120 logo, and set
   - Application home page: `https://textbardie.com`
   - Privacy policy: `https://textbardie.com/privacy`
   - Terms of service: `https://textbardie.com/terms`
   - Authorized domains: `textbardie.com`
4. **Data Access**: delete `gmail.modify` (keep `gmail.send` and the rest) → Save.
   Set `GOOGLE_ACCESS=basic` locally to test what users will get.
5. Record a short demo video and upload it to YouTube as **Unlisted**:
   the textbardie.com home page, texting Bardie, the Google consent screen
   (with the address bar showing the client ID), then Bardie reading your calendar,
   adding an event, looking up a contact, and sending an email after you approve it.
6. **Audience** → **Publish app** → confirm. Then **Verification Center** →
   **Prepare for verification**: for each scope, write one sentence on why it's
   needed (e.g. calendar.events: "Users ask Bardie over text what's on their
   schedule and to add events"), and paste the video link. Submit.
7. Google emails support@textbardie.com with questions, usually within a few days
   to a few weeks. Once approved, set `GOOGLE_ACCESS=basic` on Railway. Bardie
   offers Google to everyone, and existing testers get a text to reconnect if needed.

*Round 2: reading the inbox (restricted scope).*
1. Add `gmail.modify` back under Data Access and submit for verification again,
   explaining that users ask Bardie to watch for important emails, find emails,
   and clean up their inbox.
2. Google will ask for a **CASA Tier 2** security assessment through one of its
   approved labs (roughly $540 to $1,000 a year for the self-scan route; it
   renews yearly). Follow the lab's steps, then send Google the letter of validation.
3. Once approved, set `GOOGLE_ACCESS=full`. Everyone connected gets one text
   with a link to turn on inbox features.

**Costs.** Each text costs Claude API money. `DAILY_MESSAGE_LIMIT` (default 100
per person per day) caps it, and Bardie says it's resting until tomorrow when
someone hits it. Watch spend at console.anthropic.com → Usage, and set a monthly
limit there.
