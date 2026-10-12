# Changelog

All notable changes to Skip Cam Login are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version numbers follow the extension version declared in [`manifest.json`](manifest.json).

## [Unreleased]

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

[Unreleased]: https://github.com/sileneer/skip-cam-login/compare/1,3...HEAD
[1.3]: https://github.com/sileneer/skip-cam-login/compare/1.2...1,3
[1.2]: https://github.com/sileneer/skip-cam-login/compare/1.1...1.2
[1.1]: https://github.com/sileneer/skip-cam-login/compare/1.0...1.1
[1.0]: https://github.com/sileneer/skip-cam-login/releases/tag/1.0
