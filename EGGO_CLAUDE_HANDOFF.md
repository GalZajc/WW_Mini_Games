# Prompt za nadaljevanje rekonstrukcije Eggo Mania

**POSODOBITEV:** Najprej preberi `EGGO_REPLAY_STATUS.md`. Nadaljevanje19. oktobra zvečer je določilo začetek400/seed1492 in doseglo1513 zaporednih natančnih slik401..1913. Prva preostala razlika1914 (trije piksli). Spodnji prvotni opis je zgodovinski in njegovi stavki, da novi posnetek še ni bil analiziran, ne veljajo več.

Nadaljuj dejansko delo v tem projektu, ne ostani pri načrtu. Cilj je natančna rekonstrukcija originalnega GBA Eggo Mania Survival v WW Mini Games. Spodaj je predaja trenutnega stanja za Claude; preberi jo skupaj z navedenim AGENT_GUIDE.md. Ne sklepaj, da je igra že popravljena ali v celoti preverjena.

## Glavna naloga in merilo uspeha

Uporabi NOV uporabnikov dolg posnetek: 15 Survival levelov, na koncu pa še nekaj igranja, ki NI Survival. Iterativno predvajaj iste vhode v rekonstrukciji, najdi prvo razliko glede na original, ugotovi pravi vzrok v kodi/mehaniki originala, popravi in ponovno predvajaj od začetka. To ponavljaj, dokler so vsi piksli vseh sličic celotnega Survival dela enaki originalu. Zaključnega ne-Survival dela ne obravnavaj kot Survival; najprej določi in zabeleži njegovo točno mejo.

Popolno ujemanje tega posnetka je močan potreben pogoj, ne dokaz pravilnosti vseh možnih iger. Ne razglašaj popolne dekompilacije na podlagi ene scene, enakih položajev ali original-vs-original preverjanja emulatorja.

Projekt in avtoritativna izvorna koda:

`C:\Users\galza\Igre\pc\Moje Igrce\WW Mini Games`

NOVI POSNETEK, ki ima prednost pred vsemi starejšimi:

`tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/`

Njegov summary.json je preverjen: **111652 frames**, **2989565376 compressed_bytes**, **1870.1089394 wall_seconds**, **complete=true**, **dropped_frames=0**, **error=null**. Ta posnetek še NI bil analiziran ali predvajan v rekonstrukciji. Začetni odmik in konec Survival dela še nista določena.

## Pravila dela

- Ne klikaj po uporabnikovem zaslonu in ne prevzemaj fokusa. Emulator in Electron upravljaj programsko, skrito in UTIŠANO. Uporabnik medtem uporablja računalnik.
- Ohrani druge lokalne spremembe. Veliko Eggo datotek je untracked; prazen git diff ni dokaz, da ni sprememb. Pred novim sklopom popravkov naredi ciljan backup izvornih datotek v projektni timestamped OUTPUT imenik.
- Ne izvajaj nepotrebnih velikih testnih baterij. Popravek preveri s primerjavo prizadetega prefiksa, potem nadaljuj do naslednje prve razlike. Pred končno trditvijo o uspehu pa preveri VES Survival posnetek od istega začetka.
- Parametri, semena oziroma popolno začetno stanje, hashi, vhodi, odmik med številčenjem sličic in rezultati morajo biti reproducibilno zapisani v timestamped OUTPUT podmapi. Besedilo UTF-8, ohrani č/š/ž v poteh.
- Snemanje obsega približno 3 GB stisnjenih podatkov, razširjeno več deset GB. Obdeluj pretočno, z omejenimi vrstami/predpomnilnikom in napredkom; cilj RAM <5 GB, največ 12 GB. Ne nalagaj celotnega razširjenega posnetka v pomnilnik.

## Kaj najprej prebrati

