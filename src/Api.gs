/**
 * Web API endpoints for Task API.
 *
 * POST: Task creation (action: "createTask")
 * GET:  Task status retrieval (parameter: taskId)
 */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || "createTask";

    if (action === "createTask") {
      return handleCreateTask_(body);
    }

    return jsonResponse_({
      error: { code: "INVALID_ACTION", message: "Unknown action: " + action }
    });
  } catch (err) {
    return jsonResponse_({
      error: { code: "INTERNAL_ERROR", message: err.message }
    });
  }
}

function doGet(e) {
  try {
    var taskId = e.parameter.taskId;

    if (!taskId) {
      return jsonResponse_({
        error: { code: "MISSING_PARAM", message: "taskId is required" }
      });
    }

    var task = getTask_(taskId);
    if (!task) {
      return jsonResponse_({
        error: { code: "NOT_FOUND", message: "Task not found: " + taskId }
      });
    }

    // Verify the requester is the task owner
    var user = Session.getActiveUser().getEmail();
    if (task.createdBy !== user) {
      return jsonResponse_({
        error: { code: "FORBIDDEN", message: "Access denied" }
      });
    }

    return jsonResponse_({
      taskId: task.taskId,
      status: task.status,
      progress: task.progress,
      partsTotal: task.partsTotal,
      partsDone: task.partsDone,
      results: task.results,
      error: task.error
    });
  } catch (err) {
    return jsonResponse_({
      error: { code: "INTERNAL_ERROR", message: err.message }
    });
  }
}

function handleCreateTask_(body) {
  if (!body.sourceUrl) {
    return jsonResponse_({
      error: { code: "MISSING_PARAM", message: "sourceUrl is required" }
    });
  }

  var task = createTask_({
    sourceUrl: body.sourceUrl,
    parts: body.parts || 1,
    splitMode: body.splitMode || "equal",
    ocrLanguage: body.ocrLanguage || "ja"
  });

  // Create a time-based trigger to process the task asynchronously
  var trigger = ScriptApp.newTrigger("workerEntry")
    .timeBased()
    .after(1000)
    .create();

  updateTask_(task.taskId, { triggerId: trigger.getUniqueId() });

  return jsonResponse_({
    taskId: task.taskId,
    status: task.status,
    statusUrl: "?taskId=" + task.taskId
  });
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
