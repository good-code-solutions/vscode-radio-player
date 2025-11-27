# VS Code Radio Player

A simple, persistent radio player for VS Code. Play your favorite internet radio stations while you code!

## Features

- 🎵 **Persistent Playback**: Music keeps playing in the background while you work.
- 🎛️ **Popup Controls**: Control everything (Play/Pause, Station Select) from a simple popup menu.
- 📻 **Custom Stations**: Add your own stream URLs via VS Code settings.
- 🔇 **Unobtrusive**: The player engine hides in the Sidebar, staying out of your way.

## How to Use

1.  **Open Controls**: Click the `Radio` button in the Status Bar (bottom right).
2.  **Play/Pause**: Use the menu to toggle playback.
3.  **Change Station**: Select `Change Station` to pick from your list.

## Configuration

The extension comes with a few sample stations (SomaFM, BBC, etc.). **You should add your own favorite stations!**

1.  Open **Settings** (`Cmd+,` or `Ctrl+,`).
2.  Search for `Radio Player`.
3.  Click **Edit in settings.json** under `Radio Player: Custom Stations`.
4.  Add your stations in the following format:

```json
"radioPlayer.customStations": [
    {
        "name": "My Favorite Station",
        "url": "http://stream.example.com/radio.mp3"
    },
    {
        "name": "Another Stream",
        "url": "https://another-stream.com/playlist.m3u"
    }
]
```

## Requirements

- VS Code 1.80.0 or higher.
- Internet connection for streaming.

## Known Issues

- Some streams (especially HLS/m3u8) might not play depending on the codec support in VS Code's internal browser (Chromium). MP3 and OGG streams are most reliable.

---

## Enjoying the extension?

If you find this extension useful, please consider **rating it on the Marketplace**! ⭐⭐⭐⭐⭐
Your feedback helps us improve.
