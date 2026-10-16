import test from 'node:test';
import assert from 'node:assert/strict';

import {
  wavelengthToRGB,
  calculateWaveParameters,
  SPEED_OF_LIGHT
} from '../src/physics/ColorConverter.js';

import {
  calculateBeamSplitterOptics,
  calculateMirrorOptics,
  calculateEtherDrift,
  computeInterferenceState,
  evaluateDetectorPoint
} from '../src/physics/OpticsMath.js';

test('Milestone 1.1: 단일 파장 광학 모델 및 RGB 색상 변환 검증', () => {
  // He-Ne 레이저 (632.8 nm) -> 적색광
  const red = wavelengthToRGB(632.8);
  assert.equal(red.r, 255);
  assert.ok(red.g < 80 && red.b === 0, '632.8nm는 붉은색 계열이어야 합니다.');
  assert.match(red.spectralName, /적색광/);

  // Nd:YAG 2배파 레이저 (532 nm) -> 녹색광
  const green = wavelengthToRGB(532.0);
  assert.equal(green.g, 255);
  assert.match(green.spectralName, /녹색광/);

  // 청색 레이저 (450 nm) -> 청색광
  const blue = wavelengthToRGB(450.0);
  assert.equal(blue.b, 255);
  assert.match(blue.spectralName, /청색광/);

  // 파수 k = 2π / λ 검증
  const wave = calculateWaveParameters(500.0); // 500 nm = 5e-7 m
  assert.ok(Math.abs(wave.wavelengthM - 5e-7) < 1e-15);
  assert.ok(Math.abs(wave.waveNumberK - (2 * Math.PI) / 5e-7) < 1e-3);
  assert.ok(Math.abs(wave.frequencyHz - SPEED_OF_LIGHT / 5e-7) < 1);
});

test('Milestone 1.2: 유한 두께 빔스플리터 스넬의 법칙 굴절 및 보정판 효과 검증', () => {
  // 5mm 두께, 굴절률 1.5168 (BK7), 45도 입사, 보정판 ON
  const bsCompensated = calculateBeamSplitterOptics({
    thicknessMm: 5.0,
    refractiveIndex: 1.5168,
    incidenceAngleDeg: 45.0,
    hasCompensator: true
  });

  // 스넬의 법칙: sin(45°) / 1.5168 = sin(θ_r) -> θ_r ≈ 27.787°
  const expectedThetaR = (Math.asin(Math.SQRT1_2 / 1.5168) * 180) / Math.PI;
  assert.ok(Math.abs(bsCompensated.refractionAngleDeg - expectedThetaR) < 1e-9);
  assert.ok(bsCompensated.lateralShiftMm > 1.0, '유한 두께에 의해 측면 변위가 발생해야 합니다.');
  assert.equal(bsCompensated.netGlassOPDM, 0.0, '보정판 장착 시 유리 통과 순 광로차는 0이어야 합니다.');

  // 보정판 OFF일 때 비대칭 광로차 발생 확인
  const bsUncompensated = calculateBeamSplitterOptics({
    thicknessMm: 5.0,
    refractiveIndex: 1.5168,
    incidenceAngleDeg: 45.0,
    hasCompensator: false
  });
  assert.ok(bsUncompensated.netGlassOPDM > 0, '보정판 해제 시 두 암 간 유리 통과 광로차가 존재해야 합니다.');
  assert.ok(Math.abs(bsUncompensated.netGlassOPDM - 2 * bsUncompensated.singlePassOPDM) < 1e-15);
});

test('Milestone 1.3: 거울 미세 변위 ΔL = λ/2 이동 시 2π 위상차 및 1 Fringe Shift 검증', () => {
  const wavelengthNm = 632.8; // 0.6328 μm
  const halfLambdaUm = (wavelengthNm * 1e-3) / 2.0; // 0.3164 μm
  const quarterLambdaUm = (wavelengthNm * 1e-3) / 4.0; // 0.1582 μm

  // 초기 대칭 상태 (ΔL1 = 0, ΔL2 = 0)
  const state0 = computeInterferenceState({
    wavelengthNm,
    mirror1: { deltaLengthUm: 0 },
    mirror2: { deltaLengthUm: 0 }
  });
  assert.ok(Math.abs(state0.totalCenterOPDM) < 1e-18);
  assert.ok(Math.abs(state0.normalizedCenterIntensity - 1.0) < 1e-12, '초기 중심 조도는 보강간섭(1.0)이어야 합니다.');

  // 거울 M1을 λ/4 만큼 이동 -> 왕복 광로차 λ/2 -> 위상차 π -> 상쇄간섭(중심 조도 0.0)
  const stateQuarter = computeInterferenceState({
    wavelengthNm,
    mirror1: { deltaLengthUm: quarterLambdaUm },
    mirror2: { deltaLengthUm: 0 }
  });
  assert.ok(Math.abs(stateQuarter.centerPhaseRad - Math.PI) < 1e-9);
  assert.ok(Math.abs(stateQuarter.normalizedCenterIntensity - 0.0) < 1e-9, 'λ/4 이동 시 상쇄간섭(0.0)이어야 합니다.');
  assert.ok(Math.abs(stateQuarter.totalFringeShift - 0.5) < 1e-9);

  // 거울 M1을 λ/2 만큼 이동 -> 왕복 광로차 λ -> 위상차 2π -> 1.0 Fringe Shift & 보강간섭 복귀
  const stateHalf = computeInterferenceState({
    wavelengthNm,
    mirror1: { deltaLengthUm: halfLambdaUm },
    mirror2: { deltaLengthUm: 0 }
  });
  assert.ok(Math.abs(stateHalf.centerPhaseRad - 2 * Math.PI) < 1e-9, 'λ/2 이동 시 위상차는 정확히 2π 라디안이어야 합니다.');
  assert.ok(Math.abs(stateHalf.totalFringeShift - 1.0) < 1e-9, 'λ/2 이동 시 무늬 이동수는 정확히 1.0이어야 합니다.');
  assert.ok(Math.abs(stateHalf.normalizedCenterIntensity - 1.0) < 1e-9);
});

