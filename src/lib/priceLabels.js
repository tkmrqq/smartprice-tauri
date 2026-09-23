/**
 * lib/priceLabels.js
 * Формирование HTML-ценников для печати (60×40мм, сетка на A4).
 */

const COMPANY_NAME = 'ООО "Алнавьяр"';
const COMPANY_UNP = "791441006";
const DEFAULT_UNIT = "шт";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Автоподбор размера шрифта названия товара под ценник 60×40мм:
 * чем длиннее название, тем мельче шрифт, чтобы оно уместилось.
 */
function nameFontSize(name) {
  const length = name.length;
  if (length <= 35) return "14pt";
  if (length <= 55) return "11pt";
  if (length <= 75) return "8pt";
  return "6.5pt";
}

function priceCaption(unit, pricePerUnit) {
  const u = (unit || DEFAULT_UNIT).toLowerCase();
  if (u === DEFAULT_UNIT) return `Цена за штуку: ${pricePerUnit} руб.`;
  return `Цена за 1 ${u}: ${pricePerUnit} руб.`;
}

function buildCardHtml(row) {
  const name = escapeHtml(row.name);
  const country = escapeHtml(row.country);
  const retailPrice = escapeHtml(row.retailPrice);
  const caption = escapeHtml(priceCaption(row.unit, row.pricePerUnit));
  const fontSize = nameFontSize(row.name);
  const currentDate = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  let weightHtml = "";
  if (row.weight) {
    const unitStr = escapeHtml(row.unit || DEFAULT_UNIT);
    const weightVal = escapeHtml(row.weight);
    weightHtml = `<div class="weight-line">Вес / Объём: ${weightVal} ${unitStr}</div>`;
  }

  let sortHtml = "";
  if (row.sortGrade) {
    sortHtml = `<div class="sort-line">Сорт / вид: ${escapeHtml(row.sortGrade)}</div>`;
  }

  return `
    <div class="price-tag">
        <div class="tag-header">${escapeHtml(COMPANY_NAME)} УНП ${escapeHtml(COMPANY_UNP)}</div>

        <div class="tag-body">
            <div class="product-name" style="font-size:${fontSize}">${name}</div>
            ${weightHtml}
            ${sortHtml}
        </div>

        <div class="tag-price-block">
            <div class="retail-price">${retailPrice} <span class="currency">руб.</span></div>
            <div class="price-per-unit">${caption}</div>
        </div>

        <div class="tag-footer">
            <div class="print-date">${currentDate}</div>
            <div class="country">Страна происхождения: ${country}</div>
        </div>
    </div>
    `;
}

/**
 * @param {object[]} rowsData массив {name, retailPrice, pricePerUnit, unit, weight, sortGrade, country}
 * @returns {string} полный HTML-документ, готовый к печати
 */
export function buildLabelsHtml(rowsData) {
  const cardsHtml = rowsData.map(buildCardHtml).join("");

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
        flex: 0 0 auto;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 0.5mm;
    }
    .product-name {
        font-weight: bold;
        line-height: 1.15;
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 5;
        word-break: break-word;
        hyphens: auto;
    }
    .weight-line {
        font-size: 6pt;
        line-height: 1.1;
        color: #444;
        margin-top: 0.5mm;
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
        justify-content: space-between;
        align-items: flex-end;
        margin-top: 1.5mm;
        flex: 0 0 auto;
    }
    .print-date {
        font-size: 4.5pt;
        color: #555;
        line-height: 1.1;
    }
    .country {
        font-size: 5.5pt;
        line-height: 1.1;
        color: #333;
        text-align: right;
        max-width: 75%;
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
</body>
</html>
`;
}