1. `renderer/games/eggo-mania/AGENT_GUIDE.md` — glavna dokumentacija dosedanjih mehanik in dokazov. Zadnjih popravkov starega uporabnikovega posnetka še ne vsebuje v celoti; zato velja tudi spodnji razdelek trenutnega stanja.
2. `renderer/games/eggo-mania/REFERENCE.md` — kronološki dokazi, naslovi ROM in predhodni eksperimenti.
3. `tools/eggo-recorder/core.py`, `capture.py`, `inspect_capture.py` — format in točna časovna faza zajema.
4. `scripts/eggo-prepare-user-replay.py`, `scripts/eggo-reference.py`.
5. `tests/eggo-mania-visual.mjs`, `scripts/eggo-compare-replay-frame-screenshots.py`.

Produkcijska implementacija je v `renderer/games/eggo-mania/`: predvsem `model.js`, `game.js`, `view.js`, `pixel-renderer.js`, `native-cpu.js`, `native-water.js`, `native-rescue.js` in assets.

## Original kot referenca: kaj posnetek vsebuje

Vsak imenik posnetka ima `parameters.json`, `initial.state`, `frames.egcap`, `inputs.jsonl`, `audio.wav`, `summary.json`, diagnostiko controllerja in praviloma originalne emulator checkpoint-e vsakih 300 sličic (`after-frame-....state`).

`frames.egcap` je lossless XOR-delta/zlib arhiv ORIGINALNEGA framebufferja in pomnilnikov. `capture.frames(recording_path)` pretočno vrača `(record, raw_video, concatenated_memory)`. Preberi dejanski `parameters.json['layout']`: video je ločen prvi element, nadaljnji segmenti pomnilnika so EWRAM 02000000, IWRAM 03000000, IO 04000000, palette 05000000, VRAM 06000000, OAM 07000000. Izvirna slika je 240 × 160 RGB565; uporabi obstoječi `capture.rgb_image()` za enako razširitev barv. Primerjaj te nativne piksle, brez skaliranja, glajenja ali izgubnega videa.

Video IN pripadajoči pomnilnik sta zajeta **znotraj video_refresh callbacka**. Naključno vzorčenje IO po retro_run lahko pokaže HBlank register ali drugačno fazo in lažno sugerira napačno ozadje/vodo. Če preurediš zajem, najprej dokaži enakost njegovih slik s posnetkom. OAM lahko prikazuje stanje pred naslednjo posodobitvijo modela; časovne razlike pojasni z originalno zanko, ne z ročnim premetavanjem sličic.

V `inputs.jsonl` je za vsako sličico `mask`. To so **libretro** biti, ne GBA KEYINPUT:

`B:0, SELECT:2, START:3, UP:4, DOWN:5, LEFT:6, RIGHT:7, A:8, L:10, R:11`.

Primer pretvorbe v steps je že v `eggo-prepare-user-replay.py`: `[trajanje, 'UP+RIGHT']`. Ne zamenjaj bitov A/B ali časovne faze inputa. Originalni FPS je 59.727500915527344; deterministični preizkus uporablja en input in en update za eno emulirano sličico, ne stenskega časa/RAF.

ROM: `C:\Users\galza\Igre\nintendo\gba\Eggo Mania (E) (M6).gba`

Bundled core: `tools/eggo-recorder/runtime/mgba_libretro.dll`.

Novi parameters.json:

- ROM SHA256 `6d2b36ace32d62c9e89dde5dfc236768b25ff4db66095673724affd2946a3514`
- core SHA256 `fe5f607e11f6f5d729825ca22d5e5b6df23aa94b8747bb1260f6bb0de5466c68`
- initial.state SHA256 `4b41cbbe544647aded13a6e99ec44a5d094ab6ee9523f64c2e8aab9abee3479c`

Uporabi vse shranjene core_options; frameskip, color correction in interframe blending so izklopljeni. RNG je v popolnem začetnem stanju, ne izmišljaj novega seed-a. `recorder.py --verify <recording>` preverja original proti originalu in samo po sebi NI preverjanje rekonstrukcije.

## Zahtevan praktični workflow

