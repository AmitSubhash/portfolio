/**
 * Editorial Brain v11
 *
 * Text reflows around the tracer (Pretext obstacle) AND glows near it.
 * The tracer creates a moving bubble of space in the text while
 * illuminating surrounding lines. Center identity floats naturally.
 */

import {
  prepareWithSegments,
  layoutNextLine,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const BODY_TEXT = `I believe that every right implies a responsibility, every opportunity an obligation, every possession a duty. If you want to succeed you should strike out on new paths rather than travel the worn paths of accepted success. I build instruments for seeing inside the living brain. Not because it is easy but because what you cannot measure you cannot understand. The secret to success is to do the common thing uncommonly well. I chase photons through bone and tissue, simulate light scattering in neonatal skulls, and try always to see a little more clearly. Do not be afraid to give up the good to go for the great. The work demands patience. A photon is launched, scattered, absorbed, or lost. The inverse problem is ill-posed. The reconstruction converges slowly. But every iteration brings the image closer to truth. I do not think there is any other quality so essential to success of any kind as the quality of perseverance. It overcomes almost everything, even nature. I was not born with a silver spoon but I was born with something far better: an unshakeable will to work. Starting from scratch is a privilege not a punishment. Neuroengineering is not a discipline it is a conviction that computation can illuminate what the eye cannot reach. Near-infrared light enters the skull and what returns carries the signature of blood and thought. The man who starts simply to make money never makes much. Start with purpose. I came to build tools that give clinicians sight where before there was darkness. Every setback is a setup for a comeback. I always tried to turn every disaster into an opportunity. I have debugged code at three in the morning, rewritten pipelines that refused to converge, stared at loss curves that plateaued for days. The reward is the moment the hemodynamic map resolves and cortical activation appears where before there was only noise. Your future is created by what you do today not tomorrow. The most common way people give up their power is by thinking they do not have any. I believe in the compound interest of small daily effort. In the elegance of a well-written simulation. In the quiet satisfaction of a model that generalizes. Sow a thought, reap an action. Sow an action, reap a habit. Sow a habit, reap a character. Sow a character, reap a destiny. I believe in the dignity of labor whether with head or hand. That there is nothing in this world that is worth having or worth doing unless it means effort and difficulty. I study the physics of light in tissue. I train neural networks on synthetic brains. I run jobs on GPU clusters at dawn and read the logs before coffee. This is not ambition. This is devotion. Good fortune is what happens when opportunity meets with preparation. Building at the frontier of what light can reveal about the mind. I build for the infants who cannot hold still in a scanner. I build for the clinicians who need answers in real time. I build because the brain is the last frontier and I refuse to look away. The only question with wealth is what you do with it. The only question with knowledge is who you serve with it. Every success requires a sacrifice. I have made mine gladly.`;

// ---------------------------------------------------------------------------
// Brain outline
// ---------------------------------------------------------------------------

const BRAIN_POLYGON: [number, number][] = [
  [0.82, 0.42], [0.84, 0.37], [0.83, 0.32], [0.81, 0.27],
  [0.77, 0.22], [0.72, 0.17], [0.66, 0.13], [0.59, 0.10],
  [0.51, 0.09], [0.43, 0.09], [0.36, 0.11], [0.29, 0.14],
  [0.23, 0.18], [0.18, 0.23], [0.14, 0.29], [0.11, 0.36],
  [0.10, 0.43], [0.11, 0.49], [0.12, 0.53],
  [0.11, 0.57], [0.10, 0.62], [0.12, 0.67], [0.16, 0.71],
  [0.21, 0.74], [0.26, 0.75], [0.30, 0.73],
  [0.33, 0.71], [0.36, 0.75], [0.38, 0.81], [0.40, 0.85],
  [0.43, 0.87],
  [0.47, 0.84], [0.53, 0.79], [0.60, 0.73],
  [0.67, 0.66], [0.73, 0.59], [0.78, 0.52], [0.81, 0.46],
  [0.82, 0.42],
];

const INTERNAL_LINES: [number, number][][] = [
  [[0.28, 0.35], [0.35, 0.28], [0.45, 0.25], [0.55, 0.25], [0.65, 0.28], [0.73, 0.33], [0.77, 0.38]],
  [[0.30, 0.40], [0.38, 0.34], [0.48, 0.32], [0.58, 0.32], [0.68, 0.35], [0.74, 0.40]],
  [[0.20, 0.26], [0.30, 0.20], [0.42, 0.16], [0.55, 0.15], [0.67, 0.18], [0.76, 0.24]],
  [[0.38, 0.48], [0.39, 0.56], [0.40, 0.65], [0.41, 0.74], [0.42, 0.82]],
  [[0.14, 0.46], [0.22, 0.42], [0.30, 0.40], [0.36, 0.40]],
];

// ---------------------------------------------------------------------------
// Arc utils
// ---------------------------------------------------------------------------

function computeArcLengths(pts: [number, number][]): number[] {
  const lengths = [0];
  for (let i = 1; i <= pts.length; i++) {
    const prev = pts[i - 1]!, curr = pts[i % pts.length]!;
    const dx = curr[0] - prev[0], dy = curr[1] - prev[1];
    lengths.push(lengths[lengths.length - 1]! + Math.sqrt(dx * dx + dy * dy));
  }
  return lengths;
}

function pointAtArc(pts: [number, number][], arcs: number[], dist: number): [number, number] {
  const total = arcs[arcs.length - 1]!;
  const d = ((dist % total) + total) % total;
  let lo = 0, hi = arcs.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (arcs[mid]! < d) lo = mid; else hi = mid; }
  const f = arcs[hi]! - arcs[lo]! > 0 ? (d - arcs[lo]!) / (arcs[hi]! - arcs[lo]!) : 0;
  const p1 = pts[lo % pts.length]!, p2 = pts[hi % pts.length]!;
  return [p1[0] + (p2[0] - p1[0]) * f, p1[1] + (p2[1] - p1[1]) * f];
}

