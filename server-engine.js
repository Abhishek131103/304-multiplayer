(function(){
'use strict';

/* ================= constants ================= */
const SUITS=[
  {id:'S',sym:'\u2660',name:'Spades',red:false},
  {id:'H',sym:'\u2665',name:'Hearts',red:true},
  {id:'C',sym:'\u2663',name:'Clubs',red:false},
  {id:'D',sym:'\u2666',name:'Diamonds',red:true}
];
const SM=Object.fromEntries(SUITS.map(s=>[s.id,s]));
const SUIT_SORT=['S','H','C','D'];
const RANKS=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
const ORDER=['J','9','A','10','K','Q','8','7','6','5','4','3','2'];
const POINTS={J:30,'9':20,A:11,'10':10,K:3,Q:2};
const POS=['S','E','N','W'];
const POS_NAME=['South','East','North','West'];
const MARRIAGE_NT=20, MARRIAGE_T=40;
const pts=c=>POINTS[c.r]||0;
const str=c=>ORDER.length-ORDER.indexOf(c.r);
const cname=c=>c.r+SM[c.s].sym;

const DEF_RULES={
  partnerCall:true, showAll8:true, marriage:true, marriageAfterTrick:true,
  concealedTrump:true, mustTrump:false, minBid:160, maxBid:250
};
const CLASSIC_RULES={
  partnerCall:false, showAll8:false, marriage:false, marriageAfterTrick:true,
  concealedTrump:true, mustTrump:false, minBid:160, maxBid:250
};

/* ================= state ================= */
let G=null;

function freshG(){
  G={
    phase:'lobby',
    names:['Player 1','Player 2','Player 3','Player 4'],
    rules:Object.assign({},DEF_RULES),
    sel:{}, dealer:3, round:0, game:[0,0,0,0],
    hands:[[],[],[],[]], per:0, total:0, vis2:[false,false,false,false],
    bid:null, bidder:-1, contract:0,
    trumpSuit:null, trumpRevealed:false, forceTrumpFor:-1,
    partnerCard:null, partner:-1, partnerRevealed:false, partnerOut:false,
    trick:[], leader:0, turn:0, collect:null, tricksPlayed:0,
    pts:[0,0], tricksWon:[0,0], lastTrick:null,
    marriages:[], extraTarget:0,
    log:[], result:null, newestId:null
  };
  setLowest('7');
  return G;
}
function setLowest(low){
  const idx=RANKS.indexOf(low);
  for(const s of SUITS)G.sel[s.id]=new Set(RANKS.slice(0,idx+1));
}

/* ================= helpers ================= */
const ok=()=>({ok:true}), no=e=>({ok:false,err:e});
const nm=p=>G.names[p]||('Player '+(p+1));
const sym=id=>SM[id].sym;
function addLog(m){G.log.unshift(m);if(G.log.length>40)G.log.pop();}
function rnd(n){
  const g=(typeof globalThis!=='undefined')&&globalThis.crypto;
  if(g&&g.getRandomValues){
    const a=new Uint32Array(1),lim=Math.floor(4294967296/n)*n;let x;
    do{g.getRandomValues(a);x=a[0];}while(x>=lim);
    return x%n;
  }
  return Math.floor(Math.random()*n);
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function sortHand(h){return h.slice().sort((a,b)=>SUIT_SORT.indexOf(a.s)-SUIT_SORT.indexOf(b.s)||str(b)-str(a));}
function buildDeck(){
  const d=[];
  for(const s of SUITS)for(const r of RANKS)if(G.sel[s.id].has(r))d.push({id:s.id+r,s:s.id,r:r});
  return d;
}
function deckStats(){
  let n=0,t=0;
  for(const s of SUITS)for(const r of G.sel[s.id]){n++;t+=POINTS[r]||0;}
  return {n,t};
}
function deckValid(){const s=deckStats();return s.n>=8&&s.n%4===0;}
function isStandard(){
  return SUITS.every(s=>{const x=G.sel[s.id];return x.size===8&&['A','K','Q','J','10','9','8','7'].every(r=>x.has(r));});
}
function visibleCards(p){return G.hands[p].filter(c=>c.r1||G.vis2[p]);}
function allCards(){return G.hands.flat();}
function countFor(p){return visibleCards(p).length;}
function sideOf(p){ /* 0 = bidding side, 1 = defenders */
  if(G.bidder<0)return p%2;
  if(G.rules.partnerCall)return (p===G.bidder||p===G.partner)?0:1;
  return (p%2===G.bidder%2)?0:1;
}
function actorSeat(){
  if(!G)return -1;
  if(G.phase==='bidding')return G.bid.turn;
  if(G.phase==='call')return G.bidder;
  if(G.phase==='play')return G.collect?G.collect.winner:G.turn;
  return -1;
}

/* ================= round setup ================= */
function bidLimits(total){
  const cap=Math.max(10,Math.floor(total/10)*10);
  const max=Math.min(G.rules.maxBid,cap);
  const min=Math.min(G.rules.minBid,max);
  return {min,max,step:10};
}
function startRound(){
  const deck=shuffle(buildDeck());
  G.per=deck.length/4;
  G.total=deck.reduce((a,c)=>a+pts(c),0);
  const h1=Math.ceil(G.per/2);
  G.hands=[[],[],[],[]];
  let idx=0;
  for(let round=0;round<2;round++){
    const count=round===0?h1:G.per-h1;
    for(let k=0;k<count;k++)for(let j=0;j<4;j++){
      const p=(G.dealer+1+j)%4;const c=deck[idx++];c.r1=(round===0);G.hands[p].push(c);
    }
  }
  const cfg=bidLimits(G.total);
  G.bid={min:cfg.min,max:cfg.max,step:cfg.step,passed:[false,false,false,false],high:0,highBy:-1,turn:(G.dealer+1)%4};
  G.phase='bidding';G.round++;G.vis2=[false,false,false,false];
  G.trumpSuit=null;G.trumpRevealed=false;G.bidder=-1;G.contract=0;
  G.partnerCard=null;G.partner=-1;G.partnerRevealed=false;G.partnerOut=false;G.marriages=[];G.extraTarget=0;
  G.trick=[];G.collect=null;G.tricksPlayed=0;G.pts=[0,0];G.tricksWon=[0,0];
  G.lastTrick=null;G.forceTrumpFor=-1;G.result=null;G.newestId=null;G.log=[];
  addLog('Round '+G.round+': '+deck.length+' cards shuffled, '+G.per+' each. '+nm((G.dealer+1)%4)+' bids first.');
}

/* ================= bidding ================= */
function placeBid(v){
  const b=G.bid,p=b.turn;
  if(!(Number.isInteger(v)&&v>b.high&&v>=b.min&&v<=b.max&&(v-b.min)%b.step===0))return false;
  b.high=v;b.highBy=p;addLog(nm(p)+' bids '+v);nextBidTurn();return true;
}
function passBid(){
  const b=G.bid,p=b.turn;b.passed[p]=true;addLog(nm(p)+' passes');nextBidTurn();
}
function nextBidTurn(){
  const b=G.bid;
  const alive=[0,1,2,3].filter(i=>!b.passed[i]);
  if(alive.length===0){G.phase='redeal';addLog('Everyone passed');return;}
  if(alive.length===1&&b.highBy===alive[0]){
    G.bidder=b.highBy;G.contract=b.high;G.phase='call';
    if(G.rules.showAll8)G.vis2[G.bidder]=true;
    addLog(nm(G.bidder)+' wins the bid at '+G.contract);return;
  }
  let n=(b.turn+1)%4;while(b.passed[n])n=(n+1)%4;
  b.turn=n;
}

/* ================= trump and partner call ================= */
function callTrump(suit,partnerId){
  const p=G.bidder;
  if(!SM[suit])return 'Choose a suit for trump';
  let pc=null;
  if(G.rules.partnerCall){
    pc=allCards().find(c=>c.id===partnerId);
    if(!pc)return 'Call a partner card';
    if(visibleCards(p).some(c=>c.id===pc.id))return "You can't call a card you are holding";
  }
  G.trumpSuit=suit;
  G.trumpRevealed=!G.rules.concealedTrump;
  addLog(G.rules.concealedTrump
    ?nm(p)+' secretly chooses a trump suit.'
    :nm(p)+' names trump: '+sym(suit)+' '+SM[suit].name+'.');
  G.vis2=[true,true,true,true];
  if(pc){
    G.partnerCard=pc;
    const holder=G.hands.findIndex(h=>h.some(c=>c.id===pc.id));
    G.partner=(holder===p||holder<0)?-1:holder;
    G.partnerOut=(G.partner<0);
    addLog(nm(p)+' calls '+cname(pc)+' as the partner card.');
  }
  G.phase='play';G.trick=[];G.collect=null;
  G.leader=(G.dealer+1)%4;G.turn=G.leader;
  prepareTurn();
  return null;
}
function revealTrump(msg){
  if(G.trumpRevealed)return;
  G.trumpRevealed=true;
  addLog(msg+' Trump is '+sym(G.trumpSuit)+' '+SM[G.trumpSuit].name+'.');
}
function partnerOutDeclare(seat){
  if(!G.rules.partnerCall)return 'This rule is off';
  if(seat!==G.bidder)return 'Only the bidder can call partner out';
  if(G.phase!=='play')return 'Not during play';
  if(G.partner<0)return 'You are playing alone; there is no partner to call out';
  if(G.partnerRevealed)return 'The partner is already known';
  if(G.partnerOut)return 'Already called';
  G.partnerOut=true;
  addLog(nm(seat)+' calls "Partner out" \u2014 the partner may now play the called card.');
  return null;
}

/* ================= play ================= */
function prepareTurn(){G.forceTrumpFor=-1;}
function legalPlays(p){
  if(G.phase!=='play'||G.collect)return [];
  const hand=G.hands[p];
  const trumpCards=()=>hand.filter(c=>c.s===G.trumpSuit);
  let base;
  if(G.forceTrumpFor===p){const t=trumpCards();base=t.length?t:hand.slice();}
  else if(G.trick.length===0){
    if(p===G.bidder&&!G.trumpRevealed){
      const nt=hand.filter(c=>c.s!==G.trumpSuit);
      base=nt.length?nt:hand.slice();
    }else base=hand.slice();
  }else{
    const led=G.trick[0].card.s;
    const follow=hand.filter(c=>c.s===led);
    if(follow.length)base=follow;
    else if(G.trumpRevealed&&G.rules.mustTrump){const t=trumpCards();base=t.length?t:hand.slice();}
    else base=hand.slice();
  }
  if(G.rules.partnerCall&&G.partnerCard&&!G.partnerRevealed&&p===G.partner&&!G.partnerOut){
    const filtered=base.filter(c=>c.id!==G.partnerCard.id);
    if(filtered.length)return filtered;
    /* only legal card: forced to play it, which reveals the partnership */
  }
  return base;
}
function hintFor(p){
  if(G.trick.length===0)return (p===G.bidder&&!G.trumpRevealed)?"The concealed trump suit can't be led yet":'';
  const led=G.trick[0].card.s;
  if(G.forceTrumpFor===p)return 'Trump was revealed: play a '+sym(G.trumpSuit)+' card';
  if(G.hands[p].some(x=>x.s===led))return 'Follow suit: play a '+sym(led)+' card';
  if(G.rules.mustTrump&&G.trumpRevealed)return 'House rule: you must trump';
  return '';
}
function canAsk(p){
  if(G.phase!=='play'||G.collect||G.turn!==p)return false;
  if(G.trumpRevealed||G.trick.length===0)return false;
  const led=G.trick[0].card.s;
  return !G.hands[p].some(c=>c.s===led);
}
function askTrump(){
  const p=G.turn;
  if(!canAsk(p))return false;
  revealTrump(p===G.bidder?nm(p)+' reveals the trump.':nm(p)+' asks for trump.');
  G.forceTrumpFor=p;return true;
}
function marriageOptions(p){
  const out={};
  if(!G.rules.marriage||G.phase!=='play'||G.collect)return out;
  if(G.rules.marriageAfterTrick&&G.tricksWon[sideOf(p)]<1)return out;
  const h=G.hands[p];
  for(const s of SUITS){
    if(G.marriages.some(m=>m.suit===s.id))continue;
    const k=h.find(c=>c.s===s.id&&c.r==='K'),q=h.find(c=>c.s===s.id&&c.r==='Q');
    if(k&&q){out[k.id]=s.id;out[q.id]=s.id;}
  }
  return out;
}
function playCard(id,marriage){
  const p=G.turn;
  const c=legalPlays(p).find(x=>x.id===id);
  if(!c)return 'That card is not allowed. '+hintFor(p);
  if(marriage&&!marriageOptions(p)[id])return 'A marriage cannot be declared with this card';
  const hand=G.hands[p];
  hand.splice(hand.indexOf(c),1);
  if(marriage&&c.s===G.trumpSuit&&!G.trumpRevealed)
    revealTrump(nm(p)+' declares a marriage in the concealed trump suit.');
  if(p===G.bidder&&!G.trumpRevealed&&G.trick.length===0&&c.s===G.trumpSuit)
    revealTrump(nm(p)+' leads the trump suit.');
  if(G.partnerCard&&G.partnerCard.id===c.id&&!G.partnerRevealed){
    G.partnerRevealed=true;G.partnerOut=true;
    addLog(p===G.bidder
      ?nm(p)+' played their own called card and is playing alone.'
      :nm(p)+' played the called '+cname(c)+' and is the partner of '+nm(G.bidder)+'.');
  }
  G.trick.push({p:p,card:c,live:G.trumpRevealed});
  if(marriage){
    const val=(c.s===G.trumpSuit)?MARRIAGE_T:MARRIAGE_NT;
    const side=sideOf(p);
    G.marriages.push({p:p,suit:c.s,val:val,side:side});
    if(side===0)G.pts[0]+=val;else{G.pts[1]+=val;G.extraTarget+=val;}
    addLog(nm(p)+' declares a marriage in '+sym(c.s)+' for +'+val+(side===1?' (raises the bid target)':''));
  }
  G.forceTrumpFor=-1;G.newestId=c.id;
  if(G.trick.length===4)resolveTrick();
  else{G.turn=(p+1)%4;prepareTurn();}
  return null;
}
function resolveTrick(){
  const led=G.trick[0].card.s;
  const live=G.trick.filter(t=>t.live&&t.card.s===G.trumpSuit);
  const pool=live.length?live:G.trick.filter(t=>t.card.s===led);
  let w=pool[0];for(const t of pool)if(str(t.card)>str(w.card))w=t;
  const sum=G.trick.reduce((a,t)=>a+pts(t.card),0);
  const side=sideOf(w.p);
  G.pts[side]+=sum;G.tricksWon[side]++;G.tricksPlayed++;
  G.lastTrick={plays:G.trick.slice(),winner:w.p,pts:sum};
  G.collect={winner:w.p,pts:sum,byTrump:live.length>0};
  G.turn=w.p;
  addLog(nm(w.p)+' wins trick '+G.tricksPlayed+' (+'+sum+')'+(live.length?' with trump':''));
}
function collectTrick(){
  if(!G.collect)return;
  const w=G.collect.winner;
  G.trick=[];G.collect=null;G.newestId=null;
  if(G.tricksPlayed>=G.per){endRound();return;}
  G.leader=w;G.turn=w;prepareTurn();
}
function endRound(){
  G.partnerRevealed=true;
  const need=G.contract+G.extraTarget,got=G.pts[0],success=got>=need;
  const winners=[];
  for(let p=0;p<4;p++)if(sideOf(p)===(success?0:1)){G.game[p]++;winners.push(p);}
  G.result={success:success,got:got,need:need,base:G.contract,extra:G.extraTarget,other:G.pts[1],bidder:G.bidder,partner:G.partner,winners:winners};
  G.phase='roundEnd';
  addLog('Round over: contract '+(success?'made':'failed')+' ('+got+' of '+need+')');
}

/* ================= actions from players ================= */
function apply(seat,a){
  if(!G)return no('No game');
  switch(a.t){
    case 'bid':
      if(G.phase!=='bidding'||G.bid.turn!==seat)return no('It is not your turn to bid');
      return placeBid(a.v)?ok():no('That bid is not allowed');
    case 'pass':
      if(G.phase!=='bidding'||G.bid.turn!==seat)return no('It is not your turn to bid');
      passBid();return ok();
    case 'call':{
      if(G.phase!=='call'||G.bidder!==seat)return no('Only the bidder makes the call');
      const e=callTrump(a.trump,a.partner);return e?no(e):ok();}
    case 'play':{
      if(G.phase!=='play'||G.collect||G.turn!==seat)return no('It is not your turn');
      const e=playCard(a.id,!!a.marriage);return e?no(e):ok();}
    case 'ask':
      if(G.phase!=='play'||G.collect||G.turn!==seat)return no('It is not your turn');
      return askTrump()?ok():no('You cannot ask for trump now');
    case 'partnerOut':{
      const e=partnerOutDeclare(seat);return e?no(e):ok();}
    case 'collect':
      if(G.phase!=='play'||!G.collect)return no('Nothing to collect');
      collectTrick();return ok();
    case 'next':
      if(G.phase!=='roundEnd'&&G.phase!=='redeal')return no('The round is not over');
      G.dealer=(G.dealer+1)%4;startRound();return ok();
  }
  return no('Unknown action');
}

/* ================= views (what one seat may see) ================= */
function makeView(seat,conn){
  const g=G,r=g.rules;
  const v={phase:g.phase,rules:Object.assign({},r),names:g.names.slice(),round:g.round,dealer:g.dealer,seat:seat,
    game:g.game.slice(),per:g.per,total:g.total,counts:[0,1,2,3].map(countFor),actor:actorSeat(),
    log:g.log.slice(0,14),conn:conn||[true,true,true,true]};
  if(g.phase==='lobby'){
    v.sel={};for(const s of SUITS)v.sel[s.id]=Array.from(g.sel[s.id]);
    v.stats=deckStats();v.valid=deckValid();v.std=isStandard();
    return v;
  }
  const over=g.phase==='roundEnd';
  v.bid=g.bid?{turn:g.bid.turn,high:g.bid.high,highBy:g.bid.highBy,passed:g.bid.passed.slice(),min:g.bid.min,max:g.bid.max,step:g.bid.step}:null;
  v.bidder=g.bidder;v.contract=g.contract;
  v.trumpRevealed=g.trumpRevealed||over;
  v.trumpSuit=(g.trumpRevealed||over||seat===g.bidder)?g.trumpSuit:null;
  v.trumpSet=g.trumpSuit!=null;
  v.partnerCard=g.partnerCard;
  v.partnerKnown=g.partnerRevealed||over;
  v.partner=v.partnerKnown?g.partner:-2;
  v.partnerOut=g.partnerOut;
  v.canCallPartnerOut=!!(r.partnerCall&&seat===g.bidder&&g.phase==='play'&&g.partner>=0&&!g.partnerRevealed&&!g.partnerOut);
  v.iAmPartner=!!(r.partnerCall&&g.partner>=0&&seat===g.partner&&g.phase==='play');
  v.partnerCardLocked=!!(v.iAmPartner&&!g.partnerRevealed&&!g.partnerOut);
  v.trick=g.trick.map(t=>({p:t.p,card:t.card}));
  v.collect=g.collect;v.tricksPlayed=g.tricksPlayed;v.pts=g.pts.slice();v.tricksWon=g.tricksWon.slice();
  v.lastTrick=g.lastTrick?{plays:g.lastTrick.plays.map(t=>({p:t.p,card:t.card})),winner:g.lastTrick.winner,pts:g.lastTrick.pts}:null;
  v.marriages=g.marriages.slice();v.extraTarget=g.extraTarget;v.result=g.result;
  const vis=sortHand(visibleCards(seat));
  v.hand=vis;v.backs=g.hands[seat].length-vis.length;
  if(g.phase==='play'&&!g.collect&&g.turn===seat){
    v.legal=legalPlays(seat).map(c=>c.id);v.marry=marriageOptions(seat);
    v.canAsk=canAsk(seat);v.hint=hintFor(seat);v.forced=g.forceTrumpFor===seat;
  }
  if(g.phase==='call'&&seat===g.bidder){
    v.deck=sortHand(allCards()).map(c=>({id:c.id,s:c.s,r:c.r,own:vis.some(x=>x.id===c.id)}));
  }
  return v;
}

/* ================= exports ================= */
const E={SUITS,SM,SUIT_SORT,RANKS,ORDER,POINTS,POS,POS_NAME,DEF_RULES,CLASSIC_RULES,MARRIAGE_NT,MARRIAGE_T,
  pts,str,cname,ok,no,
  get G(){return G;},freshG,setLowest,deckStats,deckValid,isStandard,sortHand,buildDeck,visibleCards,
  sideOf,actorSeat,startRound,apply,makeView,legalPlays,marriageOptions,canAsk,rnd,shuffle,nm};
if(typeof window!=='undefined')window.__E=E;
if(typeof module!=='undefined')module.exports=E;
})();