1. Preveri integriteto novega posnetka in pretočno indeksiraj potek: začetek igranja, izbira lika, arena, vsi Survival prehodi/rezultati in točen konec Survival. Shrani preslikavo številk: številka sličice posnetka, replay indeks in native števec (ta se lahko ob novi rundi ponastavi). Ne uporabi slepo starega odmika 352.
2. Enkrat določi skupno, preverljivo začetno stanje originala in JS implementacije. Če UI/intro za zdaj nista zajeta v primerjavi, izrecno navedi izključeni interval. Za cilj celotnega Survival pozneje pokrij tudi njegove prehode. Preberi dejanske like, arene, RNG, podporne števce, kamero, delce in trenutno fazo; ne vsiljuj starega Factory fixture-a ali default lika.
3. Pripravi pretočen oziroma chunked autonomous replay. Po začetni inicializaciji JS poganja lastno stanje in originalne vhode. Originalne sledi so potem samo merilo. Ne prepisuj igralca, AI, hazardov, pickupov, RNG ali drugih stanj iz originala vsako sličico, niti ne ponastavljaj rekonstrukcije po native oracle-u na vsakem levelu. To bi skrilo napake.
4. Primerjaj celoten framebuffer obeh strani po vsaki sličici. Ob PRVI razliki shrani original/app/diff PNG, število in bounding box različnih pikslov, prvo koordinato in RGB, relevantno stanje obeh strani ter nekaj prejšnjih sličic/vhodov. Minimalni reproducibilni segment označi z izvorno številko sličice. Ne preskoči razlik kot »kozmetičnih«.
5. Najprej ugotovi, ali gre za napačno inicializacijo/časovno fazo comparatorja ali resnično napako igre. Nato sledi vzroku: Q16 položaji, kontaktnost, kamera, plošča, RNG/vrstni red klicev, AI, animation group/cel/palette, BG ring ali OBJ prioritete. Pri razlikah slike razstavi originalne BG/OBJ plasti; plastem zaupaj šele, ko njihov skupni sestavek natančno ustreza originalnemu framebufferju.
6. Poišči izvirno funkcijo prek ROM disassembly/Ghidre, izpelji pravilo in popravi produkcijsko kodo. Ne prilagajaj na roko posameznim časom posnetka. Ne uporabljaj posnetih celotnih sličic kot izhoda igre, native oracle state injection ali prikritega emulatorja namesto zahtevane rekonstrukcije. Iz ROM-a dekodirani dejanski sprite-i/palete so obstoječa legitimna pot za assets.
7. Po popravku ponovno predvajaj OD ISTEGA ZAČETKA in potrdi, da je prej pravilen prefiks ostal pravilen. Lokalni app checkpoint je dovoljen za hitro diagnostiko le, če je nastal iz prej preverjenega prefiksa; končna regresija mora iti od skupnega začetka brez popravljanja stanja z oracle-om.
8. Nadaljuj pri novi prvi razliki. Ob ustavitvi napiši preverjeni interval, točno prvo preostalo razliko, vzrok/hipotezo, ukaze, output poti in spremembe v AGENT_GUIDE. Ne poročaj samo »testi uspešni«, če piksli še odstopajo.

Sedanji harness uporablja en velik contact sheet. **111652 sličic ne daj na en canvas**: prekoračil bi dimenzije in RAM. Razširi ga s serijskim primerjanjem/chunki, ob prvi razliki ustavi, shrani poročilo. Prav tako ne izvažaj vseh 111652 polnih RAM/VRAM snapshotov v razširjeni obliki; originalni arhiv jih že vsebuje.

## Točka predaje: zadnji dejanski popravki in rezultati

Dosedanje delo je uporabljalo STAREJŠI posnetek `tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_17-43-13_642956/` (17583 frames), predvsem njegovih 600 sličic po checkpointu 352. Arena Park, igralec Yolko, CPU Eggo; CPU ima boots že v začetnem checkpointu. **Novi 111652-frame posnetek zdaj nadomesti starega kot glavni cilj**, starega ohrani kot regresijo.

Stari checkpoint in vhodni steps:

`scripts/OUTPUT/eggo-user-replay_2026-10-19_19-07-49_733012/user-initial.*`

V istem imeniku sta `steps.json` in `steps-first600.json`. Originalnih 600 sličic:

`scripts/OUTPUT/eggo-reference_2026-10-19_19-08-03_088727/user-first600*`

`recording-parity.json` v tem outputu dokazuje 600/600 enakih originalnih traced PNG glede na dejanski stari posnetek. To je zanesljiv oracle, ne še dokaz pravilne JS igre.

