"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const shell = document.getElementById("gameShell");
const mini = document.getElementById("miniMap");
const mctx = mini.getContext("2d");
let DPR = Math.min(devicePixelRatio || 1, 2);

const TILE_W = 72, TILE_H = 36, HEIGHT_STEP = 22;
const COLS = 22, ROWS = 18;
const SAVE_KEY = "halo_tactics_save_v3";
let viewW = 0, viewH = 0;
let camera = { x: 700, y: -180 };
let dragging = false, dragOrigin = null, cameraOrigin = null;
let hoverTile = null;
let selected = null;
let mode = "select";
let selectedSkill = null;
let previewSkill = null;
let selectedItem = null;
let reachable = new Map();
let attackable = [];
let moveAttackEnvelope = [];
let hoverAoE = [];
let threatOverlayOn = true;
let enemyThreatTiles = [];
let threatDirty = true;
let round = 1;
let phase = "player";
let busy = false;
let musicOn = true, soundOn = true;
let pendingMoveUnit = null;
let lastTime = performance.now();
let cameraShake = 0;
let battleEnded = false;
let dialogueActive = false;
let battleLog = [];
let projectiles = [];
let bursts = [];
let unitTweens = new Map();

const battleBackground = new Image();
const terrainSheets = {
  snow:{img:new Image(),cols:8,rows:8},
  clock:{img:new Image(),cols:10,rows:10},
  elevation:{img:new Image(),cols:8,rows:8}
};
battleBackground.src = "assets/generated/terrain-pack/clocktower_background.png";
terrainSheets.snow.img.src = "assets/generated/terrain-pack/snow_tiles.png";
terrainSheets.clock.img.src = "assets/generated/terrain-pack/clocktower_tiles.png";
terrainSheets.elevation.img.src = "assets/generated/terrain-pack/elevation_tiles.png";

const playerSpriteAtlases = {};
for (const id of ["halo","bobo","pao"]) {
  const img = new Image();
  img.src = "assets/generated/sprite-atlas/" + id + "_4dir.png";
  playerSpriteAtlases[id] = img;
}
const playerAtlasFacingCell = {
  S:{col:0,row:0}, // front
  E:{col:1,row:0}, // right
  N:{col:0,row:1}, // back
  W:{col:1,row:1}  // left
};

const enemySpriteAtlases = {};
const enemySpriteFiles = {
  time_guard:"time_guard_4dir.png",
  frost_crossbow:"frost_crossbow_4dir.png",
  time_mage:"time_mage_4dir.png",
  clock_knight:"clock_knight_4dir.png"
};
for (const [key,file] of Object.entries(enemySpriteFiles)) {
  const img=new Image();
  img.src="assets/generated/enemies/"+file;
  enemySpriteAtlases[key]=img;
}
const enemyAtlasFacingCells = {
  default:{
    S:{col:0,row:0},
    E:{col:1,row:0},
    N:{col:1,row:1},
    W:{col:0,row:1}
  },
  frost_crossbow:{
    S:{col:0,row:0},
    E:{col:1,row:0},
    N:{col:0,row:1},
    W:{col:1,row:0,flip:true}
  }
};

const TRANSPARENT_PIXEL="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%271%27 height=%271%27/%3E";
function setBattlePortrait(el,u){
  if(!el||!u)return;
  if(u.team==="enemy"&&u.spriteKey){
    el.src=TRANSPARENT_PIXEL;el.classList.add("battlePortraitFace");
    el.style.backgroundImage=`url("assets/generated/enemies/${enemySpriteFiles[u.spriteKey]}")`;
    el.style.backgroundSize="200% 200%";el.style.backgroundPosition="0 0";el.style.backgroundRepeat="no-repeat";
    return;
  }
  if(u.team!=="player"){el.src=u.portrait;el.style.backgroundImage="";return;}
  el.src=TRANSPARENT_PIXEL;el.classList.add("battlePortraitFace");
  el.style.backgroundImage=`url("assets/generated/sprite-atlas/${u.id}_4dir.png")`;
  el.style.backgroundSize="200% 200%";el.style.backgroundPosition="0 0";el.style.backgroundRepeat="no-repeat";
}

const playerAnimationSheets = {};
for (const id of ["halo","bobo","pao"]) {
  playerAnimationSheets[id] = {};
  for (const kind of ["walk","attack","skill"]) {
    const img = new Image();
    img.src = "assets/generated/animations/" + id + "_" + kind + ".png";
    playerAnimationSheets[id][kind] = img;
  }
}
const animationFacingRows = {
  default:{S:0,E:1,N:2,W:3},
  bobo:{S:0,E:3,N:2,W:1}
};

