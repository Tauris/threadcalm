// ==UserScript==
// @name        Threadcalm
// @namespace   https://github.com/Tauris/threadcalm
// @version     1.1.1
// @description Expand whole Viva Engage threads automatically, copy them as Markdown, and read them with shortcuts, a reading mode and less clutter.
// @author      Jörg Türmer
// @icon        data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2040%2040%22%3E%3Crect%20width%3D%2240%22%20height%3D%2240%22%20rx%3D%2210%22%20fill%3D%22%232f6f68%22%2F%3E%3Cg%20transform%3D%22translate(4%204)%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%222.4%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M5%208h22%22%2F%3E%3Cpath%20d%3D%22M11%2016h16%22%2F%3E%3Cpath%20d%3D%22M17%2024h10%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E
// @license     BSD-3-Clause
// @homepageURL https://github.com/Tauris/threadcalm
// @supportURL  https://github.com/Tauris/threadcalm/issues
// @downloadURL https://github.com/Tauris/threadcalm/raw/main/dist/threadcalm.user.js
// @updateURL   https://github.com/Tauris/threadcalm/raw/main/dist/threadcalm.user.js
// @match       https://engage.cloud.microsoft/*
// @match       https://*.engage.cloud.microsoft/*
// @match       https://web.yammer.com/*
// @match       https://www.yammer.com/*
// @include     https://engage.cloud.microsoft/*
// @include     https://*.engage.cloud.microsoft/*
// @include     https://web.yammer.com/*
// @include     https://www.yammer.com/*
// @run-at      document-idle
// @noframes
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_setClipboard
// @grant       GM_registerMenuCommand
// ==/UserScript==
/*!
 * Threadcalm v1.1.1
 * https://github.com/Tauris/threadcalm
 *
 * Copyright (c) 2026 Jörg Türmer. Licensed under the BSD 3-Clause License.
 * Provided "as is", without warranty of any kind. See LICENSE in the repository.
 *
 * INDEPENDENT PROJECT - NOT AFFILIATED WITH MICROSOFT.
 * This is an unofficial, community-maintained userscript. It is not affiliated
 * with, endorsed by, sponsored by or supported by Microsoft Corporation, and
 * Microsoft has not reviewed it and has no responsibility for it. "Microsoft",
 * "Viva", "Viva Engage", "Yammer" and related marks are trademarks of Microsoft
 * Corporation, used here only to identify the product this script works with.
 * It contains no Microsoft code or assets, sends no data anywhere, and only
 * changes how an already-loaded page is displayed in your own browser.
 *
 * Check your organisation's policy before using it on a corporate tenant.
 */

