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
    const HISTORY_COLORS = ['#6ee7b7', '#f4c95d', '#93c5fd', '#fca5a5', '#c4b5fd', '#fdba74', '#67e8f9', '#f9a8d4', '#bef264', '#d8b4fe'];

    const state = {
        authMode: 'login',
        session: null,
        matches: [],
        matchStatuses: new Map(),
        settlements: new Map(),
        predictions: new Map(),
        drafts: new Map(),
        expandedMatchId: null,
        rankingHistoryRows: [],
        rankingHistorySelectedPlayers: new Set(),
        rankingHistoryFiltersReady: false,
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
            closeRankingHistory: document.getElementById('close-ranking-history'),
            currentNick: document.getElementById('current-nick'),
            groupFilter: document.getElementById('group-filter'),
            infoButton: document.getElementById('info-button'),
            infoModal: document.getElementById('info-modal'),
            logoutButton: document.getElementById('logout-button'),
            matchesCount: document.getElementById('matches-count'),
            matchesList: document.getElementById('matches-list'),
            messageBar: document.getElementById('message-bar'),
            nickInput: document.getElementById('nick-input'),
            openRankingHistory: document.getElementById('open-ranking-history'),
            passwordInput: document.getElementById('password-input'),
            playerProfileBody: document.getElementById('player-profile-body'),
            playerProfileModal: document.getElementById('player-profile-modal'),
            playerProfileTitle: document.getElementById('player-profile-title'),
            rankingHistoryBody: document.getElementById('ranking-history-body'),
            rankingHistoryModal: document.getElementById('ranking-history-modal'),
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
        elements.openRankingHistory.addEventListener('click', openRankingHistoryModal);
        elements.closeRankingHistory.addEventListener('click', closeRankingHistoryModal);
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
        elements.rankingHistoryModal.addEventListener('click', function (event) {
            if (event.target === elements.rankingHistoryModal) {
                closeRankingHistoryModal();
            }
        });
        elements.rankingHistoryBody.addEventListener('click', handleRankingHistoryClick);
        elements.rankingHistoryBody.addEventListener('change', handleRankingHistoryChange);
        elements.rankingHistoryBody.addEventListener('mouseover', handleRankingHistoryTooltipShow);
        elements.rankingHistoryBody.addEventListener('mousemove', handleRankingHistoryTooltipMove);
        elements.rankingHistoryBody.addEventListener('mouseout', handleRankingHistoryTooltipHide);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                if (!elements.infoModal.classList.contains('hidden')) {
                    closeInfoModal();
                }
                if (!elements.playerProfileModal.classList.contains('hidden')) {
                    closePlayerProfileModal();
                }
                if (!elements.rankingHistoryModal.classList.contains('hidden')) {
                    closeRankingHistoryModal();
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

    function closeRankingHistoryModal() {
        elements.rankingHistoryModal.classList.add('hidden');
        hideRankingHistoryTooltip();
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

        await loadMatchSettlements();

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

    async function openRankingHistoryModal() {
        elements.rankingHistoryBody.innerHTML = '<div class="empty-state">Ładowanie historii...</div>';
        elements.rankingHistoryModal.classList.remove('hidden');

        if (!sb) {
            elements.rankingHistoryBody.innerHTML = '<div class="empty-state">Brak połączenia z Supabase.</div>';
            return;
        }

        const response = await sb.rpc('typer_get_ranking_history');
        if (response.error) {
            elements.rankingHistoryBody.innerHTML = '<div class="empty-state">Historia rankingu czeka na aktualizację bazy.</div>';
            console.warn('Typer ranking history unavailable:', response.error.message);
            return;
        }

        state.rankingHistoryRows = response.data || [];
        state.rankingHistoryFiltersReady = false;
        renderRankingHistory();
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
        const settlement = state.settlements.get(matchId);
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
                            return renderProfilePick(match, market, picks, settlement);
                        }).join('')}
                    </div>
                ` : `<div class="profile-hidden">${escapeHtml(lockText)}</div>`}
            </article>
        `;
    }

    function renderProfilePick(match, market, picks, settlement) {
        const value = picks[market.field];
        const status = getProfilePickStatus(market.field, value, settlement);
        const statusLabel = status === 'correct' ? 'Poprawny typ' : (status === 'wrong' ? 'Błędny typ' : '');
        const statusIcon = status === 'correct' ? '✓' : (status === 'wrong' ? '×' : '');
        const classes = ['profile-pick', status ? 'profile-pick-' + status : ''].filter(Boolean).join(' ');
        return `
            <div class="${classes}">
                <span>${escapeHtml(market.title)}</span>
                <strong>${escapeHtml(getPickLabel(match, market, value))}</strong>
                ${status ? `<em title="${escapeHtml(statusLabel)}">${escapeHtml(statusIcon)}</em>` : ''}
            </div>
        `;
    }

    function getProfilePickStatus(field, value, settlement) {
        const correctValue = settlement && settlement.correctPicks ? settlement.correctPicks[field] : null;
        if (!value || !correctValue) {
            return '';
        }
        return isCorrectOption(field, value, correctValue) ? 'correct' : 'wrong';
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

    function renderRankingHistory() {
        const rows = state.rankingHistoryRows;
        if (rows.length === 0) {
            elements.rankingHistoryBody.innerHTML = '<div class="empty-state">Historia jest jeszcze pusta.</div>';
            return;
        }

        const days = getRankingHistoryDays(rows);
        const pointsByPlayer = getRankingHistoryPlayers(rows);
        const players = getRankingHistorySortedPlayers(days, pointsByPlayer);
        syncRankingHistorySelection(players);
        const selectedPlayers = players.filter(function (player) {
            return state.rankingHistorySelectedPlayers.has(player);
        });
        const statsByPlayer = getRankingHistoryStats(days, players, pointsByPlayer);
        const colorByPlayer = getRankingHistoryColorMap(players);
        const maxPoints = rows.reduce(function (max, row) {
            return Math.max(max, Number(row.points) || 0);
        }, 0);

        elements.rankingHistoryBody.innerHTML = `
            <p class="profile-note">Wykres pokazuje sumę punktów po każdym dniu z rozliczonymi meczami. Dzień 0 to start gry.</p>
            ${renderRankingHistoryFilters(players, selectedPlayers, statsByPlayer, colorByPlayer, days)}
            ${selectedPlayers.length > 0 ? `
                <div class="history-chart-wrap">
                    ${renderRankingHistoryChart(days, selectedPlayers, pointsByPlayer, statsByPlayer, colorByPlayer, maxPoints)}
                </div>
            ` : '<div class="empty-state">Wybierz minimum jednego gracza, żeby pokazać wykres.</div>'}
            <div class="history-tooltip hidden" id="ranking-history-tooltip"></div>
        `;
    }

    function getRankingHistoryDays(rows) {
        const days = new Map();
        rows.forEach(function (row) {
            const index = Number(row.day_index) || 0;
            if (!days.has(index)) {
                days.set(index, {
                    index: index,
                    label: row.day_label || 'Dzień ' + index,
                });
            }
        });
        return Array.from(days.values()).sort(function (left, right) {
            return left.index - right.index;
        });
    }

    function getRankingHistoryPlayers(rows) {
        const players = new Map();
        rows.forEach(function (row) {
            const nick = row.player_nick || 'Gracz';
            if (!players.has(nick)) {
                players.set(nick, new Map());
            }
            players.get(nick).set(Number(row.day_index) || 0, Number(row.points) || 0);
        });
        return players;
    }

    function getRankingHistorySortedPlayers(days, pointsByPlayer) {
        const finalDay = days[days.length - 1];
        return Array.from(pointsByPlayer.keys()).sort(function (left, right) {
            const rightPoints = pointsByPlayer.get(right).get(finalDay.index) || 0;
            const leftPoints = pointsByPlayer.get(left).get(finalDay.index) || 0;
            return rightPoints - leftPoints || left.localeCompare(right, 'pl');
        });
    }

    function syncRankingHistorySelection(players) {
        if (!state.rankingHistoryFiltersReady) {
            state.rankingHistorySelectedPlayers = new Set(players);
            state.rankingHistoryFiltersReady = true;
            return;
        }

        state.rankingHistorySelectedPlayers = new Set(players.filter(function (player) {
            return state.rankingHistorySelectedPlayers.has(player);
        }));
    }

    function getRankingHistoryColorMap(players) {
        const colorByPlayer = new Map();
        players.forEach(function (player, index) {
            colorByPlayer.set(player, getHistoryColor(index));
        });
        return colorByPlayer;
    }

    function getRankingHistoryStats(days, players, pointsByPlayer) {
        const statsByPlayer = new Map(players.map(function (player) {
            return [player, new Map()];
        }));
        let previousRanks = new Map();

        days.forEach(function (day, dayPosition) {
            const ranked = players.map(function (player) {
                return {
                    player: player,
                    points: pointsByPlayer.get(player).get(day.index) || 0,
                };
            }).sort(function (left, right) {
                return right.points - left.points || left.player.localeCompare(right.player, 'pl');
            });
            const currentRanks = new Map();

            ranked.forEach(function (entry, rankIndex) {
                currentRanks.set(entry.player, rankIndex + 1);
            });

            players.forEach(function (player) {
                const points = pointsByPlayer.get(player).get(day.index) || 0;
                const previousDay = days[dayPosition - 1];
                const previousPoints = previousDay ? (pointsByPlayer.get(player).get(previousDay.index) || 0) : 0;
                const rank = currentRanks.get(player) || players.length;
                const previousRank = previousRanks.get(player) || rank;

                statsByPlayer.get(player).set(day.index, {
                    dayLabel: day.label,
                    points: points,
                    gained: points - previousPoints,
                    rank: rank,
                    rankChange: previousRank - rank,
                });
            });

            previousRanks = currentRanks;
        });

        return statsByPlayer;
    }

    function renderRankingHistoryFilters(players, selectedPlayers, statsByPlayer, colorByPlayer, days) {
        const selectedCount = selectedPlayers.length;
        const finalDay = days[days.length - 1];
        return `
            <div class="history-toolbar">
                <div>
                    <strong>Gracze na wykresie</strong>
                    <span>${selectedCount}/${players.length} wybranych</span>
                </div>
                <div class="history-actions">
                    <button type="button" data-history-action="all">Wszyscy</button>
                    <button type="button" data-history-action="clear">Wyczyść</button>
                </div>
            </div>
            <div class="history-player-filters">
                ${players.map(function (player) {
                    const selected = state.rankingHistorySelectedPlayers.has(player);
                    const finalStats = statsByPlayer.get(player).get(finalDay.index);
                    return `
                        <label class="history-filter-chip ${selected ? 'selected' : ''}">
                            <input class="history-player-checkbox" type="checkbox" value="${escapeHtml(player)}" ${selected ? 'checked' : ''}>
                            <i style="--history-color: ${colorByPlayer.get(player)}"></i>
                            <span>${escapeHtml(player)}</span>
                            <strong>${finalStats.points} pkt</strong>
                        </label>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderRankingHistoryChart(days, players, pointsByPlayer, statsByPlayer, colorByPlayer, maxPoints) {
        const width = 1280;
        const height = 590;
        const padding = {
            top: 34,
            right: 190,
            bottom: 66,
            left: 56,
        };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const safeMaxPoints = Math.max(1, maxPoints);
        const yTicks = getChartTicks(maxPoints);
        const labelEvery = Math.max(1, Math.ceil(days.length / 8));

        function xForDay(dayIndex) {
            if (days.length === 1) {
                return padding.left + chartWidth / 2;
            }
            return padding.left + (dayIndex / (days.length - 1)) * chartWidth;
        }

        function yForPoints(points) {
            return padding.top + chartHeight - (points / safeMaxPoints) * chartHeight;
        }

        const grid = yTicks.map(function (tick) {
            const y = yForPoints(tick);
            return `
                <line class="history-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
                <text class="history-axis-label" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${tick}</text>
            `;
        }).join('');

        const axisLabels = days.map(function (day, dayIndex) {
            if (dayIndex !== 0 && dayIndex !== days.length - 1 && dayIndex % labelEvery !== 0) {
                return '';
            }
            const x = xForDay(dayIndex);
            return `<text class="history-axis-label" x="${x}" y="${height - 22}" text-anchor="middle">${escapeHtml(day.label)}</text>`;
        }).join('');

        const endLabels = getHistoryEndLabels(days, players, pointsByPlayer, statsByPlayer, colorByPlayer, yForPoints, width, height, padding);
        const lines = players.map(function (player) {
            const pointsMap = pointsByPlayer.get(player);
            const points = days.map(function (day) {
                return pointsMap.get(day.index) || 0;
            });
            const color = colorByPlayer.get(player);
            const polyline = days.map(function (day, dayIndex) {
                return xForDay(dayIndex) + ',' + yForPoints(points[dayIndex]);
            }).join(' ');
            const circles = days.map(function (day, dayIndex) {
                const x = xForDay(dayIndex);
                const y = yForPoints(points[dayIndex]);
                const stats = statsByPlayer.get(player).get(day.index);
                return `<circle class="history-point history-tooltip-target" cx="${x}" cy="${y}" r="5" fill="${color}" ${getHistoryTooltipAttributes(player, stats)}></circle>`;
            }).join('');

            return `
                <g class="history-player-series">
                    <polyline class="history-line" points="${polyline}" stroke="${color}"></polyline>
                    <polyline class="history-hit-line history-tooltip-target" points="${polyline}" ${getHistoryTooltipAttributes(player, statsByPlayer.get(player).get(days[days.length - 1].index))}></polyline>
                    ${circles}
                </g>
            `;
        }).join('');
        const endLabelMarkup = endLabels.map(function (label) {
            return `
                <g class="history-end-label history-tooltip-target" ${getHistoryTooltipAttributes(label.player, label.stats)}>
                    <line x1="${label.pointX + 8}" y1="${label.pointY}" x2="${label.x - 8}" y2="${label.y - 4}" stroke="${label.color}"></line>
                    <text x="${label.x}" y="${label.y}" fill="${label.color}">${escapeHtml(label.player)} ${label.stats.points}</text>
                </g>
            `;
        }).join('');

        return `
            <svg class="history-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historia punktów w rankingu">
                <rect class="history-chart-bg" x="0" y="0" width="${width}" height="${height}"></rect>
                ${grid}
                <line class="history-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
                <line class="history-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
                ${axisLabels}
                ${lines}
                ${endLabelMarkup}
            </svg>
        `;
    }

    function getHistoryEndLabels(days, players, pointsByPlayer, statsByPlayer, colorByPlayer, yForPoints, width, height, padding) {
        const finalDay = days[days.length - 1];
        const pointX = width - padding.right;
        const labelX = pointX + 18;
        const labels = players.map(function (player) {
            const points = pointsByPlayer.get(player).get(finalDay.index) || 0;
            const pointY = yForPoints(points);
            return {
                player: player,
                color: colorByPlayer.get(player),
                pointX: pointX,
                pointY: pointY,
                x: labelX,
                y: pointY + 4,
                stats: statsByPlayer.get(player).get(finalDay.index),
            };
        }).sort(function (left, right) {
            return left.y - right.y;
        });
        const minGap = 23;
        const maxY = height - padding.bottom + 4;

        labels.forEach(function (label, index) {
            if (index > 0 && label.y - labels[index - 1].y < minGap) {
                label.y = labels[index - 1].y + minGap;
            }
        });

        const overflow = labels.length ? labels[labels.length - 1].y - maxY : 0;
        if (overflow > 0) {
            labels.forEach(function (label) {
                label.y -= overflow;
            });
        }

        return labels;
    }

    function getHistoryTooltipAttributes(player, stats) {
        return [
            'data-history-player="' + escapeHtml(player) + '"',
            'data-history-day="' + escapeHtml(stats.dayLabel) + '"',
            'data-history-points="' + stats.points + '"',
            'data-history-gained="' + stats.gained + '"',
            'data-history-rank="' + stats.rank + '"',
            'data-history-rank-change="' + stats.rankChange + '"',
        ].join(' ');
    }

    function handleRankingHistoryClick(event) {
        const actionButton = event.target.closest('[data-history-action]');
        if (!actionButton || !elements.rankingHistoryBody.contains(actionButton)) {
            return;
        }

        const days = getRankingHistoryDays(state.rankingHistoryRows);
        const pointsByPlayer = getRankingHistoryPlayers(state.rankingHistoryRows);
        const players = getRankingHistorySortedPlayers(days, pointsByPlayer);
        const action = actionButton.dataset.historyAction;

        if (action === 'all') {
            state.rankingHistorySelectedPlayers = new Set(players);
        }
        if (action === 'clear') {
            state.rankingHistorySelectedPlayers = new Set();
        }

        state.rankingHistoryFiltersReady = true;
        hideRankingHistoryTooltip();
        renderRankingHistory();
    }

    function handleRankingHistoryChange(event) {
        const checkbox = event.target.closest('.history-player-checkbox');
        if (!checkbox || !elements.rankingHistoryBody.contains(checkbox)) {
            return;
        }

        if (checkbox.checked) {
            state.rankingHistorySelectedPlayers.add(checkbox.value);
        } else {
            state.rankingHistorySelectedPlayers.delete(checkbox.value);
        }

        hideRankingHistoryTooltip();
        renderRankingHistory();
    }

    function handleRankingHistoryTooltipShow(event) {
        const target = event.target.closest('.history-tooltip-target');
        if (!target || !elements.rankingHistoryBody.contains(target)) {
            return;
        }

        showRankingHistoryTooltip(target.dataset, event);
    }

    function handleRankingHistoryTooltipMove(event) {
        const tooltip = document.getElementById('ranking-history-tooltip');
        if (!tooltip || tooltip.classList.contains('hidden')) {
            return;
        }

        positionRankingHistoryTooltip(tooltip, event);
    }

    function handleRankingHistoryTooltipHide(event) {
        const target = event.target.closest('.history-tooltip-target');
        if (!target) {
            return;
        }
        if (event.relatedTarget && target.contains(event.relatedTarget)) {
            return;
        }

        hideRankingHistoryTooltip();
    }

    function showRankingHistoryTooltip(data, event) {
        const tooltip = document.getElementById('ranking-history-tooltip');
        if (!tooltip) {
            return;
        }

        const points = Number(data.historyPoints) || 0;
        const gained = Number(data.historyGained) || 0;
        const rank = Number(data.historyRank) || 0;
        const rankChange = Number(data.historyRankChange) || 0;
        const rankClass = getRankChangeClass(rankChange);

        tooltip.className = 'history-tooltip history-tooltip-' + rankClass;
        tooltip.innerHTML = `
            <strong>${escapeHtml(data.historyPlayer || '')}</strong>
            <span>${escapeHtml(data.historyDay || '')}</span>
            <div>Punkty po dniu: <b>${points} pkt (${formatSignedNumber(gained)})</b></div>
            <div>Pozycja: <b>#${rank}</b> <em>${escapeHtml(getRankChangeLabel(rankChange))}</em></div>
        `;
        positionRankingHistoryTooltip(tooltip, event);
    }

    function positionRankingHistoryTooltip(tooltip, event) {
        const offset = 16;
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        let left = event.clientX + offset;
        let top = event.clientY + offset;

        if (left + tooltipRect.width > viewportWidth - 12) {
            left = event.clientX - tooltipRect.width - offset;
        }
        if (top + tooltipRect.height > viewportHeight - 12) {
            top = event.clientY - tooltipRect.height - offset;
        }

        tooltip.style.left = Math.max(12, left) + 'px';
        tooltip.style.top = Math.max(12, top) + 'px';
        tooltip.classList.remove('hidden');
    }

    function hideRankingHistoryTooltip() {
        const tooltip = document.getElementById('ranking-history-tooltip');
        if (tooltip) {
            tooltip.classList.add('hidden');
        }
    }

    function getRankChangeClass(change) {
        if (change > 0) {
            return 'up';
        }
        if (change < 0) {
            return 'down';
        }
        return 'same';
    }

    function getRankChangeLabel(change) {
        if (change > 0) {
            return '↑ ' + change;
        }
        if (change < 0) {
            return '↓ ' + Math.abs(change);
        }
        return 'bez zmian';
    }

    function formatSignedNumber(value) {
        return (value >= 0 ? '+' : '') + value + ' pkt';
    }

    function getChartTicks(maxPoints) {
        if (maxPoints <= 0) {
            return [0];
        }

        const step = Math.max(1, Math.ceil(maxPoints / 4));
        const ticks = [];
        for (let value = 0; value <= maxPoints; value += step) {
            ticks.push(value);
        }
        if (ticks[ticks.length - 1] !== maxPoints) {
            ticks.push(maxPoints);
        }
        return ticks;
    }

    function getHistoryColor(index) {
        return HISTORY_COLORS[index % HISTORY_COLORS.length];
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
