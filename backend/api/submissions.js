const { createClient } = require('@supabase/supabase-js');
const {
  applyCors,
  parseBody,
  rateLimit,
  normalizeText,
  sanitizeContent,
  getClientIp
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

async function getCurrentUser(request, authClient) {
  const authHeader = request.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return { error: 'Missing Supabase access token', status: 401, user: null };
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return { error: 'Unauthorized', status: 401, user: null };
  }

  return { user: userData.user, status: 200, error: null };
}

async function getAdminAccess(serviceClient, user) {
  const { data: access, error } = await serviceClient
    .from('admin_users')
    .select('role, is_active')
    .ilike('email', user.email)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 500, access: null };
  }

  if (!access || !access.is_active) {
    return { error: 'Forbidden', status: 403, access: null };
  }

  return { error: null, status: 200, access };
}

module.exports = async (request, response) => {
  if (!applyCors(request, response, 'GET,POST,DELETE,OPTIONS')) {
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

      const requestMetadata = sanitizeContent({
        ip: normalizeText(getClientIp(request), 80) || 'unknown',
        userAgent: normalizeText(request.headers['user-agent'] || '', 512) || null,
        acceptLanguage: normalizeText(request.headers['accept-language'] || '', 160) || null,
        referrer: normalizeText(request.headers.referer || request.headers.referrer || '', 512) || null,
        origin: normalizeText(request.headers.origin || '', 200) || null,
        host: normalizeText(request.headers.host || '', 200) || null,
        forwardedProto: normalizeText(request.headers['x-forwarded-proto'] || '', 32) || null,
        submittedAt: new Date().toISOString()
      });

      const mergedMetadata = {
        ...metadata,
        request: requestMetadata
      };

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
          metadata: mergedMetadata,
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

      const currentUser = await getCurrentUser(request, authClient);
      if (currentUser.error) {
        return response.status(currentUser.status).json({ error: currentUser.error });
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

    if (request.method === 'DELETE') {
      const authClient = getAuthClient();
      const serviceClient = getServiceClient();
      if (!authClient || !serviceClient) {
        return response.status(500).json({ error: 'Backend is missing Supabase configuration' });
      }

      const deleteLimit = rateLimit(request, { key: 'submissions-delete', limit: 20, windowMs: 60_000 });
      if (!deleteLimit.allowed) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((deleteLimit.resetAt - Date.now()) / 1000))));
        return response.status(429).json({ error: 'Too many requests' });
      }

      const currentUser = await getCurrentUser(request, authClient);
      if (currentUser.error) {
        return response.status(currentUser.status).json({ error: currentUser.error });
      }

      const accessResult = await getAdminAccess(serviceClient, currentUser.user);
      if (accessResult.error) {
        return response.status(accessResult.status).json({ error: accessResult.error });
      }

      if (!['owner', 'admin'].includes(accessResult.access.role)) {
        return response.status(403).json({ error: 'Forbidden' });
      }

      const id = request.query?.id;
      if (!id) {
        return response.status(400).json({ error: 'Missing id' });
      }

      const { data, error } = await serviceClient
        .from('form_submissions')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) {
        return response.status(500).json({ error: error.message });
      }

      if (!data) {
        return response.status(404).json({ error: 'Submission not found' });
      }

      return response.status(200).json({ ok: true, id: data.id });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unexpected backend error' });
  }
};