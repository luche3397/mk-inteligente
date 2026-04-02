export function Topbar({
  selectedTitle,
  selectedSection,
  contextLabel,
  onExportData,
  onImportData,
  isImporting,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2a2f3a] bg-white/[0.02] px-6 py-4 backdrop-blur-xl">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[#a1a1aa]">Workspace Dashboard</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Organizacao modular de conteudo e modulos inteligentes</h2>
        <p className="mt-2 text-sm text-[#a1a1aa]">
          {contextLabel ?? ([selectedTitle?.title, selectedSection?.name].filter(Boolean).join(' / ') || 'Nenhum contexto selecionado')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExportData}
          className="rounded-xl border border-[#3a404d] bg-[#20232a] px-4 py-2 text-sm font-medium text-white transition duration-200 hover:bg-[#2f3542]"
        >
          Exportar dados
        </button>
        <label className="rounded-xl border border-[#3a404d] bg-[#2a2f3a] px-4 py-2 text-sm font-medium text-white transition duration-200 hover:bg-[#2f3542]">
          {isImporting ? 'Importando...' : 'Importar dados'}
          <input type="file" accept="application/json" className="hidden" onChange={onImportData} />
        </label>
      </div>
    </div>
  );
}
