# Supabase Edge Functions

This project includes one Edge Function:

- `ocr-space`: accepts an uploaded image, sends it to OCR.Space using a server-side secret, and returns parsed text to the client.

## Prerequisites

- Install the Supabase CLI
- Log in with `supabase login`
- Link this folder to your project with `supabase link`

## Configure Secrets

Set the OCR.Space API key:

```bash
supabase secrets set OCR_SPACE_API_KEY=your_key_here
```

## Deploy

Deploy the OCR function:

```bash
supabase functions deploy ocr-space
```

## Serve Locally

Run the function locally:

```bash
supabase functions serve ocr-space
```

## Notes

- The browser uses your public Supabase URL and publishable/anon key.
- The OCR.Space secret stays inside Supabase and is not exposed to end users.
