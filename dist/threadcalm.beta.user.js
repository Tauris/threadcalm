// ==UserScript==
// @name        Threadcalm (beta)
// @namespace   https://github.com/Tauris/threadcalm#beta
// @version     1.0.1
// @description Expand whole Viva Engage threads automatically, copy them as Markdown, and read them with shortcuts, a reading mode and less clutter.
// @author      Jörg Türmer
// @icon        data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2040%2040%22%3E%3Crect%20width%3D%2240%22%20height%3D%2240%22%20rx%3D%2210%22%20fill%3D%22%232f6f68%22%2F%3E%3Cg%20transform%3D%22translate(4%204)%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%222.4%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M5%208h22%22%2F%3E%3Cpath%20d%3D%22M11%2016h16%22%2F%3E%3Cpath%20d%3D%22M17%2024h10%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E
// @license     BSD-3-Clause
// @homepageURL https://github.com/Tauris/threadcalm
// @supportURL  https://github.com/Tauris/threadcalm/issues
// @downloadURL https://github.com/Tauris/threadcalm/raw/beta/dist/threadcalm.beta.user.js
// @updateURL   https://github.com/Tauris/threadcalm/raw/beta/dist/threadcalm.beta.user.js
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
 * Threadcalm (beta) v1.0.1
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
    SHOW_HELP: "show-help"
  };

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
  function accessibleTexts(element) {
    if (!(element instanceof HTMLElement)) return [];
    const texts = [visibleText(element)];
    for (const attribute of TEXT_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value) texts.push(value);
    }
    return texts.filter(Boolean).map(normalizeText).filter((text) => text.length > 0);
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
    let node = element.parentElement;
    let depth = 0;
    while (node && depth < 6) {
      if (boundary && node === boundary) break;
      if (node.matches(INTERACTIVE_SELECTOR)) return node;
      node = node.parentElement;
      depth += 1;
    }
    return element;
  }
  var ACTION_ROW_SELECTOR = '[data-testid="overflow-set"]';
  var POST_SELECTOR = '[role="article"], article, .qaThreadStarter, .y-fixedGridColumn';
  var SEMANTIC_POST_SELECTOR = '[role="article"], article';
  function looksLikePost(element) {
    return element.querySelector(ACTION_ROW_SELECTOR) !== null;
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
  function postContainerFor(actionRow) {
    if (!(actionRow instanceof HTMLElement)) return null;
    let node = actionRow.parentElement;
    let depth = 0;
    while (node && depth < 8) {
      if (node.matches(POST_SELECTOR)) return node;
      node = node.parentElement;
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
    const node = document.createElement(tag);
    const { className, text, html, dataset, style, on, ...attributes } = options;
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    if (html != null) node.innerHTML = html;
    if (dataset) Object.assign(node.dataset, dataset);
    if (style) Object.assign(node.style, style);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === false || value == null) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const [event, handler] of Object.entries(on ?? {})) {
      node.addEventListener(event, handler);
    }
    node.append(...children.filter((child) => child != null));
    return node;
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
      showOriginal: ["^(?:show|see)\\s+original(?:\\s+post)?$", "^undo\\s+translation$"],
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
      showOriginal: ["^Original\\s+anzeigen$", "^Übersetzung\\s+rückgängig"],
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
      showOriginal: ["^(?:afficher|voir)\\s+l[’']original$"],
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
      showOriginal: ["^(?:mostrar|ver)\\s+original$"],
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
      showOriginal: ["^origineel\\s+weergeven$"],
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
      showOriginal: ["^mostra\\s+originale$"],
      promoted: ["^sponsorizzato$", "^suggerito$"],
      menu: ["altre opzioni", "altre azioni", "menù", "impostazioni"]
    }
  };
  var AVAILABLE_LANGUAGES = Object.keys(LABEL_PACKS);
  var LANGUAGE_NAMES = Object.fromEntries(
    Object.entries(LABEL_PACKS).map(([code, pack]) => [code, pack.name])
  );
  function compile(patterns) {
    const usable = patterns.filter((pattern) => {
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
  var DETECTABLE_LANGUAGES = Object.keys(STOP_WORDS);
  var MAX_WORDS = 120;
  var MIN_WORDS = 8;
  function tokenize(text) {
    return String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/https?:\/\/\S+/g, " ").replace(/[^a-zß\s]/g, " ").split(/\s+/).filter(Boolean);
  }
  function detectLanguage(text) {
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
  var detectableOptions = DETECTABLE_LANGUAGES.map((code) => ({
    value: code,
    label: LANGUAGE_NAMES[code] ?? code.toUpperCase()
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
      key: "expand.truncatedText",
      type: "boolean",
      default: true,
      label: "Expand truncated post text",
      help: 'Also click "See more" inside a post body.'
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
      help: 'Used by "Hide when I read the language". Detection is a stop-word guess and needs a sentence or two of text.'
    },
    {
      key: "translate.minConfidence",
      type: "number",
      default: 0.55,
      min: 0,
      max: 1,
      step: 0.05,
      label: "Minimum detection confidence",
      help: "Below this the control is only compacted, never hidden."
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
      label: "Compact reading mode",
      help: "Narrower column, tighter spacing, quieter chrome."
    },
    {
      key: "reading.maxWidth",
      type: "number",
      default: 760,
      min: 480,
      max: 1600,
      step: 20,
      label: "Reading column width (px)"
    },
    {
      key: "reading.hideSidebars",
      type: "boolean",
      default: true,
      label: "Hide side rails in reading mode"
    },
    {
      key: "reading.hideBanner",
      type: "boolean",
      default: false,
      label: "Hide the top app bar in reading mode",
      help: "Reclaims the sticky header. Search and the app launcher go with it, so this is off by default."
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
      key: "copy.showButtons",
      type: "boolean",
      default: true,
      label: "Show copy buttons on posts",
      help: 'Adds "copy thread" and "copy link" actions to each post header.'
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
      default: ["en", "de"],
      label: "Interface languages to recognise",
      options: languageOptions,
      help: "Which label sets to match against. Add your tenant language here if controls are not found."
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
        if (definition) next[key] = coerce(definition, value);
      }
    }
    current = next;
    setDebug(current["general.debug"]);
    return current;
  }
  function get(key) {
    if (!BY_KEY.has(key)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    return current[key];
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
    const observer = new MutationObserver(() => {
      announceDomChange();
      announceNavigation();
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
  function extractAuthor(article) {
    const profileLink = article.querySelector(
      'a[href*="/users/"], a[href*="/people/"], a[href*="userId="], a[data-testid*="author" i]'
    );
    if (profileLink) {
      const name = normalizeText(visibleText(profileLink));
      if (name && name.length < 80) return name;
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
    for (const node of article.querySelectorAll("a, span")) {
      const text = normalizeText(visibleText(node));
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
      for (const node of clone.querySelectorAll(selector)) node.remove();
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
    if (kept[0] && kept[0] === author) kept.shift();
    return kept.join("\n");
  }
  function directReplies(article) {
    const nested = [...article.querySelectorAll(POST_SELECTOR)].filter(isVisible);
    return nested.filter(
      (candidate) => !nested.some((other) => other !== candidate && other.contains(candidate))
    );
  }
  function extractPost(article, depth = 0) {
    if (!(article instanceof HTMLElement) || depth > 6) return null;
    const replies = directReplies(article).map((reply) => extractPost(reply, depth + 1)).filter(Boolean);
    const post = {
      author: extractAuthor(article),
      body: extractBody(article),
      timestamp: extractTimestamp(article),
      permalink: extractPermalink(article),
      replies
    };
    if (!post.body && replies.length === 0) return null;
    return post;
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
      sourceUrl = location.href
    } = options;
    const lines = [];
    const stamp = (entry) => {
      if (!includeTimestamps) return "";
      const { iso, display } = entry.timestamp;
      const shown = iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) : display;
      return shown ? ` — ${shown}` : "";
    };
    if (format === "markdown") {
      lines.push(`## ${post.author}${stamp(post)}`, "");
      if (post.body) lines.push(post.body, "");
      const walk = (entry, depth) => {
        const prefix = "> ".repeat(depth);
        lines.push(`${prefix}**${entry.author}**${stamp(entry)}`);
        lines.push(prefix.trimEnd());
        for (const line of entry.body.split("\n")) {
          lines.push(`${prefix}${line}`);
        }
        lines.push(prefix.trimEnd());
        for (const child of entry.replies) walk(child, depth + 1);
      };
      for (const reply of post.replies) walk(reply, 1);
      if (includePermalink) {
        const url = post.permalink ?? sourceUrl;
        lines.push("", `[Open in Viva Engage](${url})`);
      }
    } else {
      lines.push(`${post.author}${stamp(post)}`, "");
      if (post.body) lines.push(post.body, "");
      const walk = (entry, depth) => {
        const indent = "    ".repeat(depth);
        lines.push(`${indent}${entry.author}${stamp(entry)}`);
        for (const line of entry.body.split("\n")) {
          lines.push(`${indent}  ${line}`);
        }
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
  var HOST_CLASS = "tc-post";
  function createCopyTools({ expander }) {
    const decorated = /* @__PURE__ */ new WeakMap();
    function toast(message, tone = "info") {
      bus.emit(EVENTS.TOAST, { message, tone });
    }
    function renderOptions() {
      return {
        format: get("copy.format"),
        includeTimestamps: get("copy.includeTimestamps"),
        includePermalink: get("copy.includePermalink")
      };
    }
    async function copyThread(article, { expandFirst = true } = {}) {
      if (!article) {
        toast("No post found to copy", "warn");
        return false;
      }
      if (expandFirst && expander) {
        const clicks = expander.expandWithin(article);
        if (clicks > 0) {
          toast(`Expanding ${clicks} more section${clicks === 1 ? "" : "s"}…`);
          await new Promise(
            (resolve) => setTimeout(resolve, get("expand.settleDelayMs"))
          );
        }
      }
      const post = extractPost(article);
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
      const post = article ? extractPost(article) : null;
      const url = post?.permalink ?? location.href;
      const copied = await copyToClipboard(url);
      toast(copied ? "Link copied" : "Clipboard was blocked by the browser", copied ? "info" : "warn");
      return copied;
    }
    function buildChip(article) {
      return el(
        "div",
        { className: CHIP_CLASS, role: "group", "aria-label": "Threadcalm post actions" },
        el("button", {
          type: "button",
          title: "Copy this thread (c)",
          "aria-label": "Copy this thread",
          text: "copy",
          on: {
            click: (event) => {
              event.preventDefault();
              event.stopPropagation();
              copyThread(article);
            }
          }
        }),
        el("button", {
          type: "button",
          title: "Copy a link to this thread (y)",
          "aria-label": "Copy a link to this thread",
          text: "link",
          on: {
            click: (event) => {
              event.preventDefault();
              event.stopPropagation();
              copyLink(article);
            }
          }
        })
      );
    }
    function sweep() {
      if (!get("copy.showButtons")) return;
      for (const article of rootPosts()) {
        const existing = decorated.get(article);
        if (existing && existing.isConnected && article.contains(existing)) continue;
        const chip = buildChip(article);
        article.classList.add(HOST_CLASS);
        article.append(chip);
        decorated.set(article, chip);
      }
    }
    function removeChips() {
      for (const chip of document.querySelectorAll(`.${CHIP_CLASS}`)) chip.remove();
      for (const host of document.querySelectorAll(`.${HOST_CLASS}`)) {
        host.classList.remove(HOST_CLASS);
      }
    }
    const scheduleSweep = debounce(() => sweep(), 300);
    return {
      start: sweep,
      stop: removeChips,
      onDomChanged: scheduleSweep,
      onNavigate: scheduleSweep,
      onSettingsChanged() {
        if (get("copy.showButtons")) sweep();
        else removeChips();
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
        const texts = accessibleTexts(element).filter((text) => text.length <= MAX_LABEL_LENGTH);
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
  function createExpander({ matchers }) {
    let active = matchers;
    let running = true;
    let paused = false;
    let scanTimer = null;
    let settleTimer = null;
    let heartbeat = null;
    let totalClicks = 0;
    let quietPasses = 0;
    let limitReached = false;
    let clicked = /* @__PURE__ */ new WeakSet();
    function publishState() {
      bus.emit(EVENTS.EXPAND_STATE, {
        enabled: get("expand.enabled"),
        paused,
        totalClicks,
        limitReached
      });
    }
    function inScope() {
      if (!get("expand.enabled") || paused) return false;
      return get("expand.scope") !== "thread" || isThreadView();
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
      const texts = accessibleTexts(element).filter((text) => text.length <= MAX_LABEL_LENGTH2);
      if (isMenuLike(element, texts)) return null;
      if (isStructuralReplyCount(element)) {
        return isVisible(element) ? "reply-count" : null;
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
        return isVisible(element) ? "truncation" : null;
      }
      return null;
    }
    function findControls(root = document) {
      const found = [];
      const seenTargets = /* @__PURE__ */ new Set();
      for (const element of root.querySelectorAll(CANDIDATE_SELECTOR)) {
        const kind = classify(element);
        if (!kind) continue;
        const target = nearestClickable(element, closestPost(element));
        if (!target || clicked.has(target) || seenTargets.has(target)) continue;
        seenTargets.add(target);
        found.push({ kind, element, target });
      }
      return found;
    }
    function clickBatch(root = document) {
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
      let clicks = 0;
      for (const { kind, target } of findControls(root)) {
        if (clicks >= maxPerScan || totalClicks >= maxTotal) break;
        clicked.add(target);
        try {
          target.click();
        } catch (error) {
          log.debug("click failed", error, target);
          continue;
        }
        clicks += 1;
        totalClicks += 1;
        log.debug(`clicked ${kind}`, target);
      }
      return clicks;
    }
    function scan() {
      scanTimer = null;
      if (!running || !inScope()) return;
      const clicks = clickBatch();
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
      scanTimer = setTimeout(scan, get("expand.scanDelayMs"));
    }
    function restartHeartbeat() {
      clearInterval(heartbeat);
      heartbeat = null;
      const interval = get("expand.heartbeatMs");
      if (interval > 0) heartbeat = setInterval(schedule, interval);
    }
    function reset2() {
      totalClicks = 0;
      quietPasses = 0;
      limitReached = false;
      clicked = /* @__PURE__ */ new WeakSet();
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
      },
      /** Called by the SPA watcher; a new route means new counters. */
      onNavigate() {
        reset2();
        schedule();
      },
      onDomChanged() {
        schedule();
      },
      onSettingsChanged(changed) {
        if ("expand.heartbeatMs" in changed) restartHeartbeat();
        if ("expand.maxTotalClicks" in changed) limitReached = false;
        publishState();
        schedule();
      },
      /** Re-reads label packs after the user edits languages or patterns. */
      setMatchers(next) {
        active = next;
        schedule();
      },
      /** Forgets the click history and runs a fresh pass immediately. */
      rescan() {
        reset2();
        scan();
      },
      pause() {
        paused = true;
        clearTimeout(scanTimer);
        clearTimeout(settleTimer);
        scanTimer = settleTimer = null;
        publishState();
      },
      resume() {
        paused = false;
        publishState();
        schedule();
      },
      togglePause() {
        if (paused) this.resume();
        else this.pause();
        return paused;
      },
      isPaused: () => paused,
      /** Expands one subtree only — used by the "expand this post" shortcut. */
      expandWithin(root) {
        return clickBatch(root);
      },
      get stats() {
        return { totalClicks, paused, limitReached };
      },
      // Exposed for the test suite.
      _internals: { classify, findControls }
    };
  }

  // src/features/highlight.js
  var UNANSWERED_CLASS = "tc-unanswered";
  var NEW_CLASS = "tc-new";
  var STORAGE_KEY2 = "seen-posts";
  var MAX_SEEN = 3e3;
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
        for (const text of accessibleTexts(element)) {
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
  var MAX_LABEL_LENGTH3 = 40;
  var MAX_LONE_ANCESTORS = 2;
  function loneAncestors(element) {
    const found = [];
    let node = element;
    for (let depth = 0; depth < MAX_LONE_ANCESTORS; depth += 1) {
      const parent = node.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      if (parent.children.length !== 1) break;
      found.push(parent);
      node = parent;
    }
    return found;
  }
  function createQuietChrome() {
    function applyModes() {
      const root = document.documentElement;
      const mode = get("quiet.actions");
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
          const names = accessibleTexts(element).filter(
            (text) => text.length <= MAX_LABEL_LENGTH3
          );
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
    function restore() {
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
          applyModes();
          sweep();
        }
      },
      sweep
    };
  }

  // src/features/reading.js
  var READING_CLASS = "tc-reading";
  var NO_RAILS_CLASS = "tc-no-rails";
  var NO_BANNER_CLASS = "tc-no-banner";
  function createReadingMode() {
    function apply() {
      const root = document.documentElement;
      const enabled = get("reading.enabled");
      root.classList.toggle(READING_CLASS, enabled);
      root.classList.toggle(NO_RAILS_CLASS, enabled && get("reading.hideSidebars"));
      root.classList.toggle(NO_BANNER_CLASS, enabled && get("reading.hideBanner"));
      root.style.setProperty("--tc-reading-width", `${get("reading.maxWidth")}px`);
    }
    return {
      start: apply,
      stop() {
        document.documentElement.classList.remove(READING_CLASS, NO_RAILS_CLASS, NO_BANNER_CLASS);
      },
      onSettingsChanged: apply,
      onNavigate: apply,
      toggle() {
        update({ "reading.enabled": !get("reading.enabled") });
        return get("reading.enabled");
      },
      isEnabled: () => get("reading.enabled")
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
  var SEEN_KEY = "help-seen";
  var BINDINGS = [
    { keys: ["j"], label: "Next post" },
    { keys: ["k"], label: "Previous post" },
    { keys: ["o"], label: "Expand the focused post" },
    { keys: ["c"], label: "Copy the focused thread" },
    { keys: ["y"], label: "Copy a link to the focused thread" },
    { keys: ["e"], label: "Pause or resume automatic expansion" },
    { keys: ["r"], label: "Toggle reading mode" },
    { keys: ["t"], label: "Cycle the translation-control mode" },
    { keys: ["s"], label: "Open settings" },
    { keys: ["p"], label: "Show or hide the status panel" },
    { keys: ["?"], label: "Show this help" },
    { keys: ["Escape"], label: "Close help or settings" }
  ];
  var TRANSLATE_MODES = ["compact", "known", "hide", "off"];
  function createShortcuts({ expander, copyTools, readingMode, panel }) {
    let focusIndex = -1;
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
      if (focusIndex >= 0 && focusIndex < list.length) return list[focusIndex];
      const firstVisible = list.findIndex((post) => post.getBoundingClientRect().bottom > 80);
      focusIndex = firstVisible >= 0 ? firstVisible : 0;
      return list[focusIndex];
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
          el("h2", { text: "Keyboard shortcuts" }),
          el(
            "dl",
            {},
            ...BINDINGS.flatMap((binding) => [
              el("dt", {}, ...binding.keys.map((key) => el("kbd", { text: key }))),
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
        case "e": {
          const paused = expander.togglePause();
          toast(paused ? "Expansion paused" : "Expansion resumed");
          break;
        }
        case "r":
          toast(readingMode.toggle() ? "Reading mode on" : "Reading mode off");
          break;
        case "t":
          cycleTranslateMode();
          break;
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
  var MAX_LABEL_LENGTH4 = 40;
  function createTranslateTamer({ matchers }) {
    let active = matchers;
    const languageCache = /* @__PURE__ */ new WeakMap();
    function detectFor(article) {
      if (!article) return { language: null, confidence: 0 };
      const cached = languageCache.get(article);
      if (cached) return cached;
      const clone = article.cloneNode(true);
      for (const nested of clone.querySelectorAll(POST_SELECTOR)) nested.remove();
      const result = detectLanguage(visibleText(clone));
      languageCache.set(article, result);
      return result;
    }
    function classify(element) {
      const texts = accessibleTexts(element).filter((text) => text.length <= MAX_LABEL_LENGTH4);
      if (texts.length === 0) return null;
      if (active.showOriginal && texts.some((text) => active.showOriginal.test(text))) {
        return "original";
      }
      if (active.translate && texts.some((text) => active.translate.test(text))) {
        return "translate";
      }
      return null;
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
        const label = accessibleTexts(element)[0];
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
        if (mode === "off") {
          clear(element);
          continue;
        }
        element.dataset[MARKER] = kind;
        if (kind === "original") {
          apply(element, { compact: true, hidden: false });
          compacted += 1;
          continue;
        }
        let shouldHide = mode === "hide";
        if (mode === "known") {
          const known = get("translate.knownLanguages");
          const minConfidence = get("translate.minConfidence");
          const { language, confidence } = detectFor(closestPost(element));
          shouldHide = Boolean(language) && confidence >= minConfidence && known.includes(language);
        }
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
        sweep();
      },
      stop() {
        scheduleSweep.cancel();
        for (const element of document.querySelectorAll(`.${COMPACT_CLASS}, .${HIDDEN_CLASS2}, .${ROW_CLASS}, .${ROW_HIDDEN_CLASS}`)) {
          clear(element);
        }
      },
      onDomChanged() {
        scheduleSweep();
      },
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
    let statusText = null;
    let pauseButton = null;
    let sheet = null;
    let unsubscribes = [];
    function build() {
      statusText = el("span", { className: "tc-status", text: "Watching for threads…" });
      pauseButton = el("button", {
        type: "button",
        text: "Pause",
        title: "Pause automatic expansion (e)",
        on: { click: () => expander.togglePause() }
      });
      panel = el(
        "div",
        { id: PANEL_ID, role: "status", "aria-live": "polite" },
        // Build stamp first, so "which version is this?" is answered before
        // anything else in the panel is read.
        el("div", {
          className: `tc-build${channel === "stable" ? "" : " tc-build-pre"}`,
          text: buildLabel,
          title: "Version, channel and build stamp"
        }),
        el(
          "div",
          { className: "tc-row" },
          el("span", { className: "tc-dot", "aria-hidden": "true" }),
          statusText,
          pauseButton,
          el("button", {
            type: "button",
            text: "Settings",
            title: "Open settings (s)",
            on: { click: openSettings }
          }),
          // The only visible affordance for the shortcuts. Without it nobody
          // discovers that pressing ? does anything.
          el("button", {
            type: "button",
            text: "?",
            title: "Keyboard shortcuts (?)",
            "aria-label": "Show keyboard shortcuts",
            on: { click: () => bus.emit(EVENTS.SHOW_HELP) }
          }),
          el("button", {
            type: "button",
            text: "×",
            title: "Hide this panel (p)",
            "aria-label": "Hide the Threadcalm panel",
            on: { click: hide }
          })
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
    }
    function onState({ enabled, paused, totalClicks, limitReached }) {
      if (!panel) return;
      panel.classList.toggle("tc-paused", paused || !enabled);
      panel.classList.toggle("tc-limit", limitReached);
      if (pauseButton) {
        pauseButton.textContent = paused ? "Resume" : "Pause";
        pauseButton.title = paused ? "Resume automatic expansion (e)" : "Pause automatic expansion (e)";
      }
      if (limitReached) {
        setStatus(`Click limit reached at ${totalClicks}`);
      } else if (paused) {
        setStatus("Expansion paused");
      } else if (!enabled) {
        setStatus("Expansion off");
      }
    }
    function renderField(definition) {
      const value = get(definition.key);
      const help = definition.help ? el("p", { className: "tc-help", text: definition.help }) : null;
      const commit = (next) => update({ [definition.key]: next });
      switch (definition.type) {
        case "boolean":
          return el(
            "div",
            { className: "tc-field" },
            el(
              "label",
              {},
              el("input", {
                type: "checkbox",
                checked: value ? "checked" : null,
                on: { change: (event) => commit(event.target.checked) }
              }),
              el("span", { text: definition.label })
            ),
            help
          );
        case "number":
          return el(
            "div",
            { className: "tc-field" },
            el(
              "label",
              {},
              el("span", { text: definition.label }),
              el("input", {
                type: "number",
                value: String(value),
                min: definition.min ?? null,
                max: definition.max ?? null,
                step: definition.step ?? 1,
                on: { change: (event) => commit(event.target.value) }
              })
            ),
            help
          );
        case "select": {
          const select = el("select", {
            on: { change: (event) => commit(event.target.value) }
          });
          for (const option of definition.options ?? []) {
            select.append(
              el("option", {
                value: option.value,
                selected: option.value === value ? "selected" : null,
                text: option.label
              })
            );
          }
          const notes = (definition.options ?? []).some(
            (option) => option.gain || option.cost
          ) ? el(
            "dl",
            { className: "tc-option-notes" },
            ...(definition.options ?? []).flatMap((option) => [
              el("dt", { text: option.label }),
              el(
                "dd",
                {},
                option.gain ? el("span", { className: "tc-gain", text: option.gain }) : null,
                option.cost ? el("span", { className: "tc-cost", text: option.cost }) : null
              )
            ])
          ) : null;
          return el(
            "div",
            { className: "tc-field" },
            el("label", {}, el("span", { text: definition.label }), select),
            help,
            notes
          );
        }
        case "multiselect": {
          const chosen = new Set(value);
          const choices = el("div", { className: "tc-choices" });
          for (const option of definition.options ?? []) {
            choices.append(
              el(
                "label",
                {},
                el("input", {
                  type: "checkbox",
                  checked: chosen.has(option.value) ? "checked" : null,
                  on: {
                    change: (event) => {
                      if (event.target.checked) chosen.add(option.value);
                      else chosen.delete(option.value);
                      commit([...chosen]);
                    }
                  }
                }),
                el("span", { text: option.label })
              )
            );
          }
          return el(
            "div",
            { className: "tc-field" },
            el("span", { text: definition.label }),
            choices,
            help
          );
        }
        case "lines":
          return el(
            "div",
            { className: "tc-field" },
            el(
              "label",
              {},
              el("span", { text: definition.label }),
              el("textarea", {
                spellcheck: "false",
                on: {
                  change: (event) => commit(event.target.value.split("\n"))
                },
                text: (value ?? []).join("\n")
              })
            ),
            help
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
    function buildSheet() {
      const body = el(
        "div",
        { className: "tc-sheet", role: "document" },
        el("h2", { text: "Threadcalm" }),
        el("p", { className: "tc-version", text: buildLabel })
      );
      for (const group of GROUPS) {
        const definitions = definitionsFor(group.id);
        if (definitions.length === 0) continue;
        const fieldset = el("fieldset", {}, el("legend", { text: group.title }));
        for (const definition of definitions) {
          const field = renderField(definition);
          if (field) fieldset.append(field);
        }
        body.append(fieldset);
      }
      body.append(
        el(
          "div",
          { className: "tc-actions" },
          el("button", {
            type: "button",
            text: "Forget seen posts",
            title: 'Clear the local "new post" history',
            on: {
              click: () => {
                highlighter?.forgetSeen?.();
                bus.emit(EVENTS.TOAST, { message: "Seen-post history cleared" });
              }
            }
          }),
          el("button", {
            type: "button",
            text: "Reset to defaults",
            on: {
              click: () => {
                reset();
                closeSettings();
                openSettings();
                bus.emit(EVENTS.TOAST, { message: "Settings reset" });
              }
            }
          }),
          el("button", { type: "button", text: "Close", on: { click: closeSettings } })
        )
      );
      const links = buildLinks();
      if (links) body.append(links);
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
        body
      );
    }
    function openSettings() {
      if (sheet) return true;
      sheet = buildSheet();
      document.body.append(sheet);
      sheet.querySelector("input, select, textarea, button")?.focus();
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
:root {
  --tc-bg: #ffffff;
  --tc-fg: #242424;
  --tc-muted: #616161;
  --tc-border: rgba(0, 0, 0, .14);
  --tc-shadow: 0 4px 16px rgba(0, 0, 0, .16);
  --tc-accent: #0f6cbd;
  --tc-new: #0f6cbd;
  --tc-unanswered: #c19c00;
  --tc-warn: #a4262c;
  --tc-reading-width: 760px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --tc-bg: #1f1f1f;
    --tc-fg: #f5f5f5;
    --tc-muted: #adadad;
    --tc-border: rgba(255, 255, 255, .16);
    --tc-shadow: 0 4px 16px rgba(0, 0, 0, .5);
    --tc-accent: #62abf5;
    --tc-new: #62abf5;
    --tc-unanswered: #e8c547;
    --tc-warn: #f1707b;
  }
}

/* ---------------------------------------------------------------- panel -- */

#tc-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  width: max-content;
  max-width: min(380px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--tc-border);
  border-radius: 8px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: .96;
}

#tc-panel[hidden] { display: none; }

/*
 * The build stamp. Quiet for a release, and unmistakable for anything else,
 * because the question it answers only ever matters while testing.
 */
#tc-panel .tc-build {
  margin: 0 0 4px;
  color: var(--tc-muted);
  font: 10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .02em;
}

#tc-panel .tc-build-pre {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--tc-unanswered);
  color: #1f1f1f;
  font-weight: 600;
}

#tc-panel .tc-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

#tc-panel .tc-status {
  flex: 1 1 auto;
  min-width: 10ch;
  color: var(--tc-fg);
}

#tc-panel .tc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tc-accent);
  flex: 0 0 auto;
}

#tc-panel.tc-paused .tc-dot { background: var(--tc-muted); }
#tc-panel.tc-limit .tc-dot { background: var(--tc-warn); }

#tc-panel button,
#tc-settings button,
#tc-settings select {
  font: inherit;
  color: var(--tc-fg);
  background: transparent;
  border: 1px solid var(--tc-border);
  border-radius: 5px;
  padding: 2px 7px;
  cursor: pointer;
}

#tc-panel button:hover,
#tc-settings button:hover { border-color: var(--tc-accent); }

#tc-panel button:focus-visible,
#tc-settings :focus-visible {
  outline: 2px solid var(--tc-accent);
  outline-offset: 1px;
}

/* ------------------------------------------------------------- settings -- */

#tc-settings {
  position: fixed;
  inset: 0;
  z-index: 2147483001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, .35);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}

#tc-settings .tc-sheet {
  width: min(620px, 100%);
  max-height: min(80vh, 760px);
  overflow: auto;
  box-sizing: border-box;
  padding: 18px 20px 22px;
  border-radius: 10px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
}

#tc-settings h2 {
  margin: 0 0 2px;
  font-size: 16px;
}

#tc-settings .tc-version {
  margin: 0 0 14px;
  color: var(--tc-muted);
  font-size: 11px;
}

#tc-settings fieldset {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--tc-border);
  border-radius: 8px;
}

#tc-settings legend {
  padding: 0 4px;
  color: var(--tc-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

#tc-settings .tc-field { margin: 8px 0; }

#tc-settings .tc-field > label {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

#tc-settings .tc-field input[type="number"],
#tc-settings .tc-field select,
#tc-settings .tc-field textarea {
  box-sizing: border-box;
  padding: 3px 6px;
  border: 1px solid var(--tc-border);
  border-radius: 5px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  font: inherit;
}

#tc-settings .tc-field input[type="number"] { width: 9ch; }
#tc-settings .tc-field textarea { width: 100%; min-height: 60px; resize: vertical; }

#tc-settings .tc-help {
  margin: 2px 0 0;
  color: var(--tc-muted);
  font-size: 11px;
}

/*
 * Trade-offs listed beside a choice that is a trade rather than a taste.
 * Marked with + and - rather than colour alone, so the distinction survives
 * both themes and a reader who cannot rely on hue.
 */
#tc-settings .tc-option-notes {
  margin: 6px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.45;
}

#tc-settings .tc-option-notes dt {
  margin: 6px 0 1px;
  font-weight: 600;
  color: var(--tc-fg);
}

#tc-settings .tc-option-notes dt:first-child { margin-top: 0; }

#tc-settings .tc-option-notes dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  color: var(--tc-muted);
}

#tc-settings .tc-option-notes .tc-gain::before {
  content: "+ ";
  color: var(--tc-accent);
  font-weight: 700;
}

#tc-settings .tc-option-notes .tc-cost::before {
  content: "− ";
  color: var(--tc-warn);
  font-weight: 700;
}

#tc-settings .tc-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
}

#tc-settings .tc-choices label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

#tc-settings .tc-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

/* Project links. Present only when the repository is public. */
#tc-settings .tc-links {
  margin: 14px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--tc-border);
  color: var(--tc-muted);
  font-size: 11px;
  text-align: center;
}

#tc-settings .tc-links a,
#tc-help .tc-help-note a {
  color: var(--tc-accent);
  text-decoration: none;
}

