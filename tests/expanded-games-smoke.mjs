import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'tests', 'artifacts');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9364;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
    }

    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            if (!message.id) {
                this.events.push(message);
                return;
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
    }

    call(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const result = await this.call('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
    }

    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const result = await callback();
            if (result) return result;
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function getPage() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
}

let screenshotsAvailable = true;
const requestedScreenshotNames = new Set((process.env.WW_CAPTURE_NAMES || [
    'standing-swing-jump-playing.png',
    'wheelie-balance-playing.png',
            'wheelie-balance-backward-fall.png',
            'dino-runner-gameover.png',
            'robot-island-2d.png',
            'spherical-bowl-starts-at-bottom.png',
    'classic-board-chess.png',
    'classic-board-scrabble.png',
    'classic-board-memory.png',
].join(',')).split(',').map(name => name.trim()).filter(Boolean));
async function screenshot(client, name) {
    if (!screenshotsAvailable) return false;
    if (process.env.WW_CAPTURE_SCREENSHOTS === 'new' && !requestedScreenshotNames.has(name)) return false;
    const focused = await Promise.race([
        client.call('Page.bringToFront').then(() => true),
        delay(5000).then(() => false),
    ]);
    if (!focused) {
        screenshotsAvailable = false;
        return false;
    }
    await delay(450);
    const result = await Promise.race([
        client.call('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
        }),
        delay(15000).then(() => null),
    ]);
    if (!result) {
        // Chromium occasionally declines hidden-window captures on Windows;
        // rendering assertions remain authoritative and later captures are
        // skipped so this does not make the integration suite flaky.
        screenshotsAvailable = false;
        return false;
    }
    await writeFile(path.join(artifacts, name), Buffer.from(result.data, 'base64'));
    return true;
}

