# Client Control Dashboard

MVP funcional em React + Vite para gerenciamento de clientes, secoes e abas com importacao de arquivos HTML renderizados em `iframe` com `sandbox`, sem backend e com persistencia em `localStorage`.

## Como rodar

```bash
npm install
npm run dev
```

## Funcionalidades

- Criacao, renomeacao inline e exclusao de clientes
- Secoes padrao por cliente: `Meta Ads`, `Planejamento` e `Organico`
- Criacao, renomeacao e exclusao de secoes adicionais
- Sistema de abas por secao com criacao, renomeacao por duplo clique e fechamento
- Importacao de arquivos `.html` por aba
- Renderizacao isolada com `iframe` e `sandbox`
- Persistencia completa em `localStorage`
- Exportacao e importacao dos dados em JSON
- Interface em dark mode, layout single-screen e scroll apenas interno
