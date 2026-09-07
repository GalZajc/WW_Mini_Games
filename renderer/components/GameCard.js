/** GameCard — Creates a vivid, game-specific launcher card. */

const LAUNCHER_THUMBNAILS = Object.freeze({
    'cup-shuffle': 'cup-shuffle-generated.png',
    'curve-memory': 'curve-memory-generated.png',
    'dino-runner': 'dino-runner-generated.png',
    'number-memory': 'number-memory-generated.png',
    'robot-island': 'robot-island-generated.png',
    'spherical-bowl-balance': 'spherical-bowl-balance-generated.png',
    'standing-swing-jump': 'standing-swing-jump-generated.png',
    'wheelie-balance': 'wheelie-balance-generated.png',
    'pogo-cloud-jump': 'pogo-cloud-jump-generated.png',
    'click-speed': 'click-speed.jpg',
    'cup-and-ball': 'cup-and-ball.jpg',
    'flappy': 'flappy.jpg',
    'go-cube': 'go-cube.jpg',
    'lava-path-tilt': 'lava-path-tilt.jpg',
    'ludo': 'ludo.png',
    'n-in-a-row': 'n-in-a-row.jpg',
    'reaction-time': 'reaction-time.jpg',
    'reromo-tetris': 'reromo-tetris.jpg',
    'rhythm-memory': 'rhythm-memory.jpg',
    'rod-balance': 'rod-balance.jpg',
    'rubiks-cuboid': 'rubiks-cuboid.jpg',
    'sky-pilot-3d': 'sky-pilot-3d.jpg',
    'sudoku': 'sudoku.jpg',
    'tarzan-swing': 'tarzan-swing.png',
    'tic-tac-toe': 'tic-tac-toe.jpg',
    'classic-board': 'classic-board-generated-v2.png',
    'card-lounge': 'card-lounge.png',
    'word-tiles': 'word-tiles.png',
});

// Explicit mode artwork wins; related cards can share their launcher's bitmap.
const MODE_THUMBNAILS = Object.freeze({
    'reaction-color': 'mode-thumbnails/reaction-color-generated.png',
    'reaction-sound': 'mode-thumbnails/reaction-sound-generated.png',
    'reaction-pendulum': 'mode-thumbnails/reaction-pendulum-generated.png',
    'twisty-cuboid': 'mode-thumbnails/twisty-cuboid-generated.png',
    'twisty-torus': 'mode-thumbnails/twisty-torus-generated.png',
    'twisty-tetrahedron': 'mode-thumbnails/twisty-tetrahedron-generated.png',
    'twisty-octahedron': 'mode-thumbnails/twisty-octahedron-generated.png',
    'twisty-dodecahedron': 'mode-thumbnails/twisty-dodecahedron-generated.png',
    'twisty-icosahedron': 'mode-thumbnails/twisty-icosahedron-generated.png',
    'nrow-rotate': 'mode-thumbnails/nrow-rotate-generated.png',
    'nrow-random': 'mode-thumbnails/nrow-random-generated.png',
    'nrow-shoot': 'mode-thumbnails/nrow-shoot-generated.png',
    'nrow-push': 'mode-thumbnails/nrow-push-generated.png',
    'bowl-balance-puck-3d': 'mode-thumbnails/bowl-balance-puck-3d-generated.png',
    'bowl-balance-marble-3d': 'mode-thumbnails/bowl-balance-marble-3d-generated.png',
    'bowl-distance-puck-3d': 'mode-thumbnails/bowl-distance-puck-3d-generated.png',
    'bowl-distance-puck-2d': 'mode-thumbnails/bowl-distance-puck-2d-generated.png',
    'bowl-distance-marble-3d': 'mode-thumbnails/bowl-distance-marble-3d-generated.png',
    'bowl-distance-marble-2d': 'mode-thumbnails/bowl-distance-marble-2d-generated.png',
    'bowl-target-puck-3d': 'mode-thumbnails/bowl-target-puck-3d-generated.png',
    'bowl-target-puck-2d': 'mode-thumbnails/bowl-target-puck-2d-generated.png',
    'bowl-target-marble-3d': 'mode-thumbnails/bowl-target-marble-3d-generated.png',
    'bowl-target-marble-2d': 'mode-thumbnails/bowl-target-marble-2d-generated.png',
    'tetris-survival': 'mode-thumbnails/tetris-rectangular-generated.png',
    'tetris-sprint': 'mode-thumbnails/tetris-sprint-generated.png',
    'tetris-rocking': 'mode-thumbnails/tetris-rocking-generated.png',
    'tetris-rocking-pressure': 'mode-thumbnails/tetris-rocking-pressure-generated.png',
    'robot-island-1d': 'mode-thumbnails/robot-island-1d-generated.png',
    'robot-island-2d': 'game-thumbnails/robot-island-generated.png',
    'sudoku-colors': 'game-thumbnails/sudoku.jpg',
    'sudoku-numbers': 'mode-thumbnails/sudoku-numbers-generated.png',
    'cup-ball-3d': 'game-thumbnails/cup-and-ball.jpg',
    'cup-ball-2d': 'mode-thumbnails/cup-ball-2d.png',
    'flappy-classic': 'mode-thumbnails/flappy-classic-generated.png',
    'flappy-glider3d': 'mode-thumbnails/flappy-glider3d-generated.jpg',
    'flappy-multilane': 'mode-thumbnails/flappy-multilane.png',
    'go-cuboid': 'game-thumbnails/go-cube.jpg',
    'go-rectangle': 'mode-thumbnails/go-rectangle.png',
    'rod-3d': 'game-thumbnails/rod-balance.jpg',
    'rod-2d': 'mode-thumbnails/rod-2d.png',
    'tetris-rectangular': 'mode-thumbnails/tetris-rectangular-generated.png',
    'tetris-structural': 'mode-thumbnails/tetris-structural.png',
    'tetris-circular': 'mode-thumbnails/tetris-circular.png',
    'tetris-mobius': 'mode-thumbnails/tetris-mobius.png',
    'classic-board-reversi': 'mode-thumbnails/classic-board-reversi.png',
    'classic-board-checkers': 'mode-thumbnails/classic-board-checkers.png',
    'classic-board-callisto': 'mode-thumbnails/classic-board-callisto.png',
    'classic-board-ludo': 'mode-thumbnails/classic-board-ludo.png',
    'classic-board-chess': 'mode-thumbnails/classic-board-chess-generated.png',
    'classic-board-scrabble': 'game-thumbnails/word-tiles.png',
    'classic-board-memory': 'mode-thumbnails/classic-board-memory-generated.png',
    'classic-board-go': 'game-thumbnails/go-cube.jpg',
    'card-lounge-blackjack': 'mode-thumbnails/card-lounge-blackjack.png',
    'card-lounge-eights': 'mode-thumbnails/card-lounge-eights.png',
    'card-lounge-war': 'mode-thumbnails/card-lounge-war.png',
    'card-lounge-memory': 'mode-thumbnails/card-lounge-memory.png',
});

