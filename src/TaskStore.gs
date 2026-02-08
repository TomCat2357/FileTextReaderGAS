/**
 * Task metadata management using PropertiesService.
 * Task structure:
 *   taskId, sourceUrl, parts, splitMode, ocrLanguage,
 *   status (queued|running|completed|failed),
 *   progress (0-100), partsTotal, partsDone,
 *   results [{partNo, status, url}],
 *   error {code, message},
 *   createdBy, createdAt, triggerId
 */

var TASK_PREFIX_ = "task_";

function generateTaskId_() {
  return "t_" + Utilities.getUuid().replace(/-/g, "").substring(0, 12);
}

function createTask_(params) {
  var taskId = generateTaskId_();
  var user = Session.getActiveUser().getEmail();
  var now = new Date().toISOString();

  var task = {
    taskId: taskId,
    sourceUrl: params.sourceUrl,
    parts: params.parts || 1,
    splitMode: params.splitMode || "equal",
    ocrLanguage: params.ocrLanguage || "ja",
    status: "queued",
    progress: 0,
    partsTotal: params.parts || 1,
    partsDone: 0,
    results: [],
    error: null,
    createdBy: user,
    createdAt: now
  };

  saveTask_(task);
  return task;
}

function getTask_(taskId) {
  var props = PropertiesService.getScriptProperties();
  var json = props.getProperty(TASK_PREFIX_ + taskId);
  if (!json) return null;
  return JSON.parse(json);
}

function saveTask_(task) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(TASK_PREFIX_ + task.taskId, JSON.stringify(task));
}

function updateTask_(taskId, updates) {
  var task = getTask_(taskId);
  if (!task) throw new Error("Task not found: " + taskId);

  for (var key in updates) {
    if (updates.hasOwnProperty(key)) {
      task[key] = updates[key];
    }
  }

  saveTask_(task);
  return task;
}