#tc-settings .tc-links a:hover,
#tc-help .tc-help-note a:hover { text-decoration: underline; }

/* ----------------------------------------------------------------- help -- */

#tc-help {
  position: fixed;
  inset: 0;
  z-index: 2147483002;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .35);
  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
}

#tc-help .tc-help-card {
  min-width: 320px;
  padding: 18px 22px;
  border-radius: 10px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
}

#tc-help h2 { margin: 0 0 12px; font-size: 15px; }

#tc-help dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  margin: 0;
}

#tc-help dt { margin: 0; }
#tc-help dd { margin: 0; color: var(--tc-fg); }

#tc-help kbd {
  display: inline-block;
  min-width: 1.5em;
  padding: 1px 5px;
  border: 1px solid var(--tc-border);
  border-bottom-width: 2px;
  border-radius: 4px;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
}

#tc-help .tc-help-note {
  margin: 14px 0 0;
  color: var(--tc-muted);
  font-size: 11px;
}

/* ---------------------------------------------------------------- toast -- */

#tc-toasts {
  position: fixed;
  right: 16px;
  bottom: 70px;
  z-index: 2147483003;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  pointer-events: none;
}

#tc-toasts .tc-toast {
  max-width: min(340px, calc(100vw - 32px));
  padding: 7px 11px;
  border: 1px solid var(--tc-border);
  border-radius: 6px;
  background: var(--tc-bg);
  color: var(--tc-fg);
  box-shadow: var(--tc-shadow);
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity .18s ease, transform .18s ease;
}

