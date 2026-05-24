const { createClient } = require('@supabase/supabase-js');
const { applyCors, rateLimit } = require('../lib/security');

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}

module.exports = async (request, response) => {
  if (!applyCors(request, response, 'GET,OPTIONS')) {
    return response.status(403).json({ error: 'Origin not allowed' });
  }

  try {
    if (request.method === 'OPTIONS') {
      return response.status(204).end();
    }

    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const readLimit = rateLimit(request, { key: 'content-get', limit: 120, windowMs: 60_000 });
    if (!readLimit.allowed) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((readLimit.resetAt - Date.now()) / 1000))));
      return response.status(429).json({ error: 'Too many requests' });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return response.status(200).json({ content: {}, fallback: true });
    }

    const { data, error } = await supabase
      .from('site_content')
      .select('content')
      .eq('id', 'main')
      .maybeSingle();

    if (error) {
      return response.status(500).json({ error: error.message });
    }

    return response.status(200).json({ content: data?.content || {} });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unexpected backend error' });
  }
};
