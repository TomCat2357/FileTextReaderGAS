/**
 * Worker function for processing tasks asynchronously.
 * Uses LockService for concurrency control.
 * Splits extracted text into parts and saves results to Drive.
 */

function workerEntry(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return;
  }

  try {
    var task = findQueuedTask_();
    if (!task) {
      return;
    }
    processTask_(task.taskId);
  } catch (err) {
    Logger.log("Worker error: " + err.message);
  } finally {
    lock.releaseLock();
    cleanupTrigger_(e);
  }
}

function findQueuedTask_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();

  for (var key in all) {
    if (key.indexOf(TASK_PREFIX_) === 0) {
      try {
        var task = JSON.parse(all[key]);
        if (task.status === "queued") {
          return task;
        }
      } catch (ignored) {}
    }
  }
  return null;
}

function processTask_(taskId) {
  var task = getTask_(taskId);
  if (!task) return;

  updateTask_(taskId, { status: "running" });

  try {
    var text = readTextFromUrl(task.sourceUrl, { ocrLanguage: task.ocrLanguage });
    var parts = splitText_(text, task.partsTotal, task.splitMode);
    var results = [];

    for (var i = 0; i < parts.length; i++) {
      var partNo = i + 1;
      var url = savePartResult_(taskId, partNo, parts[i]);

      results.push({
        partNo: partNo,
        status: "done",
        url: url
      });

      updateTask_(taskId, {
        partsDone: partNo,
        progress: Math.round((partNo / task.partsTotal) * 100),
        results: results
      });
    }

    updateTask_(taskId, { status: "completed", progress: 100 });
  } catch (err) {
    updateTask_(taskId, {
      status: "failed",
      error: { code: "PROCESSING_ERROR", message: err.message }
    });
  }
}

function splitText_(text, partsCount, splitMode) {
  if (partsCount <= 1) {
    return [text];
  }

  if (splitMode === "page") {
    var pages = text.split(/\f/);
    if (pages.length >= partsCount) {
      var pagesPerPart = Math.ceil(pages.length / partsCount);
      var parts = [];
      for (var i = 0; i < partsCount; i++) {
        var start = i * pagesPerPart;
        var end = Math.min(start + pagesPerPart, pages.length);
        parts.push(pages.slice(start, end).join("\f"));
      }
      return parts;
    }
  }

  return splitTextEqual_(text, partsCount);
}

function splitTextEqual_(text, partsCount) {
  var lines = text.split("\n");
  var linesPerPart = Math.ceil(lines.length / partsCount);
  var parts = [];

  for (var i = 0; i < partsCount; i++) {
    var start = i * linesPerPart;
    var end = Math.min(start + linesPerPart, lines.length);
    if (start >= lines.length) {
      parts.push("");
    } else {
      parts.push(lines.slice(start, end).join("\n"));
    }
  }

  return parts;
}

function cleanupTrigger_(e) {
  if (!e || !e.triggerUid) return;

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getUniqueId() === e.triggerUid) {
      ScriptApp.deleteTrigger(triggers[i]);
      break;
    }
  }
}
