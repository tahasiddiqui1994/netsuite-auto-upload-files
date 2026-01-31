/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 */

/**
 * NetSuite Muhammad Taha Siddiqui
 * 
 * This RESTlet receives file uploads from your IDE and updates them in the File Cabinet.
 * Supports all file types and provides detailed error reporting.
 * 
 * IMPORTANT: Uses file.create() with conflictResolution.OVERWRITE to update existing files
 * while preserving the file ID and any dependent records (like Script records).
 * 
 * Deploy this as a RESTlet and note down the external URL.
 * 
 * @version 2.1.0
 * @author NetSuite Auto-Upload
 */

define(['N/file', 'N/error', 'N/search', 'N/record', 'N/runtime', 'N/query'], function(file, error, search, record, runtime, query) {
    
    // Configuration - customize these as needed
    const CONFIG = {
        // Default root folder for uploads (SuiteScripts = -15)
        defaultRootFolder: -15,
        // Allowed file extensions (empty array = allow all)
        allowedExtensions: [],
        // Maximum file size in bytes (5MB default)
        maxFileSize: 5 * 1024 * 1024,
        // Enable detailed logging
        debugMode: true
    };

    /**
     * GET handler - for connection testing and status checks
     */
    function get(context) {
        try {
            const user = runtime.getCurrentUser();
            
            return {
                success: true,
                message: 'NetSuite Auto-Upload RESTlet is active',
                version: '2.1.0',
                timestamp: new Date().toISOString(),
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role
                },
                config: {
                    defaultRootFolder: CONFIG.defaultRootFolder,
                    maxFileSize: CONFIG.maxFileSize
                }
            };
        } catch (e) {
            log.error('GET Error', e.toString());
            return {
                success: false,
                error: 'CONNECTION_TEST_FAILED',
                message: e.message || e.toString()
            };
        }
    }

    /**
     * POST handler - receives file upload requests
     * 
     * Expected payload:
     * {
     *   "path": "/SuiteScripts/MyFolder/myfile.js",
     *   "content": "file content as string",
     *   "encoding": "utf8" (optional, defaults to utf8),
     *   "folder": "12345" (optional, internal ID of folder),
     *   "description": "File description" (optional)
     * }
     */
    function post(context) {
        const startTime = Date.now();
        
        try {
            logDebug('Auto-Upload Request', 'Received upload request');
            
            // Validate request
            const validation = validateRequest(context);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    message: validation.message
                };
            }
            
            const filePath = sanitizePath(context.path);
            const content = context.content;
            const encoding = context.encoding || 'utf8';
            const description = context.description || 'Uploaded via Auto-Upload';
            
            logDebug('Processing Upload', {
                path: filePath,
                encoding: encoding,
                contentLength: content.length
            });
            
            // Parse path to get folder and filename
            const pathParts = parseFilePath(filePath);
            const fileName = pathParts.fileName;
            const folderPath = pathParts.folderPath;
            
            // Validate file extension
            if (CONFIG.allowedExtensions.length > 0) {
                const ext = fileName.split('.').pop().toLowerCase();
                if (!CONFIG.allowedExtensions.includes(ext)) {
                    return {
                        success: false,
                        error: 'INVALID_EXTENSION',
                        message: `File extension .${ext} is not allowed`
                    };
                }
            }
            
            // Determine file type from extension
            const fileType = getFileType(fileName);
            
            // Try to find existing file by full path
            const existingFile = findFileByFullPath(filePath, folderPath, fileName);
            let savedFileId;
            let action;
            
            if (existingFile) {
                // UPDATE EXISTING FILE
                // Use file.create() with conflictResolution.OVERWRITE
                // This replaces the content while PRESERVING the file ID!
                logDebug('Updating Existing File', { 
                    fileId: existingFile.id, 
                    folderId: existingFile.folderId,
                    fileName: fileName 
                });
                
                // Create new file object with same name and folder
                const fileObj = file.create({
                    name: fileName,
                    fileType: fileType,
                    folder: existingFile.folderId,
                    contents: content,
                    description: description,
                    encoding: encoding === 'base64' ? file.Encoding.BASE_64 : file.Encoding.UTF_8,
                    // This is the KEY - OVERWRITE replaces content but keeps the same file ID!
                    conflictResolution: file.NameConflictResolution.OVERWRITE
                });
                
                savedFileId = fileObj.save();
                action = 'update';
                
                logDebug('File Updated Successfully', { 
                    originalId: existingFile.id,
                    savedId: savedFileId,
                    idsMatch: existingFile.id === savedFileId
                });
                
            } else {
                // CREATE NEW FILE
                logDebug('Creating New File', 'Path: ' + filePath);
                
                // Find or create folder structure
                const folderId = context.folder ? parseInt(context.folder, 10) : findOrCreateFolderPath(folderPath);
                
                const fileObj = file.create({
                    name: fileName,
                    fileType: fileType,
                    folder: folderId,
                    contents: content,
                    description: description,
                    encoding: encoding === 'base64' ? file.Encoding.BASE_64 : file.Encoding.UTF_8
                });
                
                savedFileId = fileObj.save();
                action = 'create';
                
                logDebug('File Created Successfully', { 
                    fileId: savedFileId,
                    folder: folderId 
                });
            }
            
            const duration = Date.now() - startTime;
            
            log.audit('Upload Success', {
                fileId: savedFileId,
                path: filePath,
                action: action,
                duration: duration + 'ms'
            });
            
            return {
                success: true,
                message: `File ${action}d successfully`,
                fileId: savedFileId,
                path: filePath,
                action: action,
                duration: duration
            };
            
        } catch (e) {
            log.error('Upload Error', {
                error: e.toString(),
                stack: e.stack,
                path: context.path
            });
            
            return {
                success: false,
                error: e.name || 'UNKNOWN_ERROR',
                message: e.message || e.toString(),
                details: {
                    path: context.path,
                    type: e.type,
                    code: e.code
                }
            };
        }
    }

    /**
     * DELETE handler - delete a file
     */
    function doDelete(context) {
        try {
            if (!context.path && !context.fileId) {
                return {
                    success: false,
                    error: 'MISSING_IDENTIFIER',
                    message: 'File path or fileId is required'
                };
            }

            let fileId;
            
            if (context.fileId) {
                fileId = parseInt(context.fileId, 10);
            } else {
                const filePath = sanitizePath(context.path);
                const pathParts = parseFilePath(filePath);
                const existingFile = findFileByFullPath(filePath, pathParts.folderPath, pathParts.fileName);
                
                if (!existingFile) {
                    return {
                        success: false,
                        error: 'FILE_NOT_FOUND',
                        message: 'File not found: ' + context.path
                    };
                }
                fileId = existingFile.id;
            }

            file.delete({ id: fileId });

            return {
                success: true,
                message: 'File deleted successfully',
                fileId: fileId
            };

        } catch (e) {
            log.error('Delete Error', e.toString());
            return {
                success: false,
                error: e.name || 'DELETE_ERROR',
                message: e.message || e.toString()
            };
        }
    }

    /**
     * Validate the incoming request
     */
    function validateRequest(context) {
        if (!context.path) {
            return {
                valid: false,
                error: 'MISSING_PATH',
                message: 'File path is required'
            };
        }
        
        if (context.content === undefined || context.content === null) {
            return {
                valid: false,
                error: 'MISSING_CONTENT',
                message: 'File content is required'
            };
        }
        
        // Check file size
        const contentSize = context.content.length;
        if (contentSize > CONFIG.maxFileSize) {
            return {
                valid: false,
                error: 'FILE_TOO_LARGE',
                message: `File size (${contentSize} bytes) exceeds maximum allowed (${CONFIG.maxFileSize} bytes)`
            };
        }
        
        // Validate path format
        if (context.path.includes('..')) {
            return {
                valid: false,
                error: 'INVALID_PATH',
                message: 'Path traversal (..) is not allowed'
            };
        }
        
        return { valid: true };
    }

    /**
     * Sanitize file path
     */
    function sanitizePath(filePath) {
        let cleanPath = filePath.trim();
        cleanPath = cleanPath.replace(/\\/g, '/');
        cleanPath = cleanPath.replace(/\/+/g, '/');
        
        if (!cleanPath.startsWith('/')) {
            cleanPath = '/' + cleanPath;
        }
        
        return cleanPath;
    }

    /**
     * Parse file path into folder and filename
     */
    function parseFilePath(filePath) {
        const cleanPath = filePath.replace(/^\/+/, '');
        const parts = cleanPath.split('/');
        const fileName = parts.pop();
        const folderPath = parts.join('/');
        
        return {
            fileName: fileName,
            folderPath: folderPath || '',
            fullPath: cleanPath
        };
    }

    /**
     * Determine NetSuite file type from extension
     */
    function getFileType(fileName) {
        const extension = fileName.split('.').pop().toLowerCase();
        
        const typeMap = {
            // Scripts
            'js': file.Type.JAVASCRIPT,
            'ts': file.Type.JAVASCRIPT,
            
            // Web files
            'html': file.Type.HTMLDOC,
            'htm': file.Type.HTMLDOC,
            'css': file.Type.STYLESHEET,
            'scss': file.Type.PLAINTEXT,
            'less': file.Type.PLAINTEXT,
            
            // Data files
            'xml': file.Type.XMLDOC,
            'json': file.Type.JSON,
            'txt': file.Type.PLAINTEXT,
            'csv': file.Type.CSV,
            'xls': file.Type.EXCEL,
            'xlsx': file.Type.EXCEL,
            
            // Documents
            'pdf': file.Type.PDF,
            'doc': file.Type.WORD,
            'docx': file.Type.WORD,
            
            // Images
            'png': file.Type.PNGIMAGE,
            'jpg': file.Type.JPGIMAGE,
            'jpeg': file.Type.JPGIMAGE,
            'gif': file.Type.GIFIMAGE,
            'svg': file.Type.SVGIMAGE,
            'ico': file.Type.ICON,
            'bmp': file.Type.BMPIMAGE,
            
            // Archives
            'zip': file.Type.ZIP,
            'gzip': file.Type.GZIP,
            'tar': file.Type.TAR,
            
            // Other
            'mp3': file.Type.MP3,
            'mp4': file.Type.MP4,
            'mov': file.Type.MOV,
            'ppt': file.Type.POWERPOINT,
            'pptx': file.Type.POWERPOINT,
            'ftl': file.Type.FREEMARKER
        };
        
        return typeMap[extension] || file.Type.PLAINTEXT;
    }

    /**
     * Find existing file by full path (folder + name) using SuiteQL
     */
    function findFileByFullPath(filePath, folderPath, fileName) {
        try {
            // First, find the folder
            const folderId = findFolderByPath(folderPath);
            
            if (!folderId) {
                logDebug('Folder Not Found', folderPath);
                return null;
            }
            
            // Use SuiteQL to search for file in that specific folder
            const sql = `
                SELECT id, name, folder 
                FROM File 
                WHERE name = ? AND folder = ?
            `;
            
            const results = query.runSuiteQL({
                query: sql,
                params: [fileName, folderId]
            }).asMappedResults();
            
            if (results && results.length > 0) {
                return {
                    id: results[0].id,
                    name: results[0].name,
                    folderId: folderId
                };
            }
            
            return null;
            
        } catch (e) {
            logDebug('File Search Error', e.toString());
            return null;
        }
    }

    /**
     * Find folder by path using a single SuiteQL query with dynamic JOINs
     */
    function findFolderByPath(folderPath) {
        if (!folderPath) {
            return CONFIG.defaultRootFolder;
        }
        
        try {
            // Normalize path and split into parts
            let normalizedPath = folderPath.replace(/\\/g, '/').replace(/\/+/g, '/');
            normalizedPath = normalizedPath.replace(/^\/+|\/+$/g, '');
            
            const parts = normalizedPath.split('/').filter(p => p && p.trim() !== '');
            
            // Skip "SuiteScripts" if it's the first part (we're already in SuiteScripts root)
            if (parts.length > 0 && parts[0].toLowerCase() === 'suitescripts') {
                parts.shift();
                logDebug('Skipped SuiteScripts prefix', { remainingParts: parts });
            }
            
            // If no parts left after removing SuiteScripts, return root folder
            if (parts.length === 0) {
                return CONFIG.defaultRootFolder;
            }
            
            // Build a single query with JOINs for the folder hierarchy
            let sql = 'SELECT f' + parts.length + '.id as id FROM MediaItemFolder f1';
            const params = [];
            
            // Add JOINs for each subsequent folder level
            for (let i = 1; i < parts.length; i++) {
                sql += ` INNER JOIN MediaItemFolder f${i + 1} ON f${i + 1}.parent = f${i}.id AND f${i + 1}.name = ?`;
                params.push(parts[i]);
            }
            
            // Add WHERE clause for the first folder (under SuiteScripts root)
            sql += ' WHERE f1.parent = ? AND f1.name = ?';
            params.push(CONFIG.defaultRootFolder);
            params.push(parts[0]);
            
            logDebug('Folder Query', { sql: sql, params: params });
            
            const results = query.runSuiteQL({
                query: sql,
                params: params
            }).asMappedResults();
            
            if (results && results.length > 0 && results[0].id) {
                logDebug('Found Folder via Single Query', { 
                    folderId: results[0].id, 
                    path: parts.join('/') 
                });
                return results[0].id;
            }
            
            logDebug('Folder Not Found', { path: parts.join('/') });
            return null;
            
        } catch (e) {
            logDebug('Folder Search Error', {
                error: e.toString(),
                message: e.message,
                folderPath: folderPath
            });
            return null;
        }
    }

    /**
     * Find or create folder path
     */
    function findOrCreateFolderPath(folderPath) {
        if (!folderPath) {
            return CONFIG.defaultRootFolder;
        }
        
        try {
            // Normalize path and split into parts
            let normalizedPath = folderPath.replace(/\\/g, '/').replace(/\/+/g, '/');
            normalizedPath = normalizedPath.replace(/^\/+|\/+$/g, '');
            
            const parts = normalizedPath.split('/').filter(p => p && p.trim() !== '');
            
            // Skip "SuiteScripts" if it's the first part
            if (parts.length > 0 && parts[0].toLowerCase() === 'suitescripts') {
                parts.shift();
                logDebug('Skipped SuiteScripts prefix in create', { remainingParts: parts });
            }
            
            if (parts.length === 0) {
                return CONFIG.defaultRootFolder;
            }
            
            // First, try to find the complete path with a single query
            const existingFolderId = findFolderByPath(parts.join('/'));
            if (existingFolderId) {
                logDebug('Found Complete Path', { folderId: existingFolderId });
                return existingFolderId;
            }
            
            // Path doesn't fully exist, find all folders with matching names
            const sql = `
                SELECT id, name, parent 
                FROM MediaItemFolder 
                WHERE name IN (${parts.map(() => '?').join(',')})
            `;
            
            const allFolders = query.runSuiteQL({
                query: sql,
                params: parts
            }).asMappedResults();
            
            // Build a map of folders by parent for quick lookup
            const foldersByParent = {};
            allFolders.forEach(f => {
                if (!foldersByParent[f.parent]) {
                    foldersByParent[f.parent] = {};
                }
                foldersByParent[f.parent][f.name] = f.id;
            });
            
            // Traverse the path, creating folders as needed
            let currentFolderId = CONFIG.defaultRootFolder;
            
            for (const folderName of parts) {
                if (foldersByParent[currentFolderId] && foldersByParent[currentFolderId][folderName]) {
                    currentFolderId = foldersByParent[currentFolderId][folderName];
                    logDebug('Found Existing Folder', { name: folderName, id: currentFolderId });
                } else {
                    // Create folder
                    const folderRecord = record.create({
                        type: record.Type.FOLDER
                    });
                    folderRecord.setValue({ fieldId: 'name', value: folderName });
                    folderRecord.setValue({ fieldId: 'parent', value: currentFolderId });
                    
                    currentFolderId = folderRecord.save();
                    logDebug('Created Folder', { name: folderName, id: currentFolderId });
                    
                    // Add to our map for subsequent lookups
                    if (!foldersByParent[currentFolderId]) {
                        foldersByParent[currentFolderId] = {};
                    }
                }
            }
            
            return currentFolderId;
            
        } catch (e) {
            log.error('Folder Creation Error', {
                error: e.toString(),
                message: e.message,
                folderPath: folderPath
            });
            return CONFIG.defaultRootFolder;
        }
    }

    /**
     * Debug logging helper
     */
    function logDebug(title, details) {
        if (CONFIG.debugMode) {
            log.debug(title, typeof details === 'object' ? JSON.stringify(details) : details);
        }
    }

    return {
        get: get,
        post: post,
        delete: doDelete
    };
    
});