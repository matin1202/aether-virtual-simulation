/**
 * @file OpticalBenchRenderer.js
 * @description 광학 벤치 2D 상단 뷰(Top-Down View), 사인파(Sinusoidal Wave) 광선 렌더러 및
 * 마우스 인터랙션 모듈.
 * - 턴테이블과 레이저, 중앙 단일 빔 스플리터, 거울 M1/M2, 감지기를 캔버스 크기에 비례하여 큼직하게 렌더링
 * - 감지기로 향하는 경로에서 합산 파동이 아닌, M1 반사파와 M2 반사파를 각각 분리하여 시각화
 */

/**
 * 캔버스 크기와 실험 상태로부터 광학 벤치 내부 기구 좌표 및 스케일 팩터를 계산합니다.
 * @param {number} width
 * @param {number} height
 * @param {object} state - computeInterferenceState() 결과 객체
 */
export function computeBenchGeometry(width, height, state) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  // 캔버스 영역을 꽉 채우도록 턴테이블 반지름을 94%로 확대
  const tableRadius = Math.min(cx, cy) * 0.94;
  // 기준 반지름(180px) 대비 동적 스케일 팩터 (전체화면 등에서 모든 부품이 함께 커짐)
  const scale = Math.max(0.85, tableRadius / 185);

  const tableAngleRad = (state.config.turntable.angleDeg * Math.PI) / 180;
  const armPixelLength = tableRadius * 0.64;

  const m1VisualOffset = Math.max(-28 * scale, Math.min(28 * scale, (state.config.mirror1.deltaLengthUm || 0) * 9.0 * scale));
  const m2VisualOffset = Math.max(-28 * scale, Math.min(28 * scale, (state.config.mirror2.deltaLengthUm || 0) * 9.0 * scale));

  const laserPos = { x: -armPixelLength - 18 * scale, y: 0 };
  const bsPos = { x: 0, y: 0 };
  const m1Pos = { x: 0, y: -armPixelLength - m1VisualOffset };
  const m2Pos = { x: armPixelLength + m2VisualOffset, y: 0 };
  const detectorPos = { x: 0, y: armPixelLength + 12 * scale };

  return {
    cx,
    cy,
    tableRadius,
    scale,
    tableAngleRad,
    armPixelLength,
    m1VisualOffset,
    m2VisualOffset,
    laserPos,
    bsPos,
    m1Pos,
    m2Pos,
    detectorPos
  };
}

/**
 * 캔버스 화면 좌표(canvasX, canvasY)를 회전된 턴테이블 내부 로컬 좌표(localX, localY)로 역변환합니다.
 */
export function screenToTurntableLocal(canvasX, canvasY, geom) {
  const dx = canvasX - geom.cx;
  const dy = canvasY - geom.cy;
  const cosA = Math.cos(-geom.tableAngleRad);
  const sinA = Math.sin(-geom.tableAngleRad);
  return {
    localX: dx * cosA - dy * sinA,
    localY: dx * sinA + dy * cosA,
    distFromCenter: Math.hypot(dx, dy),
    worldAngleRad: Math.atan2(dy, dx)
  };
}

/**
 * 마우스 포인터 위치(canvasX, canvasY)에 있는 광학 기구 부품을 판별합니다.
 */
