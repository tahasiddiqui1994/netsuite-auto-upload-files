const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const https = require('https');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto-js');
const { minimatch } = require('minimatch');

let uploadStatusBar;
let fileWatcher;
let debounceTimers = new Map();
let outputChannel;
let uploadHistory = [];
let envConfigCache = new Map(); // Cache per workspace

/**
 * Load credentials from .env file in project root
 * 
 * Looks for (in order, later overrides earlier):
 *   1. .env
 *   2. .env.local (for personal overrides, gitignored)
 *   3. .netsuite.env (alternative name)
 * 
 * .env format:
 *   NS_ACCOUNT_ID=1234567
 *   NS_RESTLET_URL=https://1234567.restlets.api.netsuite.com/...
 *   NS_CONSUMER_KEY=abc...
 *   NS_CONSUMER_SECRET=def...
 *   NS_TOKEN_ID=ghi...
 *   NS_TOKEN_SECRET=jkl...
 */
function loadEnvConfig(workspaceFolder) {
    if (!workspaceFolder) return {};
    
    const wsPath = workspaceFolder.uri.fsPath;
    
    // Check cache
    if (envConfigCache.has(wsPath)) {
        return envConfigCache.get(wsPath);
    }

    const envConfig = {};
    
    // Files to check (later overrides earlier)
    const envFiles = [
        '.env',
        '.env.local',      // Personal overrides (should be gitignored)
        '.netsuite.env'    // Alternative name
    ];

    for (const fileName of envFiles) {
        const envPath = path.join(wsPath, fileName);
        if (fs.existsSync(envPath)) {
            try {
                const content = fs.readFileSync(envPath, 'utf8');
                const parsed = parseEnvFile(content);
                Object.assign(envConfig, parsed);
                log(`Loaded credentials from: ${fileName}`);
            } catch (e) {
                log(`Failed to load ${fileName}: ${e.message}`);
            }
        }
    }

    // Cache it
    envConfigCache.set(wsPath, envConfig);
    
    return envConfig;
}

/**
 * Parse .env file content
 */
function parseEnvFile(content) {
    const result = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        // Parse KEY=VALUE
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1).trim();
            
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            
            result[key] = value;
        }
    }
    
    return result;
}

/**
 * Get config value - checks .env first, then VS Code settings
 * Supports both credentials and upload settings
 */
function getCredential(key, workspaceFolder) {
    // Map of VS Code setting key → .env variable names
    const envKeyMap = {
        'restletUrl': ['NS_RESTLET_URL', 'NETSUITE_RESTLET_URL'],
        'accountId': ['NS_ACCOUNT_ID', 'NETSUITE_ACCOUNT_ID'],
        'oauth.consumerKey': ['NS_CONSUMER_KEY', 'NETSUITE_CONSUMER_KEY'],
        'oauth.consumerSecret': ['NS_CONSUMER_SECRET', 'NETSUITE_CONSUMER_SECRET'],
        'oauth.tokenId': ['NS_TOKEN_ID', 'NETSUITE_TOKEN_ID'],
        'oauth.tokenSecret': ['NS_TOKEN_SECRET', 'NETSUITE_TOKEN_SECRET'],
        // Upload settings - can be configured in .env
        'uploadFrom': ['NS_UPLOAD_FROM', 'NETSUITE_UPLOAD_FROM'],
        'watchFolder': ['NS_WATCH_FOLDER', 'NETSUITE_WATCH_FOLDER'],
        'rootPath': ['NS_ROOT_PATH', 'NETSUITE_ROOT_PATH']
    };
    
    // Default values for settings
    const defaults = {
        'uploadFrom': 'dist',
        'watchFolder': 'src',
        'rootPath': '/SuiteScripts'
    };
    
    // Try .env first
    const envConfig = loadEnvConfig(workspaceFolder);
    const envKeys = envKeyMap[key];
    
    if (envKeys) {
        for (const envKey of envKeys) {
            if (envConfig[envKey]) {
                return envConfig[envKey];
            }
        }
    }
    
    // Fall back to VS Code settings
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    const value = config.get(key);
    
    // Return default if no value found
    if (value === undefined || value === null || value === '') {
        return defaults[key] || value;
    }
    
    return value;
}

/**
 * Clear env cache for a workspace (call when .env file changes)
 */
function clearEnvCache(workspaceFolder) {
    if (workspaceFolder) {
        envConfigCache.delete(workspaceFolder.uri.fsPath);
    } else {
        envConfigCache.clear();
    }
}

