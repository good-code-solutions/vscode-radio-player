"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RadioPlayerPanel = void 0;
const vscode = require("vscode");
class RadioPlayerPanel {
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (RadioPlayerPanel.currentPanel) {
            RadioPlayerPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('radioPlayer', 'Radio Player', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
            retainContextWhenHidden: true // CRITICAL: Keeps audio playing in background
        });
        RadioPlayerPanel.currentPanel = new RadioPlayerPanel(panel, extensionUri);
    }
    static play() {
        RadioPlayerPanel.currentPanel?._panel.webview.postMessage({ command: 'play' });
    }
    static pause() {
        RadioPlayerPanel.currentPanel?._panel.webview.postMessage({ command: 'pause' });
    }
    static setStation(name, url) {
        RadioPlayerPanel.currentPanel?._panel.webview.postMessage({ command: 'setStation', name, url });
    }
    static setVolume(volume) {
        RadioPlayerPanel.currentPanel?._panel.webview.postMessage({ command: 'volume', value: volume });
    }
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
                case 'getSettings':
                    const config = vscode.workspace.getConfiguration('radioPlayer');
                    const stations = config.get('customStations', []);
                    this._panel.webview.postMessage({ command: 'stations', data: stations });
                    return;
                case 'statusUpdate':
                    RadioPlayerPanel._onStatusUpdate.fire(message.data);
                    return;
            }
        }, null, this._disposables);
    }
    dispose() {
        RadioPlayerPanel.currentPanel = undefined;
        RadioPlayerPanel._onStatusUpdate.fire({ isPlaying: false }); // Notify that player is closed
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _update() {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const nonce = getNonce();
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
                    <h1>🎵 Radio Player</h1>
                    
                    <div class="player-display">
                        <div class="now-playing">
                            <span id="station-name">No Station Playing</span>
                        </div>
                        <div class="audio-controls">
                            <audio id="audio-player" controls></audio>
                        </div>
                    </div>

                    <div class="controls-section">
                        <label for="station-select">Select Station:</label>
                        <select id="station-select">
                            <option value="" disabled selected>Loading...</option>
                        </select>

                        <label for="manual-url">Or Enter Stream URL:</label>
                        <input type="text" id="manual-url" placeholder="http://stream.example.com/radio.mp3">
                        <button id="play-manual-btn">Play URL</button>
                    </div>

                    <div class="info">
                        <p>💡 Tip: Configure stations in Settings → Extensions → Radio Player</p>
                    </div>
                </div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
exports.RadioPlayerPanel = RadioPlayerPanel;
// Event emitter for status updates
RadioPlayerPanel._onStatusUpdate = new vscode.EventEmitter();
RadioPlayerPanel.onStatusUpdate = RadioPlayerPanel._onStatusUpdate.event;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=RadioPlayerPanel.js.map