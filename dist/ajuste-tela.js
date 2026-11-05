// Prova ou Reprova: garante que nenhuma tela precise de rolagem.
// Se o conteúdo de uma tela (ou de uma janela modal) for mais alto que a área visível,
// ele é reduzido proporcionalmente (CSS zoom) até caber. Em telas grandes nada muda.
(function () {
  'use strict';
  var MIN_ZOOM = 0.45;
  var agendado = false;

  function px(v) { return parseFloat(v) || 0; }

  // Altura natural (sem zoom) de um bloco, incluindo margens verticais.
  function alturaNatural(el, liberar) {
    var antigo = { zoom: el.style.zoom, minHeight: el.style.minHeight, maxHeight: el.style.maxHeight };
    el.style.zoom = '1';
    if (liberar.min) el.style.minHeight = '0px';
    if (liberar.max) el.style.maxHeight = 'none';
    var cs = getComputedStyle(el);
    var h = el.offsetHeight + px(cs.marginTop) + px(cs.marginBottom);
    el.style.zoom = antigo.zoom;
    el.style.minHeight = antigo.minHeight;
    if (!liberar.manterMax) el.style.maxHeight = antigo.maxHeight;
    return h;
  }

  function ajustar(el, disponivel, liberar) {
    if (disponivel <= 0) return;
    var h = alturaNatural(el, liberar);
    var z = Math.max(MIN_ZOOM, Math.min(1, disponivel / h));
    var novo = z >= 0.999 ? '' : String(Math.floor(z * 1000) / 1000);
    if (el.style.zoom !== novo) el.style.zoom = novo;
  }

  function executar() {
    agendado = false;
    var raiz = document.documentElement;

    // Altura da barra fixa do apresentador (usada pelo laço pequeno no CSS)
    var barra = document.querySelector('.barra-inferior');
    raiz.style.setProperty('--altura-barra', (barra ? barra.offsetHeight : 0) + 'px');

    // Conteúdo principal de cada tela
    var palco = document.querySelector('.palco');
    if (palco) {
      var pcs = getComputedStyle(palco);
      var disp = window.innerHeight - px(pcs.paddingTop) - px(pcs.paddingBottom);
      Array.prototype.forEach.call(palco.children, function (c) {
        var pos = getComputedStyle(c).position;
        if (c.tagName === 'IMG' || (pos !== 'static' && pos !== 'relative')) return;
        ajustar(c, disp, { min: true });
      });
    }

    // Janelas modais (regras, configurar partida etc.): sem rolagem interna
    Array.prototype.forEach.call(document.querySelectorAll('.inset-0 > .overflow-y-auto'), function (painel) {
      var ov = painel.parentElement;
      var ocs = getComputedStyle(ov);
      var disp = ov.clientHeight - px(ocs.paddingTop) - px(ocs.paddingBottom);
      painel.style.maxHeight = 'none';
      ajustar(painel, disp, { max: true, manterMax: true });
    });
  }

  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(executar);
  }

  function iniciar() {
    new MutationObserver(agendar).observe(document.body, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'],
    });
    window.addEventListener('resize', agendar);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(agendar);
    agendar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
