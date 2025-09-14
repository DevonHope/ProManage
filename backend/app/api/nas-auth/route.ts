import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

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

// POST /api/nas-auth
export async function POST(req: NextRequest) {
  const cors = buildCorsHeaders(req);
  try {
    const { nasPath, username, password } = await req.json();
    if (!nasPath || !username || !password) {
      return NextResponse.json(
        { error: 'Missing fields' },
        { status: 400, headers: cors }
      );
    }

    // Attempt to read a description file containing 'desc' in its name
    let description = '';
    try {
      const entries = await fs.readdir(nasPath, { withFileTypes: true });
      const candidates = entries
        .filter((e) => e.isFile() && /desc/i.test(e.name))
        .sort((a, b) => {
          const pref = (n: string) => (n.toLowerCase().endsWith('.txt') ? 0 : n.toLowerCase().endsWith('.md') ? 1 : 2);
          return pref(a.name) - pref(b.name);
        });
      if (candidates.length > 0) {
        const filePath = path.join(nasPath, candidates[0].name);
        description = await fs.readFile(filePath, 'utf8');
      }
    } catch {
      // ignore fs errors; return empty description
    }

    return NextResponse.json(
      { success: true, message: 'NAS authenticated (stub)', description },
      { headers: cors }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unexpected error' },
      { status: 500, headers: cors }
    );
  }
}