function resize() {
  viewW = Math.max(1, shell.clientWidth);
  viewH = Math.max(1, shell.clientHeight);
  const cssDpr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--device-dpr"));
  DPR = Number.isFinite(cssDpr) && cssDpr > 0 ? cssDpr : Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewW * DPR);
  canvas.height = Math.round(viewH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener("resize", resize);
resize();

const heights = [
[1,1,1,1,1,1,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1],
[1,1,1,1,1,2,2,2,3,3,3,3,2,2,1,1,1,1,1,1,1,1],
[1,1,1,1,2,2,2,3,3,4,4,3,3,2,2,1,1,1,1,1,1,1],
[1,1,1,1,2,2,3,3,4,4,4,4,3,3,2,2,2,1,1,1,1,1],
[1,1,1,2,2,2,3,3,4,5,5,4,3,3,2,2,2,2,1,1,1,1],
[1,1,2,2,2,2,3,3,4,5,5,4,4,3,3,2,2,2,2,1,1,1],
[1,1,2,2,2,3,3,3,4,4,4,4,4,3,3,3,2,2,2,2,1,1],
[1,1,2,2,3,3,3,3,3,4,4,4,3,3,3,3,3,2,2,2,1,1],
[1,1,2,2,3,3,3,2,2,3,4,3,2,2,3,3,3,2,2,2,1,1],
[1,1,2,2,3,3,2,2,1,2,3,2,1,2,2,3,3,2,2,2,1,1],
[1,1,2,2,3,3,2,1,1,2,2,2,1,1,2,3,3,2,2,2,1,1],
[1,1,2,2,3,3,2,2,1,1,2,1,1,1,2,3,3,3,2,2,1,1],
[1,1,2,2,2,3,3,2,2,1,1,1,1,2,2,3,4,3,2,2,1,1],
[1,1,1,2,2,2,3,3,2,2,1,1,2,2,3,4,4,3,2,2,1,1],
[1,1,1,1,2,2,2,3,3,2,2,2,2,3,3,4,4,3,2,1,1,1],
[1,1,1,1,1,2,2,2,3,3,3,2,3,3,3,3,3,2,2,1,1,1],
[1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1,1],
[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

const blocked = new Set([
  "8,8","9,8","12,8","8,9","12,9","8,10","9,10","12,10",
  "10,3","11,3","10,4","11,4","17,12","17,13","4,5","5,5","18,4"
]);
const shrineTiles = new Set(["10,8","11,8","10,9","11,9"]);
const iceTiles = new Set(["5,13","6,13","7,13","14,7","15,7","16,7","17,7"]);
const banners = [{x:7,y:5},{x:14,y:10},{x:18,y:8}];

const mapObjects = [
  {id:"stairs_west",type:"stairs",x:7,y:6,cells:[{x:7,y:6},{x:8,y:6}],passable:true},
  {id:"ramp_south",type:"ramp",x:14,y:12,cells:[{x:14,y:12},{x:15,y:12}],passable:true},
  {id:"bridge_mid",type:"bridge",x:8,y:11,cells:[{x:8,y:11},{x:9,y:11},{x:10,y:11}],passable:true},
  {id:"crystal_nw",type:"crystal",x:8,y:8,cells:[{x:8,y:8}],passable:false},
  {id:"crystal_ne",type:"crystal",x:12,y:8,cells:[{x:12,y:8}],passable:false},
  {id:"crystal_sw",type:"crystal",x:8,y:10,cells:[{x:8,y:10}],passable:false},
  {id:"crystal_se",type:"crystal",x:12,y:10,cells:[{x:12,y:10}],passable:false}
];
const stairsTiles = new Set(mapObjects.filter(o=>o.type==="stairs").flatMap(o=>o.cells.map(c=>key(c.x,c.y))));
const rampTiles = new Set(mapObjects.filter(o=>o.type==="ramp").flatMap(o=>o.cells.map(c=>key(c.x,c.y))));
const bridgeTiles = new Set(mapObjects.filter(o=>o.type==="bridge").flatMap(o=>o.cells.map(c=>key(c.x,c.y))));
const crystalTiles = new Set(mapObjects.filter(o=>o.type==="crystal").flatMap(o=>o.cells.map(c=>key(c.x,c.y))));
function mapObjectAt(x,y){ return mapObjects.find(o=>o.cells.some(c=>c.x===x&&c.y===y))||null; }

const SKILLS = {
  halo: [
    {id:"quick", name:"迅射", cost:3, range:4, minRange:1, power:1.12, type:"physical", target:"enemy", aoe:0, accuracy:92, crit:5, anim:"arrow", desc:"快速射出一箭。消耗低、命中穩定。"},
    {id:"snipe", name:"盲點狙擊", cost:7, range:6, minRange:2, power:1.72, type:"physical", target:"enemy", aoe:0, accuracy:96, crit:18, anim:"snipe", desc:"利用高低差狙擊弱點。高地時特別強力。"},
    {id:"stepShot", name:"瞬步射擊", cost:5, range:3, minRange:1, power:1.02, type:"physical", target:"enemy", aoe:0, accuracy:98, crit:8, anim:"dash", selfStatus:{id:"wind",name:"疾風",turns:2}, desc:"射擊後獲得疾風，提升迴避與速度 2 回合。"}
  ],
  bobo: [
    {id:"fireball", name:"火球", cost:4, range:4, minRange:1, power:1.28, type:"magic", target:"enemy", aoe:0, accuracy:94, crit:2, anim:"fire", desc:"集中火焰轟擊單體。"},
    {id:"storm", name:"爆炎風刃", cost:8, range:4, minRange:1, power:1.12, type:"magic", target:"enemy", aoe:1, accuracy:90, crit:0, anim:"storm", desc:"以爆炎與風刃席捲目標周圍 1 格。"},
    {id:"bind", name:"風縛", cost:6, range:4, minRange:1, power:.72, type:"magic", target:"enemy", aoe:0, accuracy:92, crit:0, anim:"wind", status:{id:"slow",name:"緩速",turns:2}, desc:"造成魔法傷害並附加緩速 2 回合。"}
  ],
  pao: [
    {id:"bell", name:"鼓舞之鈴", cost:5, range:3, minRange:0, power:1.8, type:"heal", target:"ally", aoe:1, accuracy:100, crit:0, anim:"bell", desc:"治療目標與周圍 1 格友軍。"},
    {id:"breeze", name:"輕靈之風", cost:5, range:3, minRange:0, power:0, type:"buff", target:"ally", aoe:1, accuracy:100, crit:0, anim:"wind", status:{id:"haste",name:"輕靈",turns:2}, desc:"周圍友軍獲得輕靈：Move +1、速度與迴避提升。"},
    {id:"sleep", name:"安眠舞", cost:7, range:3, minRange:1, power:0, type:"debuff", target:"enemy", aoe:1, accuracy:78, crit:0, anim:"sleep", status:{id:"sleep",name:"沉睡",turns:1}, desc:"使範圍內敵軍有機率沉睡 1 回合。"}
  ]
};

const ITEMS = {
  potion:{id:"potion",name:"高級藥水",range:1,target:"ally",desc:"恢復 45 HP",heal:45},
  ether:{id:"ether",name:"魔力露",range:1,target:"ally",desc:"恢復 14 MP",mp:14},
  remedy:{id:"remedy",name:"淨化草",range:1,target:"ally",desc:"解除負面狀態",cleanse:true}
};
let inventory = {potion:3, ether:2, remedy:1};

function makePlayer(data) {
  return {
    team:"player", level:3, xp:20, moved:false, acted:false, facing:"N",
    statuses:[], items:{}, _renderX:null, _renderY:null, ...data
  };
}
function makeEnemy(data) {
  return {
    team:"enemy", level:3, xp:0, moved:false, acted:false, facing:"S",
    statuses:[], _renderX:null, _renderY:null, ...data
  };
}

let units = [
  makePlayer({id:"halo",name:"哈羅 Halo",job:"遊俠",portrait:"assets/user-character-art/portraits/halo_portrait.webp",x:3,y:14,maxHp:118,hp:118,maxMp:25,mp:25,atk:31,mag:13,def:16,res:14,agi:24,crit:12,evade:10,move:5,jump:2,range:4,color:"#e8c86e",accent:"#fff0b0"}),
  makePlayer({id:"bobo",name:"波波 Bobo",job:"法師",portrait:"assets/user-character-art/portraits/bobo_portrait.webp",x:2,y:15,maxHp:98,hp:98,maxMp:34,mp:34,atk:16,mag:34,def:12,res:22,agi:20,crit:7,evade:8,move:4,jump:2,range:3,color:"#7fcce8",accent:"#d9f7ff"}),
  makePlayer({id:"pao",name:"泡泡",job:"舞孃",portrait:"assets/user-character-art/portraits/pao_portrait.webp",x:4,y:15,maxHp:105,hp:105,maxMp:32,mp:32,atk:18,mag:29,def:14,res:24,agi:22,crit:6,evade:14,move:4,jump:3,range:2,color:"#e998c1",accent:"#ffe0f1"}),
  makeEnemy({id:"e1",name:"逆時守衛",job:"重裝兵",spriteKey:"time_guard",portrait:"assets/portraits/enemy.svg",x:13,y:5,maxHp:94,hp:94,maxMp:10,mp:10,atk:26,mag:10,def:25,res:17,agi:13,crit:5,evade:4,move:3,jump:1,range:1,color:"#895f9d",accent:"#d7b5e8"}),
  makeEnemy({id:"e2",name:"霜刻弩手",job:"弩兵",spriteKey:"frost_crossbow",portrait:"assets/portraits/enemy.svg",x:16,y:7,maxHp:72,hp:72,maxMp:12,mp:12,atk:23,mag:10,def:14,res:13,agi:18,crit:9,evade:7,move:3,jump:2,range:4,color:"#5e76a9",accent:"#bed0ff"}),
  makeEnemy({id:"e3",name:"逆時守衛",job:"重裝兵",spriteKey:"time_guard",portrait:"assets/portraits/enemy.svg",x:15,y:11,maxHp:94,hp:94,maxMp:10,mp:10,atk:26,mag:10,def:25,res:17,agi:13,crit:5,evade:4,move:3,jump:1,range:1,color:"#895f9d",accent:"#d7b5e8"}),
  makeEnemy({id:"e4",name:"時間術士",job:"術士",spriteKey:"time_mage",portrait:"assets/portraits/enemy.svg",x:10,y:6,maxHp:68,hp:68,maxMp:28,mp:28,atk:14,mag:29,def:12,res:22,agi:17,crit:5,evade:6,move:3,jump:2,range:3,color:"#6a65a8",accent:"#c9c6ff"}),
  makeEnemy({id:"e5",name:"霜刻弩手",job:"弩兵",spriteKey:"frost_crossbow",portrait:"assets/portraits/enemy.svg",x:18,y:10,maxHp:72,hp:72,maxMp:12,mp:12,atk:23,mag:10,def:14,res:13,agi:18,crit:9,evade:7,move:3,jump:2,range:4,color:"#5e76a9",accent:"#bed0ff"}),
  makeEnemy({id:"e6",name:"時鐘騎士",job:"隊長",spriteKey:"clock_knight",portrait:"assets/portraits/enemy.svg",x:11,y:4,maxHp:138,hp:138,maxMp:20,mp:20,atk:31,mag:20,def:22,res:20,agi:19,crit:11,evade:8,move:4,jump:2,range:1,color:"#9a6c49",accent:"#f0c58d"})
];

function key(x,y){ return x + "," + y; }
function tileAt(x,y){
  return x>=0 && y>=0 && x<COLS && y<ROWS ? {x,y,h:heights[y][x],blocked:blocked.has(key(x,y))} : null;
}
function living(team){ return units.filter(u=>u.team===team && u.hp>0); }
function unitAt(x,y){ return units.find(u=>u.hp>0 && u.x===x && u.y===y) || null; }
function isOccupied(x,y,ignore=null){ const u=unitAt(x,y); return !!u && u!==ignore; }
function dist(a,b){ return Math.abs(a.x-b.x)+Math.abs(a.y-b.y); }
function xpNeed(u){ return 100 + (u.level-1)*45; }

function terrainName(t){
  if(!t)return "";
  const obj=mapObjectAt(t.x,t.y);if(obj){const names={stairs:"鐘塔樓梯",ramp:"冰雪斜坡",bridge:"齒輪橋樑",crystal:"時間水晶柱"};return names[obj.type]||"場景物件";}
  if(shrineTiles.has(key(t.x,t.y)))return "時間祭壇";
  if(iceTiles.has(key(t.x,t.y)))return "鏡冰";
  if(t.h>=5)return "鐘塔高台";
  if(t.h>=4)return "石造高地";
  if(t.h===3)return "積雪坡道";
  if(t.h===2)return "冰封街道";
  return "薄冰低地";
}

function statusById(u,id){ return u.statuses.find(s=>s.id===id); }
function isNegativeStatus(id){ return ["slow","sleep","marked"].includes(id); }
function addStatus(u,status){
  const old=statusById(u,status.id);
  if(old) old.turns=Math.max(old.turns,status.turns);
  else u.statuses.push({...status});
  threatDirty=true;
}
function getStat(u,stat){
  let v=u[stat]||0;
  if(statusById(u,"haste")){ if(stat==="agi")v+=5;if(stat==="move")v+=1;if(stat==="evade")v+=12; }
  if(statusById(u,"wind")){ if(stat==="agi")v+=4;if(stat==="evade")v+=15; }
  if(statusById(u,"slow")){ if(stat==="agi")v-=5;if(stat==="move")v=Math.max(2,v-1); }
  if(statusById(u,"marked")){ if(stat==="def")v-=4;if(stat==="evade")v-=10; }
  return Math.max(0,v);
}

function iso(x,y,h=0){
  return {x:(x-y)*TILE_W/2+camera.x, y:(x+y)*TILE_H/2-camera.y-h*HEIGHT_STEP};
}
function renderPos(u){
  const rx=u._renderX==null?u.x:u._renderX, ry=u._renderY==null?u.y:u._renderY;
  const h=interpolatedHeight(rx,ry);
  return iso(rx,ry,h);
}
function interpolatedHeight(x,y){
  const x0=Math.floor(x),x1=Math.ceil(x),y0=Math.floor(y),y1=Math.ceil(y);
  const t00=tileAt(x0,y0),t10=tileAt(x1,y0),t01=tileAt(x0,y1),t11=tileAt(x1,y1);
  const tx=x-x0,ty=y-y0;
  const a=(t00?.h??1)*(1-tx)+(t10?.h??t00?.h??1)*tx;
  const b=(t01?.h??t00?.h??1)*(1-tx)+(t11?.h??t00?.h??1)*tx;
  return a*(1-ty)+b*ty;
}
function screenToTile(sx,sy){
  let best=null,bestScore=Infinity;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=tileAt(x,y),p=iso(x,y,t.h);
    const cx=p.x,cy=p.y+TILE_H/2;
    const dx=Math.abs(sx-cx)/(TILE_W/2),dy=Math.abs(sy-cy)/(TILE_H/2);
    const score=dx+dy;
    if(score<1.05 && score<bestScore){best=t;bestScore=score;}
  }
  return best;
}

function tilePoly(t){
  const p=iso(t.x,t.y,t.h);
  return [[p.x,p.y],[p.x+TILE_W/2,p.y+TILE_H/2],[p.x,p.y+TILE_H],[p.x-TILE_W/2,p.y+TILE_H/2]];
}
function pathPoly(poly){
  ctx.beginPath();ctx.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);
  ctx.closePath();
}
function shade(hex,amt){
  const n=parseInt(hex.slice(1),16);
  const r=Math.max(0,Math.min(255,(n>>16)+amt));
  const g=Math.max(0,Math.min(255,((n>>8)&255)+amt));
  const b=Math.max(0,Math.min(255,(n&255)+amt));
  return "#"+(b|(g<<8)|(r<<16)).toString(16).padStart(6,"0");
}
function tileColor(t){
  if(shrineTiles.has(key(t.x,t.y)))return "#75664d";
  if(iceTiles.has(key(t.x,t.y)))return "#8ecbd3";
  if(t.h>=5)return "#4e5968";
  if(t.h>=4)return "#687487";
  if(t.h===3)return "#8393a5";
  if(t.h===2)return "#9cb4c3";
  return "#afced4";
}

function atlasCell(sheet,col,row,dx,dy,dw,dh,alpha=1){
  const img=sheet.img;
  if(!img.complete||!img.naturalWidth)return false;
  const cw=img.naturalWidth/sheet.cols,ch=img.naturalHeight/sheet.rows;
  const pad=Math.max(2,Math.min(cw,ch)*.018);
  ctx.save();
  ctx.globalAlpha=alpha;
  ctx.drawImage(
    img,
    col*cw+pad,row*ch+pad,Math.max(1,cw-pad*2),Math.max(1,ch-pad*2),
    dx,dy,dw,dh
  );
  ctx.restore();
  return true;
}
function tileSeed(t){ return Math.abs((t.x*37+t.y*71+t.h*19)%997); }
function paintTerrain(t,poly){
  const minX=Math.min(...poly.map(p=>p[0])),maxX=Math.max(...poly.map(p=>p[0]));
  const minY=Math.min(...poly.map(p=>p[1])),maxY=Math.max(...poly.map(p=>p[1]));
  const seed=tileSeed(t),w=maxX-minX,h=maxY-minY;
  const clockZone=t.x>=8&&t.x<=14&&t.y>=3&&t.y<=12;
  let sheet=terrainSheets.snow,col=0,row=0;

  if(shrineTiles.has(key(t.x,t.y))){
    sheet=terrainSheets.clock;row=seed%2;col=4+(seed%6);
  }else if(iceTiles.has(key(t.x,t.y))){
    sheet=terrainSheets.snow;row=(seed%2)?2:5;col=seed%8;
  }else if(clockZone){
    sheet=terrainSheets.clock;
    if(t.h>=4){row=2;col=seed%10;}
    else if((t.x+t.y)%5===0){row=0;col=4+(seed%6);}
    else {row=seed%2;col=seed%4;}
  }else if(t.h>=4){
    sheet=terrainSheets.elevation;row=1+(seed%2);col=seed%8;
  }else if(t.h===3){
    sheet=terrainSheets.elevation;row=seed%2;col=seed%8;
  }else if(t.h===2){
    sheet=terrainSheets.snow;row=1;col=seed%8;
  }else{
    sheet=terrainSheets.snow;
    row=((t.x+t.y)%6===0)?4:0;
    col=seed%8;
  }

  ctx.save();
  pathPoly(poly);ctx.clip();
  const ok=atlasCell(sheet,col,row,minX-1,minY-1,w+2,h+2,.94);
  if(ok){
    const grad=ctx.createLinearGradient(minX,minY,maxX,maxY);
    grad.addColorStop(0,"rgba(255,255,255,.12)");
    grad.addColorStop(1,"rgba(15,29,48,.16)");
    ctx.fillStyle=grad;ctx.fillRect(minX,minY,w,h);
  }
  ctx.restore();
}

function drawBattleBackdrop(){
  if(!battleBackground.complete||!battleBackground.naturalWidth)return false;
  const iw=battleBackground.naturalWidth,ih=battleBackground.naturalHeight;
  const scale=Math.max(viewW/iw,viewH/ih);
  const dw=iw*scale,dh=ih*scale;
  const dx=(viewW-dw)/2,dy=(viewH-dh)/2;
  ctx.save();
  ctx.filter="saturate(.88) brightness(.63)";
  ctx.drawImage(battleBackground,dx,dy,dw,dh);
  ctx.filter="none";
  const vignette=ctx.createLinearGradient(0,0,0,viewH);
  vignette.addColorStop(0,"rgba(7,15,30,.18)");
  vignette.addColorStop(.52,"rgba(7,15,30,.30)");
  vignette.addColorStop(1,"rgba(6,10,18,.70)");
  ctx.fillStyle=vignette;ctx.fillRect(0,0,viewW,viewH);
  ctx.restore();
  return true;
}

function paintVerticalFace(t,face,side){
  const minX=Math.min(...face.map(p=>p[0])),maxX=Math.max(...face.map(p=>p[0]));
  const minY=Math.min(...face.map(p=>p[1])),maxY=Math.max(...face.map(p=>p[1]));
  const clockZone=t.x>=8&&t.x<=14&&t.y>=3&&t.y<=12;
  const sheet=clockZone?terrainSheets.clock:terrainSheets.elevation;
  const seed=tileSeed(t);
  const col=clockZone?(seed%10):(seed%8);
  const row=clockZone?(3+(side%2)):(4+(side%2));
  ctx.save();
  ctx.beginPath();ctx.moveTo(face[0][0],face[0][1]);
  for(let i=1;i<face.length;i++)ctx.lineTo(face[i][0],face[i][1]);
  ctx.closePath();ctx.clip();
  atlasCell(sheet,col,row,minX-2,minY-2,maxX-minX+4,maxY-minY+4,.82);
  ctx.fillStyle=clockZone?"rgba(18,24,38,.38)":"rgba(18,31,42,.30)";
  ctx.fillRect(minX-2,minY-2,maxX-minX+4,maxY-minY+4);
  ctx.restore();
  ctx.strokeStyle=clockZone?"#11182488":"#d8f4ff2f";ctx.lineWidth=.8;
  ctx.beginPath();ctx.moveTo(face[0][0],face[0][1]);for(let i=1;i<face.length;i++)ctx.lineTo(face[i][0],face[i][1]);ctx.closePath();ctx.stroke();
}

function drawMapObject(o){
  if(o.type==="crystal")return drawCrystalPillar(o);
  if(o.type==="stairs")return drawStairs(o);
  if(o.type==="ramp")return drawRamp(o);
  if(o.type==="bridge")return drawBridge(o);
}
function drawCrystalPillar(o){
  const t=tileAt(o.x,o.y);if(!t)return;const p=iso(o.x,o.y,t.h);
  ctx.save();ctx.translate(p.x,p.y+9);
  ctx.shadowColor="#74e7ff";ctx.shadowBlur=18;
  const g=ctx.createLinearGradient(0,-74,0,10);g.addColorStop(0,"#efffff");g.addColorStop(.35,"#8ee9ff");g.addColorStop(1,"#335aa6");
  ctx.fillStyle=g;ctx.strokeStyle="#d8fbff";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(0,-78);ctx.lineTo(15,-42);ctx.lineTo(10,0);ctx.lineTo(0,10);ctx.lineTo(-10,0);ctx.lineTo(-15,-42);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle="#d7b96a";ctx.beginPath();ctx.ellipse(0,8,20,8,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#6a5634";ctx.stroke();
  ctx.fillStyle="#ffffff88";ctx.beginPath();ctx.moveTo(-5,-62);ctx.lineTo(2,-70);ctx.lineTo(5,-22);ctx.lineTo(0,-8);ctx.closePath();ctx.fill();
  ctx.restore();
}
function drawStairs(o){
  o.cells.forEach((c,i)=>{
    const t=tileAt(c.x,c.y);if(!t)return;const p=iso(c.x,c.y,t.h);
    ctx.save();ctx.translate(p.x,p.y+8);
    for(let s=0;s<4;s++){
      const yy=8-s*5,ww=58-s*5;
      ctx.fillStyle=s%2?"#78879a":"#94a5b6";ctx.strokeStyle="#334355";
      ctx.beginPath();ctx.moveTo(-ww/2,yy);ctx.lineTo(0,yy-11);ctx.lineTo(ww/2,yy);ctx.lineTo(0,yy+10);ctx.closePath();ctx.fill();ctx.stroke();
    }
    ctx.restore();
  });
}
function drawRamp(o){
  o.cells.forEach(c=>{
    const t=tileAt(c.x,c.y);if(!t)return;const p=iso(c.x,c.y,t.h),poly=tilePoly(t);
    ctx.save();ctx.translate(0,-3);
    ctx.beginPath();ctx.moveTo(poly[3][0],poly[3][1]);ctx.lineTo(poly[0][0],poly[0][1]-8);ctx.lineTo(poly[1][0],poly[1][1]);ctx.lineTo(poly[2][0],poly[2][1]+2);ctx.closePath();
    ctx.fillStyle="#9fb4c1";ctx.fill();ctx.strokeStyle="#d9f4ff66";ctx.stroke();ctx.restore();
  });
}
function drawBridge(o){
  o.cells.forEach(c=>{
    const t=tileAt(c.x,c.y);if(!t)return;const p=iso(c.x,c.y,t.h);
    ctx.save();ctx.translate(p.x,p.y+10);
    ctx.fillStyle="#5b4b38";ctx.strokeStyle="#2a221c";ctx.lineWidth=1;
    for(let i=-24;i<=24;i+=12){ctx.fillRect(i-5,-11,10,22);ctx.strokeRect(i-5,-11,10,22);}
    ctx.strokeStyle="#c49b59";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-31,-12);ctx.lineTo(-31,12);ctx.moveTo(31,-12);ctx.lineTo(31,12);ctx.stroke();
    ctx.restore();
  });
}

function drawTile(t){
  const poly=tilePoly(t),base=tileColor(t);
  if(t.h>0){
    const faceA=[[poly[1][0],poly[1][1]],[poly[1][0],poly[1][1]+HEIGHT_STEP*t.h],[poly[2][0],poly[2][1]+HEIGHT_STEP*t.h],[poly[2][0],poly[2][1]]];
    const faceB=[[poly[2][0],poly[2][1]],[poly[2][0],poly[2][1]+HEIGHT_STEP*t.h],[poly[3][0],poly[3][1]+HEIGHT_STEP*t.h],[poly[3][0],poly[3][1]]];
    ctx.fillStyle=shade(base,-42);
    ctx.beginPath();ctx.moveTo(poly[1][0],poly[1][1]);ctx.lineTo(poly[1][0],poly[1][1]+HEIGHT_STEP*t.h);ctx.lineTo(poly[2][0],poly[2][1]+HEIGHT_STEP*t.h);ctx.lineTo(poly[2][0],poly[2][1]);ctx.closePath();ctx.fill();paintVerticalFace(t,faceA,0);
    ctx.fillStyle=shade(base,-60);
    ctx.beginPath();ctx.moveTo(poly[2][0],poly[2][1]);ctx.lineTo(poly[2][0],poly[2][1]+HEIGHT_STEP*t.h);ctx.lineTo(poly[3][0],poly[3][1]+HEIGHT_STEP*t.h);ctx.lineTo(poly[3][0],poly[3][1]);ctx.closePath();ctx.fill();paintVerticalFace(t,faceB,1);
  }
  pathPoly(poly);ctx.fillStyle=base;ctx.fill();
  paintTerrain(t,poly);
  pathPoly(poly);ctx.strokeStyle="#d9f6ff30";ctx.lineWidth=1;ctx.stroke();

  ctx.save();pathPoly(poly);ctx.clip();
  ctx.globalAlpha=.035;ctx.strokeStyle="#fff";
  for(let i=-20;i<100;i+=16){ctx.beginPath();ctx.moveTo(poly[3][0]+i,poly[0][1]);ctx.lineTo(poly[3][0]+i+45,poly[2][1]);ctx.stroke();}
  ctx.restore();

  if(iceTiles.has(key(t.x,t.y))){
    const p=iso(t.x,t.y,t.h);ctx.strokeStyle="#e5ffff88";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(p.x-20,p.y+20);ctx.lineTo(p.x-2,p.y+10);ctx.lineTo(p.x+12,p.y+25);ctx.stroke();
  }
  if(t.blocked && !crystalTiles.has(key(t.x,t.y))) drawRock(t);
  if(shrineTiles.has(key(t.x,t.y))){
    const p=iso(t.x,t.y,t.h);ctx.strokeStyle="#dbbe7b";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y+TILE_H/2,TILE_W*.24,TILE_H*.20,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#e7cf8744";ctx.beginPath();ctx.arc(p.x,p.y+16,5+Math.sin(performance.now()/300)*2,0,Math.PI*2);ctx.fill();
  }
}
function drawRock(t){
  const top=iso(t.x,t.y,t.h+.15);
  ctx.fillStyle="#34404f";ctx.strokeStyle="#1d2630";ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(top.x,top.y+8,17,9,-.2,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(top.x-13,top.y+8);ctx.lineTo(top.x-7,top.y-18);ctx.lineTo(top.x+10,top.y-20);ctx.lineTo(top.x+15,top.y+7);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle="#9fd8e055";ctx.beginPath();ctx.moveTo(top.x-2,top.y-16);ctx.lineTo(top.x+2,top.y+4);ctx.stroke();
}

function drawClockTower(){
  const t=tileAt(10,2),p=iso(10,2,t.h);
  ctx.save();ctx.translate(p.x,p.y-190);
  ctx.fillStyle="#2d3445";ctx.strokeStyle="#161b26";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-48,170);ctx.lineTo(-40,20);ctx.lineTo(-20,-4);ctx.lineTo(20,-4);ctx.lineTo(40,20);ctx.lineTo(48,170);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle="#4b5365";ctx.fillRect(-27,35,54,58);ctx.strokeRect(-27,35,54,58);
  ctx.fillStyle="#d9c68e";ctx.beginPath();ctx.arc(0,64,21,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle="#312c29";ctx.beginPath();ctx.moveTo(0,64);ctx.lineTo(-7,49);ctx.moveTo(0,64);ctx.lineTo(12,70);ctx.stroke();
  ctx.fillStyle="#151923";ctx.fillRect(-12,115,24,55);
  ctx.restore();
}
function drawBanner(d){
  const t=tileAt(d.x,d.y);if(!t)return;const p=iso(d.x,d.y,t.h);
  ctx.strokeStyle="#2c2630";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(p.x,p.y-15);ctx.lineTo(p.x,p.y-68);ctx.stroke();
  ctx.fillStyle="#70465f";ctx.beginPath();ctx.moveTo(p.x,p.y-66);ctx.lineTo(p.x+29,p.y-56);ctx.lineTo(p.x,p.y-40);ctx.closePath();ctx.fill();
  ctx.fillStyle="#dbc575";ctx.font="bold 11px serif";ctx.fillText("XII",p.x+8,p.y-50);
}

function drawHighlights(){
  if(phase!=="player")return;
  if(threatOverlayOn){
    refreshEnemyThreat().forEach(t=>{
      pathPoly(tilePoly(t));ctx.fillStyle="rgba(162,60,100,.10)";ctx.fill();ctx.strokeStyle="rgba(205,87,128,.18)";ctx.stroke();
    });
  }
  if(!selected)return;
  if(mode==="move"){
    moveAttackEnvelope.forEach(t=>{
      pathPoly(tilePoly(t));ctx.fillStyle="rgba(226,81,82,.14)";ctx.fill();ctx.strokeStyle="rgba(239,145,141,.36)";ctx.stroke();
    });
    reachable.forEach((data,k)=>{
      const [x,y]=k.split(",").map(Number),t=tileAt(x,y);if(!t)return;
      pathPoly(tilePoly(t));ctx.fillStyle="rgba(71,157,227,.34)";ctx.fill();ctx.strokeStyle="rgba(146,217,255,.78)";ctx.stroke();
    });
  }
  if(["attack","skill","item"].includes(mode)){
    attackable.forEach(t=>{
      pathPoly(tilePoly(t));
      const allyMode = mode==="item" || (mode==="skill" && (selectedSkill||previewSkill)?.target==="ally");
      ctx.fillStyle=allyMode?"rgba(84,198,135,.24)":"rgba(226,81,82,.25)";
      ctx.fill();ctx.strokeStyle=allyMode?"#8ae0aa":"#ef918d";ctx.stroke();
    });
  }
  if(mode==="skill"&&previewSkill&&selected){const casterTile=tileAt(selected.x,selected.y);pathPoly(tilePoly(casterTile));ctx.strokeStyle="#ffe49a";ctx.lineWidth=3;ctx.stroke();ctx.lineWidth=1;}
  if(hoverAoE.length){
    hoverAoE.forEach(t=>{pathPoly(tilePoly(t));ctx.fillStyle="rgba(219,141,229,.25)";ctx.fill();ctx.strokeStyle="#e9b4f0";ctx.stroke();});
  }
  if(mode==="facing" && selected){
    for(const t of cardinalTiles(selected)){pathPoly(tilePoly(t));ctx.fillStyle="rgba(245,211,110,.22)";ctx.fill();ctx.strokeStyle="#f2d98e";ctx.stroke();}
  }
  if(hoverTile){
    pathPoly(tilePoly(hoverTile));ctx.strokeStyle="#fff2bd";ctx.lineWidth=2;ctx.stroke();ctx.lineWidth=1;
  }
}
function scribbleLine(x1,y1,x2,y2,color,w=2){
  ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.quadraticCurveTo((x1+x2)/2+1,(y1+y2)/2-1,x2,y2);ctx.stroke();
}
function drawFacingArrow(u,x,y){
  const dirs={N:[0,-1],S:[0,1],E:[1,0],W:[-1,0]},v=dirs[u.facing]||dirs.N;
  ctx.save();ctx.translate(x+v[0]*26,y+20+v[1]*12);ctx.rotate(Math.atan2(v[1],v[0])+Math.PI/2);
  ctx.fillStyle=u.team==="player"?"#ffe49a":"#ff9ca5";ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(5,5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
}
function drawUnit(u){
  if(u.hp<=0)return;
  const p=renderPos(u), tween=unitTweens.get(u.id);
  let ox=0,oy=0,scale=1,flash=0;
  if(tween){ox=tween.ox||0;oy=tween.oy||0;scale=tween.scale||1;flash=tween.flash||0;}
  const wob=busy?0:Math.sin(performance.now()/380+u.x)*1.1;

  ctx.save();
  ctx.shadowColor="#0008";ctx.shadowBlur=8;ctx.shadowOffsetY=5;
  ctx.fillStyle="#1118";ctx.beginPath();ctx.ellipse(p.x,p.y+21,20,8,0,0,Math.PI*2);ctx.fill();
  ctx.shadowColor="transparent";
  if(selected===u){ctx.strokeStyle="#f5d98e";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y+19,25,10,0,0,Math.PI*2);ctx.stroke();}
  ctx.restore();

  const animState = u.team==="player" ? u._anim : null;
  const animKind = animState?.kind || null;
  const animSheet = animState ? playerAnimationSheets[u.id]?.[animKind] : null;
  const atlas = u.team==="player" ? playerSpriteAtlases[u.id] : null;
  if(animSheet && animSheet.complete && animSheet.naturalWidth){
    const now=performance.now();
    const sw=animSheet.naturalWidth/6, sh=animSheet.naturalHeight/4;
    const facingRows=animationFacingRows[u.id] || animationFacingRows.default;
    const row=facingRows[u.facing] ?? 0;
    let frame=0;
    if(animState){
      const frameMs=animState.frameMs||90;
      const raw=Math.floor((now-animState.start)/frameMs);
      frame=animState.loop ? raw%6 : Math.min(5,raw);
    }
    const targetH=animKind==="skill"?122:112;
    const targetW=targetH*(sw/sh);
    ctx.save();
    ctx.translate(p.x+ox,p.y+oy+wob);
    ctx.scale(scale,scale);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality="high";
    if(flash){ctx.shadowColor="#fff";ctx.shadowBlur=14;ctx.globalAlpha=.82;}
    ctx.drawImage(animSheet,frame*sw,row*sh,sw,sh,-targetW/2,22-targetH,targetW,targetH);
    ctx.restore();
  } else if(atlas && atlas.complete && atlas.naturalWidth){
    const cell = playerAtlasFacingCell[u.facing] || playerAtlasFacingCell.S;
    const sw = atlas.naturalWidth / 2;
    const sh = atlas.naturalHeight / 2;
    const sx = cell.col * sw;
    const sy = cell.row * sh;
    const drawSize = 104;
    ctx.save();
    ctx.translate(p.x+ox,p.y+oy+wob);
    ctx.scale(scale,scale);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality="high";
    if(flash){ctx.shadowColor="#fff";ctx.shadowBlur=14;ctx.globalAlpha=.82;}
    ctx.drawImage(atlas,sx,sy,sw,sh,-drawSize/2,22-drawSize,drawSize,drawSize);
    ctx.restore();
  } else if(u.team==="enemy") {
    const enemyAtlas=enemySpriteAtlases[u.spriteKey];
    if(enemyAtlas&&enemyAtlas.complete&&enemyAtlas.naturalWidth){
      const facingMap=enemyAtlasFacingCells[u.spriteKey]||enemyAtlasFacingCells.default;
      const cell=facingMap[u.facing]||facingMap.S;
      const sw=enemyAtlas.naturalWidth/2,sh=enemyAtlas.naturalHeight/2;
      const sx=cell.col*sw,sy=cell.row*sh;
      const drawSize=u.spriteKey==="clock_knight"?118:108;
      ctx.save();
      ctx.translate(p.x+ox,p.y+oy+wob);
      ctx.scale(scale*(cell.flip?-1:1),scale);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
      if(flash){ctx.shadowColor="#fff";ctx.shadowBlur=14;ctx.globalAlpha=.82;}
      ctx.drawImage(enemyAtlas,sx,sy,sw,sh,-drawSize/2,22-drawSize,drawSize,drawSize);
      ctx.restore();
    }else{
      drawTimeGuard(u,p.x+ox,p.y+oy+wob,scale,flash);
    }
  } else {
    const x=p.x+ox,y=p.y-17+oy;
    ctx.save();
    ctx.translate(x,y+wob);ctx.scale(scale,scale);
    ctx.strokeStyle="#25202a";ctx.lineWidth=2.2;ctx.lineJoin="round";
    ctx.fillStyle=flash?"#fff":u.color;
    ctx.beginPath();ctx.moveTo(-13,5);ctx.quadraticCurveTo(-17,22,-11,34);ctx.lineTo(12,34);ctx.quadraticCurveTo(17,20,12,5);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=flash?"#fff":u.accent;ctx.beginPath();ctx.arc(0,-5,12,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle="#3a2c2c";ctx.beginPath();ctx.arc(-4,-6,1.6,0,Math.PI*2);ctx.arc(4,-6,1.6,0,Math.PI*2);ctx.fill();
    scribbleLine(-4,0,4,0,"#704b54",1.3);
    if(u.id==="halo"){scribbleLine(10,8,22,22,"#6c4a2e",3);ctx.strokeStyle="#ead69c";ctx.beginPath();ctx.arc(20,20,10,-1.6,1.6);ctx.stroke();}
    else if(u.id==="bobo"){ctx.strokeStyle="#f09a49";ctx.beginPath();ctx.arc(13,14,7,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#74ccec";ctx.beginPath();ctx.moveTo(-11,-13);ctx.lineTo(0,-28);ctx.lineTo(11,-13);ctx.closePath();ctx.fill();ctx.stroke();}
    else if(u.id==="pao"){ctx.fillStyle="#f4c35b";ctx.beginPath();ctx.arc(16,15,5,0,Math.PI*2);ctx.fill();ctx.stroke();scribbleLine(16,10,16,3,"#f4c35b",2);}
    else {ctx.fillStyle="#39425a";ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(0,-22);ctx.lineTo(12,-8);ctx.closePath();ctx.fill();ctx.stroke();}
    ctx.restore();
  }

  if(statusById(u,"sleep")){
    ctx.fillStyle="#d6c7ff";ctx.font="bold 12px serif";ctx.textAlign="center";ctx.fillText("Z",p.x+18,p.y-52);
  }
  drawFacingArrow(u,p.x,p.y);
  const hpW=38,hpPct=u.hp/u.maxHp;
  const hudY=u.team==="player"?p.y-64:p.y-(u.spriteKey==="clock_knight"?82:72);
  ctx.fillStyle="#161822";ctx.fillRect(p.x-hpW/2,hudY,hpW,4);
  ctx.fillStyle=u.team==="player"?"#72d59b":"#e16f77";ctx.fillRect(p.x-hpW/2,hudY,hpW*hpPct,4);
  ctx.font="10px Microsoft JhengHei";ctx.textAlign="center";ctx.fillStyle="#fff";ctx.fillText("Lv."+u.level+" "+u.name.split(" ")[0],p.x,hudY-6);
}

function drawProjectiles(now){
  projectiles = projectiles.filter(pr=>{
    const t=Math.min(1,(now-pr.start)/pr.duration);
    const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    const x=pr.from.x+(pr.to.x-pr.from.x)*e;
    const y=pr.from.y+(pr.to.y-pr.from.y)*e-30*Math.sin(Math.PI*t);
    ctx.save();ctx.translate(x,y);
    if(pr.type==="arrow"||pr.type==="snipe"){
      ctx.rotate(Math.atan2(pr.to.y-pr.from.y,pr.to.x-pr.from.x));
      ctx.strokeStyle=pr.type==="snipe"?"#fff0a5":"#e8d7a1";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(12,0);ctx.stroke();
      ctx.fillStyle="#fff0a5";ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(3,-5);ctx.lineTo(3,5);ctx.closePath();ctx.fill();
    } else {
      const colors={fire:"#ff8d50",storm:"#bca6ff",wind:"#83e9f1",sleep:"#d5b6ff"};
      ctx.fillStyle=colors[pr.type]||"#9cdcff";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=15;
      ctx.beginPath();ctx.arc(0,0,8+4*Math.sin(t*Math.PI),0,Math.PI*2);ctx.fill();
    }
    ctx.restore();return t<1;
  });
}
function drawBursts(now){
  bursts = bursts.filter(b=>{
    const t=Math.min(1,(now-b.start)/b.duration),p=iso(b.x,b.y,tileAt(b.x,b.y)?.h||1);
    ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=b.color;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(p.x,p.y+12,12+t*42,6+t*22,0,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4+t;ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(p.x+Math.cos(a)*(12+t*30),p.y+10+Math.sin(a)*(6+t*16),2.5,0,Math.PI*2);ctx.fill();}
    ctx.restore();return t<1;
  });
}

function drawSnow(){
  const now=performance.now()/1000;
  ctx.save();ctx.globalAlpha=.28;ctx.fillStyle="#e7fbff";
  for(let i=0;i<65;i++){
    const x=(i*149+now*18*(i%3+1))%viewW,y=(i*83+now*12*(i%5+1))%viewH;
    ctx.beginPath();ctx.arc(x,y,(i%3)+.7,0,Math.PI*2);ctx.fill();
  }ctx.restore();
}
function draw(){
  const now=performance.now();
  ctx.clearRect(0,0,viewW,viewH);
  const shakeX=cameraShake>0?(Math.random()-.5)*cameraShake:0,shakeY=cameraShake>0?(Math.random()-.5)*cameraShake:0;
  ctx.save();ctx.translate(shakeX,shakeY);
  if(!drawBattleBackdrop()){const g=ctx.createLinearGradient(0,0,0,viewH);g.addColorStop(0,"#26354d");g.addColorStop(1,"#101722");ctx.fillStyle=g;ctx.fillRect(-20,-20,viewW+40,viewH+40);
  // New generated clocktower background replaces the old distant SVG art.
  drawClockTower();}
  for(let sum=0;sum<COLS+ROWS-1;sum++){
    for(let y=0;y<ROWS;y++){
      const x=sum-y;if(x<0||x>=COLS)continue;
      const t=tileAt(x,y),p=iso(x,y,t.h);if(p.x<-120||p.x>viewW+120||p.y<-180||p.y>viewH+180)continue;
      drawTile(t);
    }
  }
  banners.forEach(drawBanner);
  drawHighlights();
  const ordered=[...units.filter(u=>u.hp>0).map(u=>({kind:"unit",depth:u.x+u.y,payload:u})),...mapObjects.map(o=>({kind:"object",depth:Math.max(...o.cells.map(c=>c.x+c.y))+.25,payload:o}))].sort((a,b)=>a.depth-b.depth);
  ordered.forEach(e=>e.kind==="unit"?drawUnit(e.payload):drawMapObject(e.payload));
  drawProjectiles(now);drawBursts(now);drawSnow();
  ctx.restore();
  cameraShake=Math.max(0,cameraShake-.6);
  drawMiniMap();
}

function neighbors(t,u){
  const arr=[];
  [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{
    const n=tileAt(t.x+dx,t.y+dy);
    if(!n||n.blocked||isOccupied(n.x,n.y,u))return;
    if(Math.abs(n.h-t.h)<=getStat(u,"jump"))arr.push(n);
  });
  return arr;
}
function computeReachable(u){
  const out=new Map(),queue=[{x:u.x,y:u.y,cost:0}];
  out.set(key(u.x,u.y),{cost:0,prev:null});
  const maxMove=getStat(u,"move");
  while(queue.length){
    const cur=queue.shift(),t=tileAt(cur.x,cur.y);
    for(const n of neighbors(t,u)){
      const extra=iceTiles.has(key(n.x,n.y))?1:0;
      const nc=cur.cost+1+extra,k=key(n.x,n.y);
      if(nc<=maxMove && (!out.has(k)||nc<out.get(k).cost)){
        out.set(k,{cost:nc,prev:key(cur.x,cur.y)});
        queue.push({x:n.x,y:n.y,cost:nc});
      }
    }
  }
  return out;
}
function reconstructPath(target){
  const path=[];let k=key(target.x,target.y);
  while(k && reachable.has(k)){
    const [x,y]=k.split(",").map(Number);path.unshift({x,y});
    k=reachable.get(k).prev;
  }
  return path;
}
function effectiveRange(u,targetTile,base){
  const from=tileAt(u.x,u.y),delta=from.h-targetTile.h;
  return base+(delta>=2?1:0);
}
function inRange(u,tile,range,minRange=0){
  const d=dist(u,tile),r=effectiveRange(u,tile,range);
  return d<=r && d>=minRange;
}
function computeAttackable(u,range,minRange=0){
  const arr=[];
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const t=tileAt(x,y);if(inRange(u,t,range,minRange))arr.push(t);
  }
  return arr;
}
function inRangeFromPosition(origin,target,baseRange,minRange=0){
  const from=tileAt(origin.x,origin.y);if(!from||!target)return false;
  const d=Math.abs(origin.x-target.x)+Math.abs(origin.y-target.y);
  const range=baseRange+((from.h-target.h)>=2?1:0);
  return d<=range&&d>=minRange;
}
function computeEnvelopeFromReach(u,reach,range,minRange=1,excludeReach=false){
  const out=new Map();
  const origins=[...reach.keys()].map(k=>{const [x,y]=k.split(",").map(Number);return {x,y};});
  for(const origin of origins){
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      const t=tileAt(x,y),k=key(x,y);
      if(excludeReach&&reach.has(k))continue;
      if(inRangeFromPosition(origin,t,range,minRange))out.set(k,t);
    }
  }
  return [...out.values()];
}
function computeMoveAttackEnvelope(u){
  return computeEnvelopeFromReach(u,reachable,u.range,1,true);
}
function refreshEnemyThreat(){
  if(!threatDirty)return enemyThreatTiles;
  const out=new Map();
  for(const enemy of living("enemy")){
    const reach=computeReachable(enemy);
    const threatened=computeEnvelopeFromReach(enemy,reach,enemy.range,1,false);
    threatened.forEach(t=>out.set(key(t.x,t.y),t));
  }
  enemyThreatTiles=[...out.values()];threatDirty=false;return enemyThreatTiles;
}
function tilesInAoE(center,radius){
  const arr=[];for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=tileAt(x,y);if(Math.abs(x-center.x)+Math.abs(y-center.y)<=radius)arr.push(t);}
  return arr;
}
function cardinalTiles(u){
  return [[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy])=>tileAt(u.x+dx,u.y+dy)).filter(Boolean);
}

function directionFromTo(from,to){
  const dx=to.x-from.x,dy=to.y-from.y;
  if(Math.abs(dx)>Math.abs(dy))return dx>0?"E":"W";
  return dy>0?"S":"N";
}
function opposite(dir){return {N:"S",S:"N",E:"W",W:"E"}[dir];}
function facingRelation(attacker,target){
  const attackFrom=directionFromTo(target,attacker);
  if(attackFrom===target.facing)return "front";
  if(attackFrom===opposite(target.facing))return "back";
  return "side";
}
function faceToward(u,target){u.facing=directionFromTo(u,target);}

function hitChance(attacker,target,skill=null){
  const relation=facingRelation(attacker,target);
  let chance=(skill?.accuracy??88) + (getStat(attacker,"agi")-getStat(target,"agi"))*.8 - getStat(target,"evade")*.55;
  const dh=tileAt(attacker.x,attacker.y).h-tileAt(target.x,target.y).h;
  chance += Math.max(-10,Math.min(12,dh*3));
  if(relation==="side")chance+=10;if(relation==="back")chance+=20;
  return Math.round(Math.max(35,Math.min(100,chance)));
}
function critChance(attacker,target,skill=null){
  const relation=facingRelation(attacker,target);
  let c=getStat(attacker,"crit")+(skill?.crit||0);
  if(relation==="side")c+=5;if(relation==="back")c+=14;
  return Math.max(0,Math.min(65,Math.round(c)));
}
function baseDamage(attacker,target,skill=null){
  const type=skill?.type||"physical";
  const power=skill?.power??1;
  let raw;
  if(type==="magic")raw=getStat(attacker,"mag")*power-getStat(target,"res")*.5;
  else raw=getStat(attacker,"atk")*power-getStat(target,"def")*.55;
  const dh=tileAt(attacker.x,attacker.y).h-tileAt(target.x,target.y).h;
  raw*=1+Math.max(-.2,Math.min(.3,dh*.06));
  if(facingRelation(attacker,target)==="back")raw*=1.1;
  if(target.job==="重裝兵"&&type==="physical")raw*=.9;
  return Math.max(5,Math.round(raw));
}
function healAmount(attacker,skill){ return Math.round(18+getStat(attacker,"mag")*skill.power); }

function showForecast(attacker,target,skill=null){
  if(!attacker||!target||target.hp<=0){hideForecast();return;}
  const box=document.getElementById("forecast");box.classList.remove("hidden");
  document.getElementById("forecastActor").textContent=attacker.name;
  document.getElementById("forecastTarget").textContent=target.name;
  if(skill && ["heal","buff","debuff"].includes(skill.type)){
    document.getElementById("forecastDamage").textContent=skill.type==="heal"?"+"+healAmount(attacker,skill):"--";
    document.getElementById("forecastHit").textContent=skill.accuracy+"%";
    document.getElementById("forecastCrit").textContent="--";
    document.getElementById("forecastNote").textContent=skill.desc;
  } else {
    document.getElementById("forecastDamage").textContent=baseDamage(attacker,target,skill);
    document.getElementById("forecastHit").textContent=hitChance(attacker,target,skill)+"%";
    document.getElementById("forecastCrit").textContent=critChance(attacker,target,skill)+"%";
    const rel=facingRelation(attacker,target);
    const reaction=canCounter(target,attacker)?"｜對方可能反擊":"";
    document.getElementById("forecastNote").textContent=(rel==="back"?"背擊：命中、爆擊與傷害提升":rel==="side"?"側擊：命中與爆擊提升":"正面攻擊")+(tileAt(attacker.x,attacker.y).h>tileAt(target.x,target.y).h?"｜高地優勢":"")+reaction;
  }
}
function hideForecast(){document.getElementById("forecast").classList.add("hidden");}

function setMode(next){
  if(!selected||phase!=="player"||busy)return;
  mode=next;selectedSkill=null;previewSkill=null;selectedItem=null;hoverAoE=[];hideForecast();
  document.querySelectorAll(".actions button").forEach(b=>b.classList.remove("active"));
  if(next==="move"){reachable=computeReachable(selected);moveAttackEnvelope=computeMoveAttackEnvelope(selected);document.getElementById("moveBtn").classList.add("active");setHelp("藍色＝可移動；紅色外圈＝移動後可攻擊到的範圍。鏡冰地形會多消耗 1 Move。");}
  if(next==="attack"){attackable=computeAttackable(selected,selected.range,1);document.getElementById("attackBtn").classList.add("active");setHelp("選擇紅色範圍內的敵人。移動後仍可先撤回，再重新走位。");}
  if(next==="skill"){document.getElementById("skillBtn").classList.add("active");openSkillMenu();setHelp("選擇技能後，回到戰場指定目標。");}
  if(next==="item"){document.getElementById("itemBtn").classList.add("active");openItemMenu();setHelp("選擇道具後，回到戰場指定友軍。");}
  if(next==="facing"){attackable=[];setHelp("選擇相鄰方向決定角色面向。背後被攻擊時會更危險。");}
}
function setHelp(t){document.getElementById("actionHelp").textContent=t;}

function commandTypeLabel(s){
  if(s.type==="physical")return "物理";
  if(s.type==="magic")return "魔法";
  if(s.type==="heal")return "治療";
  if(s.type==="buff")return "強化";
  if(s.type==="debuff")return "弱化";
  return "特殊";
}
function fillCommandActor(){
  const u=selected;if(!u)return;
  setBattlePortrait(document.getElementById("commandPortrait"),u);
  document.getElementById("commandJob").textContent=u.job+" / "+(u.id==="halo"?"STARBREAK RANGER":u.id==="bobo"?"ELEMENT MAGE":"BELL DANCER");
  document.getElementById("commandName").textContent=u.name;
  document.getElementById("commandLevel").textContent="Lv. "+u.level;
  document.getElementById("commandExp").textContent="EXP "+u.xp+" / "+xpNeed(u);
  document.getElementById("commandHpText").textContent=Math.ceil(u.hp)+" / "+u.maxHp;
  document.getElementById("commandMpText").textContent=Math.ceil(u.mp)+" / "+u.maxMp;
  document.getElementById("commandHpBar").style.width=(u.hp/u.maxHp*100)+"%";
  document.getElementById("commandMpBar").style.width=(u.mp/u.maxMp*100)+"%";
  const box=document.getElementById("commandStatuses");box.innerHTML="";
  if(!u.statuses.length){const chip=document.createElement("span");chip.className="statusChip";chip.textContent="狀態正常";box.appendChild(chip);}
  else u.statuses.forEach(s=>{const chip=document.createElement("span");chip.className="statusChip";chip.textContent=s.name+"　"+s.turns+"T";box.appendChild(chip);});
}
function openCommandModal(kind){
  fillCommandActor();
  document.getElementById("commandModal").classList.remove("hidden");
  document.getElementById("commandModalKicker").textContent=kind==="skill"?"BATTLE COMMAND / SKILL":"BATTLE COMMAND / ITEM";
  document.getElementById("commandModalTitle").textContent=kind==="skill"?"技能選擇":"道具選擇";
  document.getElementById("commandModalHint").textContent=kind==="skill"?"確認消耗、射程與效果後選擇技能":"選擇要使用的道具與目標";
  playSfx("select");
}
function closeCommandModal(resetMode=false){
  previewSkill=null;document.querySelectorAll("#commandList .commandChoice").forEach(el=>el.classList.remove("previewing"));
  document.getElementById("commandModal").classList.add("hidden");
  if(resetMode&&selected){
    selectedSkill=null;selectedItem=null;
    mode=selected.moved?"attack":"move";
    document.querySelectorAll(".actions button").forEach(b=>b.classList.remove("active"));
    if(mode==="attack"){attackable=computeAttackable(selected,selected.range,1);document.getElementById("attackBtn").classList.add("active");}
    else {reachable=computeReachable(selected);moveAttackEnvelope=computeMoveAttackEnvelope(selected);document.getElementById("moveBtn").classList.add("active");}
  }
}
function skillRangeMiniHTML(s){
  const radius=Math.max(1,Math.min(6,s.range)),side=radius*2+1,min=s.minRange||0;
  let cells="";
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
    const d=Math.abs(x)+Math.abs(y);
    const cls=x===0&&y===0?"caster":(d<=s.range&&d>=min?(s.target==="ally"?"ally":"enemy"):"");
    cells+="<i class='"+cls+"'></i>";
  }
  return "<div class='skillRangePreview'><span>施法範圍</span><div class='skillRangeGrid' style='--side:"+side+"'>"+cells+"</div>"+(s.aoe?"<em>AoE "+s.aoe+"</em>":"")+"</div>";
}
function previewSkillRange(s,button){
  if(!selected||selected.mp<s.cost)return;
  previewSkill=s;
  attackable=computeAttackable(selected,s.range,s.minRange||0);
  document.querySelectorAll("#commandList .commandChoice").forEach(el=>el.classList.remove("previewing"));
  if(button)button.classList.add("previewing");
  document.getElementById("commandModalHint").textContent="預覽【"+s.name+"】｜"+(s.target==="ally"?"綠色":"紅色")+"格為可指定範圍"+(s.aoe?"｜紫色標示範圍效果 AoE "+s.aoe:"");
  setHelp("施法範圍預覽：【"+s.name+"】射程 "+s.range+(s.minRange?"／最短 "+s.minRange:"")+(s.aoe?"／AoE "+s.aoe:""));
}
function openSkillMenu(){
  const list=document.getElementById("commandList");list.innerHTML="";
  const skills=SKILLS[selected.id]||[];
  skills.forEach((s,i)=>{
    const b=document.createElement("button");b.className="commandChoice";b.disabled=selected.mp<s.cost;
    const target=s.target==="ally"?"友軍":s.target==="enemy"?"敵軍":"特殊";
    b.innerHTML="<b>"+(i+1)+". "+s.name+"</b><em>MP "+s.cost+"</em><div class='choiceTags'><span class='choiceTag'>"+commandTypeLabel(s)+"</span><span class='choiceTag'>射程 "+s.range+"</span><span class='choiceTag'>"+target+"</span>"+(s.aoe?"<span class='choiceTag'>範圍 "+s.aoe+"</span>":"")+"</div><small>"+s.desc+"</small>"+skillRangeMiniHTML(s);
    b.onmouseenter=()=>previewSkillRange(s,b);b.onfocus=()=>previewSkillRange(s,b);b.onclick=()=>chooseSkill(s);list.appendChild(b);
  });
  openCommandModal("skill");
  const firstIndex=skills.findIndex(s=>selected.mp>=s.cost);if(firstIndex>=0)previewSkillRange(skills[firstIndex],list.children[firstIndex]);
}
function chooseSkill(s){
  if(selected.mp<s.cost){message("MP 不足");return;}
  selectedSkill=s;previewSkill=null;mode="skill";attackable=computeAttackable(selected,s.range,s.minRange||0);
  closeCommandModal(false);
  setHelp("已選擇【"+s.name+"】。"+(s.target==="ally"?"綠色":"紅色")+"格為可指定範圍。"+s.desc);
  playSfx("select");
}
function openItemMenu(){
  const list=document.getElementById("commandList");list.innerHTML="";
  Object.values(ITEMS).forEach((it,i)=>{
    const count=inventory[it.id]||0,b=document.createElement("button");b.className="commandChoice";b.disabled=count<=0;
    b.innerHTML="<b>"+(i+1)+". "+it.name+"</b><em>× "+count+"</em><div class='choiceTags'><span class='choiceTag'>射程 "+it.range+"</span><span class='choiceTag'>友軍</span></div><small>"+it.desc+"</small>";
    b.onclick=()=>chooseItem(it);list.appendChild(b);
  });
  openCommandModal("item");
}
function chooseItem(it){
  if((inventory[it.id]||0)<=0)return;
  selectedItem=it;mode="item";attackable=computeAttackable(selected,it.range,0);
  closeCommandModal(false);setHelp("已選擇【"+it.name+"】。指定自己或友軍使用。");playSfx("select");
}

