"use strict";

/*
 * Teste pentru „Calculăm cu Danny”.
 * Rulare (din folderul calculator):  node --test
 *
 * script.js rulează într-o pagină simulată (fără browser), iar testele
 * apasă tastele exact ca un copil: „2 + 3 × 4 =” și citesc ecranul.
 */

const { test, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SCRIPT = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const CSS_TEXT = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");

// ================= Pagina simulată =================

class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.hidden = false;
    this.ownText = "";
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force = !classes.has(name)) => (force ? classes.add(name) : classes.delete(name), force),
      contains: (name) => classes.has(name),
    };
  }
  get textContent() {
    return this.ownText + this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
  }
  set textContent(value) {
    this.ownText = String(value);
    this.children = [];
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof FakeElement && node.isFragment) this.children.push(...node.children);
      else this.children.push(node);
    }
  }
  prepend(...nodes) {
    this.children.unshift(...nodes);
  }
  replaceChildren(...nodes) {
    this.ownText = "";
    this.children = [];
    this.append(...nodes);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] ?? []) fn({ preventDefault() {}, ...event });
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  cloneNode() {
    return new FakeElement(this.tagName);
  }
  getBoundingClientRect() {
    return { left: 100, top: 400, width: 60, height: 60, bottom: 460, right: 160 };
  }
  matches() {
    return false;
  }
  querySelectorAll() {
    return [];
  }
  animate() {
    return { finished: Promise.resolve() };
  }
  remove() {
    this.removed = true;
  }
  closest() {
    return null;
  }
  contains(node) {
    return node === this;
  }
}

// O tastă de pe calculator
function fakeKey(calculatorEl, k, tip = "Explicația tastei") {
  const button = new FakeElement("button");
  button.dataset.k = k;
  button.dataset.tip = tip;
  button.closest = () => button;
  button.insideCalculator = calculatorEl;
  return button;
}

// Preferințele sistemului (tema întunecată, mișcare redusă), cu notificare la schimbare
function fakeMedia({ dark = false, reducedMotion = true, mouse = false } = {}) {
  const queries = {};
  const answer = (query) => {
    if (query.includes("color-scheme")) return dark;
    if (query.includes("reduced-motion")) return reducedMotion; // implicit fără animații: tema se schimbă pe loc
    if (query.includes("pointer: fine")) return mouse;
    return false;
  };
  const matchMedia = (query) => (queries[query] ??= {
    matches: answer(query),
    listeners: [],
    addEventListener(type, fn) { this.listeners.push(fn); },
  });
  const setSystemDark = (value) => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    query.matches = value;
    query.listeners.forEach((fn) => fn({ matches: value }));
  };
  return { matchMedia, setSystemDark };
}

function loadApp({ systemDark = false, saved = {}, animations = false, mouse = false } = {}) {
  const byId = {};
  const bySelector = {};
  const element = (store, key) => (store[key] ??= new FakeElement());

  const document = new FakeElement("document");
  document.getElementById = (id) => element(byId, id);
  document.querySelector = (selector) => element(bySelector, selector);
  document.querySelectorAll = () => [];
  document.createElement = (tag) => new FakeElement(tag);
  document.createDocumentFragment = () => Object.assign(new FakeElement(), { isFragment: true });
  element(byId, "tip-pop").hidden = true;

  document.documentElement = new FakeElement("html");
  const calculatorEl = element(bySelector, ".calculator");
  calculatorEl.contains = (node) => node === calculatorEl || node?.insideCalculator === calculatorEl;

  const media = fakeMedia({ dark: systemDark, reducedMotion: !animations, mouse });
  document.body = new FakeElement("body");
  const storage = new Map(Object.entries(saved));
  const context = vm.createContext({
    document,
    window: { matchMedia: media.matchMedia, innerWidth: 400, innerHeight: 800 },
    navigator: {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
    },
    CSS: { escape: (s) => s },
    // prin funcții intermediare, ca mock.timers să poată controla timpul
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
  });
  vm.runInContext(`${SCRIPT}\n;globalThis.__app = { state, press, get history() { return history; } };`, context);

  const app = context.__app;
  return {
    app,
    document,
    calculatorEl,
    keysEl: element(bySelector, ".keys"),
    storage,
    setSystemDark: media.setSystemDark,
    get theme() { return document.documentElement.dataset.theme; },
    themeToggle: byId["theme-toggle"],
    get bubble() { return byId.bubble.textContent; },
    get veils() { return document.body.children.filter((c) => c.className === "theme-veil"); },
    screen: {
      get main() { return byId.result.textContent; },
      get expression() { return byId.expression.textContent; },
      get note() { return byId.note.textContent; },
      get isError() { return byId.result.classList.contains("is-error"); },
    },
    tipPop: byId["tip-pop"],
  };
}

