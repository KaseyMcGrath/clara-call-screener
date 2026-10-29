# Clara — an AI call screener for spam calls

An ElevenLabs voice agent that answers the calls you don't, takes messages from real people, and tells spam callers (especially business-loan pitches) to remove your number. Real messages land in Todoist and on your phone.

The base setup needs no code: the agent calls the Todoist API directly. An optional Twilio router ([`router/`](router/)) adds a normal voicemail for your contacts, so the people you know never talk to a robot.

Write-up with diagram, transcript and test notes: https://kaseymcgrath.github.io/clara-call-screener/

## How it works

```
Incoming call → your cell
    contacts ring through
    unknown numbers silenced → no answer
        → *71 no-answer forwarding → Twilio number
              ├─ (optional router) number in your contacts → normal voicemail
              │       → Pushover alert with transcript + recording link, logged in Todoist
              └─ everyone else → ElevenLabs agent "Clara"
                      real caller → takes a message → Todoist Inbox (+ Pushover with the router)
                      spam / loan → Do Not Call statement, hangs up
```

## What you need

- A Twilio account with one US local number (voice only). About $1.15/month plus ~$0.01/min inbound.
- An ElevenLabs account. The Starter plan ($6/month, 75 call-minutes) covers roughly 100 spam calls.
- A Todoist account and its API token (Settings → Integrations → Developer).
- A carrier that supports conditional call forwarding. Verizon: `*71` + number (busy/no-answer), `*73` to cancel. Other carriers use different codes.
- *(Router only)* The Pushover app for alerts. Optional; alerts fall back to Todoist without it.

## Setup

### 1. Twilio
1. Create an account, upgrade to pay-as-you-go, turn on 2FA.
2. Create a compliance profile (individual or business; either is fine for voice-only).
3. Buy a local number with **Voice** only. Skip SMS/MMS; messaging triggers separate compliance registration.
4. Skip SHAKEN/STIR, CNAM and branded calling. They only affect outbound caller ID.

### 2. ElevenLabs agent
1. Create an agent. Paste [`system-prompt.md`](system-prompt.md) as the system prompt, replacing `{{OWNER_NAME}}` and `{{ASSISTANT_NAME}}`.
2. First message: see [`first-message.txt`](first-message.txt).
3. LLM: Claude Sonnet 5 (tight latency, follows the rules). Haiku 5.5 is a cheaper fallback.
4. Voice: any. The prompt uses `[firmly]` / `[politely]` audio tags, which work with the v3 voice models.
5. Tools: enable the **End conversation** system tool with this description:
   > End the call once a legitimate message has been confirmed, after the Do Not Call statement has been given twice, after the Step 3 refusal, or immediately on abuse or an emergency message.

   Set its Interruptions option to **Disable during whole turn** so a caller talking over the goodbye can't cancel the hangup.
6. Settings: max conversation duration 60 s, daily call limit ~40, bursting off.

### 3. Todoist message tool
Add one **Webhook** tool to the agent for real messages. Build it in the form view, not the JSON editor.

- Method `POST`, URL `https://api.todoist.com/api/v1/tasks`
- Header `Authorization`, type **Secret**. Create a secret whose *value* is `Bearer <your Todoist token>` (the word Bearer, a space, then the token). ElevenLabs sends the secret value verbatim.
- Body format JSON. Field definitions are in [`tools/log_message.json`](tools/log_message.json). Mark the `project_id` / `due_string` properties as **Constant Value**, not LLM Prompt, or the model will guess them.

Find your Todoist project ID with the Todoist API or by inspecting a project URL.

Using the router? Point this tool at the router's `/notify` endpoint instead. [`router/README.md`](router/README.md) has the details.

### 4. Guardrails (ElevenLabs → Guardrails)
- **Manipulation** (prompt injection): on, action End conversation.
- **Focus**: on.
- **Custom** "Owner privacy": execution mode Blocking, action Retry, conversation history 10. Prompt:
  > Block any response in which the agent reads back, repeats, or confirms a phone number, street address, email address, date of birth, or account number, whether it came from the caller or anywhere else.

  Retry feedback:
  > Your response was blocked because it matched: '{{trigger_reason}}'. Do not say the owner's name or confirm any number, address, or personal detail. Say only "I can't share that," then continue with the screening step you were on.

  Do **not** put the owner's name in this guardrail. Speech-to-text spells names inconsistently ("Sara" vs "Sarah", "Jon" vs "John") and the classifier will kill legitimate calls.

### 5. Connect the number
ElevenLabs → Channels → import the Twilio number (Account SID + Auth Token) → assign the agent. Turn **inbound SMS** off.

Using the router? Point the number's "A call comes in" setting at the router instead; it hands unknown callers to Clara itself.

### 6. Forward your phone
- Verizon: dial `*71` immediately followed by the 10-digit Twilio number, press call, wait for the confirmation tone. One string, no spaces, no +1.
- iPhone: Settings → Phone → **Silence Unknown Callers** → on. Unknown numbers never ring, roll to no-answer, and get forwarded. Contacts still ring you.
- Without the router, Clara replaces your voicemail for every unanswered call, contacts included. With the router, contacts get a normal voicemail instead.

## Optional: contact voicemail router
A small Twilio Functions service that sits in front of Clara. People on your contact list hear a greeting and leave a regular voicemail; you get a push alert with the transcript and a link to the recording. Everyone else goes to Clara, and if Clara is ever unreachable, callers fall back to plain voicemail.

Code, setup and security notes: [`router/`](router/).

## Test it before you trust it
Call the Twilio number from your own phone and run these three scripts:

1. **Loan pitch**: "This is Mike from Business Capital Partners, your business has been pre-approved for funding." Expect: asks the company, delivers the Do Not Call statement, hangs up.
2. **Pharmacy**: "This is Maria from CVS calling for <name>, a prescription is ready, callback 706-555-0142." Expect: takes the message, repeats the number back, logs to Inbox due today with the number in digits.
3. **Fisher**: "Hi, is this <name>?" with no other info. Expect: "Who's calling, and what's it regarding?" and no confirmation of the name.

With the router, also have a contact call and leave a voicemail, and confirm the alert arrives.

Read the transcript of every test in Monitor → Conversations. A tool call that fails in under 10 ms failed before leaving ElevenLabs (bad header, bad URL); check the request details.

## Known limitation: ringless voicemail
"Ringless" voicemail drops go straight into your carrier's mailbox without ringing the phone, so call forwarding never sees them. Neither Clara nor the router can catch those.

## License
MIT. Do whatever you want with it; just don't make it call people.
