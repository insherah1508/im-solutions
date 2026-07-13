(function () {
  'use strict';

  function init() {
    const canvas = document.getElementById('hero-canvas');
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false }) ||
               canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
    if (!gl) return;

    /* ── VERTEX SHADER ─────────────────────────────────── */
    const VERT = `
      attribute vec2 a_pos;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    /* ── FRAGMENT SHADER ───────────────────────────────── */
    /* Domain-warped fractal noise → flowing dark-luxury    */
    /* gold wisps on deep black                             */
    const FRAG = `
      precision mediump float;
      uniform float u_time;
      uniform vec2  u_res;

      /* Gradient noise helpers */
      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)),
                 dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
      }

      float gnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)),
              dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
          mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
              dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x),
          u.y
        );
      }

      /* Fractal brownian motion */
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 5; i++) {
          v += a * gnoise(p);
          p  = m * p;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        float t  = u_time * 0.09;

        /* Layer 1 — domain warp */
        vec2 q = vec2(
          fbm(uv * 2.2 + t),
          fbm(uv * 2.2 + vec2(5.2, 1.3) + t * 0.85)
        );

        /* Layer 2 — warp the warp */
        vec2 r = vec2(
          fbm(uv * 2.8 + 1.8 * q + vec2(1.7, 9.2) + t * 0.55),
          fbm(uv * 2.8 + 1.8 * q + vec2(8.3, 2.8) + t * 0.45)
        );

        /* Final noise value */
        float f = fbm(uv * 3.2 + 2.6 * r);
        f = f * 0.5 + 0.5;

        /* ── COLOUR PALETTE ─────────────────────────── */
        /* bg:    #08080F  (site dark)                   */
        /* warm:  deep amber glow                        */
        /* gold1: #C9A84C dim                            */
        /* gold2: #E8C96A bright                         */
        vec3 bg    = vec3(0.031, 0.031, 0.059);
        vec3 warm  = vec3(0.16,  0.065, 0.01 );
        vec3 gold1 = vec3(0.40,  0.31,  0.085);
        vec3 gold2 = vec3(0.91,  0.79,  0.42 );

        vec3 col = bg;
        col = mix(col, warm,  smoothstep(0.36, 0.56, f) * 0.55);
        col = mix(col, gold1, smoothstep(0.52, 0.72, f) * 0.48);
        col = mix(col, gold2, smoothstep(0.68, 0.86, f) * 0.20);
        col += gold2 * smoothstep(0.88, 1.0,  f) * 0.10;

        /* Soft vignette — keep edges deep black */
        vec2 vc = uv * 2.0 - 1.0;
        float vg = 1.0 - dot(vc * 0.45, vc * 0.45);
        col *= clamp(vg * 1.8, 0.15, 1.0);

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `;

    /* ── COMPILE ───────────────────────────────────────── */
    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('Shader compile error:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER,   VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('Program link error:', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    /* ── FULL-SCREEN QUAD ──────────────────────────────── */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1,  1,-1,  -1, 1,
       1,-1,  1, 1,  -1, 1
    ]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes  = gl.getUniformLocation(prog, 'u_res');

    /* ── RESIZE ────────────────────────────────────────── */
    /* Render at 55% resolution — imperceptible on smooth  */
    /* shader gradients but massively improves performance  */
    function resize() {
      const el = canvas.parentElement || document.body;
      const w  = el.offsetWidth  || window.innerWidth;
      const h  = el.offsetHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.floor(w * dpr * 0.55);
      canvas.height = Math.floor(h * dpr * 0.55);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    resize();
    window.addEventListener('resize', resize);

    /* ── RENDER LOOP ───────────────────────────────────── */
    let start = null;
    function frame(ts) {
      if (!start) start = ts;
      const t = (ts - start) * 0.001;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes,  canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