// „2 + 3 × 4 =” → apasă tastele una câte una (numerele se scriu cifră cu cifră)
const KEYS = {
  "+": "op:+", "-": "op:-", "*": "op:*", "×": "op:*", "/": "op:/", ":": "op:/", "^": "op:^",
  "(": "(", ")": ")", ".": "dec", ";": "sep", "%": "post:%", "²": "post:²", "=": "eq",
  rest: "rest", neg: "neg", back: "back", C: "clear", "√": "fn:sqrt", modul: "fn:abs",
  cmmdc: "fn:gcd", cmmmc: "fn:lcm", medie: "fn:mean", "π": "pi", factori: "factors", "a/b": "fraction",
};

function type(app, sequence) {
  for (const word of sequence.trim().split(/\s+/)) {
    if (KEYS[word]) app.press(KEYS[word]);
    else if (/^[\d.]+$/.test(word)) [...word].forEach((c) => app.press(c === "." ? "dec" : `digit:${c}`));
    else throw new Error(`Tastă necunoscută în test: ${word}`);
  }
}

function calc(sequence) {
  const page = loadApp();
  type(page.app, sequence);
  return page;
}

// ================= Ordinea operațiilor și calcule de bază =================

const RESULTS = [
  ["2 + 3 × 4 =", "14"],
  ["( 2 + 3 ) × 4 =", "20"],
  ["10 - 4 - 3 =", "3"],
  ["7 / 2 =", "3,5"],
  ["0.1 + 0.2 =", "0,3"],
  ["2 ^ 10 =", "1024"],
  ["2 ^ 3 ^ 2 =", "512"],
  ["1234 × 10 =", "12 340"], // spațiu îngust care nu se rupe între grupurile de cifre
  ["5 × - 3 =", "−15"],
  ["neg 5 + 2 =", "−3"],
  ["50 % =", "0,5"],
  ["3 ² =", "9"],
  ["√ 9 =", "3"],
  ["2 √ 9 =", "6"],
  ["3 ( 4 + 1 ) =", "15"],
  ["2 π =", "6,28318530718"],
  ["modul neg 7 =", "7"],
  ["cmmdc 12 ; 18 =", "6"],
  ["cmmmc 4 ; 6 =", "12"],
  ["medie 2 ; 4 ; 9 =", "5"],
  ["( 2 + 3 =", "5"],
];

for (const [keys, expected] of RESULTS) {
  test(`${keys} ${expected}`, () => {
    const { screen } = calc(keys);
    assert.equal(screen.main, expected);
    assert.equal(screen.isError, false);
  });
}

test("parantezele uitate se închid singure și apar în expresie", () => {
  const { screen } = calc("( 2 + 3 =");
  assert.equal(screen.expression, "(2 + 3) =");
});

test("rezultatul apare pe viu cât timp scrii", () => {
  const { screen } = calc("2 + 3 × 4");
  assert.equal(screen.note, "= 14");
});

// ================= Împărțirea cu rest =================

test("17 rest 5 = 3 rest 2, cu verificare", () => {
  const { screen } = calc("17 rest 5 =");
  assert.equal(screen.main, "3 rest 2");
  assert.equal(screen.note, "Verificare: 17 = 5 × 3 + 2");
});

test("rest se folosește o singură dată", () => {
  const { app } = calc("17 rest 5 rest");
  assert.equal(app.state.tokens.filter((t) => t.t === "rest").length, 1);
});

// ================= Erori afișate copilului =================

const ERRORS = [
  ["5 / 0 =", "Nu se poate împărți la 0."],
  ["0 ^ 0 =", "0 la puterea 0 nu are sens."],
  ["√ neg 4 =", "Nu există radical dintr-un număr negativ."],
  ["cmmdc 2.5 ; 5 =", "cmmdc se face doar cu numere naturale."],
  ["2 + =", "Calculul nu este complet."],
];

for (const [keys, message] of ERRORS) {
  test(`eroare: ${keys}`, () => {
    const { screen } = calc(keys);
    assert.equal(screen.isError, true);
    assert.equal(screen.main, message);
  });
}