function selectUnit(u){
  if(!u||u.team!=="player"||u.hp<=0||phase!=="player"||busy)return;
  if(pendingMoveUnit && pendingMoveUnit!==u){message("請先讓 "+pendingMoveUnit.name+" 行動，或撤回移動。");return;}
  if(u.acted){message(u.name+" 本回合已行動。");return;}
  selected=u;updatePanel();setMode(u.moved?"attack":"move");playSfx("select");
}
function updatePanel(){
  const u=selected||living("player")[0];if(!u)return;
  document.getElementById("unitName").textContent=u.name;
  document.getElementById("unitJob").textContent=u.job+"　Move "+getStat(u,"move")+" / Jump "+getStat(u,"jump")+" / Range "+u.range;
  document.getElementById("levelText").textContent="Lv. "+u.level;
  document.getElementById("xpText").textContent="EXP "+u.xp+"/"+xpNeed(u);
  document.getElementById("hpText").textContent=Math.ceil(u.hp)+"/"+u.maxHp;
  document.getElementById("mpText").textContent=Math.ceil(u.mp)+"/"+u.maxMp;
  document.getElementById("hpBar").style.width=(u.hp/u.maxHp*100)+"%";
  document.getElementById("mpBar").style.width=(u.mp/u.maxMp*100)+"%";
  setBattlePortrait(document.getElementById("portraitImg"),u);
  const chips=document.getElementById("statusChips");chips.innerHTML="";
  u.statuses.forEach(s=>{const el=document.createElement("span");el.className="statusChip";el.textContent=s.name+" "+s.turns;chips.appendChild(el);});
  document.getElementById("moveBtn").disabled=u.moved||u.acted;
  document.getElementById("attackBtn").disabled=u.acted;
  document.getElementById("skillBtn").disabled=u.acted||!(SKILLS[u.id]?.length);
  document.getElementById("itemBtn").disabled=u.acted;
  document.getElementById("undoBtn").disabled=!(u._moveSnapshot&&!u.acted);
  document.getElementById("waitBtn").disabled=u.acted;
  updateTurnOrder();
}
function showStats(){
  const u=selected||living("player")[0];if(!u)return;
  setBattlePortrait(document.getElementById("statsPortrait"),u);document.getElementById("statsName").textContent=u.name;
  document.getElementById("statsJob").textContent=u.job+" / "+(u.id==="halo"?"STARBREAK RANGER":u.id==="bobo"?"ELEMENT MAGE":"BELL DANCER");
  document.getElementById("statsLevel").textContent="Lv. "+u.level;document.getElementById("statsXp").textContent=u.xp+" / "+xpNeed(u);
  document.getElementById("statsXpBar").style.width=(u.xp/xpNeed(u)*100)+"%";
  const statuses=document.getElementById("statsStatuses");statuses.innerHTML="";
  const stateChips=[
    "面向 "+({N:"北",E:"東",S:"南",W:"西"}[u.facing]||u.facing),
    u.acted?"本回合已行動":u.moved?"已移動／可行動":"尚未行動"
  ];
  stateChips.concat(u.statuses.length?u.statuses.map(s=>s.name+" "+s.turns+"T"):["狀態正常"]).forEach(label=>{
    const chip=document.createElement("span");chip.className="statusChip";chip.textContent=label;statuses.appendChild(chip);
  });
  const stats=[["ATK","atk"],["MAG","mag"],["DEF","def"],["RES","res"],["AGI","agi"],["CRIT","crit"],["EVA","evade"],["MOVE","move"],["JUMP","jump"],["RANGE","range"]];
  document.getElementById("statsGrid").innerHTML=stats.map(([label,k])=>"<div class='statCard'>"+label+"<b>"+getStat(u,k)+"</b></div>").join("");
  document.getElementById("statsSkills").innerHTML=(SKILLS[u.id]||[]).map(s=>"<div><b>"+s.name+"</b>　MP "+s.cost+"　｜　射程 "+s.range+(s.aoe?"　｜　範圍 "+s.aoe:"")+"<br><span>"+s.desc+"</span></div>").join("");
  document.getElementById("statsModal").classList.remove("hidden");
}