/**
 * Get the upload source folder path
 * User configures which folder to upload FROM (src, dist, or custom)
 * Default: dist (for transpiled/built files)
 */
function getUploadSourcePath(workspaceFolder) {
    const uploadFrom = getCredential('uploadFrom', workspaceFolder) || 'dist';
    
    // Handle absolute or relative path
    if (path.isAbsolute(uploadFrom)) {
        return uploadFrom;
    }
    
    return path.join(workspaceFolder.uri.fsPath, uploadFrom);
}

/**
 * Map a saved source file to the actual file to upload
 * If user saves src/file.js but uploadFrom is 'dist', we upload dist/file.js
 * Default: watch 'src', upload from 'dist'
 */
function resolveUploadFile(savedFilePath, workspaceFolder) {
    const uploadFrom = getCredential('uploadFrom', workspaceFolder) || 'dist';
    const watchFolder = getCredential('watchFolder', workspaceFolder) || 'src';
    
    const wsPath = workspaceFolder.uri.fsPath;
    const relativePath = path.relative(wsPath, savedFilePath).replace(/\\/g, '/');
    
    // If uploadFrom equals watchFolder, upload the same file
    if (uploadFrom === watchFolder) {
        return {
            uploadPath: savedFilePath,
            relativePath: relativePath,
            netSuitePath: calculateNetSuitePath(relativePath, workspaceFolder),
            isMapped: false
        };
    }
    
    // Map from watch folder to upload folder
    // e.g., src/FileCabinet/... → dist/FileCabinet/...
    if (relativePath.startsWith(watchFolder + '/')) {
        const pathAfterWatch = relativePath.substring(watchFolder.length + 1);
        const mappedRelativePath = uploadFrom + '/' + pathAfterWatch;
        const mappedAbsolutePath = path.join(wsPath, mappedRelativePath);
        
        return {
            uploadPath: mappedAbsolutePath,
            relativePath: mappedRelativePath,
            netSuitePath: calculateNetSuitePath(mappedRelativePath, workspaceFolder),
            isMapped: true,
            originalPath: savedFilePath
        };
    }
    
    // File is not in watch folder, upload directly
    return {
        uploadPath: savedFilePath,
        relativePath: relativePath,
        netSuitePath: calculateNetSuitePath(relativePath, workspaceFolder),
        isMapped: false
    };
}

/**
 * Calculate NetSuite File Cabinet path from relative path
 * Handles paths like: dist/FileCabinet/SuiteScripts/f3ns_teamlitzen/erp/artWork/file.js
 * 
 * Process:
 * 1. Remove upload folder prefix (dist/, src/, etc.)
 * 2. Remove FileCabinet/ prefix
 * 3. Find SuiteScripts/ and use everything from there onwards
 * 
 * Examples:
 *   dist/FileCabinet/SuiteScripts/f3ns_teamlitzen/erp/artWork/file.js → /SuiteScripts/f3ns_teamlitzen/erp/artWork/file.js
 *   src/FileCabinet/SuiteScripts/client/app.js → /SuiteScripts/client/app.js
 *   dist/FileCabinet/SuiteScripts/lib.js → /SuiteScripts/lib.js
 */
function calculateNetSuitePath(relativePath, workspaceFolder) {
    // Normalize path separators
    let normalizedPath = relativePath.replace(/\\/g, '/');
    
    // Get upload folder setting (from .env or config, default: dist)
    const uploadFrom = getCredential('uploadFrom', workspaceFolder) || 'dist';
    
    // Remove upload folder prefix (dist/, src/, etc.)
    if (normalizedPath.startsWith(uploadFrom + '/')) {
        normalizedPath = normalizedPath.substring(uploadFrom.length + 1);
    }
    
    // Remove FileCabinet prefix if present
    if (normalizedPath.startsWith('FileCabinet/')) {
        normalizedPath = normalizedPath.substring('FileCabinet/'.length);
    }
    
    // Find SuiteScripts in the path (case-insensitive)
    const suiteScriptsIndex = normalizedPath.toLowerCase().indexOf('suitescripts/');
    
    if (suiteScriptsIndex !== -1) {
        // Extract everything from SuiteScripts onwards
        // The RESTlet will skip the SuiteScripts prefix since it starts from SuiteScripts root
        let netSuitePath = normalizedPath.substring(suiteScriptsIndex);
        
        // Ensure leading slash
        if (!netSuitePath.startsWith('/')) {
            netSuitePath = '/' + netSuitePath;
        }
        
        // Clean up double slashes
        netSuitePath = netSuitePath.replace(/\/+/g, '/');
        
        return netSuitePath;
    }
    
    // If SuiteScripts not found, check if path starts with SuiteScripts (without trailing slash)
    if (normalizedPath.toLowerCase().startsWith('suitescripts/')) {
        let netSuitePath = '/' + normalizedPath;
        netSuitePath = netSuitePath.replace(/\/+/g, '/');
        return netSuitePath;
    }
    
    // Fallback: use rootPath configuration
    const rootPath = getCredential('rootPath', workspaceFolder) || '/SuiteScripts';
    
    // Remove leading slash if present
    if (normalizedPath.startsWith('/')) {
        normalizedPath = normalizedPath.substring(1);
    }
    
    // Combine with rootPath
    let netSuitePath = rootPath + '/' + normalizedPath;
    
    // Ensure leading slash
    if (!netSuitePath.startsWith('/')) {
        netSuitePath = '/' + netSuitePath;
    }
    
    // Clean up double slashes
    netSuitePath = netSuitePath.replace(/\/+/g, '/');
    
    return netSuitePath;
}

