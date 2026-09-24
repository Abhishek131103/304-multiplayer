'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ENGINE_SOURCE = fs.readFileSync(path.join(__dirname, 'server-engine.js'), 'utf8');
const rooms = new Map();

function makeEngine(){
  const sandbox = {module:{exports:{}}, exports:{}, console, Math, Date, Uint8Array, Array, Object, JSON, Set, Map};
  vm.runInNewContext(ENGINE_SOURCE, sandbox, {filename:'server-engine.js'});
  return sandbox.module.exports;
}
function roomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c; do { c=''; for(let i=0;i<6;i++) c += chars[Math.floor(Math.random()*chars.length)]; } while(rooms.has(c));
  return c;
}
function cleanName(n, fallback){
  n=String(n||'').replace(/[<>]/g,'').trim().slice(0,16);
  return n || fallback;
}
function roomConn(room){
  return [0,1,2,3].map(s=>!!room.players[s]);
}
function viewFor(room, seat){
  const v=room.engine.makeView(seat, roomConn(room));
  v.local=false; v.host=seat===0; v.seat=seat; v.room=room.code;
  return v;
}
function send(ws,obj){ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(room){
  for(let s=0;s<4;s++) if(room.players[s]) send(room.players[s].ws,{t:'view',v:viewFor(room,s)});
}
function sendError(ws,msg){send(ws,{t:'err',m:msg});}
function validConfig(c){
  if(!c || typeof c!=='object') return false;
  if(!c.rules || typeof c.rules!=='object' || !c.sel || typeof c.sel!=='object') return false;
  return ['S','H','C','D'].every(s=>Array.isArray(c.sel[s]) && c.sel[s].every(r=>roomRank(roomEngineDummy(),r)));
}
function roomEngineDummy(){ return null; }
function roomRank(_,r){ return ['A','K','Q','J','10','9','8','7','6','5','4','3','2'].includes(r); }
function applyConfig(room,c){
  if(!c || typeof c!=='object') throw Error('Invalid room settings');
  const e=room.engine;
  if(c.rules && typeof c.rules==='object'){
    for(const k of Object.keys(e.G.rules)) if(Object.prototype.hasOwnProperty.call(c.rules,k)) e.G.rules[k]=c.rules[k];
  }
  for(const s of e.SUITS){
    const arr=Array.isArray(c.sel?.[s.id])?c.sel[s.id]:[];
    e.G.sel[s.id]=new Set(arr.filter(r=>e.RANKS.includes(r)));
  }
  if(Array.isArray(c.names)) for(let i=0;i<4;i++) e.G.names[i]=cleanName(c.names[i],e.G.names[i]);
}
function createRoom(ws,name){
  const code=roomCode(), e=makeEngine(); e.freshG();
  e.G.names[0]=cleanName(name,'Player 1');
  const room={code,engine:e,players:Array(4).fill(null),created:Date.now()};
  room.players[0]={ws,name:e.G.names[0],seat:0}; rooms.set(code,room);
  ws.room=room; ws.seat=0;
  send(ws,{t:'room',room:code,seat:0}); broadcast(room);
}
function joinRoom(ws,code,name){
  const room=rooms.get(code); if(!room) return sendError(ws,'Room not found. Check the code.');
  const seat=[1,2,3].find(i=>!room.players[i]); if(seat==null) return sendError(ws,'This room is full.');
  if(room.engine.G.phase!=='lobby') return sendError(ws,'This game has already started.');
  room.engine.G.names[seat]=cleanName(name,`Player ${seat+1}`);
  room.players[seat]={ws,name:room.engine.G.names[seat],seat}; ws.room=room; ws.seat=seat;
  send(ws,{t:'room',room:code,seat}); broadcast(room);
}
function handle(ws,m){
  if(!m || typeof m!=='object') return;
  if(m.t==='ping'){send(ws,{t:'pong'});return;}
  if(m.t==='create'){if(ws.room)return;createRoom(ws,m.name);return;}
  if(m.t==='join'){if(ws.room)return;joinRoom(ws,String(m.room||'').toUpperCase(),m.name);return;}
  const room=ws.room; if(!room)return sendError(ws,'Join a room first.');
  const e=room.engine;
  if(m.t==='config'){
    if(ws.seat!==0)return sendError(ws,'Only the host can change room settings.');
    if(e.G.phase!=='lobby')return sendError(ws,'Settings can only be changed in the lobby.');
    try{applyConfig(room,m);broadcast(room);}catch(err){sendError(ws,err.message)}
    return;
  }
  if(m.t==='start'){
    if(ws.seat!==0)return sendError(ws,'Only the host can start the game.');
    if(e.G.phase!=='lobby')return sendError(ws,'The game has already started.');
    if(room.players.slice(0,4).some((p,i)=>!p))return sendError(ws,'All four seats must be connected.');
    if(!e.deckValid())return sendError(ws,'The selected deck is not valid.');
    e.startRound(); broadcast(room); return;
  }
  if(m.t==='act'){
    const a=m.a; if(!a || typeof a!=='object')return sendError(ws,'Invalid action.');
    let seat=ws.seat;
    if(a.t==='next' && seat!==0)return sendError(ws,'Only the host can deal the next round.');
    const r=e.apply(seat,a);
    if(!r.ok)return sendError(ws,r.err||'Illegal move.');
    broadcast(room); return;
  }
}
function disconnect(ws){
  const room=ws.room; if(!room)return;
  if(room.players[ws.seat]?.ws===ws) room.players[ws.seat]=null;
  if(ws.seat===0){
    for(const p of room.players) if(p) send(p.ws,{t:'closed',m:'The host disconnected. The room has closed.'});
    rooms.delete(room.code); return;
  }
  broadcast(room);
}
const server=http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,`http://${req.headers.host||'localhost'}`)}catch(_){res.writeHead(400);return res.end('Bad request');}
  if(url.pathname==='/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,rooms:rooms.size}));}
  let file=url.pathname==='/'?'/index.html':url.pathname;
  if(file.includes('..')){res.writeHead(400);return res.end('Bad request');}
  const fp=path.join(PUBLIC,file);
  fs.readFile(fp,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');} const type=fp.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream';res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(data);});
});
const wss=new WebSocket.Server({server});
wss.on('connection',ws=>{ws.on('message',d=>{try{handle(ws,JSON.parse(d.toString()))}catch(e){sendError(ws,'Server error: '+e.message)}});ws.on('close',()=>disconnect(ws));});
server.listen(PORT, '0.0.0.0', () => console.log(`304 multiplayer server running on port ${PORT}`));