function animateUnitPath(u,path){
  return (async()=>{
    busy=true;
    if(u.team==="player")u._anim={kind:"walk",start:performance.now(),frameMs:88,loop:true};
    for(let i=1;i<path.length;i++){
      const from=path[i-1],to=path[i];
      u.facing=directionFromTo(from,to);
      await tween(135,t=>{
        const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
        u._renderX=from.x+(to.x-from.x)*e;u._renderY=from.y+(to.y-from.y)*e;
      });
      playSfx("step");
    }
    u._anim=null;
    u._renderX=null;u._renderY=null;u.x=path[path.length-1].x;u.y=path[path.length-1].y;threatDirty=true;busy=false;
  })();
}
function tween(ms,fn){
  return new Promise(resolve=>{
    const start=performance.now();
    function step(now){const t=Math.min(1,(now-start)/ms);fn(t);if(t<1)requestAnimationFrame(step);else resolve();}
    requestAnimationFrame(step);
  });
}
async function playUnitAnimation(u,kind,duration){
  if(!u||u.team!=="player")return;
  const frameMs=duration/6;
  u._anim={kind,start:performance.now(),frameMs,loop:false};
  await sleep(duration);
  u._anim=null;
}
async function animateLunge(attacker,target){
  const a=renderPos(attacker),b=renderPos(target),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  const ux=dx/len,uy=dy/len;
  await tween(110,t=>unitTweens.set(attacker.id,{ox:ux*18*t,oy:uy*10*t,scale:1+.05*t}));
  await tween(120,t=>unitTweens.set(attacker.id,{ox:ux*18*(1-t),oy:uy*10*(1-t),scale:1.05-.05*t}));
  unitTweens.delete(attacker.id);
}
async function animateProjectile(attacker,target,type){
  const a=renderPos(attacker),b=renderPos(target);
  projectiles.push({from:{x:a.x,y:a.y-12},to:{x:b.x,y:b.y-12},type,start:performance.now(),duration:360});
  playSfx(type==="fire"?"magic":type==="arrow"||type==="snipe"?"bow":"magic");
  await sleep(350);
}
async function flashHit(target,color="#fff"){
  unitTweens.set(target.id,{flash:1,scale:1.07});cameraShake=8;
  bursts.push({x:target.x,y:target.y,color,start:performance.now(),duration:420});
  await sleep(110);unitTweens.delete(target.id);
}

