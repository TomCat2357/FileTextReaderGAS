/**
 * Result file management using Google Drive.
 * Part results are saved as text files in a dedicated folder.
 * Access is restricted to the file owner only (PRIVATE).
 */

var RESULT_FOLDER_NAME_ = "FileTextReaderGAS_Results";

function getOrCreateResultFolder_() {
  var folders = DriveApp.getFoldersByName(RESULT_FOLDER_NAME_);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(RESULT_FOLDER_NAME_);
}

function savePartResult_(taskId, partNo, text) {
  var folder = getOrCreateResultFolder_();
  var fileName = taskId + "_part" + partNo + ".txt";
  var file = folder.createFile(fileName, text, MimeType.PLAIN_TEXT);

  // Restrict access to owner only
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  return file.getUrl();
}
