const DEFAULT_ORIGINS = [
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'https://g4pjo75-gif.github.io'
];

export function allowedOrigins(env) {
  const raw = (env && env.ALLOWED_ORIGINS) || '';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_ORIGINS;
}

export function corsHeaders(origin, env) {
  const ok = origin && allowedOrigins(env).includes(origin);
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (ok) h['Access-Control-Allow-Origin'] = origin;
  return h;
}