async function moveSelected(t){
  if(!selected||selected.moved||selected.acted||busy)return;
  const data=reachable.get(key(t.x,t.y));
  if(!data||isOccupied(t.x,t.y,selected))return;
  const path=reconstructPath(t);
  selected._moveSnapshot={x:selected.x,y:selected.y,facing:selected.facing,path:path.map(p=>({...p}))};
  pendingMoveUnit=selected;hideForecast();
  await animateUnitPath(selected,path);
  selected.moved=true;
  log(selected.name+" 移動至 "+terrainName(t)+" H"+t.h);
  message(selected.name+" 移動完成；攻擊前仍可撤回。");
  setMode("attack");updatePanel();
}
async function undoMove(){
  const u=selected;if(!u?._moveSnapshot||u.acted||busy)return;
  const snap=u._moveSnapshot;
  const reverse=snap.path.slice().reverse();
  if(reverse.length>1){await animateUnitPath(u,reverse);}
  u.x=snap.x;u.y=snap.y;u.facing=snap.facing;u.moved=false;u._moveSnapshot=null;pendingMoveUnit=null;
  reachable=computeReachable(u);setMode("move");updatePanel();message("已撤回移動。");log(u.name+" 撤回移動");
}
function commitAction(u){u.moved=true;u.acted=true;u._moveSnapshot=null;if(pendingMoveUnit===u)pendingMoveUnit=null;}
function focusCameraOnUnit(u){
  if(!u)return;const t=tileAt(u.x,u.y);if(!t)return;
  const raw={x:(u.x-u.y)*TILE_W/2,y:(u.x+u.y)*TILE_H/2-t.h*HEIGHT_STEP};
  camera.x=viewW/2-raw.x;camera.y=raw.y-viewH/2;
}
function advancePlayerControl(from){
  if(phase!=="player"||battleEnded)return;
  const ready=living("player").filter(u=>!u.acted);
  if(!ready.length){setTimeout(enemyPhase,500);return;}
  const start=Math.max(-1,units.indexOf(from));let next=null;
  for(let step=1;step<=units.length;step++){
    const u=units[(start+step)%units.length];
    if(u?.team==="player"&&u.hp>0&&!u.acted){next=u;break;}
  }
  next=next||ready[0];
  selected=next;selectUnit(next);focusCameraOnUnit(next);
  message("下一位："+next.name+"。可直接點其他尚未行動角色切換。");
}

