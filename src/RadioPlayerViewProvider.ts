import * as vscode from 'vscode';
import { PlaybackBroker } from './PlaybackBroker';
import { RadioBrowserApi, RadioStation } from './RadioBrowserApi';

export class RadioPlayerViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'radioPlayerView';
    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _lastReportedStationUuid?: string;

    public static instance: RadioPlayerViewProvider | undefined;

    constructor(extensionUri: vscode.Uri, private readonly _radioBrowserApi: RadioBrowserApi) {
        this._extensionUri = extensionUri;
        RadioPlayerViewProvider.instance = this;
    }

    public refreshDirectoryStatus() {
        this._view?.webview.postMessage({ command: 'directoryStatus', ready: true });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
        };

        // The VS Code typings may not include this view property.
        // @ts-ignore
        webviewView.description = "Radio Player Engine";

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Mirror playback state from other VS Code windows.
        PlaybackBroker.instance.ensureStarted();
        const sub = PlaybackBroker.instance.onStateUpdate(state => {
            if (state.sourceId !== PlaybackBroker.instance.sourceId) {
                webviewView.webview.postMessage({ command: 'state', data: state });
            }
        });
        webviewView.onDidDispose(() => sub.dispose());

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'webviewReady':
                    this.refreshDirectoryStatus();
                    break;
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    break;
                case 'getSettings': {
                    const config = vscode.workspace.getConfiguration('radioPlayer');
                    const stations = config.get('customStations', []);
                    webviewView.webview.postMessage({ command: 'stations', data: stations });
                    break;
                }
                case 'statusUpdate':
                    if (
                        message.data?.isPlaying &&
                        typeof message.data.stationUuid === 'string' &&
                        message.data.stationUuid !== this._lastReportedStationUuid
                    ) {
                        this._lastReportedStationUuid = message.data.stationUuid;
                        this._recordStationClick(message.data.stationUuid);
                    }
                    PlaybackBroker.instance.broadcastState(message.data);
                    break;
                case 'requestControl':
                    if (message.control === 'play' || message.control === 'pause') {
                        if (message.control === 'play' && typeof message.stationUuid === 'string') {
                            this._recordStationClick(message.stationUuid);
                        }
                        PlaybackBroker.instance.sendCommand(message.control);
                    } else if (
                        message.control === 'setStation' &&
                        typeof message.name === 'string' &&
                        typeof message.url === 'string'
                    ) {
                        if (typeof message.stationUuid === 'string') {
                            this._recordStationClick(message.stationUuid);
                        }
                        PlaybackBroker.instance.sendCommand('setStation', {
                            name: message.name,
                            url: message.url,
                            fallbackUrl: typeof message.fallbackUrl === 'string' && /^https?:\/\//i.test(message.fallbackUrl)
                                ? message.fallbackUrl
                                : undefined,
                            thumbnail: typeof message.thumbnail === 'string' ? message.thumbnail : undefined,
                            country: typeof message.country === 'string' ? message.country : undefined,
                            codec: typeof message.codec === 'string' ? message.codec : undefined
                        });
                    }
                    break;
                case 'loadCountry':
                    if (typeof message.country === 'string' && /^[a-z]{2}$/.test(message.country)) {
                        void this._loadCountry(webviewView.webview, message.country);
                    }
                    break;
                case 'loadCountries':
                    void this._loadCountries(webviewView.webview);
                    break;
                case 'loadGlobeStations':
                    void this._loadGlobeStations(webviewView.webview);
                    break;
                case 'loadGenres':
                    void this._loadGenres(webviewView.webview);
                    break;
                case 'loadGenreStations':
                    if (typeof message.genre === 'string') {
                        void this._loadGenreStations(webviewView.webview, message.genre);
                    }
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'radioPlayer.customStations');
                    break;
                case 'toggleCollectionStation':
                    if (isRadioStation(message.station)) {
                        void this._toggleCollectionStation(webviewView.webview, message.station);
                    }
                    break;
            }
        });
        this.refreshDirectoryStatus();

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('radioPlayer.customStations')) {
                const config = vscode.workspace.getConfiguration('radioPlayer');
                const stations = config.get('customStations', []);
                webviewView.webview.postMessage({ command: 'stations', data: stations });
            }
        });
    }

    public play() {
        PlaybackBroker.instance.sendCommand('play');
    }

    public pause() {
        PlaybackBroker.instance.sendCommand('pause');
    }

    public setStation(station: RadioStation) {
        PlaybackBroker.instance.sendCommand('setStation', station);
    }

    /** Applies a command received via the broker to the local webview. */
    public applyBrokerCommand(msg: { command: 'play' | 'pause' | 'setStation'; station?: RadioStation }) {
        this._view?.webview.postMessage(msg);
    }

    public setVolume(volume: number) {
        this._view?.webview.postMessage({ command: 'volume', value: volume });
    }

    private async _loadCountry(webview: vscode.Webview, country: string) {
        try {
            const stations = await this._radioBrowserApi.getStationsForCountry(country);
            webview.postMessage({ command: 'countryStations', country, data: stations });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            webview.postMessage({ command: 'apiError', country, message });
            vscode.window.showErrorMessage(`Radio Browser: ${message}`);
        }
    }

    private async _loadCountries(webview: vscode.Webview) {
        try {
            const countries = await this._radioBrowserApi.getCountries();
            webview.postMessage({ command: 'countries', data: countries });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            webview.postMessage({ command: 'countriesError', message });
            vscode.window.showErrorMessage(`Radio Browser: ${message}`);
        }
    }

    private async _loadGlobeStations(webview: vscode.Webview) {
        try {
            const stations = await this._radioBrowserApi.getGlobeStations();
            webview.postMessage({ command: 'globeStations', data: stations });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            webview.postMessage({ command: 'globeStationsError', message });
            console.error(`Radio Browser globe stations: ${message}`);
        }
    }

    private async _loadGenres(webview: vscode.Webview) {
        try {
            const genres = await this._radioBrowserApi.getGenres();
            webview.postMessage({ command: 'genres', data: genres });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            webview.postMessage({ command: 'genresError', message });
            console.error(`Radio Browser genres: ${message}`);
        }
    }

    private async _loadGenreStations(webview: vscode.Webview, genre: string) {
        try {
            const stations = await this._radioBrowserApi.getStationsForGenre(genre);
            webview.postMessage({ command: 'genreStations', genre, data: stations });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            webview.postMessage({ command: 'genreStationsError', genre, message });
            console.error(`Radio Browser genre stations: ${message}`);
        }
    }

    private async _toggleCollectionStation(webview: vscode.Webview, station: RadioStation) {
        try {
            const config = vscode.workspace.getConfiguration('radioPlayer');
            const stations = config.get<RadioStation[]>('customStations', []);
            const existingIndex = stations.findIndex(item => item.url === station.url);
            const nextStations = [...stations];
            const isSaved = existingIndex < 0;
            if (isSaved) {
                const savedStation: RadioStation = {
                    name: station.name,
                    url: station.url
                };
                if (station.fallbackUrl) {
                    savedStation.fallbackUrl = station.fallbackUrl;
                }
                if (station.thumbnail) {
                    savedStation.thumbnail = station.thumbnail;
                }
                nextStations.push(savedStation);
            } else {
                nextStations.splice(existingIndex, 1);
            }

            const inspection = config.inspect<RadioStation[]>('customStations');
            const target = inspection?.workspaceFolderValue !== undefined
                ? vscode.ConfigurationTarget.WorkspaceFolder
                : inspection?.workspaceValue !== undefined
                    ? vscode.ConfigurationTarget.Workspace
                    : vscode.ConfigurationTarget.Global;
            await config.update('customStations', nextStations, target);
            webview.postMessage({ command: 'stations', data: nextStations });
            webview.postMessage({ command: 'collectionStationToggled', stationUrl: station.url, isSaved });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            webview.postMessage({ command: 'collectionStationError', message });
            vscode.window.showErrorMessage(`Radio Player: Unable to update your station collection. ${message}`);
        }
    }

    private _recordStationClick(stationUuid: string) {
        void this._radioBrowserApi.recordStationClick(stationUuid).catch(error => {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Unable to record Radio Browser station click: ${message}`);
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.bundle.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const nonce = getNonce();

        const config = vscode.workspace.getConfiguration('radioPlayer');
        const stations = config.get('customStations', []);
        const stationsJson = JSON.stringify(stations);

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} http: https: blob:; script-src 'nonce-${nonce}'; connect-src http: https:; media-src http: https: blob:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Radio Player</title>
            </head>
            <body>
                <div class="container">
                    <div class="player-card">
                        <img id="station-backdrop" class="player-backdrop" alt="" aria-hidden="true">
                        <div class="player-overlay" aria-hidden="true"></div>
                        <div class="player-topline">
                            <span class="brand-mark" aria-hidden="true">
                                <span></span><span></span><span></span>
                            </span>
                            <span class="brand-name">RADIO PLAYER</span>
                            <span class="live-indicator"><span class="live-dot"></span> LIVE</span>
                            <button id="collection-toggle" class="collection-toggle" type="button" aria-label="Add current station to collection" title="Add current station to collection" aria-pressed="false" disabled>
                                <i data-lucide="heart" aria-hidden="true"></i>
                            </button>
                        </div>

                        <div class="artwork" aria-hidden="true">
                            <img id="station-cover" class="station-cover" alt="">
                            <div class="artwork-orbit artwork-orbit--outer"></div>
                            <div class="artwork-orbit artwork-orbit--inner"></div>
                            <div class="artwork-core">
                                <span class="artwork-signal"></span>
                                <span class="artwork-signal"></span>
                                <span class="artwork-signal"></span>
                                <span class="artwork-signal"></span>
                                <span class="artwork-signal"></span>
                            </div>
                        </div>

                        <div class="station-info">
                            <p class="eyebrow">NOW TUNED TO</p>
                            <h1 id="station-name">Select Station</h1>
                            <p class="status-line"><span class="status-dot"></span><span id="status-text">Ready to play</span></p>
                        </div>

                        <div class="player-controls">
                            <button id="previous-station-btn" class="skip-btn" type="button" aria-label="Previous station" title="Previous station">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zm13 0v14L9 12z"></path></svg>
                            </button>
                            <button id="toggle-play-btn" class="toggle-play-btn" type="button" aria-label="Play" aria-pressed="false">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"></path></svg>
                            </button>
                            <button id="next-station-btn" class="skip-btn" type="button" aria-label="Next station" title="Next station">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM5 5v14l10-7z"></path></svg>
                            </button>
                        </div>

                        <div class="volume-controls">
                            <button id="mute-btn" class="mute-btn" type="button" aria-label="Mute" aria-pressed="false">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05a4.5 4.5 0 0 0 2.5-4.02zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"></path></svg>
                            </button>
                            <input id="volume-slider" type="range" min="0" max="100" value="75" aria-label="Volume">
                            <span id="volume-value" class="volume-value">75%</span>
                        </div>
                        <audio id="audio-player" preload="none"></audio>
                    </div>

                    <div class="controls-section">
                        <div class="view-switch" role="tablist" aria-label="Station browser">
                            <button class="view-tab active" id="collection-tab" type="button" role="tab" aria-selected="true" aria-controls="collection-panel" data-view="collection"><i data-lucide="library" aria-hidden="true"></i><span>Collection</span></button>
                            <button class="view-tab" id="earth-tab" type="button" role="tab" aria-selected="false" aria-controls="earth-panel" data-view="earth"><i data-lucide="earth" aria-hidden="true"></i><span>Explore</span></button>
                            <button class="view-tab" id="genre-tab" type="button" role="tab" aria-selected="false" aria-controls="genre-panel" data-view="genre"><i data-lucide="tags" aria-hidden="true"></i><span>Genre</span></button>
                        </div>
                        <section class="station-panel" id="collection-panel" role="tabpanel" aria-labelledby="collection-tab">
                        <div class="section-heading">
                            <div>
                                <p class="eyebrow">YOUR COLLECTION</p>
                                <h2>Stations</h2>
                            </div>
                            <span class="station-count" id="station-count">0 stations</span>
                        </div>

                        <label class="sr-only" for="station-select">Choose a station</label>
                        <div class="select-wrapper">
                            <select id="station-select" aria-label="Choose a station">
                                <option value="" disabled selected>Select a station...</option>
                            </select>
                            <svg class="select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5z"></path></svg>
                        </div>

                        <button id="settings-btn" class="secondary-btn" type="button">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.3 7.3 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.61.22L2.63 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"></path></svg>
                            Manage stations
                        </button>
                        </section>

                        <section class="station-panel earth-panel" id="earth-panel" role="tabpanel" aria-labelledby="earth-tab" hidden>
                            <div class="section-heading">
                                <div>
                                    <p class="eyebrow">GLOBAL RADIO</p>
                                    <h2>Find your frequency</h2>
                                </div>
                            </div>

                            <div class="globe-stage">
                                <div id="globe" class="globe" role="group" tabindex="0" aria-label="Interactive radio globe. Drag or use the arrow keys to rotate.">
                                    <div id="globe-renderer" aria-hidden="true"></div>
                                    <div class="globe-highlight" aria-hidden="true"></div>
                                    <div class="globe-crosshair" aria-hidden="true"></div>
                                </div>
                                <span id="globe-focused-station" class="globe-focused-station" role="status" hidden></span>
                                <span class="globe-hint">DRAG TO ROTATE · CENTER A DOT TO SELECT ITS COUNTRY</span>
                            </div>

                            <label class="sr-only" for="country-select">Choose a country</label>
                            <div class="select-wrapper">
                                <select id="country-select" aria-label="Choose a country">
                                    <option value="">Choose a country...</option>
                                </select>
                                <svg class="select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5z"></path></svg>
                            </div>

                            <p id="earth-status" class="earth-status" role="status"><span class="loading-spinner" aria-hidden="true" hidden></span><span class="status-message">Choose a country on the globe to explore stations.</span></p>
                            <div id="earth-station-controls" class="earth-station-controls" hidden>
                                <button id="earth-previous-btn" class="earth-skip-btn" type="button" aria-label="Previous station">‹</button>
                                <span id="earth-station-name">No station selected</span>
                                <button id="earth-next-btn" class="earth-skip-btn" type="button" aria-label="Next station">›</button>
                            </div>
                        </section>

                        <section class="station-panel genre-panel" id="genre-panel" role="tabpanel" aria-labelledby="genre-tab" hidden>
                            <div class="section-heading">
                                <div>
                                    <p class="eyebrow">RADIO BROWSER</p>
                                    <h2>Find your sound</h2>
                                </div>
                            </div>

                            <label class="sr-only" for="genre-select">Choose a genre</label>
                            <div class="select-wrapper">
                                <select id="genre-select" aria-label="Choose a genre">
                                    <option value="">Choose a genre...</option>
                                </select>
                                <svg class="select-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5z"></path></svg>
                            </div>

                            <p id="genre-status" class="earth-status" role="status"><span class="loading-spinner" aria-hidden="true" hidden></span><span class="status-message">Choose a genre to browse stations.</span></p>
                            <div id="genre-stations" class="genre-stations" role="list" aria-label="Stations in selected genre">
                                <p class="genre-empty">Stations will appear here.</p>
                            </div>
                        </section>
                    </div>
                </div>
                <script nonce="${nonce}">
                    window.initialStations = ${stationsJson};
                </script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function isRadioStation(value: unknown): value is RadioStation {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const station = value as Partial<RadioStation>;
    return typeof station.name === 'string' && station.name.trim().length > 0 &&
        typeof station.url === 'string' && /^https?:\/\//i.test(station.url) &&
        (station.fallbackUrl === undefined ||
            (typeof station.fallbackUrl === 'string' && /^https?:\/\//i.test(station.fallbackUrl))) &&
        (station.thumbnail === undefined ||
            (typeof station.thumbnail === 'string' && /^https?:\/\//i.test(station.thumbnail)));
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
