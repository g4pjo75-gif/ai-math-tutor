import { corsHeaders } from './cors.js';

const VERSION = '0.1.0';

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, version: VERSION, time: Date.now() }, 200, cors);
      }
      return json({ ok: false, error: 'not_found' }, 404, cors);
    } catch (err) {
      return json({ ok: false, error: 'internal' }, 500, cors);
    }
  }
};
