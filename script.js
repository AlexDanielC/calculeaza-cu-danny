"use strict";

/*
 * Calculăm cu Danny
 *
 * Expresia se ține ca listă de „jetoane” (tokens), de exemplu:
 *   2 × (3 + 4)  →  [num 2] [op *] [(] [num 3] [op +] [num 4] [)]
 * La „=”, un parser simplu (descendent recursiv) respectă ordinea operațiilor.
 * Nu folosim eval().
 */

// ================= Configurare =================

const MAX_DIGITS = 15;
const HISTORY_KEY = "danny-istoric";
const HISTORY_LIMIT = 15;
const MAX_DENOMINATOR = 10000;   // fracții „de școală”
const MAX_FACTORIZE = 1e12;

const OP_SYMBOLS = { "+": "+", "-": "−", "*": "×", "/": "÷", "^": "^" };

const FUNCTIONS = {
  sqrt: { label: "√(", name: "Radicalul", single: true, run: ([x]) => squareRoot(x) },
  abs:  { label: "modul(", name: "Modulul", single: true, run: ([x]) => Math.abs(x) },
  gcd:  { label: "cmmdc(", name: "cmmdc", run: (args) => greatestCommonDivisor(args) },
  lcm:  { label: "cmmmc(", name: "cmmmc", run: (args) => leastCommonMultiple(args) },
  mean: { label: "medie(", name: "Media", run: (args) => args.reduce((a, b) => a + b, 0) / args.length },
};

const SUPERSCRIPT = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };

// ================= Starea aplicației =================

const state = {
  tokens: [],         // expresia în lucru
  result: null,       // ultimul rezultat afișat (după „=”)
  error: null,        // { message, exprText }
  fractionView: false,
};

let history = loadHistory();

// ================= Erori de calcul =================

class CalcError extends Error {}

function fail(message) {
  throw new CalcError(message);
}

// ================= Matematică =================

// Elimină erorile de virgulă mobilă (0,1 + 0,2 = 0,30000000000000004)
function clean(n) {
  return Number.isInteger(n) ? n : parseFloat(n.toPrecision(12));
}

function divide(a, b) {
  if (b === 0) fail("Nu se poate împărți la 0.");
  return a / b;
}

function power(base, exponent) {
  if (base === 0 && exponent === 0) fail("0 la puterea 0 nu are sens.");
  if (base === 0 && exponent < 0) fail("Nu se poate împărți la 0.");
  const result = Math.pow(base, exponent);
  if (Number.isNaN(result)) fail("Rezultatul nu este un număr real.");
  return result;
}

function squareRoot(x) {
  if (x < 0) fail("Nu există radical dintr-un număr negativ.");
  return Math.sqrt(x);
}

