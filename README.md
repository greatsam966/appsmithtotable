# Appsmith Table Copy

A Chrome Extension that adds **spreadsheet-style selection, copying, and table snapshot functionality** to Appsmith tables.

## 🚀 Features

### Spreadsheet-Style Selection

* Select individual cells.
* Drag across cells to select a range.
* Use **Shift + Click** for range selection.
* Use **Arrow Keys** to navigate between cells.
* Use **Ctrl + A / Cmd + A** to select the complete table.
* Automatically scroll while dragging near the table edges.

### 📋 Copy Appsmith Data

Selected table data can be copied directly to the clipboard in **TSV format**, making it easy to paste into:

* Google Sheets
* Microsoft Excel
* Other spreadsheet applications

### 📸 Table Snapshots

The extension also provides three image-copy options:

* **Selection** — Copy the selected cells as an image.
* **Visible Table** — Copy the currently visible table as an image.
* **Full Table** — Capture and stitch the complete scrollable table into a single image.

## 🛠️ Installation

The extension can be installed locally using Chrome's Developer Mode.

### Step 1 — Download the Repository

Clone or download this repository to your computer.

### Step 2 — Extract the Files

If you downloaded the repository as a ZIP file, extract/unzip it.

Make sure you select the folder containing files such as:

```text
manifest.json
content.js
background.js
style.css
```

### Step 3 — Open Chrome Extensions

Open Google Chrome and navigate to:

```text
chrome://extensions/
```

### Step 4 — Enable Developer Mode

Turn **Developer mode** ON using the toggle in the top-right corner.

### Step 5 — Load the Extension

Click:

**Load unpacked**

Then select the **extracted project folder**.

Chrome should now add **Appsmith Table Copy** to your extensions.

### Step 6 — Open Appsmith

Open or refresh the Appsmith page containing the table.

The extension will automatically detect the supported Appsmith table and add the **Table Copy** toolbar.

## 📖 How to Use

### Copying Table Data

1. Open an Appsmith table.
2. Select the required cells.
3. Press **Ctrl + C** / **Cmd + C**.
4. Paste the data into Google Sheets, Excel, or another spreadsheet application.

The extension converts the selected data into tab-separated values (TSV) before copying it to the clipboard.

### Taking a Selection Snapshot

1. Select the required cells.
2. Click **📷 Selection** from the toolbar.
3. The selected area will be copied as a PNG image to the clipboard.
4. Paste it wherever required.

### Copying the Visible Table

Click:

**📷 Visible Table**

This copies the currently visible Appsmith table area as an image.

### Copying the Full Table

Click:

**📷 Full Table**

The extension scrolls through the table, captures the required sections, and stitches them together into a single image.

> Note: Full-table capture is a best-effort feature and may take some time for very large tables.

## ⌨️ Keyboard Controls

| Action             | Shortcut               |
| ------------------ | ---------------------- |
| Navigate cells     | `Arrow Keys`           |
| Select range       | `Shift + Click`        |
| Select all         | `Ctrl + A` / `Cmd + A` |
| Clear selection    | `Esc`                  |
| Copy selected data | `Ctrl + C` / `Cmd + C` |

## 📁 Project Structure

```text
Appsmith Table Copy/
│
├── manifest.json
├── content.js
├── background.js
├── style.css
└── README.md
```

### `manifest.json`

Defines the Chrome Extension configuration, permissions, background service worker, and content scripts.

### `content.js`

Contains the main functionality including:

* Appsmith table detection
* Cell selection
* Keyboard navigation
* Clipboard copying
* Table snapshots
* Full-table screenshot stitching
* Toolbar creation

### `background.js`

Handles visible-tab screenshot capture requested by the content script.

### `style.css`

Contains the styling for:

* Cell selection
* Selection indicators
* Toolbar
* Buttons
* Toast notifications

## 🔐 Permissions

The extension currently uses the following Chrome permissions:

* `activeTab`
* `tabs`
* `clipboardWrite`

It also uses the required host permissions for running the content script on supported pages.

## 🔄 Updates

When a new version is released:

1. Download the latest repository/ZIP.
2. Extract the new version.
3. Go to `chrome://extensions/`.
4. Remove the previous version if required.
5. Click **Load unpacked**.
6. Select the new extracted folder.
7. Refresh the Appsmith page.

## 🚧 Upcoming Feature

### Direct Appsmith → Google Sheets Import

A new feature is currently under development that will allow users to **import Appsmith table data directly into Google Sheets in one go**.

The feature is currently in the **testing phase**.

The goal is also to explore an implementation that avoids additional **Google API service costs**, keeping the feature free and accessible for users.

## 🎯 Objective

The objective of **Appsmith Table Copy** is to make repetitive Appsmith data-handling tasks:

* Faster
* Easier
* Less manual
* More convenient for reporting and operational workflows

---

**Appsmith Table Copy**
*Making Appsmith data easier to work with.* 🚀
