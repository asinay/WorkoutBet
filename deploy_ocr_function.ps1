$ErrorActionPreference = 'Stop'

Write-Host 'Deploying Supabase Edge Function: ocr-space'
Write-Host 'Make sure you have already run:'
Write-Host '  supabase login'
Write-Host '  supabase link'
Write-Host '  supabase secrets set OCR_SPACE_API_KEY=your_key_here'

supabase functions deploy ocr-space

Write-Host 'Done.'
