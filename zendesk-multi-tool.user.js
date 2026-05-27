// ==UserScript==
// @name         Zendesk Multi-Tool with Audible Alerts
// @namespace    http://tampermonkey.net/
// @version      2.0.8
// @description  Reliable Zendesk view polling, close-all tabs, sound alerts, notifications, and call-aware muting.
// @author       Roger Rhodes
// @match        https://elotouchcare.zendesk.com/agent/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/What1sCode/FileHosting/main/zendesk-multi-tool.user.js
// @updateURL    https://raw.githubusercontent.com/What1sCode/FileHosting/main/zendesk-multi-tool.user.js
// ==/UserScript==

(function zendeskMultiTool() {
    'use strict';

    const Config = Object.freeze({
        viewId: '31118901320727',
        minPollingDelayMs: 10000,
        maxPollingDelayMs: 60000,
        fetchTimeoutMs: 15000,
        autoRefreshDelayMs: 10000,
        callDetectionDelayMs: 2000,
        uiReconcileDelayMs: 1500,
        titleFlashMs: 800,
        titleFlashTimeoutMs: 300000,
        leaderRenewalMs: 5000,
        leaderTimeoutMs: 15000,
        storagePrefix: 'zendesk-multi-tool',
        ids: {
            toolbar: 'zmt-toolbar',
            closeAllButton: 'zmt-close-all',
            muteButton: 'zmt-mute-toggle',
            soundSelector: 'zmt-sound-selector',
            style: 'zmt-style'
        },
        selectors: {
            tabBar: '[data-test-id="header-tablist"]',
            toolbarHosts: [
                '[data-test-id="header-toolbar"]',
                '[data-test-id="chrome-header"]',
                '[data-test-id*="topbar" i]',
                '[data-garden-id="chrome.header"]',
                'header [role="toolbar"]',
                'header'
            ],
            toolbarAnchors: [
                '[aria-label*="Conversation" i]',
                '[data-test-id*="conversation" i]'
            ],
            closeButtons: 'button[data-test-id="close-button"]',
            refreshButton: '[data-test-id="views_views-list_header-refresh"]',
            activeCall: [
                '[data-test-id="talk-active-call"]',
                '[data-test-id="call-timer"]',
                '[data-test-id="voice-channel-panel"] [data-test-id*="active"]',
                '[data-test-id*="active-call"]',
                '[aria-label*="End call" i]',
                '[aria-label*="Mute call" i]',
                '[class*="active-call" i]',
                '[class*="call-timer" i]'
            ]
        },
        sounds: {
            cow: {
                name: 'Cow Moo',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/cow-moo.mp3',
                icon: 'Cow'
            },
            guitar: {
                name: 'Guitar Alert',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/guitaralert.wav',
                icon: 'Gtr'
            },
            beep: {
                name: 'Beep',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/Beep.wav',
                icon: 'Bell'
            },
            scratch: {
                name: 'Scratch',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/scratch-389.mp3',
                icon: 'Note'
            },
            stars: {
                name: 'Stars',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/Stars.mp3',
                icon: 'Star'
            },
            sting: {
                name: 'Sting',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/sting.mp3',
                icon: 'Horn'
            },
            uhoh: {
                name: 'Uh Oh',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/uhoh.mp3',
                icon: 'Uh'
            },
            fatality: {
                name: 'MoKo',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/fatality.mp3',
                icon: 'Moko'
            },
            pacman: {
                name: 'Pac-Man',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/pacman.mp3',
                icon: 'Pac'
            },
            sfperfect: {
                name: 'SF Perfect',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/sfperfect.mp3',
                icon: 'SF'
            },
            mgsAlert: {
                name: 'MGS Alert',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/mgsAlert.mp3',
                icon: 'MGS'
            },
            heyListen: {
                name: 'Listen',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/HeyListen.mp3',
                icon: 'Hey'
            },
            infant: {
                name: 'DCC Infant',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/infant.mp3',
                icon: 'DCC'
            },
            reward: {
                name: 'DCC Reward',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/reward.mp3',
                icon: 'Gift'
            },
            whathappened: {
                name: 'DCC What Happened',
                url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/whathappened.mp3',
                icon: 'What'
            }
        }
    });

    const Logger = {
        info(...args) {
            console.info('[Zendesk Multi-Tool]', ...args);
        },
        warn(...args) {
            console.warn('[Zendesk Multi-Tool]', ...args);
        },
        error(...args) {
            console.error('[Zendesk Multi-Tool]', ...args);
        }
    };

    const State = {
        previousTicketIds: new Set(),
        initialLoad: true,
        manuallyMuted: false,
        onCall: false,
        audioUnlocked: false,
        audioInitialized: false,
        audioContext: null,
        pollingDelayMs: Config.minPollingDelayMs,
        ticketMonitorActive: false,
        pollTimer: null,
        pollInFlight: false,
        pollAbortController: null,
        rateLimitCount: 0,
        lastPollStartedAt: null,
        lastPollCompletedAt: null,
        lastSuccessfulPollAt: null,
        lastTicketCount: 0,
        mutationObserver: null,
        uiReconcileQueued: false,
        titleFlashTimer: null,
        originalTitle: document.title,
        tabId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        isLeader: false,
        leaderRenewTimer: null,
        leaderCheckTimer: null,
        storageHandler: null,
        timers: new Set()
    };

    const Store = {
        key(name) {
            return `${Config.storagePrefix}:${name}`;
        },
        get(name, fallback) {
            const value = localStorage.getItem(Store.key(name));
            return value === null ? fallback : value;
        },
        set(name, value) {
            localStorage.setItem(Store.key(name), value);
        },
        getBoolean(name, fallback) {
            const value = Store.get(name, null);
            return value === null ? fallback : value === 'true';
        },
        setBoolean(name, value) {
            Store.set(name, String(Boolean(value)));
        },
        getSoundKey() {
            const saved = Store.get('sound', 'cow');
            return Object.prototype.hasOwnProperty.call(Config.sounds, saved) ? saved : 'cow';
        },
        setSoundKey(soundKey) {
            const validSoundKey = Object.prototype.hasOwnProperty.call(Config.sounds, soundKey) ? soundKey : 'cow';
            Store.set('sound', validSoundKey);
            return validSoundKey;
        }
    };

    const Scheduler = {
        setInterval(fn, delayMs) {
            const timer = window.setInterval(fn, delayMs);
            State.timers.add(timer);
            return timer;
        },
        setTimeout(fn, delayMs) {
            const timer = window.setTimeout(() => {
                State.timers.delete(timer);
                fn();
            }, delayMs);
            State.timers.add(timer);
            return timer;
        },
        clear(timer) {
            window.clearInterval(timer);
            window.clearTimeout(timer);
            State.timers.delete(timer);
        },
        cleanup() {
            State.timers.forEach(timer => {
                window.clearInterval(timer);
                window.clearTimeout(timer);
            });
            State.timers.clear();
        }
    };

    const Styles = {
        ensure() {
            if (document.getElementById(Config.ids.style)) return;

            const style = document.createElement('style');
            style.id = Config.ids.style;
            style.textContent = `
                #${Config.ids.toolbar} {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-left: auto;
                    margin-right: 20px;
                    white-space: nowrap;
                    flex: 0 0 auto;
                    order: 900;
                }

                #${Config.ids.toolbar} button,
                #${Config.ids.toolbar} select {
                    height: 28px;
                    border: 1px solid #d8dcde;
                    border-radius: 4px;
                    background: #fff;
                    color: #2f3941;
                    font: 500 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }

                #${Config.ids.toolbar} button {
                    width: 28px;
                    padding: 0;
                    cursor: pointer;
                    text-align: center;
                    font-size: 16px;
                }

                #${Config.ids.toolbar} select {
                    max-width: 156px;
                    padding: 0 6px;
                    cursor: pointer;
                }

                #${Config.ids.toolbar} button:hover,
                #${Config.ids.toolbar} select:hover {
                    background: #f5f7f9;
                }

                #${Config.ids.toolbar} button[data-active="true"] {
                    background: #fff7d6;
                    border-color: #e7b75f;
                    color: #5f3b00;
                }

                #${Config.ids.toolbar} button[data-call="true"] {
                    background: #fff0eb;
                    border-color: #e35b35;
                    color: #8f2f16;
                }

                .zmt-visual-alert {
                    position: fixed;
                    inset: 0;
                    z-index: 2147483647;
                    pointer-events: none;
                    background: rgba(214, 40, 40, 0.25);
                    animation: zmt-flash 520ms ease-in-out;
                }

                @keyframes zmt-flash {
                    0% { opacity: 0; }
                    45% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    };

    const AudioManager = {
        initialize() {
            if (State.audioInitialized) return;

            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextCtor) {
                Logger.warn('AudioContext is not supported in this browser.');
                return;
            }

            try {
                State.audioContext = new AudioContextCtor();
                State.audioInitialized = true;
            } catch (error) {
                Logger.warn('Could not initialize audio context.', error);
            }
        },
        async unlock() {
            AudioManager.initialize();
            if (!State.audioContext || State.audioUnlocked) return;

            try {
                if (State.audioContext.state === 'suspended') {
                    await State.audioContext.resume();
                }

                const oscillator = State.audioContext.createOscillator();
                const gain = State.audioContext.createGain();
                gain.gain.setValueAtTime(0, State.audioContext.currentTime);
                oscillator.connect(gain);
                gain.connect(State.audioContext.destination);
                oscillator.start();
                oscillator.stop(State.audioContext.currentTime + 0.01);
                State.audioUnlocked = true;
                Logger.info('Audio unlocked.');
            } catch (error) {
                Logger.warn('Audio unlock failed.', error);
            }
        },
        async playSelected() {
            const soundKey = Store.getSoundKey();
            const sound = Config.sounds[soundKey];

            try {
                const audio = new Audio(sound.url);
                audio.volume = 0.7;
                audio.preload = 'auto';
                await audio.play();
                Logger.info(`Played sound: ${sound.name}`);
            } catch (error) {
                Logger.warn(`Could not play ${sound.name}; using generated beep fallback.`, error);
                AudioManager.playGeneratedBeep();
            }
        },
        playGeneratedBeep() {
            AudioManager.initialize();
            if (!State.audioContext) return;

            try {
                const now = State.audioContext.currentTime;
                const oscillator = State.audioContext.createOscillator();
                const gain = State.audioContext.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, now);
                oscillator.frequency.setValueAtTime(660, now + 0.12);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

                oscillator.connect(gain);
                gain.connect(State.audioContext.destination);
                oscillator.start(now);
                oscillator.stop(now + 0.5);
            } catch (error) {
                Logger.warn('Generated beep failed.', error);
            }
        },
        bindUnlockEvents() {
            ['click', 'keydown', 'touchstart', 'mousedown'].forEach(eventName => {
                document.addEventListener(eventName, AudioManager.unlock, { once: true, passive: true });
            });
        }
    };

    const AlertManager = {
        isSoundBlocked() {
            return State.manuallyMuted || State.onCall;
        },
        async alertNewTickets(ticketIds) {
            if (!State.isLeader) {
                Logger.info(`Skipping alert for ${ticketIds.length} ticket(s) because this tab is a follower.`);
                return;
            }

            Logger.info(`New ticket alert for ${ticketIds.length} ticket(s): ${ticketIds.join(', ')}`);
            AlertManager.flashTitle();
            AlertManager.showNotification(ticketIds);

            if (AlertManager.isSoundBlocked()) {
                Logger.info(State.onCall ? 'Sound skipped because active call was detected.' : 'Sound skipped because manual mute is enabled.');
                AlertManager.showVisualAlert();
                return;
            }

            await AudioManager.playSelected();
            AlertManager.showVisualAlert();
        },
        showNotification(ticketIds) {
            if (!('Notification' in window) || Notification.permission !== 'granted') return;

            try {
                new Notification('New Zendesk Ticket', {
                    body: `${ticketIds.length} new ticket(s): #${ticketIds.join(', #')}`,
                    icon: 'https://static.zdassets.com/classic/favicon.ico'
                });
            } catch (error) {
                Logger.warn('Notification failed.', error);
            }
        },
        flashTitle() {
            const originalTitle = State.originalTitle || document.title;

            if (State.titleFlashTimer) {
                Scheduler.clear(State.titleFlashTimer);
                State.titleFlashTimer = null;
            }

            State.titleFlashTimer = Scheduler.setInterval(() => {
                if (document.hidden) {
                    document.title = document.title === originalTitle ? 'NEW TICKET' : originalTitle;
                    return;
                }

                AlertManager.stopTitleFlash(originalTitle);
            }, Config.titleFlashMs);

            Scheduler.setTimeout(() => AlertManager.stopTitleFlash(originalTitle), Config.titleFlashTimeoutMs);
        },
        stopTitleFlash(title) {
            if (State.titleFlashTimer) {
                Scheduler.clear(State.titleFlashTimer);
                State.titleFlashTimer = null;
            }
            document.title = title || State.originalTitle || document.title;
        },
        showVisualAlert() {
            const flash = document.createElement('div');
            flash.className = 'zmt-visual-alert';
            document.body.appendChild(flash);
            Scheduler.setTimeout(() => flash.remove(), 600);
        }
    };

    const ZendeskApi = {
        async fetchViewTickets() {
            const controller = new AbortController();
            const timeout = Scheduler.setTimeout(() => controller.abort(), Config.fetchTimeoutMs);
            State.pollAbortController = controller;

            try {
                const response = await fetch(`/api/v2/views/${Config.viewId}/tickets.json?per_page=100`, {
                    credentials: 'same-origin',
                    signal: controller.signal,
                    headers: {
                        Accept: 'application/json'
                    }
                });

                return response;
            } finally {
                Scheduler.clear(timeout);
                State.pollAbortController = null;
            }
        }
    };

    const TicketMonitor = {
        start() {
            if (State.ticketMonitorActive) return;
            State.ticketMonitorActive = true;
            TicketMonitor.scheduleNextPoll(500);
        },
        stop() {
            State.ticketMonitorActive = false;

            if (State.pollTimer) {
                Scheduler.clear(State.pollTimer);
                State.pollTimer = null;
            }

            if (State.pollAbortController) {
                State.pollAbortController.abort();
                State.pollAbortController = null;
            }
        },
        scheduleNextPoll(delayMs) {
            if (!State.ticketMonitorActive) return;
            if (State.pollTimer) Scheduler.clear(State.pollTimer);
            State.pollTimer = Scheduler.setTimeout(TicketMonitor.poll, delayMs);
        },
        async poll() {
            if (!State.ticketMonitorActive) return;

            if (State.pollInFlight) {
                Logger.warn('Previous poll still running; skipping this cycle.');
                TicketMonitor.scheduleNextPoll(State.pollingDelayMs);
                return;
            }

            State.pollInFlight = true;
            State.lastPollStartedAt = Date.now();
            Ui.update();

            try {
                const response = await ZendeskApi.fetchViewTickets();

                if (response.status === 429) {
                    TicketMonitor.handleRateLimit(response);
                    return;
                }

                if (!response.ok) {
                    Logger.warn(`Ticket poll failed with HTTP ${response.status}.`);
                    TicketMonitor.increasePollingDelay();
                    return;
                }

                const data = await response.json();
                const currentTicketIds = new Set((data.tickets || []).map(ticket => ticket.id));
                State.lastSuccessfulPollAt = Date.now();
                State.lastTicketCount = currentTicketIds.size;

                TicketMonitor.handleTicketSnapshot(currentTicketIds);
                TicketMonitor.handleRecovery();
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    Logger.warn('Ticket poll timed out.');
                } else {
                    Logger.warn('Ticket poll failed.', error);
                }
                TicketMonitor.increasePollingDelay();
            } finally {
                State.pollInFlight = false;
                State.lastPollCompletedAt = Date.now();
                Ui.update();
                if (State.ticketMonitorActive) {
                    TicketMonitor.scheduleNextPoll(State.pollingDelayMs);
                }
            }
        },
        handleTicketSnapshot(currentTicketIds) {
            if (State.initialLoad) {
                State.previousTicketIds = currentTicketIds;
                State.initialLoad = false;
                Logger.info(`Initial ticket snapshot captured: ${currentTicketIds.size} ticket(s).`);
                return;
            }

            const newTicketIds = [...currentTicketIds].filter(id => !State.previousTicketIds.has(id));
            const removedTicketIds = [...State.previousTicketIds].filter(id => !currentTicketIds.has(id));

            if (newTicketIds.length > 0) {
                AlertManager.alertNewTickets(newTicketIds);
            }

            if (removedTicketIds.length > 0) {
                Logger.info(`Tickets removed from view: ${removedTicketIds.join(', ')}`);
            }

            State.previousTicketIds = currentTicketIds;
        },
        handleRateLimit(response) {
            State.rateLimitCount += 1;

            const retryAfter = Number(response.headers.get('Retry-After'));
            if (Number.isFinite(retryAfter) && retryAfter > 0) {
                State.pollingDelayMs = Math.min(retryAfter * 1000, Config.maxPollingDelayMs);
            } else {
                TicketMonitor.increasePollingDelay();
            }

            Logger.warn(`Rate limited by Zendesk. Next poll in ${Math.round(State.pollingDelayMs / 1000)}s.`);
        },
        handleRecovery() {
            if (State.rateLimitCount > 0 || State.pollingDelayMs > Config.minPollingDelayMs) {
                State.rateLimitCount = 0;
                State.pollingDelayMs = Math.max(Config.minPollingDelayMs, Math.floor(State.pollingDelayMs * 0.8));
            }
        },
        increasePollingDelay() {
            State.pollingDelayMs = Math.min(Config.maxPollingDelayMs, Math.max(Config.minPollingDelayMs, State.pollingDelayMs * 2));
        },
        boostForVisibleTab() {
            if (document.hidden) return;
            if (State.pollingDelayMs > Config.minPollingDelayMs) {
                State.pollingDelayMs = Config.minPollingDelayMs;
            }
            TicketMonitor.scheduleNextPoll(500);
        }
    };

    const CallDetector = {
        start() {
            CallDetector.detect();
            Scheduler.setInterval(CallDetector.detect, Config.callDetectionDelayMs);
        },
        detect() {
            const activeCallElement = Config.selectors.activeCall
                .map(selector => {
                    try {
                        return document.querySelector(selector);
                    } catch (error) {
                        Logger.warn(`Invalid call detection selector skipped: ${selector}`, error);
                        return null;
                    }
                })
                .find(Boolean);

            const wasOnCall = State.onCall;
            State.onCall = Boolean(activeCallElement);

            if (wasOnCall !== State.onCall) {
                Logger.info(State.onCall ? 'Active call detected; alerts muted.' : 'Active call ended; alert state restored.');
                Ui.update();
            }
        }
    };

    const AutoRefresh = {
        start() {
            if (!window.location.pathname.includes('/agent/filters')) return;

            Scheduler.setTimeout(() => {
                AutoRefresh.refresh();
                Scheduler.setInterval(AutoRefresh.refresh, Config.autoRefreshDelayMs);
            }, 5000);
        },
        refresh() {
            const refreshButton = document.querySelector(Config.selectors.refreshButton);
            if (!refreshButton) return;
            refreshButton.click();
            Logger.info('Zendesk view refreshed.');
        }
    };

    const Ui = {
        start() {
            Styles.ensure();
            Ui.reconcile();
            Scheduler.setInterval(Ui.reconcile, Config.uiReconcileDelayMs);

            State.mutationObserver = new MutationObserver(Ui.queueReconcile);
            State.mutationObserver.observe(document.body, { childList: true });
        },
        queueReconcile() {
            if (State.uiReconcileQueued) return;
            State.uiReconcileQueued = true;

            Scheduler.setTimeout(() => {
                State.uiReconcileQueued = false;
                Ui.reconcile();
            }, 500);
        },
        reconcile() {
            const toolbarHost = Ui.findToolbarHost();
            if (!toolbarHost) return;

            let toolbar = document.getElementById(Config.ids.toolbar);
            if (toolbar && toolbar.parentElement !== toolbarHost) {
                toolbar.remove();
                toolbar = null;
            }

            if (!toolbar) {
                toolbar = Ui.createToolbar();
                Ui.insertToolbar(toolbarHost, toolbar);
            }

            Ui.update();
        },
        findToolbarHost() {
            const anchorSelector = Config.selectors.toolbarAnchors.join(',');
            const anchor = document.querySelector(anchorSelector);
            const headerHost = anchor ? anchor.closest('header, [data-test-id*="header" i], [data-test-id*="topbar" i], [role="toolbar"]') : null;

            if (headerHost) return headerHost;

            for (const selector of Config.selectors.toolbarHosts) {
                const host = document.querySelector(selector);
                if (host) return host;
            }

            return document.querySelector(Config.selectors.tabBar);
        },
        insertToolbar(host, toolbar) {
            const anchorSelector = Config.selectors.toolbarAnchors.join(',');
            const anchor = host.querySelector(anchorSelector);

            if (anchor) {
                anchor.insertAdjacentElement('beforebegin', toolbar);
                toolbar.style.marginLeft = '0';
                return;
            }

            host.appendChild(toolbar);
        },
        createToolbar() {
            const toolbar = document.createElement('div');
            toolbar.id = Config.ids.toolbar;

            const closeButton = Ui.button(Config.ids.closeAllButton, 'X', 'Close all open Zendesk tabs');
            closeButton.addEventListener('click', Ui.closeAllTabs);

            const muteButton = Ui.button(Config.ids.muteButton, '🔇', 'Mute or unmute alert sounds');
            muteButton.addEventListener('click', () => {
                State.manuallyMuted = !State.manuallyMuted;
                Store.setBoolean('manuallyMuted', State.manuallyMuted);
                Ui.update();
            });

            const selector = document.createElement('select');
            selector.id = Config.ids.soundSelector;
            selector.title = 'Alert sound';

            Object.entries(Config.sounds).forEach(([key, sound]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = `${sound.icon} - ${sound.name}`;
                selector.appendChild(option);
            });

            selector.value = Store.getSoundKey();
            selector.addEventListener('change', async event => {
                Store.setSoundKey(event.target.value);
                await AudioManager.unlock();
                await AudioManager.playSelected();
                Ui.update();
            });

            toolbar.append(closeButton, muteButton, selector);
            return toolbar;
        },
        button(id, text, title) {
            const button = document.createElement('button');
            button.id = id;
            button.type = 'button';
            button.textContent = text;
            button.title = title;
            return button;
        },
        update() {
            const muteButton = document.getElementById(Config.ids.muteButton);
            const selector = document.getElementById(Config.ids.soundSelector);

            if (selector) selector.value = Store.getSoundKey();

            if (muteButton) {
                const tabRole = State.isLeader
                    ? 'Leader tab: this tab handles ticket alerts'
                    : 'Follower tab: another Zendesk tab handles ticket alerts';

                muteButton.dataset.active = String(State.manuallyMuted);
                muteButton.dataset.call = String(State.onCall);
                muteButton.textContent = '🔇';
                muteButton.title = State.onCall
                    ? `Alert sounds are muted while an active call is detected\n${tabRole}`
                    : State.manuallyMuted
                        ? `Alert sounds are manually muted\n${tabRole}`
                        : `Mute alert sounds\n${tabRole}`;
            }

        },
        closeAllTabs() {
            AudioManager.unlock();

            const tabBar = document.querySelector(Config.selectors.tabBar);
            if (!tabBar) return;

            const closeButtons = [...tabBar.querySelectorAll(Config.selectors.closeButtons)];
            closeButtons.forEach(button => button.click());
            Logger.info(`Closed ${closeButtons.length} Zendesk tab(s).`);
        }
    };

    const TabCoordinator = {
        start() {
            State.storageHandler = TabCoordinator.handleStorageEvent;
            window.addEventListener('storage', State.storageHandler);

            TabCoordinator.evaluateLeadership();
            State.leaderCheckTimer = Scheduler.setInterval(TabCoordinator.evaluateLeadership, Config.leaderRenewalMs);
        },
        stop() {
            if (State.storageHandler) {
                window.removeEventListener('storage', State.storageHandler);
                State.storageHandler = null;
            }

            if (State.leaderRenewTimer) {
                Scheduler.clear(State.leaderRenewTimer);
                State.leaderRenewTimer = null;
            }

            if (State.leaderCheckTimer) {
                Scheduler.clear(State.leaderCheckTimer);
                State.leaderCheckTimer = null;
            }

            TabCoordinator.releaseLeadership();
            State.isLeader = false;
            TicketMonitor.stop();
            Ui.update();
        },
        handleStorageEvent(event) {
            if (event.key === Store.key('leader')) {
                TabCoordinator.evaluateLeadership();
                return;
            }

            if (event.key === Store.key('manuallyMuted')) {
                State.manuallyMuted = Store.getBoolean('manuallyMuted', false);
                Ui.update();
                return;
            }

            if (event.key === Store.key('sound')) {
                Ui.update();
            }
        },
        evaluateLeadership() {
            const leader = TabCoordinator.readLeader();

            if (TabCoordinator.isValidLeader(leader) && leader.tabId !== State.tabId) {
                TabCoordinator.becomeFollower();
                return;
            }

            TabCoordinator.claimLeadership();
        },
        claimLeadership() {
            const now = Date.now();
            const leader = {
                tabId: State.tabId,
                updatedAt: now,
                expiresAt: now + Config.leaderTimeoutMs
            };

            localStorage.setItem(Store.key('leader'), JSON.stringify(leader));

            const confirmedLeader = TabCoordinator.readLeader();
            if (confirmedLeader && confirmedLeader.tabId === State.tabId) {
                TabCoordinator.becomeLeader();
            } else {
                TabCoordinator.becomeFollower();
            }
        },
        becomeLeader() {
            const wasLeader = State.isLeader;
            State.isLeader = true;

            if (!State.leaderRenewTimer) {
                State.leaderRenewTimer = Scheduler.setInterval(TabCoordinator.renewLeadership, Config.leaderRenewalMs);
            }

            TicketMonitor.start();
            if (!wasLeader) {
                Logger.info('This tab is now the alert leader.');
            }
            Ui.update();
        },
        becomeFollower() {
            const wasLeader = State.isLeader;
            State.isLeader = false;

            if (State.leaderRenewTimer) {
                Scheduler.clear(State.leaderRenewTimer);
                State.leaderRenewTimer = null;
            }

            TicketMonitor.stop();
            if (wasLeader) {
                Logger.info('This tab is now an alert follower.');
            }
            Ui.update();
        },
        renewLeadership() {
            if (!State.isLeader) return;

            const leader = TabCoordinator.readLeader();
            if (TabCoordinator.isValidLeader(leader) && leader.tabId !== State.tabId) {
                TabCoordinator.becomeFollower();
                return;
            }

            TabCoordinator.claimLeadership();
        },
        releaseLeadership() {
            const leader = TabCoordinator.readLeader();
            if (leader && leader.tabId === State.tabId) {
                localStorage.removeItem(Store.key('leader'));
            }
        },
        readLeader() {
            const rawLeader = localStorage.getItem(Store.key('leader'));
            if (!rawLeader) return null;

            try {
                return JSON.parse(rawLeader);
            } catch (error) {
                Logger.warn('Invalid leader lock found; replacing it.', error);
                localStorage.removeItem(Store.key('leader'));
                return null;
            }
        },
        isValidLeader(leader) {
            return Boolean(
                leader &&
                typeof leader.tabId === 'string' &&
                Number.isFinite(leader.expiresAt) &&
                leader.expiresAt > Date.now()
            );
        }
    };

    const App = {
        start() {
            Logger.info('Starting version 2.0.8.');
            State.manuallyMuted = Store.getBoolean('manuallyMuted', false);

            AudioManager.bindUnlockEvents();
            Ui.start();
            CallDetector.start();
            TabCoordinator.start();
            AutoRefresh.start();

            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    AlertManager.stopTitleFlash(State.originalTitle);
                    TicketMonitor.boostForVisibleTab();
                }
            });

            window.addEventListener('beforeunload', App.stop);
            Logger.info('Started successfully.');
        },
        stop() {
            TabCoordinator.stop();
            TicketMonitor.stop();
            Scheduler.cleanup();

            if (State.mutationObserver) {
                State.mutationObserver.disconnect();
                State.mutationObserver = null;
            }
        }
    };

    App.start();
})();