(() => {
  // src/core/bus.js
  function createBus() {
    const listeners = /* @__PURE__ */ new Map();
    return {
      /**
       * @param {string} event
       * @param {Function} handler
       * @returns {() => void} unsubscribe
       */
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, /* @__PURE__ */ new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event)?.delete(handler);
      },
      emit(event, payload) {
        const handlers = listeners.get(event);
        if (!handlers) return;
        for (const handler of [...handlers]) {
          try {
            handler(payload);
          } catch (error) {
            console.error("[Threadcalm] listener failed for", event, error);
          }
        }
      },
      clear() {
        listeners.clear();
      }
    };
  }
  var bus = createBus();
  var EVENTS = {
    NAVIGATE: "navigate",
    DOM_CHANGED: "dom-changed",
    SETTINGS_CHANGED: "settings-changed",
    EXPAND_PROGRESS: "expand-progress",
    EXPAND_STATE: "expand-state",
    TOAST: "toast",
    SHOW_HELP: "show-help",
    COPY_DIAGNOSTICS: "copy-diagnostics"
  };

  // src/core/stats.js
  var counters = {
    /** `innerText` reads. Each one flushes layout. */
    layoutReads: 0,
    /** Elements skipped by the cheap text check, so never laid out. */
    layoutSkips: 0,
    /** Expander scans, each of which classifies every candidate control. */
    scans: 0,
    /** Elements a scan looked at, summed over all scans. */
    candidates: 0,
    /** Feature sweeps, triggered by a reported DOM change or navigation. */
    sweeps: 0
  };
  var startedAt = Date.now();
  var lastScanAt = 0;
  function noteScan(candidates = 0) {
    counters.scans += 1;
    counters.candidates += candidates;
    lastScanAt = Date.now();
  }
  function snapshot() {
    const now = Date.now();
    let domNodes = -1;
    try {
      domNodes = document.getElementsByTagName("*").length;
    } catch {
      domNodes = -1;
    }
    return {
      ...counters,
      domNodes,
      uptimeSeconds: Math.round((now - startedAt) / 1e3),
      sinceLastScanSeconds: lastScanAt ? Math.round((now - lastScanAt) / 1e3) : null
    };
  }

  // src/core/dom.js
  var TEXT_ATTRIBUTES = [
    "aria-label",
    "title",
    "data-testid",
    "data-automation-id",
    "data-track-name"
  ];
  var WHITESPACE = /\s+/g;
  function normalizeText(value) {
    return String(value ?? "").replace(WHITESPACE, " ").trim();
  }
  function visibleText(element) {
    if (!element) return "";
    return element.innerText ?? element.textContent ?? "";
  }
  var RAW_TEXT_BUDGET = 10;
  function accessibleTexts(element, { maxLength = Infinity } = {}) {
    if (!(element instanceof HTMLElement)) return [];
    const texts = [];
    const budget = maxLength * RAW_TEXT_BUDGET;
    if (!Number.isFinite(budget) || (element.textContent?.length ?? 0) <= budget) {
      counters.layoutReads += 1;
      texts.push(visibleText(element));
    } else {
      counters.layoutSkips += 1;
    }
    for (const attribute of TEXT_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value) texts.push(value);
    }
    const named = texts.filter(Boolean).map(normalizeText).filter((text) => text.length > 0);
    return Number.isFinite(maxLength) ? named.filter((text) => text.length <= maxLength) : named;
  }
  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (!style) return true;
    return style.visibility !== "hidden" && style.display !== "none";
  }
  function hasIconSignature(element, signatures) {
    if (!(element instanceof HTMLElement) || !signatures?.length) return false;
    for (const path of element.querySelectorAll("svg path")) {
      const data = path.getAttribute("d");
      if (!data) continue;
      if (signatures.some((signature) => signature && data.startsWith(signature))) return true;
    }
    return false;
  }
  var INTERACTIVE_SELECTOR = 'button, [role="button"], a[href], [role="link"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
  function nearestClickable(element, boundary) {
    if (!(element instanceof HTMLElement)) return null;
    if (element.matches(INTERACTIVE_SELECTOR)) return element;
    let node2 = element.parentElement;
    let depth = 0;
    while (node2 && depth < 6) {
      if (boundary && node2 === boundary) break;
      if (node2.matches(INTERACTIVE_SELECTOR)) return node2;
      node2 = node2.parentElement;
      depth += 1;
    }
    return element;
  }
  var ACTION_ROW_SELECTOR = '[data-testid="overflow-set"]';
  var POST_SELECTOR = '[role="article"], article, .qaThreadStarter, .y-fixedGridColumn';
  var SEMANTIC_POST_SELECTOR = '[role="article"], article';
  var STARTER_SELECTOR = ".qaThreadStarter";
  function looksLikePost(element) {
    return element.querySelector(ACTION_ROW_SELECTOR) !== null || element.matches(STARTER_SELECTOR);
  }
  function closestPost(element) {
    if (!(element instanceof HTMLElement)) return null;
    const semantic = element.closest(SEMANTIC_POST_SELECTOR);
    if (semantic) return semantic;
    let candidate = element.closest(POST_SELECTOR);
    while (candidate) {
      if (looksLikePost(candidate)) return candidate;
      candidate = candidate.parentElement?.closest(POST_SELECTOR) ?? null;
    }
    return null;
  }
  var BODY_WRAPPER_SELECTOR = '[class*="contentStateBodyTextWrapper"]';
  function isInlineLinkButton(element) {
    return element instanceof HTMLButtonElement && element.querySelector(":scope > .y-fakeLink") !== null && !element.hasAttribute("aria-expanded") && !element.hasAttribute("aria-haspopup") && element.closest(ACTION_ROW_SELECTOR) === null;
  }
  function ownOf(post, selector) {
    return [...post.querySelectorAll(selector)].filter((element) => closestPost(element) === post);
  }
  function isBodyLinkButton(element) {
    return isInlineLinkButton(element) && element.closest(BODY_WRAPPER_SELECTOR) !== null && closestPost(element) !== null;
  }
  function isTranslationLinkButton(element) {
    if (!isInlineLinkButton(element) || element.closest(BODY_WRAPPER_SELECTOR)) return false;
    const post = closestPost(element);
    if (!post) return false;
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const bodies = ownOf(post, BODY_WRAPPER_SELECTOR);
    const rows = ownOf(post, ACTION_ROW_SELECTOR);
    return bodies.some((body) => follows(body, element)) && (rows.length === 0 || rows.some((row) => follows(element, row)));
  }
  function postContainerFor(actionRow) {
    if (!(actionRow instanceof HTMLElement)) return null;
    let node2 = actionRow.parentElement;
    let depth = 0;
    while (node2 && depth < 8) {
      if (node2.matches(POST_SELECTOR)) return node2;
      node2 = node2.parentElement;
      depth += 1;
    }
    return actionRow.parentElement;
  }
  function allPosts(root = document) {
    const semantic = [...root.querySelectorAll(SEMANTIC_POST_SELECTOR)].filter(isVisible);
    if (semantic.length > 0) return semantic;
    const seen = /* @__PURE__ */ new Set();
    const posts = [];
    for (const row of root.querySelectorAll(ACTION_ROW_SELECTOR)) {
      const post = postContainerFor(row);
      if (!post || seen.has(post) || !isVisible(post)) continue;
      seen.add(post);
      posts.push(post);
    }
    let added = false;
    for (const starter of root.querySelectorAll(STARTER_SELECTOR)) {
      if (seen.has(starter) || starter.querySelector(ACTION_ROW_SELECTOR) || !isVisible(starter)) continue;
      if (posts.some((post) => starter.contains(post) || post.contains(starter))) continue;
      seen.add(starter);
      posts.push(starter);
      added = true;
    }
    if (added) {
      posts.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    }
    return posts;
  }
  function rootPosts(root = document) {
    const posts = allPosts(root);
    return posts.filter((post) => !posts.some((other) => other !== post && other.contains(post)));
  }
  function debounce(fn, waitMs) {
    let timer = null;
    const debounced = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, waitMs);
    };
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    return debounced;
  }
  function el(tag, options = {}, ...children) {
    const node2 = document.createElement(tag);
    const { className, text, html, dataset, style, on, ...attributes } = options;
    if (className) node2.className = className;
    if (text != null) node2.textContent = String(text);
    if (html != null) node2.innerHTML = html;
    if (dataset) Object.assign(node2.dataset, dataset);
    if (style) Object.assign(node2.style, style);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === false || value == null) continue;
      node2.setAttribute(key, value === true ? "" : String(value));
    }
    for (const [event, handler] of Object.entries(on ?? {})) {
      node2.addEventListener(event, handler);
    }
    node2.append(...children.filter((child) => child != null));
    return node2;
  }
  function isEditingContext(target = document.activeElement) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  // src/core/gm.js
  var hasFn = (name) => typeof globalThis[name] === "function";
  function addStyle(css) {
    if (hasFn("GM_addStyle")) {
      try {
        return GM_addStyle(css);
      } catch {
      }
    }
    const style = document.createElement("style");
    style.textContent = css;
    (document.head || document.documentElement).append(style);
    return style;
  }
  var LOCAL_PREFIX = "threadcalm:";
  function getValue(key, fallback) {
    if (hasFn("GM_getValue")) {
      try {
        const stored = GM_getValue(key, void 0);
        if (stored !== void 0) return stored;
      } catch {
      }
    }
    try {
      const raw = localStorage.getItem(LOCAL_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function setValue(key, value) {
    if (hasFn("GM_setValue")) {
      try {
        GM_setValue(key, value);
        return;
      } catch {
      }
    }
    try {
      localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
    } catch {
    }
  }
  function deleteValue(key) {
    if (hasFn("GM_deleteValue")) {
      try {
        GM_deleteValue(key);
      } catch {
      }
    }
    try {
      localStorage.removeItem(LOCAL_PREFIX + key);
    } catch {
    }
  }
  async function copyToClipboard(text) {
    if (hasFn("GM_setClipboard")) {
      try {
        GM_setClipboard(text, "text");
        return true;
      } catch {
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:-1000px;opacity:0;";
      document.body.append(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      return copied;
    } catch {
      return false;
    }
  }
  function registerMenuCommand(label, handler) {
    if (!hasFn("GM_registerMenuCommand")) return;
    try {
      GM_registerMenuCommand(label, handler);
    } catch {
    }
  }

  // src/core/i18n.js
  var ORIGINAL_SUFFIX = "(?:\\s*\\([^)]*\\))?$";
  var LABEL_PACKS = {
    en: {
      name: "English",
      replyCount: "^(\\d+)\\s+(?:repl(?:y|ies)|comments?|responses?)$",
      expandReplies: [
        "(?:show|view|load|see|read)\\s+(?:\\d+\\s+)?(?:more|all|previous|earlier|next|older|additional)\\s+(?:repl(?:y|ies)|responses?|comments?)",
        "(?:more|view all)\\s+(?:repl(?:y|ies)|responses?|comments?)",
        "^\\d+\\s+previous\\s+(?:repl(?:y|ies)|comments?)$"
      ],
      expandText: ["^see\\s+more$", "^show\\s+more$", "^read\\s+more$", "^\\.\\.\\.\\s*more$"],
      translate: [
        "^(?:show\\s+)?translat(?:e|ion)(?:\\s+this\\s+post)?$",
        "^translate\\s+post$",
        "^see\\s+translation$"
      ],
      showOriginal: ["^(?:show|see)\\s+original(?:\\s+post)?(?:\\s*\\([^)]*\\))?$", "^undo\\s+translation$"],
      promoted: [
        "^promoted$",
        "^sponsored$",
        "^suggested(?:\\s+for\\s+you)?$",
        "^people\\s+you\\s+may\\s+know$",
        "^discover\\s+communities$"
      ],
      menu: ["more options", "more actions", "post actions", "overflow", "ellipsis", "menu", "settings"]
    },
    de: {
      name: "Deutsch",
      replyCount: "^(\\d+)\\s+(?:Antwort(?:en)?|Kommentare?)$",
      expandReplies: [
        "(?:weitere|mehr|alle|ältere|vorherige)\\s+(?:Antworten|Kommentare)(?:\\s+(?:anzeigen|laden))?",
        "(?:Antworten|Kommentare)\\s+(?:anzeigen|laden)",
        "^\\d+\\s+(?:weitere|vorherige)\\s+(?:Antwort(?:en)?|Kommentare?)$"
      ],
      expandText: ["^mehr\\s+anzeigen$", "^weiterlesen$", "^mehr$"],
      translate: [
        "^Übersetzung\\s+anzeigen$",
        "^übersetzen$",
        "^Beitrag\\s+übersetzen$"
      ],
      showOriginal: ["^Original\\s+anzeigen(?:\\s*\\([^)]*\\))?$", "^Übersetzung\\s+rückgängig"],
      promoted: ["^gesponsert$", "^beworben$", "^vorgeschlagen$", "^vorschläge\\s+für\\s+dich$"],
      menu: ["weitere optionen", "mehr optionen", "weitere aktionen", "menü", "einstellungen"]
    },
    fr: {
      name: "Français",
      replyCount: "^(\\d+)\\s+(?:réponses?|commentaires?)$",
      expandReplies: [
        "(?:afficher|voir|charger)\\s+(?:les\\s+)?(?:\\d+\\s+)?(?:autres?|plus\\s+de|anciennes?|précédentes?)\\s+(?:réponses?|commentaires?)",
        "(?:afficher|voir)\\s+(?:toutes\\s+les\\s+)?réponses",
        // French puts the adjective after the noun: "les réponses précédentes".
        "(?:afficher|voir|charger)\\s+(?:les\\s+)?(?:réponses?|commentaires?)\\s+(?:précédent(?:e|es)?|antérieur(?:e|es)?|plus\\s+ancien(?:ne|nes)?)"
      ],
      expandText: ["^voir\\s+plus$", "^afficher\\s+plus$", "^lire\\s+la\\s+suite$"],
      translate: ["^(?:afficher\\s+la\\s+)?traduction$", "^traduire(?:\\s+la\\s+publication)?$"],
      showOriginal: ["^(?:afficher|voir)\\s+l[’']original(?:\\s*\\([^)]*\\))?$"],
      promoted: ["^sponsorisé$", "^promu$", "^suggéré$"],
      menu: ["plus d’options", "plus d'options", "autres actions", "menu", "paramètres"]
    },
    es: {
      name: "Español",
      replyCount: "^(\\d+)\\s+(?:respuestas?|comentarios?)$",
      expandReplies: [
        "(?:ver|mostrar|cargar)\\s+(?:\\d+\\s+)?(?:más|todas\\s+las|anteriores)\\s+(?:respuestas?|comentarios?)",
        "(?:respuestas?|comentarios?)\\s+(?:anteriores|más)"
      ],
      expandText: ["^ver\\s+más$", "^mostrar\\s+más$", "^leer\\s+más$"],
      translate: ["^(?:mostrar\\s+)?traducción$", "^traducir(?:\\s+publicación)?$"],
      showOriginal: ["^(?:mostrar|ver)\\s+original(?:\\s*\\([^)]*\\))?$"],
      promoted: ["^patrocinado$", "^promocionado$", "^sugerido$"],
      menu: ["más opciones", "más acciones", "menú", "configuración"]
    },
    nl: {
      name: "Nederlands",
      replyCount: "^(\\d+)\\s+(?:reacties?|antwoord(?:en)?|opmerkingen?)$",
      expandReplies: [
        "(?:meer|alle|vorige|oudere)\\s+(?:reacties|antwoorden|opmerkingen)(?:\\s+(?:weergeven|tonen|laden))?",
        "(?:reacties|antwoorden)\\s+(?:weergeven|tonen|laden)"
      ],
      expandText: ["^meer\\s+weergeven$", "^meer\\s+tonen$", "^lees\\s+meer$"],
      translate: ["^vertaling\\s+weergeven$", "^vertalen$"],
      showOriginal: ["^origineel\\s+weergeven(?:\\s*\\([^)]*\\))?$"],
      promoted: ["^gesponsord$", "^voorgesteld$"],
      menu: ["meer opties", "meer acties", "menu", "instellingen"]
    },
    it: {
      name: "Italiano",
      replyCount: "^(\\d+)\\s+(?:rispost[ae]|commenti?)$",
      expandReplies: [
        "(?:mostra|visualizza|carica)\\s+(?:\\d+\\s+)?(?:altre|tutte\\s+le|precedenti)\\s+(?:risposte|commenti)",
        "(?:risposte|commenti)\\s+precedenti"
      ],
      expandText: ["^mostra\\s+(?:di\\s+)?più$", "^leggi\\s+tutto$"],
      translate: ["^(?:mostra\\s+)?traduzione$", "^traduci(?:\\s+post)?$"],
      showOriginal: ["^mostra\\s+originale(?:\\s*\\([^)]*\\))?$"],
      promoted: ["^sponsorizzato$", "^suggerito$"],
      menu: ["altre opzioni", "altre azioni", "menù", "impostazioni"]
    }
  };
  var OBSERVED = {
    ar: {
      name: "العربية",
      seeMore: ["إظهار المزيد"],
      translate: ["إظهار الترجمة"],
      original: ["إظهار النسخة الأصلية"],
      // "Show 1 previous comment", with Arabic-Indic digits.
      pagination: ["^إظهار\\s+[0-9٠-٩]+\\s+تعليق(?:ات)?\\s+ساب"]
    },
    bg: { name: "Български", seeMore: ["вижте повече"], translate: ["Показване на превод"], original: ["Показване на оригинала"] },
    ca: { name: "Català", seeMore: ["mostra més"], translate: ["Mostra la traducció"] },
    cs: { name: "Čeština", seeMore: ["zobrazit více"], translate: ["Zobrazit překlad"] },
    da: { name: "Dansk", seeMore: ["se mere"], translate: ["Vis oversættelse"] },
    de: { seeMore: ["Mehr anzeigen"], translate: ["Übersetzung anzeigen"] },
    el: { name: "Ελληνικά", seeMore: ["εμφάνιση περισσότερων"], translate: ["Εμφάνιση μετάφρασης"] },
    en: { seeMore: ["see more"], translate: ["Show translation"], original: ["Show original"] },
    es: { seeMore: ["ver más"], translate: ["Mostrar traducción"] },
    et: { name: "Eesti", seeMore: ["kuva rohkem"], translate: ["Kuva tõlge"] },
    fi: { name: "Suomi", seeMore: ["näytä enemmän"], translate: ["Näytä käännös"] },
    fr: { seeMore: ["afficher plus"], translate: ["Afficher la traduction"] },
    he: { name: "עברית", seeMore: ["הצג עוד"], translate: ["הצג תרגום"] },
    hr: { name: "Hrvatski", seeMore: ["prikaži više"], translate: ["Prikaži prijevod"] },
    hu: { name: "Magyar", seeMore: ["Kibontás"], translate: ["Fordítás megjelenítése"] },
    id: { name: "Bahasa Indonesia", seeMore: ["lihat selengkapnya"], translate: ["Perlihatkan terjemahan"] },
    it: { seeMore: ["vedi altro"], translate: ["Mostra traduzione"] },
    ja: { name: "日本語", seeMore: ["詳細を表示"], translate: ["翻訳を表示"], original: ["原文を表示"] },
    ko: { name: "한국어", seeMore: ["더 보기"], translate: ["번역 표시"] },
    lt: { name: "Lietuvių", seeMore: ["žr. daugiau"], translate: ["Rodyti vertimą"] },
    lv: { name: "Latviešu", seeMore: ["skatīt vairāk"], translate: ["Rādīt tulkojumu"] },
    nb: { name: "Norsk bokmål", seeMore: ["se mer"], translate: ["Vis oversettelse"] },
    nl: { seeMore: ["meer weergeven"], translate: ["Vertaling weergeven"] },
    pl: { name: "Polski", seeMore: ["zobacz więcej"], translate: ["Pokaż tłumaczenie"] },
    pt: { name: "Português", seeMore: ["ver mais"], translate: ["Mostrar tradução", "Exibir tradução"], original: ["Exibir original"] },
    ro: { name: "Română", seeMore: ["vedeți mai multe"], translate: ["Afișează traducerea"] },
    ru: { name: "Русский", seeMore: ["Показать больше"], translate: ["Показать перевод"], original: ["Показать оригинал"] },
    sk: { name: "Slovenčina", seeMore: ["zobraziť viac"], translate: ["Zobraziť preklad"] },
    sl: { name: "Slovenščina", seeMore: ["pokaži več"], translate: ["Pokaži prevod"] },
    sr: { name: "Srpski", seeMore: ["pogledajte više"], translate: ["Prikaži prevod"] },
    sv: { name: "Svenska", seeMore: ["visa mer"], translate: ["Visa översättning"] },
    th: { name: "ไทย", seeMore: ["ดูเพิ่มเติม"], translate: ["แสดงคำแปล"] },
    tr: { name: "Türkçe", seeMore: ["daha fazla göster"], translate: ["Çeviriyi göster"] },
    uk: { name: "Українська", seeMore: ["показати більше"], translate: ["Показати переклад"] },
    vi: { name: "Tiếng Việt", seeMore: ["xem thêm"], translate: ["Hiển thị bản dịch"] },
    zh: { name: "中文", seeMore: ["查看更多"], translate: ["显示翻译", "顯示翻譯"] }
  };
  function phrase(text) {
    return `^${text.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}$`;
  }
  function originalPhrase(text) {
    return phrase(text).replace(/\$$/, () => ORIGINAL_SUFFIX);
  }
  for (const [code, observed] of Object.entries(OBSERVED)) {
    const pack = LABEL_PACKS[code] ??= {
      name: observed.name,
      replyCount: null,
      expandReplies: [],
      expandText: [],
      translate: [],
      showOriginal: [],
      promoted: [],
      menu: []
    };
    pack.expandText.push(...(observed.seeMore ?? []).map(phrase));
    pack.translate.push(...(observed.translate ?? []).map(phrase));
    pack.showOriginal.push(...(observed.original ?? []).map(originalPhrase));
    pack.expandReplies.push(...observed.pagination ?? []);
  }
  var AVAILABLE_LANGUAGES = Object.keys(LABEL_PACKS);
  var LANGUAGE_NAMES = Object.fromEntries(
    Object.entries(LABEL_PACKS).map(([code, pack]) => [code, pack.name])
  );
  function compile(patterns) {
    const usable = patterns.filter((pattern) => {
      if (typeof pattern !== "string" || pattern === "") return false;
      try {
        new RegExp(pattern);
        return true;
      } catch {
        return false;
      }
    });
    if (usable.length === 0) return null;
    return new RegExp(usable.map((pattern) => `(?:${pattern})`).join("|"), "i");
  }
  function pageLanguage(doc = globalThis.document) {
    const raw = doc?.documentElement?.lang?.trim().toLowerCase() ?? "";
    return raw ? raw.split(/[-_]/)[0] : null;
  }
  function resolveLanguages(page, extra = []) {
    const codes = [];
    if (page && page in LABEL_PACKS) codes.push(page);
    for (const code of extra ?? []) {
      if (code in LABEL_PACKS && !codes.includes(code)) codes.push(code);
    }
    return { codes, page, supported: !page || page in LABEL_PACKS };
  }
  function buildMatchers(languages, custom = {}) {
    const active = (languages ?? []).filter((code) => code in LABEL_PACKS);
    const codes = active.length > 0 ? active : ["en"];
    const packs = codes.map((code) => LABEL_PACKS[code]);
    const collect = (field) => [
      ...packs.flatMap((pack) => pack[field] ?? []),
      ...custom?.[field] ?? []
    ];
    return {
      languages: codes,
      replyCount: compile(packs.map((pack) => pack.replyCount)),
      expandReplies: compile(collect("expandReplies")),
      expandText: compile(collect("expandText")),
      translate: compile(collect("translate")),
      showOriginal: compile(collect("showOriginal")),
      promoted: compile(collect("promoted")),
      menu: compile(collect("menu"))
    };
  }

  // src/core/logger.js
  var PREFIX = "[Threadcalm]";
  var debugEnabled = false;
  function setDebug(enabled) {
    debugEnabled = Boolean(enabled);
  }
  var log = {
    debug(...args) {
      if (debugEnabled) console.debug(PREFIX, ...args);
    },
    info(...args) {
      console.info(PREFIX, ...args);
    },
    warn(...args) {
      console.warn(PREFIX, ...args);
    },
    error(...args) {
      console.error(PREFIX, ...args);
    }
  };

  // src/core/language.js
  var STOP_WORDS = {
    en: "the and to of a in is it you that for on with as are this be have not but they we his her from will can all was would there what about which when your more has our who if out so up one time them some".split(" "),
    de: "der die das und ist nicht ich sie es ein eine zu den von mit auf für im dem auch wir aber oder wenn wird werden dass noch nur schon sich sind hat haben kann man bei nach aus über durch sehr wie was dies diese dieser alle".split(" "),
    fr: "le la les des une un et est pour dans que qui pas sur avec plus par ce cette nous vous ils elle au aux du en ne se sont mais ou comme tout tous faire fait bien peut tres être sans leur notre votre".split(" "),
    es: "el la los las una uno de que en por para con no se es un su lo como mas pero sus le ya este esta esto todo tambien hay son han sido muy sin sobre entre cuando donde nuestro".split(" "),
    it: "il lo la gli le di che e un una per non con sono come anche alla dei delle nel della ma piu questo questa sono essere fare hanno stato molto senza tra quando dove nostro vostro".split(" "),
    nl: "de het een en van is dat in te niet op voor met zijn aan er maar ook als om door dit deze worden wordt heeft hebben kan naar bij over wat hoe wanneer waar onze jullie nog wel".split(" "),
    pt: "de que nao uma para com dos das por mais como mas foi ele sua ou ser quando muito nos ja esta seu pela ate isso entre depois sem mesmo aos seus quem nas".split(" "),
    da: "og det er en til at den de for med han af ikke der var som men om vi har kan skal vil fra ved eller nar hvor hvad denne dette deres".split(" "),
    sv: "och det ar en till att den de for med han av inte som men om vi har kan ska vill fran vid eller nar var vad denna detta deras".split(" "),
    pl: "nie to jest sie na w z do co jak ale ten ta te tego dla po tylko juz czy bardzo jeszcze przez przy oraz gdy gdzie kiedy nasz wasz".split(" ")
  };
  var WORD_SETS = Object.fromEntries(
    Object.entries(STOP_WORDS).map(([code, words]) => [code, new Set(words)])
  );
  var SCRIPT_LANGUAGES = ["ja", "zh", "ko", "el", "th", "hy", "ka"];
  var DETECTABLE_LANGUAGES = [...Object.keys(STOP_WORDS), ...SCRIPT_LANGUAGES];
  var MAX_WORDS = 120;
  var MIN_WORDS = 8;
  function tokenize(text) {
    return String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/https?:\/\/\S+/g, " ").replace(/[^a-zß\s]/g, " ").split(/\s+/).filter(Boolean);
  }
  function countMatches(text, pattern) {
    return [...text.matchAll(pattern)].length;
  }
  var SCRIPT_MINIMUMS = {
    // Kana in any Japanese sentence (particles, endings), plus enough in all.
    jaKana: 3,
    jaTotal: 6,
    // Han without kana is Chinese or kanji-only Japanese; see detectScriptLanguage.
    han: 8
  };
  var SCRIPTS = [
    ["ko", new RegExp("\\p{Script=Hangul}", "gu"), 6],
    ["th", new RegExp("\\p{Script=Thai}", "gu"), 15],
    ["el", new RegExp("\\p{Script=Greek}", "gu"), 20],
    ["hy", new RegExp("\\p{Script=Armenian}", "gu"), 20],
    ["ka", new RegExp("\\p{Script=Georgian}", "gu"), 20]
  ];
  function detectScriptLanguage(text) {
    const letters = countMatches(text, new RegExp("\\p{L}", "gu"));
    if (letters === 0) return null;
    const kana = countMatches(text, new RegExp("\\p{Script=Hiragana}|\\p{Script=Katakana}", "gu"));
    const han = countMatches(text, new RegExp("\\p{Script=Han}", "gu"));
    if (kana >= SCRIPT_MINIMUMS.jaKana && kana + han >= SCRIPT_MINIMUMS.jaTotal) {
      return { language: "ja", confidence: 0.95, words: kana + han };
    }
    if (han >= SCRIPT_MINIMUMS.han) {
      return { language: "zh", confidence: han / letters >= 0.5 ? 0.7 : 0.45, words: han, ambiguous: true };
    }
    for (const [language, pattern, minimum] of SCRIPTS) {
      const count = countMatches(text, pattern);
      if (count >= minimum) return { language, confidence: 0.95, words: count };
    }
    return null;
  }
  function detectLanguage(text) {
    const scriptResult = detectScriptLanguage(String(text ?? ""));
    if (scriptResult) return scriptResult;
    const words = tokenize(text).slice(0, MAX_WORDS);
    if (words.length < MIN_WORDS) {
      return { language: null, confidence: 0, words: words.length };
    }
    const scores = {};
    let hits = 0;
    for (const word of words) {
      for (const [code, set] of Object.entries(WORD_SETS)) {
        if (set.has(word)) {
          scores[code] = (scores[code] ?? 0) + 1;
          hits += 1;
        }
      }
    }
    if (hits === 0) {
      return { language: null, confidence: 0, words: words.length };
    }
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [language, topScore] = ranked[0];
    const runnerUp = ranked[1]?.[1] ?? 0;
    const margin = (topScore - runnerUp) / topScore;
    const density = Math.min(1, topScore / Math.max(1, words.length * 0.18));
    const confidence = Number((margin * 0.5 + density * 0.5).toFixed(3));
    return { language, confidence, words: words.length };
  }

  // src/core/settings.js
  var STORAGE_KEY = "settings";
  var GROUPS = [
    { id: "expand", title: "Thread expansion" },
    { id: "translate", title: "Translation controls" },
    { id: "quiet", title: "Post chrome" },
    { id: "reading", title: "Reading" },
    { id: "declutter", title: "Clutter" },
    { id: "highlight", title: "Highlighting" },
    { id: "copy", title: "Copying" },
    { id: "shortcuts", title: "Keyboard" },
    { id: "general", title: "General" },
    { id: "advanced", title: "Advanced" }
  ];
  var languageOptions = AVAILABLE_LANGUAGES.map((code) => ({
    value: code,
    label: LANGUAGE_NAMES[code]
  }));
  function endonym(code) {
    try {
      const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
      if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
    } catch {
    }
    return code.toUpperCase();
  }
  var detectableOptions = DETECTABLE_LANGUAGES.map((code) => ({
    value: code,
    label: LANGUAGE_NAMES[code] ?? endonym(code)
  }));
  var SCHEMA = [
    // -- Thread expansion ----------------------------------------------------
    {
      key: "expand.enabled",
      type: "boolean",
      default: true,
      label: "Expand threads automatically",
      help: 'Click reply counters and "show more replies" controls as they appear.'
    },
    {
      key: "expand.scope",
      type: "select",
      default: "everywhere",
      label: "Where to expand",
      options: [
        { value: "everywhere", label: "Feed and single threads" },
        { value: "thread", label: "Single threads only" }
      ],
      help: "Restricting to single threads keeps the main feed short."
    },
    {
      key: "expand.overview",
      type: "boolean",
      default: false,
      label: "Overview: keep feeds compact",
      help: "For skimming. On a feed nothing opens by itself — neither replies nor long posts — so you see many posts at a glance; o opens the one you are on. A single conversation still opens as usual, and translation is unaffected. Press v to switch."
    },
    {
      key: "expand.truncatedText",
      type: "boolean",
      default: true,
      label: "Expand truncated post text",
      help: 'Also open "See more" inside a post body — each post once it has been on screen for a moment, so a long feed is not unfolded in the background. The o key and copying open every post they cover at once.'
    },
    {
      key: "expand.maxClicksPerScan",
      type: "number",
      default: 40,
      min: 1,
      max: 500,
      label: "Max clicks per pass"
    },
    {
      key: "expand.maxTotalClicks",
      type: "number",
      default: 1500,
      min: 10,
      max: 1e5,
      label: "Max clicks per page visit",
      help: "Safety limit against runaway clicking. Resets on navigation."
    },
    {
      key: "expand.scanDelayMs",
      type: "number",
      default: 150,
      min: 0,
      max: 5e3,
      step: 50,
      label: "Scan delay (ms)"
    },
    {
      key: "expand.settleDelayMs",
      type: "number",
      default: 800,
      min: 100,
      max: 1e4,
      step: 100,
      label: "Settle delay after clicks (ms)",
      help: "How long to let Engage re-render before the next pass."
    },
    {
      key: "expand.heartbeatMs",
      type: "number",
      default: 1e3,
      min: 0,
      max: 3e4,
      step: 250,
      label: "Heartbeat interval (ms)",
      help: "Backup scan for content the mutation observer misses. 0 disables it."
    },
    // -- Translation controls ------------------------------------------------
    {
      key: "translate.mode",
      type: "select",
      default: "compact",
      label: '"Show translation" control',
      options: [
        { value: "compact", label: "Compact icon" },
        { value: "known", label: "Hide when I read the language" },
        { value: "hide", label: "Always hide" },
        { value: "off", label: "Leave unchanged" }
      ],
      help: "Compact replaces the full label with a small globe that expands on hover or focus."
    },
    {
      key: "translate.knownLanguages",
      type: "multiselect",
      default: ["en", "de"],
      label: "Languages I read",
      options: detectableOptions,
      help: "Used by hiding and automatic translation. Latin-script languages use stop words; Japanese, Chinese, Korean, Greek, Thai, Armenian, and Georgian are recognised by their script, which wins over any English the post quotes. Han text can be ambiguous between Japanese and Chinese."
    },
    {
      key: "translate.minConfidence",
      type: "number",
      default: 0.55,
      min: 0,
      max: 1,
      step: 0.05,
      label: "Minimum detection confidence",
      help: "Below this the control is only compacted, never hidden, and the post is never translated automatically."
    },
    {
      key: "translate.autoWhenVisible",
      type: "boolean",
      default: false,
      label: "Automatic translation",
      help: "Uses Engage’s own translation, once per post, when a post in a language you do not read has been on screen for half a second. Posts you scroll past or never reach are not translated. Posts too short to judge are left alone, and so is Han-only text if you read Japanese or Chinese. “Show original” always takes you back. Press t to switch it; pausing expansion switches it off."
    },
    // -- Post chrome ---------------------------------------------------------
    {
      key: "quiet.actions",
      type: "select",
      default: "off",
      label: "Like / Comment / Share bar",
      options: [
        {
          value: "off",
          label: "Always visible",
          gain: "nothing is hidden, nothing to learn",
          cost: "a row of buttons under every post"
        },
        {
          value: "dim",
          label: "Fade out until hovered",
          gain: "nothing ever moves, nothing is ever covered",
          cost: "the row still takes its space"
        },
        {
          value: "collapse",
          label: "Collapse until hovered",
          gain: "wins the row back",
          cost: "the post grows as you point at it, shifting the page"
        },
        {
          value: "cluster",
          label: "Corner cluster on hover",
          gain: "wins the row back and nothing ever moves",
          cost: "covers a corner of the post while it shows"
        },
        {
          value: "cluster-focus",
          label: "Corner cluster, keyboard only",
          gain: "wins the row back; a mouse never summons it at all",
          cost: "reachable only by tabbing into the post"
        },
        {
          value: "edge",
          label: "Full-width bar at the bottom edge",
          gain: "wins the row back; the familiar bar, only when asked for",
          cost: "the last line is hard to select, and a touch can hit it unseen"
        }
      ],
      help: "Every mode keeps the buttons reachable by keyboard. They trade three things against one another: whether the row’s space is won back, whether anything moves as you point at a post, and how much of the post is covered while the actions show."
    },
    {
      key: "quiet.composer",
      type: "boolean",
      default: false,
      label: "Hide inline comment and reply boxes",
      help: 'Hides the "Write a comment" and "Write a reply" boxes. Hovering the post or tabbing into the box brings it back.'
    },
    // -- Reading -------------------------------------------------------------
    {
      key: "reading.enabled",
      type: "boolean",
      default: false,
      label: "Reading mode",
      help: "One switch for a quiet page: the action bar becomes a corner cluster, comment boxes and copy buttons stay out of sight, translate controls shrink to an icon, promoted cards go, and so does the app bar. Your own settings below are kept and come back when it is off. Press r to switch it."
    },
    {
      // Named for keeping rather than hiding so its default is the one the
      // preset wants for everybody: a stored "hide the banner: false" written
      // by an older version would otherwise have kept the bar for anyone who
      // had ever changed any setting.
      key: "reading.keepBanner",
      type: "boolean",
      default: false,
      label: "Keep the app bar in reading mode",
      help: "Reading mode hides the sticky bar at the top. Search, the app launcher and the account menu go with it; keep it if you need those while reading."
    },
    // -- Clutter -------------------------------------------------------------
    {
      key: "declutter.enabled",
      type: "boolean",
      default: false,
      label: "Hide suggested and promoted content",
      help: "Hides feed cards labelled as sponsored, promoted or suggested."
    },
    // -- Highlighting --------------------------------------------------------
    {
      key: "highlight.unanswered",
      type: "boolean",
      default: true,
      label: "Mark posts with no replies"
    },
    {
      key: "highlight.unread",
      type: "boolean",
      default: true,
      label: "Mark posts seen for the first time",
      help: "Remembers post identities locally so returning to a feed shows what is new."
    },
    // -- Copying -------------------------------------------------------------
    {
      key: "copy.format",
      type: "select",
      default: "markdown",
      label: "Copy format",
      options: [
        { value: "markdown", label: "Markdown" },
        { value: "text", label: "Plain text" }
      ]
    },
    {
      key: "copy.includePermalink",
      type: "boolean",
      default: true,
      label: "Include the thread link"
    },
    {
      key: "copy.includeTimestamps",
      type: "boolean",
      default: true,
      label: "Include timestamps"
    },
    {
      key: "copy.includeOriginal",
      type: "boolean",
      default: false,
      label: "Include the original under translated posts",
      help: "Copied translations are always marked as such. With this on, the text as its author wrote it follows, so whoever reads the copy can check the translation. Doubles the length of those posts."
    },
    {
      key: "copy.showButtons",
      type: "select",
      default: "hover",
      label: "Copy buttons on posts",
      options: [
        {
          value: "hover",
          label: "Show when I point at a post",
          gain: "the only visible sign that copying exists",
          cost: "one more thing moving as you read"
        },
        {
          value: "focus",
          label: "Show only when I tab into a post",
          gain: "nothing appears while reading with a mouse",
          cost: "invisible unless you use the keyboard"
        },
        {
          value: "off",
          label: "Never — use the keyboard",
          gain: "nothing is added to a post at all",
          cost: "copying is only c, y and the manager’s menu"
        }
      ],
      help: "These buttons are this script’s own addition — Engage has nothing like them. c copies the focused thread and y copies a link to it whichever setting you pick, so turning them off loses no ability, only the reminder that it is there."
    },
    {
      key: "copy.chipCorner",
      type: "select",
      default: "top-right",
      label: "Where the copy buttons sit",
      options: [
        {
          value: "top-right",
          label: "Top right",
          gain: "out of the way of the post body",
          cost: "shares the corner Engage puts reactions in"
        },
        {
          value: "top-left",
          label: "Top left",
          gain: "clear of the reactions and of the action bar",
          cost: "sits near the author name and avatar"
        },
        {
          value: "bottom-left",
          label: "Bottom left",
          gain: "clear of reactions, author and the corner cluster",
          cost: "closest to the post body, so it can cover the last line"
        },
        {
          value: "bottom-right",
          label: "Bottom right",
          gain: "furthest from everything Engage draws at the top",
          cost: "collides with the action bar’s corner cluster, if you use it"
        }
      ],
      help: "Engage draws its own controls in the corners of a post — reactions in one, the action bar along the bottom — and which corner is free differs between tenants and layouts. Move the buttons to whichever one is clear for you."
    },
    // -- Keyboard ------------------------------------------------------------
    {
      key: "shortcuts.enabled",
      type: "boolean",
      default: true,
      label: "Keyboard shortcuts",
      help: "Press ? on an Engage page for the list."
    },
    // -- General -------------------------------------------------------------
    {
      key: "general.showPanel",
      type: "boolean",
      default: true,
      label: "Show the status panel"
    },
    {
      key: "general.languages",
      type: "multiselect",
      default: [],
      label: "Additional interface languages",
      options: languageOptions,
      help: "Threadcalm reads your Engage language from the page and uses its labels automatically. Add a language here only if your page mixes several, or if controls are not found."
    },
    {
      key: "general.debug",
      type: "boolean",
      default: false,
      label: "Verbose console logging"
    },
    // -- Advanced ------------------------------------------------------------
    {
      key: "advanced.replyIconSignatures",
      type: "lines",
      default: ["M7.35 3.65c.2.2"],
      label: "Reply icon signatures",
      help: "The start of the SVG path data for Engage's reply arrow, one per line. This is what finds reply counters in interface languages with no label pack. Clearing it falls back to matching labels only."
    },
    {
      key: "advanced.extraExpandReplies",
      type: "lines",
      default: [],
      label: "Extra reply-expansion patterns",
      help: "One regular expression per line, matched case-insensitively against control labels."
    },
    {
      key: "advanced.extraExpandText",
      type: "lines",
      default: [],
      label: 'Extra "see more" patterns'
    },
    {
      key: "advanced.extraPromoted",
      type: "lines",
      default: [],
      label: "Extra promoted/suggested patterns"
    }
  ];
  var BY_KEY = new Map(SCHEMA.map((definition) => [definition.key, definition]));
  function defaults() {
    const result = {};
    for (const definition of SCHEMA) {
      result[definition.key] = Array.isArray(definition.default) ? [...definition.default] : definition.default;
    }
    return result;
  }
  function migrate(key, value) {
    if (key === "copy.showButtons" && typeof value === "boolean") {
      return value ? "hover" : "off";
    }
    return value;
  }
  function coerce(definition, value) {
    const fallback = Array.isArray(definition.default) ? [...definition.default] : definition.default;
    if (value == null) return fallback;
    switch (definition.type) {
      case "boolean":
        return Boolean(value);
      case "number": {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        const min = definition.min ?? Number.NEGATIVE_INFINITY;
        const max = definition.max ?? Number.POSITIVE_INFINITY;
        return Math.min(max, Math.max(min, parsed));
      }
      case "select": {
        const allowed = (definition.options ?? []).map((option) => option.value);
        return allowed.includes(value) ? value : fallback;
      }
      case "multiselect": {
        if (!Array.isArray(value)) return fallback;
        const allowed = new Set((definition.options ?? []).map((option) => option.value));
        const filtered = value.filter((item) => allowed.has(item));
        return filtered;
      }
      case "lines":
        if (!Array.isArray(value)) return fallback;
        return value.map((line) => String(line)).filter((line) => line.trim().length > 0);
      default:
        return value;
    }
  }
  var current = defaults();
  function load() {
    const stored = getValue(STORAGE_KEY, null);
    const next = defaults();
    if (stored && typeof stored === "object") {
      for (const [key, value] of Object.entries(stored)) {
        const definition = BY_KEY.get(key);
        if (definition) next[key] = coerce(definition, migrate(key, value));
      }
    }
    current = next;
    setDebug(current["general.debug"]);
    return current;
  }
  var overrides = {};
  function get(key) {
    if (!BY_KEY.has(key)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    return Object.hasOwn(overrides, key) ? overrides[key] : current[key];
  }
  function getOwn(key) {
    if (!BY_KEY.has(key)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    return current[key];
  }
  function isOverridden(key) {
    return Object.hasOwn(overrides, key);
  }
  function setOverrides(next) {
    const coerced = {};
    for (const [key, value] of Object.entries(next ?? {})) {
      const definition = BY_KEY.get(key);
      if (definition) coerced[key] = coerce(definition, value);
    }
    const touched = /* @__PURE__ */ new Set([...Object.keys(overrides), ...Object.keys(coerced)]);
    const before = {};
    for (const key of touched) before[key] = get(key);
    overrides = coerced;
    const changed = {};
    for (const key of touched) {
      const after = get(key);
      if (JSON.stringify(after) !== JSON.stringify(before[key])) changed[key] = after;
    }
    if (Object.keys(changed).length > 0) {
      bus.emit(EVENTS.SETTINGS_CHANGED, { changed, settings: current });
    }
    return changed;
  }
  function update(changes) {
    const applied = {};
    for (const [key, value] of Object.entries(changes)) {
      const definition = BY_KEY.get(key);
      if (!definition) continue;
      const coerced = coerce(definition, value);
      if (JSON.stringify(coerced) === JSON.stringify(current[key])) continue;
      current[key] = coerced;
      applied[key] = coerced;
    }
    if (Object.keys(applied).length === 0) return applied;
    setValue(STORAGE_KEY, current);
    if ("general.debug" in applied) setDebug(applied["general.debug"]);
    bus.emit(EVENTS.SETTINGS_CHANGED, { changed: applied, settings: current });
    return applied;
  }
  function reset() {
    current = defaults();
    deleteValue(STORAGE_KEY);
    setDebug(current["general.debug"]);
    bus.emit(EVENTS.SETTINGS_CHANGED, { changed: current, settings: current });
    return current;
  }
  function definitionsFor(groupId) {
    return SCHEMA.filter((definition) => definition.key.startsWith(`${groupId}.`));
  }
  function customPatterns() {
    return {
      expandReplies: current["advanced.extraExpandReplies"],
      expandText: current["advanced.extraExpandText"],
      promoted: current["advanced.extraPromoted"]
    };
  }

  // src/core/spa.js
  var started = false;
  var lastUrl = "";
  var OWN_UI_SELECTOR = "#tc-panel, #tc-toasts, #tc-settings, #tc-help";
  var OWN_NODE_SELECTOR = `${OWN_UI_SELECTOR}, .tc-chip`;
  function elementOf(node2) {
    if (!node2) return null;
    return node2.nodeType === 1 ? node2 : node2.parentElement;
  }
  function isOwnNode(node2) {
    const element = elementOf(node2);
    return Boolean(element?.closest?.(OWN_NODE_SELECTOR));
  }
  function isOwnMutation(record) {
    if (elementOf(record.target)?.closest?.(OWN_UI_SELECTOR)) return true;
    if (record.type !== "childList") return false;
    const touched = [...record.addedNodes, ...record.removedNodes];
    return touched.length > 0 && touched.every(isOwnNode);
  }
  function patchHistoryMethod(name, onCall) {
    const original = history[name];
    if (typeof original !== "function" || original.__threadcalmPatched) return;
    const patched = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      try {
        onCall();
      } catch (error) {
        log.error("history patch failed", error);
      }
      return result;
    };
    patched.__threadcalmPatched = true;
    history[name] = patched;
  }
  function startSpaWatcher({ domDebounceMs = 250, urlPollMs = 1e3 } = {}) {
    if (started) return () => {
    };
    started = true;
    lastUrl = location.href;
    const announceNavigation = () => {
      const url = location.href;
      if (url === lastUrl) return;
      const previous = lastUrl;
      lastUrl = url;
      log.debug("navigated", previous, "->", url);
      bus.emit(EVENTS.NAVIGATE, { url, previousUrl: previous });
    };
    patchHistoryMethod("pushState", announceNavigation);
    patchHistoryMethod("replaceState", announceNavigation);
    window.addEventListener("popstate", announceNavigation);
    window.addEventListener("hashchange", announceNavigation);
    const poll = setInterval(announceNavigation, urlPollMs);
    const announceDomChange = debounce(() => bus.emit(EVENTS.DOM_CHANGED), domDebounceMs);
    const observer = new MutationObserver((records) => {
      announceNavigation();
      if (records.some((record) => !isOwnMutation(record))) announceDomChange();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      started = false;
      clearInterval(poll);
      observer.disconnect();
      announceDomChange.cancel();
      window.removeEventListener("popstate", announceNavigation);
      window.removeEventListener("hashchange", announceNavigation);
    };
  }
  function isThreadView(url = location.href) {
    return /\/(?:threads?|conversations?)\/|[?&]threadId=/i.test(url);
  }

  // src/ui/icons.js
  var SVG = "http://www.w3.org/2000/svg";
  var ICONS = {
    pause: [
      ["path", { d: "M6 4v8M10 4v8" }]
    ],
    play: [
      ["path", { d: "M5.5 3.8v8.4L12 8z", fill: "currentColor" }]
    ],
    settings: [
      ["path", { d: "M2.5 5h7M12.5 5h1M2.5 11h1.5M7 11h6.5" }],
      ["circle", { cx: "11", cy: "5", r: "1.6" }],
      ["circle", { cx: "5.5", cy: "11", r: "1.6" }]
    ],
    help: [
      ["circle", { cx: "8", cy: "8", r: "6" }],
      ["path", { d: "M6.4 6.3a1.7 1.7 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.2" }],
      ["circle", { cx: "8", cy: "11.1", r: ".55", fill: "currentColor", stroke: "none" }]
    ],
    close: [
      ["path", { d: "M4.5 4.5l7 7M11.5 4.5l-7 7" }]
    ],
    copy: [
      ["rect", { x: "5.5", y: "5.5", width: "7.5", height: "7.5", rx: "1.6" }],
      ["path", { d: "M3 10.5V4.6A1.6 1.6 0 0 1 4.6 3h5.9" }]
    ],
    link: [
      ["path", { d: "M6.8 9.2l2.4-2.4" }],
      ["path", { d: "M7.6 4.6l.8-.8a2.6 2.6 0 0 1 3.7 3.7l-.8.8" }],
      ["path", { d: "M8.4 11.4l-.8.8a2.6 2.6 0 0 1-3.7-3.7l.8-.8" }]
    ]
  };
  function node(tag, attributes) {
    const element = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }
  function icon(name) {
    const svg = node("svg", {
      viewBox: "0 0 16 16",
      width: "16",
      height: "16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
      class: "tc-icon"
    });
    for (const [tag, attributes] of ICONS[name] ?? []) svg.append(node(tag, attributes));
    return svg;
  }
  function brandMark() {
    const svg = node("svg", {
      viewBox: "0 0 40 40",
      width: "16",
      height: "16",
      "aria-hidden": "true",
      focusable: "false",
      class: "tc-mark"
    });
    svg.append(node("rect", { width: "40", height: "40", rx: "10", fill: "#2f6f68" }));
    const bars = node("g", {
      transform: "translate(4 4)",
      fill: "none",
      stroke: "#fff",
      "stroke-width": "2.4",
      "stroke-linecap": "round"
    });
    for (const d of ["M5 8h22", "M11 16h16", "M17 24h10"]) bars.append(node("path", { d }));
    svg.append(bars);
    return svg;
  }

  // src/features/thread.js
  var ACTION_LABELS = [
    "like",
    "liked",
    "reply",
    "replies",
    "share",
    "shared",
    "more",
    "follow",
    "following",
    "bookmark",
    "save",
    "saved",
    "seen by",
    "all replies",
    "gefällt mir",
    "antworten",
    "teilen",
    "folgen",
    "mehr",
    "gesehen von",
    "j’aime",
    "répondre",
    "partager",
    "suivre",
    "me gusta",
    "responder",
    "compartir",
    "seguir"
  ];
  var ACTION_SET = new Set(ACTION_LABELS);
  var COUNTER_LINE = /^\d+(?:[.,]\d+)?\s*(?:k|m)?\s*(?:likes?|reactions?|views?|seen)?$/i;
  var RELATIVE_TIME = /^(?:just now|\d+\s*(?:s|m|h|d|w|mo|y)\b.*|vor\s+.*|il y a\s+.*|hace\s+.*)$/i;
  var INITIALS = new RegExp("^\\p{Lu}{1,3}$", "u");
  function initialsOf(name) {
    return name.split(/\s+/).map((part) => part.charAt(0)).join("").toLocaleUpperCase();
  }
  var PROFILE_LINK_SELECTOR = 'a[href*="/users/"], a[href*="/people/"], a[href*="userId="], a[data-testid*="author" i]';
  function extractAuthor(article) {
    for (const link of article.querySelectorAll(PROFILE_LINK_SELECTOR)) {
      const candidates = [
        visibleText(link),
        link.getAttribute("aria-label"),
        link.getAttribute("title")
      ];
      for (const candidate of candidates) {
        const name = normalizeText(candidate);
        if (name && name.length < 80 && !INITIALS.test(name)) return name;
      }
    }
    const action = article.querySelector(
      'button[aria-label^="Like -"], button[aria-label^="Comment -"], button[aria-label^="Reply -"], button[aria-label^="Share -"]'
    );
    if (action) {
      const match = /^\w+\s+-\s*(.+?)(?:’|')s\s+(?:post|comment)/i.exec(
        action.getAttribute("aria-label") ?? ""
      );
      if (match && match[1].length < 80) return normalizeText(match[1]);
    }
    const heading = article.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    if (heading) {
      const name = normalizeText(visibleText(heading).split("\n")[0]);
      if (name && name.length < 80) return name;
    }
    const firstLine = normalizeText(visibleText(article)).split(" • ")[0];
    return firstLine.slice(0, 80) || "Unknown author";
  }
  function extractTimestamp(article) {
    const time = article.querySelector("time[datetime]");
    if (time) {
      const iso = time.getAttribute("datetime");
      return { iso, display: normalizeText(visibleText(time)) || iso };
    }
    const titled = article.querySelector("[title]");
    if (titled) {
      const title = titled.getAttribute("title");
      const parsed = Date.parse(title);
      if (!Number.isNaN(parsed)) {
        return { iso: new Date(parsed).toISOString(), display: normalizeText(title) };
      }
    }
    for (const node2 of article.querySelectorAll("a, span")) {
      const text = normalizeText(visibleText(node2));
      if (text && text.length <= 24 && RELATIVE_TIME.test(text)) {
        return { iso: null, display: text };
      }
    }
    return { iso: null, display: "" };
  }
  function extractPermalink(article) {
    const link = article.querySelector(
      'a[href*="/threads/"], a[href*="threadId="], a[href*="/messages/"], a[href*="messageId="]'
    );
    if (!link) return null;
    try {
      return new URL(link.getAttribute("href"), location.origin).toString();
    } catch {
      return null;
    }
  }
  function extractBody(article) {
    const clone = article.cloneNode(true);
    const strip = [
      POST_SELECTOR,
      // nested replies, handled separately
      ACTION_ROW_SELECTOR,
      // the whole Like/Comment/Share row in one go
      "button",
      '[role="button"]',
      '[role="toolbar"]',
      '[role="menu"]',
      '[role="menubar"]',
      "nav",
      "time",
      '[aria-hidden="true"]'
    ];
    for (const selector of strip) {
      for (const node2 of clone.querySelectorAll(selector)) node2.remove();
    }
    const lines = visibleText(clone).split("\n").map((line) => normalizeText(line)).filter(Boolean);
    const kept = lines.filter((line) => {
      const lower = line.toLowerCase();
      if (ACTION_SET.has(lower)) return false;
      if (COUNTER_LINE.test(line)) return false;
      if (RELATIVE_TIME.test(line) && line.length <= 24) return false;
      return true;
    });
    const author = extractAuthor(article);
    const header = /* @__PURE__ */ new Set([author, initialsOf(author)]);
    let dropped = 0;
    while (kept.length > 0 && dropped < 2 && header.has(kept[0])) {
      kept.shift();
      dropped += 1;
    }
    return kept.join("\n");
  }
  function directReplies(article) {
    const nested = [...article.querySelectorAll(POST_SELECTOR)].filter(isVisible);
    return nested.filter(
      (candidate) => !nested.some((other) => other !== candidate && other.contains(candidate))
    );
  }
  function extractPost(article, depth = 0, options = {}) {
    if (!(article instanceof HTMLElement) || depth > 6) return null;
    const replies = directReplies(article).map((reply) => extractPost(reply, depth + 1, options)).filter(Boolean);
    const post = {
      author: extractAuthor(article),
      body: extractBody(article),
      timestamp: extractTimestamp(article),
      permalink: extractPermalink(article),
      translation: options.annotate?.(article) ?? null,
      replies
    };
    if (!post.body && replies.length === 0) return null;
    return post;
  }
  var INDENT_TOLERANCE = 2;
  function threadMembers(post) {
    if (!(post instanceof HTMLElement)) return null;
    const all = allPosts();
    const index = all.findIndex(
      (candidate) => candidate === post || candidate.contains(post) || post.contains(candidate)
    );
    if (index < 0) return null;
    const isStarter = (candidate) => candidate.matches(STARTER_SELECTOR);
    let start = index;
    while (start >= 0 && !isStarter(all[start])) start -= 1;
    if (start < 0) return null;
    let end = start + 1;
    while (end < all.length && !isStarter(all[end])) end += 1;
    const members = all.slice(start, end);
    const starter = members[0];
    if (members.length > 1 && members.slice(1).every((member) => starter.contains(member))) {
      return null;
    }
    return members;
  }
  function extractThread(members, options = {}) {
    if (!members?.length) return null;
    const [starter, ...rest] = members;
    const root = extractPost(starter, 0, options) ?? {
      author: extractAuthor(starter),
      body: "",
      timestamp: extractTimestamp(starter),
      permalink: extractPermalink(starter),
      translation: null,
      replies: []
    };
    const stack = [{ node: root, left: starter.getBoundingClientRect().left }];
    for (const member of rest) {
      const node2 = extractPost(member, 0, options);
      if (!node2) continue;
      const { left } = member.getBoundingClientRect();
      while (stack.length > 1 && stack[stack.length - 1].left >= left - INDENT_TOLERANCE) {
        stack.pop();
      }
      stack[stack.length - 1].node.replies.push(node2);
      stack.push({ node: node2, left });
    }
    return root;
  }
  function threadScope(members) {
    if (!members?.length) return null;
    const last = members[members.length - 1];
    let node2 = members[0];
    while (node2 && !node2.contains(last)) node2 = node2.parentElement;
    return node2;
  }
  function countPosts(post) {
    if (!post) return 0;
    return 1 + post.replies.reduce((sum, reply) => sum + countPosts(reply), 0);
  }
  function renderThread(post, options = {}) {
    const {
      format = "markdown",
      includeTimestamps = true,
      includePermalink = true,
      includeOriginal = false,
      sourceUrl = location.href
    } = options;
    const lines = [];
    const translatedNote = ({ from }) => from ? `Translated from ${from} by Engage` : "Translated by Engage";
    const stamp = (entry) => {
      if (!includeTimestamps) return "";
      const { iso, display } = entry.timestamp;
      const shown = iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) : display;
      return shown ? ` — ${shown}` : "";
    };
    if (format === "markdown") {
      const translation = (entry, prefix) => {
        if (!entry.translation) return;
        lines.push(`${prefix}*${translatedNote(entry.translation)}.*`, prefix.trimEnd());
        if (!includeOriginal) return;
        if (!entry.translation.original) {
          lines.push(`${prefix}*The original was not captured.*`, prefix.trimEnd());
          return;
        }
        lines.push(`${prefix}*Original:*`, prefix.trimEnd());
        for (const line of entry.translation.original.split("\n")) lines.push(`${prefix}${line}`);
        lines.push(prefix.trimEnd());
      };
      lines.push(`## ${post.author}${stamp(post)}`, "");
      if (post.body) lines.push(post.body, "");
      translation(post, "");
      const walk = (entry, depth) => {
        const prefix = "> ".repeat(depth);
        lines.push(`${prefix}**${entry.author}**${stamp(entry)}`);
        lines.push(prefix.trimEnd());
        for (const line of entry.body.split("\n")) {
          lines.push(`${prefix}${line}`);
        }
        lines.push(prefix.trimEnd());
        translation(entry, prefix);
        for (const child of entry.replies) walk(child, depth + 1);
      };
      for (const reply of post.replies) walk(reply, 1);
      if (includePermalink) {
        const url = post.permalink ?? sourceUrl;
        lines.push("", `[Open in Viva Engage](${url})`);
      }
    } else {
      const translation = (entry, indent) => {
        if (!entry.translation) return;
        lines.push(`${indent}[${translatedNote(entry.translation)}]`);
        if (!includeOriginal) return;
        if (!entry.translation.original) {
          lines.push(`${indent}[The original was not captured]`);
          return;
        }
        lines.push(`${indent}Original:`);
        for (const line of entry.translation.original.split("\n")) lines.push(`${indent}${line}`);
      };
      lines.push(`${post.author}${stamp(post)}`, "");
      if (post.body) lines.push(post.body, "");
      if (post.translation) {
        translation(post, "");
        lines.push("");
      }
      const walk = (entry, depth) => {
        const indent = "    ".repeat(depth);
        lines.push(`${indent}${entry.author}${stamp(entry)}`);
        for (const line of entry.body.split("\n")) {
          lines.push(`${indent}  ${line}`);
        }
        translation(entry, `${indent}  `);
        lines.push("");
        for (const child of entry.replies) walk(child, depth + 1);
      };
      for (const reply of post.replies) walk(reply, 1);
      if (includePermalink) {
        lines.push(post.permalink ?? sourceUrl);
      }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function postIdentity(article) {
    const permalink = extractPermalink(article);
    if (permalink) {
      const match = permalink.match(/(?:threads?|messages)\/([\w-]+)/i);
      if (match) return `id:${match[1]}`;
      return `url:${permalink}`;
    }
    const author = extractAuthor(article);
    const { iso, display } = extractTimestamp(article);
    const body = normalizeText(visibleText(article)).slice(0, 120);
    return `h:${hash(`${author}|${iso ?? display}|${body}`)}`;
  }
  function hash(input) {
    let value = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      value ^= input.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(36);
  }

  // src/features/copy.js
  var CHIP_CLASS = "tc-chip";
  var PROGRESS_KEY = "copy-translate";
  var HOST_CLASS = "tc-post";
  var REVEAL_CLASSES = {
    hover: "tc-chip-hover",
    focus: "tc-chip-focus"
  };
  var CORNER_CLASSES = {
    "top-right": "tc-chip-top-right",
    "top-left": "tc-chip-top-left",
    "bottom-left": "tc-chip-bottom-left",
    "bottom-right": "tc-chip-bottom-right"
  };
  function createCopyTools({ expander, translate = null }) {
    const decorated = /* @__PURE__ */ new WeakMap();
    function toast(message, tone = "info", key = null) {
      bus.emit(EVENTS.TOAST, { message, tone, key });
    }
    function renderOptions() {
      return {
        format: get("copy.format"),
        includeTimestamps: get("copy.includeTimestamps"),
        includePermalink: get("copy.includePermalink"),
        includeOriginal: get("copy.includeOriginal")
      };
    }
    async function translateFirst(members, article) {
      if (!translate) return false;
      const posts = members ?? allPosts().filter((post) => article.contains(post));
      const result = await translate.translateForCopy(posts, {
        onProgress: (done, total) => toast(`Translating ${done} of ${total}…`, "info", PROGRESS_KEY)
      });
      if (result.stopped) {
        toast("Translation stopped; copying what is there", "info", PROGRESS_KEY);
      } else if (result.skipped > 0) {
        toast(`Translated ${result.eligible - result.skipped}; ${result.skipped} more copied as written`, "info", PROGRESS_KEY);
      }
      return result.eligible > 0;
    }
    async function copyThread(article, { expandFirst = true } = {}) {
      if (!article) {
        toast("No post found to copy", "warn");
        return false;
      }
      let members = threadMembers(article);
      if (expandFirst && expander) {
        const clicks = expander.expandWithin(members ? threadScope(members) : article);
        if (clicks > 0) {
          toast(`Expanding ${clicks} more section${clicks === 1 ? "" : "s"}…`);
          await new Promise(
            (resolve) => setTimeout(resolve, get("expand.settleDelayMs"))
          );
          if (members) members = threadMembers(members[0]) ?? members;
        }
      }
      if (await translateFirst(members, article) && members) {
        members = threadMembers(members[0]) ?? members;
      }
      const options = { annotate: (element) => translate?.translationOf(element) ?? null };
      const post = members ? extractThread(members, options) : extractPost(article, 0, options);
      if (!post) {
        toast("Could not read this post", "warn");
        return false;
      }
      const text = renderThread(post, renderOptions());
      const copied = await copyToClipboard(text);
      const total = countPosts(post);
      if (copied) {
        toast(`Copied ${total} post${total === 1 ? "" : "s"} as ${get("copy.format")}`);
      } else {
        toast("Clipboard was blocked by the browser", "warn");
        log.warn("clipboard write failed; transcript follows", text);
      }
      return copied;
    }
    async function copyLink(article) {
      const source = threadMembers(article)?.[0] ?? article;
      const post = source ? extractPost(source) : null;
      const url = post?.permalink ?? location.href;
      const copied = await copyToClipboard(url);
      toast(copied ? "Link copied" : "Clipboard was blocked by the browser", copied ? "info" : "warn");
      return copied;
    }
    function buildChip(article) {
      return el(
        "div",
        { className: CHIP_CLASS, role: "group", "aria-label": "Threadcalm post actions" },
        el(
          "button",
          {
            type: "button",
            className: "tc-chip-btn",
            title: "Copy this thread (c)",
            "aria-label": "Copy this thread",
            on: {
              click: (event) => {
                event.preventDefault();
                event.stopPropagation();
                copyThread(article);
              }
            }
          },
          icon("copy")
        ),
        el(
          "button",
          {
            type: "button",
            className: "tc-chip-btn",
            title: "Copy a link to this thread (y)",
            "aria-label": "Copy a link to this thread",
            on: {
              click: (event) => {
                event.preventDefault();
                event.stopPropagation();
                copyLink(article);
              }
            }
          },
          icon("link")
        )
      );
    }
    function sweep() {
      if (get("copy.showButtons") === "off") return;
      for (const article of rootPosts()) {
        const existing = decorated.get(article);
        if (existing && existing.isConnected && article.contains(existing)) continue;
        const chip = buildChip(article);
        article.classList.add(HOST_CLASS);
        article.append(chip);
        decorated.set(article, chip);
      }
    }
    function applyCorner() {
      const chosen = CORNER_CLASSES[get("copy.chipCorner")];
      const root = document.documentElement;
      for (const className of Object.values(CORNER_CLASSES)) {
        root.classList.toggle(className, className === chosen);
      }
    }
    function applyReveal() {
      const chosen = REVEAL_CLASSES[get("copy.showButtons")];
      const root = document.documentElement;
      for (const className of Object.values(REVEAL_CLASSES)) {
        root.classList.toggle(className, className === chosen);
      }
    }
    function removeChips() {
      for (const className of [...Object.values(CORNER_CLASSES), ...Object.values(REVEAL_CLASSES)]) {
        document.documentElement.classList.remove(className);
      }
      for (const chip of document.querySelectorAll(`.${CHIP_CLASS}`)) chip.remove();
      for (const host of document.querySelectorAll(`.${HOST_CLASS}`)) {
        host.classList.remove(HOST_CLASS);
      }
    }
    const scheduleSweep = debounce(() => sweep(), 300);
    return {
      start() {
        applyCorner();
        applyReveal();
        sweep();
      },
      stop: removeChips,
      onDomChanged: scheduleSweep,
      onNavigate: scheduleSweep,
      onSettingsChanged() {
        if (get("copy.showButtons") === "off") {
          removeChips();
          return;
        }
        applyCorner();
        applyReveal();
        sweep();
      },
      copyThread,
      copyLink
    };
  }

  // src/features/declutter.js
  var HIDDEN_CLASS = "tc-decluttered";
  var MAX_LABEL_LENGTH = 40;
  function createDeclutterer({ matchers }) {
    let active = matchers;
    function sweep(root = document) {
      if (!get("declutter.enabled")) return 0;
      if (!active.promoted) return 0;
      let hidden = 0;
      for (const element of root.querySelectorAll("span, div, p, h1, h2, h3, h4, h5, h6")) {
        if (!(element instanceof HTMLElement)) continue;
        if (element.children.length > 0) continue;
        const texts = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH });
        if (!texts.some((text) => active.promoted.test(text))) continue;
        const card = closestPost(element) ?? element.closest('[role="listitem"], li, section');
        if (!card || card.classList.contains(HIDDEN_CLASS)) continue;
        card.classList.add(HIDDEN_CLASS);
        hidden += 1;
      }
      if (hidden > 0) log.debug(`decluttered ${hidden} card(s)`);
      return hidden;
    }
    function restore() {
      for (const element of document.querySelectorAll(`.${HIDDEN_CLASS}`)) {
        element.classList.remove(HIDDEN_CLASS);
      }
    }
    const scheduleSweep = debounce(() => sweep(), 250);
    return {
      start() {
        sweep();
      },
      stop: restore,
      onDomChanged: scheduleSweep,
      onNavigate: scheduleSweep,
      onSettingsChanged() {
        if (get("declutter.enabled")) sweep();
        else restore();
      },
      setMatchers(next) {
        active = next;
        scheduleSweep();
      },
      sweep
    };
  }

  // src/features/expand.js
  var CANDIDATE_SELECTOR = 'button, [role="button"], a, [tabindex="0"], span, div[role="link"]';
  var MAX_LABEL_LENGTH2 = 120;
  var LEADING_DIGIT = new RegExp("^\\p{Nd}", "u");
  var OPEN_DWELL_MS = 300;
  function createExpander({ matchers, IntersectionObserverImpl = globalThis.IntersectionObserver }) {
    let active = matchers;
    let running = true;
    let paused = false;
    let scanTimer = null;
    let settleTimer = null;
    let heartbeat = null;
    let totalClicks = 0;
    let quietPasses = 0;
    let limitReached = false;
    let dirty = true;
    let idleBeats = 0;
    let scans = 0;
    let clicked = /* @__PURE__ */ new WeakSet();
    let expandedBodies = /* @__PURE__ */ new WeakSet();
    let viewer = null;
    const waiting = /* @__PURE__ */ new Map();
    const onScreenSince = /* @__PURE__ */ new Map();
    let openTimer = null;
    function publishState() {
      bus.emit(EVENTS.EXPAND_STATE, {
        enabled: get("expand.enabled"),
        paused,
        totalClicks,
        limitReached
      });
    }
    function inScope({ explicit = false } = {}) {
      if (!get("expand.enabled") || paused) return false;
      if (isThreadView()) return true;
      if (get("expand.overview") && !explicit) return false;
      return get("expand.scope") !== "thread";
    }
    function isMenuLike(element, texts) {
      const popup = element.getAttribute("aria-haspopup");
      if (popup === "menu" || popup === "true" || popup === "dialog") return true;
      if (element.getAttribute("aria-expanded") === "true") return true;
      return Boolean(active.menu && texts.some((text) => active.menu.test(text)));
    }
    function isStructuralReplyCount(element) {
      if (element.tagName !== "BUTTON") return false;
      const label = normalizeText(visibleText(element));
      if (!label || label.length > MAX_LABEL_LENGTH2) return false;
      if (!LEADING_DIGIT.test(label)) return false;
      return hasIconSignature(element, get("advanced.replyIconSignatures"));
    }
    function classify(element) {
      if (!(element instanceof HTMLElement)) return null;
      if (element.disabled || element.getAttribute("aria-disabled") === "true") return null;
      const texts = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH2 });
      if (isMenuLike(element, texts)) return null;
      if (isStructuralReplyCount(element)) {
        return isVisible(element) ? "reply-count" : null;
      }
      if (get("expand.truncatedText") && isBodyLinkButton(element)) {
        if (expandedBodies.has(element.closest(BODY_WRAPPER_SELECTOR))) return null;
        return isVisible(element) ? "truncation" : null;
      }
      if (texts.length === 0) return null;
      if (active.replyCount && texts.some((text) => active.replyCount.test(text))) {
        return isVisible(element) ? "reply-count" : null;
      }
      if (active.expandReplies && texts.some((text) => active.expandReplies.test(text))) {
        return isVisible(element) ? "pagination" : null;
      }
      if (get("expand.truncatedText") && active.expandText && texts.some((text) => active.expandText.test(text))) {
        if (!closestPost(element)) return null;
        const body = element.closest(BODY_WRAPPER_SELECTOR);
        if (body && expandedBodies.has(body)) return null;
        return isVisible(element) ? "truncation" : null;
      }
      return null;
    }
    function findControls(root = document) {
      const found = [];
      const seenTargets = /* @__PURE__ */ new Set();
      let examined = 0;
      for (const element of root.querySelectorAll(CANDIDATE_SELECTOR)) {
        examined += 1;
        const kind = classify(element);
        if (!kind) continue;
        const target = nearestClickable(element, closestPost(element));
        if (!target || clicked.has(target) || seenTargets.has(target)) continue;
        seenTargets.add(target);
        found.push({ kind, element, target });
      }
      noteScan(examined);
      return found;
    }
    function viewTarget(control) {
      return control.closest(BODY_WRAPPER_SELECTOR) ?? closestPost(control) ?? control;
    }
    function stopWaiting(target) {
      viewer?.unobserve(target);
      waiting.delete(target);
      onScreenSince.delete(target);
    }
    function pruneWaiting() {
      for (const target of [...waiting.keys()]) if (!target.isConnected) stopWaiting(target);
    }
    function clearWaiting() {
      viewer?.disconnect();
      viewer = null;
      waiting.clear();
      onScreenSince.clear();
      clearTimeout(openTimer);
      openTimer = null;
    }
    function openWhenSeen(control) {
      const target = viewTarget(control);
      if (!viewer) viewer = new IntersectionObserverImpl(onViewed, { threshold: 0 });
      if (!waiting.has(target)) viewer.observe(target);
      waiting.set(target, control);
    }
    function onViewed(entries) {
      const now = Date.now();
      for (const { target, isIntersecting, intersectionRatio } of entries) {
        if (!waiting.has(target)) continue;
        if (isIntersecting && intersectionRatio > 0) {
          if (!onScreenSince.has(target)) onScreenSince.set(target, now);
        } else {
          onScreenSince.delete(target);
        }
      }
      scheduleOpen();
    }
    function scheduleOpen() {
      clearTimeout(openTimer);
      openTimer = null;
      if (!running || !inScope() || onScreenSince.size === 0) return;
      const due = Math.min(...onScreenSince.values()) + OPEN_DWELL_MS;
      openTimer = setTimeout(openSeen, Math.max(0, due - Date.now()));
    }
    function openSeen() {
      openTimer = null;
      if (!running || !inScope() || !get("expand.truncatedText")) return;
      const maxTotal = get("expand.maxTotalClicks");
      const now = Date.now();
      let clicks = 0;
      for (const [target, since] of [...onScreenSince]) {
        if (since + OPEN_DWELL_MS > now) continue;
        const control = waiting.get(target);
        stopWaiting(target);
        if (totalClicks >= maxTotal) break;
        if (!control?.isConnected || clicked.has(control) || classify(control) !== "truncation") continue;
        if (clickControl("truncation", control)) clicks += 1;
      }
      if (clicks > 0) bus.emit(EVENTS.EXPAND_PROGRESS, { totalClicks, clicks, settled: false });
      scheduleOpen();
    }
    function clickControl(kind, target) {
      clicked.add(target);
      if (kind === "truncation") {
        const body = target.closest(BODY_WRAPPER_SELECTOR);
        if (body) expandedBodies.add(body);
      }
      try {
        target.click();
      } catch (error) {
        log.debug("click failed", error, target);
        return false;
      }
      totalClicks += 1;
      log.debug(`clicked ${kind}`, target);
      return true;
    }
    function clickBatch(root = document, { deferTruncation = false } = {}) {
      const maxPerScan = get("expand.maxClicksPerScan");
      const maxTotal = get("expand.maxTotalClicks");
      if (totalClicks >= maxTotal) {
        if (!limitReached) {
          limitReached = true;
          log.warn(`click limit reached (${maxTotal}); pausing expansion for this page`);
          publishState();
        }
        return 0;
      }
      const defer = deferTruncation && typeof IntersectionObserverImpl === "function";
      let clicks = 0;
      for (const { kind, target } of findControls(root)) {
        if (defer && kind === "truncation") {
          openWhenSeen(target);
          continue;
        }
        if (clicks >= maxPerScan || totalClicks >= maxTotal) break;
        if (clickControl(kind, target)) clicks += 1;
      }
      return clicks;
    }
    function scan({ deferTruncation = true, explicit = false } = {}) {
      scanTimer = null;
      if (!running || !inScope({ explicit })) return;
      dirty = false;
      scans += 1;
      pruneWaiting();
      const clicks = clickBatch(document, { deferTruncation });
      if (clicks > 0) {
        quietPasses = 0;
        bus.emit(EVENTS.EXPAND_PROGRESS, { totalClicks, clicks, settled: false });
        clearTimeout(settleTimer);
        settleTimer = setTimeout(schedule, get("expand.settleDelayMs"));
      } else {
        quietPasses += 1;
        if (quietPasses === 3) {
          bus.emit(EVENTS.EXPAND_PROGRESS, { totalClicks, clicks: 0, settled: true });
        }
      }
    }
    function schedule() {
      if (!running || scanTimer || !inScope()) return;
      scanTimer = setTimeout(() => scan(), get("expand.scanDelayMs"));
    }
    const IDLE_BEAT_INTERVAL = 10;
    function beat() {
      if (dirty || quietPasses < 3) {
        idleBeats = 0;
        schedule();
        return;
      }
      idleBeats += 1;
      if (idleBeats >= IDLE_BEAT_INTERVAL) {
        idleBeats = 0;
        schedule();
      }
    }
    function restartHeartbeat() {
      clearInterval(heartbeat);
      heartbeat = null;
      idleBeats = 0;
      const interval = get("expand.heartbeatMs");
      if (interval > 0) heartbeat = setInterval(beat, interval);
    }
    function reset2() {
      totalClicks = 0;
      quietPasses = 0;
      limitReached = false;
      dirty = true;
      idleBeats = 0;
      clicked = /* @__PURE__ */ new WeakSet();
      expandedBodies = /* @__PURE__ */ new WeakSet();
      clearWaiting();
      publishState();
    }
    return {
      start() {
        running = true;
        restartHeartbeat();
        schedule();
        publishState();
      },
      stop() {
        running = false;
        clearTimeout(scanTimer);
        clearTimeout(settleTimer);
        clearInterval(heartbeat);
        scanTimer = settleTimer = heartbeat = null;
        clearWaiting();
      },
      /** Called by the SPA watcher; a new route means new counters. */
      onNavigate() {
        reset2();
        schedule();
      },
      onDomChanged() {
        dirty = true;
        idleBeats = 0;
        schedule();
      },
      onSettingsChanged(changed) {
        if ("expand.heartbeatMs" in changed) restartHeartbeat();
        if ("expand.maxTotalClicks" in changed) limitReached = false;
        dirty = true;
        publishState();
        schedule();
        scheduleOpen();
      },
      /** Re-reads label packs after the user edits languages or patterns. */
      setMatchers(next) {
        dirty = true;
        active = next;
        schedule();
      },
      /** Forgets the click history and runs a fresh pass immediately. */
      /** "Expand everything on this page": opens every post, seen or not. */
      rescan() {
        reset2();
        scan({ deferTruncation: false, explicit: true });
      },
      pause() {
        paused = true;
        clearTimeout(scanTimer);
        clearTimeout(settleTimer);
        clearTimeout(openTimer);
        scanTimer = settleTimer = openTimer = null;
        publishState();
      },
      resume() {
        paused = false;
        publishState();
        schedule();
        scheduleOpen();
      },
      togglePause() {
        if (paused) this.resume();
        else this.pause();
        return paused;
      },
      isPaused: () => paused,
      /**
       * Expands one subtree only, "see more" included whether on screen or not
       * -- used by the o key and before copying.
       */
      expandWithin(root) {
        return clickBatch(root);
      },
      get stats() {
        return { totalClicks, paused, limitReached };
      },
      // Exposed for the test suite.
      _internals: { classify, findControls, beat, scanCount: () => scans }
    };
  }

  // src/features/highlight.js
  var UNANSWERED_CLASS = "tc-unanswered";
  var NEW_CLASS = "tc-new";
  var STORAGE_KEY2 = "seen-posts";
  var MAX_SEEN = 3e3;
  var MAX_LABEL_LENGTH3 = 40;
  function createHighlighter({ matchers }) {
    let active = matchers;
    let seen = new Set(loadSeen());
    function loadSeen() {
      const stored = getValue(STORAGE_KEY2, []);
      return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
    }
    function persistSeen() {
      const ids = [...seen];
      const trimmed = ids.length > MAX_SEEN ? ids.slice(ids.length - MAX_SEEN) : ids;
      if (trimmed.length !== ids.length) seen = new Set(trimmed);
      setValue(STORAGE_KEY2, trimmed);
    }
    function hasReplies(article) {
      if (article.querySelector(POST_SELECTOR)) return true;
      if (!active.replyCount) return false;
      for (const element of article.querySelectorAll('span, button, a, [role="button"]')) {
        for (const text of accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH3 })) {
          const match = active.replyCount.exec(text);
          if (match && Number(match[1]) > 0) return true;
        }
      }
      return false;
    }
    function sweep() {
      const markUnanswered = get("highlight.unanswered");
      const markNew = get("highlight.unread");
      if (!markUnanswered && !markNew) return { unanswered: 0, fresh: 0 };
      let unanswered = 0;
      let fresh = 0;
      let added = 0;
      for (const post of rootPosts()) {
        if (markUnanswered) {
          const answered = hasReplies(post);
          post.classList.toggle(UNANSWERED_CLASS, !answered);
          if (!answered) unanswered += 1;
        }
        if (markNew) {
          const id = postIdentity(post);
          if (seen.has(id)) {
            post.classList.remove(NEW_CLASS);
          } else {
            post.classList.add(NEW_CLASS);
            seen.add(id);
            added += 1;
            fresh += 1;
          }
        }
      }
      if (added > 0) persistSeen();
      if (unanswered || fresh) log.debug(`highlight: ${unanswered} unanswered, ${fresh} new`);
      return { unanswered, fresh };
    }
    function restore() {
      for (const element of document.querySelectorAll(`.${UNANSWERED_CLASS}, .${NEW_CLASS}`)) {
        element.classList.remove(UNANSWERED_CLASS, NEW_CLASS);
      }
    }
    const scheduleSweep = debounce(() => sweep(), 350);
    return {
      start() {
        sweep();
      },
      stop: restore,
      onDomChanged: scheduleSweep,
      onNavigate: scheduleSweep,
      onSettingsChanged() {
        restore();
        sweep();
      },
      setMatchers(next) {
        active = next;
        scheduleSweep();
      },
      /** Clears the "seen" history so everything reads as new again. */
      forgetSeen() {
        seen = /* @__PURE__ */ new Set();
        persistSeen();
        restore();
        sweep();
      },
      sweep
    };
  }

  // src/features/quiet.js
  var POST_CLASS = "tc-quiet-post";
  var COMPOSER_CLASS = "tc-quiet-composer";
  var MODE_CLASSES = {
    /** Suppresses the bars outright, whatever the mode would otherwise do. */
    hidden: "tc-quiet-hidden",
    dim: "tc-quiet-dim",
    collapse: "tc-quiet-collapse",
    cluster: "tc-quiet-cluster",
    clusterFocus: "tc-quiet-cluster-focus",
    edge: "tc-quiet-edge",
    composer: "tc-quiet-composer-on"
  };
  var ACTION_MODE_CLASSES = {
    dim: MODE_CLASSES.dim,
    collapse: MODE_CLASSES.collapse,
    cluster: MODE_CLASSES.cluster,
    "cluster-focus": MODE_CLASSES.clusterFocus,
    edge: MODE_CLASSES.edge
  };
  var COMPOSER_LABELS = [
    /^write a comment$/i,
    /^write a reply$/i,
    /^add a comment$/i,
    /^kommentar schreiben$/i,
    /^antwort schreiben$/i,
    /^écrire un commentaire$/i,
    /^escribir un comentario$/i
  ];
  var EDITOR_SELECTOR = 'textarea, input[type="text"], [role="textbox"], [contenteditable="true"]';
  var OPENER_SELECTOR = 'button, [role="button"]';
  var COMPOSER_SELECTOR = `${EDITOR_SELECTOR}, ${OPENER_SELECTOR}`;
  var COMPOSER_WRAPPER_SELECTOR = 'form, [role="form"], [data-testid="focus-catcher-wrapper"]';
  var MAX_LABEL_LENGTH4 = 40;
  var MAX_LONE_ANCESTORS = 2;
  function loneAncestors(element) {
    const found = [];
    let node2 = element;
    for (let depth = 0; depth < MAX_LONE_ANCESTORS; depth += 1) {
      const parent = node2.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      if (parent.children.length !== 1) break;
      found.push(parent);
      node2 = parent;
    }
    return found;
  }
  function createQuietChrome() {
    let hidden = false;
    function applyModes() {
      const root = document.documentElement;
      const mode = get("quiet.actions");
      root.classList.toggle(MODE_CLASSES.hidden, hidden);
      for (const [value, className] of Object.entries(ACTION_MODE_CLASSES)) {
        root.classList.toggle(className, mode === value);
      }
      root.classList.toggle(MODE_CLASSES.composer, get("quiet.composer"));
    }
    function sweep(root = document) {
      let posts = 0;
      for (const row of root.querySelectorAll(ACTION_ROW_SELECTOR)) {
        const post = postContainerFor(row);
        if (post && !post.classList.contains(POST_CLASS)) {
          post.classList.add(POST_CLASS);
          posts += 1;
        }
      }
      let composers = 0;
      if (get("quiet.composer")) {
        const wrappers = /* @__PURE__ */ new Map();
        for (const element of root.querySelectorAll(COMPOSER_SELECTOR)) {
          const names = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH4 });
          if (!names.some((name) => COMPOSER_LABELS.some((pattern) => pattern.test(name)))) {
            continue;
          }
          const wrapper = element.closest(COMPOSER_WRAPPER_SELECTOR) ?? element.parentElement;
          if (!wrapper) continue;
          const entry = wrappers.get(wrapper) ?? { hasEditor: false };
          entry.hasEditor = entry.hasEditor || element.matches(EDITOR_SELECTOR);
          wrappers.set(wrapper, entry);
        }
        for (const [wrapper, { hasEditor }] of wrappers) {
          const targets = [wrapper, ...loneAncestors(wrapper)];
          if (hasEditor) {
            for (const target of targets) target.classList.remove(COMPOSER_CLASS);
            continue;
          }
          if (wrapper.classList.contains(COMPOSER_CLASS)) continue;
          for (const target of targets) target.classList.add(COMPOSER_CLASS);
          composers += 1;
          const post = closestPost(wrapper);
          if (post) post.classList.add(POST_CLASS);
        }
      }
      if (posts || composers) {
        log.debug(`quiet chrome: tagged ${posts} post(s), ${composers} composer(s)`);
      }
      return { posts, composers };
    }
    function toggleActions() {
      hidden = !hidden;
      applyModes();
      return hidden ? "hidden" : "shown";
    }
    function restore() {
      hidden = false;
      const root = document.documentElement;
      for (const value of Object.values(MODE_CLASSES)) root.classList.remove(value);
      for (const element of document.querySelectorAll(`.${POST_CLASS}`)) {
        element.classList.remove(POST_CLASS);
      }
      for (const element of document.querySelectorAll(`.${COMPOSER_CLASS}`)) {
        element.classList.remove(COMPOSER_CLASS);
      }
    }
    const scheduleSweep = debounce(() => sweep(), 250);
    return {
      start() {
        applyModes();
        sweep();
      },
      stop: restore,
      onDomChanged: scheduleSweep,
      onNavigate: scheduleSweep,
      onSettingsChanged(changed) {
        if ("quiet.actions" in changed || "quiet.composer" in changed) {
          if ("quiet.actions" in changed) hidden = false;
          applyModes();
          sweep();
        }
      },
      toggleActions,
      sweep
    };
  }

  // src/features/reading.js
  var READING_CLASS = "tc-reading";
  var NO_BANNER_CLASS = "tc-no-banner";
  var PRESET = {
    "quiet.actions": { value: "cluster", quieter: ["cluster", "cluster-focus"] },
    "quiet.composer": { value: true },
    "copy.showButtons": { value: "focus", quieter: ["focus", "off"] },
    "translate.mode": { value: "compact", quieter: ["compact", "known", "hide"] },
    "declutter.enabled": { value: true }
  };
  function readingOverrides() {
    const imposed = {};
    for (const [key, { value, quieter = [value] }] of Object.entries(PRESET)) {
      if (!quieter.includes(getOwn(key))) imposed[key] = value;
    }
    return imposed;
  }
  function createReadingMode() {
    function apply() {
      const root = document.documentElement;
      const enabled = getOwn("reading.enabled");
      root.classList.toggle(READING_CLASS, enabled);
      root.classList.toggle(NO_BANNER_CLASS, enabled && !getOwn("reading.keepBanner"));
      setOverrides(enabled ? readingOverrides() : {});
    }
    return {
      start: apply,
      stop() {
        document.documentElement.classList.remove(READING_CLASS, NO_BANNER_CLASS);
        setOverrides({});
      },
      onSettingsChanged: apply,
      onNavigate: apply,
      toggle() {
        update({ "reading.enabled": !getOwn("reading.enabled") });
        return getOwn("reading.enabled");
      },
      isEnabled: () => getOwn("reading.enabled")
    };
  }

  // src/meta.js
  var REPOSITORY = "https://github.com/Tauris/threadcalm";
  var SCRIPT_NAME = "Threadcalm";
  var PUBLIC_REPO = true;
  var LINKS = {
    repository: REPOSITORY,
    docs: `${REPOSITORY}/blob/main/docs/USAGE.md`,
    shortcuts: `${REPOSITORY}/blob/main/docs/USAGE.md#keyboard-shortcuts`,
    issues: `${REPOSITORY}/issues`
  };
  var ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="10" fill="#2f6f68"/>
  <g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round">
    <path d="M5 8h22"/>
    <path d="M11 16h16"/>
    <path d="M17 24h10"/>
  </g>