/**
 * Extension activation
 */
function activate(context) {
    console.log('NetSuite Auto-Upload extension is now active!');

    // Create output channel for logs
    outputChannel = vscode.window.createOutputChannel('NetSuite Auto-Upload');
    context.subscriptions.push(outputChannel);
    
    log('Extension activated');

    // Create status bar item
    uploadStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    uploadStatusBar.command = 'netsuite-auto-upload.showLogs';
    updateStatusBar('ready');
    uploadStatusBar.show();
    context.subscriptions.push(uploadStatusBar);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('netsuite-auto-upload.configure', configure),
        vscode.commands.registerCommand('netsuite-auto-upload.enable', enable),
        vscode.commands.registerCommand('netsuite-auto-upload.disable', disable),
        vscode.commands.registerCommand('netsuite-auto-upload.uploadCurrent', uploadCurrentFile),
        vscode.commands.registerCommand('netsuite-auto-upload.testConnection', testConnection),
        vscode.commands.registerCommand('netsuite-auto-upload.showLogs', () => outputChannel.show()),
        vscode.commands.registerCommand('netsuite-auto-upload.createEnvFile', () => createEnvTemplate(null))
    );

    // Initialize file watcher
    initializeWatcher(context);

    // Watch for .env file changes to clear cache
    const envWatcher = vscode.workspace.createFileSystemWatcher('**/.env*');
    envWatcher.onDidChange(() => clearEnvCache(null));
    envWatcher.onDidCreate(() => clearEnvCache(null));
    envWatcher.onDidDelete(() => clearEnvCache(null));
    context.subscriptions.push(envWatcher);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('netsuite-auto-upload')) {
                log('Configuration changed, reinitializing watcher');
                initializeWatcher(context);
            }
        })
    );

    // Only show setup notification if:
    // 1. No .env file exists AND
    // 2. No credentials in settings AND  
    // 3. This looks like a NetSuite project (has FileCabinet or manifest.xml)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceFolder = workspaceFolders[0];
        const wsPath = workspaceFolder.uri.fsPath;
        
        // Check if .env file exists
        const hasEnvFile = fs.existsSync(path.join(wsPath, '.env')) || 
                           fs.existsSync(path.join(wsPath, '.env.local')) ||
                           fs.existsSync(path.join(wsPath, '.netsuite.env'));
        
        // Check if this looks like a NetSuite project
        const isNetSuiteProject = fs.existsSync(path.join(wsPath, 'manifest.xml')) ||
                                   fs.existsSync(path.join(wsPath, 'src', 'manifest.xml')) ||
                                   fs.existsSync(path.join(wsPath, 'FileCabinet')) ||
                                   fs.existsSync(path.join(wsPath, 'src', 'FileCabinet'));
        
        // Only show notification if it's a NetSuite project without .env
        if (isNetSuiteProject && !hasEnvFile) {
            const restletUrl = getCredential('restletUrl', workspaceFolder);
            if (!restletUrl) {
                vscode.window.showInformationMessage(
                    'NetSuite Auto-Upload: Create a .env file with your credentials',
                    'Create .env',
                    'Don\'t show again'
                ).then(selection => {
                    if (selection === 'Create .env') {
                        createEnvTemplate(workspaceFolder);
                    }
                });
            }
        }
    }
}

/**
 * Update status bar with state
 */
