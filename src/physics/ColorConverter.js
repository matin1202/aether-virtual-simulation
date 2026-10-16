/**
 * @file ColorConverter.js
 * @description 단일 파장(Monochromatic Wavelength, 380nm ~ 780nm)을
 * 가시광선 RGB 색상 및 광학 파동 파라미터(파수 k, 각주파수 ω 등)로 변환하는 모듈.
 */

export const SPEED_OF_LIGHT = 299792458; // m/s (진공 중 빛의 속도)
export const MIN_WAVELENGTH_NM = 380;
export const MAX_WAVELENGTH_NM = 780;

/**
 * 파장(nm)을 입력받아 CIE 가시광선 스펙트럼 근사 기반의 RGB 색상 객체를 반환합니다.
 * @param {number} wavelengthNm - 빛의 파장 (단위: nm, 권장 범위 380 ~ 780)
 * @param {number} [gamma=0.8] - 감마 보정 지수
 * @returns {{
 *   wavelengthNm: number,
 *   r: number,
 *   g: number,
 *   b: number,
 *   rNorm: number,
 *   gNorm: number,
 *   bNorm: number,
 *   hex: string,
 *   rgb: string,
 *   spectralName: string
 * }}
 */
export function wavelengthToRGB(wavelengthNm, gamma = 0.8) {
  const wl = Math.max(MIN_WAVELENGTH_NM, Math.min(MAX_WAVELENGTH_NM, Number(wavelengthNm) || 632.8));

  let r = 0.0;
  let g = 0.0;
  let b = 0.0;

  if (wl >= 380 && wl < 440) {
    r = -(wl - 440) / (440 - 380);
    g = 0.0;
    b = 1.0;
  } else if (wl >= 440 && wl < 490) {
    r = 0.0;
    g = (wl - 440) / (490 - 440);
    b = 1.0;
  } else if (wl >= 490 && wl < 510) {
    r = 0.0;
    g = 1.0;
    b = -(wl - 510) / (510 - 490);
  } else if (wl >= 510 && wl < 580) {
    r = (wl - 510) / (580 - 510);
    g = 1.0;
    b = 0.0;
  } else if (wl >= 580 && wl < 645) {
    r = 1.0;
    g = -(wl - 645) / (645 - 580);
    b = 0.0;
  } else if (wl >= 645 && wl <= 780) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  }

  // 가시광선 경계 영역(자외선/적외선 인접부) 시감도 감쇠 처리
  let intensityFactor = 1.0;
  if (wl >= 380 && wl < 420) {
    intensityFactor = 0.3 + (0.7 * (wl - 380)) / (420 - 380);
  } else if (wl >= 700 && wl <= 780) {
    intensityFactor = 0.3 + (0.7 * (780 - wl)) / (780 - 700);
  }

  const rNorm = r > 0 ? Math.pow(r * intensityFactor, gamma) : 0;
  const gNorm = g > 0 ? Math.pow(g * intensityFactor, gamma) : 0;
  const bNorm = b > 0 ? Math.pow(b * intensityFactor, gamma) : 0;

  const rByte = Math.round(Math.min(1, Math.max(0, rNorm)) * 255);
  const gByte = Math.round(Math.min(1, Math.max(0, gNorm)) * 255);
  const bByte = Math.round(Math.min(1, Math.max(0, bNorm)) * 255);

  const toHex = (n) => n.toString(16).padStart(2, '0');
  const hex = `#${toHex(rByte)}${toHex(gByte)}${toHex(bByte)}`;

  return {
    wavelengthNm: wl,
    r: rByte,
    g: gByte,
    b: bByte,
    rNorm,
    gNorm,
    bNorm,
    hex,
    rgb: `rgb(${rByte}, ${gByte}, ${bByte})`,
    spectralName: getSpectralBandName(wl)
  };
}

/**
 * 파장 대역의 한국어 명칭을 반환합니다.
 * @param {number} wavelengthNm
 * @returns {string}
 */
export function getSpectralBandName(wavelengthNm) {
  if (wavelengthNm < 450) return '자색/보라색광 (Violet)';
  if (wavelengthNm < 495) return '청색광 (Blue)';
  if (wavelengthNm < 570) return '녹색광 (Green)';
  if (wavelengthNm < 590) return '황색광 (Yellow)';
  if (wavelengthNm < 620) return '주황색광 (Orange)';
  return '적색광 (Red)';
}

/**
 * 단일 파장 레이저의 물리적 파동 파라미터를 계산합니다.
 * @param {number} wavelengthNm - 파장 (nm)
 * @returns {{
 *   wavelengthNm: number,
 *   wavelengthM: number,
 *   waveNumberK: number,
 *   frequencyHz: number,
 *   angularFrequencyOmega: number
 * }}
 */
export function calculateWaveParameters(wavelengthNm) {
  const wlNm = Math.max(MIN_WAVELENGTH_NM, Math.min(MAX_WAVELENGTH_NM, Number(wavelengthNm) || 632.8));
  const wavelengthM = wlNm * 1e-9;
  const waveNumberK = (2 * Math.PI) / wavelengthM;
  const frequencyHz = SPEED_OF_LIGHT / wavelengthM;
  const angularFrequencyOmega = 2 * Math.PI * frequencyHz;

  return {
    wavelengthNm: wlNm,
    wavelengthM,
    waveNumberK,
    frequencyHz,
    angularFrequencyOmega
  };
}