function toNatural(x, what) {
  const n = clean(x);
  if (!Number.isInteger(n) || n < 0) fail(`${what} se face doar cu numere naturale.`);
  if (n > Number.MAX_SAFE_INTEGER) fail("Numărul este prea mare.");
  return n;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function greatestCommonDivisor(args) {
  const result = args.map((x) => toNatural(x, "cmmdc")).reduce(gcd);
  if (result === 0) fail("cmmdc(0; 0) nu are sens.");
  return result;
}

function leastCommonMultiple(args) {
  const numbers = args.map((x) => toNatural(x, "cmmmc"));
  if (numbers.includes(0)) fail("cmmmc se calculează pentru numere diferite de 0.");
  return numbers.reduce((a, b) => (a / gcd(a, b)) * b);
}

function divideWithRemainder(a, b) {
  const dividend = toNatural(a, "Împărțirea cu rest");
  const divisor = toNatural(b, "Împărțirea cu rest");
  if (divisor === 0) fail("Nu se poate împărți la 0.");
  const quotient = Math.floor(dividend / divisor);
  return { dividend, divisor, quotient, remainder: dividend - quotient * divisor };
}

function primeFactors(n) {
  const factors = [];
  for (let p = 2; p * p <= n; p++) {
    let exponent = 0;
    while (n % p === 0) {
      n /= p;
      exponent++;
    }
    if (exponent) factors.push([p, exponent]);
  }
  if (n > 1) factors.push([n, 1]);
  return factors;
}

// Fracție ireductibilă prin fracții continue; null dacă nu există una „rezonabilă”
function toFraction(x) {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let rest = value;
  for (let i = 0; i < 40; i++) {
    const whole = Math.floor(rest);
    [h0, h1] = [h1, whole * h1 + h0];
    [k0, k1] = [k1, whole * k1 + k0];
    if (k1 > MAX_DENOMINATOR) return null;
    if (Math.abs(value - h1 / k1) < 1e-9 * Math.max(1, value)) return { n: sign * h1, d: k1 };
    rest = 1 / (rest - whole);
    if (!Number.isFinite(rest)) return null;
  }
  return null;
}

// ================= Parser =================

const isValueEnd = (tok) => Boolean(tok) && ["num", ")", "pi", "post"].includes(tok.t);
const isOpenSlot = (tok) => !tok || ["op", "neg", "(", "fn", "sep", "rest"].includes(tok.t);

function openDepth(tokens) {
  let depth = 0;
  for (const tok of tokens) {
    if (tok.t === "(" || tok.t === "fn") depth++;
    else if (tok.t === ")") depth--;
  }
  return depth;
}

// Închide parantezele uitate și adaugă înmulțirile subînțelese: 2π, 3(4+1), 2√9
function prepare(tokens) {
  if (!tokens.length) fail("Scrie întâi un calcul.");
  if (!isValueEnd(tokens[tokens.length - 1])) fail("Calculul nu este complet.");
  const out = [];
  for (const tok of tokens) {
    if (isValueEnd(out[out.length - 1]) && ["num", "(", "fn", "pi"].includes(tok.t)) {
      out.push({ t: "op", v: "*" });
    }
    out.push(tok);
  }
  for (let d = openDepth(tokens); d > 0; d--) out.push({ t: ")" });
  return out;
}

/*
 * Gramatica (de la prioritate mică la mare):
 *   calcul  = suma [ "rest" suma ]
 *   suma    = produs { ("+" | "−") produs }
 *   produs  = semn { ("×" | "÷") semn }
 *   semn    = "−" semn | putere
 *   putere  = postfix [ "^" semn ]
 *   postfix = primar { "%" | "²" }
 *   primar  = număr | π | "(" suma ")" | funcție "(" suma { ";" suma } ")"
 */
function evaluate(rawTokens) {
  const tokens = prepare(rawTokens);
  let i = 0;
  const peek = () => tokens[i];
  const is = (t, v) => peek() !== undefined && peek().t === t && (v === undefined || peek().v === v);
  const next = () => tokens[i++];
  const expect = (t) => {
    if (!is(t)) fail("Calculul nu este scris corect.");
    next();
  };

  function sum() {
    let value = product();
    while (is("op", "+") || is("op", "-")) {
      const op = next().v;
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  function product() {
    let value = signed();
    while (is("op", "*") || is("op", "/")) {
      const op = next().v;
      const right = signed();
      value = op === "*" ? value * right : divide(value, right);
    }
    return value;
  }

  function signed() {
    if (is("neg")) {
      next();
      return -signed();
    }
    return exponentiation();
  }

  function exponentiation() {
    const base = postfix();
    if (is("op", "^")) {
      next();
      return power(base, signed());
    }
    return base;
  }

  function postfix() {
    let value = primary();
    while (is("post")) {
      value = next().v === "%" ? value / 100 : power(value, 2);
    }
    return value;
  }

  function primary() {
    const tok = next();
    if (!tok) fail("Calculul nu este complet.");
    switch (tok.t) {
      case "num":
        return parseFloat(tok.v);
      case "pi":
        return Math.PI;
      case "(": {
        const value = sum();
        expect(")");
        return value;
      }
      case "fn": {
        const fn = FUNCTIONS[tok.v];
        const args = [sum()];
        while (is("sep")) {
          next();
          args.push(sum());
        }
        expect(")");
        if (fn.single && args.length > 1) fail(`${fn.name} primește un singur număr.`);
        return fn.run(args);
      }
      case "rest":
        fail("Împărțirea cu rest se scrie la final, de exemplu 17 rest 5.");
      default:
        fail("Calculul nu este scris corect.");
    }
  }

  function checked(value) {
    if (Number.isNaN(value)) fail("Rezultatul nu este un număr real.");
    if (!Number.isFinite(value)) fail("Numărul este prea mare.");
    return clean(value);
  }

  const left = checked(sum());
  if (is("rest")) {
    next();
    const right = checked(sum());
    if (i < tokens.length) fail("Calculul nu este scris corect.");
    return { kind: "rest", ...divideWithRemainder(left, right) };
  }
  if (i < tokens.length) fail("Calculul nu este scris corect.");
  return { kind: "number", value: left };
}

// ================= Formatare =================

const toSuperscript = (text) => [...text].map((c) => SUPERSCRIPT[c] ?? c).join("");

// "12345.5" → "12 345,5" (grupare cu spațiu, virgulă zecimală, ca la școală)
function formatRaw(raw) {
  if (/e/i.test(raw)) return formatNumber(parseFloat(raw));
  const negative = raw.startsWith("-");
  const [int, frac] = (negative ? raw.slice(1) : raw).split(".");
  const grouped = int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : int;
  return (negative ? "−" : "") + grouped + (frac !== undefined ? "," + frac : "");
}

function formatNumber(n) {
  if (Object.is(n, -0)) n = 0;
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
    const [mantissa, exponent] = n.toExponential(8).split("e");
    return `${formatRaw(String(parseFloat(mantissa)))} × 10${toSuperscript(String(parseInt(exponent, 10)))}`;
  }
  return formatRaw(String(clean(n)));
}

function expressionText(tokens) {
  let text = "";
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    switch (tok.t) {
      case "num": text += formatRaw(tok.v); break;
      case "neg": text += "−"; break;
      case "(": text += "("; break;
      case ")": text += ")"; break;
      case "pi": text += "π"; break;
      case "post": text += tok.v; break;
      case "sep": text += "; "; break;
      case "rest": text += " : "; break;
      case "fn": text += FUNCTIONS[tok.v].label; break;
      case "op": {
        if (tok.v !== "^") {
          text += ` ${OP_SYMBOLS[tok.v]} `;
          break;
        }
        // Exponent scris mic, sus: 2^10 → 2¹⁰
        let j = i + 1;
        let sign = "";
        if (tokens[j]?.t === "neg" && tokens[j + 1]?.t === "num") {
          sign = "⁻";
          j++;
        }
        if (tokens[j]?.t === "num" && !tokens[j].v.includes(".")) {
          text += sign + toSuperscript(tokens[j].v);
          i = j;
        } else {
          text += "^";
        }
        break;
      }
    }
  }
  return { text, ghost: ")".repeat(Math.max(0, openDepth(tokens))) };
}

function closedExpressionText(tokens) {
  const { text, ghost } = expressionText(tokens);
  return text + ghost;
}

function numberTokens(value) {
  const tokens = [{ t: "num", v: String(Math.abs(value)) }];
  return value < 0 ? [{ t: "neg" }, ...tokens] : tokens;
}

function wholesText(n) {
  if (n === 1) return "1 întreg";
  const lastTwo = n % 100;
  return `${formatNumber(n)} ${n >= 20 && (lastTwo === 0 || lastTwo >= 20) ? "de întregi" : "întregi"}`;
}

// ================= Acțiunile tastelor =================

const last = () => state.tokens[state.tokens.length - 1];

function startFresh() {
  state.tokens = [];
  state.result = null;
  state.fractionView = false;
}

// Continuăm calculul pornind de la rezultatul anterior (ex: după „=”, apeși „+ 5”)
function continueFromResult() {
  if (!state.result) return;
  const value = state.result.value;
  startFresh();
  state.tokens = numberTokens(value);
}

function inputDigit(digit) {
  if (state.result) startFresh();
  const tok = last();
  if (tok?.t === "num") {
    if (tok.v.replace(/\D/g, "").length >= MAX_DIGITS) return say("Ajunge! Maxim 15 cifre.", "think");
    tok.v = tok.v === "0" ? digit : tok.v + digit;
  } else {
    state.tokens.push({ t: "num", v: digit });
  }
}

function inputDecimal() {
  if (state.result) startFresh();
  const tok = last();
  if (tok?.t === "num") {
    if (!tok.v.includes(".")) tok.v += ".";
  } else {
    state.tokens.push({ t: "num", v: "0." });
  }
}

function inputOperator(op) {
  continueFromResult();
  let tok = last();
  if (tok?.t === "neg") {
    if (op === "-") return;
    state.tokens.pop();
    tok = last();
  }
  if (tok?.t === "op" || tok?.t === "rest") {
    // 5 × −3 este voie; altfel înlocuim operatorul (evită „5 + + 3”)
    if (op === "-" && tok.t === "op" && ["*", "/", "^"].includes(tok.v)) {
      state.tokens.push({ t: "neg" });
    } else {
      state.tokens[state.tokens.length - 1] = { t: "op", v: op };
    }
    return;
  }
  if (isValueEnd(tok)) state.tokens.push({ t: "op", v: op });
  else if (op === "-") state.tokens.push({ t: "neg" });   // număr negativ la început sau după „(”
}

function inputRest() {
  continueFromResult();
  if (state.tokens.some((tok) => tok.t === "rest")) return say("Împărțirea cu rest se folosește o singură dată.", "think");
  if (openDepth(state.tokens) > 0) return say("Închide întâi parantezele, apoi apasă „rest”.", "think");
  if (last()?.t === "op") state.tokens.pop();
  if (!isValueEnd(last())) return say("Scrie întâi deîmpărțitul, de exemplu 17, apoi „rest”, apoi 5.", "think");
  state.tokens.push({ t: "rest" });
}

function inputPostfix(symbol) {
  continueFromResult();
  if (isValueEnd(last())) state.tokens.push({ t: "post", v: symbol });
}

function inputFunction(name) {
  if (state.result) {
    // √ după un rezultat → √(rezultat); cmmdc după 12 → cmmdc(12;
    const value = state.result.value;
    startFresh();
    state.tokens = [{ t: "fn", v: name }, ...numberTokens(value), FUNCTIONS[name].single ? { t: ")" } : { t: "sep" }];
    return;
  }
  state.tokens.push({ t: "fn", v: name });
}

function inputPi() {
  if (state.result) startFresh();
  state.tokens.push({ t: "pi" });
}

function inputOpenParen() {
  if (state.result) startFresh();
  state.tokens.push({ t: "(" });
}

function inputCloseParen() {
  if (state.result) return;
  if (openDepth(state.tokens) > 0 && isValueEnd(last())) state.tokens.push({ t: ")" });
}

function insideMultiNumberFunction() {
  const stack = [];
  for (const tok of state.tokens) {
    if (tok.t === "(" || tok.t === "fn") stack.push(tok);
    else if (tok.t === ")") stack.pop();
  }
  const top = stack[stack.length - 1];
  return top?.t === "fn" && !FUNCTIONS[top.v].single;
}

function inputSeparator() {
  if (state.result) return;
  if (!insideMultiNumberFunction()) return say("„;” desparte numerele din cmmdc, cmmmc sau medie, de exemplu cmmdc(12; 18).", "think");
  if (isValueEnd(last())) state.tokens.push({ t: "sep" });
}

function negate() {
  if (state.result) {
    const value = -state.result.value;
    startFresh();
    state.tokens = numberTokens(value);
    return;
  }
  const index = state.tokens.length - 1;
  const tok = last();
  if (tok?.t === "num") {
    if (state.tokens[index - 1]?.t === "neg") state.tokens.splice(index - 1, 1);
    else state.tokens.splice(index, 0, { t: "neg" });
  } else if (tok?.t === "neg") {
    state.tokens.pop();
  } else if (isOpenSlot(tok)) {
    state.tokens.push({ t: "neg" });
  }
}

function backspace() {
  if (state.result) return startFresh();
  const tok = last();
  if (!tok) return;
  if (tok.t === "num" && tok.v.length > 1) tok.v = tok.v.slice(0, -1);
  else state.tokens.pop();
}

function clearAll() {
  startFresh();
}

function equals() {
  if (state.result || !state.tokens.length) return;
  const exprText = closedExpressionText(state.tokens);
  const trivial = state.tokens.length === 1 && state.tokens[0].t === "num";
  try {
    const out = evaluate(state.tokens);
    if (out.kind === "rest") {
      const [a, b, q, r] = [out.dividend, out.divisor, out.quotient, out.remainder].map(formatNumber);
      setResult({
        value: out.quotient,
        kind: "rest",
        exprText: `${exprText} =`,
        main: `${q} rest ${r}`,
        note: `Verificare: ${a} = ${b} × ${q} + ${r}`,
      }, r === "0" ? `Se împarte exact! ${a} e divizibil cu ${b}.` : `Câtul e ${q}, iar restul ${r}. Restul e mereu mai mic decât împărțitorul.`);
      return;
    }
    setResult({ value: out.value, kind: "number", exprText: `${exprText} =`, main: formatNumber(out.value), note: "" },
      praiseFor(out.value), !trivial);
  } catch (err) {
    if (!(err instanceof CalcError)) throw err;
    state.error = { message: err.message, exprText };
    say(pick(["Hmm, aici e o problemă. Citește mesajul de pe ecran.", "Nu-i nimic, din greșeli învățăm! Uită-te pe ecran.", "Stai puțin… ceva nu se leagă. Apasă ⌫ și corectează."]), "think");
  }
}

function factorize() {
  if (!state.result) equals();
  if (!state.result) return;
  const n = state.result.value;
  if (!Number.isInteger(n) || n < 2) return say("Descompun în factori primi doar numere naturale mai mari decât 1.", "think");
  if (n > MAX_FACTORIZE) return say("Numărul e prea mare ca să-l descompun repede.", "think");

  const factors = primeFactors(n);
  const isPrime = factors.length === 1 && factors[0][1] === 1;
  const text = factors.map(([p, e]) => formatNumber(p) + (e > 1 ? toSuperscript(String(e)) : "")).join(" · ");
  setResult({
    value: n,
    kind: "factors",
    exprText: "Descompunere în factori primi",
    main: isPrime ? `${formatNumber(n)} e prim` : `${formatNumber(n)} = ${text}`,
    note: isPrime
      ? "Se împarte doar la 1 și la el însuși."
      : `Factori primi: ${factors.map(([p]) => formatNumber(p)).join(", ")}`,
  }, isPrime ? "Număr prim! Preferatele mele." : "Gata, l-am desfăcut în factori primi!");
}

function toggleFraction() {
  if (!state.result) equals();
  if (!state.result) return;
  if (state.result.kind !== "number") return say("Transform în fracție doar rezultatele obișnuite.", "think");
  if (state.fractionView) {
    state.fractionView = false;
    return;
  }
  const value = state.result.value;
  if (Number.isInteger(value)) return say(`${formatNumber(value)} e număr întreg, nu are nevoie de fracție.`, "think");
  const fraction = toFraction(value);
  if (!fraction) return say("Ăsta nu se poate scrie ca fracție simplă. Probabil e irațional, ca √2 sau π.", "think");
  state.result.fraction = fraction;
  state.fractionView = true;
  say("Am transformat în fracție ireductibilă, adică simplificată cât se poate!", "happy");
}

function setResult(result, message, saveToHistory = true) {
  state.tokens = [];
  state.result = result;
  state.fractionView = false;
  if (saveToHistory) addHistory(result);
  say(message, "happy");
}

// ================= Istoric =================

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // stocare indisponibilă (ex: fereastră privată), istoricul rămâne doar în pagină
  }
}

