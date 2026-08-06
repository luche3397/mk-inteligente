import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildInitialState,
  createSection,
  createTab,
  createTitle,
  getSectionTitle,
  validateState,
} from '../utils/dashboard';
import { useAuth } from './auth-context';
import { supabase } from '../supabaseClient';
import { loadWorkspaceCache, saveWorkspaceCache } from '../utils/workspace-cache';
import {
  compressWorkspaceContent,
  createWorkspaceContentSignature,
  decompressWorkspaceContent,
} from '../utils/workspace-content-codec';
import {
  buildWorkspaceSnapshot,
  chunkRowsBySerializedSize,
  rowsMatchSnapshot,
  serializeTabContent,
} from '../utils/workspace-snapshot';

const DashboardContext = createContext(null);

const mapWorkspace = (workspace, itemId, updater) =>
  workspace.map((item) => (item.id === itemId ? updater(item) : item));

const moveItem = (workspace, itemId, direction) => {
  const index = workspace.findIndex((item) => item.id === itemId);
  if (index === -1) return workspace;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= workspace.length) {
    return workspace;
  }

  const nextWorkspace = [...workspace];
  const [item] = nextWorkspace.splice(index, 1);
  nextWorkspace.splice(targetIndex, 0, item);
  return nextWorkspace;
};

const reorderItems = (workspace, itemId, targetItemId) => {
  if (!itemId || !targetItemId || itemId === targetItemId) {
    return workspace;
  }

  const sourceIndex = workspace.findIndex((item) => item.id === itemId);
  const targetIndex = workspace.findIndex((item) => item.id === targetItemId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return workspace;
  }

  const nextWorkspace = [...workspace];
  const [item] = nextWorkspace.splice(sourceIndex, 1);
  nextWorkspace.splice(targetIndex, 0, item);
  return nextWorkspace;
};

const reorderTabs = (tabs, tabId, targetTabId) => {
  if (!tabId || !targetTabId || tabId === targetTabId) {
    return tabs;
  }

  const sourceIndex = tabs.findIndex((tab) => tab.id === tabId);
  const targetIndex = tabs.findIndex((tab) => tab.id === targetTabId);

  if (sourceIndex === -1 || targetIndex === -1) {
    return tabs;
  }

  const nextTabs = [...tabs];
  const [tab] = nextTabs.splice(sourceIndex, 1);
  nextTabs.splice(targetIndex, 0, tab);
  return nextTabs;
};

const insertAfterItem = (workspace, afterItemId, nextItem) => {
  if (!afterItemId) {
    return [...workspace, nextItem];
  }

  const index = workspace.findIndex((item) => item.id === afterItemId);
  if (index === -1) {
    return [...workspace, nextItem];
  }

  return [...workspace.slice(0, index + 1), nextItem, ...workspace.slice(index + 1)];
};

const parseWorkspaceTitle = (value, index) => {
  try {
    const parsed = JSON.parse(value);

    if (parsed && typeof parsed === 'object' && typeof parsed.label === 'string') {
      return {
        label: parsed.label,
        color: typeof parsed.color === 'string' ? parsed.color : '#ffffff',
        position: Number.isInteger(parsed.position) ? parsed.position : index,
        hidden: parsed.hidden === true,
      };
    }
  } catch {
    // Legacy plain text title.
  }

  return {
    label: value || `Titulo ${index + 1}`,
    color: '#ffffff',
    position: index,
    hidden: false,
  };
};

const parseTabContent = (value = '') => {
  if (!value) {
    return {
      type: 'html',
      content: '',
      fileUrl: null,
      noteZoom: 1,
      status: 'novo',
      viewMode: 'content',
      canvasDocument: null,
    };
  }

  try {
    const parsed = JSON.parse(value);

    if (parsed && typeof parsed === 'object') {
      return {
        type: parsed.type === 'module' || parsed.type === 'note' || parsed.type === 'pdf' ? parsed.type : 'html',
        content: typeof parsed.content === 'string' ? parsed.content : '',
        fileUrl: typeof parsed.fileUrl === 'string' ? parsed.fileUrl : null,
        noteZoom: typeof parsed.noteZoom === 'number' ? parsed.noteZoom : 1,
        viewMode: parsed.viewMode === 'quadro' ? 'quadro' : 'content',
        canvasDocument: parsed.canvasDocument && typeof parsed.canvasDocument === 'object' ? parsed.canvasDocument : null,
        status:
          parsed.status === 'novo' ||
          parsed.status === 'em revisão' ||
          parsed.status === 'aprovado' ||
          parsed.status === 'publicado'
            ? parsed.status
            : 'novo',
      };
    }
  } catch {
    // Legacy plain content.
  }

  return {
    type: 'html',
    content: value,
    fileUrl: null,
    noteZoom: 1,
    viewMode: 'content',
    canvasDocument: null,
    status: 'novo',
  };
};