function canCounter(defender,attacker){
  if(!defender||!attacker||defender.hp<=0||attacker.hp<=0||statusById(defender,"sleep"))return false;
  return inRange(defender,tileAt(attacker.x,attacker.y),defender.range,1);
}
async function tryCounter(defender,attacker){
  if(!canCounter(defender,attacker))return false;
  const rel=facingRelation(attacker,defender);
  let chance=55+(getStat(defender,"agi")-getStat(attacker,"agi"))*.7;
  if(rel==="back")chance-=18;
  chance=Math.max(25,Math.min(78,chance));
  if(Math.random()*100>chance){log(defender.name+" 未能發動反擊");return false;}
  message(defender.name+" 發動反擊！");faceToward(defender,attacker);
  if(defender.team==="player")await playUnitAnimation(defender,"attack",440);
  if(defender.range>1)await animateProjectile(defender,attacker,defender.id==="halo"?"arrow":"magic");else await animateLunge(defender,attacker);
  const hit=Math.max(45,hitChance(defender,attacker,null)-8);
  if(Math.random()*100>hit){showFloat(attacker,"COUNTER MISS");playSfx("miss");log(defender.name+" 反擊未命中");return true;}
  const crit=Math.random()*100<Math.max(0,critChance(defender,attacker,null)-5);
  let dmg=Math.max(4,Math.round(baseDamage(defender,attacker,null)*.68));if(crit)dmg=Math.round(dmg*1.45);
  attacker.hp=Math.max(0,attacker.hp-dmg);await flashHit(attacker,"#ffe6b3");showFloat(attacker,"-"+dmg,false,crit);playSfx(crit?"crit":"enemy");
  log(defender.name+" 反擊 "+attacker.name+"，造成 "+dmg+" 傷害");
  if(defender.team==="player")gainXp(defender,Math.round(5+dmg*.18));
  return true;
}