function addHistory(result) {
  history.unshift({ expr: result.exprText, main: result.main, value: result.value });
  history = history.slice(0, HISTORY_LIMIT);
  saveHistory();
  renderHistory();
}

function useHistoryValue(value) {
  state.error = null;
  if (state.result || !isOpenSlot(last())) startFresh();
  state.tokens.push(...numberTokens(value));
  say("Am luat numărul din istoric. Continuă calculul!");
  render();
}

// ================= Danny =================

const dannyEl = document.getElementById("danny");
const bubbleEl = document.getElementById("bubble");
// Pe telefon nu există mouse: salutul se potrivește dispozitivului
const IS_TOUCH = window.matchMedia("(hover: none)").matches;
if (IS_TOUCH) bubbleEl.textContent = "Salut! Eu sunt Danny. Ține apăsat pe o tastă și îți spun ce face.";
let dannyMessage = bubbleEl.textContent;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function praiseFor(value) {
  if (!Number.isInteger(value) && toFraction(value)) {
    return "Știai că poți vedea rezultatul și ca fracție? Apasă a/b.";
  }
  return pick([
    "Gata! A fost floare la ureche.",
    "Corect! Matematica e superputerea noastră.",
    "Bravo! Mai facem unul?",
    "Calculat! Îl găsești și în istoric.",
    "Excelent! Mintea ta e la fel de ascuțită ca țepii mei.",
  ]);
}

