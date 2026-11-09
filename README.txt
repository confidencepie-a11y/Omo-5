PENNY - WALLET APP UI
=====================

Files
-----
index.html      Markup: splash screen (new logo + wordmark), signup/login page, Telegram pop-up, wallet
style.css       All styling (dark wallet, floating glass nav, lime brand colour #BFFF00)
script.js       Splash timing (about 3.3s + soft fade; logo/wordmark animation itself is CSS), balance count-up, globe/plane animation,
                signup/login flow, bottom navigation
manifest.json   Home-screen install settings
icon-192.png    App icon (new logo on lime)
icon-512.png    App icon (large)
globe.jpg       Original signup/login illustration (unchanged; shown if motion is reduced
                or if the layer images below fail to load)
globe-sphere.png  Globe layer cut from globe.jpg (airplane/note/trail removed)
globe-props.png   Note and lock layer cut from globe.jpg
penny-plane.png   Paper airplane cut from globe.jpg

How it works
------------
- Every launch: lime splash (about 3.3s), then it dissolves into the signup/login page.
- Create an account / Log in: opens the pop-up for Telegram username + password. After Done, the tapped
  button shows a spinner for a random 1-4 seconds, then the passcode page opens.
- Create account: Create your passcode -> Confirm your passcode -> wallet.
- Log in with a passcode already on the device: Welcome back (enter passcode) -> wallet.
- Later launches: splash -> passcode -> wallet. 5 wrong tries pause input for 30 seconds.
- Tap your name in the wallet to log out (the passcode stays on the device).
- Telegram: the app matches Telegram's header / bottom bar colours (no grey strip when scrolling),
  keeps content clear of Telegram's Close and menu buttons in fullscreen, and uses haptics on keys.
- Front-end only: only a hash of the passcode is stored on the device. Real security needs a backend
  that validates Telegram's initData and checks the passcode on the server.

Run on GitHub Pages
-------------------
1. Create a new repository and upload all the files to the root.
2. Go to Settings > Pages.
3. Under Source, choose "Deploy from a branch", pick main and / (root), then Save.
4. Open the link GitHub gives you (https://<username>.github.io/<repo>/).

Install on your phone
---------------------
iPhone (Safari): Share > Add to Home Screen.
Android (Chrome): Menu > Install app / Add to Home screen.

Notes
-----
- The fonts (DM Sans, Fredoka) load from Google Fonts, so it needs an internet connection.
- Keep all files in the same folder so the paths resolve.
