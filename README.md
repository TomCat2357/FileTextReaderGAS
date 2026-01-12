# FileTextReaderGAS

Google Apps Script project to read text from Google Docs, Sheets, and PDFs by URL.

## Setup (clasp)

1) Create a new Apps Script project and link it to this folder:

```bash
clasp create --title "FileTextReaderGAS" --type standalone --rootDir src
```

2) Push the code:

```bash
clasp push
```

3) In the Apps Script editor:
- Enable **Advanced Google services** > **Drive API**.
- In Google Cloud Console, enable **Google Drive API** for the same project.

## Usage

Run `testReadTextFromUrl()` and replace `PASTE_URL_OR_ID` with:
- Google Docs URL
- Google Sheets URL
- Google Drive file URL (PDF)
- Or a file ID

For PDF OCR language, pass `{ ocrLanguage: "ja" }` or another code like `"en"`.
