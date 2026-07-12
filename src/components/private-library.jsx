import { ModuleLibrary } from './module-library';

export function PrivateLibrary(props) {
  return (
    <ModuleLibrary
      title="Biblioteca Privada"
      subtitle="Arquivos e itens salvos"
      emptyMessage="Nenhum arquivo salvo ainda"
      uploadLabel="Importar arquivo"
      {...props}
    />
  );
}
