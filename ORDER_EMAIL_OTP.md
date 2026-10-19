# ImPrint checkout email OTP

Implemented behind `ORDER_EMAIL_OTP=true`. Until configured and enabled, existing checkout continues unchanged. Do not enable before a real delivery test. Email recipient is the signed-in account email, shown at checkout. This verifies email access, not the delivery phone number.

## Configure production

1. Create a Resend account and verify a sending domain owned by ImPrint, e.g. `notify.imprint.io.vn`. Add the exact DNS records shown by Resend to the authoritative DNS provider. No invented DNS values. Existing MX records for the root domain should remain unchanged.
2. Create a sending API key restricted to the verified domain. Store it as Worker secret `RESEND_API_KEY`; never commit it or send it in chat.
3. Set `ORDER_EMAIL_FROM` to an address on that verified domain, e.g. `ImPrint <orders@notify.imprint.io.vn>`.
4. Generate a cryptographically random secret of at least 32 characters and store it as Worker secret `ORDER_OTP_SECRET`.
5. Deploy the tested code to a preview Worker with separate test storage and set `ORDER_EMAIL_OTP=true` there. Verify real receipt using an authorized test address, correct and incorrect codes, expiry, resend, and duplicate submissions.
6. Deploy to production, then set `ORDER_EMAIL_OTP=true`. Confirm the OTP flow with an authorized test order. Never place a real test order or send to another person without permission.

No manually applied migration required: an isolated `order_email_otp` table is created on first use. No existing order data is rewritten. Expired rows older than one day are cleaned on subsequent send requests.

## Behavior and security

- Six cryptographically random digits, five-minute expiry; resend after 60 seconds invalidates prior code.
- Five guesses per challenge; send limits per account, email and IP per 15-minute window.
- HMAC of the code is stored; plaintext code is only sent to the mail provider, never returned to the browser or logged.
- Challenge binds user, account email, shipping, coupon, cart revision and idempotency key.
- OTP eligibility is checked again in the same D1 transaction that inserts the order, decrements stock, clears cart and consumes the challenge.
- Duplicate successful requests return the existing order; unsuccessful attempts leave cart/stock unchanged.
- Mail provider failure or missing config fails closed when OTP is enabled.
- Mail API acceptance is not proof of inbox delivery: inspect Resend delivery events and spam folder during live testing.

## Verification

`npm test` includes mocked provider tests for valid checkout, direct API bypass, changed shipping, wrong codes, expiry, exhaustion, cross-user misuse, resend cooldown, provider failure, missing configuration, single-use and idempotency. These tests do not prove real mail delivery.

Rollback: revert code if needed. Changing `ORDER_EMAIL_OTP` to `false` restores checkout without verification and must be a deliberate operator decision.
