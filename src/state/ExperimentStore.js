/**
 * @file ExperimentStore.js
 * @description 마이켈슨-몰리 가상 실험실의 중앙 집중식 반응형 상태 저장소(State Store) 및
 * 프리셋(Presets), 다중 화면 동기화(BroadcastChannel) 모듈.
 */

import { DEFAULT_EXPERIMENT_CONFIG, computeInterferenceState } from '../physics/OpticsMath.js';
import { extractDetectorMetrics } from '../renderers/DetectorRenderer.js';

export const EXPERIMENT_PRESETS = {
  constructive_default: {
    id: 'constructive_default',
    name: '1. 표준 보강간섭 (초기 원점)',
    description: 'He-Ne 적색 레이저(632.8nm), 양쪽 거울 대칭 상태에서 두 사인파가 보강간섭(중심 조도 100%)을 일으킵니다.',
    autoRotate: false,
    config: {
      wavelengthNm: 632.8,
      mirror1: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.0, tiltYMrads: 0.0 },
      mirror2: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.0, tiltYMrads: 0.0 },
      turntable: { angleDeg: 0.0, physicsMode: 'SRT', etherSpeedKmS: 30.0 }
    }
  },
  destructive_quarter_lambda: {
    id: 'destructive_quarter_lambda',
    name: '2. 상쇄간섭 (M1 거울 λ/4 이동)',
    description: '거울 M1을 λ/4(0.1582μm) 이동하여 왕복 광로차 λ/2(위상차 π)를 발생시킵니다. 감지기 사인파가 일직선(진폭 0)으로 상쇄됩니다.',
    autoRotate: false,
    config: {
      wavelengthNm: 632.8,
      mirror1: { baseLengthM: 11.0, deltaLengthUm: 0.1582, tiltXMrads: 0.0, tiltYMrads: 0.0 },
      mirror2: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.0, tiltYMrads: 0.0 },
      turntable: { angleDeg: 0.0, physicsMode: 'SRT', etherSpeedKmS: 30.0 }
    }
  },
  linear_tilt_fringes: {
    id: 'linear_tilt_fringes',
    name: '3. 직선 간섭 줄무늬 (거울 미세 틸트)',
    description: '거울 M1에 0.18 mrad의 미세 경사각을 부여하여 동심원 무늬를 평행 직선 간섭 줄무늬로 변환합니다.',
    autoRotate: false,
    config: {
      wavelengthNm: 532.0,
      mirror1: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.18, tiltYMrads: 0.0 },
      mirror2: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.0, tiltYMrads: 0.0 },
      turntable: { angleDeg: 0.0, physicsMode: 'SRT', etherSpeedKmS: 30.0 }
    }
  },
  historical_ether_1887: {
    id: 'historical_ether_1887',
    name: '4. 1887 고전 에테르 검출 가설 (연속 회전 관측)',
    description: '턴테이블을 360° 연속 회전시키며 에테르 맞바람(30km/s)에 의해 간섭무늬와 사인파가 주기적으로 이동하는 고전 가설을 재현합니다.',
    autoRotate: true,
    config: {
      wavelengthNm: 550.0,
      mirror1: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.12, tiltYMrads: 0.0 },
      mirror2: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.0, tiltYMrads: 0.0 },
      turntable: { angleDeg: 0.0, physicsMode: 'ETHER', etherSpeedKmS: 30.0 }
    }
  },
  einstein_srt_null: {
    id: 'einstein_srt_null',
    name: '5. 특수 상대성 이론 영결과 (연속 회전 검증)',
    description: '턴테이블을 360° 연속 회전시켜도 광속 불변의 원리에 의해 무늬 이동이 0.0000(Null Result)으로 미동조차 하지 않는 실제 결과를 확인합니다.',
    autoRotate: true,
    config: {
      wavelengthNm: 550.0,
      mirror1: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.12, tiltYMrads: 0.0 },
      mirror2: { baseLengthM: 11.0, deltaLengthUm: 0.0, tiltXMrads: 0.0, tiltYMrads: 0.0 },
      turntable: { angleDeg: 0.0, physicsMode: 'SRT', etherSpeedKmS: 30.0 }
    }
  }
};

