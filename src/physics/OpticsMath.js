/**
 * @file OpticsMath.js
 * @description 마이켈슨-몰리 간섭계의 핵심 물리 및 광학 연산 엔진.
 * - 유한 두께(d) 빔스플리터의 스넬 굴절, 측면 변위(Lateral Shift), 광로차(OPD) 계산
 * - 거울 M1, M2 미세 변위(ΔL) 및 미세 틸트(α)에 따른 공간 위상차 계산
 * - 턴테이블 회전(θ) 및 가상 에테르 바람(v)에 따른 비행 시간차(Δt) 및 무늬 이동수(ΔN) 계산
 * - 감지기 평면(x, y)에서의 전계 중첩 및 간섭 광도 I(x, y) 계산
 */

import { SPEED_OF_LIGHT, calculateWaveParameters, wavelengthToRGB } from './ColorConverter.js';

export const DEFAULT_EXPERIMENT_CONFIG = {
  wavelengthNm: 632.8,          // He-Ne 레이저 기본 파장 (nm)
  laserIntensity0: 1.0,         // 입사 레이저 정규화 세기 I0
  beamSplitter: {
    thicknessMm: 5.0,           // 빔스플리터 두께 d (mm)
    refractiveIndex: 1.5168,    // BK7 광학 유리 굴절률 n
    incidenceAngleDeg: 45.0,    // 입사각 θ_i (deg)
    reflectivity: 0.5,          // 반사율 R (50%)
    transmissivity: 0.5,        // 투과율 T (50%)
    hasCompensator: true        // 보정판(Compensator Plate) 장착 여부
  },
  mirror1: {
    baseLengthM: 11.0,          // M1(세로 암) 기본 길이 L1 (m) - 역사적 실험 기준 11m
    deltaLengthUm: 0.0,         // M1 미세 변위 ΔL1 (μm)
    tiltXMrads: 0.0,            // M1 X축 틸트 (mrad)
    tiltYMrads: 0.0             // M1 Y축 틸트 (mrad)
  },
  mirror2: {
    baseLengthM: 11.0,          // M2(가로 암) 기본 길이 L2 (m)
    deltaLengthUm: 0.0,         // M2 미세 변위 ΔL2 (μm)
    tiltXMrads: 0.0,            // M2 X축 틸트 (mrad)
    tiltYMrads: 0.0             // M2 Y축 틸트 (mrad)
  },
  turntable: {
    angleDeg: 0.0,              // 턴테이블 회전각 θ (0 ~ 360 deg)
    physicsMode: 'SRT',         // 'SRT' (특수 상대성 이론) | 'ETHER' (고전 에테르 가설)
    etherSpeedKmS: 30.0,        // 지구 공전 속도 상당 가상 에테르 속력 (km/s)
    etherDirectionDeg: 0.0      // 외부 기준계 에테르 바람 방향 (deg)
  },
  detector: {
    sensorSizeMm: 10.0,         // 감지기 센서 유효 폭 (mm)
    beamCurvatureFactor: 1.8e-6 // 동심원 간섭무늬(Haidinger fringes) 형성을 위한 파면 곡률 계수
  }
};

/**
 * 1. 유한 두께(d)를 가진 빔스플리터의 기하광학 및 광로 지연(OPD) 계산
 * @param {object} bsParams
 * @param {number} [bsParams.thicknessMm=5.0] - 빔스플리터 두께 d (mm)
 * @param {number} [bsParams.refractiveIndex=1.5168] - 굴절률 n
 * @param {number} [bsParams.incidenceAngleDeg=45.0] - 입사각 (deg)
 * @param {boolean} [bsParams.hasCompensator=true] - 보정판 유무
 * @param {number} [bsParams.reflectivity=0.5] - 반사율 R
 * @param {number} [bsParams.transmissivity=0.5] - 투과율 T
 */
