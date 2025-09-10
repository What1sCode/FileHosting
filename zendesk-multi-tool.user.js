// ==UserScript==
// @name         Zendesk Multi-Tool with Audible Alerts
// @namespace    http://tampermonkey.net/
// @version      1.13
// @description  Auto-refresh views, Close All button, and sound alerts for new tickets
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
    const HEARTBEAT_TIMEOUT = 30000; // 30 seconds
    const HEALTH_CHECK_INTERVAL = 60000; // 1 minute
    const PERIODIC_RESTART_INTERVAL = 3600000; // 1 hour

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

    // Initialize audio context and unlock audio
    function initAudio() {
        if (!audioInitialized) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                audioInitialized = true;
                console.log('🔊 Audio context initialized');

                // Try to resume context if suspended
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
            // Create a silent sound to unlock audio
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
            // Boost polling when tab becomes active
            if (currentPollingDelay > 10000) {
                currentPollingDelay = 10000;
                restartBackgroundPolling();
            }
            // Immediate check when tab becomes visible
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
            // Reset failure counter on successful health check
            if (consecutiveFailures > 0) {
                console.log('✅ Health check passed - resetting failure counter');
                consecutiveFailures = 0;
            }
        }
    }

    // Restart background polling
    function restartBackgroundPolling() {
        console.log('🔄 Restarting background polling...');

        // Clear existing interval
        if (backgroundPollInterval) {
            clearInterval(backgroundPollInterval);
        }

        // Start fresh
        backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);

        // Immediate check
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

        // Clear all intervals
        if (backgroundPollInterval) clearInterval(backgroundPollInterval);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        if (periodicRestartInterval) clearInterval(periodicRestartInterval);

        // Restart everything
        startReliabilitySystem();
    }

    // Start all reliability mechanisms
    function startReliabilitySystem() {
        console.log('🛡️ Starting reliability system...');

        // Start background monitoring
        backgroundCheckTickets(); // Initial check
        backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);

        // Start heartbeat monitoring
        updateHeartbeat();
        heartbeatInterval = setInterval(updateHeartbeat, 5000); // Update every 5 seconds

        // Start health checks
        healthCheckInterval = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);

        // Start periodic restarts
        periodicRestartInterval = setInterval(performPeriodicRestart, PERIODIC_RESTART_INTERVAL);

        // Setup page visibility handling
        document.addEventListener('visibilitychange', handleVisibilityChange);

        console.log('🛡️ Reliability system active - monitoring health every minute');
    }

    // Enhanced sound playing
    function playSelectedSound() {
        console.log('🔊 Attempting to play sound...');

        // Ensure audio is initialized
        if (!audioInitialized) {
            initAudio();
        }

        // Try to play audio file with fallback to visual alert
        setTimeout(() => playAudioFile(), 100);
        setTimeout(() => playVisualAlert(), 200);
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

            // Add error handling
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

        // Create a visual flash effect
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

    // Flash the page title and tab until focused
    let titleFlashInterval = null;

    function flashPageTitle() {
        const originalTitle = document.title;

        // Clear any existing flash interval
        if (titleFlashInterval) {
            clearInterval(titleFlashInterval);
            titleFlashInterval = null;
        }

        // Start flashing
        titleFlashInterval = setInterval(() => {
            if (document.hidden) {
                // Tab is not focused, keep flashing
                document.title = document.title === originalTitle ? '🎫 NEW TICKET! 🎫' : originalTitle;
            } else {
                // Tab is focused, stop flashing and restore original title
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
                document.title = originalTitle;
            }
        }, 800);

        // Also set up a listener to stop flashing when tab becomes visible
        const stopFlashingOnFocus = () => {
            if (!document.hidden && titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
                document.title = originalTitle;
                document.removeEventListener('visibilitychange', stopFlashingOnFocus);
            }
        };

        document.addEventListener('visibilitychange', stopFlashingOnFocus);

        // Fallback: stop flashing after 5 minutes regardless
        setTimeout(() => {
            if (titleFlashInterval) {
                clearInterval(titleFlashInterval);
                titleFlashInterval = null;
                document.title = originalTitle;
            }
        }, 300000); // 5 minutes
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
            // Update heartbeat to show we're still alive
            updateHeartbeat();

            console.log(`🔍 Background polling for new tickets via API (${currentPollingDelay/1000}s interval)...`);
            console.log(`🔍 Debug: isInitialLoad = ${typeof isInitialLoad !== 'undefined' ? isInitialLoad : 'UNDEFINED'}, initialTicketCount = ${typeof initialTicketCount !== 'undefined' ? initialTicketCount : 'UNDEFINED'}`);

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
                console.warn(`🔍 Rate limited! Increasing interval to ${currentPollingDelay/1000}s (attempt ${rateLimitCount})`);

                restartBackgroundPolling();
                return;
            }

            if (!response.ok) {
                console.warn('🔍 API fetch failed:', response.status);
                consecutiveFailures++;
                return;
            }

            // Reset failure count on successful response
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

            // Initialize variables if they're undefined (fallback for scope issues)
            if (typeof isInitialLoad === 'undefined') {
                console.warn('🔍 isInitialLoad was undefined, reinitializing...');
                window.isInitialLoad = true;
                window.initialTicketCount = 0;
            }

            // Handle initial load
            if ((typeof isInitialLoad !== 'undefined' ? isInitialLoad : window.isInitialLoad)) {
                const ticketCount = currentTicketIds.size;
                if (typeof initialTicketCount !== 'undefined') {
                    initialTicketCount = ticketCount;
                } else {
                    window.initialTicketCount = ticketCount;
                }

                previousTicketIds = new Set(currentTicketIds);

                if (typeof isInitialLoad !== 'undefined') {
                    isInitialLoad = false;
                } else {
                    window.isInitialLoad = false;
                }

                if (ticketCount === 0) {
                    console.log('🔍 Initial load: Queue is empty - will alert on first new ticket');
                } else {
                    console.log(`🔍 Initial load: Found ${ticketCount} existing tickets - will only alert on additional tickets`);
                }
                return;
            }

            // Check for new tickets (only after initial load)
            const currentInitialCount = typeof initialTicketCount !== 'undefined' ? initialTicketCount : window.initialTicketCount;
            if (previousTicketIds.size > 0 || currentInitialCount === 0) {
                const newTicketIds = [...currentTicketIds].filter(id => !previousTicketIds.has(id));

                if (newTicketIds.length > 0) {
                    // Special case: if we started with 0 tickets, any ticket should trigger alert
                    if (currentInitialCount === 0 || previousTicketIds.size > 0) {
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

    // Add sound selector dropdown back to tab bar
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

        // Add options
        Object.entries(SOUND_OPTIONS).forEach(([key, config]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${config.emoji} ${config.name}`;
            selector.appendChild(option);
        });

        // Set current selection
        selector.value = getSelectedSound();

        // Handle changes
        selector.addEventListener('change', (e) => {
            const newSound = e.target.value;
            setSelectedSound(newSound);

            // Initialize audio on user interaction
            initAudio();
            unlockAudio();

            // Play test sound
            setTimeout(() => {
                playSelectedSound();
            }, 100);
        });

        // Test button with enhanced audio initialization
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
            // Force audio initialization on button click
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

    // Add Close All button back to tab bar
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
            // Initialize audio on user interaction
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

    // Initialize everything
    function init() {
        console.log('🚀 Initializing...');

        // Initialize audio early
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

        requestNotificationPermission();

        const buttonChecker = setInterval(() => {
            addCloseAllButton();
            addSoundSelector();
            if (closeAllButtonAdded && soundSelectorAdded) {
                clearInterval(buttonChecker);
            }
        }, 1000);

        setTimeout(() => clearInterval(buttonChecker), 30000);
    }

    // Wait for page to load then initialize
    setTimeout(() => {
        init();

        // Enhanced audio initialization
        setTimeout(() => {
            try {
                // Create a fake user interaction to unlock audio
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




