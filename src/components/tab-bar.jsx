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
    <div className="border-b border-[#2a2f3a] bg-white/[0.02] px-2 py-1.5 sm:px-4 sm:py-2">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#3a404d] bg-[#20232a] text-lg text-white md:hidden"
          aria-label="Abrir menu do workspace"
        >
          ☰
        </button>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              data-active-tab={isActive}
              draggable
              onDragStart={(event) => handleDragStart(event, tab.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, tab.id)}
              className={`group flex min-w-[170px] max-w-[260px] items-center gap-2 rounded-t-[18px] border px-3 py-1.5 transition duration-200 sm:min-w-[220px] sm:max-w-[320px] sm:rounded-t-[22px] ${
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
                  className="rounded-md px-1.5 py-1 text-xs text-[#7b818d] transition duration-200 hover:bg-[#2f3542] hover:text-white"
                  aria-label={`Duplicar ${tab.name}`}
                >
                  +
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onCloseTab(tab.id)}
                className="rounded-md px-1.5 py-1 text-xs text-[#7b818d] transition duration-200 hover:bg-[#3b1f25] hover:text-[#f4c7cf]"
              >
                X
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddTab}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#3a404d] bg-white/[0.03] text-lg text-white transition duration-200 hover:bg-[#2f3542]"
        >
          +
        </button>
      </div>
    </div>
  );
}