#tc-toasts .tc-toast.tc-in { opacity: .97; transform: none; }
#tc-toasts .tc-toast.tc-warn { border-color: var(--tc-warn); color: var(--tc-warn); }

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
 * The ground is the CSS system colour rather than ours: these sit among
 * Engage's own icons and have to match the page those were drawn for, not this
 * script's panel palette.
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
  background: Canvas;
  border: 1px solid rgba(128, 128, 128, .35);
  box-shadow: 0 2px 10px rgba(0, 0, 0, .18);
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

.tc-chip {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 5;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity .12s ease;
}

.tc-post:hover .tc-chip,
.tc-chip:focus-within { opacity: 1; }

.tc-chip button {
  padding: 1px 6px;
  border: 1px solid var(--tc-border);
  border-radius: 4px;
  background: var(--tc-bg);
  color: var(--tc-muted);
  font: 10px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: .02em;
  cursor: pointer;
}

.tc-chip button:hover { color: var(--tc-accent); border-color: var(--tc-accent); }

/* --------------------------------------------------------- reading mode -- */

html.tc-reading [role="main"],
html.tc-reading .qaContentMainColumn {
  max-width: var(--tc-reading-width) !important;
  margin-inline: auto !important;
}

html.tc-reading [role="article"],
html.tc-reading .qaThreadStarter,
html.tc-reading .y-fixedGridColumn { line-height: 1.5; }

