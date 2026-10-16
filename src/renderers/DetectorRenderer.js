/**
 * @file DetectorRenderer.js
 * @description 감지기(CCD Sensor Screen)의 2D 간섭 줄무늬(Fringe Pattern) 픽셀 연산 및
 * HTML5 Canvas 렌더링을 수행하는 모듈 (Milestone 2).
 */

import { evaluateDetectorPoint } from '../physics/OpticsMath.js';

/**
 * 감지기 평면 해상도(width x height)에 대한 2D 간섭무늬 RGBA 픽셀 버퍼를 생성합니다.
 * 고속 렌더링(60 FPS+)을 위해 내부 루프에서 광학 상수를 사전 계산하여 픽셀 연산을 수행합니다.
 *
 * @param {object} state - computeInterferenceState() 결과 객체
 * @param {number} [width=256] - 픽셀 가로 해상도
 * @param {number} [height=256] - 픽셀 세로 해상도
 * @param {object} [options={}]
 * @param {boolean} [options.circularAperture=true] - 원형 광학 구경(Aperture) 마스킹 적용 여부
 * @param {Uint8ClampedArray} [options.targetBuffer] - 재사용할 RGBA 버퍼 (길이: width * height * 4)
 * @returns {{
 *   width: number,
 *   height: number,
 *   pixels: Uint8ClampedArray,
 *   intensityMap: Float32Array
 * }}
 */
export function computeDetectorPixelBuffer(state, width = 256, height = 256, options = {}) {
  const circularAperture = options.circularAperture ?? true;
  const numPixels = width * height;
  const pixels =
    options.targetBuffer && options.targetBuffer.length === numPixels * 4
      ? options.targetBuffer
      : new Uint8ClampedArray(numPixels * 4);
  const intensityMap = new Float32Array(numPixels);

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const invHalfW = 1.0 / halfW;
  const invHalfH = 1.0 / halfH;

  const halfSensorM = state.config.detector.sensorSizeMm * 1e-3 * 0.5;
  const k = state.wave.waveNumberK;
  const centerOPDM = state.totalCenterOPDM;
  const tiltXFactor = 2.0 * state.mirrors.netTiltXRad * halfSensorM;
  const tiltYFactor = 2.0 * state.mirrors.netTiltYRad * halfSensorM;
  const curvatureFactor = state.config.detector.beamCurvatureFactor;

  const I1 = state.beam1Intensity;
  const I2 = state.beam2Intensity;
  const interferenceAmp = 2.0 * Math.sqrt(I1 * I2);
  const baseIntensity = I1 + I2;
  const invMaxIntensity = state.maxPossibleIntensity > 0 ? 1.0 / state.maxPossibleIntensity : 1.0;

  const rLaser = state.color.r;
  const gLaser = state.color.g;
  const bLaser = state.color.b;

  for (let py = 0; py < height; py++) {
    const normY = (py + 0.5 - halfH) * invHalfH;
    const normY2 = normY * normY;
    const yTiltOPD = tiltYFactor * normY;

    for (let px = 0; px < width; px++) {
      const normX = (px + 0.5 - halfW) * invHalfW;
      const r2 = normX * normX + normY2;
      const pIdx = py * width + px;
      const rgbaIdx = pIdx * 4;

      if (circularAperture && r2 > 1.0) {
        // 원형 센서 구경 바깥 영역은 어두운 베젤 배경 처리
        intensityMap[pIdx] = 0;
        pixels[rgbaIdx] = 10;
        pixels[rgbaIdx + 1] = 13;
        pixels[rgbaIdx + 2] = 20;
        pixels[rgbaIdx + 3] = 255;
        continue;
      }

      // 가우시안 빔 외곽 감쇠 효과(Vignetting)로 자연스러운 레이저 빔 프로파일 표현
      const envelope = circularAperture ? Math.exp(-0.35 * r2) : 1.0;

      const localOPD = centerOPDM + tiltXFactor * normX + yTiltOPD + curvatureFactor * r2;
      const phase = k * localOPD;
      const rawIntensity = baseIntensity + interferenceAmp * Math.cos(phase);
      const normIntensity = Math.max(0, Math.min(1, rawIntensity * invMaxIntensity));
      const displayIntensity = normIntensity * envelope;

      intensityMap[pIdx] = normIntensity;

      // 중심부 강한 보강간섭에서 살짝 하이라이트(Core bloom) 효과 부여
      const highlight = Math.pow(displayIntensity, 3.0) * 45;

      pixels[rgbaIdx] = Math.min(255, Math.round(rLaser * displayIntensity + highlight));
      pixels[rgbaIdx + 1] = Math.min(255, Math.round(gLaser * displayIntensity + highlight));
      pixels[rgbaIdx + 2] = Math.min(255, Math.round(bLaser * displayIntensity + highlight));
      pixels[rgbaIdx + 3] = 255;
    }
  }

  return {
    width,
    height,
    pixels,
    intensityMap
  };
}

