"use strict";
let audioCtx=null,musicTimer=null,musicBus=null,sfxBus=null;
let musicVolume=.6,sfxVolume=.75,musicStep=0,nextBeat=0;
const audioVoices=new Set();
const AUDIO_SETTINGS_KEY="halo_audio_v1";
function ensureAudio(){
  if(!audioCtx){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
    audioCtx=new Audio();
    const limiter=audioCtx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=18;limiter.ratio.value=4;
    limiter.connect(audioCtx.destination);
    musicBus=audioCtx.createGain();sfxBus=audioCtx.createGain();
    musicBus.gain.value=musicVolume;sfxBus.gain.value=soundOn?sfxVolume:0;
    musicBus.connect(limiter);sfxBus.connect(limiter);
    const delay=audioCtx.createDelay(.8),wet=audioCtx.createGain(),feedback=audioCtx.createGain();
    delay.delayTime.value=.31;wet.gain.value=.16;feedback.gain.value=.22;
    musicBus.connect(delay);delay.connect(wet);wet.connect(limiter);delay.connect(feedback);feedback.connect(delay);
  }
  if(audioCtx.state==="suspended")audioCtx.resume().catch(()=>{});
  return true;
}
function voice(freq,dur,type,gain,time,bus,attack=.012){
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type=type;o.frequency.value=freq;
  g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(gain,time+attack);
  g.gain.exponentialRampToValueAtTime(.0001,time+dur);
  o.connect(g);g.connect(bus);o.start(time);o.stop(time+dur+.04);
  const entry={o,g,bus};audioVoices.add(entry);
  o.onended=()=>{o.disconnect();g.disconnect();audioVoices.delete(entry);};
}
function tone(freq,dur,type="sine",gain=.03,when=0){
  if(!ensureAudio())return;
  voice(freq,dur,type,gain,audioCtx.currentTime+when,sfxBus,Math.min(.012,dur/4));
}
const midi=n=>440*Math.pow(2,(n-69)/12);
// Original 16-bar D minor theme. Two phrases, with a dominant cadence.
const scoreChords=[[50,57,65],[50,57,65],[46,53,62],[46,53,62],[53,60,69],[53,60,69],[48,55,64],[45,52,61],
 [50,57,65],[50,57,65],[46,53,62],[46,53,62],[55,62,70],[48,55,64],[45,52,61],[45,52,61]];
const scoreMelody=[[74,0,77,76,74,0,69,0],[72,0,74,0,69,0,65,0],[70,0,74,72,70,0,65,0],[69,0,70,0,65,0,62,0],
 [72,0,77,0,76,74,72,0],[69,0,72,0,77,0,76,0],[72,0,67,69,72,0,76,0],[73,0,76,0,69,0,0,0],
 [77,0,81,79,77,0,74,0],[76,0,77,0,74,0,69,0],[74,0,77,76,74,0,70,0],[72,0,74,0,70,0,65,0],
 [74,0,79,77,74,0,70,0],[76,0,79,0,76,0,72,0],[73,0,76,0,81,0,79,0],[76,0,73,0,69,0,0,0]];
