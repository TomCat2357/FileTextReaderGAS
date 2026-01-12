/**
 * Reads text from a Google Docs/Sheets/PDF URL (or file ID).
 * For PDF, it converts the file to a temporary Google Doc via Drive API + OCR.
 *
 * @param {string} urlOrId Google Drive URL or file ID.
 * @param {Object} options Optional settings.
 * @param {string} options.ocrLanguage OCR language for PDF (default: "ja").
 * @return {string} Extracted text.
 */
function readTextFromUrl(urlOrId, options) {
  var fileId = extractFileId_(urlOrId);
  if (!fileId) {
    throw new Error("Could not extract file ID from: " + urlOrId);
  }

  var file = DriveApp.getFileById(fileId);
  var mimeType = file.getMimeType();

  if (mimeType === MimeType.GOOGLE_DOCS) {
    return readDocsText_(fileId);
  }
  if (mimeType === MimeType.GOOGLE_SHEETS) {
    return readSheetsText_(fileId);
  }
  if (mimeType === MimeType.PDF) {
    return readPdfText_(fileId, options);
  }
  // Microsoft Word (.docx, .doc)
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === MimeType.MICROSOFT_WORD) {
    return readWordText_(fileId);
  }

  throw new Error("Unsupported mimeType: " + mimeType);
}

function readDocsText_(fileId) {
  return DocumentApp.openById(fileId).getBody().getText();
}

function readSheetsText_(fileId) {
  var ss = SpreadsheetApp.openById(fileId);
  var sheets = ss.getSheets();
  var lines = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    lines.push("### " + sheet.getName());

    var values = sheet.getDataRange().getDisplayValues();
    for (var r = 0; r < values.length; r++) {
      lines.push(values[r].join("\t"));
    }

    if (i < sheets.length - 1) {
      lines.push("");
    }
  }

  return lines.join("\n");
}

function readPdfText_(fileId, options) {
  var ocrLanguage = (options && options.ocrLanguage) ? options.ocrLanguage : "ja";
  var tempTitle = "temp-ocr-" + new Date().getTime();

  var resource = {
    title: tempTitle,
    mimeType: MimeType.GOOGLE_DOCS
  };

  var params = {
    convert: true,
    ocr: true,
    ocrLanguage: ocrLanguage
  };

  var converted = Drive.Files.copy(resource, fileId, params);
  var text = DocumentApp.openById(converted.id).getBody().getText();

  // Clean up the temporary Google Doc.
  DriveApp.getFileById(converted.id).setTrashed(true);

  return text;
}

function readWordText_(fileId) {
  var tempTitle = "temp-word-" + new Date().getTime();

  var resource = {
    title: tempTitle,
    mimeType: MimeType.GOOGLE_DOCS
  };

  var converted = Drive.Files.copy(resource, fileId, { convert: true });
  var text = DocumentApp.openById(converted.id).getBody().getText();

  // Clean up the temporary Google Doc.
  DriveApp.getFileById(converted.id).setTrashed(true);

  return text;
}

function extractFileId_(input) {
  if (!input) {
    return null;
  }

  var patterns = [
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = input.match(patterns[i]);
    if (match) {
      return match[1];
    }
  }

  if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) {
    return input;
  }

  return null;
}

function testReadTextFromUrl() {
  var url = "https://docs.google.com/document/d/1eCF4SBJ-Zgh1hyPiYPP1FwN5UdwIxGao/edit";
  var text = readTextFromUrl(url, { ocrLanguage: "ja" });
  Logger.log(text);
}