async function resolveAttack(attacker,target,skill=null){
  if(!attacker||!target||busy||target.hp<=0)return;
  busy=true;hideForecast();faceToward(attacker,target);
  const anim=skill?.anim||(attacker.id==="halo"?"arrow":attacker.id==="bobo"?"magic":attacker.id==="pao"?"bell":attacker.range>1?"arrow":"melee");
  if(attacker.team==="player")await playUnitAnimation(attacker,skill?"skill":"attack",skill?600:480);
  if(["arrow","snipe","fire","storm","wind","sleep","magic","bell"].includes(anim)) await animateProjectile(attacker,target,anim);
  else await animateLunge(attacker,target);

  const hit=hitChance(attacker,target,skill),crit=critChance(attacker,target,skill);
  const roll=Math.random()*100;
  if(roll>hit){
    showFloat(target,"MISS",false,false);playSfx("miss");log(attacker.name+" 的攻擊未命中 "+target.name);
  } else {
    const isCrit=Math.random()*100<crit;
    let dmg=baseDamage(attacker,target,skill);if(isCrit)dmg=Math.round(dmg*1.55);
    target.hp=Math.max(0,target.hp-dmg);
    await flashHit(target,skill?.type==="magic"?"#b8d9ff":"#ffd6a3");
    showFloat(target,"-"+dmg,false,isCrit);playSfx(isCrit?"crit":"hit");
    log(attacker.name+" 對 "+target.name+" 造成 "+dmg+(isCrit?" 爆擊":"")+"傷害");
    gainXp(attacker,Math.round(8+dmg*.35+(target.hp<=0?30:0)));
    if(skill?.status && target.hp>0 && Math.random()*100<(skill.accuracy??100)){addStatus(target,skill.status);log(target.name+" 附加【"+skill.status.name+"】");}
    if(skill?.selfStatus)addStatus(attacker,skill.selfStatus);
  }
  if(skill)attacker.mp=Math.max(0,attacker.mp-skill.cost);
  await maybeTriggerStoryAfterDamage(target);
  if(target.hp>0&&attacker.hp>0)await tryCounter(target,attacker);
  commitAction(attacker);threatDirty=true;updatePanel();checkBattle();
  busy=false;if(!battleEnded)advancePlayerControl(attacker);
}
async function resolveAoESkill(attacker,center,skill){
  if(busy)return;busy=true;hideForecast();attacker.mp-=skill.cost;faceToward(attacker,center);
  if(attacker.team==="player")await playUnitAnimation(attacker,"skill",620);
  await animateProjectile(attacker,center,skill.anim);
  const tiles=tilesInAoE(center,skill.aoe),targets=units.filter(u=>u.hp>0&&tiles.some(t=>t.x===u.x&&t.y===u.y));
  let affected=0,totalValue=0;
  for(const target of targets){
    if(skill.target==="enemy"&&target.team===attacker.team)continue;
    if(skill.target==="ally"&&target.team!==attacker.team)continue;
    if(skill.type==="heal"){
      const amount=Math.min(target.maxHp-target.hp,healAmount(attacker,skill));target.hp+=amount;showFloat(target,"+"+amount,true,false);bursts.push({x:target.x,y:target.y,color:"#84e6a1",start:performance.now(),duration:500});totalValue+=amount;affected++;
    } else if(skill.type==="buff"){
      addStatus(target,skill.status);showFloat(target,skill.status.name,true,false);bursts.push({x:target.x,y:target.y,color:"#9fe6dc",start:performance.now(),duration:500});affected++;
    } else if(skill.type==="debuff"){
      const chance=Math.max(35,skill.accuracy-getStat(target,"res")*.3+getStat(attacker,"mag")*.2);
      if(Math.random()*100<chance){addStatus(target,skill.status);showFloat(target,skill.status.name,false,false);affected++;}
      else showFloat(target,"RESIST",false,false);
    } else {
      const hit=hitChance(attacker,target,skill);
      if(Math.random()*100<=hit){
        let dmg=baseDamage(attacker,target,skill);target.hp=Math.max(0,target.hp-dmg);showFloat(target,"-"+dmg,false,false);bursts.push({x:target.x,y:target.y,color:"#c8a7ff",start:performance.now(),duration:500});totalValue+=dmg;affected++;
        if(skill.status&&target.hp>0)addStatus(target,skill.status);
      } else showFloat(target,"MISS",false,false);
    }
  }
  if(skill.target==="enemy"){
    const captainHit=targets.find(t=>t.id==="e6");
    if(captainHit)await maybeTriggerStoryAfterDamage(captainHit);
  }
  if(skill.type==="heal")gainXp(attacker,Math.round(8+totalValue*.2));
  else gainXp(attacker,Math.round(10+totalValue*.22+affected*3));
  playSfx(skill.anim==="bell"?"bell":"magic");cameraShake=skill.type==="magic"?9:3;
  log(attacker.name+" 使用【"+skill.name+"】，影響 "+affected+" 個單位");
  commitAction(attacker);threatDirty=true;updatePanel();checkBattle();busy=false;if(!battleEnded)advancePlayerControl(attacker);
}
async function useItem(user,target,item){
  if(busy||!item||inventory[item.id]<=0)return;busy=true;
  faceToward(user,target);await animateLunge(user,target);
  inventory[item.id]--;
  if(item.heal){const n=Math.min(item.heal,target.maxHp-target.hp);target.hp+=n;showFloat(target,"+"+n,true,false);}
  if(item.mp){const n=Math.min(item.mp,target.maxMp-target.mp);target.mp+=n;showFloat(target,"MP +"+n,true,false);}
  if(item.cleanse){target.statuses=target.statuses.filter(s=>!isNegativeStatus(s.id));showFloat(target,"CLEAN",true,false);}
  playSfx("item");bursts.push({x:target.x,y:target.y,color:"#8fe7ae",start:performance.now(),duration:450});
  log(user.name+" 對 "+target.name+" 使用【"+item.name+"】");
  gainXp(user,6);commitAction(user);threatDirty=true;updatePanel();busy=false;advancePlayerControl(user);
}
function gainXp(u,amount){
  if(u.team!=="player")return;
  u.xp+=amount;message(u.name+" 獲得 "+amount+" EXP");
  while(u.xp>=xpNeed(u)){
    u.xp-=xpNeed(u);u.level++;
    u.maxHp+=8;u.maxMp+=3;u.atk+=2;u.mag+=2;u.def+=1;u.res+=1;u.agi+=1;u.hp=u.maxHp;u.mp=u.maxMp;
    playSfx("level");log("<b>"+u.name+" 升到 Lv."+u.level+"！</b>");
  }
}
function showFloat(u,text,heal=false,crit=false){
  const p=renderPos(u),r=canvas.getBoundingClientRect();
  const el=document.createElement("div");el.className="floatText"+(heal?" heal":"")+(crit?" crit":"");el.textContent=text;el.style.left=p.x+"px";el.style.top=(p.y-60)+"px";
  document.getElementById("damageLayer").appendChild(el);setTimeout(()=>el.remove(),950);
}
function log(html){
  battleLog.unshift("R"+round+"｜"+html);battleLog=battleLog.slice(0,30);
  const el=document.getElementById("battleLog");el.innerHTML=battleLog.map(x=>"<div>"+x+"</div>").join("");
}

function playerClick(t){
  if(!t||phase!=="player"||busy||battleEnded)return;
  const u=unitAt(t.x,t.y);
  if(mode==="facing"&&selected){
    const dirs=cardinalTiles(selected);
    if(dirs.some(d=>d.x===t.x&&d.y===t.y)){
      const finished=selected;finished.facing=directionFromTo(finished,t);commitAction(finished);message(finished.name+" 面向 "+finished.facing+" 待機。");log(finished.name+" 待機，面向 "+finished.facing);updatePanel();advancePlayerControl(finished);
    }
    return;
  }
  if(u&&u.team==="player"&&mode!=="skill"&&mode!=="item"){selectUnit(u);return;}
  if(!selected)return;
  if(mode==="move"){moveSelected(t);return;}
  if(mode==="attack"&&!selected.acted){
    if(u&&u.team==="enemy"&&inRange(selected,t,selected.range,1))resolveAttack(selected,u,null);return;
  }
  if(mode==="skill"&&selectedSkill&&!selected.acted){
    const s=selectedSkill;
    if(!inRange(selected,t,s.range,s.minRange||0))return;
    if(s.aoe>0){resolveAoESkill(selected,t,s);return;}
    if(s.target==="enemy"&&u&&u.team!==selected.team)resolveAttack(selected,u,s);
    else if(s.target==="ally"&&u&&u.team===selected.team)resolveAoESkill(selected,t,s);
    return;
  }
  if(mode==="item"&&selectedItem&&!selected.acted){
    if(u&&u.team===selected.team&&inRange(selected,t,selectedItem.range,0))useItem(selected,u,selectedItem);return;
  }
}
function waitUnit(){
  if(!selected||selected.acted||phase!=="player"||busy)return;
  closeCommandModal(false);mode="facing";attackable=[];hoverAoE=[];hideForecast();setHelp("選擇角色四周任一格決定待機面向。");
}
function checkRoundAuto(){
  if(battleEnded)return;
  if(living("player").length && living("player").every(u=>u.acted)){setTimeout(enemyPhase,500);}
}
function processStatusStart(u){
  const sleep=statusById(u,"sleep");
  if(sleep){u.acted=true;u.moved=true;log(u.name+" 因【沉睡】跳過本回合");}
  u.statuses.forEach(s=>s.turns--);u.statuses=u.statuses.filter(s=>s.turns>0);
}
async function enemyPhase(){
  if(phase!=="player"||busy||battleEnded)return;
  phase="enemy";busy=true;pendingMoveUnit=null;hideForecast();updateTurnUI();message("敵方回合");log("<b>敵方回合開始</b>");
  const enemies=living("enemy").slice().sort((a,b)=>getStat(b,"agi")-getStat(a,"agi"));
  for(const e of enemies){
    if(battleEnded||living("player").length===0)break;
    processStatusStart(e);if(e.acted){await sleep(250);continue;}
    await sleep(260);
    let targets=living("player").slice().sort((a,b)=>enemyScore(e,a)-enemyScore(e,b));
    let target=targets[0];if(!target)break;
    if(!inRange(e,tileAt(target.x,target.y),e.range,1)){
      const dest=bestEnemyMove(e,target);
      if(dest){const path=enemyPath(e,dest);if(path.length>1)await animateUnitPath(e,path);e.moved=true;}
    }
    targets=living("player").slice().sort((a,b)=>enemyScore(e,a)-enemyScore(e,b));target=targets[0];
    await sleep(170);
    if(target&&inRange(e,tileAt(target.x,target.y),e.range,1)){
      const fakeSkill=(e.job==="術士"&&e.mp>=5)?{name:"時霜彈",cost:5,power:1.2,type:"magic",accuracy:90,crit:0,anim:"wind"}:null;
      if(fakeSkill)e.mp-=5;
      await enemyAttack(e,target,fakeSkill);
    }else{e.acted=true;}
    if(checkBattle())break;
  }
  if(!battleEnded){
    round++;phase="player";busy=false;
    living("player").forEach(u=>{u.moved=false;u.acted=false;u.mp=Math.min(u.maxMp,u.mp+3);u._moveSnapshot=null;processStatusStart(u);});
    living("enemy").forEach(u=>{u.moved=false;u.acted=false;u.mp=Math.min(u.maxMp,u.mp+2);});
    selected=living("player").find(u=>!u.acted)||living("player")[0]||null;
    if(selected)selectUnit(selected);updateTurnUI();message("我方回合 "+round);log("<b>我方回合 "+round+"</b>");playSfx("round");autoSave();
    checkRoundAuto();
  }
}
function enemyScore(e,t){
  return dist(e,t)*10 + t.hp*.08 - (tileAt(t.x,t.y).h*2) - (facingRelation(e,t)==="back"?12:0);
}
function bestEnemyMove(e,target){
  const map=computeReachable(e);let best=null,bestScore=Infinity;
  map.forEach((data,k)=>{
    const [x,y]=k.split(",").map(Number);if(isOccupied(x,y,e))return;
    const t=tileAt(x,y),d=Math.abs(x-target.x)+Math.abs(y-target.y);
    const score=d*10 - t.h*2;
    if(score<bestScore){bestScore=score;best={x,y,map};}
  });
  return best;
}
function enemyPath(e,dest){
  const map=dest.map||computeReachable(e),path=[];let k=key(dest.x,dest.y);
  while(k&&map.has(k)){const [x,y]=k.split(",").map(Number);path.unshift({x,y});k=map.get(k).prev;}
  return path;
}
async function enemyAttack(attacker,target,skill=null){
  faceToward(attacker,target);
  const anim=skill?.anim||(attacker.range>1?"arrow":"melee");
  if(anim==="melee")await animateLunge(attacker,target);else await animateProjectile(attacker,target,anim);
  const hit=hitChance(attacker,target,skill);
  if(Math.random()*100>hit){showFloat(target,"MISS");playSfx("miss");log(attacker.name+" 未命中 "+target.name);}
  else{
    const isCrit=Math.random()*100<critChance(attacker,target,skill);let dmg=baseDamage(attacker,target,skill);if(isCrit)dmg=Math.round(dmg*1.5);
    target.hp=Math.max(0,target.hp-dmg);await flashHit(target);showFloat(target,"-"+dmg,false,isCrit);playSfx(isCrit?"crit":"enemy");
    log(attacker.name+" 對 "+target.name+" 造成 "+dmg+" 傷害");
  }
  if(target.hp>0&&attacker.hp>0)await tryCounter(target,attacker);
  attacker.acted=true;updatePanel();checkBattle();
}
function checkBattle(){
  threatDirty=true;
  if(battleEnded)return true;
  if(living("enemy").length===0){finish(true);return true;}
  if(living("player").length===0){finish(false);return true;}
  return false;
}
function finish(win){
  battleEnded=true;busy=true;phase="done";stopMusic();localStorage.removeItem(SAVE_KEY);
  if(win&&window.BattleDialogue&&!BattleDialogue.hasPlayed("battle_victory")){playBattleDialogue("battle_victory").then(()=>finish(true));return;}
  const s=document.getElementById("resultScreen");s.classList.remove("hidden");
  document.getElementById("resultTitle").textContent=win?"鐘聲重新向前":"時間吞沒了廣場";
  document.getElementById("resultText").innerHTML=win
    ?"最後一名時間守衛倒下，鐘塔的指針越過十二點零一分。<br><b>祭壇中央卻浮現一道指向「嘆息群島」的深藍光芒……</b>"
    :"三兄妹的徽章同時失去光芒。時間再次倒退到戰鬥開始之前。";
  document.getElementById("resultExp").innerHTML=living("player").map(u=>u.name+"　Lv."+u.level+"　EXP "+u.xp+"/"+xpNeed(u)).join("<br>");
}
function endPlayerRound(){
  if(phase!=="player"||busy)return;
  if(pendingMoveUnit){message("尚有暫定移動，請先行動或撤回。");return;}
  living("player").forEach(u=>{if(!u.acted){u.moved=true;u.acted=true;}});
  enemyPhase();
}
function updateTurnUI(){
  document.getElementById("phaseLabel").textContent=phase==="player"?"我方回合":phase==="enemy"?"敵方回合":"戰鬥結束";
  document.getElementById("roundLabel").textContent="ROUND "+round;updateTurnOrder();
}
function updateTurnOrder(){
  const el=document.getElementById("turnOrder");
  const order=units.filter(u=>u.hp>0).slice().sort((a,b)=>getStat(b,"agi")-getStat(a,"agi")).slice(0,9);
  el.innerHTML=order.map(u=>"<div class='turnChip "+u.team+(u===selected?" active":"")+"' title='"+u.name+" AGI "+getStat(u,"agi")+"'>"+(u.id==="halo"?"H":u.id==="bobo"?"B":u.id==="pao"?"♫":u.job.slice(0,1))+"</div>").join("");
}
function message(t){
  const e=document.getElementById("battleMessage");e.textContent=t;e.classList.add("show");clearTimeout(message.timer);message.timer=setTimeout(()=>e.classList.remove("show"),1750);
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function playBattleDialogue(sceneId){
  if(!window.BattleDialogue)return;
  if(BattleDialogue.hasPlayed(sceneId))return;
  const restoreBusy=busy;
  dialogueActive=true;busy=true;hideForecast();
  document.getElementById("statsModal")?.classList.add("hidden");
  document.getElementById("commandModal")?.classList.add("hidden");
  try{
    await BattleDialogue.play(sceneId,{
      onLine:(line)=>{
        const u=line.unit?units.find(x=>x.id===line.unit):null;
        if(u)focusCameraOnUnit(u);
      },
      onAdvance:()=>playSfx("select")
    });
  }finally{
    dialogueActive=false;
    busy=restoreBusy;
  }
}
async function maybeTriggerStoryAfterDamage(target){
  if(!target||target.id!=="e6"||!window.BattleDialogue)return;
  if(target.hp<=0){
    await playBattleDialogue("captain_defeat");
    return;
  }
  if(target.hp<=target.maxHp*.5){
    await playBattleDialogue("captain_half");
  }
}

function saveBattle(showMsg=true){
  if(phase!=="player"||busy||battleEnded){if(showMsg)message("只能在我方可操作時儲存。");return;}
  if(pendingMoveUnit){if(showMsg)message("請先提交或撤回暫定移動再儲存。");return;}
  const data={version:3,round,phase,camera,inventory,battleLog,storyFlags:window.BattleDialogue?BattleDialogue.getPlayed():[],units:units.map(u=>{
    const o={...u};delete o._moveSnapshot;delete o._renderX;delete o._renderY;return o;
  })};
  localStorage.setItem(SAVE_KEY,JSON.stringify(data));if(showMsg){message("戰鬥進度已儲存。");playSfx("save");}
  refreshContinue();
}
function autoSave(){saveBattle(false);}
function loadBattle(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);if(!raw)return false;
    const data=JSON.parse(raw);if(data.version!==3)return false;
    round=data.round||1;phase="player";camera=data.camera||camera;inventory=data.inventory||inventory;battleLog=data.battleLog||[];
    if(window.BattleDialogue)BattleDialogue.setPlayed(data.storyFlags||["battle_intro"]);
    units=data.units.map(u=>({...u,_renderX:null,_renderY:null,_moveSnapshot:null,moved:false,acted:false}));
    pendingMoveUnit=null;threatDirty=true;selected=living("player")[0]||null;renderLog();updateTurnUI();updatePanel();if(selected)selectUnit(selected);return true;
  }catch(e){console.error(e);return false;}
}
function refreshContinue(){
  const has=!!localStorage.getItem(SAVE_KEY);document.getElementById("continueBtn").classList.toggle("hidden",!has);
}
function renderLog(){document.getElementById("battleLog").innerHTML=battleLog.map(x=>"<div>"+x+"</div>").join("");}

