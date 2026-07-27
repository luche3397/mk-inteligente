const serializeWorkspaceTitle = ({ label, color, position, hidden = false }) =>
  JSON.stringify({
    label,
    color,
    position,
    hidden,
  });

const serializeTabContent = (tab) =>
  JSON.stringify({
    type: tab.type === 'module' || tab.type === 'note' || tab.type === 'pdf' ? tab.type : 'html',
    content: typeof tab.content === 'string' ? tab.content : '',
    fileUrl: typeof tab.fileUrl === 'string' ? tab.fileUrl : null,
    noteZoom: typeof tab.noteZoom === 'number' ? tab.noteZoom : 1,
    viewMode: tab.viewMode === 'quadro' ? 'quadro' : 'content',
    canvasDocument: tab.canvasDocument && typeof tab.canvasDocument === 'object' ? tab.canvasDocument : null,
    status:
      tab.status === 'novo' ||
      tab.status === 'em revisão' ||
      tab.status === 'aprovado' ||
      tab.status === 'publicado'
        ? tab.status
        : 'novo',
  });

export const buildWorkspaceSnapshot = (workspace, userId, hiddenLeadingWorkspaceId) => {
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
  let resolvedHiddenWorkspaceId = hiddenLeadingWorkspaceId ?? null;
  const sectionPositionByWorkspace = new Map();

  const ensureHiddenWorkspace = () => {
    hiddenWorkspaceUsed = true;
    const hiddenWorkspaceId = resolvedHiddenWorkspaceId ?? crypto.randomUUID();
    resolvedHiddenWorkspaceId = hiddenWorkspaceId;

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
    hiddenLeadingWorkspaceId: hiddenWorkspaceUsed ? resolvedHiddenWorkspaceId : null,
  };
};

export const rowsMatchSnapshot = (remoteRows, snapshotRows, fields) => {
  const normalize = (rows) =>
    rows
      .map((row) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null])))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  return JSON.stringify(normalize(remoteRows)) === JSON.stringify(normalize(snapshotRows));
};
