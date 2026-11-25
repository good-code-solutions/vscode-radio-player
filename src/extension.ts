import * as vscode from 'vscode';
import { RadioPlayerViewProvider } from './RadioPlayerViewProvider';
import { PlaybackBroker } from './PlaybackBroker';
import { RadioBrowserApi } from './RadioBrowserApi';

let mainStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Radio Player extension is now active!');

    const provider = new RadioPlayerViewProvider(context.extensionUri, new RadioBrowserApi());
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(RadioPlayerViewProvider.viewType, provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    mainStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    mainStatusBarItem.text = '$(radio-tower) Radio';
    mainStatusBarItem.command = 'vscode-radio-player.open';
    mainStatusBarItem.tooltip = 'Open Radio Controls';
    mainStatusBarItem.show();

    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-radio-player.open', () => {
            showRadioMenu();
        }),
        vscode.commands.registerCommand('vscode-radio-player.play', () => {
            RadioPlayerViewProvider.instance?.play();
        }),
        vscode.commands.registerCommand('vscode-radio-player.pause', () => {
            RadioPlayerViewProvider.instance?.pause();
        }),
        vscode.commands.registerCommand('vscode-radio-player.pickStation', () => {
            pickStation();
        }),
    );

    // Apply commands received by the playback owner to its webview.
    PlaybackBroker.instance.applyCommand = msg => {
        const provider = RadioPlayerViewProvider.instance;
        if (!provider) {
            return;
        }
        if (msg.command === 'setStation' && msg.station) {
            provider.applyBrokerCommand(msg);
        } else if (msg.command === 'play' || msg.command === 'pause') {
            provider.applyBrokerCommand({ command: msg.command });
        }
    };

    PlaybackBroker.instance.ensureStarted();

    context.subscriptions.push(mainStatusBarItem);
}

async function showRadioMenu() {
    if (!RadioPlayerViewProvider.instance) {
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
            pickStation();
            break;
        case 'show':
            vscode.commands.executeCommand('radioPlayerView.focus');
            break;
    }
}

async function pickStation() {
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
        RadioPlayerViewProvider.instance?.setStation(selected.station);
    }
}

export function deactivate() {
    PlaybackBroker.instance.dispose();
    mainStatusBarItem?.dispose();
}