/**
 * 감지기 계측 화면에 표시할 주요 광학 메트릭 요약 객체를 생성합니다.
 * @param {object} state - computeInterferenceState() 결과 객체
 */
export function extractDetectorMetrics(state) {
  const centerPoint = evaluateDetectorPoint(state, 0, 0);
  const centerPercent = (state.normalizedCenterIntensity * 100).toFixed(1);
  const visibilityStr = state.visibility.toFixed(3);
  const fringeShiftStr = (state.totalFringeShift >= 0 ? '+' : '') + state.totalFringeShift.toFixed(3);
  const etherShiftStr =
    (state.ether.fringeShiftFromZeroDeg >= 0 ? '+' : '') + state.ether.fringeShiftFromZeroDeg.toFixed(4);
  const opdNm = state.totalCenterOPDM * 1e9;

  return {
    centerIntensityNormalized: state.normalizedCenterIntensity,
    centerIntensityPercent: Number(centerPercent),
    centerIntensityLabel: `${centerPercent}%`,
    visibility: state.visibility,
    visibilityLabel: visibilityStr,
    totalFringeShift: state.totalFringeShift,
    totalFringeShiftLabel: `${fringeShiftStr} Fringes`,
    etherFringeShift: state.ether.fringeShiftFromZeroDeg,
    etherFringeShiftLabel: `${etherShiftStr} Fringes`,
    totalCenterOPDNm: opdNm,
    totalCenterOPDLabel: `${opdNm.toFixed(1)} nm`,
    centerPhaseRad: centerPoint.localPhaseRad
  };
}

/**
 * HTML5 Canvas 2D 컨텍스트에 감지기 2D 간섭무늬 영상 및 레티클(십자선/눈금) 오버레이를 렌더링합니다.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state - computeInterferenceState() 결과 객체
 * @param {object} [options={}]
 * @param {boolean} [options.showReticle=true] - 중심 십자선 및 동심원 레티클 표시 여부
 * @param {boolean} [options.showScanline=true] - 1D 프로파일 샘플링 기준선(y=0) 표시 여부
 */
export function renderDetectorCanvas(ctx, state, options = {}) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const showReticle = options.showReticle ?? true;
  const showScanline = options.showScanline ?? true;

  const imgData = ctx.createImageData(width, height);
  computeDetectorPixelBuffer(state, width, height, {
    circularAperture: true,
    targetBuffer: imgData.data
  });
  ctx.putImageData(imgData, 0, 0);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.min(cx, cy) - 2;

  ctx.save();

  // 1) 원형 센서 외곽 링 테두리
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 2) 레티클 동심원 및 중심 십자 눈금
  if (showReticle) {
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
    ctx.lineWidth = 1;

    [0.33, 0.66].forEach((ratio) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * ratio, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 수직 기준선
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();
  }

  // 3) 1D 조도 프로파일 스캔라인 (y = 0 수평 기준선)
  if (showScanline) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();
    ctx.restore();
  }

  // 4) 중심 수광 포인트 타겟 마커
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}
