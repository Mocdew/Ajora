// Records a scripted Ajora walkthrough from the live local stack (web :3100, API :8000).
// Frames come from CDP Page.startScreencast; build.mjs turns them into an MP4.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3100";
const OUT = path.resolve(process.argv[2] ?? "frames");
const W = Number(process.argv[3] ?? 1440);
const H = Number(process.argv[4] ?? 810);
const DSF = Number(process.argv[5] ?? 4 / 3);
const SHOTS = process.argv.includes("--shots");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Overlay layer: cursor, click ripple, caption pill, full-screen title cards.
const OVERLAY = `
(() => {
  const css = \`
    nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display:none !important; }
    html { scrollbar-width: none; } ::-webkit-scrollbar { display:none; }
    #vx-cursor { position:fixed; left:0; top:0; z-index:2147483647; pointer-events:none;
      width:26px; height:26px; transform:translate(-100px,-100px); transition:none; }
    #vx-ring { position:fixed; z-index:2147483646; pointer-events:none; width:44px; height:44px;
      margin:-22px 0 0 -22px; border-radius:999px; border:2px solid #34d399; opacity:0; }
    #vx-ring.go { animation: vxring .6s cubic-bezier(0.22,1,0.36,1); }
    @keyframes vxring { from { transform:scale(.3); opacity:.9 } to { transform:scale(1.6); opacity:0 } }
    #vx-cap { position:fixed; left:50%; bottom:34px; z-index:2147483645; pointer-events:none;
      transform:translate(-50%, 16px); opacity:0; max-width:1240px; width:max-content;
      padding:18px 28px; border-radius:16px; background:rgba(10,10,10,.92);
      border:1px solid rgba(52,211,153,.35); box-shadow:0 20px 60px rgba(0,0,0,.6);
      color:#fafafa; font: 600 33px/1.25 var(--font-sans), system-ui, sans-serif; letter-spacing:-.01em;
      text-align:center; transition: opacity .45s cubic-bezier(0.22,1,0.36,1), transform .45s cubic-bezier(0.22,1,0.36,1); }
    #vx-cap.on { opacity:1; transform:translate(-50%,0); }
    #vx-cap b { color:#34d399; font-weight:700; }
    #vx-card { position:fixed; inset:0; z-index:2147483644; background:#000; display:flex;
      flex-direction:column; align-items:center; justify-content:center; gap:26px; text-align:center;
      opacity:0; pointer-events:none; transition: opacity .6s cubic-bezier(0.22,1,0.36,1);
      font-family: var(--font-sans), system-ui, sans-serif; color:#fafafa; padding:0 120px; }
    #vx-card.on { opacity:1; }
    body:has(#vx-card.on) #vx-cursor { opacity:0; }
    #vx-card .mark { display:flex; align-items:center; gap:14px; font-size:30px; font-weight:700; letter-spacing:-.02em; }
    #vx-card .logo { width:46px; height:46px; border-radius:12px; background:#fafafa; color:#000;
      display:grid; place-items:center; font-size:26px; font-weight:800; }
    #vx-card h1 { margin:0; font-size:72px; line-height:1.04; letter-spacing:-.035em; font-weight:700; max-width:1100px; }
    #vx-card h1 em { font-style:normal; color:#34d399; }
    #vx-card p { margin:0; font-size:26px; line-height:1.4; color:#a1a1a1; max-width:900px; }
    #vx-card .eyebrow { font: 500 15px var(--font-mono), monospace; letter-spacing:.14em; text-transform:uppercase; color:#34d399; }
    #vx-card > * { opacity:0; transform:translateY(14px); transition: all .7s cubic-bezier(0.22,1,0.36,1); }
    #vx-card.on > * { opacity:1; transform:none; }
    #vx-card.on > *:nth-child(2) { transition-delay:.12s } #vx-card.on > *:nth-child(3) { transition-delay:.24s }
    #vx-card.on > *:nth-child(4) { transition-delay:.36s }
  \`;
  const install = () => {
    if (document.getElementById("vx-cursor")) return;
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    const c = document.createElement("div"); c.id = "vx-cursor";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15.5 9.2-6.6 1.5 3.9 7.3-3 1.6-3.9-7.4-5 4.6z" fill="#fafafa" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const r = document.createElement("div"); r.id = "vx-ring";
    const cap = document.createElement("div"); cap.id = "vx-cap";
    const card = document.createElement("div"); card.id = "vx-card";
    document.body.append(card, cap, r, c);
    const pos = window.__vxPos || { x: -100, y: -100 };
    c.style.transform = \`translate(\${pos.x - 4}px,\${pos.y - 2}px)\`;
    addEventListener("mousemove", (e) => {
      window.__vxPos = { x: e.clientX, y: e.clientY };
      c.style.transform = \`translate(\${e.clientX - 4}px,\${e.clientY - 2}px)\`;
    }, true);
    addEventListener("mousedown", (e) => {
      r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      r.classList.remove("go"); void r.offsetWidth; r.classList.add("go");
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install); else install();
  new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
})();
`;

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--hide-scrollbars", "--force-color-profile=srgb"],
});
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DSF,
  colorScheme: "dark",
});
await ctx.addInitScript(() => {
  try { localStorage.setItem("ajora.persona", "u_persona_b"); } catch {}
});
await ctx.addInitScript(OVERLAY);
const page = await ctx.newPage();

