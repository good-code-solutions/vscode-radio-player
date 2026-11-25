import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface PlayerState {
    isPlaying: boolean;
    stationName?: string;
    stationUrl?: string;
    stationFallbackUrl?: string;
    stationThumbnail?: string;
    country?: string;
    stationUuid?: string;
    codec?: string;
    sourceId?: string;
    /** Timestamp of the last state write (used to detect stale "playing" state). */
    ts?: number;
}

type BrokerMessage =
    | { type: 'state'; state: PlayerState }
    | { type: 'heartbeat' }
    | {
        type: 'command';
        command: 'play' | 'pause' | 'setStation';
        station?: { name: string; url: string; fallbackUrl?: string; thumbnail?: string; country?: string; codec?: string };
    };

/** Coordinates playback state and commands across VS Code windows. */
export class PlaybackBroker {
    private static _instance: PlaybackBroker | undefined;
    public static get instance(): PlaybackBroker {
        if (!PlaybackBroker._instance) {
            PlaybackBroker._instance = new PlaybackBroker();
        }
        return PlaybackBroker._instance;
    }

    private _isServer = false;
    private _server?: net.Server;
    private _socket?: net.Socket;
    private _clients = new Set<net.Socket>();
    private _buffer = '';
    private _lastState: PlayerState = { isPlaying: false };
    private _lastBeatTime = 0;
    private _heartbeatTimer?: NodeJS.Timeout;
    private _watchdogTimer?: NodeJS.Timeout;
    private _disposed = false;
    private readonly _sourceId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    /** A playing window is considered dead if no heartbeat arrives within this window. */
    private static readonly HEARTBEAT_INTERVAL_MS = 2000;
    private static readonly HEARTBEAT_TIMEOUT_MS = 6000;

    /** Applies a command to the local webview. Set by extension.ts. */
    public applyCommand: ((msg: Extract<BrokerMessage, { type: 'command' }>) => void) | undefined;
    /** Fires whenever shared state changes (local or remote). */
    private _onStateUpdate = new vscode.EventEmitter<PlayerState>();
    public readonly onStateUpdate = this._onStateUpdate.event;

    private constructor() {}

    public get sourceId(): string {
        return this._sourceId;
    }

    private get _pipePath(): string {
        if (process.platform === 'win32') {
            return `\\\\.\\pipe\\vscode-radio-player-broker-${process.env.USERNAME ?? 'user'}`;
        }
        // Use a per-user socket path.
        const name = `vscode-radio-player-${process.env.USER ?? 'user'}.sock`;
        return `${os.tmpdir()}/${name}`;
    }

    private get _stateFilePath(): string {
        const name = `vscode-radio-player-state-${process.env.USER ?? process.env.USERNAME ?? 'user'}.json`;
        return path.join(os.tmpdir(), name);
    }

    /** Persist state for windows started later. */
    private _persistState(state: PlayerState): void {
        try {
            const withTs = { ...state, ts: Date.now() };
            fs.writeFileSync(this._stateFilePath, JSON.stringify(withTs), 'utf8');
        } catch {
            /* best effort */
        }
    }

