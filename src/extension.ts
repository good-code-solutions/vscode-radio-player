import * as vscode from 'vscode';
import { RadioPlayerViewProvider } from './RadioPlayerViewProvider';

let mainStatusBarItem: vscode.StatusBarItem;
let playPauseStatusBarItem: vscode.StatusBarItem;
let stationStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Radio Player extension is now active!');

    // 1. Main "Radio" button (always visible)
    mainStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    mainStatusBarItem.text = '$(radio-tower) Radio';
    mainStatusBarItem.command = 'vscode-radio-player.open';
    mainStatusBarItem.tooltip = 'Open Radio Player';
    console.log('Radio Player extension is now active!');

    // Register WebviewViewProvider
    const provider = new RadioPlayerViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(RadioPlayerViewProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true } // CRITICAL: This is the official API way
        })
    );

    // 1. Main "Radio" button (always visible)
    mainStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    mainStatusBarItem.text = '$(radio-tower) Radio';
    mainStatusBarItem.command = 'vscode-radio-player.open';
    mainStatusBarItem.tooltip = 'Open Radio Controls';
    mainStatusBarItem.show();

    // 2. Play/Pause button (visible when player is active)
    playPauseStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    playPauseStatusBarItem.text = '$(play)';
    playPauseStatusBarItem.command = 'vscode-radio-player.play';
    playPauseStatusBarItem.tooltip = 'Play Radio';

    // 3. Station Name (visible when playing)
    stationStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    stationStatusBarItem.command = 'vscode-radio-player.pickStation';
    stationStatusBarItem.tooltip = 'Select Station';

    // Register Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-radio-player.open', () => {
            showRadioMenu(context);
        }),
        vscode.commands.registerCommand('vscode-radio-player.play', () => {
            RadioPlayerViewProvider.instance?.play();
        }),
        vscode.commands.registerCommand('vscode-radio-player.pause', () => {
            RadioPlayerViewProvider.instance?.pause();
        }),
        vscode.commands.registerCommand('vscode-radio-player.pickStation', () => {
            pickStation(context);
        })
    );

    // Listen for status updates
    context.subscriptions.push(
        RadioPlayerViewProvider.onStatusUpdate(status => {
            updateStatusBar(status);
        })
    );

    context.subscriptions.push(mainStatusBarItem, playPauseStatusBarItem, stationStatusBarItem);
}

async function showRadioMenu(context: vscode.ExtensionContext) {
    // We don't need to force show the view, it should be running in background if enabled
    // But if it's not initialized, we might need to focus it once?
    // Actually, if user never opened the sidebar view, the provider might not be resolved.
    // We can try to execute command to focus it if instance is missing, but let's assume user has it in sidebar.

    if (!RadioPlayerViewProvider.instance) {
        // Try to wake it up by focusing the view
        await vscode.commands.executeCommand('radioPlayerView.focus');
    }

    const items: vscode.QuickPickItem[] = [
        { label: '$(play) Play', description: 'Resume playback', detail: 'play' },
        { label: '$(debug-pause) Pause', description: 'Pause playback', detail: 'pause' },
        { label: '$(radio-tower) Change Station', description: 'Select a different radio station', detail: 'station' },
        { label: '$(layout-sidebar-left) Show Engine', description: 'Show the sidebar player view', detail: 'show' }
    ];

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Radio Player Controls'
    });

    if (!selection) return;

    switch (selection.detail) {
        case 'play':
            RadioPlayerViewProvider.instance?.play();
            break;
        case 'pause':
            RadioPlayerViewProvider.instance?.pause();
            break;
        case 'station':
            pickStation(context);
            break;
        case 'show':
            vscode.commands.executeCommand('radioPlayerView.focus');
            break;
    }
}

async function pickStation(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('radioPlayer');
    const stations = config.get<any[]>('customStations', []);

    const items = stations.map(s => ({
        label: s.name,
        description: s.url,
        station: s
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a radio station to play'
    });

    if (selected) {
        if (!RadioPlayerViewProvider.instance) {
            await vscode.commands.executeCommand('radioPlayerView.focus');
        }
        RadioPlayerViewProvider.instance?.setStation(selected.station.name, selected.station.url);
    }
}

function updateStatusBar(status: { isPlaying: boolean, stationName?: string }) {
    if (status.isPlaying) {
        playPauseStatusBarItem.text = '$(debug-pause)';
        playPauseStatusBarItem.command = 'vscode-radio-player.pause';
        playPauseStatusBarItem.tooltip = 'Pause Radio';
        playPauseStatusBarItem.show();

        if (status.stationName) {
            stationStatusBarItem.text = status.stationName;
            stationStatusBarItem.show();
        }
    } else {
        playPauseStatusBarItem.text = '$(play)';
        playPauseStatusBarItem.command = 'vscode-radio-player.play';
        playPauseStatusBarItem.tooltip = 'Play Radio';

        // Keep showing play button if we have a station selected, otherwise hide if closed
        if (status.stationName) {
            playPauseStatusBarItem.show();
            stationStatusBarItem.text = status.stationName;
            stationStatusBarItem.show();
        } else {
            playPauseStatusBarItem.hide();
            stationStatusBarItem.hide();
        }
    }
}

export function deactivate() {
    mainStatusBarItem?.dispose();
    playPauseStatusBarItem?.dispose();
    stationStatusBarItem?.dispose();
}