function drawMiniMap(){
  const w=mini.width,h=mini.height,cw=w/COLS,ch=h/ROWS;mctx.clearRect(0,0,w,h);
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const t=tileAt(x,y);mctx.fillStyle=shade(tileColor(t),-25);mctx.fillRect(x*cw,y*ch,cw+.5,ch+.5);}
  blocked.forEach(k=>{const [x,y]=k.split(",").map(Number);mctx.fillStyle="#26313d";mctx.fillRect(x*cw,y*ch,cw,ch);});
  units.filter(u=>u.hp>0).forEach(u=>{mctx.fillStyle=u.team==="player"?"#f3d177":"#ef727c";mctx.beginPath();mctx.arc((u.x+.5)*cw,(u.y+.5)*ch,4,0,Math.PI*2);mctx.fill();});
  const center=screenToWorldCenter();mctx.strokeStyle="#fff";mctx.lineWidth=1;mctx.strokeRect((center.x-4)*cw,(center.y-3)*ch,8*cw,6*ch);
}
function screenToWorldCenter(){
  let best={x:11,y:9},bestD=Infinity;
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const p=iso(x,y,heights[y][x]),d=Math.hypot(p.x-viewW/2,p.y-viewH/2);if(d<bestD){bestD=d;best={x,y};}}
  return best;
}

canvas.addEventListener("mousemove",e=>{
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  if(dragging){camera.x=cameraOrigin.x+(x-dragOrigin.x);camera.y=cameraOrigin.y-(y-dragOrigin.y);return;}
  hoverTile=screenToTile(x,y);hoverAoE=[];
  if(hoverTile){
    const occ=unitAt(hoverTile.x,hoverTile.y);
    document.getElementById("tileInfo").innerHTML="<b>"+terrainName(hoverTile)+"</b>　高度 "+hoverTile.h+(hoverTile.blocked?"　不可通行":"")+(iceTiles.has(key(hoverTile.x,hoverTile.y))?"　Move 消耗 +1":"")+(occ?"<br>"+occ.name+"｜"+occ.job+"｜Lv."+occ.level+"｜HP "+Math.ceil(occ.hp)+"/"+occ.maxHp:"");
    if(selected&&mode==="attack"&&occ&&occ.team!==selected.team&&inRange(selected,hoverTile,selected.range,1))showForecast(selected,occ,null);
    else if(selected&&mode==="skill"&&selectedSkill&&inRange(selected,hoverTile,selectedSkill.range,selectedSkill.minRange||0)){
      if(selectedSkill.aoe)hoverAoE=tilesInAoE(hoverTile,selectedSkill.aoe);
      if(occ)showForecast(selected,occ,selectedSkill);else hideForecast();
    }else hideForecast();
  }else hideForecast();
});
canvas.addEventListener("mousedown",e=>{
  if(e.button===1||e.button===2){dragging=true;dragOrigin={x:e.offsetX,y:e.offsetY};cameraOrigin={...camera};e.preventDefault();}
});
canvas.addEventListener("mouseup",e=>{
  if(dragging){dragging=false;return;}
  if(e.button===0){const r=canvas.getBoundingClientRect();playerClick(screenToTile(e.clientX-r.left,e.clientY-r.top));}
});
canvas.addEventListener("contextmenu",e=>{e.preventDefault();dragging=false;});
canvas.addEventListener("mouseleave",()=>dragging=false);

const keysDown={};
addEventListener("keydown",e=>{
  if(dialogueActive){
    if(e.key==="Enter"||e.key===" "||e.key==="ArrowRight"){BattleDialogue?.advance();e.preventDefault();}
    else if(e.key==="Escape"){BattleDialogue?.skip();e.preventDefault();}
    return;
  }
  const commandOpen=!document.getElementById("commandModal").classList.contains("hidden");
  const statsOpen=!document.getElementById("statsModal").classList.contains("hidden");
  if(commandOpen&&/^[1-9]$/.test(e.key)){
    const choice=document.querySelectorAll("#commandList .commandChoice")[Number(e.key)-1];
    if(choice&&!choice.disabled){choice.click();e.preventDefault();return;}
  }
  keysDown[e.key.toLowerCase()]=true;
  if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase()))e.preventDefault();
  if(e.key==="Escape"){
    if(commandOpen)closeCommandModal(true);
    else if(statsOpen)document.getElementById("statsModal").classList.add("hidden");
    else if(selected?._moveSnapshot)undoMove();
    else if(selected)setMode(selected.moved?"attack":"move");
  }
  if(e.key.toLowerCase()==="z"&&!commandOpen&&!statsOpen&&selected?._moveSnapshot)undoMove();
});
addEventListener("keyup",e=>keysDown[e.key.toLowerCase()]=false);

mini.addEventListener("click",e=>{
  const r=mini.getBoundingClientRect(),mx=(e.clientX-r.left)/r.width,my=(e.clientY-r.top)/r.height;
  const tx=Math.floor(mx*COLS),ty=Math.floor(my*ROWS),t=tileAt(tx,ty);if(!t)return;
  const raw={x:(tx-ty)*TILE_W/2,y:(tx+ty)*TILE_H/2-t.h*HEIGHT_STEP};camera.x=viewW/2-raw.x;camera.y=raw.y-viewH/2;
});

document.getElementById("moveBtn").onclick=()=>setMode("move");
document.getElementById("attackBtn").onclick=()=>setMode("attack");
document.getElementById("skillBtn").onclick=()=>setMode("skill");
document.getElementById("itemBtn").onclick=()=>setMode("item");
document.getElementById("undoBtn").onclick=undoMove;
document.getElementById("waitBtn").onclick=waitUnit;
document.getElementById("endRoundBtn").onclick=endPlayerRound;
document.getElementById("portraitBtn").onclick=e=>{e.stopPropagation();showStats();};
document.getElementById("unitPanel").onclick=showStats;
document.getElementById("closeStats").onclick=()=>document.getElementById("statsModal").classList.add("hidden");
document.getElementById("closeCommandModal").onclick=()=>closeCommandModal(true);
document.getElementById("statsModal").onclick=e=>{if(e.target.id==="statsModal")e.currentTarget.classList.add("hidden");};
document.getElementById("commandModal").onclick=e=>{if(e.target.id==="commandModal")closeCommandModal(true);};
document.getElementById("saveBtn").onclick=()=>saveBattle(true);
document.getElementById("threatBtn").onclick=()=>{threatOverlayOn=!threatOverlayOn;const b=document.getElementById("threatBtn");b.textContent="敵軍威脅範圍 "+(threatOverlayOn?"ON":"OFF");b.classList.toggle("off",!threatOverlayOn);};
document.getElementById("musicBtn").onclick=()=>{musicOn=!musicOn;syncAudioControls();saveAudioSettings();if(musicOn)startMusic();else stopMusic();};
document.getElementById("soundBtn").onclick=()=>{soundOn=!soundOn;syncAudioControls();saveAudioSettings();if(sfxBus)sfxBus.gain.setTargetAtTime(soundOn?sfxVolume:0,audioCtx.currentTime,.025);};

function playSfx(kind){
  if(!soundOn)return;ensureAudio();
  const presets={
    select:[[520,.08,"triangle",.025,0],[780,.08,"triangle",.018,.05]],
    step:[[145,.07,"square",.018,0],[110,.05,"square",.012,.06]],
    hit:[[180,.10,"sawtooth",.04,0],[90,.16,"square",.035,.04]],
    enemy:[[130,.12,"sawtooth",.035,0],[85,.18,"square",.028,.04]],
    crit:[[250,.08,"square",.05,0],[510,.16,"sawtooth",.045,.05],[850,.2,"triangle",.025,.09]],
    miss:[[220,.07,"sine",.012,0]],
    magic:[[330,.28,"sine",.024,0],[440,.28,"sine",.02,.035],[660,.28,"sine",.018,.07],[880,.28,"sine",.014,.1]],
    bow:[[630,.06,"triangle",.02,0],[330,.08,"sine",.01,.05]],
    bell:[[880,.55,"sine",.018,0],[1320,.55,"sine",.014,.08],[1760,.55,"sine",.01,.16]],
    item:[[520,.12,"sine",.02,0],[690,.15,"sine",.018,.09]],
    round:[[392,.18,"triangle",.03,0],[523,.22,"triangle",.025,.12],[659,.28,"triangle",.022,.25]],
    level:[[523,.15,"triangle",.03,0],[659,.15,"triangle",.03,.12],[784,.18,"triangle",.03,.24],[1047,.35,"sine",.025,.38]],
    save:[[440,.08,"sine",.015,0],[660,.1,"sine",.014,.07]]
  };
  (presets[kind]||presets.select).forEach(a=>tone(...a));
}
document.getElementById("startBtn").onclick=async()=>{
  localStorage.removeItem(SAVE_KEY);document.getElementById("startScreen").classList.add("hidden");ensureAudio();startMusic();
  selected=units[0];selectUnit(selected);focusCameraOnUnit(selected);
  await playBattleDialogue("battle_intro");
  message("我方先攻。移動是暫定的，行動前都能撤回。");log("<b>戰鬥開始</b>");autoSave();
};
document.getElementById("continueBtn").onclick=()=>{
  if(loadBattle()){document.getElementById("startScreen").classList.add("hidden");ensureAudio();startMusic();message("已讀取戰鬥進度。");}
};

function loop(now){
  const dt=Math.min(.04,(now-lastTime)/1000);
  lastTime=now;
  const pan=360*dt;
  if(!dialogueActive){
  if(keysDown["a"]||keysDown["arrowleft"])camera.x+=pan;
  if(keysDown["d"]||keysDown["arrowright"])camera.x-=pan;
  if(keysDown["w"]||keysDown["arrowup"])camera.y-=pan;
  if(keysDown["s"]||keysDown["arrowdown"])camera.y+=pan;
  }
  draw();requestAnimationFrame(loop);
}

[["heroHalo","halo"],["heroBobo","bobo"],["heroPao","pao"]].forEach(([el,id])=>setBattlePortrait(document.getElementById(el),units.find(u=>u.id===id)));
initAudioSettings();refreshContinue();updateTurnUI();updatePanel();renderLog();requestAnimationFrame(loop);