export function hitTestOpticalBench(canvasX, canvasY, width, height, state) {
  const geom = computeBenchGeometry(width, height, state);
  const s = geom.scale;
  const { localX, localY, distFromCenter } = screenToTurntableLocal(canvasX, canvasY, geom);

  // 1) 거울 M1 히트 판정 (세로 암 상단)
  if (Math.abs(localX - geom.m1Pos.x) <= 44 * s && Math.abs(localY - geom.m1Pos.y) <= 24 * s) {
    return {
      id: 'mirror1',
      title: '거울 M1 (세로 암 반사경)',
      detail: `변위 ΔL1: ${state.config.mirror1.deltaLengthUm.toFixed(3)} μm | 틸트: ${state.config.mirror1.tiltXMrads.toFixed(2)} mrad (위/아래 드래그로 이동)`,
      cursor: 'ns-resize'
    };
  }

  // 2) 거울 M2 히트 판정 (가로 암 우측)
  if (Math.abs(localX - geom.m2Pos.x) <= 24 * s && Math.abs(localY - geom.m2Pos.y) <= 44 * s) {
    return {
      id: 'mirror2',
      title: '거울 M2 (가로 암 반사경)',
      detail: `변위 ΔL2: ${state.config.mirror2.deltaLengthUm.toFixed(3)} μm (좌/우 드래그로 이동)`,
      cursor: 'ew-resize'
    };
  }

  // 3) 중앙 단일 빔 스플리터 히트 판정
  if (Math.hypot(localX - geom.bsPos.x, localY - geom.bsPos.y) <= 40 * s) {
    return {
      id: 'beamsplitter',
      title: '중앙 50:50 빔 스플리터 (유한 두께 d = 5.0mm)',
      detail: `반절(50%)은 M1으로 반사, 반절(50%)은 굴절(θr=${state.beamSplitter.refractionAngleDeg.toFixed(1)}°) 후 M2로 투과`,
      cursor: 'help'
    };
  }

  // 4) 레이저 광원 히트 판정
  if (Math.abs(localX - geom.laserPos.x) <= 48 * s && Math.abs(localY - geom.laserPos.y) <= 26 * s) {
    return {
      id: 'laser',
      title: `단일 파장 레이저 광원 (${state.config.wavelengthNm.toFixed(1)} nm)`,
      detail: `${state.color.spectralName} | 파수 k = ${(state.wave.waveNumberK / 1e6).toFixed(2)}×10⁶ rad/m`,
      cursor: 'help'
    };
  }

  // 5) 감지기 수광부 히트 판정
  if (Math.abs(localX - geom.detectorPos.x) <= 42 * s && Math.abs(localY - geom.detectorPos.y) <= 24 * s) {
    return {
      id: 'detector',
      title: '간섭 광 감지기 수광부 (Detector)',
      detail: `M1 반사파와 M2 반사파가 각각 수광부로 입사됨 (중심 조도: ${(state.normalizedCenterIntensity * 100).toFixed(1)}%)`,
      cursor: 'help'
    };
  }

  // 6) 턴테이블 회전 링 히트 판정
  if (distFromCenter <= geom.tableRadius && distFromCenter >= geom.tableRadius * 0.2) {
    return {
      id: 'turntable',
      title: `실험 세트 회전 턴테이블 (현재 ${state.config.turntable.angleDeg.toFixed(1)}°)`,
      detail: '원판을 마우스로 잡고 돌리면 실험 세트 전체가 회전합니다.',
      cursor: 'grab'
    };
  }

  return null;
}

/**
 * 두 점 (x1, y1) -> (x2, y2) 구간에 사인곡선(Sinusoidal Wave) 광선을 그립니다.
 */
export function drawSineWaveSegment(ctx, x1, y1, x2, y2, waveOpts) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;

  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  const {
    wavelengthPx = 22,
    amplitudePx = 7,
    phaseRad = 0,
    strokeStyle = '#ff0000',
    lineWidth = 2.5,
    showAxisGuide = true
  } = waveOpts;

  const kVis = (2 * Math.PI) / Math.max(4, wavelengthPx);

  ctx.save();

  if (showAxisGuide) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = strokeStyle;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();

  const stepPx = 1.5;
  const steps = Math.ceil(dist / stepPx);
  for (let i = 0; i <= steps; i++) {
    const s = Math.min(dist, i * stepPx);
    const waveOffset = amplitudePx * Math.sin(kVis * s + phaseRad);
    const px = x1 + ux * s + nx * waveOffset;
    const py = y1 + uy * s + ny * waveOffset;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function renderOpticalBench(ctx, state, options = {}) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const timePhase = Number(options.timePhase ?? 0);
  const hoveredId = options.hoveredComponentId || null;

  const geom = computeBenchGeometry(width, height, state);
  const s = geom.scale;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // 1. 배경 어두운 랙 그리드
  ctx.fillStyle = '#080c14';
  ctx.fillRect(0, 0, width, height);

  drawBenchBackgroundGrid(ctx, width, height, s);

  // 2. 외부 기준계 에테르 바람 화살표 표시
  drawEtherWindIndicator(ctx, state, width, height, s);

  // 3. 턴테이블 베이스 회전 적용
  ctx.save();
  ctx.translate(geom.cx, geom.cy);

  drawTurntableBase(ctx, geom.tableRadius, s, hoveredId === 'turntable');

  ctx.rotate(geom.tableAngleRad);

  // 4. 사인곡선 광선 추적 렌더링 (감지기 경로에서는 합산하지 않고 M1, M2 반사파를 각각 분리 표시)
  drawSinusoidalRayPaths(
    ctx,
    state,
    geom.laserPos,
    geom.bsPos,
    geom.m1Pos,
    geom.m2Pos,
    geom.detectorPos,
    timePhase,
    s
  );

  // 5. 광학 기구 부품 렌더링 (큼직한 스케일 s 적용)
  drawLaserEmitter(ctx, geom.laserPos, state, s, hoveredId === 'laser');
  drawSingleBeamSplitter(ctx, geom.bsPos, state, s, hoveredId === 'beamsplitter');
  drawMirror(ctx, geom.m1Pos, 'M1 (세로 거울)', 'horizontal', state.config.mirror1, s, hoveredId === 'mirror1');
  drawMirror(ctx, geom.m2Pos, 'M2 (가로 거울)', 'vertical', state.config.mirror2, s, hoveredId === 'mirror2');
  drawDetectorBezel(ctx, geom.detectorPos, state, s, hoveredId === 'detector');

  ctx.restore();
  ctx.restore();
}

