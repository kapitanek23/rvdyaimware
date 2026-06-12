(function () {
    const SUPABASE_URL = 'https://bzfcrejxacssugqlalax.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6ZmNyZWp4YWNzc3VncWxhbGF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMzk4NzcsImV4cCI6MjA4NTgxNTg3N30.cioiRx548NGQDckDR5N_ZweXuSOHMrzV-k7k_9ipfT0';
    const SESSION_KEY = 'rvdyaimware_typer_session';

    const DATA_FILES = {
        matches: '../data/world-cup/matches.csv',
        teams: '../data/world-cup/teams.csv',
        cities: '../data/world-cup/host_cities.csv',
        stages: '../data/world-cup/tournament_stages.csv',
    };

    const MARKETS = [
        {
            field: 'result',
            title: 'Rezultat meczu',
            points: 3,
            options: function () {
                return [
                    { value: '1', label: '1' },
                    { value: 'X', label: 'X' },
                    { value: '2', label: '2' },
                ];
            },
        },
        {
            field: 'goals_ou',
            title: 'Bramki 2,5',
            points: 1,
            options: overUnderOptions,
        },
        {
            field: 'corners_ou',
            title: 'Rzuty rożne 8,5',
            points: 1,
            options: overUnderOptions,
        },
        {
            field: 'cards_ou',
            title: 'Kartki 3,5',
            points: 1,
            options: overUnderOptions,
        },
        {
            field: 'fouls_more',
            title: 'Więcej fauli',
            points: 1,
            options: teamOptions,
        },
        {
            field: 'shots_more',
            title: 'Więcej strzałów celnych',
            points: 1,
            options: teamOptions,
        },
        {
            field: 'both_score',
            title: 'Obie strzelą',
            points: 1,
            options: function () {
                return [
                    { value: 'yes', label: 'Tak' },
                    { value: 'no', label: 'Nie' },
                ];
            },
        },
        {
            field: 'possession_more',
            title: 'Większe posiadanie',
            points: 1,
            options: teamOptions,
        },
    ];

    const TIE_AWARDS_ALL_FIELDS = new Set(['fouls_more', 'shots_more', 'possession_more']);

    const state = {
        authMode: 'login',
        session: null,
        matches: [],
        matchStatuses: new Map(),
        settlements: new Map(),
        predictions: new Map(),
        drafts: new Map(),
        expandedMatchId: null,
        filters: {
            search: '',
            stage: 'all',
            group: 'all',
            saved: 'all',
        },
    };

    let sb = null;
    let elements = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        elements = {
            authForm: document.getElementById('auth-form'),
            authSubmit: document.getElementById('auth-submit'),
            authTabs: document.querySelectorAll('[data-auth-mode]'),
            closeInfo: document.getElementById('close-info'),
            closePlayerProfile: document.getElementById('close-player-profile'),
            currentNick: document.getElementById('current-nick'),
            groupFilter: document.getElementById('group-filter'),
            infoButton: document.getElementById('info-button'),
            infoModal: document.getElementById('info-modal'),
            logoutButton: document.getElementById('logout-button'),
            matchesCount: document.getElementById('matches-count'),
            matchesList: document.getElementById('matches-list'),
            messageBar: document.getElementById('message-bar'),
            nickInput: document.getElementById('nick-input'),
            passwordInput: document.getElementById('password-input'),
            playerProfileBody: document.getElementById('player-profile-body'),
            playerProfileModal: document.getElementById('player-profile-modal'),
            playerProfileTitle: document.getElementById('player-profile-title'),
            rankingList: document.getElementById('ranking-list'),
            refreshRanking: document.getElementById('refresh-ranking'),
            savedFilter: document.getElementById('saved-filter'),
            searchInput: document.getElementById('search-input'),
            sessionPill: document.getElementById('session-pill'),
            stageFilter: document.getElementById('stage-filter'),
            userCard: document.getElementById('user-card'),
        };

        if (window.supabase && window.supabase.createClient) {
            sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }

        bindEvents();
        restoreSession();
        updateAuthView();

        try {
            await loadData();
            renderFilters();
            renderMatches();
        } catch (error) {
            showMessage('Nie udało się załadować terminarza z CSV.', 'error');
            elements.matchesList.innerHTML = '<div class="empty-state">Brak danych meczów.</div>';
            console.error(error);
        }

        await loadPredictions();
        await loadMatchStatuses();
        await loadMatchSettlements();
        await loadRanking();
        renderMatches();
    }

    function bindEvents() {
        elements.authForm.addEventListener('submit', handleAuthSubmit);
        elements.authTabs.forEach(function (button) {
            button.addEventListener('click', function () {
                setAuthMode(button.dataset.authMode);
            });
        });
        elements.logoutButton.addEventListener('click', logout);
        elements.refreshRanking.addEventListener('click', refreshRankingAndSettlements);
        elements.infoButton.addEventListener('click', openInfoModal);
        elements.closeInfo.addEventListener('click', closeInfoModal);
        elements.closePlayerProfile.addEventListener('click', closePlayerProfileModal);
        elements.infoModal.addEventListener('click', function (event) {
            if (event.target === elements.infoModal) {
                closeInfoModal();
            }
        });
        elements.playerProfileModal.addEventListener('click', function (event) {
            if (event.target === elements.playerProfileModal) {
                closePlayerProfileModal();
            }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                if (!elements.infoModal.classList.contains('hidden')) {
                    closeInfoModal();
                }
                if (!elements.playerProfileModal.classList.contains('hidden')) {
                    closePlayerProfileModal();
                }
            }
        });

        elements.rankingList.addEventListener('click', function (event) {
            const profileButton = event.target.closest('[data-player-nick]');
            if (profileButton) {
                openPlayerProfile(profileButton.dataset.playerNick);
            }
        });

        elements.searchInput.addEventListener('input', function () {
            state.filters.search = elements.searchInput.value.trim().toLowerCase();
            renderMatches();
        });
        elements.stageFilter.addEventListener('change', function () {
            state.filters.stage = elements.stageFilter.value;
            renderMatches();
        });
        elements.groupFilter.addEventListener('change', function () {
            state.filters.group = elements.groupFilter.value;
            renderMatches();
        });
        elements.savedFilter.addEventListener('change', function () {
            state.filters.saved = elements.savedFilter.value;
            renderMatches();
        });

        elements.matchesList.addEventListener('click', function (event) {
            const pickButton = event.target.closest('.pick-option');
            if (pickButton) {
                handlePickClick(pickButton);
                return;
            }

            const saveButton = event.target.closest('.save-button');
            if (saveButton) {
                savePrediction(Number(saveButton.dataset.matchId));
                return;
            }

            const matchHeader = event.target.closest('.match-header');
            const matchCard = matchHeader && matchHeader.closest('.match-card');
            if (matchCard) {
                toggleMatch(Number(matchCard.dataset.matchId));
            }
        });
    }

    function openInfoModal() {
        elements.infoModal.classList.remove('hidden');
    }

    function closeInfoModal() {
        elements.infoModal.classList.add('hidden');
    }

    function closePlayerProfileModal() {
        elements.playerProfileModal.classList.add('hidden');
    }

    async function openPlayerProfile(nick) {
        const playerNick = nick || '';
        elements.playerProfileTitle.textContent = 'Profil: ' + playerNick;
        elements.playerProfileBody.innerHTML = '<div class="empty-state">Ładowanie profilu...</div>';
        elements.playerProfileModal.classList.remove('hidden');

        if (!sb) {
            elements.playerProfileBody.innerHTML = '<div class="empty-state">Brak połączenia z Supabase.</div>';
            return;
        }

        const response = await sb.rpc('typer_get_player_profile', {
            p_nick: playerNick,
        });

        if (response.error) {
            elements.playerProfileBody.innerHTML = '<div class="empty-state">Profil gracza czeka na aktualizację bazy.</div>';
            console.warn('Typer player profile unavailable:', response.error.message);
            return;
        }

        renderPlayerProfile(response.data || []);
    }

    function renderPlayerProfile(rows) {
        if (rows.length === 0) {
            elements.playerProfileBody.innerHTML = '<div class="empty-state">Ten gracz nie ma jeszcze zapisanych typów.</div>';
            return;
        }

        elements.playerProfileBody.innerHTML = `
            <p class="profile-note">Typy dla meczów, które nie są jeszcze zablokowane, pozostają ukryte do deadline’u.</p>
            <div class="profile-matches">
                ${rows.map(renderPlayerProfileMatch).join('')}
            </div>
        `;
    }

    function renderPlayerProfileMatch(row) {
        const matchId = Number(row.match_id);
        const match = getMatchById(matchId) || createFallbackMatch(matchId);
        const picks = row.picks || {};
        const visible = Boolean(row.is_visible);
        const savedAt = row.saved_at ? formatDate(new Date(row.saved_at)) : 'Brak daty zapisu';
        const lockText = row.lock_reason || 'Typy ukryte do blokady meczu.';

        return `
            <article class="profile-match-card">
                <div class="profile-match-top">
                    <div>
                        <h3>${escapeHtml(match.homeLabel)} vs ${escapeHtml(match.awayLabel)}</h3>
                        <p>${escapeHtml(formatDate(match.kickoffDate))}</p>
                    </div>
                    <span>Zapisano: ${escapeHtml(savedAt)}</span>
                </div>
                ${visible ? `
                    <div class="profile-picks-grid">
                        ${MARKETS.map(function (market) {
                            return renderProfilePick(match, market, picks);
                        }).join('')}
                    </div>
                ` : `<div class="profile-hidden">${escapeHtml(lockText)}</div>`}
            </article>
        `;
    }

    function renderProfilePick(match, market, picks) {
        const value = picks[market.field];
        return `
            <div class="profile-pick">
                <span>${escapeHtml(market.title)}</span>
                <strong>${escapeHtml(getPickLabel(match, market, value))}</strong>
            </div>
        `;
    }

    function getPickLabel(match, market, value) {
        if (!value) {
            return 'Brak typu';
        }

        const option = market.options(match).find(function (item) {
            return item.value === value;
        });

        return option ? option.label : value;
    }

    async function loadData() {
        const csvTexts = await Promise.all([
            fetchText(DATA_FILES.matches),
            fetchText(DATA_FILES.teams),
            fetchText(DATA_FILES.cities),
            fetchText(DATA_FILES.stages),
        ]);

        const matchRows = parseCSV(csvTexts[0]);
        const teams = parseCSV(csvTexts[1]);
        const cities = parseCSV(csvTexts[2]);
        const stages = parseCSV(csvTexts[3]);

        const teamsById = indexById(teams);
        const citiesById = indexById(cities);
        const stagesById = indexById(stages);

        state.matches = matchRows.map(function (row) {
            const homeTeam = teamsById.get(row.home_team_id) || null;
            const awayTeam = teamsById.get(row.away_team_id) || null;
            const city = citiesById.get(row.city_id) || null;
            const stage = stagesById.get(row.stage_id) || null;
            const fallbackTeams = splitFallbackTeams(row.match_label);

            return {
                id: Number(row.id),
                matchNumber: Number(row.match_number),
                homeTeam: homeTeam,
                awayTeam: awayTeam,
                homeLabel: homeTeam ? homeTeam.team_name : fallbackTeams[0],
                awayLabel: awayTeam ? awayTeam.team_name : fallbackTeams[1],
                city: city,
                stage: stage,
                kickoffAt: row.kickoff_at,
                kickoffDate: parseKickoff(row.kickoff_at),
                label: row.match_label,
                group: getGroup(row, homeTeam, awayTeam),
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
            return a.kickoffDate - b.kickoffDate;
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

    function getGroup(row, homeTeam, awayTeam) {
        const fromLabel = (row.match_label || '').match(/Group\s+([A-L])/i);
        return (fromLabel && fromLabel[1]) || (homeTeam && homeTeam.group_letter) || (awayTeam && awayTeam.group_letter) || '';
    }

    function parseKickoff(value) {
        const normalized = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
        return new Date(normalized);
    }

    function renderFilters() {
        const stages = new Map();
        const groups = new Set();

        state.matches.forEach(function (match) {
            if (match.stage) {
                stages.set(match.stage.id, match.stage);
            }
            if (match.group) {
                groups.add(match.group);
            }
        });

        Array.from(stages.values())
            .sort(function (a, b) { return Number(a.stage_order) - Number(b.stage_order); })
            .forEach(function (stage) {
                const option = document.createElement('option');
                option.value = stage.id;
                option.textContent = translateStage(stage.stage_name);
                elements.stageFilter.appendChild(option);
            });

        Array.from(groups)
            .sort()
            .forEach(function (group) {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = 'Grupa ' + group;
                elements.groupFilter.appendChild(option);
            });
    }

    function renderMatches() {
        const filtered = getFilteredMatches();
        elements.matchesCount.textContent = filtered.length;

        if (filtered.length === 0) {
            elements.matchesList.innerHTML = '<div class="empty-state">Brak meczów dla wybranych filtrów.</div>';
            return;
        }

        elements.matchesList.innerHTML = filtered.map(renderMatchCard).join('');
    }

    function getFilteredMatches() {
        return state.matches.filter(function (match) {
            const hasPrediction = state.predictions.has(match.id);

            if (state.filters.search && !match.searchText.includes(state.filters.search)) {
                return false;
            }
            if (state.filters.stage !== 'all' && (!match.stage || match.stage.id !== state.filters.stage)) {
                return false;
            }
            if (state.filters.group !== 'all' && match.group !== state.filters.group) {
                return false;
            }
            if (state.filters.saved === 'saved' && !hasPrediction) {
                return false;
            }
            if (state.filters.saved === 'empty' && hasPrediction) {
                return false;
            }

            return true;
        });
    }

    function getMatchById(matchId) {
        return state.matches.find(function (match) {
            return match.id === matchId;
        }) || null;
    }

    function createFallbackMatch(matchId) {
        return {
            id: matchId,
            matchNumber: matchId,
            homeTeam: null,
            awayTeam: null,
            homeLabel: 'Drużyna 1',
            awayLabel: 'Drużyna 2',
            kickoffDate: null,
        };
    }

    function renderMatchCard(match) {
        const saved = state.predictions.get(match.id);
        const draft = getDraft(match.id);
        const expanded = state.expandedMatchId === match.id;
        const lockStatus = getMatchLockStatus(match);
        const settlement = state.settlements.get(match.id);
        const locked = lockStatus.isLocked;
        const changed = JSON.stringify(draft) !== JSON.stringify(saved ? saved.picks : {});
        const selectedCount = Object.keys(draft).length;
        const canSave = Boolean(state.session && selectedCount > 0 && changed && !locked);
        const homeCode = match.homeTeam ? match.homeTeam.fifa_code : '1';
        const awayCode = match.awayTeam ? match.awayTeam.fifa_code : '2';
        const stageName = match.stage ? translateStage(match.stage.stage_name) : 'Etap';
        const cityText = match.city ? match.city.city_name + ', ' + match.city.country : 'Miasto do ustalenia';
        const venueText = match.city ? match.city.venue_name : '';
        const saveText = locked ? lockStatus.reason : (saved ? 'Zapisano ' + selectedCount + '/8' : selectedCount + '/8 wybranych');

        return `
            <article class="match-card ${expanded ? 'expanded' : ''} ${locked ? 'locked' : ''}" data-match-id="${match.id}" aria-expanded="${expanded}">
                <header class="match-header">
                    <div>
                        <div class="match-kicker">
                            <span class="tag">Mecz ${match.matchNumber}</span>
                            <span class="tag">${escapeHtml(stageName)}</span>
                            ${match.group ? `<span class="tag">Grupa ${escapeHtml(match.group)}</span>` : ''}
                            ${settlement ? '<span class="tag settled-tag">Rozliczony</span>' : ''}
                            ${locked ? `<span class="tag lock-tag">${escapeHtml(lockStatus.reason)}</span>` : ''}
                        </div>
                        <div class="match-teams">
                            <div class="team-line">
                                <span class="team-number">1</span>
                                <span class="team-name">${escapeHtml(match.homeLabel)}</span>
                                <span class="team-code">${escapeHtml(homeCode)}</span>
                            </div>
                            <div class="team-line">
                                <span class="team-number">2</span>
                                <span class="team-name">${escapeHtml(match.awayLabel)}</span>
                                <span class="team-code">${escapeHtml(awayCode)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="match-meta">
                        <span>${formatDate(match.kickoffDate)}</span>
                        <span>${escapeHtml(cityText)}</span>
                        <span>${escapeHtml(venueText)}</span>
                        <span class="expand-indicator" aria-hidden="true">${expanded ? '▲' : '▼'}</span>
                    </div>
                </header>
                ${expanded ? `<div class="match-body">
                    <div class="events-grid">
                        ${MARKETS.map(function (market) {
                            return renderMarket(match, market, draft, locked, settlement);
                        }).join('')}
                    </div>
                    <div class="match-actions">
                        <span class="save-state">${escapeHtml(saveText)}</span>
                        <button class="save-button" type="button" data-match-id="${match.id}" ${canSave ? '' : 'disabled'}>
                            Zapisz typy
                        </button>
                    </div>
                </div>` : ''}
            </article>
        `;
    }

    function renderMarket(match, market, draft, locked, settlement) {
        const options = market.options(match);
        const correctValue = settlement && settlement.correctPicks ? settlement.correctPicks[market.field] : null;
        const marketStats = settlement && settlement.pickStats ? settlement.pickStats[market.field] : null;
        return `
            <div class="event-row">
                <div class="event-title">
                    <span>${escapeHtml(market.title)}</span>
                    <span class="event-points">${market.points} pkt</span>
                </div>
                <div class="pick-options" style="--option-count: ${options.length}">
                    ${options.map(function (option) {
                        const selected = draft[market.field] === option.value;
                        const correct = isCorrectOption(market.field, option.value, correctValue);
                        const wrong = Boolean(settlement && selected && correctValue && !correct);
                        const optionStats = marketStats && marketStats.options ? marketStats.options[option.value] : null;
                        const optionClasses = [
                            'pick-option',
                            selected ? 'selected' : '',
                            correct ? 'correct-option' : '',
                            wrong ? 'wrong-option' : '',
                        ].filter(Boolean).join(' ');
                        return `
                            <button
                                class="${optionClasses}"
                                type="button"
                                data-match-id="${match.id}"
                                data-field="${market.field}"
                                data-value="${option.value}"
                                title="${escapeHtml(option.title || option.label)}"
                                ${locked ? 'disabled' : ''}>
                                <span class="pick-label">${escapeHtml(option.label)}</span>
                                ${correct ? '<span class="correct-marker">✓ poprawne</span>' : ''}
                                ${settlement ? `<span class="pick-share">${escapeHtml(formatPickShare(optionStats))}</span>` : ''}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function isCorrectOption(field, value, correctValue) {
        if (!correctValue) {
            return false;
        }
        if (correctValue === 'X' && TIE_AWARDS_ALL_FIELDS.has(field)) {
            return value === '1' || value === '2';
        }
        return value === correctValue;
    }

    function formatPickShare(optionStats) {
        const percent = optionStats && Number.isFinite(Number(optionStats.percent)) ? Number(optionStats.percent) : 0;
        const rounded = Math.round(percent * 10) / 10;
        const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
        return text + '% typów';
    }

    function getDraft(matchId) {
        if (!state.drafts.has(matchId)) {
            const saved = state.predictions.get(matchId);
            state.drafts.set(matchId, Object.assign({}, saved ? saved.picks : {}));
        }
        return state.drafts.get(matchId);
    }

    function overUnderOptions() {
        return [
            { value: 'over', label: 'Over' },
            { value: 'under', label: 'Under' },
        ];
    }

    function teamOptions(match) {
        const homeCode = match.homeTeam ? match.homeTeam.fifa_code : '1';
        const awayCode = match.awayTeam ? match.awayTeam.fifa_code : '2';
        return [
            { value: '1', label: '1 ' + homeCode, title: match.homeLabel },
            { value: '2', label: '2 ' + awayCode, title: match.awayLabel },
        ];
    }

    function handlePickClick(button) {
        if (!state.session) {
            showMessage('Najpierw zaloguj się albo zarejestruj nick.', 'error');
            return;
        }

        const matchId = Number(button.dataset.matchId);
        const match = state.matches.find(function (item) { return item.id === matchId; });
        const lockStatus = getMatchLockStatus(match);
        if (lockStatus.isLocked) {
            showMessage(lockStatus.reason, 'error');
            return;
        }

        const draft = getDraft(matchId);
        const field = button.dataset.field;
        const value = button.dataset.value;

        if (draft[field] === value) {
            delete draft[field];
        } else {
            draft[field] = value;
        }

        renderMatches();
    }

    async function savePrediction(matchId) {
        if (!state.session) {
            showMessage('Najpierw zaloguj się albo zarejestruj nick.', 'error');
            return;
        }

        const picks = getDraft(matchId);
        if (Object.keys(picks).length === 0) {
            showMessage('Wybierz przynajmniej jedno zdarzenie.', 'error');
            return;
        }

        const match = state.matches.find(function (item) { return item.id === matchId; });
        const lockStatus = getMatchLockStatus(match);
        if (lockStatus.isLocked) {
            showMessage(lockStatus.reason, 'error');
            renderMatches();
            return;
        }

        if (!sb) {
            showMessage('Brak połączenia z Supabase.', 'error');
            return;
        }

        const saveButton = document.querySelector('.save-button[data-match-id="' + matchId + '"]');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = 'Zapisywanie...';
        }

        const response = await sb.rpc('typer_save_prediction', {
            p_session_token: state.session.sessionToken,
            p_match_id: matchId,
            p_picks: picks,
        });

        if (response.error) {
            showMessage(response.error.message, 'error');
            await loadMatchStatuses();
            renderMatches();
            return;
        }

        const saved = Array.isArray(response.data) ? response.data[0] : response.data;
        state.predictions.set(matchId, {
            picks: saved.picks || picks,
            updatedAt: saved.updated_at,
        });
        state.drafts.set(matchId, Object.assign({}, saved.picks || picks));
        showMessage('Typy zapisane.', 'success');
        renderMatches();
        loadRanking();
    }

    function toggleMatch(matchId) {
        state.expandedMatchId = state.expandedMatchId === matchId ? null : matchId;
        renderMatches();

        if (state.expandedMatchId) {
            window.requestAnimationFrame(function () {
                const card = document.querySelector('.match-card[data-match-id="' + state.expandedMatchId + '"]');
                const body = card && card.querySelector('.match-body');
                const target = body || card;
                if (target) {
                    const targetRect = target.getBoundingClientRect();
                    const comfortablyVisible = targetRect.top >= 130 && targetRect.top <= window.innerHeight - 120;
                    if (!comfortablyVisible) {
                        const offsetTop = targetRect.top + window.pageYOffset - 120;
                        window.scrollTo({ top: Math.max(0, offsetTop), behavior: 'smooth' });
                    }
                }
            });
        }
    }

    function getMatchLockStatus(match) {
        if (!match) {
            return { isLocked: false, reason: '' };
        }

        const serverStatus = state.matchStatuses.get(match.id);
        if (serverStatus && serverStatus.isLocked) {
            return { isLocked: true, reason: serverStatus.lockReason || 'Typowanie zablokowane.' };
        }

        if (isAutoLocked(match)) {
            return { isLocked: true, reason: 'Typowanie zamknięte 5 minut przed startem meczu.' };
        }

        return { isLocked: false, reason: '' };
    }

    function isAutoLocked(match) {
        if (!match.kickoffDate || Number.isNaN(match.kickoffDate.getTime())) {
            return false;
        }

        return Date.now() >= match.kickoffDate.getTime() - 5 * 60 * 1000;
    }

    async function handleAuthSubmit(event) {
        event.preventDefault();

        if (!sb) {
            showMessage('Brak połączenia z Supabase.', 'error');
            return;
        }

        const nick = elements.nickInput.value.trim();
        const password = elements.passwordInput.value;
        const fn = state.authMode === 'register' ? 'typer_register' : 'typer_login';

        elements.authSubmit.disabled = true;
        elements.authSubmit.textContent = state.authMode === 'register' ? 'Rejestruję...' : 'Loguję...';

        const response = await sb.rpc(fn, {
            p_nick: nick,
            p_password: password,
        });

        elements.authSubmit.disabled = false;
        elements.authSubmit.textContent = state.authMode === 'register' ? 'Zarejestruj' : 'Zaloguj';

        if (response.error) {
            showMessage(response.error.message, 'error');
            return;
        }

        const sessionData = Array.isArray(response.data) ? response.data[0] : response.data;
        if (state.authMode === 'register') {
            elements.passwordInput.value = '';
            showMessage('Rejestracja wysłana. Konto będzie aktywne po zatwierdzeniu przez administratora.', 'success');
            setAuthMode('login');
            return;
        }

        if (!sessionData || !sessionData.session_token) {
            showMessage('Nie udało się utworzyć sesji. Spróbuj zalogować się ponownie.', 'error');
            return;
        }

        state.session = {
            playerId: sessionData.player_id,
            nick: sessionData.nick,
            sessionToken: sessionData.session_token,
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
        elements.passwordInput.value = '';
        showMessage('Zalogowano.', 'success');
        updateAuthView();
        await loadPredictions();
        await loadRanking();
        renderMatches();
    }

    function setAuthMode(mode) {
        state.authMode = mode;
        elements.authTabs.forEach(function (button) {
            button.classList.toggle('active', button.dataset.authMode === mode);
        });
        elements.authSubmit.textContent = mode === 'register' ? 'Zarejestruj' : 'Zaloguj';
        elements.passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    }

    function restoreSession() {
        try {
            const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
            if (stored && stored.sessionToken && stored.nick) {
                state.session = stored;
            }
        } catch (_) {
            localStorage.removeItem(SESSION_KEY);
        }
    }

    function logout() {
        state.session = null;
        state.predictions.clear();
        state.drafts.clear();
        localStorage.removeItem(SESSION_KEY);
        updateAuthView();
        renderMatches();
        loadRanking();
        showMessage('Wylogowano.', 'success');
    }

    function updateAuthView() {
        const loggedIn = Boolean(state.session);
        elements.userCard.classList.toggle('hidden', !loggedIn);
        elements.logoutButton.classList.toggle('hidden', !loggedIn);
        elements.authForm.classList.toggle('hidden', loggedIn);

        if (loggedIn) {
            elements.currentNick.textContent = state.session.nick;
            elements.sessionPill.textContent = state.session.nick;
            elements.sessionPill.classList.add('active');
        } else {
            elements.currentNick.textContent = '';
            elements.sessionPill.textContent = 'Niezalogowany';
            elements.sessionPill.classList.remove('active');
        }
    }

    async function loadPredictions() {
        state.predictions.clear();
        state.drafts.clear();

        if (!state.session || !sb) {
            return;
        }

        const response = await sb.rpc('typer_my_predictions', {
            p_session_token: state.session.sessionToken,
        });

        if (response.error) {
            localStorage.removeItem(SESSION_KEY);
            state.session = null;
            updateAuthView();
            showMessage(response.error.message, 'error');
            return;
        }

        (response.data || []).forEach(function (prediction) {
            state.predictions.set(Number(prediction.match_id), {
                picks: prediction.picks || {},
                updatedAt: prediction.updated_at,
            });
        });
    }

    async function loadMatchStatuses() {
        state.matchStatuses.clear();

        if (!sb) {
            return;
        }

        const response = await sb.rpc('typer_get_match_statuses');
        if (response.error) {
            console.warn('Typer match statuses unavailable:', response.error.message);
            return;
        }

        (response.data || []).forEach(function (status) {
            state.matchStatuses.set(Number(status.match_id), {
                kickoffAt: status.kickoff_at,
                isLocked: Boolean(status.is_locked),
                lockReason: status.lock_reason || '',
            });
        });
    }

    async function loadMatchSettlements() {
        state.settlements.clear();

        if (!sb) {
            return;
        }

        const response = await sb.rpc('typer_get_match_settlements');
        if (response.error) {
            console.warn('Typer match settlements unavailable:', response.error.message);
            return;
        }

        (response.data || []).forEach(function (settlement) {
            state.settlements.set(Number(settlement.match_id), {
                correctPicks: settlement.correct_picks || {},
                pickStats: settlement.pick_stats || {},
                updatedAt: settlement.updated_at,
            });
        });
    }

    async function refreshRankingAndSettlements() {
        await loadMatchSettlements();
        await loadRanking();
        renderMatches();
    }

    async function loadRanking() {
        if (!sb) {
            elements.rankingList.innerHTML = '<div class="empty-state">Brak połączenia z Supabase.</div>';
            return;
        }

        const response = await sb.rpc('typer_get_ranking');
        if (response.error) {
            elements.rankingList.innerHTML = '<div class="empty-state">Ranking czeka na konfigurację bazy.</div>';
            console.warn('Typer ranking unavailable:', response.error.message);
            return;
        }

        const ranking = response.data || [];
        if (ranking.length === 0) {
            elements.rankingList.innerHTML = '<div class="empty-state">Ranking jest pusty.</div>';
            return;
        }

        elements.rankingList.innerHTML = ranking.map(function (row) {
            return `
                <button class="ranking-row ranking-button" type="button" data-player-nick="${escapeHtml(row.nick)}">
                    <span class="ranking-place">${row.place}</span>
                    <div>
                        <div class="ranking-nick">${escapeHtml(row.nick)}</div>
                        <div class="ranking-meta">${row.saved_matches || 0} zapisanych, ${row.settled_matches || 0} rozliczonych</div>
                    </div>
                    <strong class="ranking-points">${row.points || 0}</strong>
                </button>
            `;
        }).join('');
    }

    function showMessage(message, type) {
        elements.messageBar.textContent = message;
        elements.messageBar.className = 'message-bar ' + type;
        clearTimeout(showMessage.timeout);
        showMessage.timeout = setTimeout(function () {
            elements.messageBar.classList.add('hidden');
        }, 4200);
    }

    function translateStage(stageName) {
        const stages = {
            'Group Stage': 'Faza grupowa',
            'Round of 32': '1/16 finału',
            'Round of 16': '1/8 finału',
            Quarterfinals: 'Ćwierćfinał',
            Semifinals: 'Półfinał',
            'Third Place Playoff': 'Mecz o 3. miejsce',
            Final: 'Finał',
        };
        return stages[stageName] || stageName;
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