function say(message, mood) {
  dannyMessage = message;
  bubbleEl.textContent = message;
  bubbleEl.classList.remove("is-tip");
  if (!mood) return;
  dannyEl.classList.remove("mood-happy", "mood-think");
  void dannyEl.offsetWidth; // repornește animația
  dannyEl.classList.add(`mood-${mood}`);
}

function showTip(tip) {
  bubbleEl.textContent = tip;
  bubbleEl.classList.add("is-tip");
}

function hideTip() {
  bubbleEl.textContent = dannyMessage;
  bubbleEl.classList.remove("is-tip");
}

// ================= Afișare =================

const expressionEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const noteEl = document.getElementById("note");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");

function sizeFor(length) {
  if (length <= 11) return "";
  if (length <= 16) return "md";
  if (length <= 24) return "sm";
  return "xs";
}

function fractionNode({ n, d }) {
  const wrapper = document.createDocumentFragment();
  if (n < 0) wrapper.append("−");
  const frac = document.createElement("span");
  frac.className = "frac";
  const num = document.createElement("span");
  num.className = "frac-num";
  num.textContent = formatNumber(Math.abs(n));
  const den = document.createElement("span");
  den.className = "frac-den";
  den.textContent = formatNumber(d);
  frac.append(num, den);
  wrapper.append(frac);
  return wrapper;
}