test("după o eroare, orice tastă păstrează expresia ca s-o poți corecta", () => {
  const { app, screen } = calc("5 / 0 = back 5 =");
  assert.equal(screen.isError, false);
  assert.equal(screen.main, "1");
  assert.equal(app.state.error, null);
});

// ================= Continuarea după rezultat =================

test("după = poți continua calculul cu un operator", () => {
  assert.equal(calc("2 + 3 = + 1 =").screen.main, "6");
});

test("după = o cifră nouă începe un calcul nou", () => {
  assert.equal(calc("2 + 3 = 4 =").screen.main, "4");
});

test("√ după un rezultat calculează radicalul rezultatului", () => {
  assert.equal(calc("8 × 2 = √ =").screen.main, "4");
});

test("C șterge tot", () => {
  assert.equal(calc("2 + 3 C").screen.main, "0");
});

test("⌫ șterge ultima cifră", () => {
  assert.equal(calc("123 back").screen.main, "12");
});

test("maxim 15 cifre într-un număr", () => {
  const { app } = calc("1234567890123456789");
  assert.equal(app.state.tokens[0].v, "123456789012345");
});

// ================= Fracții și factori primi =================

test("0,75 → fracția 3/4", () => {
  const { app, screen } = calc("0.75 = a/b");
  assert.deepEqual({ ...app.state.result.fraction }, { n: 3, d: 4 });
  assert.equal(screen.note, "Fracție ireductibilă");
});

test("1,5 → 1 întreg și 1/2", () => {
  assert.equal(calc("1.5 = a/b").screen.note, "1 întreg și 1/2");
});

test("60 în factori primi = 2² · 3 · 5", () => {
  assert.equal(calc("60 factori").screen.main, "60 = 2² · 3 · 5");
});

test("13 e prim", () => {
  assert.equal(calc("13 factori").screen.main, "13 e prim");
});

// ================= Istoric =================

test("calculele intră în istoric și se salvează", () => {
  const { app, storage } = calc("2 + 3 =");
  assert.equal(app.history.length, 1);
  assert.equal(app.history[0].main, "5");
  assert.match(storage.get("danny-istoric"), /"main":"5"/);
});

test("un simplu număr fără calcul nu intră în istoric", () => {
  assert.equal(calc("42 =").app.history.length, 0);
});

// ================= Tastatura calculatorului =================

test("tastatura fizică: 2 + 3 Enter", () => {
  const { document, screen } = loadApp();
  for (const key of ["2", "+", "3", "Enter"]) document.dispatch("keydown", { key });
  assert.equal(screen.main, "5");
});

// ================= Bula lui Danny pe telefon =================

function longPress(page, k = "digit:7") {
  const button = fakeKey(page.calculatorEl, k);
  page.calculatorEl.dispatch("pointerdown", { pointerType: "touch", target: button, clientX: 0, clientY: 0 });
  mock.timers.tick(450);
  return button;
}

test("CSS: atributul hidden chiar ascunde bula (display: flex nu-l mai anulează)", () => {
  assert.match(CSS_TEXT, /\.tip-pop\[hidden\]\s*\{\s*display:\s*none;?\s*\}/);
});

test("apăsare lungă → apare bula, iar tasta nu se apasă", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const page = loadApp();
    const button = longPress(page);
    assert.equal(page.tipPop.hidden, false);
    page.calculatorEl.dispatch("pointerup");
    page.keysEl.dispatch("click", { target: button });
    assert.equal(page.screen.main, "0");
  } finally {
    mock.timers.reset();
  }
});

test("bula dispare la 2,5 secunde după ce ridici degetul", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const page = loadApp();
    longPress(page);
    page.calculatorEl.dispatch("pointerup");
    mock.timers.tick(2400);
    assert.equal(page.tipPop.hidden, false);
    mock.timers.tick(100);
    assert.equal(page.tipPop.hidden, true);
  } finally {
    mock.timers.reset();
  }
});

test("bula dispare când derulezi pagina", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const page = loadApp();
    longPress(page);
    page.document.dispatch("scroll");
    mock.timers.tick(0);
    assert.equal(page.tipPop.hidden, true);
  } finally {
    mock.timers.reset();
  }
});

