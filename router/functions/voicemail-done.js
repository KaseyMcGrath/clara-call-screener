// Twilio Function: /voicemail-done  (visibility: PROTECTED)
// Twilio calls this once a voicemail is transcribed.
// Sends a high-priority Pushover alert and logs a task in Todoist Inbox.

exports.handler = async function (context, event, callback) {
  const { alertAndLog } = require(Runtime.getFunctions()['todoist'].path);

  const name = event.name || event.From || 'Unknown caller';
  const text =
    event.TranscriptionStatus === 'completed' && event.TranscriptionText
      ? event.TranscriptionText
      : '(Transcription unavailable, listen to the recording.)';

  // Opens in Twilio Console (requires your login, so the audio stays private).
  const recordingLink = event.RecordingSid
    ? `https://console.twilio.com/us1/monitor/logs/call-recordings/${event.RecordingSid}`
    : '';

  await alertAndLog(context, {
    title: `Voicemail from ${name}`,
    message: text,
    priority: 1, // contacts break through Pushover quiet hours
    url: recordingLink,
    urlTitle: 'Listen to recording',
  });

  return callback(null, '');
};
