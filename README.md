# Calculăm cu Danny

Calculator web pentru elevii din clasele I–VIII, făcut cu HTML, CSS și JavaScript simplu (fără framework-uri).
Danny, un arici mascotă, explică fiecare tastă și reacționează la rezultate.

## Cum se rulează

Deschide `index.html` în browser. Nu trebuie instalat nimic.
(Fonturile se încarcă de pe Google Fonts. Fără internet, pagina folosește fonturile sistemului.)

## Ce știe să calculeze

| Tastă | Ce face | Exemplu |
|---|---|---|
| `+ − × ÷` | Operații de bază, cu ordinea corectă a operațiilor | `2 + 3 × 4 = 14` |
| `( )` | Paranteze (cele uitate se închid automat) | `(2 + 3) × 4 = 20` |
| `x²`, `xʸ` | Puteri | `2¹⁰ = 1024` |
| `√` | Radical | `√49 = 7` |
| `π` | Numărul pi, pentru cerc | `2π ≈ 6,28` |
| `\|x\|` | Modul | `modul(−7) = 7` |
| `±` | Schimbă semnul (numere întregi) | `5 → −5` |
| `%` | Procent | `20% × 150 = 30` |
| `rest` | Împărțire cu rest, cu verificare | `17 : 5 = 3 rest 2` |
| `cmmdc`, `cmmmc` | Cel mai mare divizor comun, cel mai mic multiplu comun | `cmmdc(12; 18) = 6` |
| `medie` | Media aritmetică | `medie(7; 8; 10) = 8,33` |
| `;` | Desparte numerele în cmmdc, cmmmc și medie | |
| `factori` | Descompunere în factori primi; spune dacă numărul e prim | `360 = 2³ · 3² · 5` |
| `a/b` | Transformă rezultatul în fracție ireductibilă | `0,75 = 3/4` |

Alte lucruri utile:
- **Rezultat pe viu:** rezultatul apare în timp ce scrii.
- **Înmulțire subînțeleasă:** `2π`, `3(4 + 1)`.
- **Mesaje clare la erori:** împărțire la 0, radical din număr negativ, `0⁰`.
- **Istoric:** ultimele 15 calcule rămân salvate în browser. Dacă apeși pe unul, refolosești rezultatul.
- **Tastatură:** cifre, `+ - * / ^ ( ) ;`, `Enter`, `Backspace`, `Esc`.
- **Zi și noapte:** panoul solar al calculatorului e comutatorul. Noaptea, caietul se întunecă, ecranul se aprinde și Danny (arici, deci animal nocturn) se bucură. La prima vizită se folosește tema telefonului sau a calculatorului, apoi alegerea ta se ține minte.

## Structură

| Fișier | Rol |
|---|---|
| `index.html` | Structura paginii, tastele și desenul SVG cu Danny |
| `style.css` | Designul: foaia de caiet, calculatorul, istoricul, animațiile lui Danny, tema de zi și de noapte |
| `script.js` | Logica: introducerea expresiei, parserul, funcțiile matematice, istoricul, comutatorul zi / noapte |
| `tests/calculator.test.js` | Testele automate (`node --test`) |

## Cum funcționează calculul

Expresia se ține ca listă de „jetoane” (numere, operatori, paranteze, funcții).
La `=`, un parser descendent recursiv o evaluează respectând ordinea operațiilor:
paranteze → puteri → înmulțiri/împărțiri → adunări/scăderi.
Nu se folosește `eval()`, care ar fi nesigur.

## Teste

Cu [Node.js](https://nodejs.org) instalat, din folderul `calculator`:

```
node --test
```

Testele (în `tests/calculator.test.js`) rulează aplicația într-o pagină simulată și apasă tastele ca un utilizator:
ordinea operațiilor, împărțirea cu rest, fracțiile, factorii primi, mesajele de eroare, istoricul
bula lui Danny de pe telefon (apare la apăsare lungă, dispare la 2,5 secunde, la derulare sau la o atingere în altă parte)
și tema de zi / noapte (urmează sistemul la prima vizită, apoi ține minte alegerea).

## Jurnal de modificări

### 21 noiembrie 2026
- **Temă de noapte**, cu panoul solar al calculatorului drept comutator:
  - noaptea se întinde pe pagină ca un cerc care pornește din panou, iar soarele de lângă el se transformă în lună;
  - caietul devine bleumarin, cu o lumină caldă de veioză, iar ecranul LCD se aprinde ca un calculator cu lumină de fundal;
  - Danny reacționează la schimbare, pentru că aricii sunt animale nocturne;
  - la prima vizită se folosește tema telefonului sau a calculatorului, apoi alegerea se ține minte, fără ca pagina să clipească alb la încărcare.
- Panoul solar are explicație, ca tastele: mouse deasupra pe desktop, apăsare lungă pe telefon.
- Pe telefon, zona de atingere a panoului e mai mare decât panoul desenat, iar bara browserului ia culoarea temei.
- Culorile din `style.css` sunt acum variabile, schimbate dintr-un singur loc pentru fiecare temă.
- Pe desktop, trecerea zi / noapte folosește o animație mai ușoară: un cerc de culoare plină crește din panou și se estompează. Animația de pe telefon redesena tot ecranul la fiecare cadru și se mișca sacadat pe monitoarele mari.
- **Optimizare de performanță**, pe baza măsurătorilor din Chrome:
  - grila caietului și lumina veiozei stau pe straturi separate, desenate o singură dată; la schimbarea temei se schimbă doar transparența lor, fără redesenare;
  - Danny are stratul lui, deci respirația nu mai redesenează pagina la fiecare cadru (în repaus, pagina nu mai consumă nimic);
  - pe desktop, pagina se redesenează în tema nouă cât timp cercul acoperă ecranul, iar estomparea începe după ce redesenarea s-a terminat;
  - rezultat, pe un calculator fără accelerare video: o schimbare de temă costă ~230ms de desenare în loc de ~1180ms, ascunși sub cerc.
- 10 teste noi pentru temă (60 în total).

### 15 noiembrie 2026
- Prima versiune a calculatorului, publicată pe GitHub Pages.
- Danny are o mascotă nouă, iar explicațiile tastelor merg și pe telefon, la apăsare lungă.
- Reparat: pe telefon, bula cu explicația nu mai rămâne blocată pe ecran. Dispare la 2,5 secunde după ce ridici degetul, când derulezi pagina sau când atingi în altă parte.
- Teste automate pentru calcule, erori, istoric și bula lui Danny.
