function doPost(event) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET');
  if (!expectedSecret) return jsonResponse({ success: false, error: 'Mailer secret is not configured.' });

  let request;
  try {
    request = JSON.parse(event.postData.contents);
  } catch (error) {
    return jsonResponse({ success: false, error: 'Invalid JSON request.' });
  }
  if (!request || request.secret !== expectedSecret) {
    return jsonResponse({ success: false, error: 'Unauthorized.' });
  }

  try {
    switch (request.action || 'sendEmail') {
      case 'sendEmail':
        return sendEmail(request);
      case 'saveProgress':
        return saveProgress(request);
      case 'recordVisit':
        return recordVisit(request);
      case 'getAnalytics':
        return getAnalytics();
      default:
        return jsonResponse({ success: false, error: 'Unsupported action.' });
    }
  } catch (error) {
    return jsonResponse({ success: false, error: String(error.message || error) });
  }
}

function sendEmail(request) {
  const to = String(request.to || '').trim();
  const subject = String(request.subject || '').trim();
  const body = String(request.text || '');
  const htmlBody = String(request.html || '');
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
    !subject ||
    !body ||
    subject.length > 250 ||
    body.length > 100000 ||
    htmlBody.length > 200000
  ) {
    return jsonResponse({ success: false, error: 'Invalid email fields.' });
  }

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: body,
    htmlBody: htmlBody || undefined,
    name: 'Капля Знаний'
  });
  return jsonResponse({ success: true });
}

function getSpreadsheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Spreadsheet ID is not configured.');
  return SpreadsheetApp.openById(spreadsheetId);
}

function getOrCreateSheet(name, headers) {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}

function saveProgress(request) {
  const recordId = String(request.recordId || '');
  const days = request.days;
  if (!/^[a-f0-9]{64}$/.test(recordId) || !Array.isArray(days) || days.length < 1 || days.length > 40) {
    return jsonResponse({ success: false, error: 'Invalid progress record.' });
  }
  const seenDays = {};
  for (const day of days) {
    if (
      !day || !Number.isInteger(day.day) || day.day < 1 || day.day > 40 ||
      !Number.isInteger(day.morning) || day.morning < -6 || day.morning > 6 ||
      !Number.isInteger(day.evening) || day.evening < -6 || day.evening > 6 ||
      seenDays[day.day]
    ) {
      return jsonResponse({ success: false, error: 'Invalid progress day.' });
    }
    seenDays[day.day] = true;
    if (JSON.stringify(day).length > 20000) {
      return jsonResponse({ success: false, error: 'Progress record is too large.' });
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet('ПЕГАС-40', ['Сохранено', 'Код участника', 'День', 'Запись']);
    days.forEach((day) => {
      const key = `${recordId}:${day.day}`;
      const lastRow = sheet.getLastRow();
      const keyRange = lastRow > 1 ? sheet.getRange(2, 2, lastRow - 1, 1) : null;
      const existing = keyRange ? keyRange.createTextFinder(key).matchEntireCell(true).findNext() : null;
      const row = [new Date(), key, day.day, JSON.stringify(day)];
      if (existing) sheet.getRange(existing.getRow(), 1, 1, row.length).setValues([row]);
      else sheet.appendRow(row);
    });
  } finally {
    lock.releaseLock();
  }
  return jsonResponse({ success: true });
}

function recordVisit(request) {
  const visit = request.visit || {};
  const page = String(visit.page || '');
  const referrer = String(visit.referrer || '');
  const source = String(visit.source || '');
  const device = String(visit.device || '');
  if (
    !/^\/[a-zA-Z0-9/_-]{0,120}$/.test(page) ||
    referrer.length > 200 ||
    source.length > 100 ||
    !['mobile', 'tablet', 'desktop'].includes(device)
  ) {
    return jsonResponse({ success: false, error: 'Invalid visit record.' });
  }

  const sheet = getOrCreateSheet('Посещаемость', ['Дата и время', 'Страница', 'Источник', 'Реферер', 'Устройство']);
  sheet.appendRow([new Date(), page, source || referrer || 'direct', referrer, device]);
  return jsonResponse({ success: true });
}

function getAnalytics() {
  const sheet = getOrCreateSheet('Посещаемость', ['Дата и время', 'Страница', 'Источник', 'Реферер', 'Устройство']);
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 5).getValues() : [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29);
  const timeZone = Session.getScriptTimeZone();
  const byDay = {};
  const byPage = {};
  const bySource = {};
  const byDevice = {};
  let total = 0;

  rows.forEach((row) => {
    const timestamp = row[0] instanceof Date ? row[0] : new Date(row[0]);
    if (isNaN(timestamp.getTime()) || timestamp < cutoff) return;
    const day = Utilities.formatDate(timestamp, timeZone, 'yyyy-MM-dd');
    const page = String(row[1] || '/');
    const source = String(row[2] || 'direct');
    const device = String(row[4] || 'unknown');
    byDay[day] = (byDay[day] || 0) + 1;
    byPage[page] = (byPage[page] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
    byDevice[device] = (byDevice[device] || 0) + 1;
    total += 1;
  });

  return jsonResponse({
    success: true,
    analytics: {
      total,
      days: byDay,
      pages: byPage,
      sources: bySource,
      devices: byDevice
    }
  });
}

function setupDailyCleanup() {
  const alreadyScheduled = ScriptApp.getProjectTriggers()
    .some((trigger) => trigger.getHandlerFunction() === 'cleanupExpiredData');
  if (!alreadyScheduled) {
    ScriptApp.newTrigger('cleanupExpiredData').timeBased().everyDays(1).create();
  }
}

function cleanupExpiredData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    deleteRowsOlderThan('ПЕГАС-40', ['Сохранено', 'Код участника', 'День', 'Запись'], cutoff);
    deleteRowsOlderThan('Посещаемость', ['Дата и время', 'Страница', 'Источник', 'Реферер', 'Устройство'], cutoff);
  } finally {
    lock.releaseLock();
  }
}

function deleteRowsOlderThan(name, headers, cutoff) {
  const sheet = getOrCreateSheet(name, headers);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const timestamps = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let index = timestamps.length - 1; index >= 0; index -= 1) {
    const timestamp = timestamps[index][0] instanceof Date
      ? timestamps[index][0]
      : new Date(timestamps[index][0]);
    if (!isNaN(timestamp.getTime()) && timestamp < cutoff) {
      sheet.deleteRow(index + 2);
    }
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
