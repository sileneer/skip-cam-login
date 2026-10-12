# Skip Cam Login

Skip Cam Login is a small Chrome extension for Cambridge University Moodle and Panopto pages. It removes the extra gateway click by automatically pressing the public login button when you land on a supported login page.

It does not enter credentials, handle Raven/SAML, read course content, or send data anywhere. All settings and activity data stay in Chrome storage on your browser.

## Supported Sites

- Cambridge Moodle: `https://www.vle.cam.ac.uk/*`
- Cambridge Panopto: `https://cambridgelectures.cloud.panopto.eu/Panopto/*`

The content script is available across those paths so the popup can pause or resume the current tab from logged-in pages. Auto-clicking itself only happens on the configured login pages.

## Features

- Auto-clicks the Moodle and Panopto login buttons, and only those.
- A status card in the popup says what will happen on the current tab, why, and offers a one-click fix: Resume & sign in, Turn on & sign in, Try again, or Reload page.
- Per-site switches for Moodle and Panopto, also available from the right-click menu on those sites (`Auto-click on Moodle` / `Auto-click on Panopto`).
- Pause on the current tab until that tab is closed or resumed.
- Pause everywhere for 15 minutes, 1 hour, 4 hours, or until Chrome closes. Optional keyboard shortcut (set it at `chrome://extensions/shortcuts`).
- Logout-aware suppression, so signing out does not immediately send you back through login.
- Loop guard: stops after 2 auto-clicks within 2 minutes in the same tab, so a sign-in that can't finish never loops.
- Optional desktop notification after an auto-click.
- Configurable click delay: instant, 0.5 seconds, 1 second, or 3 seconds.
- Toolbar badge and tooltip: no text when active, `II` when paused, `OFF` when a site is off, `!` when something needs you.
- Popup follows the system light/dark theme and fits Chrome's 600 px popup height.
- Local clicks-saved counter with an estimated time-saved figure.
- Local recent activity log capped at the 50 newest entries, with a switch to turn history off.
- One-time welcome page on first install with quick settings, a recreated Moodle login demo, a pin-the-icon hint, and onboarding tips.

## Installation

### Chrome Web Store

Install Skip Cam Login from the Chrome Web Store:

https://chromewebstore.google.com/detail/ccjmlaicaepkofiiiomgnlfljnegfced

### Load Unpacked

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the repository folder.

The extension icon opens the popup. Pin it (puzzle-piece icon → pin) to see the badge.

## Using the Popup

Open the extension from the Chrome toolbar. From top to bottom:

- The header shows the local clicks-saved counter once at least one click has been saved.
- The **status card** describes the current tab. For example, it shows `Ready`, `Paused — you signed out`, or `Stopped to avoid a sign-in loop`, together with the button that fixes it. `Pause this tab` pauses auto-click for the active tab only. Tabs that were open before the extension was installed or updated show `Reload to activate`.
- **Pause everywhere** suspends auto-clicking on both sites for a set time, or until Chrome closes. The pause uses `chrome.storage.session`, so it also ends when Chrome restarts or the extension updates.
- **Sites** turns auto-clicking on or off for Moodle and Panopto independently.
- **Settings** (collapsible) holds notifications, the click delay, what happens after you sign out, the keyboard shortcut, and the activity-history switch. The sign-out options are:
  - `Pause all tabs until I sign in again` stores a browser-session flag after logout.
  - `Pause only the tab I signed out in` pauses just the tab that logged out.
  - `Keep auto-clicking` turns sign-out suppression off.
- **Recent activity** (collapsible) shows local click, skip, and failure events.

## How It Works

Only the exact login pages are candidates: Moodle `/login/index.php` (or `/login/`) and Panopto `/Panopto/Pages/Auth/Login.aspx`. Other pages under `/login/`, such as `forgot_password.php`, are never clicked.

On a login page, `content.js` checks these in order, and the first match stops auto-click:

