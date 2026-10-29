// Twilio Function: /incoming  (visibility: PROTECTED — only Twilio can call it)
// Set this as the Twilio number's "A call comes in" handler.
//
// Contacts      -> plain voicemail (greeting, beep, record, transcribe).
// Everyone else -> Clara, via ElevenLabs register-call.
// Clara down    -> plain voicemail fallback, so nothing is lost.

exports.handler = async function (context, event, callback) {
  const { loadContacts, normalize } = require(Runtime.getFunctions()['todoist'].path);

  // On a carrier-forwarded call, Twilio usually passes the original caller in From.
  // Test this with a real contact before trusting it.
  const caller = normalize(event.From);
  const contacts = loadContacts(context);
  const twiml = new Twilio.twiml.VoiceResponse();

  if (contacts[caller]) {
    if (context.GREETING_URL) {
      twiml.play(context.GREETING_URL); // your own recorded greeting (mp3 asset)
    } else {
      const who = context.OWNER_NAME ? `you've reached ${context.OWNER_NAME}` : "you've reached me";
      twiml.say(
        { voice: 'Polly.Joanna' },
        `Hi, ${who}. I can't get to the phone, leave a message after the beep and I'll call you back.`
      );
    }
    twiml.record({
      maxLength: 180,
      playBeep: true,
      timeout: 5,
      finishOnKey: '#',
      transcribe: true,
      transcribeCallback: `/voicemail-done?name=${encodeURIComponent(contacts[caller])}`,
    });
    twiml.say({ voice: 'Polly.Joanna' }, 'Thanks, bye!');
    return callback(null, twiml);
  }

  // Unknown caller: hand to Clara.
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
      method: 'POST',
      headers: {
        'xi-api-key': context.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: context.ELEVENLABS_AGENT_ID,
        from_number: event.From,
        to_number: event.To,
        direction: 'inbound',
      }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);

    const xml = await res.text();
    const response = new Twilio.Response();
    response.appendHeader('Content-Type', 'text/xml');
    response.setBody(xml);
    return callback(null, response);
  } catch (err) {
    // If Clara is down, fall back to a plain voicemail so nothing is lost.
    console.error(err);
    twiml.say({ voice: 'Polly.Joanna' }, 'Please leave a message after the beep.');
    twiml.record({
      maxLength: 120,
      playBeep: true,
      transcribe: true,
      transcribeCallback: '/voicemail-done?name=Unknown%20caller',
    });
    return callback(null, twiml);
  }
};
