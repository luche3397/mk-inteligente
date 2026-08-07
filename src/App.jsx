import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CadastroPage, LoginPage } from './components/auth-page';
import { AiPanel } from './components/ai-panel';
import { HtmlViewer } from './components/html-viewer';
import { QuadroCanvas } from './components/quadro-canvas';
import { PrivateLibrary } from './components/private-library';
import { PublicLibrary } from './components/public-library';
import { Sidebar } from './components/sidebar';
import { TabBar } from './components/tab-bar';
import { useAuth } from './state/auth-context';
import { useDashboard } from './state/dashboard-context';
import { detectTabType } from './utils/dashboard';
import { supabase } from '@/supabaseClient';

const AUTH_PATHS = ['/login', '/cadastro'];
const TAB_STATUSES = ['novo', 'em revisão', 'aprovado', 'publicado'];
const MarkdownEditor = lazy(() =>
  import('./components/markdown-editor').then((module) => ({ default: module.MarkdownEditor })),
);

const sanitizeFileName = (name) => {
  const extensionIndex = name.lastIndexOf('.');
  const baseName = extensionIndex === -1 ? name : name.slice(0, extensionIndex);
  const extension = extensionIndex === -1 ? '' : name.slice(extensionIndex).toLowerCase();

  const normalizedBase = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${normalizedBase || 'modulo'}${extension}`;
};

const getFilePathFromUrl = (url) => {
  const parts = url.split('/modules/');
  return parts[1] ?? '';
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const buildPrivateModuleContent = (tab) =>
  JSON.stringify({
    version: 1,
    source: 'workspace',
    name: tab.name,
    type: tab.type,
    content: tab.content ?? '',
    fileUrl: tab.fileUrl ?? null,
    noteZoom: tab.noteZoom ?? 1,
    viewMode: tab.viewMode === 'quadro' ? 'quadro' : 'content',
    canvasDocument: tab.canvasDocument && typeof tab.canvasDocument === 'object' ? tab.canvasDocument : null,
    status: tab.status ?? 'novo',
  });

const parsePrivateModuleContent = (content, fallback = {}) => {
  if (typeof content !== 'string' || !content) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.version === 1 && typeof parsed.type === 'string') {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : fallback.name ?? '',
        type: parsed.type === 'note' ? 'mk' : parsed.type,
        content: typeof parsed.content === 'string' ? parsed.content : '',
        fileUrl: typeof parsed.fileUrl === 'string' ? parsed.fileUrl : null,
        noteZoom: typeof parsed.noteZoom === 'number' ? parsed.noteZoom : 1,
        viewMode: parsed.viewMode === 'quadro' ? 'quadro' : 'content',
        canvasDocument: parsed.canvasDocument && typeof parsed.canvasDocument === 'object' ? parsed.canvasDocument : null,
        status: typeof parsed.status === 'string' ? parsed.status : 'novo',
      };
    }
  } catch {
    // raw content fallback
  }

  return fallback;
};

const isPdfFile = (file) =>
  file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf');

const isMkFile = (file) =>
  file?.type === 'text/markdown' || /\.(mk|md)$/i.test(file?.name ?? '');

const getNextStatus = (currentStatus) => {
  const currentIndex = TAB_STATUSES.indexOf(currentStatus);
  return TAB_STATUSES[(currentIndex + 1 + TAB_STATUSES.length) % TAB_STATUSES.length] ?? 'novo';
};

const getStatusLabel = (status) => {
  if (status === 'em revisão') return 'Em revisão';
  if (status === 'aprovado') return 'Aprovado';
  if (status === 'publicado') return 'Publicado';
  return 'Novo';
};

const getCurrentPath = () => {
  const pathname = window.location.pathname || '/';
  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
};

const createDefaultCanvasDocument = () => ({
  version: 1,
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  nodes: [],
  edges: [],
});

function App() {
  const {
    state,
    selectedTitle,
    selectedSection,
    activeTab,
    isLoadingWorkspace,
    syncError,
    syncStatus,
    lastSyncedAt,
    hasUnsavedChanges,
    actions,
  } = useDashboard();
  const { session, user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [pathname, setPathname] = useState(getCurrentPath);
  const [activeView, setActiveView] = useState('workspace');
  const [isImportingData, setIsImportingData] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [canvasFocusRequest, setCanvasFocusRequest] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [publicLibraryModules, setPublicLibraryModules] = useState([]);
  const [privateLibraryModules, setPrivateLibraryModules] = useState([]);
  const [isPublicLibraryLoading, setIsPublicLibraryLoading] = useState(false);
  const [isPrivateLibraryLoading, setIsPrivateLibraryLoading] = useState(false);
  const [isPublicLibraryUploading, setIsPublicLibraryUploading] = useState(false);
  const [isPrivateLibraryUploading, setIsPrivateLibraryUploading] = useState(false);
  const [pendingImportModule, setPendingImportModule] = useState(null);
  const htmlModuleInputRef = useRef(null);

  const mentionItems = useMemo(() => {
    const items = [];
    for (const workspaceItem of state.workspace) {
      if (workspaceItem.type === 'title') {
        items.push({
          label: workspaceItem.title,
          typeLabel: 'Título',
          href: `workspace://title/${encodeURIComponent(workspaceItem.id)}`,
        });
        continue;
      }
      if (workspaceItem.type !== 'section') continue;
      items.push({
        label: workspaceItem.name,
        typeLabel: 'Seção',
        href: `workspace://section/${encodeURIComponent(workspaceItem.id)}`,
      });
      for (const tab of workspaceItem.tabs ?? []) {
        for (const node of tab.canvasDocument?.nodes ?? []) {
          const label = node.type === 'text'
            ? node.text?.split('\n')[0]
            : node.type === 'group'
              ? node.group?.title
              : node.type === 'link'
                ? node.link?.title || node.link?.url
                : node.caption || node.image?.alt;
          items.push({
            label: (label || `Card ${node.id.slice(0, 6)}`).slice(0, 80),
            typeLabel: 'Card',
            href: `workspace://card/${encodeURIComponent(workspaceItem.id)}/${encodeURIComponent(tab.id)}/${encodeURIComponent(node.id)}`,
          });
        }
      }
    }
    return items;
  }, [state.workspace]);

  const handleOpenMention = (href) => {
    const match = href.match(/^workspace:\/\/(title|section|card)\/(.+)$/);
    if (!match) return;
    const type = match[1];
    const parts = match[2].split('/').map((part) => decodeURIComponent(part));
    let sectionId = type === 'section' || type === 'card' ? parts[0] : null;

    if (type === 'title') {
      const titleIndex = state.workspace.findIndex((item) => item.type === 'title' && item.id === parts[0]);
      let nextSection = null;
      for (let index = titleIndex + 1; titleIndex >= 0 && index < state.workspace.length; index += 1) {
        if (state.workspace[index].type === 'title') break;
        if (state.workspace[index].type === 'section') {
          nextSection = state.workspace[index];
          break;
        }
      }
      sectionId = nextSection?.id ?? null;
    }

    if (!sectionId) return;
    setActiveView('workspace');
    actions.selectSection(sectionId);
    setIsMobileSidebarOpen(false);

    if (type === 'card') {
      const [, tabId, nodeId] = parts;
      actions.setActiveTab(sectionId, tabId);
      actions.updateTabContent(sectionId, tabId, { viewMode: 'quadro' });
      setCanvasFocusRequest({ sectionId, tabId, nodeId, token: crypto.randomUUID() });
    }
  };
  const mkInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const publicLibraryInputRef = useRef(null);
  const privateLibraryInputRef = useRef(null);
  const importMenuRef = useRef(null);

  const hasWorkspace = state.workspace.length > 0;
  const hasSection = state.workspace.some((item) => item.type === 'section');
  const availableSections = state.workspace.filter((item) => item.type === 'section');

  const navigate = (nextPath, replace = false) => {
    const resolvedPath = nextPath === '/' ? '/' : nextPath.replace(/\/+$/, '');

    if (replace) {
      window.history.replaceState({}, '', resolvedPath);
    } else {
      window.history.pushState({}, '', resolvedPath);
    }

    setPathname(resolvedPath);
  };

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getCurrentPath());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isImportMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (importMenuRef.current && !importMenuRef.current.contains(event.target)) {
        setIsImportMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsImportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isImportMenuOpen]);

  useEffect(() => {
    if (isAuthLoading) return;

    const isAuthPath = AUTH_PATHS.includes(pathname);

    if (!isAuthenticated && !isAuthPath) {
      navigate('/login', true);
      return;
    }

    if (isAuthenticated && isAuthPath) {
      navigate('/', true);
    }
  }, [isAuthenticated, isAuthLoading, pathname]);

  const loadPublicModules = async () => {
    setIsPublicLibraryLoading(true);

    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('is_public', true)
        .order('id', { ascending: false });

      if (error) {
        throw error;
      }

      setPublicLibraryModules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar biblioteca publica:', error);
      setPublicLibraryModules([]);
    } finally {
      setIsPublicLibraryLoading(false);
    }
  };

  const loadPrivateModules = async () => {
    if (!user?.id) return;

    setIsPrivateLibraryLoading(true);

    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('is_public', false)
        .eq('user_id', user.id)
        .order('id', { ascending: false });

      if (error) {
        throw error;
      }

      setPrivateLibraryModules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar biblioteca privada:', error);
      setPrivateLibraryModules([]);
    } finally {
      setIsPrivateLibraryLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    if (activeView === 'library-public') {
      loadPublicModules();
    }

    if (activeView === 'library-private') {
      loadPrivateModules();
    }
  }, [activeView, isAuthenticated, user?.id]);

  const updateCurrentTab = (payload) => {
    if (!selectedSection || !activeTab) return;
    actions.updateTabContent(selectedSection.id, activeTab.id, payload);
  };

  const handleImportWorkspaceFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeTab) return;

    try {
      const content = await file.text();
      updateCurrentTab({ type: detectTabType(content), content, fileUrl: null, status: 'novo' });
    } finally {
      setIsImportMenuOpen(false);
      event.target.value = '';
    }
  };

  const handleImportPdf = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeTab) return;

    try {
      const fileUrl = await readFileAsDataUrl(file);
      updateCurrentTab({ type: 'pdf', content: '', fileUrl, noteZoom: 1, status: 'novo' });
    } finally {
      setIsImportMenuOpen(false);
      event.target.value = '';
    }
  };

  const handleImportMk = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeTab) return;

    try {
      const content = await file.text();
      updateCurrentTab({ type: 'mk', content, fileUrl: null, noteZoom: 1, status: 'novo' });
    } finally {
      setIsImportMenuOpen(false);
      event.target.value = '';
    }
  };

  const handleImportComputerFileToPrivateLibrary = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    setIsPrivateLibraryUploading(true);

    try {
      const fileName = file.name;
      const isPdf = isPdfFile(file);
      const isMk = isMkFile(file);
      const content = isPdf ? await readFileAsDataUrl(file) : await file.text();
      const moduleType = isPdf ? 'pdf' : isMk ? 'mk' : detectTabType(content);
      const fileUrl = content || 'about:blank';

      const { error } = await supabase.from('modules').insert([
        {
          title: fileName,
          content:
            moduleType === 'pdf'
              ? JSON.stringify({
                  version: 1,
                  source: 'computer',
                  name: fileName,
                  type: moduleType,
                  content,
                  fileUrl,
                  noteZoom: 1,
                  status: 'novo',
                })
              : content,
          file_url: fileUrl,
          module_type: moduleType,
          status: 'novo',
          is_public: false,
          user_id: user.id,
        },
      ]);

      if (error) throw error;

      await loadPrivateModules();
    } catch (error) {
      console.error('Erro ao enviar arquivo para biblioteca privada:', error);
      window.alert('Nao foi possivel salvar o arquivo na biblioteca privada.');
    } finally {
      setIsPrivateLibraryUploading(false);
      event.target.value = '';
    }
  };

  const handleImportData = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingData(true);

    try {
      const text = await file.text();
      actions.importData(JSON.parse(text));
    } catch (error) {
      window.alert('Nao foi possivel importar o JSON. Verifique o arquivo.');
      console.error(error);
    } finally {
      setIsImportingData(false);
      event.target.value = '';
    }
  };

  const handlePublicLibraryUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsPublicLibraryUploading(true);

    try {
      const fileName = sanitizeFileName(file.name);
      const path = `public/${Date.now()}-${fileName}`;

      const { error: uploadError } = await supabase.storage.from('modules').upload(path, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('modules').getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl;

      if (!publicUrl) {
        throw new Error('Nao foi possivel obter a URL publica do modulo.');
      }

      const { error: insertError } = await supabase.from('modules').insert([
        {
          title: file.name,
          file_url: publicUrl,
          module_type: isPdfFile(file) ? 'pdf' : detectTabType(await file.text()),
          status: 'publicado',
          is_public: true,
          user_id: user?.id ?? null,
        },
      ]);

      if (insertError) throw insertError;

      await loadPublicModules();
    } catch (error) {
      console.error('Erro ao enviar modulo publico:', error);
      window.alert('Nao foi possivel enviar o modulo para a biblioteca publica.');
    } finally {
      setIsPublicLibraryUploading(false);
      event.target.value = '';
    }
  };

  const handleDeletePublicModule = async (module) => {
    const confirmed = window.confirm('Deseja excluir o modulo publico?');
    if (!confirmed) return;

    const filePath = getFilePathFromUrl(module.file_url);
    if (!filePath) {
      console.error('Nao foi possivel extrair o caminho do arquivo:', module.file_url);
      window.alert('Nao foi possivel excluir o arquivo do armazenamento.');
      return;
    }

    const { error: storageError } = await supabase.storage.from('modules').remove([filePath]);
    if (storageError) {
      console.error('Erro ao excluir arquivo do storage:', storageError);
      window.alert('Nao foi possivel excluir o arquivo do armazenamento.');
      return;
    }

    const { error: databaseError } = await supabase.from('modules').delete().eq('id', module.id);
    if (databaseError) {
      console.error('Erro ao excluir registro do banco:', databaseError);
      window.alert('Nao foi possivel excluir o modulo do banco de dados.');
      return;
    }

    await loadPublicModules();
  };

  const handleDeletePrivateModule = async (module) => {
    const confirmed = window.confirm('Deseja excluir o arquivo da biblioteca privada?');
    if (!confirmed) return;

    const { error } = await supabase.from('modules').delete().eq('id', module.id).eq('user_id', user.id);
    if (error) {
      console.error('Erro ao excluir arquivo da biblioteca privada:', error);
      window.alert('Nao foi possivel excluir o arquivo da biblioteca privada.');
      return;
    }

    await loadPrivateModules();
  };

  const handleImportPublicModule = (module) => {
    setPendingImportModule({ source: 'public', module });
  };

  const handleImportPrivateModule = (module) => {
    if (!selectedSection) {
      window.alert('Selecione uma secao antes de importar um arquivo da biblioteca privada.');
      return;
    }

    const parsed = parsePrivateModuleContent(module.content, {
      name: module.title,
      type: module.module_type ?? 'html',
      content: module.content ?? '',
      fileUrl: module.file_url ?? null,
      noteZoom: 1,
      viewMode: module.viewMode === 'quadro' ? 'quadro' : 'content',
      canvasDocument: module.canvasDocument && typeof module.canvasDocument === 'object' ? module.canvasDocument : null,
      status: module.status ?? 'novo',
    });

    actions.importPrivateModule(selectedSection.id, {
      ...module,
      title: parsed.name || module.title,
      content: parsed.content,
      file_url: parsed.fileUrl ?? module.file_url ?? parsed.content ?? 'about:blank',
      module_type: parsed.type || module.module_type || 'html',
      status: parsed.status || module.status || 'novo',
      noteZoom: parsed.noteZoom ?? 1,
      viewMode: parsed.viewMode ?? module.viewMode ?? 'content',
      canvasDocument: parsed.canvasDocument ?? module.canvasDocument ?? null,
    });
    setActiveView('workspace');
  };

  const handleSelectImportSection = async (sectionId) => {
    if (!pendingImportModule) return;

    try {
      const { source, module } = pendingImportModule;

      if (source === 'private') {
        actions.importPrivateModule(sectionId, module);
        setActiveView('workspace');
        setPendingImportModule(null);
        return;
      }

      const response = await fetch(module.file_url);
      if (!response.ok) {
        throw new Error(`Falha ao carregar modulo publico: ${response.status}`);
      }

      const content = await response.text();

      actions.importPublicModule(sectionId, {
        ...module,
        content,
      });
      setActiveView('workspace');
      setPendingImportModule(null);
    } catch (error) {
      console.error('Erro ao importar modulo publico:', error);
      window.alert('Nao foi possivel importar o modulo para a secao selecionada.');
    }
  };

  const handleSaveCurrentTabToPrivateLibrary = async () => {
    if (!activeTab || !user?.id) return;

    try {
      const payloadContent = buildPrivateModuleContent(activeTab);
      const moduleType = activeTab.type;
      const fileUrl = activeTab.fileUrl ?? payloadContent ?? 'about:blank';

      const { error } = await supabase.from('modules').insert([
        {
          title: activeTab.name,
          content: payloadContent,
          file_url: fileUrl,
          module_type: moduleType,
          status: activeTab.status ?? 'novo',
          is_public: false,
          user_id: user.id,
        },
      ]);

      if (error) throw error;

      await loadPrivateModules();
    } catch (error) {
      console.error('Erro ao guardar aba na biblioteca privada:', error);
      window.alert(`Nao foi possivel guardar a aba na biblioteca privada.\n\n${error?.message ?? ''}`.trim());
    }
  };

  const handleToggleQuadro = () => {
    if (!activeTab) return;

    const nextViewMode = activeTab.viewMode === 'quadro' ? 'content' : 'quadro';
    updateCurrentTab({
      viewMode: nextViewMode,
      canvasDocument: activeTab.canvasDocument ?? createDefaultCanvasDocument(),
    });
  };

  const handleQuadroDocumentChange = (canvasDocument) => {
    updateCurrentTab({
      canvasDocument,
      viewMode: 'quadro',
    });
  };

  const handleUploadQuadroImage = async (file) => {
    if (!user?.id) {
      throw new Error('Usuário não autenticado.');
    }

    const safeName = sanitizeFileName(file.name || 'imagem.png');
    const path = `${user.id}/quadro/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from('modules').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

    if (error) throw error;

    const { data } = supabase.storage.from('modules').getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error('Não foi possível gerar o endereço da imagem.');
    }

    return { url: data.publicUrl, path };
  };

  const handleUploadMkImage = async (file) => {
    if (!user?.id) {
      throw new Error('Usuario nao autenticado.');
    }

    const safeName = sanitizeFileName(file.name || 'imagem.png');
    const path = `${user.id}/mk/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from('modules').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });

    if (error) throw error;

    const { data } = supabase.storage.from('modules').getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error('Nao foi possivel gerar o endereco da imagem.');
    }

    return { url: data.publicUrl, path };
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }

      navigate('/login', true);
    } catch (logoutError) {
      console.error('Erro ao encerrar sessao:', logoutError);
      window.alert('Nao foi possivel encerrar a sessao.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleAuthenticated = () => {
    navigate('/', true);
  };

  const renderEmptyWorkspace = () => (
    <div className="flex h-full items-center justify-center p-3 sm:p-8">
      <div className="max-w-2xl rounded-[24px] border border-[#2a2f3a] bg-white/[0.04] p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:rounded-[32px] sm:p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#a1a1aa]">Workspace</p>
        <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Crie o primeiro item do seu workspace</h3>
        <p className="mt-4 text-sm leading-7 text-[#a1a1aa]">
          Organize o painel com titulos visuais e secoes independentes com abas e suporte a HTML.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={actions.addTitle}
            className="rounded-2xl border border-[#3a404d] bg-[#2a2f3a]/70 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#2f3542]"
          >
            + Novo titulo
          </button>
          <button
            type="button"
            onClick={actions.addSection}
            className="rounded-2xl border border-[#3a404d] bg-[#2a2f3a]/70 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#2f3542]"
          >
            + Nova secao
          </button>
        </div>
      </div>
    </div>
  );

  const renderEmptySection = () => (
    <div className="flex h-full items-center justify-center p-3 sm:p-8">
      <div className="max-w-xl rounded-[24px] border border-[#2a2f3a] bg-white/[0.04] p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:rounded-[32px] sm:p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#a1a1aa]">Secoes</p>
        <h3 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Nenhuma secao selecionada</h3>
        <p className="mt-4 text-sm leading-7 text-[#a1a1aa]">
          Adicione ou selecione uma secao independente na barra lateral para continuar.
        </p>
        {!hasSection ? (
          <button
            type="button"
            onClick={actions.addSection}
            className="mt-6 rounded-2xl border border-[#3a404d] bg-[#2a2f3a]/70 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#2f3542]"
          >
            + Nova secao
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderWorkspaceContent = () => {
    if (!hasWorkspace) return renderEmptyWorkspace();
    if (!selectedSection) return renderEmptySection();

    return (
      <div data-workspace-shell className="flex h-full min-h-0 flex-col">
        <TabBar
          tabs={selectedSection.tabs}
          activeTabId={activeTab?.id ?? null}
          onOpenMenu={() => setIsMobileSidebarOpen(true)}
          onAddTab={() => actions.addTab(selectedSection.id)}
          onSelectTab={(tabId) => actions.setActiveTab(selectedSection.id, tabId)}
          onRenameTab={(tabId, name) => actions.renameTab(selectedSection.id, tabId, name)}
          onCloseTab={(tabId) => actions.closeTab(selectedSection.id, tabId)}
          onDuplicateTab={(tabId) => actions.duplicateTab(selectedSection.id, tabId)}
          onReorderTab={(tabId, targetTabId) => actions.reorderTab(selectedSection.id, tabId, targetTabId)}
        />

        <div className="min-h-0 flex-1 overflow-hidden p-1.5 sm:p-2">
          {activeTab ? (
            <div data-workspace-container className="flex h-full min-h-0 flex-col overflow-hidden border border-[#2a2f3a] bg-white/[0.025]">
              <div data-context-toolbar className="flex min-h-10 items-center gap-2 overflow-x-auto border-b border-[#2a2f3a] px-2.5 xl:overflow-visible">
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="max-w-[160px] truncate text-sm font-semibold text-white sm:max-w-[220px]">{activeTab.name}</h3>
                    <span className="border border-[#3a404d] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-[#d4d4d8]">
                      {activeTab.type === 'module'
                        ? 'Módulo'
                        : activeTab.type === 'mk' || activeTab.type === 'note'
                          ? 'MK'
                          : activeTab.type === 'pdf'
                          ? 'PDF'
                          : 'HTML'}
                    </span>
                  </div>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <input
                    ref={htmlModuleInputRef}
                    type="file"
                    accept=".html,text/html"
                    className="hidden"
                    onChange={handleImportWorkspaceFile}
                  />
                  <input
                    ref={mkInputRef}
                    type="file"
                    accept=".mk,.md,text/markdown,text/plain"
                    className="hidden"
                    onChange={handleImportMk}
                  />
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleImportPdf}
                  />
                  <button
                    type="button"
                    onClick={() => setIsAiPanelOpen((current) => !current)}
                    aria-pressed={isAiPanelOpen}
                    data-ui-variant="secondary"
                    className="flex h-8 shrink-0 items-center gap-1 border border-transparent px-2.5 text-xs font-medium text-white transition duration-150"
                    title={isAiPanelOpen ? 'Fechar Assistente IA' : 'Abrir Assistente IA'}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M12 3l1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3z" />
                      <path d="M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15z" />
                    </svg>
                    IA
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCurrentTabToPrivateLibrary}
                    data-ui-variant="primary"
                    className="h-8 shrink-0 border px-2.5 text-xs font-semibold transition duration-150"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleQuadro}
                    aria-pressed={activeTab.viewMode === 'quadro'}
                    data-ui-variant="secondary"
                    className={`h-8 shrink-0 border px-2.5 text-xs font-medium text-white transition duration-150 ${
                      activeTab.viewMode === 'quadro'
                        ? 'border-[#7c83ff] bg-[#3a3f6b]'
                        : 'border-transparent'
                    }`}
                  >
                    Quadro
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateCurrentTab({
                        type: 'mk',
                        content: activeTab?.type === 'mk' || activeTab?.type === 'note' ? activeTab.content : '',
                        fileUrl: null,
                        noteZoom: activeTab?.type === 'mk' || activeTab?.type === 'note' ? activeTab.noteZoom ?? 1 : 1,
                        status: activeTab?.type === 'mk' || activeTab?.type === 'note' ? activeTab.status ?? 'novo' : 'novo',
                      })
                    }
                    data-ui-variant="secondary"
                    className="h-8 shrink-0 border border-transparent px-2.5 text-xs font-medium text-white transition duration-150"
                  >
                    Novo MK
                  </button>
                  <div ref={importMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsImportMenuOpen((current) => !current)}
                      data-ui-variant="secondary"
                      className="h-8 border border-transparent px-2.5 text-xs font-medium text-white transition duration-150"
                    >
                      Importar
                    </button>

                    {isImportMenuOpen ? (
                      <div className="fixed right-2 top-[78px] z-[90] w-52 overflow-hidden border border-[#2a2f3a] bg-[#171a20] p-1 xl:absolute xl:right-0 xl:top-full xl:z-20 xl:mt-1">
                        <button
                          type="button"
                          onClick={() => htmlModuleInputRef.current?.click()}
                          className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs text-white transition duration-150"
                        >
                          <span>Html ou Módulo</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-[#7b818d]">HTML</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => mkInputRef.current?.click()}
                          className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs text-white transition duration-150"
                        >
                          <span>Documento Markdown</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-[#7b818d]">MK</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => pdfInputRef.current?.click()}
                          className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs text-white transition duration-150"
                        >
                          <span>PDF</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-[#7b818d]">PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsImportMenuOpen(false);
                            setActiveView('library-private');
                          }}
                          className="flex w-full items-center justify-between px-2.5 py-2 text-left text-xs text-white transition duration-150"
                        >
                          <span>Da biblioteca</span>
                          <span className="text-xs uppercase tracking-[0.2em] text-[#7b818d]">PRIVATE</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-1.5 sm:p-2">
                {activeTab.viewMode === 'quadro' ? (
                  <QuadroCanvas
                    documentValue={activeTab.canvasDocument ?? createDefaultCanvasDocument()}
                    focusRequest={
                      canvasFocusRequest?.sectionId === selectedSection.id && canvasFocusRequest?.tabId === activeTab.id
                        ? canvasFocusRequest
                        : null
                    }
                    onFocusRequestHandled={() => setCanvasFocusRequest(null)}
                    onChange={handleQuadroDocumentChange}
                    onExit={handleToggleQuadro}
                    onUploadImage={handleUploadQuadroImage}
                  />
                ) : activeTab.type === 'mk' || activeTab.type === 'note' ? (
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[#8C8A85]">Carregando editor MK...</div>}>
                    <MarkdownEditor
                      value={activeTab.content}
                      zoom={activeTab.noteZoom ?? 1}
                      mentionItems={mentionItems}
                      onChange={(content) => updateCurrentTab({ content })}
                      onZoomChange={(noteZoom) => updateCurrentTab({ noteZoom })}
                      onUploadImage={handleUploadMkImage}
                      onOpenMention={handleOpenMention}
                    />
                  </Suspense>
                ) : activeTab.type === 'pdf' && activeTab.fileUrl ? (
                  <HtmlViewer src={activeTab.fileUrl} expandable mode="pdf" />
                ) : activeTab.content || activeTab.fileUrl ? (
                  activeTab.type === 'module' ? (
                    <HtmlViewer
                      htmlContent={activeTab.content}
                      src={activeTab.content ? undefined : activeTab.fileUrl}
                      expandable
                    />
                  ) : (
                    <HtmlViewer htmlContent={activeTab.content} expandable />
                  )
                ) : (
                  <div className="flex h-full min-h-[280px] items-center justify-center rounded-[24px] border border-dashed border-[#3a404d] bg-[#0f1115]/70 p-6 text-center text-[#a1a1aa]">
                    Nenhum conteúdo nesta aba. Use "Novo MK" ou "Importar" para adicionar Markdown, HTML, módulo ou PDF.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-[30px] border border-dashed border-[#3a404d] bg-white/[0.04] p-8 text-center text-[#a1a1aa]">
              Nenhuma aba criada nesta secao. Clique em "+" para abrir uma nova aba.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderImportModal = () => {
    if (!pendingImportModule) return null;
    const module = pendingImportModule.module;

    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0d11]/70 p-6 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-[28px] border border-[#2a2f3a] bg-[#171a20] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#a1a1aa]">Importar modulo</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{module?.title}</h3>
              <p className="mt-2 text-sm text-[#a1a1aa]">Selecione a secao que vai receber este modulo.</p>
            </div>

            <button
              type="button"
              onClick={() => setPendingImportModule(null)}
              className="rounded-lg px-2 py-1 text-sm text-[#a1a1aa] transition duration-200 hover:bg-[#2f3542] hover:text-white"
            >
              X
            </button>
          </div>

          <div className="mt-5 max-h-[320px] space-y-2 overflow-auto">
            {availableSections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#3a404d] bg-white/[0.03] p-4 text-sm text-[#a1a1aa]">
                Nenhuma secao disponivel para importacao.
              </div>
            ) : (
              availableSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleSelectImportSection(section.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-[#2a2f3a] bg-white/[0.03] px-4 py-3 text-left transition duration-200 hover:border-[#3a404d] hover:bg-white/[0.05]"
                >
                  <span className="truncate text-sm font-medium text-white">{section.name}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-[#7b818d]">Importar</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderWorkspace = () => (
    <div className="h-[100dvh] overflow-hidden bg-[#0f1115] text-white">
      <div className="flex h-full overflow-hidden">
        {isMobileSidebarOpen ? (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm md:hidden"
          />
        ) : null}
        <Sidebar
          workspace={state.workspace}
          selectedSectionId={state.selectedSectionId}
          isPublicLibraryActive={activeView === 'library-public'}
          isPrivateLibraryActive={activeView === 'library-private'}
          isLoggingOut={isLoggingOut}
          isMobileOpen={isMobileSidebarOpen}
          syncStatus={syncStatus}
          hasUnsavedChanges={hasUnsavedChanges}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          onSaveChanges={() => void actions.saveChanges()}
          onAddTitle={actions.addTitle}
          onAddSection={actions.addSection}
          onRenameTitle={actions.renameTitle}
          onUpdateTitleColor={actions.updateTitleColor}
          onDeleteTitle={actions.deleteTitle}
          onRenameSection={actions.renameSection}
          onDeleteSection={actions.deleteSection}
          onReorderItem={actions.reorderItem}
          onSelectSection={(sectionId) => {
            setActiveView('workspace');
            actions.selectSection(sectionId);
            setIsMobileSidebarOpen(false);
          }}
          onOpenPublicLibrary={() => {
            setActiveView('library-public');
            setIsMobileSidebarOpen(false);
          }}
          onOpenPrivateLibrary={() => {
            setActiveView('library-private');
            setIsMobileSidebarOpen(false);
          }}
          onLogout={handleLogout}
        />

        <main data-main-shell className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeView !== 'workspace' || !selectedSection ? (
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="absolute left-2 top-2 z-[60] flex h-9 w-9 items-center justify-center rounded-xl border border-[#3a404d] bg-[#20232a]/95 text-lg text-white shadow-lg backdrop-blur-xl md:hidden"
              aria-label="Abrir menu do workspace"
            >
              ☰
            </button>
          ) : null}
          {syncError ? (
            <div className="shrink-0 border-b border-[#3b1f25] bg-[#2a161a] px-3 py-2 text-xs text-[#f4c7cf] sm:px-6 sm:py-3 sm:text-sm">
              {syncError}
            </div>
          ) : null}
          <section className="min-h-0 flex-1 overflow-hidden">
            {isLoadingWorkspace ? (
              <div className="flex h-full items-center justify-center text-sm text-[#a1a1aa]">
                Carregando workspace...
              </div>
            ) : activeView === 'library-public' ? (
              <>
                <input
                  ref={publicLibraryInputRef}
                  type="file"
                  accept=".html,text/html"
                  className="hidden"
                  onChange={handlePublicLibraryUpload}
                />
                <PublicLibrary
                  modules={publicLibraryModules}
                  isLoading={isPublicLibraryLoading}
                  isUploading={isPublicLibraryUploading}
                  onUploadClick={() => publicLibraryInputRef.current?.click()}
                  onModuleClick={(module) => window.open(module.file_url, '_blank', 'noopener,noreferrer')}
                  onDeleteModule={handleDeletePublicModule}
                  onImportModule={handleImportPublicModule}
                />
                {renderImportModal()}
              </>
            ) : activeView === 'library-private' ? (
              <>
                <input
                  ref={privateLibraryInputRef}
                  type="file"
                  accept=".html,text/html,.mk,.md,text/markdown,text/plain,.pdf,application/pdf"
                  className="hidden"
                  onChange={handleImportComputerFileToPrivateLibrary}
                />
                <PrivateLibrary
                  modules={privateLibraryModules}
                  isLoading={isPrivateLibraryLoading}
                  isUploading={isPrivateLibraryUploading}
                  onUploadClick={() => privateLibraryInputRef.current?.click()}
                  onModuleClick={handleImportPrivateModule}
                  onDeleteModule={handleDeletePrivateModule}
                  onImportModule={handleImportPrivateModule}
                />
              </>
            ) : (
              renderWorkspaceContent()
            )}
          </section>
          {syncStatus !== 'idle' && syncStatus !== 'loading' ? (
            <div
              className={`pointer-events-none absolute bottom-3 right-3 z-50 rounded-xl border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-xl sm:bottom-4 sm:right-5 ${
                syncStatus === 'saved'
                  ? 'border-[#294537] bg-[#14251dcc] text-[#a7e7c3]'
                  : syncStatus === 'offline' || syncStatus === 'error'
                    ? 'border-[#674c27] bg-[#2b2114e6] text-[#f3cf94]'
                    : 'border-[#3a4050] bg-[#171a20e6] text-[#d7d9e1]'
              }`}
            >
              {syncStatus === 'saving'
                ? 'Salvando...'
                : syncStatus === 'pending'
                  ? 'Alterações não salvas'
                  : syncStatus === 'offline'
                    ? 'Offline - alterações protegidas'
                    : syncStatus === 'error'
                      ? 'Falha ao salvar'
                      : `Salvo${lastSyncedAt ? ` às ${lastSyncedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
            </div>
          ) : null}
        </main>
        <AiPanel isOpen={isAiPanelOpen} session={session} onClose={() => setIsAiPanelOpen(false)} />
      </div>
    </div>
  );

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1115] text-sm text-[#a1a1aa]">
        Carregando sessao...
      </div>
    );
  }

  if (!isAuthenticated) {
    return pathname === '/cadastro' ? (
      <CadastroPage onNavigate={navigate} onAuthenticated={handleAuthenticated} />
    ) : (
      <LoginPage onNavigate={navigate} onAuthenticated={handleAuthenticated} />
    );
  }

  return renderWorkspace();
}

export default App;
