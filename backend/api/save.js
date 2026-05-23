const { createClient } = require('@supabase/supabase-js');

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
  response.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  try {
    if (request.method === 'OPTIONS') {
      return response.status(204).end();
    }

    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

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

    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const body = typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
    const content = body.content;

    if (!content || typeof content !== 'object') {
      return response.status(400).json({ error: 'Invalid content payload' });
    }

    const { error } = await serviceClient
      .from('site_content')
      .upsert({
        id: 'main',
        content,
        updated_at: new Date().toISOString(),
        updated_by: userData.user.id
      }, { onConflict: 'id' });

    if (error) {
      return response.status(500).json({ error: error.message });
    }

    return response.status(200).json({ ok: true, updatedBy: userData.user.id });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unexpected backend error' });
  }
};
