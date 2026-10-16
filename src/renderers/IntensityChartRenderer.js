/**
 * @file IntensityChartRenderer.js
 * @description [화면 2] 감지기 파동 중첩 및 빛의 세기 그래프 렌더러.
 * - M1에서 반사된 빛의 사인파 E1(x, t)
 * - M2에서 반사된 빛의 사인파 E2(x, t)
 * - 두 파동이 합산된 최종 간섭 사인파 E_sum(x, t) = E1 + E2 를 서로 다른 색상과 피크 표시로 실시간 출력합니다.
 */

import { evaluateDetectorPoint } from '../physics/OpticsMath.js';

/**
 * 감지기 수평 단면(normY = 0, normX ∈ [-1, 1])을 따라 numSamples개의 조도 샘플 데이터를 추출합니다.
 */
export function sampleHorizontalIntensityProfile(state, numSamples = 201, sliceNormY = 0.0) {
  const count = Math.max(3, Math.floor(numSamples));
  const positionsMm = new Float64Array(count);
  const normXArray = new Float64Array(count);
  const intensities = new Float64Array(count);
  const phasesRad = new Float64Array(count);

  const halfSensorMm = state.config.detector.sensorSizeMm * 0.5;
  let maxSample = -Infinity;
  let minSample = Infinity;

  for (let i = 0; i < count; i++) {
    const normX = -1.0 + (2.0 * i) / (count - 1);
    const pt = evaluateDetectorPoint(state, normX, sliceNormY);

    normXArray[i] = normX;
    positionsMm[i] = normX * halfSensorMm;
    intensities[i] = pt.normalizedIntensity;
    phasesRad[i] = pt.localPhaseRad;

    if (pt.normalizedIntensity > maxSample) maxSample = pt.normalizedIntensity;
    if (pt.normalizedIntensity < minSample) minSample = pt.normalizedIntensity;
  }

  const centerPoint = evaluateDetectorPoint(state, 0.0, sliceNormY);
  const sum = maxSample + minSample;
  const empiricalContrast = sum > 1e-12 ? (maxSample - minSample) / sum : 0.0;

  return {
    numSamples: count,
    sliceNormY,
    positionsMm,
    normXArray,
    intensities,
    phasesRad,
    maxSampleIntensity: maxSample,
    minSampleIntensity: minSample,
    centerSampleIntensity: centerPoint.normalizedIntensity,
    empiricalContrast
  };
}

/**
 * 감지기 수광부로 들어오는 M1 반사 사인파(E1), M2 반사 사인파(E2), 그리고 합산 사인파(E1 + E2) 데이터를 계산합니다.
 * @param {object} state - computeInterferenceState() 결과 객체
 * @param {number} [numSamples=241] - 그래프 샘플 수
 * @param {number} [timePhase=0] - 실시간 파동 진행 애니메이션 위상
 */
export function computeWaveSuperpositionProfile(state, numSamples = 241, timePhase = 0) {
  const count = Math.max(11, Math.floor(numSamples));
  const waveM1 = new Float64Array(count);
  const waveM2 = new Float64Array(count);
  const waveSum = new Float64Array(count);

  // 기준 파장(550nm) 대비 현재 레이저 파장 비율에 따라 화면에 표시되는 사인파 주기가 변화함
  const numCycles = 3.0 * (550.0 / state.config.wavelengthNm);

  const k = state.wave.waveNumberK;
  const phaseM1 = k * (2.0 * state.mirrors.deltaL1M + state.ether.etherOPDM);
  const phaseM2 = k * (2.0 * state.mirrors.deltaL2M);

  // 합성파 이론 진폭: 2 * cos(ΔΦ / 2)
  const deltaPhase = phaseM1 - phaseM2;
  const resultantAmplitude = 2.0 * Math.abs(Math.cos(deltaPhase * 0.5));

  for (let i = 0; i < count; i++) {
    const u = i / (count - 1); // 0.0 ~ 1.0
    const kx = u * numCycles * 2.0 * Math.PI;

    const e1 = Math.sin(kx - timePhase + phaseM1);
    const e2 = Math.sin(kx - timePhase + phaseM2);
    const sum = e1 + e2;

    waveM1[i] = e1;
    waveM2[i] = e2;
    waveSum[i] = sum;
  }

  return {
    numSamples: count,
    phaseM1,
    phaseM2,
    deltaPhase,
    resultantAmplitude,
    waveM1,
    waveM2,
    waveSum
  };
}

/**
 * HTML5 Canvas 2D 컨텍스트에 [M1 사인파], [M2 사인파], [합산된 간섭 사인파 (E1+E2)]를 그래프 형식으로 렌더링합니다.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state - computeInterferenceState() 결과 객체
 * @param {object} [options={}]
 * @param {number} [options.numSamples=241]
 * @param {number} [options.timePhase=0]
 */
