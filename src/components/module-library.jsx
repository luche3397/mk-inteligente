const fileIcon = (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="size-14"
    aria-hidden="true"
  >
    <path
      d="M14 6.5H27.5L36 15V38C36 39.6569 34.6569 41 33 41H14C12.3431 41 11 39.6569 11 38V9.5C11 7.84315 12.3431 6.5 14 6.5Z"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      className="text-[#8C8A85]"
    />
    <path d="M27 6.5V15H35.5" stroke="#8C8A85" strokeWidth="2" strokeLinejoin="round" />
    <path d="M17 22H30" stroke="#8C8A85" strokeWidth="2" strokeLinecap="round" />
    <path d="M17 28H30" stroke="#8C8A85" strokeWidth="2" strokeLinecap="round" />
    <path d="M17 34H25" stroke="#8C8A85" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const overlayButtonClass =
  'flex size-8 items-center justify-center rounded-full border border-[#3a404d] bg-[#11141a]/90 text-[#a1a1aa] opacity-100 transition duration-150 hover:text-white sm:opacity-0 sm:group-hover:opacity-100';

const formatTypeLabel = (value) => {
  if (value === 'module') return 'Módulo';
  if (value === 'pdf') return 'PDF';
  if (value === 'mk' || value === 'note') return 'MK';
  return 'HTML';
};

const formatStatusLabel = (value) => {
  if (value === 'em revisão') return 'Em revisão';
  if (value === 'aprovado') return 'Aprovado';
  if (value === 'publicado') return 'Publicado';
  return 'Novo';
};

export function ModuleLibrary({
  title,
  subtitle,
  modules,
  isLoading,
  isUploading,
  uploadLabel = '+',
  emptyMessage,
  onUploadClick,
  onModuleClick,
  onDeleteModule,
  onImportModule,
}) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[#a1a1aa]">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-2 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3 border border-[#2a2f3a] bg-white/[0.025] px-3 py-2 sm:px-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#a1a1aa]">{title}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{subtitle}</h3>
        </div>

        <button
          type="button"
          onClick={onUploadClick}
          className="h-8 border border-[#3a404d] px-3 text-xs font-semibold text-white transition duration-150"
        >
          {isUploading ? 'Enviando...' : uploadLabel}
        </button>
      </div>

      {modules.length === 0 ? (
        <div className="flex min-h-[220px] flex-1 items-center justify-center border border-dashed border-[#3a404d] bg-white/[0.025] p-4 text-center text-[#a1a1aa] sm:min-h-[280px] sm:p-6">
          {emptyMessage}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto border border-[#2a2f3a] bg-white/[0.025] p-3 sm:p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-5">
            {modules.map((module) => (
              <button
                key={module.id ?? module.file_url ?? module.title}
                type="button"
                onClick={() => onModuleClick?.(module)}
                className="group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center border border-[#2a2f3a] bg-[#171a20] px-4 py-5 text-center transition duration-150 hover:border-[#3a404d] hover:bg-[#1d2128]"
              >
                <div className="absolute right-3 top-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onImportModule?.(module);
                    }}
                    className={overlayButtonClass}
                    aria-label={`Importar ${module.title}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteModule?.(module);
                    }}
                    className={`${overlayButtonClass} hover:bg-[#3b1f25] hover:text-[#f4c7cf]`}
                    aria-label={`Excluir ${module.title}`}
                  >
                    X
                  </button>
                </div>

                <div className="text-[#8f99aa] transition duration-200 group-hover:text-white">{fileIcon}</div>
                <span className="mt-4 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-white">
                  {module.title}
                </span>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <span className="rounded-full border border-[#3a404d] bg-[#20232a]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d4d4d8]">
                    {formatTypeLabel(module.module_type)}
                  </span>
                  <span className="rounded-full border border-[#3a404d] bg-[#20232a]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d4d4d8]">
                    {formatStatusLabel(module.status)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
