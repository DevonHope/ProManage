import { NextRequest, NextResponse } from 'next/server';

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

// POST /api/git-auth
export async function POST(req: NextRequest) {
  const cors = buildCorsHeaders(req);
  try {
    const { repoUrl, username, password, sshKey } = await req.json();
    if (!repoUrl || (!username && !sshKey)) {
      return NextResponse.json(
        { error: 'Missing fields' },
        { status: 400, headers: cors }
      );
    }
    // TODO: Implement actual Git authentication/clone logic
    return NextResponse.json(
      { success: true, message: 'Git authenticated (stub)' },
      { headers: cors }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unexpected error' },
      { status: 500, headers: cors }
    );
  }
}