test('Milestone 1.4: 턴테이블 회전 및 에테르 바람 (SRT 모드 vs 고전 에테르 모드) 검증', () => {
  // 1) 특수 상대성 이론(SRT) 모드: 턴테이블을 90도 회전해도 무늬 이동이 정확히 0 (영결과)
  const srt90 = calculateEtherDrift({
    turntableAngleDeg: 90,
    physicsMode: 'SRT',
    etherSpeedKmS: 30,
    arm1LengthM: 11.0,
    arm2LengthM: 11.0,
    wavelengthNm: 550.0
  });
  assert.equal(srt90.etherOPDM, 0.0);
  assert.equal(srt90.fringeShiftFromZeroDeg, 0.0);

  // 2) 고전 에테르 가설(ETHER) 모드: 1887년 마이켈슨-몰리 실험 조건 (L=11m, v=30km/s, λ=550nm)
  // 90도 회전 시 예측 무늬 이동량 ΔN ≈ (2L / λ) * (v/c)^2 ≈ (22 / 5.5e-7) * (1e-4)^2 ≈ 0.40 fringes
  const ether90 = calculateEtherDrift({
    turntableAngleDeg: 90,
    physicsMode: 'ETHER',
    etherSpeedKmS: 30,
    arm1LengthM: 11.0,
    arm2LengthM: 11.0,
    wavelengthNm: 550.0
  });

  const expectedShift = ((11.0 + 11.0) / 550e-9) * Math.pow(30000 / SPEED_OF_LIGHT, 2);
  assert.ok(
    Math.abs(Math.abs(ether90.fringeShiftFromZeroDeg) - expectedShift) < 1e-5,
    `90도 회전 시 무늬 이동량(${Math.abs(ether90.fringeShiftFromZeroDeg)})이 이론값(${expectedShift})과 일치해야 합니다.`
  );
  assert.ok(Math.abs(expectedShift - 0.4) < 0.01, '역사적 마이켈슨-몰리 실험의 예측값 약 0.40 무늬와 부합해야 합니다.');
});

test('Milestone 1.5: 감지기 평면(x, y) 공간 간섭 분포 및 거울 틸트 효과 검증', () => {
  // 틸트가 없을 때는 대칭 방사형(동심원) 간섭이므로 (+x, 0)과 (-x, 0), (0, +y)의 조도가 동일해야 함
  const symmetricState = computeInterferenceState({
    wavelengthNm: 632.8,
    mirror1: { tiltXMrads: 0, tiltYMrads: 0 }
  });
  const pRight = evaluateDetectorPoint(symmetricState, 0.5, 0.0);
  const pLeft = evaluateDetectorPoint(symmetricState, -0.5, 0.0);
  const pTop = evaluateDetectorPoint(symmetricState, 0.0, 0.5);
  assert.ok(Math.abs(pRight.normalizedIntensity - pLeft.normalizedIntensity) < 1e-12);
  assert.ok(Math.abs(pRight.normalizedIntensity - pTop.normalizedIntensity) < 1e-12);

  // X축 틸트 부여 시 좌우 위상차가 달라져야 함
  const tiltedState = computeInterferenceState({
    wavelengthNm: 632.8,
    mirror1: { tiltXMrads: 0.2, tiltYMrads: 0 }
  });
  const tRight = evaluateDetectorPoint(tiltedState, 0.5, 0.0);
  const tLeft = evaluateDetectorPoint(tiltedState, -0.5, 0.0);
  assert.NotEqual?.(tRight.localPhaseRad, tLeft.localPhaseRad);
  assert.ok(Math.abs(tRight.localPhaseRad - tLeft.localPhaseRad) > 1.0);
});
