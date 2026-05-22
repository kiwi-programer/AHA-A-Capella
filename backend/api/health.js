module.exports = async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (request.method === 'OPTIONS') {
    return response.status(204).end();
  }

  return response.status(200).json({ ok: true });
};
