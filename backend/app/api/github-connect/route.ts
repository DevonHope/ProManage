import { NextRequest, NextResponse } from 'next/server';
import { verifyJwt, decryptString, encryptString } from '@/lib/auth';
import { getUserSettings, setUserSettings } from '@/lib/store';
import { verifyGitConnection, GitCredentials, GitProvider } from '@/lib/git';

export const runtime = 'nodejs';

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  const reqMethod = req.headers.get('access-control-request-method') ?? 'GET, POST, DELETE, OPTIONS';
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type, Authorization';
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': reqMethod, 'Access-Control-Allow-Headers': reqHeaders, Vary: 'Origin' } as Record<string, string>;
}

function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = token ? verifyJwt<{ sub: string }>(token) : null;
  return payload?.sub || null;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

// POST /api/github-connect – persist Git provider credentials after verifying
export async function POST(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
  const { provider, baseUrl, username, password, token } = await req.json();
    const prov = (provider as GitProvider) || 'github';
    const creds: GitCredentials = { provider: prov, baseUrl, username, password, token };
    const v = await verifyGitConnection(creds);
    if (!v.ok) return NextResponse.json({ error: `Git auth failed: ${v.status}` }, { status: 400, headers });
    const s = (await getUserSettings(userId)) || {};
    const updated = {
      ...s,
      githubUsername: s.githubUsername,
      githubPasswordEnc: s.githubPasswordEnc,
      githubTokenEnc: s.githubTokenEnc,
      githubConnected: s.githubConnected,
    } as any;
    if (prov === 'github') {
      if (username) updated.githubUsername = username;
      if (password) updated.githubPasswordEnc = encryptString(password);
      if (token) updated.githubTokenEnc = encryptString(token);
      updated.githubConnected = true;
    } else if (prov === 'gitea') {
      updated.giteaBaseUrl = baseUrl;
      if (token) updated.giteaTokenEnc = encryptString(token);
      if (username && password) {
        updated.giteaUsername = username;
        updated.giteaPasswordEnc = encryptString(password);
      }
      updated.giteaConnected = true;
    } else if (prov === 'gitlab') {
      updated.gitlabBaseUrl = baseUrl || 'https://gitlab.com';
      if (token) updated.gitlabTokenEnc = encryptString(token);
      if (username && password) {
        updated.gitlabUsername = username;
        updated.gitlabPasswordEnc = encryptString(password);
      }
      updated.gitlabConnected = true;
    }
    await setUserSettings(userId, updated);
    return NextResponse.json({ connected: true, provider: prov }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}

// GET /api/github-connect – try reconnect using stored creds
export async function GET(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const s = await getUserSettings(userId) as any;
    const results: any = {};
    // GitHub
    if ((s?.githubTokenEnc || (s?.githubUsername && s?.githubPasswordEnc))) {
      const ok = await verifyGitConnection({ provider: 'github', username: s.githubUsername, password: s.githubPasswordEnc ? decryptString(s.githubPasswordEnc) : undefined, token: s.githubTokenEnc ? decryptString(s.githubTokenEnc) : undefined });
      results.github = ok.ok;
    }
    // Gitea
    if ((s?.giteaTokenEnc || (s?.giteaUsername && s?.giteaPasswordEnc)) && s?.giteaBaseUrl) {
      const ok = await verifyGitConnection({ provider: 'gitea', baseUrl: s.giteaBaseUrl, token: s.giteaTokenEnc ? decryptString(s.giteaTokenEnc) : undefined, username: s.giteaUsername, password: s.giteaPasswordEnc ? decryptString(s.giteaPasswordEnc) : undefined });
      results.gitea = ok.ok;
    }
    // GitLab
    if ((s?.gitlabTokenEnc || (s?.gitlabUsername && s?.gitlabPasswordEnc))) {
      const ok = await verifyGitConnection({ provider: 'gitlab', baseUrl: s.gitlabBaseUrl || 'https://gitlab.com', token: s.gitlabTokenEnc ? decryptString(s.gitlabTokenEnc) : undefined, username: s.gitlabUsername, password: s.gitlabPasswordEnc ? decryptString(s.gitlabPasswordEnc) : undefined });
      results.gitlab = ok.ok;
    }
    return NextResponse.json({ connected: results }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}

// DELETE /api/github-connect – disconnect
export async function DELETE(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const s = (await getUserSettings(userId)) || {};
    const saved = await setUserSettings(userId, {
      ...s,
      githubConnected: false,
    });
    return NextResponse.json({ connected: false }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}