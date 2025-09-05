// ==UserScript==
// @name         Zendesk Multi-Tool with Moo Alert
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Auto-refresh views, Close All button, and sound alerts for new tickets
// @author       You
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

    // Background polling with rate limit handling
    let backgroundPollInterval = null;
    let currentPollingDelay = 10000;
    let rateLimitCount = 0;
    const TARGET_VIEW_URL = 'https://elotouchcare.zendesk.com/agent/filters/31118901320727';

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

    // Initialize audio on first user interaction
    function initAudio() {
        if (!audioInitialized) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                audioInitialized = true;
                console.log('🔊 Audio context initialized');
            } catch (error) {
                console.error('🔊 Audio init failed:', error);
            }
        }
    }

    // Backup: Initialize on any user interaction
    ['click', 'keydown', 'touchstart', 'mousedown'].forEach(eventType => {
        document.addEventListener(eventType, initAudio, { once: true, passive: true });
    });

    // Play selected sound from GitHub
    function playSelectedSound() {
        try {
            const selectedSoundKey = getSelectedSound();
            const soundConfig = SOUND_OPTIONS[selectedSoundKey];

            const audio = new Audio();
            audio.src = soundConfig.url;
            audio.volume = 0.7;
            audio.crossOrigin = 'anonymous';

            console.log(`${soundConfig.emoji} Attempting to play ${soundConfig.name} from:`, audio.src);

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log(`${soundConfig.emoji} ${soundConfig.name} played successfully!`);
                    })
                    .catch(error => {
                        console.warn(`${soundConfig.emoji} ${soundConfig.name} failed, using backup:`, error);
                        playBackupMoo();
                    });
            }

        } catch (error) {
            console.warn('🔊 Audio failed, using backup:', error);
            playBackupMoo();
        }
    }

    // Backup synthetic moo if audio file fails
    function playBackupMoo() {
        try {
            if (!audioContext || audioContext.state === 'suspended') {
                console.log('🔔🔔🔔 NEW TICKET ALERT! 🔔🔔🔔 (Audio blocked)');
                return;
            }

            const osc1 = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            osc1.connect(gainNode);
            gainNode.connect(audioContext.destination);

            osc1.frequency.setValueAtTime(90, audioContext.currentTime);
            osc1.frequency.linearRampToValueAtTime(70, audioContext.currentTime + 0.3);
            osc1.frequency.linearRampToValueAtTime(60, audioContext.currentTime + 0.8);
            osc1.frequency.linearRampToValueAtTime(75, audioContext.currentTime + 1.2);

            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(0.25, audioContext.currentTime + 0.8);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 1.3);

            osc1.start(audioContext.currentTime);
            osc1.stop(audioContext.currentTime + 1.3);

            console.log('🔔 Backup sound played!');

        } catch (error) {
            console.log('🔔🔔🔔 NEW TICKET ALERT! 🔔🔔🔔 (All audio failed)');
        }
    }

    // Flash the page title to get attention
    function flashPageTitle() {
        const originalTitle = document.title;
        let flashCount = 0;
        const maxFlashes = 6;

        const flashInterval = setInterval(() => {
            document.title = flashCount % 2 === 0 ? '🎫 NEW TICKET! 🎫' : originalTitle;
            flashCount++;

            if (flashCount >= maxFlashes) {
                clearInterval(flashInterval);
                document.title = originalTitle;
            }
        }, 500);
    }

    // Request notification permission
    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('🔔 Notification permission:', permission);
            });
        }
    }

    // Add sound selector dropdown back to tab bar
    function addSoundSelector() {
        if (soundSelectorAdded) return;

        const tabBar = document.querySelector('[data-test-id="header-tablist"]');
        if (!tabBar) return;

        const container = document.createElement('div');
        container.style.cssText = `
            margin-left: 8px;
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

            // Play test sound
            setTimeout(() => {
                playSelectedSound();
            }, 100);
        });

        // Test button
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

    // Background fetch ticket IDs via Zendesk API with rate limiting
    async function backgroundCheckTickets() {
        try {
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
                console.warn(`🔍 Rate limited! Increasing interval to ${currentPollingDelay/1000}s (attempt ${rateLimitCount})`);

                if (backgroundPollInterval) {
                    clearInterval(backgroundPollInterval);
                    backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);
                }
                return;
            }

            if (!response.ok) {
                console.warn('🔍 API fetch failed:', response.status);
                return;
            }

            if (rateLimitCount > 0) {
                rateLimitCount = 0;
                currentPollingDelay = Math.max(currentPollingDelay * 0.8, 10000);
                console.log(`🔍 API recovered, reducing interval to ${currentPollingDelay/1000}s`);

                if (backgroundPollInterval) {
                    clearInterval(backgroundPollInterval);
                    backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);
                }
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

            if (previousTicketIds.size > 0) {
                const newTicketIds = [...currentTicketIds].filter(id => !previousTicketIds.has(id));

                if (newTicketIds.length > 0) {
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

                const removedTicketIds = [...previousTicketIds].filter(id => !currentTicketIds.has(id));
                if (removedTicketIds.length > 0) {
                    console.log(`🗑️ Tickets removed/resolved: ${removedTicketIds.join(', ')}`);
                }
            }

            previousTicketIds = currentTicketIds;
            console.log(`🔍 Tracking ${previousTicketIds.size} tickets`);

        } catch (error) {
            console.warn('🔍 API polling error:', error);
        }
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

        if (window.location.href.includes('/agent/filters')) {
            setTimeout(() => {
                autoRefresh();
                refreshInterval = setInterval(autoRefresh, 10000);
                console.log('🔄 Auto-refresh started (filters page only)');
            }, 5000);
        }

        setTimeout(() => {
            console.log('🔍 Starting background ticket monitoring...');
            backgroundCheckTickets();
            backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);
            console.log(`🔍 Background monitoring active - starting with ${currentPollingDelay/1000}s intervals`);
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
        setTimeout(() => {
            try {
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                document.dispatchEvent(clickEvent);

                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    if (audioContext.state === 'suspended') {
                        audioContext.resume();
                    }
                    audioInitialized = true;
                    console.log('🔊 Audio auto-initialized');
                }
            } catch (error) {
                console.warn('🔊 Audio auto-init failed:', error);
            }
        }, 1000);
    }, 1000);

    console.log('🔧 Script loaded successfully');

})();

