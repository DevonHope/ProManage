export type GitProvider = 'github' | 'gitlab' | 'gitea';

export interface GitCredentials {
  provider: GitProvider;
  baseUrl?: string; // required for self-hosted gitea/gitlab; ignored for github unless overridden
  username?: string;
  password?: string; // optional; prefer token for gitlab
  token?: string; // gitlab/gitea tokens
}

export async function verifyGitConnection(creds: GitCredentials): Promise<{ ok: boolean; status?: number }> {
  const { provider, baseUrl, username, password, token } = creds;
  try {
    if (provider === 'github') {
      const auth = username && password ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : token ? `Bearer ${token}` : '';
      if (!auth) return { ok: false, status: 400 };
      const resp = await fetch('https://api.github.com/user', { headers: { Authorization: auth, 'User-Agent': 'ProManageApp' } });
      return { ok: resp.ok, status: resp.status };
    }
    if (provider === 'gitea') {
      const root = (baseUrl || '').replace(/\/$/, '');
      if (!root) return { ok: false, status: 400 };
      const headers: Record<string, string> = { 'User-Agent': 'ProManageApp' };
      if (token) headers['Authorization'] = `token ${token}`;
      else if (username && password) headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      else return { ok: false, status: 400 };
      const resp = await fetch(`${root}/api/v1/user`, { headers });
      return { ok: resp.ok, status: resp.status };
    }
    if (provider === 'gitlab') {
      const root = (baseUrl || 'https://gitlab.com').replace(/\/$/, '');
      const headers: Record<string, string> = { 'User-Agent': 'ProManageApp' };
      if (token) headers['PRIVATE-TOKEN'] = token;
      else if (username && password) headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      else return { ok: false, status: 400 };
      const resp = await fetch(`${root}/api/v4/user`, { headers });
      return { ok: resp.ok, status: resp.status };
    }
    return { ok: false, status: 400 };
  } catch {
    return { ok: false, status: 500 };
  }
}

function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
  const m = repoUrl.match(/[^:@\/]+[:\/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export async function fetchReadmeFirstLine(creds: GitCredentials, repoUrl: string): Promise<string | null> {
  const pr = parseOwnerRepo(repoUrl);
  if (!pr) return null;
  const { owner, repo } = pr;
  const { provider, baseUrl, username, password, token } = creds;
  try {
    if (provider === 'github') {
      const headers: Record<string, string> = { 'User-Agent': 'ProManageApp', Accept: 'application/vnd.github.v3.raw' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      else if (username && password) headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      else return null;
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers });
      if (!resp.ok) return null;
      const text = await resp.text();
      return (text.split(/\r?\n/)[0] || '').trim();
    }
    if (provider === 'gitea') {
      const root = (baseUrl || '').replace(/\/$/, '');
      if (!root) return null;
      const headers: Record<string, string> = { 'User-Agent': 'ProManageApp' };
      if (token) headers['Authorization'] = `token ${token}`;
      else if (username && password) headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      else return null;
      // Use contents API which returns JSON with base64 content
      const resp = await fetch(`${root}/api/v1/repos/${owner}/${repo}/contents/README.md`, { headers });
      if (!resp.ok) return null;
      const json: any = await resp.json();
      const b64 = json.content as string;
      const text = Buffer.from(b64 || '', 'base64').toString('utf8');
      return (text.split(/\r?\n/)[0] || '').trim();
    }
    if (provider === 'gitlab') {
      const root = (baseUrl || 'https://gitlab.com').replace(/\/$/, '');
      const headers: Record<string, string> = { 'User-Agent': 'ProManageApp' };
      if (token) headers['PRIVATE-TOKEN'] = token;
      else if (username && password) headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
      else return null;
      const projectId = encodeURIComponent(`${owner}/${repo}`);
      // Try main then master
      for (const ref of ['main', 'master']) {
        const resp = await fetch(`${root}/api/v4/projects/${projectId}/repository/files/README.md/raw?ref=${ref}`, { headers });
        if (resp.ok) {
          const text = await resp.text();
          return (text.split(/\r?\n/)[0] || '').trim();
        }
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}
