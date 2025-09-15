import { NextRequest, NextResponse } from 'next/server';
import { verifyJwt } from '@/lib/auth';
import { getUserSettings, setUserSettings, UserSettings } from '@/lib/store';
import { encryptString, decryptString } from '@/lib/auth';

export const runtime = 'nodejs';

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  const reqMethod = req.headers.get('access-control-request-method') ?? 'GET, POST, OPTIONS';
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

export async function GET(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const s = await getUserSettings(userId);
  // Don’t return the raw encrypted password; we omit it.
  const redacted = s ? {
    ...s,
    connectionPasswordEnc: undefined,
    githubPasswordEnc: undefined,
  githubTokenEnc: undefined,
    giteaPasswordEnc: undefined,
    giteaTokenEnc: undefined,
    gitlabPasswordEnc: undefined,
    gitlabTokenEnc: undefined,
  } : undefined;
  return NextResponse.json({ settings: redacted }, { headers });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const body = await req.json();
    const incoming: Partial<UserSettings> & { connectionPassword?: string; githubToken?: string } = body || {};
    const existing = (await getUserSettings(userId)) || {};
    const toSave: UserSettings = { ...existing };
    if (typeof incoming.defaultConnectionType !== 'undefined') toSave.defaultConnectionType = incoming.defaultConnectionType;
    if (typeof incoming.connectionUsername !== 'undefined') toSave.connectionUsername = incoming.connectionUsername;
    if (typeof incoming.connectionPassword !== 'undefined') {
      if (incoming.connectionPassword) toSave.connectionPasswordEnc = encryptString(incoming.connectionPassword);
    }
    if (typeof incoming.githubToken !== 'undefined') {
      if (incoming.githubToken) (toSave as any).githubTokenEnc = encryptString(incoming.githubToken);
    }
    const saved = await setUserSettings(userId, toSave);
    const redacted = {
      ...saved,
      connectionPasswordEnc: undefined,
      githubPasswordEnc: undefined,
      githubTokenEnc: undefined,
      giteaPasswordEnc: undefined,
      giteaTokenEnc: undefined,
      gitlabPasswordEnc: undefined,
      gitlabTokenEnc: undefined,
    } as any;
    return NextResponse.json({ settings: redacted }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}