</svg>`;
  function brandLink(el2, { className = "tc-brand" } = {}) {
    if (!PUBLIC_REPO) return el2("span", { className, text: SCRIPT_NAME });
    return el2("a", {
      className,
      href: REPOSITORY,
      target: "_blank",
      rel: "noopener noreferrer",
      text: SCRIPT_NAME,
      title: "Threadcalm on GitHub"
    });
  }
  var MATCHES = [
    "https://engage.cloud.microsoft/*",
    "https://*.engage.cloud.microsoft/*",
    "https://web.yammer.com/*",
    "https://www.yammer.com/*"
  ];
  var metadata = {
    name: SCRIPT_NAME,
    namespace: REPOSITORY,
    description: "Expand whole Viva Engage threads automatically, copy them as Markdown, and read them with shortcuts, a reading mode and less clutter.",
    author: "Jörg Türmer",
    icon: ICON_SVG,
    license: "BSD-3-Clause",
    homepageURL: REPOSITORY,
    supportURL: `${REPOSITORY}/issues`,
    downloadURL: `${REPOSITORY}/raw/main/dist/threadcalm.user.js`,
    updateURL: `${REPOSITORY}/raw/main/dist/threadcalm.user.js`,
    match: MATCHES,
    // Some Tampermonkey configurations still honour @include more reliably than
    // @match on wildcard subdomains, so both are declared.
    include: MATCHES,
    "run-at": "document-idle",
    noframes: true,
    grant: [
      "GM_addStyle",
      "GM_getValue",
      "GM_setValue",
      "GM_deleteValue",
      "GM_setClipboard",
      "GM_registerMenuCommand"
    ]
  };

  // src/features/shortcuts.js
  var FOCUS_CLASS = "tc-focus";
  var OVERLAY_ID = "tc-help";
  var KEY_CAPS = { Escape: "Esc", T: "Shift+T" };
  var SEEN_KEY = "help-seen";
  var BINDINGS = [
    { keys: ["j"], label: "Next post" },
    { keys: ["k"], label: "Previous post" },
    { keys: ["o"], label: "Expand the focused post" },
    { keys: ["v"], label: "Overview: keep feeds compact, or open them again" },
    { keys: ["c"], label: "Copy the focused thread" },
    { keys: ["y"], label: "Copy a link to the focused thread" },
    { keys: ["e"], label: "Pause or resume automatic expansion (pausing also stops automatic translation)" },
    { keys: ["a"], label: "Hide the action bars outright, or show them again" },
    { keys: ["r"], label: "Toggle reading mode" },
    { keys: ["t"], label: "Switch automatic translation on or off" },
    { keys: ["T"], label: "Cycle the translation-control mode" },
    { keys: ["s"], label: "Open settings" },
    { keys: ["p"], label: "Show or hide the status panel" },
    { keys: ["?"], label: "Show this help" },
    { keys: ["Escape"], label: "Close help or settings" }
  ];
  var TRANSLATE_MODES = ["compact", "known", "hide", "off"];
  function createShortcuts({ expander, copyTools, readingMode, panel, quietChrome }) {
    let focusIndex = -1;
    let pinned = false;
    let overlay = null;
    let unsubscribeHelp = null;
    function toast(message) {
      bus.emit(EVENTS.TOAST, { message });
    }
    function posts() {
      return rootPosts();
    }
    function clearFocusMarks() {
      for (const element of document.querySelectorAll(`.${FOCUS_CLASS}`)) {
        element.classList.remove(FOCUS_CLASS);
      }
    }
    function currentPost() {
      const list = posts();
      if (list.length === 0) return null;
      if (pinned && focusIndex >= 0 && focusIndex < list.length) {
        const chosen = list[focusIndex];
        const { top, bottom } = chosen.getBoundingClientRect();
        if (bottom > 0 && top < window.innerHeight) return chosen;
      }
      const firstVisible = list.findIndex((post) => post.getBoundingClientRect().bottom > 80);
      return list[firstVisible >= 0 ? firstVisible : 0];
    }
    function moveFocus(delta) {
      const list = posts();
      if (list.length === 0) {
        toast("No posts on this page");
        return;
      }
      if (focusIndex < 0) {
        const firstVisible = list.findIndex((post2) => post2.getBoundingClientRect().top > -40);
        focusIndex = firstVisible >= 0 ? firstVisible : 0;
      } else {
        focusIndex = Math.min(list.length - 1, Math.max(0, focusIndex + delta));
      }
      pinned = true;
      clearFocusMarks();
      const post = list[focusIndex];
      post.classList.add(FOCUS_CLASS);
      post.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    function toggleHelp(force) {
      const open = force ?? !overlay;
      if (!open) {
        overlay?.remove();
        overlay = null;
        return false;
      }
      if (overlay) return true;
      overlay = el(
        "div",
        {
          id: OVERLAY_ID,
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Threadcalm keyboard shortcuts",
          on: {
            click: (event) => {
              if (event.target === overlay) toggleHelp(false);
            }
          }
        },
        el(
          "div",
          { className: "tc-help-card" },
          el(
            "header",
            { className: "tc-help-head" },
            el(
              "div",
              {},
              el("p", { className: "tc-eyebrow" }, brandMark(), brandLink(el)),
              el("h2", { text: "Keyboard shortcuts" })
            ),
            // Esc and a click outside both close this, but neither is visible;
            // a dialog should show its own way out.
            el(
              "button",
              {
                type: "button",
                className: "tc-icon-btn",
                title: "Close (Esc)",
                "aria-label": "Close keyboard shortcuts",
                on: { click: () => toggleHelp(false) }
              },
              icon("close")
            )
          ),
          el(
            "dl",
            { className: "tc-keys" },
            ...BINDINGS.flatMap((binding) => [
              el("dt", {}, ...binding.keys.map((key) => el("kbd", { text: KEY_CAPS[key] ?? key }))),
              el("dd", { text: binding.label })
            ])
          ),
          el(
            "p",
            { className: "tc-help-note" },
            el("span", {
              text: "Shortcuts are ignored while you are typing. Press ? or use the panel’s ? button to see this again. Settings also holds display options — the Like / Comment / Share bar and the inline reply boxes can each be quieted, and every choice is listed there with what it costs. "
            }),
            // This overlay lists keys only; everything else lives in the guide.
            PUBLIC_REPO ? el("a", {
              href: LINKS.docs,
              target: "_blank",
              rel: "noopener noreferrer",
              text: "Full documentation"
            }) : null
          )
        )
      );
      document.body.append(overlay);
      return true;
    }
    function cycleTranslateMode() {
      const current2 = get("translate.mode");
      const next = TRANSLATE_MODES[(TRANSLATE_MODES.indexOf(current2) + 1) % TRANSLATE_MODES.length];
      update({ "translate.mode": next });
      toast(`Translation controls: ${next}`);
    }
    function handleKey(event) {
      if (!get("shortcuts.enabled")) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditingContext(event.target)) return;
      if (event.key === "Escape") {
        if (overlay) {
          toggleHelp(false);
          event.preventDefault();
        } else if (panel?.closeSettings?.()) {
          event.preventDefault();
        }
        return;
      }
      switch (event.key) {
        case "j":
          moveFocus(1);
          break;
        case "k":
          moveFocus(-1);
          break;
        case "o": {
          const post = currentPost();
          if (!post) return;
          const clicks = expander.expandWithin(post);
          toast(clicks > 0 ? `Expanding ${clicks} section${clicks === 1 ? "" : "s"}` : "Nothing left to expand");
          break;
        }
        case "c":
          copyTools.copyThread(currentPost());
          break;
        case "y":
          copyTools.copyLink(currentPost());
          break;
        case "v": {
          const on = !get("expand.overview");
          update({ "expand.overview": on });
          toast(
            on ? "Overview on — feeds stay compact. o opens a post, v to leave." : "Overview off — replies and long posts open again."
          );
          break;
        }
        case "e": {
          const paused = expander.togglePause();
          toast(paused ? "Expansion paused" : "Expansion resumed");
          break;
        }
        case "a": {
          const state = quietChrome?.toggleActions?.();
          if (state) toast(state === "hidden" ? "Action bars hidden" : "Action bars shown");
          break;
        }
        case "r":
          toast(
            readingMode.toggle() ? "Reading mode on — quieter page. r to return to your own settings." : "Reading mode off — your own settings are back."
          );
          break;
        case "T":
          cycleTranslateMode();
          break;
        case "t": {
          const on = !get("translate.autoWhenVisible");
          update({ "translate.autoWhenVisible": on });
          toast(on ? "Automatic translation on" : "Automatic translation off");
          break;
        }
        case "s":
          panel?.openSettings?.();
          break;
        case "p":
          panel?.toggle?.();
          break;
        case "?":
          toggleHelp();
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    return {
      start() {
        window.addEventListener("keydown", handleKey, true);
        unsubscribeHelp = bus.on(EVENTS.SHOW_HELP, () => toggleHelp(true));
        if (!getValue(SEEN_KEY, false)) {
          setValue(SEEN_KEY, true);
          setTimeout(() => toggleHelp(true), 1200);
        }
      },
      stop() {
        window.removeEventListener("keydown", handleKey, true);
        unsubscribeHelp?.();
        unsubscribeHelp = null;
        clearFocusMarks();
        toggleHelp(false);
      },
      onNavigate() {
        focusIndex = -1;
        pinned = false;
        clearFocusMarks();
      },
      showHelp: () => toggleHelp(true),
      toggleHelp
    };
  }

  // src/features/translate.js
  var COMPACT_CLASS = "tc-translate-compact";
  var HIDDEN_CLASS2 = "tc-translate-hidden";
  var ROW_CLASS = "tc-translate-row";
  var ROW_HIDDEN_CLASS = "tc-translate-row-hidden";
  var MARKER = "tcTranslate";
  var MAX_LABEL_LENGTH5 = 40;
  var TRANSLATE_DWELL_MS = 500;
  var TRANSLATE_SPACING_MS = 400;
  var TRANSLATE_TIMEOUT_MS = 8e3;
  var MAX_COPY_TRANSLATIONS = 40;
  var POLL_MS = 100;
  var CONTROL_SELECTOR = 'button, [role="button"], a, [tabindex="0"], span';
  var ORIGINAL_STATE = /\([^()]*\)\s*$/;
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function createTranslateTamer({ matchers, IntersectionObserverImpl = globalThis.IntersectionObserver }) {
    let active = matchers;
    let observer = null;
    const watched = /* @__PURE__ */ new Map();
    const onScreenSince = /* @__PURE__ */ new Map();
    const attempted = /* @__PURE__ */ new WeakSet();
    const queue = [];
    let queueTimer = null;
    let lastClick = -Infinity;
    let expansionPaused = false;
    let unsubscribeExpand = null;
    const originals = /* @__PURE__ */ new WeakMap();
    const languageCache = /* @__PURE__ */ new WeakMap();
    function detectFor(article) {
      if (!article) return { language: null, confidence: 0 };
      const cached = languageCache.get(article);
      if (cached) return cached;
      const clone = article.cloneNode(true);
      for (const nested of clone.querySelectorAll(POST_SELECTOR)) nested.remove();
      clone.querySelectorAll('button, [role="button"], a, time, svg, [aria-hidden="true"]').forEach((node2) => node2.remove());
      const result = detectLanguage(visibleText(clone));
      languageCache.set(article, result);
      return result;
    }
    function classify(element) {
      const texts = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH5 });
      if (texts.length === 0) return null;
      if (active.showOriginal && texts.some((text) => active.showOriginal.test(text))) {
        return "original";
      }
      if (active.translate && texts.some((text) => active.translate.test(text))) {
        return "translate";
      }
      if (isTranslationLinkButton(element)) {
        return ORIGINAL_STATE.test(texts[0]) ? "original" : "translate";
      }
      return null;
    }
    function eligibleForAutoTranslate(element) {
      if (!get("translate.autoWhenVisible")) return false;
      const post = closestPost(element);
      if (post && attempted.has(post)) return false;
      const known = get("translate.knownLanguages");
      const { language, confidence, ambiguous } = detectFor(post);
      if (!language) return false;
      if (ambiguous) return !known.includes("ja") && !known.includes("zh");
      return confidence >= get("translate.minConfidence") && !known.includes(language);
    }
    function unqueue(target) {
      const index = queue.indexOf(target);
      if (index !== -1) queue.splice(index, 1);
    }
    function forget(target) {
      observer?.unobserve(target);
      watched.delete(target);
      onScreenSince.delete(target);
      unqueue(target);
    }
    function prune() {
      for (const target of [...watched.keys()]) if (!target.isConnected) forget(target);
    }
    function onIntersect(entries) {
      const now = Date.now();
      for (const { target, isIntersecting, intersectionRatio } of entries) {
        if (!watched.has(target)) continue;
        if (isIntersecting && intersectionRatio > 0) {
          if (!onScreenSince.has(target)) onScreenSince.set(target, now);
          if (!queue.includes(target)) queue.push(target);
        } else {
          onScreenSince.delete(target);
          unqueue(target);
        }
      }
      drain();
    }
    function drain() {
      if (queueTimer !== null) return;
      if (document.visibilityState === "hidden") return;
      while (queue.length > 0) {
        const target = queue[0];
        const since = onScreenSince.get(target);
        if (since === void 0) {
          queue.shift();
          continue;
        }
        const wait = Math.max(lastClick + TRANSLATE_SPACING_MS, since + TRANSLATE_DWELL_MS) - Date.now();
        if (wait > 0) {
          queueTimer = setTimeout(() => {
            queueTimer = null;
            drain();
          }, wait);
          return;
        }
        queue.shift();
        const control = watched.get(target);
        if (!control?.isConnected || control.disabled || classify(control) !== "translate" || !eligibleForAutoTranslate(control)) continue;
        rememberOriginal(closestPost(control));
        attempted.add(target);
        forget(target);
        lastClick = Date.now();
        control.click();
      }
    }
    function clearQueue() {
      clearTimeout(queueTimer);
      queueTimer = null;
      queue.length = 0;
    }
    function onExpandState({ paused }) {
      const nowPaused = Boolean(paused);
      if (nowPaused && !expansionPaused && get("translate.autoWhenVisible")) {
        update({ "translate.autoWhenVisible": false });
        bus.emit(EVENTS.TOAST, { message: "Automatic translation off as well" });
      }
      expansionPaused = nowPaused;
    }
    function controlsOf(post, kind) {
      return [...post.querySelectorAll(CONTROL_SELECTOR)].filter(
        (element) => element instanceof HTMLElement && closestPost(element) === post && classify(element) === kind
      );
    }
    function rememberOriginal(post) {
      if (post && controlsOf(post, "original").length === 0) originals.set(post, extractBody(post));
    }
    function translationOf(post) {
      if (!(post instanceof HTMLElement)) return null;
      const [control] = controlsOf(post, "original");
      if (!control) return null;
      const texts = accessibleTexts(control, { maxLength: MAX_LABEL_LENGTH5 });
      const label = texts.find((text) => active.showOriginal?.test(text)) ?? texts.find((text) => ORIGINAL_STATE.test(text));
      const from = /\(([^()]*)\)\s*$/.exec(label ?? "")?.[1]?.trim() || null;
      return { from, original: originals.get(post) ?? null };
    }
    function running() {
      return get("translate.autoWhenVisible") && !expansionPaused;
    }
    async function translated(post) {
      const end = Date.now() + TRANSLATE_TIMEOUT_MS;
      while (Date.now() < end) {
        if (translationOf(post)) return true;
        if (!running()) return false;
        await sleep(POLL_MS);
      }
      return false;
    }
    async function translateForCopy(posts, { onProgress } = {}) {
      const result = { translated: 0, eligible: 0, skipped: 0, stopped: false };
      if (!running()) return result;
      const queued = [];
      for (const post of posts) {
        const [control] = controlsOf(post, "translate");
        if (control && eligibleForAutoTranslate(control)) queued.push(post);
      }
      result.eligible = queued.length;
      const batch = queued.slice(0, MAX_COPY_TRANSLATIONS);
      result.skipped = queued.length - batch.length;
      for (const [index, post] of batch.entries()) {
        const wait = lastClick + TRANSLATE_SPACING_MS - Date.now();
        if (wait > 0) await sleep(wait);
        if (!running()) {
          result.stopped = true;
          break;
        }
        const [control] = controlsOf(post, "translate");
        if (!control || !eligibleForAutoTranslate(control)) continue;
        onProgress?.(index + 1, batch.length);
        rememberOriginal(post);
        attempted.add(post);
        forget(post);
        lastClick = Date.now();
        control.click();
        if (await translated(post)) result.translated += 1;
        else if (!running()) {
          result.stopped = true;
          break;
        }
      }
      return result;
    }
    function onClickCapture(event) {
      const target = event.target instanceof Element ? event.target.closest(CONTROL_SELECTOR) : null;
      if (target instanceof HTMLElement && classify(target) === "translate") {
        rememberOriginal(closestPost(target));
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearTimeout(queueTimer);
        queueTimer = null;
      } else {
        drain();
      }
    }
    function configureObserver() {
      if (!get("translate.autoWhenVisible") || typeof IntersectionObserverImpl !== "function") {
        observer?.disconnect();
        observer = null;
        watched.clear();
        onScreenSince.clear();
        clearQueue();
        return;
      }
      if (!observer) observer = new IntersectionObserverImpl(onIntersect, { threshold: 0 });
      prune();
    }
    function watchForTranslation(control) {
      if (!observer) return false;
      const target = closestPost(control) ?? control;
      if (!eligibleForAutoTranslate(control)) {
        if (watched.has(target)) forget(target);
        return false;
      }
      if (!watched.has(target)) observer.observe(target);
      watched.set(target, control);
      return true;
    }
    function rowHost(element) {
      const parent = element.parentElement;
      if (!parent || parent === document.body) return null;
      const siblings = [...parent.children].filter((child) => child !== element);
      return siblings.length === 0 ? parent : null;
    }
    function apply(element, { compact, hidden }) {
      element.classList.toggle(COMPACT_CLASS, compact && !hidden);
      element.classList.toggle(HIDDEN_CLASS2, hidden);
      const host = rowHost(element);
      if (host) {
        host.classList.toggle(ROW_CLASS, compact && !hidden);
        host.classList.toggle(ROW_HIDDEN_CLASS, hidden);
      }
      if (compact && !hidden && !element.hasAttribute("data-tc-title")) {
        const label = accessibleTexts(element, { maxLength: MAX_LABEL_LENGTH5 })[0];
        if (label) element.setAttribute("data-tc-title", label);
        if (!element.getAttribute("title") && label) element.setAttribute("title", label);
      }
    }
    function clear(element) {
      element.classList.remove(COMPACT_CLASS, HIDDEN_CLASS2, ROW_CLASS, ROW_HIDDEN_CLASS);
      delete element.dataset[MARKER];
      const host = rowHost(element);
      if (host) host.classList.remove(ROW_CLASS, ROW_HIDDEN_CLASS);
    }
    function sweep(root = document) {
      configureObserver();
      const mode = get("translate.mode");
      const selector = 'button, [role="button"], a, [tabindex="0"], span';
      let compacted = 0;
      let hidden = 0;
      for (const element of root.querySelectorAll(selector)) {
        if (!(element instanceof HTMLElement)) continue;
        const kind = classify(element);
        if (!kind) {
          if (element.dataset[MARKER]) clear(element);
          continue;
        }
        const autoTranslate = kind === "translate" && watchForTranslation(element);
        if (mode === "off") {
          clear(element);
          continue;
        }
        element.dataset[MARKER] = kind;
        if (kind === "original") {
          apply(element, { compact: false, hidden: false });
          continue;
        }
        let shouldHide = mode === "hide";
        if (mode === "known") {
          const known = get("translate.knownLanguages");
          const minConfidence = get("translate.minConfidence");
          const { language, confidence } = detectFor(closestPost(element));
          shouldHide = Boolean(language) && confidence >= minConfidence && known.includes(language);
        }
        if (autoTranslate) shouldHide = false;
        apply(element, { compact: true, hidden: shouldHide });
        if (shouldHide) hidden += 1;
        else compacted += 1;
      }
      if (compacted || hidden) {
        log.debug(`translate controls: ${compacted} compacted, ${hidden} hidden`);
      }
      return { compacted, hidden };
    }
    const scheduleSweep = debounce(() => sweep(), 200);
    return {
      start() {
        document.addEventListener("visibilitychange", onVisibilityChange);
        document.addEventListener("click", onClickCapture, true);
        unsubscribeExpand = bus.on(EVENTS.EXPAND_STATE, onExpandState);
        sweep();
      },
      stop() {
        scheduleSweep.cancel();
        observer?.disconnect();
        observer = null;
        watched.clear();
        onScreenSince.clear();
        clearQueue();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        document.removeEventListener("click", onClickCapture, true);
        unsubscribeExpand?.();
        unsubscribeExpand = null;
        for (const element of document.querySelectorAll(`.${COMPACT_CLASS}, .${HIDDEN_CLASS2}, .${ROW_CLASS}, .${ROW_HIDDEN_CLASS}`)) {
          clear(element);
        }
      },
      onDomChanged() {
        scheduleSweep();
      },
      translationOf,
      translateForCopy,
      onNavigate() {
        scheduleSweep();
      },
      onSettingsChanged() {
        for (const element of document.querySelectorAll(`.${COMPACT_CLASS}, .${HIDDEN_CLASS2}, .${ROW_CLASS}, .${ROW_HIDDEN_CLASS}`)) {
          clear(element);
        }
        sweep();
      },
      setMatchers(next) {
        active = next;
        scheduleSweep();
      },
      sweep
    };
  }

  // src/ui/panel.js
  var PANEL_ID = "tc-panel";
  var SETTINGS_ID = "tc-settings";
  function createPanel({ expander, highlighter, version, channel = "dev", build: stamp = "dev" }) {
    const buildLabel = channel === "stable" ? `v${version} · ${stamp}` : `v${version} · ${channel} · ${stamp}`;
    let panel = null;
    let readingPill = null;
    let overviewPill = null;
    let statusText = null;
    let pauseButton = null;
    let sheet = null;
    let unsubscribes = [];
    function iconButton(name, label, onClick) {
      return el(
        "button",
        {
          type: "button",
          className: "tc-icon-btn",
          title: label,
          "aria-label": label,
          on: { click: onClick }
        },
        icon(name)
      );
    }
    function build() {
      statusText = el("span", {
        className: "tc-status",
        role: "status",
        "aria-live": "polite",
        text: "Watching for threads…"
      });
      pauseButton = iconButton("pause", "Pause automatic expansion (e)", () => expander.togglePause());
      pauseButton.setAttribute("aria-pressed", "false");
      panel = el(
        "div",
        { id: PANEL_ID, role: "region", "aria-label": "Threadcalm" },
        // Identity first: what this is, which build, and where it came from --
        // the panel appears on a page nobody asked it to appear on.
        el(
          "div",
          { className: "tc-build" },
          brandMark(),
          brandLink(el),
          channel === "stable" ? null : el("span", { className: "tc-chip-pre", text: channel }),
          // Says reading mode is on -- several settings are being held quieter
          // than the reader set them -- and is the way out of it.
          readingPill = el("button", {
            type: "button",
            className: "tc-mode-pill",
            text: "Reading",
            title: "Reading mode is on. Click, or press r, to return to your own settings.",
            hidden: !getOwn("reading.enabled"),
            on: { click: () => update({ "reading.enabled": false }) }
          }),
          // Says feeds are being kept compact, and is the way out of it.
          overviewPill = el("button", {
            type: "button",
            className: "tc-mode-pill",
            text: "Overview",
            title: "Overview is on: feeds stay compact. Click, or press v, to let them open again.",
            hidden: !getOwn("expand.overview"),
            on: { click: () => update({ "expand.overview": false }) }
          }),
          el("span", {
            className: "tc-stamp",
            text: `v${version} · ${stamp}`,
            title: "Version and build stamp"
          })
        ),
        el(
          "div",
          { className: "tc-row" },
          el("span", { className: "tc-dot", "aria-hidden": "true" }),
          statusText,
          el(
            "div",
            { className: "tc-tools" },
            pauseButton,
            iconButton("settings", "Settings (s)", openSettings),
            // The only visible affordance for the shortcuts. Without it nobody
            // discovers that pressing ? does anything.
            iconButton("help", "Keyboard shortcuts (?)", () => bus.emit(EVENTS.SHOW_HELP)),
            iconButton("close", "Hide this panel (p)", hide)
          )
        )
      );
      document.body.append(panel);
      applyVisibility();
    }
    function applyVisibility() {
      if (!panel) return;
      panel.hidden = !get("general.showPanel");
    }
    function hide() {
      update({ "general.showPanel": false });
      bus.emit(EVENTS.TOAST, {
        message: "Panel hidden — press p to bring it back, or s for settings",
        duration: 5e3
      });
    }
    function setStatus(message) {
      if (statusText) statusText.textContent = message;
    }
    function onProgress({ totalClicks, settled }) {
      const noun = `${totalClicks} item${totalClicks === 1 ? "" : "s"}`;
      setStatus(settled ? `Thread expanded — ${noun}` : `Expanding… ${noun}`);
      panel?.classList.toggle("tc-busy", !settled);
    }
    let shownPaused = null;
    function onState({ enabled, paused, totalClicks, limitReached }) {
      if (!panel) return;
      panel.classList.toggle("tc-paused", paused || !enabled);
      panel.classList.toggle("tc-limit", limitReached);
      if (paused || !enabled || limitReached) panel.classList.remove("tc-busy");
      if (pauseButton && shownPaused !== paused) {
        shownPaused = paused;
        const label = paused ? "Resume automatic expansion (e)" : "Pause automatic expansion (e)";
        pauseButton.replaceChildren(icon(paused ? "play" : "pause"));
        pauseButton.title = label;
        pauseButton.setAttribute("aria-label", label);
        pauseButton.setAttribute("aria-pressed", paused ? "true" : "false");
      }
      if (limitReached) {
        setStatus(`Click limit reached at ${totalClicks}`);
      } else if (paused) {
        setStatus("Expansion paused");
      } else if (!enabled) {
        setStatus("Expansion off");
      }
    }
    function fieldId(definition) {
      return `tc-field-${definition.key.replace(/[^a-z0-9]+/gi, "-")}`;
    }
    function splitUnit(label) {
      const match = /^(.*?)\s*\((ms|px)\)$/.exec(label);
      return match ? { text: match[1], unit: match[2] } : { text: label, unit: null };
    }
    function describe(definition, id) {
      const { text } = splitUnit(definition.label);
      const held = isOverridden(definition.key) ? el("span", {
        className: "tc-held",
        text: "Reading mode",
        title: "Held quieter while reading mode is on; your choice here applies once it is off."
      }) : null;
      return el(
        "span",
        { className: "tc-field-text" },
        el("span", { className: "tc-label", id: `${id}-label` }, text, held),
        definition.help ? el("span", { className: "tc-help", id: `${id}-help`, text: definition.help }) : null
      );
    }
    function renderField(definition) {
      const value = getOwn(definition.key);
      const id = fieldId(definition);
      const describedBy = definition.help ? `${id}-help` : null;
      const commit = (next) => update({ [definition.key]: next });
      switch (definition.type) {
        case "boolean":
          return el(
            "label",
            { className: "tc-field tc-field-inline" },
            describe(definition, id),
            el(
              "span",
              { className: "tc-control" },
              el("input", {
                type: "checkbox",
                className: "tc-vh",
                checked: value ? "checked" : null,
                "aria-labelledby": `${id}-label`,
                "aria-describedby": describedBy,
                on: { change: (event) => commit(event.target.checked) }
              }),
              el("span", { className: "tc-switch", "aria-hidden": "true" })
            )
          );
        case "number": {
          const { unit } = splitUnit(definition.label);
          return el(
            "label",
            { className: "tc-field tc-field-inline" },
            describe(definition, id),
            el(
              "span",
              { className: "tc-control" },
              el("input", {
                type: "number",
                value: String(value),
                min: definition.min ?? null,
                max: definition.max ?? null,
                step: definition.step ?? 1,
                inputmode: "decimal",
                "aria-labelledby": unit ? `${id}-label ${id}-unit` : `${id}-label`,
                "aria-describedby": describedBy,
                on: { change: (event) => commit(event.target.value) }
              }),
              // Rendered even when empty, so every number field in the sheet
              // shares one right edge whether or not it carries a unit.
              el("span", {
                className: "tc-unit",
                id: unit ? `${id}-unit` : null,
                "aria-hidden": unit ? null : "true",
                text: unit ?? ""
              })
            )
          );
        }
        case "select": {
          const options = definition.options ?? [];
          if (options.some((option) => option.gain || option.cost)) {
            const cards = el("div", {
              className: "tc-cards",
              role: "radiogroup",
              "aria-labelledby": `${id}-label`,
              "aria-describedby": describedBy
            });
            for (const option of options) {
              cards.append(
                el(
                  "label",
                  { className: "tc-card" },
                  el("input", {
                    type: "radio",
                    className: "tc-vh",
                    name: id,
                    value: option.value,
                    checked: option.value === value ? "checked" : null,
                    on: {
                      change: (event) => {
                        if (event.target.checked) commit(option.value);
                      }
                    }
                  }),
                  el(
                    "span",
                    { className: "tc-card-face" },
                    el("span", { className: "tc-card-title", text: option.label }),
                    option.gain ? el("span", { className: "tc-gain", text: option.gain }) : null,
                    option.cost ? el("span", { className: "tc-cost", text: option.cost }) : null
                  )
                )
              );
            }
            return el(
              "div",
              { className: "tc-field tc-field-stacked" },
              describe(definition, id),
              cards
            );
          }
          const select = el("select", {
            "aria-labelledby": `${id}-label`,
            "aria-describedby": describedBy,
            on: { change: (event) => commit(event.target.value) }
          });
          for (const option of options) {
            select.append(
              el("option", {
                value: option.value,
                selected: option.value === value ? "selected" : null,
                text: option.label
              })
            );
          }
          return el(
            "label",
            { className: "tc-field tc-field-inline" },
            describe(definition, id),
            el("span", { className: "tc-control" }, select)
          );
        }
        case "multiselect": {
          const chosen = new Set(value);
          const pills = el("div", {
            className: "tc-pills",
            role: "group",
            "aria-labelledby": `${id}-label`,
            "aria-describedby": describedBy
          });
          for (const option of definition.options ?? []) {
            pills.append(
              el(
                "label",
                { className: "tc-pill" },
                el("input", {
                  type: "checkbox",
                  className: "tc-vh",
                  checked: chosen.has(option.value) ? "checked" : null,
                  on: {
                    change: (event) => {
                      if (event.target.checked) chosen.add(option.value);
                      else chosen.delete(option.value);
                      commit([...chosen]);
                    }
                  }
                }),
                el("span", { className: "tc-pill-face", text: option.label })
              )
            );
          }
          return el(
            "div",
            { className: "tc-field tc-field-stacked" },
            describe(definition, id),
            pills
          );
        }
        case "lines":
          return el(
            "div",
            { className: "tc-field tc-field-stacked" },
            describe(definition, id),
            el("textarea", {
              spellcheck: "false",
              rows: "3",
              "aria-labelledby": `${id}-label`,
              "aria-describedby": describedBy,
              on: {
                change: (event) => commit(event.target.value.split("\n"))
              },
              text: (value ?? []).join("\n")
            })
          );
        default:
          return null;
      }
    }
    function buildLinks() {
      if (!PUBLIC_REPO) return null;
      const link = (href, text) => el("a", { href, target: "_blank", rel: "noopener noreferrer", text });
      return el(
        "p",
        { className: "tc-links" },
        link(LINKS.docs, "Full documentation"),
        el("span", { text: " · ", "aria-hidden": "true" }),
        link(LINKS.issues, "Report an issue"),
        el("span", { text: " · ", "aria-hidden": "true" }),
        link(LINKS.repository, "Source on GitHub")
      );
    }
    function textButton(text, onClick, { variant = null, title = null } = {}) {
      return el("button", {
        type: "button",
        className: variant ? `tc-btn tc-btn-${variant}` : "tc-btn",
        text,
        title,
        on: { click: onClick }
      });
    }
    function buildSheet() {
      const head = el(
        "header",
        { className: "tc-sheet-head" },
        brandMark(),
        el("h2", {}, brandLink(el)),
        el("span", { className: "tc-stamp", text: buildLabel }),
        el("span", { className: "tc-spacer" }),
        iconButton("close", "Close settings (Esc)", closeSettings)
      );
      const content = el("div", { className: "tc-sheet-body" });
      if (getOwn("reading.enabled")) {
        content.append(
          el(
            "p",
            { className: "tc-notice" },
            el("strong", { text: "Reading mode is on. " }),
            "Settings tagged ",
            el("span", { className: "tc-held", text: "Reading mode" }),
            " are held quieter until it is switched off; what you choose here applies then."
          )
        );
      }
      for (const group of GROUPS) {
        const definitions = definitionsFor(group.id);
        if (definitions.length === 0) continue;
        const titleId = `tc-group-${group.id}`;
        const section = el(
          "section",
          { className: "tc-group", "aria-labelledby": titleId },
          el("h3", { className: "tc-group-title", id: titleId, text: group.title })
        );
        for (const definition of definitions) {
          const field = renderField(definition);
          if (field) section.append(field);
        }
        content.append(section);
      }
      const links = buildLinks();
      if (links) content.append(links);
      const foot = el(
        "footer",
        { className: "tc-sheet-foot" },
        el(
          "div",
          { className: "tc-foot-group" },
          // The diagnostics report is the answer to "is it still working when
          // it should be idle?", so it belongs where someone worried about that
          // will actually look, not only in the manager's menu.
          textButton("Copy diagnostics", () => bus.emit(EVENTS.COPY_DIAGNOSTICS), {
            title: "Selector health and how hard the script has been working, for bug reports"
          }),
          textButton(
            "Forget seen posts",
            () => {
              highlighter?.forgetSeen?.();
              bus.emit(EVENTS.TOAST, { message: "Seen-post history cleared" });
            },
            { title: 'Clear the local "new post" history' }
          )
        ),
        el(
          "div",
          { className: "tc-foot-group" },
          textButton(
            "Reset to defaults",
            () => {
              reset();
              closeSettings();
              openSettings();
              bus.emit(EVENTS.TOAST, { message: "Settings reset" });
            },
            { variant: "danger" }
          ),
          textButton("Done", closeSettings, { variant: "primary" })
        )
      );
      return el(
        "div",
        {
          id: SETTINGS_ID,
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Threadcalm settings",
          on: {
            click: (event) => {
              if (event.target.id === SETTINGS_ID) closeSettings();
            }
          }
        },
        el("div", { className: "tc-sheet", role: "document" }, head, content, foot)
      );
    }
    function openSettings() {
      if (sheet) return true;
      sheet = buildSheet();
      document.body.append(sheet);
      (sheet.querySelector(".tc-sheet-body :is(input, select, textarea)") ?? sheet.querySelector("button"))?.focus();
      return true;
    }
    function closeSettings() {
      if (!sheet) return false;
      sheet.remove();
      sheet = null;
      return true;
    }
    return {
      start() {
        build();
        unsubscribes = [
          bus.on(EVENTS.EXPAND_PROGRESS, onProgress),
          bus.on(EVENTS.EXPAND_STATE, onState),
          bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => {
            if ("general.showPanel" in changed) applyVisibility();
            if ("expand.overview" in changed && overviewPill) {
              overviewPill.hidden = !getOwn("expand.overview");
            }
            if ("reading.enabled" in changed && readingPill) {
              readingPill.hidden = !getOwn("reading.enabled");
            }
          })
        ];
      },
      stop() {
        for (const off of unsubscribes) off();
        unsubscribes = [];
        closeSettings();
        panel?.remove();
        panel = null;
      },
      openSettings,
      closeSettings,
      setStatus,
      hide,
      show() {
        update({ "general.showPanel": true });
      },
      /** @returns {boolean} whether the panel is now visible */
      toggle() {
        if (get("general.showPanel")) {
          hide();
          return false;
        }
        update({ "general.showPanel": true });
        return true;
      }
    };
  }

  // src/ui/styles.js
  var STYLES = `
