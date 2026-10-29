// Twilio Function: /notify  (visibility: PUBLIC, guarded by a shared secret)
// Point Clara's "log legit callback" webhook tool here instead of straight at Todoist.
// Sends a Pushover alert and logs the Todoist task (falls back to a Todoist alert).
//
// ElevenLabs tool setup:
//   Method: POST   URL: https://<your-service>.twil.io/notify
//   Header: x-clara-key = <CLARA_SHARED_SECRET>
//   Body params (LLM-filled): content (string), description (string)

exports.handler = async function (context, event, callback) {
  const { alertAndLog } = require(Runtime.getFunctions()['todoist'].path);
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  const key = (event.request && event.request.headers && event.request.headers['x-clara-key']) || '';
  if (!context.CLARA_SHARED_SECRET || key !== context.CLARA_SHARED_SECRET) {
    response.setStatusCode(401);
    response.setBody({ ok: false });
    return callback(null, response);
  }

  // alertAndLog never throws; failures are logged in the Twilio console.
  await alertAndLog(context, {
    title: String(event.content || 'Call back (no details)').slice(0, 250),
    message: String(event.description || '').slice(0, 1000),
    priority: 0, // normal: Clara's messages respect Pushover quiet hours
  });
  response.setBody({ ok: true });
  return callback(null, response);
};