function mixedNumberNote({ n, d }) {
  const abs = Math.abs(n);
  if (abs < d) return "Fracție ireductibilă";
  const whole = Math.floor(abs / d);
  return `${n < 0 ? "minus " : ""}${wholesText(whole)} și ${abs % d}/${d}`;
}

function render() {
  let expr = "";
  let main = "0";
  let ghost = "";
  let note = "";
  resultEl.classList.toggle("is-error", Boolean(state.error));

  if (state.error) {
    expr = state.error.exprText;
    main = state.error.message;
    note = "Apasă ⌫ ca să corectezi sau C ca să o iei de la capăt.";
  } else if (state.result) {
    expr = state.result.exprText;
    main = state.result.main;
    note = state.result.note;
    if (state.fractionView) note = mixedNumberNote(state.result.fraction);
  } else {
    const typed = expressionText(state.tokens);
    main = typed.text || "0";
    ghost = typed.ghost;
    note = previewText();
  }

  expressionEl.textContent = expr;
  noteEl.textContent = note;
  resultEl.replaceChildren();
  if (state.result && state.fractionView) {
    resultEl.append(fractionNode(state.result.fraction));
    resultEl.dataset.size = "";
  } else {
    resultEl.append(main);
    if (ghost) {
      const ghostEl = document.createElement("span");
      ghostEl.className = "ghost";
      ghostEl.textContent = ghost;
      resultEl.append(ghostEl);
    }
    resultEl.dataset.size = state.error ? "" : sizeFor((main + ghost).length);
  }
}