// Warm up the routes so the take has no compile/loading spinners.
for (const r of ["/dashboard", "/transfers", "/communal", "/settings", "/audit"]) {
  await page.goto(BASE + r, { waitUntil: "networkidle" });
}
await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
await page.waitForSelector("text=Emeka", { timeout: 20000 });
// The app opens on the deduped view; the story starts on the raw one.
const sw = page.getByRole("switch", { name: "Remove phantom self-transfers" });
if ((await sw.getAttribute("aria-checked")) === "true") await sw.click();
await page.waitForSelector("text=Showing raw, double-counted view");
await sleep(2200);

// --- helpers ---------------------------------------------------------------
let mouse = { x: W * 0.62, y: H * 0.55 };
await page.mouse.move(mouse.x, mouse.y);
const ease = (t) => 1 - Math.pow(1 - t, 3);
async function moveTo(x, y, ms = 700) {
  const from = { ...mouse };
  const n = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n);
    await page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
    await sleep(16);
  }
  mouse = { x, y };
}
async function centerOf(locator) {
  await locator.waitFor({ state: "visible" });
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function clickOn(locator, ms = 750) {
  const p = await centerOf(locator);
  await moveTo(p.x, p.y, ms);
  await sleep(180);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}
async function caption(html) {
  await page.evaluate(async (h) => {
    const el = document.getElementById("vx-cap");
    if (el.classList.contains("on")) { el.classList.remove("on"); await new Promise((r) => setTimeout(r, 380)); }
    if (h) { el.innerHTML = h; void el.offsetWidth; el.classList.add("on"); }
  }, html);
}
async function card(html) {
  await page.evaluate((h) => {
    const el = document.getElementById("vx-card");
    if (h) { el.innerHTML = h; void el.offsetWidth; el.classList.add("on"); } else el.classList.remove("on");
  }, html);
}
async function scrollTo(locator, block = "center", ms = 1400) {
  const target = await locator.evaluate((el, block) => {
    const r = el.getBoundingClientRect();
    const off = block === "start" ? r.top - 90 : r.top + r.height / 2 - innerHeight / 2;
    return Math.max(0, Math.min(scrollY + off, document.documentElement.scrollHeight - innerHeight));
  }, block);
  await page.evaluate(async ({ target, ms }) => {
    const from = scrollY, t0 = performance.now();
    const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    await new Promise((res) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        scrollTo(0, from + (target - from) * e(t));
        t < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }, { target, ms });
}
async function navTo(href) {
  await clickOn(page.locator(`aside a[href="${href}"]`), 800);
  await page.waitForURL("**" + href);
  await page.waitForLoadState("networkidle");
}
let shotN = 0;
const shot = async (name) => SHOTS && page.screenshot({ path: path.join(OUT, `shot-${String(++shotN).padStart(2, "0")}-${name}.png`) });

// --- screencast ------------------------------------------------------------
const cdp = await ctx.newCDPSession(page);
const frames = [];
let writing = Promise.resolve();
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const i = frames.length;
  const file = path.join(OUT, `f${String(i).padStart(6, "0")}.jpg`);
  frames.push({ file: path.basename(file), ts: metadata.timestamp });
  writing = writing.then(() => fs.promises.writeFile(file, Buffer.from(data, "base64")));
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});

// Start on the intro card so the first frame is already the title.
await card(`<div class="eyebrow">Multi-bank finance · Nigeria</div>
  <h1>Your money app is counting the <em>same naira twice.</em></h1>
  <p>Move ₦200k from GTBank to OPay and most aggregators log it as income <i>and</i> spending.</p>`);