export function calculateBeamSplitterOptics(bsParams = {}) {
  const thicknessMm = Math.max(0, Number(bsParams.thicknessMm ?? 5.0));
  const thicknessM = thicknessMm * 1e-3;
  const n = Math.max(1.0, Number(bsParams.refractiveIndex ?? 1.5168));
  const thetaIDeg = Number(bsParams.incidenceAngleDeg ?? 45.0);
  const thetaIRad = (thetaIDeg * Math.PI) / 180;
  const hasCompensator = Boolean(bsParams.hasCompensator ?? true);
  const R = Math.min(1, Math.max(0, Number(bsParams.reflectivity ?? 0.5)));
  const T = Math.min(1, Math.max(0, Number(bsParams.transmissivity ?? 1 - R)));

  // 스넬의 법칙: 1 * sin(θ_i) = n * sin(θ_r)
  const sinThetaI = Math.sin(thetaIRad);
  const cosThetaI = Math.cos(thetaIRad);
  const sinThetaR = sinThetaI / n;
  const cosThetaR = Math.sqrt(Math.max(0, 1 - sinThetaR * sinThetaR));
  const thetaRRad = Math.asin(sinThetaR);
  const thetaRDeg = (thetaRRad * 180) / Math.PI;

  // 유리 매질 1회 통과 시 기하학적 경로 길이 s = d / cos(θ_r)
  const geometricPathInGlassM = thicknessM / cosThetaR;

  // 유리 매질 1회 통과 시 광학적 경로 길이 OPL = n * s
  const singlePassOPLM = n * geometricPathInGlassM;

  // 평행 평판 투과 시 광선 측면 평행 변위 (Lateral Displacement): δ = d * sin(θ_i - θ_r) / cos(θ_r)
  const lateralShiftM = (thicknessM * Math.sin(thetaIRad - thetaRRad)) / cosThetaR;

  // 공기 중 기준 대비 유리판 1회 통과에 의해 추가되는 유효 광로차:
  // ΔOPL_1pass = d * (sqrt(n^2 - sin^2(θ_i)) - cos(θ_i)) = d * (n * cos(θ_r) - cos(θ_i))
  const singlePassOPDM = thicknessM * (n * cosThetaR - cosThetaI);

  // 마이켈슨 간섭계에서 전면 반사 코팅 기준:
  // 한쪽 암은 유리 기판을 1회 통과하고, 다른 쪽 암은 유리 기판을 3회 통과함 (왕복 2회 차이 발생).
  // 보정판(Compensator Plate)이 삽입되면 부족한 암에 왕복 2회 통과를 추가하여 비대칭 광로차를 0으로 상쇄함.
  const netGlassOPDM = hasCompensator ? 0.0 : 2.0 * singlePassOPDM;

  return {
    thicknessMm,
    thicknessM,
    refractiveIndex: n,
    incidenceAngleDeg: thetaIDeg,
    incidenceAngleRad: thetaIRad,
    refractionAngleDeg: thetaRDeg,
    refractionAngleRad: thetaRRad,
    geometricPathInGlassM,
    singlePassOPLM,
    singlePassOPDM,
    lateralShiftM,
    lateralShiftMm: lateralShiftM * 1e3,
    hasCompensator,
    netGlassOPDM,
    reflectivity: R,
    transmissivity: T
  };
}

/**
 * 2. 거울 M1, M2의 위치 및 미세 변위에 의한 기하학적 왕복 광로차(OPD) 계산
 * @param {object} mirror1 - { baseLengthM, deltaLengthUm, tiltXMrads, tiltYMrads }
 * @param {object} mirror2 - { baseLengthM, deltaLengthUm, tiltXMrads, tiltYMrads }
 */
export function calculateMirrorOptics(mirror1 = {}, mirror2 = {}) {
  const L1Base = Number(mirror1.baseLengthM ?? 11.0);
  const L2Base = Number(mirror2.baseLengthM ?? 11.0);
  const dL1Um = Number(mirror1.deltaLengthUm ?? 0.0);
  const dL2Um = Number(mirror2.deltaLengthUm ?? 0.0);

  const dL1M = dL1Um * 1e-6;
  const dL2M = dL2Um * 1e-6;

  const effectiveL1M = L1Base + dL1M;
  const effectiveL2M = L2Base + dL2M;

  // 기본 암 길이 차이(L1 - L2)와 미세 변위 차이(dL1 - dL2)를 분리하여 부동소수점 정밀도 보존
  const baseArmDiffM = L1Base - L2Base;
  const fineDeltaDiffM = dL1M - dL2M;
  const geometricOPDM = 2.0 * baseArmDiffM + 2.0 * fineDeltaDiffM;

  // 미세 틸트각 차이 (단위: mrad -> rad)
  const netTiltXRad = (Number(mirror1.tiltXMrads ?? 0.0) - Number(mirror2.tiltXMrads ?? 0.0)) * 1e-3;
  const netTiltYRad = (Number(mirror1.tiltYMrads ?? 0.0) - Number(mirror2.tiltYMrads ?? 0.0)) * 1e-3;

  return {
    effectiveL1M,
    effectiveL2M,
    deltaL1M: dL1M,
    deltaL2M: dL2M,
    geometricOPDM,
    netTiltXRad,
    netTiltYRad
  };
}