// Rezultatul „pe viu”, cât timp scrii
function previewText() {
  const tokens = state.tokens;
  if (tokens.length < 2) return "";
  try {
    const out = evaluate(tokens);
    if (out.kind === "rest") return `= ${formatNumber(out.quotient)} rest ${formatNumber(out.remainder)}`;
    return `= ${formatNumber(out.value)}`;
  } catch {
    return "";
  }
}

function renderHistory() {
  historyEmpty.hidden = history.length > 0;
  historyList.replaceChildren(
    ...history.map((item) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.title = "Folosește acest număr";
      const exprSpan = document.createElement("span");
      exprSpan.className = "history-expr";
      exprSpan.textContent = item.expr;
      const mainSpan = document.createElement("span");
      mainSpan.className = "history-main";
      mainSpan.textContent = item.main;
      button.append(exprSpan, mainSpan);
      button.addEventListener("click", () => useHistoryValue(item.value));
      li.append(button);
      return li;
    })
  );
}

// ================= Evenimente =================

const handlers = {
  digit: inputDigit,
  dec: inputDecimal,
  op: inputOperator,
  post: inputPostfix,
  fn: inputFunction,
  pi: inputPi,
  sep: inputSeparator,
  "(": inputOpenParen,
  ")": inputCloseParen,
  rest: inputRest,
  neg: negate,
  back: backspace,
  clear: clearAll,
  eq: equals,
  factors: factorize,
  fraction: toggleFraction,
};

