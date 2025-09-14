import { NextRequest, NextResponse } from 'next/server';
import { verifyJwt } from '@/lib/auth';
import { readStore } from '@/lib/store';

export const runtime = 'nodejs';

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  const reqMethod = req.headers.get('access-control-request-method') ?? 'GET, OPTIONS';
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type, Authorization';
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': reqMethod, 'Access-Control-Allow-Headers': reqHeaders, Vary: 'Origin' } as Record<string, string>;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function GET(req: NextRequest) {
  const headers = cors(req);
  try {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const payload = token ? verifyJwt<{ sub: string; email: string }>(token) : null;
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    const store = await readStore();
    const user = store.users.find(u => u.id === payload.sub);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    return NextResponse.json({ user: { id: user.id, email: user.email } }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}
