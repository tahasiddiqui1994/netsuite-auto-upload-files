# 🚀 NetSuite Auto-Upload

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/tahasiddiqui.netsuite-auto-upload?style=flat-square&label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=tahasiddiqui.netsuite-auto-upload)
[![GitHub stars](https://img.shields.io/github/stars/tahasiddiqui1994/netsuite-auto-upload?style=flat-square&logo=github)](https://github.com/tahasiddiqui1994/netsuite-auto-upload)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Save once. Upload instantly. Stay in flow.**

Stop wasting time with manual file uploads to NetSuite. This extension automatically uploads your SuiteScript files the moment you save them. Works with VS Code, Cursor, and any VS Code-based editor.

![Demo](./assets/demo.gif)

---

## ✨ Features

- ⚡ **Instant Upload** - Files upload in 1-2 seconds (vs 10-30s with SDF)
- 🔄 **Auto-detect Changes** - Watches your `src/` folder and uploads on save
- 📁 **Transpilation Support** - Edit in `src/`, upload from `dist/`
- 🔐 **Secure** - Credentials stored in `.env` file (never committed to git)
- 🏗️ **SDF Compatible** - Works with standard SDF/SuiteApp project structure
- 📊 **Status Bar** - See upload progress and status at a glance
- 🔍 **Detailed Logs** - Debug issues easily with the output channel

---

## 📦 Installation

### 1. Install the VS Code Extension

**From Marketplace (Recommended):**
```
ext install tahasiddiqui.netsuite-auto-upload
```

Or search "NetSuite Auto-Upload" in VS Code Extensions.

**From VSIX:**
1. Download the `.vsix` file from [Releases](https://github.com/tahasiddiqui1994/netsuite-auto-upload/releases)
2. In VS Code: `Ctrl+Shift+P` → "Install from VSIX"

### 2. Deploy the RESTlet to NetSuite

1. Upload `netsuite-restlet/autoUploadRESTlet.js` to your File Cabinet
2. Create a Script record (Customization → Scripting → Scripts → New)
3. Deploy the script and copy the **External URL**

👉 See [Detailed RESTlet Setup Guide](./netsuite-restlet/DEPLOYMENT.md)

### 3. Configure Your Project

Create a `.env` file in your project root:

```env
NS_ACCOUNT_ID=1234567
NS_RESTLET_URL=https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1
NS_CONSUMER_KEY=your_consumer_key
NS_CONSUMER_SECRET=your_consumer_secret
NS_TOKEN_ID=your_token_id
NS_TOKEN_SECRET=your_token_secret
```

Or run: `Ctrl+Shift+P` → "NetSuite: Create .env File"

⚠️ **Add `.env` to your `.gitignore`!**

---

## 🎮 Usage

1. Open your NetSuite project in VS Code/Cursor
2. Edit any file in your `src/FileCabinet/SuiteScripts/` folder
3. Save the file (`Ctrl+S`)
4. Watch the status bar: `NS: Uploading...` → `NS: Uploaded ✓`

That's it! Your file is now in NetSuite.

### Commands

| Command | Description |
|---------|-------------|
| `NetSuite: Create .env File` | Generate credentials template |
| `NetSuite: Test RESTlet Connection` | Verify your setup |
| `NetSuite: Upload Current File` | Manual upload (`Ctrl+Alt+U`) |
| `NetSuite: Enable/Disable Auto-Upload` | Toggle auto-upload |
| `NetSuite: Show Upload Logs` | View detailed logs |

---

## 📁 Project Structure

The extension works with standard SDF/SuiteApp projects:

```
your-project/
├── .env                          ← Your credentials (gitignored)
├── src/
│   └── FileCabinet/
│       └── SuiteScripts/
│           └── your-script.js    ← Edit here
├── dist/                         ← (Optional) Transpiled files
└── ...
```

### Path Mapping

| You Edit | Uploads To |
|----------|------------|
| `src/FileCabinet/SuiteScripts/app.js` | `/SuiteScripts/app.js` |
| `src/FileCabinet/SuiteApps/com.example/lib.js` | `/SuiteApps/com.example/lib.js` |

---

## ⚙️ Configuration

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `watchFolder` | `src` | Folder to watch for file saves |
| `uploadFrom` | `src` | Folder to upload files from |
| `waitForBuild` | `500` | Ms to wait for transpilation |
| `debounceDelay` | `1000` | Ms to wait after save before upload |

### With Transpilation (ES6 → AMD)

If you transpile your code:

```json
{
  "netsuite-auto-upload.watchFolder": "src",
  "netsuite-auto-upload.uploadFrom": "dist",
  "netsuite-auto-upload.waitForBuild": 1000
}
```

---

## 🔧 Troubleshooting

### "Invalid login attempt"
- Verify all 6 credentials in `.env` are correct
- Check Account ID format (use `-sb1` for sandbox, not `_SB1`)
- Ensure Integration has Token-Based Authentication enabled
- Verify Access Token is active

### "File not found in [folder]"
- Check `watchFolder` and `uploadFrom` settings
- Ensure your project has the `FileCabinet/SuiteScripts/` structure

### View Logs
Run: `NetSuite: Show Upload Logs` to see detailed request/response info.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## ⭐ Support

If this extension saves you time, please:
- ⭐ **Star this repository**
- 📝 **Leave a review** on the VS Code Marketplace
- 🐛 **Report bugs** via GitHub Issues

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

## 👨‍💻 Author

**Muhammad Taha Siddiqui**

- GitHub: [@tahasiddiqui1994](https://github.com/tahasiddiqui1994)
- LinkedIn: [Muhammad Taha Siddiqui](https://linkedin.com/in/tahasiddiqui1994)

---

Made with ❤️ for the NetSuite developer community