function updateStatusBar(state, extra = '') {
    const states = {
        ready: { text: '$(cloud-upload) NS: Ready', tooltip: 'NetSuite Auto-Upload - Click for logs' },
        disabled: { text: '$(circle-slash) NS: Disabled', tooltip: 'NetSuite Auto-Upload (Disabled) - Click to show logs' },
        uploading: { text: '$(sync~spin) NS: Uploading...', tooltip: `Uploading ${extra}` },
        success: { text: '$(check) NS: Uploaded', tooltip: `Last upload: ${extra}` },
        error: { text: '$(error) NS: Failed', tooltip: extra || 'Upload failed - Click for logs' }
    };
    
    const s = states[state] || states.ready;
    uploadStatusBar.text = s.text;
    uploadStatusBar.tooltip = s.tooltip;
}

/**
 * Log message to output channel
 */
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ${message}`;
    if (data) {
        logMessage += '\n' + JSON.stringify(data, null, 2);
    }
    outputChannel.appendLine(logMessage);
}

/**
 * Initialize or reinitialize the file watcher
 */
function initializeWatcher(context) {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    const enabled = config.get('enabled');

    // Dispose existing watcher
    if (fileWatcher) {
        fileWatcher.dispose();
        fileWatcher = null;
    }

    if (!enabled) {
        updateStatusBar('disabled');
        log('Auto-upload disabled');
        return;
    }

    updateStatusBar('ready');
    log('Auto-upload enabled, watching for file saves');

    // Watch for file saves
    fileWatcher = vscode.workspace.onDidSaveTextDocument(document => {
        handleFileSave(document);
    });

    context.subscriptions.push(fileWatcher);
}

/**
 * Handle file save event
 */
function handleFileSave(document) {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    
    if (!config.get('enabled')) {
        return;
    }

    const filePath = document.fileName;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    
    if (!workspaceFolder) {
        log('File not in workspace, skipping: ' + filePath);
        return;
    }

    const wsPath = workspaceFolder.uri.fsPath;
    const relativePath = path.relative(wsPath, filePath).replace(/\\/g, '/');
    
    // Check if file is in the watch folder (default: src)
    const watchFolder = getCredential('watchFolder', workspaceFolder) || 'src';
    if (!relativePath.startsWith(watchFolder + '/') && relativePath !== watchFolder) {
        log(`File not in watch folder (${watchFolder}): ${relativePath}`);
        return;
    }

    // Check if file matches watch patterns
    const watchPatterns = config.get('watchPatterns') || [];
    const excludePatterns = config.get('excludePatterns') || [];
    
    // Get path relative to watch folder for pattern matching
    const pathInWatchFolder = relativePath.startsWith(watchFolder + '/') 
        ? relativePath.substring(watchFolder.length + 1)
        : relativePath;
    
    // Check exclusions first
    const isExcluded = excludePatterns.some(pattern => {
        try {
            return minimatch(pathInWatchFolder, pattern, { dot: true }) ||
                   minimatch(relativePath, pattern, { dot: true });
        } catch (e) {
            log('Invalid exclude pattern: ' + pattern);
            return false;
        }
    });
    
    if (isExcluded) {
        log('File excluded by pattern: ' + relativePath);
        return;
    }

    // Check inclusions
    const isIncluded = watchPatterns.some(pattern => {
        try {
            return minimatch(pathInWatchFolder, pattern, { dot: true }) ||
                   minimatch(relativePath, pattern, { dot: true });
        } catch (e) {
            log('Invalid watch pattern: ' + pattern);
            return false;
        }
    });

    if (!isIncluded) {
        log('File not matching watch patterns: ' + relativePath);
        return;
    }

    // Debounce the upload
    debounceUpload(document);
}

/**
 * Debounce file upload to avoid rapid consecutive uploads
 */
function debounceUpload(document) {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    const delay = config.get('debounceDelay') || 1000;
    const filePath = document.fileName;

    // Clear existing timer for this file
    if (debounceTimers.has(filePath)) {
        clearTimeout(debounceTimers.get(filePath));
    }

    // Set new timer
    const timer = setTimeout(() => {
        uploadFile(document);
        debounceTimers.delete(filePath);
    }, delay);

    debounceTimers.set(filePath, timer);
}

/**
 * Upload file to NetSuite
 */
async function uploadFile(document) {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    
    // Get RESTlet URL from .env or settings
    const restletUrl = getCredential('restletUrl', workspaceFolder);

    if (!restletUrl) {
        vscode.window.showErrorMessage(
            'NetSuite Auto-Upload: RESTlet URL not configured. Add NS_RESTLET_URL to .env file.',
            'Create .env Template'
        ).then(selection => {
            if (selection === 'Create .env Template') {
                createEnvTemplate(workspaceFolder);
            }
        });
        return;
    }

    const savedFilePath = document.fileName;
    
    if (!workspaceFolder) {
        log('File not in workspace, skipping upload');
        return;
    }
    
    // Resolve which file to actually upload (might be different if src→dist mapping)
    const uploadInfo = resolveUploadFile(savedFilePath, workspaceFolder);
    const fileName = path.basename(uploadInfo.uploadPath);
    
    // Check if mapped file exists (e.g., dist file after transpilation)
    if (uploadInfo.isMapped) {
        const waitForBuild = config.get('waitForBuild') || 500;
        
        if (waitForBuild > 0) {
            log(`Waiting ${waitForBuild}ms for build...`);
            await new Promise(resolve => setTimeout(resolve, waitForBuild));
        }
        
        if (!fs.existsSync(uploadInfo.uploadPath)) {
            const uploadFrom = config.get('uploadFrom') || 'src';
            vscode.window.showWarningMessage(
                `File not found in '${uploadFrom}' folder: ${path.basename(uploadInfo.uploadPath)}. Run your build or change 'uploadFrom' setting.`,
                'Show Settings'
            ).then(selection => {
                if (selection === 'Show Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'netsuite-auto-upload.uploadFrom');
                }
            });
            return;
        }
    }

    // Update status bar
    updateStatusBar('uploading', fileName);
    const mappedNote = uploadInfo.isMapped ? ` (from ${config.get('uploadFrom')})` : '';
    log(`Uploading: ${fileName}${mappedNote}`, { 
        savedFile: savedFilePath,
        uploadFile: uploadInfo.uploadPath,
        netSuitePath: uploadInfo.netSuitePath,
        isMapped: uploadInfo.isMapped
    });

    try {
        // Read file content from the resolved upload path
        const content = fs.readFileSync(uploadInfo.uploadPath, 'utf8');

        // Prepare payload
        const payload = {
            path: uploadInfo.netSuitePath,
            content: content,
            encoding: 'utf8',
            description: `Uploaded via Auto-Upload from ${uploadInfo.relativePath}`
        };

        // Make authenticated request
        const response = await makeAuthenticatedRequest(restletUrl, 'POST', payload, workspaceFolder);

        if (response.success) {
            // Success
            updateStatusBar('success', fileName);
            log(`Upload successful: ${fileName}`, response);
            
            // Track in history
            uploadHistory.unshift({
                file: fileName,
                localPath: uploadInfo.uploadPath,
                netSuitePath: uploadInfo.netSuitePath,
                time: new Date().toISOString(),
                action: response.action,
                fileId: response.fileId
            });
            if (uploadHistory.length > 50) uploadHistory.pop();
            
            // Show notification
            if (config.get('showNotifications')) {
                vscode.window.showInformationMessage(
                    `✓ ${fileName} → ${uploadInfo.netSuitePath}`
                );
            }

            // Reset status bar after 3 seconds
            setTimeout(() => {
                if (uploadStatusBar.text.includes('Uploaded')) {
                    updateStatusBar('ready');
                }
            }, 3000);

        } else {
            throw new Error(response.message || response.error || 'Upload failed');
        }

    } catch (error) {
        updateStatusBar('error', error.message);
        log(`Upload failed: ${fileName}`, { error: error.message, stack: error.stack });

        vscode.window.showErrorMessage(
            `NetSuite Upload Failed: ${error.message}`,
            'Retry',
            'Configure',
            'Show Logs'
        ).then(selection => {
            if (selection === 'Retry') {
                uploadFile(document);
            } else if (selection === 'Configure') {
                configure();
            } else if (selection === 'Show Logs') {
                outputChannel.show();
            }
        });

        // Reset status bar after 5 seconds
        setTimeout(() => {
            if (uploadStatusBar.text.includes('Failed')) {
                updateStatusBar('ready');
            }
        }, 5000);
    }
}

/**
 * Make authenticated request to NetSuite RESTlet
 */
async function makeAuthenticatedRequest(url, method = 'POST', payload = null, workspaceFolder = null) {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    const timeout = config.get('requestTimeout') || 30000;
    
    // Get OAuth credentials from .env or VS Code settings
    const consumerKey = getCredential('oauth.consumerKey', workspaceFolder);
    const consumerSecret = getCredential('oauth.consumerSecret', workspaceFolder);
    const tokenId = getCredential('oauth.tokenId', workspaceFolder);
    const tokenSecret = getCredential('oauth.tokenSecret', workspaceFolder);
    const accountId = getCredential('accountId', workspaceFolder);
    
    if (!consumerKey || !consumerSecret || !tokenId || !tokenSecret || !accountId) {
        throw new Error('OAuth credentials not configured. Add them to .env file or run Configure command.');
    }
    
    const oauth = OAuth({
        consumer: {
            key: consumerKey,
            secret: consumerSecret
        },
        signature_method: 'HMAC-SHA256',
        hash_function(base_string, key) {
            return crypto.HmacSHA256(base_string, key).toString(crypto.enc.Base64);
        }
    });

    const token = {
        key: tokenId,
        secret: tokenSecret
    };

    const requestData = {
        url: url,
        method: method
    };

    const oauthHeader = oauth.toHeader(oauth.authorize(requestData, token));
    
    // NetSuite requires realm in the Authorization header, not as separate header
    const authHeader = oauthHeader.Authorization.replace(
        'OAuth ',
        `OAuth realm="${accountId}",`
    );

    const urlParsed = new URL(url);

    return new Promise((resolve, reject) => {
        const options = {
            hostname: urlParsed.hostname,
            port: urlParsed.port || 443,
            path: urlParsed.pathname + urlParsed.search,
            method: method,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: timeout
        };

        log('Making request', { 
            url: url, 
            method: method,
            hostname: options.hostname 
        });

        const req = https.request(options, res => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                log('Response received', { 
                    statusCode: res.statusCode, 
                    dataLength: data.length 
                });
                
                try {
                    // Handle empty response
                    if (!data) {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true, message: 'Request completed' });
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: Empty response`));
                        }
                        return;
                    }
                    
                    const response = JSON.parse(data);
                    
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(response.message || response.error?.message || `HTTP ${res.statusCode}`));
                    }
                } catch (e) {
                    log('Parse error', { raw: data.substring(0, 500) });
                    reject(new Error(`Invalid response: ${data.substring(0, 100)}`));
                }
            });
        });

        req.on('error', error => {
            log('Request error', { error: error.message });
            reject(new Error(`Network error: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Request timeout after ${timeout}ms`));
        });

        if (payload) {
            const body = JSON.stringify(payload);
            req.setHeader('Content-Length', Buffer.byteLength(body));
            req.write(body);
        }
        
        req.end();
    });
}

