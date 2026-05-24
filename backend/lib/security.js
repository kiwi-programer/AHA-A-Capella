const DEFAULT_ALLOWED_ORIGINS = [
  'https://aha-a-capella.vercel.app',
  'https://aha-a-capella-admin.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173'
];

const rateLimitState = new Map();

function getAllowedOrigins() {
  const rawValue = process.env.CORS_ORIGIN || '';
  if (!rawValue) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  if (rawValue.trim() === '*') {
    return ['*'];
  }

  return rawValue
    .split(/[\s,]+/)
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function normalizeOrigin(origin) {
  return typeof origin === 'string' ? origin.trim().replace(/\/$/, '') : '';
}

function isAllowedOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes('*')) {
    return true;
  }

  return allowedOrigins.includes(normalizedOrigin);
}

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function applyCors(request, response, methods) {
  const origin = request.headers.origin || '';
  const allowedOrigins = getAllowedOrigins();

  applySecurityHeaders(response);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', methods);
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (allowedOrigins.includes('*')) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    return true;
  }

  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!allowedOrigins.includes(normalizedOrigin)) {
    return false;
  }

  response.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
  return true;
}

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  return request.socket?.remoteAddress || 'unknown';
}

function cleanupRateLimitState(now = Date.now()) {
  for (const [key, entry] of rateLimitState.entries()) {
    if (!entry || entry.resetAt <= now) {
      rateLimitState.delete(key);
    }
  }
}

function rateLimit(request, { key = 'default', limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  cleanupRateLimitState(now);

  const ip = getClientIp(request);
  const bucketKey = `${key}:${ip}`;
  const existing = rateLimitState.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    rateLimitState.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  rateLimitState.set(bucketKey, existing);
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

function parseBody(request, maxBytes = 100_000) {
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body, 'utf8') > maxBytes) {
      throw new Error('Request body is too large');
    }

    return JSON.parse(request.body);
  }

  if (request.body && typeof request.body === 'object') {
    return request.body;
  }

  return {};
}

function normalizeText(value, maxLength = 2_000) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math|base)[^>]*\/\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|svg|math|base)[^>]*>/gi, '')
    .replace(/on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src|xlink:href|formaction)\s*=\s*("|')\s*javascript:[^"']*\1/gi, '')
    .replace(/\s(?:href|src|xlink:href|formaction)\s*=\s*javascript:[^\s>]+/gi, '')
    .replace(/\sstyle\s*=\s*("|')[^"']*\1/gi, '');
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeValue(nestedValue)])
    );
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  return value;
}

function sanitizeContent(content) {
  return sanitizeValue(content || {});
}

function safeJsonResponse(response, status, payload) {
  return response.status(status).json(payload);
}

module.exports = {
  applyCors,
  applySecurityHeaders,
  getClientIp,
  isAllowedOrigin,
  normalizeText,
  parseBody,
  rateLimit,
  sanitizeContent,
  sanitizeString,
  safeJsonResponse
};
