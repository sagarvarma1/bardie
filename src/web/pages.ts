import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { config } from "../config.js";
import { SIGNUP_TEXT, spotsLeft } from "../users.js";
import { styles } from "./styles.js";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#1f4b73"/><text x="32" y="47" font-family="Georgia,serif" font-size="42" text-anchor="middle" fill="#fff">B</text></svg>`,
  );

function layout(title: string, body: Html, bodyClass = ""): Html {
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${config.appName} is the assistant that texts you first. It lives in iMessage: text it reminders, questions, and plans, and it texts you before anything slips. Free during early access." />
    <meta property="og:title" content="${config.appName}" />
    <meta property="og:description" content="The assistant that texts you first. Lives in iMessage." />
    <meta name="theme-color" content="#e6eef4" />
    <link rel="icon" href="${FAVICON}" />
    <link rel="preload" href="/coast.jpg" as="image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>${raw(styles)}</style>
  </head>
  <body class="${bodyClass}">
    <div class="wrap">
      <nav class="nav">
        <a class="wordmark" href="/">${config.appName}</a>
        <a class="nav-cta" href="/#signup">Get started</a>
      </nav>
    </div>
    <main>${body}</main>
    <footer>
      <nav>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>
      </nav>
      © ${new Date().getFullYear()} ${config.appName}
    </footer>
  </body>
</html>`;
}

/** iPhone, iPad, and Mac can open iMessage. iPadOS Safari reports itself as a Mac. */
export function isAppleDevice(userAgent: string | undefined): boolean {
  return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(userAgent ?? "");
}

function signupCta(appleDevice: boolean, error?: string, id = "signup"): Html {
  if (!appleDevice) {
    return html`
      <div class="unsupported">
        <strong>${config.appName} lives in iMessage</strong>
        <span>Open this page on your iPhone, iPad, or Mac to get started.</span>
      </div>`;
  }
  const full = spotsLeft() === 0;
  if (config.bardieNumber) {
    // Dedicated line: anyone can text it, so signup is a single tap.
    const smsLink = `sms:${config.bardieNumber}&body=${encodeURIComponent(SIGNUP_TEXT)}`;
    return html`<a class="btn btn-cta" href="${smsLink}">Text ${config.appName}</a>`;
  }
  return html`
    <form class="signup" id="${id}" method="post" action="/signup" onsubmit="try{this.tz.value=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}this.querySelector('button').textContent='Opening iMessage…'">
      <input name="tz" type="hidden" />
      <input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Your phone number" aria-label="Your phone number" required />
      <button class="btn" type="submit">${full ? "Join the waitlist" : `Start texting ${config.appName}`}</button>
    </form>
    ${error ? html`<p class="form-error" role="alert">${error}</p>` : ""}`;
}

/** Small reassurances under each signup form. */
function ctaNotes(appleDevice: boolean): Html {
  if (!appleDevice) return html``;
  return html`
    <ul class="ticks">
      <li>Free during early access</li>
      <li>No app to download</li>
      <li>Takes 10 seconds</li>
    </ul>`;
}

function spotsBadge(): Html {
  const left = spotsLeft();
  const text =
    left === 0
      ? "Early access is full · join the waitlist"
      : left <= 25
        ? `Early access · ${left} ${left === 1 ? "spot" : "spots"} left`
        : "Now in early access";
  return html`<div class="eyebrow"><span class="dot"></span> ${text}</div>`;
}

type Bubble = { from: "in" | "out"; text: string };

// The conversation in the hero phone. `at` is when each bubble appears (seconds);
// a typing indicator precedes Bardie's first bubble in each run.
const heroThread: (Bubble & { at: number })[] = [
  { from: "out", text: "remind me to call mom when i get off work", at: 0.8 },
  { from: "in", text: "you're off at 6 right? i'll text you then", at: 2.4 },
  { from: "out", text: "yes. also is trader joe's on 4th open rn", at: 4.0 },
  { from: "in", text: "open till 9 tonight", at: 5.6 },
  { from: "out", text: "you're the best", at: 7.0 },
  { from: "in", text: "i know 🙂", at: 8.4 },
];

function phone(): Html {
  return html`
    <div class="phone" aria-hidden="true">
      <div class="screen">
        <div class="screen-head">
          <div class="avatar">B</div>
          <div class="screen-name">${config.appName} ›</div>
        </div>
        <div class="thread">
          <div class="stamp">Today 9:41 AM</div>
          ${heroThread.map((m, i) => {
            const prev = heroThread[i - 1];
            const startsRun = !prev || prev.from !== m.from;
            return html`
              ${m.from === "in" && startsRun
                ? html`<div class="typing" style="animation-delay:${m.at - 1.2}s"><i></i><i></i><i></i></div>`
                : ""}
              <div class="bubble ${m.from}${startsRun && i > 0 ? " gap" : ""}" style="animation-delay:${m.at}s">${m.text}</div>`;
          })}
        </div>
      </div>
    </div>`;
}

/** Things people text Bardie, each a tiny iMessage thread. */
const useCases: { title: string; tag?: string; thread: Bubble[] }[] = [
  {
    title: "Reminders that actually remind you",
    thread: [
      { from: "out", text: "remind me to move my car before 8am street cleaning tmrw" },
      { from: "in", text: "got it, i'll text you at 7:30" },
    ],
  },
  {
    title: "Snap it, and it's handled",
    thread: [
      { from: "out", text: "📷 [photo of a concert flyer]" },
      { from: "in", text: "phoebe bridgers, sat nov 14 at 8. want a reminder thursday to grab tickets?" },
    ],
  },
  {
    title: "Ask anything",
    thread: [
      { from: "out", text: "how long do i boil an egg for jammy" },
      { from: "in", text: "6.5 min from boiling, then straight into ice water" },
    ],
  },
  {
    title: "Talk instead of type",
    thread: [
      { from: "out", text: "🎤 voice memo · 0:12" },
      { from: "in", text: "added: oat milk, eggs, tortillas. want me to text you the list when you're at the store?" },
    ],
  },
  {
    title: "Your calendar, by text",
    tag: "with Google",
    thread: [
      { from: "out", text: "add dentist friday 3pm" },
      { from: "in", text: "done. want a heads up at 2:30?" },
    ],
  },
  {
    title: "Emails, without opening email",
    tag: "with Google",
    thread: [
      { from: "out", text: "email my landlord that rent's coming friday" },
      { from: "in", text: "to mark@... \"hi mark, rent's coming friday. thanks!\" send it?" },
      { from: "out", text: "send" },
    ],
  },
];

function miniThread(thread: Bubble[]): Html {
  return html`<div class="mini">${thread.map((b) => html`<div class="bubble static ${b.from}">${b.text}</div>`)}</div>`;
}

/** Bardie texting first, shown as lock-screen notifications. */
const nudges: { when: string; text: string }[] = [
  { when: "7:30 AM", text: "morning! street cleaning today, move your car before 8" },
  { when: "2:30 PM", text: "dentist at 3, leave in 10 to make it" },
  { when: "6:02 PM", text: "you're off work. you wanted me to remind you to call mom 💛" },
];

const steps: { title: string; body: string }[] = [
  { title: "Enter your number", body: "No app, no account, no password." },
  { title: "Hit send", body: `iMessage opens with a text to ${config.appName} ready to go.` },
  { title: "Just text", body: `${config.appName} texts back in seconds. Ask for anything, in your own words.` },
];

const promises: { title: string; body: Html }[] = [
  { title: "Nothing goes out without your OK", body: html`${config.appName} drafts emails and shows you first. It only sends when you say so.` },
  { title: "Never sold, never used for training", body: html`Your messages are used to help you and nothing else. No ads, ever.` },
  {
    title: "Gone in one text",
    body: html`Text "delete my account" and everything is erased. Read the <a href="/privacy">privacy policy</a>.`,
  },
];

const faqs: { q: string; a: Html }[] = [
  { q: "Is it free?", a: html`Yes, ${config.appName} is free during early access.` },
  {
    q: "Do I need to download anything?",
    a: html`No. ${config.appName} is a contact in iMessage. You text it like you'd text a friend.`,
  },
  {
    q: "Does it work on Android?",
    a: html`Not yet. ${config.appName} lives in iMessage, so you'll need an iPhone, iPad, or Mac.`,
  },
  {
    q: "What can I ask it?",
    a: html`Reminders, quick questions, plans, recipes, directions, what's open right now. Send it a photo, a PDF, or a voice memo and it'll take it from there. If you'd ask a sharp friend, ask ${config.appName}.`,
  },
  {
    q: "Can it see my email and calendar?",
    a: html`Only if you connect your Google account, and you can disconnect anytime. Gmail and Google Calendar are rolling out gradually, and ${config.appName} will text you when they're ready for you.`,
  },
  {
    q: "Will it text me when I don't want it to?",
    a: html`It texts first only when it's worth it: a reminder you asked for, or a heads-up about your day. Tell it to stop the morning texts and it will.`,
  },
  {
    q: "How do I stop using it?",
    a: html`Just stop texting. To erase everything, text "delete my account".`,
  },
];