test("bula dispare când atingi în afara calculatorului", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const page = loadApp();
    longPress(page);
    page.calculatorEl.dispatch("pointerup");
    page.document.dispatch("pointerdown", { target: new FakeElement() });
    mock.timers.tick(0);
    assert.equal(page.tipPop.hidden, true);
  } finally {
    mock.timers.reset();
  }
});

test("o atingere scurtă nu arată bula", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const page = loadApp();
    const button = fakeKey(page.calculatorEl, "digit:7");
    page.calculatorEl.dispatch("pointerdown", { pointerType: "touch", target: button, clientX: 0, clientY: 0 });
    mock.timers.tick(100);
    page.calculatorEl.dispatch("pointerup");
    mock.timers.tick(1000);
    assert.equal(page.tipPop.hidden, true);
  } finally {
    mock.timers.reset();
  }
});

// ================= Ziua și noaptea =================

test("prima vizită urmează tema sistemului: zi", () => {
  assert.equal(loadApp({ systemDark: false }).theme, "light");
});

test("prima vizită urmează tema sistemului: noapte", () => {
  const page = loadApp({ systemDark: true });
  assert.equal(page.theme, "dark");
  assert.equal(page.themeToggle.attributes["aria-pressed"], "true");
});

test("panoul solar comută noaptea, salvează alegerea și Danny reacționează", () => {
  const page = loadApp();
  page.themeToggle.dispatch("click");
  assert.equal(page.theme, "dark");
  assert.equal(page.storage.get("danny-tema"), "dark");
  assert.equal(page.themeToggle.attributes["aria-pressed"], "true");
  assert.match(page.bubble, /noapte|întuneric/i);
  assert.match(page.themeToggle.dataset.tip, /răsare soarele/);

  page.themeToggle.dispatch("click");
  assert.equal(page.theme, "light");
  assert.equal(page.storage.get("danny-tema"), "light");
  assert.equal(page.themeToggle.attributes["aria-pressed"], "false");
});

test("alegerea salvată câștigă în fața temei sistemului", () => {
  assert.equal(loadApp({ systemDark: true, saved: { "danny-tema": "light" } }).theme, "light");
});

test("dacă n-ai ales nimic, pagina urmează schimbările sistemului", () => {
  const page = loadApp();
  page.setSystemDark(true);
  assert.equal(page.theme, "dark");
});

test("după ce ai ales, schimbarea sistemului nu-ți mai strică alegerea", () => {
  const page = loadApp();
  page.themeToggle.dispatch("click"); // noapte
  page.themeToggle.dispatch("click"); // înapoi la zi, ales de tine
  page.setSystemDark(true);
  assert.equal(page.theme, "light");
});

test("apăsare lungă pe panoul solar doar explică, nu schimbă tema", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const page = loadApp();
    page.themeToggle.closest = () => page.themeToggle;
    page.themeToggle.insideCalculator = page.calculatorEl;
    page.calculatorEl.dispatch("pointerdown", { pointerType: "touch", target: page.themeToggle, clientX: 0, clientY: 0 });
    mock.timers.tick(450);
    assert.equal(page.tipPop.hidden, false);
    page.calculatorEl.dispatch("pointerup");
    page.themeToggle.dispatch("click");
    assert.equal(page.theme, "light");
    // următoarea atingere normală funcționează din nou
    page.themeToggle.dispatch("click");
    assert.equal(page.theme, "dark");
  } finally {
    mock.timers.reset();
  }
});

test("CSS: tema de noapte există și tastele rămân lizibile", () => {
  assert.match(CSS_TEXT, /:root\[data-theme="dark"\]\s*\{/);
  assert.match(CSS_TEXT, /\.key \{[^}]*color: #1d2140/);
});

test("HTML: tema se alege înainte să apară pagina (fără clipire albă)", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /dataset\.theme = theme/);
  assert.match(html, /id="theme-toggle"[^>]*aria-pressed/);
});

test("pe calculator (mouse), noaptea vine cu un cerc care crește, apoi tema se schimbă", async () => {
  const page = loadApp({ animations: true, mouse: true });
  page.themeToggle.dispatch("click");
  const [veil] = page.veils;
  assert.ok(veil, "cercul a apărut");
  assert.equal(veil.style.background, "#161a30");
  assert.equal(page.theme, "light"); // încă ziua, cât timp crește cercul
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.theme, "dark");
  assert.equal(veil.removed, undefined); // cercul mai stă două cadre, cât se redesenează pagina
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(veil.removed, true);
});