/*
 * Design tokens.
 *
 * The accent is the teal of the script's own icon, not Engage's blue: these
 * windows belong to Threadcalm, and borrowing the host's colour made them read
 * as a broken piece of Engage rather than as a tool of their own. Neutrals are
 * tinted a fraction toward the same teal, which is what makes the set look
 * chosen rather than defaulted.
 *
 * Fonts are the system's. The script makes no network requests, so a webfont
 * is off the table; the character comes from weight, spacing, tabular figures
 * and a monospace stamp instead.
 */
:root {
  --tc-bg: #fcfdfd;
  --tc-inset: #eef3f2;
  --tc-hover: #e5edeb;
  --tc-fg: #162120;
  --tc-muted: #566764;
  --tc-faint: #879794;
  --tc-line: rgba(22, 33, 32, .10);
  --tc-line-strong: rgba(22, 33, 32, .20);
  --tc-accent: #2f6f68;
  --tc-accent-strong: #235650;
  --tc-accent-fg: #ffffff;
  --tc-accent-soft: rgba(47, 111, 104, .10);
  --tc-accent-ring: rgba(47, 111, 104, .32);
  --tc-warn: #b3261e;
  --tc-warn-soft: rgba(179, 38, 30, .08);
  --tc-shadow: 0 1px 2px rgba(15, 25, 24, .06), 0 8px 24px rgba(15, 25, 24, .12);
  --tc-shadow-lg: 0 2px 6px rgba(15, 25, 24, .08), 0 24px 64px rgba(15, 25, 24, .24);
  --tc-backdrop: rgba(12, 20, 19, .36);
  --tc-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%23566764' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  --tc-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --tc-mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;

  /* Also used inside posts. */
  --tc-new: #2f6f68;
  --tc-unanswered: #c19c00;
}

