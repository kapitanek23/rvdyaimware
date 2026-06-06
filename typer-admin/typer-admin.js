(function () {
    const SUPABASE_URL = 'https://bzfcrejxacssugqlalax.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6ZmNyZWp4YWNzc3VncWxhbGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzk4NzcsImV4cCI6MjA4NTgxNTg3N30.cioiRx548NGQDckDR5N_ZweXuSOHMrzV-k7k_9ipfT0';
    const ADMIN_SESSION_KEY = 'rvdyaimware_typer_admin_session';

    const DATA_FILES = {
        matches: '../data/world-cup/matches.csv',
        teams: '../data/world-cup/teams.csv',
        cities: '../data/world-cup/host_cities.csv',
        stages: '../data/world-cup/tournament_stages.csv',
    };

    const state = {
        sessionToken: null,
        matches: [],
        adminRows: new Map(),
        selectedMatchId: null,
        search: '',
    };

    let sb = null;
    let elements = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        elements = {
            adminLayout: document.getElementById('admin-layout'),
            editorEmpty: document.getElementById('editor-empty'),
            editorTitle: document.getElementById('editor-title'),
            form: document.getElementById('admin-result-form'),
            list: document.getElementById('admin-match-list'),
            loginForm: document.getElementById('admin-login-form'),
            loginPanel: document.getElementById('admin-login-panel'),
            loginSubmit: document.getElementById('admin-login-submit'),
            logout: document.getElementById('admin-logout'),
            manualLock: document.getElementById('manual-lock'),
            message: document.getElementById('admin-message'),
            password: document.getElementById('admin-password'),
            refresh: document.getElementById('admin-refresh'),
            saveLock: document.getElementById('save-lock'),
            search: document.getElementById('admin-search'),
            sessionPill: document.getElementById('admin-session-pill'),
            settlementGrid: document.getElementById('settlement-grid'),
            summary: document.getElementById('admin-match-summary'),
        };

        if (window.supabase && window.supabase.createClient) {
            sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }

        bindEvents();
        restoreSession();
        updateAuthView();

        try {
            await loadData();
            renderList();
        } catch (error) {
            showMessage('Nie udało się załadować terminarza.', 'error');
            console.error(error);
        }

        if (state.sessionToken) {
            await loadAdminMatches();
        }
    }

    function bindEvents() {
        elements.loginForm.addEventListener('submit', login);
        elements.logout.addEventListener('click', logout);
        elements.refresh.addEventListener('click', loadAdminMatches);
        elements.saveLock.addEventListener('click', saveLock);
        elements.search.addEventListener('input', function () {
            state.search = elements.search.value.trim().toLowerCase();
            renderList();
        });
        elements.list.addEventListener('click', function (event) {
            const button = event.target.closest('.admin-match-button');
            if (button) {
                selectMatch(Number(button.dataset.matchId));
            }
        });
        elements.form.addEventListener('submit', saveResult);
        elements.form.addEventListener('input', renderSettlementPreview);
    }

    async function loadData() {
        const csvTexts = await Promise.all([
            fetchText(DATA_FILES.matches),
            fetchText(DATA_FILES.teams),
            fetchText(DATA_FILES.cities),
            fetchText(DATA_FILES.stages),
        ]);

        const matchRows = parseCSV(csvTexts[0]);
        const teamsById = indexById(parseCSV(csvTexts[1]));
        const citiesById = indexById(parseCSV(csvTexts[2]));
        const stagesById = indexById(parseCSV(csvTexts[3]));

        state.matches = matchRows.map(function (row) {
            const homeTeam = teamsById.get(row.home_team_id) || null;
            const awayTeam = teamsById.get(row.away_team_id) || null;
            const fallbackTeams = splitFallbackTeams(row.match_label);
            const city = citiesById.get(row.city_id) || null;
            const stage = stagesById.get(row.stage_id) || null;

            return {
                id: Number(row.id),
                matchNumber: Number(row.match_number),
                homeLabel: homeTeam ? homeTeam.team_name : fallbackTeams[0],
                awayLabel: awayTeam ? awayTeam.team_name : fallbackTeams[1],
                homeCode: homeTeam ? homeTeam.fifa_code : '1',
                awayCode: awayTeam ? awayTeam.fifa_code : '2',
                city: city,
                stage: stage,
                kickoffDate: parseKickoff(row.kickoff_at),
                searchText: [
                    row.match_label,
                    homeTeam && homeTeam.team_name,
                    awayTeam && awayTeam.team_name,
                    homeTeam && homeTeam.fifa_code,
                    awayTeam && awayTeam.fifa_code,
                    city && city.city_name,
                    city && city.venue_name,
                    stage && stage.stage_name,
                ].filter(Boolean).join(' ').toLowerCase(),
            };
        }).sort(function (a, b) {
            return a.matchNumber - b.matchNumber;
        });
    }

    async function fetchText(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error('Fetch failed: ' + path);
        }
        return response.text();
    }

    function parseCSV(text) {
        const rows = [];
        let row = [];
        let value = '';
        let quoted = false;

        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            const next = text[index + 1];

            if (char === '"' && quoted && next === '"') {
                value += '"';
                index += 1;
                continue;
            }

            if (char === '"') {
                quoted = !quoted;
                continue;
            }

            if (char === ',' && !quoted) {
                row.push(value);
                value = '';
                continue;
            }

            if ((char === '\n' || char === '\r') && !quoted) {
                if (char === '\r' && next === '\n') {
                    index += 1;
                }
                row.push(value);
                if (row.some(function (cell) { return cell !== ''; })) {
                    rows.push(row);
                }
                row = [];
                value = '';
                continue;
            }

            value += char;
        }

        if (value || row.length) {
            row.push(value);
            rows.push(row);
        }

        const headers = rows.shift() || [];
        return rows.map(function (cells) {
            return headers.reduce(function (record, header, index) {
                record[header] = cells[index] || '';
                return record;
            }, {});
        });
    }

    function indexById(rows) {
        return new Map(rows.map(function (row) {
            return [row.id, row];
        }));
    }

    function splitFallbackTeams(label) {
        const parts = (label || '').split(/\s+vs\s+/i);
        return [
            parts[0] || 'Drużyna 1',
            parts[1] || 'Drużyna 2',
        ];
    }

    function parseKickoff(value) {
        return new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
    }

    async function login(event) {
        event.preventDefault();

        if (!sb) {
            showMessage('Brak połączenia z Supabase.', 'error');
            return;
        }

        elements.loginSubmit.disabled = true;
        elements.loginSubmit.textContent = 'Loguję...';

        const response = await sb.rpc('typer_admin_login', {
            p_password: elements.password.value,
        });

        elements.loginSubmit.disabled = false;
        elements.loginSubmit.textContent = 'Zaloguj';

        if (response.error) {
            showMessage(response.error.message, 'error');
            return;
        }

        const data = Array.isArray(response.data) ? response.data[0] : response.data;
        state.sessionToken = data.session_token;
        localStorage.setItem(ADMIN_SESSION_KEY, state.sessionToken);
        elements.password.value = '';
        updateAuthView();
        await loadAdminMatches();
    }

    function restoreSession() {
        state.sessionToken = localStorage.getItem(ADMIN_SESSION_KEY);
    }

    function logout() {
        state.sessionToken = null;
        state.selectedMatchId = null;
        state.adminRows.clear();
        localStorage.removeItem(ADMIN_SESSION_KEY);
        updateAuthView();
        renderList();
        renderEditor();
    }

    function updateAuthView() {
        const loggedIn = Boolean(state.sessionToken);
        elements.loginPanel.classList.toggle('hidden', loggedIn);
        elements.adminLayout.classList.toggle('hidden', !loggedIn);
        elements.sessionPill.textContent = loggedIn ? 'Admin' : 'Niezalogowany';
        elements.sessionPill.classList.toggle('active', loggedIn);
    }

    async function loadAdminMatches() {
        if (!state.sessionToken || !sb) {
            return;
        }

        const response = await sb.rpc('typer_admin_get_matches', {
            p_session_token: state.sessionToken,
        });

        if (response.error) {
            showMessage(response.error.message, 'error');
            logout();
            return;
        }

        state.adminRows.clear();
        (response.data || []).forEach(function (row) {
            state.adminRows.set(Number(row.match_id), row);
        });

        renderList();
        renderEditor();
    }

    function renderList() {
        const matches = state.matches.filter(function (match) {
            return !state.search || match.searchText.includes(state.search);
        });

        if (matches.length === 0) {
            elements.list.innerHTML = '<div class="empty-state">Brak meczów.</div>';
            return;
        }

        elements.list.innerHTML = matches.map(function (match) {
            const row = state.adminRows.get(match.id) || {};
            const done = Boolean(row.result_1x2);
            const locked = Boolean(row.is_locked);
            return `
                <button class="admin-match-button ${state.selectedMatchId === match.id ? 'active' : ''}" type="button" data-match-id="${match.id}">
                    <span class="admin-match-line">
                        <span>Mecz ${match.matchNumber}</span>
                        <span>${formatDate(match.kickoffDate)}</span>
                    </span>
                    <span class="admin-match-teams">${escapeHtml(match.homeLabel)} - ${escapeHtml(match.awayLabel)}</span>
                    <span class="admin-match-status">
                        ${done ? '<span class="status-chip done">Wynik</span>' : '<span class="status-chip">Brak wyniku</span>'}
                        ${locked ? '<span class="status-chip locked">Lock</span>' : ''}
                    </span>
                </button>
            `;
        }).join('');
    }

    function selectMatch(matchId) {
        state.selectedMatchId = matchId;
        renderList();
        renderEditor();
    }

    function renderEditor() {
        const match = getSelectedMatch();
        const row = match ? state.adminRows.get(match.id) || {} : {};

        elements.editorEmpty.classList.toggle('hidden', Boolean(match));
        elements.form.classList.toggle('hidden', !match);

        if (!match) {
            elements.editorTitle.textContent = 'Wybierz mecz';
            return;
        }

        elements.editorTitle.textContent = 'Mecz ' + match.matchNumber;
        elements.summary.innerHTML = `
            <strong>${escapeHtml(match.homeLabel)} - ${escapeHtml(match.awayLabel)}</strong>
            <span>${formatDate(match.kickoffDate)} · ${escapeHtml(match.city ? match.city.venue_name : '')}</span>
            <span>${escapeHtml(row.lock_reason || 'Typowanie aktywne')}</span>
        `;

        elements.manualLock.checked = Boolean(row.is_locked_manual);
        document.getElementById('lock-reason').value = row.lock_reason || '';

        setField('home_goals', row.home_goals);
        setField('away_goals', row.away_goals);
        setField('home_corners', row.home_corners);
        setField('away_corners', row.away_corners);
        setField('home_cards', row.home_cards);
        setField('away_cards', row.away_cards);
        setField('home_fouls', row.home_fouls);
        setField('away_fouls', row.away_fouls);
        setField('home_shots_on_target', row.home_shots_on_target);
        setField('away_shots_on_target', row.away_shots_on_target);
        setField('home_possession', row.home_possession);
        setField('away_possession', row.away_possession);
        renderSettlementPreview();
    }

    function setField(name, value) {
        const field = elements.form.elements[name];
        field.value = value === null || value === undefined ? '' : value;
    }

    async function saveLock() {
        const match = getSelectedMatch();
        if (!match) {
            return;
        }

        const response = await sb.rpc('typer_admin_set_match_lock', {
            p_session_token: state.sessionToken,
            p_match_id: match.id,
            p_is_locked: elements.manualLock.checked,
            p_lock_reason: document.getElementById('lock-reason').value.trim(),
        });

        if (response.error) {
            showMessage(response.error.message, 'error');
            return;
        }

        showMessage('Blokada zapisana.', 'success');
        await loadAdminMatches();
    }

    async function saveResult(event) {
        event.preventDefault();

        const match = getSelectedMatch();
        if (!match) {
            return;
        }

        const payload = {
            p_session_token: state.sessionToken,
            p_match_id: match.id,
            p_home_goals: numberValue('home_goals'),
            p_away_goals: numberValue('away_goals'),
            p_home_corners: numberValue('home_corners'),
            p_away_corners: numberValue('away_corners'),
            p_home_cards: numberValue('home_cards'),
            p_away_cards: numberValue('away_cards'),
            p_home_fouls: numberValue('home_fouls'),
            p_away_fouls: numberValue('away_fouls'),
            p_home_shots_on_target: numberValue('home_shots_on_target'),
            p_away_shots_on_target: numberValue('away_shots_on_target'),
            p_home_possession: numberValue('home_possession'),
            p_away_possession: numberValue('away_possession'),
        };

        const response = await sb.rpc('typer_admin_save_result', payload);
        if (response.error) {
            showMessage(response.error.message, 'error');
            return;
        }

        showMessage('Wynik zapisany. Ranking przeliczy się automatycznie.', 'success');
        await loadAdminMatches();
    }

    function numberValue(name) {
        const value = elements.form.elements[name].value;
        return value === '' ? null : Number(value);
    }

    function renderSettlementPreview() {
        const values = {
            homeGoals: numberValue('home_goals'),
            awayGoals: numberValue('away_goals'),
            homeCorners: numberValue('home_corners'),
            awayCorners: numberValue('away_corners'),
            homeCards: numberValue('home_cards'),
            awayCards: numberValue('away_cards'),
            homeFouls: numberValue('home_fouls'),
            awayFouls: numberValue('away_fouls'),
            homeShots: numberValue('home_shots_on_target'),
            awayShots: numberValue('away_shots_on_target'),
            homePossession: numberValue('home_possession'),
            awayPossession: numberValue('away_possession'),
        };

        const settlement = [
            ['Rezultat', result1x2(values.homeGoals, values.awayGoals)],
            ['Bramki 2,5', overUnder(sum(values.homeGoals, values.awayGoals), 2.5)],
            ['Rożne 8,5', overUnder(sum(values.homeCorners, values.awayCorners), 8.5)],
            ['Kartki 3,5', overUnder(sum(values.homeCards, values.awayCards), 3.5)],
            ['Więcej fauli', more(values.homeFouls, values.awayFouls)],
            ['Więcej celnych', more(values.homeShots, values.awayShots)],
            ['Obie strzelą', values.homeGoals === null || values.awayGoals === null ? '-' : (values.homeGoals > 0 && values.awayGoals > 0 ? 'Tak' : 'Nie')],
            ['Posiadanie', more(values.homePossession, values.awayPossession)],
        ];

        elements.settlementGrid.innerHTML = settlement.map(function (item) {
            return `<div class="settlement-item"><span>${escapeHtml(item[0])}</span><strong>${escapeHtml(item[1])}</strong></div>`;
        }).join('');
    }

    function result1x2(home, away) {
        if (home === null || away === null) return '-';
        if (home > away) return '1';
        if (home < away) return '2';
        return 'X';
    }

    function sum(a, b) {
        return a === null || b === null ? null : a + b;
    }

    function overUnder(value, line) {
        if (value === null) return '-';
        return value > line ? 'Over' : 'Under';
    }

    function more(home, away) {
        if (home === null || away === null || home === away) return '-';
        return home > away ? '1' : '2';
    }

    function getSelectedMatch() {
        return state.matches.find(function (match) {
            return match.id === state.selectedMatchId;
        });
    }

    function showMessage(message, type) {
        elements.message.textContent = message;
        elements.message.className = 'message-bar ' + type;
        clearTimeout(showMessage.timeout);
        showMessage.timeout = setTimeout(function () {
            elements.message.classList.add('hidden');
        }, 4200);
    }

    function formatDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return 'Termin do ustalenia';
        }

        return new Intl.DateTimeFormat('pl-PL', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}());
