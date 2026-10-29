// Twilio Function: /todoist  (visibility: PRIVATE — helpers only, not reachable by URL)
// Shared helpers for the other functions: Todoist tasks, Pushover alerts, contact lookup.
//
// Upload tip: name this function "todoist" (no ".private"). The other functions
// load it with Runtime.getFunctions()['todoist'].

// Creates a Todoist task. With alertNow, it sets a due time one minute out,
// so Todoist's free-plan "remind when due" sends a push notification.
exports.createTask = async (context, { content, description, projectId, priority, alertNow }) => {
  const body = {
    content,
    description: description || '',
    project_id: projectId || context.TODOIST_INBOX_ID,
    priority: priority || 4, // API: 4 = urgent (shows as P1 in the app)
  };

  if (alertNow) {
    const due = new Date(Date.now() + 60 * 1000);
    body.due_datetime = due.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  const res = await fetch('https://api.todoist.com/api/v1/tasks', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${context.TODOIST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Todoist ${res.status}: ${await res.text()}`);
  return res.json();
};

// Pushover alert. Returns true if sent, false if Pushover isn't configured.
// priority: 0 normal, 1 high (bypasses Pushover quiet hours).
exports.push = async (context, { title, message, priority, url, urlTitle }) => {
  if (!context.PUSHOVER_TOKEN || !context.PUSHOVER_USER) return false;
  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: context.PUSHOVER_TOKEN,
      user: context.PUSHOVER_USER,
      title: String(title || 'Clara').slice(0, 250),
      message: String(message || '(no details)').slice(0, 1024),
      priority: priority ?? 0,
      ...(url ? { url, url_title: urlTitle || 'Open' } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Pushover ${res.status}: ${await res.text()}`);
  return true;
};

// Alert via Pushover, and log the task in Todoist.
// If Pushover isn't set up or fails, fall back to the Todoist due-in-1-minute alert.
exports.alertAndLog = async (context, { title, message, priority, url, urlTitle }) => {
  let pushed = false;
  try {
    pushed = await exports.push(context, { title, message, priority, url, urlTitle });
  } catch (err) {
    console.error(err);
  }
  try {
    await exports.createTask(context, {
      content: title,
      description: url ? `${message}\n\n${url}` : message,
      priority: 4,
      alertNow: !pushed,
    });
  } catch (err) {
    console.error(err);
  }
  return pushed;
};

// CONTACT_NUMBERS format: "Mom:+15555550100,Partner:+15555550101"
exports.loadContacts = (context) => {
  const map = {};
  (context.CONTACT_NUMBERS || '').split(',').forEach((entry) => {
    const [name, num] = entry.includes(':') ? entry.split(':') : ['', entry];
    const n = exports.normalize(num);
    if (n) map[n] = name.trim() || n;
  });
  return map;
};

exports.normalize = (num) => {
  const digits = String(num || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : '';
};
