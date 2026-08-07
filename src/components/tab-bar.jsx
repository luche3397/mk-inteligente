import { InlineEditable } from './inline-editable';

export function TabBar({
  tabs,
  activeTabId,
  onAddTab,
  onSelectTab,
  onRenameTab,
  onCloseTab,
  onDuplicateTab,
  onReorderTab,
  onOpenMenu,
}) {
  const handleDragStart = (event, tabId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
  };

  const handleDrop = (event, targetTabId) => {
    event.preventDefault();
    const sourceTabId = event.dataTransfer.getData('text/plain');

    if (!sourceTabId || sourceTabId === targetTabId) {
      return;
    }

    onReorderTab?.(sourceTabId, targetTabId);
  };

  return (
    <div data-workspace-tabs className="border-b border-[#2a2f3a] bg-white/[0.02] px-2 py-1 sm:px-3">
      <div className="flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-transparent text-base text-white md:hidden"
          aria-label="Abrir menu do workspace"
        >
          ☰
        </button>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              data-workspace-tab
              data-active-tab={isActive}
              draggable
              onDragStart={(event) => handleDragStart(event, tab.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, tab.id)}
              className={`group flex h-8 min-w-[145px] max-w-[240px] items-center gap-1.5 border px-2.5 transition duration-150 sm:min-w-[180px] sm:max-w-[280px] ${
                isActive
                  ? 'border-[#3a404d] bg-[#1a1d23] text-white'
                  : 'border-transparent bg-white/[0.04] text-[#a1a1aa] hover:bg-[#20232a]'
              }`}
            >
              <InlineEditable
                value={tab.name}
                title="Duplo clique para renomear"
                onClick={() => onSelectTab(tab.id)}
                onSave={(name) => onRenameTab(tab.id, name)}
                className="block min-w-0 flex-1 truncate text-left text-sm font-medium"
                inputClassName="w-full rounded-lg border border-[#3a404d] bg-[#0f1115] px-2 py-1 text-sm text-white"
              />




              {onDuplicateTab ? (
                <button
                  type="button"
                  onClick={() => onDuplicateTab(tab.id)}
                  className="flex h-6 w-6 items-center justify-center border border-transparent text-xs text-[#7b818d] transition duration-150 hover:text-white"
                  aria-label={`Duplicar ${tab.name}`}
                >
                  +
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onCloseTab(tab.id)}
                className="flex h-6 w-6 items-center justify-center border border-transparent text-xs text-[#7b818d] transition duration-150 hover:text-[#f4c7cf]"
              >
                X
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddTab}
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-transparent text-base text-white transition duration-150"
        >
          +
        </button>
      </div>
    </div>
  );
}
