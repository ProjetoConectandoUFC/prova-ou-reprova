// Importa o framework Express para criar e gerenciar o servidor web e as rotas da API
import express from "express";
// Importa o módulo nativo 'path' para lidar com caminhos de arquivos e diretórios de forma segura
import path from "path";
// Importa o módulo nativo 'fs' para realizar operações de leitura e escrita no sistema de arquivos
import fs from "fs";
// Importa o criador de servidor do Vite para integrar o empacotador de frontend ao ambiente de desenvolvimento
import { createServer as createViteServer } from "vite";

// Função assíncrona principal responsável por inicializar o servidor Express, configurar as rotas da API e subir a aplicação
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Habilita o parsing de JSON no corpo das requisições HTTP
  app.use(express.json());

  const workDir = process.cwd();
  const questionsFile = path.join(workDir, 'perguntas.csv');
  
  // Define o diretório dos logs: usa a pasta temporária (/tmp) em produção (onde o sistema de arquivos é somente leitura) ou o diretório atual em desenvolvimento
  const logsFile = process.env.NODE_ENV === "production" 
    ? path.join('/tmp', 'logs_arena.csv') 
    : path.join(workDir, 'logs_arena.csv');

  // Rota GET para carregar e processar as perguntas do arquivo CSV
  app.get("/api/perguntas", (req, res) => {
    try {
      // Verifica se o arquivo de perguntas existe; se não, define um conteúdo padrão com exemplos
      if (!fs.existsSync(questionsFile)) {
        const defaultCSV = [
          "pergunta;a;b;c;d;correta",
          "Qual a capital do Brasil?;São Paulo;Rio de Janeiro;Brasília;Salvador;C",
          "Quanto é 2 + 2?;3;4;5;6;B",
          "Qual o maior planeta do Sistema Solar?;Terra;Marte;Júpiter;Saturno;C",
          "Qual é a fórmula química da água?;H2O;CO2;O2;NaCl;A",
          "Quem pintou a Mona Lisa?;Vincent van Gogh;Pablo Picasso;Leonardo da Vinci;Claude Monet;C"
        ].join("\n");
        
        // Em ambiente de desenvolvimento, cria o arquivo físico com as perguntas padrão
        if (process.env.NODE_ENV !== "production") {
          fs.writeFileSync(questionsFile, defaultCSV, "utf-8");
        } else {
          // Em produção, apenas avisa caso o arquivo não seja encontrado no build
          console.warn("perguntas.csv não encontrado no build");
        }
      }
      
      // Lê o conteúdo do arquivo CSV de perguntas (ou usa o fallback se necessário)
      const content = fs.existsSync(questionsFile) 
        ? fs.readFileSync(questionsFile, "utf-8")
        : [
            "pergunta;a;b;c;d;correta",
            "Exemplo?;A;B;C;D;A"
          ].join("\n");

      // Divide o arquivo em linhas e remove linhas vazias
      const lines = content.split(/\r?\n/).filter(l => l.trim() !== "");
      
      const questions = [];
      // Percorre as linhas a partir da segunda (ignorando o cabeçalho) para montar o array de objetos
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(";");
        if (cols.length < 6) continue;
        questions.push({
          id: i,
          pergunta: cols[0].trim(),
          a: cols[1].trim(),
          b: cols[2].trim(),
          c: cols[3].trim(),
          d: cols[4].trim(),
          correta: cols[5].trim().toUpperCase()
        });
      }
      // Retorna a lista de perguntas formatada em JSON
      res.json(questions);
    } catch (err: any) {
      console.error("Erro ao ler perguntas.csv:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Rota POST para registrar logs de eventos da partida no arquivo CSV
  app.post("/api/logs", (req, res) => {
    try {
      const log = req.body;
      // Cria o arquivo de log com o cabeçalho caso ele ainda não exista
      if (!fs.existsSync(logsFile)) {
        fs.writeFileSync(logsFile, "timestamp;partida_id;rodada;evento;detalhe\n", "utf-8");
      }
      // Trata o campo de detalhe para evitar quebras no formato CSV substituindo ';' por ','
      const detalheSafe = (log.detalhe || "").replace(/;/g, ",");
      const row = `${log.timestamp};${log.partida_id};${log.rodada};${log.evento};${detalheSafe}\n`;
      // Adiciona a nova linha de log ao arquivo
      fs.appendFileSync(logsFile, row, "utf-8");
      res.json({ success: true });
    } catch (err: any) {
      console.error("Erro ao salvar log:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Rota GET para realizar o download do arquivo de logs gerado
  app.get("/api/logs/download", (req, res) => {
    try {
      if (fs.existsSync(logsFile)) {
        res.download(logsFile, "logs_arena.csv");
      } else {
        res.status(404).send("Arquivo de logs não encontrado.");
      }
    } catch (err: any) {
      res.status(500).send("Erro ao baixar log: " + err.message);
    }
  });

  // Configuração do ambiente: integra o Vite em modo middleware durante o desenvolvimento ou serve os arquivos estáticos compilados em produção
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Inicializa o servidor Express na porta especificada ouvindo em todas as interfaces de rede
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
