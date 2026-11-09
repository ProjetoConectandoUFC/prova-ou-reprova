// Prova ou Reprova: processo principal do Electron (versão offline)
// Substitui o server.ts original: serve o frontend compilado (dist/) e as rotas /api
// num servidor HTTP local (127.0.0.1), sem internet e sem dependências externas.

const { app, BrowserWindow, shell, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PREFERRED_PORT = 37415; // porta fixa para manter as configurações salvas (localStorage)
const DIST = path.join(__dirname, '..', 'dist');
const BUNDLED_CSV = path.join(__dirname, '..', 'perguntas.csv');

// Pasta de dados editável pelo usuário: Documentos/Prova ou Reprova
let DATA_DIR, QUESTIONS_FILE, LOGS_FILE;

function setupDataDir() {
  DATA_DIR = path.join(app.getPath('documents'), 'Prova ou Reprova');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  QUESTIONS_FILE = path.join(DATA_DIR, 'perguntas.csv');
  LOGS_FILE = path.join(DATA_DIR, 'logs_arena.csv');
  // Cópias antigas geradas automaticamente pela versão anterior são atualizadas
  const OLD_DEFAULTS = ['0ed82690441cf27aa332904bd7c61045b23b07ac32987eefddb219a9a3aa8ed9', 'b809db9eec6a3864dd9e2b42f79529613c32f4533a5ccebb141ae913c2050e89', 'c4bad671a3a0e594a1f527577867f34f95a15b5fb9dd231fa2a4671130714b21'];
  const sha = f => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  if (fs.existsSync(BUNDLED_CSV) && (!fs.existsSync(QUESTIONS_FILE) || OLD_DEFAULTS.includes(sha(QUESTIONS_FILE)))) {
    fs.copyFileSync(BUNDLED_CSV, QUESTIONS_FILE);
  }
}

// ---------- CSV (mesma lógica do server.ts original) ----------
function parseCSV(content) {
  content = content.replace(/^\uFEFF/, ''); // remove BOM do Excel
  const firstLine = content.split(/\r?\n/)[0] || '';
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  const delimiter = semi > comma ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i], next = content[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { field += '"'; i++; } else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      row.push(field.trim()); field = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
  }
  return rows;
}

// Ordem de busca: ao lado do executável, Documentos/Prova ou Reprova, arquivo embutido
function exeDir() {
  if (process.platform === 'darwin') return path.resolve(process.execPath, '..', '..', '..', '..');
  return path.dirname(process.execPath);
}
function questionsSource() {
  const besideExe = path.join(exeDir(), 'perguntas.csv');
  if (app.isPackaged && fs.existsSync(besideExe)) return besideExe;
  if (fs.existsSync(QUESTIONS_FILE)) return QUESTIONS_FILE;
  return BUNDLED_CSV;
}
// Aceita CSV salvo pelo Excel (Windows-1252) além de UTF-8
function readText(file) {
  return decodeText(fs.readFileSync(file));
}
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
let lastInfo = '';
function loadQuestions() {
  const file = questionsSource();
  const out = rowsToQuestions(parseCSV(readText(file)));
  lastInfo = `${out.length} perguntas | ${file}`;
  console.log('[perguntas]', lastInfo);
  if (win && !win.isDestroyed()) win.setTitle(`Prova ou Reprova | ${lastInfo}`);
  return out;
}

// Converte as linhas do CSV (com cabeçalho) em objetos de pergunta
function rowsToQuestions(rows, opts = {}) {
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.toLowerCase().replace(/['"]/g, '').trim());
  const idx = n => header.indexOf(n);
  const find = (...keys) => header.findIndex(h => keys.some(k => h.includes(k)));
  const iId = idx('id'), iTema = idx('tema'), iPerg = idx('pergunta');
  const iA = idx('a'), iB = idx('b'), iC = idx('c'), iD = idx('d'), iCor = idx('correta');
  const iFC = find('fonte_completa', 'completa'), iFS = find('fonte_curta', 'curta');
  const iDif = find('dificuldade', 'dif');

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 5) continue;
    const pergunta = iPerg !== -1 ? r[iPerg] : r[1] || '';
    if (!pergunta) continue;
    const rawDif = iDif !== -1 && r[iDif] ? r[iDif].trim().toUpperCase() : 'M';
    let dificuldade = 'M';
    if (rawDif === 'F' || rawDif.startsWith('FAC') || rawDif.startsWith('FÁC')) dificuldade = 'F';
    else if (rawDif === 'D' || rawDif.startsWith('DIF')) dificuldade = 'D';
    out.push({
      id: iId !== -1 && r[iId] ? r[iId] : (opts.idVazio ? '' : `P${i}`),
      tema: (iTema !== -1 && r[iTema] ? r[iTema] : (header.length >= 7 ? r[1] : 'Geral')) || 'Geral',
      pergunta,
      a: iA !== -1 ? r[iA] : (r[2] || ''),
      b: iB !== -1 ? r[iB] : (r[3] || ''),
      c: iC !== -1 ? r[iC] : (r[4] || ''),
      d: iD !== -1 ? r[iD] : (r[5] || ''),
      correta: ((iCor !== -1 ? r[iCor] : r[6]) || 'A').trim().toUpperCase(),
      fonte_completa: iFC !== -1 ? (r[iFC] || '') : '',
      fonte_curta: iFS !== -1 ? (r[iFS] || '') : '',
      dificuldade,
    });
  }
  return out;
}