/**
 * Command: Configure extension
 */
async function configure() {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');

    try {
        // Guide user through configuration
        const restletUrl = await vscode.window.showInputBox({
            prompt: 'Enter NetSuite RESTlet External URL',
            value: config.get('restletUrl') || '',
            placeHolder: 'https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1',
            validateInput: (value) => {
                if (!value) return 'URL is required';
                if (!value.startsWith('https://')) return 'URL must start with https://';
                if (!value.includes('restlet')) return 'URL should be a RESTlet URL';
                return null;
            }
        });

        if (restletUrl === undefined) return; // User cancelled

        const accountId = await vscode.window.showInputBox({
            prompt: 'Enter NetSuite Account ID (from URL or Setup > Company)',
            value: config.get('accountId') || '',
            placeHolder: '1234567 or 1234567_SB1 for sandbox',
            validateInput: (value) => {
                if (!value) return 'Account ID is required';
                return null;
            }
        });

        if (accountId === undefined) return;

        const consumerKey = await vscode.window.showInputBox({
            prompt: 'Enter OAuth Consumer Key (from Integration record)',
            value: config.get('oauth.consumerKey') || '',
            password: true,
            validateInput: (value) => {
                if (!value) return 'Consumer Key is required';
                return null;
            }
        });

        if (consumerKey === undefined) return;

        const consumerSecret = await vscode.window.showInputBox({
            prompt: 'Enter OAuth Consumer Secret',
            value: config.get('oauth.consumerSecret') || '',
            password: true,
            validateInput: (value) => {
                if (!value) return 'Consumer Secret is required';
                return null;
            }
        });

        if (consumerSecret === undefined) return;

        const tokenId = await vscode.window.showInputBox({
            prompt: 'Enter OAuth Token ID (from Access Token)',
            value: config.get('oauth.tokenId') || '',
            password: true,
            validateInput: (value) => {
                if (!value) return 'Token ID is required';
                return null;
            }
        });

        if (tokenId === undefined) return;

        const tokenSecret = await vscode.window.showInputBox({
            prompt: 'Enter OAuth Token Secret',
            value: config.get('oauth.tokenSecret') || '',
            password: true,
            validateInput: (value) => {
                if (!value) return 'Token Secret is required';
                return null;
            }
        });

        if (tokenSecret === undefined) return;

        // Optional: Root path configuration
        const rootPath = await vscode.window.showInputBox({
            prompt: 'Enter NetSuite root path for uploads (press Enter for default)',
            value: config.get('rootPath') || '/SuiteScripts',
            placeHolder: '/SuiteScripts'
        });

        // Save configuration
        const target = vscode.ConfigurationTarget.Workspace;
        
        await config.update('restletUrl', restletUrl, target);
        await config.update('accountId', accountId, target);
        await config.update('oauth.consumerKey', consumerKey, target);
        await config.update('oauth.consumerSecret', consumerSecret, target);
        await config.update('oauth.tokenId', tokenId, target);
        await config.update('oauth.tokenSecret', tokenSecret, target);
        if (rootPath) {
            await config.update('rootPath', rootPath, target);
        }

        log('Configuration saved successfully');

        const selection = await vscode.window.showInformationMessage(
            'NetSuite Auto-Upload configured successfully!',
            'Test Connection',
            'Done'
        );
        
        if (selection === 'Test Connection') {
            await testConnection();
        }
        
    } catch (error) {
        log('Configuration error', { error: error.message });
        vscode.window.showErrorMessage(`Configuration failed: ${error.message}`);
    }
}

