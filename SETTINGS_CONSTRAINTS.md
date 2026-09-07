# Omejitve nastavitev v WW Mini Games

Ta dokument opisuje, kaj se zgodi z vsako nastavitvijo in zakaj ima morebitno
omejitev. Namen je ločiti med starimi omejitvami drsnikov, ki niso več pravila,
ter omejitvami, ki so posledica matematike, fizike, topologije ali izvedljivosti
algoritma.

## Splošno pravilo

V standardnem meniju je vsaka številska nastavitev navadno polje
`input[type=number]`, ne drsnik. Vrednost `min`, `max` in `step` v stari shemi
so predlogi za uporabniški vmesnik, ne pa pravila za shranjevanje. Stari
`min`/`max` se uporabita samo kot mehka končna postanka domačih puščic; ročni
vnos ju lahko preseže. Pri izrecno označeni temeljni domeni
`domainMin`/`domainMax` (oziroma starejši `fundamental` oznaki) sta meji
resnični in puščici tam obstaneta na matematični meji. `step` ne omejuje
ročnega vnosa (za izrecno diskretni korak se lahko navede `domainStep`). V
vsakem primeru vnos še vedno preveri igra in ga nikoli tiho ne popravi na
drugo vrednost. Puščici na polju sta v temni barvni shemi in zamaknjeni štiri
piksle v desno.

Pred shranjevanjem in ponovnim zagonom se izvede `preparePauseSettings`. Če je
vrednost neskončna, NaN, napačnega tipa ali zunaj resničnega matematičnega ali
fizikalnega območja, se izpiše napaka, nastavitev se ne shrani in meni ostane
odprt. Igra ne sme tiho zamenjati vnesene vrednosti z drugo. Tudi če priprava
nastavitev vrne objekt, osrednji meni primerja vse neposredno vnesene številske
ključe in zavrne vsako nenapovedano zaokroževanje ali omejevanje.

Pri načinih z lastnim začetnim menijem velja isto pravilo: preverjanje se zgodi
pred shranjevanjem in pred odstranitvijo izbirnega okna. Profili različnih
načinov so ločeni, zato napaka ali sprememba enega načina ne spreminja drugega.

## Kaj pomenijo vrste omejitev

* **Končno število** prepreči NaN in neskončnost, ki bi pokvarila integrator,
  indeksiranje ali časovnik.
* **Celo število** je potrebno, kadar vrednost predstavlja število celic,
  kart, poskusov ali potez. Decimalna vrednost ni zaokrožena, ampak zavrnjena.
* **Strogo pozitivno** je potrebno za dolžino, maso, časovni interval, radij
  ali imenovalec. Nič bi pomenilo deljenje z nič ali degenerirano geometrijo.
* **Nenegativno** dopušča ničelno gravitacijo, trenje, dušenje, zamik ali
  čakanje, ker je to veljaven fizikalni primer.
* **Omejeno na [0, 1]** je uporabljeno za deleže, glasnost, motnost in
  interpolacijske faktorje. Vrednost zunaj intervala nima pomena za to
  količino.
* **Diskretna izbira** (način, kategorija ali kamera) mora biti ena od znanih
  možnosti, sicer ni definirano, katera pravila igre veljajo.

## Igre in njihova pravila

### Click Speed

`duration` mora biti končen in večji od nič. Čas je imenovalec pri izračunu
  hitrosti klikov; ničelno trajanje nima definirane hitrosti. Zgornja meja 60 s
  iz starega drsnika ni več omejitev.

### Cup and Ball (3D in 2D)

