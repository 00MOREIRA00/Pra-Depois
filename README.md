# Pra Depois

Fila pessoal de conteúdos para consumir mais tarde: artigos, vídeos, capítulos de livro e podcasts.

É um PWA sem build (HTML, CSS e JavaScript puros). Funciona offline, pode ser instalado no celular e no computador, e guarda tudo no próprio aparelho.

## Funcionalidades

- **Captura rápida:** cole um link e o app descobre o tipo (YouTube → vídeo, Spotify → podcast, Medium → artigo…) e sugere um título a partir do endereço. Também aceita itens sem link ("Capítulo 4 de Sapiens").
- **Para cada item:** status (na fila / em andamento / concluído), prioridade, tempo estimado, prazo, tags e notas.
- **"Tenho X min":** mostra só o que cabe no tempo disponível.
- **Ordem inteligente:** primeiro o que está em andamento, depois o que vence logo, depois por prioridade.
- **Prazos destacados:** vencidos em vermelho, hoje/amanhã em amarelo.
- **Compartilhar → Pra Depois** (Android, com o app instalado): envie um link de qualquer app direto para a fila.
- **Exportar / Importar** em JSON, para backup ou para levar a fila para outro aparelho.

## Rodando localmente

Precisa de um servidor HTTP, porque módulos ES e service worker não funcionam abrindo o arquivo direto.

```bash
npm start          # serve em http://localhost:5173
# ou
python -m http.server 5173
```

## Testes

```bash
npm test
```

Os testes usam o runner nativo do Node (18+) e cobrem as funções puras de `js/utils.js`.

## Estrutura

```
index.html            página única
css/styles.css        estilos (tema claro/escuro por variáveis CSS)
js/app.js             interface e eventos
js/utils.js           regras puras: detecção de tipo, prazos, filtros, ordenação, import/export
js/store.js           IndexedDB (cai para memória se o navegador bloquear)
sw.js                 service worker (offline)
manifest.webmanifest  instalação e share target
icons/                ícones do app
tests/                testes com node:test
```

## Publicando no GitHub Pages

1. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
2. O app fica em `https://<usuario>.github.io/Pra-Depois/`.

Todos os caminhos são relativos, então funciona em subpasta. O service worker exige HTTPS (o GitHub Pages já usa).

**Ao publicar uma mudança**, aumente `VERSION` em `sw.js` para que os aparelhos baixem a versão nova.

## Dados

Os itens ficam no IndexedDB do navegador, só naquele aparelho. Use **Exportar** de vez em quando como backup. Sincronização entre aparelhos está no roadmap.

## Roadmap

- [ ] Sincronização entre aparelhos (Supabase ou Firebase)
- [ ] Buscar título e duração reais do link
- [ ] Lembretes de prazo (notificações)
- [ ] Desfazer exclusão
