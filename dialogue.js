"use strict";
(() => {
  const PORTRAITS = {
    halo:"assets/user-character-art/portraits/halo_portrait.webp",
    bobo:"assets/user-character-art/portraits/bobo_portrait.webp",
    pao:"assets/user-character-art/portraits/pao_portrait.webp",
    time_mage:"assets/generated/dialogue-fallback/time_mage.png",
    clock_knight:"assets/generated/dialogue-fallback/clock_knight.png"
  };

  const SCENES = {
    battle_intro:{
      title:"逆行鐘塔・交戰前",
      once:true,
      lines:[
        {speaker:"時鐘騎士",portrait:"clock_knight",side:"right",unit:"e6",text:"停下。永冬城的時間已被封存，十二點零一分不允許存在。"},
        {speaker:"哈羅",portrait:"halo",side:"left",unit:"halo",text:"那就把它找回來！只要有哈羅偵探，沒有破不了的案件！"},
        {speaker:"波波",portrait:"bobo",side:"left",unit:"bobo",text:"哥，廣場每六十秒會出現一次魔力回捲。四根時間水晶柱就是同步錨點。Oh~~ I see!"},
        {speaker:"泡泡",portrait:"pao",side:"left",unit:"pao",text:"那就把鐘聲送到下一分鐘！泡泡會幫大家加油！"},
        {speaker:"時間術士",portrait:"time_mage",side:"right",unit:"e4",text:"愚蠢。當指針逆行，你們連自己的第一步都會忘記。"},
        {speaker:"哈羅",portrait:"halo",side:"left",unit:"halo",text:"那就一步一步走給你看。星之破曉，開始行動！"}
      ]
    },
    captain_half:{
      title:"時間鎧甲的破綻",
      once:true,
      lines:[
        {speaker:"時鐘騎士",portrait:"clock_knight",side:"right",unit:"e6",text:"竟然能突破時間守衛的陣線……你們到底看見了什麼？"},
        {speaker:"波波",portrait:"bobo",side:"left",unit:"bobo",text:"Got it! 你胸甲上的齒輪正在跟中央祭壇同步。每次防禦，都會慢半拍。"},
        {speaker:"哈羅",portrait:"halo",side:"left",unit:"halo",text:"也就是說，只要抓住那半拍，就能把你的時間鎧甲打穿！"},
        {speaker:"時鐘騎士",portrait:"clock_knight",side:"right",unit:"e6",text:"小鬼……你們看到得太多了。"}
      ]
    },
    captain_defeat:{
      title:"十二點零一分",
      once:true,
      lines:[
        {speaker:"時鐘騎士",portrait:"clock_knight",side:"right",unit:"e6",text:"指針……竟然沒有退回去……"},
        {speaker:"泡泡",portrait:"pao",side:"left",unit:"pao",text:"因為大家都在往前走呀。時間也要一起往前走！"},
        {speaker:"哈羅",portrait:"halo",side:"left",unit:"halo",text:"這一分鐘，我們收下了！"}
      ]
    },
    battle_victory:{
      title:"鐘聲之後",
      once:true,
      lines:[
        {speaker:"波波",portrait:"bobo",side:"left",unit:"bobo",text:"等等。祭壇沒有熄滅，它把剩下的時間魔力變成了一道座標。"},
        {speaker:"泡泡",portrait:"pao",side:"left",unit:"pao",text:"座標？是下一個夢境水晶碎片嗎？"},
        {speaker:"波波",portrait:"bobo",side:"left",unit:"bobo",text:"深藍色、潮汐波形、方向西南……是嘆息群島。"},
        {speaker:"哈羅",portrait:"halo",side:"left",unit:"halo",text:"看來鐘塔只是入口。先把永冬城的時間救回來，下一站——去大海！"}
      ]
    }
  };

  const played = new Set();
  let active=false;
  let scene=null;
  let index=0;
  let fullText="";
  let typing=false;
  let timer=null;
  let resolver=null;
  let hooks={};
  const sideState={left:null,right:null};

  const el = id => document.getElementById(id);
  const overlay = () => el("battleDialogue");

  function clearTyping(){
    if(timer){clearInterval(timer);timer=null;}
    typing=false;
  }

  function applyPortrait(side,key,isActive){
    const img=el(side==="left"?"dialogueLeft":"dialogueRight");
    if(!key){img.classList.add("hidden");return;}
    img.src=PORTRAITS[key]||"";
    img.classList.remove("hidden");
    img.classList.toggle("active",isActive);
    img.classList.toggle("inactive",!isActive);
  }

  function completeTyping(){
    clearTyping();
    el("dialogueText").textContent=fullText;
  }

  function renderLine(){
    clearTyping();
    const line=scene.lines[index];
    if(!line){finish(false);return;}
    if(line.portrait)sideState[line.side]=line.portrait;
    applyPortrait("left",sideState.left,line.side==="left");
    applyPortrait("right",sideState.right,line.side==="right");
    el("dialogueSpeaker").textContent=line.speaker||"";
    el("dialogueSceneTitle").textContent=scene.title||"BATTLE EVENT";
    el("dialogueProgress").textContent=(index+1)+" / "+scene.lines.length;
    el("dialogueText").textContent="";
    fullText=line.text||"";
    hooks.onLine?.(line,index,scene);
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced){el("dialogueText").textContent=fullText;typing=false;return;}
    typing=true;
    let pos=0;
    timer=setInterval(()=>{
      pos++;
      el("dialogueText").textContent=fullText.slice(0,pos);
      if(pos>=fullText.length)clearTyping();
    },24);
  }

  function advance(){
    if(!active)return;
    if(typing){completeTyping();return;}
    hooks.onAdvance?.(index,scene);
    index++;
    if(index>=scene.lines.length)finish(false);
    else renderLine();
  }

  function skip(){
    if(!active)return;
    finish(true);
  }

  function finish(skipped){
    clearTyping();
    overlay()?.classList.add("hidden");
    active=false;
    scene=null;
    sideState.left=null;sideState.right=null;
    const done=resolver;resolver=null;
    hooks.onClose?.({skipped});
    hooks={};
    done?.({skipped});
  }

  function play(sceneId,nextHooks={}){
    const next=SCENES[sceneId];
    if(!next)return Promise.resolve({missing:true});
    if(active)return Promise.resolve({busy:true});
    if(next.once!==false&&played.has(sceneId))return Promise.resolve({alreadyPlayed:true});
    if(next.once!==false)played.add(sceneId);
    scene=next;index=0;hooks=nextHooks;active=true;
    sideState.left=null;sideState.right=null;
    overlay()?.classList.remove("hidden");
    hooks.onOpen?.(sceneId,next);
    renderLine();
    return new Promise(resolve=>{resolver=resolve;});
  }

  function getPlayed(){return [...played];}
  function setPlayed(ids){played.clear();(ids||[]).forEach(id=>played.add(id));}
  function markPlayed(id){played.add(id);}
  function hasPlayed(id){return played.has(id);}
  function isActive(){return active;}

  document.addEventListener("DOMContentLoaded",()=>{
    el("dialogueNext")?.addEventListener("click",e=>{e.stopPropagation();advance();});
    el("dialogueSkip")?.addEventListener("click",e=>{e.stopPropagation();skip();});
    el("dialogueBox")?.addEventListener("click",e=>{if(e.target.closest("button"))return;advance();});
  });

  window.BattleDialogue={play,advance,skip,isActive,getPlayed,setPlayed,markPlayed,hasPlayed,scenes:SCENES,portraits:PORTRAITS};
})();