@media (prefers-color-scheme: dark) {
  :root {
    --tc-bg: #151b1b;
    --tc-inset: #1d2525;
    --tc-hover: #253030;
    --tc-fg: #e3eae8;
    --tc-muted: #9dada9;
    --tc-faint: #6d7d7a;
    --tc-line: rgba(227, 234, 232, .09);
    --tc-line-strong: rgba(227, 234, 232, .18);
    --tc-accent: #74bdb3;
    --tc-accent-strong: #97d0c8;
    --tc-accent-fg: #0c1716;
    --tc-accent-soft: rgba(116, 189, 179, .14);
    --tc-accent-ring: rgba(116, 189, 179, .40);
    --tc-warn: #f2b8b5;
    --tc-warn-soft: rgba(242, 184, 181, .10);
    --tc-shadow: 0 1px 2px rgba(0, 0, 0, .30), 0 8px 24px rgba(0, 0, 0, .45);
    --tc-shadow-lg: 0 2px 6px rgba(0, 0, 0, .35), 0 24px 64px rgba(0, 0, 0, .60);
    --tc-backdrop: rgba(0, 0, 0, .50);
    --tc-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' fill='none' stroke='%239dada9' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    --tc-new: #74bdb3;
    --tc-unanswered: #e8c547;
  }
}

