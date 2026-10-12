# Changelog

All notable changes to Skip Cam Login are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow the extension version declared in [`manifest.json`](manifest.json).

## [Unreleased]

## [1.4] - 2026-10-12

Safer clicking, a status-first popup, and a stricter security policy.

### Added

- **Loop guard:** auto-click stops after 2 clicks within 2 minutes in the same tab, so a sign-in that can't finish no longer cycles forever. The popup offers **Try again**.
- **Status card** at the top of the popup. It says what will happen on the current tab and why, with a one-click fix: **Resume & sign in**, **Turn on & sign in**, **Try again**, **Reload page** (for tabs opened before the extension started) or **Report a flaky page**.
- **Pause everywhere until Chrome closes**, alongside 15 min / 1 hour / 4 hours.
- **Keyboard shortcut** to pause or resume everywhere. It has no default key; set one at `chrome://extensions/shortcuts`.
- **Keep activity history** switch. Turning it off stops the log and clears it.
- Error badge `!` when the login button can't be found or looks wrong, or when the loop guard trips.
- A pin hint on the welcome page when the toolbar icon isn't pinned.
- An "Updated to 1.4 — see what's new" line in the popup after a feature update.
- Dedicated 16/24/32/48/128 px icons.
- Development: a zero-dependency test suite (`node --test "tests/*.test.js"`). It is not shipped.

### Changed

- The right-click "Pause Skip Cam Login on this site" item is now a checkbox per site (**Auto-click on Moodle** / **Auto-click on Panopto**), the same switch as in the popup. Sites paused in 1.3 are migrated to "off".
- The popup was rebuilt to fit Chrome's 600 px popup limit (about 450 px, down from 984 px). Settings and Recent activity are now collapsible.
- Clearer wording throughout: notifications ("Signing you in to Moodle"), tooltips with an absolute pause end time, the after-sign-out options, and activity entries.
- The badge clears by itself when a timed pause ends, without a page reload.
- Notifications replace each other instead of stacking, and are silent.

### Fixed

- Moodle pages under `/login/` other than the login page itself (for example `forgot_password.php`) were treated as the login page.
- A pause set during the click delay was ignored.
- Activity entries and the clicks counter could be lost when several tabs reported at once.
- Text contrast now meets WCAG AA in both themes. Every switch and menu now has an accessible name.

### Security

- Strict Content Security Policy for extension pages (`style-src 'self'`, no remote fonts or connections). All CSS moved into `popup.css` and `welcome.css`.
- Auto-click only clicks a single login button that stays on the site or a Cambridge (`*.cam.ac.uk`) sign-in host, and never clicks on any other `/login/` page.
- Messages from content scripts are validated: the site is taken from the sender, not the message, and log entries are rebuilt from allowed fields only.
- If pause settings can't be read, it doesn't click, and shows why.

## [1.3] - 2026-05-05

Visual refresh and a privacy fix.

### Changed

- Refreshed popup and welcome page styling: glassmorphism header, gradient accents, refined hover states, polished dark-mode tokens, and a 3D-tilted login-page demo on the welcome screen.

### Fixed

- Removed the Google Fonts (`fonts.googleapis.com`) `@import` from both the popup and the welcome page. The extension now uses the platform's system font stack, restoring the privacy promise that no network requests leave the browser.

## [1.2] - 2026-05-03

Per-site pause, time-saved estimate, and a redesigned welcome page.

### Added

- Right-click any Moodle or Panopto page to pause auto-click for that whole site. Sticky across tabs and browser restarts via `chrome.storage.sync` (`paused_hosts`).
- New `Site paused` row in the popup's `This tab` section, with a `Resume` button for the current host.
- New first-install welcome page (`welcome.html`) with a recreated Cambridge Moodle login demo, three quick-settings toggles, onboarding tips, and a privacy summary.
- New permissions: `contextMenus`, `activeTab`.

### Changed

- Hero counter in the popup now shows estimated time saved alongside the click count (3-second-per-click constant).
- Activity log entries are colour-dotted by status (green for clicked, amber for suppressed, red for failed).
- Popup UI polish: brand mark using `icon.png`, site monogram badges, amber-tinted active pause states, SVG footer icons.

## [1.1] - 2026-05-01

Power-user controls and UI polish.

### Added

- Manual pause for the current tab.
- Timed pause everywhere.
- Configurable click delay.
- Per-tab toolbar badge and explanatory tooltip.
- Dark-mode popup styling.
- Local clicks-saved counter.
- Local recent activity log.

### Changed

- Moodle content-script match broadened from `/login/*` to `/*` so the popup can control logged-in Moodle tabs.

No new API permissions were added in this release.

## [1.0] - 2026-04-28

Initial Chrome extension release.

### Added

- Moodle and Panopto login-button auto-clicking.
- Per-site enable toggles for Moodle and Panopto.
- Optional desktop notifications.
- Logout-aware suppression, with configurable scope: sticky across tabs, this tab only, or off.
- Clean, user-friendly settings interface.
- Local-first privacy model with minimal permissions.

[Unreleased]: https://github.com/sileneer/skip-cam-login/compare/1.4...HEAD
[1.4]: https://github.com/sileneer/skip-cam-login/compare/1,3...1.4
[1.3]: https://github.com/sileneer/skip-cam-login/compare/1.2...1,3
[1.2]: https://github.com/sileneer/skip-cam-login/compare/1.1...1.2
[1.1]: https://github.com/sileneer/skip-cam-login/compare/1.0...1.1
[1.0]: https://github.com/sileneer/skip-cam-login/releases/tag/1.0