/**
 * 에테르 바람에 대해 각도 ψ로 놓인 길이 L인 암의 고전적 왕복 지연 시간 초과분 δt = t(ψ) - 2L/c 계산
 * 부동소수점 유효숫자 손실(Catastrophic cancellation)을 방지하기 위해 해석적으로 변형된 수식 사용:
 * t(ψ) = (2L/c) * sqrt(1 - β^2 sin^2(ψ)) / (1 - β^2)
 * δt(ψ) = (2L / (c * (1 - β^2))) * [ β^2 cos^2(ψ) / (1 + sqrt(1 - β^2 sin^2(ψ))) + β^2 sin^2(ψ) ]
 * @param {number} lengthM - 암의 길이 L (m)
 * @param {number} beta - v / c 무차원 속도비
 * @param {number} angleRad - 에테르 바람 벡터와 암 사이의 각도 ψ (rad)
 * @returns {number} 진공 정지 시간(2L/c) 대비 초과된 왕복 비행 시간 δt (초)
 */
export function computeArmEtherDelayExcess(lengthM, beta, angleRad) {
  if (beta <= 0 || lengthM <= 0) return 0.0;
  const beta2 = beta * beta;
  if (beta2 >= 1.0) {
    throw new Error('Ether speed v cannot exceed or equal speed of light c.');
  }

  const sinPsi = Math.sin(angleRad);
  const cosPsi = Math.cos(angleRad);
  const sin2 = sinPsi * sinPsi;
  const cos2 = cosPsi * cosPsi;

  const sqrtTerm = Math.sqrt(1.0 - beta2 * sin2);
  const factor = (2.0 * lengthM) / (SPEED_OF_LIGHT * (1.0 - beta2));
  const bracket = (beta2 * cos2) / (1.0 + sqrtTerm) + beta2 * sin2;

  return factor * bracket;
}

/**
 * 3. 턴테이블 회전각(θ) 및 에테르 바람(v)에 따른 시간차(Δt) 및 무늬 이동량(ΔN) 계산
 * @param {object} params
 * @param {number} [params.turntableAngleDeg=0] - 턴테이블 회전각 θ (deg)
 * @param {string} [params.physicsMode='SRT'] - 'SRT' (특수 상대성 이론) | 'ETHER' (고전 에테르 가설)
 * @param {number} [params.etherSpeedKmS=30] - 에테르 바람 속력 v (km/s)
 * @param {number} [params.etherDirectionDeg=0] - 에테르 바람 방향 (deg)
 * @param {number} [params.arm1LengthM=11.0] - 암 1 길이 L1 (m, 턴테이블 기준 +90도 세로축)
 * @param {number} [params.arm2LengthM=11.0] - 암 2 길이 L2 (m, 턴테이블 기준 0도 가로축)
 * @param {number} [params.wavelengthNm=632.8] - 파장 λ (nm)
 */
