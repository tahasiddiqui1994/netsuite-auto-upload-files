# NetSuite Auto-Upload

**⚡ Save once. Upload instantly. Stay in flow.**

Stop wasting 10-30 seconds on every file upload. This extension automatically uploads your SuiteScript files to NetSuite the moment you save — in just 1-2 seconds.

![Upload Lifecycle](https://raw.githubusercontent.com/tahasiddiqui1994/netsuite-auto-upload-files/main/assets/icon.png)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| ⚡ **Instant Upload** | Files upload in 1-2 seconds vs 10-30s with SDF |
| 🔄 **Auto-detect Changes** | Watches your `src/` folder and uploads on save |
| 📁 **Transpilation Support** | Edit in `src/`, upload from `dist/` |
| 🔐 **Secure Credentials** | Store in `.env` file (never committed to git) |
| 🏗️ **SDF Compatible** | Works with standard SDF/SuiteApp project structure |
| 📊 **Status Bar** | See upload progress at a glance |
| 🔍 **Detailed Logs** | Debug issues easily |

---

## 🚀 Quick Start

### 1️⃣ Deploy RESTlet to NetSuite

```bash
# Clone the repo
git clone https://github.com/tahasiddiqui1994/netsuite-auto-upload-files.git

# Go to RESTlet folder
cd netsuite-auto-upload/netsuite-restlet

# Install dependencies
npm install

# Setup account (first time only)
npm run setup

# Deploy to NetSuite
npm run deploy
```

After deployment:
1. Go to **Customization → Scripting → Script Deployments**
2. Find **"Auto Upload RESTlet Deployment"**
3. Copy the **External URL**

### 2️⃣ Create `.env` File

Press `Ctrl+Shift+P` → **"NetSuite: Create .env File"**

Or manually create `.env` in your project root:

```env
NS_ACCOUNT_ID=1234567
NS_RESTLET_URL=https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1
NS_CONSUMER_KEY=your_consumer_key
NS_CONSUMER_SECRET=your_consumer_secret
NS_TOKEN_ID=your_token_id
NS_TOKEN_SECRET=your_token_secret
```

> ⚠️ Add `.env` to your `.gitignore`!

### 3️⃣ Start Developing!

1. Edit any file in `src/FileCabinet/SuiteScripts/`
2. Press `Ctrl+S` to save
3. Watch status bar: `NS: Uploading...` → `NS: Uploaded ✓`

**That's it!** Your file is now in NetSuite.

---

## 📸 How It Works

When you save a file, the extension:

```
1. Detects file save in src/FileCabinet/SuiteScripts/...
2. Waits for build (if using transpilation)
3. Maps to upload folder (src or dist)
4. Calculates NetSuite path: /SuiteScripts/...
5. Uploads via RESTlet (OAuth 1.0 authenticated)
6. Shows success notification ✓
```

### Example Upload Lifecycle

```
[Waiting 500ms for build...]
[Uploading: f3_credit_memo_ue.js (from src)]

savedFile:     d:\project\src\FileCabinet\SuiteScripts\app\f3_credit_memo_ue.js
uploadFile:    d:\project\dist\FileCabinet\SuiteScripts\app\f3_credit_memo_ue.js  
netSuitePath:  /SuiteScripts/app/f3_credit_memo_ue.js
isMapped:      true

[Making request]
POST https://1234567.restlets.api.netsuite.com/...

[Response received]
statusCode: 200

[Upload successful: f3_credit_memo_ue.js]
{
  "success": true,
  "message": "File updated successfully",
  "fileId": 28352,
  "path": "/SuiteScripts/app/f3_credit_memo_ue.js",
  "action": "update",
  "duration": 205
}
```

---

## 📁 Supported Project Structures

### SDF Project
```
my-project/
├── .env                          ← Credentials
├── src/
│   └── FileCabinet/
│       └── SuiteScripts/
│           └── your-script.js    ← Edit here
└── manifest.xml
```

### With Transpilation (ES6 → AMD)
```
my-project/
├── .env
├── src/                          ← Watch folder (ES6)
│   └── FileCabinet/
│       └── SuiteScripts/
│           └── your-script.js
└── dist/                         ← Upload folder (AMD)
    └── FileCabinet/
        └── SuiteScripts/
            └── your-script.js
```

---

## ⚙️ Configuration

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `watchFolder` | `src` | Folder to watch for saves |
| `uploadFrom` | `src` | Folder to upload from |
| `waitForBuild` | `500` | Ms to wait for transpilation |
| `debounceDelay` | `1000` | Ms to wait before upload |
| `showNotifications` | `true` | Show success/error popups |

### For Transpiled Projects

```json
{
  "netsuite-auto-upload.watchFolder": "src",
  "netsuite-auto-upload.uploadFrom": "dist",
  "netsuite-auto-upload.waitForBuild": 1000
}
```

---

## 🎹 Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `NetSuite: Create .env File` | - | Generate credentials template |
| `NetSuite: Test RESTlet Connection` | - | Verify your setup |
| `NetSuite: Upload Current File` | `Ctrl+Alt+U` | Manual upload |
| `NetSuite: Enable Auto-Upload` | - | Turn on auto-upload |
| `NetSuite: Disable Auto-Upload` | - | Turn off auto-upload |
| `NetSuite: Show Upload Logs` | - | View detailed logs |

---

## 📊 Status Bar

| Icon | Status |
|------|--------|
| `$(cloud-upload) NS: Ready` | Ready to upload |
| `$(sync~spin) NS: Uploading...` | Upload in progress |
| `$(check) NS: Uploaded` | Success! |
| `$(error) NS: Failed` | Error (click for logs) |
| `$(circle-slash) NS: Disabled` | Auto-upload off |

---

## 🔧 Troubleshooting

### "Invalid login attempt"
- ✓ Verify Account ID format (`1234567-sb1` for sandbox)
- ✓ Check all 6 credentials in `.env`
- ✓ Ensure Integration has Token-Based Auth enabled
- ✓ Verify Access Token is active (not revoked)

### "File not found in [folder]"
- ✓ Check `watchFolder` matches where you edit
- ✓ Check `uploadFrom` matches where built files are
- ✓ Run your build if using transpilation

### View Detailed Logs
Press `Ctrl+Shift+P` → **"NetSuite: Show Upload Logs"**

---

## 🔐 OAuth Setup (One-time)

### 1. Enable Token-Based Authentication
**Setup → Company → Enable Features → SuiteCloud → Token-Based Authentication ✓**

### 2. Create Integration
**Setup → Integration → Manage Integrations → New**
- Name: `Auto Upload Integration`
- Token-Based Authentication: ✓
- **Save** → Copy Consumer Key & Secret

### 3. Create Access Token
**Setup → Users/Roles → Access Tokens → New**
- Select your Integration
- Select your User & Role
- **Save** → Copy Token ID & Secret

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a Pull Request

[GitHub Repository](https://github.com/tahasiddiqui1994/netsuite-auto-upload-files)

---

## 📄 License

MIT License - see [LICENSE](https://github.com/tahasiddiqui1994/netsuite-auto-upload-files/blob/main/LICENSE)

---

## 👨‍💻 Author

**Muhammad Taha Siddiqui**
- GitHub: [@tahasiddiqui1994](https://github.com/tahasiddiqui1994)

---

**⭐ If this extension saves you time, please star the repo and leave a review!**
