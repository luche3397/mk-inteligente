import { ModuleLibrary } from './module-library';

export function PublicLibrary(props) {
  return (
    <ModuleLibrary
      title="Biblioteca Publica"
      subtitle="Modulos HTML compartilhados"
      emptyMessage="Nenhum modulo disponivel"
      uploadLabel="+"
      {...props}
    />
  );
}
