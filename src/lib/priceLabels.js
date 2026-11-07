/**
 * lib/priceLabels.js
 * Формирование HTML-ценников для печати (60×40мм, сетка на A4).
 */

import { buildBarcodeSvg, cleanBarcode } from "./barcode.js";

// Значения по умолчанию — те же, что были зашиты раньше. Реальные берутся из
// настроек приложения (Настройки → Ценники) и передаются в options.
export const DEFAULT_COMPANY_NAME = 'ООО "Алнавьяр"';
export const DEFAULT_COMPANY_UNP = "791441006";
const DEFAULT_UNIT = "шт";

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

const TEXT_WIDTH_MM = 55 * 0.92; // ширина текста на ценнике с запасом на переносы слов

/**
 * Начальный размер шрифта названия: самый крупный, при котором название,
 * по оценке, целиком помещается в отведённую высоту. Название НИКОГДА не
 * обрезается — вместо этого уменьшается шрифт. Оценка приблизительная,
 * точную подгонку по факту делает скрипт внутри html (см. FIT_SCRIPT).
 */
function nameFontSize(name, hasBarcode = false) {
    const maxHeightMm = hasBarcode ? 12 : 16;
    for (const pt of [14, 12.5, 11, 10, 9, 8, 7.5, 7, 6.5, 6, 5.5, 5]) {
        const em = pt * 0.3528;
        const lines = Math.ceil((name.length * em * 0.5) / TEXT_WIDTH_MM);
        if (lines * em * 1.15 <= maxHeightMm) return `${pt}pt`;
    }
    return "4.5pt";
}

// Выполняется при открытии файла в браузере: если название вместе со строкой
// веса не помещается в отведённое место, шрифт названия уменьшается шагами
// по 0,5 pt, пока всё не уместится. Замеряет реальные размеры, поэтому
// работает точнее любой оценки по длине строки.
const FIT_SCRIPT = `
<script>
(function () {
  function fit() {
    document.querySelectorAll(".price-tag").forEach(function (tag) {
      var body = tag.querySelector(".tag-body");
      var name = tag.querySelector(".product-name");
      if (!body || !name) return;
      var size = parseFloat(name.style.fontSize) || 10;
      while (body.scrollHeight > body.clientHeight + 0.5 && size > 4) {
        size -= 0.5;
        name.style.fontSize = size + "pt";
      }
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  else window.addEventListener("load", fit);
})();
</script>`;

function priceCaption(unit, pricePerUnit) {
    const u = (unit || DEFAULT_UNIT).toLowerCase();
    if (u === DEFAULT_UNIT) return `Цена за штуку: ${pricePerUnit} руб.`;
    return `Цена за 1 ${u}: ${pricePerUnit} руб.`;
}

function buildBarcodeHtml(rawBarcode) {
    if (!rawBarcode) return "";
    const built = buildBarcodeSvg(rawBarcode);
    if (built) {
        return `<div class="barcode-block">${built.svg}<div class="barcode-digits">${built.digits}</div></div>`;
    }
    // Не EAN/UPC (или неверная контрольная цифра) — полосы не рисуем, чтобы не
    // печатать код, который не отсканируется; номер всё равно показываем.
    const digits = cleanBarcode(rawBarcode);
    return digits
        ? `<div class="barcode-block"><div class="barcode-digits">${escapeHtml(digits)}</div></div>`
        : "";
}

function buildCardHtml(row, options) {
    const name = escapeHtml(row.name);
    const country = escapeHtml(row.country);
    const retailPrice = escapeHtml(row.retailPrice);
    const caption = escapeHtml(priceCaption(row.unit, row.pricePerUnit));
    const barcodeHtml = options.printBarcode ? buildBarcodeHtml(row.barcode) : "";
    const hasBarcode = Boolean(barcodeHtml);
    const fontSize = nameFontSize(row.name, hasBarcode);
    const headerText = [options.companyName, options.companyUnp ? `УНП ${options.companyUnp}` : ""]
        .filter(Boolean)
        .join(" ");
    const headerHtml = headerText ? `<div class="tag-header">${escapeHtml(headerText)}</div>` : "";
    const currentDate = new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(new Date());

    // Страна и дата — рядом, справа; штрихкод (если печатается) — слева.
    const originHtml =
        `<div class="tag-origin">` +
        (country ? `<span class="country">Страна: ${country}</span>` : "") +
        `<span class="print-date">${currentDate}</span>` +
        `</div>`;

    const weightText = row.weight ? `Вес / Объём: ${row.weight} ${row.unit || DEFAULT_UNIT}` : "";
    const sortText = row.sortGrade ? `Сорт / вид: ${row.sortGrade}` : "";

    let metaHtml = "";
    if (hasBarcode) {
        // Со штрихкодом места мало: вес и сорт выводим одной строкой.
        const joined = [weightText, sortText].filter(Boolean).join(" · ");
        if (joined) metaHtml = `<div class="meta-line">${escapeHtml(joined)}</div>`;
    } else {
        if (weightText) metaHtml += `<div class="weight-line">${escapeHtml(weightText)}</div>`;
        if (sortText) metaHtml += `<div class="sort-line">${escapeHtml(sortText)}</div>`;
    }

    return `
    <div class="price-tag${hasBarcode ? " has-barcode" : ""}">
        ${headerHtml}

        <div class="tag-body">
            <div class="product-name" style="font-size:${fontSize}">${name}</div>
            ${metaHtml}
        </div>

        <div class="tag-price-block">
            <div class="retail-price">${retailPrice} <span class="currency">руб.</span></div>
            <div class="price-per-unit">${caption}</div>
        </div>

        ${hasBarcode ? '<div class="tag-spacer"></div>' : ""}
        <div class="tag-footer${hasBarcode ? " tag-footer-barcode" : ""}">
            ${barcodeHtml}
            ${originHtml}
        </div>
    </div>
    `;
}

