import { NextRequest, NextResponse } from 'next/server';
import { verifyJwt } from '@/lib/auth';
import { readStore, writeStore, ProjectRecord } from '@/lib/store';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

function cors(req: NextRequest) {
  const origin = req.headers.get('origin') ?? '*';
  const reqMethod = req.headers.get('access-control-request-method') ?? 'POST, OPTIONS';
  const reqHeaders = req.headers.get('access-control-request-headers') ?? 'Content-Type, Authorization';
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': reqMethod, 'Access-Control-Allow-Headers': reqHeaders, Vary: 'Origin' } as Record<string, string>;
}

function getUserId(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = token ? verifyJwt<{ sub: string }>(token) : null;
  return payload?.sub || null;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(fp);
    } else if (e.isFile()) {
      yield fp;
    }
  }
}

function mediaTypeFor(file: string): 'image' | 'video' | 'model' | null {
  const ext = path.extname(file).toLowerCase();
  const images = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff']);
  const videos = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
  const models = new Set(['.obj', '.fbx', '.gltf', '.glb', '.stl', '.dae']);
  if (images.has(ext)) return 'image';
  if (videos.has(ext)) return 'video';
  if (models.has(ext)) return 'model';
  return null;
}

function parseDescFile(text: string): { main?: string; entries: Record<string, string> } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const map: Record<string, string> = {};
  let current: string | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (m) {
      current = m[1].trim().toLowerCase();
      map[current] = m[2] ?? '';
    } else if (current) {
      map[current] += (map[current] ? '\n' : '') + line;
    }
  }
  return { main: map['main'], entries: map };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers });
    const store = await readStore();
    const idx = store.projects.findIndex(p => p.userId === userId && p.id === String(id));
    if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
    const proj = store.projects[idx];
    const base = proj.storageLocation;
    if (!base) return NextResponse.json({ error: 'No storageLocation' }, { status: 400, headers });

    // Parse descriptions from desc.txt
    let description = proj.description || '';
    let descEntries: Record<string, string> = {};
    try {
      const descPath = path.join(base, 'desc.txt');
      const content = await fs.readFile(descPath, 'utf8');
      const parsed = parseDescFile(content);
      if (parsed.main) description = parsed.main;
      descEntries = parsed.entries || {};
    } catch {}

    const media: ProjectRecord['media'] = [];
    // Scan structured subfolders only
    const subFolders = [
      { name: 'photos', type: 'image' as const },
      { name: 'videos', type: 'video' as const },
      { name: 'models', type: 'model' as const },
    ];
    for (const sf of subFolders) {
      const folder = path.join(base, sf.name);
      let dirents: import('fs').Dirent[] | null = null;
      try {
        dirents = await fs.readdir(folder, { withFileTypes: true, encoding: 'utf8' as BufferEncoding }) as unknown as import('fs').Dirent[];
      } catch { dirents = null; }
      if (!dirents) continue;
      for (const e of dirents) {
        if (!e.isFile()) continue;
        const name = String(e.name);
        const fp = path.join(folder, name);
        const mt = mediaTypeFor(fp) || sf.type;
        const fullKey = name.toLowerCase();
        const baseKey = path.basename(name, path.extname(name)).toLowerCase();
        const mdesc = descEntries[fullKey] || descEntries[baseKey] || '';
        media.push({ uri: fp, description: mdesc || name, type: mt });
      }
    }

  const updated: ProjectRecord = { ...proj, description, media };
    store.projects[idx] = updated;
    await writeStore(store);
    return NextResponse.json({ project: updated }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}