await sleep(900);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: Math.round(W * DSF), maxHeight: Math.round(H * DSF), everyNthFrame: 1 });
const tStart = Date.now();
// Keep frames flowing during static holds (screencast only emits on change).
const ticker = setInterval(() => page.evaluate(() => { document.body.dataset.vxTick = Date.now(); }).catch(() => {}), 100);

await sleep(3800);
await card(`<div class="mark"><span class="logo">A</span>Ajora</div>
  <h1>Honest numbers across <em>every bank</em> you use.</h1>`);
await sleep(2300);
await card(null);
await sleep(600);

// Beat 1: inflated view
await shot("inflated");
await caption(`Emeka banks across <b>4 apps</b>. The raw view says he earned <b>₦6.99M</b>.`);
await moveTo(W * 0.3, H * 0.5, 900);
await sleep(2600);

// Beat 2: flip dedup
await caption(`One switch removes <b>₦1.39M</b> of transfers between his own accounts.`);
await sleep(400);
await clickOn(page.getByText("Remove phantom transfers"), 900);
await sleep(2400);
await shot("deduped");
await caption(`Income drops to <b>₦5.6M</b>. Spending was inflated <b>76.8%</b>.`);
await moveTo(W * 0.45, H * 0.42, 900);
await sleep(2600);

// Beat 3: grounded narration
await caption(`Claude explains the numbers. It <b>never computes them</b>: every figure is checked.`);
await scrollTo(page.getByText("Explained by Ajora").first(), "start");
await sleep(3400);
await shot("narration");

// Beat 4: matched transfers
await caption(null);
await page.evaluate(() => scrollTo({ top: 0 }));
await navTo("/transfers");
await caption(`Each phantom pair is matched across banks, with a <b>confidence score</b>.`);
await sleep(800);
await moveTo(W * 0.6, H * 0.6, 900);
await sleep(2000);
await shot("transfers");

// Beat 5: communal economy
await caption(null);
await navTo("/communal");
await caption(`With the noise gone, the real story shows: a <b>₦2.56M</b> remittance is <b>46%</b> of his income.`);
await sleep(800);
await moveTo(W * 0.4, H * 0.62, 900);
await sleep(2800);
await shot("communal");
await caption(`Black tax, ajo, informal loans: <b>every relationship, mapped.</b>`);
await scrollTo(page.locator('section[aria-label="Relationship graph"]'), "start", 1600);
await sleep(3000);
await shot("graph");

// Beat 6: consent revoke
await caption(null);
await page.evaluate(() => scrollTo({ top: 0 }));
await navTo("/settings");
await caption(`Consent-first: switch off an account and its data leaves <b>every number</b>.`);
const domRow = page
  .locator('[aria-label^="Revoke consent for Domiciliary"]')
  .locator('xpath=ancestor::div[.//button[normalize-space()="Revoke"]][1]');
const revokeBtn = domRow.getByRole("button", { name: "Revoke", exact: true });
await scrollTo(revokeBtn, "center", 900);
await sleep(700);
await clickOn(revokeBtn, 900);
await sleep(900);
await shot("dialog");
await clickOn(page.getByRole("button", { name: "Revoke access" }), 700);
await sleep(1200);
await caption(`Revoked data never reaches the engine. <b>3 of 4 accounts</b> now count.`);
await page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
await sleep(3000);
await shot("after-revoke");

// Beat 7: audit
await caption(null);
await navTo("/audit");
await caption(`Every read is logged, including what was <b>left out</b>. No database.`);
await sleep(800);
await moveTo(W * 0.6, H * 0.62, 900);
await sleep(2800);
await shot("audit");

// Outro
await caption(null);
await card(`<div class="mark"><span class="logo">A</span>Ajora</div>
  <h1>Strip the phantom money. <em>See the real economy.</em></h1>
  <p>Transfer dedup · communal finance insights · consent you can revoke.</p>
  <div class="eyebrow">Zecathon 2025 · Team P4L</div>`);
await sleep(4600);

clearInterval(ticker);
await cdp.send("Page.stopScreencast");
await writing;
const endTs = Date.now() / 1000;
fs.writeFileSync(path.join(OUT, "frames.json"), JSON.stringify({ frames, endTs }, null, 1));
console.log(`frames=${frames.length} seconds=${((Date.now() - tStart) / 1000).toFixed(1)}`);
await browser.close();
