"use strict";
(() => {
  const root = document.documentElement;
  const body = document.body;
  const vv = window.visualViewport;
  const coarse = matchMedia("(pointer: coarse)");
  const narrow = matchMedia("(max-width: 900px)");
  let lastLandscape = null;

  const mobileBar = document.createElement("nav");
  mobileBar.id = "mobileBar";
  mobileBar.setAttribute("aria-label", "手機戰鬥快捷指令");
  mobileBar.innerHTML = [
    ["moveBtn","移動","↗"],
    ["attackBtn","攻擊","⚔"],
    ["skillBtn","技能","✦"],
    ["itemBtn","道具","＋"],
    ["undoBtn","撤回","↶"],
    ["__panel__","更多","☰"]
  ].map(([target,label,icon]) =>
    `<button type="button" data-target="${target}"><b>${icon}</b><span>${label}</span></button>`
  ).join("");
  body.appendChild(mobileBar);

  const shade = document.createElement("button");
  shade.type = "button";
  shade.id = "mobilePanelShade";
  shade.setAttribute("aria-label", "關閉資訊面板");
  body.appendChild(shade);

  const side = document.getElementById("side");
  if (side) {
    const handle = document.createElement("div");
    handle.id = "mobilePanelHandle";
    handle.innerHTML = '<span></span><strong>戰鬥資訊</strong><button type="button" aria-label="關閉">×</button>';
    side.prepend(handle);
    handle.querySelector("button").onclick = () => closePanel();
  }

  function isTouchDevice() {
    return navigator.maxTouchPoints > 0 || coarse.matches;
  }
  function isMobileLayout() {
    const width = vv?.width || innerWidth;
    const height = vv?.height || innerHeight;
    return narrow.matches || (isTouchDevice() && Math.min(width,height) < 760);
  }
  function applyViewport() {
    const width = Math.max(1, Math.round(vv?.width || innerWidth));
    const height = Math.max(1, Math.round(vv?.height || innerHeight));
    const landscape = width > height;
    const orientationChanged = lastLandscape !== null && lastLandscape !== landscape;
    lastLandscape = landscape;
    root.style.setProperty("--app-width", width + "px");
    root.style.setProperty("--app-height", height + "px");
    root.style.setProperty("--device-dpr", String(Math.min(devicePixelRatio || 1, isTouchDevice() ? 1.75 : 2)));
    body.classList.toggle("touch-ui", isTouchDevice());
    body.classList.toggle("mobile-ui", isMobileLayout());
    body.classList.toggle("landscape-ui", landscape);
    body.dataset.deviceClass = isTouchDevice() ? (landscape ? "touch-landscape" : "touch-portrait") : "desktop";
    if (typeof resize === "function") resize();
    if (orientationChanged && typeof focusCameraOnUnit === "function" && selected) {
      requestAnimationFrame(()=>focusCameraOnUnit(selected));
    }
  }

  function openPanel() {
    if (!isMobileLayout()) return;
    body.classList.add("mobile-panel-open");
    if (side) side.style.transform = body.classList.contains("landscape-ui") ? "translateX(0)" : "translateY(0)";
    shade.style.opacity = "1";
    shade.style.pointerEvents = "auto";
  }
  function closePanel() {
    body.classList.remove("mobile-panel-open");
    if (side) side.style.transform = "";
    shade.style.opacity = "";
    shade.style.pointerEvents = "";
  }
  window.closeMobilePanel = closePanel;

  shade.addEventListener("click", closePanel);
  mobileBar.addEventListener("click", e => {
    const btn = e.target.closest("button[data-target]");
    if (!btn) return;
    const target = btn.dataset.target;
    if (target === "__panel__") { openPanel(); return; }
    document.getElementById(target)?.click();
    if (target !== "undoBtn") closePanel();
    syncBar();
  });

  function syncStartedState() {
    const started = document.getElementById("startScreen")?.classList.contains("hidden");
    body.classList.toggle("game-started", !!started);
  }
  function syncBar() {
    const pairs = [
      ["moveBtn","moveBtn"],["attackBtn","attackBtn"],["skillBtn","skillBtn"],
      ["itemBtn","itemBtn"],["undoBtn","undoBtn"]
    ];
    for (const [sourceId,targetId] of pairs) {
      const src = document.getElementById(sourceId);
      const btn = mobileBar.querySelector(`[data-target="${targetId}"]`);
      if (!src || !btn) continue;
      btn.disabled = !!src.disabled;
      btn.classList.toggle("active", src.classList.contains("active"));
    }
    syncStartedState();
  }

  const actionSection = document.querySelector(".actions");
  if (actionSection) new MutationObserver(syncBar).observe(actionSection,{attributes:true,subtree:true,attributeFilter:["class","disabled"]});
  const startScreen = document.getElementById("startScreen");
  if (startScreen) new MutationObserver(syncStartedState).observe(startScreen,{attributes:true,attributeFilter:["class"]});

  const hint = document.getElementById("controlHint");
  function updateHint() {
    if (!hint) return;
    hint.textContent = isTouchDevice()
      ? "單指點擊選格 ・ 單指拖曳移動鏡頭 ・ 底部快捷列操作 ・ 更多可開啟小地圖與完整資訊"
      : "滑鼠選格 ・ WASD / 方向鍵移動鏡頭 ・ 右鍵拖曳 ・ 小地圖快速移動";
  }

  const pointers = new Map();
  let touchGesture = null;
  const canvasEl = document.getElementById("game");
  if (canvasEl) {
    canvasEl.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse") return;
      if (dialogueActive || battleEnded) return;
      e.preventDefault();
      canvasEl.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pointers.size === 1) {
        touchGesture = {
          id:e.pointerId,
          startX:e.clientX,startY:e.clientY,
          lastX:e.clientX,lastY:e.clientY,
          cameraX:camera.x,cameraY:camera.y,
          moved:false,time:performance.now()
        };
      } else {
        touchGesture = null;
      }
    },{passive:false});

    canvasEl.addEventListener("pointermove", e => {
      if (e.pointerType === "mouse" || !pointers.has(e.pointerId)) return;
      e.preventDefault();
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (!touchGesture || pointers.size !== 1 || touchGesture.id !== e.pointerId || dialogueActive) return;
      const dx = e.clientX - touchGesture.startX;
      const dy = e.clientY - touchGesture.startY;
      if (Math.hypot(dx,dy) > 8) touchGesture.moved = true;
      if (touchGesture.moved) {
        camera.x = touchGesture.cameraX + dx;
        camera.y = touchGesture.cameraY - dy;
      }
      touchGesture.lastX=e.clientX;touchGesture.lastY=e.clientY;
    },{passive:false});

    const finishPointer = e => {
      if (e.pointerType === "mouse" || !pointers.has(e.pointerId)) return;
      e.preventDefault();
      const gesture = touchGesture;
      pointers.delete(e.pointerId);
      if (gesture && gesture.id === e.pointerId && !gesture.moved && performance.now()-gesture.time < 650 && !dialogueActive && !battleEnded) {
        const rect = canvasEl.getBoundingClientRect();
        const tile = screenToTile(e.clientX-rect.left,e.clientY-rect.top);
        playerClick(tile);
      }
      if (pointers.size === 0) touchGesture = null;
    };
    canvasEl.addEventListener("pointerup",finishPointer,{passive:false});
    canvasEl.addEventListener("pointercancel",finishPointer,{passive:false});
  }

  addEventListener("resize",()=>{applyViewport();updateHint();});
  addEventListener("orientationchange",()=>setTimeout(()=>{applyViewport();updateHint();},120));
  vv?.addEventListener("resize",()=>{applyViewport();});
  coarse.addEventListener?.("change",()=>{applyViewport();updateHint();});
  narrow.addEventListener?.("change",()=>{applyViewport();});

  applyViewport();
  updateHint();
  syncBar();
})();