    /** Send heartbeats while playback is active. */
    private _startHeartbeat(): void {
        this._stopHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            if (this._lastState.isPlaying) {
                this._broadcast({ type: 'heartbeat' });
            }
        }, PlaybackBroker.HEARTBEAT_INTERVAL_MS);
    }

    private _stopHeartbeat(): void {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = undefined;
        }
    }

    /** Reset stale playing state when the owner stops sending heartbeats. */
    private _startWatchdog(): void {
        if (this._watchdogTimer) {
            return;
        }
        this._lastBeatTime = Date.now();
        this._watchdogTimer = setInterval(() => {
            if (
                this._lastState.isPlaying &&
                Date.now() - this._lastBeatTime > PlaybackBroker.HEARTBEAT_TIMEOUT_MS
            ) {
                // The playing window vanished - reset so we don't show a stale "playing" state
                const paused: PlayerState = { isPlaying: false, stationName: this._lastState.stationName };
                this._lastState = paused;
                this._onStateUpdate.fire(paused);
                this._persistState(paused);
            }
        }, 2000);
    }

    private _stopWatchdog(): void {
        if (this._watchdogTimer) {
            clearInterval(this._watchdogTimer);
            this._watchdogTimer = undefined;
        }
    }

    /** Restore persisted state, downgrading stale playback to paused. */
    private _restoreState(): void {
        try {
            const raw = fs.readFileSync(this._stateFilePath, 'utf8');
            const state = JSON.parse(raw) as PlayerState;
            if (typeof state.isPlaying === 'boolean') {
                const stale = state.isPlaying &&
                    typeof state.ts === 'number' &&
                    Date.now() - state.ts > PlaybackBroker.HEARTBEAT_TIMEOUT_MS;
                this._lastState = stale ? { isPlaying: false, stationName: state.stationName } : state;
                this._onStateUpdate.fire(this._lastState);
            }
        } catch {
            /* The state file may not exist on first launch. */
        }
    }

    /**
     * Start the broker: connect to an existing owner window's server,
     * otherwise become the server. Safe to call multiple times.
     */
    public ensureStarted(): void {
        if (this._disposed || this._isServer || this._socket) {
            return;
        }
        // Restore state before connecting for immediate UI updates.
        this._restoreState();
        this._tryConnect();
    }

    private _tryConnect(): void {
        const socket = net.connect(this._pipePath);
        socket.setNoDelay(true);

        const failTimer = setTimeout(() => {
            socket.destroy();
            this._becomeServer();
        }, 800);

        socket.once('connect', () => {
            clearTimeout(failTimer);
            this._socket = socket;
            this._startWatchdog();
            this._attachSocket(socket);
        });

        socket.once('error', () => {
            clearTimeout(failTimer);
            socket.destroy();
            this._becomeServer();
        });
    }

    private _becomeServer(): void {
        if (this._disposed || this._isServer) {
            return;
        }
        const server = net.createServer(socket => {
            this._clients.add(socket);
            this._attachSocket(socket);
            this._sendTo(socket, { type: 'state', state: this._lastState });
            socket.on('close', () => this._clients.delete(socket));
        });

        if (process.platform !== 'win32') {
            // Remove a stale socket file.
            try {
                require('fs').unlinkSync(this._pipePath);
            } catch {
                /* The socket file may not exist. */
            }
        }

        server.on('error', () => {
            // Retry as a client if another window owns the socket.
            this._isServer = false;
            server.close();
            setTimeout(() => this._tryConnect(), 1000);
        });

        server.listen(this._pipePath, () => {
            this._isServer = true;
            this._server = server;
            this._startHeartbeat();
            this._stopWatchdog();
            // Restore state after acquiring the server socket.
            this._restoreState();
        });
    }

    private _attachSocket(socket: net.Socket): void {
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            this._buffer += chunk;
            let index: number;
            while ((index = this._buffer.indexOf('\n')) >= 0) {
                const line = this._buffer.slice(0, index);
                this._buffer = this._buffer.slice(index + 1);
                if (!line.trim()) {
                    continue;
                }
                try {
                    this._handleMessage(JSON.parse(line) as BrokerMessage);
                } catch {
                    /* malformed message - ignore */
                }
            }
        });
        socket.on('error', () => socket.destroy());
        socket.on('close', () => {
            if (socket === this._socket) {
                // Reconnect or take over if the owner disconnects.
                this._socket = undefined;
                if (!this._disposed) {
                    setTimeout(() => {
                        if (!this._isServer && !this._socket) {
                            this._tryConnect();
                        }
                    }, 1000);
                }
            }
        });
    }

    private _handleMessage(msg: BrokerMessage): void {
        switch (msg.type) {
            case 'state':
                this._lastState = msg.state;
                this._onStateUpdate.fire(msg.state);
                this._persistState(msg.state);
                if (this._isServer) {
                    // Relay client state to other clients.
                    this._broadcast({ type: 'state', state: msg.state });
                }
                break;
            case 'heartbeat':
                this._lastBeatTime = Date.now();
                break;
            case 'command':
                if (this._isServer) {
                    this.applyCommand?.(msg);
                }
                break;
        }
    }

    private _sendTo(socket: net.Socket, msg: BrokerMessage): void {
        try {
            socket.write(JSON.stringify(msg) + '\n');
        } catch {
            /* socket already gone */
        }
    }

    private _broadcast(msg: BrokerMessage): void {
        for (const client of this._clients) {
            this._sendTo(client, msg);
        }
    }

    /** Share local playback state with other windows. */
    public broadcastState(state: PlayerState): void {
        const sharedState: PlayerState = { ...state, sourceId: this._sourceId };
        this._lastState = sharedState;
        this._onStateUpdate.fire(sharedState);
        this._persistState(sharedState);
        if (this._isServer) {
            this._broadcast({ type: 'state', state: sharedState });
        } else if (this._socket) {
            this._sendTo(this._socket, { type: 'state', state: sharedState });
        }
    }

    /** Send a playback command to the owning window. */
    public sendCommand(
        command: 'play' | 'pause' | 'setStation',
        station?: { name: string; url: string; fallbackUrl?: string; thumbnail?: string; country?: string; codec?: string }
    ): void {
        this.ensureStarted();
        const msg: BrokerMessage = { type: 'command', command, station };
        if (this._isServer) {
            this.applyCommand?.(msg);
        } else if (this._socket) {
            this._sendTo(this._socket, msg);
        }
        // Retry after the connection is established.
        else {
            this._connectThenSend(msg as Extract<BrokerMessage, { type: 'command' }>);
        }
    }

    private _connectThenSend(msg: Extract<BrokerMessage, { type: 'command' }>): void {
        const trySend = () => {
            if (this._isServer) {
                this.applyCommand?.(msg);
            } else if (this._socket) {
                this._sendTo(this._socket, msg);
            }
        };
        const check = setInterval(() => {
            if (this._isServer || this._socket) {
                clearInterval(check);
                trySend();
            }
        }, 200);
        setTimeout(() => clearInterval(check), 5000);
    }

    public dispose(): void {
        this._disposed = true;
        this._stopHeartbeat();
        this._stopWatchdog();
        this._server?.close();
        this._socket?.destroy();
        for (const client of this._clients) {
            client.destroy();
        }
        this._clients.clear();
        this._onStateUpdate.dispose();
        PlaybackBroker._instance = undefined;
    }
}