const SCENES = Object.freeze({
    'dino-runner': `
        <path d="M0 101h210v59H0z" fill="#d79b39"/><g fill="#27944a" stroke="#135f35" stroke-width="4"><path d="M164 34h17v68h-17zM154 56h12v12h-12zm27-15h12v24h-12z"/><path d="M187 64h14v38h-14z"/></g><g transform="translate(75 87)" fill="#43b85c" stroke="#173f35" stroke-width="5" stroke-linejoin="round"><path d="M-25-32h43v35h-43zM10-53h39v28H10zM-21-25l-31-17 15 30z"/><path d="M-12 1l-5 21M10 1l9 21" fill="none" stroke-linecap="round"/><circle cx="37" cy="-44" r="3" fill="#fff" stroke="none"/></g><path d="M22 111h160" stroke="#7d5a2b" stroke-width="5"/>`,
    'pogo-cloud-jump': `
        <rect x="25" y="115" width="70" height="14" rx="4" fill="#38a169" stroke="#1c4532" stroke-width="3"/>
        <rect x="115" y="65" width="80" height="14" rx="4" fill="#38a169" stroke="#1c4532" stroke-width="3"/>
        <rect x="55" y="15" width="75" height="14" rx="4" fill="#38a169" stroke="#1c4532" stroke-width="3"/>
        <g transform="translate(60 85)"><path d="M-6 0l-12 10 10 10m16-20l12 10-10 10" fill="none" stroke="#4e7508" stroke-width="4" stroke-linecap="round"/><path d="M0 22v4l-8 5 16 5-16 5 16 5-8 5v4" fill="none" stroke="#718096" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="0" cy="-14" rx="16" ry="18" fill="#96ce28" stroke="#4e7508" stroke-width="3"/><path d="M10 -15l14 -4v8l-14 -2z" fill="#83b81d" stroke="#4e7508" stroke-width="2"/><circle cx="2" cy="-18" r="4" fill="#fff"/><circle cx="10" cy="-18" r="4" fill="#fff"/><circle cx="3" cy="-18" r="2" fill="#000"/><circle cx="11" cy="-18" r="2" fill="#000"/></g>`,
    'robot-island': `
        <path d="M105 41l76 35-76 39-76-39z" fill="#55ca4d" stroke="#1d7735" stroke-width="5"/><path d="M29 76l76 39 76-39v25l-76 39-76-39z" fill="#8e5d34" stroke="#594025" stroke-width="4"/><g transform="translate(105 71)" stroke="#203d4a" stroke-width="4" stroke-linecap="round"><rect x="-20" y="-31" width="40" height="34" rx="8" fill="#eef7f4"/><rect x="-14" y="-24" width="28" height="12" rx="5" fill="#3f96e7"/><circle cx="-6" cy="-18" r="3" fill="#ffe13d" stroke="none"/><circle cx="6" cy="-18" r="3" fill="#ffe13d" stroke="none"/><path d="M-9 4l-12 18M9 4l12 18M0-31v-13" fill="none"/></g>`,
    'click-speed': `
        <g transform="translate(111 35) rotate(-8)"><rect x="-25" y="-4" width="50" height="67" rx="22" fill="#f7fbff" stroke="#245a91" stroke-width="5"/><path d="M0-1v25" stroke="#245a91" stroke-width="4"/><rect x="-5" y="8" width="10" height="15" rx="5" fill="#5fbf3f"/></g>
        <path d="M72 30l-9-13m25 8l3-16m15 25l14-10" stroke="#ffd447" stroke-width="5" stroke-linecap="round"/>`,
    'cup-and-ball': `
        <path d="M82 48q28 21 48 62" fill="none" stroke="#f8e7bc" stroke-width="4"/><circle cx="135" cy="116" r="17" fill="#f4c52f" stroke="#8e5218" stroke-width="4"/><path d="M54 42h50l-7 58q-19 18-37 0z" fill="#e84a3c" stroke="#7c2523" stroke-width="5"/><path d="M57 55h44" stroke="#ffb39b" stroke-width="5"/>`,
    'flappy': `
        <path d="M30 15h31v50H30zm118 0h31v71h-31zM30 117h31v36H30zm118 104h31v49h-31z" fill="#43bd3d" stroke="#176c24" stroke-width="5"/><path d="M22 64h47v13H22zm118 20h47v13h-47z" fill="#69dc50" stroke="#176c24" stroke-width="4"/><g transform="translate(105 88)"><ellipse rx="28" ry="21" fill="#ffd436" stroke="#a55b13" stroke-width="4"/><circle cx="13" cy="-7" r="8" fill="white"/><circle cx="16" cy="-7" r="3" fill="#172335"/><path d="M25 0l20 7-20 7z" fill="#f27932"/><path d="M-12 0q-21-18-25 4 13 16 30 8" fill="#f6a52c" stroke="#a55b13" stroke-width="4"/></g>`,
    'go-cube': `
        <path d="M102 20l58 32v69l-58 34-59-34V52z" fill="#d8a660" stroke="#5b3218" stroke-width="5"/><path d="M102 20v69m58-37l-58 37-59-37m59 37v66" fill="none" stroke="#76502b" stroke-width="3"/><path d="M62 42l58 32m-77 1l59 33m19-64l-58 34m96-2l-57 33" fill="none" stroke="#8c6034" stroke-width="2" opacity=".75"/><circle cx="82" cy="64" r="12" fill="#171b20"/><circle cx="123" cy="64" r="12" fill="#f9f7e8" stroke="#606060" stroke-width="2"/><circle cx="82" cy="109" r="12" fill="#f9f7e8" stroke="#606060" stroke-width="2"/><circle cx="130" cy="121" r="12" fill="#171b20"/>`,
    'lava-path-tilt': `
        <path d="M0 118q35-40 70-12t55-22q36-40 85 8v68H0z" fill="#ef5b2d"/><path d="M0 132q35-38 68-13t59-20q35-28 83 5" fill="none" stroke="#ffd15c" stroke-width="10"/><path d="M16 121q31-35 55-14t53-21q31-30 71 5" fill="none" stroke="#3d4148" stroke-width="28"/><path d="M16 121q31-35 55-14t53-21q31-30 71 5" fill="none" stroke="#d7dde0" stroke-width="18"/><circle cx="83" cy="104" r="14" fill="#3c9eff" stroke="#163f76" stroke-width="4"/>`,
    'n-in-a-row': `
        <rect x="31" y="25" width="148" height="118" rx="10" fill="#1768d2" stroke="#0c3c8d" stroke-width="6"/>${Array.from({length:6},(_,r)=>Array.from({length:7},(_,c)=>`<circle cx="${48+c*19}" cy="${43+r*17}" r="7" fill="${(c+r)%4===0?'#f7d536':(c+r)%5===0?'#e94b43':'#9fdcff'}"/>`).join('')).join('')}<path d="M43 151h124" stroke="#245a91" stroke-width="7" stroke-linecap="round"/>`,
    'reaction-time': `
        <g transform="translate(35 61)"><circle r="25" fill="#f7fff9" stroke="#176f48" stroke-width="5"/><path d="M0-13v14l11 7" fill="none" stroke="#e8473e" stroke-width="5" stroke-linecap="round"/><path d="M20-20l9-10m-49 7l-8-10" stroke="#ffd43c" stroke-width="4" stroke-linecap="round"/></g><g transform="translate(104 61)" fill="#f8fbff" stroke="#244f84" stroke-width="4"><path d="M-27-10h12L2-25v50L-15 10h-12z"/><path d="M11-13q17 13 0 26M19-21q28 21 0 42" fill="none" stroke="#ffd43c" stroke-linecap="round"/></g><g transform="translate(175 19)"><path d="M-22 0h44M0 2l-13 64" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="-13" cy="66" r="13" fill="#ffd43b" stroke="#684b1b" stroke-width="4"/><path d="M-30 69a36 36 0 0 1 46-44" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 5" opacity=".75"/></g>`,
    'reromo-tetris': `
        <path d="M35 134a70 70 0 0 1 140 0" fill="none" stroke="#1e315f" stroke-width="27"/><path d="M38 134a67 67 0 0 1 134 0" fill="none" stroke="#fa3bcb" stroke-width="18" stroke-dasharray="20 4"/><path d="M75 40h21v21h21v21H96v21H75z" fill="#ffd62e" stroke="#8d5e12" stroke-width="3"/><path d="M128 31h21v42h-21zm21 21h21v21h-21z" fill="#55d64b" stroke="#19742b" stroke-width="3"/>`,
    'rhythm-memory': `
        <ellipse cx="105" cy="111" rx="55" ry="25" fill="#bd342f" stroke="#682326" stroke-width="6"/><rect x="50" y="55" width="110" height="57" rx="10" fill="#e55348" stroke="#682326" stroke-width="6"/><ellipse cx="105" cy="56" rx="55" ry="24" fill="#f5dfbe" stroke="#682326" stroke-width="6"/><path d="M52 91h106M71 117l-8 29m76-29l8 29" stroke="#f1d6ad" stroke-width="5"/><path d="M163 31q19 11 3 28m13-41q31 22 6 52" fill="none" stroke="#ffd536" stroke-width="5" stroke-linecap="round"/>`,
    'rod-balance': `
        <path d="M105 24l8 105" stroke="#fff4cf" stroke-width="10" stroke-linecap="round"/><path d="M62 133h94" stroke="#e29b6d" stroke-width="15" stroke-linecap="round"/><path d="M105 23l9 4" stroke="#4e5d70" stroke-width="4"/><path d="M25 151h160" stroke="#227b2f" stroke-width="7"/><path d="M65 151v-12m40 12v-18m40 18v-12" stroke="#f7cf34" stroke-width="4"/><path d="M27 83h34m-17-17v34" stroke="#ffffff" stroke-width="5" opacity=".8"/>`,
    'rubiks-cuboid': `
        <path d="M105 22l56 31v64l-56 34-57-34V53z" fill="#222a35" stroke="#14181f" stroke-width="7"/><path d="M105 22v65m56-34l-56 34-57-34m57 34v64" fill="none" stroke="#111820" stroke-width="5"/><path d="M55 57l47 26v56l-47-27z" fill="#e83f38"/><path d="M108 88l46-27v51l-46 28z" fill="#2e9f43"/><path d="M57 52l48-25 48 26-48 28z" fill="#ffd52d"/><path d="M79 40l51 27M81 67l47-27M79 70v57m52-61v59" stroke="#171c22" stroke-width="5"/>`,
    'sky-pilot-3d': `
        <ellipse cx="111" cy="91" rx="64" ry="49" fill="none" stroke="#ffd44a" stroke-width="10"/><path d="M28 83l71 10 29-43 12 4-12 42 53 14-3 11-55-5-18 36-10-2 6-38-72-18z" fill="#f7fbff" stroke="#285d93" stroke-width="4"/><path d="M101 95l-24 12 23 3" fill="#e84b3d"/>`,
    'sudoku': `
        <rect x="48" y="18" width="114" height="126" rx="5" fill="#fffdf0" stroke="#245a91" stroke-width="6"/><path d="M86 20v122m38-122v122M50 60h110M50 102h110" stroke="#245a91" stroke-width="4"/><path d="M67 20v122m38-122v122m38-122v122M50 39h110M50 81h110M50 123h110" stroke="#85a7bd" stroke-width="2"/><text x="68" y="54" text-anchor="middle" font-size="22" font-weight="900" fill="#26394e">5</text><text x="105" y="96" text-anchor="middle" font-size="22" font-weight="900" fill="#e4483e">7</text><circle cx="143" cy="39" r="9" fill="#4abf43"/><circle cx="68" cy="123" r="9" fill="#ffd62d"/>`,
    'ludo': `
        <circle cx="105" cy="76" r="55" fill="#fffdf0" stroke="#315348" stroke-width="5"/><g fill="none" stroke-width="12"><path d="M105 76V28" stroke="#e8463f"/><path d="M105 76h48" stroke="#3d87e8"/><path d="M105 76v48" stroke="#f0c52e"/><path d="M105 76H57" stroke="#3eaf5b"/></g><g stroke="#263b32" stroke-width="2"><circle cx="105" cy="28" r="10" fill="#e8463f"/><circle cx="153" cy="76" r="10" fill="#3d87e8"/><circle cx="105" cy="124" r="10" fill="#f0c52e"/><circle cx="57" cy="76" r="10" fill="#3eaf5b"/></g><rect x="87" y="58" width="36" height="36" rx="7" fill="#fff" stroke="#315348" stroke-width="4"/><circle cx="97" cy="68" r="3"/><circle cx="113" cy="84" r="3"/>`,
    'classic-board': `
        <rect x="43" y="16" width="124" height="124" rx="5" fill="#efe1bc" stroke="#263b32" stroke-width="5"/>${Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>(r+c)%2?`<rect x="${45+c*15}" y="${18+r*15}" width="15" height="15" fill="#638353"/>`:'').join('')).join('')}<g stroke="#263b32" stroke-width="2"><circle cx="68" cy="41" r="10" fill="#20272b"/><circle cx="143" cy="116" r="10" fill="#f5f3e8"/><circle cx="98" cy="71" r="10" fill="#3586e6"/><circle cx="128" cy="86" r="10" fill="#ef643e"/></g>`,
    'card-lounge': `
        <g transform="translate(57 20) rotate(-9 34 48)"><rect width="68" height="96" rx="8" fill="#fffdf4" stroke="#263b32" stroke-width="5"/><text x="9" y="25" font-size="22" font-weight="900" fill="#d83c3c">A♥</text><text x="34" y="67" text-anchor="middle" font-size="37" fill="#d83c3c">♥</text></g><g transform="translate(96 20) rotate(10 34 48)"><rect width="68" height="96" rx="8" fill="#fffdf4" stroke="#263b32" stroke-width="5"/><text x="9" y="25" font-size="21" font-weight="900" fill="#20272b">K♠</text><text x="34" y="67" text-anchor="middle" font-size="37" fill="#20272b">♠</text></g>`,
    'word-tiles': `
        <g fill="#f2d39b" stroke="#785526" stroke-width="4">${[['Č',33,34,5],['L',76,49,1],['O',119,34,1],['V',55,86,2],['E',98,91,1],['K',141,78,3]].map(([letter,x,y,points])=>`<g><rect x="${x}" y="${y}" width="38" height="38" rx="5"/><text x="${x+18}" y="${y+25}" text-anchor="middle" font-size="23" font-weight="900" fill="#2d271f" stroke="none">${letter}</text><text x="${x+33}" y="${y+34}" text-anchor="end" font-size="9" font-weight="800" fill="#2d271f" stroke="none">${points}</text></g>`).join('')}</g>`,
    'tic-tac-toe': `
        <path d="M77 23v124m56-124v124M35 64h140M35 106h140" stroke="#f7fbff" stroke-width="7" stroke-linecap="round"/><path d="M45 31l23 24m0-24L45 55m78 60l27 26m0-26l-27 26" stroke="#e9483f" stroke-width="8" stroke-linecap="round"/><circle cx="104" cy="84" r="17" fill="none" stroke="#ffd52e" stroke-width="8"/>`,
    'number-memory': `
        <g font-family="Inter,system-ui,sans-serif" font-weight="950" text-anchor="middle"><g transform="translate(22 28) rotate(-7 25 35)"><rect width="50" height="70" rx="9" fill="#fff9dc" stroke="#255b75" stroke-width="5"/><text x="25" y="49" font-size="38" fill="#e4433b">3</text></g><g transform="translate(65 17) rotate(3 25 35)"><rect width="50" height="70" rx="9" fill="#fff9dc" stroke="#255b75" stroke-width="5"/><text x="25" y="49" font-size="38" fill="#2b83d0">8</text></g><g transform="translate(109 28) rotate(-2 25 35)"><rect width="50" height="70" rx="9" fill="#fff9dc" stroke="#255b75" stroke-width="5"/><text x="25" y="49" font-size="38" fill="#36a54b">1</text></g><g transform="translate(151 18) rotate(7 25 35)"><rect width="50" height="70" rx="9" fill="#fff9dc" stroke="#255b75" stroke-width="5"/><text x="25" y="49" font-size="38" fill="#8e57c6">7</text></g></g><path d="M35 108h140" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".9"/>`,
    'curve-memory': `
        <path d="M18 83C39 26 63 106 89 61S136 19 157 65s30 28 41-8" fill="none" stroke="#f8fff9" stroke-width="13" stroke-linecap="round" opacity=".5"/><path d="M18 83C39 26 63 106 89 61S136 19 157 65s30 28 41-8" fill="none" stroke="#e6423b" stroke-width="6" stroke-linecap="round"/><path d="M20 95C43 44 63 111 90 70s46-37 68 6 29 25 40-5" fill="none" stroke="#36a851" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 8"/><circle cx="18" cy="83" r="7" fill="#ffd43b" stroke="#71551c" stroke-width="3"/><circle cx="198" cy="57" r="7" fill="#ffd43b" stroke="#71551c" stroke-width="3"/>`,
    'cup-shuffle': `
        <path d="M35 35q70-31 140 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="7 8" opacity=".85"/><path d="M160 22l17 13-18 10M50 22L33 35l18 10" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="105" cy="103" r="13" fill="#ffd43b" stroke="#7d5517" stroke-width="4"/><g fill="#e94a3e" stroke="#782a29" stroke-width="5"><path d="M19 49h54l-7 56q-19 15-40 0z"/><path d="M78 42h54l-7 56q-19 15-40 0z"/><path d="M137 49h54l-7 56q-19 15-40 0z"/></g><g stroke="#ffb39b" stroke-width="5"><path d="M22 60h48M81 53h48M140 60h48"/></g>`,
    'spherical-bowl-balance': `
        <ellipse cx="105" cy="48" rx="83" ry="28" fill="#b6efff" stroke="#206683" stroke-width="6"/><path d="M22 48q8 77 83 77t83-77" fill="#72cee9" fill-opacity=".72" stroke="#206683" stroke-width="6"/><path d="M27 56q11 25 31 40" fill="none" stroke="#dfefff" stroke-width="5" opacity=".7"/><path d="M36 45q69-24 138 0" fill="none" stroke="#e7413b" stroke-width="14"/><path d="M52 43q53-16 106 0" fill="none" stroke="#ff7770" stroke-width="5"/><circle cx="145" cy="43" r="11" fill="#ffd83c" stroke="#79591b" stroke-width="4"/><path d="M77 101l-25 13m25-13l-15-8m15 8l-2 17" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    'standing-swing-jump': `
        <path d="M22 116L61 13h88l39 103M52 15h108" fill="none" stroke="#385267" stroke-width="9" stroke-linecap="round"/><path d="M91 18l-18 70m25-70L80 90" stroke="#eee0bd" stroke-width="3"/><path d="M58 89h37" stroke="#704526" stroke-width="8" stroke-linecap="round"/><g transform="translate(76 88) rotate(-18)"><path d="M0 0v-40" stroke="#273940" stroke-width="6" stroke-linecap="round"/><path d="M0-18l24-10" stroke="#ffd0a1" stroke-width="5" stroke-linecap="round"/><path d="M0-39l8-18" stroke="#e64a3f" stroke-width="10" stroke-linecap="round"/><circle cx="10" cy="-64" r="9" fill="#ffd0a1" stroke="#273940" stroke-width="3"/></g><path d="M117 65h58m-16-13l16 13-16 13" fill="none" stroke="#e7473c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
    'wheelie-balance': `
        <g transform="translate(102 83) rotate(-18)"><circle cx="-45" cy="25" r="20" fill="#20282d" stroke="#11171b" stroke-width="5"/><circle cx="-45" cy="25" r="9" fill="#efb632"/><circle cx="55" cy="25" r="20" fill="#20282d" stroke="#11171b" stroke-width="5"/><circle cx="55" cy="25" r="9" fill="#d4dce0"/><path d="M-58 19l13-34 42-8 24-24h32l25 29 15 14-3 24z" fill="#ef473e" stroke="#24353c" stroke-width="5" stroke-linejoin="round"/><path d="M3-22l17-21h29l18 24z" fill="#b9ecfa" stroke="#314c5a" stroke-width="3"/><path d="M-45 2h118" stroke="#ffd43d" stroke-width="6"/></g><path d="M7 116q43-18 91-3t105-7" fill="none" stroke="#555d61" stroke-width="14"/><path d="M126 111q25 3 54-1" fill="none" stroke="#f6e45a" stroke-width="4" stroke-dasharray="18 9"/>`,
});

