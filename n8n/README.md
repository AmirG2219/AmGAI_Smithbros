# n8n workflows

Three small automations. n8n only moves messages and keeps time; every decision lives in the dashboard app.

| File | What it does |
|---|---|
| `workflows/gmail-in.json` | Every 2 minutes, copies emails matching the Gmail filter into the dashboard Inbox (`POST /api/inbound/email`). |
| `workflows/gmail-out.json` | The app calls this when a reply is approved; it sends the reply from Gmail in the same thread and never twice (`POST /webhook/smithbros-gmail-send`). |
| `workflows/daily-lead-booking-reminders.json` | Daily at 9am, asks the app to send booking reminders to leads who have not booked (`POST /api/automation/lead-reminders`). |

## Credentials these need (created in n8n, never stored in these files)

- **Gmail account** (Gmail OAuth2): the mailbox that is read and sent from.
- **Smith Bros App Secret** (Header Auth): header name `x-webhook-secret`, value = the app's `INBOUND_WEBHOOK_SECRET`.
  The same value is set in the app as `GMAIL_SEND_SECRET`.

## Importing into another n8n

1. Workflows, then Import from file, for each JSON file.
2. Open each node that shows a credential warning and pick the two credentials above.
3. Set the app address: edit the `Config` node's `app_url` (in the Gmail-in and reminders workflows).
4. Publish the workflows.
5. In the app's host (Vercel) set `GMAIL_SEND_WEBHOOK_URL` to this n8n's production webhook URL for `smithbros-gmail-send`.

## Going live with the client's inbox

- Reconnect the **Gmail account** credential as the client's mailbox. Nothing else in the workflows changes.
- In Gmail-in, change the trigger filter `label:SmithBros-Test` to `in:inbox`.
- Set `INBOX_ADDRESS` in the app to the client's address.
- The reminders workflow does nothing until `CALENDLY_URL` and email sending (Resend) are configured in the app.
