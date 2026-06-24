# WS-D — Settings: Drop Telegram, Add PWA Capture Guidance

**Owner scope:** `app/src/pages/SettingsPage.jsx` ONLY. Do NOT touch any other file.
**Goal:** Telegram is dropped (PWA model). The current "Connect Telegram" UI is fake (generates a
random code locally, flips a local boolean, no backend, no `telegram_links` table). Replace it with
honest, useful PWA capture guidance.

## Steps

1. **Remove** the Telegram "Connected Accounts" block and its fake state
   (`telegramLinked`, `linkCode`, `generateLinkCode`) and the Instagram "coming soon" block.
2. **Add a "Capture" section** explaining the real flow:
   - "Install ContentPlanner on your phone: open this site in your mobile browser → Share / ⋯ →
     **Add to Home Screen**."
   - "Then from any app (Instagram, YouTube, TikTok, browser), tap **Share → ContentPlanner** to
     save a link straight to your inbox."
   - Optionally detect install state: show a subtle hint if `window.matchMedia('(display-mode:
     standalone)').matches` is false ("You're in a browser tab — install to enable sharing").
     Keep it lightweight; no new deps.
3. **Keep** the existing Appearance (dark mode), Account (signed-in email), and Keyboard Shortcuts
   sections unchanged. Keep all existing imports that are still used; remove now-unused ones
   (`Link`, `Check`, `Copy` if no longer referenced) to keep the file clean.
4. Preserve dark-mode classes and the existing visual style (rounded cards, `dark:` variants).

## Verification
- The page renders with no references to Telegram/`linkCode`/`telegramLinked`.
- No unused imports remain (lint-clean).
- `SettingsPage.jsx` still exports default and uses `useTheme`, `useAuth` as before.

## Guardrails
- Single-file change. Don't add routes, backend calls, or new tables.
- Don't claim capabilities that don't exist (no "connected" badges for things that aren't wired).
