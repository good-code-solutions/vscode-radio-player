(function () {
    const vscode = acquireVsCodeApi();

    const stationSelect = document.getElementById('station-select');
    const stationNameDisplay = document.getElementById('station-name');
    const statusText = document.getElementById('status-text');
    const audioPlayer = document.getElementById('audio-player');
    const settingsBtn = document.getElementById('settings-btn');
    const togglePlayBtn = document.getElementById('toggle-play-btn');
    const visualizer = document.querySelector('.visualizer');
    const liveIndicator = document.querySelector('.live-indicator');

    // Load initial stations immediately
    if (window.initialStations) {
        updateStations(window.initialStations);
        // Auto-select first station
        if (window.initialStations.length > 0) {
            const first = window.initialStations[0];
            playStation(first.name, first.url, false); // false = don't auto play, just load
        }
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'stations':
                updateStations(message.data);
                break;
            case 'play':
                audioPlayer.play();
                break;
            case 'pause':
                audioPlayer.pause();
                break;
            case 'setStation':
                playStation(message.name, message.url, true);
                break;
            case 'volume':
                audioPlayer.volume = Math.min(1, Math.max(0, message.value));
                break;
        }
    });

    // Event Listeners
    stationSelect.addEventListener('change', () => {
        const url = stationSelect.value;
        const name = stationSelect.options[stationSelect.selectedIndex].dataset.name;
        if (url) {
            playStation(name, url, true);
        }
    });

    togglePlayBtn.addEventListener('click', () => {
        if (audioPlayer.paused) {
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
    });

    settingsBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'openSettings' });
    });

    // Audio Events for UI updates
    audioPlayer.addEventListener('play', () => {
        updateStatus(true);
        vscode.postMessage({ command: 'statusUpdate', data: { isPlaying: true, stationName: stationNameDisplay.textContent } });
    });

    audioPlayer.addEventListener('pause', () => {
        updateStatus(false);
        vscode.postMessage({ command: 'statusUpdate', data: { isPlaying: false, stationName: stationNameDisplay.textContent } });
    });

    audioPlayer.addEventListener('error', (e) => {
        console.error('Audio Error:', e);
        statusText.textContent = 'Error playing stream';
        updateStatus(false);
        vscode.postMessage({ command: 'alert', text: 'Error playing stream. Try another station.' });
    });

    // Functions
    function playStation(name, url, autoPlay) {
        stationNameDisplay.textContent = name;
        statusText.textContent = 'Ready to play';
        audioPlayer.src = url;

        if (autoPlay) {
            statusText.textContent = 'Connecting...';
            audioPlayer.play().catch(e => {
                console.error('Playback error:', e);
                statusText.textContent = 'Playback failed';
            });
        }

        // Update select dropdown to match
        for (let i = 0; i < stationSelect.options.length; i++) {
            if (stationSelect.options[i].dataset.name === name) {
                stationSelect.selectedIndex = i;
                break;
            }
        }
    }

    function updateStations(stations) {
        // Save current selection
        const currentUrl = stationSelect.value;

        stationSelect.innerHTML = '';
        stations.forEach(station => {
            const option = document.createElement('option');
            option.value = station.url;
            option.textContent = station.name;
            option.dataset.name = station.name;
            stationSelect.appendChild(option);
        });

        // Restore selection if possible
        if (currentUrl) {
            stationSelect.value = currentUrl;
        }
    }

    function updateStatus(isPlaying) {
        if (isPlaying) {
            statusText.textContent = 'Playing';
            visualizer.classList.remove('paused');
            liveIndicator.classList.add('active');
            togglePlayBtn.innerHTML = '<span class="codicon codicon-debug-pause"></span>';
        } else {
            statusText.textContent = 'Paused';
            visualizer.classList.add('paused');
            liveIndicator.classList.remove('active');
            togglePlayBtn.innerHTML = '<span class="codicon codicon-play"></span>';
        }
    }
})();