/**
 * @param {object[]} rowsData массив {name, retailPrice, pricePerUnit, unit, weight, sortGrade, country, barcode}
 * @param {{companyName?: string, companyUnp?: string, printBarcode?: boolean}} [options]
 * @returns {string} полный HTML-документ, готовый к печати
 */
export function buildLabelsHtml(rowsData, options = {}) {
    const resolved = {
        companyName: options.companyName ?? DEFAULT_COMPANY_NAME,
        companyUnp: options.companyUnp ?? DEFAULT_COMPANY_UNP,
        printBarcode: Boolean(options.printBarcode),
    };
    const cardsHtml = rowsData.map((row) => buildCardHtml(row, resolved)).join("");

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Ценники SmartPrice-РБ</title>
<style>
    @page {
        size: A4;
        margin: 10mm;
    }
    * {
        box-sizing: border-box;
    }
    body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 0;
        padding: 0;
    }
    .tags-grid {
        display: grid;
        grid-template-columns: repeat(3, 60mm);
        grid-auto-rows: 42mm;
        gap: 4mm;
        justify-content: center;
    }
    .price-tag {
        width: 60mm;
        height: 42mm;
        border: 1px solid #000;
        padding: 1.5mm 2.5mm 2mm;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        page-break-inside: avoid;
    }
    .tag-header {
        font-size: 6.5pt;
        font-weight: 700;
        letter-spacing: 0.2pt;
        text-align: center;
        text-transform: uppercase;
        border-bottom: 0.4pt solid #000;
        padding-bottom: 0.8mm;
        margin-bottom: 0.8mm;
        flex: 0 0 auto;
    }
    .tag-body {
        flex: 0 1 auto;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 0.5mm;
    }
    .product-name {
        font-weight: bold;
        line-height: 1.15;
        word-break: break-word;
        hyphens: auto;
    }
    .weight-line {
        font-size: 6pt;
        line-height: 1.1;
        color: #444;
        margin-top: 0.5mm;
    }
    .meta-line {
        font-size: 5.5pt;
        line-height: 1.1;
        color: #444;
    }
    .sort-line {
        font-size: 5.5pt;
        line-height: 1.1;
        color: #222;
    }
    .tag-price-block {
        flex: 0 0 auto;
        padding-top: 1.5mm;
        border-top: 0.3pt solid #ccc;
        margin-top: auto;
        margin-bottom: auto;
    }
    .retail-price {
        font-size: 17pt;
        font-weight: bold;
        text-align: center;
        line-height: 1;
    }
    .retail-price .currency {
        font-size: 9pt;
    }
    .price-per-unit {
        font-size: 6.5pt;
        text-align: center;
        line-height: 1.2;
        margin-top: 0.5mm;
    }
    .tag-footer {
        display: flex;
        justify-content: flex-end;
        align-items: flex-end;
        gap: 2mm;
        margin-top: 1.5mm;
        flex: 0 0 auto;
    }
    /* Со штрихкодом: он слева, страна и дата — справа */
    .tag-footer-barcode {
        justify-content: space-between;
        align-items: flex-end;
        padding-top: 1.5mm; /* минимальный отступ между ценой и штрихкодом */
    }
    /* Распорка забирает весь свободный запас высоты, поэтому нижний блок
       (штрихкод, страна, дата) всегда прижат ко дну ценника, а запас
       оказывается между ценой и штрихкодом. */
    .tag-spacer {
        flex: 1 1 0;
        min-height: 0;
    }
    .tag-origin {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: baseline;
        column-gap: 1.5mm;
        text-align: right;
    }
    .tag-footer-barcode .tag-origin {
        flex-direction: column;
        align-items: flex-end;
        max-width: 22mm;
    }
    .country {
        font-size: 5.5pt;
        line-height: 1.15;
        color: #333;
    }
    .print-date {
        font-size: 5pt;
        line-height: 1;
        color: #555;
    }
    .barcode-block {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-left: -2mm; /* тихая зона штрихкода уходит в поле ценника */
    }
    .barcode-svg {
        display: block;
        width: 32mm;
        height: 6mm;
    }
    .barcode-digits {
        font-size: 6pt;
        letter-spacing: 0.6pt;
        line-height: 1; /* такая же, как у даты — нижние края выравниваются */
        margin-top: 0.4mm;
    }
    /* Со штрихкодом цена чуть компактнее, чтобы всё поместилось в 60×42 мм */
    .has-barcode {
        padding-bottom: 2.2mm;
    }
    .has-barcode .tag-price-block {
        margin-top: 0;
        margin-bottom: 0;
        padding-top: 2mm; /* отступ между разделительной линией и ценой */
    }
    .has-barcode .retail-price {
        font-size: 15pt;
    }
    @media print {
        .price-tag {
            border: 1px solid #000;
        }
    }
</style>
</head>
<body>
    <div class="tags-grid">
        ${cardsHtml}
    </div>
${FIT_SCRIPT}
</body>
</html>
`;
}