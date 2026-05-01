# Skip Cam Login

🚀 **Skip the hassle of repeated logins!** This Chrome extension automatically clicks login buttons on Cambridge University's Moodle (VLE) and Panopto platforms, getting you to your course content faster.

## ✨ Key Features

- **🎯 Automatic Login**: Instantly clicks login buttons on Moodle and Panopto pages
- **⏱️ Configurable Click Delay**: Choose instant or 0.5 / 1 / 3 seconds before the auto-click fires
- **⏸️ Pause This Tab**: Stop auto-click on a single tab without disabling the extension
- **⏰ Quick Timed Pause**: Suspend auto-click everywhere for 15 minutes, 1 hour, or 4 hours
- **🚪 Logout-aware**: Stops auto-clicking after you sign out, so you can switch accounts or stay signed out
- **🟠 Toolbar Badge**: At-a-glance icon state shows whether auto-click is active, off, or paused — with a tooltip explaining *why*
- **🌙 Dark Mode**: Popup automatically follows your OS theme
- **📊 Clicks Saved Counter**: See how many auto-clicks the extension has saved you
- **📋 Recent Activity Log**: Collapsible log of the last 50 auto-clicks, suppressions, and failures (stored locally)
- **🔔 Smart Notifications**: Optional desktop notifications when auto-click fires
- **🔒 Privacy Focused**: Only activates on specific Cambridge University domains

## 🖥️ Supported Sites

- **Cambridge VLE (Moodle)**: `https://www.vle.cam.ac.uk/*` *(auto-click runs on the login page; per-tab pause can be set from any Moodle page)*
- **Cambridge Panopto**: `https://cambridgelectures.cloud.panopto.eu/Panopto/*` *(auto-click runs on the login page; per-tab pause can be set from any Panopto page)*

## 📦 Installation

### From Chrome Web Store (Recommended)
*Coming soon - extension will be published to the Chrome Web Store*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The Skip Cam Login extension should now appear in your extensions list

## 🚀 Usage

1. **Install the extension** using one of the methods above
2. **Navigate** to any supported Cambridge University login page
3. **Watch it work!** The extension will automatically click the login button
4. **Configure settings** by clicking the extension icon in your browser toolbar

### Settings Options

**Sites**
- **Moodle**: Toggle automatic login for Cambridge VLE/Moodle
- **Panopto**: Toggle automatic login for Cambridge Panopto

**This tab**
- **Pause on this tab**: Stop auto-click on the current tab until you close the tab (or click "Resume"). Works from any Moodle or Panopto page, including logged-in pages — useful if you want to log in manually with a different account.

