// SITARA — Mini router HTTP (pengganti Express, zero-dependency)
import { verifyToken, extractToken } from './auth.js';

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return '([^/]+)';
        }) +
        '/?$'
    );
    this.routes.push({ method, regex, keys, handler, isPublic: !!opts.public });
  }

  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  patch(p, h, o) { this.add('PATCH', p, h, o); }
  delete(p, h, o) { this.add('DELETE', p, h, o); }

  cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  async handle(req, res, url) {
    this.cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.regex);
      if (!m) continue;

      req.params = {};
      r.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1])));
      // Parameter query string (?q=&status=&limit=…) — dipakai filter & pencarian
      req.query = Object.fromEntries(url.searchParams);

      if (!r.isPublic) {
        const user = verifyToken(extractToken(req, url));
        if (!user) {
          return send(res, 401, { error: 'Sesi berakhir. Silakan masuk kembali.' });
        }
        req.user = user;
      }

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        req.body = await readBody(req);
      }

      try {
        return await r.handler(req, res);
      } catch (err) {
        console.error('[SITARA] API error:', err);
        return send(res, 500, { error: 'Kesalahan server: ' + err.message });
      }
    }
    return send(res, 404, { error: 'Endpoint API tidak ditemukan' });
  }
}

export function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

const MAX_BODY = 64 * 1024 * 1024; // 64MB (ruang untuk foto dokumentasi)
export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Ukuran data terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}