/**
 * Command: Enable auto-upload
 */
async function enable() {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    await config.update('enabled', true, vscode.ConfigurationTarget.Workspace);
    log('Auto-upload enabled');
    vscode.window.showInformationMessage('NetSuite Auto-Upload enabled');
}

/**
 * Command: Disable auto-upload
 */
async function disable() {
    const config = vscode.workspace.getConfiguration('netsuite-auto-upload');
    await config.update('enabled', false, vscode.ConfigurationTarget.Workspace);
    log('Auto-upload disabled');
    vscode.window.showInformationMessage('NetSuite Auto-Upload disabled');
}

/**
 * Command: Upload current file
 */
async function uploadCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active file to upload');
        return;
    }

    await editor.document.save();
    await uploadFile(editor.document);
}

/**
 * Command: Test connection
 */
async function testConnection() {
    // Get active workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceFolder = workspaceFolders ? workspaceFolders[0] : null;
    
    const restletUrl = getCredential('restletUrl', workspaceFolder);

    if (!restletUrl) {
        vscode.window.showErrorMessage(
            'NetSuite Auto-Upload: RESTlet URL not configured. Add NS_RESTLET_URL to .env file.',
            'Create .env Template'
        ).then(selection => {
            if (selection === 'Create .env Template') {
                createEnvTemplate(workspaceFolder);
            }
        });
        return;
    }

    const statusMessage = vscode.window.setStatusBarMessage('$(sync~spin) Testing NetSuite connection...');

    try {
        log('Testing connection to: ' + restletUrl);
        
        // Use GET request for connection test (our enhanced RESTlet supports this)
        const response = await makeAuthenticatedRequest(restletUrl, 'GET', null, workspaceFolder);

        statusMessage.dispose();

        if (response.success) {
            log('Connection test successful', response);
            vscode.window.showInformationMessage(
                `✓ NetSuite connection successful! RESTlet v${response.version || '1.0'}`
            );
        } else {
            throw new Error(response.message || 'Unknown error');
        }
    } catch (error) {
        statusMessage.dispose();
        log('Connection test failed', { error: error.message });
        
        vscode.window.showErrorMessage(
            `Connection failed: ${error.message}`,
            'Show Logs',
            'Create .env Template'
        ).then(selection => {
            if (selection === 'Show Logs') {
                outputChannel.show();
            } else if (selection === 'Create .env Template') {
                createEnvTemplate(workspaceFolder);
            }
        });
    }
}

