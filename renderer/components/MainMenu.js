/**
 * MainMenu — Renders the game grid and handles search filtering.
 */
import { createGameCard } from './GameCard.js';

export class MainMenu {

    /**
     * @param {import('../core/App.js').App} app
     */
    constructor(app) {
        this.app       = app;
        this.container = document.getElementById('main-menu');
        this.grid      = document.getElementById('game-grid');
        this.search    = document.getElementById('search-input');
        this.counter   = document.getElementById('game-count');
        this._games    = [];

        this.search.addEventListener('input', () => this._filter());
    }

    /**
     * Populate the grid with game cards.
     * @param {Array<Object>} games — list of game configs from GameLoader
     */
    render(games) {
        this._games = games;
        this.counter.textContent = `${games.length} game${games.length !== 1 ? 's' : ''}`;
        this._filter();
    }

    _filter() {
        const query = this.search.value.toLowerCase().trim();
        this.grid.innerHTML = '';

        const filtered = this._games.filter(g => {
            const name = (g.name || g._id || '').toLowerCase();
            const desc = (g.description || '').toLowerCase();
            return name.includes(query) || desc.includes(query);
        });

        if (filtered.length === 0) {
            this.grid.innerHTML = '<div class="no-results">No games found</div>';
            return;
        }

        for (const game of filtered) {
            const card = createGameCard(game, (g) => this.app.launchGame(g));
            this.grid.appendChild(card);
        }
    }

    show() {
        this.container.style.display = '';
        this.search.focus();
    }

    hide() {
        this.container.style.display = 'none';
    }
}