html.tc-no-rails [role="complementary"],
html.tc-no-rails aside[aria-label] { display: none !important; }

/*
 * The sticky app bar. Off by default: it takes search, the app launcher and
 * the account menu with it, which is a real loss, so it is the reader's call.
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
    function ensureContainer() {
      if (container?.isConnected) return container;
      container = el("div", { id: CONTAINER_ID, role: "status", "aria-live": "polite" });
      document.body.append(container);
      return container;
    }
    function show({ message, tone = "info", duration = VISIBLE_MS }) {
      if (!message) return;
      const host = ensureContainer();
      while (host.children.length >= MAX_VISIBLE) host.firstElementChild?.remove();
      const toast = el("div", {
        className: `tc-toast${tone === "warn" ? " tc-warn" : ""}`,
        text: message
      });
      host.append(toast);
      requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("tc-in")));
      setTimeout(() => {
        toast.classList.remove("tc-in");
        setTimeout(() => toast.remove(), 250);
      }, duration);
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
  var VERSION = true ? "1.0.1" : "0.0.0-dev";
  var CHANNEL = true ? "beta" : "dev";
  var BUILD = true ? "c22a365" : "dev";
  var MATCHER_KEYS = [
    "general.languages",
    "advanced.extraExpandReplies",
    "advanced.extraExpandText",
    "advanced.extraPromoted"
  ];
  function main() {
    load();
    let matchers = buildMatchers(get("general.languages"), customPatterns());
    addStyle(ALL_STYLES);
    const expander = createExpander({ matchers });
    const translate = createTranslateTamer({ matchers });
    const declutter = createDeclutterer({ matchers });
    const highlighter = createHighlighter({ matchers });
    const quietChrome = createQuietChrome();
    const readingMode = createReadingMode();
    const copyTools = createCopyTools({ expander });
    const toaster = createToaster();
    const panel = createPanel({
      expander,
      highlighter,
      version: VERSION,
      channel: CHANNEL,
      build: BUILD
    });
    const shortcuts = createShortcuts({ expander, copyTools, readingMode, panel });
    const features = [
      expander,
      translate,
      declutter,
      highlighter,
      quietChrome,
      readingMode,
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
    bus.on(EVENTS.SETTINGS_CHANGED, ({ changed }) => {
      if (MATCHER_KEYS.some((key) => key in changed)) {
        matchers = buildMatchers(get("general.languages"), customPatterns());
        for (const feature of features) feature.setMatchers?.(matchers);
      }
      dispatch("onSettingsChanged", changed);
    });
    for (const feature of features) feature.start?.();
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
  async function copyDiagnostics() {
    const control = document.querySelector(".tc-translate-compact, .tc-translate-hidden") ?? document.querySelector("[data-tc-title]");
    const lines = [
      `Threadcalm ${VERSION}`,
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
    lines.push("", `posts resolved: ${rootPosts().length}`, "");
    if (!control) {
      lines.push("No translate control found on this page.");
    } else {
      lines.push("translate control, then ancestors:");
      let node = control;
      for (let depth = 0; node && depth < 6; depth += 1) {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const describe = [
          node.tagName.toLowerCase(),
          node.getAttribute("role") ? `role=${node.getAttribute("role")}` : "",
          `display:${style.display}`,
          `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          `pad:${style.paddingTop}/${style.paddingBottom}`,
          `margin:${style.marginTop}/${style.marginBottom}`,
          `minH:${style.minHeight}`,
          `children:${node.children.length}`,
          node.classList.contains("tc-translate-row") ? "[row-collapsed]" : "",
          node.classList.contains("tc-translate-compact") ? "[compacted]" : ""
        ].filter(Boolean).join("  ");
        lines.push(`${"  ".repeat(depth)}${describe}`);
        node = node.parentElement;
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