/* ------------------------------------------------------------- surfaces -- */

/*
 * Everything the script draws as a window of its own.
 *
 * color-scheme is what fixes the native controls: without it the browser drew
 * number spinners, dropdown lists and scrollbars in their light theme on a
 * dark sheet, as white blobs. Declaring it lets them follow the same theme as
 * the tokens above.
 *
 * The resets are defensive rather than stylistic. Engage styles bare buttons,
 * headings and labels globally, and those rules reach into anything appended
 * to its body.
 */
#tc-panel,
#tc-settings,
#tc-help,
#tc-toasts {
  color-scheme: light dark;
  color: var(--tc-fg);
  font: 13px/1.45 var(--tc-font);
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
}

:is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *,
:is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *::before,
:is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *::after {
  box-sizing: border-box;
}

:is(#tc-panel, #tc-settings, #tc-help) :is(h2, h3, p, dl, dd) { margin: 0; }

:is(#tc-panel, #tc-settings, #tc-help) button {
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

:is(#tc-panel, #tc-settings, #tc-help) :focus-visible {
  outline: 2px solid var(--tc-accent);
  outline-offset: 2px;
}

.tc-icon { display: block; flex: none; }
.tc-mark { display: block; flex: none; }

/*
 * The project name. It links to the repository, but it reads as the title it
 * is: inherited colour, underline only on hover.
 */
:is(#tc-panel, #tc-settings, #tc-help) .tc-brand {
  color: inherit;
  font-weight: 650;
  text-decoration: none;
}

:is(#tc-panel, #tc-settings, #tc-help) .tc-brand:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.tc-stamp {
  color: var(--tc-faint);
  font: 11px/1 var(--tc-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* --------------------------------------------------------------- buttons -- */

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tc-muted);
  transition: background-color .12s ease, color .12s ease;
}

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn:hover {
  background: var(--tc-hover);
  color: var(--tc-fg);
}

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn:active { background: var(--tc-line-strong); }

:is(#tc-panel, #tc-settings, #tc-help) .tc-icon-btn[aria-pressed="true"] {
  background: var(--tc-accent-soft);
  color: var(--tc-accent);
}

#tc-settings .tc-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--tc-line-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--tc-fg);
  font-weight: 500;
  white-space: nowrap;
  transition: background-color .12s ease, border-color .12s ease, color .12s ease;
}

#tc-settings .tc-btn:hover { background: var(--tc-hover); }

#tc-settings .tc-btn-primary {
  border-color: transparent;
  background: var(--tc-accent);
  color: var(--tc-accent-fg);
}

