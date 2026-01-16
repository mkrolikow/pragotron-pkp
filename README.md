# pragotron-pkp

#Uruchomienie

npm i
npm start

Otwórz: http://localhost:3000

Przykład kiosk/TV (URL steruje opcjami):

/?station=Krakow%20Glowny&mode=departures&rows=10&page=1&rotate=8&refresh=15&char=step&flip=140&stagger=14&grace=15&sweep=1&blanks=1&sound=1&overshoot=1&overshootChance=0.08&sweepAllDepart=1&sweepAllUpdate=0&sweepSpeed=28&brightness=1.0&night=0&kiosk=1

A dodatkowo (po dopięciu parseUrlParams) możesz dodać:

overshoot=1

overshootChance=0.08

sweepAllDepart=1

sweepAllUpdate=0

sweepSpeed=28

brightness=1.0

dim=1&dimFrom=22:00&dimTo=06:00

#Struktura

pragotron-pkp/
  package.json
  server.js
  public/
    index.html
    style.css
    app.js