function drawBenchBackgroundGrid(ctx, w, h, s) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const step = Math.round(32 * s);
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

function drawEtherWindIndicator(ctx, state, w, h, s) {
  const isEther = state.config.turntable.physicsMode === 'ETHER';
  const speed = state.config.turntable.etherSpeedKmS;
  const boxW = 165 * s;
  const boxH = 60 * s;

  ctx.save();
  ctx.translate(w - boxW * 0.55 - 14, boxH * 0.55 + 14);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = isEther ? '#38bdf8' : 'rgba(148, 163, 184, 0.4)';
  ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, 8 * s);
  ctx.fill();
  ctx.stroke();

  ctx.font = `bold ${Math.round(11 * s)}px sans-serif`;
  ctx.fillStyle = isEther ? '#38bdf8' : '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText(isEther ? '가상 에테르 바람 (v)' : '에테르 불검출 (SRT)', 0, -9 * s);
  ctx.font = `bold ${Math.round(12 * s)}px monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${speed.toFixed(0)} km/s (좌→우)`, 0, 9 * s);

  if (isEther) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(-48 * s, 19 * s);
    ctx.lineTo(48 * s, 19 * s);
    ctx.lineTo(39 * s, 14 * s);
    ctx.moveTo(48 * s, 19 * s);
    ctx.lineTo(39 * s, 24 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTurntableBase(ctx, radius, s, isHovered) {
  const grad = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius);
  grad.addColorStop(0, '#1e293b');
  grad.addColorStop(0.82, '#111827');
  grad.addColorStop(1, '#090d16');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isHovered ? '#38bdf8' : '#475569';
  ctx.lineWidth = (isHovered ? 4.5 : 3.5) * s;
  ctx.stroke();

  // 십자 광학 레일 가이드 트랙 (벤치 구조물 느낌 강화)
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 18 * s;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.82, 0);
  ctx.lineTo(radius * 0.82, 0);
  ctx.moveTo(0, -radius * 0.82);
  ctx.lineTo(0, radius * 0.82);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#94a3b8';
  ctx.font = `bold ${Math.round(11 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const innerR = radius - (isMajor ? 16 * s : 8 * s);
    const outerR = radius - 2 * s;

    const x1 = Math.cos(rad) * innerR;
    const y1 = Math.sin(rad) * innerR;
    const x2 = Math.cos(rad) * outerR;
    const y2 = Math.sin(rad) * outerR;

    ctx.strokeStyle = isMajor ? '#cbd5e1' : '#475569';
    ctx.lineWidth = (isMajor ? 2.0 : 1.2) * s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (isMajor) {
      const textR = radius - 28 * s;
      ctx.fillText(`${deg}°`, Math.cos(rad) * textR, Math.sin(rad) * textR);
    }
  }
}

function drawSinusoidalRayPaths(ctx, state, laser, bs, m1, m2, det, timePhase, s) {
  const { r, g, b } = state.color;
  // 파장(380~780nm)에 비례하는 사인파 주기 픽셀 길이 (스케일 s 반영)
  const wavelengthPx = (16 + ((state.config.wavelengthNm - 380) / (780 - 380)) * 16) * s;
  const glassExitPt = { x: 11 * s, y: 5.5 * s };

  // M1, M2 각 경로의 위상 계산
  const k = state.wave.waveNumberK;
  const phaseM1 = k * (2.0 * state.mirrors.deltaL1M + state.ether.etherOPDM);
  const phaseM2 = k * (2.0 * state.mirrors.deltaL2M);

  ctx.save();
  ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;
  ctx.shadowBlur = 9 * s;

  // 1) 입사 레이저 사인파 (레이저 노즐 -> 중앙 빔스플리터 전면)
  drawSineWaveSegment(ctx, laser.x + 48 * s, laser.y, bs.x, bs.y, {
    wavelengthPx,
    amplitudePx: 9.0 * s,
    phaseRad: -timePhase,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.98)`,
    lineWidth: 3.0 * s
  });

  // 2) Path 1 (M1 세로 암):
  // 2-a) 빔스플리터 전면 -> 상단 거울 M1 진행파
  drawSineWaveSegment(ctx, bs.x - 5 * s, bs.y, m1.x - 5 * s, m1.y + 5 * s, {
    wavelengthPx,
    amplitudePx: 6.2 * s,
    phaseRad: -timePhase,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.78)`,
    lineWidth: 2.2 * s
  });

  // 2-b) 상단 거울 M1 반사 -> 빔스플리터 복귀파
  drawSineWaveSegment(ctx, m1.x + 5 * s, m1.y + 5 * s, bs.x + 5 * s, bs.y, {
    wavelengthPx,
    amplitudePx: 6.2 * s,
    phaseRad: -timePhase + phaseM1,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.92)`,
    lineWidth: 2.4 * s
  });

  // 3) Path 2 (M2 가로 암):
  // 3-a) 중앙 빔스플리터 유리 내부 굴절 구간
  drawSineWaveSegment(ctx, bs.x, bs.y, glassExitPt.x, glassExitPt.y, {
    wavelengthPx: wavelengthPx / state.beamSplitter.refractiveIndex,
    amplitudePx: 5.0 * s,
    phaseRad: -timePhase,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.92)`,
    lineWidth: 2.3 * s,
    showAxisGuide: false
  });

  // 3-b) 빔스플리터 후면 -> 우측 거울 M2 진행파
  drawSineWaveSegment(ctx, glassExitPt.x, glassExitPt.y - 4 * s, m2.x - 5 * s, m2.y - 4 * s, {
    wavelengthPx,
    amplitudePx: 6.2 * s,
    phaseRad: -timePhase,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.78)`,
    lineWidth: 2.2 * s
  });

  // 3-c) 우측 거울 M2 반사 -> 빔스플리터 복귀파
  drawSineWaveSegment(ctx, m2.x - 5 * s, m2.y + 6 * s, glassExitPt.x, glassExitPt.y + 6 * s, {
    wavelengthPx,
    amplitudePx: 6.2 * s,
    phaseRad: -timePhase + phaseM2,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.92)`,
    lineWidth: 2.4 * s
  });

  // 4) 감지기 방향 경로 (빔스플리터 -> 하단 감지기):
  // 사용자 요청: 합산해서 보여주지 않고, M1에서 반사된 빛과 M2에서 반사된 빛을 따로따로 나란히 보여줌!
  const sepPx = 9.5 * s; // 두 반사파를 좌우로 분리하여 각각의 사인파가 명확히 보이도록 배치

  // 4-a) 좌측 트랙: M1에서 반사되어 투과해 내려오는 사인파
  drawSineWaveSegment(ctx, bs.x - sepPx, glassExitPt.y, det.x - sepPx, det.y - 16 * s, {
    wavelengthPx,
    amplitudePx: 6.2 * s,
    phaseRad: -timePhase + phaseM1,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.95)`,
    lineWidth: 2.5 * s,
    showAxisGuide: true
  });

  // 4-b) 우측 트랙: M2에서 돌아와 반사되어 내려오는 사인파
  drawSineWaveSegment(ctx, bs.x + sepPx, glassExitPt.y, det.x + sepPx, det.y - 16 * s, {
    wavelengthPx,
    amplitudePx: 6.2 * s,
    phaseRad: -timePhase + phaseM2,
    strokeStyle: `rgba(${r}, ${g}, ${b}, 0.95)`,
    lineWidth: 2.5 * s,
    showAxisGuide: true
  });

  // M1 파동 / M2 파동 구분 미니 라벨 표시
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = `bold ${Math.round(10 * s)}px monospace`;
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'right';
  ctx.fillText('M1파', bs.x - sepPx - 10 * s, (glassExitPt.y + det.y) * 0.5);
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'left';
  ctx.fillText('M2파', bs.x + sepPx + 10 * s, (glassExitPt.y + det.y) * 0.5);
  ctx.restore();

  ctx.restore();
}