#tc-settings .tc-btn-primary:hover { background: var(--tc-accent-strong); }

#tc-settings .tc-btn-danger {
  border-color: transparent;
  color: var(--tc-warn);
}

#tc-settings .tc-btn-danger:hover { background: var(--tc-warn-soft); }

/* ----------------------------------------------------------------- panel -- */

/*
 * Two lines: who this is, and what it is doing. The status dot sits in the
 * same column as the mark above it and the status text starts where the name
 * does, so the two lines read as one object rather than two stacked rows.
 */
#tc-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  display: grid;
  gap: 4px;
  width: max-content;
  min-width: 260px;
  max-width: min(440px, calc(100vw - 32px));
  padding: 10px 8px 8px 12px;
  border: 1px solid var(--tc-line);
  border-radius: 14px;
  background: var(--tc-bg);
  box-shadow: var(--tc-shadow);
}

#tc-panel[hidden] { display: none; }

#tc-panel .tc-build {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 4px;
  font-size: 12.5px;
}

#tc-panel .tc-build .tc-mark { border-radius: 4px; }
#tc-panel .tc-build .tc-stamp { margin-left: auto; }

.tc-chip-pre {
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--tc-unanswered);
  color: #1b1600;
  font: 650 10px/1 var(--tc-font);
  letter-spacing: .06em;
  text-transform: uppercase;
}

/* On while reading mode is on; also its off switch. */
#tc-panel .tc-mode-pill {
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  background: var(--tc-accent-soft);
  color: var(--tc-accent);
  font: 650 10px/1 var(--tc-font);
  letter-spacing: .06em;
  text-transform: uppercase;
  transition: background-color .12s ease;
}

#tc-panel .tc-mode-pill:hover { background: var(--tc-accent-ring); }
#tc-panel .tc-mode-pill[hidden] { display: none; }

#tc-panel .tc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

#tc-panel .tc-dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin: 0 4.5px;
  border-radius: 50%;
  background: var(--tc-accent);
}

#tc-panel.tc-busy .tc-dot { animation: tc-pulse 1.4s ease-in-out infinite; }
#tc-panel.tc-paused .tc-dot { background: var(--tc-faint); }
#tc-panel.tc-limit .tc-dot { background: var(--tc-warn); }

#tc-panel .tc-status {
  flex: 1 1 auto;
  min-width: 12ch;
  color: var(--tc-muted);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

#tc-panel .tc-tools {
  display: flex;
  gap: 2px;
  margin-left: 6px;
}

/* ----------------------------------------------------------- dialogs ---- */

#tc-settings,
#tc-help {
  position: fixed;
  inset: 0;
  z-index: 2147483001;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--tc-backdrop);
  backdrop-filter: blur(2px);
  animation: tc-fade .16s ease-out;
}

#tc-help { z-index: 2147483002; }

#tc-settings .tc-sheet,
#tc-help .tc-help-card {
  border: 1px solid var(--tc-line);
  border-radius: 16px;
  background: var(--tc-bg);
  box-shadow: var(--tc-shadow-lg);
  animation: tc-rise .2s cubic-bezier(.2, .8, .2, 1);
}

/* ------------------------------------------------------------- settings -- */

/*
 * Header, scrolling body, footer. The header and footer stay put so the way
 * out -- the close button, and Done -- is never scrolled away.
 */
#tc-settings .tc-sheet {
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  max-height: min(86vh, 820px);
  overflow: hidden;
}

#tc-settings .tc-sheet-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px 14px 20px;
  border-bottom: 1px solid var(--tc-line);
}

#tc-settings .tc-sheet-head .tc-mark {
  width: 22px;
  height: 22px;
  border-radius: 6px;
}

#tc-settings .tc-sheet-head h2 {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -.01em;
}

#tc-settings .tc-spacer { flex: 1 1 auto; }

#tc-settings .tc-sheet-body {
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 20px 22px;
  scrollbar-color: var(--tc-line-strong) transparent;
  scrollbar-width: thin;
}

#tc-settings .tc-sheet-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--tc-line);
}

#tc-settings .tc-foot-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Groups are titled in the accent, which is what gives the long sheet its rhythm. */
#tc-settings .tc-group { padding-top: 20px; }

#tc-settings .tc-group-title {
  margin-bottom: 2px;
  color: var(--tc-accent);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
}

/* One row per setting, separated by hairlines rather than boxed. */
#tc-settings .tc-field {
  display: block;
  padding: 12px 0;
  border-top: 1px solid var(--tc-line);
}

#tc-settings .tc-group-title + .tc-field { border-top: 0; }

#tc-settings .tc-field-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

#tc-settings .tc-field-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

#tc-settings .tc-field-stacked .tc-field-text { margin-bottom: 10px; }

/*
 * 500, not something between 500 and 600: system fonts have no such weight,
 * and the browser rounds it up to bold, which made every label shout.
 */
#tc-settings .tc-label {
  color: var(--tc-fg);
  font-weight: 500;
}

#tc-settings .tc-held {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--tc-accent-soft);
  color: var(--tc-accent);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .03em;
  vertical-align: 1px;
}

#tc-settings .tc-notice {
  margin-top: 16px;
  padding: 10px 12px;
  border: 1px solid var(--tc-accent-ring);
  border-radius: 10px;
  background: var(--tc-accent-soft);
  color: var(--tc-fg);
  font-size: 12.5px;
  line-height: 1.5;
}

#tc-settings .tc-notice .tc-held { margin: 0 2px; }

#tc-settings .tc-help {
  max-width: 62ch;
  color: var(--tc-muted);
  font-size: 12px;
  line-height: 1.5;
}

#tc-settings .tc-control {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

/*
 * The native input stays in the document, focusable and labelled; only its
 * appearance is handed to the element drawn beside it.
 */
#tc-settings .tc-vh {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  border: 0;
  white-space: nowrap;
}

/* Switch. */
#tc-settings .tc-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--tc-line-strong);
  cursor: pointer;
  transition: background-color .15s ease;
}

#tc-settings .tc-switch::before {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .28);
  transition: transform .15s ease;
}

#tc-settings .tc-vh:checked + .tc-switch { background: var(--tc-accent); }
#tc-settings .tc-vh:checked + .tc-switch::before { transform: translateX(16px); }

#tc-settings .tc-vh:focus-visible + :is(.tc-switch, .tc-card-face, .tc-pill-face) {
  outline: 2px solid var(--tc-accent);
  outline-offset: 2px;
}

/* Text inputs. */
#tc-settings input[type="number"],
#tc-settings select,
#tc-settings textarea {
  border: 1px solid var(--tc-line-strong);
  border-radius: 8px;
  background-color: var(--tc-inset);
  color: var(--tc-fg);
  font: inherit;
  transition: border-color .12s ease, box-shadow .12s ease;
}

#tc-settings input[type="number"]:hover,
#tc-settings select:hover,
#tc-settings textarea:hover { border-color: var(--tc-faint); }

#tc-settings input[type="number"]:focus,
#tc-settings select:focus,
#tc-settings textarea:focus {
  border-color: var(--tc-accent);
  outline: none;
  box-shadow: 0 0 0 3px var(--tc-accent-ring);
}

/*
 * Numbers without spinners. The spinners were the white blobs; the arrow keys
 * still step the value, and a delay in milliseconds is typed, not clicked.
 */
#tc-settings input[type="number"] {
  width: 92px;
  height: 32px;
  padding: 0 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}

#tc-settings input[type="number"]::-webkit-inner-spin-button,
#tc-settings input[type="number"]::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

#tc-settings .tc-unit {
  width: 2.5ch;
  color: var(--tc-faint);
  font: 12px var(--tc-mono);
}

#tc-settings select {
  height: 32px;
  min-width: 200px;
  max-width: 300px;
  padding: 0 32px 0 10px;
  background-image: var(--tc-chevron);
  background-position: right 10px center;
  background-repeat: no-repeat;
  background-size: 12px;
  cursor: pointer;
  -moz-appearance: none;
  appearance: none;
}

#tc-settings textarea {
  display: block;
  width: 100%;
  min-height: 76px;
  padding: 8px 10px;
  font: 12px/1.5 var(--tc-mono);
  resize: vertical;
}

/*
 * Choices that are trades: a card per option, carrying what it gains and what
 * it costs. Marked with + and a minus sign as well as colour, so the difference
 * survives both themes and a reader who cannot rely on hue.
 */
#tc-settings .tc-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 8px;
}

#tc-settings .tc-card {
  position: relative;
  display: block;
  cursor: pointer;
}

#tc-settings .tc-card-face {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  height: 100%;
  padding: 10px 12px 11px 34px;
  border: 1px solid var(--tc-line-strong);
  border-radius: 10px;
  background: var(--tc-bg);
  transition: border-color .12s ease, background-color .12s ease, box-shadow .12s ease;
}

#tc-settings .tc-card-face::before {
  content: "";
  position: absolute;
  top: 12px;
  left: 12px;
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--tc-line-strong);
  border-radius: 50%;
  background: var(--tc-bg);
  transition: border-color .12s ease, border-width .12s ease;
}

#tc-settings .tc-card:hover .tc-card-face { border-color: var(--tc-faint); }

#tc-settings .tc-vh:checked + .tc-card-face {
  border-color: var(--tc-accent);
  background: var(--tc-accent-soft);
  box-shadow: inset 0 0 0 1px var(--tc-accent);
}

#tc-settings .tc-vh:checked + .tc-card-face::before {
  border-width: 4.5px;
  border-color: var(--tc-accent);
}

#tc-settings .tc-card-title {
  color: var(--tc-fg);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

#tc-settings .tc-gain,
#tc-settings .tc-cost {
  display: flex;
  gap: 6px;
  color: var(--tc-muted);
  font-size: 11.5px;
  line-height: 1.4;
}

#tc-settings .tc-gain::before,
#tc-settings .tc-cost::before {
  flex: none;
  width: .7em;
  font-weight: 700;
}

#tc-settings .tc-gain::before { content: "+"; color: var(--tc-accent); }
#tc-settings .tc-cost::before { content: "−"; color: var(--tc-warn); }

/* Several-of-many choices: pills. */
#tc-settings .tc-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

#tc-settings .tc-pill { cursor: pointer; }

#tc-settings .tc-pill-face {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--tc-line-strong);
  border-radius: 999px;
  color: var(--tc-fg);
  font-size: 12.5px;
  transition: border-color .12s ease, background-color .12s ease, color .12s ease;
}

#tc-settings .tc-pill:hover .tc-pill-face { border-color: var(--tc-faint); }

#tc-settings .tc-vh:checked + .tc-pill-face {
  border-color: var(--tc-accent);
  background: var(--tc-accent-soft);
  color: var(--tc-accent-strong);
  font-weight: 500;
}

#tc-settings .tc-vh:checked + .tc-pill-face::before {
  content: "✓";
  font-weight: 700;
}

#tc-settings .tc-links {
  margin-top: 24px;
  color: var(--tc-faint);
  font-size: 12px;
  text-align: center;
}

#tc-settings .tc-links a,
#tc-help .tc-help-note a {
  color: var(--tc-accent);
  font-weight: 500;
  text-decoration: none;
}

#tc-settings .tc-links a:hover,
#tc-help .tc-help-note a:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ----------------------------------------------------------------- help -- */

#tc-help .tc-help-card {
  width: min(460px, 100%);
  max-height: min(86vh, 720px);
  overflow: auto;
  padding: 18px 16px 20px 22px;
  scrollbar-width: thin;
}

#tc-help .tc-help-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

#tc-help .tc-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: var(--tc-accent);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
}

#tc-help .tc-eyebrow .tc-mark {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

#tc-help h2 {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -.01em;
}

#tc-help .tc-keys {
  display: grid;
  grid-template-columns: max-content 1fr;
  padding-right: 6px;
}

#tc-help .tc-keys dt,
#tc-help .tc-keys dd {
  display: flex;
  align-items: center;
  min-height: 36px;
  border-top: 1px solid var(--tc-line);
}

#tc-help .tc-keys dt:first-of-type,
#tc-help .tc-keys dd:first-of-type { border-top: 0; }

#tc-help .tc-keys dt {
  gap: 4px;
  padding-right: 18px;
}

#tc-help kbd {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  border: 1px solid var(--tc-line-strong);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--tc-inset);
  color: var(--tc-fg);
  font: 600 11.5px/1 var(--tc-mono);
}

#tc-help .tc-help-note {
  margin-top: 16px;
  padding: 14px 6px 0 0;
  border-top: 1px solid var(--tc-line);
  color: var(--tc-muted);
  font-size: 12px;
  line-height: 1.55;
}

/* ---------------------------------------------------------------- toast -- */

#tc-toasts {
  position: fixed;
  right: 16px;
  bottom: 92px;
  z-index: 2147483003;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

#tc-toasts .tc-toast {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 9px 14px 9px 12px;
  border: 1px solid var(--tc-line);
  border-radius: 12px;
  background: var(--tc-bg);
  box-shadow: var(--tc-shadow);
  font-size: 12.5px;
  opacity: 0;
  transform: translateY(6px) scale(.98);
  transition: opacity .18s ease, transform .18s ease;
}

#tc-toasts .tc-toast::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tc-accent);
}

#tc-toasts .tc-toast.tc-in {
  opacity: 1;
  transform: none;
}

#tc-toasts .tc-toast.tc-warn::before { background: var(--tc-warn); }

/* ---------------------------------------------------------------- motion -- */

@keyframes tc-fade { from { opacity: 0; } }

@keyframes tc-rise {
  from {
    opacity: 0;
    transform: translateY(8px) scale(.985);
  }
}

@keyframes tc-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--tc-accent-ring); }
  50% { box-shadow: 0 0 0 4px transparent; }
}

@media (prefers-reduced-motion: reduce) {
  #tc-settings,
  #tc-help,
  #tc-settings .tc-sheet,
  #tc-help .tc-help-card,
  #tc-panel.tc-busy .tc-dot { animation: none; }

  :is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *,
  /* Blanket and therefore !important: it has to beat every transition above. */
  :is(#tc-panel, #tc-settings, #tc-help, #tc-toasts) *::before { transition: none !important; }
}

/* Narrow windows: rows stack, dropdowns take the full width. */
@media (max-width: 540px) {
  #tc-settings { padding: 8px; }
  #tc-settings .tc-field-inline { flex-wrap: wrap; gap: 8px; }
  #tc-settings select {
    width: 100%;
    min-width: 0;
    max-width: none;
  }
  #tc-panel { min-width: 0; }
}

/* ---------------------------------------------- translation compaction -- */

/*
 * The label is collapsed rather than removed: the control keeps its role, its
 * handler and its place in the tab order, and a hover or a Tab press brings
 * the full label back. Nothing here mutates Engage's DOM.
 *
 * Two things make this robust against markup we have not seen:
 *
 * 1. The collapsed state is expressed as ":not(:hover):not(:focus-within)"
 *    rather than as a rule that hover overrides. Undoing an "!important"
 *    author rule from another author rule is unreliable — "revert" goes back
 *    to the user-agent sheet, not to Engage's own styling — so the rule simply
 *    stops applying instead.
 *
 * 2. The label is hidden twice over, because we cannot assume how it is
 *    wrapped. "color: transparent" covers a bare text node; "opacity: 0" on
 *    the children covers a "<span>" that sets its own colour. The glyph uses a
 *    fixed colour rather than "currentColor", which the first rule would
 *    otherwise make invisible too.
 */
.tc-translate-compact {
  position: relative !important;
  vertical-align: middle;
  transition: opacity .12s ease;
}

/*
 * The collapsed box is sized in BOTH directions, which the first version got
 * wrong: clamping only the width left the label to wrap inside a 1.4em column,
 * so the control became a tall stack of hidden lines and cost more vertical
 * space than the link it replaced. A fixed height, no wrapping and no padding
 * make that impossible.
 */
.tc-translate-compact:not(:hover):not(:focus):not(:focus-within) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  width: 16px !important;
  min-width: 0 !important;
  max-width: 16px !important;
  height: 16px !important;
  min-height: 0 !important;
  max-height: 16px !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
  white-space: nowrap !important;
  line-height: 1 !important;
  font-size: 0 !important;
  color: transparent !important;
  opacity: .55;
}

.tc-translate-compact:not(:hover):not(:focus):not(:focus-within) > * {
  opacity: 0 !important;
}

.tc-translate-compact:not(:hover):not(:focus):not(:focus-within)::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 13px;
  height: 13px;
  background-color: var(--tc-muted);
  -webkit-mask: var(--tc-globe) center / contain no-repeat;
  mask: var(--tc-globe) center / contain no-repeat;
}

