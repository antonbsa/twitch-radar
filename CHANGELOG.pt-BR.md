# Changelog

O que mudou para quem usa o Twitch Radar, uma seção por versão lançada. Escrito em linguagem simples para o painel "Novidades" do app — sem números de PR, prefixos de commit ou mudanças internas; a lista técnica completa fica em cada GitHub Release, gerada a partir das labels dos PRs (ver [ADR 0050](docs/decisions/0050-changelog-as-source-of-truth-for-release-notes.md)). Uma seção `## Unreleased`, quando presente, é ignorada pelo painel e pelo parser de build.

## v0.2.0 — 2026-09-28

O Twitch Radar agora está disponível em espanhol e português brasileiro, além de uma página de Alertas redesenhada e novas formas de reagir às notificações de canais ao vivo.

### New

- O app e as notificações push agora estão disponíveis em espanhol e português brasileiro, além do inglês.
- Tocar em um canal seguido abre uma visualização com o último snapshot, título, categoria e número de espectadores, com um link direto para assistir na Twitch.
- A lista de canais agora pode ser pesquisada, filtrada e ordenada.
- A página de Alertas foi redesenhada, agrupando as configurações de notificação por canal para facilitar o gerenciamento.
- Quando um canal seguido está ao vivo, você pode ativar notificações para a categoria atual com um toque, e é avisado para ativar o push se ele ainda não estiver ativo.
- As notificações agora oferecem a opção "Lembrar em 15m" em vez de apenas poderem ser descartadas.

### Improved

- As notificações ficaram mais confiáveis de configurar, se recuperando automaticamente de problemas que antes podiam impedi-las de disparar.

## v0.1.1 — 2026-08-30

### Improved

- Sincronizar seus canais seguidos ficou mais rápido.
- Um curto intervalo entre sincronizações evita que toques repetidos iniciem a mesma sincronização duas vezes.

### Fixed

- Cancelar a tela de login da Twitch agora leva você de volta à página de login com uma mensagem clara em vez de um erro.
- Quando sua conexão com a Twitch precisa ser renovada, o app avisa você assim que a página carrega.

## v0.1.0 — 2026-07-31

O primeiro lançamento do Twitch Radar.

### New

- Entre com sua conta da Twitch, e seus canais seguidos são sincronizados automaticamente.
- Escolha as categorias de jogos que você acompanha, para todos os canais ou para canais específicos.
- Receba uma notificação push quando um canal que você segue entrar ao vivo em uma dessas categorias.
- Instale o Twitch Radar no seu celular ou computador como um app.