export function calculateEtherDrift(params = {}) {
  const turntableAngleDeg = Number(params.turntableAngleDeg ?? 0.0);
  const physicsMode = params.physicsMode === 'ETHER' ? 'ETHER' : 'SRT';
  const etherSpeedKmS = Math.max(0, Number(params.etherSpeedKmS ?? 30.0));
  const etherSpeedMs = etherSpeedKmS * 1e3;
  const etherDirectionDeg = Number(params.etherDirectionDeg ?? 0.0);
  const L1 = Number(params.arm1LengthM ?? 11.0);
  const L2 = Number(params.arm2LengthM ?? 11.0);
  const wavelengthM = Number(params.wavelengthNm ?? 632.8) * 1e-9;

  const baseTime1S = (2.0 * L1) / SPEED_OF_LIGHT;
  const baseTime2S = (2.0 * L2) / SPEED_OF_LIGHT;

  // 특수 상대성 이론(SRT) 모드이거나 에테르 속도가 0이면 광속 불변의 원리에 의해 에테르 지연이 0임
  if (physicsMode === 'SRT' || etherSpeedMs === 0) {
    return {
      physicsMode,
      turntableAngleDeg,
      etherSpeedKmS,
      etherSpeedMs,
      beta: 0,
      arm1TravelTimeS: baseTime1S,
      arm2TravelTimeS: baseTime2S,
      etherTimeDiffS: 0.0,
      etherOPDM: 0.0,
      etherPhaseShiftRad: 0.0,
      fringeShiftFromZeroDeg: 0.0,
      maxTheoreticalFringeShift90Deg: 0.0
    };
  }

  const beta = etherSpeedMs / SPEED_OF_LIGHT;
  const relAngleRad = ((turntableAngleDeg - etherDirectionDeg) * Math.PI) / 180.0;

  // Arm 2는 턴테이블의 0도 축(가로축), Arm 1은 턴테이블의 +90도 축(세로축)
  const psi2 = relAngleRad;
  const psi1 = relAngleRad + Math.PI / 2.0;

  const excessT1 = computeArmEtherDelayExcess(L1, beta, psi1);
  const excessT2 = computeArmEtherDelayExcess(L2, beta, psi2);
  const etherTimeDiffS = excessT1 - excessT2;
  const etherOPDM = SPEED_OF_LIGHT * etherTimeDiffS;
  const etherPhaseShiftRad = ((2.0 * Math.PI) / wavelengthM) * etherOPDM;

  // 턴테이블 각도 θ = 0°일 때를 기준으로 한 상대적 무늬 이동수 ΔN(θ)
  const refAngleRad = (-etherDirectionDeg * Math.PI) / 180.0;
  const refExcessT1 = computeArmEtherDelayExcess(L1, beta, refAngleRad + Math.PI / 2.0);
  const refExcessT2 = computeArmEtherDelayExcess(L2, beta, refAngleRad);
  const refEtherOPDM = SPEED_OF_LIGHT * (refExcessT1 - refExcessT2);

  const fringeShiftFromZeroDeg = (etherOPDM - refEtherOPDM) / wavelengthM;

  // 0도에서 90도 회전 시 최대 이론적 무늬 이동수: ΔN_max ≈ ((L1 + L2) / λ) * (v/c)^2
  const maxTheoreticalFringeShift90Deg = ((L1 + L2) / wavelengthM) * (beta * beta);

  return {
    physicsMode,
    turntableAngleDeg,
    etherSpeedKmS,
    etherSpeedMs,
    beta,
    arm1TravelTimeS: baseTime1S + excessT1,
    arm2TravelTimeS: baseTime2S + excessT2,
    etherTimeDiffS,
    etherOPDM,
    etherPhaseShiftRad,
    fringeShiftFromZeroDeg,
    maxTheoreticalFringeShift90Deg
  };
}

/**
 * 4. 전체 실험 상태(Config)로부터 통합 간섭 상태 및 감지기 중심부/평면 광도 분포를 계산
 * @param {object} config - 실험 설정 객체 (DEFAULT_EXPERIMENT_CONFIG 구조)
 */
