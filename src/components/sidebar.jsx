import { useEffect, useRef, useState } from 'react';
import { InlineEditable } from './inline-editable';

export function Sidebar({
  workspace,
  selectedSectionId,
  isPublicLibraryActive,
  isPrivateLibraryActive,
  isLoggingOut,
  isMobileOpen,
  syncStatus,
  hasUnsavedChanges,
  onCloseMobile,
  onSaveChanges,
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
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const colorInputRefs = useRef({});
  const createMenuRef = useRef(null);

  useEffect(() => {
    if (!isCreateMenuOpen) return undefined;

    const closeMenu = (event) => {
      if (event.key === 'Escape' || (event.type === 'pointerdown' && !createMenuRef.current?.contains(event.target))) {
        setIsCreateMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, [isCreateMenuOpen]);

  const runCreateAction = (action) => {
    action();
    setIsCreateMenuOpen(false);
  };

  const handleDelete = (item) => {
    const label = item.type === 'title' ? item.title : item.name;
    if (!window.confirm(`Deseja remover "${label}"?`)) return;
    if (item.type === 'title') onDeleteTitle(item.id);
    else onDeleteSection(item.id);
  };

  return (
    <aside
      data-sidebar-shell
      className={`fixed inset-y-0 left-0 z-[80] flex h-full w-[min(88vw,340px)] flex-col border-r border-[#2a2f3a] bg-[#1a1d23]/98 transition-transform duration-150 md:static md:z-auto md:w-[340px] md:min-w-[340px] md:translate-x-0 ${
        isMobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div data-sidebar-structure className="sticky top-0 z-10 border-b border-[#2a2f3a] bg-[#1a1d23]/95 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#a1a1aa]">Workspace</p>
          <div className="flex items-center gap-1">
            <div ref={createMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsCreateMenuOpen((current) => !current)}
                aria-expanded={isCreateMenuOpen}
                aria-haspopup="menu"
                className="flex h-7 w-7 items-center justify-center border border-transparent text-base text-white transition duration-150"
                aria-label="Criar item"
              >
                +
              </button>
              {isCreateMenuOpen ? (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-36 border border-[#3a404d] bg-[#20232a] p-1">
                  <button type="button" role="menuitem" onClick={() => runCreateAction(onAddTitle)} className="w-full px-2.5 py-2 text-left text-xs">
                    Novo titulo
                  </button>
                  <button type="button" role="menuitem" onClick={() => runCreateAction(onAddSection)} className="w-full px-2.5 py-2 text-left text-xs">
                    Nova secao
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-7 w-7 items-center justify-center border border-transparent text-xs text-white md:hidden"
              aria-label="Fechar menu do workspace"
            >
              X
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2.5">
        {workspace.length === 0 ? (
          <div className="border border-dashed border-[#3a404d] bg-white/[0.04] p-3 text-xs leading-5 text-[#a1a1aa]">
            Nenhum item criado. Use o botao + para montar o workspace.
          </div>
        ) : (
          <div className="space-y-0.5">
            {workspace.map((item) => {
              const label = item.type === 'title' ? item.title : item.name;
              const isSection = item.type === 'section';
              const isSelectedSection = selectedSectionId === item.id;
              const isDragOver = dragOverItemId === item.id && draggedItemId !== item.id;

              return (
                <div
                  key={item.id}
                  data-sidebar-item
                  data-selected={isSection && isSelectedSection ? 'true' : 'false'}
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
                    if (dragOverItemId !== item.id) setDragOverItemId(item.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedItemId && draggedItemId !== item.id) onReorderItem(draggedItemId, item.id);
                    setDraggedItemId(null);
                    setDragOverItemId(null);
                  }}
                  className={`group flex items-center gap-2 border px-2.5 py-1.5 transition duration-150 ${
                    isDragOver ? 'border-dashed border-[#5d6678]' : 'border-transparent'
                  } ${draggedItemId === item.id ? 'opacity-60' : ''}`}
                >
                  <InlineEditable
                    value={label}
                    title="Duplo clique para renomear"
                    onClick={isSection ? () => onSelectSection(item.id) : undefined}
                    onSave={(name) =>
                      item.type === 'title' ? onRenameTitle(item.id, name) : onRenameSection(item.id, name)
                    }
                    className={`min-w-0 flex-1 truncate text-left ${
                      item.type === 'title'
                        ? 'text-xs font-semibold uppercase tracking-[0.08em]'
                        : isSelectedSection
                          ? 'text-sm font-semibold text-white'
                          : 'text-sm font-medium text-white/80'
                    }`}
                    inputClassName="w-full border border-[#3a404d] bg-[#0f1115] px-2 py-1 text-sm text-white"
                    data-title-color={item.type === 'title' ? true : undefined}
                    style={item.type === 'title' ? { '--title-color': item.color } : undefined}
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
                        className="flex h-6 w-6 items-center justify-center border border-transparent text-[#a1a1aa] opacity-0 transition duration-150 group-hover:opacity-100"
                        aria-label={`Alterar cor de ${label}`}
                      >
                        <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden="true">
                          <path d="M6.5 13.5 13.75 6.25a1.77 1.77 0 0 0-2.5-2.5L4 11v2.5h2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="m11 6 3 3M3.5 16.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="flex h-6 w-6 items-center justify-center border border-transparent text-xs text-[#a1a1aa] opacity-0 transition duration-150 group-hover:opacity-100"
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

      <div data-sidebar-footer className="border-t border-[#2a2f3a] px-2.5 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={onSaveChanges}
            disabled={syncStatus === 'saving' || !hasUnsavedChanges}
            data-unsaved={hasUnsavedChanges}
            data-ui-variant="primary"
            className="border px-2.5 py-1.5 text-xs font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncStatus === 'saving' ? 'Salvando...' : 'Salvar alteracoes'}
          </button>
          <span className="text-[10px] text-[#8C8A85]">{hasUnsavedChanges ? 'Pendente' : 'Salvo'}</span>
        </div>

        <button type="button" onClick={onOpenPrivateLibrary} data-active={isPrivateLibraryActive} className="w-full border border-transparent px-2.5 py-2 text-left text-xs font-medium transition duration-150">
          Biblioteca Privada
        </button>
        <button type="button" onClick={onOpenPublicLibrary} data-active={isPublicLibraryActive} className="w-full border border-transparent px-2.5 py-2 text-left text-xs font-medium transition duration-150">
          Biblioteca Publica
        </button>
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          className="mt-1 w-full border-x-0 border-b-0 border-t border-[#2a2f3a] px-2.5 py-2.5 text-left text-xs font-medium text-white transition duration-150 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? 'Saindo...' : 'Sair'}
        </button>
      </div>
    </aside>
  );
}
