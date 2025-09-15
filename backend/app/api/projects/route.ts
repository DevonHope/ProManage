import { NextRequest, NextResponse } from 'next/server';
import { verifyJwt } from '@/lib/auth';
import { getProjectsByUser, upsertProject, deleteProjects, ProjectRecord } from '@/lib/store';
import fs from 'fs/promises';
import path from 'path';

function parseDescFile(text: string): { main?: string; entries: Record<string, string> } {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const map: Record<string, string> = {};
  let current: string | null = null;
  for (const line of lines) {
    const clean = line.replace(/^\uFEFF/, '');
    const m = clean.match(/^\s*([^:]+):\s*(.*)$/);
    if (m) {
      current = m[1].trim().toLowerCase().replace(/^\uFEFF/, '');
      map[current] = m[2] ?? '';
    } else if (current) {
      map[current] += (map[current] ? '\n' : '') + line;
    }
  }
  return { main: map['main'], entries: map };
}

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

export async function GET(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const projects = await getProjectsByUser(userId);
  // Try to enrich descriptions from desc.txt (main: ...)
  const updated: ProjectRecord[] = [];
  await Promise.allSettled(
    projects.map(async (p) => {
      if (!p.storageLocation) return;
      try {
        const filePath = path.join(p.storageLocation, 'desc.txt');
        const content = await fs.readFile(filePath, 'utf8');
        const parsed = parseDescFile(content);
        if (parsed.main && parsed.main !== p.description) {
          const np = { ...p, description: parsed.main };
          updated.push(np);
        }
      } catch {
        // Ignore filesystem errors (e.g., permissions/UNC auth). Keep existing description.
      }
    })
  );
  if (updated.length > 0) {
    await Promise.allSettled(updated.map((u) => upsertProject(u)));
    // Merge updated items into projects array for response
    for (const u of updated) {
      const idx = projects.findIndex((x) => x.id === u.id);
      if (idx >= 0) projects[idx] = u;
    }
  }
  return NextResponse.json({ projects }, { headers });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const body = (await req.json()) as Partial<ProjectRecord> & { id?: string };
    const id = body.id || Date.now().toString();
    const record: ProjectRecord = {
      id,
      userId,
      name: body.name || 'Untitled',
      description: body.description || '',
      thumbnail: body.thumbnail,
      media: body.media || [],
      storageLocation: body.storageLocation || '',
      connectionType: body.connectionType,
      connectionPath: body.connectionPath,
      organization: (body as any).organization,
    };
  // Try to populate description from desc.txt (main) if available
  if (record.storageLocation) {
      try {
    const filePath = path.join(record.storageLocation, 'desc.txt');
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = parseDescFile(content);
    if (parsed.main) record.description = parsed.main;
      } catch {
        // ignore fs errors
      }
      // Ensure standard media subfolders exist (photos, videos, models)
      try {
        const subFolders = ['photos', 'videos', 'models'];
        await Promise.all(
          subFolders.map((sf) => fs.mkdir(path.join(record.storageLocation, sf), { recursive: true }))
        );
      } catch {
        // ignore folder creation errors (e.g., permissions)
      }
    }
    await upsertProject(record);
    return NextResponse.json({ project: record }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}

export async function DELETE(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids[] required' }, { status: 400, headers });
    const removed = await deleteProjects(userId, ids.map(String));
    return NextResponse.json({ removed }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}
