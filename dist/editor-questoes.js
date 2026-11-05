// Prova ou Reprova: painel "Questões".
// Lista todas as perguntas (filtradas por tema), permite editar, apagar, alterar em massa,
// adicionar uma pergunta e importar várias de um arquivo CSV.
// Fala com o processo principal pelas rotas /api/editor/* (ver electron/main.cjs).
(function () {
  'use strict';

  var CAMPOS = ['id', 'tema', 'pergunta', 'a', 'b', 'c', 'd', 'correta', 'fonte_completa', 'fonte_curta', 'dificuldade'];
  var LETRAS = ['A', 'B', 'C', 'D'];
  var DIF_NOME = { F: 'Fácil', M: 'Média', D: 'Difícil' };

  var ICONES = {
    lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    editar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    lixo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    mais: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  };

  var estado = {
    arquivo: '', hash: '', perguntas: [],
    tema: '__todos', dif: '', busca: '',
    sel: new Set(),
    salvando: false,
  };

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function temas() {
    var m = new Map();
    estado.perguntas.forEach(function (q) { m.set(q.tema, (m.get(q.tema) || 0) + 1); });
    return Array.from(m.entries());
  }

  var toastEl, toastTimer;
  function aviso(msg, ruim) {
    if (!toastEl) { toastEl = el('<div class="eq eq-toast"></div>'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.toggle('eq-ruim', !!ruim);
    toastEl.classList.add('eq-mostrar');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('eq-mostrar'); }, ruim ? 5000 : 2600);
  }

  // Confirmação no estilo do painel (evita o confirm() nativo, que no Windows
  // pode deixar os campos de texto sem foco depois de fechado)
  function confirmar(msg, textoOk) {
    return new Promise(function (resolve) {
      var cam = el(
        '<div class="eq eq-camada eq-sobre" style="z-index:20030">' +
          '<div class="eq-caixa eq-modal" style="max-width:520px" role="alertdialog">' +
            '<div class="eq-corpo" style="padding:1.75rem 1.75rem 1rem"><div style="font-size:1.05rem;font-weight:600;line-height:1.45">' + esc(msg) + '</div></div>' +
            '<div class="eq-rodape" style="border-top:0"><div class="eq-espaco"></div>' +
              '<button class="eq-btn" data-c="0">Cancelar</button>' +
              '<button class="eq-btn ' + (/apagar/i.test(textoOk || '') ? 'eq-btn-perigo' : 'eq-btn-escuro') + '" data-c="1">' + esc(textoOk || 'Confirmar') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
      function fim(v) {
        var i = camadas.indexOf(cam); if (i !== -1) camadas.splice(i, 1);
        cam.remove(); resolve(v);
      }
      cam._fechar = function () { fim(false); };
      cam.addEventListener('click', function (e) {
        var b = e.target.closest('[data-c]');
        if (b) fim(b.dataset.c === '1'); else if (e.target === cam) fim(false);
      });
      document.body.appendChild(cam);
      camadas.push(cam);
      isolarTeclado(cam);
      cam.querySelector('[data-c="1"]').focus();
    });
  }

  // Impede que digitar no painel acione os botões do jogo (teclas A/L, F2 etc.)
  function isolarTeclado(no) {
    no.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { fecharTopo(); e.preventDefault(); }
      e.stopPropagation();
    });
    no.addEventListener('keyup', function (e) { e.stopPropagation(); });
    no.addEventListener('keypress', function (e) { e.stopPropagation(); });
  }

  // Próximo ID livre seguindo o padrão do tema (ex.: D75 -> D76)
  function proximoId(tema, usados) {
    usados = usados || new Set(estado.perguntas.map(function (q) { return q.id.toLowerCase(); }));
    var cont = {}, maior = {};
    estado.perguntas.forEach(function (q) {
      if (q.tema !== tema) return;
      var m = /^([A-Za-z]+)(\d+)$/.exec(q.id);
      if (!m) return;
      cont[m[1]] = (cont[m[1]] || 0) + 1;
      maior[m[1]] = Math.max(maior[m[1]] || 0, +m[2]);
    });
    var pref = Object.keys(cont).sort(function (x, y) { return cont[y] - cont[x]; })[0];
    if (!pref) {
      pref = norm(tema).replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).join('').toUpperCase().slice(0, 3) || 'Q';
    }
    var n = (maior[pref] || 0) + 1;
    while (usados.has((pref + n).toLowerCase())) n++;
    return pref + n;
  }

  function problemas(q, ignorarId) {
    var p = [];
    if (!ignorarId && !String(q.id || '').trim()) p.push('sem ID');
    if (!String(q.tema || '').trim()) p.push('sem tema');
    if (!String(q.pergunta || '').trim()) p.push('sem enunciado');
    ['a', 'b', 'c', 'd'].forEach(function (k) { if (!String(q[k] || '').trim()) p.push('alternativa ' + k.toUpperCase() + ' vazia'); });
    if (LETRAS.indexOf(String(q.correta || '').toUpperCase()) === -1) p.push('correta deve ser A, B, C ou D');
    if (['F', 'M', 'D'].indexOf(String(q.dificuldade || '').toUpperCase()) === -1) p.push('dificuldade deve ser F, M ou D');
    return p;
  }

  // ---------- servidor ----------
  function api(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('Erro ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  function carregar() {
    return api('/api/editor/perguntas').then(function (j) {
      estado.arquivo = j.arquivo; estado.hash = j.hash; estado.perguntas = j.perguntas;
      var ids = new Set(j.perguntas.map(function (q) { return q.id; }));
      estado.sel.forEach(function (id) { if (!ids.has(id)) estado.sel.delete(id); });
      renderPainel();
    });
  }

  // Grava a lista inteira. Só altera o estado local se o servidor aceitar.
  function salvar(lista, msg) {
    if (estado.salvando) return Promise.reject(new Error('Aguarde a gravação anterior.'));
    estado.salvando = true;
    return api('/api/editor/perguntas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: estado.hash, perguntas: lista }),
    }).then(function (j) {
      estado.hash = j.hash; estado.perguntas = lista;
      renderPainel();
      if (msg) aviso(msg);
      return j;
    }).catch(function (e) {
      if (e.status === 409) {
        e.message = 'O arquivo de perguntas foi alterado fora do painel. A lista foi recarregada; refaça a última alteração.';
        aviso(e.message, true);
        carregar();
      }
      throw e;
    }).finally(function () { estado.salvando = false; });
  }

  // ---------- botão ao lado do Debug ----------
  var lancador;
  function posicionarLancador() {
    if (!lancador) return;
    var dbg = document.querySelector('button[title^="Painel de Debug"]');
    if (dbg) {
      var r = dbg.getBoundingClientRect();
      lancador.style.right = Math.round(window.innerWidth - r.left + 12) + 'px';
      lancador.style.top = Math.round(r.top) + 'px';
      lancador.style.height = Math.round(r.height) + 'px';
      lancador.hidden = false;
    } else {
      lancador.hidden = true;
    }
  }

  // ---------- painel principal ----------
  var painel, camadas = [];

  function abrir() {
    if (!painel) montarPainel();
    painel.hidden = false;
    camadas = [painel];
    painel.querySelector('.eq-lista').innerHTML = '<div class="eq-vazio">Carregando perguntas…</div>';
    carregar().catch(function (e) { aviso('Não foi possível carregar: ' + e.message, true); });
  }
  function fecharTopo() {
    var topo = camadas.pop();
    if (!topo) return;
    if (topo === painel) painel.hidden = true;
    else if (topo._fechar) { camadas.push(topo); topo._fechar(); }
    else topo.remove();
  }

  function montarPainel() {
    painel = el(
      '<div class="eq eq-camada" hidden>' +
        '<div class="eq-caixa eq-painel" role="dialog" aria-label="Banco de questões">' +
          '<div class="eq-topo">' +
            '<div><h2>Banco de questões</h2><div class="eq-sub" data-r="sub"></div></div>' +
            '<div class="eq-espaco"></div>' +
            '<button class="eq-btn" data-a="importar">' + ICONES.upload + 'Importar CSV</button>' +
            '<button class="eq-btn eq-btn-pri" data-a="nova">' + ICONES.mais + 'Nova questão</button>' +
            '<button class="eq-icone-fechar" data-a="fechar" title="Fechar (Esc)">×</button>' +
          '</div>' +
          '<div class="eq-filtros">' +
            '<div class="eq-abas" data-r="abas"></div>' +
            '<select class="eq-select" data-r="dif"><option value="">Todas as dificuldades</option><option value="F">Fácil</option><option value="M">Média</option><option value="D">Difícil</option></select>' +
            '<input class="eq-input eq-busca" data-r="busca" type="search" placeholder="Buscar por texto, ID ou fonte">' +
          '</div>' +
          '<div class="eq-massa" data-r="massa" hidden>' +
            '<span><span class="eq-qtd" data-r="qtd"></span></span>' +
            '<input class="eq-input" data-m="tema" list="eq-temas" placeholder="Novo tema">' +
            '<select class="eq-select" data-m="dificuldade"><option value="">Dificuldade…</option><option value="F">Fácil</option><option value="M">Média</option><option value="D">Difícil</option></select>' +
            '<input class="eq-input" data-m="fonte_curta" placeholder="Fonte curta">' +
            '<input class="eq-input" data-m="fonte_completa" placeholder="Link da fonte">' +
            '<button class="eq-btn eq-btn-pri" data-a="aplicar">Aplicar às selecionadas</button>' +
            '<button class="eq-btn eq-btn-perigo" data-a="apagar-sel">' + ICONES.lixo.replace('<svg', '<svg width="15" height="15"') + 'Apagar</button>' +
            '<button class="eq-btn" data-a="limpar-sel">Limpar seleção</button>' +
          '</div>' +
          '<div class="eq-lista"></div>' +
          '<datalist id="eq-temas"></datalist>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(painel);
    isolarTeclado(painel);

    painel.addEventListener('mousedown', function (e) { if (e.target === painel) fecharTopo(); });
    painel.querySelector('[data-r="busca"]').addEventListener('input', function (e) { estado.busca = e.target.value; renderLista(); renderSelecao(); });
    painel.querySelector('[data-r="dif"]').addEventListener('change', function (e) { estado.dif = e.target.value; renderLista(); renderSelecao(); });

    painel.addEventListener('click', function (e) {
      var alvo = e.target.closest('[data-a],[data-tema],[data-id]');
      if (!alvo || !painel.contains(alvo)) return;
      if (alvo.dataset.tema != null) { estado.tema = alvo.dataset.tema; renderPainel(); return; }
      var a = alvo.dataset.a;
      if (a === 'fechar') return fecharTopo();
      if (a === 'nova') return abrirEditor(null);
      if (a === 'importar') return abrirImportacao();
      if (a === 'limpar-sel') { estado.sel.clear(); return renderPainel(); }
      if (a === 'aplicar') return aplicarMassa();
      if (a === 'apagar-sel') return apagar(Array.from(estado.sel));
      if (a === 'editar') { e.stopPropagation(); return abrirEditor(alvo.closest('tr').dataset.id); }
      if (a === 'apagar') { e.stopPropagation(); return apagar([alvo.closest('tr').dataset.id]); }
      if (alvo.dataset.id != null && !e.target.closest('.eq-col-chk')) abrirEditor(alvo.dataset.id);
    });
    painel.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.r === 'todas') {
        visiveis().forEach(function (q) { if (t.checked) estado.sel.add(q.id); else estado.sel.delete(q.id); });
        renderSelecao();
      } else if (t.classList.contains('eq-chk') && t.dataset.sel) {
        if (t.checked) estado.sel.add(t.dataset.sel); else estado.sel.delete(t.dataset.sel);
        renderSelecao();
      }
    });
  }

  // Atualiza só as marcações e a barra de ações em massa (sem redesenhar a lista)
  function renderSelecao() {
    var n = estado.sel.size;
    painel.querySelector('[data-r="massa"]').hidden = n === 0;
    painel.querySelector('[data-r="qtd"]').textContent = n + (n === 1 ? ' selecionada' : ' selecionadas');
    var todas = true, alguma = false;
    painel.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
      var s = estado.sel.has(tr.dataset.id);
      tr.classList.toggle('eq-sel', s);
      tr.querySelector('.eq-chk').checked = s;
      if (s) alguma = true; else todas = false;
    });
    var cab = painel.querySelector('[data-r="todas"]');
    if (cab) { cab.checked = todas; cab.indeterminate = alguma && !todas; }
  }

  function visiveis() {
    var b = norm(estado.busca).trim();
    return estado.perguntas.filter(function (q) {
      if (estado.tema !== '__todos' && q.tema !== estado.tema) return false;
      if (estado.dif && q.dificuldade !== estado.dif) return false;
      if (!b) return true;
      return norm([q.id, q.pergunta, q.a, q.b, q.c, q.d, q.fonte_curta, q.fonte_completa].join(' ')).indexOf(b) !== -1;
    });
  }

  function renderPainel() {
    if (!painel) return;
    var sub = painel.querySelector('[data-r="sub"]');
    sub.textContent = estado.perguntas.length + ' perguntas · salvas em ' + estado.arquivo;
    sub.title = estado.arquivo;
    var ts = temas();
    if (estado.tema !== '__todos' && !ts.some(function (t) { return t[0] === estado.tema; })) estado.tema = '__todos';
    painel.querySelector('[data-r="abas"]').innerHTML =
      '<button class="eq-aba' + (estado.tema === '__todos' ? ' eq-ativa' : '') + '" data-tema="__todos">Todos os temas<b>' + estado.perguntas.length + '</b></button>' +
      ts.map(function (t) {
        return '<button class="eq-aba' + (estado.tema === t[0] ? ' eq-ativa' : '') + '" data-tema="' + esc(t[0]) + '">' + esc(t[0]) + '<b>' + t[1] + '</b></button>';
      }).join('');
    document.getElementById('eq-temas').innerHTML = ts.map(function (t) { return '<option value="' + esc(t[0]) + '">'; }).join('');
    renderLista();
    renderSelecao();
  }

  function renderLista() {
    var lista = visiveis();
    var alvo = painel.querySelector('.eq-lista');
    if (!lista.length) {
      alvo.innerHTML = '<div class="eq-vazio">' + (estado.perguntas.length ? 'Nenhuma pergunta encontrada com esses filtros.' : 'Nenhuma pergunta cadastrada.') + '</div>';
      return;
    }
    var todas = lista.every(function (q) { return estado.sel.has(q.id); });
    var mostrarTema = estado.tema === '__todos';
    var html = '<table class="eq-tabela"><thead><tr>' +
      '<th class="eq-col-chk"><input type="checkbox" class="eq-chk" data-r="todas" title="Selecionar todas as visíveis"' + (todas ? ' checked' : '') + '></th>' +
      '<th class="eq-col-id">ID</th><th class="eq-col-dif">Nível</th>' + (mostrarTema ? '<th class="eq-col-tema">Tema</th>' : '') +
      '<th>Pergunta (' + lista.length + ')</th><th class="eq-col-acoes"></th></tr></thead><tbody>';
    lista.forEach(function (q) {
      var s = estado.sel.has(q.id);
      var correta = q[String(q.correta).toLowerCase()] || '';
      html += '<tr class="eq-linha' + (s ? ' eq-sel' : '') + '" data-id="' + esc(q.id) + '">' +
        '<td class="eq-col-chk"><input type="checkbox" class="eq-chk" data-sel="' + esc(q.id) + '"' + (s ? ' checked' : '') + '></td>' +
        '<td class="eq-col-id">' + esc(q.id) + '</td>' +
        '<td class="eq-col-dif"><span class="eq-dif eq-dif-' + esc(q.dificuldade) + '">' + esc(DIF_NOME[q.dificuldade] || q.dificuldade) + '</span></td>' +
        (mostrarTema ? '<td class="eq-col-tema">' + esc(q.tema) + '</td>' : '') +
        '<td><div class="eq-perg">' + esc(q.pergunta) + '</div><div class="eq-resp"><b>' + esc(q.correta) + ')</b> ' + esc(correta) + '</div></td>' +
        '<td class="eq-col-acoes"><button class="eq-acao" data-a="editar" title="Editar">' + ICONES.editar + '</button>' +
        '<button class="eq-acao eq-del" data-a="apagar" title="Apagar">' + ICONES.lixo + '</button></td>' +
        '</tr>';
    });
    alvo.innerHTML = html + '</tbody></table>';
  }

  function apagar(ids) {
    if (!ids.length) return Promise.resolve(false);
    var msg = ids.length === 1 ? 'Apagar a pergunta ' + ids[0] + '?' : 'Apagar as ' + ids.length + ' perguntas selecionadas?';
    return confirmar(msg + ' Uma cópia do arquivo anterior fica guardada na pasta de backups.', 'Apagar').then(function (ok) {
      if (!ok) return false;
      var fora = new Set(ids);
      return salvar(estado.perguntas.filter(function (q) { return !fora.has(q.id); }), ids.length === 1 ? 'Pergunta apagada.' : ids.length + ' perguntas apagadas.')
      .then(function () { ids.forEach(function (id) { estado.sel.delete(id); }); renderPainel(); return true; })
        .catch(function (e) { aviso(e.message, true); return false; });
    });
  }

  function aplicarMassa() {
    var mud = {};
    painel.querySelectorAll('[data-m]').forEach(function (i) { var v = i.value.trim(); if (v) mud[i.dataset.m] = v; });
    var campos = Object.keys(mud);
    if (!campos.length) return aviso('Preencha ao menos um campo para alterar as selecionadas.', true);
    var nomes = { tema: 'tema', dificuldade: 'dificuldade', fonte_curta: 'fonte curta', fonte_completa: 'link da fonte' };
    var n = estado.sel.size;
    confirmar('Alterar ' + campos.map(function (c) { return nomes[c]; }).join(', ') + ' em ' + n + (n === 1 ? ' pergunta?' : ' perguntas?'), 'Aplicar').then(function (ok) {
      if (!ok) return;
      var lista = estado.perguntas.map(function (q) { return estado.sel.has(q.id) ? Object.assign({}, q, mud) : q; });
      salvar(lista, n + (n === 1 ? ' pergunta atualizada.' : ' perguntas atualizadas.')).then(function () {
        painel.querySelectorAll('[data-m]').forEach(function (i) { i.value = ''; });
      }).catch(function (e) { aviso(e.message, true); });
    });
  }

  // ---------- editor de uma pergunta ----------
  function abrirEditor(id) {
    var orig = id != null ? estado.perguntas.find(function (q) { return q.id === id; }) : null;
    var temaPadrao = estado.tema !== '__todos' ? estado.tema : (temas()[0] || ['Geral'])[0];
    var q = orig ? Object.assign({}, orig) : { id: proximoId(temaPadrao), tema: temaPadrao, pergunta: '', a: '', b: '', c: '', d: '', correta: 'A', fonte_completa: '', fonte_curta: '', dificuldade: 'M' };
    var idAuto = !orig;

    var alts = LETRAS.map(function (L) {
      var k = L.toLowerCase();
      return '<div class="eq-alt" data-alt="' + L + '">' +
        '<div class="eq-alt-lado"><span class="eq-selo eq-selo-' + L + '">' + L + '</span></div>' +
        '<div style="flex:1;min-width:0"><textarea class="eq-textarea" data-f="' + k + '" rows="2" placeholder="Texto da alternativa ' + L + '">' + esc(q[k]) + '</textarea>' +
        '<div class="eq-alt-rodape"><label class="eq-marcar"><input type="radio" name="eq-correta" value="' + L + '"' + (q.correta === L ? ' checked' : '') + '> Correta</label><span data-cont="' + k + '"></span></div></div>' +
        '</div>';
    }).join('');

    var cam = el(
      '<div class="eq eq-camada eq-sobre">' +
        '<div class="eq-caixa eq-modal" role="dialog">' +
          '<div class="eq-topo"><div><h2>' + (orig ? 'Editar questão' : 'Nova questão') + '</h2><div class="eq-sub">' + (orig ? 'ID original: ' + esc(orig.id) : 'Preencha os campos e salve') + '</div></div>' +
            '<div class="eq-espaco"></div><button class="eq-icone-fechar" data-a="cancelar" title="Fechar (Esc)">×</button></div>' +
          '<div class="eq-corpo">' +
            '<div class="eq-linha3">' +
              '<label class="eq-campo"><span>ID</span><input class="eq-input" data-f="id" value="' + esc(q.id) + '"></label>' +
              '<label class="eq-campo"><span>Tema</span><input class="eq-input" data-f="tema" list="eq-temas" value="' + esc(q.tema) + '"></label>' +
              '<div class="eq-campo"><span>Dificuldade</span><div class="eq-seg" data-r="dif">' +
                ['F', 'M', 'D'].map(function (d) { return '<button type="button" data-d="' + d + '"' + (q.dificuldade === d ? ' class="eq-ativa"' : '') + '>' + DIF_NOME[d] + '</button>'; }).join('') +
              '</div></div>' +
            '</div>' +
            '<label class="eq-campo"><span>Pergunta</span><textarea class="eq-textarea" data-f="pergunta" rows="3" placeholder="Enunciado da pergunta">' + esc(q.pergunta) + '</textarea></label>' +
            '<div class="eq-linha2">' + alts + '</div>' +
            '<div class="eq-aviso" data-r="aviso" hidden></div>' +
            '<div class="eq-linha2">' +
              '<label class="eq-campo"><span>Fonte curta (aparece no telão)</span><input class="eq-input" data-f="fonte_curta" value="' + esc(q.fonte_curta) + '" placeholder="Ex.: TSE, 2024"></label>' +
              '<label class="eq-campo"><span>Link da fonte</span><input class="eq-input" data-f="fonte_completa" value="' + esc(q.fonte_completa) + '" placeholder="https://..."></label>' +
            '</div>' +
            '<div class="eq-erro" data-r="erro" hidden></div>' +
          '</div>' +
          '<div class="eq-rodape">' +
            (orig ? '<button class="eq-btn eq-btn-perigo" data-a="apagar">' + ICONES.lixo.replace('<svg', '<svg width="15" height="15"') + 'Apagar questão</button>' : '') +
            '<div class="eq-espaco"></div>' +
            '<button class="eq-btn" data-a="cancelar">Cancelar</button>' +
            '<button class="eq-btn eq-btn-escuro" data-a="salvar">' + (orig ? 'Salvar alterações' : 'Adicionar questão') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(cam);
    camadas.push(cam);
    isolarTeclado(cam);

    function ler() {
      var n = Object.assign({}, q);
      cam.querySelectorAll('[data-f]').forEach(function (i) { n[i.dataset.f] = i.value.replace(/\r?\n/g, ' ').trim(); });
      var r = cam.querySelector('input[name="eq-correta"]:checked');
      n.correta = r ? r.value : '';
      var d = cam.querySelector('[data-r="dif"] .eq-ativa');
      n.dificuldade = d ? d.dataset.d : '';
      return n;
    }

    // Mostra o tamanho de cada alternativa e avisa se a correta se destaca pelo tamanho
    function atualizar() {
      var n = ler();
      var tam = {};
      LETRAS.forEach(function (L) {
        var k = L.toLowerCase();
        tam[L] = n[k].length;
        cam.querySelector('[data-cont="' + k + '"]').textContent = tam[L] + ' caracteres';
        cam.querySelector('[data-alt="' + L + '"]').classList.toggle('eq-correta', n.correta === L);
      });
      var av = cam.querySelector('[data-r="aviso"]');
      var outras = LETRAS.filter(function (L) { return L !== n.correta; }).map(function (L) { return tam[L]; });
      var maiorErrada = Math.max.apply(null, outras);
      var menorErrada = Math.min.apply(null, outras);
      var c = tam[n.correta] || 0;
      if (c > 0 && maiorErrada > 0 && c > maiorErrada * 1.15) {
        av.hidden = false;
        av.textContent = 'A alternativa correta está bem mais longa que as outras. Os jogadores podem acertar só pelo tamanho; tente equilibrar.';
      } else if (c > 0 && menorErrada > 0 && c < menorErrada * 0.7) {
        av.hidden = false;
        av.textContent = 'A alternativa correta está bem mais curta que as outras. Os jogadores podem acertar só pelo tamanho; tente equilibrar.';
      } else av.hidden = true;
    }

    function autoAltura(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 4) + 'px'; }

    cam.addEventListener('input', function (e) {
      if (e.target.tagName === 'TEXTAREA') autoAltura(e.target);
      if (e.target.dataset.f === 'id') idAuto = false;
      if (e.target.dataset.f === 'tema' && idAuto) {
        var t = e.target.value.trim();
        if (t) cam.querySelector('[data-f="id"]').value = proximoId(t);
      }
      atualizar();
    });
    cam.addEventListener('change', atualizar);
    cam.addEventListener('mousedown', function (e) { if (e.target === cam) fecharTopo(); });
    cam.addEventListener('click', function (e) {
      var b = e.target.closest('[data-d],[data-a]');
      if (!b) return;
      if (b.dataset.d) {
        cam.querySelectorAll('[data-r="dif"] button').forEach(function (x) { x.classList.toggle('eq-ativa', x === b); });
        return;
      }
      if (b.dataset.a === 'cancelar') return fecharTopo();
      if (b.dataset.a === 'apagar') {
        return apagar([orig.id]).then(function (ok) { if (ok) fecharTopo(); });
      }
      if (b.dataset.a === 'salvar') salvarEditor();
    });

    function salvarEditor() {
      var n = ler();
      var erro = cam.querySelector('[data-r="erro"]');
      var p = problemas(n);
      var dup = estado.perguntas.some(function (x) { return x !== orig && x.id.toLowerCase() === n.id.toLowerCase(); });
      if (dup) p.unshift('o ID ' + n.id + ' já existe');
      if (p.length) { erro.hidden = false; erro.textContent = 'Corrija antes de salvar: ' + p.join('; ') + '.'; return; }
      erro.hidden = true;
      var lista = orig ? estado.perguntas.map(function (x) { return x === orig ? n : x; }) : estado.perguntas.concat([n]);
      salvar(lista, orig ? 'Pergunta ' + n.id + ' salva.' : 'Pergunta ' + n.id + ' adicionada.').then(function () {
        if (orig && estado.sel.has(orig.id) && orig.id !== n.id) { estado.sel.delete(orig.id); estado.sel.add(n.id); }
        fecharTopo();
      }).catch(function (e) { erro.hidden = false; erro.textContent = e.message; });
    }

    atualizar();
    cam.querySelectorAll('textarea').forEach(autoAltura);
    setTimeout(function () { cam.querySelector('[data-f="pergunta"]').focus(); }, 30);
  }

  // ---------- importação de CSV ----------
  var MODELO = 'ID,tema,pergunta,a,b,c,d,correta,fonte_completa,fonte_curta,dificuldade\n' +
    'X1,Cultura,"Texto da pergunta?",Alternativa A,Alternativa B,Alternativa C,Alternativa D,B,https://exemplo.com,"Fonte, 2025",M\n';

  function abrirImportacao() {
    var cam = el(
      '<div class="eq eq-camada eq-sobre">' +
        '<div class="eq-caixa eq-modal eq-modal-imp" role="dialog">' +
          '<div class="eq-topo"><div><h2>Importar questões</h2><div class="eq-sub">As perguntas do arquivo são acrescentadas ao banco atual</div></div>' +
            '<div class="eq-espaco"></div><button class="eq-icone-fechar" data-a="cancelar" title="Fechar (Esc)">×</button></div>' +
          '<div class="eq-corpo">' +
            '<div class="eq-soltar" data-r="soltar"><strong>Arraste um arquivo .csv para cá</strong><small>ou clique para escolher</small></div>' +
            '<input type="file" accept=".csv,text/csv" data-r="arquivo" hidden>' +
            '<div class="eq-dica">O arquivo precisa ter o cabeçalho <code>ID,tema,pergunta,a,b,c,d,correta,fonte_completa,fonte_curta,dificuldade</code> (vírgula ou ponto e vírgula; o Excel serve). ' +
              'IDs vazios ou que já existem recebem um novo ID automaticamente. <a href="#" data-a="modelo">Baixar arquivo modelo</a>.</div>' +
            '<div data-r="resultado"></div>' +
          '</div>' +
          '<div class="eq-rodape"><div class="eq-espaco"></div>' +
            '<button class="eq-btn" data-a="cancelar">Cancelar</button>' +
            '<button class="eq-btn eq-btn-escuro" data-a="confirmar" disabled>Adicionar questões</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(cam);
    camadas.push(cam);
    isolarTeclado(cam);

    var prontas = [];
    var input = cam.querySelector('[data-r="arquivo"]');
    var zona = cam.querySelector('[data-r="soltar"]');
    var res = cam.querySelector('[data-r="resultado"]');
    var btnOk = cam.querySelector('[data-a="confirmar"]');

    zona.addEventListener('click', function () { input.click(); });
    zona.addEventListener('dragover', function (e) { e.preventDefault(); zona.classList.add('eq-sobre-arq'); });
    zona.addEventListener('dragleave', function () { zona.classList.remove('eq-sobre-arq'); });
    zona.addEventListener('drop', function (e) {
      e.preventDefault(); zona.classList.remove('eq-sobre-arq');
      if (e.dataTransfer.files[0]) ler(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function () { if (input.files[0]) ler(input.files[0]); input.value = ''; });
    cam.addEventListener('mousedown', function (e) { if (e.target === cam) fecharTopo(); });
    cam.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'cancelar') return fecharTopo();
      if (b.dataset.a === 'modelo') {
        e.preventDefault();
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([MODELO], { type: 'text/csv;charset=utf-8' }));
        a.download = 'modelo-perguntas.csv';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
        return;
      }
      if (b.dataset.a === 'confirmar' && prontas.length) {
        btnOk.disabled = true;
        salvar(estado.perguntas.concat(prontas), prontas.length + ' perguntas importadas.')
          .then(function () { fecharTopo(); })
          .catch(function (e) { btnOk.disabled = false; aviso(e.message, true); });
      }
    });

    function ler(arquivo) {
      res.innerHTML = '<div class="eq-dica">Lendo ' + esc(arquivo.name) + '…</div>';
      btnOk.disabled = true; prontas = [];
      api('/api/editor/importar', { method: 'POST', body: arquivo }).then(function (j) {
        var usados = new Set(estado.perguntas.map(function (q) { return q.id.toLowerCase(); }));
        var linhas = j.perguntas.map(function (q, i) {
          var p = problemas(q, true);
          var info = '';
          if (!p.length) {
            var id = String(q.id || '').trim();
            if (!id || usados.has(id.toLowerCase())) {
              var novo = proximoIdComNovos(q.tema, usados);
              info = id ? 'ID ' + id + ' já existe → ' + novo : 'ID gerado: ' + novo;
              id = novo;
            }
            usados.add(id.toLowerCase());
            q = Object.assign({}, q, { id: id });
            prontas.push(q);
          }
          return { n: i + 2, q: q, p: p, info: info };
        });
        mostrar(arquivo.name, linhas);
      }).catch(function (e) {
        res.innerHTML = '<div class="eq-erro">' + esc(e.message) + '</div>';
      });
    }

    // Considera também os IDs gerados nesta importação
    function proximoIdComNovos(tema, usados) {
      var antes = estado.perguntas;
      estado.perguntas = antes.concat(prontas);
      try { return proximoId(tema, usados); } finally { estado.perguntas = antes; }
    }

    function mostrar(nome, linhas) {
      var ruins = linhas.filter(function (l) { return l.p.length; }).length;
      var renom = linhas.filter(function (l) { return l.info; }).length;
      var html = '<div class="eq-resumo">' +
        '<span class="eq-pilula eq-pilula-ok">' + prontas.length + ' prontas para adicionar</span>' +
        (ruins ? '<span class="eq-pilula eq-pilula-erro">' + ruins + ' com problema (serão ignoradas)</span>' : '') +
        (renom ? '<span class="eq-pilula eq-pilula-info">' + renom + ' com ID novo</span>' : '') +
        '</div>';
      if (linhas.length) {
        html += '<div class="eq-prev" style="margin-top:.75rem"><table class="eq-tabela"><thead><tr><th style="width:4rem">Linha</th><th class="eq-col-id">ID</th><th class="eq-col-tema">Tema</th><th>Pergunta</th><th style="width:16rem">Situação</th></tr></thead><tbody>' +
          linhas.map(function (l) {
            return '<tr><td>' + l.n + '</td><td class="eq-col-id">' + esc(l.q.id) + '</td><td class="eq-col-tema">' + esc(l.q.tema) + '</td>' +
              '<td><div class="eq-perg">' + esc(l.q.pergunta || '(vazia)') + '</div></td>' +
              '<td>' + (l.p.length ? '<span class="eq-status-erro">' + esc(l.p.join('; ')) + '</span>' : '<span class="eq-status-ok">OK</span>' + (l.info ? ' · ' + esc(l.info) : '')) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }
      res.innerHTML = '<div class="eq-dica" style="margin-bottom:.5rem"><b>' + esc(nome) + '</b>: ' + linhas.length + ' linhas lidas.</div>' + html;
      btnOk.disabled = !prontas.length;
      btnOk.textContent = prontas.length ? 'Adicionar ' + prontas.length + (prontas.length === 1 ? ' questão' : ' questões') : 'Nada para adicionar';
    }
  }

  // ---------- início ----------
  function iniciar() {
    lancador = el('<button class="eq eq-lancador" title="Banco de questões: editar, adicionar e importar" hidden>' + ICONES.lista + '<span>Questões</span></button>');
    lancador.addEventListener('click', abrir);
    document.body.appendChild(lancador);
    var agendado = false;
    function agendar() {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(function () { agendado = false; posicionarLancador(); });
    }
    new MutationObserver(agendar).observe(document.getElementById('root') || document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', agendar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(agendar);
    agendar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