const isValidTabStatus = (value) =>
  value === 'novo' || value === 'em revisão' || value === 'aprovado' || value === 'publicado';

export function DashboardProvider({ children }) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [state, setState] = useState(buildInitialState);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [syncStatus, setSyncStatus] = useState('loading');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const stateRef = useRef(state);
  const cacheTimerRef = useRef(null);
  const persistInFlightRef = useRef(false);
  const localRevisionRef = useRef(0);
  const hasUnsavedChangesRef = useRef(false);
  const hiddenLeadingWorkspaceIdRef = useRef(null);
  const remoteIdsRef = useRef({
    workspaces: new Set(),
    sections: new Set(),
    tabs: new Set(),
  });
  const savedContentSignaturesRef = useRef(new Map());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cacheState = (nextState, pendingSync = true, immediate = false) => {
    if (!user?.id) return;

    if (cacheTimerRef.current) {
      window.clearTimeout(cacheTimerRef.current);
      cacheTimerRef.current = null;
    }

    const save = () => {
      cacheTimerRef.current = null;
      void saveWorkspaceCache(user.id, nextState, pendingSync).catch((error) => {
        console.warn('Nao foi possivel atualizar o cache local do workspace:', error);
      });
    };

    if (immediate) save();
    else cacheTimerRef.current = window.setTimeout(save, 250);
  };

  const loadWorkspace = async () => {
    if (!user?.id) {
      setState(buildInitialState());
      setIsLoadingWorkspace(false);
      setSyncStatus('idle');
      setHasUnsavedChanges(false);
      hasUnsavedChangesRef.current = false;
      hiddenLeadingWorkspaceIdRef.current = null;
      remoteIdsRef.current = {
        workspaces: new Set(),
        sections: new Set(),
        tabs: new Set(),
      };
      savedContentSignaturesRef.current = new Map();
      return;
    }

    const loadRevision = localRevisionRef.current;
    let cachedWorkspace = null;

    try {
      cachedWorkspace = await loadWorkspaceCache(user.id);
      if (cachedWorkspace?.state) {
        const cachedState = validateState(cachedWorkspace.state);
        stateRef.current = cachedState;
        setState(cachedState);
        setIsLoadingWorkspace(false);
        setSyncStatus(cachedWorkspace.pendingSync ? 'pending' : 'loading');
        setHasUnsavedChanges(Boolean(cachedWorkspace.pendingSync));
        hasUnsavedChangesRef.current = Boolean(cachedWorkspace.pendingSync);
      } else {
        setIsLoadingWorkspace(true);
        setSyncStatus('loading');
      }
    } catch (error) {
      console.warn('Nao foi possivel carregar o cache local do workspace:', error);
      setIsLoadingWorkspace(true);
      setSyncStatus('loading');
    }

    setSyncError('');

    try {
      const [workspacesResponse, sectionsResponse, tabsResponse, contentsResponse] = await Promise.all([
        supabase.from('workspaces').select('*').eq('user_id', user.id),
        supabase.from('sections').select('*').eq('user_id', user.id),
        supabase.from('tabs').select('*').eq('user_id', user.id),
        supabase.from('tab_contents').select('*').eq('user_id', user.id),
      ]);

      const responses = [workspacesResponse, sectionsResponse, tabsResponse, contentsResponse];
      const failedResponse = responses.find((response) => response.error);

      if (failedResponse?.error) {
        throw failedResponse.error;
      }

      const workspaces = workspacesResponse.data ?? [];
      const sections = sectionsResponse.data ?? [];
      const tabs = tabsResponse.data ?? [];
      const contents = await Promise.all(
        (contentsResponse.data ?? []).map(async (item) => ({
          ...item,
          content: await decompressWorkspaceContent(item.content),
        })),
      );
      savedContentSignaturesRef.current = new Map(
        await Promise.all(
          contents.map(async (item) => {
            const parsedContent = parseTabContent(item.content);
            return [
              item.tab_id,
              await createWorkspaceContentSignature(serializeTabContent(parsedContent)),
            ];
          }),
        ),
      );

      const sectionMap = new Map();
      const tabMap = new Map();
      const contentMap = new Map(contents.map((item) => [item.tab_id, item]));

      tabs
        .slice()
        .sort((left, right) => left.position - right.position)
        .forEach((tab) => {
          const parsedContent = parseTabContent(contentMap.get(tab.id)?.content ?? '');

          const sectionTabs = tabMap.get(tab.section_id) ?? [];
          sectionTabs.push({
            id: tab.id,
            name: tab.title,
            type: parsedContent.type,
            content: parsedContent.content,
            fileUrl: parsedContent.fileUrl,
            noteZoom: parsedContent.noteZoom,
            viewMode: parsedContent.viewMode,
            canvasDocument: parsedContent.canvasDocument,
            status: parsedContent.status,
          });
          tabMap.set(tab.section_id, sectionTabs);
        });

      sections
        .slice()
        .sort((left, right) => left.position - right.position)
        .forEach((section) => {
          const workspaceSections = sectionMap.get(section.workspace_id) ?? [];
          workspaceSections.push({
            id: section.id,
            type: 'section',
            name: section.title,
            tabs: tabMap.get(section.id) ?? [],
          });
          sectionMap.set(section.workspace_id, workspaceSections);
        });

      const workspaceItems = [];
      const orderedWorkspaces = workspaces
        .map((workspaceRow, index) => ({
          row: workspaceRow,
          meta: parseWorkspaceTitle(workspaceRow.title, index),
        }))
        .sort((left, right) => left.meta.position - right.meta.position);

      hiddenLeadingWorkspaceIdRef.current = null;

      orderedWorkspaces.forEach(({ row, meta }) => {
        if (meta.hidden) {
          hiddenLeadingWorkspaceIdRef.current = row.id;
        } else {
          workspaceItems.push({
            id: row.id,
            type: 'title',
            title: meta.label,
            color: meta.color,
          });
        }

        workspaceItems.push(...(sectionMap.get(row.id) ?? []));
      });

      const validatedState = validateState({
        workspace: workspaceItems,
        selectedSectionId: stateRef.current.selectedSectionId,
        activeTabIdBySection: stateRef.current.activeTabIdBySection,
      });

      remoteIdsRef.current = {
        workspaces: new Set(workspaces.map((item) => item.id)),
        sections: new Set(sections.map((item) => item.id)),
        tabs: new Set(tabs.map((item) => item.id)),
      };

      const shouldKeepLocal =
        Boolean(cachedWorkspace?.pendingSync) ||
        hasUnsavedChangesRef.current ||
        localRevisionRef.current !== loadRevision;

      if (shouldKeepLocal) {
        const localState = stateRef.current;
        stateRef.current = localState;
        setState(localState);
        setSyncStatus('pending');
        setHasUnsavedChanges(true);
        hasUnsavedChangesRef.current = true;
        setSyncError('');
        cacheState(localState, true, true);
      } else {
        stateRef.current = validatedState;
        setState(validatedState);
        setSyncStatus('saved');
        setHasUnsavedChanges(false);
        hasUnsavedChangesRef.current = false;
        setLastSyncedAt(new Date());
        cacheState(validatedState, false, true);
      }
    } catch (error) {
      console.error('Erro ao carregar workspace do Supabase:', error);
      const hasLocalData = Boolean(cachedWorkspace?.state);
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
      setSyncError(
        hasLocalData
          ? 'Sem conexao com o servidor. Seus dados locais foram mantidos. Salve as alteracoes quando a conexao voltar.'
          : 'Nao foi possivel carregar seus dados do workspace. Verifique sua conexao e tente novamente.',
      );
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    persistInFlightRef.current = false;
    localRevisionRef.current = 0;

    if (isAuthLoading) return;

    if (!isAuthenticated) {
      setState(buildInitialState());
      setIsLoadingWorkspace(false);
      setSyncError('');
      setSyncStatus('idle');
      setHasUnsavedChanges(false);
      hasUnsavedChangesRef.current = false;
      hiddenLeadingWorkspaceIdRef.current = null;
      remoteIdsRef.current = {
        workspaces: new Set(),
        sections: new Set(),
        tabs: new Set(),
      };
      savedContentSignaturesRef.current = new Map();
      return;
    }

    loadWorkspace();
  }, [isAuthenticated, isAuthLoading, user?.id]);

  const persistState = async (nextState) => {
    if (!user?.id) return { success: false, error: 'Sessao de usuario indisponivel.' };

    const snapshot = buildWorkspaceSnapshot(nextState.workspace, user.id, hiddenLeadingWorkspaceIdRef.current);
    let currentStage = 'preparar o salvamento';

    try {
      currentStage = 'consultar o estado atual';
      const [remoteWorkspaces, remoteSections, remoteTabs, remoteContents] = await Promise.all([
        supabase.from('workspaces').select('id').eq('user_id', user.id),
        supabase.from('sections').select('id').eq('user_id', user.id),
        supabase.from('tabs').select('id').eq('user_id', user.id),
        supabase.from('tab_contents').select('id').eq('user_id', user.id),
      ]);
      const remoteResponses = [remoteWorkspaces, remoteSections, remoteTabs, remoteContents];
      const failedRemoteResponse = remoteResponses.find((response) => response.error);
      if (failedRemoteResponse?.error) throw failedRemoteResponse.error;

      remoteIdsRef.current = {
        workspaces: new Set((remoteWorkspaces.data ?? []).map((item) => item.id)),
        sections: new Set((remoteSections.data ?? []).map((item) => item.id)),
        tabs: new Set((remoteTabs.data ?? []).map((item) => item.id)),
      };
      const remoteContentIds = new Set((remoteContents.data ?? []).map((item) => item.id));
      const contentRowsWithSignatures = await Promise.all(
        snapshot.tabContents.map(async (row) => ({
          row,
          signature: await createWorkspaceContentSignature(row.content),
        })),
      );
      const changedContentRows = contentRowsWithSignatures.filter(
        ({ row, signature }) =>
          !remoteContentIds.has(row.id) || savedContentSignaturesRef.current.get(row.id) !== signature,
      );

      const saveContentRows = async (rows) => {
        const { error } = await supabase.from('tab_contents').upsert(rows, { onConflict: 'id' });
        if (!error) return;

        const isTimeout = /statement timeout|canceling statement/i.test(
          `${error.message ?? ''} ${error.details ?? ''}`,
        );

        if (isTimeout && rows.length > 1) {
          const middle = Math.ceil(rows.length / 2);
          await saveContentRows(rows.slice(0, middle));
          await saveContentRows(rows.slice(middle));
          return;
        }

        if (isTimeout && rows.length === 1 && remoteContentIds.has(rows[0].id)) {
          const row = rows[0];
          const { error: updateError } = await supabase
            .from('tab_contents')
            .update({
              tab_id: row.tab_id,
              user_id: row.user_id,
              content: row.content,
              updated_at: row.updated_at,
            })
            .eq('id', row.id)
            .eq('user_id', user.id);
          if (!updateError) return;
          throw updateError;
        }

        throw error;
      };

      if (snapshot.workspaces.length) {
        currentStage = 'salvar os titulos';
        const { error } = await supabase.from('workspaces').upsert(snapshot.workspaces, {
          onConflict: 'id',
        });
        if (error) throw error;
      }

      if (snapshot.sections.length) {
        currentStage = 'salvar as secoes';
        const { error } = await supabase.from('sections').upsert(snapshot.sections, {
          onConflict: 'id',
        });
        if (error) throw error;
      }

      if (snapshot.tabs.length) {
        currentStage = 'salvar as abas';
        const { error } = await supabase.from('tabs').upsert(snapshot.tabs, {
          onConflict: 'id',
        });
        if (error) throw error;
      }

      if (changedContentRows.length) {
        currentStage = 'compactar os conteudos';
        const persistedContents = await Promise.all(
          changedContentRows.map(async ({ row }) => ({
            ...row,
            content: await compressWorkspaceContent(row.content),
          })),
        );
        const contentChunks = chunkRowsBySerializedSize(persistedContents, 120_000);
        for (let index = 0; index < contentChunks.length; index += 1) {
          currentStage = `salvar os conteudos (${index + 1}/${contentChunks.length})`;
          await saveContentRows(contentChunks[index]);
        }
      }

      const workspaceIdsToDelete = [...remoteIdsRef.current.workspaces].filter(
        (id) => !snapshot.workspaceIds.includes(id),
      );
      const sectionIdsToDelete = [...remoteIdsRef.current.sections].filter(
        (id) => !snapshot.sectionIds.includes(id),
      );
      const tabIdsToDelete = [...remoteIdsRef.current.tabs].filter((id) => !snapshot.tabIds.includes(id));
      const contentIdsToDelete = (remoteContents.data ?? [])
        .map((item) => item.id)
        .filter((id) => !snapshot.tabIds.includes(id));

      if (contentIdsToDelete.length) {
        currentStage = 'remover conteudos antigos';
        const { error } = await supabase
          .from('tab_contents')
          .delete()
          .eq('user_id', user.id)
          .in('id', contentIdsToDelete);
        if (error) throw error;
      }

      if (tabIdsToDelete.length) {
        currentStage = 'remover abas antigas';
        const { error: deleteTabsError } = await supabase
          .from('tabs')
          .delete()
          .eq('user_id', user.id)
          .in('id', tabIdsToDelete);
        if (deleteTabsError) throw deleteTabsError;
      }

      if (sectionIdsToDelete.length) {
        currentStage = 'remover secoes antigas';
        const { error } = await supabase
          .from('sections')
          .delete()
          .eq('user_id', user.id)
          .in('id', sectionIdsToDelete);
        if (error) throw error;
      } else if (snapshot.sectionIds.length === 0 && remoteIdsRef.current.sections.size > 0) {
        currentStage = 'remover todas as secoes antigas';
        const { error } = await supabase.from('sections').delete().eq('user_id', user.id);
        if (error) throw error;
      }

      if (workspaceIdsToDelete.length) {
        currentStage = 'remover titulos antigos';
        const { error } = await supabase
          .from('workspaces')
          .delete()
          .eq('user_id', user.id)
          .in('id', workspaceIdsToDelete);
        if (error) throw error;
      } else if (snapshot.workspaceIds.length === 0 && remoteIdsRef.current.workspaces.size > 0) {
        currentStage = 'remover todos os titulos antigos';
        const { error } = await supabase.from('workspaces').delete().eq('user_id', user.id);
        if (error) throw error;
      }

      currentStage = 'confirmar o snapshot salvo';
      const [savedWorkspaces, savedSections, savedTabs, savedContents] = await Promise.all([
        supabase.from('workspaces').select('id,title').eq('user_id', user.id),
        supabase.from('sections').select('id,workspace_id,title,position').eq('user_id', user.id),
        supabase.from('tabs').select('id,section_id,title,position').eq('user_id', user.id),
        supabase.from('tab_contents').select('id,tab_id').eq('user_id', user.id),
      ]);
      const verificationResponses = [savedWorkspaces, savedSections, savedTabs, savedContents];
      const failedVerification = verificationResponses.find((response) => response.error);
      if (failedVerification?.error) throw failedVerification.error;

      const isVerified =
        rowsMatchSnapshot(savedWorkspaces.data ?? [], snapshot.workspaces, ['id', 'title']) &&
        rowsMatchSnapshot(savedSections.data ?? [], snapshot.sections, ['id', 'workspace_id', 'title', 'position']) &&
        rowsMatchSnapshot(savedTabs.data ?? [], snapshot.tabs, ['id', 'section_id', 'title', 'position']) &&
        rowsMatchSnapshot(savedContents.data ?? [], snapshot.tabContents, ['id', 'tab_id']);

      if (!isVerified) {
        throw new Error('O servidor nao confirmou o snapshot completo do workspace.');
      }

      hiddenLeadingWorkspaceIdRef.current = snapshot.hiddenLeadingWorkspaceId;
      remoteIdsRef.current = {
        workspaces: new Set(snapshot.workspaceIds),
        sections: new Set(snapshot.sectionIds),
        tabs: new Set(snapshot.tabIds),
      };
      savedContentSignaturesRef.current = new Map(
        contentRowsWithSignatures.map(({ row, signature }) => [row.id, signature]),
      );
      return { success: true, error: '' };
    } catch (error) {
      console.error('Erro ao sincronizar workspace com o Supabase:', error);
      const errorMessage = error?.message || error?.details || 'Erro desconhecido do Supabase.';
      return { success: false, error: `Nao foi possivel ${currentStage}: ${errorMessage}` };
    }
  };

  const saveWorkspaceChanges = async () => {
    if (!user?.id || persistInFlightRef.current) return false;

    if (!navigator.onLine) {
      setSyncStatus('offline');
      setSyncError('Sem conexao. As alteracoes continuam protegidas neste dispositivo. Tente salvar novamente quando voltar.');
      cacheState(stateRef.current, true, true);
      return false;
    }

    const snapshotState = stateRef.current;
    const snapshotRevision = localRevisionRef.current;
    persistInFlightRef.current = true;
    setSyncStatus('saving');
    setSyncError('');
    cacheState(snapshotState, true, true);

    const result = await persistState(snapshotState);
    persistInFlightRef.current = false;

    if (!result.success) {
      setHasUnsavedChanges(true);
      hasUnsavedChangesRef.current = true;
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
      setSyncError(
        `Falha ao salvar. Suas alteracoes permanecem neste dispositivo. ${result.error}`,
      );
      cacheState(stateRef.current, true, true);
      return false;
    }

    const changedDuringSave = localRevisionRef.current !== snapshotRevision;
    setLastSyncedAt(new Date());

    if (changedDuringSave) {
      setHasUnsavedChanges(true);
      hasUnsavedChangesRef.current = true;
      setSyncStatus('pending');
      setSyncError('');
      cacheState(stateRef.current, true, true);
      return true;
    }

    setHasUnsavedChanges(false);
    hasUnsavedChangesRef.current = false;
    setSyncStatus('saved');
    setSyncError('');
    cacheState(snapshotState, false, true);
    return true;
  };

  useEffect(() => {
    const handleOnline = () => {
      if (hasUnsavedChangesRef.current) {
        setSyncStatus('pending');
        setSyncError('');
      } else {
        setSyncStatus('saved');
        setSyncError('');
      }
    };

    const handleOffline = () => {
      setSyncStatus('offline');
      setSyncError('Sem conexao. Suas alteracoes continuarao protegidas neste dispositivo.');
      cacheState(stateRef.current, hasUnsavedChangesRef.current, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      cacheState(stateRef.current, hasUnsavedChangesRef.current, true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event) => {
      cacheState(stateRef.current, true, true);
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, user?.id]);

  const updateState = (updater) => {
    setState((current) => {
      const nextState = validateState(updater(current));
      stateRef.current = nextState;
      localRevisionRef.current += 1;
      setHasUnsavedChanges(true);
      hasUnsavedChangesRef.current = true;
      setSyncStatus(navigator.onLine ? 'pending' : 'offline');
      setSyncError('');
      cacheState(nextState, true);
      return nextState;
    });
  };

  const actions = useMemo(
    () => ({
      addTitle() {
        updateState((current) => ({
          ...current,
          workspace: [...current.workspace, createTitle(`Titulo ${Date.now().toString().slice(-4)}`)],
        }));
      },
      addSection() {
        updateState((current) => {
          const section = createSection('Nova secao');
          return {
            ...current,
            workspace: insertAfterItem(current.workspace, current.selectedSectionId, section),
            selectedSectionId: section.id,
          };
        });
      },
      renameTitle(titleId, name) {
        updateState((current) => ({
          ...current,
          workspace: mapWorkspace(current.workspace, titleId, (item) =>
            item.type === 'title' ? { ...item, title: name.trim() || item.title } : item,
          ),
        }));
      },
      updateTitleColor(titleId, color) {
        updateState((current) => ({
          ...current,
          workspace: mapWorkspace(current.workspace, titleId, (item) =>
            item.type === 'title' ? { ...item, color } : item,
          ),
        }));
      },
      deleteTitle(titleId) {
        updateState((current) => ({
          ...current,
          workspace: current.workspace.filter((item) => item.id !== titleId),
        }));
      },
      renameSection(sectionId, name) {
        updateState((current) => ({
          ...current,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section' ? { ...section, name: name.trim() || section.name } : section,
          ),
        }));
      },
      deleteSection(sectionId) {
        updateState((current) => {
          const remainingSections = current.workspace.filter(
            (item) => item.type === 'section' && item.id !== sectionId,
          );

          return {
            ...current,
            workspace: current.workspace.filter((item) => item.id !== sectionId),
            selectedSectionId:
              current.selectedSectionId === sectionId ? remainingSections[0]?.id ?? null : current.selectedSectionId,
            activeTabIdBySection: Object.fromEntries(
              Object.entries(current.activeTabIdBySection).filter(([key]) => key !== sectionId),
            ),
          };
        });
      },
      moveItemUp(itemId) {
        updateState((current) => ({
          ...current,
          workspace: moveItem(current.workspace, itemId, 'up'),
        }));
      },
      moveItemDown(itemId) {
        updateState((current) => ({
          ...current,
          workspace: moveItem(current.workspace, itemId, 'down'),
        }));
      },
      reorderItem(itemId, targetItemId) {
        updateState((current) => ({
          ...current,
          workspace: reorderItems(current.workspace, itemId, targetItemId),
        }));
      },
      reorderTab(sectionId, tabId, targetTabId) {
        updateState((current) => ({
          ...current,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section'
              ? {
                  ...section,
                  tabs: reorderTabs(section.tabs, tabId, targetTabId),
                }
              : section,
          ),
        }));
      },
      selectSection(sectionId) {
        setState((current) =>
          validateState({
            ...current,
            selectedSectionId: sectionId,
          }),
        );
      },
      addTab(sectionId) {
        updateState((current) => {
          const tab = createTab(`Aba ${Date.now().toString().slice(-4)}`);
          return {
            ...current,
            workspace: mapWorkspace(current.workspace, sectionId, (section) =>
              section.type === 'section' ? { ...section, tabs: [...section.tabs, tab] } : section,
            ),
            activeTabIdBySection: {
              ...current.activeTabIdBySection,
              [sectionId]: tab.id,
            },
          };
        });
      },
      duplicateTab(sectionId, tabId) {
        updateState((current) => {
          const section = current.workspace.find((item) => item.type === 'section' && item.id === sectionId) ?? null;
          const originalTab = section?.type === 'section' ? section.tabs.find((tab) => tab.id === tabId) ?? null : null;

          if (!section || !originalTab) {
            return current;
          }

          const duplicatedTab = createTab(`${originalTab.name} - Cópia`, {
            type: originalTab.type,
            content: originalTab.content,
            fileUrl: originalTab.fileUrl,
            noteZoom: originalTab.noteZoom,
            viewMode: originalTab.viewMode ?? 'content',
            canvasDocument: originalTab.canvasDocument ?? null,
            status: 'novo',
          });

          return {
            ...current,
            workspace: mapWorkspace(current.workspace, sectionId, (entry) =>
              entry.type === 'section'
                ? {
                    ...entry,
                    tabs: [...entry.tabs, duplicatedTab],
                  }
                : entry,
            ),
            activeTabIdBySection: {
              ...current.activeTabIdBySection,
              [sectionId]: duplicatedTab.id,
            },
          };
        });
      },
      importPublicModule(sectionId, module) {
        updateState((current) => {
          const tab = createTab(module.title, {
            type: 'module',
            content: module.content ?? '',
            fileUrl: module.file_url,
            status: 'publicado',
          });

          return {
            ...current,
            selectedSectionId: sectionId,
            workspace: mapWorkspace(current.workspace, sectionId, (section) =>
              section.type === 'section' ? { ...section, tabs: [...section.tabs, tab] } : section,
            ),
            activeTabIdBySection: {
              ...current.activeTabIdBySection,
              [sectionId]: tab.id,
            },
          };
        });
      },
      importPrivateModule(sectionId, module) {
        updateState((current) => {
          let content = typeof module.content === 'string' ? module.content : '';
          let fileUrl = typeof module.file_url === 'string' ? module.file_url : null;
          let status = isValidTabStatus(module.status) ? module.status : 'novo';
          let viewMode = module.viewMode === 'quadro' ? 'quadro' : 'content';
          let canvasDocument = module.canvasDocument && typeof module.canvasDocument === 'object' ? module.canvasDocument : null;
          let moduleType =
            module.module_type === 'module' || module.module_type === 'note' || module.module_type === 'pdf'
              ? module.module_type
              : 'html';

          if (content) {
            try {
              const parsed = JSON.parse(content);
              if (parsed && typeof parsed === 'object' && parsed.version === 1) {
                content = typeof parsed.content === 'string' ? parsed.content : '';
                fileUrl = typeof parsed.fileUrl === 'string' ? parsed.fileUrl : fileUrl;
                status = isValidTabStatus(parsed.status) ? parsed.status : status;
                viewMode = parsed.viewMode === 'quadro' ? 'quadro' : viewMode;
                canvasDocument =
                  parsed.canvasDocument && typeof parsed.canvasDocument === 'object'
                    ? parsed.canvasDocument
                    : canvasDocument;
                moduleType =
                  parsed.type === 'module' || parsed.type === 'note' || parsed.type === 'pdf' ? parsed.type : moduleType;
              }
            } catch {
              // raw content fallback
            }
          }

          const tab = createTab(module.title, {
            type: moduleType,
            content,
            fileUrl: moduleType === 'pdf' ? fileUrl ?? content ?? null : fileUrl ?? null,
            noteZoom: 1,
            viewMode,
            canvasDocument,
            status,
          });

          return {
            ...current,
            selectedSectionId: sectionId,
            workspace: mapWorkspace(current.workspace, sectionId, (section) =>
              section.type === 'section' ? { ...section, tabs: [...section.tabs, tab] } : section,
            ),
            activeTabIdBySection: {
              ...current.activeTabIdBySection,
              [sectionId]: tab.id,
            },
          };
        });
      },
      renameTab(sectionId, tabId, name) {
        updateState((current) => ({
          ...current,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section'
              ? {
                  ...section,
                  tabs: section.tabs.map((tab) =>
                    tab.id === tabId ? { ...tab, name: name.trim() || tab.name } : tab,
                  ),
                }
              : section,
          ),
        }));
      },
      closeTab(sectionId, tabId) {
        updateState((current) => {
          const section = current.workspace.find((item) => item.type === 'section' && item.id === sectionId) ?? null;
          const nextTabs = section?.type === 'section' ? section.tabs.filter((tab) => tab.id !== tabId) : [];

          return {
            ...current,
            workspace: mapWorkspace(current.workspace, sectionId, (entry) =>
              entry.type === 'section'
                ? {
                    ...entry,
                    tabs: entry.tabs.filter((tab) => tab.id !== tabId),
                  }
                : entry,
            ),
            activeTabIdBySection: {
              ...current.activeTabIdBySection,
              [sectionId]:
                current.activeTabIdBySection[sectionId] === tabId
                  ? nextTabs[nextTabs.length - 1]?.id ?? null
                  : current.activeTabIdBySection[sectionId] ?? null,
            },
          };
        });
      },
      setActiveTab(sectionId, tabId) {
        setState((current) =>
          validateState({
            ...current,
            activeTabIdBySection: {
              ...current.activeTabIdBySection,
              [sectionId]: tabId,
            },
          }),
        );
      },
      updateTabContent(sectionId, tabId, payload) {
        updateState((current) => ({
          ...current,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section'
              ? {
                  ...section,
                  tabs: section.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...payload } : tab)),
                }
              : section,
          ),
        }));
      },
      importData(payload) {
        updateState(() => validateState(payload));
      },
      clearSyncError() {
        setSyncError('');
      },
      saveChanges() {
        return saveWorkspaceChanges();
      },
      reloadWorkspace() {
        void loadWorkspace();
      },
    }),
    [user?.id],
  );

  const selectedSection =
    state.workspace.find((item) => item.type === 'section' && item.id === state.selectedSectionId) ?? null;
  const selectedTitle = selectedSection ? getSectionTitle(state.workspace, selectedSection.id) : null;
  const activeTab =
    selectedSection?.tabs.find((tab) => tab.id === state.activeTabIdBySection[selectedSection.id]) ??
    selectedSection?.tabs[0] ??
    null;

  const value = useMemo(
    () => ({
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
    }),
    [state, selectedTitle, selectedSection, activeTab, isLoadingWorkspace, syncError, syncStatus, lastSyncedAt, hasUnsavedChanges, actions],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard deve ser usado dentro de DashboardProvider');
  }
  return context;
}
