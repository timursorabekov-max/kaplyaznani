function doPost(event) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty('MAILER_SECRET');
  if (!expectedSecret) {
    return jsonResponse({ success: false, error: 'Mailer secret is not configured.' });
  }

  let request;
  try {
    request = JSON.parse(event.postData.contents);
  } catch (error) {
    return jsonResponse({ success: false, error: 'Invalid JSON request.' });
  }

  if (!request || request.secret !== expectedSecret) {
    return jsonResponse({ success: false, error: 'Unauthorized.' });
  }

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

  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      htmlBody: htmlBody || undefined,
      name: 'Капля Знаний'
    });
    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ success: false, error: String(error.message || error) });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
