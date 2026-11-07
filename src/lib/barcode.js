/**
 * lib/barcode.js
 * Генерация штрихкода для ценника без внешних библиотек: EAN-13, EAN-8 и
 * UPC-A (12 цифр — печатается как EAN-13 с ведущим нулём). Результат —
 * встроенный SVG, поэтому html-файл с ценниками остаётся самодостаточным.
 */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];

// Чётность шести левых цифр EAN-13 определяется первой цифрой.
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const START_END = "101";
const CENTER = "01010";
const QUIET_ZONE_MODULES = 7;

/** Оставляет только цифры; пустая строка, если штрихкода нет. */
export function cleanBarcode(raw) {
  return String(raw ?? "").replace(/\D/g, "");
}

/** Проверяет контрольную цифру EAN-13/EAN-8 (последняя цифра кода). */
export function hasValidEanChecksum(digits) {
  if (!/^\d+$/.test(digits) || (digits.length !== 13 && digits.length !== 8)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // Вес 3 у крайней правой цифры тела кода, дальше чередуется 1 и 3.
    const fromRight = body.length - 1 - i;
    sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[digits.length - 1]);
}

/**
 * Приводит введённый код к печатаемому виду.
 * @returns {{kind: "ean13"|"ean8", digits: string} | null} null — если это
 *   не корректный EAN/UPC (печатать полосы нельзя, код не отсканируется).
 */
export function normalizeForPrint(raw) {
  let digits = cleanBarcode(raw);
  if (digits.length === 12) digits = `0${digits}`; // UPC-A -> EAN-13
  if (digits.length === 13 && hasValidEanChecksum(digits)) return { kind: "ean13", digits };
  if (digits.length === 8 && hasValidEanChecksum(digits)) return { kind: "ean8", digits };
  return null;
}

function encodeEan13(digits) {
  const parity = PARITY[Number(digits[0])];
  let bits = START_END;
  for (let i = 0; i < 6; i++) {
    const digit = Number(digits[i + 1]);
    bits += parity[i] === "L" ? L[digit] : G[digit];
  }
  bits += CENTER;
  for (let i = 7; i < 13; i++) bits += R[Number(digits[i])];
  return bits + START_END;
}

function encodeEan8(digits) {
  let bits = START_END;
  for (let i = 0; i < 4; i++) bits += L[Number(digits[i])];
  bits += CENTER;
  for (let i = 4; i < 8; i++) bits += R[Number(digits[i])];
  return bits + START_END;
}

/** Строка из 0/1 — состояние каждого модуля (1 = чёрная полоса). */
export function encodeBars(raw) {
  const normalized = normalizeForPrint(raw);
  if (!normalized) return null;
  return normalized.kind === "ean13" ? encodeEan13(normalized.digits) : encodeEan8(normalized.digits);
}

/**
 * SVG со штрихкодом (с тихими зонами по краям). Размер задаётся снаружи
 * через CSS/атрибуты, внутри — единицы модулей.
 * @returns {{svg: string, digits: string} | null}
 */
export function buildBarcodeSvg(raw, { heightUnits = 40 } = {}) {
  const normalized = normalizeForPrint(raw);
  if (!normalized) return null;

  const bits = encodeBars(raw);
  const width = bits.length + QUIET_ZONE_MODULES * 2;

  // Соседние чёрные модули склеиваем в один прямоугольник.
  const rects = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let j = i;
      while (j < bits.length && bits[j] === "1") j++;
      rects.push(`<rect x="${i + QUIET_ZONE_MODULES}" y="0" width="${j - i}" height="${heightUnits}"/>`);
      i = j;
    } else {
      i++;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="barcode-svg" viewBox="0 0 ${width} ${heightUnits}" ` +
    `preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000" role="img" ` +
    `aria-label="Штрихкод ${normalized.digits}">${rects.join("")}</svg>`;

  return { svg, digits: normalized.digits };
}