const BACKDROPS = Object.freeze({
    'dino-runner': { colors: ['#62cff7', '#ffe7a0'], decor: `<circle cx="178" cy="25" r="19" fill="#fff16f"/><g fill="#fff" opacity=".65"><path d="M11 31q9-14 22 0 11-8 21 5H6q0-5 5-5z"/></g>` },
    'robot-island': { colors: ['#67d1f5', '#1684bf'], decor: `<path d="M0 97q28-15 54 0t53 0 53 0 50 0v63H0z" fill="#167eb7"/><path d="M0 112q23-12 48 0t51 0 52 0 59 0" fill="none" stroke="#fff" stroke-width="3" opacity=".35"/>` },
    'click-speed': { colors: ['#dafbe4', '#66d28a'], decor: `<path d="M0 29h210M0 58h210M0 87h210M30 0v120M70 0v120M140 0v120M180 0v120" stroke="#159658" opacity=".17"/><circle cx="174" cy="55" r="39" fill="#fff" opacity=".18"/>` },
    'cup-and-ball': { colors: ['#ffdda9', '#ed875c'], decor: `<path d="M0 0h27l18 122H0zm210 0h-27l-18 122h45z" fill="#a32d3a" opacity=".82"/><path d="M0 112h210v48H0z" fill="#86502e"/><path d="M0 112h210" stroke="#f8c56e" stroke-width="5"/>` },
    'flappy': { colors: ['#65cdf9', '#d8f5ff'], decor: `<g fill="#fff" opacity=".72"><path d="M12 27q9-18 25 0 14-10 24 5H6q0-5 6-5z"/><path d="M145 20q10-18 26 0 14-10 25 6h-58q1-6 7-6z"/></g>` },
    'go-cube': { colors: ['#467985', '#15293b'], decor: `<path d="M0 111L105 76l105 35v49H0z" fill="#0c1c28" opacity=".62"/><path d="M17 22h42m113 7h26M14 91h32" stroke="#99ddd5" stroke-width="2" opacity=".35"/>` },
    'lava-path-tilt': { colors: ['#4f294b', '#181321'], decor: `<path d="M0 103q28-21 57 1t55-5q29-23 56 2t42-3v62H0z" fill="#ed4f28"/><path d="M0 132q22-21 43-2t42-2q22-20 47 0t44-1q17-15 34-4" fill="none" stroke="#ffc43f" stroke-width="7" opacity=".8"/>` },
    'n-in-a-row': { colors: ['#ffe36e', '#e98c3e'], decor: `<path d="M105 2L91 126M39 6l39 116M171 6l-39 116M4 52l202 19" stroke="#fff3ae" stroke-width="3" opacity=".32"/><path d="M0 118h210v42H0z" fill="#71403b"/>` },
    'reaction-time': { colors: ['#70e0bf', '#2c6db6'], decor: `<path d="M70 0v120M140 0v120" stroke="#fff" stroke-width="3" opacity=".42"/><rect width="70" height="120" fill="#35d57b" opacity=".2"/><rect x="140" width="70" height="120" fill="#6446a8" opacity=".22"/>` },
    'reaction-color': { colors: ['#a1f2be', '#27ba68'], decor: `<circle cx="105" cy="60" r="53" fill="#fff" opacity=".12"/><circle cx="105" cy="60" r="37" fill="#fff" opacity=".11"/>` },
    'reaction-sound': { colors: ['#76cff4', '#31589f'], decor: `<path d="M0 27h210M0 92h210" stroke="#fff" stroke-width="2" opacity=".15"/>` },
    'reaction-pendulum': { colors: ['#c8b7f5', '#59439c'], decor: `<path d="M28 21h154M50 100h110" stroke="#fff" stroke-width="2" opacity=".15"/>` },
    'reromo-tetris': { colors: ['#232e62', '#110d2d'], decor: `<g stroke="#7885b7" opacity=".25"><path d="M0 23h210M0 48h210M0 73h210M0 98h210"/><path d="M24 0v120M61 0v120M149 0v120M186 0v120"/></g>` },
    'rhythm-memory': { colors: ['#4d256d', '#171329'], decor: `<path d="M27 0l36 120M183 0l-36 120" stroke="#c15be9" stroke-width="23" opacity=".13"/><g fill="#ffd43c"><circle cx="34" cy="27" r="5"/><circle cx="64" cy="18" r="5"/><circle cx="96" cy="31" r="5"/><circle cx="135" cy="18" r="5"/><circle cx="174" cy="29" r="5"/></g>` },
    'rod-balance': { colors: ['#bdeeff', '#4aa6d1'], decor: `<path d="M0 111h210v49H0z" fill="#e9c982"/><path d="M0 111h210" stroke="#766043" stroke-width="4"/><path d="M20 111V97m34 14V88m34 23V80m34 31V88m34 23V97m34 14v-8" stroke="#e45142" stroke-width="4"/>` },
    'rubiks-cuboid': { colors: ['#58d4c1', '#28599a'], decor: `<path d="M9 24L36 8l27 16-27 16zM164 88l21-13 21 13-21 13z" fill="none" stroke="#d9fff8" stroke-width="3" opacity=".42"/><circle cx="177" cy="30" r="20" fill="none" stroke="#ffd43b" stroke-width="7" opacity=".73"/>` },
    'sky-pilot-3d': { colors: ['#78d9ff', '#348ac7'], decor: `<g fill="#fff" opacity=".76"><path d="M9 27q9-17 25 0 14-10 24 5H4q0-5 5-5z"/><path d="M143 20q9-17 24 0 13-9 24 6h-54q1-6 6-6z"/></g>` },
    'sudoku': { colors: ['#f5dfad', '#bd8e61'], decor: `<path d="M0 0h210v120H0z" fill="#fff" opacity=".08"/><path d="M18 107l45-87" stroke="#e34d42" stroke-width="9" stroke-linecap="round"/><path d="M18 107l-2 12 11-7" fill="#f2d09b"/>` },
    'ludo': { colors: ['#9be4ff', '#4fa8d5'], decor: `<circle cx="105" cy="76" r="72" fill="#fff" opacity=".18"/>` },
    'classic-board': { colors: ['#f4d58a', '#aa6d43'], decor: `<path d="M0 126h210v34H0z" fill="#69442f"/>` },
    'card-lounge': { colors: ['#3a9a62', '#164835'], decor: `<path d="M0 21h210M0 101h210" stroke="#d9f7e3" stroke-width="2" opacity=".18"/>` },
    'word-tiles': { colors: ['#80d9f6', '#3b8bc3'], decor: `<path d="M15 18h180v102H15z" fill="#fff" opacity=".1"/>` },
    'tic-tac-toe': { colors: ['#9ae7d1', '#3d9e8a'], decor: `<g fill="none" stroke="#effff9" stroke-width="2" opacity=".45"><path d="M0 25h28l16 16h27M210 94h-28l-16-16h-27"/><circle cx="28" cy="25" r="4"/><circle cx="182" cy="94" r="4"/></g>` },
    'number-memory': { colors: ['#65cdf7', '#55c66b'], decor: `<circle cx="18" cy="19" r="10" fill="#ffd43b" opacity=".8"/><circle cx="193" cy="102" r="18" fill="#fff" opacity=".22"/>` },
    'curve-memory': { colors: ['#73d8fb', '#4ebc73'], decor: `<path d="M0 111h210v49H0z" fill="#2f9843" opacity=".45"/><circle cx="181" cy="22" r="15" fill="#ffe45a"/>` },
    'cup-shuffle': { colors: ['#ffc55f', '#ed7e4d'], decor: `<path d="M0 109h210v51H0z" fill="#7f4b2c"/><path d="M0 109h210" stroke="#ffd98e" stroke-width="5"/>` },
    'spherical-bowl-balance': { colors: ['#7ad7fa', '#4dbc64'], decor: `<path d="M0 104h210v56H0z" fill="#46b748"/><g fill="#fff" opacity=".65"><path d="M5 24q9-15 22 0 13-8 23 5H0q1-5 5-5z"/><path d="M164 20q9-14 21 0 11-7 19 5h-45q1-5 5-5z"/></g>` },
    'standing-swing-jump': { colors: ['#55c9f4', '#c8f1fc'], decor: `<path d="M0 109h210v51H0z" fill="#59c948"/><g fill="#fff" opacity=".72"><path d="M8 32q10-17 25 0 13-9 24 5H4q0-5 4-5z"/><path d="M154 24q9-15 22 0 12-8 21 5h-48q1-5 5-5z"/></g>` },
    'wheelie-balance': { colors: ['#51c7f2', '#c7f1fc'], decor: `<path d="M0 112q43-18 94-3t116-8v59H0z" fill="#555d61"/><path d="M0 112q43-18 94-3t116-8" fill="none" stroke="#57c946" stroke-width="8"/><path d="M0 143q43-18 94-3t116-8" fill="none" stroke="#f6e45a" stroke-width="4" stroke-dasharray="28 14"/>` },
});

