import { useEffect, useRef, useState } from 'react';
import { CadastroPage, LoginPage } from './components/auth-page';
import { HtmlViewer } from './components/html-viewer';
import { PublicLibrary } from './components/public-library';
import { Sidebar } from './components/sidebar';
import { TabBar } from './components/tab-bar';
import { Topbar } from './components/topbar';
import { useAuth } from './state/auth-context';
import { useDashboard } from './state/dashboard-context';
import { detectTabType, downloadJson } from './utils/dashboard';
import { supabase } from '@/supabaseClient';

const AUTH_PATHS = ['/login', '/cadastro'];

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

const getCurrentPath = () => {
  const pathname = window.location.pathname || '/';
  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
};

function App() {
  const { state, selectedTitle, selectedSection, activeTab, isLoadingWorkspace, syncError, actions } = useDashboard();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [pathname, setPathname] = useState(getCurrentPath);
  const [activeView, setActiveView] = useState('workspace');
  const [isImportingData, setIsImportingData] = useState(false);
  const [isImportingHtml, setIsImportingHtml] = useState(false);
  const [isImportingModule, setIsImportingModule] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [libraryModules, setLibraryModules] = useState([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [isLibraryUploading, setIsLibraryUploading] = useState(false);
  const [pendingImportModule, setPendingImportModule] = useState(null);
  const htmlInputRef = useRef(null);
  const moduleInputRef = useRef(null);
  const libraryInputRef = useRef(null);

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
    setIsLibraryLoading(true);

    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .eq('is_public', true)
        .order('id', { ascending: false });

      if (error) {
        throw error;
      }

      setLibraryModules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erro ao carregar biblioteca publica:', error);
      setLibraryModules([]);
    } finally {
      setIsLibraryLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || activeView !== 'library') return;
    loadPublicModules();
  }, [activeView, isAuthenticated]);

  const updateCurrentTab = (payload) => {
    if (!selectedSection || !activeTab) return;
    actions.updateTabContent(selectedSection.id, activeTab.id, payload);
  };

  const handleImportHtml = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeTab) return;

    setIsImportingHtml(true);

    try {
      const content = await file.text();
      updateCurrentTab({ type: 'html', content });
    } finally {
      setIsImportingHtml(false);
      event.target.value = '';
    }
  };

  const handleImportModule = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeTab) return;

    setIsImportingModule(true);

    try {
      const content = await file.text();
      updateCurrentTab({ type: detectTabType(content), content });
    } finally {
      setIsImportingModule(false);
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

  const handleLibraryUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLibraryUploading(true);

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
          is_public: true,
        },
      ]);

      if (insertError) throw insertError;

      await loadPublicModules();
    } catch (error) {
      console.error('Erro ao enviar modulo publico:', error);
      window.alert('Nao foi possivel enviar o modulo para a biblioteca publica.');
    } finally {
      setIsLibraryUploading(false);
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

  const handleImportPublicModule = (module) => {
    setPendingImportModule(module);
  };

  const handleSelectImportSection = async (sectionId) => {
    if (!pendingImportModule) return;

    try {
      const response = await fetch(pendingImportModule.file_url);
      if (!response.ok) {
        throw new Error(`Falha ao carregar modulo publico: ${response.status}`);
      }

      const content = await response.text();

      actions.importPublicModule(sectionId, {
        ...pendingImportModule,
        content,
      });
      setActiveView('workspace');
      setPendingImportModule(null);
    } catch (error) {
      console.error('Erro ao importar modulo publico:', error);
      window.alert('Nao foi possivel importar o modulo para a secao selecionada.');
    }
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

  const handleExportData = () => {
    downloadJson('workspace-dashboard.json', state);
  };

  const renderEmptyWorkspace = () => (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-2xl rounded-[32px] border border-[#2a2f3a] bg-white/[0.04] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#a1a1aa]">Workspace</p>
        <h3 className="mt-3 text-3xl font-semibold text-white">Crie o primeiro item do seu workspace</h3>
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
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-xl rounded-[32px] border border-[#2a2f3a] bg-white/[0.04] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.35em] text-[#a1a1aa]">Secoes</p>
        <h3 className="mt-3 text-3xl font-semibold text-white">Nenhuma secao selecionada</h3>
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
      <div className="flex h-full min-h-0 flex-col">
        <TabBar
          tabs={selectedSection.tabs}
          activeTabId={activeTab?.id ?? null}
          onAddTab={() => actions.addTab(selectedSection.id)}
          onSelectTab={(tabId) => actions.setActiveTab(selectedSection.id, tabId)}
          onRenameTab={(tabId, name) => actions.renameTab(selectedSection.id, tabId, name)}
          onCloseTab={(tabId) => actions.closeTab(selectedSection.id, tabId)}
        />

        <div className="min-h-0 flex-1 overflow-hidden p-5">
          {activeTab ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-[#2a2f3a] bg-white/[0.045] shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2a2f3a] px-5 py-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#a1a1aa]">Aba ativa</p>
                  <div className="mt-1 flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">{activeTab.name}</h3>
                    <span className="rounded-full border border-[#3a404d] bg-[#2a2f3a]/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#d4d4d8]">
                      {activeTab.type === 'module' ? 'Modulo' : 'HTML'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#a1a1aa]">
                    {[selectedTitle?.title, selectedSection.name].filter(Boolean).join(' / ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={htmlInputRef}
                    type="file"
                    accept=".html,text/html"
                    className="hidden"
                    onChange={handleImportHtml}
                  />
                  <input
                    ref={moduleInputRef}
                    type="file"
                    accept=".html,text/html"
                    className="hidden"
                    onChange={handleImportModule}
                  />
                  <button
                    type="button"
                    onClick={() => htmlInputRef.current?.click()}
                    className="rounded-xl border border-[#3a404d] bg-[#20232a] px-4 py-2 text-sm font-medium text-white transition duration-200 hover:bg-[#2f3542]"
                  >
                    {isImportingHtml ? 'Importando HTML...' : 'Importar HTML'}
                  </button>
                  <button
                    type="button"
                    onClick={() => moduleInputRef.current?.click()}
                    className="rounded-xl border border-[#3a404d] bg-[#2a2f3a] px-4 py-2 text-sm font-medium text-white transition duration-200 hover:bg-[#2f3542]"
                  >
                    {isImportingModule ? 'Importando modulo...' : 'Importar Modulo'}
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-5">
                {activeTab.content || activeTab.fileUrl ? (
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
                    Nenhum conteudo importado nesta aba. Use "Importar HTML" para conteudo estatico ou
                    "Importar Modulo" para detectar automaticamente modulos inteligentes.
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

    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0d11]/70 p-6 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-[28px] border border-[#2a2f3a] bg-[#171a20] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#a1a1aa]">Importar modulo</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{pendingImportModule.title}</h3>
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
    <div className="h-screen overflow-hidden bg-[#0f1115] text-white">
      <div className="flex h-full overflow-hidden">
        <Sidebar
          workspace={state.workspace}
          selectedSectionId={state.selectedSectionId}
          isLibraryActive={activeView === 'library'}
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
          }}
          onOpenLibrary={() => setActiveView('library')}
        />

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            selectedTitle={activeView === 'library' ? null : selectedTitle}
            selectedSection={activeView === 'library' ? null : selectedSection}
            contextLabel={activeView === 'library' ? 'Biblioteca Publica' : null}
            onExportData={handleExportData}
            onImportData={handleImportData}
            isImporting={isImportingData}
            userEmail={user?.email ?? ''}
            onLogout={handleLogout}
            isLoggingOut={isLoggingOut}
          />
          {syncError ? (
            <div className="border-b border-[#3b1f25] bg-[#2a161a] px-6 py-3 text-sm text-[#f4c7cf]">
              {syncError}
            </div>
          ) : null}
          <section className="min-h-0 flex-1 overflow-hidden">
            {isLoadingWorkspace ? (
              <div className="flex h-full items-center justify-center text-sm text-[#a1a1aa]">
                Carregando workspace...
              </div>
            ) : activeView === 'library' ? (
              <>
                <input
                  ref={libraryInputRef}
                  type="file"
                  accept=".html,text/html"
                  className="hidden"
                  onChange={handleLibraryUpload}
                />
                <PublicLibrary
                  modules={libraryModules}
                  isLoading={isLibraryLoading}
                  isUploading={isLibraryUploading}
                  onUploadClick={() => libraryInputRef.current?.click()}
                  onModuleClick={(module) => window.open(module.file_url, '_blank', 'noopener,noreferrer')}
                  onDeleteModule={handleDeletePublicModule}
                  onImportModule={handleImportPublicModule}
                />
                {renderImportModal()}
              </>
            ) : (
              renderWorkspaceContent()
            )}
          </section>
        </main>
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