function drawLaserEmitter(ctx, pos, state, s, isHovered) {
  const boxW = 84 * s;
  const boxH = 38 * s;

  ctx.save();
  ctx.translate(pos.x, pos.y);

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = isHovered ? '#38bdf8' : '#94a3b8';
  ctx.lineWidth = (isHovered ? 3.0 : 2.0) * s;
  ctx.beginPath();
  ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, 6 * s);
  ctx.fill();
  ctx.stroke();

  // 레이저 방출 노즐
  ctx.fillStyle = '#475569';
  ctx.fillRect(boxW * 0.5, -9 * s, 11 * s, 18 * s);

  // 파장 텍스트
  ctx.fillStyle = state.color.rgb;
  ctx.font = `bold ${Math.round(13 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`λ = ${state.config.wavelengthNm.toFixed(0)}nm`, 0, -boxH * 0.5 - 8 * s);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = `bold ${Math.round(13 * s)}px sans-serif`;
  ctx.fillText('LASER', 0, 5 * s);

  ctx.restore();
}

function drawSingleBeamSplitter(ctx, pos, state, s, isHovered) {
  const thicknessPx = 18 * s;
  const lengthPx = 78 * s;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(Math.PI / 4);

  // 유리 기판 본체
  ctx.fillStyle = isHovered ? 'rgba(56, 189, 248, 0.38)' : 'rgba(56, 189, 248, 0.24)';
  ctx.strokeStyle = isHovered ? '#ffffff' : '#38bdf8';
  ctx.lineWidth = (isHovered ? 2.8 : 2.0) * s;
  ctx.fillRect(0, -lengthPx * 0.5, thicknessPx, lengthPx);
  ctx.strokeRect(0, -lengthPx * 0.5, thicknessPx, lengthPx);

  // 전면 50:50 반투과 반사 코팅면
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 3.8 * s;
  ctx.beginPath();
  ctx.moveTo(0, -lengthPx * 0.5);
  ctx.lineTo(0, lengthPx * 0.5);
  ctx.stroke();

  ctx.restore();

  ctx.save();
  ctx.fillStyle = isHovered ? '#38bdf8' : '#e2e8f0';
  ctx.font = `bold ${Math.round(11 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('스플리터(50:50)', pos.x - 48 * s, pos.y + 44 * s);
  ctx.restore();
}

function drawMirror(ctx, pos, label, orientation, mirrorConfig, s, isHovered) {
  const length = 68 * s;
  const thick = 13 * s;
  const tiltMrad = mirrorConfig.tiltXMrads || 0;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(tiltMrad * 0.1);

  ctx.fillStyle = isHovered ? '#1e3a5f' : '#334155';
  ctx.strokeStyle = isHovered ? '#38bdf8' : '#cbd5e1';
  ctx.lineWidth = (isHovered ? 3.0 : 2.0) * s;

  if (orientation === 'horizontal') {
    ctx.fillRect(-length * 0.5, -thick, length, thick);
    ctx.strokeRect(-length * 0.5, -thick, length, thick);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    ctx.moveTo(-length * 0.5, 0);
    ctx.lineTo(length * 0.5, 0);
    ctx.stroke();

    ctx.fillStyle = isHovered ? '#38bdf8' : '#f1f5f9';
    ctx.font = `bold ${Math.round(12 * s)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -thick - 8 * s);
  } else {
    ctx.fillRect(0, -length * 0.5, thick, length);
    ctx.strokeRect(0, -length * 0.5, thick, length);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    ctx.moveTo(0, -length * 0.5);
    ctx.lineTo(0, length * 0.5);
    ctx.stroke();

    ctx.fillStyle = isHovered ? '#38bdf8' : '#f1f5f9';
    ctx.font = `bold ${Math.round(12 * s)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, thick * 0.5, -length * 0.5 - 10 * s);
  }

  ctx.restore();
}

function drawDetectorBezel(ctx, pos, state, s, isHovered) {
  const boxW = 72 * s;
  const boxH = 24 * s;

  ctx.save();
  ctx.translate(pos.x, pos.y);

  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = isHovered ? '#ffffff' : '#38bdf8';
  ctx.lineWidth = (isHovered ? 3.0 : 2.2) * s;
  ctx.beginPath();
  ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, 6 * s);
  ctx.fill();
  ctx.stroke();

  // 수광 센서 창
  ctx.fillStyle = state.color.rgb;
  ctx.fillRect(-boxW * 0.34, -4 * s, boxW * 0.68, 8 * s);

  ctx.fillStyle = isHovered ? '#38bdf8' : '#f1f5f9';
  ctx.font = `bold ${Math.round(12 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('감지기 (Detector)', 0, boxH * 0.5 + 14 * s);

  ctx.restore();
}