Zadnji končani JS test:

`tests/OUTPUT/eggo-mania-visual_2026-10-19T17-24-45-888Z/`

`input-replay-report.json`, `parameters.json`, `input-replay-app-frames.png` in final diff so shranjeni. Rezultat: položaji obeh igralcev in obe kameri vseh 600 sličic enaki; vrstice, pickupi, vsi štirje hazardi, oba field RNG in global RNG enaki. CPU input se ujema 596/600 (štirje rotation-key odkloni ostajajo, čeprav se ta svetovni potek še ujema). Končna sličica 600 ima **3588 različnih pikslov**, vsi v igralčevem območju x=0..111,y=121..159. Torej NI pixel-perfect.

Na tem ZADNJEM outputu še NI pognana primerjava vsake sličice. Prejšnja izvedba pred zadnjim popravkom flame/particle initialization je imela 59/600 povsem enakih sličic, prvo razliko na frame 1 (191 pikslov; flame/delci), največjo na frame 296 (9176). Ne predstavljaj teh starih številk kot meritev zadnjega outputa. `initialComparison` ima 32933 razlik zaradi neobnovljenih pred-update render snapshotov in sam po sebi ni veljavna primerjava prvega replay frame-a.

Najnovejše spremembe, ki jih preberi in ohrani, če jih dokazi ne ovržejo:

- `view.js`: camera lookdown/up je pravilno vezan na dejansko podporo/ground, ne na tipko med prostim padom; odstranjen napačen dvojni popravek negativnega offseta. Survival intro descent uporablja native foreground camera, ne posebnega približka.
- `model.js`: deferred jump sme slediti le podpori PO horizontalnem premiku. Lokalni `nativeJumpSupported` se izračuna iz `alignedNativeSupport` in `nativeFootprintCanLand(Math.round(e.y))` pred vertikalnim korakom. Ne zamenjaj ga s končnim `e.ground`: deferred jump namenoma preskoči ground-hold/landing, zato bi s tem pokvaril prave skoke. To je odpravilo CPU prvo pozicijsko razliko na frame 288.
- `native-rescue.js`: faza plovila lahko teče nazaj pred znanim phase anchorjem; odstranjen `Math.max(0, frame-startFrame)`. Parametri flame v `NATIVE_RESCUE.flame`: x56,y43,w16,h8,phaseBit8.
- `pixel-renderer.js`: playing intro descent uporablja pravi native BG ring in gibanje rescue plovila, stitched intro ostaja samo countdown. Palete plovila so po arenah. Ločena 16x8 flame animacija uporablja ROM 0x0821f1dc/0x0821f19c, prior frame bit8. Popolna pravilnost prioritet/faze še potrebuje pikselski dokaz.
- `scripts/eggo-build-stage-airships.py`: najnovejši assets iz štirih surovih 64x64 OBJ plovila brez zapečenega plamena, per-arena palette6 in ločen flame. Zadnji output `scripts/OUTPUT/eggo-stage-airships_2026-10-19_19-24-21/`.
- `scripts/eggo-build-character-rivals.py`, novi `native-character-resources.js` in osem `*-rival-native.png`: splošni CPU character atlasi iz ROM, CPU palette na originalnem palette pointer+32. `view.js` izbere ustrezen resource, če je `tower.nativeRivalCharacter` nastavljen. Harness začetno ime določi iz originalnega actor resource root. **Produkcijska izbira CPU lika in celoten prehod na nove nasprotnike še nista na novo izpeljana**; fallback je stara per-stage izbira. Generic injury/swim resource izbira prav tako še ni povsod odpravljena.
- Harness `tests/eggo-mania-visual.mjs`: dodan `--replay-intro-descent`, restore CPU bootsTicks iz actor+0x92c in char resourceRoot iz actor+0x838. Zadnja verzija obnovi tudi aktivne type1/2 delce iz native pool 0x31510,14 slotov,stride0x3c. Te spremembe inicializirajo star checkpoint; ne dokazujejo pravilnega nastajanja vseh učinkov skozi novo dolgo igro.

