const { createClient } = require('@supabase/supabase-js');
const {
  applyCors,
  parseBody,
  rateLimit,
  normalizeText,
  sanitizeContent
} = require('../lib/security');

function getServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}

function getAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false }
  });
}

module.exports = async (request, response) => {
  if (!applyCors(request, response, 'GET,POST,OPTIONS')) {
    return response.status(403).json({ error: 'Origin not allowed' });
  }

  try {
    if (request.method === 'OPTIONS') {
      return response.status(204).end();
    }

    if (request.method === 'POST') {
      const serviceClient = getServiceClient();
      if (!serviceClient) {
        return response.status(500).json({ error: 'Backend is missing Supabase configuration' });
      }

      const submitLimit = rateLimit(request, { key: 'submissions-post', limit: 12, windowMs: 60_000 });
      if (!submitLimit.allowed) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((submitLimit.resetAt - Date.now()) / 1000))));
        return response.status(429).json({ error: 'Too many form submissions' });
      }

      const body = parseBody(request, 25_000);
      const submissionType = normalizeText(body.submissionType);
      const name = normalizeText(body.name) || null;
      const title = normalizeText(body.title) || null;
      const message = normalizeText(body.message);
      const metadata = body.metadata && typeof body.metadata === 'object' ? sanitizeContent(body.metadata) : {};

      if (!submissionType || !message) {
        return response.status(400).json({ error: 'Invalid submission payload' });
      }

      const { data, error } = await serviceClient
        .from('form_submissions')
        .insert({
          submission_type: submissionType,
          name,
          title,
          message,
          metadata,
          status: 'new'
        })
        .select('id, created_at')
        .single();

      if (error) {
        return response.status(500).json({ error: error.message });
      }

      return response.status(201).json({ ok: true, id: data.id, createdAt: data.created_at });
    }

    if (request.method === 'GET') {
      const authHeader = request.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      if (!token) {
        return response.status(401).json({ error: 'Missing Supabase access token' });
      }

      const authClient = getAuthClient();
      const serviceClient = getServiceClient();
      if (!authClient || !serviceClient) {
        return response.status(500).json({ error: 'Backend is missing Supabase configuration' });
      }

      const readLimit = rateLimit(request, { key: 'submissions-get', limit: 60, windowMs: 60_000 });
      if (!readLimit.allowed) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((readLimit.resetAt - Date.now()) / 1000))));
        return response.status(429).json({ error: 'Too many requests' });
      }

      const { data: userData, error: userError } = await authClient.auth.getUser(token);
      if (userError || !userData?.user) {
        return response.status(401).json({ error: 'Unauthorized' });
      }

      const limitValue = parseInt(request.query?.limit || '100', 10);
      const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 250) : 100;

      const { data, error } = await serviceClient
        .from('form_submissions')
        .select('id, submission_type, name, title, message, metadata, status, created_at, reviewed_at, reviewed_by')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return response.status(500).json({ error: error.message });
      }

      return response.status(200).json({ submissions: data || [] });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unexpected backend error' });
  }
};