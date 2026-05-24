module.exports = async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  return response.status(200).json({ ok: true });
};
