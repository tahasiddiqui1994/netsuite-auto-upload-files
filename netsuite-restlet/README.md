# NetSuite Auto-Upload RESTlet

This is an SDF (SuiteCloud Development Framework) project containing the RESTlet required for the [NetSuite Auto-Upload](https://marketplace.visualstudio.com/items?itemName=tahasiddiqui.netsuite-auto-upload) VS Code extension.

---

## 🚀 Quick Deploy

### Prerequisites

- Node.js 18+
- NetSuite Administrator role
- Token-Based Authentication enabled

### Deploy in 3 Commands

```bash
# 1. Install dependencies
npm install

# 2. Setup your NetSuite account (first time only)
npm run setup

# 3. Deploy to NetSuite
npm run deploy
```

**That's it!** The RESTlet is now in your NetSuite account.

---

## 📋 After Deployment

1. Go to **Customization → Scripting → Script Deployments**
2. Find **"Auto Upload RESTlet Deployment"**
3. Copy the **External URL**
4. Add it to your project's `.env` file:

```env
NS_RESTLET_URL=https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=XXX&deploy=1
```

---

## 🔐 OAuth Setup

If you haven't already, set up OAuth credentials:

### 1. Enable Token-Based Authentication
**Setup → Company → Enable Features → SuiteCloud tab → Token-Based Authentication ✓**

### 2. Create Integration Record
**Setup → Integration → Manage Integrations → New**

| Field | Value |
|-------|-------|
| Name | `Auto Upload Integration` |
| State | `Enabled` |
| Token-Based Authentication | ✓ |

**Save** → Copy **Consumer Key** & **Consumer Secret**

### 3. Create Access Token
**Setup → Users/Roles → Access Tokens → New**

| Field | Value |
|-------|-------|
| Application Name | Your Integration |
| User | Your user |
| Role | Administrator |

**Save** → Copy **Token ID** & **Token Secret**

---

## 📁 Project Structure

```
netsuite-restlet/
├── src/
│   ├── FileCabinet/
│   │   └── SuiteScripts/
│   │       └── autoUploadRESTlet.js    ← The RESTlet
│   ├── Objects/
│   │   └── customscript_auto_upload_restlet.xml  ← Script + Deployment
│   ├── manifest.xml
│   └── deploy.xml
├── suitecloud.config.js
├── package.json
└── README.md
```

---

## 🔧 Available Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Configure NetSuite account |
| `npm run deploy` | Deploy to NetSuite |
| `npm run validate` | Validate project before deploy |
| `npm run list-objects` | List customizations in account |

---

## 🛠️ Manual Setup (Alternative)

If you prefer not to use SDF, you can manually deploy:

1. Upload `src/FileCabinet/SuiteScripts/autoUploadRESTlet.js` to File Cabinet
2. Create Script record (**Customization → Scripting → Scripts → New**)
3. Deploy the script
4. Copy External URL

See detailed steps in [MANUAL_DEPLOYMENT.md](./MANUAL_DEPLOYMENT.md)

---

## ❓ Troubleshooting

### "Authentication required"
```bash
npm run setup
```
Follow the prompts to re-authenticate.

### "Feature RESTLETS not enabled"
Enable RESTlets in your NetSuite account:
**Setup → Company → Enable Features → SuiteCloud → REST Web Services ✓**

### Deployment fails with permission error
Ensure your role has:
- SuiteScript permission
- Full Access to SuiteScripts folder

---

## 📄 License

MIT License - see [LICENSE](../LICENSE)
