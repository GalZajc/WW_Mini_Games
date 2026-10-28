"""Apply the reviewed UI-only English translations; retain originals in OUTPUT."""
from pathlib import Path
from datetime import datetime, timezone
import json

ROOT = Path(__file__).resolve().parents[1]
FLOW = {
 'Razpon je znotraj meje pokritosti: ${available[0]}–${available.at(-1)} barv.': 'Range within coverage limits: ${available[0]}–${available.at(-1)} colors.',
 'Poveži pare': 'Flow Free', 'POVEŽI PARE': 'FLOW FREE',
 'Poveži barvne pare in zapolni vso mrežo. Vsaka sestavljanka ima dokazano enolično rešitev.': 'Connect matching colors and fill the entire grid. Every puzzle has a proven unique solution.',
 'Število vrstic': 'Number of rows', 'Število stolpcev': 'Number of columns',
 'Mreža mora vsebovati vsaj dve polji.': 'The grid must contain at least two cells.',
 'Mreža lahko vsebuje največ ${MAX_BOARD_CELLS} polj, ker se vsaka sestavljanka izčrpno preveri glede enoličnosti.': 'The grid can contain at most ${MAX_BOARD_CELLS} cells because every puzzle is exhaustively checked for uniqueness.',
 'Najmanjše število barv ne sme presegati največjega.': 'The minimum number of colors must not exceed the maximum.',
 'Najmanjše število barv': 'Minimum number of colors', 'Največje število barv': 'Maximum number of colors',
 'Izbran način točkovanja ni veljaven.': 'The selected scoring mode is invalid.',
 'Ugank v časovni seriji': 'Puzzles per timed run',
 'Ena barva na dvodimenzionalni pravokotni mreži ne more imeti enolične povezave, ki bi pokrila vsa polja: vedno obstaja bližnjica.': 'A single color on a two-dimensional rectangular grid cannot have a unique connection covering every cell: a shortcut always exists.',
 'Za mrežo ${rows} × ${columns} je ob najmanj ${minimumCellsPerPath} celicah na pot zgornja meja ${maximumByCoverage} barv. To je meja pokritosti, ne zagotovilo enoličnosti.': 'For a ${rows} × ${columns} grid with at least ${minimumCellsPerPath} cells per path, the upper limit is ${maximumByCoverage} colors. This is a coverage limit, not a guarantee of uniqueness.',
 'Priprava sestavljanke se je prekinila.': 'Puzzle generation was interrupted.',
 'Sestavljam prepletene poti': 'Building interwoven paths',
 '${this.rows} × ${this.columns} polj  ·  ${this.colorCount} barv  ·  enolična rešitev': '${this.rows} × ${this.columns} cells  ·  ${this.colorCount} colors  ·  unique solution',
 'ČAS  ': 'TIME  ', 'UGANKE  ': 'PUZZLES  ', 'REKORD  ': 'BEST  ', 'ZAPOREDNO OPTIMALNO  ': 'OPTIMAL STREAK  ',
 "'povezave'": "'edges'", "'poteze'": "'moves'",
 'optimalno: polja − barve': 'optimal: cells − colors', 'optimalno: ena poteza na barvo': 'optimal: one stroke per color',
 'Z · razveljavi zadnjo povezavo ali razvezavo': 'Z · undo last edge change', 'Z · razveljavi zadnji poteg': 'Z · undo last stroke',
 'SERIJA KONČANA · ': 'RUN COMPLETE · ',
 'Enter ali klik za novo serijo  ·  Z razveljavi zadnji poteg': 'Enter or click for a new run  ·  Z undoes the last stroke',
 'REŠENO · ${this.timedSolvedCount} / ${this.timedPuzzleCount} ugank · ': 'SOLVED · ${this.timedSolvedCount} / ${this.timedPuzzleCount} puzzles · ',
 'ODLIČNO · optimalno!  Niz: ': 'PERFECT · optimal!  Streak: ',
 'REŠENO · ${this.moveCount} od najmanj ${this.minimumMoves} potez': 'SOLVED · ${this.moveCount} moves; minimum ${this.minimumMoves}',
 'Z razveljavi zadnjo povezavo': 'Z undoes the last edge', 'Z razveljavi zadnji poteg': 'Z undoes the last stroke',
 'Enter ali klik za naslednjo sestavljanko': 'Enter or click for the next puzzle',
 'Povleci od črke do njenega para': 'Drag from a letter to its match',
 'Sestavljanke ni mogoče pripraviti': 'Unable to generate puzzle',
 'Pritisni Esc in prilagodi nastavitve mreže ali razpon barv.': 'Press Esc to adjust the grid settings or color range.',
 'Pripravljam uganko': 'Generating puzzle', '${this.minimumColors}–${this.maximumColors} barv': '${this.minimumColors}–${this.maximumColors} colors',
 'Teoretična meja pri najmanj ${minimumCellsPerPath} poljih na pot: ${theoreticalMax} barv. Generator vseeno sprejme samo sestavljanke, ki jih izčrpno potrdi kot enolične.': 'Theoretical limit with at least ${minimumCellsPerPath} cells per path: ${theoreticalMax} colors. The generator only accepts puzzles exhaustively proven to have a unique solution.',
 "${counts.at(-1) ?? 'nobeno'}": "${counts.at(-1) ?? 'no'}",
 'Za mrežo ${rows} × ${columns} izbrani razpon presega mejo pokritosti ': 'For the ${rows} × ${columns} grid, the selected range exceeds the coverage limit of ',
 "'no'} barv.": "'no'} colors.",
 'Vsaka sestavljanka bo ob nastanku izčrpno preverjena.': 'Every puzzle will be exhaustively checked during generation.',
 'A · vrstice': 'A · rows', 'B · stolpci': 'B · columns', "'Mreža'": "'Grid'",
 'Najmanj barv': 'Minimum colors', 'Največ barv': 'Maximum colors', "'Barve'": "'Colors'",
 'Točkovanje': 'Scoring', 'Optimalni niz · potegi': 'Optimal streak · strokes', 'Optimalni niz · povezave': 'Optimal streak · edges',
 'Najhitrejša serija': 'Fastest run', 'Ugank v seriji': 'Puzzles per run',
 'Mreža mora imeti 2–${MAX_BOARD_CELLS} polj in največ ${MAX_BOARD_DIMENSION} vrstic oziroma stolpcev.': 'The grid must have 2–${MAX_BOARD_CELLS} cells and at most ${MAX_BOARD_DIMENSION} rows or columns.',
 'Razpon barv mora vsebovati pozitivni celi števili v naraščajočem vrstnem redu.': 'The color range must contain positive integers in ascending order.',
 'Ena barva na dvodimenzionalni pravokotni mreži ne more imeti samo ene povezave, ki bi pokrila vsa polja: vedno obstaja bližnjica.': 'A single color on a two-dimensional rectangular grid cannot have just one connection covering every cell: a shortcut always exists.',
 'Za to mrežo in najmanj ${minimumPathCells(rows, columns)} polji na barvo izbrani razpon ni mogoč.': 'The selected range is not possible for this grid with at least ${minimumPathCells(rows, columns)} cells per color.',
 'Začetno pokritje': 'Initial path coverage', 'Enoličnost potrjena': 'Unique solution confirmed',
 'Za izbrano število barv nisem uspel sestaviti dovolj prepletene dokazano enolične uganke. Poskusi nekoliko širši razpon barv.': 'Could not generate a sufficiently interwoven puzzle with a proven unique solution for this color count. Try a slightly wider color range.',
}
EGGO = {
 'Igra v dvoje · splet': 'Play online · two players',
 'Nasprotnik ne pošilja več ukazov. Povezava s tekmo je prekinjena.': 'Your opponent has stopped sending inputs. The match connection was lost.',
 'lang="sl"': 'lang="en"', 'Esc · meni': 'Esc · menu', 'Igra v dvoje · povabi': 'Two players · invite',
 'Nalaganje igre …': 'Loading game …', 'Igra v dvoje': 'Two players',
 'Osem rund. Pri 4 : 4 odloči deveta runda.': 'Eight rounds. A 4 : 4 tie goes to a ninth deciding round.',
 '<label>Lik ': '<label>Character ', 'Povezava za povabilo': 'Invitation link', 'Kopiraj povezavo': 'Copy link',
 '>Pripravljen<': '>Ready<', 'Zapusti sobo': 'Leave room', 'Nadaljuj': 'Resume', 'Izbira igralca': 'Choose character',
 'Cel zaslon': 'Fullscreen', 'Glasba': 'Music', 'Učinki': 'Sound effects',
 'Standardni kontrolerji uporabljajo položaje tipk: desna tipka postavi, spodnja zavrti, zgornja zavrti nazaj. D-pad ali leva palica premika; gor skoči. Start odpre meni. Tipke lahko spremeniš spodaj.': 'Standard controllers use button positions: the right face button places, the bottom rotates clockwise, and the top rotates anticlockwise. Use the D-pad or left stick to move; up jumps. Start opens the menu. You can remap the controls below.',
 'Tipke in kontroler': 'Keyboard and controller', 'Privzete tipke': 'Default controls', 'Napaka: ': 'Error: ',
 'Spletna tekma med odprtim menijem teče naprej.': 'The online match continues while this menu is open.',
 'Pritisni tipko …': 'Press a button …', ' · po potrebi prilagodi tipke': ' · remap controls if needed',
 'Kontroler: poveži ga in pritisni eno od njegovih tipk.': 'Controller: connect it and press one of its buttons.',
 "?'levo':'desno'": "?'left':'right'", 'Runda ${info.round}': 'Round ${info.round}', ' · odločilna': ' · deciding round',
 ' · ti: ${own}': ' · you: ${own}', ' · čakam povezavo': ' · waiting for connection', 'Konec tekme': 'Match over',
 'Zmagal si!': 'You won!', 'Zmagal je nasprotnik.': 'Your opponent won.',
 'Nasprotnik je povezan. Oba izberita lik in potrdita pripravljenost.': 'Your opponent is connected. Both players should choose a character and select Ready.',
 'Povezavo pošlji nasprotniku. Čakam, da se pridruži …': 'Send the link to your opponent. Waiting for them to join …',
 'Povezava je kopirana. Pošlji jo nasprotniku.': 'Link copied. Send it to your opponent.',
 'Kopiraj označeno povezavo s Ctrl+C.': 'Copy the selected link with Ctrl+C.',
 'Pripravljen. Čakam še nasprotnika …': 'Ready. Waiting for your opponent …', 'Nalaganje ni uspelo: ': 'Loading failed: ',
 'Povezava ni uspela.': 'Connection failed.', 'Čakam nasprotnika …': 'Waiting for your opponent …',
 'Nasprotnik ne prejema podatkov.': 'Your opponent is not receiving data.', 'Nasprotnik je zapustil tekmo.': 'Your opponent left the match.',
 "?'Povezano'": "?'Connected'", 'Spletne sobe še niso na voljo.': 'Online rooms are not available yet.',
 'Soba je potekla.': 'This room has expired.', 'Neveljavno povabilo.': 'Invalid invitation.', 'V sobi je že drug igralec.': 'Another player is already in this room.',
 'Neveljavna prijava v sobo.': 'Invalid room credentials.', 'Tekma je zaključena ali zapuščena.': 'The match has ended or was abandoned.',
 'Povezava s sobo ni uspela. Poskusi ponovno.': 'Could not connect to the room. Please try again.',
}
FILES = {
 'renderer/games/flow-lines/config.json': FLOW,
 'renderer/games/flow-lines/game.js': FLOW,
 'renderer/games/flow-lines/puzzle.js': FLOW,
 'renderer/games/eggo-mania/game.js': EGGO,
 'renderer/games/eggo-mania/human-match.js': EGGO,
 'sites/eggo-mania/index.html': EGGO,
 'sites/eggo-mania/bootstrap.js': EGGO,
 'sites/eggo-mania/room-client.js': EGGO,
 'sites/eggo-mania/worker/index.js': EGGO,
}
if __name__ == '__main__':
    out = ROOT / 'scripts/OUTPUT' / ('english-ui_' + datetime.now(timezone.utc).strftime('%Y-%m-%d_%H-%M-%SZ'))
    out.mkdir(parents=True)
    changed = []
    for name, replacements in FILES.items():
        path = ROOT / name
        original = path.read_text(encoding='utf-8')
        text = original
        for before, after in sorted(replacements.items(), key=lambda pair: -len(pair[0])):
            text = text.replace(before, after)
        if text != original:
            backup = out / name
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_text(original, encoding='utf-8')
            path.write_text(text, encoding='utf-8')
            changed.append(name)
    (out / 'parameters.json').write_text(json.dumps({'changed': changed, 'flow': FLOW, 'eggo': EGGO}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(out), 'changed': changed}))
