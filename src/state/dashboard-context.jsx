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

const serializeWorkspaceTitle = ({ label, color, position, hidden = false }) =>
  JSON.stringify({
    label,
    color,
    position,
    hidden,
  });

const parseTabContent = (value = '') => {
  if (!value) {
    return {
      type: 'html',
      content: '',
      fileUrl: null,
      noteZoom: 1,
      status: 'novo',
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
    status: 'novo',
  };
};

const serializeTabContent = (tab) =>
  JSON.stringify({
    type: tab.type === 'module' || tab.type === 'note' || tab.type === 'pdf' ? tab.type : 'html',
    content: typeof tab.content === 'string' ? tab.content : '',
    fileUrl: typeof tab.fileUrl === 'string' ? tab.fileUrl : null,
    noteZoom: typeof tab.noteZoom === 'number' ? tab.noteZoom : 1,
    status:
      tab.status === 'novo' ||
      tab.status === 'em revisão' ||
      tab.status === 'aprovado' ||
      tab.status === 'publicado'
        ? tab.status
        : 'novo',
  });

const isValidTabStatus = (value) =>
  value === 'novo' || value === 'em revisão' || value === 'aprovado' || value === 'publicado';

const buildWorkspaceSnapshot = (workspace, userId, hiddenLeadingWorkspaceId) => {
  const workspaces = [];
  const sections = [];
  const tabs = [];
  const tabContents = [];
  const workspaceIds = [];
  const sectionIds = [];
  const tabIds = [];
  let workspacePosition = 0;
  let currentWorkspaceId = null;
  let hiddenWorkspaceUsed = false;
  const sectionPositionByWorkspace = new Map();

  const ensureHiddenWorkspace = () => {
    hiddenWorkspaceUsed = true;

    const hiddenWorkspaceId = hiddenLeadingWorkspaceId ?? crypto.randomUUID();

    if (!workspaces.some((workspaceRow) => workspaceRow.id === hiddenWorkspaceId)) {
      workspaces.push({
        id: hiddenWorkspaceId,
        user_id: userId,
        title: serializeWorkspaceTitle({
          label: '',
          color: '#ffffff',
          position: workspacePosition,
          hidden: true,
        }),
      });
      workspaceIds.push(hiddenWorkspaceId);
      workspacePosition += 1;
    }

    return hiddenWorkspaceId;
  };

  workspace.forEach((item) => {
    if (item.type === 'title') {
      currentWorkspaceId = item.id;
      sectionPositionByWorkspace.set(currentWorkspaceId, 0);

      workspaces.push({
        id: item.id,
        user_id: userId,
        title: serializeWorkspaceTitle({
          label: item.title,
          color: item.color ?? '#ffffff',
          position: workspacePosition,
          hidden: false,
        }),
      });
      workspaceIds.push(item.id);
      workspacePosition += 1;
      return;
    }

    if (!currentWorkspaceId) {
      currentWorkspaceId = ensureHiddenWorkspace();
      sectionPositionByWorkspace.set(currentWorkspaceId, 0);
    }

    const sectionPosition = sectionPositionByWorkspace.get(currentWorkspaceId) ?? 0;
    sectionPositionByWorkspace.set(currentWorkspaceId, sectionPosition + 1);

    sections.push({
      id: item.id,
      workspace_id: currentWorkspaceId,
      user_id: userId,
      title: item.name,
      position: sectionPosition,
    });
    sectionIds.push(item.id);

    item.tabs.forEach((tab, index) => {
      tabs.push({
        id: tab.id,
        section_id: item.id,
        user_id: userId,
        title: tab.name,
        position: index,
      });
      tabIds.push(tab.id);

      tabContents.push({
        id: tab.id,
        tab_id: tab.id,
        user_id: userId,
        content: serializeTabContent(tab),
        updated_at: new Date().toISOString(),
      });
    });
  });

  return {
    workspaces,
    sections,
    tabs,
    tabContents,
    workspaceIds,
    sectionIds,
    tabIds,
    hiddenLeadingWorkspaceId: hiddenWorkspaceUsed ? currentWorkspaceId : null,
  };
};

const formatIdsForInFilter = (ids) => `(${ids.join(',')})`;

export function DashboardProvider({ children }) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [state, setState] = useState(buildInitialState);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [syncError, setSyncError] = useState('');
  const stateRef = useRef(state);
  const syncTimerRef = useRef(null);
  const hiddenLeadingWorkspaceIdRef = useRef(null);
  const remoteIdsRef = useRef({
    workspaces: new Set(),
    sections: new Set(),
    tabs: new Set(),
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadWorkspace = async () => {
    if (!user?.id) {
      setState(buildInitialState());
      setIsLoadingWorkspace(false);
      hiddenLeadingWorkspaceIdRef.current = null;
      remoteIdsRef.current = {
        workspaces: new Set(),
        sections: new Set(),
        tabs: new Set(),
      };
      return;
    }

    setIsLoadingWorkspace(true);
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
      const contents = contentsResponse.data ?? [];

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

      setState(validatedState);
    } catch (error) {
      console.error('Erro ao carregar workspace do Supabase:', error);
      setSyncError('Nao foi possivel carregar seus dados do workspace.');
      setState(buildInitialState());
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    if (isAuthLoading) return;

    if (!isAuthenticated) {
      setState(buildInitialState());
      setIsLoadingWorkspace(false);
      setSyncError('');
      hiddenLeadingWorkspaceIdRef.current = null;
      remoteIdsRef.current = {
        workspaces: new Set(),
        sections: new Set(),
        tabs: new Set(),
      };
      return;
    }

    loadWorkspace();
  }, [isAuthenticated, isAuthLoading, user?.id]);

  const persistState = async (nextState) => {
    if (!user?.id) return;

    const snapshot = buildWorkspaceSnapshot(nextState.workspace, user.id, hiddenLeadingWorkspaceIdRef.current);

    try {
      setSyncError('');

      if (snapshot.workspaces.length) {
        const { error } = await supabase.from('workspaces').upsert(snapshot.workspaces, {
          onConflict: 'id',
        });
        if (error) throw error;
      }

      if (snapshot.sections.length) {
        const { error } = await supabase.from('sections').upsert(snapshot.sections, {
          onConflict: 'id',
        });
        if (error) throw error;
      }

      if (snapshot.tabs.length) {
        const { error } = await supabase.from('tabs').upsert(snapshot.tabs, {
          onConflict: 'id',
        });
        if (error) throw error;
      }

      if (snapshot.tabContents.length) {
        const { error } = await supabase.from('tab_contents').upsert(snapshot.tabContents, {
          onConflict: 'id',
        });
        if (error) throw error;
      }

      const workspaceIdsToDelete = [...remoteIdsRef.current.workspaces].filter(
        (id) => !snapshot.workspaceIds.includes(id),
      );
      const sectionIdsToDelete = [...remoteIdsRef.current.sections].filter(
        (id) => !snapshot.sectionIds.includes(id),
      );
      const tabIdsToDelete = [...remoteIdsRef.current.tabs].filter((id) => !snapshot.tabIds.includes(id));

      if (tabIdsToDelete.length) {
        const { error } = await supabase
          .from('tab_contents')
          .delete()
          .eq('user_id', user.id)
          .in('id', tabIdsToDelete);
        if (error) throw error;

        const { error: deleteTabsError } = await supabase
          .from('tabs')
          .delete()
          .eq('user_id', user.id)
          .in('id', tabIdsToDelete);
        if (deleteTabsError) throw deleteTabsError;
      } else if (snapshot.tabIds.length === 0 && remoteIdsRef.current.tabs.size > 0) {
        const { error } = await supabase.from('tab_contents').delete().eq('user_id', user.id);
        if (error) throw error;
        const { error: deleteTabsError } = await supabase.from('tabs').delete().eq('user_id', user.id);
        if (deleteTabsError) throw deleteTabsError;
      }

      if (sectionIdsToDelete.length) {
        const { error } = await supabase
          .from('sections')
          .delete()
          .eq('user_id', user.id)
          .in('id', sectionIdsToDelete);
        if (error) throw error;
      } else if (snapshot.sectionIds.length === 0 && remoteIdsRef.current.sections.size > 0) {
        const { error } = await supabase.from('sections').delete().eq('user_id', user.id);
        if (error) throw error;
      }

      if (workspaceIdsToDelete.length) {
        const { error } = await supabase
          .from('workspaces')
          .delete()
          .eq('user_id', user.id)
          .in('id', workspaceIdsToDelete);
        if (error) throw error;
      } else if (snapshot.workspaceIds.length === 0 && remoteIdsRef.current.workspaces.size > 0) {
        const { error } = await supabase.from('workspaces').delete().eq('user_id', user.id);
        if (error) throw error;
      }

      hiddenLeadingWorkspaceIdRef.current = snapshot.hiddenLeadingWorkspaceId;
      remoteIdsRef.current = {
        workspaces: new Set(snapshot.workspaceIds),
        sections: new Set(snapshot.sectionIds),
        tabs: new Set(snapshot.tabIds),
      };
    } catch (error) {
      console.error('Erro ao sincronizar workspace com o Supabase:', error);
      setSyncError('Nao foi possivel salvar suas alteracoes.');
      await loadWorkspace();
    }
  };

  const queuePersist = (nextState, debounceMs = 0) => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    if (!user?.id) return;

    if (debounceMs > 0) {
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        void persistState(stateRef.current);
      }, debounceMs);
      return;
    }

    void persistState(nextState);
  };

  const updateState = (updater, options = {}) => {
    setState((current) => {
      const nextState = validateState(updater(current));
      queuePersist(nextState, options.debounceMs ?? 0);
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
          const moduleType =
            module.module_type === 'module' || module.module_type === 'note' || module.module_type === 'pdf'
              ? module.module_type
              : 'html';
          const tab = createTab(module.title, {
            type: moduleType,
            content: typeof module.content === 'string' ? module.content : '',
            fileUrl: moduleType === 'pdf' ? module.content ?? null : null,
            noteZoom: 1,
            status: isValidTabStatus(module.status) ? module.status : 'novo',
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
        updateState(
          (current) => ({
            ...current,
            workspace: mapWorkspace(current.workspace, sectionId, (section) =>
              section.type === 'section'
                ? {
                    ...section,
                    tabs: section.tabs.map((tab) => (tab.id === tabId ? { ...tab, ...payload } : tab)),
                  }
                : section,
            ),
          }),
          { debounceMs: 800 },
        );
      },
      importData(payload) {
        updateState(() => validateState(payload));
      },
      clearSyncError() {
        setSyncError('');
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
      actions,
    }),
    [state, selectedTitle, selectedSection, activeTab, isLoadingWorkspace, syncError, actions],
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