export function createExperimentStore(initialOverrides = {}) {
  let config = structuredClone({
    ...DEFAULT_EXPERIMENT_CONFIG,
    ...initialOverrides,
    beamSplitter: {
      ...DEFAULT_EXPERIMENT_CONFIG.beamSplitter,
      thicknessMm: 5.0,
      hasCompensator: true,
      ...(initialOverrides.beamSplitter || {})
    },
    mirror1: {
      ...DEFAULT_EXPERIMENT_CONFIG.mirror1,
      ...(initialOverrides.mirror1 || {})
    },
    mirror2: {
      ...DEFAULT_EXPERIMENT_CONFIG.mirror2,
      ...(initialOverrides.mirror2 || {})
    },
    turntable: {
      ...DEFAULT_EXPERIMENT_CONFIG.turntable,
      ...(initialOverrides.turntable || {})
    }
  });

  let computedState = computeInterferenceState(config);
  let metrics = extractDetectorMetrics(computedState);
  const listeners = new Set();

  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('michelson-morley-detector-sync')
      : null;

  if (channel) {
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'SYNC_CONFIG') {
        applyConfigUpdate(event.data.config, false);
      } else if (event.data && event.data.type === 'REQUEST_INITIAL_STATE') {
        channel.postMessage({ type: 'SYNC_CONFIG', config });
      }
    };
  }

  function applyConfigUpdate(partial, broadcast = true) {
    config = {
      ...config,
      ...partial,
      beamSplitter: { ...config.beamSplitter, ...(partial.beamSplitter || {}) },
      mirror1: { ...config.mirror1, ...(partial.mirror1 || {}) },
      mirror2: { ...config.mirror2, ...(partial.mirror2 || {}) },
      turntable: { ...config.turntable, ...(partial.turntable || {}) },
      detector: { ...config.detector, ...(partial.detector || {}) }
    };

    computedState = computeInterferenceState(config);
    metrics = extractDetectorMetrics(computedState);

    if (broadcast && channel) {
      channel.postMessage({ type: 'SYNC_CONFIG', config });
    }

    for (const listener of listeners) {
      listener(computedState, metrics, config);
    }

    return computedState;
  }

  return {
    getConfig: () => config,
    getState: () => computedState,
    getMetrics: () => metrics,
    update: (partial) => applyConfigUpdate(partial, true),
    setWavelength: (wavelengthNm) => applyConfigUpdate({ wavelengthNm: Number(wavelengthNm) }),
    setMirror1Displacement: (deltaLengthUm) =>
      applyConfigUpdate({
        mirror1: {
          ...config.mirror1,
          deltaLengthUm: Math.max(-5.0, Math.min(5.0, Number(deltaLengthUm)))
        }
      }),
    setMirror2Displacement: (deltaLengthUm) =>
      applyConfigUpdate({
        mirror2: {
          ...config.mirror2,
          deltaLengthUm: Math.max(-5.0, Math.min(5.0, Number(deltaLengthUm)))
        }
      }),
    stepMirror1ByQuarterLambda: (direction = 1) => {
      const quarterLambdaUm = (config.wavelengthNm * 1e-3) / 4.0;
      const next = Math.max(-5.0, Math.min(5.0, config.mirror1.deltaLengthUm + direction * quarterLambdaUm));
      return applyConfigUpdate({
        mirror1: { ...config.mirror1, deltaLengthUm: next }
      });
    },
    stepMirror2ByQuarterLambda: (direction = 1) => {
      const quarterLambdaUm = (config.wavelengthNm * 1e-3) / 4.0;
      const next = Math.max(-5.0, Math.min(5.0, config.mirror2.deltaLengthUm + direction * quarterLambdaUm));
      return applyConfigUpdate({
        mirror2: { ...config.mirror2, deltaLengthUm: next }
      });
    },
    setMirrorTilt: (tiltXMrads, tiltYMrads = 0) =>
      applyConfigUpdate({
        mirror1: {
          ...config.mirror1,
          tiltXMrads: Number(tiltXMrads),
          tiltYMrads: Number(tiltYMrads)
        }
      }),
    setTurntableAngle: (angleDeg) => {
      const normalizedAngle = ((Number(angleDeg) % 360) + 360) % 360;
      return applyConfigUpdate({
        turntable: { ...config.turntable, angleDeg: normalizedAngle }
      });
    },
    setPhysicsMode: (physicsMode) =>
      applyConfigUpdate({
        turntable: { ...config.turntable, physicsMode }
      }),
    loadPreset: (presetId) => {
      const preset = EXPERIMENT_PRESETS[presetId];
      if (!preset) throw new Error(`Unknown preset ID: ${presetId}`);
      return applyConfigUpdate(structuredClone(preset.config), true);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    requestRemoteSync: () => {
      if (channel) {
        channel.postMessage({ type: 'REQUEST_INITIAL_STATE' });
      }
    },
    destroy: () => {
      listeners.clear();
      if (channel) channel.close();
    }
  };
}