**Behaviour**
- **Notifications**: Toast when a login is skipped
- **Delay before click**: Instant, 0.5 s, 1 s, or 3 s — gives you time to glimpse the page before it redirects
- **After logout**: Choose what happens after you sign out and land back on the login page — *sticky* (don't auto-click in any tab until you log in manually), *this tab only*, or *off* (always auto-click)

**Quick actions**
- **Pause everywhere**: Suspend auto-click on every site for 15 min / 1 hour / 4 hours, with a live countdown. "Cancel" lifts the pause early.

**Footer**
- **Recent activity** (collapsible): The last 50 auto-clicks, suppressions, and failures, with relative timestamps. "Clear log" wipes it.
- **Clicks saved counter**: Lifetime count of how many auto-clicks the extension has performed.

## 🔧 How It Works

The extension uses content scripts that run on Cambridge University domains. When you visit a login page, it evaluates the following in order:

1. **Site disabled?** If you've toggled this site off in settings → skip.
2. **Timed pause active?** If "Pause everywhere" is running and not yet expired → skip.
3. **Logout suppression?** If you recently signed out (depending on the "After logout" scope) → skip and wait for a manual click.
4. **Tab manually paused?** If you clicked "Pause on this tab" earlier → skip.
5. **Otherwise** → wait for the configured click delay and click the login button.

Each outcome is reflected in:
- The **toolbar icon badge** (green/empty = active, orange "II" = paused, grey "OFF" = disabled) and its hover tooltip explaining *why*.
- The optional **desktop notification** when an auto-click fires.
- The **activity log** in the popup, capped at the 50 most recent entries.

Manually clicking the login button on a suppressed page clears the suppression flags so future visits auto-click again.

## 🛠️ Development

### Prerequisites
- Chrome browser
- Basic knowledge of Chrome extension development

### File Structure
```
skip-cam-login/
├── manifest.json          # Extension configuration
├── content.js             # Main logic for auto-clicking
├── background.js          # Background service worker
├── settings.html          # Popup settings interface
├── settings.js            # Settings functionality
├── icon.png               # Extension icon
├── package.ps1            # Build a clean Web Store upload zip
└── src/                   # Asset sources (not bundled)
```

### Building the Web Store package

```powershell
./package.ps1
```

This produces `skip-cam-login.zip` containing only the runtime files Chrome needs. Upload that zip to the Chrome Web Store dashboard.

### Contributing
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly on both Moodle and Panopto
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 🐛 Troubleshooting

### Extension Not Working?
- Ensure you're on a supported Cambridge University domain
- Check that the extension is enabled in `chrome://extensions/`
- Verify the specific site is enabled in the extension settings
- Try refreshing the page after enabling the extension

### Login Button Not Found?
- The extension targets specific login button selectors
- If the site layout changes, the extension may need updates
- Please report issues on GitHub with the specific page URL

## 📝 Privacy & Permissions

This extension only requests minimal permissions:
- **Storage**: To save your settings, the clicks-saved counter, and the local activity log
- **Notifications**: To show optional confirmation toasts when an auto-click fires

The extension:
- ✅ Only runs on `vle.cam.ac.uk` and the Cambridge Panopto domain — never any other site
- ✅ Does not collect or transmit any personal data
- ✅ Works entirely locally in your browser; the activity log lives in `chrome.storage.local` and is never synced or sent anywhere
- ✅ Does not interfere with the actual login process — it only clicks the public "Login" button on the gateway page

## 💬 Support

- 🐛 **Bug Reports**: [Open an issue on GitHub](https://github.com/sileneer/skip-cam-login/issues)
- 💡 **Feature Requests**: [Suggest improvements on GitHub](https://github.com/sileneer/skip-cam-login/issues)
- ☕ **Support Development**: [Buy me a coffee](https://buymeacoffee.com/sileneer)

## 📄 License

This project is open source. See the repository for license details.

## 📋 Version History

### Version 1.1 (Current)
**Release Date**: May 1, 2026

**Power-user controls and UX polish on top of v1.0.**

**New features:**
- ✅ **Pause on this tab** — manual single-tab pause, settable from any Moodle or Panopto page (not just the login page)
- ✅ **Quick timed pause** (15 min / 1 hour / 4 hours) with live countdown and Cancel
- ✅ **Configurable click delay** — Instant, 0.5 s, 1 s, or 3 s
- ✅ **Toolbar icon badge** with per-tab state (active / paused / off) and tooltip explaining *why*
- ✅ **Dark mode popup** auto-following `prefers-color-scheme`
- ✅ **Lifetime clicks-saved counter** in the popup footer
- ✅ **Recent activity log** — collapsible, last 50 entries, stored locally; clearable

**Manifest change:** Moodle content-script match broadened from `https://www.vle.cam.ac.uk/login/*` to `https://www.vle.cam.ac.uk/*` to support pausing from logged-in pages. Web Store updates from v1.0 will trigger a one-time "Permissions increase requested" prompt. No new API permissions.

### Version 1.0
**Release Date**: April 28, 2026

**Initial Chrome Web Store release.**

**Features:**
- ✅ Automatic login button clicking for Moodle and Panopto
- ✅ Logout-aware suppression — pauses auto-clicking after sign-out, with configurable scope (sticky across tabs, this tab only, or off)
- ✅ Per-site toggles for Moodle and Panopto
- ✅ Desktop notification support
- ✅ Clean, user-friendly settings interface
- ✅ Privacy-focused design with minimal permissions