export function homePage(appleDevice: boolean, error?: string): Html {
  return layout(
    `${config.appName}: the assistant that texts you first`,
    html`
    <section class="wrap hero">
      <div class="hero-copy">
        <div class="rise">${spotsBadge()}</div>
        <h1 class="rise" style="animation-delay:.08s">The assistant that <em>texts you first</em></h1>
        <p class="lede rise" style="animation-delay:.16s">
          ${config.appName} lives in iMessage. Text it reminders, questions, and plans, and it texts you before anything slips.
        </p>
        <div class="cta rise" style="animation-delay:.24s">
          ${signupCta(appleDevice, error)}
          ${ctaNotes(appleDevice)}
        </div>
      </div>
      <div class="hero-phone rise" style="animation-delay:.3s">${phone()}</div>
    </section>

    <div class="sheet">
      <section class="wrap section">
        <p class="kicker">What people text ${config.appName}</p>
        <h2>Anything you'd ask <em>a sharp friend</em></h2>
        <div class="cases">
          ${useCases.map(
            (c) => html`
            <article class="case">
              <h3>${c.title}${c.tag ? html` <span class="tag">${c.tag}</span>` : ""}</h3>
              ${miniThread(c.thread)}
            </article>`,
          )}
        </div>
      </section>

      <section class="wrap section split">
        <div>
          <p class="kicker">Proactive</p>
          <h2>It doesn't wait <em>to be asked</em></h2>
          <p class="body">Other assistants sit there until you open them. ${config.appName} keeps track of what you told it and texts you at the right moment, so you don't have to remember to remember.</p>
        </div>
        <div class="lock" aria-hidden="true">
          <div class="lock-time">9:41</div>
          ${nudges.map(
            (n) => html`
            <div class="note">
              <div class="note-icon">B</div>
              <div class="note-body">
                <div class="note-head"><strong>${config.appName}</strong><span>${n.when}</span></div>
                <div>${n.text}</div>
              </div>
            </div>`,
          )}
        </div>
      </section>

      <section class="wrap section">
        <p class="kicker">How it works</p>
        <h2>Set up in <em>ten seconds</em></h2>
        <ol class="steps">
          ${steps.map((st, i) => html`<li><span class="num">${i + 1}</span><h3>${st.title}</h3><p>${st.body}</p></li>`)}
        </ol>
      </section>

      <section class="wrap section">
        <p class="kicker">Private by design</p>
        <h2>Your life, <em>your business</em></h2>
        <div class="promises">
          ${promises.map((pr) => html`<div class="promise"><h3>${pr.title}</h3><p>${pr.body}</p></div>`)}
        </div>
      </section>

      <section class="wrap section narrow">
        <h2>Questions</h2>
        <div class="faq">
          ${faqs.map((f) => html`<details><summary>${f.q}</summary><p>${f.a}</p></details>`)}
        </div>
      </section>

      <section class="wrap section final">
        <h2>Get started with <em>one text</em></h2>
        <p class="lede">Free during early access. No app, no account.</p>
        <div class="cta">
          ${signupCta(appleDevice, undefined, "signup-bottom")}
        </div>
      </section>
    </div>`,
    "home",
  );
}

