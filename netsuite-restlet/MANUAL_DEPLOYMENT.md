# Manual RESTlet Deployment

If you prefer not to use SDF CLI, follow these steps to deploy manually.

---

## Step 1: Upload the Script File

1. Navigate to **Documents → Files → File Cabinet**
2. Open the **SuiteScripts** folder (or create it)
3. Click **Add File**
4. Upload `src/FileCabinet/SuiteScripts/autoUploadRESTlet.js`
5. Click **Save**

---

## Step 2: Create Script Record

1. Navigate to **Customization → Scripting → Scripts**
2. Click **New**
3. Click **+** next to "Script File"
4. Select `autoUploadRESTlet.js`
5. Click **Create Script Record**
6. Fill in:

| Field | Value |
|-------|-------|
| Name | `Auto Upload RESTlet` |
| ID | `_auto_upload_restlet` |
| Description | `Handles file uploads from IDE` |

7. Click **Save**

---

## Step 3: Deploy the Script

1. Click **Deploy Script** button (or go to Deployments tab → New)
2. Fill in:

| Field | Value |
|-------|-------|
| Title | `Auto Upload RESTlet Deployment` |
| ID | `_auto_upload_deploy` |
| Status | `Testing` |
| Log Level | `Debug` |
| Execute As Role | `Administrator` |
| Audience → Roles | `All Roles` |

3. Click **Save**

4. 📋 **Copy the External URL** — you need this for the extension!

---

## Step 4: Get OAuth Credentials

### Enable Token-Based Authentication
1. **Setup → Company → Enable Features**
2. Click **SuiteCloud** tab
3. Check **Token-Based Authentication**
4. Click **Save**

### Create Integration
1. **Setup → Integration → Manage Integrations → New**
2. Fill in:
   - Name: `Auto Upload Integration`
   - Token-Based Authentication: ✓
3. **Save**
4. 📋 Copy **Consumer Key** and **Consumer Secret**

### Create Access Token
1. **Setup → Users/Roles → Access Tokens → New**
2. Select your Integration, User, and Role
3. **Save**
4. 📋 Copy **Token ID** and **Token Secret**

---

## Step 5: Configure Extension

Create `.env` file in your project:

```env
NS_ACCOUNT_ID=1234567
NS_RESTLET_URL=https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1
NS_CONSUMER_KEY=your_consumer_key
NS_CONSUMER_SECRET=your_consumer_secret
NS_TOKEN_ID=your_token_id
NS_TOKEN_SECRET=your_token_secret
```

---

## Test Connection

In VS Code/Cursor:
1. Press `Ctrl+Shift+P`
2. Run: **NetSuite: Test RESTlet Connection**
3. Should see: `✓ NetSuite connection successful!`

---

You're all set! 🎉
