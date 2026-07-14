# Setting up email notifications (EmailJS + Gmail)

This turns on email notifications for approvers: Admins get emailed when a
new Fund Request is submitted, and Admins + the relevant site Supervisor
get emailed when a new Leave Request is submitted. Staff don't get emailed
(no real inbox on file for most), but still see status updates in the app.

## 1. Create an EmailJS account

1. Go to https://www.emailjs.com and sign up (free tier: 200 emails/month).

## 2. Connect Gmail

1. In the EmailJS dashboard, go to **Email Services** → **Add New Service**.
2. Choose **Gmail**, then sign in with the Workspace account you want
   notifications to be sent from (e.g. the account behind `@emagrims.com`).
3. Copy the **Service ID** it creates (looks like `service_xxxxxxx`).

## 3. Create an Email Template

1. Go to **Email Templates** → **Create New Template**.
2. Set the **To Email** field to `{{to_email}}`.
3. Set the **Subject** to `{{subject}}`.
4. In the body, use these variables (all sent by the app):
   - `{{to_name}}` — the approver's name
   - `{{request_type}}` — "Fund Request" or "Leave Request"
   - `{{submitted_by}}` — who submitted it
   - `{{summary}}` — a one-line description (amount/items, or leave dates)
   - `{{link_url}}` — direct link to open the relevant page in the ERP

   A simple body works fine, e.g.:
   ```
   Hi {{to_name}},

   A new {{request_type}} from {{submitted_by}} needs your approval.

   {{summary}}

   Review it here: {{link_url}}
   ```
5. Save the template and copy its **Template ID** (looks like `template_xxxxxxx`).

## 4. Get your Public Key

1. Go to **Account** → **General**.
2. Copy the **Public Key**.

## 5. Send me three values

- Public Key
- Service ID
- Template ID

None of these are secrets in the way a password is — EmailJS's public key
is designed to be embedded in client-side code (like this app), the same
way Stripe's publishable key works.

## Also needed: real email addresses

Notifications only go to Admins/Supervisors who have a real email address
filled in on their HR record. Go to **HR & Employees**, edit each person
who should get notified, and fill in their **Email** field.
