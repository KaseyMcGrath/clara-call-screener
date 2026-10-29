# Call router: contacts get voicemail, everyone else gets Clara

A small Twilio Functions service that sits in front of Clara and decides who she talks to.

```
Incoming call
   │
   ├─ Number on your contact list ──► greeting + beep + recording
   │                                   └─► transcript ─► Pushover (high priority) + Todoist
   │
   └─ Anyone else ──► Clara (ElevenLabs register-call)
                        ├─ legit callback ─► /notify ─► Pushover (normal) + Todoist
                        └─ spam ─► call ended (no alert)

Clara unreachable?  ─► plain voicemail fallback
Pushover unreachable? ─► Todoist due-in-1-minute alert instead
```

## Why

Clara is great at screening spam, but family shouldn't have to talk to a voice agent. This keeps a normal voicemail experience for people you know, gets you an alert with the transcript on your phone, and leaves Clara on everyone else.

## Files

| Twilio path | File | Visibility | What it does |
|---|---|---|---|
| `/todoist` | `functions/todoist.private.js` | Private | Shared helpers: Todoist task, Pushover alert, contact lookup |
| `/incoming` | `functions/incoming.js` | Protected | Routes the call: voicemail for contacts, Clara for everyone else |
| `/voicemail-done` | `functions/voicemail-done.js` | Protected | Transcription callback: alerts you and logs the voicemail |
| `/notify` | `functions/notify.js` | Public (shared secret) | Clara's "legit callback" tool posts here |

When you add `todoist.private.js`, name the function `todoist`, without `.private`. The other functions look it up by that name.

## Setup

### 1. Pushover (optional, recommended)
- Copy your **User Key** from the Pushover dashboard.
- Create an Application and copy its **API Token**.
- Optional: set quiet hours in the app. Contact voicemails are high priority and still come through; Clara's callback alerts wait.

Without Pushover, alerts fall back to Todoist. For that to buzz your phone, set Todoist's default reminder to **when due** with push on.

### 2. Twilio Functions service
Console → Functions and Assets → Services → Create service (e.g. `clara-router`).

- **Settings → Dependencies:** Node 20 or newer. The code uses built-in `fetch`, so no npm modules are needed.
- Add the four functions from the table above. Choose **Function**, not Asset, when adding or uploading.

**Environment variables:**

| Key | Value |
|---|---|
| `TODOIST_TOKEN` | Todoist → Settings → Integrations → Developer → API token |
| `TODOIST_INBOX_ID` | Your Todoist Inbox project ID |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (Conversational AI scope) |
| `ELEVENLABS_AGENT_ID` | Your agent's ID |
| `CONTACT_NUMBERS` | `Mom:+15555550100,Partner:+15555550101` (comma-separated `Name:+1number`) |
| `CLARA_SHARED_SECRET` | Any long random string |
| `PUSHOVER_TOKEN` | Pushover application API token |
| `PUSHOVER_USER` | Pushover user key |
| `GREETING_URL` | *(optional)* URL of a recorded greeting mp3 (upload it as a Public asset) |
| `OWNER_NAME` | *(optional)* Name used in the stock greeting if no `GREETING_URL` |

Click **Deploy All**.

### 3. ElevenLabs
- Agent → Voice: TTS output format must be **μ-law 8000 Hz** for register-call.
- Agent → Tools → the "legit callback" tool:
  - URL: `https://<your-service>.twil.io/notify`
  - Header: `x-clara-key` = your `CLARA_SHARED_SECRET`
  - Body: `content` and `description` only. The function sets project, priority, and due time.

### 4. Point the number at the router
Twilio → Phone Numbers → your number → "A call comes in" → **Function** → your service → `/incoming`.

This takes the number off ElevenLabs' native Twilio routing; Clara now receives calls through register-call. The only thing lost is ElevenLabs-initiated call transfers.

### 5. Test
1. **A contact calls your cell and you decline.** They hear the greeting; an alert with the transcript arrives within about a minute.
2. **An unknown number calls.** Clara answers.
3. **Caller ID check.** If test 1 reached Clara, your carrier's forwarding isn't passing the original caller as `From`. Check Twilio → Monitor → Call logs.

## Security notes

- `/incoming` and `/voicemail-done` are **Protected**: Twilio signs the request, and anything unsigned is rejected.
- `/notify` has to be **Public** so ElevenLabs can reach it, so it checks a shared-secret header and returns 401 without it. Rotate the secret if it ever leaks.
- Recording links point to the Twilio Console, so playback requires your Twilio login. They are not public audio URLs.
- All tokens and numbers live in environment variables. Nothing sensitive is in the code.

## Known limitation: ringless voicemail

"Ringless" voicemail drops are delivered straight into the carrier's mailbox and never ring the phone, so call forwarding never sees them. The router can't intercept those. If your carrier allows it, disable carrier voicemail; otherwise, leaving the mailbox un-set-up blocks many drop services.
