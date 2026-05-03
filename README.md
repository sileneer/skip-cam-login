# Skip Cam Login

Skip Cam Login is a small Chrome extension for Cambridge University Moodle and Panopto pages. It removes the extra gateway click by automatically pressing the public login button when you land on a supported login page.

It does not enter credentials, handle Raven/SAML, read course content, or send data anywhere. All settings and activity data stay in Chrome storage on your browser.

## Supported Sites

- Cambridge Moodle: `https://www.vle.cam.ac.uk/*`
- Cambridge Panopto: `https://cambridgelectures.cloud.panopto.eu/Panopto/*`

The content script is available across those paths so the popup can pause or resume the current tab from logged-in pages. Auto-clicking itself only happens on the configured login pages.

## Features

- Auto-clicks the Moodle and Panopto login buttons.
- Per-site toggles for Moodle and Panopto.
- Optional desktop notification after an auto-click.
- Configurable click delay: instant, 0.5 seconds, 1 second, or 3 seconds.
- Pause on the current tab until that tab is closed or resumed.
- Pause for the whole site via right-click → `Pause Skip Cam Login on this site`. Sticky across tabs and browser restarts.
- Pause everywhere for 15 minutes, 1 hour, or 4 hours.
- Logout-aware suppression, so signing out does not immediately send you back through login.
- Toolbar badge and tooltip showing whether the current tab is active, paused, or disabled.
- Popup follows the system light/dark theme.
- Local clicks-saved counter with an estimated time-saved figure.
- Local recent activity log capped at the 50 newest entries.
- One-time welcome page on first install with quick settings, a recreated Moodle login demo, and onboarding tips.

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

The extension icon opens the settings popup.

## Using the Popup

Open the extension from the Chrome toolbar.

The `Sites` section enables or disables auto-clicking for Moodle and Panopto independently.

The `This tab` section pauses auto-clicking only for the active tab. It works from supported Moodle and Panopto pages, including logged-in pages, because the content script is loaded across the supported site paths. A second row appears here when the current site has been paused via the right-click menu, with a `Resume` button for that host.

The `Behaviour` section controls notifications, click delay, and what happens after logout:

- `Don't auto-click in any tab (sticky)` stores a browser-session suppression flag after logout.
- `Don't auto-click in this tab only` suppresses the tab that logged out.
- `Always auto-click (no suppression)` disables logout suppression.

The `Quick actions` section pauses auto-clicking everywhere for a fixed time. The pause uses `chrome.storage.session`, so it is cleared when the browser session ends.

The footer shows the local clicks-saved counter once at least one click has been saved. `Recent activity` shows local click, suppression, and failure events.

## How It Works

On a supported login page, `content.js` evaluates the current state in this order:

1. Site disabled in settings.
2. Site paused via right-click menu (sticky per host).
3. Timed global pause.
4. Logout suppression for the browser session.
5. Logout suppression for the current tab.
6. Manual pause for the current tab.
7. Configured click delay.
8. Login button click.

Suppressed attempts and failed button lookups are written to the local activity log. Successful auto-clicks increment the local clicks-saved counter and can trigger a desktop notification.

`background.js` owns extension-wide browser behavior: toolbar badge state, tooltip text, notifications, log writes, and counter updates. The popup in `settings.html` and `settings.js` reads and writes user settings.

## Privacy and Permissions

The extension requests:

- `storage`: settings, session pause flags, local counter, and local activity log.
- `notifications`: optional desktop notifications after auto-clicking.
- `contextMenus`: right-click `Pause Skip Cam Login on this site` menu entry, only on the supported Cambridge domains.
- `activeTab`: lets the popup read the active tab's URL so the `Site paused` row can show the host and resume it.

The extension only runs on the two supported Cambridge domains listed above. It does not collect analytics, store URLs in the activity log, sync the activity log, or transmit personal data.

Activity log entries contain only:

- timestamp
- site name: `Moodle` or `Panopto`
- action: `clicked`, `suppressed`, or `failed`
- reason, when applicable

## Development

This is a Manifest V3 Chrome extension with no framework, bundler, or automated test suite.

Project files:

```text
skip-cam-login/
|-- manifest.json
|-- content.js
|-- background.js
|-- settings.html
|-- settings.js
|-- welcome.html
|-- welcome.js
|-- icon.png
|-- package.ps1
|-- docs/
|   `-- superpowers/
`-- src/
    `-- asset sources
```

Manual development loop:

1. Load the repository through `chrome://extensions/`.
2. After editing source files, click reload on the extension card.
3. Test Moodle and Panopto login pages.
4. Inspect the service worker console from the extension details page when debugging background behavior.

Useful manual checks:

- Moodle auto-click still fires when enabled.
- Panopto auto-click still fires when enabled.
- Per-site toggles suppress only the selected site.
- Logout suppression prevents immediate re-login.
- Manual click on a suppressed login page clears logout/manual suppression.
- Click delay is honored.
- Timed pause suppresses both sites and can be cancelled.
- Toolbar badge matches active, paused, and off states.
- Activity log stays local and caps at 50 entries.
- `./package.ps1` creates a zip with only runtime files.

## Version History

### 1.2

Released May 3, 2026.

Per-site pause, time-saved estimate, and a redesigned welcome page:

- Right-click any Moodle or Panopto page to pause auto-click for that whole site. Sticky across tabs and browser restarts via `chrome.storage.sync` (`paused_hosts`).
- New `Site paused` row in the popup's `This tab` section, with a `Resume` button for the current host.
- Hero counter in the popup now shows estimated time saved alongside the click count (3-second-per-click constant).
- Activity log entries are colour-dotted by status (green for clicked, amber for suppressed, red for failed).
- Popup UI polish: brand mark using `icon.png`, site monogram badges, amber-tinted active pause states, SVG footer icons.
- New first-install welcome page (`welcome.html`) with a recreated Cambridge Moodle login demo, three quick-settings toggles, onboarding tips, and a privacy summary.
- New permissions: `contextMenus`, `activeTab`.

### 1.1

Released May 1, 2026.

Power-user controls and UI polish:

- Manual pause for the current tab.
- Timed pause everywhere.
- Configurable click delay.
- Per-tab toolbar badge and explanatory tooltip.
- Dark-mode popup styling.
- Local clicks-saved counter.
- Local recent activity log.
- Moodle content-script match broadened from `/login/*` to `/*` so the popup can control logged-in Moodle tabs.

No new API permissions were added.

### 1.0

Released April 28, 2026.

Initial Chrome extension release:

- Moodle and Panopto login-button auto-clicking.
- Per-site enable toggles.
- Optional notifications.
- Logout-aware suppression.
- Local-first privacy model.

## License

MIT. See [LICENSE](LICENSE).

## Support

- Issues and feature requests: https://github.com/sileneer/skip-cam-login/issues
- Project homepage: https://github.com/sileneer/skip-cam-login
- Support development: https://buymeacoffee.com/sileneer
