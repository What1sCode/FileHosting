// ==UserScript==
// @name         Zendesk Multi-Tool with Moo Alert
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-refresh views, Close All button, and cow moo for new tickets
// @author       You
// @match        https://elotouchcare.zendesk.com/agent/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('🐄 Zendesk Multi-Tool Starting...');

    // State variables - ALL DECLARED HERE
    let previousTicketIds = new Set(); // Track actual ticket IDs instead of just count
    let refreshInterval = null;
    let ticketMonitorInterval = null;
    let closeAllButtonAdded = false;

    // Audio context
    let audioContext = null;
    let audioInitialized = false;

    // Background polling with rate limit handling
    let backgroundPollInterval = null;
    let currentPollingDelay = 10000; // Start with 10 seconds
    let rateLimitCount = 0;
    const TARGET_VIEW_URL = 'https://elotouchcare.zendesk.com/agent/filters/31118901320727';

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

    // Play real cow moo sound from GitHub
    function playMooSound() {
        try {
            const audio = new Audio();
            audio.src = 'https://raw.githubusercontent.com/What1sCode/FileHosting/main/cow-moo.mp3';
            audio.volume = 0.7;
            audio.crossOrigin = 'anonymous';

            console.log('🐄 Attempting to play cow moo from:', audio.src);

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('🐄 REAL COW MOO played from GitHub!');
                    })
                    .catch(error => {
                        console.warn('🐄 GitHub audio failed, using backup moo:', error);
                        playBackupMoo();
                    });
            }

        } catch (error) {
            console.warn('🐄 Audio failed, using backup:', error);
            playBackupMoo();
        }
    }

    // Backup synthetic moo if audio file fails
    function playBackupMoo() {
        try {
            if (!audioContext || audioContext.state === 'suspended') {
                console.log('🐄🐄🐄 NEW TICKET ALERT! 🐄🐄🐄 (Audio blocked)');
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

            console.log('🐄 Backup moo played!');

        } catch (error) {
            console.log('🐄🐄🐄 NEW TICKET ALERT! 🐄🐄🐄 (All audio failed)');
        }
    }

    // Flash the page title to get attention
    function flashPageTitle() {
        const originalTitle = document.title;
        let flashCount = 0;
        const maxFlashes = 6;

        const flashInterval = setInterval(() => {
            document.title = flashCount % 2 === 0 ? '🐄 NEW TICKET! 🐄' : originalTitle;
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

    // Background fetch ticket IDs via Zendesk API with rate limiting
    async function backgroundCheckTickets() {
        try {
            console.log(`🔍 Background polling for new tickets via API (${currentPollingDelay/1000}s interval)...`);

            // Use Zendesk's views API to get the actual tickets, not just count
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

            // Extract ticket IDs from API response
            if (data && data.tickets) {
                data.tickets.forEach(ticket => {
                    currentTicketIds.add(ticket.id);
                });
                console.log(`🔍 API extracted ${currentTicketIds.size} ticket IDs`);
            }

            // Check for NEW tickets (IDs that weren't there before)
            if (previousTicketIds.size > 0) { // Only check after first poll
                const newTicketIds = [...currentTicketIds].filter(id => !previousTicketIds.has(id));

                if (newTicketIds.length > 0) {
                    console.log(`🐄 NEW TICKETS DETECTED! ${newTicketIds.length} new ticket(s): ${newTicketIds.join(', ')}`);

                    // Show desktop notification
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification('🐄 New Zendesk Ticket!', {
                            body: `${newTicketIds.length} new ticket(s): #${newTicketIds.join(', #')}`,
                            icon: 'https://static.zdassets.com/classic/favicon.ico'
                        });
                    }

                    // Flash the page title
                    flashPageTitle();

                    // Play the moo sound
                    playMooSound();
                }

                // Also log if tickets were removed (for debugging)
                const removedTicketIds = [...previousTicketIds].filter(id => !currentTicketIds.has(id));
                if (removedTicketIds.length > 0) {
                    console.log(`🗑️ Tickets removed/resolved: ${removedTicketIds.join(', ')}`);
                }
            }

            // Update the tracked ticket IDs
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

        // Auto-refresh only on filter pages
        if (window.location.href.includes('/agent/filters')) {
            setTimeout(() => {
                autoRefresh();
                refreshInterval = setInterval(autoRefresh, 10000);
                console.log('🔄 Auto-refresh started (filters page only)');
            }, 5000);
        }

        // Start background ticket monitoring with adaptive rate limiting
        setTimeout(() => {
            console.log('🔍 Starting background ticket monitoring...');
            backgroundCheckTickets();
            backgroundPollInterval = setInterval(backgroundCheckTickets, currentPollingDelay);
            console.log(`🔍 Background monitoring active - starting with ${currentPollingDelay/1000}s intervals`);
        }, 3000);

        requestNotificationPermission();

        const buttonChecker = setInterval(() => {
            addCloseAllButton();
            if (closeAllButtonAdded) {
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

    console.log('🐄 Script loaded successfully');

})();