`ropeLength`, `ballRadius` in `cupRadius` so strogo pozitivni, ker določajo
  dolžine in trke. `gravity`, `ropeStiffness` in (v 2D) `angularSpeedDegrees`
  so lahko nič, ne pa negativni. Ni fizičnega razloga za nekdanji zgornji meji
  teh parametrov; zelo velike vrednosti so dovoljene, če jih zmore časovni
  korak simulacije. V 2D je `cupRestitution` v [0,1]: 0 pomeni popolnoma
  neelastičen normalni trk, 1 pa ohranitev relativne normalne hitrosti. Večja
  vrednost bi v pasivnem trku ustvarjala energijo. `cupFriction` je
  nenegativen in nima umetne zgornje meje. Trki se računajo ob vseh treh
  premičnih togih segmentih notranjosti posodice; impulz najprej odpravi
  prebadanje, nato uporabi restitucijo v normali in Coulombovo omejitev v
  tangenti. Zato žoga ne more več zgolj potovati skozi narisano posodico.

### Cup Shuffle

`cupCount` je celo število najmanj 2, ker ena sama posoda ni mešanje;
`shuffleMoves` je celo število od 0 naprej (nič potez je veljavna, če želi
  igralec testirati samo izbiro); `ballCount` je med 1 in številom posod;
`revealTime` je nenegativen, `shuffleSpeed` pa strogo pozitiven. Zgornje meje
števila posod in hitrosti niso pravila igre. Hitrost je živi vnos v igralnem
prikazu (ni del identitete rekorda); ničelna ali nekončna vrednost se tam
takoj označi z napako in se ne zamenja tiho.

### Curve Memory

`viewTime` in `curvatureCorrelation` sta nenegativna, `curveLength` in
`persistenceLength` strogo pozitivna, `drawingLowpassPasses` pa celo število od
0 naprej. Pri generiranju se korelacijska dolžina lahko poveča na tri vzorce
  koraka; to ni sprememba igralčeve nastavitve, ampak nujna diskretizacija, da
  filtriranje pri končnem številu vzorcev ostane stabilno.

### Number Memory

Časa prikaza in praznega presledka sta nenegativna. Začetna dolžina in število
  dodanih cifer sta celi števili najmanj 1. Zgornje meje 12 oziroma 6 so bile
  odstranjene iz žive poti; daljše zaporedje je samo težja in daljša igra.

### Rhythm Memory

`toleranceMs`, `minimumInterval` in `maximumInterval` so nenegativni, pri
  intervalih mora biti največji vsaj tako velik kot najmanjši. Ne dovolimo
  obrnjenega intervala, ker naključni generator tedaj ne bi imel nepraznega
  območja, ničelni interval pa je še vedno matematično definiran.

### Flappy Collection

Vsi profili (Classic 2D, Hoop Glider 3D in Multi-Lane 3D) se preverjajo
  neodvisno.

* Classic: `gravity >= 0`; `gap` je večji od nič in največ 560. Logični svet je
  visok 720, cev pa ima na vrhu in dnu 80 enot varnostnega roba, zato večja
  odprtina ne bi več definirala dveh cevi. Višina sveta je logična in ni
  odvisna od velikosti okna.
* Hoop Glider: kamera mora biti eden od znanih pogledov, način pogleda tirnice
  eden od treh znanih načinov; glasnost je v [0,1]; dušenje in vzmet sta
  nenegativna; hitrost, razmerje velikosti obroča in razmik obročev so pozitivni;
  koti zavijanja so nenegativni. Občutljivosti in višine kamere so lahko katera
  koli končna števila, tudi nič ali negativna (negativna občutljivost je
  obrnjena kontrola).
* Multi-Lane: `laneCount` je celo število 1–8, ker je trenutno osem ločenih
  tipk/stez v kontrolnem protokolu; več stez zahteva najprej nov način vnosa.
  `ringRadiusRatio` mora biti večji od 1, sicer se ptica geometrijsko ne more
  prilegati skozi obroč. Radij, hitrost, razmika in razpon višine imajo enake
  pozitivne oziroma nenegativne pogoje kot zgoraj.

### Go Cube

