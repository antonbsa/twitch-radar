# Changelog

O que mudou para quem usa o Twitch Radar, uma seção por versão lançada. Escrito em linguagem simples para o painel "Novidades" do app — sem números de PR, prefixos de commit ou mudanças internas; a lista técnica completa fica em cada GitHub Release, gerada a partir das labels dos PRs (ver [ADR 0050](docs/decisions/0050-changelog-as-source-of-truth-for-release-notes.md)). Uma seção `## Unreleased`, quando presente, é ignorada pelo painel e pelo parser de build.

## v0.4.0 — 2026-10-11

Mais controle sobre seus alertas: pause tudo, silencie canais e veja mais sobre o que um canal está jogando.

### New

- Você pode pausar todas as notificações de uma vez, e seus alertas continuam como estão para quando você reativá-las.
- Você pode silenciar canais individuais para que parem de te notificar.
- Alertas de "Todos os canais" em uma categoria agora podem ignorar canais específicos que você excluir.
- A lista de canais mostra quando um canal esteve ao vivo pela última vez e o que estava jogando, e destaca suas categorias preferidas.
- A arte das categorias agora aparece nos alertas, na lista de exclusões e na busca de categorias.
- Canais ao vivo mostram há quanto tempo estão na categoria atual ao lado do tempo de transmissão.
- O filtro de canais mostra a contagem de cada categoria e tem a opção "Com alertas".

### Improved

- Você não recebe mais notificações repetidas do mesmo canal em sequência.
- As mensagens ao criar ou remover um alerta agora citam o canal e a categoria.
- Os botões das mensagens e de fechar ficaram maiores e mais fáceis de tocar, e o botão de pausar tem mais contraste no tema escuro.
- O cabeçalho dos detalhes do canal ficou mais enxuto, com as ações secundárias agrupadas.
- Você continua conectado enquanto continuar usando o app.
- Quedas temporárias da Twitch agora mostram a mensagem "Twitch indisponível" em vez de um erro genérico.

### Fixed

- O ícone do app agora aparece corretamente ao adicioná-lo à tela de início do iPhone.
- A tela de pausa não pula mais e os canais mostram a bandeira do idioma.

## v0.3.0 — 2026-10-04

As notificações ficaram muito mais úteis: foto do canal, botão Assistir e um texto que realmente diz o que mudou.

### New

- As notificações agora têm um botão "Assistir" que abre o canal na Twitch e podem mostrar uma prévia da transmissão.
- As notificações, a lista de canais e os detalhes do canal agora mostram a foto de perfil do streamer.
- O painel "Novidades" mostra o que mudou em cada versão e pode ser aberto pelo número da versão no app.

### Improved

- O texto das notificações agora traz informação nova, como há quanto tempo o canal está ao vivo, o que estava jogando antes ou o título da transmissão, em vez de repetir o título da notificação.
- Vários alertas seguidos do mesmo canal agora se substituem em vez de se acumularem.
- Seus canais seguidos agora sincronizam automaticamente quando você abre o app ou volta a ele depois de um tempo.
- O filtro de categorias em Canais mostra quantos canais estão ao vivo em cada categoria.
- Buscar uma categoria ou adicionar um canal agora abre uma tela cheia que não fica escondida pelo teclado, com suas categorias salvas aparecendo primeiro.
- O app agora confirma quando uma configuração é salva ou quando uma alteração falha.

### Fixed

- Reprises, playlists e watch parties não enviam mais alertas como se o canal tivesse acabado de entrar ao vivo.
- A barra de abas inferior e os painéis não ficam mais por baixo do indicador de início do iPhone, e as listas não rolam mais por trás da barra de abas.

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
