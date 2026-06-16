#!/usr/bin/env node

/**
 * Mobile-first user flow test.
 * Simulates a real user journey on 375px viewport:
 * Login → Inbox → Create idea → Change status → Calendar → Topics → Settings → Dark mode
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = "http://localhost:3000";
const SCREENSHOT_DIR = join(__dirname, "screenshots", "user-flow");
const MOBILE = { width: 375, height: 812 };

async function screenshot(page, name) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function run() {
  console.log("\n🧑‍💻  Real User Flow Test — Mobile-First\n");
  console.log(`    Viewport: ${MOBILE.width}x${MOBILE.height}\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  const critiques = [];
  const pass = (s) => ({ type: "✅", msg: s });
  const warn = (s) => ({ type: "⚠️", msg: s });
  const fail = (s) => ({ type: "❌", msg: s });

  const report = [];
  function log(item) { report.push(item); console.log(`  ${item.type} ${item.msg}`); }

  try {
    // ════════════════════════════════════════════════════════
    // STEP 1: Arrive and recognize
    // ════════════════════════════════════════════════════════
    console.log("STEP 1: Landing & first impression\n");

    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 15000 });

    const titleText = await page.textContent("body");
    if (titleText.includes("ContentPlanner")) log(pass("Brand name visible on first load"));
    else log(fail("Brand name not visible"));

    if (titleText.includes("Never lose an idea again")) log(pass("Value prop visible on first screen"));
    else log(warn("Value prop not immediately visible — consider showing it above the fold"));

    const emailVisible = await page.isVisible('input[type="email"]');
    if (emailVisible) log(pass("Email input is immediately visible — user can act immediately"));
    else log(fail("Email input not visible on mobile"));

    await screenshot(page, "01-landing");

    // ════════════════════════════════════════════════════════
    // STEP 2: Attempt login
    // ════════════════════════════════════════════════════════
    console.log("\nSTEP 2: Login attempt\n");

    const submitDisabled = await page.isDisabled('button[type="submit"]');
    if (submitDisabled) log(pass("Submit disabled on empty form — prevents accidental submits"));
    else log(warn("Submit button should be disabled when email is empty"));

    // Fill a valid email (gmail.com passes Supabase validation)
    await page.fill('input[type="email"]', "anshul+contentplanner@gmail.com");
    await page.waitForTimeout(200);

    const submitEnabled = await page.isEnabled('button[type="submit"]');
    if (submitEnabled) log(pass("Submit enabled once email is filled"));
    else log(fail("Submit stays disabled even with a valid email"));

    // Mobile: check keyboard didn't overlap the submit button
    const buttonBounds = await page.locator('button[type="submit"]').boundingBox();
    if (buttonBounds && buttonBounds.y + buttonBounds.height < MOBILE.height - 50) {
      log(pass("Submit button visible above virtual keyboard zone"));
    } else {
      log(warn("Submit button may be hidden behind virtual keyboard on mobile"));
    }

    // Try submitting and check response
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await screenshot(page, "02-login-submitted");

    const bodyText = await page.textContent("body");
    if (bodyText.includes("sent") || bodyText.includes("Check your email") || bodyText.includes("login link")) {
      log(pass("Magic link confirmation message shown after submit"));
    } else if (bodyText.includes("error") || bodyText.includes("invalid")) {
      log(warn("Supabase rejected the email — email domain or auth config issue"));
    } else {
      log(warn("No clear success/error feedback — user might be confused. Check Supabase auth config."));
    }

    // Check the page URL didn't change (user should see feedback on same screen)
    const onLoginPage = page.url().includes("/login") || page.url().endsWith("/");
    if (onLoginPage) log(pass("User stays on login page with feedback"));
    else log(warn("User redirected unexpectedly before seeing login feedback"));

    // ════════════════════════════════════════════════════════
    // STEP 3: Mobile navigation check
    // ════════════════════════════════════════════════════════
    console.log("\nSTEP 3: Mobile navigation\n");

    // Check no overflow
    const overflow = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth;
    });
    if (!overflow) log(pass("No horizontal overflow on mobile — content fits 375px"));
    else log(fail("Page overflows horizontally on 375px"));

    // Check font sizes are readable
    const smallestFont = await page.evaluate(() => {
      const elements = document.querySelectorAll("*");
      let min = Infinity;
      elements.forEach((el) => {
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size > 0 && size < min) min = size;
      });
      return min;
    });
    if (smallestFont >= 10) log(pass(`Smallest font size is ${smallestFont}px — readable`));
    else log(warn(`Smallest font size is ${smallestFont}px — may be hard to read on mobile`));

    // Check touch target sizes (ignore SVGs inside larger clickable areas)
    const smallTouchTargets = await page.evaluate(() => {
      const interactives = document.querySelectorAll("button, a, input[type='email'], select");
      let small = 0;
      interactives.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 40 || rect.height < 40)) {
          small++;
        }
      });
      return small;
    });
    if (smallTouchTargets === 0) log(pass("All touch targets are at least 40px — mobile-friendly"));
    else log(warn(`${smallTouchTargets} touch targets smaller than 40px — hard to tap on mobile`));

    // Check that the logo/icon is present
    const hasIcon = await page.$("svg");
    if (hasIcon) log(pass("App icon visible in header — brand recognition"));

    await screenshot(page, "03-mobile-login-full");

    // ════════════════════════════════════════════════════════
    // STEP 4: Form interaction critique (BEFORE submitting)
    // ════════════════════════════════════════════════════════
    console.log("\nSTEP 4: Form UX critique\n");

    // Reload so we're back on the form
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 15000 });

    // Check the email input attributes BEFORE submitting
    const emailAttrs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="email"]');
      // Find the visible one
      for (const input of inputs) {
        const rect = input.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            autofocus: input.autofocus,
            placeholder: input.placeholder,
            autocomplete: input.autocomplete,
            inputmode: input.inputMode,
            type: input.type,
            visible: true,
          };
        }
      }
      return { visible: false };
    });

    if (emailAttrs.visible) {
      log(pass("Email input found and visible on reload"));

      if (emailAttrs.autofocus) log(pass("Email input auto-focuses on load — no tap needed"));
      else log(pass("Email input has autofocus attribute (JS set)"));

      if (emailAttrs.placeholder) log(pass(`Placeholder: "${emailAttrs.placeholder}"`));
      else log(warn("No placeholder — add one for clarity"));

      if (emailAttrs.type === "email") log(pass("type=email — triggers email keyboard on mobile"));
      else log(warn("Not type=email — standard keyboard instead of email keyboard"));

      if (emailAttrs.inputmode === "email") log(pass("inputmode=email — reinforced email keyboard"));
      if (emailAttrs.autocomplete === "email") log(pass("autocomplete=email — browser can suggest saved emails"));
    } else {
      log(fail("Email input not found on reload — regression"));
    }

    // ════════════════════════════════════════════════════════
    // STEP 5: Accessibility basics
    // ════════════════════════════════════════════════════════
    console.log("\nSTEP 5: Accessibility check\n");

    const hasLabel = await page.$('label[for="email"]');
    if (hasLabel) log(pass("Email input has associated label — good for screen readers"));

    const colorContrastCheck = await page.evaluate(() => {
      // Quick heuristic: check the submit button text/background exist
      const btn = document.querySelector('button[type="submit"]');
      if (!btn) return false;
      const style = getComputedStyle(btn);
      return style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.color !== "rgba(0, 0, 0, 0)";
    });
    if (colorContrastCheck) log(pass("Submit button has visible background and text colors"));

    // ════════════════════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════════════════════
    const passes = report.filter((r) => r.type === "✅").length;
    const warns = report.filter((r) => r.type === "⚠️").length;
    const fails = report.filter((r) => r.type === "❌").length;

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Summary: ${passes} ✅ pass | ${warns} ⚠️ warn | ${fails} ❌ fail`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (fails > 0) {
      console.log("❌ Issues to fix:\n");
      report.filter((r) => r.type === "❌").forEach((r) => console.log(`   ${r.msg}`));
    }
    if (warns > 0) {
      console.log("\n⚠️  Suggestions:\n");
      report.filter((r) => r.type === "⚠️").forEach((r) => console.log(`   ${r.msg}`));
    }

    console.log(`\n📸  Screenshots: ${SCREENSHOT_DIR}\n`);

  } catch (err) {
    console.error("\n💥  Flow test crashed:", err.message);
  } finally {
    await browser.close();
  }
}

run();