const ART_ALIASES = Object.freeze({
    'bowl-balance-puck-3d': 'spherical-bowl-balance',
    'bowl-balance-marble-3d': 'spherical-bowl-balance',
    'bowl-distance-puck-3d': 'spherical-bowl-balance',
    'bowl-distance-marble-3d': 'spherical-bowl-balance',
    'bowl-target-puck-3d': 'spherical-bowl-balance',
    'bowl-target-marble-3d': 'spherical-bowl-balance',
    'bowl-distance-puck-2d': 'spherical-bowl-balance',
    'bowl-distance-marble-2d': 'spherical-bowl-balance',
    'bowl-target-puck-2d': 'spherical-bowl-balance',
    'bowl-target-marble-2d': 'spherical-bowl-balance',
    'robot-island-1d': 'robot-island',
    'robot-island-2d': 'robot-island',
    'flappy-classic': 'flappy',
    'flappy-glider3d': 'flappy',
    'flappy-multilane': 'flappy',
    'tetris-rectangular': 'reromo-tetris',
    'tetris-structural': 'reromo-tetris',
    'tetris-circular': 'reromo-tetris',
    'tetris-mobius': 'reromo-tetris',
    'rod-3d': 'rod-balance',
    'rod-2d': 'rod-balance',
    'nrow-rotate': 'n-in-a-row',
    'nrow-random': 'n-in-a-row',
    'nrow-shoot': 'n-in-a-row',
    'nrow-push': 'n-in-a-row',
    'sudoku-numbers': 'sudoku',
    'sudoku-colors': 'sudoku',
    'twisty-cuboid': 'rubiks-cuboid',
    'twisty-torus': 'rubiks-cuboid',
    'twisty-tetrahedron': 'rubiks-cuboid',
    'twisty-octahedron': 'rubiks-cuboid',
    'twisty-dodecahedron': 'rubiks-cuboid',
    'twisty-icosahedron': 'rubiks-cuboid',
    'reaction-color': 'reaction-time',
    'reaction-sound': 'reaction-time',
    'reaction-pendulum': 'reaction-time',
});

