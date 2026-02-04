// ==UserScript==
// @name         Zendesk Multi-Tool with Audible Alerts
// @namespace    http://tampermonkey.net/
// @version      1.14
// @description  Auto-refresh views, Close All button, sound alerts with call detection
// @author       Roger Rhodes
// @match        https://elotouchcare.zendesk.com/agent/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/What1sCode/FileHosting/main/zendesk-multi-tool.user.js
// @updateURL    https://raw.githubusercontent.com/What1sCode/FileHosting/main/zendesk-multi-tool.user.js
// ==/UserScript==

(function() {
    'use strict';

    console.log('🔧 Zendesk Multi-Tool Starting...');

    // State variables
    let previousTicketIds = new Set();
    let refreshInterval = null;
    let ticketMonitorInterval = null;
    let closeAllButtonAdded = false;
    let soundSelectorAdded = false;
    let muteToggleAdded = false;

    // Call detection state
    let isAgentOnCall = false;
    let callDetectionInterval = null;
    let isSoundMuted = false;

    // Audio context
    let audioContext = null;
    let audioInitialized = false;
    let audioUnlocked = false;

    // Background polling with rate limit handling
    let backgroundPollInterval = null;
    let currentPollingDelay = 10000;
    let rateLimitCount = 0;
    const TARGET_VIEW_URL = 'https://elotouchcare.zendesk.com/agent/filters/31118901320727';

    // Reliability and "keep alive" mechanisms
    let lastHeartbeat = Date.now();
    let heartbeatInterval = null;
    let healthCheckInterval = null;
    let periodicRestartInterval = null;
    let isTabVisible = true;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
    const HEARTBEAT_TIMEOUT = 30000;
    const HEALTH_CHECK_INTERVAL = 60000;
    const PERIODIC_RESTART_INTERVAL = 3600000;

    // Sound options with GitHub URLs
    const SOUND_OPTIONS = {
        'cow': {
            name: 'Cow Moo',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/cow-moo.mp3',
            emoji: '🐄'
        },
        'guitar': {
            name: 'Guitar Alert',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/guitaralert.wav',
            emoji: '🎸'
        },
        'beep': {
            name: 'Beep',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/Beep.wav',
            emoji: '🔔'
        },
        'scratch': {
            name: 'Scratch',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/scratch-389.mp3',
            emoji: '🎵'
        },
        'stars': {
            name: 'Stars',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/Stars.mp3',
            emoji: '⭐'
        },
        'sting': {
            name: 'Sting',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/sting.mp3',
            emoji: '🎺'
        },
        'uhoh': {
            name: 'Uh Oh',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/uhoh.mp3',
            emoji: '😬'
         },
        'Fatality': {
            name: 'MoKo',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/fatality.mp3',
            emoji: '💀'
                },
        'pacman': {
            name: 'Pac-Man',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/pacman.mp3',
            emoji: '🎺'
        },
        'sfperfect': {
            name: 'SF Perfect',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/sfperfect.mp3',
            emoji: '😬'
         },
        'mgsAlert': {
            name: 'MGS Alert',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/mgsAlert.mp3',
            emoji: '💀'
          },
        'HeyListen': {
            name: 'Listen',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/HeyListen.mp3',
            emoji: '🎧'
           },
        'infant': {
            name: 'DCC Infant',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/infant.mp3',
            emoji: '👶'
         },
        'reward': {
            name: 'DCC Reward',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/reward.mp3',
            emoji: '🎁'
          },
        'whathappened': {
            name: 'DCC What Happened',
            url: 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/whathappened.mp3',
            emoji: '😮'
        }
    };

    // Get selected sound (default to cow)
    function getSelectedSound() {
        return localStorage.getItem('zendesk-sound-choice') || 'cow';
    }

    // Set selected sound
    function setSelectedSound(soundKey) {
        localStorage.setItem('zendesk-sound-choice', soundKey);
        console.log(`🔊 Sound changed to: ${SOUND_OPTIONS[soundKey].name}`);
    }

    // Detect if agent is on a call
    function detectCallStatus() {
        const callIndicator = document.querySelector('[data-test-id="call-controls"]') ||
                             document.querySelector('[class*="call-controls"]') ||
                             document.querySelector('[data-garden-id="chrome.nav_item"][aria-label*="Call"]');

        const activeCallPanel = document.querySelector('[data-test-id="talk-active-call"]') ||
                               document.querySelector('[class*="active-call"]') ||
                               document.querySelector('[data-test-id="voice-channel-panel"]');

        const callTimer = document.querySelector('[data-test-id="call-timer"]') ||
                         document.querySelector('[class*="call-timer"]');

        const wasOnCall = isAgentOnCall;
        isAgentOnCall = !!(callIndicator || activeCallPanel || callTimer);

        if (wasOnCall !== isAgentOnCall) {
            if (isAgentOnCall) {
                console.log('📞 Agent is now on a call - sounds muted');
                isSoundMuted = true;
                updateMuteButtonState();
            } else {
                console.log('📞 Agent is off call - sounds enabled');
                isSoundMuted = false;
                updateMuteButtonState();
            }
        }

        return isAgentOnCall;
    }

    // Update mute button appearance
    function updateMuteButtonState() {
        const button = document.getElementById('manual-mute-toggle');
        if (!button) return;

        if (isSoundMuted || isAgentOnCall) {
            button.textContent = isAgentOnCall ? '📞 On Call' : '🔇 Unmute';
            button.style.backgroundColor = isAgentOnCall ? '#ff5722' : '#ffc107';
            button.style.borderColor = isAgentOnCall ? '#f44336' : '#ff9800';
            button.style.color = isAgentOnCall ? '#fff' : '#333';
        } else {
            button.textContent = '🔊 Mute';
            button.style.backgroundColor = '#f8f9fa';
            button.style.borderColor = '#ddd';
            button.style.color = '#333';
        }
    }

    // Initialize audio context and unlock audio
    function initAudio() {
        if (!audioInitialized) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                audioInitialized = true;
                console.log('🔊 Audio context initialized');

                if (audioContext.state === 'suspended') {
                    audioContext.resume().then(() => {
                        console.log('🔊 Audio context resumed');
                        audioUnlocked = true;
                    }).catch(err => {
                        console.warn('🔊 Failed to resume audio context:', err);
                    });
                } else {
                    audioUnlocked = true;
                }
            } catch (error) {
                console.error('🔊 Audio init failed:', error);
            }
        }
    }

    // Aggressive audio unlock on user interaction
    function unlockAudio() {
        if (!audioUnlocked && audioContext) {
            try {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                gainNode.gain.setValueAtTime(0, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.001);

                audioUnlocked = true;
                console.log('🔊 Audio unlocked via user interaction');
            } catch (error) {
                console.warn('🔊 Audio unlock failed:', error);
            }
        }
    }

    // Enhanced audio initialization on any user interaction
    ['click', 'keydown', 'touchstart', 'mousedown'].forEach(eventType => {
        document.addEventListener(eventType, () => {
            initAudio();
            unlockAudio();
        }, { once: true, passive: true });
    });

    // Page visibility detection for tab focus handling
    function handleVisibilityChange() {
        isTabVisible = !document.hidden;

        if (isTabVisible) {
            console.log('🔄 Tab visible - boosting polling frequency');
            if (currentPollingDelay > 10000) {
                currentPollingDelay = 10000;
                restartBackgroundPolling();
            }
            setTimeout(backgroundCheckTickets, 1000);
        } else {
            console.log('🌙 Tab hidden - maintaining background polling');
        }
    }

    // Heartbeat system to detect if polling has stopped
    function updateHeartbeat() {
        lastHeartbeat = Date.now();
    }

    // Health check to ensure polling is still active
    function performHealthCheck() {
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;

        if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
            console.warn(`🚨 Heartbeat timeout! ${timeSinceLastHeartbeat}ms since last poll. Restarting...`);
            consecutiveFailures++;

            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.error('🚨 Multiple consecutive failures! Performing full restart...');
                performFullRestart();
                consecutiveFailures = 0;
            } else {
                restartBackgroundPolling();
            }
        } else {
            if (consecutiveFailures > 0) {
                console.log('✅ Health check passed - resetting failure counter');
                consecutiveFailures = 0;
            }
        }
    }

    // Restart background polling
    function restartBackgroundPolling() {
        console.log('🔄 Restarting background polling...');

        if (backgroundPollInterval) {
            clearInterval(backgroundPollInterval);
        }

        backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);
        setTimeout(backgroundCheckTickets, 500);
    }

    // Periodic restart to prevent drift and memory leaks
    function performPeriodicRestart() {
        console.log('🔄 Performing periodic restart (hourly maintenance)...');
        restartBackgroundPolling();
    }

    // Full restart of all monitoring systems
    function performFullRestart() {
        console.log('🚨 Performing full system restart...');

        if (backgroundPollInterval) clearInterval(backgroundPollInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        if (periodicRestartInterval) clearInterval(periodicRestartInterval);

        startReliabilitySystem();
    }

    // Start all reliability mechanisms
    function startReliabilitySystem() {
        console.log('🛡️ Starting reliability system...');

        backgroundCheckTickets();
        backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);

        updateHeartbeat();
        heartbeatInterval = setInterval(updateHeartbeat, 5000);

        healthCheckInterval = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);
        periodicRestartInterval = setInterval(performPeriodicRestart, PERIODIC_RESTART_INTERVAL);

        document.addEventListener('visibilitychange', handleVisibilityChange);

        console.log('🛡️ Reliability system active - monitoring health every minute');
    }

    // Flash the page title and tab until focused
    let titleFlashInterval = null;

    function flashPageTitle() {
        const originalTitle = document.title;

        if (titleFlashInterval) {
            clearInterval(titleFlashInterval);
            titleFlashInterval = null;
        }

        titleFlashInterval = setInterval(() => {
            if (document.hidden) {
                document.title = document.title === originalTitle ? '🎫 NEW TICKET! 🎫' : originalTitle;
            } else {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
                document.title = originalTitle;
            }
        }, 800);

        const stopFlashingOnFocus = () => {
            if (!document.hidden && titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
                document.title = originalTitle;
                document.removeEventListener('visibilitychange', stopFlashingOnFocus);
            }
        };

        document.addEventListener('visibilitychange', stopFlashingOnFocus);

        setTimeout(() => {
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
                document.title = originalTitle;
            }
        }, 300000);
    }

    // Try to play the selected audio file
    function playAudioFile() {
        try {
            const selectedSoundKey = getSelectedSound();
            const soundConfig = SOUND_OPTIONS[selectedSoundKey];

            const audio = new Audio();
            audio.src = soundConfig.url;
            audio.volume = 0.7;
            audio.crossOrigin = 'anonymous';

            audio.addEventListener('error', (e) => {
                console.warn(`${soundConfig.emoji} Audio file failed to load:`, e);
            });

            console.log(`${soundConfig.emoji} Attempting to play ${soundConfig.name} from:`, audio.src);

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log(`${soundConfig.emoji} ${soundConfig.name} played successfully!`);
                    })
                    .catch(error => {
                        console.warn(`${soundConfig.emoji} ${soundConfig.name} failed:`, error);
                    });
            }

        } catch (error) {
            console.warn('🔊 Audio file method failed:', error);
        }
    }

    // Visual alert as final fallback
    function playVisualAlert() {
        console.log('🔔🔔🔔 NEW TICKET ALERT! 🔔🔔🔔 (Visual notification)');

        const flashDiv = document.createElement('div');
        flashDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(255, 0, 0, 0.3);
            z-index: 9999;
            pointer-events: none;
            animation: flash 0.5s ease-in-out;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes flash {
                0% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(flashDiv);

        setTimeout(() => {
            if (flashDiv.parentNode) {
                flashDiv.parentNode.removeChild(flashDiv);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 500);
    }

    // Enhanced sound playing with call detection
    function playSelectedSound() {
        // Check if agent is on a call or manually muted
        if (isSoundMuted || detectCallStatus()) {
            console.log('🔇 Sound muted (agent on call or manually muted)');
            flashPageTitle();
            return;
        }

        console.log('🔊 Attempting to play sound...');

        if (!audioInitialized) {
            initAudio();
        }

        setTimeout(() => playAudioFile(), 100);
        setTimeout(() => playVisualAlert(), 200);
    }

    // Request notification permission
    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('🔔 Notification permission:', permission);
            });
        }
    }

    // Background fetch ticket IDs via Zendesk API with rate limiting
    async function backgroundCheckTickets() {
        try {
            updateHeartbeat();

            console.log(`🔍 Background polling for new tickets via API (${currentPollingDelay/1000}s interval)...`);

            const apiUrl = '/api/v2/views/31118901320727/tickets.json?per_page=100';

            const response = await fetch(apiUrl, {
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 429) {
                rateLimitCount++;
                currentPollingDelay = Math.min(currentPollingDelay * 2, 60000);
                console.warn(`⏱️ Rate limited! Increasing interval to ${currentPollingDelay/1000}s (attempt ${rateLimitCount})`);
                restartBackgroundPolling();
                return;
            }

            if (!response.ok) {
                console.warn('🔍 API fetch failed:', response.status);
                consecutiveFailures++;
                return;
            }

            consecutiveFailures = 0;

            if (rateLimitCount > 0) {
                rateLimitCount = 0;
                currentPollingDelay = Math.max(currentPollingDelay * 0.8, 10000);
                console.log(`🔍 API recovered, reducing interval to ${currentPollingDelay/1000}s`);
                restartBackgroundPolling();
            }

            const data = await response.json();
            console.log('🔍 API response tickets:', data.tickets ? data.tickets.length : 0);

            let currentTicketIds = new Set();

            if (data && data.tickets) {
                data.tickets.forEach(ticket => {
                    currentTicketIds.add(ticket.id);
                });
                console.log(`🔍 API extracted ${currentTicketIds.size} ticket IDs`);
            }

            if (typeof window.isInitialLoad === 'undefined') {
                window.isInitialLoad = true;
                window.initialTicketCount = 0;
            }

            if (window.isInitialLoad) {
                const ticketCount = currentTicketIds.size;
                window.initialTicketCount = ticketCount;
                previousTicketIds = new Set(currentTicketIds);
                window.isInitialLoad = false;

                if (ticketCount === 0) {
                    console.log('🔍 Initial load: Queue is empty - will alert on first new ticket');
                } else {
                    console.log(`🔍 Initial load: Found ${ticketCount} existing tickets - will only alert on additional tickets`);
                }
                return;
            }

            if (previousTicketIds.size > 0 || window.initialTicketCount === 0) {
                const newTicketIds = [...currentTicketIds].filter(id => !previousTicketIds.has(id));

                if (newTicketIds.length > 0) {
                    if (window.initialTicketCount === 0 || previousTicketIds.size > 0) {
                        console.log(`🎫 NEW TICKETS DETECTED! ${newTicketIds.length} new ticket(s): ${newTicketIds.join(', ')}`);

                        if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification('🎫 New Zendesk Ticket!', {
                                body: `${newTicketIds.length} new ticket(s): #${newTicketIds.join(', #')}`,
                                icon: 'https://static.zdassets.com/classic/favicon.ico'
                            });
                        }

                        flashPageTitle();
                        playSelectedSound();
                    }
                }

                const removedTicketIds = [...previousTicketIds].filter(id => !currentTicketIds.has(id));
                if (removedTicketIds.length > 0) {
                    console.log(`🗑️ Tickets removed/resolved: ${removedTicketIds.join(', ')}`);
                }
            }

            previousTicketIds = currentTicketIds;
            console.log(`🔍 Tracking ${previousTicketIds.size} tickets`);

        } catch (error) {
            console.warn('🔍 API polling error:', error);
            consecutiveFailures++;
        }
    }

    // Add mute toggle button
    function addMuteToggleButton() {
        if (muteToggleAdded) return;

        const tabBar = document.querySelector('[data-test-id="header-tablist"]');
        if (!tabBar) return;

        const button = document.createElement('button');
        button.id = 'manual-mute-toggle';
        button.style.cssText = `
            margin-left: 8px;
            padding: 6px 12px;
            cursor: pointer;
            font-weight: 500;
            background-color: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
            color: #333;
        `;

        updateMuteButtonState();

        button.addEventListener('click', function() {
            if (!isAgentOnCall) {
                isSoundMuted = !isSoundMuted;
                updateMuteButtonState();
                console.log(isSoundMuted ? '🔇 Sounds manually muted' : '🔊 Sounds manually unmuted');
            }
        });

        button.addEventListener('mouseenter', () => {
            if (!isSoundMuted && !isAgentOnCall) {
                button.style.backgroundColor = '#e9ecef';
            }
        });
        button.addEventListener('mouseleave', () => {
            updateMuteButtonState();
        });

        tabBar.appendChild(button);
        muteToggleAdded = true;
        console.log('✅ Mute toggle button added');
    }

    // Add sound selector dropdown
    function addSoundSelector() {
        if (soundSelectorAdded) return;

        const tabBar = document.querySelector('[data-test-id="header-tablist"]');
        if (!tabBar) return;

        const container = document.createElement('div');
        container.style.cssText = `
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        `;

        const label = document.createElement('span');
        label.textContent = '🔊';
        label.style.cssText = 'font-size: 12px;';

        const selector = document.createElement('select');
        selector.style.cssText = `
            padding: 4px 6px;
            font-size: 11px;
            border: 1px solid #ddd;
            border-radius: 3px;
            background-color: #fff;
            cursor: pointer;
        `;

        Object.entries(SOUND_OPTIONS).forEach(([key, config]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${config.emoji} ${config.name}`;
            selector.appendChild(option);
        });

        selector.value = getSelectedSound();

        selector.addEventListener('change', (e) => {
            const newSound = e.target.value;
            setSelectedSound(newSound);
            initAudio();
            unlockAudio();
            setTimeout(() => {
                playSelectedSound();
            }, 100);
        });

        const testButton = document.createElement('button');
        testButton.textContent = '🔊';
        testButton.title = 'Test current sound';
        testButton.style.cssText = `
            padding: 4px 6px;
            font-size: 11px;
            border: 1px solid #ddd;
            border-radius: 3px;
            background-color: #f8f9fa;
            cursor: pointer;
            margin-left: 2px;
        `;

        testButton.addEventListener('click', () => {
            initAudio();
            unlockAudio();
            playSelectedSound();
        });

        testButton.addEventListener('mouseenter', () => {
            testButton.style.backgroundColor = '#e9ecef';
        });
        testButton.addEventListener('mouseleave', () => {
            testButton.style.backgroundColor = '#f8f9fa';
        });

        container.appendChild(label);
        container.appendChild(selector);
        container.appendChild(testButton);
        tabBar.appendChild(container);

        soundSelectorAdded = true;
        console.log('🔊 Sound selector added');
    }

    // Auto-refresh views
    function autoRefresh() {
        const refreshBtn = document.querySelector('[data-test-id="views_views-list_header-refresh"]');
        if (refreshBtn) {
            refreshBtn.click();
            console.debug('[Auto-Refresh] clicked refresh');
        } else {
            console.warn('[Auto-Refresh] refresh button not found yet');
        }
    }

    // Add Close All button
    function addCloseAllButton() {
        if (closeAllButtonAdded) return;

        const tabBar = document.querySelector('[data-test-id="header-tablist"]');
        if (!tabBar) return;

        const button = document.createElement('button');
        button.textContent = '🗙 Close All';
        button.style.cssText = `
            margin-left: 8px;
            padding: 6px 12px;
            cursor: pointer;
            font-weight: 500;
            background-color: #f8f9fa;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
            color: #333;
        `;

        button.addEventListener('click', function() {
            initAudio();
            unlockAudio();

            const closeBtns = tabBar.querySelectorAll('button[data-test-id="close-button"]');
            closeBtns.forEach(btn => btn.click());
            console.log(`🗙 Closed ${closeBtns.length} tabs`);
        });

        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#e9ecef';
        });
        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = '#f8f9fa';
        });

        tabBar.appendChild(button);
        closeAllButtonAdded = true;
        console.log('✅ Close All button added');
    }

    // Start call detection monitoring
    function startCallDetection() {
        callDetectionInterval = setInterval(detectCallStatus, 2000);
        console.log('📞 Call detection monitoring started');
    }

    // Initialize everything
    function init() {
        console.log('🚀 Initializing...');

        setTimeout(() => {
            initAudio();
        }, 1000);

        if (window.location.href.includes('/agent/filters')) {
            setTimeout(() => {
                autoRefresh();
                refreshInterval = setInterval(autoRefresh, 10000);
                console.log('🔄 Auto-refresh started (filters page only)');
            }, 5000);
        }

        setTimeout(() => {
            console.log('🛡️ Starting background ticket monitoring with reliability features...');
            startReliabilitySystem();
            console.log(`🔍 Background monitoring active with health checks every ${HEALTH_CHECK_INTERVAL/1000}s`);
        }, 3000);

        setTimeout(startCallDetection, 3000);

        requestNotificationPermission();

        const buttonChecker = setInterval(() => {
            addCloseAllButton();
            addSoundSelector();
            addMuteToggleButton();
            if (closeAllButtonAdded && soundSelectorAdded && muteToggleAdded) {
                clearInterval(buttonChecker);
            }
        }, 1000);

        setTimeout(() => clearInterval(buttonChecker), 30000);
    }

    setTimeout(() => {
        init();

        setTimeout(() => {
            try {
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                document.dispatchEvent(clickEvent);

                initAudio();
                unlockAudio();

                console.log('🔊 Enhanced audio initialization complete');
            } catch (error) {
                console.warn('🔊 Enhanced audio init failed:', error);
            }
        }, 1000);
    }, 1000);

    console.log('🔧 Script loaded successfully');

})();
