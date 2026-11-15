/**
 * dom — utilitários mínimos de interface (sem framework).
 */
(function (PTA) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Escapa texto para HTML. Ex.: esc('<b>') → '&lt;b&gt;' */
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  /** Seleciona um elemento. */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /** Delegação de eventos: on(root, 'click', '[data-action]', fn) */
  function on(root, event, selector, handler) {
    root.addEventListener(event, function (e) {
      const target = e.target.closest(selector);
      if (target && root.contains(target)) handler(e, target);
    });
  }

  /** Debounce simples. */
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /** Mensagem rápida no canto da tela. */
  function toast(message, kind) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('out'); }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }

  /**
   * Modal acessível. Devolve { el, close }.
   * Ex.: modal({ title: 'Antes × depois', html: '...', wide: true })
   */
  function modal(opts) {
    const root = document.getElementById('modal-root');
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<div class="modal-head"><h2>' + esc(opts.title) + '</h2>' +
        '<button class="icon-btn" data-close aria-label="Fechar">✕</button></div>' +
        '<div class="modal-body">' + (opts.html || '') + '</div>' +
      '</div>';
    function close() {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    document.body.classList.add('modal-open');
    const btn = wrap.querySelector('[data-close]');
    if (btn) btn.focus();
    return { el: wrap.querySelector('.modal-body'), root: wrap, close: close };
  }

  /** Lê/grava JSON no localStorage com proteção (pode falhar em alguns contextos). */
  const storage = {
    get: function (key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* armazenamento indisponível */ }
    },
  };

  PTA.ui.dom = { esc: esc, $: $, $$: $$, on: on, debounce: debounce, toast: toast, modal: modal, storage: storage };
})(PTA);
