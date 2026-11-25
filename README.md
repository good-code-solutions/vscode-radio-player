# VS Code Radio Player

A VS Code extension for streaming internet radio while you work.

## Features

- 🎵 **Persistent Playback**: Music keeps playing in the background while you work.
- 🎛️ **Popup Controls**: Control everything (Play/Pause, Station Select) from a simple popup menu.
- 📻 **Custom Stations**: Add your own stream URLs via VS Code settings.
- 🔇 **Unobtrusive**: The player engine hides in the Sidebar, staying out of your way.

## Usage

Select **Radio Player** in the activity bar to open the player. Use the status bar **Radio** control to play, pause, or select a station.

Add stations in VS Code settings under `radioPlayer.customStations`:

```json
"radioPlayer.customStations": [
  {
    "name": "My Station",
    "url": "https://example.com/radio.mp3",
    "fallbackUrl": "https://example.com/backup.mp3",
    "thumbnail": "https://example.com/artwork.jpg"
  }
]
```

Only `name` and `url` are required. The extension includes sample stations in the setting's default value.

## Station directory

Country and genre browsing uses the Radio Browser directory through the `radio-browser` package. Results are cached in memory for one hour. Radio Browser is a community service and may be unavailable.

Country markers use bundled Natural Earth boundary data. HLS streams require browser Media Source support and cross-origin access from the stream host. Other stream formats depend on codecs supported by VS Code's embedded browser.

## Development

```sh
npm install
npm run compile
npm run lint
```

The compile script builds the styles, webview bundle, and extension bundle.

## Requirements

- VS Code 1.80.0 or later.
- Internet access for streaming and directory browsing.

## License

The extension is licensed under MIT; see [LICENSE](./LICENSE). Third-party notices are provided in [LICENSE-hls.js.txt](./LICENSE-hls.js.txt), [LICENSE-natural-earth.txt](./LICENSE-natural-earth.txt), and [LICENSE-radio-browser.txt](./LICENSE-radio-browser.txt).


---

## Enjoying the extension?

If you find this extension useful, please consider **rating it on the Marketplace**! ⭐⭐⭐⭐⭐
Your feedback helps us improve.