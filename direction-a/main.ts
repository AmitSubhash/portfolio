import { EditorialBrain } from "./brain";

// ---------------------------------------------------------------------------
// Background: dense EEG spike traces
// ---------------------------------------------------------------------------

function initSpikeBg(): void {
  const canvas = document.getElementById("spike-bg") as HTMLCanvasElement | null;
  if (!canvas) return;

  const ctx = canvas.getContext("2d")!;
  const dpr = devicePixelRatio;
  const CHANNEL_GAP = 4;
  const SCROLL_SPEED = 60;

  let numChannels = 0;
  let channelOffsets: number[] = [];
  let bufferLen = 0;
  let channels: Float32Array[] = [];

  function resize(): void {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    numChannels = Math.floor(window.innerHeight / CHANNEL_GAP);
    channelOffsets = [];
    for (let i = 0; i < numChannels; i++) channelOffsets.push((i + 0.5) * CHANNEL_GAP);
    bufferLen = Math.ceil(window.innerWidth) + 100;
    channels = [];
    for (let i = 0; i < numChannels; i++) channels.push(new Float32Array(bufferLen));
  }
  resize();
  window.addEventListener("resize", resize);

  let seed = 42;
  function rand(): number { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  function genSample(ch: number, _t: number): number {
    let v = (rand() - 0.5) * 0.06;
    v += Math.sin(_t * 0.002 + ch * 0.37) * 0.03;
    if (rand() < 0.015) v += (rand() > 0.5 ? 1 : -1) * (0.4 + rand() * 0.6);
    if (rand() < 0.04) v += (rand() - 0.5) * 0.15;
    return v;
  }

  let offset = 0;
  let lastTime = performance.now();

  function draw(now: number): void {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    offset += SCROLL_SPEED * dt;
    const w = window.innerWidth;
    ctx.clearRect(0, 0, w, window.innerHeight);
    const newSamples = Math.max(1, Math.ceil(SCROLL_SPEED * dt));

    for (let bs = 0; bs < numChannels; bs += 20) {
      const be = Math.min(bs + 20, numChannels);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(74, 124, 111, 0.30)";
      ctx.lineWidth = 0.5;
      for (let ch = bs; ch < be; ch++) {
        const buf = channels[ch]!;
        const baseY = channelOffsets[ch]!;
        const amp = CHANNEL_GAP * 0.8;
        buf.copyWithin(0, newSamples);
        for (let i = buf.length - newSamples; i < buf.length; i++) buf[i] = genSample(ch, offset + i);
        const si = Math.max(0, buf.length - w);
        ctx.moveTo(0, baseY - buf[si]! * amp);
        for (let i = si + 1; i < buf.length; i++) ctx.lineTo(i - si, baseY - buf[i]! * amp);
      }
      ctx.stroke();
    }

    // Spike dots on right edge
    for (let ch = 0; ch < numChannels; ch++) {
      const buf = channels[ch]!;
      const absVal = Math.abs(buf[buf.length - 1]!);
      if (absVal > 0.25) {
        const dotY = channelOffsets[ch]! - buf[buf.length - 1]! * CHANNEL_GAP * 0.8;
        const brightness = Math.min(1, absVal * 1.5);
        ctx.beginPath();
        ctx.arc(w - 2, dotY, 1 + brightness * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74, 124, 111, ${(brightness * 0.8).toFixed(2)})`;
        ctx.fill();
      }
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// ---------------------------------------------------------------------------
// Binaural beats -- ambient theta wave (6Hz)
// ---------------------------------------------------------------------------

function initBinauralBeats(): void {
  let started = false;
  let ctx: AudioContext | null = null;
  let gainNode: GainNode | null = null;

  function startAudio(): void {
    if (started) return;
    started = true;

    ctx = new AudioContext();

    // Two oscillators, slightly different frequencies = binaural beat
    // 174Hz base (solfeggio frequency, grounding) + 6Hz theta offset
    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    oscL.type = "sine";
    oscR.type = "sine";
    oscL.frequency.value = 174;
    oscR.frequency.value = 180; // 6Hz difference = theta wave

    // Pan left/right
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -1;
    panR.pan.value = 1;

    // Very quiet
    gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    gainNode.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 3); // fade in over 3s

    oscL.connect(panL).connect(gainNode).connect(ctx.destination);
    oscR.connect(panR).connect(gainNode);

    oscL.start();
    oscR.start();

    // Add a very subtle second layer: higher frequency drone
    const oscH = ctx.createOscillator();
    oscH.type = "sine";
    oscH.frequency.value = 396; // another solfeggio
    const gainH = ctx.createGain();
    gainH.gain.value = 0;
    gainH.gain.linearRampToValueAtTime(0.008, ctx.currentTime + 5);
    oscH.connect(gainH).connect(ctx.destination);
    oscH.start();
  }

  // Start on first interaction (required by browser autoplay policy)
  const trigger = (): void => {
    startAudio();
    document.removeEventListener("click", trigger);
    document.removeEventListener("mousemove", trigger);
    document.removeEventListener("touchstart", trigger);
  };
  document.addEventListener("click", trigger, { once: true });
  document.addEventListener("mousemove", trigger, { once: true });
  document.addEventListener("touchstart", trigger, { once: true });
}

// ---------------------------------------------------------------------------
// Editorial brain
// ---------------------------------------------------------------------------

let currentBrain: EditorialBrain | null = null;

function initEditorial(): void {
  const container = document.getElementById("editorial-container");
  if (!container) return;

  const isMobile = window.matchMedia("(max-width: 768px)").matches || "ontouchstart" in window;

  container.style.width = window.innerWidth + "px";
  container.style.height = window.innerHeight + "px";

  if (currentBrain) currentBrain.stop();
  container.innerHTML = "";

  currentBrain = new EditorialBrain(container, isMobile);
  currentBrain.start();
}

// Responsive: rebuild on resize (debounced)
let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(initEditorial, 200);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initEditorial();
  initBinauralBeats();
});
