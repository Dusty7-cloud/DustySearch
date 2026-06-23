# DustySearch

DustySearch is a Windows desktop search and memory app built with Electron.

It helps you:

- Search local file names.
- Search text content from common files.
- Keep imported files and websites in a memory library.
- Open browser search result pages.
- Save useful results into the memory library.
- Use simple filters such as `type:pdf`, `ext:docx`, `tag:course`, and `cat:documents`.
- Save folder groups as workspaces and switch between them.
- Export and import a sync package for moving memory data between computers.
- Choose a cloud-drive folder, upload a shared sync file, and merge it on another computer.
- Save search history.
- Back up, restore, and export memory data.

## Data Location

User data is stored outside the app folder:

```text
%USERPROFILE%\Documents\DustySearchData
```

This keeps personal data separate from app updates.

## Run Locally

```powershell
npm install
npm start
```

## Self Check

```powershell
.\node_modules\electron\dist\electron.exe . --self-check
```

The self-check writes a report to:

```text
%USERPROFILE%\Documents\DustySearchData\self-check-result.json
```

The report now covers local name search, content search, memory search, OCR import,
result saving, workspaces, sync packages, cloud-drive folder sync, privacy settings,
backup, export, and data health.

## Cloud Folder Sync

DustySearch can use a local folder that is already synced by OneDrive, Dropbox,
Nutstore, a USB drive, or another cloud tool.

1. Open Settings.
2. Choose a cloud sync folder.
3. Click "Upload to cloud sync" on the computer with the newest memory library.
4. On another computer, choose the same synced folder and click "Merge from cloud sync".

The cloud sync file is named:

```text
DustySearch-cloud-sync.json
```

Merging creates a backup first, then combines memory items and workspaces.

## Install Locally

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-DustySearch.ps1
```

The local installed app is copied to:

```text
%LOCALAPPDATA%\DustySearchApp
```

The script also creates a desktop shortcut named `DustySearch`.

## Notes

- `node_modules`, release files, and temporary check folders are not committed.
- PDF, Word, and Excel support depends on the included parser libraries.
- Personal memory data should not be uploaded to GitHub.
