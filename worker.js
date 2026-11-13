// Código que corre en Cloudflare. Hace dos cosas:
//  - /api/menu/<identificador>: entrega el menú leyéndolo de Firestore desde
//    los servidores de Cloudflare. Así el visitante solo necesita llegar a
//    este sitio, aunque su red o su país no alcancen los servicios de Google.
//  - Todo lo demás: los archivos del sitio.
import { CONFIG } from './js/config.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const match = url.pathname.match(/^\/api\/menu\/([a-z0-9-]{1,60})$/);
    if (!match || request.method !== 'GET' || !CONFIG.firebase) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: JSON_HEADERS });
    }
    const { projectId, apiKey } = CONFIG.firebase;
    try {
      const upstream = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/menus/${match[1]}?key=${apiKey}`,
      );
      return new Response(upstream.body, { status: upstream.status, headers: JSON_HEADERS });
    } catch {
      return new Response(JSON.stringify({ error: 'upstream_unreachable' }), { status: 502, headers: JSON_HEADERS });
    }
  },
};
