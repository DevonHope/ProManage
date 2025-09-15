import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, Alert } from 'react-native';
import { Appbar, Button, Checkbox, Dialog, Portal, Text, TextInput, Card, IconButton, HelperText, List, RadioButton, ActivityIndicator } from 'react-native-paper';

interface MediaItem {
  uri: string;
  description: string;
  type: 'image' | 'video' | 'model';
}

interface Project {
  id: string;
  name: string;
  description: string;
  thumbnail?: string;
  media?: MediaItem[];
  storageLocation: string;
  connectionType?: 'nas' | 'git';
  connectionPath?: string;
  organization?: string;
}

const initialProjects: Project[] = [];

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:3000';

export default function ProjectPortal() {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [mediaDialogVisible, setMediaDialogVisible] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'model'>('image');
  const [mediaUri, setMediaUri] = useState('');
  const [mediaDescription, setMediaDescription] = useState('');
  // Track files chosen via web file input and native paths chosen via Tauri
  const webPickedFilesRef = useRef<{ files: File[]; type: 'image' | 'video' | 'model' } | null>(null);
  const nativePickedPathsRef = useRef<{ paths: string[]; type: 'image' | 'video' | 'model' } | null>(null);
  const [connectionType, setConnectionType] = useState<'nas' | 'git'>('nas');
  const [connectionPath, setConnectionPath] = useState('');
  const [connectionSectionExpanded, setConnectionSectionExpanded] = useState(false);
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [importType, setImportType] = useState<'single' | 'batch'>('single');
  const [importConnectionType, setImportConnectionType] = useState<'nas' | 'git'>('nas');
  const [importPath, setImportPath] = useState('');
  const [importOrg, setImportOrg] = useState('');
  const [gitProvider, setGitProvider] = useState<'github' | 'gitlab' | 'gitea'>('github');
  const [gitBaseUrl, setGitBaseUrl] = useState('');
  // Track which project cards are expanded
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Add authentication state for import dialog
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  // Git personal access token for import/connect flows (avoid name clash with JWT authToken)
  const [gitToken, setGitTokenInput] = useState('');
  const [authSshKey, setAuthSshKey] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // User settings state
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsDefaultConn, setSettingsDefaultConn] = useState<'nas' | 'git'>('nas');
  const [settingsUser, setSettingsUser] = useState('');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsInfo, setSettingsInfo] = useState<string | null>(null);
  const [settingsGitToken, setSettingsGitToken] = useState('');

  // Add local state for modal fields
  const [modalName, setModalName] = useState('');
  const [modalDescription, setModalDescription] = useState('');

  // Generic browse plumbing (works in Tauri and web fallback)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingBrowseSetter = useRef<((p: string) => void) | null>(null);
  const [browseIsDirectory, setBrowseIsDirectory] = useState(true);
  const [browseAllowMultiple, setBrowseAllowMultiple] = useState<boolean>(false);
  // Keep the current browse mode in a ref to avoid setState timing during programmatic clicks
  const browseModeRef = useRef<{ directory: boolean; multiple: boolean }>({ directory: true, multiple: false });

  const handleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const toggleExpanded = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Load token from localStorage and fetch profile/projects
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('pm_token') : null;
    if (stored) {
      setAuthToken(stored);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!authToken) return;
      try {
        const me = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } });
        if (!me.ok) throw new Error('Auth expired');
        const meJson = await me.json();
        setCurrentUser(meJson.user);
        // Try to reconnect GitHub if user has saved credentials
        try {
          await fetch(`${API_BASE}/api/github-connect`, { headers: { Authorization: `Bearer ${authToken}` } });
        } catch {}
        setLoadingProjects(true);
        const res = await fetch(`${API_BASE}/api/projects`, { headers: { Authorization: `Bearer ${authToken}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load projects');
        // Map backend records to UI shape (drop userId)
        const mapped: Project[] = (data.projects || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          thumbnail: p.thumbnail,
          media: p.media,
          storageLocation: p.storageLocation,
          connectionType: p.connectionType,
          connectionPath: p.connectionPath,
        }));
        setProjects(mapped);
        // Load user settings
        const sres = await fetch(`${API_BASE}/api/settings`, { headers: { Authorization: `Bearer ${authToken}` } });
        const sjson = await sres.json();
        if (sres.ok && sjson.settings) {
          if (sjson.settings.defaultConnectionType) setSettingsDefaultConn(sjson.settings.defaultConnectionType);
          if (sjson.settings.connectionUsername) setSettingsUser(sjson.settings.connectionUsername);
          const st = sjson.settings || {};
          if (st.githubConnected) setGitProvider('github');
          if (st.giteaConnected) { setGitProvider('gitea'); if (st.giteaBaseUrl) setGitBaseUrl(st.giteaBaseUrl); }
          if (st.gitlabConnected) { setGitProvider('gitlab'); if (st.gitlabBaseUrl) setGitBaseUrl(st.gitlabBaseUrl); }
        }
      } catch (e) {
        // token invalid; clear
        setAuthToken(null);
        setCurrentUser(null);
        if (typeof window !== 'undefined') localStorage.removeItem('pm_token');
      } finally {
        setLoadingProjects(false);
      }
    };
    load();
  }, [authToken]);

  // When opening modal, initialize local state
  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setModalName(project.name);
    setModalDescription(project.description);
  if (project.connectionType) setConnectionType(project.connectionType);
  if (project.connectionPath) setConnectionPath(project.connectionPath);
    setModalVisible(true);
  };
  const handleCreate = () => {
    setEditingProject(null);
    setModalName('');
    setModalDescription('');
  setConnectionType('nas');
  setConnectionPath('');
    setModalVisible(true);
  };

  // Update handleSave to use local state
  const handleSave = async (project: Project | null) => {
    const updatedProject = {
      ...(project || {}),
      id: project?.id || Date.now().toString(),
      name: modalName,
      description: modalDescription,
  storageLocation: connectionPath || project?.storageLocation || '',
  connectionType: connectionType || project?.connectionType,
  connectionPath: connectionPath || project?.connectionPath,
      media: project?.media || [],
    };
    if (editingProject) {
      setProjects((prev) => prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)));
    } else {
      setProjects((prev) => [...prev, updatedProject]);
    }
    // Persist to backend if logged in
    if (authToken) {
      try {
        const resp = await fetch(`${API_BASE}/api/projects`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify(updatedProject),
        });
        if (resp.ok) {
          const data = await resp.json();
          const saved = data.project as Project;
          setProjects((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)));

          // If this is a Git connection, ask backend to fetch README and update description
    if ((updatedProject.connectionType || saved.connectionType) === 'git' && connectionPath) {
            try {
              if (currentUser) {
                const username = settingsUser;
                const password = settingsPassword;
                const gResp = await fetch(`${API_BASE}/api/github-import`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: gitProvider, baseUrl: gitBaseUrl || undefined, repoUrl: connectionPath, username, password, token: settingsGitToken || undefined, projectId: saved.id, userId: currentUser.id }),
                });
                const gJson = await gResp.json();
                if (gResp.ok && gJson.description) {
                  setProjects((prev) => prev.map((p) => (p.id === saved.id ? { ...p, description: (gJson.description as string).trim() } : p)));
                }
              }
            } catch {}
          }

          // 1) Upload any files picked on web via multipart/form-data
          if (webPickedFilesRef.current && webPickedFilesRef.current.files.length > 0) {
            const fd = new FormData();
            fd.append('id', saved.id);
            fd.append('type', webPickedFilesRef.current.type);
            for (const f of webPickedFilesRef.current.files) {
              fd.append('file', f, (f as any).name || 'file');
            }
            try {
              const up = await fetch(`${API_BASE}/api/projects/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${authToken}` },
                body: fd,
              });
              const uj = await up.json();
              if (up.ok && uj.project) {
                setProjects((prev) => prev.map((p) => (p.id === uj.project.id ? { ...p, ...uj.project } : p)));
              }
            } catch {}
            webPickedFilesRef.current = null;
          }

          // 2) Upload any native-picked file paths (Tauri) via JSON sources -> backend copies them
          if (nativePickedPathsRef.current && nativePickedPathsRef.current.paths.length > 0) {
            try {
              const up2 = await fetch(`${API_BASE}/api/projects/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ id: saved.id, type: nativePickedPathsRef.current.type, sources: nativePickedPathsRef.current.paths }),
              });
              const uj2 = await up2.json();
              if (up2.ok && uj2.project) {
                setProjects((prev) => prev.map((p) => (p.id === uj2.project.id ? { ...p, ...uj2.project } : p)));
              }
            } catch {}
            nativePickedPathsRef.current = null;
          }
        }
      } catch {}
    }
    setModalVisible(false);
  };

  const handleDelete = async () => {
    setProjects((prev) => prev.filter((p) => !selected.includes(p.id)));
    if (authToken && selected.length > 0) {
      try {
        await fetch(`${API_BASE}/api/projects`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ ids: selected }),
        });
      } catch {}
    }
    setSelected([]);
  };

  const handleAddMedia = () => {
    if (!editingProject) return;
    const updatedMedia = [
      ...(editingProject.media || []),
      { uri: mediaUri, description: mediaDescription, type: mediaType },
    ];
    setEditingProject({ ...editingProject, media: updatedMedia });
    setMediaDialogVisible(false);
    setMediaUri('');
    setMediaDescription('');
  };

  const handleImport = async (desc?: string) => {
    if (importType === 'single') {
      const newId = Date.now().toString();
      const payload = {
        id: newId,
        name: importPath.split(/[\\/]/).pop() || 'Imported Project',
        description: desc ?? '',
        storageLocation: importPath,
        connectionType: importConnectionType,
        connectionPath: importPath,
      };
      setProjects((prev) => [...prev, payload]);
      if (authToken) {
        try {
          const resp = await fetch(`${API_BASE}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify(payload),
          });
          if (resp.ok) {
            const data = await resp.json();
            const saved = data.project as Project;
            setProjects((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)));
            // Immediately refresh to scan media folders and desc.txt
            try {
              const r = await fetch(`${API_BASE}/api/projects/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ id: saved.id })
              });
              const rj = await r.json();
              if (r.ok && rj.project) {
                const updated = rj.project as Project;
                setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
              }
            } catch {}
          }
        } catch {}
      }
    } else {
      const paths = importPath.split(/[.,\n]+/).map((p) => p.trim()).filter(Boolean);
      const newItems = paths.map((path) => ({
        id: Date.now().toString() + Math.random(),
        name: path.split(/[\\/]/).pop() || 'Imported Project',
        description: '',
        storageLocation: path,
        connectionType: importConnectionType,
        connectionPath: path,
        organization: importOrg,
      }));
      setProjects((prev) => [...prev, ...newItems]);
      if (authToken) {
        for (const item of newItems) {
          try {
            const resp = await fetch(`${API_BASE}/api/projects`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
              body: JSON.stringify(item),
            });
            if (resp.ok) {
              const data = await resp.json();
              const saved = data.project as Project;
              setProjects((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)));
              // Refresh each saved project to load media
              try {
                const r = await fetch(`${API_BASE}/api/projects/refresh`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                  body: JSON.stringify({ id: saved.id })
                });
                const rj = await r.json();
                if (r.ok && rj.project) {
                  const updated = rj.project as Project;
                  setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
                }
              } catch {}
            }
          } catch {}
        }
      }
    }
    setImportDialogVisible(false);
    setImportPath('');
    setImportOrg('');
  };

  // Add authentication handler
  const handleImportAuth = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const username = authUsername || settingsUser;
      const password = authPassword || settingsPassword;
      if (!importPath) {
        throw new Error('Path/URL is required');
      }
      if (importConnectionType === 'nas') {
        if (!username || !password) {
          throw new Error('NAS username and password are required');
        }
        const res = await fetch(`${API_BASE}/api/nas-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nasPath: importPath, username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'NAS authentication failed');
        handleImport(data.description);
      } else {
        // Git import flow (GitHub/GitLab/Gitea): verify credentials; do not create projects if auth fails
        if (!authToken || !currentUser) throw new Error('Login required');
        // Verify Git provider credentials via connect endpoint (lightweight user check)
        const check = await fetch(`${API_BASE}/api/github-connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ provider: gitProvider, baseUrl: gitBaseUrl || undefined, username, password, token: gitToken || settingsGitToken || undefined })
        });
        if (!check.ok) {
          const cj = await check.json().catch(() => ({}));
          throw new Error(cj.error || 'GitHub authentication failed');
        }
        const repos = importType === 'batch'
          ? importPath.split(/[.,\n]+/).map((p) => p.trim()).filter(Boolean)
          : [importPath];
        for (const repoUrl of repos) {
          // 1) Create the project record
          const newId = Date.now().toString() + (importType === 'batch' ? Math.floor(Math.random() * 1000) : '');
          const payload = {
            id: newId,
            name: repoUrl.split(/[\\/]/).pop() || 'Imported Project',
            description: '',
            storageLocation: repoUrl,
            connectionType: 'git' as const,
            connectionPath: repoUrl,
            connectionProvider: gitProvider,
            organization: importOrg || undefined,
          };
          setProjects((prev) => [...prev, payload]);
          const cResp = await fetch(`${API_BASE}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify(payload),
          });
          const cJson = await cResp.json();
          if (!cResp.ok) throw new Error(cJson.error || 'Failed to create project');
          const saved: Project = cJson.project;
          setProjects((prev) => prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)));

          // 2) Ask backend to fetch README and update description
          const gResp = await fetch(`${API_BASE}/api/github-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: gitProvider, baseUrl: gitBaseUrl || undefined, repoUrl, username, password, token: gitToken || settingsGitToken || undefined, projectId: saved.id, userId: currentUser.id }),
          });
          const gJson = await gResp.json();
          if (!gResp.ok) {
            // Roll back project creation on failure to authenticate/fetch README
            setProjects((prev) => prev.filter((p) => p.id !== saved.id));
            throw new Error(gJson.error || 'GitHub import failed');
          }
          if (gJson.description) {
            const desc = (gJson.description as string).trim();
            setProjects((prev) => prev.map((p) => (p.id === saved.id ? { ...p, description: desc } : p)));
          }
        }
        // Done
        setImportDialogVisible(false);
        setImportPath('');
        setImportOrg('');
        return;
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const getSortedMedia = (media: MediaItem[] = []) => {
    return {
      images: media.filter((m) => m.type === 'image'),
      videos: media.filter((m) => m.type === 'video'),
      models: media.filter((m) => m.type === 'model'),
    };
  };

  // Handler for browse button
  const handleBrowseGeneric = async (
    onPicked: (path: string) => void,
    options?: { directory?: boolean; multiple?: boolean }
  ) => {
    const pickDir = options?.directory !== false; // default to directory
    const allowMultiple = !!options?.multiple;
  // Track mode in a ref for change handler reliability
  browseModeRef.current = { directory: pickDir, multiple: allowMultiple };
    // First, try Tauri (native)
    if (typeof window !== 'undefined' && ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)) {
      try {
        const w: any = window as any;
        // Use Tauri v1 global dialog if available
        if (w.__TAURI__?.dialog?.open) {
          const selected = await w.__TAURI__.dialog.open({ directory: pickDir, multiple: allowMultiple });
          if (Array.isArray(selected) && selected.length > 0) {
            nativePickedPathsRef.current = { paths: selected as string[], type: mediaType };
            return onPicked(selected[0]);
          }
          if (typeof selected === 'string') {
            nativePickedPathsRef.current = { paths: [selected], type: mediaType };
            return onPicked(selected);
          }
  }
        // Try Tauri v2 plugin without letting web bundlers resolve it
        // eslint-disable-next-line no-new-func
        const dynImport: (m: string) => Promise<any> = new Function('m', 'return import(m)') as any;
        const mod = await dynImport('@tauri-apps/plugin-dialog').catch(() => null);
        if (mod && typeof mod.open === 'function') {
          const selected = await mod.open({ directory: pickDir, multiple: allowMultiple });
          if (Array.isArray(selected) && selected.length > 0) {
            nativePickedPathsRef.current = { paths: selected as string[], type: mediaType };
            return onPicked(pickDir ? selected[0] : selected[0]);
          }
          if (typeof selected === 'string') {
            nativePickedPathsRef.current = { paths: [selected], type: mediaType };
            return onPicked(selected);
          }
        }
      } catch (e) {
        // fall through to web fallback
      }
    }
    // Web fallback: use hidden input
    pendingBrowseSetter.current = onPicked;
    setBrowseIsDirectory(pickDir);
    setBrowseAllowMultiple(allowMultiple);
    // Set attributes directly to avoid timing issues with React state updates
    const inputEl = fileInputRef.current as unknown as HTMLInputElement | null;
    if (inputEl) {
      try { (inputEl as any).value = ''; } catch {}
      // Toggle directory vs file attributes explicitly
      if (pickDir) {
        inputEl.removeAttribute('multiple');
        inputEl.setAttribute('webkitdirectory', '');
        inputEl.setAttribute('directory', '');
      } else {
        inputEl.removeAttribute('webkitdirectory');
        inputEl.removeAttribute('directory');
        if (allowMultiple) inputEl.setAttribute('multiple', ''); else inputEl.removeAttribute('multiple');
      }
      // Click after a microtask to ensure attributes are applied
      setTimeout(() => inputEl.click(), 0);
    }
  };

  // For NAS folder selection: prefer native directory picker in Tauri; on web, prompt for path
  const handleBrowseNasFolder = async (onPicked: (path: string) => void) => {
    const isTauri = typeof window !== 'undefined' && ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
    // Use the generic directory picker in both environments; it will choose native dialog in Tauri and hidden input on web.
    return handleBrowseGeneric(onPicked, { directory: true, multiple: false });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    let chosen = '';
  // For web, remember actual File objects to upload on Save
  webPickedFilesRef.current = { files: Array.from(files), type: mediaType };
  if (browseModeRef.current.directory) {
      // @ts-ignore non-standard property available when picking directories
      const rel: string | undefined = files[0].webkitRelativePath;
      if (rel && rel.includes('/')) {
        // Derive top-level folder from relative path; cannot get absolute path in browsers
        chosen = rel.split('/')[0];
      } else {
        const name = files[0].name || '';
        chosen = name.replace(/\.[^/.]+$/, '');
      }
    } else {
      // Use the file name; browsers cannot provide full absolute filesystem path for security
      chosen = files[0].name || '';
    }
    if (pendingBrowseSetter.current) {
      pendingBrowseSetter.current(chosen);
      pendingBrowseSetter.current = null;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Appbar.Header>
        <Appbar.Content title="ProManage" />
        {currentUser ? (
          <Text style={{ marginRight: 8 }}>Hi, {currentUser.email}</Text>
        ) : null}
        <Button onPress={handleCreate}>Create Project</Button>
        <Button onPress={() => setImportDialogVisible(true)}>Import</Button>
  <Button onPress={() => setSettingsVisible(true)}>Settings</Button>
        {currentUser ? (
          <Button onPress={() => { setAuthToken(null); setCurrentUser(null); if (typeof window !== 'undefined') localStorage.removeItem('pm_token'); }}>Logout</Button>
        ) : (
          <Button onPress={() => setLoginVisible(true)}>Login</Button>
        )}
        {selected.length > 0 && (
          <Button onPress={handleDelete} color="red">Delete Selected</Button>
        )}
      </Appbar.Header>
      {/* Hidden file input for folder/file selection (web fallback), mounted globally */}
      {typeof document !== 'undefined' && (
        // @ts-ignore Allow non-React Native web element
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          // @ts-ignore - non-standard attributes used by Chromium for directory picking
          {...(browseIsDirectory ? { webkitdirectory: true, directory: true } : {})}
          {...(!browseIsDirectory && browseAllowMultiple ? { multiple: true } : {})}
        />
      )}
      {loadingProjects && (
        <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
          <ActivityIndicator />
          <Text style={{ marginLeft: 8 }}>Loading your projects…</Text>
        </View>
      )}
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={{ margin: 8 }} onPress={() => toggleExpanded(item.id)}>
            <Card.Title
              title={item.name}
              left={(props) => (
                <Checkbox
                  status={selected.includes(item.id) ? 'checked' : 'unchecked'}
                  onPress={() => handleSelect(item.id)}
                />
              )}
              right={(props) => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconButton icon="refresh" onPress={async () => {
                    if (!authToken) { Alert.alert('Login required'); return; }
                    try {
                      // Frontend debug: log refresh request
                      // eslint-disable-next-line no-console
                      console.log('Refreshing project', item.id, 'at', `${API_BASE}/api/projects/refresh`);
                      const res = await fetch(`${API_BASE}/api/projects/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                        body: JSON.stringify({ id: item.id })
                      });
                      const data = await res.json();
                      // eslint-disable-next-line no-console
                      console.log('Refresh response ok?', res.ok, data);
                      if (!res.ok) throw new Error(data.error || 'Refresh failed');
                      const updated = data.project as Project;
                      setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
                    } catch (e: any) {
                      Alert.alert('Refresh error', e.message);
                    }
                  }} />
                  <IconButton icon="pencil" onPress={() => handleEdit(item)} />
                </View>
              )}
            />
            <Card.Content>
              {!!item.description && (
                <Text>
                  {item.description.replace(/\r?\n/g, '\n').replace(/ /g, '\u00A0')}
                </Text>
              )}
              <Text>Storage: {item.storageLocation}</Text>
              {expandedCards[item.id] && (
                <View style={{ marginTop: 8 }}>
                  {(() => {
                    const sorted = getSortedMedia(item.media || []);
                    const bn = (u: string) => (u?.split(/[\\/]/).pop() || u);
                    const preview = (arr: MediaItem[]) => arr.slice(0, 3).map(m => bn(m.uri)).join(', ');
                    return (
                      <>
                        <Text>Images: {(sorted.images || []).length}{sorted.images.length ? ` — ${preview(sorted.images)}` : ''}</Text>
                        <Text>Videos: {(sorted.videos || []).length}{sorted.videos.length ? ` — ${preview(sorted.videos)}` : ''}</Text>
                        <Text>Models: {(sorted.models || []).length}{sorted.models.length ? ` — ${preview(sorted.models)}` : ''}</Text>
                      </>
                    );
                  })()}
                </View>
              )}
            </Card.Content>
          </Card>
        )}
      />
      <Portal>
        <Dialog visible={modalVisible} onDismiss={() => setModalVisible(false)}>
          <Dialog.Title>{editingProject ? 'Edit Project' : 'Create Project'}</Dialog.Title>
          <Dialog.Content>
            {/* Collapsible Project Storage Connection section */}
            <List.Accordion
              title="Project Storage Connection"
              expanded={connectionSectionExpanded}
              onPress={() => setConnectionSectionExpanded(!connectionSectionExpanded)}
              style={{ marginBottom: 8 }}
            >
              <Button
                mode={connectionType === 'nas' ? 'contained' : 'outlined'}
                onPress={() => setConnectionType('nas')}
                style={{ marginBottom: 4 }}
              >
                NAS Folder
              </Button>
              <Button
                mode={connectionType === 'git' ? 'contained' : 'outlined'}
                onPress={() => setConnectionType('git')}
                style={{ marginBottom: 8 }}
              >
                Git Repository
              </Button>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  label={connectionType === 'nas' ? 'NAS Folder Path' : 'Git Repository URL or Local Repo Folder'}
                  value={connectionPath}
                  onChangeText={setConnectionPath}
                  style={{ flex: 1, marginBottom: 8 }}
                />
                <Button
                  style={{ marginLeft: 8, marginBottom: 8 }}
                  onPress={() => handleBrowseNasFolder(setConnectionPath)}
                >
                  Browse
                </Button>
              </View>
              <HelperText type="info">
                {connectionType === 'nas'
                  ? 'Enter the network path to the shared folder (e.g. \\NAS\\Projects\\MyProject) or pick a folder.'
                  : 'Enter the Git URL (https/ssh) or pick a local repo folder.'}
              </HelperText>
            </List.Accordion>
            <TextInput label="Name" value={modalName} onChangeText={setModalName} />
            <TextInput label="Description" value={modalDescription} onChangeText={setModalDescription} multiline />
            {/* Add thumbnail, images, videos, storage location fields here */}
            <Button onPress={() => setMediaDialogVisible(true)} style={{ marginTop: 8 }}>
              Upload Media
            </Button>
            {editingProject && editingProject.media && (
              <View style={{ marginTop: 16 }}>
                <Text>Images:</Text>
                {getSortedMedia(editingProject.media).images.map((m, i) => (
                  <Text key={i}>- {m.uri} ({m.description})</Text>
                ))}
                <Text style={{ marginTop: 8 }}>Videos:</Text>
                {getSortedMedia(editingProject.media).videos.map((m, i) => (
                  <Text key={i}>- {m.uri} ({m.description})</Text>
                ))}
                <Text style={{ marginTop: 8 }}>3D Models:</Text>
                {getSortedMedia(editingProject.media).models.map((m, i) => (
                  <Text key={i}>- {m.uri} ({m.description})</Text>
                ))}
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setModalVisible(false)}>Cancel</Button>
            <Button onPress={() => handleSave(editingProject)}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={mediaDialogVisible} onDismiss={() => setMediaDialogVisible(false)}>
          <Dialog.Title>Upload Media</Dialog.Title>
          <Dialog.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput label="Media URI or Path" value={mediaUri} onChangeText={setMediaUri} style={{ flex: 1 }} />
              <Button onPress={() => handleBrowseGeneric(setMediaUri, { directory: false, multiple: true })} style={{ marginLeft: 8 }}>
                Browse
              </Button>
            </View>
            <TextInput label="Description" value={mediaDescription} onChangeText={setMediaDescription} />
            <Button onPress={() => setMediaType('image')} mode={mediaType === 'image' ? 'contained' : 'outlined'} style={{ marginTop: 8 }}>Image</Button>
            <Button onPress={() => setMediaType('video')} mode={mediaType === 'video' ? 'contained' : 'outlined'} style={{ marginTop: 8 }}>Video</Button>
            <Button onPress={() => setMediaType('model')} mode={mediaType === 'model' ? 'contained' : 'outlined'} style={{ marginTop: 8 }}>3D Model</Button>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setMediaDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleAddMedia}>Add</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={importDialogVisible} onDismiss={() => setImportDialogVisible(false)}>
          <Dialog.Title>Import Project(s)</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={v => setImportType(v as 'single' | 'batch')} value={importType}>
              <RadioButton.Item label="Single Project" value="single" />
              <RadioButton.Item label="Batch Import (multiple projects)" value="batch" />
            </RadioButton.Group>
            <RadioButton.Group onValueChange={v => setImportConnectionType(v as 'nas' | 'git')} value={importConnectionType || settingsDefaultConn}>
              <RadioButton.Item label="NAS Folder" value="nas" />
              <RadioButton.Item label="Git Repository" value="git" />
            </RadioButton.Group>
            {(importConnectionType || settingsDefaultConn) === 'git' && (
              <>
                <List.Subheader>Git Provider</List.Subheader>
                <RadioButton.Group onValueChange={(v) => setGitProvider(v as any)} value={gitProvider}>
                  <RadioButton.Item label="GitHub" value="github" />
                  <RadioButton.Item label="GitLab" value="gitlab" />
                  <RadioButton.Item label="Gitea (self-hosted)" value="gitea" />
                </RadioButton.Group>
                {gitProvider !== 'github' && (
                  <TextInput label="Base URL (e.g. https://gitlab.myco.com)" value={gitBaseUrl} onChangeText={setGitBaseUrl} style={{ marginBottom: 8 }} />
                )}
              </>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <TextInput
                style={{ flex: 1 }}
                label={importType === 'single' ? (importConnectionType === 'nas' ? 'NAS Folder Path' : 'Git Repository URL or Local Folder') : 'Comma or newline separated list of paths/URLs'}
                value={importPath}
                onChangeText={setImportPath}
                multiline={importType === 'batch'}
              />
              <Button
                onPress={() => handleBrowseNasFolder(setImportPath)}
                style={{ marginLeft: 8 }}
              >
                Browse
              </Button>
            </View>
            {importType === 'batch' && (
              <TextInput
                label="Organization/Business Name (optional)"
                value={importOrg}
                onChangeText={setImportOrg}
                style={{ marginBottom: 8 }}
              />
            )}
            {/* Auth fields */}
      {(importConnectionType || settingsDefaultConn) === 'nas' ? (
              <>
        <TextInput label="NAS Username" value={authUsername || settingsUser} onChangeText={setAuthUsername} style={{ marginBottom: 8 }} />
        <TextInput label="NAS Password" value={authPassword || settingsPassword} onChangeText={setAuthPassword} secureTextEntry style={{ marginBottom: 8 }} />
              </>
            ) : (
              <>
        <TextInput label="Git Username" value={authUsername || settingsUser} onChangeText={setAuthUsername} style={{ marginBottom: 8 }} />
        <TextInput label="Git Password" value={authPassword || settingsPassword} onChangeText={setAuthPassword} secureTextEntry style={{ marginBottom: 8 }} />
  <TextInput label="Git Personal Access Token (optional)" value={gitToken || settingsGitToken} onChangeText={setGitTokenInput} secureTextEntry style={{ marginBottom: 8 }} />
                <TextInput label="SSH Key (optional)" value={authSshKey} onChangeText={setAuthSshKey} style={{ marginBottom: 8 }} multiline />
              </>
            )}
            {authError && (
              <HelperText type="error" visible={true} style={{ marginBottom: 8 }}>
                {authError}
              </HelperText>
            )}
            <HelperText type="info">
              {importType === 'single'
                ? 'Enter the NAS folder path or Git repo URL.'
                : 'Enter one path/URL per line or comma separated. All will be imported under the given organization.'}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setImportDialogVisible(false)}>Cancel</Button>
            <Button loading={authLoading} onPress={handleImportAuth}>Authenticate & Import</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Login/Register Dialog */}
        <Dialog visible={loginVisible} onDismiss={() => setLoginVisible(false)}>
          <Dialog.Title>{loginMode === 'login' ? 'Sign In' : 'Create Account'}</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Email" value={loginEmail} onChangeText={setLoginEmail} style={{ marginBottom: 8 }} autoCapitalize="none" />
            <TextInput label="Password" value={loginPassword} onChangeText={setLoginPassword} secureTextEntry style={{ marginBottom: 8 }} />
            <HelperText type="info">Your projects will sync to your account.</HelperText>
            {loginError && <HelperText type="error">{loginError}</HelperText>}
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <Button mode={loginMode === 'login' ? 'contained' : 'text'} onPress={() => setLoginMode('login')}>Sign In</Button>
              <Button mode={loginMode === 'register' ? 'contained' : 'text'} onPress={() => setLoginMode('register')} style={{ marginLeft: 8 }}>Register</Button>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLoginVisible(false)}>Cancel</Button>
            <Button onPress={async () => {
              setLoginError(null);
              try {
                const res = await fetch(`${API_BASE}/api/auth/${loginMode === 'login' ? 'login' : 'register'}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: loginEmail, password: loginPassword }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Authentication failed');
                setAuthToken(data.token);
                if (typeof window !== 'undefined') localStorage.setItem('pm_token', data.token);
                setCurrentUser(data.user);
                setLoginVisible(false);
              } catch (e: any) {
                setLoginError(e.message);
              }
            }}>Continue</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog visible={settingsVisible} onDismiss={() => setSettingsVisible(false)}>
          <Dialog.Title>User Settings</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={(v) => setSettingsDefaultConn(v as 'nas' | 'git')} value={settingsDefaultConn}>
              <RadioButton.Item label="Default: NAS" value="nas" />
              <RadioButton.Item label="Default: Git" value="git" />
            </RadioButton.Group>
            <TextInput label="Connection Username" value={settingsUser} onChangeText={setSettingsUser} style={{ marginBottom: 8 }} />
            <TextInput label="Connection Password" value={settingsPassword} onChangeText={setSettingsPassword} secureTextEntry style={{ marginBottom: 8 }} />
            <List.Subheader>Git Providers</List.Subheader>
            <HelperText type="info">Connect your Git provider to enable README auto-imports.</HelperText>
            <RadioButton.Group onValueChange={(v) => setGitProvider(v as any)} value={gitProvider}>
              <RadioButton.Item label="GitHub" value="github" />
              <RadioButton.Item label="GitLab" value="gitlab" />
              <RadioButton.Item label="Gitea (self-hosted)" value="gitea" />
            </RadioButton.Group>
            {gitProvider !== 'github' && (
              <TextInput label="Base URL" value={gitBaseUrl} onChangeText={setGitBaseUrl} style={{ marginBottom: 8 }} />
            )}
      <TextInput label="Git Token (optional, recommended for GitHub)" value={settingsGitToken} onChangeText={setSettingsGitToken} secureTextEntry style={{ marginBottom: 8 }} />
            <Button
              mode="outlined"
              onPress={async () => {
                if (!authToken) { setSettingsInfo('Login required.'); return; }
                try {
                  const res = await fetch(`${API_BASE}/api/github-connect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ provider: gitProvider, baseUrl: gitBaseUrl || undefined, username: settingsUser, password: settingsPassword, token: settingsGitToken || undefined })
                  });
                  const j = await res.json();
                  if (!res.ok) throw new Error(j.error || 'Git provider connect failed');
                  setSettingsInfo('Git provider connected.');
                } catch (e: any) {
                  setSettingsInfo(e.message);
                }
              }}
              style={{ marginTop: 8 }}
            >Connect Provider</Button>
            {settingsInfo && <HelperText type="info">{settingsInfo}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSettingsVisible(false)}>Cancel</Button>
            <Button onPress={async () => {
              if (!authToken) { setSettingsInfo('Login required.'); return; }
              setSettingsInfo(null);
              try {
                const res = await fetch(`${API_BASE}/api/settings`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
                  body: JSON.stringify({
                    defaultConnectionType: settingsDefaultConn,
                    connectionUsername: settingsUser,
                    connectionPassword: settingsPassword || undefined,
                    githubToken: settingsGitToken || undefined,
                  })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to save settings');
                // Optionally check GitHub credentials by calling the endpoint with a harmless repo when default is git
                if (settingsDefaultConn === 'git' && settingsUser && settingsPassword && importPath) {
                  try {
                    await fetch(`${API_BASE}/api/github-import`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ provider: gitProvider, baseUrl: gitBaseUrl || undefined, repoUrl: importPath, username: settingsUser, password: settingsPassword, token: settingsGitToken || undefined, projectId: 'noop', userId: currentUser?.id || 'noop' })
                    });
                  } catch {}
                }
                setSettingsInfo('Saved.');
              } catch (e: any) {
                setSettingsInfo(e.message);
              }
            }}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
