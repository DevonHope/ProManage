import { promises as fs } from 'fs';
import path from 'path';

export interface MediaItem {
  uri: string;
  description: string;
  type: 'image' | 'video' | 'model';
}

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  thumbnail?: string;
  media?: MediaItem[];
  storageLocation: string;
  connectionType?: 'nas' | 'git';
  connectionPath?: string;
  connectionProvider?: 'github' | 'gitlab' | 'gitea';
  organization?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
}

interface StoreData {
  users: UserRecord[];
  projects: ProjectRecord[];
  settings?: Record<string, UserSettings>;
}

const dataDir = path.join(process.cwd(), 'data');
const storePath = path.join(dataDir, 'store.json');

async function ensureStore() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.access(storePath);
  } catch {
  const initial: StoreData = { users: [], projects: [], settings: {} };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf-8');
  }
}

export async function readStore(): Promise<StoreData> {
  await ensureStore();
  const raw = await fs.readFile(storePath, 'utf-8');
  try {
    return JSON.parse(raw) as StoreData;
  } catch {
  const initial: StoreData = { users: [], projects: [], settings: {} };
    await fs.writeFile(storePath, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

export async function writeStore(data: StoreData): Promise<void> {
  await ensureStore();
  await fs.writeFile(storePath, JSON.stringify(data, null, 2), 'utf-8');
}

export interface UserSettings {
  defaultConnectionType?: 'nas' | 'git';
  connectionUsername?: string;
  // Store encrypted
  connectionPasswordEnc?: string;
  // GitHub account linkage (stored encrypted where applicable)
  githubUsername?: string;
  githubPasswordEnc?: string; // for demo; prefer tokens in production
  githubTokenEnc?: string; // store PAT securely
  githubConnected?: boolean;
  // Gitea
  giteaBaseUrl?: string;
  giteaUsername?: string;
  giteaPasswordEnc?: string;
  giteaTokenEnc?: string;
  giteaConnected?: boolean;
  // GitLab
  gitlabBaseUrl?: string; // default https://gitlab.com
  gitlabUsername?: string;
  gitlabPasswordEnc?: string;
  gitlabTokenEnc?: string;
  gitlabConnected?: boolean;
}

export async function getUserSettings(userId: string): Promise<UserSettings | undefined> {
  const store = await readStore();
  return store.settings?.[userId];
}

export async function setUserSettings(userId: string, settings: UserSettings): Promise<UserSettings> {
  const store = await readStore();
  if (!store.settings) store.settings = {};
  store.settings[userId] = settings;
  await writeStore(store);
  return settings;
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const store = await readStore();
  return store.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

export async function createUser(user: UserRecord): Promise<UserRecord> {
  const store = await readStore();
  store.users.push(user);
  await writeStore(store);
  return user;
}

export async function getProjectsByUser(userId: string): Promise<ProjectRecord[]> {
  const store = await readStore();
  return store.projects.filter(p => p.userId === userId);
}

export async function upsertProject(project: ProjectRecord): Promise<ProjectRecord> {
  const store = await readStore();
  const idx = store.projects.findIndex(p => p.id === project.id && p.userId === project.userId);
  if (idx >= 0) {
    store.projects[idx] = project;
  } else {
    store.projects.push(project);
  }
  await writeStore(store);
  return project;
}

export async function deleteProjects(userId: string, ids: string[]): Promise<number> {
  const store = await readStore();
  const before = store.projects.length;
  store.projects = store.projects.filter(p => p.userId !== userId || !ids.includes(p.id));
  await writeStore(store);
  return before - store.projects.length;
}
