# Prova ou Reprova (Conectando)

Jogo de perguntas e respostas para telão, com duas equipes e um apresentador. Esta branch contém a **versão desktop offline** (Electron), que funciona sem internet.

> **Atenção:** a interface em `dist/` é a versão **compilada**. O código-fonte React dessa versão não está neste repositório. O código-fonte antigo continua na branch `main`.

## Como rodar

Requer [Node.js](https://nodejs.org/) 18 ou mais recente.

```bash
npm install
npm start
```

Para gerar o executável do Windows (pasta `out/`):

```bash
npm run package:win
```

## Estrutura

| Caminho | O que é |
| --- | --- |
| `electron/main.cjs` | Processo principal: abre a janela, serve a interface num servidor local e lê/grava as perguntas. |
| `dist/` | Interface compilada (React + Tailwind). |
| `dist/ajuste-tela.*` | Ajustes de layout: nenhuma tela precisa de rolagem, mais as cores do fundo e da escolha de tema. |
| `dist/editor-questoes.*` | Painel **Questões**: listar, editar, apagar e alterar em massa, além de adicionar perguntas uma a uma ou importar um CSV. |
| `dist/menu-apresentador.*` | Menu ☰ do apresentador: Questões, Debug e Tela cheia; exibir ou ocultar código, dificuldade e tema; tamanho do texto. |
| `perguntas.csv` | Banco de perguntas embutido. |
| `LEIA-ME.txt` | Instruções para quem usa o executável. |

## Perguntas

No primeiro uso, o `perguntas.csv` embutido é copiado para `Documentos/Prova ou Reprova/`. A partir daí o jogo lê essa cópia, e o painel **Questões** (botão ao lado do Debug) grava nela. Antes de cada gravação o painel guarda uma cópia do arquivo anterior em `Documentos/Prova ou Reprova/backups/`.

Formato do CSV (vírgula ou ponto e vírgula, UTF-8 ou Excel):

```
ID,tema,pergunta,a,b,c,d,correta,fonte_completa,fonte_curta,dificuldade
```

- `correta`: A, B, C ou D.
- `dificuldade`: F, M ou D.

## Teclas

| Tecla | Ação |
| --- | --- |
| `A` | Botão da Equipe 1 |
| `L` | Botão da Equipe 2 |
| `F11` | Tela cheia |
| `F2` | Painel de debug |
| `Ctrl+R` | Recarregar |
| `Ctrl+Shift+O` | Abrir a pasta de dados |