// ---------- Editor de questões (painel "Questões") ----------
const CAMPOS = ['id', 'tema', 'pergunta', 'a', 'b', 'c', 'd', 'correta', 'fonte_completa', 'fonte_curta', 'dificuldade'];
const CABECALHO = ['ID', 'tema', 'pergunta', 'a', 'b', 'c', 'd', 'correta', 'fonte_completa', 'fonte_curta', 'dificuldade'];

function csvField(v) {
  const s = String(v == null ? '' : v).replace(/\r?\n/g, ' ').trim();
  return /[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function questionsToCSV(list) {
  const lines = [CABECALHO.join(',')];
  for (const q of list) lines.push(CAMPOS.map(k => csvField(q[k])).join(','));
  return lines.join('\n') + '\n';
}

function fileHash(file) {
  return require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Valida a lista inteira; devolve a lista normalizada ou lança erro com mensagem legível
function validateQuestions(list) {
  if (!Array.isArray(list)) throw new Error('Formato inválido.');
  const ids = new Set();
  return list.map((q, i) => {
    const n = {};
    for (const k of CAMPOS) n[k] = String(q && q[k] != null ? q[k] : '').replace(/\r?\n/g, ' ').trim();
    n.correta = n.correta.toUpperCase();
    n.dificuldade = n.dificuldade.toUpperCase();
    const ref = n.id || `linha ${i + 1}`;
    if (!n.id) throw new Error(`Pergunta na posição ${i + 1} está sem ID.`);
    if (ids.has(n.id.toLowerCase())) throw new Error(`ID repetido: ${n.id}.`);
    ids.add(n.id.toLowerCase());
    for (const k of ['tema', 'pergunta', 'a', 'b', 'c', 'd']) {
      if (!n[k]) throw new Error(`${ref}: o campo "${k}" está vazio.`);
    }
    if (!['A', 'B', 'C', 'D'].includes(n.correta)) throw new Error(`${ref}: a resposta correta deve ser A, B, C ou D.`);
    if (!['F', 'M', 'D'].includes(n.dificuldade)) throw new Error(`${ref}: a dificuldade deve ser F, M ou D.`);
    return n;
  });
}

// Antes de cada gravação, guarda uma cópia do arquivo atual (mantém as 30 mais recentes)
function backupQuestions(file) {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
  fs.copyFileSync(file, path.join(dir, `perguntas-${stamp}.csv`));
  const old = fs.readdirSync(dir).filter(f => /^perguntas-.*\.csv$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - 30))) fs.unlinkSync(path.join(dir, f));
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Arquivo grande demais.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function salvarPerguntas(body) {
  const file = questionsSource();
  if (fs.existsSync(file) && body.hash !== fileHash(file)) {
    return { status: 409, body: { error: 'O arquivo de perguntas foi alterado fora do painel. Recarregue a lista antes de salvar.' } };
  }
  const list = validateQuestions(body.perguntas);
  if (fs.existsSync(file)) backupQuestions(file);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, questionsToCSV(list), 'utf-8');
  fs.renameSync(tmp, file);
  loadQuestions(); // atualiza o título da janela
  return { status: 200, body: { hash: fileHash(file), total: list.length } };
}

// ---------- Categorias (nome, descrição e cor de cada tema) ----------
// Ficam em categorias.json, ao lado do perguntas.csv que está em uso.
const CORES_CATEGORIA = ['amarelo', 'rosa', 'celeste', 'laranja', 'verde', 'roxo', 'lima'];

function categoriasFile() {
  return path.join(path.dirname(questionsSource()), 'categorias.json');
}

function readCategorias() {
  try {
    const list = JSON.parse(fs.readFileSync(categoriasFile(), 'utf-8'));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function validateCategorias(list) {
  if (!Array.isArray(list)) throw new Error('Formato de categorias inválido.');
  const nomes = new Set();
  return list.map(c => {
    const nome = String(c && c.nome || '').replace(/\s+/g, ' ').trim();
    if (!nome) throw new Error('Há uma categoria sem nome.');
    if (nome.length > 60) throw new Error(`O nome "${nome.slice(0, 20)}…" é longo demais (máx. 60 caracteres).`);
    if (nomes.has(nome.toLowerCase())) throw new Error(`Categoria repetida: ${nome}.`);
    nomes.add(nome.toLowerCase());
    const descricao = String(c.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const cor = CORES_CATEGORIA.includes(c.cor) ? c.cor : '';
    return { nome, descricao, cor };
  });
}

function writeCategorias(list) {
  const file = categoriasFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, file);
}

async function editorHandler(req, res, p) {
  if (p === '/api/editor/perguntas' && req.method === 'GET') {
    const file = questionsSource();
    return send(res, 200, JSON.stringify({ arquivo: file, hash: fileHash(file), perguntas: loadQuestions(), categorias: readCategorias() }));
  }
  if (p === '/api/editor/perguntas' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
    const r = salvarPerguntas(body);
    return send(res, r.status, JSON.stringify(r.body));
  }
  // Categorias: grava os metadados e, se vierem junto (renomear/mover), as perguntas
  if (p === '/api/editor/categorias' && req.method === 'PUT') {
    const body = JSON.parse((await readBody(req)).toString('utf-8') || '{}');
    const cats = validateCategorias(body.categorias);
    let out = {};
    if (body.perguntas) {
      const r = salvarPerguntas(body);
      if (r.status !== 200) return send(res, r.status, JSON.stringify(r.body));
      out = r.body;
    }
    writeCategorias(cats);
    return send(res, 200, JSON.stringify({ ...out, categorias: cats }));
  }
  if (p === '/api/editor/importar' && req.method === 'POST') {
    const rows = parseCSV(decodeText(await readBody(req)));
    if (rows.length < 2) throw new Error('O arquivo está vazio ou só tem o cabeçalho.');
    const header = rows[0].map(h => h.toLowerCase().replace(/['"]/g, '').trim());
    if (!header.includes('pergunta')) throw new Error('Cabeçalho não reconhecido: o CSV precisa ter as colunas ID, tema, pergunta, a, b, c, d, correta, fonte_completa, fonte_curta, dificuldade.');
    const perguntas = rowsToQuestions(rows, { idVazio: true });
    return send(res, 200, JSON.stringify({ perguntas }));
  }
  return false;
}

// ---------- Servidor HTTP local ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.json': 'application/json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(body);
}

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  if (p.startsWith('/api/editor/')) {
    editorHandler(req, res, p)
      .then(r => { if (r === false) send(res, 404, JSON.stringify({ error: 'Rota não encontrada.' })); })
      .catch(e => { if (!res.headersSent) send(res, 400, JSON.stringify({ error: e.message })); });
    return;
  }

  if (p === '/api/categorias' && req.method === 'GET') {
    return send(res, 200, JSON.stringify(readCategorias()));
  }

  if (p === '/api/perguntas' && req.method === 'GET') {
    try { return send(res, 200, JSON.stringify(loadQuestions())); }
    catch (e) { return send(res, 500, JSON.stringify({ error: e.message })); }
  }

  if (p === '/api/logs' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const log = JSON.parse(body || '{}');
        if (!fs.existsSync(LOGS_FILE)) {
          fs.writeFileSync(LOGS_FILE, '\uFEFFtimestamp;partida_id;rodada;evento;detalhe\n', 'utf-8');
        }
        const det = String(log.detalhe || '').replace(/;/g, ',').replace(/\r?\n/g, ' ');
        fs.appendFileSync(LOGS_FILE, `${log.timestamp};${log.partida_id};${log.rodada};${log.evento};${det}\n`, 'utf-8');
        send(res, 200, JSON.stringify({ success: true }));
      } catch (e) { send(res, 500, JSON.stringify({ error: e.message })); }
    });
    return;
  }

  if (p === '/api/logs/download') {
    if (!fs.existsSync(LOGS_FILE)) return send(res, 404, 'Arquivo de logs não encontrado.', 'text/plain; charset=utf-8');
    return send(res, 200, fs.readFileSync(LOGS_FILE), 'text/csv; charset=utf-8', {
      'Content-Disposition': 'attachment; filename="logs_arena.csv"',
    });
  }

  // Arquivos estáticos (com fallback para index.html, como uma SPA)
  let file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST)) return send(res, 403, 'Proibido', 'text/plain');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        const s2 = http.createServer(handler);
        s2.listen(0, '127.0.0.1', () => resolve(s2.address().port));
      } else reject(err);
    });
    server.listen(PREFERRED_PORT, '127.0.0.1', () => resolve(PREFERRED_PORT));
  });
}

// ---------- Janela ----------
// Permite os sons tocarem sem exigir clique prévio
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Garante uma única instância aberta
if (!app.requestSingleInstanceLock()) app.quit();

let win;
app.whenReady().then(async () => {
  setupDataDir();
  const port = await startServer();
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    width: 1600, height: 900, show: false, backgroundColor: '#f8fafc',
    title: 'Prova ou Reprova',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.on('page-title-updated', e => e.preventDefault());
  win.maximize();
  win.show();

  // Links de fonte (target=_blank) abrem no navegador do sistema, se houver internet
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Atalhos: F11 tela cheia, Ctrl+Shift+O abre a pasta de dados, Ctrl+R recarrega, Ctrl+Shift+I devtools
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    else if (mod && input.shift && input.key.toLowerCase() === 'o') { shell.openPath(DATA_DIR); event.preventDefault(); }
    else if (mod && !input.shift && input.key.toLowerCase() === 'r') { win.reload(); event.preventDefault(); }
    else if (mod && input.shift && input.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); event.preventDefault(); }
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
