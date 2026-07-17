import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const workDir = process.cwd();
  const questionsFile = path.join(workDir, 'perguntas.csv');
  
  // Use /tmp for logs in production (Cloud Run has a read-only filesystem)
  const logsFile = process.env.NODE_ENV === "production" 
    ? path.join('/tmp', 'logs_arena.csv') 
    : path.join(workDir, 'logs_arena.csv');

  app.get("/api/perguntas", (req, res) => {
    try {
      if (!fs.existsSync(questionsFile)) {
        const defaultCSV = [
          "pergunta;a;b;c;d;correta",
          "Qual a capital do Brasil?;São Paulo;Rio de Janeiro;Brasília;Salvador;C",
          "Quanto é 2 + 2?;3;4;5;6;B",
          "Qual o maior planeta do Sistema Solar?;Terra;Marte;Júpiter;Saturno;C",
          "Qual é a fórmula química da água?;H2O;CO2;O2;NaCl;A",
          "Quem pintou a Mona Lisa?;Vincent van Gogh;Pablo Picasso;Leonardo da Vinci;Claude Monet;C"
        ].join("\n");
        
        // Em produção o root é readonly, mas não deve cair aqui pois o arquivo perguntas.csv já deve existir no repositório.
        // Se precisar criar fallback em dev:
        if (process.env.NODE_ENV !== "production") {
          fs.writeFileSync(questionsFile, defaultCSV, "utf-8");
        } else {
          // Em prod envia o default direto sem gravar
          console.warn("perguntas.csv não encontrado no build");
        }
      }
      
      const content = fs.existsSync(questionsFile) 
        ? fs.readFileSync(questionsFile, "utf-8")
        : [
            "pergunta;a;b;c;d;correta",
            "Exemplo?;A;B;C;D;A"
          ].join("\n");

      const lines = content.split(/\r?\n/).filter(l => l.trim() !== "");
      
      const questions = [];
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
      res.json(questions);
    } catch (err: any) {
      console.error("Erro ao ler perguntas.csv:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logs", (req, res) => {
    try {
      const log = req.body;
      if (!fs.existsSync(logsFile)) {
        fs.writeFileSync(logsFile, "timestamp;partida_id;rodada;evento;detalhe\n", "utf-8");
      }
      const detalheSafe = (log.detalhe || "").replace(/;/g, ",");
      const row = `${log.timestamp};${log.partida_id};${log.rodada};${log.evento};${detalheSafe}\n`;
      fs.appendFileSync(logsFile, row, "utf-8");
      res.json({ success: true });
    } catch (err: any) {
      console.error("Erro ao salvar log:", err);
      res.status(500).json({ error: err.message });
    }
  });

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
