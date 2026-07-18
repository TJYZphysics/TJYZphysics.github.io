(() => {
  "use strict";

  const scenes = [...document.querySelectorAll("[data-scene]")];
  const beats = [...document.querySelectorAll("[data-beat]")];
  const dots = [...document.querySelectorAll("[data-go]")];
  const story = document.querySelector("#story");
  const stage = document.querySelector("#stage");
  const chapterIndex = document.querySelector("#chapterIndex");
  const chapterTotal = document.querySelector("#chapterTotal");
  const chapterName = document.querySelector("#chapterName");
  const transitionFocus = document.querySelector("#transitionFocus");
  const transitionGate = document.querySelector("#transitionGate");
  const playbackToggle = document.querySelector("#playbackToggle");
  const speedControl = document.querySelector("#speedControl");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const chapterNames = [
    "序章",
    "竞赛简介",
    "竞赛对比",
    "开放问题",
    "团队合作",
    "起步阶段",
    "研究日历",
    "研究方法",
    "Physics Fight",
    "正方展示",
    "正方准备",
    "正方小结",
    "反方理论质疑",
    "反方实验质疑",
    "评论方",
    "良性讨论",
    "评分重点",
    "国际舞台",
    "成长旅程",
    "尾声",
  ];

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const smooth = (value) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const easeOutExpo = (value) => (value >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(value)));
  const easeOutQuart = (value) => 1 - Math.pow(1 - clamp(value), 4);
  const easeOutBack = (value) => {
    const t = clamp(value) - 1;
    return 1 + 2.4 * t * t * t + 1.4 * t * t;
  };

  let targetProgress = 0;
  let renderedProgress = 0;
  let currentChapter = -1;
  let ticking = false;
  let autoplaying = false;
  let autoplayFrame = 0;
  let lastAutoplayTime = 0;
  let playbackSpeed = Number(speedControl?.value || 1);
  const secondsPerScene = 1.8333333333;

  function getStoryProgress() {
    const rect = story.getBoundingClientRect();
    const available = Math.max(1, story.offsetHeight - window.innerHeight);
    return clamp(-rect.top / available);
  }

  function entranceProgress(position, index) {
    if (reducedMotion.matches) return 1;
    if (index === 0) return easeOutExpo(clamp(0.14 + position / 0.18));
    return easeOutExpo((position - (index - 0.28)) / 0.28);
  }

  function applyEntrance(scene, progress, index) {
    const elements = [...scene.querySelectorAll("[data-enter]")];

    elements.forEach((element, elementIndex) => {
      const delay = Math.min(elementIndex * 0.065, 0.28);
      const normalized = clamp((progress - delay) / Math.max(0.001, 1 - delay));
      const eased = elementIndex % 3 === 0
        ? easeOutQuart(normalized)
        : elementIndex % 3 === 1
          ? easeOutBack(normalized)
          : easeOutExpo(normalized);

      const direction = (index + elementIndex) % 4;
      const x = direction === 1 ? -52 * (1 - eased) : direction === 3 ? 52 * (1 - eased) : 0;
      const y = direction === 0 ? 44 * (1 - eased) : direction === 2 ? -30 * (1 - eased) : 0;
      const scale = 0.93 + eased * 0.07;
      const blur = (1 - eased) * 11;

      element.style.opacity = String(clamp(normalized * 1.18));
      element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      element.style.filter = `blur(${blur}px)`;
    });
  }

  function applyAmbient(position) {
    const heroPhase = clamp(position, 0, 1);
    const pendulum = document.querySelector(".pendulum");
    const wave = document.querySelector(".wave-path");
    const pulse = document.querySelector(".data-pulse");
    const problemField = document.querySelector(".problem-field");
    const ringProgress = document.querySelector(".ring-progress");
    const dropRig = document.querySelector(".drop-rig");
    const fightOrbit = document.querySelector(".fight-orbit");
    const fightCenter = document.querySelector(".fight-center");
    const globe = document.querySelector(".world-globe svg");
    const routes = [...document.querySelectorAll(".globe-route")];
    const growthRows = [...document.querySelectorAll(".growth-row")];
    const outroOrbit = document.querySelector(".outro-orbit");

    if (pendulum) {
      const angle = lerp(-14, 18, smooth(heroPhase));
      pendulum.style.transformOrigin = "350px 110px";
      pendulum.style.transform = `rotate(${angle}deg)`;
    }
    if (wave) wave.style.strokeDashoffset = String(-position * 120);
    if (pulse) pulse.style.transform = `translateX(${Math.sin(position * Math.PI * 2) * 32}px) scale(${0.8 + Math.sin(position * Math.PI * 4) * 0.16})`;

    if (problemField) {
      const phase = clamp(position - 0.72, 0, 1.2);
      problemField.style.translate = `${Math.sin(phase * 2.2) * 10}px ${phase * -8}px`;
    }

    if (ringProgress) {
      ringProgress.style.strokeDashoffset = String(-position * 85);
      ringProgress.style.transformOrigin = "380px 380px";
      ringProgress.style.transform = `rotate(${position * 14}deg)`;
    }
    if (dropRig) dropRig.style.transform = `translateY(${Math.sin(position * 3) * 6}px)`;

    if (fightOrbit) fightOrbit.style.rotate = `${Math.sin(position * 1.9) * 1.7}deg`;
    if (fightCenter) fightCenter.style.rotate = `${-8 + Math.sin(position * 2.4) * 4}deg`;

    if (globe) {
      globe.style.transformOrigin = "center";
      globe.style.transform = `rotate(${position * 4.5}deg) scale(${1 + Math.sin(position * 2) * 0.01})`;
    }
    routes.forEach((route, index) => {
      route.style.strokeDashoffset = String(-position * (56 + index * 22));
    });

    growthRows.forEach((row, index) => {
      const phase = clamp(position - 17.6 - index * 0.055, 0, 0.55) / 0.55;
      row.style.translate = `${easeOutExpo(phase) * (index % 2 ? -10 : 10)}px 0`;
    });

    if (outroOrbit) outroOrbit.style.transform = `rotate(${-22 + position * 5}deg)`;
  }

  function applyTransition(position) {
    const baseIndex = Math.min(scenes.length - 2, Math.floor(position));
    const local = position - baseIndex;
    const transition = clamp((local - 0.72) / 0.28);
    const pulse = Math.sin(transition * Math.PI);
    const isGateTransition = [2, 7, 11, 15, 18].includes(baseIndex);

    transitionFocus.style.opacity = String(isGateTransition ? 0 : pulse * 0.2);
    transitionFocus.style.filter = `blur(${12 + pulse * 18}px)`;

    if (isGateTransition && transition > 0 && transition < 1) {
      transitionGate.style.opacity = "0.96";
      if (transition <= 0.5) {
        const cover = smooth(transition * 2) * 100;
        transitionGate.style.clipPath = `inset(0 ${100 - cover}% 0 0)`;
      } else {
        const uncover = smooth((transition - 0.5) * 2) * 100;
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
    chapterIndex.textContent = String(index + 1).padStart(2, "0");
    chapterName.textContent = chapterNames[index];

    dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === index));
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
    const transitionStart = 0.72;
    const transitionProgress = smooth((local - transitionStart) / (1 - transitionStart));
    const activeIndex = local < 0.86 ? baseIndex : baseIndex + 1;

    scenes.forEach((scene, index) => {
      let opacity = 0;
      let translateX = 0;
      let scale = 1;
      let blur = 0;

      if (index === baseIndex) {
        opacity = 1 - transitionProgress;
        translateX = -36 * transitionProgress;
        scale = 1 + 0.035 * transitionProgress;
        blur = 8 * transitionProgress;
      } else if (index === baseIndex + 1) {
        opacity = transitionProgress;
        translateX = 48 * (1 - transitionProgress);
        scale = 0.975 + 0.025 * transitionProgress;
        blur = 10 * (1 - transitionProgress);
      } else if (position >= scenes.length - 1 && index === scenes.length - 1) {
        opacity = 1;
      }

      if (index === 0 && progress === 0) opacity = 1;

      scene.style.opacity = String(clamp(opacity));
      scene.style.transform = `translate3d(${translateX}px, 0, 0) scale(${scale})`;
      scene.style.filter = `blur(${blur}px)`;
      scene.style.zIndex = String(index === baseIndex + 1 ? 3 : 2);
      applyEntrance(scene, entranceProgress(position, index), index);
    });

    setChapter(activeIndex);
    applyTransition(position);
    applyAmbient(position);
  }

  function frame() {
    const smoothing = reducedMotion.matches ? 1 : 0.12;
    renderedProgress = lerp(renderedProgress, targetProgress, smoothing);
    if (Math.abs(targetProgress - renderedProgress) < 0.0001) renderedProgress = targetProgress;
    render(renderedProgress);

    if (renderedProgress !== targetProgress) {
      requestAnimationFrame(frame);
    } else {
      ticking = false;
    }
  }

  function requestRender() {
    targetProgress = getStoryProgress();
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  }

  function goToChapter(index) {
    const safeIndex = clamp(index, 0, scenes.length - 1);
    const storyTop = window.scrollY + story.getBoundingClientRect().top;
    const available = story.offsetHeight - window.innerHeight;
    const target = storyTop + available * (safeIndex / (scenes.length - 1));
    window.scrollTo({ top: target, behavior: reducedMotion.matches ? "auto" : "smooth" });
  }

  function setPlaybackState(playing) {
    autoplaying = playing;
    document.documentElement.style.scrollBehavior = playing ? "auto" : "";
    playbackToggle?.classList.toggle("is-playing", playing);
    playbackToggle?.setAttribute("aria-pressed", String(playing));
    playbackToggle?.setAttribute("aria-label", playing ? "暂停自动播放" : "开始自动播放");
    lastAutoplayTime = 0;

    if (playing) {
      cancelAnimationFrame(autoplayFrame);
      autoplayFrame = requestAnimationFrame(runAutoplay);
    } else {
      cancelAnimationFrame(autoplayFrame);
    }
  }

  function runAutoplay(timestamp) {
    if (!autoplaying) return;
    if (!lastAutoplayTime) lastAutoplayTime = timestamp;
    const deltaSeconds = Math.min(0.05, (timestamp - lastAutoplayTime) / 1000);
    lastAutoplayTime = timestamp;

    const storyTop = window.scrollY + story.getBoundingClientRect().top;
    const available = Math.max(1, story.offsetHeight - window.innerHeight);
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

  dots.forEach((dot) => {
    dot.addEventListener("click", () => goToChapter(Number(dot.dataset.go)));
  });

  playbackToggle?.addEventListener("click", () => setPlaybackState(!autoplaying));
  speedControl?.addEventListener("change", () => {
    playbackSpeed = Number(speedControl.value || 1);
    lastAutoplayTime = 0;
  });

  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (["ArrowDown", "PageDown", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      goToChapter(currentChapter + 1);
    }
    if (["ArrowUp", "PageUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      goToChapter(currentChapter - 1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      goToChapter(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      goToChapter(scenes.length - 1);
    }
  });

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", requestRender);
  document.addEventListener("visibilitychange", () => { lastAutoplayTime = 0; });
  reducedMotion.addEventListener?.("change", requestRender);

  beats.forEach((beat, index) => beat.dataset.chapterName = chapterNames[index]);
  if (chapterTotal) chapterTotal.textContent = String(scenes.length).padStart(2, "0");
  stage.dataset.ready = "true";
  targetProgress = getStoryProgress();
  renderedProgress = targetProgress;
  render(renderedProgress);
})();
