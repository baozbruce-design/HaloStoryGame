"use strict";
// Pre-scale once on load: no full-resolution texture decoding in the render loop.
const terrainTextures = {};
for (const name of ["snow_soft","stone_frozen","ice_clear","shrine_goldstone","clock_stone","road_frozen"]) {
  const img = new Image();
  img.onload = () => {
    const tile = document.createElement("canvas"); tile.width=72; tile.height=36;
    const c=tile.getContext("2d");
    c.translate(36,0); c.transform(1,.5,-1,.5,0,0);
    c.drawImage(img,0,0,36,36);
    terrainTextures[name]=tile;
  };
  img.src="assets/generated/textures/"+name+".png";
}
function paintTerrain(t,poly) {
  const k=key(t.x,t.y);
  const name=shrineTiles.has(k)?"shrine_goldstone":iceTiles.has(k)?"ice_clear":t.h>=5?"clock_stone":t.h>=3?"stone_frozen":t.h===2?"road_frozen":"snow_soft";
  const image=terrainTextures[name]; if(!image)return;
  ctx.save();pathPoly(poly);ctx.clip();ctx.globalAlpha=.64;
  ctx.drawImage(image,poly[3][0],poly[0][1],72,36);
  ctx.globalAlpha=1;
  const frost=ctx.createLinearGradient(0,poly[0][1],0,poly[2][1]);
  frost.addColorStop(0,"#d8f7ff24");frost.addColorStop(1,"#17294318");
  ctx.fillStyle=frost;ctx.fill();ctx.restore();
}

function drawTimeGuard(u,x,y,scale,flash){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.lineJoin="round";ctx.lineWidth=1.5;ctx.strokeStyle="#151e31";
  const metal=ctx.createLinearGradient(-18,0,18,0);metal.addColorStop(0,"#27364d");metal.addColorStop(.5,flash?"#fff":"#9babc1");metal.addColorStop(1,"#3a4b65");
  const shape=(points,fill)=>{ctx.beginPath();points.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.stroke();};
  shape([[-12,-27],[12,-27],[19,14],[0,8],[-19,14]],u.color);
  shape([[-10,2],[-1,2],[-2,18],[-13,18]],metal);
  shape([[2,2],[10,2],[13,18],[2,18]],metal);
  shape([[-13,-29],[13,-29],[11,-2],[0,4],[-11,-2]],metal);
  shape([[-13,-30],[-21,-23],[-15,-16],[-8,-22]],metal);
  shape([[13,-30],[21,-23],[15,-16],[8,-22]],metal);
  ctx.strokeStyle="#d9bc7c";ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(-10,-9);ctx.lineTo(10,-9);ctx.stroke();
  ctx.strokeStyle="#172239";
  shape([[-10,-32],[-10,-44],[0,-51],[10,-44],[10,-32],[0,-27]],metal);
  const back=u.facing==="N";
  if(!back){ctx.fillStyle="#152239";ctx.fillRect(-8,-39,16,5);ctx.fillStyle="#a6f3ff";ctx.shadowColor="#73e8ff";ctx.shadowBlur=6;ctx.fillRect(u.facing==="W"?-7:1,-38,6,2);ctx.shadowBlur=0;}
  ctx.strokeStyle="#e1c884";ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(0,-19,4,0,Math.PI*2);ctx.moveTo(0,-22);ctx.lineTo(0,-19);ctx.lineTo(3,-17);ctx.stroke();
  if(/弩|弓/.test(u.job)){
    ctx.strokeStyle="#d8bb7c";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(15,-24);ctx.lineTo(23,3);ctx.moveTo(10,-12);ctx.lineTo(28,-19);ctx.stroke();
    ctx.strokeStyle="#d8e7f1";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(10,-12);ctx.lineTo(23,3);ctx.lineTo(28,-19);ctx.stroke();
  }else if(/法|術/.test(u.job)){
    ctx.strokeStyle="#bfa572";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(22,17);ctx.lineTo(22,-40);ctx.stroke();
    ctx.shadowColor="#9adaff";ctx.shadowBlur=12;shape([[22,-49],[28,-39],[22,-31],[16,-39]],"#a6dfff");ctx.shadowBlur=0;
  }else{
    shape([[19,-30],[23,-38],[26,-29],[24,-3],[20,-3]],"#c7ddec");
    ctx.strokeStyle="#d9bc7c";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(16,-4);ctx.lineTo(28,-4);ctx.moveTo(22,-3);ctx.lineTo(22,7);ctx.stroke();
    shape([[-24,-22],[-12,-25],[-10,-6],[-18,3],[-26,-6]],metal);
    ctx.strokeStyle="#d8c28b";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-19,-20);ctx.lineTo(-18,-3);ctx.stroke();
  }
  ctx.restore();
}