function scheduleMusicStep(step,time){
  const beat=60/88/2,bar=Math.floor(step/8)%16,pos=step%8,chord=scoreChords[bar],enemy=phase==="enemy";
  if(pos===0){
    chord.forEach(n=>{voice(midi(n),beat*8,"triangle",.016,time,musicBus,.15);voice(midi(n)*1.003,beat*8,"sine",.009,time,musicBus,.2);});
  }
  if(pos%2===0)voice(midi(chord[0]-12),beat*1.8,"sine",.085,time,musicBus,.025);
  const arp=chord[[0,1,2,1,0,2,1,2][pos]]+12;
  voice(midi(arp),beat*1.6,"sine",enemy?.018:.025,time,musicBus,.006);
  const note=scoreMelody[bar][pos];
  if(note){voice(midi(note),beat*2.6,"sine",.045,time,musicBus,.009);voice(midi(note+12),beat*1.4,"sine",.009,time,musicBus,.005);}
  if(pos===0||pos===4||(enemy&&pos===6)){
    voice(58,.24,"sine",enemy?.1:.06,time,musicBus,.004);
    voice(115,.07,"triangle",.025,time,musicBus,.003);
  }
}
function pumpMusic(){
  if(!audioCtx||document.hidden)return;
  if(nextBeat<audioCtx.currentTime-.2)nextBeat=audioCtx.currentTime+.03;
  while(nextBeat<audioCtx.currentTime+.15){scheduleMusicStep(musicStep++,nextBeat);nextBeat+=60/88/2;}
}
function startMusic(){
  if(!musicOn||document.hidden||battleEnded||!ensureAudio()||musicTimer!==null)return;
  musicBus.gain.cancelScheduledValues(audioCtx.currentTime);musicBus.gain.setValueAtTime(0,audioCtx.currentTime);
  musicBus.gain.linearRampToValueAtTime(musicVolume,audioCtx.currentTime+.45);
  nextBeat=audioCtx.currentTime+.04;pumpMusic();musicTimer=setInterval(pumpMusic,50);
}
function stopMusic(){
  if(musicTimer!==null){clearInterval(musicTimer);musicTimer=null;}
  if(!audioCtx)return;
  const now=audioCtx.currentTime;
  musicBus.gain.cancelScheduledValues(now);musicBus.gain.setTargetAtTime(0,now,.045);
  for(const v of audioVoices)if(v.bus===musicBus){
    v.g.gain.cancelScheduledValues(now);v.g.gain.setTargetAtTime(.0001,now,.025);
    try{v.o.stop(now+.15);}catch{}
  }
}
function saveAudioSettings(){
  try{localStorage.setItem(AUDIO_SETTINGS_KEY,JSON.stringify({musicOn,soundOn,musicVolume,sfxVolume}));}catch{}
}
function syncAudioControls(){
  document.getElementById("musicBtn").textContent="♫ 音樂 "+(musicOn?"ON":"OFF");
  document.getElementById("soundBtn").textContent="✦ 音效 "+(soundOn?"ON":"OFF");
  document.getElementById("musicBtn").setAttribute("aria-pressed",String(musicOn));
  document.getElementById("soundBtn").setAttribute("aria-pressed",String(soundOn));
  for(const [id,value] of [["music",musicVolume],["sfx",sfxVolume]]){
    document.getElementById(id+"Volume").value=Math.round(value*100);
    document.getElementById(id+"VolumeValue").value=Math.round(value*100)+"%";
  }
}
function initAudioSettings(){
  try{
    const s=JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)||"{}");
    if(typeof s.musicOn==="boolean")musicOn=s.musicOn;if(typeof s.soundOn==="boolean")soundOn=s.soundOn;
    if(Number.isFinite(s.musicVolume))musicVolume=Math.max(0,Math.min(1,s.musicVolume));
    if(Number.isFinite(s.sfxVolume))sfxVolume=Math.max(0,Math.min(1,s.sfxVolume));
  }catch{}
  syncAudioControls();
  for(const id of ["music","sfx"])document.getElementById(id+"Volume").addEventListener("input",e=>{
    const value=Number(e.target.value)/100;
    if(id==="music"){musicVolume=value;if(musicBus&&musicOn&&musicTimer!==null)musicBus.gain.setTargetAtTime(value,audioCtx.currentTime,.03);}
    else{sfxVolume=value;if(sfxBus&&soundOn)sfxBus.gain.setTargetAtTime(value,audioCtx.currentTime,.03);}
    syncAudioControls();saveAudioSettings();
  });
}
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){stopMusic();if(audioCtx)audioCtx.suspend().catch(()=>{});}
  else if(audioCtx){ensureAudio();if(musicOn&&!battleEnded)startMusic();}
});