.tc-translate-hidden { display: none !important; }

/*
 * The wrapper that holds nothing but the control, collapsed with it.
 * Without this the control shrinks but its row keeps its own padding and
 * min-height, so no vertical space is actually won back. Only applied to a
 * wrapper with no other element children (see rowHost in features/translate).
 */
.tc-translate-row {
  min-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  line-height: 1 !important;
}

.tc-translate-row-hidden { display: none !important; }

/* ---------------------------------------------------------- post chrome -- */

/*
 * Action bars and inline composers, quiet until wanted.
 *
 * Never "display: none" and never "visibility: hidden": either would take the
 * buttons out of the tab order, so a keyboard user could not reach Like or
 * Reply at all. Opacity plus pointer-events keeps them focusable, and every
 * quiet rule is written so that :focus-within wins — tabbing into a post
 * reveals its row exactly as hovering does.
 *
 * Both modes are opt-in. "dim" keeps the row's space and only fades it, which
 * never moves anything; "collapse" reclaims the row but makes the post grow as
 * the pointer reaches it. Which of those is the better trade is a matter of
 * taste, so it is a setting rather than a decision made here.
 */
html.tc-quiet-dim .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-collapse .tc-quiet-post [data-testid="overflow-set"] {
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, max-height .12s ease;
}

html.tc-quiet-collapse .tc-quiet-post [data-testid="overflow-set"] {
  max-height: 0;
  overflow: hidden;
}

/*
 * The out-of-flow modes: cluster, cluster-focus and edge.
 *
 * All three win the row's space back for good -- the actions leave the layout
 * when the page loads and never rejoin it, so nothing moves when you point at
 * a post. What they differ in is how much of the post the actions cover while
 * they show, and what summons them.
 *
 * "position: relative" needs !important because Engage sets position on these
 * containers itself with more specific selectors than ours. Losing that
 * contest anchors the actions to the viewport instead of the post, which looks
 * like a bar across the whole window. This is the case the !important
 * convention at the top of this file exists for.
 *
 * The ground is neutral translucent grey over a blur rather than any colour of
 * ours: these sit among Engage's own icons and must suit whichever theme the
 * page is showing, which neither our palette nor Canvas reliably knows.
 */
html.tc-quiet-cluster .tc-quiet-post,
html.tc-quiet-cluster-focus .tc-quiet-post,
html.tc-quiet-edge .tc-quiet-post { position: relative !important; }

html.tc-quiet-cluster .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-cluster-focus .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"] {
  position: absolute;
  bottom: 4px;
  z-index: 4;
  box-sizing: border-box;
  margin: 0;
  opacity: 0;
  transition: opacity .12s ease;
  /*
   * Neutral and translucent, blurred behind: it sits over the post's text,
   * and a fixed colour would be right for only one of Engage's themes.
   */
  border: 1px solid rgba(128, 128, 128, .35);
  background: rgba(128, 128, 128, .14);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .14);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  backdrop-filter: blur(12px) saturate(1.2);
}

/*
 * The cluster hugs its own buttons in a corner, so it costs a corner of the
 * post rather than a line of it: the body stays selectable while you point at
 * it, which a full-width bar makes impossible.
 */
html.tc-quiet-cluster .tc-quiet-post [data-testid="overflow-set"],
html.tc-quiet-cluster-focus .tc-quiet-post [data-testid="overflow-set"] {
  right: 8px;
  left: auto;
  width: max-content;
  max-width: calc(100% - 16px);
  padding: 2px 8px;
  border-radius: 999px;
  pointer-events: none;
}

/* Hover or focus. */
html.tc-quiet-cluster .tc-quiet-post:hover [data-testid="overflow-set"],
html.tc-quiet-cluster .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-cluster [data-testid="overflow-set"]:focus-within {
  opacity: 1;
  pointer-events: auto;
}

/* Focus only: a mouse never summons it, so nothing is ever covered by one. */
html.tc-quiet-cluster-focus .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-cluster-focus [data-testid="overflow-set"]:focus-within {
  opacity: 1;
  pointer-events: auto;
}

/*
 * Edge keeps the familiar full-width bar, and pays for it: the strip has to
 * accept the pointer even while invisible in order to be hoverable at all, so
 * the last line of a post is harder to select, and a touch there can reach a
 * button that cannot be seen. That trade is the setting's to make, not ours.
 */
html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"] {
  left: 0;
  right: 0;
  width: auto;
  padding: 2px 6px;
  border-radius: 6px;
  pointer-events: auto;
}

html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"]:hover,
html.tc-quiet-edge .tc-quiet-post [data-testid="overflow-set"]:focus-within {
  opacity: 1;
}

html.tc-quiet-dim .tc-quiet-post:hover [data-testid="overflow-set"],
html.tc-quiet-dim .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-dim [data-testid="overflow-set"]:focus-within,
html.tc-quiet-collapse .tc-quiet-post:hover [data-testid="overflow-set"],
html.tc-quiet-collapse .tc-quiet-post:focus-within [data-testid="overflow-set"],
html.tc-quiet-collapse [data-testid="overflow-set"]:focus-within {
  opacity: 1;
  pointer-events: auto;
  max-height: 6rem;
  overflow: visible;
}



/*
 * The inline composer's *opener* — the avatar-and-pill that summons an editor.
 *
 * Only the opener is hidden, and it stays hidden: an editor the reader has
 * actually opened is never given this class, so Reply always produces a box
 * that can be typed into. quiet.js decides which is which.
 *
 * The opener does not come back on hover. Pointing at a post to read it is not
 * a request to write, and a composer springing open under the pointer moves
 * everything below it — the distraction this setting exists to remove. Focus
 * is different: it is deliberate, and a keyboard user has no other way in, so
 * :focus-within still reveals it. This is never "display: none", which is what
 * keeps the opener in the tab order for that to work.
 */
html.tc-quiet-composer-on .tc-quiet-composer {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: max-height .14s ease, opacity .14s ease;
}

html.tc-quiet-composer-on .tc-quiet-composer:focus-within {
  max-height: 16rem;
  overflow: visible;
  opacity: 1;
  pointer-events: auto;
}

/*
 * The "a" key: action bars suppressed outright.
 *
 * Last in this section and marked !important because it has to beat every
 * reveal rule above it, including the :hover and :focus-within ones that are
 * more specific than it is.
 *
 * This is the one place the script uses "visibility: hidden" on a control,
 * which the rest of the file is careful never to do. The reason it is safe
 * here is that it is not a default: somebody asked for it with a keypress,
 * the same keypress undoes it, and the shortcut list says so. Leaving the
 * buttons focusable but invisible would be worse -- tabbing would land on
 * controls nobody can see.
 */
html.tc-quiet-hidden .tc-quiet-post [data-testid="overflow-set"] {
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* ------------------------------------------------------------ declutter -- */

.tc-decluttered { display: none !important; }

/* ------------------------------------------------------------ highlight -- */

.tc-unanswered,
.tc-new,
.tc-focus { position: relative; }

.tc-unanswered::before,
.tc-new::before {
  content: "";
  position: absolute;
  left: -6px;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 2px;
  pointer-events: none;
}

.tc-unanswered::before { background: var(--tc-unanswered); }
.tc-new::before { background: var(--tc-new); }
.tc-new.tc-unanswered::before {
  background: linear-gradient(var(--tc-new) 50%, var(--tc-unanswered) 50%);
}

.tc-focus {
  outline: 2px solid var(--tc-accent);
  outline-offset: 3px;
  border-radius: 4px;
}

/* ----------------------------------------------------------- post chips -- */

.tc-post { position: relative; }

/*
 * The copy chip, in whichever corner is free.
 *
 * Engage uses the corners of a post itself -- reactions in one, the action bar
 * along the bottom -- and which one is clear depends on the tenant and the
 * layout, so the corner is a setting rather than a decision made here. The
 * default stays top-right; the class on <html> moves it.
 */
/*
 * Two icon buttons stacked vertically: 26px wide, so the stack sits in the
 * post's own right-hand padding instead of reaching over its text.
 *
 * In the default corner it starts 16px down. Engage draws a post's reactions
 * straddling its top-right edge, reaching about 10px into the post; the old
 * text chip started at 4px and covered the lower part of them. 16px clears
 * them with a small gap, and --tc-chip-top is the one number to move if a
 * layout draws them lower.
 */
.tc-chip {
  --tc-chip-top: 16px;
  position: absolute;
  top: var(--tc-chip-top);
  /* 8px, the same inset as the action cluster, so the two share a right edge. */
  right: 8px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity .12s ease;
}

html.tc-chip-top-left .tc-chip {
  top: 6px;
  bottom: auto;
  left: 4px;
  right: auto;
}

html.tc-chip-bottom-left .tc-chip {
  top: auto;
  bottom: 6px;
  left: 6px;
  right: auto;
}

html.tc-chip-bottom-right .tc-chip {
  top: auto;
  bottom: 6px;
  left: auto;
  right: 8px;
}

/*
 * What summons the chip. Focus always does -- it is the only way a keyboard
 * reaches these buttons at all -- while the pointer does so only in "hover"
 * mode, so a reader who finds them distracting can have them appear for the
 * keyboard alone.
 */
.tc-chip:focus-within { opacity: 1; }
html.tc-chip-hover .tc-post:hover .tc-chip { opacity: 1; }
html.tc-chip-focus .tc-post:focus-within .tc-chip { opacity: 1; }

/*
 * The copy chip is drawn inside a post, so it has to match the post rather
 * than the operating system -- and, it turns out, rather than Canvas too.
 *
 * Our palette follows prefers-color-scheme, the browser's theme, which Engage
 * ignores in favour of its own setting; that once drew a black chip on a white
 * post. Canvas and CanvasText fixed that for a light page, but they follow the
 * page's declared color-scheme, and a page that paints itself dark without
 * declaring it still gets a white Canvas: a white blob on a dark post.
 *
 * The one colour guaranteed to contrast with a post is the colour of its own
 * text. So the buttons inherit it, and everything else is neutral grey at low
 * opacity, which reads on either background. No lookup, no guess about which
 * theme is showing.
 */
.tc-chip .tc-chip-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(128, 128, 128, .38);
  border-radius: 8px;
  background: rgba(128, 128, 128, .10);
  color: inherit;
  cursor: pointer;
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  transition: background-color .12s ease, border-color .12s ease;
}

.tc-chip .tc-chip-btn .tc-icon {
  width: 14px;
  height: 14px;
  opacity: .72;
  transition: opacity .12s ease;
}

.tc-chip .tc-chip-btn:hover {
  border-color: rgba(128, 128, 128, .65);
  background: rgba(128, 128, 128, .20);
}

.tc-chip .tc-chip-btn:hover .tc-icon { opacity: 1; }

.tc-chip .tc-chip-btn:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

/* --------------------------------------------------------- reading mode -- */

/*
 * Reading mode is mostly other features' settings, overridden. The one thing
 * it draws itself is the app bar going away. Search, the app launcher and the
 * account menu go with it, which is why there is a setting to keep it.
 */
html.tc-no-banner [role="banner"] { display: none !important; }

@media (prefers-reduced-motion: reduce) {
  #tc-toasts .tc-toast,
  .tc-translate-compact,
  .tc-chip { transition: none; }
}
`;
  var GLOBE_MASK = `
:root {
  --tc-globe: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="none" stroke="black" stroke-width="1.2"><circle cx="8" cy="8" r="6.2"/><ellipse cx="8" cy="8" rx="2.6" ry="6.2"/><path d="M2 6h12M2 10h12"/></g></svg>');
}
`;
  var ALL_STYLES = GLOBE_MASK + STYLES;

  // src/ui/toast.js
  var CONTAINER_ID = "tc-toasts";
  var VISIBLE_MS = 2600;
  var MAX_VISIBLE = 3;
  function createToaster() {
    let container = null;
    let unsubscribe = null;
    const keyed = /* @__PURE__ */ new Map();
    function ensureContainer() {
      if (container?.isConnected) return container;
      container = el("div", { id: CONTAINER_ID, role: "status", "aria-live": "polite" });
      document.body.append(container);
      return container;
    }
    function dismiss(toast, key) {
      toast.classList.remove("tc-in");
      setTimeout(() => toast.remove(), 250);
      if (key && keyed.get(key)?.toast === toast) keyed.delete(key);
    }
    function show({ message, tone = "info", duration = VISIBLE_MS, key = null }) {
      if (!message) return;
      const host = ensureContainer();
      const current2 = key ? keyed.get(key) : null;
      if (current2?.toast.isConnected) {
        current2.toast.textContent = message;
        current2.toast.classList.toggle("tc-warn", tone === "warn");
        clearTimeout(current2.timer);
        current2.timer = setTimeout(() => dismiss(current2.toast, key), duration);
        return;
      }
      while (host.children.length >= MAX_VISIBLE) host.firstElementChild?.remove();
      const toast = el("div", {
        className: `tc-toast${tone === "warn" ? " tc-warn" : ""}`,
        text: message
      });
      host.append(toast);
      requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("tc-in")));
      const timer = setTimeout(() => dismiss(toast, key), duration);
      if (key) keyed.set(key, { toast, timer });
    }
    return {
      start() {
        unsubscribe = bus.on(EVENTS.TOAST, show);
      },
      stop() {
        unsubscribe?.();
        unsubscribe = null;
        container?.remove();
        container = null;
      },
      show
    };
  }

  // src/main.js
  var VERSION = true ? "1.1.1" : "0.0.0-dev";
  var CHANNEL = true ? "stable" : "dev";
  var BUILD = true ? "8921ab1" : "dev";
  var MATCHER_KEYS = [
    "general.languages",
    "advanced.extraExpandReplies",
    "advanced.extraExpandText",
    "advanced.extraPromoted"
  ];
  function interfaceLanguages() {
    return resolveLanguages(pageLanguage(), get("general.languages"));
  }
  function languageName(code) {
    try {
      return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  }
  function noticeUnsupportedLanguage() {
    const { page, supported } = interfaceLanguages();
    if (supported) return;
    const message = `Engage is in ${languageName(page)}, which Threadcalm has no labels for yet: threads, "See more" and translation work, but "Show previous comments" and sponsored cards are not recognised.`;
    log.warn(message);
    const key = `language-notice-${page}`;
    if (getValue(key, false)) return;
    setValue(key, true);
    bus.emit(EVENTS.TOAST, { message, tone: "warn", duration: 9e3 });
  }
  function main() {
    load();
    let matchers = buildMatchers(interfaceLanguages().codes, customPatterns());
    addStyle(ALL_STYLES);
    const expander = createExpander({ matchers });
    const translate = createTranslateTamer({ matchers });
    const declutter = createDeclutterer({ matchers });
    const highlighter = createHighlighter({ matchers });
    const quietChrome = createQuietChrome();
    const readingMode = createReadingMode();
    const copyTools = createCopyTools({ expander, translate });
    const toaster = createToaster();
    const panel = createPanel({
      expander,
      highlighter,
      version: VERSION,
      channel: CHANNEL,
      build: BUILD
    });
    const shortcuts = createShortcuts({
      expander,
      copyTools,
      readingMode,
      panel,
      quietChrome
    });
    const features = [
      // First, so its overrides are in place before anything else reads a
      // setting; otherwise the page would briefly render without them.
      readingMode,
      expander,
      translate,
      declutter,
      highlighter,
      quietChrome,
      copyTools,
      toaster,
      panel,
      shortcuts
    ];
    const dispatch = (hook, payload) => {
      for (const feature of features) {
        feature[hook]?.(payload);
      }
    };
    bus.on(EVENTS.NAVIGATE, (payload) => dispatch("onNavigate", payload));
    bus.on(EVENTS.DOM_CHANGED, () => dispatch("onDomChanged"));
    bus.on(EVENTS.COPY_DIAGNOSTICS, () => {
      copyDiagnostics();
    });
    bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => {
      if (MATCHER_KEYS.some((key) => key in changed)) {
        matchers = buildMatchers(interfaceLanguages().codes, customPatterns());
        for (const feature of features) feature.setMatchers?.(matchers);
      }
      dispatch("onSettingsChanged", changed);
    });
    for (const feature of features) feature.start?.();
    noticeUnsupportedLanguage();
    startSpaWatcher();
    registerMenuCommands({ expander, panel, shortcuts, copyTools, readingMode });
    log.info(`v${VERSION} (${CHANNEL} ${BUILD}) ready on ${location.host}`);
    setTimeout(() => {
      if (rootPosts().length === 0 && document.querySelector('[role="main"]')) {
        log.warn(
          'no posts recognised on this page. If this is a feed or a thread, the markup has probably changed - use the "Copy layout diagnostics" menu command when reporting it.'
        );
      }
    }, 5e3);
  }
  function registerMenuCommands({ expander, panel, shortcuts, copyTools, readingMode }) {
    registerMenuCommand("Settings…", () => panel.openSettings());
    registerMenuCommand("Keyboard shortcuts…", () => shortcuts.showHelp());
    registerMenuCommand("Pause / resume automatic expansion", () => {
      const paused = expander.togglePause();
      bus.emit(EVENTS.TOAST, { message: paused ? "Expansion paused" : "Expansion resumed" });
    });
    registerMenuCommand("Expand everything on this page now", () => {
      expander.rescan();
      bus.emit(EVENTS.TOAST, { message: "Rescanning this page…" });
    });
    registerMenuCommand("Copy the first thread on this page", () => {
      copyTools.copyThread(rootPosts()[0]);
    });
    registerMenuCommand("Toggle reading mode", () => {
      const on = readingMode.toggle();
      bus.emit(EVENTS.TOAST, { message: on ? "Reading mode on" : "Reading mode off" });
    });
    registerMenuCommand("Show the Threadcalm panel", () => panel.show());
    registerMenuCommand("Copy layout diagnostics (for bug reports)", copyDiagnostics);
  }
  var HEALTH_SELECTORS = [
    ['[role="main"]', "main landmark"],
    ['[role="banner"]', "app banner"],
    [".qaContentMainColumn", "main column"],
    ['[role="article"], article', "semantic posts"],
    [".qaThreadStarter", "thread starter"],
    [".y-fixedGridColumn", "comment containers"],
    ['[data-testid="overflow-set"]', "action rows"],
    [".tc-quiet-post", "posts tagged by Threadcalm"],
    [".tc-translate-compact, .tc-translate-hidden", "translate controls handled"]
  ];
  function activityLines() {
    const stats = snapshot();
    const idle = stats.sinceLastScanSeconds;
    return [
      "",
      "activity since load:",
      `  ${String(stats.uptimeSeconds).padStart(7)}  seconds running`,
      `  ${String(stats.scans).padStart(7)}  scans`,
      `  ${String(stats.candidates).padStart(7)}  controls examined`,
      `  ${String(stats.layoutReads).padStart(7)}  layout reads (innerText)`,
      `  ${String(stats.layoutSkips).padStart(7)}  skipped without layout`,
      `  ${String(stats.domNodes).padStart(7)}  elements on the page now`,
      `  ${String(idle === null ? "never" : idle).padStart(7)}  seconds since the last scan`,
      "",
      "On an idle page the first four should barely move between two readings",
      "taken minutes apart. A rising element count means the page is still",
      "growing, which is expansion working rather than anything leaking."
    ];
  }
  async function copyDiagnostics() {
    const control = document.querySelector(".tc-translate-compact, .tc-translate-hidden") ?? document.querySelector("[data-tc-title]");
    const lines = [
      `Threadcalm ${VERSION} (${CHANNEL} ${BUILD})`,
      `${navigator.userAgent}`,
      `host: ${location.host}`,
      "",
      "selector health:"
    ];
    for (const [selector, label] of HEALTH_SELECTORS) {
      let count = 0;
      try {
        count = document.querySelectorAll(selector).length;
      } catch {
        count = -1;
      }
      lines.push(`  ${String(count).padStart(4)}  ${label}  (${selector})`);
    }
    const { page, codes, supported } = interfaceLanguages();
    lines.push(
      "",
      `interface language: ${page ?? "(not declared)"}${supported ? "" : " (no label set)"}`,
      `label sets in use: ${codes.length ? codes.join(", ") : "en (fallback)"}`
    );
    lines.push("", `posts resolved: ${rootPosts().length}`);
    lines.push(...activityLines(), "");
    if (!control) {
      lines.push("No translate control found on this page.");
    } else {
      lines.push("translate control, then ancestors:");
      let node2 = control;
      for (let depth = 0; node2 && depth < 6; depth += 1) {
        const style = getComputedStyle(node2);
        const rect = node2.getBoundingClientRect();
        const describe = [
          node2.tagName.toLowerCase(),
          node2.getAttribute("role") ? `role=${node2.getAttribute("role")}` : "",
          `display:${style.display}`,
          `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          `pad:${style.paddingTop}/${style.paddingBottom}`,
          `margin:${style.marginTop}/${style.marginBottom}`,
          `minH:${style.minHeight}`,
          `children:${node2.children.length}`,
          node2.classList.contains("tc-translate-row") ? "[row-collapsed]" : "",
          node2.classList.contains("tc-translate-compact") ? "[compacted]" : ""
        ].filter(Boolean).join("  ");
        lines.push(`${"  ".repeat(depth)}${describe}`);
        node2 = node2.parentElement;
      }
    }
    const report = lines.join("\n");
    const copied = await copyToClipboard(report);
    bus.emit(EVENTS.TOAST, {
      message: copied ? "Diagnostics copied" : "Clipboard blocked — see the console",
      tone: copied ? "info" : "warn"
    });
    if (!copied) log.info(report);
  }
  if (document.body) {
    main();
  } else {
    document.addEventListener("DOMContentLoaded", main, { once: true });
  }
})();
