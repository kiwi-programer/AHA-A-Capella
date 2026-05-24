const { createClient } = require('@supabase/supabase-js');
const {
  applyCors,
  parseBody,
  rateLimit,
  normalizeText
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

async function ensureBootstrapAccess(serviceClient, user) {
  const { data: existingUsers, error: countError } = await serviceClient
    .from('admin_users')
    .select('id')
    .limit(1);

  if (countError) {
    return { error: countError.message, status: 500, record: null };
  }

  if (!existingUsers?.length) {
    const { data: bootstrapRecord, error: bootstrapError } = await serviceClient
      .from('admin_users')
      .insert({
        email: user.email,
        display_name: user.user_metadata?.name || user.email,
        role: 'owner',
        is_active: true
      })
      .select('id, email, display_name, role, is_active, created_at, updated_at')
      .single();

    if (bootstrapError) {
      return { error: bootstrapError.message, status: 500, record: null };
    }

    return { record: bootstrapRecord, status: 200, error: null };
  }

  const { data: record, error: recordError } = await serviceClient
    .from('admin_users')
    .select('id, email, display_name, role, is_active, created_at, updated_at')
    .ilike('email', user.email)
    .maybeSingle();

  if (recordError) {
    return { error: recordError.message, status: 500, record: null };
  }

  if (!record || !record.is_active) {
    return { error: 'Forbidden', status: 403, record: null };
  }

  return { record, status: 200, error: null };
}

function isManagerRole(role) {
  return role === 'owner' || role === 'admin';
}

function isAlreadyExistsAuthError(message = '') {
  const normalized = String(message).toLowerCase();
  return normalized.includes('already') && (
    normalized.includes('registered') ||
    normalized.includes('exists') ||
    normalized.includes('invited')
  );
}

const ADMIN_VERIFICATION_REDIRECT_URL = 'https://aha-a-capella-admin.vercel.app/';

module.exports = async (request, response) => {
  if (!applyCors(request, response, 'GET,POST,PATCH,DELETE,OPTIONS')) {
    return response.status(403).json({ error: 'Origin not allowed' });
  }

  try {
    if (request.method === 'OPTIONS') {
      return response.status(204).end();
    }

    const authClient = getAuthClient();
    const serviceClient = getServiceClient();
    if (!authClient || !serviceClient) {
      return response.status(500).json({ error: 'Backend is missing Supabase configuration' });
    }

    const currentUserResult = await getCurrentUser(request, authClient);
    if (currentUserResult.error) {
      return response.status(currentUserResult.status).json({ error: currentUserResult.error });
    }

    const accessResult = await ensureBootstrapAccess(serviceClient, currentUserResult.user);
    if (accessResult.error) {
      return response.status(accessResult.status).json({ error: accessResult.error });
    }

    const access = accessResult.record;
    const canManageUsers = isManagerRole(access.role);

    if (request.method === 'GET') {
      const scope = request.query?.scope || '';

      const readLimit = rateLimit(request, { key: 'users-get', limit: 60, windowMs: 60_000 });
      if (!readLimit.allowed) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((readLimit.resetAt - Date.now()) / 1000))));
        return response.status(429).json({ error: 'Too many requests' });
      }

      if (scope === 'self') {
        return response.status(200).json({
          me: {
            email: access.email,
            role: access.role,
            isActive: access.is_active,
            canManageUsers
          }
        });
      }

      if (!canManageUsers) {
        return response.status(403).json({ error: 'Forbidden' });
      }

      const { data, error } = await serviceClient
        .from('admin_users')
        .select('id, email, display_name, role, is_active, created_at, updated_at')
        .order('created_at', { ascending: true });

      if (error) {
        return response.status(500).json({ error: error.message });
      }

      return response.status(200).json({ users: data || [] });
    }

    if (!canManageUsers) {
      return response.status(403).json({ error: 'Forbidden' });
    }

    if (request.method === 'POST') {
      const createLimit = rateLimit(request, { key: 'users-post', limit: 20, windowMs: 60_000 });
      if (!createLimit.allowed) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((createLimit.resetAt - Date.now()) / 1000))));
        return response.status(429).json({ error: 'Too many requests' });
      }

      const body = parseBody(request);
      const email = normalizeText(body.email, 320).toLowerCase();
      const displayName = normalizeText(body.displayName, 120) || null;
      const role = normalizeText(body.role, 20) || 'editor';
      const isActive = typeof body.isActive === 'boolean' ? body.isActive : true;
      const sendInvite = body.sendInvite !== false;

      if (!email || !['owner', 'admin', 'editor'].includes(role)) {
        return response.status(400).json({ error: 'Invalid user payload' });
      }

      if (role === 'owner' && access.role !== 'owner') {
        return response.status(403).json({ error: 'Only owners can add owner users' });
      }

      let authProvisioned = false;
      if (sendInvite) {
        const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
          redirectTo: ADMIN_VERIFICATION_REDIRECT_URL
        });
        if (inviteError && !isAlreadyExistsAuthError(inviteError.message)) {
          return response.status(500).json({ error: inviteError.message });
        }
        authProvisioned = !inviteError;
      }

      const { data, error } = await serviceClient
        .from('admin_users')
        .upsert({
          email,
          display_name: displayName || email,
          role,
          is_active: isActive,
          updated_at: new Date().toISOString()
        }, { onConflict: 'email' })
        .select('id, email, display_name, role, is_active, created_at, updated_at')
        .single();

      if (error) {
        return response.status(500).json({ error: error.message });
      }

      return response.status(201).json({
        ok: true,
        user: data,
        authProvisioned
      });
    }

    if (request.method === 'PATCH') {
      const updateLimit = rateLimit(request, { key: 'users-patch', limit: 20, windowMs: 60_000 });
      if (!updateLimit.allowed) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((updateLimit.resetAt - Date.now()) / 1000))));
        return response.status(429).json({ error: 'Too many requests' });
      }

      const body = parseBody(request);
      const id = body.id;
      const updates = {};

      if (!id) {
        return response.status(400).json({ error: 'Invalid update payload' });
      }

      const { data: targetUser, error: targetError } = await serviceClient
        .from('admin_users')
        .select('id, role')
        .eq('id', id)
        .maybeSingle();

      if (targetError) {
        return response.status(500).json({ error: targetError.message });
      }

      if (!targetUser) {
        return response.status(404).json({ error: 'User not found' });
      }

      if (targetUser.role === 'owner' && access.role !== 'owner') {
        return response.status(403).json({ error: 'Only owners can modify owner users' });
      }

      if (typeof body.displayName === 'string') {
        updates.display_name = normalizeText(body.displayName, 120) || null;
      }

      if (typeof body.role === 'string') {
        const role = normalizeText(body.role, 20);
        if (!['owner', 'admin', 'editor'].includes(role)) {
          return response.status(400).json({ error: 'Invalid role' });
        }

        if (role === 'owner' && access.role !== 'owner') {
          return response.status(403).json({ error: 'Only owners can assign owner role' });
        }

        updates.role = role;
      }

      if (typeof body.isActive === 'boolean') {
        updates.is_active = body.isActive;
      }

      if (!Object.keys(updates).length) {
        return response.status(400).json({ error: 'Invalid update payload' });
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await serviceClient
        .from('admin_users')
        .update(updates)
        .eq('id', id)
        .select('id, email, display_name, role, is_active, created_at, updated_at')
        .single();

      if (error) {
        return response.status(500).json({ error: error.message });
      }

      return response.status(200).json({ ok: true, user: data });
    }

    if (request.method === 'DELETE') {
      const deleteLimit = rateLimit(request, { key: 'users-delete', limit: 10, windowMs: 60_000 });
      if (!deleteLimit.allowed) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil((deleteLimit.resetAt - Date.now()) / 1000))));
        return response.status(429).json({ error: 'Too many requests' });
      }

      const id = request.query?.id;
      if (!id) {
        return response.status(400).json({ error: 'Missing id' });
      }

      const { data: record, error: recordError } = await serviceClient
        .from('admin_users')
        .select('id, email, role')
        .eq('id', id)
        .maybeSingle();

      if (recordError) {
        return response.status(500).json({ error: recordError.message });
      }

      if (!record) {
        return response.status(404).json({ error: 'User not found' });
      }

      if (record.role === 'owner' && access.role !== 'owner') {
        return response.status(403).json({ error: 'Only owners can remove owner users' });
      }

      if (record?.email) {
        const { data: authUsers, error: listError } = await serviceClient.auth.admin.listUsers({
          page: 1,
          perPage: 1000
        });

        if (listError) {
          return response.status(500).json({ error: listError.message });
        }

        const authUser = authUsers?.users?.find((user) => user.email?.toLowerCase() === record.email.toLowerCase());
        if (authUser) {
          const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(authUser.id);
          if (deleteAuthError) {
            return response.status(500).json({ error: deleteAuthError.message });
          }
        }
      }

      const { error } = await serviceClient
        .from('admin_users')
        .delete()
        .eq('id', id);

      if (error) {
        return response.status(500).json({ error: error.message });
      }

      return response.status(200).json({ ok: true });
    }

    return response.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return response.status(500).json({ error: error.message || 'Unexpected backend error' });
  }
};
