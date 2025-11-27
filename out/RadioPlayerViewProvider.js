"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RadioPlayerViewProvider = void 0;
const vscode = require("vscode");
class RadioPlayerViewProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        RadioPlayerViewProvider.instance = this;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
        };
        // CRITICAL: This allows the webview to keep running (playing audio) when hidden/switched away from
        // @ts-ignore - The property exists but might not be in the type definition depending on version
        webviewView.description = "Radio Player Engine";
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    break;
                case 'getSettings':
                    // Fallback if needed, but data is now injected
                    const config = vscode.workspace.getConfiguration('radioPlayer');
                    const stations = config.get('customStations', []);
                    webviewView.webview.postMessage({ command: 'stations', data: stations });
                    break;
                case 'statusUpdate':
                    RadioPlayerViewProvider._onStatusUpdate.fire(message.data);
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'radioPlayer.customStations');
                    break;
            }
        });
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('radioPlayer.customStations')) {
                const config = vscode.workspace.getConfiguration('radioPlayer');
                const stations = config.get('customStations', []);
                webviewView.webview.postMessage({ command: 'stations', data: stations });
            }
        });
    }
    play() {
        this._view?.webview.postMessage({ command: 'play' });
    }
    pause() {
        this._view?.webview.postMessage({ command: 'pause' });
    }
    setStation(name, url) {
        this._view?.webview.postMessage({ command: 'setStation', name, url });
        // We don't force show the view because user wants "popup only" experience
    }
    setVolume(volume) {
        this._view?.webview.postMessage({ command: 'volume', value: volume });
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const nonce = getNonce();
        // Get initial stations
        const config = vscode.workspace.getConfiguration('radioPlayer');
        const stations = config.get('customStations', []);
        const stationsJson = JSON.stringify(stations);
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; media-src http: https:;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>Radio Player</title>
            </head>
            <body>
                <div class="container">
                    <div class="player-card">
                        <div class="card-header">
                            <span class="live-indicator">● LIVE</span>
                        </div>
                        <div class="station-info">
                            <h2 id="station-name">Select Station</h2>
                            <p id="status-text">Ready to play</p>
                        </div>
                        <div class="visualizer paused">
                            <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
                        </div>
                        
                        <button id="toggle-play-btn" class="toggle-play-btn">
                            <span class="codicon codicon-play"></span>
                        </button>

                        <div class="audio-controls">
                            <audio id="audio-player" controls></audio>
                        </div>
                    </div>

                    <div class="controls-section">
                        <label for="station-select">Select Station</label>
                        <div class="select-wrapper">
                            <select id="station-select">
                                <option value="" disabled selected>Select a station...</option>
                            </select>
                        </div>
                        
                        <button id="settings-btn" class="secondary-btn">
                            <span class="codicon codicon-settings-gear"></span> Manage Stations
                        </button>
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
exports.RadioPlayerViewProvider = RadioPlayerViewProvider;
RadioPlayerViewProvider.viewType = 'radioPlayerView';
// Event emitter for status updates
RadioPlayerViewProvider._onStatusUpdate = new vscode.EventEmitter();
RadioPlayerViewProvider.onStatusUpdate = RadioPlayerViewProvider._onStatusUpdate.event;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=RadioPlayerViewProvider.js.map