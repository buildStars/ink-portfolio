import * as THREE from 'three';

/**
 * 水墨后处理：
 * - Sobel 描墨线（带轻微抖动，像手绘）
 * - 亮度映射到「墨 → 宣纸」并做平滑色阶，形成墨色浓淡
 * - 只保留朱红色（灯笼、印章、梅花），其余去色
 * - 宣纸纤维纹理 + 暗角
 * - uProgress > 0 时，从 uCenter 晕开一团墨，用于场景转场
 */
export const InkShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    res: { value: new THREE.Vector2(1, 1) },
    uProgress: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 res;
    uniform float uProgress;
    uniform vec2 uCenter;
    varying vec2 vUv;

    // 不用 sin 的哈希：输入坐标很大时在各种 GPU 上都稳定，不会出现精度噪点
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
    float lum(vec2 uv) { return dot(srgb(texture2D(tDiffuse, uv).rgb), vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec2 px = 1.5 / res;
      vec2 wob = (vec2(noise(vUv * res / 18.0), noise(vUv * res / 18.0 + 31.7)) - 0.5) * 3.0 / res;
      vec2 uv = vUv + wob;
      float tl = lum(uv + px * vec2(-1.0, 1.0)), tc = lum(uv + px * vec2(0.0, 1.0)), tr = lum(uv + px * vec2(1.0, 1.0));
      float ml = lum(uv + px * vec2(-1.0, 0.0)), mr = lum(uv + px * vec2(1.0, 0.0));
      float bl = lum(uv + px * vec2(-1.0, -1.0)), bc = lum(uv + px * vec2(0.0, -1.0)), br = lum(uv + px * vec2(1.0, -1.0));
      float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
      float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
      float edge = smoothstep(0.14, 0.55, length(vec2(gx, gy)));

      vec3 col = srgb(texture2D(tDiffuse, vUv).rgb);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // 墨色分层：平滑色阶，不做逐像素抖动（抖动会在画面上形成会爬动的雪花噪点）
      float x = l * 5.0;
      float q = (floor(x) + smoothstep(0.3, 0.7, fract(x))) / 5.0;
      float tone = smoothstep(0.02, 0.98, mix(l, q, 0.4));
      // 墨色不匀：大尺度、低幅度的浓淡起伏，不会形成颗粒
      tone += (noise(vUv * res / 140.0) - 0.5) * 0.05;
      vec3 paper = vec3(0.935, 0.912, 0.862);
      vec3 ink = vec3(0.10, 0.10, 0.11);
      vec3 outc = mix(ink, paper, tone);

      float red = clamp((col.r - max(col.g, col.b)) * 3.0 - 0.2, 0.0, 1.0);
      outc = mix(outc, vec3(0.74, 0.17, 0.11) * (0.6 + 0.55 * l), red);

      float lineMask = edge * (0.7 + 0.3 * noise(vUv * res / 6.0));
      outc = mix(outc, ink, lineMask * (1.0 - red * 0.7));

      if (uProgress > 0.0) {
        float aspect = res.x / res.y;
        vec2 p = (vUv - uCenter) * vec2(aspect, 1.0);
        float d = length(p) + (noise(vUv * 6.0) - 0.5) * 0.35 + (noise(vUv * 40.0) - 0.5) * 0.05;
        float r = uProgress * (aspect + 0.9) - 0.15;
        float m = 1.0 - smoothstep(r - 0.05, r + 0.01, d);
        float rim = smoothstep(r - 0.16, r, d) * m;
        vec3 wash = mix(ink, vec3(0.34, 0.34, 0.35), rim * 0.8);
        outc = mix(outc, wash, m);
      }

      float fib = noise(vUv * vec2(res.x / 1.5, res.y / 12.0)) * 0.5 + noise(vUv * vec2(res.x / 12.0, res.y / 1.5)) * 0.5;
      outc *= 0.955 + 0.06 * fib;
      vec2 dv = vUv - 0.5;
      outc *= 1.0 - dot(dv, dv) * 0.4;
      gl_FragColor = vec4(outc, 1.0);
    }`,
};