function press(key) {
  const separator = key.indexOf(":");
  const type = separator === -1 ? key : key.slice(0, separator);
  const value = separator === -1 ? undefined : key.slice(separator + 1);
  state.error = null; // orice tastă scoate din starea de eroare; expresia rămâne, ca s-o poți corecta
  handlers[type](value);
  render();
}

const keysEl = document.querySelector(".keys");

// Zona din care Danny explică butoanele: tastele și panoul solar
const tipZone = document.querySelector(".calculator");

// A fost apăsare lungă? Atunci doar explicăm, nu apăsăm butonul.
function takeSuppressedClick() {
  const suppressed = suppressNextClick;
  suppressNextClick = false;
  return suppressed;
}

keysEl.addEventListener("click", (event) => {
  if (takeSuppressedClick()) return;
  const button = event.target.closest("button[data-k]");
  if (button) press(button.dataset.k);
});

// ---------- Telefon: apăsare lungă pe un buton → Danny explică ce face ----------

const LONG_PRESS_MS = 450;
const tipPop = document.getElementById("tip-pop");
const tipPopText = document.getElementById("tip-pop-text");
let pressTimer = null;
let pressStart = null;
let hideTipTimer = null;
let suppressNextClick = false;

// Fața lui Danny în balon: o copie a desenului mare, decupată pe cap
const face = document.querySelector(".hedgehog").cloneNode(true);
face.setAttribute("class", "tip-face");
face.setAttribute("viewBox", "70 100 160 160");
face.setAttribute("aria-hidden", "true");
face.removeAttribute("role");
face.removeAttribute("aria-label");
tipPop.prepend(face);

function showTipPop(button) {
  clearTimeout(hideTipTimer);
  tipPopText.textContent = button.dataset.tip;
  tipPop.hidden = false;
  const key = button.getBoundingClientRect();
  const pop = tipPop.getBoundingClientRect();
  const left = key.left + key.width / 2 - pop.width / 2;
  const top = key.top - pop.height - 12;
  tipPop.style.left = `${Math.min(Math.max(12, left), window.innerWidth - pop.width - 12)}px`;
  tipPop.style.top = `${top < 12 ? key.bottom + 12 : top}px`;
}

function hideTipPop(delay = 0) {
  clearTimeout(hideTipTimer);
  hideTipTimer = setTimeout(() => {
    tipPop.hidden = true;
  }, delay);
}

function cancelLongPress() {
  clearTimeout(pressTimer);
  pressTimer = null;
}

tipZone.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;
  suppressNextClick = false;
  hideTipPop();
  const button = event.target.closest("[data-tip]");
  if (!button) return;
  pressStart = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    suppressNextClick = true;
    showTipPop(button);
    navigator.vibrate?.(15);
  }, LONG_PRESS_MS);
});

tipZone.addEventListener("pointermove", (event) => {
  if (!pressTimer) return;
  if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) cancelLongPress();
});

tipZone.addEventListener("pointerup", () => {
  cancelLongPress();
  if (!tipPop.hidden) hideTipPop(2500);
});

tipZone.addEventListener("pointercancel", () => {
  cancelLongPress();
  hideTipPop();
});

