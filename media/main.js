import * as THREE from 'three';
import Globe from 'globe.gl';
import Hls from 'hls.js';
import worldCountries from './world-countries.json';
import { createIcons, Earth, Heart, Library, Radio, Tags } from 'lucide';

(function () {
    const vscode = acquireVsCodeApi();

    const stationSelect = document.getElementById('station-select');
    const countrySelect = document.getElementById('country-select');
    const stationNameDisplay = document.getElementById('station-name');
    const statusText = document.getElementById('status-text');
    const playerCard = document.querySelector('.player-card');
    const audioPlayer = document.getElementById('audio-player');
    const settingsBtn = document.getElementById('settings-btn');
    const togglePlayBtn = document.getElementById('toggle-play-btn');
    const previousStationBtn = document.getElementById('previous-station-btn');
    const nextStationBtn = document.getElementById('next-station-btn');
    const liveIndicator = document.querySelector('.live-indicator');
    const collectionToggleBtn = document.getElementById('collection-toggle');
    const stationCount = document.getElementById('station-count');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    const muteBtn = document.getElementById('mute-btn');
    const globe = document.getElementById('globe');
    const globeRenderer = document.getElementById('globe-renderer');
    const focusedStationLabel = document.getElementById('globe-focused-station');
    const earthStatus = document.getElementById('earth-status');
    const earthStationControls = document.getElementById('earth-station-controls');
    const earthStationName = document.getElementById('earth-station-name');
    const genreSelect = document.getElementById('genre-select');
    const genreStationsList = document.getElementById('genre-stations');
    const genreStatus = document.getElementById('genre-status');
    const stationBackdrop = document.getElementById('station-backdrop');
    const stationCover = document.getElementById('station-cover');

    let countries = [
        { code: 'at', name: 'Austria', lat: 47.5, lon: 14.5 },
        { code: 'be', name: 'Belgium', lat: 50.5, lon: 4.7 },
        { code: 'ca', name: 'Canada', lat: 56.1, lon: -106.3 },
        { code: 'hr', name: 'Croatia', lat: 45.1, lon: 15.2 },
        { code: 'dk', name: 'Denmark', lat: 56.2, lon: 9.5 },
        { code: 'ee', name: 'Estonia', lat: 58.6, lon: 25.0 },
        { code: 'fi', name: 'Finland', lat: 64.0, lon: 26.0 },
        { code: 'fr', name: 'France', lat: 46.6, lon: 2.2 },
        { code: 'de', name: 'Germany', lat: 51.2, lon: 10.4 },
        { code: 'gr', name: 'Greece', lat: 39.0, lon: 22.0 },
        { code: 'ie', name: 'Ireland', lat: 53.4, lon: -8.0 },
        { code: 'it', name: 'Italy', lat: 42.5, lon: 12.5 },
        { code: 'lu', name: 'Luxembourg', lat: 49.8, lon: 6.1 },
        { code: 'nl', name: 'Netherlands', lat: 52.1, lon: 5.3 },
        { code: 'no', name: 'Norway', lat: 60.5, lon: 8.5 },
        { code: 'rs', name: 'Serbia', lat: 44.0, lon: 21.0 },
        { code: 'sk', name: 'Slovakia', lat: 48.7, lon: 19.7 },
        { code: 'si', name: 'Slovenia', lat: 46.2, lon: 15.0 },
        { code: 'es', name: 'Spain', lat: 40.4, lon: -3.7 },
        { code: 'se', name: 'Sweden', lat: 60.1, lon: 18.6 },
        { code: 'ch', name: 'Switzerland', lat: 46.8, lon: 8.2 },
        { code: 'gb', name: 'United Kingdom', lat: 54.0, lon: -2.0 }
    ];

    let customStations = [];
    let countryStations = [];
    let activeStations = [];
    let activeIndex = -1;
    let activeView = 'collection';
    let selectedCountry = '';
    let countryLoadingFor = '';
    let currentStation;
    let genresLoading = false;
    let directoryReady = false;
    let countriesLoaded = false;
    let countriesLoading = false;
    let countriesErrorMessage = '';
    let globeStations = [];
    let globePoints = [];
    let focusedGlobeStation;
    let globeStationsLoaded = false;
    let globeStationsLoading = false;
    let globeStationsErrorMessage = '';
    let genres = [];
    let genreStations = [];
    let selectedGenre = '';
    let genreStationsLoading = '';
    let genresLoaded = false;
    let isPlaying = false;
    let isBuffering = false;
    let lastVolume = Number(volumeSlider.value) / 100;
    let suppressNextPauseBroadcast = false;
    let globeInstance;
    let hlsInstance;
    let hlsReady = false;
    let currentMediaUrl = '';
    let playbackRequestId = 0;
    let fallbackAttemptedRequestId = -1;
    let hlsRecoveryAttemptedRequestId = -1;
    let hlsFallbackAttemptedUrl = '';
    let pendingPlayRequestId;
    let centerSelectionTimer;

    audioPlayer.volume = lastVolume;
    setVolume(lastVolume);
    createIcons({ icons: { Earth, Heart, Library, Radio, Tags } });
    populateCountries();
    renderGlobeMarkers();

    if (window.initialStations) {
        updateStations(window.initialStations);
        if (customStations.length > 0) {
            activeStations = customStations;
            activeIndex = 0;
            displayStation(customStations[0], false);
        }
    }

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'stations':
                updateStations(message.data);
                break;
            case 'play':
                playCurrentStation();
                break;
            case 'pause':
                audioPlayer.pause();
                break;
            case 'setStation':
                if (message.station) {
                    displayStation(message.station, false);
                } else if (message.name && message.url) {
                    displayStation({ name: message.name, url: message.url }, false);
                }
                break;
            case 'volume':
                setVolume(message.value);
                break;
            case 'state':
                applyRemoteState(message.data);
                break;
            case 'directoryStatus':
                directoryReady = message.ready;
                updateDirectoryStatus();
                break;
            case 'countries':
                countriesLoading = false;
                countriesLoaded = true;
                countriesErrorMessage = '';
                updateCountries(message.data);
                updateExploreLoading();
                break;
            case 'countriesError':
                countriesLoading = false;
                countriesLoaded = true;
                countriesErrorMessage = message.message;
                updateExploreLoading();
                break;
            case 'globeStations':
                globeStationsLoading = false;
                globeStationsLoaded = true;
                globeStationsErrorMessage = '';
                globeStations = Array.isArray(message.data)
                    ? message.data.filter(station =>
                        station && typeof station.name === 'string' && station.name.trim() &&
                        /^[a-z]{2}$/.test(station.countryCode) &&
                        Number.isFinite(station.latitude) && station.latitude >= -90 && station.latitude <= 90 &&
                        Number.isFinite(station.longitude) && station.longitude >= -180 && station.longitude <= 180
                    )
                    : [];
                focusedGlobeStation = undefined;
                updateFocusedStationLabel();
                renderGlobeMarkers();
                updateExploreLoading();
                break;
            case 'globeStationsError':
                globeStationsLoading = false;
                globeStationsLoaded = true;
                globeStationsErrorMessage = message.message;
                console.error('Unable to load globe station locations:', message.message);
                updateExploreLoading();
                break;
            case 'genres':
                genresLoading = false;
                genresLoaded = true;
                updateGenres(message.data);
                break;
            case 'genreStations':
                if (message.genre === selectedGenre) {
                    updateGenreStations(message.data);
                }
                break;
            case 'genresError':
                genresLoading = false;
                setStatus(genreStatus, message.message);
                break;
            case 'genreStationsError':
                if (message.genre === selectedGenre) {
                    genreStationsLoading = '';
                    setStatus(genreStatus, message.message);
                }
                break;
            case 'countryStations':
                if (message.country === selectedCountry) {
                    countryLoadingFor = '';
                    setCountryStations(message.data);
                }
                break;
            case 'apiError':
                if (message.country === selectedCountry) {
                    countryLoadingFor = '';
                    setStatus(earthStatus, message.message);
                }
                break;
            case 'collectionStationToggled':
                updateCollectionToggle();
                break;
            case 'collectionStationError':
                statusText.textContent = message.message;
                break;
        }
    });

    document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => setView(tab.dataset.view));
    });

    stationSelect.addEventListener('change', () => {
        const selected = customStations.find(station => station.url === stationSelect.value);
        if (selected) {
            activeStations = customStations;
            activeIndex = customStations.indexOf(selected);
            sendStationCommand(selected);
        }
    });

    countrySelect.addEventListener('change', () => {
        if (countrySelect.value) {
            selectCountry(countrySelect.value, true);
        }
    });

    genreSelect.addEventListener('change', () => {
        if (genreSelect.value) {
            loadGenre(genreSelect.value);
        }
    });

    togglePlayBtn.addEventListener('click', () => {
        if (isPlaying || isBuffering) {
            pendingPlayRequestId = undefined;
            setBuffering(false);
            const wasPlayingLocally = !audioPlayer.paused;
            audioPlayer.pause();
            if (!wasPlayingLocally) {
                updateStatus(false);
                publishPlaybackState(false);
            }
        } else if (currentStation?.url) {
            playCurrentStation();
        } else {
            statusText.textContent = 'Choose a station first';
        }
    });

    collectionToggleBtn.addEventListener('click', () => {
        if (!currentStation?.url || collectionToggleBtn.disabled) {
            return;
        }
        vscode.postMessage({ command: 'toggleCollectionStation', station: currentStation });
    });

    previousStationBtn.addEventListener('click', () => changeStation(-1));
    nextStationBtn.addEventListener('click', () => changeStation(1));
    document.getElementById('earth-previous-btn').addEventListener('click', () => changeStation(-1));
    document.getElementById('earth-next-btn').addEventListener('click', () => changeStation(1));
    genreStationsList.addEventListener('click', event => {
        if (!(event.target instanceof Element)) {
            return;
        }
        const button = event.target.closest('[data-station-index]');
        if (!button) {
            return;
        }
        const station = genreStations[Number(button.dataset.stationIndex)];
        if (station) {
            activeStations = genreStations;
            activeIndex = Number(button.dataset.stationIndex);
            displayStation(station, true, 'genre');
        }
    });

    volumeSlider.addEventListener('input', () => setVolume(Number(volumeSlider.value) / 100));

    muteBtn.addEventListener('click', () => {
        if (audioPlayer.volume > 0) {
            lastVolume = audioPlayer.volume;
            setVolume(0);
        } else {
            setVolume(lastVolume || 0.75);
        }
    });

    settingsBtn.addEventListener('click', () => vscode.postMessage({ command: 'openSettings' }));

    audioPlayer.addEventListener('play', () => {
        updateStatus(true);
        publishPlaybackState(true);
    });

    audioPlayer.addEventListener('playing', () => {
        pendingPlayRequestId = undefined;
        setBuffering(false);
        statusText.textContent = 'Playing';
    });

    audioPlayer.addEventListener('waiting', () => {
        setBuffering(true);
    });

    audioPlayer.addEventListener('stalled', () => {
        setBuffering(true);
    });

    audioPlayer.addEventListener('pause', () => {
        if (suppressNextPauseBroadcast) {
            suppressNextPauseBroadcast = false;
            return;
        }
        pendingPlayRequestId = undefined;
        setBuffering(false);
        updateStatus(false);
        publishPlaybackState(false);
    });

    audioPlayer.addEventListener('error', event => {
        if (hlsInstance && isHlsStream(currentStation)) {
            return;
        }
        const mediaError = audioPlayer.error;
        if (mediaError?.code === 1) {
            return;
        }
        if (
            (mediaError?.code === 2 || mediaError?.code === 4) &&
            currentStation?.fallbackUrl &&
            currentStation.fallbackUrl !== currentStation.url &&
            fallbackAttemptedRequestId !== playbackRequestId
        ) {
            fallbackAttemptedRequestId = playbackRequestId;
            console.warn(`Primary stream failed; trying alternate stream for ${currentStation.name}.`);
            audioPlayer.src = currentStation.fallbackUrl;
            audioPlayer.load();
            playCurrentStation(playbackRequestId);
            return;
        }
        const details = mediaError
            ? ({
                1: 'Playback was interrupted.',
                2: 'The network could not load this stream.',
                3: 'The stream could not be decoded.',
                4: currentStation?.codec
                    ? `The ${currentStation.codec} stream could not be played. The station may be offline, its stream URL may be invalid, or the format may not be supported.`
                    : 'The stream could not be played. It may be offline, have an invalid URL, or use an unsupported format.'
            })[mediaError.code] ?? 'The stream could not be played.'
            : 'The stream could not be played.';
        const finalDetails = fallbackAttemptedRequestId === playbackRequestId
            ? `${details} The station's alternate stream URL also failed. Try another stream URL or an MP3/OGG version.`
            : details;
        console.error('Audio error:', mediaError ?? event);
        setBuffering(false);
        statusText.textContent = finalDetails;
        updateStatus(false);
        publishPlaybackState(false);
        vscode.postMessage({ command: 'alert', text: `${finalDetails} Try another station or verify the stream URL.` });
    });

    globe.addEventListener('keydown', event => {
        if (!globeInstance) {
            return;
        }
        const pointOfView = globeInstance.pointOfView();
        const nextPointOfView = { ...pointOfView };
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            nextPointOfView.lng += event.key === 'ArrowLeft' ? -10 : 10;
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            nextPointOfView.lat = clamp(
                pointOfView.lat + (event.key === 'ArrowUp' ? 10 : -10),
                -85,
                85
            );
        } else {
            return;
        }
        event.preventDefault();
        globeInstance.pointOfView(nextPointOfView, 250);
    });

    function updateStations(stations) {
        customStations = Array.isArray(stations) ? stations.filter(station => station?.name && station?.url) : [];
        stationSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = customStations.length ? 'Choose a station...' : 'No stations configured';
        placeholder.disabled = true;
        placeholder.selected = true;
        stationSelect.appendChild(placeholder);

        customStations.forEach(station => {
            const option = document.createElement('option');
            option.value = station.url;
            option.textContent = station.name;
            stationSelect.appendChild(option);
        });

        const selectedStation = customStations.find(station => station.url === currentStation?.url);
        if (selectedStation) {
            stationSelect.value = selectedStation.url;
        }
        stationCount.textContent = `${customStations.length} ${customStations.length === 1 ? 'station' : 'stations'}`;
        if (activeView === 'collection') {
            activeStations = customStations;
            activeIndex = customStations.findIndex(station => station.url === currentStation?.url);
        }
        updateCollectionToggle();
    }

    function populateCountries() {
        countrySelect.querySelectorAll('option:not(:first-child)').forEach(option => option.remove());
        globeInstance?.pointsData([]);
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country.code;
            option.textContent = country.name;
            countrySelect.appendChild(option);
        });
        countrySelect.value = selectedCountry;
    }

    function updateCountries(countryData) {
        if (!Array.isArray(countryData)) {
            return;
        }
        const knownCountries = new Map(countries.map(country => [country.code, country]));
        const apiCountries = countryData.flatMap(country => {
            if (!country || typeof country.code !== 'string' || !/^[a-z]{2}$/.test(country.code) ||
                typeof country.name !== 'string' || !country.name.trim()) {
                return [];
            }
            const known = knownCountries.get(country.code);
            const lat = Number.isFinite(country.latitude) ? country.latitude : known?.lat;
            const lon = Number.isFinite(country.longitude) ? country.longitude : known?.lon;
            return [{ code: country.code, name: country.name.trim(), lat, lon }];
        });
        const combined = new Map(countries.map(country => [country.code, country]));
        apiCountries.forEach(country => combined.set(country.code, { ...combined.get(country.code), ...country }));
        countries = Array.from(combined.values()).sort((left, right) => left.name.localeCompare(right.name));
        populateCountries();
        renderGlobeMarkers();
    }

    function initializeGlobe() {
        try {
            globeInstance = new Globe(globeRenderer)
                .backgroundColor('rgba(0, 0, 0, 0)')
                .showAtmosphere(true)
                .atmosphereColor('#61caff')
                .atmosphereAltitude(0.2)
                .globeMaterial(new THREE.MeshPhongMaterial({
                    color: 0x17405a,
                    specular: 0x9fc5d2,
                    shininess: 28
                }))
                .hexPolygonsData(worldCountries.features.filter(feature =>
                    feature.properties.ISO_A2 && feature.properties.ISO_A2 !== '-99'
                ))
                .hexPolygonResolution(3)
                .hexPolygonMargin(0.12)
                .hexPolygonUseDots(false)
                .hexPolygonAltitude(0.012)
                .hexPolygonColor(feature =>
                    feature.properties.ISO_A2.toLowerCase() === selectedCountry ? '#71e6ad' : '#438c79'
                )
                .hexPolygonLabel(feature => escapeHtml(feature.properties.ADMIN))
                .onHexPolygonClick(feature => {
                    const code = feature.properties.ISO_A2.toLowerCase();
                    const country = countries.find(item => item.code === code);
                    if (country) {
                        selectCountry(code, true, true);
                    }
                })
                .onGlobeReady(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(resizeGlobe);
                        renderGlobeMarkers();
                    });
                })
                .pointsData([])
                .pointLat('lat')
                .pointLng('lon')
                .pointAltitude(point => point.isCurrentStation || point.isFocusedStation
                    ? 0.035
                    : point.countryCode === selectedCountry ? 0.022 : 0.009)
                .pointRadius(point => point.isCurrentStation || point.isFocusedStation
                    ? 0.045
                    : point.countryCode === selectedCountry ? 0.034 : 0.022)
                .pointColor(point => point.isCurrentStation
                    ? '#a6f1dc'
                    : point.isFocusedStation
                        ? '#c8ffe4'
                    : point.countryCode === selectedCountry
                        ? 'rgba(72, 255, 171, 0.92)'
                        : 'rgba(137, 213, 194, 0.24)')
                .pointLabel(point => escapeHtml(point.name))
                .onPointClick(point => {
                    selectCountry(point.countryCode, true, false);
                    globeInstance.pointOfView({ lat: point.lat, lng: point.lon, altitude: 1.6 }, 700);
                    if (point.url) {
                        const station = {
                            name: point.name,
                            url: point.url,
                            stationUuid: point.stationUuid,
                            codec: point.codec,
                            country: point.countryCode,
                            latitude: point.lat,
                            longitude: point.lon
                        };
                        displayStation(station, false, 'earth');
                        earthStationControls.hidden = false;
                        earthStationName.textContent = point.name;
                    }
                })
                .onGlobeClick(({ lat, lng }) => selectNearestCountry(lat, lng));

            const controls = globeInstance.controls();
            controls.enablePan = false;
            controls.enableZoom = false;
            controls.autoRotate = false;
            controls.addEventListener('change', scheduleCenterCountryCheck);
        } catch (error) {
            console.error('Unable to initialize globe.gl:', error);
            earthStatus.textContent = 'The 3D globe is unavailable. Check that WebGL is enabled.';
            return;
        }

        const resizeObserver = new ResizeObserver(resizeGlobe);
        resizeObserver.observe(globe);
        window.addEventListener('resize', resizeGlobe);
        globeInstance.pointOfView({ lat: 20, lng: 0, altitude: 2.2 });
        requestAnimationFrame(resizeGlobe);
        renderGlobeMarkers();
        scheduleCenterCountryCheck();
    }

    function resizeGlobe() {
        if (!globeInstance) {
            return;
        }
        const { width, height } = globeRenderer.getBoundingClientRect();
        if (!width || !height) {
            return;
        }
        globeInstance.width(width).height(height);
    }

    function renderGlobeMarkers() {
        if (!globeInstance) {
            return;
        }
        const stationsByUuid = new Map();
        const stationsByUrl = new Map();
        const points = globeStations.map(station => ({
            name: station.name,
            countryCode: station.countryCode,
            lat: station.latitude,
            lon: station.longitude,
            stationUuid: station.stationUuid,
            url: station.url,
            codec: station.codec
        }));
        points.forEach(point => {
            if (point.stationUuid) {
                stationsByUuid.set(point.stationUuid, point);
            }
            if (point.url) {
                stationsByUrl.set(point.url, point);
            }
        });
        countryStations.forEach(station => {
            if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) {
                return;
            }
            const existing = (station.stationUuid && stationsByUuid.get(station.stationUuid)) ||
                stationsByUrl.get(station.url);
            if (existing) {
                return;
            }
            const point = {
                name: station.name,
                countryCode: station.country ?? selectedCountry,
                lat: station.latitude,
                lon: station.longitude,
                stationUuid: station.stationUuid,
                url: station.url,
                codec: station.codec
            };
            points.push(point);
            if (point.stationUuid) {
                stationsByUuid.set(point.stationUuid, point);
            }
            stationsByUrl.set(point.url, point);
        });
        globePoints = points;
        points.forEach(point => {
            point.isCurrentStation = Boolean(
                (currentStation?.stationUuid && point.stationUuid === currentStation.stationUuid) ||
                (currentStation?.url && point.url === currentStation.url)
            );
            point.isFocusedStation = Boolean(
                focusedGlobeStation &&
                ((focusedGlobeStation.stationUuid && point.stationUuid === focusedGlobeStation.stationUuid) ||
                    (focusedGlobeStation.url && point.url === focusedGlobeStation.url))
            );
        });
        globeInstance
            .hexPolygonColor(feature =>
                feature.properties.ISO_A2.toLowerCase() === selectedCountry ? '#71e6ad' : '#438c79'
            )
            .pointsData(points)
            .pointColor(point => point.isCurrentStation
                ? '#a6f1dc'
                : point.isFocusedStation
                    ? '#c8ffe4'
                : point.countryCode === selectedCountry
                    ? 'rgba(72, 255, 171, 0.92)'
                    : 'rgba(137, 213, 194, 0.24)')
            .pointAltitude(point => point.isCurrentStation || point.isFocusedStation
                ? 0.035
                : point.countryCode === selectedCountry ? 0.022 : 0.009)
            .pointRadius(point => point.isCurrentStation || point.isFocusedStation
                ? 0.045
                : point.countryCode === selectedCountry ? 0.034 : 0.022);
        updateFocusedStationLabel();
    }

    function selectNearestCountry(latitude, longitude) {
        const closest = findNearestCountry(latitude, longitude);
        if (closest && closest.distance < 12) {
            selectCountry(closest.code, true, false);
        }
    }

    function scheduleCenterCountryCheck() {
        window.clearTimeout(centerSelectionTimer);
        centerSelectionTimer = window.setTimeout(() => {
            if (!globeInstance || activeView !== 'earth') {
                return;
            }
            const { lat, lng } = globeInstance.pointOfView();
            const centeredStation = findNearestGlobeStation(lat, lng);
            focusedGlobeStation = centeredStation && centeredStation.distance < 3.5
                ? centeredStation.station
                : undefined;
            updateFocusedStationLabel();
            renderGlobeMarkers();
            const closest = findNearestCountry(lat, lng);
            if (closest && closest.distance < 5 && closest.code !== selectedCountry) {
                selectCountry(closest.code, true, false);
            }
        }, 240);
    }

    function findNearestGlobeStation(latitude, longitude) {
        let closest;
        let closestDistance = Infinity;
        globePoints.forEach(station => {
            const lat1 = latitude * Math.PI / 180;
            const lat2 = (station.latitude ?? station.lat) * Math.PI / 180;
            const deltaLongitude = ((station.longitude ?? station.lon) - longitude) * Math.PI / 180;
            const cosine = Math.sin(lat1) * Math.sin(lat2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude);
            const distance = Math.acos(clamp(cosine, -1, 1)) * 180 / Math.PI;
            if (distance < closestDistance) {
                closest = station;
                closestDistance = distance;
            }
        });
        return closest ? { station: closest, distance: closestDistance } : undefined;
    }

    function updateFocusedStationLabel() {
        if (!focusedStationLabel) {
            return;
        }
        if (!focusedGlobeStation) {
            focusedStationLabel.hidden = true;
            focusedStationLabel.textContent = '';
            return;
        }
        focusedStationLabel.hidden = false;
        focusedStationLabel.textContent = `${focusedGlobeStation.name} · ${focusedGlobeStation.countryCode.toUpperCase()}`;
    }

    function findNearestCountry(latitude, longitude) {
        let closest;
        let closestDistance = Infinity;
        const locatedCountries = new Set(globeStations.map(station => station.countryCode));
        const candidates = globeStations.concat(
            countries.filter(country =>
                !locatedCountries.has(country.code) &&
                Number.isFinite(country.lat) &&
                Number.isFinite(country.lon)
            ).map(country => ({
                countryCode: country.code,
                latitude: country.lat,
                longitude: country.lon
            }))
        );

        candidates.forEach(point => {
            const pointLatitude = point.latitude ?? point.lat;
            const pointLongitude = point.longitude ?? point.lon;
            const lat1 = latitude * Math.PI / 180;
            const lat2 = pointLatitude * Math.PI / 180;
            const deltaLongitude = (pointLongitude - longitude) * Math.PI / 180;
            const cosine = Math.sin(lat1) * Math.sin(lat2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude);
            const distance = Math.acos(clamp(cosine, -1, 1)) * 180 / Math.PI;
            if (distance < closestDistance) {
                closest = point;
                closestDistance = distance;
            }
        });
        return closest
            ? { code: closest.countryCode ?? closest.code, distance: closestDistance }
            : undefined;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function selectCountry(code, loadStations, center = true) {
        const country = countries.find(item => item.code === code);
        if (!country) {
            return;
        }
        selectedCountry = code;
        countrySelect.value = code;
        const stationLocation = globeStations.find(station => station.countryCode === code);
        const latitude = Number.isFinite(country.lat) ? country.lat : stationLocation?.latitude;
        const longitude = Number.isFinite(country.lon) ? country.lon : stationLocation?.longitude;
        if (center && globeInstance && Number.isFinite(latitude) && Number.isFinite(longitude)) {
            globeInstance.pointOfView({ lat: latitude, lng: longitude, altitude: 1.6 }, 700);
        }
        renderGlobeMarkers();
        countryStations = [];
        activeStations = [];
        activeIndex = -1;
        earthStationControls.hidden = true;

        if (!directoryReady) {
            setStatus(earthStatus, 'Connecting to the Radio Browser directory...', true);
            return;
        }
        if (!loadStations) {
            return;
        }
        countryLoadingFor = code;
        setStatus(earthStatus, `Finding stations in ${country.name}...`, true);
        vscode.postMessage({ command: 'loadCountry', country: code });
    }

    function setCountryStations(stations) {
        countryStations = Array.isArray(stations) ? stations : [];
        renderGlobeMarkers();
        activeStations = countryStations;
        const selectedIndex = countryStations.findIndex(station =>
            (currentStation?.stationUuid && station.stationUuid === currentStation.stationUuid) ||
            (currentStation?.url && station.url === currentStation.url)
        );
        activeIndex = selectedIndex >= 0 ? selectedIndex : countryStations.length ? 0 : -1;
        if (!countryStations.length) {
            setStatus(earthStatus, 'No playable stations were returned for this country.');
            earthStationControls.hidden = true;
            return;
        }
        setStatus(earthStatus, `${countryStations.length} stations in ${countries.find(country => country.code === selectedCountry)?.name ?? 'this country'}`);
        earthStationControls.hidden = false;
        displayStation(countryStations[activeIndex], false, 'earth');
    }

    function updateGenres(genreData) {
        genres = Array.isArray(genreData)
            ? genreData.filter(genre => genre && typeof genre.name === 'string' && genre.name.trim())
            : [];
        genreSelect.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = genres.length ? 'Choose a genre...' : 'No genres available';
        placeholder.disabled = true;
        placeholder.selected = !selectedGenre;
        genreSelect.appendChild(placeholder);

        genres.forEach(genre => {
            const option = document.createElement('option');
            option.value = genre.name;
            option.textContent = `${genre.name} · ${Number(genre.stationCount).toLocaleString()} stations`;
            genreSelect.appendChild(option);
        });
        genreSelect.value = selectedGenre;
        setStatus(genreStatus, genres.length
            ? `${genres.length} popular genres. Choose one to browse stations.`
            : 'No genres were returned by Radio Browser.');
    }

    function loadGenre(genreName) {
        if (!genres.some(genre => genre.name === genreName)) {
            return;
        }
        selectedGenre = genreName;
        genreStationsLoading = genreName;
        genreStations = [];
        activeStations = [];
        activeIndex = -1;
        genreStationsList.replaceChildren();
        setStatus(genreStatus, `Finding ${genreName} stations...`, true);
        vscode.postMessage({ command: 'loadGenreStations', genre: genreName });
    }

    function updateGenreStations(stations) {
        genreStationsLoading = '';
        genreStations = Array.isArray(stations)
            ? stations.filter(station => station?.name && station?.url)
            : [];
        activeStations = genreStations;
        activeIndex = -1;
        genreStationsList.replaceChildren();

        if (!genreStations.length) {
            setStatus(genreStatus, `No stations found for ${selectedGenre}.`);
            const empty = document.createElement('p');
            empty.className = 'genre-empty';
            empty.textContent = 'Try another genre.';
            genreStationsList.appendChild(empty);
            return;
        }

        setStatus(genreStatus, `${genreStations.length} stations tagged ${selectedGenre}. Select one to play.`);
        genreStations.forEach((station, index) => {
            const item = document.createElement('div');
            item.setAttribute('role', 'listitem');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'genre-station';
            button.dataset.stationIndex = String(index);
            button.setAttribute('aria-label', `Play ${station.name}`);

            const icon = document.createElement('i');
            icon.dataset.lucide = 'radio';
            icon.setAttribute('aria-hidden', 'true');
            const name = document.createElement('span');
            name.className = 'genre-station-name';
            name.textContent = station.name;
            const country = document.createElement('span');
            country.className = 'genre-station-country';
            country.textContent = station.country?.toUpperCase() ?? '';

            button.append(icon, name, country);
            item.appendChild(button);
            genreStationsList.appendChild(item);
        });
        createIcons({ icons: { Radio }, root: genreStationsList });
    }

    function displayStation(station, autoPlay, source = activeView) {
        if (!station?.name || !station?.url) {
            return;
        }
        currentStation = station;
        pendingPlayRequestId = undefined;
        setBuffering(false);
        const stationIndex = activeStations.findIndex(item => item.url === station.url);
        if (stationIndex >= 0) {
            activeIndex = stationIndex;
        }
        stationNameDisplay.textContent = station.name;
        setStationArtwork(station.thumbnail);
        if (source === 'earth') {
            earthStationName.textContent = station.name;
        } else if (source === 'collection') {
            stationSelect.value = station.url;
        }
        updateCollectionToggle();
        renderGlobeMarkers();
        const requestId = setStationSource(station);

        if (autoPlay) {
            if (hlsInstance) {
                statusText.textContent = 'Preparing HLS stream...';
            } else {
                statusText.textContent = 'Connecting...';
                playCurrentStation(requestId);
            }
        } else if (audioPlayer.paused) {
            statusText.textContent = hlsInstance ? 'Preparing HLS stream...' : 'Ready to play';
        }
    }

    function setStationSource(station, alternateUrl) {
        const streamUrl = alternateUrl || getPlaybackUrl(station);
        const sameStation = currentMediaUrl === streamUrl;
        const hlsStream = isHlsStream({ ...station, url: streamUrl });
        if (sameStation && (hlsInstance || !hlsStream || !Hls.isSupported())) {
            return playbackRequestId;
        }
        const requestId = ++playbackRequestId;
        fallbackAttemptedRequestId = -1;
        hlsRecoveryAttemptedRequestId = -1;
        if (!alternateUrl) {
            hlsFallbackAttemptedUrl = '';
        }
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = undefined;
        }
        hlsReady = false;
        if (!sameStation) {
            if (!audioPlayer.paused) {
                audioPlayer.pause();
            }
            audioPlayer.removeAttribute('src');
            audioPlayer.load();
            currentMediaUrl = streamUrl;
        }

        delete audioPlayer.dataset.hlsUnsupported;
        if (hlsStream && Hls.isSupported()) {
            const player = new Hls({ enableWorker: false });
            hlsInstance = player;
            player.on(Hls.Events.MEDIA_ATTACHED, () => {
                if (requestId === playbackRequestId) {
                    player.loadSource(streamUrl);
                }
            });
            player.on(Hls.Events.MANIFEST_PARSED, () => {
                if (requestId === playbackRequestId) {
                    hlsReady = true;
                        if (pendingPlayRequestId === requestId && audioPlayer.paused && currentStation?.url === station.url) {
                            playCurrentStation(requestId);
                        } else if (audioPlayer.paused && currentStation?.url === station.url) {
                            setBuffering(false);
                            statusText.textContent = 'Ready to play';
                        }
                    }
            });
            player.on(Hls.Events.ERROR, (_event, data) => {
                if (requestId !== playbackRequestId || !data.fatal) {
                    return;
                }
                console.error('Fatal HLS playback error:', {
                    type: data.type,
                    details: data.details,
                    reason: data.reason,
                    response: data.response
                });
                if (
                    data.type === Hls.ErrorTypes.MEDIA_ERROR &&
                    hlsRecoveryAttemptedRequestId !== requestId
                ) {
                    hlsRecoveryAttemptedRequestId = requestId;
                    player.recoverMediaError();
                    return;
                }
                if (
                    !alternateUrl &&
                    station.fallbackUrl &&
                    station.fallbackUrl !== streamUrl &&
                    hlsFallbackAttemptedUrl !== station.url
                ) {
                    hlsFallbackAttemptedUrl = station.url;
                    const shouldResume = !audioPlayer.paused || pendingPlayRequestId === requestId;
                    if (shouldResume && !audioPlayer.paused) {
                        suppressNextPauseBroadcast = true;
                    }
                    player.destroy();
                    if (hlsInstance === player) {
                        hlsInstance = undefined;
                    }
                    const fallbackRequestId = setStationSource(station, station.fallbackUrl);
                    pendingPlayRequestId = shouldResume ? fallbackRequestId : undefined;
                    if (shouldResume && audioPlayer.paused) {
                        setBuffering(true);
                    }
                    return;
                }

                const errorReason = typeof data.reason === 'string' && data.reason
                    ? ` (${data.reason})`
                    : '';
                const message = data.type === Hls.ErrorTypes.NETWORK_ERROR
                    ? `The HLS stream could not be reached${errorReason}. Check that the station is online and allows cross-origin playback.`
                    : data.details === 'bufferAddCodecError'
                        ? 'The HLS stream uses an audio codec that this VS Code installation cannot decode.'
                        : `HLS playback failed (${data.details ?? data.type})${errorReason}. The station may be offline or its stream format may be unsupported.`;
                statusText.textContent = message;
                setBuffering(false);
                updateStatus(false);
                publishPlaybackState(false);
                vscode.postMessage({ command: 'alert', text: message });
                hlsReady = false;
                player.destroy();
                if (hlsInstance === player) {
                    hlsInstance = undefined;
                }
            });
            player.attachMedia(audioPlayer);
        } else {
            audioPlayer.dataset.hlsUnsupported = String(
                hlsStream && !audioPlayer.canPlayType('application/vnd.apple.mpegurl')
            );
            audioPlayer.src = streamUrl;
        }
        return requestId;
    }

    function getPlaybackUrl(station) {
        try {
            const url = new URL(station.url);
            const hostname = url.hostname.toLowerCase();
            const pathname = url.pathname.toLowerCase().replace(/\/$/, '');
            const isLegacyBbcRadioOne = hostname === 'stream.live.vc.bbcmedia.co.uk' &&
                pathname === '/bbc_radio_one';
            const isBbcRadioOneAacPlus = hostname === 'a.files.bbci.co.uk' &&
                pathname.endsWith('/bbc_radio_one.m3u8');
            if (isLegacyBbcRadioOne || isBbcRadioOneAacPlus) {
                return 'https://as-hls-ww.live.cf.md.bbci.co.uk/pool_01505109/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio%3d128000.norewind.m3u8';
            }
        } catch {
            return station.url;
        }
        return station.url;
    }

    function isHlsStream(station) {
        return station.codec?.toLowerCase() === 'hls' || /\.m3u8(?:$|[?#])/i.test(station.url);
    }

    function playCurrentStation(requestId = playbackRequestId) {
        if (hlsInstance && !hlsReady) {
            pendingPlayRequestId = requestId;
            setBuffering(true);
            return;
        }
        if (audioPlayer.dataset.hlsUnsupported === 'true') {
            const message = 'HLS streams are not supported by this VS Code installation.';
            statusText.textContent = message;
            vscode.postMessage({ command: 'alert', text: message });
            return;
        }
        pendingPlayRequestId = undefined;
        setBuffering(true);
        audioPlayer.play().catch(error => handlePlaybackError(error, requestId));
    }

    function setStationArtwork(url) {
        const validUrl = safeImageUrl(url);
        [stationBackdrop, stationCover].forEach(image => {
            if (validUrl) {
                image.src = validUrl;
                image.hidden = false;
            } else {
                image.removeAttribute('src');
                image.hidden = true;
            }
        });
        playerCard.classList.toggle('has-backdrop', Boolean(validUrl));
    }

    function safeImageUrl(url) {
        if (typeof url !== 'string' || !url) {
            return '';
        }
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
        } catch {
            return '';
        }
    }

    function changeStation(direction) {
        if (!activeStations.length) {
            return;
        }
        const nextIndex = activeIndex < 0
            ? 0
            : (activeIndex + direction + activeStations.length) % activeStations.length;
        activeIndex = nextIndex;
        sendStationCommand(activeStations[activeIndex]);
    }

    function sendStationCommand(station) {
        if (station) {
            displayStation(station, true);
        }
    }

    function applyRemoteState(state) {
        if (!audioPlayer.paused) {
            suppressNextPauseBroadcast = true;
            audioPlayer.pause();
        }
        if (state.country && state.country !== selectedCountry) {
            selectCountry(state.country, directoryReady);
        }
        const remoteStation = {
            name: state.stationName,
            url: state.stationUrl,
            fallbackUrl: state.stationFallbackUrl,
            thumbnail: state.stationThumbnail,
            country: state.country,
            stationUuid: state.stationUuid,
            codec: state.codec
        };
        if (remoteStation.url && currentStation?.url !== remoteStation.url) {
            displayStation(remoteStation, false);
        } else {
            currentStation = remoteStation;
            stationNameDisplay.textContent = state.stationName ?? '';
            setStationArtwork(state.stationThumbnail);
            updateCollectionToggle();
        }
        if (state.stationUrl) {
            stationSelect.value = state.stationUrl;
            const stationIndex = activeStations.findIndex(station => station.url === currentStation?.url);
            if (stationIndex >= 0) {
                activeIndex = stationIndex;
            }
        }
        updateStatus(state.isPlaying);
    }

    function publishPlaybackState(playing) {
        vscode.postMessage({
            command: 'statusUpdate',
            data: {
                isPlaying: playing,
                stationName: stationNameDisplay.textContent,
                stationUrl: currentStation?.url,
                stationFallbackUrl: currentStation?.fallbackUrl,
                stationThumbnail: stationCover.getAttribute('src') || undefined,
                country: currentStation?.country,
                stationUuid: currentStation?.stationUuid,
                codec: currentStation?.codec
            }
        });
    }

    function updateStatus(playing) {
        isPlaying = playing;
        playerCard.classList.toggle('is-playing', playing);
        if (!isBuffering) {
            statusText.textContent = playing ? 'Playing' : 'Paused';
        }
        liveIndicator.classList.toggle('active', playing);
        togglePlayBtn.innerHTML = playing
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"></path></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"></path></svg>';
        if (!isBuffering) {
            togglePlayBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        }
        togglePlayBtn.setAttribute('aria-pressed', String(playing));
    }

    function updateDirectoryStatus() {
        if (directoryReady && !countriesLoaded && !countriesLoading) {
            countriesLoading = true;
            setStatus(earthStatus, 'Loading country data...', true);
            vscode.postMessage({ command: 'loadCountries' });
        }
        if (directoryReady && !globeStationsLoaded && !globeStationsLoading) {
            globeStationsLoading = true;
            updateExploreLoading();
            vscode.postMessage({ command: 'loadGlobeStations' });
        }
        if (directoryReady && selectedCountry && !countryStations.length &&
            countryLoadingFor !== selectedCountry && !countriesLoading) {
            countryLoadingFor = selectedCountry;
            setStatus(earthStatus, `Finding stations in ${countries.find(item => item.code === selectedCountry)?.name ?? 'this country'}...`, true);
            vscode.postMessage({ command: 'loadCountry', country: selectedCountry });
        } else if (!directoryReady && selectedCountry) {
            setStatus(earthStatus, 'Connecting to the Radio Browser directory...', true);
        }
        if (directoryReady && activeView === 'genre' && !genresLoaded && !genresLoading) {
            genresLoading = true;
            setStatus(genreStatus, 'Loading genres...', true);
            vscode.postMessage({ command: 'loadGenres' });
        } else if (!directoryReady && activeView === 'genre') {
            setStatus(genreStatus, 'Connecting to the Radio Browser directory...', true);
        }
        if (directoryReady && activeView === 'genre' && selectedGenre &&
            !genreStations.length && genreStationsLoading !== selectedGenre) {
            genreStationsLoading = selectedGenre;
            setStatus(genreStatus, `Finding ${selectedGenre} stations...`, true);
            vscode.postMessage({ command: 'loadGenreStations', genre: selectedGenre });
        }
        updateExploreLoading();
    }

    function updateExploreLoading() {
        if (selectedCountry) {
            return;
        }
        if (!directoryReady) {
            setStatus(earthStatus, 'Connecting to the Radio Browser directory...', true);
            return;
        }
        if (!countriesLoaded || !globeStationsLoaded) {
            setStatus(earthStatus, 'Loading country and station map data...', true);
            return;
        }
        const error = countriesErrorMessage || globeStationsErrorMessage;
        setStatus(
            earthStatus,
            error || 'Choose a country on the globe to explore stations.'
        );
    }

    function setStatus(element, message, loading = false) {
        const text = element.querySelector('.status-message');
        if (text) {
            text.textContent = message;
        } else {
            element.textContent = message;
        }
        const spinner = element.querySelector('.loading-spinner');
        if (spinner) {
            spinner.hidden = !loading;
        }
        element.classList.toggle('is-loading', loading);
    }

    function setBuffering(buffering) {
        isBuffering = buffering;
        playerCard.classList.toggle('is-buffering', buffering);
        togglePlayBtn.classList.toggle('is-buffering', buffering);
        togglePlayBtn.setAttribute('aria-busy', String(buffering));
        if (buffering) {
            statusText.textContent = 'Buffering...';
            togglePlayBtn.setAttribute('aria-label', 'Cancel buffering');
        } else {
            togglePlayBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
        }
    }

    function updateCollectionToggle() {
        const isSaved = Boolean(currentStation?.url && customStations.some(station => station.url === currentStation.url));
        collectionToggleBtn.disabled = !currentStation?.url;
        collectionToggleBtn.classList.toggle('is-saved', isSaved);
        collectionToggleBtn.setAttribute('aria-pressed', String(isSaved));
        const label = isSaved ? 'Remove current station from collection' : 'Add current station to collection';
        collectionToggleBtn.setAttribute('aria-label', label);
        collectionToggleBtn.title = label;
    }

    function setView(view) {
        activeView = ['earth', 'genre'].includes(view) ? view : 'collection';
        document.querySelectorAll('.view-tab').forEach(tab => {
            const selected = tab.dataset.view === activeView;
            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-selected', String(selected));
        });
        document.getElementById('collection-panel').hidden = activeView !== 'collection';
        document.getElementById('earth-panel').hidden = activeView !== 'earth';
        document.getElementById('genre-panel').hidden = activeView !== 'genre';

        if (activeView === 'earth' && !globeInstance) {
            initializeGlobe();
        }
        if (activeView === 'genre') {
            updateDirectoryStatus();
        }
        if (activeView === 'collection') {
            activeStations = customStations;
            activeIndex = customStations.findIndex(station => station.url === currentStation?.url);
        } else if (activeView === 'genre') {
            activeStations = genreStations;
            activeIndex = genreStations.findIndex(station => station.url === currentStation?.url);
        } else if (selectedCountry && countryStations.length) {
            activeStations = countryStations;
            activeIndex = countryStations.findIndex(station => station.url === currentStation?.url);
        } else if (activeView === 'earth' && selectedCountry && directoryReady) {
            selectCountry(selectedCountry, true, false);
        } else {
            activeStations = [];
            activeIndex = -1;
        }
        requestAnimationFrame(resizeGlobe);
    }

    function setVolume(volume) {
        const normalizedVolume = clamp(Number(volume), 0, 1);
        audioPlayer.volume = normalizedVolume;
        if (normalizedVolume > 0) {
            lastVolume = normalizedVolume;
        }
        volumeSlider.value = String(Math.round(normalizedVolume * 100));
        volumeValue.textContent = `${volumeSlider.value}%`;
        volumeSlider.style.setProperty('--volume-level', `${volumeSlider.value}%`);
        muteBtn.setAttribute('aria-label', normalizedVolume === 0 ? 'Unmute' : 'Mute');
        muteBtn.setAttribute('aria-pressed', String(normalizedVolume === 0));
        muteBtn.innerHTML = normalizedVolume === 0
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm11.59 3 2.12 2.12-1.42 1.42L16 13.41l-2.29 2.3-1.42-1.42 2.3-2.29-2.3-2.29 1.42-1.42 2.29 2.3 2.29-2.3 1.42 1.42L15.59 12z"></path></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"></path></svg>';
    }

    function handlePlaybackError(error, requestId = playbackRequestId) {
        if (requestId !== playbackRequestId) {
            return;
        }
        if (error?.name === 'AbortError') {
            setBuffering(false);
            updateStatus(false);
            publishPlaybackState(false);
            return;
        }
        const detail = error instanceof Error ? error.message : String(error);
        const message = error?.name === 'NotAllowedError'
            ? 'Playback was blocked. Press Play in the player to start the stream.'
            : `Playback failed: ${detail}`;
        console.error('Playback error:', error);
        setBuffering(false);
        statusText.textContent = message;
        updateStatus(false);
        publishPlaybackState(false);
        vscode.postMessage({ command: 'alert', text: message });
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    vscode.postMessage({ command: 'webviewReady' });
})();