export function renderIntensityChart(ctx, state, options = {}) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const numSamples = options.numSamples ?? 241;
  const timePhase = Number(options.timePhase ?? 0);

  const sup = computeWaveSuperpositionProfile(state, numSamples, timePhase);

  const padLeft = 46;
  const padRight = 18;
  const padTop = 34;
  const padBottom = 26;
  const plotW = Math.max(20, width - padLeft - padRight);
  const plotH = Math.max(20, height - padTop - padBottom);
  const midY = padTop + plotH * 0.5;
  // Y축 스케일: 최대 진폭 ±2.0A 가 plotH의 ±44%에 오도록 설정
  const ampScalePx = plotH * 0.22; // 1.0A 당 픽셀 높이

  ctx.save();

  // 1) 배경 클리어
  ctx.fillStyle = '#080c15';
  ctx.fillRect(0, 0, width, height);

  // 2) 상단 범례(Legend) 바 렌더링
  ctx.font = 'bold 11px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // 범례 1: M1 사인파 (하늘색 점선/실선)
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('── M1 반사파(E₁)', padLeft, 15);

  // 범례 2: M2 사인파 (황금색 점선/실선)
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('── M2 반사파(E₂)', padLeft + 115, 15);

  // 범례 3: 합산 사인파 (레이저 색상 굵은 강조선 + 피크 마커)
  ctx.fillStyle = '#10b981';
  ctx.fillText(`━━ 합산 사인파(E₁+E₂) [진폭: ${sup.resultantAmplitude.toFixed(2)}A]`, padLeft + 230, 15);

  // 3) 수평 기준 그리드 (+2A, +1A, 0, -1A, -2A)
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  [
    { amp: 2.0, label: '+2A' },
    { amp: 1.0, label: '+1A' },
    { amp: 0.0, label: '0' },
    { amp: -1.0, label: '-1A' },
    { amp: -2.0, label: '-2A' }
  ].forEach(({ amp, label }) => {
    const y = midY - amp * ampScalePx;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    if (amp === 0) {
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.lineWidth = 1.2;
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    ctx.fillStyle = amp === 0 ? '#cbd5e1' : '#64748b';
    ctx.fillText(label, padLeft - 6, y);
  });

  // 4) 합산 사인파의 최대 진폭 포락선(Envelope) 가이드 표시
  const envTopY = midY - sup.resultantAmplitude * ampScalePx;
  const envBotY = midY + sup.resultantAmplitude * ampScalePx;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, envTopY);
  ctx.lineTo(padLeft + plotW, envTopY);
  ctx.moveTo(padLeft, envBotY);
  ctx.lineTo(padLeft + plotW, envBotY);
  ctx.stroke();
  ctx.restore();

  // 5) 합산된 사인파(E1 + E2) 내부 그라데이션 채우기
  const { r, g, b } = state.color;
  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.28)`);
  grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.04)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.28)`);

  ctx.beginPath();
  ctx.moveTo(padLeft, midY);
  for (let i = 0; i < sup.numSamples; i++) {
    const x = padLeft + (i / (sup.numSamples - 1)) * plotW;
    const y = midY - sup.waveSum[i] * ampScalePx;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(padLeft + plotW, midY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // 6) 개별 파동 1: M1에서 반사된 사인파 E1 (하늘색 #38bdf8)
  ctx.save();
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < sup.numSamples; i++) {
    const x = padLeft + (i / (sup.numSamples - 1)) * plotW;
    const y = midY - sup.waveM1[i] * ampScalePx;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // 7) 개별 파동 2: M2에서 반사된 사인파 E2 (황금색 #fbbf24)
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < sup.numSamples; i++) {
    const x = padLeft + (i / (sup.numSamples - 1)) * plotW;
    const y = midY - sup.waveM2[i] * ampScalePx;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // 8) 합산된 최종 사인파 E_sum = E1 + E2 (선명한 에메랄드/레이저 이중 하이라이트 실선 + 마루/골 표시 마커)
  ctx.save();
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 8;
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  for (let i = 0; i < sup.numSamples; i++) {
    const x = padLeft + (i / (sup.numSamples - 1)) * plotW;
    const y = midY - sup.waveSum[i] * ampScalePx;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 합산 파동의 마루(Peak) 지점에 원형 표시 마커(●) 추가
  if (sup.resultantAmplitude > 0.08) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    for (let i = 2; i < sup.numSamples - 2; i++) {
      const prev = sup.waveSum[i - 1];
      const curr = sup.waveSum[i];
      const next = sup.waveSum[i + 1];
      if (curr > prev && curr >= next && curr > 0.15) {
        const px = padLeft + (i / (sup.numSamples - 1)) * plotW;
        const py = midY - curr * ampScalePx;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // 하단 위상차 및 간섭 상태 요약 캡션
  const phaseDeg = (((sup.deltaPhase * 180) / Math.PI) % 360 + 360) % 360;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `위상차 ΔΦ = ${phaseDeg.toFixed(1)}°  |  빛의 세기 I ∝ (진폭)² = ${(state.normalizedCenterIntensity * 100).toFixed(1)}%`,
    padLeft + plotW * 0.5,
    padTop + plotH + 15
  );

  ctx.restore();
  return sup;
}
