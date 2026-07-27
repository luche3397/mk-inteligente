import { useRef, useState } from 'react';
import { InlineEditable } from './inline-editable';

export function Sidebar({
  workspace,
  selectedSectionId,
  isPublicLibraryActive,
  isPrivateLibraryActive,
  isLoggingOut,
  isMobileOpen,
  onCloseMobile,
  onAddTitle,
  onAddSection,
  onRenameTitle,
  onUpdateTitleColor,
  onDeleteTitle,
  onRenameSection,
  onDeleteSection,
  onReorderItem,
  onSelectSection,
  onOpenPublicLibrary,
  onOpenPrivateLibrary,
  onLogout,
}) {
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const colorInputRefs = useRef({});

  const handleDelete = (item) => {
    if (item.type === 'title') {
      if (window.confirm(`Deseja remover o titulo "${item.title}"?`)) {
        onDeleteTitle(item.id);
      }
      return;
    }

    if (window.confirm(`Deseja remover a secao "${item.name}"?`)) {
      onDeleteSection(item.id);
    }
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-[80] flex h-full w-[min(88vw,340px)] flex-col border-r border-[#2a2f3a] bg-[#1a1d23]/98 shadow-2xl backdrop-blur-2xl transition-transform duration-200 md:static md:z-auto md:w-[340px] md:min-w-[340px] md:translate-x-0 md:shadow-none ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="sticky top-0 z-10 border-b border-[#2a2f3a] bg-[#1a1d23]/95 px-5 py-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#a1a1aa]">Workspace</p>
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#3a404d] bg-[#20232a] text-sm text-white md:hidden"
            aria-label="Fechar menu do workspace"
          >
            X
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onAddTitle}
            className="rounded-2xl border border-[#3a404d] bg-[#20232a] px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#2f3542]"
          >
            + Titulo
          </button>
          <button
            type="button"
            onClick={onAddSection}
            className="rounded-2xl border border-[#3a404d] bg-[#20232a] px-4 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#2f3542]"
          >
            + Secao
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {workspace.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#3a404d] bg-white/[0.04] p-4 text-sm text-[#a1a1aa]">
            Nenhum item criado ainda. Use os botoes acima para montar o workspace.
          </div>
        ) : (
          <div className="space-y-1">
            {workspace.map((item) => {
              const label = item.type === 'title' ? item.title : item.name;
              const isSection = item.type === 'section';
              const isSelectedSection = selectedSectionId === item.id;
              const isDragOver = dragOverItemId === item.id && draggedItemId !== item.id;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => {
                    setDraggedItemId(item.id);
                    setDragOverItemId(item.id);
                  }}
                  onDragEnd={() => {
                    setDraggedItemId(null);
                    setDragOverItemId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverItemId !== item.id) {
                      setDragOverItemId(item.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedItemId && draggedItemId !== item.id) {
                      onReorderItem(draggedItemId, item.id);
                    }
                    setDraggedItemId(null);
                    setDragOverItemId(null);
                  }}
                  className={`group flex items-center gap-2 rounded-2xl px-3 py-2 transition duration-150 ${
                    isSection && isSelectedSection ? 'bg-white/[0.07]' : 'bg-transparent hover:bg-white/[0.04]'
                  } ${isDragOver ? 'border border-dashed border-[#5d6678]' : 'border border-transparent'} ${
                    draggedItemId === item.id ? 'opacity-60' : ''
                  }`}
                >
                  <InlineEditable
                    value={label}
                    title="Duplo clique para renomear"
                    onClick={isSection ? () => onSelectSection(item.id) : undefined}
                    onSave={(name) =>
                      item.type === 'title' ? onRenameTitle(item.id, name) : onRenameSection(item.id, name)
                    }
                    className={`min-w-0 flex-1 truncate text-left ${
                      item.type === 'title' ? 'text-sm font-semibold' : 'text-sm font-medium text-white'
                    }`}
                    inputClassName="w-full rounded-lg border border-[#3a404d] bg-[#0f1115] px-2 py-1 text-sm text-white"
                    style={item.type === 'title' ? { color: item.color } : undefined}
                  />

                  {item.type === 'title' ? (
                    <>
                      <input
                        ref={(element) => {
                          colorInputRefs.current[item.id] = element;
                        }}
                        type="color"
                        value={item.color}
                        onChange={(event) => onUpdateTitleColor(item.id, event.target.value)}
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        onClick={() => colorInputRefs.current[item.id]?.click()}
                        className="rounded-md px-1.5 py-0.5 text-xs text-[#a1a1aa] opacity-0 transition duration-150 hover:bg-[#2f3542] hover:text-white group-hover:opacity-100"
                        aria-label={`Alterar cor de ${label}`}
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="size-3.5"
                        >
                          <path
                            d="M6.5 13.5L13.75 6.25C14.4404 5.55964 14.4404 4.44036 13.75 3.75C13.0596 3.05964 11.9404 3.05964 11.25 3.75L4 11V13.5H6.5Z"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M11 6L14 9"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M3.5 16.5H16.5"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="rounded-md px-1.5 py-0.5 text-xs text-[#a1a1aa] opacity-0 transition duration-150 hover:bg-[#3b1f25] hover:text-[#f4c7cf] group-hover:opacity-100"
                    aria-label={`Excluir ${label}`}
                  >
                    X
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[#2a2f3a] px-3 py-3">
        <button
          type="button"
          onClick={onOpenPrivateLibrary}
          className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition duration-200 ${
            isPrivateLibraryActive
              ? 'border-[#454d5c] bg-[#2a2f3a] text-white'
              : 'border-[#2a2f3a] bg-white/[0.03] text-white hover:border-[#3a404d] hover:bg-white/[0.05]'
          }`}
        >
          Biblioteca Privada
        </button>

        <button
          type="button"
          onClick={onOpenPublicLibrary}
          className={`mt-3 w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition duration-200 ${
            isPublicLibraryActive
              ? 'border-[#454d5c] bg-[#2a2f3a] text-white'
              : 'border-[#2a2f3a] bg-white/[0.03] text-white hover:border-[#3a404d] hover:bg-white/[0.05]'
          }`}
        >
          Biblioteca Publica
        </button>

        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          className="mt-3 w-full rounded-2xl border border-[#2a2f3a] bg-white/[0.03] px-4 py-3 text-left text-sm font-semibold text-white transition duration-200 hover:border-[#3a404d] hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? 'Saindo...' : 'Sair'}
        </button>
      </div>
    </aside>
  );
}