export function computeInterferenceState(config = {}) {
  const merged = {
    ...DEFAULT_EXPERIMENT_CONFIG,
    ...config,
    beamSplitter: { ...DEFAULT_EXPERIMENT_CONFIG.beamSplitter, ...(config.beamSplitter || {}) },
    mirror1: { ...DEFAULT_EXPERIMENT_CONFIG.mirror1, ...(config.mirror1 || {}) },
    mirror2: { ...DEFAULT_EXPERIMENT_CONFIG.mirror2, ...(config.mirror2 || {}) },
    turntable: { ...DEFAULT_EXPERIMENT_CONFIG.turntable, ...(config.turntable || {}) },
    detector: { ...DEFAULT_EXPERIMENT_CONFIG.detector, ...(config.detector || {}) }
  };

  const wave = calculateWaveParameters(merged.wavelengthNm);
  const color = wavelengthToRGB(merged.wavelengthNm);
  const bs = calculateBeamSplitterOptics(merged.beamSplitter);
  const mirrors = calculateMirrorOptics(merged.mirror1, merged.mirror2);
  const ether = calculateEtherDrift({
    turntableAngleDeg: merged.turntable.angleDeg,
    physicsMode: merged.turntable.physicsMode,
    etherSpeedKmS: merged.turntable.etherSpeedKmS,
    etherDirectionDeg: merged.turntable.etherDirectionDeg,
    arm1LengthM: mirrors.effectiveL1M,
    arm2LengthM: mirrors.effectiveL2M,
    wavelengthNm: merged.wavelengthNm
  });

  // 감지기 중심(x=0, y=0)에서의 총 유효 광로차(OPD)
  const totalCenterOPDM = mirrors.geometricOPDM + bs.netGlassOPDM + ether.etherOPDM;

  // 스톡스 관계식(Stokes' Relations)에 의한 반사 위상 역전(π)이 있으나,
  // 기준점(ΔL1=ΔL2, d 보정됨)에서 보강 간섭 중심(밝은 무늬) 또는 위상 기준을 명확히 하기 위해
  // 순수 광로차 기반 위상 ΔΦ_center = k * totalCenterOPDM 계산
  const centerPhaseRad = wave.waveNumberK * totalCenterOPDM;

  // 두 분할 광선의 감지기 도달 세기:
  // 각 광선은 빔스플리터에서 1회 반사(R) 및 1회 투과(T)를 겪음 -> I1 = I0 * R * T, I2 = I0 * T * R
  const I0 = Number(merged.laserIntensity0 ?? 1.0);
  const I1 = I0 * bs.reflectivity * bs.transmissivity;
  const I2 = I0 * bs.transmissivity * bs.reflectivity;
  const maxPossibleIntensity = I1 + I2 + 2 * Math.sqrt(I1 * I2); // 50:50일 때 I0
  const minPossibleIntensity = I1 + I2 - 2 * Math.sqrt(I1 * I2); // 50:50일 때 0

  // 간섭 가시도 (Michelson Fringe Visibility / Contrast): V = (I_max - I_min) / (I_max + I_min)
  const visibility =
    maxPossibleIntensity + minPossibleIntensity > 0
      ? (maxPossibleIntensity - minPossibleIntensity) / (maxPossibleIntensity + minPossibleIntensity)
      : 0;

  // 중심부 정규화 조도 (0.0 ~ 1.0, I0=1 기준)
  const centerIntensity = I1 + I2 + 2 * Math.sqrt(I1 * I2) * Math.cos(centerPhaseRad);
  const normalizedCenterIntensity = maxPossibleIntensity > 0 ? centerIntensity / maxPossibleIntensity : 0;

  // 누적 무늬 이동수 (Fringe Shift Count ΔN = totalCenterOPD / λ)
  const totalFringeShift = totalCenterOPDM / wave.wavelengthM;

  return {
    config: merged,
    wave,
    color,
    beamSplitter: bs,
    mirrors,
    ether,
    totalCenterOPDM,
    centerPhaseRad,
    beam1Intensity: I1,
    beam2Intensity: I2,
    maxPossibleIntensity,
    minPossibleIntensity,
    visibility,
    centerIntensity,
    normalizedCenterIntensity,
    totalFringeShift
  };
}

/**
 * 5. 감지기 평면의 특정 정규화 좌표 (normX, normY ∈ [-1, 1])에서의 국소 빛의 세기 I(x, y)를 계산
 * @param {ReturnType<typeof computeInterferenceState>} state - computeInterferenceState()의 반환 객체
 * @param {number} normX - 센서 정규화 X 좌표 (-1.0 ~ +1.0)
 * @param {number} normY - 센서 정규화 Y 좌표 (-1.0 ~ +1.0)
 * @returns {{
 *   localOPDM: number,
 *   localPhaseRad: number,
 *   intensity: number,
 *   normalizedIntensity: number
 * }}
 */
export function evaluateDetectorPoint(state, normX, normY) {
  const halfSensorM = (state.config.detector.sensorSizeMm * 1e-3) * 0.5;
  const xM = normX * halfSensorM;
  const yM = normY * halfSensorM;

  // 1) 거울 미세 틸트에 의한 선형 광로차: ΔL_tilt(x, y) = 2 * (Δα_x * x + Δα_y * y)
  const tiltOPDM = 2.0 * (state.mirrors.netTiltXRad * xM + state.mirrors.netTiltYRad * yM);

  // 2) 빔 파면 곡률에 의한 방사형(동심원) 광로차: ΔL_curve(r) = curvatureFactor * (normX^2 + normY^2)
  const r2Norm = normX * normX + normY * normY;
  const curvatureOPDM = state.config.detector.beamCurvatureFactor * r2Norm;

  const localOPDM = state.totalCenterOPDM + tiltOPDM + curvatureOPDM;
  const localPhaseRad = state.wave.waveNumberK * localOPDM;

  const I1 = state.beam1Intensity;
  const I2 = state.beam2Intensity;
  const intensity = I1 + I2 + 2.0 * Math.sqrt(I1 * I2) * Math.cos(localPhaseRad);
  const normalizedIntensity =
    state.maxPossibleIntensity > 0 ? intensity / state.maxPossibleIntensity : 0.5 * (1.0 + Math.cos(localPhaseRad));

  return {
    localOPDM,
    localPhaseRad,
    intensity,
    normalizedIntensity
  };
}