const VARIANT_OVERLAYS = Object.freeze({
    'bowl-balance-puck-3d': `<ellipse cx="145" cy="43" rx="13" ry="4" fill="#ffd83c" stroke="#79591b" stroke-width="3"/>`,
    'bowl-balance-marble-3d': `<circle cx="145" cy="43" r="12" fill="#ffd83c" stroke="#79591b" stroke-width="4"/><path d="M137 35l16 16" stroke="#e7473d" stroke-width="3"/>`,
    'bowl-distance-puck-3d': `<path d="M145 42q25-29 51 5" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="5 5"/><ellipse cx="196" cy="49" rx="10" ry="3" fill="#ffd83c"/>`,
    'bowl-distance-marble-3d': `<path d="M145 42q25-29 51 5" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="5 5"/><circle cx="196" cy="49" r="8" fill="#ffd83c" stroke="#79591b" stroke-width="3"/>`,
    'bowl-target-puck-3d': `<path d="M145 42q20-24 43 1" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="5 5"/><circle cx="190" cy="52" r="16" fill="#fff" stroke="#e7473d" stroke-width="6"/><circle cx="190" cy="52" r="5" fill="#ffd43b"/>`,
    'bowl-target-marble-3d': `<path d="M145 42q20-24 43 1" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="5 5"/><circle cx="190" cy="52" r="16" fill="#fff" stroke="#e7473d" stroke-width="6"/><circle cx="190" cy="52" r="7" fill="#ffd43b"/>`,
    'bowl-distance-puck-2d': `<path d="M15 104h180" stroke="#fff" stroke-width="3" stroke-dasharray="8 7"/><path d="M145 42q24-26 48 7" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="5 5"/>`,
    'bowl-distance-marble-2d': `<path d="M15 104h180" stroke="#fff" stroke-width="3" stroke-dasharray="8 7"/><circle cx="190" cy="49" r="8" fill="#ffd43b" stroke="#79591b" stroke-width="3"/>`,
    'bowl-target-puck-2d': `<path d="M15 104h180" stroke="#fff" stroke-width="3" stroke-dasharray="8 7"/><path d="M175 86h30" stroke="#e7473d" stroke-width="9"/><ellipse cx="151" cy="49" rx="10" ry="3" fill="#ffd43b"/>`,
    'bowl-target-marble-2d': `<path d="M15 104h180" stroke="#fff" stroke-width="3" stroke-dasharray="8 7"/><path d="M175 86h30" stroke="#e7473d" stroke-width="9"/><circle cx="151" cy="49" r="8" fill="#ffd43b" stroke="#79591b" stroke-width="3"/>`,
    'robot-island-1d': `<path d="M12 94h186" stroke="#55ca4d" stroke-width="16" stroke-linecap="round"/><path d="M25 74l-14 20 14 20M185 74l14 20-14 20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    'robot-island-2d': `<path d="M18 28l14-13 14 13M32 15v34M178 90l14 13-14 13M192 103h-34" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    'flappy-multilane': `<path d="M7 42h196M7 81h196" stroke="#fff" stroke-width="2" stroke-dasharray="7 7" opacity=".72"/><g transform="translate(103 35) scale(.62)"><ellipse rx="28" ry="20" fill="#ff7257" stroke="#833a31" stroke-width="5"/><circle cx="13" cy="-6" r="8" fill="#fff"/><path d="M24 0l20 7-20 7z" fill="#ffd436"/></g>`,
    'tetris-rectangular': `<rect x="67" y="8" width="77" height="103" fill="#12162f" stroke="#d6e0ff" stroke-width="5"/><g stroke="#182041" stroke-width="3"><path d="M72 84h22v22H72zm22 0h22v22H94zm0-22h22v22H94z" fill="#54d65a"/><path d="M116 84h22v22h-22zm0-22h22v22h-22z" fill="#ef4b46"/><path d="M72 40h22v22H72zm22 0h22v22H94z" fill="#ffd52e"/></g>`,
    'tetris-structural': `<path d="M27 108h156" stroke="#d6e0ff" stroke-width="5" stroke-linecap="round"/><g transform="rotate(13 83 106)" stroke="#182041" stroke-width="3"><path d="M62 84h22v22H62zm22 0h22v22H84zm0-22h22v22H84z" fill="#54d65a"/><path d="M106 84h22v22h-22zm0-22h22v22h-22z" fill="#ef4b46"/><path d="M84 40h22v22H84zm22 0h22v22h-22z" fill="#ffd52e"/></g><circle cx="84" cy="106" r="5" fill="#ffcc33" stroke="#5d4010" stroke-width="2"/><path d="M148 34a39 39 0 0 1 12 42" fill="none" stroke="#ffcc33" stroke-width="5" stroke-linecap="round"/><path d="M151 72l10 7 4-12" fill="#ffcc33"/><path d="M38 28v40m-8-10 8 10 8-10" fill="none" stroke="#f4f6ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    'tetris-circular': `<circle cx="105" cy="69" r="45" fill="none" stroke="#ffd43d" stroke-width="5" opacity=".8"/>`,
    'tetris-mobius': `<path d="M35 70c23-55 69-40 91-11 15 20 28 17 45-11-11 57-59 62-87 26-18-23-34-21-49-4z" fill="#d83bc7" stroke="#ffb0f0" stroke-width="5"/><path d="M38 68c30 4 61-11 88-9 17 1 29 5 43-9" fill="none" stroke="#701f78" stroke-width="3"/>`,
    'rod-2d': `<g stroke="#246e99" opacity=".22"><path d="M0 24h210M0 48h210M0 72h210M24 0v105M48 0v105M72 0v105M138 0v105M162 0v105M186 0v105"/></g><path d="M151 62h39m-11-10l11 10-11 10" fill="none" stroke="#e84b3f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    'nrow-rotate': `<path d="M178 20a27 27 0 1 1-21-9" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M155 4l5 18 15-11" fill="#fff"/>`,
    'nrow-random': `<path d="M166 8h27v27M193 8l-33 33M184 68h-22v22M162 90l31-31" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
    'nrow-shoot': `<path d="M8 62h57m-17-15l17 15-17 15" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="62" r="9" fill="#ef4b43"/>`,
    'nrow-push': `<path d="M7 62h58m-16-15l16 15-16 15" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><g fill="#ef4b43" stroke="#8c2b28" stroke-width="2"><circle cx="17" cy="62" r="8"/><circle cx="35" cy="62" r="8"/><circle cx="53" cy="62" r="8"/></g>`,
    'sudoku-colors': `<rect x="50" y="9" width="110" height="108" rx="5" fill="#fffdf0" stroke="#245a91" stroke-width="5"/><path d="M87 11v104m36-104v104M52 45h106M52 81h106" stroke="#245a91" stroke-width="3"/>${['#ef4b45','#ffce2e','#42b957','#3b91e4','#9a58d1','#f17831','#24b6b1','#ec5f9e','#68737d'].map((color,index)=>`<circle cx="${69 + (index % 3) * 36}" cy="${27 + Math.floor(index / 3) * 36}" r="9" fill="${color}"/>`).join('')}`,
    'twisty-torus': `<path d="M39 64c0-31 28-46 66-46s66 15 66 46-28 49-66 49-66-18-66-49zm43 0c0 11 10 17 23 17s23-6 23-17-10-15-23-15-23 4-23 15z" fill="#ffd437" stroke="#172238" stroke-width="6" fill-rule="evenodd"/><path d="M55 36l36 17m28-3l35-16M46 74l39-5m40 0l39 5M105 18v31m0 32v32" stroke="#e43e39" stroke-width="6"/>`,
    'twisty-tetrahedron': `<path d="M105 9L39 111h132z" fill="#ffd43b" stroke="#172238" stroke-width="7"/><path d="M105 9v102M39 111l66-39 66 39M72 60h66" fill="none" stroke="#172238" stroke-width="5"/><path d="M72 60l33 12-50 14z" fill="#e9443a"/><path d="M138 60l-33 12 50 14z" fill="#35a44c"/>`,
    'twisty-octahedron': `<path d="M105 7l65 52-65 53-65-53z" fill="#36a34d" stroke="#172238" stroke-width="7"/><path d="M105 7v105M40 59h130M105 7L73 59l32 53 32-53z" fill="none" stroke="#172238" stroke-width="5"/><path d="M40 59l65-52v52z" fill="#ffd43a"/><path d="M105 59h65l-65 53z" fill="#e7443d"/>`,
    'twisty-dodecahedron': `<path d="M105 7l48 16 29 43-18 45H46L28 66l29-43z" fill="#f0c73d" stroke="#172238" stroke-width="7"/><path d="M105 31l29 21-11 35H87L76 52z" fill="#e84941" stroke="#172238" stroke-width="5"/><path d="M105 7v24M57 23l19 29M28 66l59 21m95-21l-59 21m41 24l-41-24m-77 24l41-24m66-64l-19 29" stroke="#172238" stroke-width="4"/>`,
    'twisty-icosahedron': `<path d="M105 6l57 24 21 54-44 31H71L27 84l21-54z" fill="#36a34d" stroke="#172238" stroke-width="7"/><path d="M105 6L71 115m34-109l34 109M27 84l135-54M48 30l135 54M27 84h156M48 30l91 85M162 30l-91 85" fill="none" stroke="#172238" stroke-width="4"/><path d="M105 6L89 58l50 57z" fill="#ffd43a" opacity=".9"/>`,
    'reaction-color': `<circle cx="94" cy="57" r="34" fill="#f8fff9" stroke="#176d43" stroke-width="6"/><path d="M94 36v21l15 10" fill="none" stroke="#e8473e" stroke-width="6" stroke-linecap="round"/><path d="M137 30l23 59-18-10-11 20-12-7 11-19-20-6z" fill="#fff" stroke="#245b87" stroke-width="5"/><path d="M47 22l-10-13m35 7l2-15" stroke="#ffd43c" stroke-width="5" stroke-linecap="round"/>`,
    'reaction-sound': `<g transform="translate(88 60)" fill="#f8fbff" stroke="#173e72" stroke-width="6"><path d="M-48-16h23L9-45v90L-25 16h-23z"/><path d="M29-25q32 25 0 50M43-40q51 40 0 80" fill="none" stroke="#ffd43c" stroke-linecap="round"/></g><path d="M27 106h157" stroke="#a6e8ff" stroke-width="4" stroke-dasharray="3 8" stroke-linecap="round"/>`,
    'reaction-pendulum': `<path d="M61 18h88" stroke="#f8fbff" stroke-width="9" stroke-linecap="round"/><circle cx="105" cy="20" r="7" fill="#29304f"/><path d="M105 25l31 67" stroke="#29304f" stroke-width="5"/><circle cx="136" cy="92" r="20" fill="#ffd43b" stroke="#6b4d1b" stroke-width="6"/><path d="M58 94a61 61 0 0 1 94-59" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="5 7" opacity=".7"/>`,
});