let stdout = '';
let stderr = '';
const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: {
        ...process.env,
        WW_MINI_GAMES_HEADLESS_TEST: ['1', 'new'].includes(process.env.WW_CAPTURE_SCREENSHOTS) ? '0' : '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { stdout += chunk.toString(); });
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

let client;
try {
    await mkdir(artifacts, { recursive: true });
    const page = await waitFor(getPage, 'Electron renderer');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(() => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length && document.querySelector('.game-card'))`), 'game discovery and gallery render');

    const menu = await client.evaluate(`(() => {
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
        const rootStyle = getComputedStyle(document.documentElement);
        const bodyStyle = getComputedStyle(document.body);
        return {
            discovered: window.app.gameLoader.games.map(game => game._id),
            background: bodyStyle.backgroundImage,
            headerBackground: getComputedStyle(document.querySelector('#menu-header')).backgroundImage,
            searchLeft: document.querySelector('#search-input').getBoundingClientRect().left,
            searchBackground: getComputedStyle(document.querySelector('#search-input')).backgroundColor,
            hasOldLogo: Boolean(document.querySelector('.header-left')),
            cards: document.querySelectorAll('.game-card').length,
            generatedThumbnails: [...document.querySelectorAll('.game-card-thumb img')]
                .map(image => image.getAttribute('src')),
            inlineArtwork: document.querySelectorAll('.game-card-thumb svg.game-card-art').length,
            firstCardBackground: getComputedStyle(document.querySelector('.game-card')).backgroundImage,
            thumbnailBottom: document.querySelector('.game-card-thumb').getBoundingClientRect().bottom,
            infoTop: document.querySelector('.game-card-info').getBoundingClientRect().top,
        };
    })()`);
    for (const id of ['n-in-a-row', 'sudoku', 'rhythm-memory', 'reaction-time', 'classic-board', 'card-lounge', 'standing-swing-jump', 'wheelie-balance', 'number-memory', 'curve-memory', 'cup-shuffle', 'spherical-bowl-balance', 'dino-runner', 'robot-island']) {
        if (!menu.discovered.includes(id)) throw new Error(`${id} is missing from the main menu.`);
    }
    for (const id of ['ludo', 'word-tiles', 'go-cube']) {
        if (menu.discovered.includes(id)) throw new Error(`${id} must only appear inside Klasične namizne igre.`);
    }
    if (!/gradient/i.test(menu.background) || !/gradient/i.test(menu.headerBackground) ||
        !/rgb\(105, 211, 76\)|rgb\(59, 173, 56\)/i.test(menu.headerBackground) ||
        menu.searchLeft > 20 || menu.searchBackground !== 'rgb(82, 196, 71)' || menu.hasOldLogo || menu.cards !== menu.discovered.length ||
        menu.generatedThumbnails.length + menu.inlineArtwork !== menu.cards
        || new Set(menu.generatedThumbnails).size !== menu.generatedThumbnails.length ||
        menu.generatedThumbnails.some(source => !source.startsWith('assets/game-thumbnails/')) ||
        !/gradient/i.test(menu.firstCardBackground) || Math.abs(menu.thumbnailBottom - menu.infoTop) > 1 ||
        menu.discovered.includes('rod-balance-2d')) {
        throw new Error(`Main gallery is not the vivid XP-green design: ${JSON.stringify(menu)}`);
    }
    await screenshot(client, 'expanded-main-menu.png');

    const room = await client.evaluate(`(async () => {
        window.__netProbe = [];
        window.app.network.onMessage((message, info) => window.__netProbe.push({ message, peerId: info.peerId }));
        return window.app.network.host(0, 3);
    })()`);
    if (!room.success || !room.code) throw new Error(`Multi-peer LAN room did not open: ${JSON.stringify(room)}`);
    const peerOne = new WebSocket(`ws://${room.code}`);
    const peerTwo = new WebSocket(`ws://${room.code}`);
    await Promise.all([peerOne, peerTwo].map(socket => new Promise((resolve, reject) => {
        socket.once('open', resolve); socket.once('error', reject);
    })));
    await waitFor(() => client.evaluate(`window.app.network.peers.size === 2`), 'two LAN peers');
    const peerMessages = [peerOne, peerTwo].map(socket => new Promise(resolve => socket.once('message', raw => resolve(JSON.parse(raw.toString())))));
    await client.evaluate(`window.app.network.send({ type: 'multi-peer-probe', value: 17 })`);
    const broadcasts = await Promise.all(peerMessages);
    if (broadcasts.some(message => message.type !== 'multi-peer-probe' || message.value !== 17)) throw new Error('LAN broadcast did not reach every peer.');
    peerTwo.send(JSON.stringify({ type: 'peer-probe', value: 29 }));
    await waitFor(() => client.evaluate(`window.__netProbe.some(entry => entry.message.type === 'peer-probe' && entry.message.value === 29 && /^peer-/.test(entry.peerId))`), 'peer-addressed LAN message');
    peerOne.close(); peerTwo.close();
    await client.evaluate(`(async () => { await window.app.network.close(); window.app.network.clearCallbacks(); delete window.__netProbe; })()`);

    const classicState = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        const modes = [...document.querySelectorAll('[data-mode]')].map(card => card.dataset.mode);
        document.querySelector('[data-mode="reversi"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        document.querySelector('.session-lobby [data-action="solo"]').click();
        await new Promise(resolve => setTimeout(resolve, 80));
        const game = window.app.currentGame;
        const result = { modes, mode: game.mode, size: game.state?.size, discs: game.state?.grid?.flat().filter(Boolean).length };
        return result;
    })()`);
    if (!classicState.modes.includes('ludo') || classicState.mode !== 'reversi' || classicState.size !== 8 || classicState.discs !== 4) {
        throw new Error(`Classic board collection did not launch Reversi: ${JSON.stringify(classicState)}`);
    }
    await screenshot(client, 'classic-board-reversi.png');
    await client.evaluate(`window.app.exitGame()`);

    const callistoState = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        document.querySelector('[data-mode="kalisto"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const lobbyPlayers = window.app.currentGame.lobby?.options?.players;
        document.querySelector('.session-lobby [data-action="solo"]').click();
        await new Promise(resolve => setTimeout(resolve, 80));
        const game = window.app.currentGame;
        game._applyAction({ kind: 'kalisto-pillar', row: 3, column: 3 }, 0);
        return {
            title: game.mode,
            phase: game.state?.phase,
            players: game.state?.playerCount,
            pieces: game.state?.remaining?.[1]?.length,
            pillars: game.state?.pillars?.length,
            lobbyPlayers,
        };
    })()`);
    if (callistoState.title !== 'kalisto' || callistoState.phase !== 'pillars'
        || callistoState.players !== 2 || callistoState.pieces !== 18
        || callistoState.pillars !== 1 || callistoState.lobbyPlayers !== 2) {
        throw new Error(`Classic board collection did not launch authentic Callisto setup: ${JSON.stringify(callistoState)}`);
    }
    await screenshot(client, 'classic-board-callisto.png');
    await client.evaluate(`window.app.exitGame()`);

    const classicLudoState = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        document.querySelector('[data-mode="ludo"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const lobbyPlayers = window.app.currentGame.lobby?.options?.players;
        document.querySelector('.session-lobby [data-action="solo"]').click();
        await new Promise(resolve => setTimeout(resolve, 80));
        const game = window.app.currentGame;
        return {
            mode: game.mode,
            phase: game.state?.phase,
            players: game.state?.rules?.playerCount,
            pieces: game.state?.players?.[0]?.pieces?.length,
            lobbyPlayers,
            rollButton: Boolean(game.rollButton),
        };
    })()`);
    if (classicLudoState.mode !== 'ludo' || classicLudoState.phase !== 'roll'
        || classicLudoState.players !== 4 || classicLudoState.pieces !== 4
        || classicLudoState.lobbyPlayers !== 4 || !classicLudoState.rollButton) {
        throw new Error(`Classic board collection did not launch Ludo: ${JSON.stringify(classicLudoState)}`);
    }
    await screenshot(client, 'classic-board-ludo.png');
    await client.evaluate(`window.app.exitGame()`);
    if (await client.evaluate(`Boolean(document.querySelector('.ludo-roll-button'))`)) throw new Error('Classic-board Ludo left its roll button behind.');

    const chessState = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        const modes = [...document.querySelectorAll('[data-mode]')].map(card => card.dataset.mode);
        document.querySelector('[data-mode="chess"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        document.querySelector('.session-lobby [data-action="solo"]').click();
        await new Promise(resolve => setTimeout(resolve, 80));
        const game = window.app.currentGame;
        const soloHumanPlayer2 = game._controlledByHuman?.(2);
        return {
            modes,
            mode: game.mode,
            pieces: game.state?.board?.flat().filter(Boolean).length,
            legalMoves: game.state ? game.state.player : null,
            soloHumanPlayer2,
        };
    })()`);
    if (!['chess', 'scrabble', 'memory', 'go'].every(mode => chessState.modes.includes(mode))
        || chessState.mode !== 'chess' || chessState.pieces !== 32 || chessState.legalMoves !== 1
        || chessState.soloHumanPlayer2 !== false) {
        throw new Error(`New classic-board modes or Chess did not launch: ${JSON.stringify(chessState)}`);
    }
    await screenshot(client, 'classic-board-chess.png');
    await client.evaluate(`window.app.exitGame()`);

    await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        document.querySelector('[data-mode="scrabble"]').click();
    })()`);
    await waitFor(() => client.evaluate(`window.app.currentGame?.child?.phase === 'lobby'`), 'Slovenian Scrabble dictionary');
    const scrabbleState = await client.evaluate(`(async () => {
        document.querySelector('.session-lobby [data-action="solo"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const game = window.app.currentGame;
        return {
            parentMode: game.mode,
            childPhase: game.child?.phase,
            boardSize: game.child?.state?.size,
            rackSize: game.child?.state?.racks?.[1]?.length,
            dictionarySize: game.child?.dictionary?.size,
            hasCommonWord: game.child?.dictionary?.has('miza'),
            unicode: game.child?.dictionary?.has('človek'),
            inflections: ['miza', 'mize', 'mizi', 'mizo', 'hiše', 'mačke', 'slovarju']
                .every(word => game.child?.dictionary?.has(word)),
            soloHumanPlayer2: game.child?._controlledByHuman?.(2),
        };
    })()`);
    if (scrabbleState.parentMode !== 'scrabble' || scrabbleState.childPhase !== 'playing'
        || scrabbleState.boardSize !== 15 || scrabbleState.rackSize !== 7
        || scrabbleState.dictionarySize < 1000000 || !scrabbleState.hasCommonWord
        || !scrabbleState.unicode || !scrabbleState.inflections
        || scrabbleState.soloHumanPlayer2 !== false) {
        throw new Error(`Scrabble child mode or Slovenian dictionary failed: ${JSON.stringify(scrabbleState)}`);
    }
    await screenshot(client, 'classic-board-scrabble.png');
    await client.evaluate(`window.app.exitGame()`);

    const memoryState = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        document.querySelector('[data-mode="memory"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        document.querySelector('.session-lobby [data-action="solo"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const game = window.app.currentGame;
        game.child.render();
        return {
            parentMode: game.mode,
            childPhase: game.child?.phase,
            cards: game.child?.state?.cards?.length,
            layout: game.child?.layout?.length,
            categories: new Set(game.child?.catalog?.map(item => item.category)).size,
            scattered: game.child?.settings?.scattered,
            soloHumanPlayer2: game.child?._controlledByHuman?.(2),
        };
    })()`);
    if (memoryState.parentMode !== 'memory' || memoryState.childPhase !== 'playing'
        || memoryState.cards !== 20 || memoryState.layout !== 20
        || memoryState.categories < 2 || memoryState.scattered !== true
        || memoryState.soloHumanPlayer2 !== false) {
        throw new Error(`Classic picture memory did not launch: ${JSON.stringify(memoryState)}`);
    }
    await screenshot(client, 'classic-board-memory.png');
    await client.evaluate(`window.app.exitGame()`);

    const cardState = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'card-lounge');
        await window.app.launchGame(config);
        document.querySelector('[data-mode="blackjack"]').click();
        await new Promise(resolve => setTimeout(resolve, 100));
        const game = window.app.currentGame;
        const result = { mode: game.mode, phase: game.state?.phase, playerCards: game.state?.playerHand?.length, dealerCards: game.state?.dealerHand?.length };
        return result;
    })()`);
    if (cardState.mode !== 'blackjack' || !['player', 'gameover'].includes(cardState.phase) || cardState.playerCards < 2 || cardState.dealerCards < 2) {
        throw new Error(`Card lounge did not launch Blackjack: ${JSON.stringify(cardState)}`);
    }
    await screenshot(client, 'card-lounge-blackjack.png');
    await client.evaluate(`window.app.exitGame()`);

    const modeEscape = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'reromo-tetris');
        await window.app.launchGame(config);
        const selector = window.app.currentGame.modeSelector;
        const selectorHeader = selector.querySelector('.ww-mode-header');
        const selectorPanel = selector.querySelector('.ww-mode-panel');
        const selectorCard = selector.querySelector('[data-mode]');
        const mainHeader = document.querySelector('#menu-header');
        const mainGrid = document.querySelector('#game-grid');
        const mainCard = document.querySelector('#game-grid .game-card');
        const modeSearch = selector.querySelector('[data-mode-search-input]');
        modeSearch.value = 'möbius';
        modeSearch.dispatchEvent(new InputEvent('input', { bubbles: true }));
        document.activeElement?.blur();
        const filteredModeCount = [...selector.querySelectorAll('[data-mode]')]
            .filter(card => !card.hidden).length;
        const filteredCountLabel = selector.querySelector('[data-mode-count]').textContent;
        const modeImages = [...selector.querySelectorAll('.game-card-art')]
            .filter(art => art.tagName === 'IMG');
        await Promise.all(modeImages.map(image => image.complete
            ? Promise.resolve()
            : new Promise(resolve => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
            })
        ));
        return {
            selectorClass: selector.classList.contains('ww-mode-select'),
            greenCards: [...selector.querySelectorAll('[data-mode]')].every(card =>
                card.classList.contains('ww-mode-card') && card.querySelector('.game-card-art')),
            sameHeader: getComputedStyle(selectorHeader).backgroundImage === getComputedStyle(mainHeader).backgroundImage
                && getComputedStyle(selectorHeader).height === getComputedStyle(mainHeader).height,
            sameGrid: getComputedStyle(selectorPanel).padding === getComputedStyle(mainGrid).padding,
            sameCard: getComputedStyle(selectorCard).height === getComputedStyle(mainCard).height
                && getComputedStyle(selectorCard).borderRadius === getComputedStyle(mainCard).borderRadius,
            sameField: getComputedStyle(selector.querySelector('.ww-mode-search')).backgroundColor
                === getComputedStyle(document.querySelector('#search-input')).backgroundColor,
            filteredModeCount,
            filteredCountLabel,
            modeImageSources: modeImages.map(image => image.getAttribute('src')),
            modeImagesLoaded: modeImages.every(image => image.complete && image.naturalWidth > 0),
        };
    })()`);
    await screenshot(client, 'tetris-mode-selector-green.png');
    await client.call('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    await delay(120);
    await client.call('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(() => client.evaluate(`window.app.state === 'menu'`), 'ESC returning from mode selector to gallery');
    if (!modeEscape.selectorClass || !modeEscape.greenCards || !modeEscape.sameHeader
        || !modeEscape.sameGrid || !modeEscape.sameCard || !modeEscape.sameField
        || modeEscape.filteredModeCount !== 1 || modeEscape.filteredCountLabel !== '1 mode'
        || modeEscape.modeImageSources.length !== 4 || !modeEscape.modeImagesLoaded
        || modeEscape.modeImageSources.some(source => !source.startsWith('assets/mode-thumbnails/tetris-'))) {
        throw new Error(`Mode selector did not share the gallery design: ${JSON.stringify(modeEscape)}`);
    }

    const cupAndBall = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'cup-and-ball');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        game.settings.twoD_angularSpeedDegrees = 205;
        game.settings.twoD_gravity = 7.3;
        game.settings.threeD_gravity = 13.1;
        game._modeChosenForSession = true;
        game._startMode('2d');
        const record = game.getRecordSettings();
        return {
            selectorCount,
            mode: game.mode,
            child: game.child.constructor.name,
            hasDedicatedCanvas: Boolean(game.modeCanvas),
            angularSpeed: game.child.parameters.angularSpeedDegrees,
            childGravity: game.child.parameters.gravity,
            record,
            profilesIndependent: game.settings.twoD_gravity !== game.settings.threeD_gravity,
        };
    })()`);
    if (cupAndBall.selectorCount !== 2 || cupAndBall.mode !== '2d'
        || cupAndBall.child !== 'CupAndBall2DGame' || !cupAndBall.hasDedicatedCanvas
        || cupAndBall.angularSpeed !== 205 || cupAndBall.childGravity !== 7.3
        || cupAndBall.record.mode !== '2d' || cupAndBall.record.gravity !== 7.3
        || Object.hasOwn(cupAndBall.record, 'angularSpeedDegrees') || !cupAndBall.profilesIndependent) {
        throw new Error(`Cup-and-ball 2D integration failed: ${JSON.stringify(cupAndBall)}`);
    }
    await client.evaluate(`window.app.exitGame()`);

    const nInRow = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'n-in-a-row');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        const selectorClass = game.modeSelector.classList.contains('ww-mode-select');
        game._selectPendingMode('push');
        game.modeSelector.querySelector('[data-size="columns"]').value = '8';
        game.modeSelector.querySelector('[data-size="rows"]').value = '5';
        game.modeSelector.querySelector('[data-size="winLength"]').value = '4';
        game._capturePendingProfile();
        game._selectPendingMode('rotate');
        game.modeSelector.querySelector('[data-size="columns"]').value = '11';
        game.modeSelector.querySelector('[data-size="rows"]').value = '9';
        game.modeSelector.querySelector('[data-size="winLength"]').value = '6';
        game._capturePendingProfile();
        game._selectPendingMode('push');
        const restoredProfile = [...game.modeSelector.querySelectorAll('[data-size]')].map(input => Number(input.value));
        game._startMode('push');
        game.render();
        let plasticImpacts = 0;
        game.audio.playPlasticImpact = () => { plasticImpacts++; };
        const layout = game.layout;
        const canvasRect = game.canvas.getBoundingClientRect();
        const clientX = canvasRect.left + (layout.x + layout.cell * 0.5) * canvasRect.width / game.canvas.width;
        const clientY = canvasRect.top + (layout.y - layout.edgeMargin * 0.5) * canvasRect.height / game.canvas.height;
        game._handlePointer({ button: 0, clientX, clientY });
        const animationStarted = game.phase === 'animating'
            && game.animation?.kind === 'shoot' && game.animation?.push
            && game.animation.lineMoves.length === 1;
        const duration = game.animation?.duration ?? 0;
        game.update(duration * 0.5);
        const animationHasMiddleFrame = game.phase === 'animating'
            && game.animation.elapsed > 0 && game.animation.elapsed < duration;
        game.update(duration);
        const animationResolved = game.phase === 'playing' && game.moves === 1 && game.player === 2;
        const activeMode = game.mode;
        const dimensions = [game.board.columns, game.board.rows];
        const winLength = game.board.winLength;
        const record = game.getRecordSettings();
        window.app.pauseGame();
        const chooseModeButton = window.app.pauseMenu.panel.querySelector('[data-action="mode"]');
        const emptyControlsHidden = !window.app.pauseMenu.panel.querySelector('[data-action="controls"]');
        chooseModeButton?.click();
        const pauseReturnsToSelector = game.phase === 'mode-select'
            && Boolean(game.modeSelector) && !window.app.pauseMenu.isVisible;
        return {
            selectorCount,
            selectorClass,
            mode: activeMode,
            dimensions,
            winLength,
            record,
            phase: game.phase,
            restoredProfile,
            animationStarted,
            animationHasMiddleFrame,
            animationResolved,
            plasticImpacts,
            pauseHasChooseMode: Boolean(chooseModeButton),
            emptyControlsHidden,
            pauseReturnsToSelector,
        };
    })()`);
    if (nInRow.selectorCount !== 4 || !nInRow.selectorClass || nInRow.mode !== 'push'
        || nInRow.dimensions.join('x') !== '8x5' || nInRow.winLength !== 4
        || nInRow.restoredProfile.join('x') !== '8x5x4' || !nInRow.animationStarted
        || !nInRow.animationHasMiddleFrame || !nInRow.animationResolved || nInRow.plasticImpacts !== 1
        || !nInRow.pauseHasChooseMode || !nInRow.emptyControlsHidden || !nInRow.pauseReturnsToSelector) {
        throw new Error(`N-in-a-row integration failed: ${JSON.stringify(nInRow)}`);
    }
    await screenshot(client, 'n-in-a-row-push.png');
    await client.evaluate(`window.app.exitGame()`);

    const sudoku = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'sudoku');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        game._selectPendingRepresentation('colors');
        game.modeSelector.querySelector('[data-size="blockRows"]').value = '2';
        game.modeSelector.querySelector('[data-size="blockColumns"]').value = '3';
        game._capturePendingProfile();
        game._selectPendingRepresentation('numbers');
        game.modeSelector.querySelector('[data-size="blockRows"]').value = '4';
        game.modeSelector.querySelector('[data-size="blockColumns"]').value = '4';
        game._capturePendingProfile();
        game._selectPendingRepresentation('colors');
        const restoredProfile = [...game.modeSelector.querySelectorAll('[data-size]')].map(input => Number(input.value));
        game._startPuzzle();
        return { selectorCount, restoredProfile };
    })()`);
    await waitFor(() => client.evaluate(`window.app.currentGame?.phase === 'playing'`), 'unique Sudoku generation');
    const sudokuState = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        game.render();
        const module = await import('./games/sudoku/game.js');
        const solutions = module.countSudokuSolutions(game.puzzle, game.blockRows, game.blockColumns, 2);
        let editable = null;
        for (let row = 0; row < game.size && !editable; row++) {
            for (let column = 0; column < game.size; column++) {
                if (!game.fixed[row][column]) { editable = { row, column }; break; }
            }
        }
        game.selected = editable;
        game.candidateMode = true;
        const value = game.solution[editable.row][editable.column];
        game._enterValue(value);
        game.render();
        return {
            representation: game.representation,
            size: game.size,
            block: [game.blockRows, game.blockColumns],
            solutions,
            candidateCount: game.notes[editable.row][editable.column].size,
            selectorCount: ${JSON.stringify(null)},
        };
    })()`);
    sudokuState.selectorCount = sudoku.selectorCount;
    sudokuState.restoredProfile = sudoku.restoredProfile;
    if (sudokuState.selectorCount !== 2 || sudokuState.representation !== 'colors' || sudokuState.size !== 6 || sudokuState.solutions !== 1 || sudokuState.candidateCount !== 1 || sudokuState.restoredProfile.join('x') !== '2x3') {
        throw new Error(`Sudoku integration failed: ${JSON.stringify(sudokuState)}`);
    }
    await screenshot(client, 'sudoku-colors-candidates.png');
    await client.evaluate(`window.app.exitGame()`);

    const rhythm = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'rhythm-memory');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game.round = 3;
        game.patternIntervals = [0.4, 0.6];
        game.playerClicks = [10, 10.4, 11.0];
        game._judgeRound();
        const success = { phase: game.phase, round: game.round, intervals: game.patternIntervals.length };
        game.round = 3;
        game.patternIntervals = [0.4, 0.6];
        game.playerClicks = [20, 20.72, 21.32];
        game._judgeRound();
        const failure = { phase: game.phase, failedInterval: game.failedInterval, errorMs: game.lastErrorMs };
        game.restart();
        game.render();
        return { success, failure, record: game.getRecordSettings() };
    })()`);
    if (rhythm.success.phase !== 'ready' || rhythm.success.round !== 4 || rhythm.success.intervals !== 3 || rhythm.failure.phase !== 'gameover' || rhythm.failure.failedInterval !== 1 || rhythm.failure.errorMs <= 140) {
        throw new Error(`Rhythm interval judging failed: ${JSON.stringify(rhythm)}`);
    }
    await screenshot(client, 'rhythm-memory.png');
    await client.evaluate(`window.app.exitGame()`);

    const goCube = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        const outerModes = [...document.querySelectorAll('[data-mode]')].map(card => card.dataset.mode);
        document.querySelector('[data-mode="go"]').click();
        await new Promise(resolve => setTimeout(resolve, 50));
        const game = window.app.currentGame;
        const selectorCount = game.child.modeSelector.querySelectorAll('[data-mode]').length;
        game.child.settings.cuboid_nx = 5;
        game.child.settings.cuboid_ny = 4;
        game.child.settings.cuboid_nz = 3;
        game.child._modeChosenForSession = true;
        game.child._startMode('cuboid');
        const child = game.child.child;
        const placed = child.model.place('c:2:3:2');
        child._rebuildStones();
        game.render();
        return {
            parentMode: game.mode,
            outerHasGo: outerModes.includes('go'),
            selectorCount,
            parentRecord: game.getRecordSettings(),
            dimensions: child.model.topology.dimensions,
            placed,
            pointCount: child.model.topology.points.size,
            neighborCount: child.model.neighbors('c:0:0:0').length,
            stoneCount: child.stonesGroup.children.length,
        };
    })()`);
    if (goCube.parentMode !== 'go' || !goCube.outerHasGo || goCube.selectorCount !== 2
        || goCube.parentRecord.mode !== 'go' || goCube.parentRecord.goMode !== 'cuboid'
        || goCube.parentRecord.nx !== 5 || goCube.parentRecord.ny !== 4 || goCube.parentRecord.nz !== 3
        || goCube.dimensions.nx !== 5 || goCube.dimensions.ny !== 4
        || goCube.dimensions.nz !== 3 || !goCube.placed || goCube.neighborCount !== 3 || goCube.stoneCount !== 1) {
        throw new Error(`Go Cube integration failed: ${JSON.stringify(goCube)}`);
    }
    await screenshot(client, 'go-cube.png');
    const goCube3D = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        const child = game.child.child;
        const cameraBefore = child.camera.position.toArray();
        child.controls._movePrev.set(-0.2, 0.1);
        child.controls._moveCurr.set(0.18, -0.08);
        child.controls.update();
        game.render();
        const cameraAfter = child.camera.position.toArray();
        return {
            mode: game.child.mode,
            cameraChanged: cameraAfter.some((value, index) => Math.abs(value - cameraBefore[index]) > 1e-5),
            faceCount: child.faceMeshes.length,
            hasLargeSidePanel: Boolean(document.querySelector('[data-go-side-panel]')),
            finiteCamera: cameraAfter.every(Number.isFinite),
        };
    })()`);
    if (goCube3D.mode !== 'cuboid' || !goCube3D.cameraChanged || goCube3D.faceCount !== 6
        || goCube3D.hasLargeSidePanel || !goCube3D.finiteCamera) {
        throw new Error(`Go Cube 3D view failed: ${JSON.stringify(goCube3D)}`);
    }
    await screenshot(client, 'go-cube-3d.png');
    const goNavigation = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.returnToModeSelector();
        const innerModes = [...document.querySelectorAll('[data-mode]')].map(card => card.dataset.mode);
        const innerPhase = game.child?.phase;
        const innerBack = document.querySelector('.ww-mode-select [data-mode-back]');
        innerBack?.click();
        const outerModes = [...document.querySelectorAll('[data-mode]')].map(card => card.dataset.mode);
        return {
            innerPhase,
            innerModes,
            outerPhase: game.phase,
            outerModes,
            childDestroyed: game.child === null,
        };
    })()`);
    if (goNavigation.innerPhase !== 'mode-select'
        || !goNavigation.innerModes.includes('cuboid') || !goNavigation.innerModes.includes('rectangle')
        || goNavigation.outerPhase !== 'mode-select' || !goNavigation.outerModes.includes('go')
        || !goNavigation.childDestroyed) {
        throw new Error(`Nested Go navigation failed: ${JSON.stringify(goNavigation)}`);
    }
    await client.evaluate(`window.app.exitGame()`);

    const reaction = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'reaction-time');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        game.settings.soundAttempts = 1;
        game.selectMode('sound');
        let beeps = 0;
        game.audio.playBeep = () => { beeps++; };
        game._startWait();
        game.waitDelay = 0;
        game.update(1 / 60);
        game.render();
        return { mode: game.mode, phase: game.phase, beeps, selectorCount };
    })()`);
    if (reaction.mode !== 'sound' || reaction.phase !== 'stimulus' || reaction.beeps !== 1 || reaction.selectorCount !== 3) {
        throw new Error(`Reaction sound mode failed: ${JSON.stringify(reaction)}`);
    }
    await screenshot(client, 'reaction-sound-mode.png');
    await client.evaluate(`window.app.exitGame()`);

    const tarzan = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'tarzan-swing');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game._resetRun(12345);
        const startingPosition = { ...game.position };
        const ready = {
            phase: game.phase,
            fixedWorldHeight: game._logicalWidth() * game._renderScale() === game.w,
            settingsCount: game.constructor.getSettingsSchema().length,
            controls: game.constructor.getControlsSchema().map(control => control.defaultBindings[0].code),
        };
        game._startRun(false);
        for (let frame = 0; frame < 150; frame++) {
            if (frame === 60) {
                game._startLegPump();
            }
            game.update(1 / 240);
        }
        game.render();
        window.app.pauseGame();
        window.app.pauseMenu._view = 'settings';
        window.app.pauseMenu._render();
        const settingsPanel = document.getElementById('pause-panel');
        const settingsRect = settingsPanel.getBoundingClientRect();
        const settingsGrid = settingsPanel.querySelector('.settings-groups');
        const settingsLayout = {
            width: settingsRect.width,
            viewportWidth: window.innerWidth,
            columns: getComputedStyle(settingsGrid).gridTemplateColumns.split(' ').length,
            horizontalOverflow: [...settingsPanel.querySelectorAll('.setting-row')]
                .some(row => row.scrollWidth > row.clientWidth + 1),
            displayedMeanGap: Number(settingsPanel.querySelector('[data-key="meanVineGap"]')?.value),
        };
        return {
            ...ready,
            playing: game.phase,
            moved: Math.hypot(
                game.position.x - startingPosition.x,
                game.position.y - startingPosition.y,
            ) > 0.25,
            finite: [game.position.x, game.position.y, game.velocity.x, game.velocity.y,
                game.bodyAngle, game.angularVelocity].every(Number.isFinite),
            vineCount: game.vines.length,
            seed: game.seed,
            legPumpActive: game.legPumpActive,
            hipAngle: game.legHipAngle,
            kneeAngle: game.legKneeAngle,
            legPumpDuration: game.parameters.legPumpDuration,
            meanVineGap: game.parameters.meanVineGap,
            generatedGaps: game.vines.slice(1, 4).map(vine => vine.generatedGap),
            settingsLayout,
        };
    })()`);
    if (tarzan.phase !== 'countdown' || tarzan.playing !== 'playing' || !tarzan.fixedWorldHeight
        || tarzan.settingsCount !== 35 || tarzan.controls.join(',') !== '0,2,KeyR'
        || !tarzan.moved || !tarzan.finite || tarzan.vineCount < 7 || tarzan.seed !== 12345
        || tarzan.settingsLayout.width < 900
        || tarzan.settingsLayout.width > tarzan.settingsLayout.viewportWidth
        || tarzan.settingsLayout.columns < 3 || tarzan.settingsLayout.horizontalOverflow
        || tarzan.settingsLayout.displayedMeanGap !== tarzan.meanVineGap) {
        throw new Error(`Tarzan Swing integration failed: ${JSON.stringify(tarzan)}`);
    }
    await screenshot(client, 'tarzan-settings-responsive.png');
    await client.evaluate(`window.app.pauseMenu.hide(); window.app.resumeGame();`);
    await screenshot(client, 'tarzan-swing-playing.png');
    await client.evaluate(`window.app.exitGame()`);

    const standingSwing = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'standing-swing-jump');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game.phase = 'playing';
        let maximumAngle = Math.abs(game.theta);
        for (let frame = 0; frame < 2100; frame++) {
            const quadrant = (game.theta >= 0 ? 2 : 0) + (game.thetaVelocity >= 0 ? 1 : 0);
            const extend = Boolean((2 >> quadrant) & 1);
            game.desiredArmReach = extend
                ? game.parameters.extendedArmReach
                : game.parameters.pulledArmReach;
            game._integrateAttached(1 / 300);
            maximumAngle = Math.max(maximumAngle, Math.abs(game.theta));
        }
        const arm = game._attachedArmGeometry();
        const pivot = { x: 0, y: 6.55 };
        const seatVector = { x: arm.seat.x - pivot.x, y: arm.seat.y - pivot.y };
        const handVector = { x: arm.hand.x - pivot.x, y: arm.hand.y - pivot.y };
        const gripCross = seatVector.x * handVector.y - seatVector.y * handVector.x;
        game.render();
        const before = game._riderComVelocity();
        game.drag = { start: { x: 460, y: 430 }, current: { x: 620, y: 315 } };
        game._updateDrag = () => {};
        game._releaseFromDrag();
        const launchedRight = game.flightVelocity.x > before.x;
        const launchedUp = game.flightVelocity.y > before.y;
        for (let frame = 0; frame < 90; frame++) game.update(1 / 300);
        game.render();
        return {
            phase: game.phase,
            maximumAngleDegrees: maximumAngle * 180 / Math.PI,
            finite: [game.theta, game.thetaVelocity, game.beta, game.betaVelocity,
                game.flightPosition?.x, game.flightPosition?.y,
                game.flightVelocity?.x, game.flightVelocity?.y].every(Number.isFinite),
            launchedRight,
            launchedUp,
            armDistance: arm.distance,
            maximumArmReach: game.parameters.upperArmLength + game.parameters.forearmLength,
            gripCross,
            settingsCount: game.constructor.getSettingsSchema().length,
            controls: game.constructor.getControlsSchema().map(control => control.defaultBindings[0].code),
            fixedWorldHeight: game._logicalWidth() * game._renderScale() === game.w,
        };
    })()`);
    if (standingSwing.phase !== 'playing' || standingSwing.maximumAngleDegrees < 30
        || !standingSwing.finite || !standingSwing.launchedRight || !standingSwing.launchedUp
        || standingSwing.armDistance > standingSwing.maximumArmReach + 1e-6
        || Math.abs(standingSwing.gripCross) > 1e-8
        || standingSwing.settingsCount !== 26
        || standingSwing.controls.join(',') !== 'KeyR,KeyT,0'
        || !standingSwing.fixedWorldHeight) {
        throw new Error(`Standing Swing Jump integration failed: ${JSON.stringify(standingSwing)}`);
    }
    await client.evaluate(`document.querySelectorAll('.ww-mode-select').forEach(node => node.remove()); window.app.currentGame.flightPosition = null; window.app.currentGame.flightVelocity = null; window.app.currentGame.render();`);
    await screenshot(client, 'standing-swing-jump-playing.png');
    await client.evaluate(`window.app.exitGame()`);

    const wheelie = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'wheelie-balance');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game._resetRun(12345);
        game.phase = 'running';
        game.enginePowerKw = 20;
        const recordAtLowPower = game.getRecordSettings();
        const powerUi = document.querySelector('.wheelie-power-control');
        const powerSlider = powerUi.querySelector('[data-power-slider]');
        powerSlider.value = '115';
        powerSlider.dispatchEvent(new Event('input', { bubbles: true }));
        const recordAtHighPower = game.getRecordSettings();
        for (let frame = 0; frame < 3600 && game.phase !== 'done'; frame++) {
            let throttle = true;
            if (game.hasLifted) {
                const target = 40 * Math.PI / 180;
                throttle = 4 * (target - game._vehicleGeometry().relativePitch)
                    - 1.6 * game.pitchVelocity > 0;
            }
            game._integrate(1 / 300, throttle);
        }
        game.cameraX = Math.max(0, game.position - 3.2);
        game.cameraY = game._terrainAt(game.position).height;
        game.render();
        return {
            phase: game.phase,
            hasLifted: game.hasLifted,
            distance: game.distance,
            finite: [game.position, game.velocity, game.pitch, game.pitchVelocity].every(Number.isFinite),
            powerUi: Boolean(powerUi && getComputedStyle(powerUi).visibility !== 'hidden'),
            displayedPower: powerUi.querySelector('[data-power-value]').textContent,
            recordIgnoresPower: JSON.stringify(recordAtLowPower) === JSON.stringify(recordAtHighPower)
                && !Object.hasOwn(recordAtHighPower, 'enginePowerKw'),
            settingsCount: game.constructor.getSettingsSchema().length,
            throttleBindings: game.constructor.getControlsSchema()[0].defaultBindings.map(binding => binding.code),
            terrainSeed: game.terrainSeed,
            terrainBumps: game.terrainBumps.length,
            terrainVariation: Math.max(...game.terrainBumps.slice(0, 5).map(bump => bump.amplitude))
                - Math.min(...game.terrainBumps.slice(0, 5).map(bump => bump.amplitude)),
        };
    })()`);
    if (!wheelie.hasLifted || wheelie.distance < 100 || !wheelie.finite || !wheelie.powerUi
        || wheelie.displayedPower !== '115 kW'
        || !wheelie.recordIgnoresPower || wheelie.settingsCount !== 16
        || wheelie.terrainSeed !== 12345 || wheelie.terrainBumps < 5 || wheelie.terrainVariation < 0.1
        || wheelie.throttleBindings.join(',') !== 'Space,0') {
        throw new Error(`Wheelie Balance integration failed: ${JSON.stringify(wheelie)}`);
    }
    await screenshot(client, 'wheelie-balance-playing.png');
    const wheelieCrashPreview = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game._resetRun(9876);
        game.phase = 'running';
        game.enginePowerKw = 115;
        for (let frame = 0; frame < 3000; frame++) {
            game._integrate(1 / 300, true);
            if (game.backwardBodyPivot && game.pitch > 2.25) break;
            if (game.phase === 'done') break;
        }
        game.cameraX = Math.max(0, game.position - 3.2);
        game.cameraY = game._terrainAt(game.position).height;
        game.render();
        return {
            phase: game.phase,
            pitch: game.pitch,
            hasBodyPivot: Boolean(game.backwardBodyPivot),
            scoreFrozen: game.distance === game.crashStartDistance,
        };
    })()`);
    if (wheelieCrashPreview.phase !== 'crashing' || wheelieCrashPreview.pitch <= 2.25
        || !wheelieCrashPreview.hasBodyPivot || !wheelieCrashPreview.scoreFrozen) {
        throw new Error(`Wheelie crash preview failed: ${JSON.stringify(wheelieCrashPreview)}`);
    }
    await screenshot(client, 'wheelie-balance-backward-fall.png');
    const wheelieCrashEnd = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        for (let frame = 0; frame < 1200 && game.phase !== 'done'; frame++) {
            game._integrate(1 / 300, false);
        }
        return {
            phase: game.phase,
            pitch: game.pitch,
            roofClearance: game._backwardRoofGroundClearance(),
        };
    })()`);
    if (wheelieCrashEnd.phase !== 'done' || wheelieCrashEnd.pitch <= 2.2
        || wheelieCrashEnd.roofClearance > 0.01) {
        throw new Error(`Wheelie crash completion failed: ${JSON.stringify(wheelieCrashEnd)}`);
    }
    await client.evaluate(`window.app.exitGame()`);

    const dino = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'dino-runner');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const ready = {
            phase: game.phase,
            obstacleCount: game.obstacles.length,
            playButton: game.playButton?.textContent,
        };
        game._startRun();
        game._jump();
        for (let frame = 0; frame < 100; frame++) game.update(1 / 240);
        const airborne = game.dinoY > 0;
        const obstacle = game.obstacles[0];
        game.dinoY = 0;
        game.dinoVelocityY = 0;
        game.distance = obstacle.x - 2.65;
        game._step(1 / 240);
        game.render();
        return {
            ...ready,
            airborne,
            phaseAfterCollision: game.phase,
            replayButton: game.playButton?.textContent,
            finite: [game.distance, game.dinoY, game.dinoVelocityY].every(Number.isFinite),
            settingsCount: game.constructor.getSettingsSchema().length,
        };
    })()`);
    if (dino.phase !== 'ready' || dino.playButton !== 'PLAY' || dino.obstacleCount < 2 || !dino.airborne
        || dino.phaseAfterCollision !== 'gameover' || dino.replayButton !== 'PLAY AGAIN'
        || !dino.finite || dino.settingsCount !== 5) {
        throw new Error(`Dino Runner integration failed: ${JSON.stringify(dino)}`);
    }
    await screenshot(client, 'dino-runner-gameover.png');
    await client.evaluate(`window.app.exitGame()`);

    const robotIsland = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'robot-island');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        game._modeChosenForSession = true;
        game._startMode('1d');
        const record1d = game.getRecordSettings();
        game.phase = 'running';
        for (let frame = 0; frame < 2000 && game.phase !== 'gameover'; frame++) game._step(1 / 240);
        const oneD = { phase: game.phase, elapsed: game.elapsed, position: { ...game.position } };
        game.returnToModeSelector();
        game._modeChosenForSession = true;
        game._startMode('2d');
        const record2d = game.getRecordSettings();
        game.phase = 'running';
        for (let frame = 0; frame < 120; frame++) game._step(1 / 240);
        game.render();
        return {
            selectorCount,
            oneD,
            twoD: { phase: game.phase, position: { ...game.position } },
            record1d,
            record2d,
            supportsModeSelection: game.supportsModeSelection,
        };
    })()`);
    if (robotIsland.selectorCount !== 2 || robotIsland.oneD.phase !== 'gameover'
        || robotIsland.oneD.elapsed <= 0 || robotIsland.twoD.phase !== 'running'
        || robotIsland.record1d.mode !== '1d' || robotIsland.record2d.mode !== '2d'
        || !robotIsland.supportsModeSelection) {
        throw new Error(`Robot Island integration failed: ${JSON.stringify(robotIsland)}`);
    }
    await screenshot(client, 'robot-island-2d.png');
    await client.evaluate(`window.app.exitGame()`);

    const sphericalBowl = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'spherical-bowl-balance');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        game._modeChosenForSession = true;
        game._startMode('balance-point-3d');
        const child = game.child;
        const initial = {
            radialFraction: Math.hypot(child.surfaceState.position.x, child.surfaceState.position.z) / child.parameters.bowlRadius,
            vertical: child.surfaceState.position.y,
            radius: child.parameters.bowlRadius,
            innerBand: child.parameters.bandInnerFraction,
        };
        child._startRun();
        for (let frame = 0; frame < 20; frame++) child._stepSurface(1 / 300);
        const beforeBand = { phase: child.phase, elapsed: child.elapsed };
        const fraction = (child.parameters.bandInnerFraction + child.parameters.bandOuterFraction) / 2;
        const radial = fraction * child.parameters.bowlRadius;
        child.surfaceState.position = {
            x: radial,
            y: -Math.sqrt(child.parameters.bowlRadius ** 2 - radial ** 2),
            z: 0,
        };
        child.surfaceState.velocity = { x: 0, y: 0, z: 0 };
        child.bowl.velocity = { x: 0, z: 0 };
        child.bowl.acceleration = { x: 0, z: 0 };
        child._stepSurface(1 / 300);
        const entered = { phase: child.phase, elapsed: child.elapsed };
        child._stepSurface(1 / 300);
        game.render();
        return { selectorCount, initial, beforeBand, entered, afterEntryElapsed: child.elapsed };
    })()`);
    if (sphericalBowl.selectorCount !== 10 || sphericalBowl.initial.radialFraction !== 0
        || Math.abs(sphericalBowl.initial.vertical + sphericalBowl.initial.radius) > 1e-9
        || sphericalBowl.initial.innerBand < 0.85
        || sphericalBowl.beforeBand.phase !== 'seeking' || sphericalBowl.beforeBand.elapsed !== 0
        || sphericalBowl.entered.phase !== 'timing' || sphericalBowl.entered.elapsed !== 0
        || sphericalBowl.afterEntryElapsed <= 0) {
        throw new Error(`Spherical Bowl timing integration failed: ${JSON.stringify(sphericalBowl)}`);
    }
    await screenshot(client, 'spherical-bowl-starts-at-bottom.png');
    await client.evaluate(`window.app.exitGame()`);

    const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
    if (exceptions.length) throw new Error(`Renderer exceptions: ${JSON.stringify(exceptions.slice(0, 3))}`);

    console.log(JSON.stringify({ menu, modeEscape, nInRow, sudoku: sudokuState, rhythm, goCube, goCube3D, reaction, tarzan, standingSwing, wheelie, dino, robotIsland, sphericalBowl }, null, 2));
} catch (error) {
    console.error(error.stack || error);
    if (stdout.trim()) console.error(`Electron stdout:\n${stdout}`);
    if (stderr.trim()) console.error(`Electron stderr:\n${stderr}`);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
}