// Fără meniul de copiere la apăsare lungă pe butoane (dar ecranul rămâne copiabil)
tipZone.addEventListener("contextmenu", (event) => {
  if (event.target.closest("[data-tip]")) event.preventDefault();
});

// Bula dispare imediat dacă derulezi pagina sau atingi oriunde altundeva
const dismissTipPop = () => {
  if (!tipPop.hidden) hideTipPop();
};
document.addEventListener("scroll", dismissTipPop, { capture: true, passive: true });
document.addEventListener("pointerdown", (event) => {
  if (!tipZone.contains(event.target)) dismissTipPop(); // pe calculator se ocupă deja handler-ul de mai sus
});

// Danny explică butonul peste care ții mouse-ul
tipZone.querySelectorAll("[data-tip]").forEach((button) => {
  button.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") showTip(button.dataset.tip);
  });
  button.addEventListener("pointerleave", hideTip);
  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) showTip(button.dataset.tip); // doar navigare din tastatură
  });
  button.addEventListener("blur", hideTip);
});

// ================= Ziua și noaptea (panoul solar e comutatorul) =================

const THEME_KEY = "danny-tema";
const rootEl = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const THEMES = {
  light: {
    bar: "#f6f2e8",
    tip: "Panoul solar: apasă pe el și se face noapte. Aricii sunt animale nocturne!",
    hello: [
      "Bună dimineața! Panoul solar s-a încărcat, putem calcula.",
      "A răsărit soarele! Numerele se văd mai bine la lumină.",
    ],
  },
  dark: {
    bar: "#161a30",
    tip: "E noapte. Apasă pe panoul solar și răsare soarele.",
    hello: [
      "Ura, e noapte! Aricii sunt animale nocturne, acum calculez cel mai bine.",
      "S-a aprins lumina ecranului. Hai la calcule pe întuneric!",
    ],
  },
};

function savedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved in THEMES ? saved : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  rootEl.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeToggle.dataset.tip = THEMES[theme].tip;
  themeColorMeta?.setAttribute("content", THEMES[theme].bar);
}

// Noaptea (sau ziua) se întinde pe pagină pornind chiar din panoul solar
function switchTheme(theme) {
  if (!document.startViewTransition || reducedMotion.matches) return applyTheme(theme);
  const panel = themeToggle.getBoundingClientRect();
  const x = panel.left + panel.width / 2;
  const y = panel.top + panel.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(() => applyTheme(theme));
  transition.ready.then(() => {
    rootEl.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 650, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" }
    );
  }).catch(() => {});
}

themeToggle.addEventListener("click", () => {
  if (takeSuppressedClick()) return;
  const theme = rootEl.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // fără stocare, tema se păstrează doar până închizi pagina
  }
  if (!tipPop.hidden) hideTipPop();
  switchTheme(theme);
  say(pick(THEMES[theme].hello), "happy");
});

// Până alegi tu, pagina urmează tema telefonului sau a calculatorului
systemDark.addEventListener?.("change", (event) => {
  if (!savedTheme()) switchTheme(event.matches ? "dark" : "light");
});

applyTheme(savedTheme() ?? (systemDark.matches ? "dark" : "light"));

const KEYBOARD = {
  "+": "op:+", "-": "op:-", "*": "op:*", "x": "op:*", "/": "op:/", ":": "op:/", "^": "op:^",
  "(": "(", ")": ")", ".": "dec", ",": "dec", ";": "sep", "%": "post:%",
  "Enter": "eq", "=": "eq", "Backspace": "back", "Escape": "clear", "Delete": "clear",
};

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = /^[0-9]$/.test(event.key) ? `digit:${event.key}` : KEYBOARD[event.key];
  if (!key) return;
  event.preventDefault();
  press(key);
  const button = document.querySelector(`.key[data-k="${CSS.escape(key)}"]`);
  if (button) {
    button.classList.add("pressed");
    setTimeout(() => button.classList.remove("pressed"), 110);
  }
});

document.getElementById("clear-history").addEventListener("click", () => {
  history = [];
  saveHistory();
  renderHistory();
  say("Am șters istoricul. Foaie nouă, calcule noi!");
});

render();
renderHistory();
