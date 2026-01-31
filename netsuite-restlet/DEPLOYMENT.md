# 📦 RESTlet Deployment Guide

Step-by-step instructions to deploy the Auto-Upload RESTlet to NetSuite.

---

## Prerequisites

- NetSuite Administrator role (or role with scripting permissions)
- Token-Based Authentication feature enabled

---

## Step 1: Upload the Script File

1. Navigate to **Documents → Files → File Cabinet**
2. Open or create the **SuiteScripts** folder
3. Click **Add File**
4. Choose `autoUploadRESTlet.js`
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

1. Click **Deploy Script** (or go to Deployments tab → New)
2. Fill in:

| Field | Value |
|-------|-------|
| Title | `Auto Upload Deployment` |
| ID | `_auto_upload_deploy` |
| Status | `Testing` |
| Log Level | `Debug` |
| Execute As Role | `Administrator` |
| Audience → Roles | `All Roles` |

3. Click **Save**

4. 📋 **Copy the External URL** - you'll need this!
   ```
   https://[ACCOUNT].restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=[ID]&deploy=[ID]
   ```

---

## Step 4: Enable Token-Based Authentication

1. Navigate to **Setup → Company → Enable Features**
2. Click the **SuiteCloud** tab
3. Check **Token-Based Authentication**
4. Click **Save**

---

## Step 5: Create Integration Record

1. Navigate to **Setup → Integration → Manage Integrations**
2. Click **New**
3. Fill in:

| Field | Value |
|-------|-------|
| Name | `Auto Upload Integration` |
| State | `Enabled` |
| Token-Based Authentication | ✓ Checked |

4. Click **Save**

5. 📋 **Copy and save:**
   - **Consumer Key**
   - **Consumer Secret** (shown only once!)

---

## Step 6: Create Access Token

1. Navigate to **Setup → Users/Roles → Access Tokens**
2. Click **New**
3. Fill in:

| Field | Value |
|-------|-------|
| Application Name | Select your Integration |
| User | Select your user |
| Role | Administrator |
| Token Name | `Auto Upload Token` |

4. Click **Save**

5. 📋 **Copy and save:**
   - **Token ID**
   - **Token Secret** (shown only once!)

---

## Step 7: Create .env File

In your project, create a `.env` file:

```env
NS_ACCOUNT_ID=1234567
NS_RESTLET_URL=https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1
NS_CONSUMER_KEY=your_consumer_key
NS_CONSUMER_SECRET=your_consumer_secret
NS_TOKEN_ID=your_token_id
NS_TOKEN_SECRET=your_token_secret
```

⚠️ **Add `.env` to your `.gitignore`!**

---

## Test Your Setup

1. In VS Code/Cursor, press `Ctrl+Shift+P`
2. Run: **NetSuite: Test RESTlet Connection**
3. You should see: `✓ NetSuite connection successful!`

---

## Troubleshooting

### "Invalid login attempt"
- Verify Account ID format (use `1234567-sb1` for sandbox)
- Check all OAuth credentials are correct
- Ensure Integration is enabled
- Verify Access Token is active

### "SSS_MISSING_REQD_ARGUMENT"
- Request is missing required fields
- Check the extension logs for details

### View Script Logs
1. Go to **Customization → Scripting → Script Deployments**
2. Click on your deployment
3. Click **View Logs**

---

## Security Recommendations

- Use **Testing** status initially
- Create **per-developer tokens** (each dev gets their own Access Token)
- **Rotate tokens** periodically
- **Never commit** `.env` files to git
