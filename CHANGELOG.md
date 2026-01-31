# Changelog

All notable changes to this project will be documented in this file.

---

## [2.1.0] - 2026-01-31

### 🚀 Major Release

#### Features
- **`.env` file support** - Store credentials per-project, not in VS Code settings
- **Transpilation support** - Watch `src/`, upload from `dist/`
- **SDF/SuiteApp compatible** - Recognizes `FileCabinet/` structure automatically
- **Connection testing** - Verify setup with one command
- **Detailed logging** - Debug issues with output channel

#### RESTlet Improvements
- **Fixed file updates** - Uses `NameConflictResolution.OVERWRITE` to preserve file IDs
- **SuiteQL queries** - Efficient folder/file lookups
- **Auto-create folders** - Missing folders created automatically
- **GET endpoint** - For connection testing

#### Extension Improvements
- **`.env` auto-detection** - Credentials loaded from project root
- **File watcher** - Watches `src/` folder by default
- **Status bar** - Shows upload progress and status
- **Keyboard shortcut** - `Ctrl+Alt+U` for manual upload

---

## [1.0.0] - 2026-01-31

### Initial Release
- Basic file upload on save
- OAuth 1.0a authentication
- Status bar indicator
