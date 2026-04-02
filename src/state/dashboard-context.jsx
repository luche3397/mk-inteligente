import { createContext, useContext, useEffect, useState } from 'react';
import {
  STORAGE_KEY,
  buildInitialState,
  createSection,
  createTab,
  createTitle,
  getSectionTitle,
  validateState,
} from '../utils/dashboard';

const DashboardContext = createContext(null);

const getInitialState = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? validateState(JSON.parse(stored)) : buildInitialState();
  } catch (error) {
    console.error('Erro ao restaurar workspace:', error);
    return buildInitialState();
  }
};

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

export function DashboardProvider({ children }) {
  const [state, setState] = useState(getInitialState);
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    setIsBootstrapped(true);
  }, []);

  useEffect(() => {
    if (!isBootstrapped) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [isBootstrapped, state]);

  const actions = {
    addTitle() {
      setState((current) =>
        validateState({
          ...current,
          workspace: [...current.workspace, createTitle(`Titulo ${Date.now().toString().slice(-4)}`)],
        }),
      );
    },
    addSection() {
      setState((current) => {
        const section = createSection('Nova secao');
        return validateState({
          ...current,
          workspace: insertAfterItem(current.workspace, current.selectedSectionId, section),
          selectedSectionId: section.id,
        });
      });
    },
    renameTitle(titleId, name) {
      setState((current) =>
        validateState({
          ...current,
          workspace: mapWorkspace(current.workspace, titleId, (item) =>
            item.type === 'title' ? { ...item, title: name.trim() || item.title } : item,
          ),
        }),
      );
    },
    updateTitleColor(titleId, color) {
      setState((current) =>
        validateState({
          ...current,
          workspace: mapWorkspace(current.workspace, titleId, (item) =>
            item.type === 'title' ? { ...item, color } : item,
          ),
        }),
      );
    },
    deleteTitle(titleId) {
      setState((current) =>
        validateState({
          ...current,
          workspace: current.workspace.filter((item) => item.id !== titleId),
        }),
      );
    },
    renameSection(sectionId, name) {
      setState((current) =>
        validateState({
          ...current,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section' ? { ...section, name: name.trim() || section.name } : section,
          ),
        }),
      );
    },
    deleteSection(sectionId) {
      setState((current) => {
        const remainingSections = current.workspace.filter(
          (item) => item.type === 'section' && item.id !== sectionId,
        );

        return validateState({
          ...current,
          workspace: current.workspace.filter((item) => item.id !== sectionId),
          selectedSectionId:
            current.selectedSectionId === sectionId ? remainingSections[0]?.id ?? null : current.selectedSectionId,
          activeTabIdBySection: Object.fromEntries(
            Object.entries(current.activeTabIdBySection).filter(([key]) => key !== sectionId),
          ),
        });
      });
    },
    moveItemUp(itemId) {
      setState((current) =>
        validateState({
          ...current,
          workspace: moveItem(current.workspace, itemId, 'up'),
        }),
      );
    },
    moveItemDown(itemId) {
      setState((current) =>
        validateState({
          ...current,
          workspace: moveItem(current.workspace, itemId, 'down'),
        }),
      );
    },
    reorderItem(itemId, targetItemId) {
      setState((current) =>
        validateState({
          ...current,
          workspace: reorderItems(current.workspace, itemId, targetItemId),
        }),
      );
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
      setState((current) => {
        const tab = createTab(`Aba ${Date.now().toString().slice(-4)}`);
        return validateState({
          ...current,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section' ? { ...section, tabs: [...section.tabs, tab] } : section,
          ),
          activeTabIdBySection: {
            ...current.activeTabIdBySection,
            [sectionId]: tab.id,
          },
        });
      });
    },
    importPublicModule(sectionId, module) {
      setState((current) => {
        const tab = createTab(module.title, {
          type: 'module',
          content: module.content ?? '',
          fileUrl: module.file_url,
        });

        return validateState({
          ...current,
          selectedSectionId: sectionId,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section' ? { ...section, tabs: [...section.tabs, tab] } : section,
          ),
          activeTabIdBySection: {
            ...current.activeTabIdBySection,
            [sectionId]: tab.id,
          },
        });
      });
    },
    renameTab(sectionId, tabId, name) {
      setState((current) =>
        validateState({
          ...current,
          workspace: mapWorkspace(current.workspace, sectionId, (section) =>
            section.type === 'section'
              ? {
                  ...section,
                  tabs: section.tabs.map((tab) => (tab.id === tabId ? { ...tab, name: name.trim() || tab.name } : tab)),
                }
              : section,
          ),
        }),
      );
    },
    closeTab(sectionId, tabId) {
      setState((current) => {
        const section = current.workspace.find((item) => item.type === 'section' && item.id === sectionId) ?? null;
        const nextTabs = section?.type === 'section' ? section.tabs.filter((tab) => tab.id !== tabId) : [];

        return validateState({
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
        });
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
      setState((current) =>
        validateState({
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
      );
    },
    importData(payload) {
      setState(validateState(payload));
    },
  };

  const selectedSection =
    state.workspace.find((item) => item.type === 'section' && item.id === state.selectedSectionId) ?? null;
  const selectedTitle = selectedSection ? getSectionTitle(state.workspace, selectedSection.id) : null;
  const activeTab =
    selectedSection?.tabs.find((tab) => tab.id === state.activeTabIdBySection[selectedSection.id]) ??
    selectedSection?.tabs[0] ??
    null;

  return (
    <DashboardContext.Provider
      value={{
        state,
        selectedTitle,
        selectedSection,
        activeTab,
        actions,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard deve ser usado dentro de DashboardProvider');
  }
  return context;
}