/**
 * Create .env template file in project root
 */
async function createEnvTemplate(workspaceFolder) {
    if (!workspaceFolder) {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        workspaceFolder = folders[0];
    }

    const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
    const envExamplePath = path.join(workspaceFolder.uri.fsPath, '.env.example');
    
    // Check if .env already exists
    if (fs.existsSync(envPath)) {
        const choice = await vscode.window.showWarningMessage(
            '.env file already exists. Open it?',
            'Open',
            'Create .env.example instead'
        );
        
        if (choice === 'Open') {
            const doc = await vscode.workspace.openTextDocument(envPath);
            await vscode.window.showTextDocument(doc);
            return;
        } else if (choice === 'Create .env.example instead') {
            // Continue to create .env.example
        } else {
            return;
        }
    }

    const template = `# ============================================
# NetSuite Auto-Upload Configuration
# ============================================
# Copy this file to .env and fill in your credentials
# IMPORTANT: Add .env to your .gitignore to keep credentials secure!
#
# This extension watches your source files and automatically
# uploads the corresponding built files to NetSuite File Cabinet.
# ============================================

# ============================================
# REQUIRED: NetSuite Authentication
# ============================================

# NetSuite Account ID
# Found in: Setup > Company > Company Information
# For sandbox accounts, add _SB1 suffix (e.g., 1234567_SB1)
NS_ACCOUNT_ID=

# RESTlet External URL
# Found in: Customization > Scripting > Scripts > [Your RESTlet] > Deployments
# Copy the "External URL" from the Script Deployment page
# Format: https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1
NS_RESTLET_URL=

# OAuth Consumer Key & Secret
# Found in: Setup > Integrations > Manage Integrations > [Your Integration]
# Create an Integration record if you don't have one, then copy the Consumer Key and Secret
NS_CONSUMER_KEY=
NS_CONSUMER_SECRET=

# OAuth Token ID & Secret
# Found in: Setup > Integrations > Manage Integrations > [Your Integration] > Access Tokens
# Create an Access Token with the following permissions:
#   - Documents & Files: Full
#   - SuiteScript: Full
NS_TOKEN_ID=
NS_TOKEN_SECRET=

# ============================================
# OPTIONAL: Upload Settings
# ============================================
# These settings control which folders are watched and uploaded.
# Leave empty to use defaults, or customize for your workflow.

# Folder to upload files FROM (default: dist)
# This is where your built/transpiled files are located.
# Examples:
#   - 'dist' for transpiled JavaScript/TypeScript
#   - 'build' for compiled files
#   - 'src' if uploading source files directly
NS_UPLOAD_FROM=dist

# Folder to watch for file saves (default: src)
# When you save a file in this folder, the extension will:
#   1. Find the corresponding file in NS_UPLOAD_FROM
#   2. Upload that file to NetSuite
# Examples:
#   - 'src' for source files (most common)
#   - 'source' if your source folder is named differently
NS_WATCH_FOLDER=src

# NetSuite root path in File Cabinet (default: /SuiteScripts)
# Files are uploaded relative to this path.
# Examples:
#   - '/SuiteScripts' for SuiteScript files
#   - '/SuiteApps' for SuiteApp files
#   - '/Templates' for template files
NS_ROOT_PATH=/SuiteScripts

# ============================================
# Example Workflow
# ============================================
# 1. Edit: src/SuiteScripts/myScript.js
# 2. Build process creates: dist/SuiteScripts/myScript.js
# 3. Extension uploads: dist/SuiteScripts/myScript.js → NetSuite
# 4. File appears in: SuiteScripts > SuiteScripts > myScript.js
#
# To upload source files directly (no build step):
#   NS_UPLOAD_FROM=src
#   NS_WATCH_FOLDER=src
# ============================================
`;

    const targetPath = fs.existsSync(envPath) ? envExamplePath : envPath;
    
    try {
        fs.writeFileSync(targetPath, template, 'utf8');
        
        // Add .env to .gitignore if it exists
        const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            const gitignore = fs.readFileSync(gitignorePath, 'utf8');
            if (!gitignore.includes('.env')) {
                fs.appendFileSync(gitignorePath, '\n# NetSuite credentials\n.env\n.env.local\n');
                log('Added .env to .gitignore');
            }
        }
        
        // Open the file
        const doc = await vscode.workspace.openTextDocument(targetPath);
        await vscode.window.showTextDocument(doc);
        
        vscode.window.showInformationMessage(
            `Created ${path.basename(targetPath)}. Fill in your NetSuite credentials.`
        );
        
        // Clear cache so new .env is picked up
        clearEnvCache(workspaceFolder);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create .env: ${error.message}`);
    }
}

/**
 * Extension deactivation
 */
function deactivate() {
    log('Extension deactivating');
    
    if (uploadStatusBar) {
        uploadStatusBar.dispose();
    }
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    if (outputChannel) {
        outputChannel.dispose();
    }
    debounceTimers.forEach(timer => clearTimeout(timer));
    debounceTimers.clear();
}

module.exports = {
    activate,
    deactivate
};