1. Site turned off.
2. Pause settings can't be read (it fails closed and says so).
3. Pause everywhere (timed, or until Chrome closes).
4. Signed out, all tabs.
5. Signed out, this tab.
6. Paused on this tab.
7. Loop guard: 2 auto-clicks in this tab within 2 minutes.

If nothing matches, it waits for the configured delay and finds the login button. It clicks only when there is exactly one, and only if it stays on the site or goes to a Cambridge (`*.cam.ac.uk`) sign-in host. Right before clicking, it checks the pauses again.

Skipped attempts and failures go to the local activity log. Successful auto-clicks increment the local clicks-saved counter and can trigger a desktop notification.

The decision rules live as pure functions in `shared.js`, shared by the content script, the service worker and the popup. `background.js` owns the toolbar badge and tooltip, notifications, the log and counter (written one at a time), the right-click menu, and the keyboard shortcut. It accepts messages only from its own content scripts on the supported sites.

## Privacy and Permissions

The extension requests:

- `storage`: settings, session pause flags, the local counter, and the local activity log.
- `notifications`: optional desktop notifications after auto-clicking.
- `contextMenus`: the `Auto-click on Moodle` / `Auto-click on Panopto` right-click items, shown only on those sites.
- `activeTab`: lets the popup tell whether the current tab is a Moodle or Panopto page.

The extension only runs on the two supported Cambridge domains listed above. It does not collect analytics, store URLs in the activity log, sync the activity log, or transmit personal data. Its pages run under a strict Content Security Policy that blocks remote code, styles, fonts and network connections.

Activity log entries contain only:

- timestamp
- site name: `Moodle` or `Panopto`
- action: `clicked`, `suppressed`, or `failed`
- reason, when applicable

Turn off `Keep activity history` in Settings to stop keeping the log and clear it.

## Development

This is a Manifest V3 Chrome extension with no framework or bundler. Runtime files sit flat at the repository root.

Project files:

```text
skip-cam-login/
|-- manifest.json
|-- shared.js          constants and pure decision helpers
|-- content.js
|-- background.js
|-- settings.html / settings.js / popup.css
|-- welcome.html / welcome.js / welcome.css
|-- icon.png, icon-16.png ... icon-128.png
|-- tests/             node:test suite (not shipped)
|-- package.ps1        builds the store zip and checks it
|-- CHANGELOG.md
`-- src/               asset sources
```

Tests (Node 22 or later, no dependencies):

```sh
node --test "tests/*.test.js"
```

Manual development loop:

1. Load the repository through `chrome://extensions/`.
2. After editing source files, click reload on the extension card. Reloading clears session pauses.
3. Test Moodle and Panopto login pages.
4. Inspect the service worker console from the extension details page when debugging background behavior.

Useful manual checks:

- Moodle and Panopto auto-click still fire when enabled, exactly once.
- `/login/forgot_password.php` is not clicked.
- Per-site switches and the right-click checkboxes stay in sync.
- Logout suppression prevents immediate re-login. `Resume & sign in` signs in.
- Clicking the login button yourself clears logout, tab and loop-guard pauses.
- Click delay is honored, and pausing during the delay prevents the click.
- Timed pause suppresses both sites, and the badge clears by itself when it ends.
- The toolbar badge matches the active, paused, off and error states.
- The popup and welcome page show no CSP errors in DevTools.
- `./package.ps1` creates a zip with only runtime files, and fails if a referenced file is missing.

## Version History

See [CHANGELOG.md](CHANGELOG.md) for release notes covering every version, from the initial 1.0 release to the latest 1.4 update.

## License

MIT. See [LICENSE](LICENSE).

## Support

- Issues and feature requests: https://github.com/sileneer/skip-cam-login/issues
- Project homepage: https://github.com/sileneer/skip-cam-login
- Support development: https://buymeacoffee.com/sileneer