Backup pred tem sklopom je `scripts/OUTPUT/eggo-user-tape-fixes-backup_2026-10-19_19-11-23/`; vsebuje takratne model/view/game/pixel-renderer, ne vseh pozneje spremenjenih datotek. Ne obnavljaj ga čez sedanje delo in ga ne imej za popoln aktualni backup.

Stara pomembna regresija je 420-frame long-direction-jumps, original v `scripts/OUTPUT/eggo-reference_2026-10-19_12-03-21_931957/long-direction-jumps*`. Prej je bila 420/420 pixel-perfect (`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-19_17-08-10_582562/`), **po zadnjih zgornjih popravkih še ni bila ponovljena**.

## Obstoječi ukazi in omejitve orodij

PowerShell začni v projektu:

```powershell
Set-Location -LiteralPath 'C:\Users\galza\Igre\pc\Moje Igrce\WW Mini Games'
```

Tako je bil pripravljen STARI checkpoint (primer sintakse, ne ukaz za novi odmik):

```powershell
python scripts/eggo-prepare-user-replay.py tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_17-43-13_642956 --start-after 352
```

Skript preveri hashe, obnovi originalni initial.state, preveri originalne video bajte do checkpointa in shrani steps preostanka. Za novi posnetek najprej izberi pravilen odmik. Brez RAM writes.

Originalni headless muted reference replay lahko poženeš z:

```powershell
python scripts/eggo-reference.py --load <checkpoint.state> --steps-file <steps.json> --sample-every 1 --sample-graphics --sample-graphics-at-video --actor-motion-trace --camera-trace --ai-trace --enemy-trace --pickup-trace --arena-trace --board-events --oam-trace --name <experiment-name>
```

Kot ukazno predlogo zamenjaj oznake v kotnih oklepajih z dejanskimi potmi. Ne izvoziti celotnega dolgega posnetka s polnimi snapshoti na ta način; uporabi le potreben prefiks ali spremeni pipeline v pretočnega. Ne vklopi `--audio`.

Obstoječ autonomous replay STARIH 600 sličic:

```powershell
node tests/eggo-mania-visual.mjs --input-replay-autonomous --input-replay-capture-frames --replay-intro-descent --replay-initial-prefix=scripts/OUTPUT/eggo-user-replay_2026-10-19_19-07-49_733012/user-initial --replay-capture=scripts/OUTPUT/eggo-reference_2026-10-19_19-08-03_088727/user-first600 --replay-frame-limit=600
```

Za takojšnjo analizo ZADNJEGA že končanega outputa ni treba ponovno simulirati. Primerjaj njegove shranjene sličice:

```powershell
python scripts/eggo-compare-replay-frame-screenshots.py --app-sheet tests/OUTPUT/eggo-mania-visual_2026-10-19T17-24-45-888Z/input-replay-app-frames.png --native-directory scripts/OUTPUT/eggo-reference_2026-10-19_19-08-03_088727 --native-prefix user-first600.frame --frame-count 600
```

To je uporaben hiter diagnostični/regresijski korak, glavna naloga pa ostaja NOV dolg posnetek. Non-autonomous `--input-replay-only` prepisuje del native stanja po sličicah in ni ustrezen dokaz polne rekonstrukcije. Hkrati poženi največ en hidden Electron harness (debug port 9397). Sedanja prilagoditev ima ostanke Factory fixture-ov in privzetega Yolko; pred novim posnetkom preveri, da se vse res inicializira iz njegovega pravilnega starta.

Za diagnostiko obstajata `scripts/eggo-compose-native-layers.py` in harness `--pixel-write-probe=frame,x,y,width,height`. Za ROM `scripts/eggo-disassemble.py --ranges '[[start,end],...]'` uporablja ROM offsete, torej naslov minus 0x08000000. Literal pool lahko prekine Capstone; nadaljuj na preverjenem začetku naslednje funkcije. Ghidra dekompilacija je med drugim v `scripts/OUTPUT/eggo-ghidra-frame-loop_2026-10-07_08-21-30/survival-reachable-decompiled.c`.

## Uporabni pomnilniški naslovi za prve razlike

