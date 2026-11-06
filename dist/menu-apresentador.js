// Prova ou Reprova: menu do apresentador (botão ☰ no canto superior direito).
// Reúne os botões de quem conduz o jogo (Questões, Debug, Tela cheia) e as opções
// de exibir ou ocultar, no telão, o código, a dificuldade e o tema da questão.
(function () {
  'use strict';

  var CHAVE = 'prova-ou-reprova:exibir';
  var OPCOES = [
    { id: 'id', rotulo: 'Código da questão' },
    { id: 'dif', rotulo: 'Dificuldade' },
    { id: 'tema', rotulo: 'Tema' },
  ];
  // Escala do texto da pergunta e das alternativas
  var TAMANHOS = [0.8, 0.9, 1, 1.15, 1.3];

  var ICONES = {
    menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    fechar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    questoes: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    debug: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 0 1 6 0v1.1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z"/><path d="M12 20v-9M6.5 13H3M21 13h-3.5M6 9.5 3.5 7.5M18 9.5l2.5-2M6 17l-2.5 2M18 17l2.5 2"/></svg>',
    tela: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  };

  // ---------- preferências de exibição ----------
  function lerPrefs() {
    var p = { id: true, dif: true, tema: true, fonte: 1 };
    try { Object.assign(p, JSON.parse(localStorage.getItem(CHAVE) || '{}')); } catch (e) { /* sem armazenamento */ }
    return p;
  }
  function gravarPrefs(p) {
    try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch (e) { /* sem armazenamento */ }
  }
  function aplicarPrefs(p) {
    OPCOES.forEach(function (o) { document.documentElement.classList.toggle('ocultar-' + o.id, !p[o.id]); });
    if (TAMANHOS.indexOf(p.fonte) === -1) p.fonte = 1;
    document.documentElement.style.setProperty('--escala-texto', String(p.fonte));
    // Avisa o ajuste de tela (ajuste-tela.js) para recalcular o encaixe
    window.dispatchEvent(new Event('resize'));
  }
  var prefs = lerPrefs();
  aplicarPrefs(prefs);

  // ---------- menu ----------
  var botao, menu;

  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

  function montar() {
    botao = el('<button class="ma-botao" title="Menu do apresentador" aria-haspopup="true" aria-expanded="false">' + ICONES.menu + '</button>');
    menu = el(
      '<div class="ma-menu" role="menu" hidden>' +
        '<div class="ma-titulo">Menu do apresentador</div>' +
        '<button class="ma-item" role="menuitem" data-a="questoes">' + ICONES.questoes + '<span>Questões</span><small>editar e adicionar</small></button>' +
        '<button class="ma-item" role="menuitem" data-a="debug">' + ICONES.debug + '<span>Debug</span><small data-r="debug">F2</small></button>' +
        '<button class="ma-item" role="menuitem" data-a="tela">' + ICONES.tela + '<span>Tela cheia</span><small>F11</small></button>' +
        '<div class="ma-sep"></div>' +
        '<div class="ma-titulo">Exibir na pergunta</div>' +
        OPCOES.map(function (o) {
          return '<label class="ma-opcao"><span>' + o.rotulo + '</span>' +
            '<input type="checkbox" role="switch" data-o="' + o.id + '"><i class="ma-chave" aria-hidden="true"></i></label>';
        }).join('') +
        '<div class="ma-sep"></div>' +
        '<div class="ma-titulo">Tamanho do texto</div>' +
        '<div class="ma-tamanhos" role="radiogroup" aria-label="Tamanho do texto da pergunta e das alternativas">' +
          TAMANHOS.map(function (t) {
            return '<button type="button" role="radio" data-t="' + t + '" title="' + Math.round(t * 100) + '%">' +
              '<b style="font-size:' + (0.7 + (t - 0.8) * 1.2).toFixed(2) + 'rem">A</b><small>' + Math.round(t * 100) + '%</small></button>';
          }).join('') +
        '</div>' +
        '<div class="ma-dica">Vale para a pergunta e as alternativas.</div>' +
      '</div>'
    );
    document.body.appendChild(botao);
    document.body.appendChild(menu);

    botao.addEventListener('click', function () { menu.hidden ? abrir() : fechar(); });
    menu.addEventListener('click', function (e) {
      var t = e.target.closest('[data-t]');
      if (t) {
        prefs.fonte = parseFloat(t.dataset.t);
        gravarPrefs(prefs);
        aplicarPrefs(prefs);
        marcarTamanho();
        return;
      }
      var b = e.target.closest('[data-a]');
      if (!b) return;
      var a = b.dataset.a;
      fechar();
      if (a === 'questoes' && window.EditorQuestoes) window.EditorQuestoes.abrir();
      if (a === 'debug') clicarOculto('.host-debug');
      if (a === 'tela') clicarOculto('button[title="Alternar Tela Cheia"]');
    });
    menu.addEventListener('change', function (e) {
      var o = e.target.dataset.o;
      if (!o) return;
      prefs[o] = e.target.checked;
      gravarPrefs(prefs);
      aplicarPrefs(prefs);
    });
    document.addEventListener('mousedown', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && !botao.contains(e.target)) fechar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { fechar(); botao.focus(); }
    });
  }

  // Os botões originais continuam na página (ocultos); o menu apenas os aciona
  function clicarOculto(seletor) {
    var b = document.querySelector(seletor);
    if (b) b.click();
  }

  function marcarTamanho() {
    menu.querySelectorAll('[data-t]').forEach(function (b) {
      var sel = parseFloat(b.dataset.t) === prefs.fonte;
      b.classList.toggle('ma-sel', sel);
      b.setAttribute('aria-checked', sel ? 'true' : 'false');
    });
  }

  function abrir() {
    menu.querySelectorAll('[data-o]').forEach(function (i) { i.checked = !!prefs[i.dataset.o]; });
    marcarTamanho();
    var dbg = document.querySelector('.host-debug');
    var ativo = dbg && /bg-yellow-400/.test(dbg.className);
    var info = menu.querySelector('[data-r="debug"]');
    info.textContent = ativo ? 'aberto · F2' : 'F2';
    info.classList.toggle('ma-ativo', !!ativo);
    menu.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    botao.innerHTML = ICONES.fechar;
  }
  function fechar() {
    menu.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    botao.innerHTML = ICONES.menu;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