Za pravokotnik so `Nx` in `Ny`, za kuboid pa `Nx`, `Ny` in `Nz` cela števila
  najmanj 2. Pri eni točki v smeri ni nobene sosednje povezave in površinski Go
  graf ni definiran. Zgornje meje velikosti ni; omejitev je samo praktičen čas
  in pomnilnik igralčeve naprave.

### Lava Path Tilt

`pathWidth` je strogo pozitiven; trenje, lepljivost in moč nagiba so
  nenegativni. `turnSharpness` je v [0,1], ker je utež interpolacije med dvema
  smerema. Zgornje meje starih drsnikov niso fizikalne.

### N in a Row

`columns`, `rows` in `winLength` so cela števila najmanj 1. `winLength` ne sme
  presegati daljše stranice mreže; sicer nobena ravna vrsta ne more obstajati
  in igra nima zmagovalnega stanja. Vsi štirje načini (rotacija, naključna
  gravitacija, strel in potisk) uporabljajo isti profil pravil.

### Reaction Time

Način je `color`, `sound` ali `pendulum`. Število poskusov oziroma nihajev je
  celo število najmanj 1, ker nič poskusov ne bi proizvedlo rezultata. Profili
  za barvo, zvok in nihalo so ločeni.

### ReRoMo Tetris

Način je `rectangular`, `structural`, `circular` ali `mobius`; combo način je
  eden od dveh definiranih načinov. `DAS >= 0`, `ARR >= 0`, multiplikator hitrega
  premika in hitrost mehkega spusta sta nenegativna, `comboTime >= 0`. Ničelni
  ARR uporabi največ premikov, ki jih dovoli varnostni proračun enega okvirja;
  ničelni multiplikator hitrega premika ga izključi, ničelni multiplikator
  mehkega spusta pa izključi dodatno pospeševanje. Začetna hitrost je
  nenegativna: pri `0` kos pada z največjim številom korakov, ki jih dovoli
  varnostni proračun enega okvirja. Faktor naraščanja je nenegativen: `0` je veljaven način
  konstantne hitrosti, pri katerem se po napredovanju ravni uporabi nevtralni
  faktor `1`; pri pozitivnih vrednostih ostane zgodovinska odstotna potenčna
  formula.
  Začetni zamik zaklepanja in njegovo zmanjšanje sta lahko nič.

Število stolpcev in vrst je najmanj 1 pri kartezičnem, polarnem in strukturnem
  načinu. Pri Möbiusu je dovoljeno 10–256 v obeh smereh, ker dvojni prehod
  uporablja predračunan predlog mreže z omejenim pomnilniškim predpomnilnikom;
  vrednost zunaj tega območja se ne spremeni, ampak se takoj zavrne in pove
  razlog. `lineClearDuration >= 0`; pri ničli se animacija preskoči in se
  vrstica takoj počisti, zato ni nevarnosti neskončne zanke.
  Motnosti in glasnost so v [0,1], `nextPreviewCount >= 1`, barve pa morajo biti
  šestmestni zapisi `#RRGGBB`.

Strukturni način ima še fizikalne domene: velikost celice, masa in največji čas
  prevračanja so pozitivni; gravitacija, dušenje in začetna kotna hitrost so
  nenegativni; podporna varnostna meja je [0,0.5]; končni kot prevračanja je
  [0°,180°]. Verjetnosti polinomov so nenegativne. To niso omejitve zaradi
  drsnika, temveč pogoji, v katerih so enačbe in primerjava uteži definirane.

### Rod Balance (3D in 2D)

Dolžina roke in palice sta pozitivni, gravitacija in koeficient trenja pa
  nenegativna. V 2D in 3D ima vsak način svoj profil. Velikost okna vpliva samo
  na prikaz, ne na te metre in ne na rekord.

### Rubik Twisty Puzzles

