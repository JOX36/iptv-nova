# IPTV Nova — Next Generation Player

A modern, high-performance IPTV player built as a pure web app (PWA). Compatible with Xtream Codes API.

## ✨ Features

- **Modern UI** — Glassmorphism design, smooth animations, dark/light themes
- **PWA Ready** — Install as app on any device (Android, iOS, Desktop)
- **Live TV** — Stream channels with HLS support and real-time EPG
- **VOD & Series** — Browse movies and TV series with rich metadata
- **EPG Guide** — Interactive program guide with timeline and progress
- **Smart Search** — Global search across all sections
- **Favorites** — Save and organize your favorite channels
- **History** — Quick access to recently watched content
- **Multiple Accounts** — Switch between providers instantly
- **External Players** — Open streams in VLC or other apps
- **Speed Control** — Adjustable playback speed (0.5× – 2×)
- **Fullscreen** — Native fullscreen with overlay channel switching
- **Responsive** — Works perfectly on phones, tablets, and desktops
- **Offline Cache** — Service worker caches the app shell

## 🚀 Installation

### As a website (any server)
1. Upload all files to any web server or static hosting
2. Open `index.html` in a browser
3. Enter your Xtream Codes credentials

### As a PWA
1. Open the app in your browser
2. Tap "Add to Home Screen" (Android/iOS)
3. The app will install and work offline

### GitHub Pages
1. Fork this repository
2. Enable GitHub Pages in Settings → Pages
3. Access via `https://yourusername.github.io/iptv-nova/`

## 📱 How to Use

1. **Connect**: Enter your server URL, username, and password
2. **Browse**: Use the sidebar to navigate categories
3. **Play**: Click any channel, movie, or series to start
4. **Search**: Press `/` or tap the search bar to find content
5. **Favorites**: Click the star on any channel to save it

## 🎨 Theme

Toggle between dark and light mode with the moon/sun button in the top bar.

## 📂 File Structure

```
iptv-nova/
├── index.html      # Main HTML structure
├── style.css       # All styles and responsive design
├── app.js          # Application logic
├── manifest.json   # PWA manifest
├── sw.js           # Service worker for offline support
├── assets/
│   └── icon.svg    # App icon
└── README.md       # This file
```

## 🔧 Requirements

- Any modern browser (Chrome, Firefox, Safari, Edge)
- Xtream Codes compatible IPTV subscription
- Internet connection for streaming

## 📄 License

Free to use and modify.
