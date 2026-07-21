(() => {
  "use strict";

  const scenes = [...document.querySelectorAll("[data-scene]")];
  const story = document.querySelector("#story");
  const stage = document.querySelector("#stage");
  const chapterNav = document.querySelector("#chapterNav");
  const chapterIndex = document.querySelector("#chapterIndex");
  const chapterTotal = document.querySelector("#chapterTotal");
  const chapterName = document.querySelector("#chapterName");
  const transitionFocus = document.querySelector("#transitionFocus");
  const transitionGate = document.querySelector("#transitionGate");
  const playbackToggle = document.querySelector("#playbackToggle");
  const speedControl = document.querySelector("#speedControl");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!story || !stage || scenes.length === 0) return;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;
  const smoothstep = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const easeOutExpo = (value) => {
    const t = clamp(value);
    return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
  };
  const easeOutQuart = (value) => 1 - (1 - clamp(value)) ** 4;
  const easeOutBack = (value) => {
    const t = clamp(value) - 1;
    return 1 + 2.35 * t ** 3 + 1.35 * t ** 2;
  };

  const chapterTitles = scenes.map((scene) => scene.dataset.title || "未命名章节");
  const dots = scenes.map((scene, index) => {
    const button = document.createElement("button");
    const label = scene.dataset.nav || chapterTitles[index];
    button.type = "button";
    button.className = "chapter-dot";
    button.dataset.go = String(index);
    button.dataset.label = label;
    button.setAttribute("aria-label", `前往${label}`);
    button.addEventListener("click", () => goToChapter(index));
    chapterNav?.append(button);
    return button;
  });

  const gateTransitions = new Set([0, 17]);

  let targetProgress = 0;
  let renderedProgress = 0;
  let currentChapter = -1;
  let renderFrame = 0;
  let renderQueued = false;
  let autoplaying = false;
  let autoplayFrame = 0;
  let lastAutoplayTime = 0;
  let playbackSpeed = Number(speedControl?.value || 1);
  const secondsPerScene = 7.6;

  function getStoryMetrics() {
    const storyTop = window.scrollY + story.getBoundingClientRect().top;
    const available = Math.max(1, story.offsetHeight - window.innerHeight);
    return { storyTop, available };
  }

  function getStoryProgress() {
    const { storyTop, available } = getStoryMetrics();
    return clamp((window.scrollY - storyTop) / available);
  }

  function entranceProgress(position, index) {
    if (reducedMotion.matches) return 1;
    if (index === 0) return easeOutExpo(clamp((position + 0.04) / 0.24));
    return easeOutExpo((position - (index - 0.28)) / 0.48);
  }

  function applyEntrance(scene, progress, sceneIndex) {
    const elements = [...scene.querySelectorAll(":scope [data-enter]")];

    elements.forEach((element, elementIndex) => {
      const delay = Math.min(elementIndex * 0.055, 0.25);
      const normalized = clamp((progress - delay) / Math.max(0.001, 1 - delay));
      const eased = elementIndex % 3 === 0
        ? easeOutQuart(normalized)
        : elementIndex % 3 === 1
          ? easeOutBack(normalized)
          : easeOutExpo(normalized);
      const visibleEased = clamp(eased);
      const direction = (sceneIndex * 2 + elementIndex) % 4;
      const x = direction === 1 ? -54 * (1 - eased) : direction === 3 ? 48 * (1 - eased) : 0;
      const y = direction === 0 ? 38 * (1 - eased) : direction === 2 ? -26 * (1 - eased) : 0;
      const scale = 0.945 + eased * 0.055;
      const blur = reducedMotion.matches ? 0 : (1 - visibleEased) * 10;

      element.style.opacity = String(clamp(normalized * 1.15));
      element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      element.style.filter = `blur(${blur}px)`;
    });
  }

  function applyDiagramMotion(scene, progress, sceneIndex) {
    const phase = clamp(progress);
    const wave = Math.sin(phase * Math.PI * 2);
    const slowWave = Math.sin(phase * Math.PI);

    scene.querySelectorAll(".motion-draw").forEach((element, index) => {
      const delayed = clamp((phase - index * 0.025) / Math.max(0.2, 1 - index * 0.025));
      element.style.strokeDashoffset = String(1 - easeOutQuart(delayed));
    });

    scene.querySelectorAll(".motion-flow").forEach((element, index) => {
      element.style.strokeDashoffset = String(-(phase * (0.65 + index * 0.08)));
    });

    scene.querySelectorAll(".motion-spin").forEach((element, index) => {
      const reverse = element.classList.contains("reverse-spin") ? -1 : 1;
      const slow = element.classList.contains("slow-spin") ? 0.34 : 1;
      element.style.transform = `rotate(${reverse * slow * phase * (42 + index * 13)}deg)`;
    });

    scene.querySelectorAll(".motion-sway").forEach((element, index) => {
      const angle = wave * (4.2 + index * 0.7);
      const shift = slowWave * (index % 2 === 0 ? 8 : -8);
      element.style.transform = `translate3d(${shift}px, 0, 0) rotate(${angle}deg)`;
    });

    scene.querySelectorAll(".motion-slide").forEach((element, index) => {
      const direction = (sceneIndex + index) % 2 === 0 ? 1 : -1;
      element.style.transform = `translate3d(${direction * lerp(-14, 18, phase)}px, ${wave * 2}px, 0)`;
    });

    scene.querySelectorAll(".motion-pulse").forEach((element, index) => {
      const pulse = 0.96 + slowWave * (0.045 + index * 0.005);
      element.style.transform = `scale(${pulse})`;
    });

    scene.querySelectorAll(".motion-rise").forEach((element, index) => {
      const distance = 42 + index * 9;
      element.style.transform = `translate3d(0, ${(1 - easeOutQuart(phase)) * distance}px, 0)`;
    });

    scene.querySelectorAll(".motion-fall").forEach((element) => {
      element.style.transform = `rotate(${smoothstep(phase) * 72}deg)`;
    });
  }

  function applyTransition(position) {
    const baseIndex = Math.min(scenes.length - 2, Math.floor(position));
    const local = position - baseIndex;
    const progress = clamp((local - 0.72) / 0.28);
    const pulse = Math.sin(progress * Math.PI);
    const isGateTransition = gateTransitions.has(baseIndex);

    if (transitionFocus) {
      transitionFocus.style.opacity = String(isGateTransition ? 0 : pulse * 0.15);
      transitionFocus.style.filter = `blur(${10 + pulse * 18}px)`;
    }

    if (!transitionGate) return;

    if (isGateTransition && progress > 0 && progress < 1) {
      transitionGate.style.opacity = "0.98";
      if (progress <= 0.5) {
        const cover = smoothstep(progress * 2) * 100;
        transitionGate.style.clipPath = `inset(0 ${100 - cover}% 0 0)`;
      } else {
        const uncover = smoothstep((progress - 0.5) * 2) * 100;
        transitionGate.style.clipPath = `inset(0 0 0 ${uncover}%)`;
      }
    } else {
      transitionGate.style.opacity = "0";
      transitionGate.style.clipPath = "inset(0 100% 0 0)";
    }
  }

  function setChapter(index) {
    if (index === currentChapter) return;
    currentChapter = index;

    if (chapterIndex) chapterIndex.textContent = String(index).padStart(2, "0");
    if (chapterName) chapterName.textContent = chapterTitles[index];

    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-current", active ? "step" : "false");
    });

    scenes.forEach((scene, sceneIndex) => {
      const active = sceneIndex === index;
      scene.classList.toggle("is-active", active);
      scene.setAttribute("aria-hidden", String(!active));
      if ("inert" in scene) scene.inert = !active;
    });
  }

  function render(progress) {
    const position = progress * (scenes.length - 1);
    const baseIndex = Math.min(scenes.length - 2, Math.floor(position));
    const local = position - baseIndex;
    const transitionProgress = smoothstep((local - 0.72) / 0.28);
    const activeIndex = local < 0.86 ? baseIndex : baseIndex + 1;

    document.documentElement.style.setProperty("--global-progress", progress.toFixed(5));
    stage.style.setProperty("--story-position", position.toFixed(4));

    scenes.forEach((scene, index) => {
      let opacity = 0;
      let x = 0;
      let scale = 1;
      let blur = 0;

      if (index === baseIndex) {
        opacity = 1 - transitionProgress;
        x = -34 * transitionProgress;
        scale = 1 + 0.028 * transitionProgress;
        blur = reducedMotion.matches ? 0 : 7 * transitionProgress;
      } else if (index === baseIndex + 1) {
        opacity = transitionProgress;
        x = 46 * (1 - transitionProgress);
        scale = 0.978 + 0.022 * transitionProgress;
        blur = reducedMotion.matches ? 0 : 9 * (1 - transitionProgress);
      }

      if (index === 0 && progress <= 0.00001) opacity = 1;
      if (index === scenes.length - 1 && progress >= 0.99999) opacity = 1;

      scene.style.opacity = String(clamp(opacity));
      scene.style.transform = `translate3d(${x}px, 0, 0) scale(${scale})`;
      scene.style.filter = `blur(${blur}px)`;
      scene.style.zIndex = String(index === baseIndex + 1 ? 3 : index === baseIndex ? 2 : 1);

      const enter = entranceProgress(position, index);
      applyEntrance(scene, enter, index);
      const diagramProgress = clamp((position - (index - 0.3)) / 1.1);
      applyDiagramMotion(scene, diagramProgress, index);
    });

    setChapter(activeIndex);
    applyTransition(position);
  }

  function drawFrame() {
    const smoothing = reducedMotion.matches ? 1 : 0.2;
    renderedProgress = lerp(renderedProgress, targetProgress, smoothing);
    if (Math.abs(targetProgress - renderedProgress) < 0.00008) renderedProgress = targetProgress;
    render(renderedProgress);

    if (renderedProgress !== targetProgress) {
      renderFrame = requestAnimationFrame(drawFrame);
    } else {
      renderQueued = false;
    }
  }

  function requestRender() {
    targetProgress = getStoryProgress();
    if (!renderQueued) {
      renderQueued = true;
      cancelAnimationFrame(renderFrame);
      renderFrame = requestAnimationFrame(drawFrame);
    }
  }

  function goToChapter(index, behavior = reducedMotion.matches ? "auto" : "smooth") {
    const safeIndex = Math.round(clamp(index, 0, scenes.length - 1));
    const { storyTop, available } = getStoryMetrics();
    const target = storyTop + available * (safeIndex / (scenes.length - 1));
    window.scrollTo({ top: target, behavior });
  }

  function setPlaybackState(playing) {
    autoplaying = Boolean(playing);
    playbackToggle?.classList.toggle("is-playing", autoplaying);
    playbackToggle?.setAttribute("aria-pressed", String(autoplaying));
    playbackToggle?.setAttribute("aria-label", autoplaying ? "暂停自动播放" : "开始自动播放");
    lastAutoplayTime = 0;
    cancelAnimationFrame(autoplayFrame);

    if (autoplaying) {
      if (getStoryProgress() >= 0.999) goToChapter(0, "auto");
      autoplayFrame = requestAnimationFrame(runAutoplay);
    }
  }

  function runAutoplay(timestamp) {
    if (!autoplaying) return;
    if (!lastAutoplayTime) lastAutoplayTime = timestamp;
    const deltaSeconds = Math.min(0.05, (timestamp - lastAutoplayTime) / 1000);
    lastAutoplayTime = timestamp;

    const { storyTop, available } = getStoryMetrics();
    const current = clamp((window.scrollY - storyTop) / available);
    const duration = secondsPerScene * (scenes.length - 1);
    const next = clamp(current + (deltaSeconds * playbackSpeed) / duration);

    window.scrollTo(0, storyTop + available * next);
    if (next >= 1) {
      setPlaybackState(false);
      return;
    }
    autoplayFrame = requestAnimationFrame(runAutoplay);
  }

  playbackToggle?.addEventListener("click", () => setPlaybackState(!autoplaying));

  speedControl?.addEventListener("change", () => {
    playbackSpeed = Number(speedControl.value || 1);
    lastAutoplayTime = 0;
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (["ArrowDown", "PageDown", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      goToChapter(currentChapter + 1);
    } else if (["ArrowUp", "PageUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      goToChapter(currentChapter - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goToChapter(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goToChapter(scenes.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      setPlaybackState(!autoplaying);
    }
  });

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", requestRender);
  document.addEventListener("visibilitychange", () => {
    lastAutoplayTime = 0;
  });
  window.addEventListener("pagehide", () => setPlaybackState(false));
  reducedMotion.addEventListener?.("change", requestRender);

  if (chapterTotal) chapterTotal.textContent = String(scenes.length - 1).padStart(2, "0");
  targetProgress = getStoryProgress();
  renderedProgress = targetProgress;
  render(renderedProgress);
})();
