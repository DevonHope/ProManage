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

function folderForType(t: string): 'photos' | 'videos' | 'models' {
  if (t === 'image') return 'photos';
  if (t === 'video') return 'videos';
  return 'models';
}

function sanitizeFileName(name: string): string {
  // Strip path separators and control characters
  return name.replace(/[\\\/\0\x00-\x1F\x7F]+/g, '').replace(/[\:\*\?\"\<\>\|]/g, '_').trim() || 'file';
}

async function ensureUniqueFilePath(fp: string): Promise<string> {
  const dir = path.dirname(fp);
  const base = path.basename(fp, path.extname(fp));
  const ext = path.extname(fp);
  let candidate = fp;
  let i = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${base} (${i})${ext}`);
      i++;
    } catch {
      return candidate;
    }
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const contentType = req.headers.get('content-type') || '';
    const store = await readStore();
    let id: string = '';
    let type: string = '';
    let savedItems: ProjectRecord['media'] = [];

    // Locate project helper
    const getProject = async (pid: string) => {
      const idx = store.projects.findIndex(p => p.userId === userId && p.id === pid);
      if (idx < 0) return { idx: -1, proj: null as any };
      return { idx, proj: store.projects[idx] };
    };

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      id = String(form.get('id') || '');
      type = String(form.get('type') || '');
      if (!id || !type) return NextResponse.json({ error: 'id and type required' }, { status: 400, headers });
      const files = form.getAll('file') as unknown as File[];
      if (!files || files.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400, headers });

      const { idx, proj } = await getProject(id);
      if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
      if (!proj.storageLocation) return NextResponse.json({ error: 'No storageLocation' }, { status: 400, headers });

      const subFolder = folderForType(type);
      const destRoot = path.join(proj.storageLocation, subFolder);
      try { await fs.mkdir(destRoot, { recursive: true }); } catch {}

      for (const f of files) {
        // Some environments may pass nulls; skip
        if (!f || typeof (f as any).arrayBuffer !== 'function') continue;
        const origName = sanitizeFileName((f as any).name || 'file');
        const targetPath0 = path.join(destRoot, origName);
        const targetPath = await ensureUniqueFilePath(targetPath0);
        const ab = await (f as any).arrayBuffer();
        await fs.writeFile(targetPath, Buffer.from(ab));
        savedItems.push({ uri: targetPath, description: origName, type: type as any });
      }

      const currentMedia = Array.isArray(proj.media) ? proj.media : [];
      const updated: ProjectRecord = { ...proj, media: [...currentMedia, ...savedItems] };
      store.projects[idx] = updated;
      await writeStore(store);
      return NextResponse.json({ project: updated, saved: savedItems?.length ?? 0 }, { headers });
    }

    // JSON body: { id, type, sources: string[] } -> copy local files
    const body = (await req.json()) as { id?: string; type?: string; sources?: string[] };
    id = String(body.id || '');
    type = String(body.type || '');
    const sources = Array.isArray(body.sources) ? body.sources : [];
    if (!id || !type || sources.length === 0) return NextResponse.json({ error: 'id, type, and sources[] required' }, { status: 400, headers });

    const { idx, proj } = await getProject(id);
    if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
    if (!proj.storageLocation) return NextResponse.json({ error: 'No storageLocation' }, { status: 400, headers });

    const subFolder = folderForType(type);
    const destRoot = path.join(proj.storageLocation, subFolder);
    try { await fs.mkdir(destRoot, { recursive: true }); } catch {}

    for (const src of sources) {
      const safeName = sanitizeFileName(path.basename(src));
      const targetPath0 = path.join(destRoot, safeName);
      const targetPath = await ensureUniqueFilePath(targetPath0);
      try {
        const buf = await fs.readFile(src);
        await fs.writeFile(targetPath, buf);
        savedItems.push({ uri: targetPath, description: safeName, type: type as any });
      } catch {}
    }

    const currentMedia = Array.isArray(proj.media) ? proj.media : [];
    const updated: ProjectRecord = { ...proj, media: [...currentMedia, ...savedItems] };
    store.projects[idx] = updated;
    await writeStore(store);
    return NextResponse.json({ project: updated, saved: savedItems?.length ?? 0 }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500, headers });
  }
}
