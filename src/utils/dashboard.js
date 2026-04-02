export const STORAGE_KEY = 'client-control-dashboard';

const createId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export const detectTabType = (content = '') =>
  /window\s*\.\s*nomadeModule\b/.test(content) ? 'module' : 'html';

export const createTab = (name = 'Nova aba', overrides = {}) => ({
  id: createId('tab'),
  name,
  type: 'html',
  content: '',
  fileUrl: null,
  ...overrides,
});

export const createTitle = (title = 'Novo titulo') => ({
  id: createId('title'),
  type: 'title',
  title,
  color: '#ffffff',
});

export const createSection = (name = 'Nova secao', overrides = {}) => ({
  id: createId('section'),
  type: 'section',
  name,
  tabs: [],
  ...overrides,
});

export const buildInitialState = () => ({
  workspace: [],
  selectedSectionId: null,
  activeTabIdBySection: {},
});

const normalizeTab = (tab, index) => {
  if (!tab || typeof tab !== 'object') {
    return createTab(`Aba ${index + 1}`);
  }

  const content =
    typeof tab.content === 'string' ? tab.content : typeof tab.htmlContent === 'string' ? tab.htmlContent : '';
  const type = tab.type === 'module' || tab.type === 'html' ? tab.type : detectTabType(content);

  return {
    id: typeof tab.id === 'string' ? tab.id : createId('tab'),
    name: typeof tab.name === 'string' && tab.name.trim() ? tab.name : `Aba ${index + 1}`,
    type,
    content,
    fileUrl: typeof tab.fileUrl === 'string' ? tab.fileUrl : null,
  };
};

const normalizeTitleItem = (item, index) => ({
  id: typeof item?.id === 'string' ? item.id : createId('title'),
  type: 'title',
  title: typeof item?.title === 'string' && item.title.trim() ? item.title : `Titulo ${index + 1}`,
  color: typeof item?.color === 'string' && item.color.trim() ? item.color : '#ffffff',
});

const normalizeSectionItem = (item, index) => ({
  id: typeof item?.id === 'string' ? item.id : createId('section'),
  type: 'section',
  name: typeof item?.name === 'string' && item.name.trim() ? item.name : `Secao ${index + 1}`,
  tabs: Array.isArray(item?.tabs) ? item.tabs.map(normalizeTab) : [],
});

const flattenLegacyTitleEntry = (entry, index) => {
  const items = [normalizeTitleItem(entry, index)];

  if (!Array.isArray(entry?.topics)) {
    return items;
  }

  let sectionIndex = 0;
  entry.topics.forEach((topic) => {
    const sections = Array.isArray(topic?.sections) ? topic.sections : [];
    sections.forEach((section) => {
      items.push(normalizeSectionItem(section, sectionIndex));
      sectionIndex += 1;
    });
  });

  return items;
};

const normalizeWorkspace = (workspace) => {
  if (!Array.isArray(workspace)) return [];

  const normalized = [];
  let titleIndex = 0;
  let sectionIndex = 0;

  workspace.forEach((entry) => {
    if (Array.isArray(entry?.topics)) {
      normalized.push(...flattenLegacyTitleEntry(entry, titleIndex));
      titleIndex += 1;
      return;
    }

    if (entry?.type === 'title' || ('title' in (entry ?? {}) && !('name' in (entry ?? {})))) {
      normalized.push(normalizeTitleItem(entry, titleIndex));
      titleIndex += 1;
      return;
    }

    normalized.push(normalizeSectionItem(entry, sectionIndex));
    sectionIndex += 1;
  });

  return normalized;
};

const migrateLegacyClientsState = (value) => {
  const clients = Array.isArray(value?.clients) ? value.clients : [];
  if (!clients.length) return null;

  const workspace = [createTitle('Clientes')];

  clients.forEach((client, clientIndex) => {
    const sections = Array.isArray(client?.sections)
      ? client.sections.map((section, sectionIndex) =>
          normalizeSectionItem(
            {
              ...section,
              tabs: Array.isArray(section?.tabs)
                ? section.tabs.map((tab) => ({
                    ...tab,
                    content: typeof tab?.htmlContent === 'string' ? tab.htmlContent : tab?.content,
                  }))
                : [],
            },
            sectionIndex,
          ),
        )
      : [createSection(`Secao ${clientIndex + 1}`)];

    workspace.push(...sections);
  });

  return {
    workspace,
    selectedSectionId: value.selectedSectionId ?? workspace.find((item) => item.type === 'section')?.id ?? null,
    activeTabIdBySection:
      value.activeTabIdBySection && typeof value.activeTabIdBySection === 'object'
        ? value.activeTabIdBySection
        : {},
  };
};

export const getSectionTitle = (workspace, sectionId) => {
  if (!Array.isArray(workspace) || !sectionId) return null;

  let currentTitle = null;

  for (const item of workspace) {
    if (item.type === 'title') {
      currentTitle = item;
    }

    if (item.type === 'section' && item.id === sectionId) {
      return currentTitle;
    }
  }

  return null;
};

const ensureSelection = (state) => {
  const workspace = normalizeWorkspace(state.workspace);
  const sections = workspace.filter((item) => item.type === 'section');
  const selectedSection = sections.find((item) => item.id === state.selectedSectionId) ?? sections[0] ?? null;
  const nextActiveTabIdBySection = { ...state.activeTabIdBySection };

  sections.forEach((section) => {
    const activeTabId = nextActiveTabIdBySection[section.id];
    const hasActiveTab = section.tabs.some((tab) => tab.id === activeTabId);

    if (!hasActiveTab) {
      if (section.tabs[0]) {
        nextActiveTabIdBySection[section.id] = section.tabs[0].id;
      } else {
        delete nextActiveTabIdBySection[section.id];
      }
    }
  });

  Object.keys(nextActiveTabIdBySection).forEach((sectionId) => {
    if (!sections.some((section) => section.id === sectionId)) {
      delete nextActiveTabIdBySection[sectionId];
    }
  });

  return {
    workspace,
    selectedSectionId: selectedSection?.id ?? null,
    activeTabIdBySection: nextActiveTabIdBySection,
  };
};

export const validateState = (value) => {
  if (!value || typeof value !== 'object') {
    return buildInitialState();
  }

  if (Array.isArray(value.workspace)) {
    return ensureSelection({
      workspace: value.workspace,
      selectedSectionId: value.selectedSectionId ?? null,
      activeTabIdBySection:
        value.activeTabIdBySection && typeof value.activeTabIdBySection === 'object'
          ? value.activeTabIdBySection
          : {},
    });
  }

  const migrated = migrateLegacyClientsState(value);
  return migrated ? ensureSelection(migrated) : buildInitialState();
};

export const downloadJson = (filename, payload) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
