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

## Structură

| Fișier | Rol |
|---|---|
| `index.html` | Structura paginii, tastele și desenul SVG cu Danny |
| `style.css` | Designul: foaia de caiet, calculatorul, istoricul, animațiile lui Danny |
| `script.js` | Logica: introducerea expresiei, parserul, funcțiile matematice, istoricul |
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
și bula lui Danny de pe telefon (apare la apăsare lungă, dispare la 2,5 secunde, la derulare sau la o atingere în altă parte).
