// SITARA — Autentikasi: token HMAC (ganti JWT) + password scrypt (bawaan node:crypto)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Secret stabil antar-restart (disimpan di data/secret.key)
const secretFile = path.join(dataDir, 'secret.key');
let SECRET;
if (fs.existsSync(secretFile)) {
  SECRET = fs.readFileSync(secretFile);
} else {
  SECRET = crypto.randomBytes(48);
  fs.writeFileSync(secretFile, SECRET);
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(h);
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signToken(payload, ttlMs = 12 * 3600 * 1000) {
  const body = { ...payload, exp: Date.now() + ttlMs };
  const data = b64u(JSON.stringify(body));
  const sig = b64u(crypto.createHmac('sha256', SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = b64u(crypto.createHmac('sha256', SECRET).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractToken(req, url) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return url.searchParams.get('token') || '';
}
