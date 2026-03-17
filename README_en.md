# VLR.gg Scraper

Picks&Bans, Stats, and Pistols in a single floating interface to ease data extraction and analysis on VLR.gg. Developed as a Tampermonkey extension, this script automatically extracts match and map statistics, saving time on manual searches.

Leia isto em: [Português](README.md)

## 🚀 Features

The script adds a floating 📊 button to the bottom right corner of the vlr.gg website. By clicking on it, you have access to three main modules:

### 1. Picks&Bans (Comparative Scraper)
Quickly discover the most played, most banned, and most picked maps among teams.
- Allows filtering the pick and ban rate of up to two different teams simultaneously.
- Search by specific event or date (e.g., Champions only, or just the last 3 months).
- Customizable limit for the number of analyzed matches.

### 2. Stats (Stats Extractor)
Extracts information about win rates per map and sides (Attacker vs. Defender).
- Grabs the map win table ("w", "l", "win%").
- Colors the win rates in the table based on the % (from 0% to 100%, in scales from red to green).
- Displays `first blood` metrics for each side.
- "COPY TABLE" button that perfectly formats the data to paste into Excel, Google Sheets, Discord, or Notion, keeping colors and structure.

### 3. Pistols (Omniscient Scraper)
A specific module focused on win and loss statistics in *Pistol Rounds*.
- Filters by teams (up to two) to compare performances.
- Shows a "Grand Total" of *Pistols* won across all filtered maps.
- Creates a breakdown of *Pistols* won divided map by map.
- Displays win rates (% of w/l) in *pistols*.

## 🛡️ Stability & Security
- **Isolation via SecureStorage:** Uses native Tampermonkey GM_setValue methods, protecting saved data and the internal cache in your browser.
- **Controlled Requests (Fetch):** Only connects to the official vlr.gg domain, preventing traffic anywhere else.

## ⚙️ How to Install and Use

1. In your browser, install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Open the Tampermonkey panel (Dashboard) and click the `+` tab to create a new script.
3. Copy all the code contained in the `script.user.js` file from this repository and paste it there.
4. Save (`Ctrl+S` or File > Save tab).
5. Go to the [VLR.gg](https://www.vlr.gg) website and check if the 📊 tool button appears in the corner of your screen.

> [!IMPORTANT]
> **Opera Users:** For the script to work, you must enable **Developer Mode** in Opera's extension settings and turn on the **"Allow User Scripts"** option. Additionally, Opera may display a warning stating that the extension will run unreviewed code; you must confirm that you trust the script for it to be enabled.

## 🧑‍💻 Authors

- **Nyang**
- **dollyzn**
