import test from 'node:test';
import assert from 'node:assert/strict';

import { computeInterferenceState } from '../src/physics/OpticsMath.js';
import {
  computeBenchGeometry,
  screenToTurntableLocal,
  hitTestOpticalBench
} from '../src/renderers/OpticalBenchRenderer.js';
import {
  createExperimentStore,
  EXPERIMENT_PRESETS
} from '../src/state/ExperimentStore.js';

test('Milestone 3: 광학 벤치 기하 좌표계 및 턴테이블 강체 회전 히트 테스트 검증', () => {
  const width = 580;
  const height = 430;

  // 1) 회전각 0°일 때 중앙(cx, cy)은 단일 빔 스플리터, 상단은 거울 M1, 우측은 거울 M2
  const state0 = computeInterferenceState({ turntable: { angleDeg: 0 } });
  const geom0 = computeBenchGeometry(width, height, state0);

  const hitBS = hitTestOpticalBench(geom0.cx, geom0.cy, width, height, state0);
  assert.equal(hitBS?.id, 'beamsplitter', '정중앙에는 단일 빔스플리터가 위치해야 합니다.');

  const hitM1 = hitTestOpticalBench(geom0.cx + geom0.m1Pos.x, geom0.cy + geom0.m1Pos.y, width, height, state0);
  assert.equal(hitM1?.id, 'mirror1', '상단 세로 암 끝단에는 거울 M1이 위치해야 합니다.');

  const hitM2 = hitTestOpticalBench(geom0.cx + geom0.m2Pos.x, geom0.cy + geom0.m2Pos.y, width, height, state0);
  assert.equal(hitM2?.id, 'mirror2', '우측 가로 암 끝단에는 거울 M2가 위치해야 합니다.');

  // 2) 턴테이블을 시계방향 90° 회전시켰을 때:
  // 원래 상단(-Y)에 있던 거울 M1이 우측(+X) 화면 좌표로 이동해야 함
  const state90 = computeInterferenceState({ turntable: { angleDeg: 90 } });
  const geom90 = computeBenchGeometry(width, height, state90);
  const rotatedM1ScreenX = geom90.cx - geom90.m1Pos.y; // (-Y) -> (+X)
  const rotatedM1ScreenY = geom90.cy + geom90.m1Pos.x;

  const hitM1Rotated = hitTestOpticalBench(rotatedM1ScreenX, rotatedM1ScreenY, width, height, state90);
  assert.equal(hitM1Rotated?.id, 'mirror1', '90도 회전 후 거울 M1의 히트박스가 함께 강체 회전해야 합니다.');
});

test('Milestone 4: 중앙 상태 저장소(ExperimentStore) 반응형 업데이트 및 제어 검증', () => {
  const store = createExperimentStore();
  let notificationCount = 0;

  const unsubscribe = store.subscribe(() => {
    notificationCount++;
  });

  // 초기 상태: 632.8nm, 보강간섭 100%
  assert.equal(store.getConfig().wavelengthNm, 632.8);
  assert.equal(store.getMetrics().centerIntensityLabel, '100.0%');

  // 거울 M1을 +λ/4 스텝 이동 -> 상쇄간섭 0.0%
  store.stepMirror1ByQuarterLambda(+1);
  assert.equal(notificationCount, 1);
  assert.equal(store.getMetrics().centerIntensityLabel, '0.0%');

  // 한 번 더 +λ/4 스텝 이동 (총 +λ/2) -> 보강간섭 100.0% & +1.000 Fringes
  store.stepMirror1ByQuarterLambda(+1);
  assert.equal(store.getMetrics().centerIntensityLabel, '100.0%');
  assert.equal(store.getMetrics().totalFringeShiftLabel, '+1.000 Fringes');

  // 턴테이블 각도 정규화 검증 (-90° -> 270°)
  store.setTurntableAngle(-90);
  assert.equal(store.getConfig().turntable.angleDeg, 270);

  unsubscribe();
  store.destroy();
});

test('Milestone 5: 5대 물리 실험 프리셋 및 캘리브레이션 정합성 통합 검증', () => {
  const store = createExperimentStore();

  // 프리셋 1: 표준 보강간섭
  store.loadPreset('constructive_default');
  assert.ok(Math.abs(store.getState().normalizedCenterIntensity - 1.0) < 1e-9);

  // 프리셋 2: 반파장(거울 λ/4 이동) 상쇄간섭
  store.loadPreset('destructive_quarter_lambda');
  assert.ok(Math.abs(store.getState().normalizedCenterIntensity - 0.0) < 1e-6);

  // 프리셋 3: 거울 미세 틸트 직선 간섭무늬
  store.loadPreset('linear_tilt_fringes');
  assert.equal(store.getConfig().wavelengthNm, 532.0);
  assert.ok(store.getConfig().mirror1.tiltXMrads > 0.1);

  // 프리셋 4: 1887 마이켈슨-몰리 고전 에테르 검출 가설 (연속 회전 & 90도 회전 시 약 0.40 무늬 이동)
  store.loadPreset('historical_ether_1887');
  assert.equal(store.getConfig().turntable.physicsMode, 'ETHER');
  assert.equal(EXPERIMENT_PRESETS.historical_ether_1887.autoRotate, true);
  store.setTurntableAngle(90);
  assert.ok(
    Math.abs(Math.abs(store.getState().ether.fringeShiftFromZeroDeg) - 0.40) < 0.01,
    '1887 에테르 프리셋에서 90도 회전 무늬 이동량은 약 0.40이어야 합니다.'
  );

  // 프리셋 5: 특수 상대성 이론 영결과 (Null Result)
  store.loadPreset('einstein_srt_null');
  assert.equal(store.getConfig().turntable.physicsMode, 'SRT');
  assert.equal(store.getState().ether.fringeShiftFromZeroDeg, 0.0);

  store.destroy();
});
