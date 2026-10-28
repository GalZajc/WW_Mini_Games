# Generiranje in dokazovanje enoličnih ugank Numberlink

## Zahteva in razlog za zamenjavo algoritma

Velja močnejša zahteva: obstaja natanko ena povezava vseh označenih parov z enostavnimi, med seboj disjunktnimi potmi; ta edina povezava pokrije vsa polja. Tudi druga povezava, ki bi pustila nekaj polj praznih, pomeni dvoumno uganko. To ustreza definiciji dobre uganke Numberlink v članku Yoshinaka idr. (2012). Ne zadostuje preveriti samo drugega polnega pokritja.

Prejšnji generator je razrezal naključno Hamiltonovo pot in nato pred sestavljanjem rešitev našteval vse možne poti vsakega para posebej. Pri malo parih je tak seznam eksplozivno velik. Poleg tega sama pokritost konstrukcije ničesar ne pove o enoličnosti. Povečanje števila naključnih poskusov teh dveh slabosti ni odpravilo.

Članek o ZDD-jih pokaže, kako se namesto seznamov posameznih poti obravnavajo množice robov in stanja delnih povezav. Nova implementacija uporablja lastno iskanje z robnimi domenami, širjenjem omejitev in komponentami delnih poti. Ne uporablja zunanje knjižnice ZDD in ni prevod tujega reševalnika.

## Lema o bližnjici

Če sta dva nekonsekutivna kvadratka iste enostavne poti sosednja, lahko vmesni odsek nadomestimo z enim robom. Dobimo drugo povezavo istih krajišč, uporabimo podmnožico polj prvotne poti in ohranimo disjunktnost z drugimi barvami. Zato rešitev dobre uganke ne sme imeti takšnega dotika same sebe: vsaka njena pot je inducirana pot mrežnega grafa.

Velja tudi uporabna redukcija za preverjanje. Naj bo znana rešitev R inducirana in naj pokrije vseh N polj. Vsako drugo povezavo Q lahko z zaporednim odstranjevanjem bližnjic skrčimo v povezavo Q' iz induciranih poti. Če smo odstranili vsaj en kvadratek, Q' ne more biti R, saj R uporablja vseh N polj. Če nismo odstranili ničesar, je Q' = Q. Torej druga poljubna povezava obstaja natanko tedaj, ko obstaja druga inducirana povezava.

To omogoča dokazovanje močnejše enoličnosti z iskanjem induciranih alternativ. Igralcu ne dodajamo pravila, da se pot ne sme dotakniti same sebe. Redukcija je veljavna samo za znano inducirano polno pokritje in iskanje, kjer so prazna polja dovoljena. Pri samostojnem štetju zgolj polnih pokritij se ta redukcija izključi. Test s polno potjo po mreži 2 × 2 izrecno preverja razliko: edino polno pokritje lahko še vedno dopušča krajšo povezavo s praznimi polji.

## Natančni reševalnik

Vsak rob ima tri stanja: neodločen, izključen ali izbran. Krajišče mora imeti stopnjo 1, druga uporabljena polja stopnjo 2, neuporabljena pa stopnjo 0. Iskanje dovoli neuporabljena polja. Širjenje omejitev prisili robove, kadar je preostala stopnja določena. Komponente izbranih robov zavračajo zanke in povezave različnih črk. Preverjanje dosegljivosti zavrača odrezane pare.

Za inducirano iskanje se dodatno zavrne komponenta z bližnjico. Dveh komponent, ki se dotikata po več kot enem mrežnem robu, ni mogoče združiti v inducirano pot: dodani rob bi druge dotike spremenil v bližnjice. Ta lastnost se uporablja samo v zgoraj dokazani redukciji.

Za k parov ima vsaka povezava, tudi nepolna, največ N − k izbranih robov. Že izbrane komponente skrčimo v vozlišča in za vsak še nedokončan par izračunamo najkrajše število potrebnih novih robov d_i. Če je že izbranih e robov, mora veljati e + sum(d_i) <= N − k. Negativna preostala rezerva pomeni protislovje. Rob, ki bi pri vsakem paru presegel skupno preostalo rezervo, se lahko varno izključi. Neodvisne najkrajše poti se lahko prekrivajo, zato je vsota le spodnja meja; uporabljamo jo samo v smeri, ki ne more odstraniti dejanske rešitve.

Iskanje razveji preostale robne domene in izčrpa vse dovoljene alternative. Znano, posebej preverjeno polno pokritje šteje kot prva rešitev. Druga dokončana povezava pomeni `multiple`. Izčrpano iskanje brez druge povezave pomeni `unique`. Presežena omejitev vozlišč pomeni `unknown` in nikoli ne potrdi enoličnosti.

## Generator z ohranjanjem potrjenega stanja

Začetno pokritje sestavljajo vzporedne ravne poti oziroma njihovi razrezi. Pri njih vsota manhattanskih minimalnih dolžin porabi vso mrežo, zato že začetno stanje omogoča natančen dokaz. Nato generator izbere konec ene poti, ga priključi sosednjemu delu druge poti in prenese njen rep. Drugi poti ostane preostali del. Takšna operacija ohrani pokritost, disjunktnost in število parov; spremeni krajišča in geometrijo poti.

