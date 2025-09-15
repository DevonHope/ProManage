import { NextRequest, NextResponse } from 'next/server';
import { upsertProject } from '@/lib/store';
import { fetchReadmeFirstLine, GitCredentials, GitProvider } from '@/lib/git';

function buildCorsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  const reqMethod = req.headers.get('access-control-request-method') ?? 'POST, OPTIONS';
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': reqMethod,
    'Access-Control-Allow-Headers': reqHeaders,
    'Vary': 'Origin',
  } as Record<string, string>;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req),
  });
}

// POST /api/github-import
export async function POST(req: NextRequest) {
  const cors = buildCorsHeaders(req);
  try {
    const { repoUrl, username, password, token, provider, baseUrl, projectId, userId } = await req.json();
    if (!repoUrl) {
      return NextResponse.json(
        { error: 'Missing fields' },
        { status: 400, headers: cors }
      );
    }
    const prov = (provider as GitProvider) || 'github';
    const creds: GitCredentials = { provider: prov, baseUrl, username, password, token };
    const firstLine = await fetchReadmeFirstLine(creds, repoUrl);
    if (!firstLine) {
      return NextResponse.json(
        { error: 'Failed to fetch README' },
        { status: 400, headers: cors }
      );
    }
    // Update project description if IDs provided
    if (projectId && userId) {
      const store = await import('@/lib/store');
      const projects = await store.getProjectsByUser(userId);
      const existing = projects.find((p: any) => p.id === projectId);
      if (existing) {
        const updated = { ...existing, description: firstLine };
        await upsertProject(updated);
      }
    }
  return NextResponse.json({ description: firstLine }, { headers: cors });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unexpected error' },
      { status: 500, headers: cors }
    );
  }
}
