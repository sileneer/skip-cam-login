# Skip Cam Login

🚀 **Skip the hassle of repeated logins!** This Chrome extension automatically clicks login buttons on Cambridge University's Moodle (VLE) and Panopto platforms, getting you to your course content faster.

## ✨ Key Features

- **🎯 Automatic Login**: Instantly clicks login buttons on Moodle and Panopto pages
- **🚪 Logout-aware**: Stops auto-clicking after you sign out, so you can switch accounts or stay signed out
- **⚙️ Configurable Settings**: Enable or disable the extension for specific sites
- **🔔 Smart Notifications**: Get notified when login buttons are automatically clicked
- **🎨 Clean Interface**: Simple popup settings with toggle switches
- **🔒 Privacy Focused**: Only activates on specific Cambridge University domains

## 🖥️ Supported Sites

- **Cambridge VLE (Moodle)**: `https://www.vle.cam.ac.uk/login/*`
- **Cambridge Panopto**: `https://cambridgelectures.cloud.panopto.eu/Panopto/Pages/Auth/Login.aspx*`

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

- **Moodle Login Skip**: Toggle automatic login for Cambridge VLE/Moodle
- **Panopto Login Skip**: Toggle automatic login for Cambridge Panopto
- **Notifications**: Enable/disable notifications when login buttons are clicked
- **After logout**: Choose what happens after you sign out and land back on the login page — *sticky* (don't auto-click in any tab until you log in manually), *this tab only*, or *off* (always auto-click)

## 🔧 How It Works

The extension uses content scripts that run on specific Cambridge University domains. When you visit a login page:

1. The extension detects if you're on a supported login page
2. Checks your settings to see if auto-login is enabled for that site
3. If you recently signed out, it skips the auto-click and waits for a manual click instead
4. Otherwise, it automatically clicks the appropriate login button
5. Shows a notification (if enabled) confirming the action

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
- **Storage**: To save your settings preferences
- **Notifications**: To show confirmation messages (optional)

The extension:
- ✅ Only runs on specific Cambridge University domains
- ✅ Does not collect or transmit any personal data
- ✅ Works entirely locally in your browser
- ✅ Does not interfere with the actual login process

## 💬 Support

- 🐛 **Bug Reports**: [Open an issue on GitHub](https://github.com/sileneer/skip-cam-login/issues)
- 💡 **Feature Requests**: [Suggest improvements on GitHub](https://github.com/sileneer/skip-cam-login/issues)
- ☕ **Support Development**: [Buy me a coffee](https://buymeacoffee.com/sileneer)

## 📄 License

This project is open source. See the repository for license details.

## 📋 Version History

### Version 1.0 (Current)
**Release Date**: April 28, 2026

**Initial Chrome Web Store release.**

**Features:**
- ✅ Automatic login button clicking for Moodle and Panopto
- ✅ Logout-aware suppression — pauses auto-clicking after sign-out, with configurable scope (sticky across tabs, this tab only, or off)
- ✅ Per-site toggles for Moodle and Panopto
- ✅ Desktop notification support
- ✅ Clean, user-friendly settings interface
- ✅ Privacy-focused design with minimal permissions