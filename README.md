# Clara — an AI call screener for spam calls

An ElevenLabs voice agent that answers the calls you don't, takes messages from real people, and tells spam callers (especially business-loan pitches) to remove your number. Every call is logged to Todoist. No code, no server: the agent calls the Todoist API directly.

Write-up with diagram, transcript and test notes: https://kaseymcgrath.github.io/clara-call-screener/

## How it works

```
Incoming call → your cell
    contacts ring through
    unknown numbers silenced → no answer
        → *71 no-answer forwarding → Twilio number → ElevenLabs agent "Clara"
              real caller  → takes a message → Todoist Inbox (due today)
              spam / loan  → Do Not Call statement, hangs up → Todoist spam log
```

## What you need

- A Twilio account with one US local number (voice only). About $1.15/month plus ~$0.01/min inbound.
- An ElevenLabs account. The Starter plan ($6/month, 75 call-minutes) covers roughly 100 spam calls.
- A Todoist account and its API token (Settings → Integrations → Developer).
- A carrier that supports conditional call forwarding. Verizon: `*71` + number (busy/no-answer), `*73` to cancel. Other carriers use different codes.

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
6. Settings: max conversation duration 120 s, daily call limit ~40, bursting off.

### 3. Todoist logging tools
Add two **Webhook** tools to the agent. Build them in the form view, not the JSON editor.

Both tools:
- Method `POST`, URL `https://api.todoist.com/api/v1/tasks`
- Header `Authorization`, type **Secret**. Create a secret whose *value* is `Bearer <your Todoist token>` (the word Bearer, a space, then the token). ElevenLabs sends the secret value verbatim.
- Body format JSON. Field definitions are in [`tools/log_message.json`](tools/log_message.json) and [`tools/log_spam.json`](tools/log_spam.json). Mark the `project_id` / `section_id` / `due_string` properties as **Constant Value**, not LLM Prompt, or the model will guess them.

Find your Todoist project and section IDs with the Todoist API or by inspecting a project URL.

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

### 6. Forward your phone
- Verizon: dial `*71` immediately followed by the 10-digit Twilio number, press call, wait for the confirmation tone. One string, no spaces, no +1.
- iPhone: Settings → Phone → **Silence Unknown Callers** → on. Unknown numbers never ring, roll to no-answer, and reach the agent. Contacts still ring you.
- The agent replaces your voicemail for unanswered calls. Missed calls from contacts go to Clara too; she takes a message.

## Test it before you trust it
Call the Twilio number from your own phone and run these three scripts:

1. **Loan pitch**: "This is Mike from Business Capital Partners, your business has been pre-approved for funding." Expect: asks the company, delivers the Do Not Call statement, hangs up, logs to the spam project.
2. **Pharmacy**: "This is Maria from CVS calling for <name>, a prescription is ready, callback 706-555-0142." Expect: takes the message, repeats the number back, logs to Inbox due today with the number in digits.
3. **Fisher**: "Hi, is this <name>?" with no other info. Expect: "Who's calling, and what's it regarding?" and no confirmation of the name.

Read the transcript of every test in Monitor → Conversations. A tool call that fails in under 10 ms failed before leaving ElevenLabs (bad header, bad URL); check the request details.

## License
MIT. Do whatever you want with it; just don't make it call people.
