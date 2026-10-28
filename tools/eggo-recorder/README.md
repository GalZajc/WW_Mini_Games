# Zajem igranja originalne Eggo Mania

V glavni mapi WW Mini Games dvoklikni **Eggo Mania - zajem originala.vbs**.
Odpre se originalna igra v lokalnem jedru mGBA, neposredno iz tvojega ROM-a.
Zajem se začne samodejno. Izberi lik in igraj; ob zaprtju se posnetek zaključi.
F5 začne nov posnetek. Zvok se shrani, med igranjem v tem oknu pa je utišan.

- Xbox: smerni križ ali leva palica, B = GBA A, A = GBA B, LB/RB = L/R,
  Menu = Start/pavza. View nima funkcije.
- Tipkovnica: puščice, Space/Z = A, X = B, Q/R = L/R, Enter = Start.
- Esc začasno ustavi zajem. Ko okno ni aktivno, emulacija miruje.

Controllerji se zaznavajo prek SDL (tudi Bluetooth/HID), z rezervnima potema
XInput in Windows joystick. Preverijo se vsi priklopljeni controllerji, ne le
prvi slot. Statusna vrstica pokaže uporabljeni vmesnik oziroma »ni zaznan«.
Vsak posnetek vsebuje tudi `controller-diagnostics.json` s podatki o zaznavi.

Vsak zagon ustvari svojo mapo v `tools/eggo-recorder/OUTPUT`.
Ni treba ročno shranjevati ali snemati zaslona. Posnetek vsebuje vsako izvirno
sličico 240 × 160 brez izgub, stanje vseh tipk za vsak emulirani frame,
lokalne dogodke tipkovnice in controllerja, zvok ter pomnilnik igre.
`initial.state` in vmesna stanja vsakih 300 sličic vsebujejo tudi stanje RNG.
`parameters.json` beleži nastavitve, kontrolne vsote ROM-a in jedra ter fazo
zajema. Pomnilnik se zajema ob video callbacku, ne ob naključnem HBlanku.

Posnetki so osnova za nadaljnje primerjave z rekonstrukcijo. Priloženi
`--verify` preverja deterministično ponovitev **originala**, ne pravilnosti
rekonstrukcije. `inspect_capture.py` omogoča izvoz poljubne sličice, pomnilnika
in celotnega zaporedja pritiskov za nadaljnjo diagnostiko.

Zajem ne uporablja globalnega beleženja tipkovnice. Beleži le tipke svojega
okna in stanje igralnega controllerja, dokler je okno aktivno. Vrsta za zapis
je omejena; ob počasnem disku se emulacija upočasni, sličic ne zavrže.
Pri daljšem igranju računaj približno 100 MB na minuto, odvisno od prizora.

Vse nastavitve so v `config.json`. Jedro mGBA in začetno stanje sta v
`runtime`; običajna projektna različica uporablja ROM na tvoji obstoječi poti.
Windows zaganjalnik najprej uporabi vključeni `runtime/python/pythonw.exe`,
če obstaja, sicer že nameščen Python 3.12 s knjižnicama NumPy in Pillow.
Ob manjkajočem ROM-u se odpre pogovorno okno za izbiro datoteke.

`build_portable.py` izdela zasebni prenosni paket z lastnim Pythonom,
knjižnicami in kopijo tvojega ROM-a. Namestitev na drugem računalniku ni
potrebna. Obstoječi igralni posnetki se v paket ne kopirajo. Vsi rezultati
izdelave in manifest kontrolnih vsot ostanejo v timestampani mapi OUTPUT.
Na Windows zajem zahteva 1 ms časovno ločljivost sistemskega časovnika,
da omeji neenakomerno razporejanje Tk callbackov; ob zaprtju jo sprosti.