Za kvader so `Nx`, `Ny`, `Nz >= 1`; ena kocka v smeri je dovoljena. Torus potrebuje
  `U >= 4` in `V >= 3`, sicer osnovni obroč oziroma prečni obroč degenerira.
  Pri tetraedru, oktaedru, dodekaedru in ikozaedru je red celo število najmanj
  2 in največji red iz kataloga konkretnega poliedra; kataloška meja je meja
  razpoložljive mreže, ne skriti popravek vnosa. Dolžina vlečenja za četrt obrata
  in hitrost animacije sta pozitivni. Velikost podokenjca in zoom sta vizualni
  nastavitvi oziroma interakciji in ne vplivata na rezultat.

### Sky Pilot 3D

Podeduje pozitivne parametre obročev in hitrosti iz Hoop Gliderja. Največji kot
  vzpona/potopa je med 0° in 180° (kota zunaj tega območja nista enolična za
  omejitev smeri), odziv krmiljenja je nenegativen, razdalja kamere pozitivna,
  višina in občutljivost pa sta lahko kateri koli končni števili.

### Sudoku

`m` in `n` sta celi števili najmanj 1. Produkt `m*n` je največ 30, ker trenutni
  solver uporablja JavaScriptovo bitno masko; bitni operatorji imajo 32-bitno
  domeno in pri več simbolih bi reševanje tiho prelivala. To je jasno sporočena
  računska omejitev, ne omejitev starega drsnika. Delež namigov je v [0,1].
  Mreža je pred začetkom generiranja preverjena, zato napačen vnos ne sproži
  delno generirane igre.

### Tarzan Swing

Dolžine, masa, višine in vztrajnost so pozitivne; gravitacija, standardni
  odkloni, dušenja, sile in hitrosti so nenegativni. `reachabilitySafety` je v
  (0,1], saj je to faktor varnostnega ovoja dosega. Koti so končni.

Naključno ustvarjene razdalje in dolžine niso uporabniški vnosi, ki bi se nato
  tiho spreminjali. Generator jih po vzorčenju omeji na varen ovojnico, ki jo
  izračuna iz dosega rok in začetne energije. To je namerna varovalka za
  obljubo igre, da je naslednja veja vedno dosegljiva; brez nje bi naključje
  lahko ustvarilo fizično nerešljiv krog.

### Standing Swing Jump

Masa, dolžine in hitrosti/časovni parametri, ki predstavljajo pozitivno
  fizikalno količino, so strogo pozitivni; hitrost aktuacije rok je lahko tudi
  nič (takrat so roke zamrznjene); gravitacija, dušenja in sile so lahko
  nič. Delež višine ramen je v [0,1]. Dosegi roke morajo ležati med
  `|L1-L2|` in `L1+L2`, kar je trikotniška neenakost za dve togi povezavi.
  Simulacijski projekcijski korak vmesno numerično stanje vrne v ta doseg, ne
  spreminja nastavitev.

### Wheelie Balance

Masa, medosna razdalja, radij kolesa in vztrajnost so pozitivni. Gravitacija,
  kotalni upor, trenje, aerodinamični upor, dušenje in standardni odkloni terena
  so nenegativni. Srednji FWHM hribčkov je pozitiven; amplituda je lahko nič.
  Učinkovitost pogona je v [0,1]. Moč motorja v igri je nenegativna in ni del
  identitete rekorda. Naključno vzorčena amplituda/FWHM se zaradi fizikalnega
  pomena (višina oziroma širina ne moreta biti negativni) pretvorita v veljavni
  realiziran teren; povprečja in odkloni v nastavitvah se ne spreminjajo. Tudi
  živi vnos moči ob neveljavni vrednosti pokaže napako namesto tihega povratka.

### Spherical Bowl

Igra ima deset popolnoma ločenih profilov in rekordov: 3D balansiranje
  drsečega ploščka in kotaleče frnikule, 3D met obeh teles na razdaljo ali v
  tarčo ter štiri ustrezne 2D mete. Vsi skupni fizikalni parametri in numerične
  konstante so zbrani v `renderer/games/spherical-bowl-balance/physics.js`.
  Gravitacija, največji izmerjeni pospešek posode, koeficienti trenja, dušenje
  in dovoljeno območje premika so nenegativni; radij posode je pozitiven.
  Ničelna gravitacija, trenje, dušenje, pospešek ali območje premika so
  matematično veljavni poskusi in zato niso zavrnjeni.