/** "+15551234567" -> "(555) 123-4567"; other countries are left as-is. */
function prettyPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Opens iMessage straight away with Bardie's number and the first text filled in. */
export function successPage(line: string, firstText: string): Html {
  // iOS and macOS take the body after "&".
  const smsLink = `sms:${line}&body=${encodeURIComponent(firstText)}`;
  return layout(
    `Say hi to ${config.appName}`,
    html`
    <div class="wrap">
      <div class="card rise">
        <h1>Just hit <em>send</em></h1>
        <p class="lede">${config.appName} will text you right back.</p>
        <a class="btn btn-lg" id="open" href="${smsLink}">Open iMessage</a>
        <p class="alt">Didn't open? Text <strong>${firstText}</strong> to <strong>${prettyPhone(line)}</strong></p>
      </div>
    </div>
    <script>setTimeout(function () { location.href = document.getElementById("open").href; }, 150);</script>`,
  );
}

export function messagePage(title: string, emphasis: string, body: string): Html {
  return layout(
    `${title} ${emphasis} · ${config.appName}`,
    html`
    <div class="wrap">
      <div class="card rise">
        <h1>${title} <em>${emphasis}</em></h1>
        <p class="lede" style="margin-bottom:0">${body}</p>
      </div>
    </div>`,
  );
}

