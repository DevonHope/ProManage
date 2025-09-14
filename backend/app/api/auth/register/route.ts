import { NextRequest, NextResponse } from 'next/server';
import { createUser, findUserByEmail } from '@/lib/store';
import { hashPassword, signJwt } from '@/lib/auth';

export const runtime = 'nodejs';

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  const reqMethod = req.headers.get('access-control-request-method') ?? 'POST, OPTIONS';
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type, Authorization';
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': reqMethod, 'Access-Control-Allow-Headers': reqHeaders, Vary: 'Origin' } as Record<string, string>;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: 'Missing email or password' }, { status: 400, headers });
    const existing = await findUserByEmail(email);
    if (existing) return NextResponse.json({ error: 'User exists' }, { status: 409, headers });
    const { salt, hash } = hashPassword(password);
    const user = await createUser({ id: Date.now().toString(), email, passwordHash: hash, salt });
    const token = signJwt({ sub: user.id, email: user.email });
    return NextResponse.json({ token, user: { id: user.id, email: user.email } }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}