Vsaka sprejeta sprememba ima svoj dokončan dokaz enoličnosti. Dvoumna ali računsko nepotrjena sprememba se zavrne, zadnje potrjeno stanje pa se obnovi. Generator tako ne zavrže vsega dela po stotinah neuspešnih novih plošč. Če želi manj barv od začetnega števila pasov, poskuša združevati poti in vsako združitev ponovno natančno preveri.

Končno stanje mora imeti dovolj zavojev, malo popolnoma ravnih poti in dovolj krajišč v notranjosti. Pri običajnih mrežah ima vsaka vrnjena pot najmanj tri polja. Te metrike preprečujejo očitno trivialne postavitve, niso pa formalna mera človeške težavnosti. Razpon barv se spoštuje; generator ne zviša števila barv mimo uporabnikove največje vrednosti. Privzeti razpon je blizu sqrt(N).

Izračun poteka v modulskem Web Workerju. Glavni prikaz se med pripravo odziva in kaže napredek. Ob zaprtju igre se delavec prekine. Časovni način začne meriti šele, ko je nova uganka pripravljena. Naključno seme, različica algoritma in parametri omogočajo ponovitev. Vsi parametri konstrukcije, kakovosti in dokazovalnika so zbrani v `parameters.js`.

## Kaj je mogoče sklepati iz velikosti

Za N polj in k parov je osnovna nujna meja 2k <= N. Naš pogoj najmanj treh polj na končno barvo za N >= 9 da strožjo konstrukcijsko mejo k <= floor(N/3). Ta meja ne trdi, da je vsaka manjša vrednost tudi izvedljiva z zanimivo enolično uganko.

Na pravokotni mreži z vsaj dvema vrsticama in dvema stolpcema ena barva ne more izpolniti močnejše zahteve. Polna pot ima N − 1 robov, mrežni graf pa jih ima 2N − A − B, kar je več kot N − 1 za A,B >= 2. Vsaj en dodatni mrežni rob povezuje nekonsekutivni polji poti in je bližnjica. Na enovrstični ali enostolpčni mreži te ovire ni.

Splošna odločitev o obstoju polnega pokritja je NP-polna (Adcock idr., 2015). To ne pomeni, da mora biti praktičen generator s 15 pari na 255 poljih neuspešen; pomembni so model iskanja, konstrukcija in ohranjanje že potrjenih stanj. Omejitvi 30 za dimenzijo in 400 za površino sta omejitvi te aplikacije, ne matematična izreka.

## Preverjanje in ponovljivost

`tests/flow-lines-logic.mjs` primerja novi števec z neodvisnim referenčnim algoritmom, ki našteje vse enostavne poti in vse disjunktne kombinacije. Primerjava obsega 240 štetij na manjših mrežah, z dovoljenimi praznimi polji in z obvezno pokritostjo. Vključeni so regresijski primer bližnjice, računska omejitev in ponovitev semena.

`benchmark.mjs` shrani parametre, semena, generirane poti, dokaze, rezultate CSV in čase v časovno označeno podmapo `OUTPUT`. Obsega pet semen za mrežo 15 × 17 z razponom 15–23 barv, tri za transponirano mrežo ter manjše in podolgovate mreže. `tests/flow-lines-electron-smoke.mjs` preveri dejanski delavec v Electronu, odzivnost med generiranjem, reševanje z miško, Z, časovno serijo, pavzo in prekinitev generiranja ter shrani slike.

Meritev različice `certified-tail-splice-v2` je v `OUTPUT/generator-2026-10-27-13-04-30/`: vseh 12 nastavitev je uspelo. Vseh osem velikih mrež je vrnilo 15 barv in 46–55 zavojev. Neposredno merjeni časi v Node.js so bili 1,886–6,192 s (mediana 3,650 s). To niso zagotovljeni časi v vsakem uporabniškem okolju. Preizkus dejanske aplikacije je v `OUTPUT/electron-2026-10-27T12-07-50-696Z/`; reševanje z miško, Z, časovna serija, pavza, prenos podatkov delavca in prekinitev so uspešni, izjem izvajalnega okolja ni bilo.

## Primarni viri

1. R. Yoshinaka, T. Saitoh, J. Kawahara, K. Tsuruma, H. Iwashita in S. Minato, *Finding All Solutions and Instances of Numberlink and Slitherlink by ZDDs*, Algorithms 5(2), 176–213, 2012. https://doi.org/10.3390/a5020176 . Izvorna koda avtorjev: https://github.com/kunisura/algorithms2012 in https://github.com/junkawahara/numberlink_gen .
2. A. Adcock idr., *Zig-Zag Numberlink is NP-Complete*, Journal of Information Processing 23(3), 239–245, 2015. https://doi.org/10.2197/ipsjjip.23.239 .
3. T. Dybdahl Ahle, dokumentacija avtorjevega reševalnika in generatorja: https://github.com/thomasahle/numberlink . Pomembno opozorilo avtorja je, da njegov hitri reševalnik sam ne potrjuje enoličnosti. Nova implementacija ga ne uporablja kot dokazovalnik in ne kopira njegove kode.
