// ==UserScript==
// @name         Zendesk Multi-Tool with Audible Alerts
// @namespace    http://tampermonkey.net/
// @version      1.15
// @description  Auto-refresh views, Close All button, sound alerts with call detection
// @author       Roger Rhodes
// @match        https://elotouchcare.zendesk.com/agent/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/What1sCode/FileHosting/main/zendesk-multi-tool.user.js
// @updateURL    https://raw.githubusercontent.com/What1sCode/FileHosting/main/zendesk-multi-tool.user.js
// ==/UserScript==

function addMuteToggleButton() {
        if (muteToggleAdded) return;

        //Query flex item
        const tabBar = document.querySelector('[class="sc-gFVvzn cSMvKx"]');
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

        //Append after flex item
        tabBar.after(button);
        muteToggleAdded = true;
        console.log('✅ Mute toggle button added');
        updateMuteButtonState();
    }

    // Add sound selector dropdown
    function addSoundSelector() {
        if (soundSelectorAdded) return;

        //Changed query to the mute toggle button
        const tabBar = document.querySelector('[id="manual-mute-toggle"]');
        if (!tabBar) return;

        const container = document.createElement('div');
        container.style.cssText = `
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        `;

        const label = document.createElement('span');
        //label.textContent = '🔊';
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

        //Append before mute toggle button
        tabBar.before(container);

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