Naslednje so EWRAM offseti od 0x02000000, razen eksplicitnih ROM naslovov:

- igralca 0x3bd4 in 0x4f50: x+0,y+4,vx+0x14,vy+0x18 Q16; character root+0x838; anim selector+0x854,next+0x858,phase+0x85c,step+0x860; inventory+0x864,rotation+0x868,flags+0x86c; state+0x874,next+0x878; boots+0x92c; completed floors+0x934.
- kameri 0x3910 in 0x4c8c; position+4 Q16, scale+0x2c, cameraY+0x70. Native camera praviloma 0x0800fbd2..0x0800fc6a in 0x08004908.
- field tilemaps 0xf404 in 0x10650, owner rows+0xc80 (47 vrstic, stride8), model bottom raw row46; camera offset+0xeb8.
- voda 0x3bb8 in 0x4f34; native frame counter0x11a9c (reseti med rundami!), shared animation clock0x16c.
- global RNG u16 0x11aac; field RNG 0x11ab0 in 0x11ab4.
- arena0x3294: beanstalk,factory,dragon,castle,pirate,space,jungle,park. Za konec Survival uporabi dokazano game-state polje v kodi reference runnerja; 0x1189c ni zanesljiv active-game-state (stari izpis65537 je konfiguracija).
- hazardi0x31038,0x310b8,0x31138,0x311b8; anim+0x20,type+0x24,clock+0x28,active+0x48,variant+0x50,angle+0x54,fieldside+0x66.
- delci0x31510,14*0x3c; x+0,y+4 Q16,camera ptr+0x24,phase+0x28,delay+0x2c,type+0x34,active+0x38.

Najprej izmeri prvo odstopanje novega posnetka, ne nadaljuj slepo starega seznama ugibanj. Vsak popravek naj ima konkreten izvorni dokaz in daljši natančno ujemajoč se prefiks kot prej.

## Posodobitev (2026-10-19 ~20:56): stanje novega posnetka

Uporabnik potrjuje: 15 levelov zmagal, 16. izgubil (zato 16 odsekov igranja v indeksu). Konec Survivala = sličica 110208; od 110209 naprej je Main Modes meni (ne-Survival).

- Indeks: `scripts/OUTPUT/eggo-index_2026-10-19_20-46-32_908010/` (`index.csv` za vseh 111652 sličic, `phase-map.json` z mejami odsekov, PNG vsakih 600). Orodje: `scripts/eggo-index-recording.py` (pretočno, ~2,5 min).
- Sličice 1..371 = meni (Survival / Yolko / Hard). Prva sličica igranja = 372 (arena 2, 1189c=65537, native counter 17).
- Pripravljen checkpoint po sličici 371 (preverjenih 371/371 originalnih sličic): `scripts/OUTPUT/eggo-user-replay_2026-10-19_20-55-19_306200/` (`user-initial.*`, `steps.json` = 111281 sličic, ki se začnejo s posnetkovo sličico 372; `steps-first600.json`).
- Original prvih 600: `scripts/OUTPUT/eggo-reference_2026-10-19_20-55-33_536515/user-first600*`.
- Prvi poskus JS replaya z obstoječim harnessom (`tests/OUTPUT/eggo-mania-visual_2026-10-19T18-55-50-238Z/`, primerjava `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-19_20-56-08_904390/`): **PRVA RAZLIKA JE ŽE NA REPLAY SLIČICI 1** (~34984 različnih pikslov, cel zaslon), 0/600 enakih. Vzrok: harness in model sta še vezana na stari Park/Yolko/Factory-fixture; novi posnetek se začne v areni 2 (dragon) po meniju. Naslednji korak: harness naj inicializira arene, like, CPU lik, RNG in števce iz `user-initial` (EWRAM arena 0x3294, actor roots 0x3bd4/0x4f50, resourceRoot actor+0x838), brez Park/Factory defaultov. Šele nato iskanje pravih mehanskih razlik.
- Za polno dolžino ne uporabljaj `eggo-reference.py` s polnimi snapshoti: original je že v `frames.egcap` (`capture.frames()`), harness naj primerja serijsko v chunkih in se ustavi ob prvi razliki.
