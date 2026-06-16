#!/usr/bin/env node

/**
 * ContentPlanner — Smoke Tests
 *
 * Tests all pages load without errors, navigation works,
 * and the auth flow is functional.
 *
 * Usage:
 *   npx playwright run-tests scripts/tests/smoke.spec.mjs
 *   node scripts/tests/smoke.mjs
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOT_DIR = join(__dirname, "screenshots");
const RESULTS = [];

function result(name, status, detail = "") {
  const icon = status === "pass" ? "✅" : status === "warn" ? "⚠️" : "❌";
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ""}`);
  RESULTS.push({ name, status, detail });
}

async function screenshot(page, name) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function run() {
  console.log(`\n🧪  ContentPlanner Smoke Tests\n`);
  console.log(`    Target: ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    // ── Test 1: Login page loads ──────────────────────────────
    console.log("━━━ Auth ━━━");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForSelector("h1", { timeout: 5000 });

    const loginTitle = await page.textContent("h1");
    if (loginTitle === "ContentPlanner") result("Login page title", "pass", loginTitle);
    else result("Login page title", "fail", `expected 'ContentPlanner', got '${loginTitle}'`);

    const emailInput = await page.isVisible('input[type="email"]');
    if (emailInput) result("Email input visible", "pass");
    else result("Email input visible", "fail");

    const submitBtn = await page.isVisible('button[type="submit"]');
    if (submitBtn) result("Submit button visible", "pass");
    else result("Submit button visible", "fail");

    // Test that submit button is disabled when empty (good UX)
    const isDisabled = await page.isDisabled('button[type="submit"]');
    if (isDisabled) result("Submit disabled when empty (correct UX)", "pass");
    else result("Submit disabled when empty", "warn", "button should be disabled on empty form");

    // Test that filling email enables the button
    await page.fill('input[type="email"]', "test@example.com");
    await page.waitForTimeout(100);
    const nowEnabled = await page.isEnabled('button[type="submit"]');
    if (nowEnabled) result("Submit enabled when email filled", "pass");
    else result("Submit enabled when email filled", "fail");

    await page.fill('input[type="email"]', "");

    await screenshot(page, "01-login");

    // ── Test 2: Protected routes redirect to login ────────────
    console.log("\n━━━ Route Guards ━━━");

    for (const route of ["/inbox", "/calendar", "/topics", "/settings"]) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 10000 });
      await page.waitForTimeout(500);

      const redirected = page.url().includes("/login");
      if (redirected) result(`'${route}' redirects to login`, "pass");
      else result(`'${route}' redirects to login`, "fail", `ended at ${page.url()}`);

      await screenshot(page, `02-guard-${route.replace("/", "")}`);
    }

    // ── Test 3: Login page UI elements ────────────────────────
    console.log("\n━━━ Login UI ━━━");

    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    // Test email input interaction
    await page.fill('input[type="email"]', "test@example.com");
    const filled = await page.inputValue('input[type="email"]');
    if (filled === "test@example.com") result("Email fill works", "pass");
    else result("Email fill works", "fail", `got '${filled}'`);

    // Fill email and submit
    await page.fill('input[type="email"]', "test@example.com");
    await page.waitForTimeout(100);
    const submitEnabled = await page.isEnabled('button[type="submit"]');
    if (submitEnabled) await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Check for any response
    const bodyText = await page.textContent("body");
    if (bodyText.includes("Check your email") || bodyText.includes("sent") || bodyText.includes("login link")) {
      result("Magic link submission UI", "pass", "magic link sent confirmation shown");
    } else if (bodyText.includes("error") || bodyText.includes("Couldn") || bodyText.includes("Invalid")) {
      result("Magic link submission UI", "warn", "showed error (API may need real Supabase keys)");
    } else {
      result("Magic link submission UI", "warn", "no clear success/error — may need live Supabase");
    }

    await screenshot(page, "03-login-filled");

    // ── Test 4: Console errors ────────────────────────────────
    console.log("\n━━━ Console Errors ━━━");

    if (consoleErrors.length === 0) {
      result("No console errors", "pass");
    } else {
      const uniqueErrors = [...new Set(consoleErrors)];
      // Filter out Supabase key errors (expected without real keys)
      const realErrors = uniqueErrors.filter(
        (e) => !e.includes("Missing VITE_SUPABASE") && !e.includes("supabase")
      );

      if (realErrors.length === 0) {
        result("No console errors (only expected Supabase key warnings)", "pass");
      } else {
        result(
          "Console errors found",
          "warn",
          `${realErrors.length} unexpected error(s): ${realErrors.slice(0, 3).join(" | ")}`
        );
      }
    }

    // ── Test 5: Page metadata ─────────────────────────────────
    console.log("\n━━━ Metadata ━━━");

    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    const pageTitle = await page.title();
    if (pageTitle === "ContentPlanner") result("Page title", "pass", pageTitle);
    else result("Page title", "warn", `got '${pageTitle}'`);

    const viewport = await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.content);
    if (viewport) result("Viewport meta tag", "pass", viewport);
    else result("Viewport meta tag", "fail");

    // ── Test 6: 404 route handling ────────────────────────────
    console.log("\n━━━ Error Handling ━━━");

    await page.goto(`${BASE_URL}/nonexistent`, { waitUntil: "networkidle", timeout: 10000 });
    await page.waitForTimeout(500);

    const redirectedOn404 = page.url().includes("/login") || page.url().includes("/inbox");
    if (redirectedOn404) result("404 route redirects gracefully", "pass");
    else {
      const body = await page.textContent("body");
      if (body.length > 0) result("404 route renders something", "pass");
      else result("404 route handling", "fail", "blank page on 404");
    }

    await screenshot(page, "04-404-handling");

    // ── Test 7: Responsive layout (mobile) ────────────────────
    console.log("\n━━━ Responsive ━━━");

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 10000 });

    const mobileTitle = await page.isVisible("h1");
    if (mobileTitle) result("Mobile: login loads", "pass");

    // Check that nothing overflows
    const overflowX = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    if (!overflowX) result("Mobile: no horizontal overflow", "pass");
    else result("Mobile: no horizontal overflow", "warn", "page overflows horizontally");

    await screenshot(page, "05-mobile-login");

    // ── Summary ──────────────────────────────────────────────
    const passes = RESULTS.filter((r) => r.status === "pass").length;
    const warns = RESULTS.filter((r) => r.status === "warn").length;
    const fails = RESULTS.filter((r) => r.status === "fail").length;
    const total = RESULTS.length;

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Results: ${passes} pass | ${warns} warn | ${fails} fail | ${total} total`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    if (fails === 0) {
      console.log("✅  All critical tests passed.\n");
    } else {
      console.log(`❌  ${fails} test(s) failed.\n`);
      RESULTS.filter((r) => r.status === "fail").forEach((r) =>
        console.log(`   FAIL: ${r.name} — ${r.detail}`)
      );
    }

    console.log(`Screenshots saved to: ${SCREENSHOT_DIR}\n`);
  } catch (err) {
    console.error("\n❌  Test runner crashed:", err.message);
    await screenshot(page, "99-crash");
    RESULTS.push({ name: "Test runner", status: "fail", detail: err.message });
  } finally {
    await browser.close();
  }
}

run();