// ---------------------------------------------------------------------------
// Obstacle helpers
// ---------------------------------------------------------------------------

interface Interval { left: number; right: number; }

function circleInterval(cx: number, cy: number, r: number, bandTop: number, bandBot: number): Interval | null {
  if (cy + r < bandTop || cy - r > bandBot) return null;
  // Widest point of circle in this band
  const dEdge = Math.min(Math.abs(cy - bandTop), Math.abs(cy - bandBot));
  const dCenter = Math.abs(cy - (bandTop + bandBot) / 2);
  const d = (cy >= bandTop && cy <= bandBot) ? 0 : Math.min(dEdge);
  if (d >= r) return null;
  const hw = Math.sqrt(r * r - d * d);
  return { left: cx - hw, right: cx + hw };
}

/** Elliptical obstacle for the center block -- organic, not boxy */
function ellipseInterval(
  cx: number, cy: number, rx: number, ry: number,
  bandTop: number, bandBot: number
): Interval | null {
  // Ellipse: (x-cx)^2/rx^2 + (y-cy)^2/ry^2 = 1
  // For a horizontal band, find the x extent of the ellipse
  const bandMid = (bandTop + bandBot) / 2;
  const dy = bandMid - cy;
  if (Math.abs(dy) >= ry) return null;
  // Half-width at this y: rx * sqrt(1 - (dy/ry)^2)
  const hw = rx * Math.sqrt(1 - (dy * dy) / (ry * ry));
  return { left: cx - hw, right: cx + hw };
}

function carveSlots(left: number, right: number, blocked: Interval[]): Interval[] {
  if (!blocked.length) return [{ left, right }];
  const sorted = blocked.slice().sort((a, b) => a.left - b.left);
  const slots: Interval[] = [];
  let cursor = left;
  for (const b of sorted) {
    if (b.left > cursor) slots.push({ left: cursor, right: Math.min(b.left, right) });
    cursor = Math.max(cursor, b.right);
  }
  if (cursor < right) slots.push({ left: cursor, right });
  return slots.filter(s => s.right - s.left > 35);
}

// ---------------------------------------------------------------------------
// Line data
// ---------------------------------------------------------------------------

