import test from 'node:test';
import assert from 'node:assert/strict';

import { computeInterferenceState } from '../src/physics/OpticsMath.js';
import {
  computeDetectorPixelBuffer,
  extractDetectorMetrics
} from '../src/renderers/DetectorRenderer.js';
import {
  sampleHorizontalIntensityProfile,
  computeWaveSuperpositionProfile
} from '../src/renderers/IntensityChartRenderer.js';

test('Milestone 2.5: 화면 2 감지기 사인파 중첩 그래프 (M1파 + M2파 = 합산 사인파) 검증', () => {
  // 1) 보강간섭 상태: M1파와 M2파가 동위상(ΔΦ = 0) -> 합산 사인파 진폭 2.0A
  const stateCon = computeInterferenceState({
    wavelengthNm: 632.8,
    mirror1: { deltaLengthUm: 0 },
    mirror2: { deltaLengthUm: 0 }
  });
  const supCon = computeWaveSuperpositionProfile(stateCon, 101, 0);
  assert.ok(Math.abs(supCon.resultantAmplitude - 2.0) < 1e-9, '보강간섭 시 합산 사인파 진폭은 2.0A여야 합니다.');
  for (let i = 0; i < supCon.numSamples; i++) {
    assert.ok(Math.abs(supCon.waveSum[i] - (supCon.waveM1[i] + supCon.waveM2[i])) < 1e-12);
  }

  // 2) 상쇄간섭 상태 (M1을 λ/4 이동): M1파와 M2파가 역위상(ΔΦ = π) -> 합산 사인파 진폭 0.0A
  const stateDes = computeInterferenceState({
    wavelengthNm: 632.8,
    mirror1: { deltaLengthUm: 0.6328 / 4.0 },
    mirror2: { deltaLengthUm: 0 }
  });
  const supDes = computeWaveSuperpositionProfile(stateDes, 101, 0);
  assert.ok(Math.abs(supDes.resultantAmplitude - 0.0) < 1e-9, '상쇄간섭 시 합산 사인파 진폭은 0이어야 합니다.');
  for (let i = 0; i < supDes.numSamples; i++) {
    assert.ok(Math.abs(supDes.waveSum[i]) < 1e-9, '상쇄간섭 시 모든 지점에서 합산 파동은 0이어야 합니다.');
  }
});

test('Milestone 2.1: 2D 감지기 픽셀 버퍼 생성 및 보강/상쇄 간섭 색상 검증', () => {
  const width = 128;
  const height = 128;

  // 1) 보강간섭 상태 (ΔL1 = 0, 파장 532nm 녹색 레이저)
  const stateConstructive = computeInterferenceState({
    wavelengthNm: 532.0,
    mirror1: { deltaLengthUm: 0 }
  });
  const bufConstructive = computeDetectorPixelBuffer(stateConstructive, width, height, {
    circularAperture: true
  });

  assert.equal(bufConstructive.pixels.length, width * height * 4);
  assert.equal(bufConstructive.intensityMap.length, width * height);

  // 정중앙 근처 픽셀 (64, 64)은 높은 녹색 광도를 가져야 함
  const centerIdx = (64 * width + 64) * 4;
  assert.ok(bufConstructive.pixels[centerIdx + 1] > 200, '보강간섭 중심부 녹색 채널은 밝아야 합니다.');

  // 원형 구경 바깥 모서리 픽셀 (0, 0)은 마스크 처리되어야 함
  assert.equal(bufConstructive.intensityMap[0], 0);
  assert.equal(bufConstructive.pixels[0], 10);

  // 2) 상쇄간섭 상태 (ΔL1 = λ/4 = 0.133 μm)
  const stateDestructive = computeInterferenceState({
    wavelengthNm: 532.0,
    mirror1: { deltaLengthUm: 0.532 / 4.0 }
  });
  const bufDestructive = computeDetectorPixelBuffer(stateDestructive, width, height, {
    circularAperture: true
  });
  assert.ok(
    bufDestructive.pixels[centerIdx + 1] < 20,
    '상쇄간섭 중심부 픽셀은 어두워야 합니다.'
  );
});

test('Milestone 2.2: 256x256 해상도 60 FPS 실시간 렌더링 성능 검증 (< 16.6ms)', () => {
  const state = computeInterferenceState({ wavelengthNm: 632.8 });
  const targetBuffer = new Uint8ClampedArray(256 * 256 * 4);

  const startMs = performance.now();
  computeDetectorPixelBuffer(state, 256, 256, { targetBuffer });
  const elapsedMs = performance.now() - startMs;

  assert.ok(
    elapsedMs < 16.6,
    `256x256 프레임 연산 시간(${elapsedMs.toFixed(2)}ms)은 60FPS 기준(16.6ms) 이내여야 합니다.`
  );
});

test('Milestone 2.3: 1D 조도 단면 프로파일 I(x) 샘플링 및 대칭/틸트 특성 검증', () => {
  // 대칭 동심원 무늬 상태 (tiltX = 0)
  const symState = computeInterferenceState({
    wavelengthNm: 632.8,
    mirror1: { tiltXMrads: 0, tiltYMrads: 0 }
  });
  const symProfile = sampleHorizontalIntensityProfile(symState, 101, 0.0);

  assert.equal(symProfile.numSamples, 101);
  assert.ok(Math.abs(symProfile.positionsMm[0] - (-5.0)) < 1e-9);
  assert.ok(Math.abs(symProfile.positionsMm[50] - 0.0) < 1e-9);
  assert.ok(Math.abs(symProfile.positionsMm[100] - 5.0) < 1e-9);

  // 좌우 대칭 검증: I(-x) == I(+x)
  for (let i = 0; i < 50; i++) {
    const leftVal = symProfile.intensities[i];
    const rightVal = symProfile.intensities[100 - i];
    assert.ok(Math.abs(leftVal - rightVal) < 1e-12, `대칭 위치 ${i}에서 광도가 일치해야 합니다.`);
  }

  // 거울 X축 틸트 부여 시 다수의 주기를 갖는 정현파 줄무늬 형성 및 높은 대비도(Contrast) 확인
  const tiltState = computeInterferenceState({
    wavelengthNm: 632.8,
    mirror1: { tiltXMrads: 0.3, tiltYMrads: 0 }
  });
  const tiltProfile = sampleHorizontalIntensityProfile(tiltState, 201, 0.0);
  assert.ok(tiltProfile.empiricalContrast > 0.98, '틸트 줄무늬의 실험적 가시도(Contrast)는 1에 가까워야 합니다.');
});

test('Milestone 2.4: 감지기 계측 메트릭 추출 포매터 검증', () => {
  const state = computeInterferenceState({
    wavelengthNm: 632.8,
    mirror1: { deltaLengthUm: 0.3164 } // +1.0 Fringe
  });
  const metrics = extractDetectorMetrics(state);

  assert.equal(metrics.centerIntensityLabel, '100.0%');
  assert.equal(metrics.visibilityLabel, '1.000');
  assert.equal(metrics.totalFringeShiftLabel, '+1.000 Fringes');
});