export function settingUpPage(): Html {
  return messagePage("Almost", "there", "We're setting up your line. Give it a minute, then refresh this page.");
}

/** Bump when the policy or terms change. */
const POLICY_DATE = "October 20, 2026";

function docPage(title: string, body: Html): Html {
  return layout(
    `${title} · ${config.appName}`,
    html`
    <div class="wrap">
      <article class="doc rise">
        <h1>${title}</h1>
        <p class="updated">Last updated ${POLICY_DATE}</p>
        ${body}
      </article>
    </div>`,
  );
}

export function privacyPage(): Html {
  const app = config.appName;
  return docPage(
    "Privacy Policy",
    html`
    <p>${app} is a personal assistant you text over iMessage. This page explains what ${app} collects, why, and what you can do about it. Questions: <a href="mailto:${config.supportEmail}">${config.supportEmail}</a>.</p>

    <h2>What we collect</h2>
    <ul>
      <li><strong>Your phone number and timezone</strong>, so ${app} can text you and get times right.</li>
      <li><strong>Your messages with ${app}</strong>, including photos, PDFs, and voice memos you send, so it can answer and remember the conversation. Photos and files aren't stored after they're read; the conversation keeps a short note like "sent a photo".</li>
      <li><strong>Things ${app} remembers about you</strong>, like people in your life or preferences, when they come up in conversation.</li>
      <li><strong>Reminders</strong> you set.</li>
    </ul>

    <h2>Your Google account (optional)</h2>
    <p>If you connect Google, ${app} asks only for what it needs, and you can see the exact permissions on Google's consent screen:</p>
    <ul>
      <li><strong>Gmail</strong>: to send emails you've approved, and, where available, to read your inbox so it can tell you about important emails, find things for you, and archive or label emails when you ask.</li>
      <li><strong>Google Calendar</strong>: to tell you what's coming up and to add, move, or remove events when you ask.</li>
      <li><strong>Google Contacts</strong> (read only): to look up someone's email address when you ask ${app} to email them.</li>
    </ul>
    <p>${app} never sends an email without your explicit go-ahead in the conversation. Your Google sign-in token is stored encrypted. Email and calendar contents are read when needed to answer you and are not kept, except for what ends up in your conversation with ${app} (for example, a summary it texted you).</p>
    <p><strong>Google API Services User Data Policy.</strong> ${app}'s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. We do not use Google user data to serve ads, we do not sell it, we do not use it to train or improve AI models, and no person at ${app} reads it unless you ask us to for support, it's needed for security, or the law requires it.</p>

    <h2>Who processes your data</h2>
    <p>We share data only with the services that make ${app} work, and only for that purpose:</p>
    <ul>
      <li><strong>Anthropic</strong> (Claude), the AI that reads your messages and writes ${app}'s replies. Anthropic does not train its models on this data.</li>
      <li><strong>Photon</strong>, which delivers iMessages to and from ${app}.</li>
      <li><strong>Deepgram</strong>, which turns voice memos into text.</li>
      <li><strong>Google</strong>, if you connect your account.</li>
      <li><strong>Railway</strong>, where ${app}'s servers and database run.</li>
    </ul>
    <p>We never sell your data or use it for advertising.</p>

    <h2>Keeping and deleting your data</h2>
    <p>Your data is kept while you use ${app}. To delete everything (conversation history, memories, reminders, and your Google connection), text ${app} "delete my account" and confirm. It's removed right away and ${app} revokes its Google access. You can also remove ${app}'s access any time at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>, or email us and we'll delete your account.</p>

    <h2>Security</h2>
    <p>Data is sent over encrypted connections, Google tokens are encrypted at rest, and access to our systems is limited to what's needed to run ${app}.</p>

    <h2>Children</h2>
    <p>${app} is not meant for anyone under 13, and we don't knowingly collect data from children.</p>

    <h2>Changes</h2>
    <p>If this policy changes in a meaningful way, we'll update the date above and let you know by text.</p>`,
  );
}