interface TextLine {
  x: number; y: number; width: number; text: string; el: HTMLSpanElement;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export class EditorialBrain {
  private container: HTMLElement;
  private stage: HTMLDivElement;
  private brainCanvas: HTMLCanvasElement;
  private brainCtx: CanvasRenderingContext2D;
  private textLines: TextLine[] = [];

  private preparedBody: PreparedTextWithSegments;
  private pageWidth: number;
  private pageHeight: number;

  private brainPixelPts: [number, number][] = [];
  private brainArcs: number[] = [];
  private brainTotal = 0;

  private animId = 0;
  private prevLineTexts: string[] = [];

  private centerX: number;
  private centerY: number;
  private centerW = 320;
  private centerH = 150;

  private readonly BODY_FONT = '17px "Iowan Old Style", Georgia, "Palatino Linotype", Palatino, serif';
  private readonly LINE_HEIGHT = 28;
  private readonly MARGIN = 40;
  private readonly TEXT_TOP = 28;
  private readonly OBSTACLE_R = 16;
  private readonly SPOTLIGHT_R = 160;
  private readonly CENTER_FADE_R = 220;
  private readonly CURSOR_COLOR: readonly [number, number, number] = [210, 195, 150];
  private readonly CURSOR_SPOTLIGHT_R = 140;
  private readonly TRACERS = [
    { speed: 45,  offset: 0,                    trailLen: 0.16, color: [196, 163, 90] as const,  name: "amber" },   // warm gold
    { speed: -30, offset: 0.45,                  trailLen: 0.20, color: [90, 160, 145] as const,  name: "teal" },    // cool teal
    { speed: 22,  offset: 0.72,                  trailLen: 0.14, color: [140, 160, 190] as const, name: "silver" },  // cool silver-blue
  ];

  private isMobile: boolean;
  private touchTimeout = 0;

  constructor(container: HTMLElement, mobile = false) {
    this.container = container;
    this.isMobile = mobile;
    this.pageWidth = container.clientWidth;
    this.pageHeight = container.clientHeight;

    this.centerX = (this.pageWidth - this.centerW) / 2;
    this.centerY = (this.pageHeight - this.centerH) / 2 - 15;

    const m = 40, bw = this.pageWidth - m * 2, bh = this.pageHeight - m * 2;
    this.brainPixelPts = BRAIN_POLYGON.map(([nx, ny]) => [m + nx * bw, m + ny * bh] as [number, number]);
    this.brainArcs = computeArcLengths(this.brainPixelPts);
    this.brainTotal = this.brainArcs[this.brainArcs.length - 1]!;

    this.stage = document.createElement("div");
    this.stage.className = "editorial-stage";
    this.stage.style.width = this.pageWidth + "px";
    this.stage.style.height = this.pageHeight + "px";
    container.appendChild(this.stage);

    // Brain canvas
    this.brainCanvas = document.createElement("canvas");
    this.brainCanvas.width = this.pageWidth * devicePixelRatio;
    this.brainCanvas.height = this.pageHeight * devicePixelRatio;
    this.brainCanvas.style.width = this.pageWidth + "px";
    this.brainCanvas.style.height = this.pageHeight + "px";
    this.brainCanvas.className = "brain-overlay";
    this.stage.appendChild(this.brainCanvas);
    this.brainCtx = this.brainCanvas.getContext("2d")!;
    this.brainCtx.scale(devicePixelRatio, devicePixelRatio);

    // Center identity -- no background, just text
    const center = document.createElement("div");
    center.className = "identity-block";
    center.style.left = this.centerX + "px";
    center.style.top = this.centerY + "px";
    center.style.width = this.centerW + "px";
    center.innerHTML = `
      <p class="id-tagline">building at the frontier of light and thought</p>
      <h1 class="id-name">Amit Subhash</h1>
      <p class="id-fields">Neuroengineering &middot; Optics &middot; ML</p>
      <p class="id-affiliation">Indiana University &middot; Incoming PhD</p>
      <nav class="id-links">
        <a href="https://github.com/amit-subhash">GitHub</a>
        <a href="https://scholar.google.com/">Scholar</a>
        <a href="mailto:atsubhas@iu.edu">Email</a>
      </nav>
    `;
    this.stage.appendChild(center);

    // Click name to reveal tagline
    const nameEl = center.querySelector(".id-name") as HTMLElement;
    const tagEl = center.querySelector(".id-tagline") as HTMLElement;
    if (nameEl && tagEl) {
      nameEl.style.cursor = "none";
      nameEl.addEventListener("click", () => {
        tagEl.classList.toggle("visible");
      });
    }

    // Repeat text enough to fill the page (roughly 3x should do)
    const repeatedText = BODY_TEXT + " " + BODY_TEXT + " " + BODY_TEXT;
    this.preparedBody = prepareWithSegments(repeatedText, this.BODY_FONT);

    // Mouse/touch tracking
    if (!this.isMobile) {
      this.stage.addEventListener("mousemove", (e: MouseEvent) => {
        const rect = this.container.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
      });
      this.stage.addEventListener("mouseleave", () => {
        this.mouseX = -9999;
        this.mouseY = -9999;
      });
    } else {
      // Mobile: tap to place temporary light
      this.stage.addEventListener("touchstart", (e: TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        const rect = this.container.getBoundingClientRect();
        this.mouseX = touch.clientX - rect.left;
        this.mouseY = touch.clientY - rect.top;
        // Fade out after 2s
        clearTimeout(this.touchTimeout);
        this.touchTimeout = window.setTimeout(() => {
          this.mouseX = -9999;
          this.mouseY = -9999;
        }, 2000);
      }, { passive: true });
      this.stage.addEventListener("touchmove", (e: TouchEvent) => {
        const touch = e.touches[0];
        if (!touch) return;
        const rect = this.container.getBoundingClientRect();
        this.mouseX = touch.clientX - rect.left;
        this.mouseY = touch.clientY - rect.top;
      }, { passive: true });
      this.stage.addEventListener("touchend", () => {
        clearTimeout(this.touchTimeout);
        this.touchTimeout = window.setTimeout(() => {
          this.mouseX = -9999;
          this.mouseY = -9999;
        }, 2000);
      });
    }
  }

  private mouseX = -9999;
  private mouseY = -9999;

  private getTracerPositions(t: number): { x: number; y: number; color: readonly [number, number, number] }[] {
    return this.TRACERS.map(tr => {
      const dist = t * tr.speed + tr.offset * this.brainTotal;
      const [x, y] = pointAtArc(this.brainPixelPts, this.brainArcs, dist);
      return { x, y, color: tr.color };
    });
  }

  // -----------------------------------------------------------------------
  // Layout text each frame (reflows around tracer + center block)
  // -----------------------------------------------------------------------

  private layoutText(tracers: { x: number; y: number }[]): void {
    const regionLeft = this.MARGIN;
    const regionRight = this.pageWidth - this.MARGIN;
    const lh = this.LINE_HEIGHT;
    let lineTop = this.TEXT_TOP;
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    const maxY = this.pageHeight - 20;
    let lineIdx = 0;

    while (lineTop + lh <= maxY) {
      const blocked: Interval[] = [];

      // Center block as elliptical obstacle (organic, not boxy)
      const ecx = this.centerX + this.centerW / 2;
      const ecy = this.centerY + this.centerH / 2;
      const erx = this.centerW / 2 + 10; // horizontal radius
      const ery = this.centerH / 2 + 8;  // vertical radius -- tight
      const ei = ellipseInterval(ecx, ecy, erx, ery, lineTop, lineTop + lh);
      if (ei) blocked.push(ei);

      // All tracer obstacles
      for (const tr of tracers) {
        const ci = circleInterval(tr.x, tr.y, this.OBSTACLE_R, lineTop, lineTop + lh);
        if (ci) blocked.push(ci);
      }

      const slots = carveSlots(regionLeft, regionRight, blocked);
      if (!slots.length) { lineTop += lh; continue; }

      for (const slot of slots) {
        const line = layoutNextLine(this.preparedBody, cursor, slot.right - slot.left);
        if (!line) break;

        const x = Math.round(slot.left);
        const y = Math.round(lineTop);

        if (lineIdx < this.textLines.length) {
          // Reuse existing element
          const tl = this.textLines[lineIdx]!;
          if (this.prevLineTexts[lineIdx] !== line.text) {
            tl.el.textContent = line.text;
          }
          tl.el.style.left = x + "px";
          tl.el.style.top = y + "px";
          tl.x = x; tl.y = y; tl.width = line.width; tl.text = line.text;
        } else {
          // Create new element
          const el = document.createElement("span");
          el.className = "ed-line";
          el.textContent = line.text;
          el.style.left = x + "px";
          el.style.top = y + "px";
          el.style.font = this.BODY_FONT;
          el.style.lineHeight = lh + "px";
          this.stage.appendChild(el);
          this.textLines.push({ x, y, width: line.width, text: line.text, el });
        }

        lineIdx++;
        cursor = line.end;
      }
      lineTop += lh;
    }

    // Remove excess lines
    while (this.textLines.length > lineIdx) {
      this.textLines.pop()!.el.remove();
    }

    this.prevLineTexts = this.textLines.map(l => l.text);
  }

  // -----------------------------------------------------------------------
  // Spotlight: CSS mask per line
  // -----------------------------------------------------------------------

  private updateSpotlight(tracers: { x: number; y: number; color: readonly [number, number, number]; radius?: number }[]): void {
    const defaultR = this.SPOTLIGHT_R;
    const lh = this.LINE_HEIGHT;

    for (const line of this.textLines) {
      const lx = line.x;
      const ly = line.y;
      const lineY = ly + lh / 2;

      let bestSmooth = 0;
      let bestMx = 0;
      let bestMy = 0;
      let blendR = 0, blendG = 0, blendB = 0, totalWeight = 0;

      for (const tr of tracers) {
        const R = tr.radius ?? defaultR;
        const clampedX = Math.max(lx, Math.min(lx + line.width, tr.x));
        const dx = tr.x - clampedX;
        const dy = tr.y - lineY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > R) continue;

        const factor = 1 - dist / R;
        const smooth = factor * factor;

        // Blend colors weighted by influence
        blendR += tr.color[0] * smooth;
        blendG += tr.color[1] * smooth;
        blendB += tr.color[2] * smooth;
        totalWeight += smooth;

        if (smooth > bestSmooth) {
          bestSmooth = smooth;
          bestMx = tr.x - lx;
          bestMy = tr.y - ly;
        }
      }

      // Fade text near the center identity block
      const ecx = this.centerX + this.centerW / 2;
      const ecy = this.centerY + this.centerH / 2;
      const lineCx = lx + line.width / 2;
      const lineCy = ly + lh / 2;
      const distToCenter = Math.sqrt((lineCx - ecx) ** 2 + (lineCy - ecy) ** 2);
      const fadeR = this.CENTER_FADE_R;
      if (distToCenter < fadeR) {
        const fadeFactor = distToCenter / fadeR; // 0 at center, 1 at edge
        const dampen = fadeFactor * fadeFactor; // quadratic -- aggressive fade near center
        bestSmooth *= dampen;
        totalWeight *= dampen;
        blendR *= dampen;
        blendG *= dampen;
        blendB *= dampen;
      }

      if (bestSmooth < 0.003) {
        line.el.style.opacity = "0.012";
        line.el.style.mask = "none";
        line.el.style.webkitMask = "none";
        line.el.style.color = "";
        line.el.style.fontWeight = "300";
        continue;
      }

      // Build composite mask from all tracers
      // Use the strongest one for the main mask shape, but layer multiple gradients
      const maskParts: string[] = [];
      for (const tr of tracers) {
        const trR = tr.radius ?? defaultR;
        const clampedX = Math.max(lx, Math.min(lx + line.width, tr.x));
        const dx = tr.x - clampedX;
        const dy = tr.y - lineY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > trR) continue;

        const factor = 1 - dist / trR;
        const smooth = factor * factor;
        const mx = tr.x - lx;
        const my = tr.y - ly;
        const mr = trR * 0.85;
        const peakAlpha = Math.min(1, smooth * 1.5 + 0.02);
        const edgeAlpha = Math.min(0.5, smooth * 0.5);
        maskParts.push(
          `radial-gradient(ellipse ${mr}px ${mr * 0.7}px at ${mx}px ${my}px, rgba(0,0,0,${peakAlpha.toFixed(3)}) 0%, rgba(0,0,0,${edgeAlpha.toFixed(3)}) 55%, transparent 100%)`
        );
      }

      // Composite masks -- CSS mask supports multiple layers with add
      // We use the mask-composite to combine them
      const maskStr = maskParts.join(", ");
      line.el.style.mask = maskStr;
      line.el.style.webkitMask = maskStr;
      if (maskParts.length > 1) {
        line.el.style.maskComposite = "add";
        (line.el.style as any).webkitMaskComposite = "source-over";
      } else {
        line.el.style.maskComposite = "";
        (line.el.style as any).webkitMaskComposite = "";
      }
      line.el.style.opacity = "1";

      // Blended color from all tracers
      if (totalWeight > 0) {
        const cr = Math.round(blendR / totalWeight);
        const cg = Math.round(blendG / totalWeight);
        const cb = Math.round(blendB / totalWeight);
        const cf = Math.min(1, bestSmooth * 1.3);
        const r = Math.round(cr + (240 - cr) * cf * 0.5);
        const g = Math.round(cg + (235 - cg) * cf * 0.5);
        const b = Math.round(cb + (230 - cb) * cf * 0.5);
        line.el.style.color = `rgb(${r}, ${g}, ${b})`;

        // Font weight: 300 (ghost) -> 500 (lit)
        const weight = Math.round(300 + bestSmooth * 200);
        line.el.style.fontWeight = String(weight);
      } else {
        line.el.style.fontWeight = "300";
      }
    }
  }

  // -----------------------------------------------------------------------
  // Draw brain + tracer
  // -----------------------------------------------------------------------

  private drawBrain(t: number): void {
    const ctx = this.brainCtx;
    ctx.clearRect(0, 0, this.pageWidth, this.pageHeight);
    const pts = this.brainPixelPts;

    // Outline with periodic pulse to reveal the full brain shape
    const pulseT = t * 0.125; // ~8s period
    const pulseRaw = Math.sin(pulseT * Math.PI * 2);
    const pulse = pulseRaw > 0 ? pulseRaw * pulseRaw : 0;
    const outlineAlpha = 0.04 + pulse * 0.20;

    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.closePath();
    ctx.strokeStyle = `rgba(74, 124, 111, ${outlineAlpha.toFixed(3)})`;
    ctx.lineWidth = 0.7 + pulse * 0.8;
    ctx.stroke();

    // Internals -- also pulse
    const intAlpha = 0.02 + pulse * 0.08;
    const m = 40, bw = this.pageWidth - m * 2, bh = this.pageHeight - m * 2;
    for (const line of INTERNAL_LINES) {
      ctx.beginPath();
      for (let i = 0; i < line.length; i++) {
        const px = m + line[i]![0] * bw, py = m + line[i]![1] * bh;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(74, 124, 111, ${intAlpha.toFixed(3)})`;
      ctx.lineWidth = 0.4 + pulse * 0.3;
      ctx.stroke();
    }

    // Draw each tracer
    for (const trDef of this.TRACERS) {
      const headDist = t * trDef.speed + trDef.offset * this.brainTotal;
      const trailLen = this.brainTotal * trDef.trailLen;
      const [cr, cg, cb] = trDef.color;
      const head = pointAtArc(pts, this.brainArcs, headDist);

      // Trail
      const segs = 45;
      for (let i = 0; i < segs; i++) {
        const frac = i / segs;
        const d1 = headDist - trailLen * (1 - frac);
        const d2 = headDist - trailLen * (1 - (i + 1) / segs);
        const p1 = pointAtArc(pts, this.brainArcs, d1);
        const p2 = pointAtArc(pts, this.brainArcs, d2);
        const ease = frac * frac * frac;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${(ease * 0.4).toFixed(3)})`;
        ctx.lineWidth = 0.4 + ease * 2;
        ctx.stroke();
      }

      // Outer glow
      const g3 = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 30);
      g3.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.10)`);
      g3.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = g3;
      ctx.beginPath(); ctx.arc(head[0], head[1], 30, 0, Math.PI * 2); ctx.fill();

      // Mid glow
      const g2 = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 12);
      g2.addColorStop(0, `rgba(${Math.min(255, cr + 40)}, ${Math.min(255, cg + 40)}, ${Math.min(255, cb + 40)}, 0.20)`);
      g2.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.06)`);
      g2.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(head[0], head[1], 12, 0, Math.PI * 2); ctx.fill();

      // Core dot
      ctx.beginPath(); ctx.arc(head[0], head[1], 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.min(255, cr + 60)}, ${Math.min(255, cg + 60)}, ${Math.min(255, cb + 60)}, 0.65)`;
      ctx.fill();

      // Bright center
      ctx.beginPath(); ctx.arc(head[0], head[1], 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.min(255, cr + 80)}, ${Math.min(255, cg + 80)}, ${Math.min(255, cb + 80)}, 0.85)`;
      ctx.fill();

      // Ambient spotlight
      const gs = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], this.SPOTLIGHT_R * 0.7);
      gs.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.04)`);
      gs.addColorStop(0.4, `rgba(${cr}, ${cg}, ${cb}, 0.015)`);
      gs.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = gs;
      ctx.beginPath(); ctx.arc(head[0], head[1], this.SPOTLIGHT_R * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  // -----------------------------------------------------------------------
  // Loop
  // -----------------------------------------------------------------------

  start(): void {
    const loop = (now: number): void => {
      const t = now / 1000;
      const tracers = this.getTracerPositions(t);
      const mouseActive = this.mouseX > 0 && this.mouseY > 0;

      // Cursor is a full tracer -- pushes text AND illuminates
      const obstacles = [...tracers];
      const allLights: { x: number; y: number; color: readonly [number, number, number]; radius?: number }[] = [...tracers];
      if (mouseActive) {
        obstacles.push({ x: this.mouseX, y: this.mouseY, color: this.CURSOR_COLOR });
        allLights.push({ x: this.mouseX, y: this.mouseY, color: this.CURSOR_COLOR, radius: this.CURSOR_SPOTLIGHT_R });
      }

      this.layoutText(obstacles);
      this.updateSpotlight(allLights);
      this.drawBrain(t);

      // Draw cursor tracer dot on canvas (same style as brain tracers)
      if (mouseActive) {
        const ctx = this.brainCtx;
        const [cr, cg, cb] = this.CURSOR_COLOR;

        // Outer glow
        const g3 = ctx.createRadialGradient(this.mouseX, this.mouseY, 0, this.mouseX, this.mouseY, 28);
        g3.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, 0.09)`);
        g3.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = g3;
        ctx.beginPath(); ctx.arc(this.mouseX, this.mouseY, 28, 0, Math.PI * 2); ctx.fill();

        // Mid glow
        const g2 = ctx.createRadialGradient(this.mouseX, this.mouseY, 0, this.mouseX, this.mouseY, 10);
        g2.addColorStop(0, `rgba(${cr + 30}, ${cg + 30}, ${cb + 30}, 0.18)`);
        g2.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, 0.05)`);
        g2.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(this.mouseX, this.mouseY, 10, 0, Math.PI * 2); ctx.fill();

        // Core dot
        ctx.beginPath(); ctx.arc(this.mouseX, this.mouseY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr + 40}, ${cg + 40}, ${cb + 40}, 0.6)`;
        ctx.fill();

        // Bright center
        ctx.beginPath(); ctx.arc(this.mouseX, this.mouseY, 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr + 60}, ${cg + 60}, ${cb + 60}, 0.8)`;
        ctx.fill();
      }

      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.animId);
    clearTimeout(this.touchTimeout);
  }
}
