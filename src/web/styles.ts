export const styles = /* css */ `
:root {
  --ink: #0f2a44;
  --ink-soft: #3d5873;
  --ink-faint: #6b8197;
  --glass: rgba(255, 255, 255, 0.62);
  --glass-strong: rgba(255, 255, 255, 0.8);
  --glass-line: rgba(255, 255, 255, 0.7);
  --bubble-in: #e9e9eb;
  --bubble-out: #0b84fe;
  --error: #b42318;
  --paper: #f4f7fa;
  --line: #e3e9ef;
  --accent: #0b6fd6;
  --accent-soft: #e3f0fd;
  --serif: "Instrument Serif", ui-serif, Georgia, serif;
  --sans: "Inter", ui-sans-serif, -apple-system, system-ui, sans-serif;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; min-height: 100vh; display: flex; flex-direction: column;
  color: var(--ink); font: 17px/1.5 var(--sans); letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  /* Big Sur photo by Matthew Mentley on Unsplash (Unsplash License: free for commercial use). */
  background: #cfdde8 url("/coast.jpg") center 30% / cover no-repeat fixed;
}
/* Soft wash so text stays readable over the photo. */
body::before {
  content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: linear-gradient(180deg, rgba(240, 245, 249, 0.72) 0%, rgba(240, 245, 249, 0.35) 45%, rgba(240, 245, 249, 0) 75%);
}
a { color: inherit; }
main { flex: 1; }
.wrap { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 24px; }

/* Nav */
.nav { display: flex; align-items: center; justify-content: space-between; padding: 22px 0; }
.wordmark { font: 400 34px/1 var(--serif); letter-spacing: -0.01em; text-decoration: none; }
.nav-cta {
  font-size: 15px; font-weight: 500; text-decoration: none; padding: 9px 18px; border-radius: 999px;
  background: var(--glass); border: 1px solid var(--glass-line);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); transition: background .2s;
}
.nav-cta:hover { background: var(--glass-strong); }

/* Hero */
.hero {
  display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); align-items: center; gap: 40px;
  padding: 32px 24px 96px; min-height: min(calc(100svh - 82px), 860px);
}
.hero-copy { display: flex; flex-direction: column; align-items: flex-start; }
.eyebrow {
  display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-soft);
  padding: 6px 14px; border-radius: 999px; margin-bottom: 26px;
  background: var(--glass); border: 1px solid var(--glass-line);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
}
.eyebrow .dot { width: 7px; height: 7px; border-radius: 50%; background: #34c759; box-shadow: 0 0 0 3px rgba(52, 199, 89, .2); }
h1 {
  font: 400 clamp(52px, 7.2vw, 96px)/0.95 var(--serif); letter-spacing: -0.03em;
  margin: 0 0 22px; max-width: 10em; text-wrap: balance;
}
h1 em, h2 em { font-style: italic; }
.lede { font-size: 20px; color: var(--ink-soft); max-width: 27em; margin: 0 0 32px; text-wrap: pretty; }
.hero-phone { display: flex; justify-content: center; }

/* Signup */
.cta { display: flex; flex-direction: column; align-items: flex-start; width: 100%; }
.ticks { display: flex; flex-wrap: wrap; gap: 6px 18px; list-style: none; padding: 0; margin: 16px 0 0 8px; font-size: 14px; color: var(--ink-soft); }
.ticks li::before { content: "✓"; color: #1f9d55; font-weight: 600; margin-right: 6px; }
.signup {
  display: flex; gap: 6px; width: 100%; max-width: 440px; padding: 6px; border-radius: 999px;
  background: var(--glass-strong); border: 1px solid var(--glass-line);
  -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
  box-shadow: 0 10px 30px -12px rgba(15, 42, 68, .25);
}
.signup:focus-within { background: rgba(255, 255, 255, .92); }
.signup input {
  flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink);
  font: inherit; padding: 12px 18px; outline: none;
}
.signup input::placeholder { color: var(--ink-faint); }
.btn {
  display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px;
  padding: 13px 24px; cursor: pointer; background: var(--ink); color: #fff;
  font: 500 16px var(--sans); text-decoration: none; white-space: nowrap; transition: transform .15s, opacity .2s;
}
.btn:hover { opacity: .9; }
.btn:active { transform: scale(.98); }
.btn-cta { padding: 17px 38px; font-size: 18px; box-shadow: 0 12px 30px -10px rgba(15, 42, 68, .45); }
.btn-lg { padding: 18px 32px; font-size: 18px; width: 100%; }
.fineprint { font-size: 14px; color: var(--ink-soft); margin: 14px 0 0; }
.form-error { font-size: 15px; color: var(--error); margin: 12px 0 0; font-weight: 500; }
.unsupported {
  display: flex; flex-direction: column; gap: 2px; max-width: 440px; padding: 16px 24px; border-radius: 22px;
  background: var(--glass-strong); border: 1px solid var(--glass-line);
  -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
}
.unsupported strong { font-weight: 600; }
.unsupported span { color: var(--ink-soft); font-size: 15px; }

/* Phone */
.phone {
  width: 330px; height: 660px; border-radius: 54px; padding: 11px; margin: 0 auto;
  background: #101418;
  box-shadow: 0 50px 100px -30px rgba(10, 30, 50, .55), 0 0 0 1.5px rgba(255,255,255,.25) inset;
}
.screen {
  height: 100%; border-radius: 44px; background: #fff; overflow: hidden;
  display: flex; flex-direction: column; font-family: -apple-system, system-ui, sans-serif; color: #000;
}
.screen-head {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 46px 0 10px; background: #f6f6f7; border-bottom: 1px solid #e6e6e8;
}
.avatar {
  width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center;
  background: linear-gradient(160deg, #5d8fb8, #1f4b73); color: #fff; font: 400 30px/1 var(--serif);
}
.screen-name { font-size: 12px; color: #6e6e73; }
.thread { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; padding: 14px 12px 22px; text-align: left; }
.stamp { align-self: center; font-size: 11px; color: #8e8e93; margin: 2px 0 6px; }
.bubble {
  max-width: 76%; padding: 8px 13px; border-radius: 19px; font-size: 15px; line-height: 1.32;
  opacity: 0; transform: translateY(8px) scale(.98); animation: pop .45s cubic-bezier(.2,.9,.3,1.2) forwards;
}
.bubble.static { opacity: 1; transform: none; animation: none; }
.bubble.in { align-self: flex-start; background: var(--bubble-in); }
.bubble.out { align-self: flex-end; background: var(--bubble-out); color: #fff; }
.bubble.gap { margin-top: 6px; }
.typing {
  align-self: flex-start; display: flex; gap: 4px; padding: 12px 14px; background: var(--bubble-in); border-radius: 19px;
  opacity: 0; animation: typing-life 1.2s ease forwards;
}
.typing i { width: 7px; height: 7px; border-radius: 50%; background: #9a9aa0; animation: blink 1s infinite; }
.typing i:nth-child(2) { animation-delay: .15s; }
.typing i:nth-child(3) { animation-delay: .3s; }
@keyframes pop { to { opacity: 1; transform: none; } }
@keyframes blink { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes typing-life { 0% { opacity: 0; } 15%, 85% { opacity: 1; } 100% { opacity: 0; height: 0; padding: 0; margin: -4px 0 0; } }

/* Landing sections: a light sheet that slides up over the photo */
.sheet {
  background: var(--paper); border-radius: 40px 40px 0 0; padding: 24px 0 40px;
  box-shadow: 0 -30px 80px -40px rgba(10, 30, 50, .35);
}
.section { padding: 72px 24px 24px; }
.section.narrow { max-width: 760px; }
.kicker { font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin: 0 0 10px; }
h2 { font: 400 clamp(40px, 5.4vw, 64px)/1 var(--serif); letter-spacing: -0.02em; margin: 0 0 36px; max-width: 14em; text-wrap: balance; }
h3 { font-size: 17px; font-weight: 600; margin: 0 0 6px; letter-spacing: -0.01em; }
.body { font-size: 18px; color: var(--ink-soft); max-width: 30em; margin: -12px 0 0; }

.cases { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.case { background: #fff; border-radius: 26px; padding: 22px 20px 24px; border: 1px solid var(--line); box-shadow: 0 1px 2px rgba(15, 42, 68, .04); }
.case h3 { margin-bottom: 16px; }
.tag { display: inline-block; font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-soft); padding: 2px 8px; border-radius: 999px; vertical-align: 2px; margin-left: 4px; }
.mini { display: flex; flex-direction: column; gap: 6px; font-family: -apple-system, system-ui, sans-serif; }
.mini .bubble { max-width: 88%; }

.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; }
.split h2 { margin-bottom: 24px; }
.lock {
  border-radius: 34px; padding: 30px 18px 22px; display: flex; flex-direction: column; gap: 10px;
  background: linear-gradient(160deg, #5d8fb8 0%, #1f4b73 60%, #0f2a44 100%);
  box-shadow: 0 40px 80px -40px rgba(10, 30, 50, .6);
}
.lock-time { font: 300 64px/1 -apple-system, system-ui, sans-serif; color: rgba(255, 255, 255, .95); text-align: center; margin-bottom: 14px; }
.note {
  display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 20px;
  background: rgba(255, 255, 255, .78); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
  font: 15px/1.32 -apple-system, system-ui, sans-serif; color: #000;
}
.note-icon {
  flex: none; width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center;
  background: linear-gradient(160deg, #5d8fb8, #1f4b73); color: #fff; font: 400 22px/1 var(--serif);
}
.note-body { flex: 1; min-width: 0; }
.note-head { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
.note-head span { color: #6e6e73; font-size: 13px; }

.steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.steps li { background: #fff; border: 1px solid var(--line); border-radius: 26px; padding: 26px 24px; }
.steps p, .promise p { margin: 0; color: var(--ink-soft); font-size: 16px; }
.num {
  display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; margin-bottom: 18px;
  background: var(--bubble-out); color: #fff; font-weight: 600; font-size: 15px;
}

.promises { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.promise { padding: 4px 0 0; border-top: 2px solid var(--ink); }
.promise h3 { margin-top: 16px; }

.faq details { border-bottom: 1px solid var(--line); }
.faq summary {
  list-style: none; cursor: pointer; display: flex; justify-content: space-between; gap: 16px;
  padding: 20px 0; font-size: 18px; font-weight: 500;
}
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after { content: "+"; font-size: 24px; line-height: 1; color: var(--ink-soft); transition: transform .2s; }
.faq details[open] summary::after { transform: rotate(45deg); }
.faq details p { margin: -6px 0 20px; color: var(--ink-soft); font-size: 16px; max-width: 40em; }

.final { text-align: center; display: flex; flex-direction: column; align-items: center; padding-bottom: 48px; }
.final h2 { margin: 0 auto 14px; }
.final .lede { margin: 0 auto 28px; }
.final .cta { align-items: center; }
body.home main { display: flex; flex-direction: column; }
body.home .sheet { flex: 1; }
body.home footer { background: var(--paper); color: var(--ink-soft); padding: 8px 0 36px; }

/* Footer */
footer { padding: 72px 0 32px; font-size: 14px; color: rgba(255, 255, 255, .85); text-align: center; }
footer a { text-decoration: none; }
footer nav { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-bottom: 10px; }
footer nav a:hover { text-decoration: underline; }

/* Privacy policy / terms */
.doc {
  max-width: 720px; margin: 48px auto 0; padding: 44px 40px; border-radius: 28px;
  background: var(--glass-strong); border: 1px solid var(--glass-line);
  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
  box-shadow: 0 30px 80px -30px rgba(10, 30, 50, .4);
  font-size: 16px; line-height: 1.6; color: var(--ink); overflow-wrap: anywhere;
}
.doc h1 { font-size: clamp(40px, 7vw, 56px); margin: 0 0 4px; }
.doc h2 { font-family: var(--sans); font-size: 18px; font-weight: 600; margin: 32px 0 8px; }
.doc p, .doc ul { margin: 0 0 12px; }
.doc ul { padding-left: 22px; }
.doc .updated { color: var(--ink-soft); font-size: 14px; margin-bottom: 24px; }

/* Success / message pages */
.card {
  max-width: 460px; margin: 64px auto 0; padding: 44px 36px; text-align: center; border-radius: 32px;
  background: var(--glass-strong); border: 1px solid var(--glass-line);
  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
  box-shadow: 0 30px 80px -30px rgba(10, 30, 50, .4);
}
.card h1 { font-size: clamp(46px, 9vw, 64px); margin: 0 auto 12px; }
.card .lede { margin: 0 auto 28px; font-size: 18px; }
.card .alt { margin: 20px 0 0; font-size: 15px; color: var(--ink-soft); }

/* Entrance */
.rise { opacity: 0; transform: translateY(14px); animation: rise .8s cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes rise { to { opacity: 1; transform: none; } }

@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; text-align: center; min-height: 0; padding-bottom: 72px; }
  .hero-copy { align-items: center; }
  .hero .cta { align-items: center; }
  .ticks { justify-content: center; margin-left: 0; }
  .cases, .steps, .promises { grid-template-columns: 1fr 1fr; }
  .split { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 600px) {
  .wrap { padding: 0 16px; }
  body { background-attachment: scroll; }
  .hero { padding: 16px 16px 56px; gap: 36px; }
  .section { padding: 56px 16px 16px; }
  .sheet { border-radius: 28px 28px 0 0; }
  .cases, .steps, .promises { grid-template-columns: 1fr; }
  h2 { margin-bottom: 26px; }
  .lede { font-size: 18px; }
  .signup { flex-direction: column; border-radius: 26px; }
  .signup .btn { width: 100%; }
  .phone { width: 290px; height: 580px; margin-top: 44px; }
  .card { padding: 36px 22px; }
  .doc { padding: 32px 20px; margin-top: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-delay: 0s !important; }
}
`;
