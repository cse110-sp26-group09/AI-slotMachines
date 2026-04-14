# Token Tumbler (Vanilla Slot Machine)

Open `index.html` in a browser to play.

## Another One: Prompt Payout

Open `prompt-payout/index.html` to play the second AI-roasting slot machine.

For the full "platform APIs" experience (Clipboard, Notifications, Install/PWA, etc.), serve the folder locally:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Bonus (PWA / Offline)

When served over `http://localhost` (or HTTPS), the app registers a service worker (`sw.js`) and caches the static assets so it can load offline after the first visit. Some browsers will also offer an **Install** button.

## Controls

- `Space`: Spin
- `M`: Max Spin
- `A`: Auto x5
- Pull the lever: Click or drag down

## Token Sink

There's a small in-app store that lets you spend tokens on silly "upgrades" like a luck buff or a one-spin shield.
