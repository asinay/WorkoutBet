const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY') ?? '';

    if (!ocrApiKey) {
      return jsonResponse({ error: 'Missing OCR_SPACE_API_KEY secret' }, 500);
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return jsonResponse({ error: 'No file uploaded' }, 400);
    }

    const upstream = new FormData();
    upstream.append('file', file, file.name || 'workout-image.jpg');
    upstream.append('language', 'eng');
    upstream.append('OCREngine', '2');
    upstream.append('isOverlayRequired', 'false');
    upstream.append('scale', 'true');
    upstream.append('detectOrientation', 'true');

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: ocrApiKey },
      body: upstream,
    });

    if (!ocrRes.ok) {
      return jsonResponse({ error: `OCR.Space request failed (${ocrRes.status})` }, 502);
    }

    const payload = await ocrRes.json();
    if (payload.IsErroredOnProcessing) {
      const detail = Array.isArray(payload.ErrorMessage)
        ? payload.ErrorMessage.join(', ')
        : payload.ErrorMessage || payload.ErrorDetails || 'Unknown OCR.Space error';
      return jsonResponse({ error: detail }, 400);
    }

    const text = (payload.ParsedResults || [])
      .map((result: { ParsedText?: string }) => result.ParsedText || '')
      .join('\n')
      .trim();

    return jsonResponse({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected OCR error';
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