Pri ploščku se polmer njegove podporne poti po vsakem podkoraku projicira na
  `R`; plošček je narisan kot tanek valj, katerega zunanja ploskev se dotika
  posode, zato geometrija ne prebada površine. Coulombovo trenje lahko mirujoči
  plošček zadrži, kadar je potrebna tangentna sila manjša od `μN`; sicer deluje
  nasproti drsenju. Viskozno dušenje je ločen nenegativen parameter.

Pri frnikuli mora veljati `0 < r < R`, saj je pot njenega središča krogelna
  ploskev s polmerom `R-r`; pri `r >= R` taka notranja pot ne obstaja. Za polno
  homogeno kroglo je `I = 2mr²/5`. Če lepenje zmore zahtevano silo
  `|F_s| = (2/7)m|a_t| <= μ_s N`, je pospešek središča `5a_t/7` in velja pogoj
  brez drsenja `v + ω × (r n) = 0`. Ko zahtevana sila preseže mejo lepenja,
  translacija in vrtenje tečeta ločeno, kinetično trenje pa nasprotuje hitrosti
  kontaktne točke. `staticFrictionCoefficient` in `rollingFrictionCoefficient`
  sta zato nenegativna; nič pomeni idealno odsotnost posamezne izgube.

Pri balansiranju sta notranji in zunanji delež rdečega pasu v [0,1] in notranji
  ne sme presegati zunanjega, ker sta radialna deleža iste polkrogle. Telo vedno
  začne v najnižjem delu posode. Pred prvim vstopom v pas čas in toleranca za
  izpad sploh ne tečeta; prvi vstop začne rekordni čas pri natanko nič
  sekundah.

Pri metih je odpiralni kot posode `theta` v [0,π]. Zunaj tega intervala del
  krogle ni enolično opisan kot skleda od dna do roba. Mejni vrednosti sta
  dovoljeni: `theta=0` je degeneriran preizkus s takojšnjim robom, `theta=π`
  pa zaprta krogelna meja, iz katere pasiven izmet praviloma ni mogoč. Krog
  dovoljenega premikanja ima polmer najmanj 0. Tarča je reproducibilno izbrana
  zunaj tega kroga iz shranjenega semena. Posoda sledi miški neposredno v CSS
  slikovnih pikah; omejen je le iz tega gibanja ocenjeni fizikalni pospešek, ne
  pa prikazana lega. S tem visoka gostota pik zaslona ne zmanjša dosega miške.

### Dino Runner

Hitrost teka, gravitacija, začetna hitrost skoka in srednji razmik ovir so
  strogo pozitivni; standardni odklon razmikov je nenegativen. Zgornjih meja
  ni. Gaussov vzorec razmika lahko tudi pri pozitivnem povprečju pade na nič
  ali pod nič. Tak posamezni vzorec dobi najmanjši pozitivni prirastek `0,01 m`,
  ker bi nepozitiven prirastek pomenil, da zanka za ustvarjanje ovir nikoli ne
  napreduje. To ne spreminja uporabnikovega povprečja ali standardnega odklona
  in ne omejuje velikih pozitivnih vzorcev. Fizika uporablja stalne svetovne
  metre; sprememba velikosti okna spremeni le prikaz.

### Robot Island

1D in izometrični 2D način imata ločena profila in ločene rekorde. Dolžina
  otoka `l` in stalna velikost hitrosti robota sta strogo pozitivni in brez
  zgornje meje. Padec določa prehod podporne točke robota čez rob, zato je
  matematično dovoljen vsak pozitiven `l`; velikost narisanega robotka ne uvaja
  skrite spodnje meje. Med tekom ni ukaza za zaustavitev: brez nove puščice se
  ohrani zadnja smer in velikost hitrosti ostane enaka nastavljeni vrednosti.