export function termsPage(): Html {
  const app = config.appName;
  return docPage(
    "Terms of Service",
    html`
    <p>By texting ${app} or signing up at this site, you agree to these terms. If you don't agree, please don't use ${app}.</p>

    <h2>The service</h2>
    <p>${app} is an AI assistant you text over iMessage. It can answer questions, set reminders, and, if you connect Google, help with your email and calendar. It's offered free during early access, and features may change or stop.</p>

    <h2>AI can make mistakes</h2>
    <p>${app}'s answers come from an AI and can be wrong or incomplete. Double-check anything important, such as dates, times, prices, and the contents of emails before you approve sending them. Don't rely on ${app} for emergencies or for medical, legal, or financial advice.</p>

    <h2>Your account</h2>
    <ul>
      <li>Sign up only with a phone number you own.</li>
      <li>You're responsible for what you ask ${app} to do, including emails sent from your account after you approve them.</li>
      <li>Don't use ${app} for anything illegal, to harass anyone, to send spam, or to try to break or overload the service.</li>
      <li>We may limit how many messages you can send per day, and we may suspend accounts that misuse the service.</li>
    </ul>

    <h2>Your data</h2>
    <p>Your data stays yours. How we handle it is in the <a href="/privacy">Privacy Policy</a>. You can delete your account any time by texting ${app} "delete my account".</p>

    <h2>No warranty</h2>
    <p>${app} is provided "as is", without warranties of any kind. To the extent the law allows, we're not liable for indirect or consequential damages, or for missed reminders, wrong answers, or lost data.</p>

    <h2>Changes</h2>
    <p>We may update these terms. If we make a meaningful change, we'll update the date above and let you know by text. Continuing to use ${app} means you accept the new terms.</p>

    <h2>Contact</h2>
    <p><a href="mailto:${config.supportEmail}">${config.supportEmail}</a></p>`,
  );
}