const REPLACE_BASE_SCENE = new Set([
    'tetris-rectangular', 'tetris-structural', 'tetris-mobius', 'sudoku-colors',
    'twisty-torus', 'twisty-tetrahedron', 'twisty-octahedron',
    'twisty-dodecahedron', 'twisty-icosahedron',
    'reaction-color', 'reaction-sound', 'reaction-pendulum',
]);

const escapeAttribute = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function gameArtworkMarkup(artKey, label = '') {
    const baseKey = ART_ALIASES[artKey] || artKey;
    const launcher = LAUNCHER_THUMBNAILS[baseKey];
    const thumbnail = MODE_THUMBNAILS[artKey] || (launcher && `game-thumbnails/${launcher}`);
    if (thumbnail) {
        return `<img class="game-card-art" src="assets/${thumbnail}" alt="${escapeAttribute(label)}" draggable="false">`;
    }
    const scene = SCENES[baseKey];
    if (scene) {
        const backdrop = BACKDROPS[artKey] || BACKDROPS[baseKey] || { colors: ['#6dcdf7', '#bdefff'], decor: '' };
        const id = String(artKey).replace(/[^a-z0-9_-]/gi, '-');
        return `<svg class="game-card-art" viewBox="0 0 210 160" role="img" aria-label="${escapeAttribute(label)}" preserveAspectRatio="xMidYMid meet">
            <defs><linearGradient id="bg-${id}" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="${backdrop.colors[0]}"/><stop offset="1" stop-color="${backdrop.colors[1]}"/></linearGradient><filter id="shadow-${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#071b2a" flood-opacity=".27"/></filter></defs>
            <rect width="210" height="160" fill="url(#bg-${id})"/>
            ${backdrop.decor || ''}
            <g filter="url(#shadow-${id})">${REPLACE_BASE_SCENE.has(artKey) ? (VARIANT_OVERLAYS[artKey] || scene) : `${scene}${VARIANT_OVERLAYS[artKey] || ''}`}</g>
        </svg>`;
    }
    return '';
}

function thumbnailMarkup(gameConfig) {
    const launcherThumbnail = LAUNCHER_THUMBNAILS[gameConfig._id];
    if (launcherThumbnail) {
        return `<img src="assets/game-thumbnails/${launcherThumbnail}" alt="${escapeAttribute(gameConfig.name)}" draggable="false">`;
    }
    const art = gameArtworkMarkup(gameConfig._id, gameConfig.name);
    if (art) return art;
    const imageFile = gameConfig.thumbnail || gameConfig.iconImage;
    return imageFile
        ? `<img src="games/${gameConfig._id}/${imageFile}" alt="${escapeAttribute(gameConfig.name)}">`
        : `<span class="thumb-placeholder">${gameConfig.icon || '🎮'}</span>`;
}
export function createGameCard(gameConfig, onClick) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.dataset.gameId = gameConfig._id;

    card.innerHTML = `
        <div class="game-card-thumb">${thumbnailMarkup(gameConfig)}</div>
        <div class="game-card-info">
            <div class="game-card-name">${gameConfig.name || gameConfig._id}</div>
            <div class="game-card-desc">${gameConfig.description || ''}</div>
        </div>
    `;

    card.addEventListener('click', () => onClick(gameConfig));
    return card;
}
