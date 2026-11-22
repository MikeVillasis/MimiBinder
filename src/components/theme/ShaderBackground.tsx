"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/lib/themes";
import { SHADERS, type ShaderDef } from "./shaders";

/**
 * Full-viewport WebGL background for themes that define a shader (see ./shaders).
 * Renders nothing for other themes, and falls back to the CSS background when WebGL is
 * unavailable or the shader fails to compile.
 */
export function ShaderBackground() {
  const theme = useTheme();
  const def = theme.shader ? SHADERS[theme.id] : undefined;
  if (!def) return null;
  // key: a fresh canvas + GL context per theme, so switching themes tears everything down cleanly.
  return <ShaderCanvas key={theme.id} def={def} />;
}

/** Set on <html> once the shader has drawn a frame; lets the body's CSS background step aside. */
const ACTIVE_ATTR = "data-shader-bg";
const STYLE = `html[${ACTIVE_ATTR}] body{background:transparent}`;

const VERTEX = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}`;

let warned = false;
function devWarn(msg: string, detail?: unknown) {
  if (process.env.NODE_ENV !== "production" && !warned) {
    warned = true;
    console.warn(`[ShaderBackground] ${msg}`, detail ?? "");
  }
}

interface GLState {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  shaders: WebGLShader[];
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uPx: WebGLUniformLocation | null;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    devWarn("shader compile failed", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function setup(gl: WebGLRenderingContext, def: ShaderDef): GLState | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, def.fragment);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const cleanup = () => {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
  };
  if (!vs || !fs || !program || !buffer) {
    cleanup();
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "a_pos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    if (!gl.isContextLost()) devWarn("program link failed", gl.getProgramInfoLog(program));
    cleanup();
    return null;
  }
  gl.useProgram(program);
  // One oversized triangle covers the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  for (const [name, value] of Object.entries(def.uniforms)) {
    gl.uniform1f(gl.getUniformLocation(program, name), value);
  }
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  return {
    program,
    buffer,
    shaders: [vs, fs],
    uRes: gl.getUniformLocation(program, "u_res"),
    uTime: gl.getUniformLocation(program, "u_time"),
    uPx: gl.getUniformLocation(program, "u_px"),
  };
}

function ShaderCanvas({ def }: { def: ShaderDef }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const root = document.documentElement;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
      });
    } catch {
      gl = null;
    }
    if (!gl) {
      devWarn("WebGL unavailable; using the CSS background");
      canvas.style.display = "none";
      return;
    }
    const ctx = gl;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let state: GLState | null = setup(ctx, def);
    let raf = 0;
    let elapsed = 0; // seconds of animation actually shown (does not jump after the tab was hidden)
    let lastTs = 0;
    let lastDraw = 0;
    let pxRatio = 1;
    const frameMs = 1000 / def.fps;

    const fail = () => {
      canvas.style.display = "none";
      root.removeAttribute(ACTIVE_ATTR);
    };
    if (!state) {
      fail();
      return;
    }

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      let dpr = Math.min(window.devicePixelRatio || 1, def.maxDpr);
      if (w * h * dpr * dpr > def.maxPixels) dpr = Math.sqrt(def.maxPixels / (w * h));
      const bw = Math.max(1, Math.round(w * dpr));
      const bh = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      pxRatio = bw / w;
    };

    const draw = (time: number) => {
      if (!state || ctx.isContextLost()) return;
      ctx.viewport(0, 0, canvas.width, canvas.height);
      ctx.uniform2f(state.uRes, canvas.width, canvas.height);
      ctx.uniform1f(state.uTime, time % def.loopSeconds);
      ctx.uniform1f(state.uPx, pxRatio);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
      if (!root.hasAttribute(ACTIVE_ATTR)) {
        root.setAttribute(ACTIVE_ATTR, "");
        canvas.style.opacity = "1";
      }
    };

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const dt = lastTs ? Math.min(ts - lastTs, 100) : 0;
      lastTs = ts;
      elapsed += dt / 1000;
      if (ts - lastDraw < frameMs - 2) return;
      lastDraw = ts;
      draw(elapsed);
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTs = 0;
    };

    const start = () => {
      stop();
      if (!state || ctx.isContextLost()) return;
      if (motion.matches) {
        draw(def.staticTime); // a single still frame
        return;
      }
      if (document.hidden) return;
      if (!elapsed) elapsed = def.staticTime;
      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => {
      resize();
      // Redraw immediately so a resized canvas never shows a stale/cleared buffer.
      draw(motion.matches ? def.staticTime : elapsed || def.staticTime);
    });
    ro.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    const onLost = (e: Event) => {
      e.preventDefault(); // allows the browser to restore the context
      stop();
      state = null;
      canvas.style.opacity = "0";
      root.removeAttribute(ACTIVE_ATTR); // CSS background covers us while lost
    };
    const onRestored = () => {
      state = setup(ctx, def);
      if (!state) return fail();
      resize();
      start();
    };

    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", start);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    resize();
    start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", start);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      root.removeAttribute(ACTIVE_ATTR);
      if (state && !ctx.isContextLost()) {
        for (const s of state.shaders) {
          ctx.detachShader(state.program, s);
          ctx.deleteShader(s);
        }
        ctx.deleteProgram(state.program);
        ctx.deleteBuffer(state.buffer);
      }
      state = null;
    };
  }, [def]);

  return (
    <>
      <style>{STYLE}</style>
      <canvas
        ref={ref}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          // lvh: sized for the largest viewport so mobile toolbar show/hide never resizes the canvas.
          height: "100lvh",
          zIndex: -1,
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 600ms ease",
          display: "block",
        }}
      />
    </>
  );
}
