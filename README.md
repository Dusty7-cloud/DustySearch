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
result saving, workspaces, sync packages, privacy settings, backup, export, and
data health.

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