### Word Tiles in Slovenske besedne ploščice

Velikost plošče je pozitivno liho celo število, da ima središče za začetno
  besedo; stojalo in pregled besed sta pozitivni celi števili; bonus in zamik
  računalnika sta nenegativna. Besedni slovar določa, katere besede so veljavne,
  ne pa zgornje meje plošče iz starega drsnika.

### Klasične namizne igre

Profili Reversi, Dama, Callisto, Človek ne jezi se, Šah, Scrabble in Klasični
  spomin so ločeni.

* Reversi potrebuje sodo ploščo najmanj 4, da so začetni štirje kamni in robovi
  definirani. Dama potrebuje sodo ploščo najmanj 6 in toliko začetnih vrst, da
  ostane vsaj ena prazna vrsta med igralcema.
* Callisto uporablja najmanj 8 polj, 2–4 igralce in število ploščic med 5 in
  številom oblik v katalogu; brez teh vrednosti začetni stebri oziroma oblike
  niso definirani.
* Ludo ima 2–6 igralcev, vsaj 2 strani kocke, vsaj 1 ciljno polje in figuro,
  skupna pot pa mora imeti vsaj `4 * število igralcev` polj, da se začetne poti
  ne prekrivajo. Met za vstop je med 1 in številom strani kocke, AI-zamik pa je
  lahko tudi nič.
* Šahovska globina je celo število najmanj 1; ničelna globina ne bi pomenila
  niti ene ocene poteze.
* Scrabble uporablja ista pravila kot Word Tiles: liha pozitivna plošča,
  pozitivno stojalo in pregled besed, nenegativen bonus in AI-zamik.
* Klasični spomin potrebuje vsaj dva para in največ toliko parov, kolikor jih
  vsebuje izbrana kategorija. Zasuk kart, čas prikaza in AI-zamik so
  nenegativni; kategorija mora obstajati.

### Card Lounge

Način je Blackjack, Osmica, Vojna ali Spomin s kartami. Število kompletov je
  najmanj 1 brez umetne zgornje meje. Začetna roka pri Osmici je 1–25, ker dve
  začetni roki in vsaj ena karta v kupu potrebujejo največ 52 kart. Spomin s
  kartami ima 1–26 parov iz istega razloga. AI-zamik je nenegativen.

### Tic Tac Toe

Način (igralec proti AI ali večigralstvo) določa le protokol igranja. Vrstice in
  stolpci so cela števila najmanj 1, dolžina vrste pa med 1 in daljšo stranico
  mreže. Daljša vrsta bi bila matematično nemogoča in je zato takoj zavrnjena;
  stari `min=2,max=20` drsnika ne veljata.

## Omejitve, ki niso nastavitve

Nekatere `Math.min`/`Math.max` vrstice so namenjene zaslonu ali numerični
  robustnosti, ne pa omejevanju uporabniškega vnosa: najmanjša debelina črte,
  razmerje pikslov zaslona, omejitev največjega koraka med zamrznjenim okvirjem,
  hitbox in velikost pisave. Te vrednosti ne gredo v profil nastavitev in ne
  spreminjajo rekordov.

Fizikalni integratorji imajo tudi največje število podkorakov na enem okvirju,
  da zamrznjen ali zelo počasen okvir ne porabi neskončnega časa. To je varovalo
  izvajanja, ne tiho spreminjanje parametra; uporabniški parameter ostane v
  profilu in je pri naslednjem koraku ponovno uporabljen.

Če se doda nova igra ali nov način, mora dobiti lasten `preparePauseSettings`
  (oziroma skupni validator), vse fizične konstante pa morajo ostati na enem
  mestu ali v konfiguracijski datoteki. Vsaka nova meja mora biti opisana tukaj
  skupaj z razlogom, kaj bi se matematično ali fizikalno pokvarilo brez nje.
