# 304 Card Table — Room Code Multiplayer

This version replaces the original peer-to-peer WebRTC invite/reply system with a server-authoritative WebSocket backend.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Play with friends over the internet

The server must be reachable by all players. For testing, deploy this folder to a Node.js host that supports WebSockets. Then everyone opens the same HTTPS URL.

1. Host opens the game and selects **Host a room for friends**.
2. The server creates a 6-character room code.
3. Host sends the code to three friends.
4. Friends select **Join a friend's room** and enter the code.
5. The server keeps the game state and validates game actions.

## Architecture

- `server.js` — HTTP server, WebSocket server, room management and authoritative game state.
- `server-engine.js` — extracted 304 rules/game engine from the supplied game.
- `public/index.html` — original game UI adapted to use WebSockets and room codes.

## Security / privacy notes

The server controls the game state and sends each player a seat-specific view, so a normal client is not sent the other players' hidden hands.

For a production deployment, put the server behind HTTPS/WSS and add authentication/rate limiting if you want persistent accounts or public matchmaking.
