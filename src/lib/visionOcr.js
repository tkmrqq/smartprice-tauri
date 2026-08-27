/**
 * lib/visionOcr.js
 * Распознавание бумажных накладных через Google Cloud Vision API
 * (REST + API key). Использует @tauri-apps/plugin-http, чтобы обойти
 * CORS-ограничения webview при обращении к внешнему API.
 */
import { fetch } from "@tauri-apps/plugin-http";
import { readFile } from "@tauri-apps/plugin-fs";
import { MIN_CONFIDENCE, parseProductsFromBlocks } from "./invoiceLayoutParser.js";

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const REQUEST_TIMEOUT_MS = 30_000;

export class VisionOcrError extends Error {}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function wordText(word) {
  return (word.symbols || []).map((s) => s.text || "").join("");
}

function bboxToCoords(boundingBox) {
  const vertices = boundingBox?.vertices || boundingBox?.normalizedVertices;
  if (!vertices || !vertices.length) return null;
  const xs = vertices.map((v) => v.x || 0);
  const ys = vertices.map((v) => v.y || 0);
  const xLeft = Math.min(...xs);
  const xRight = Math.max(...xs);
  const yTop = Math.min(...ys);
  const yBottom = Math.max(...ys);
  return {
    xLeft,
    xRight,
    xCenter: (xLeft + xRight) / 2,
    yTop,
    yBottom,
    yCenter: (yTop + yBottom) / 2,
    height: yBottom - yTop,
  };
}

function extractWordBlocks(apiResponse) {
  const blocks = [];
  const pages = apiResponse.fullTextAnnotation?.pages || [];
  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const text = wordText(word).trim();
          if (!text) continue;
          const confidence = word.confidence ?? 1.0;
          if (confidence < MIN_CONFIDENCE) continue;
          const coords = bboxToCoords(word.boundingBox || {});
          if (!coords) continue;
          blocks.push({ ...coords, text, confidence });
        }
      }
    }
  }
  return blocks;
}

/**
 * @param {string} imagePath абсолютный путь к файлу изображения на диске
 * @param {object} options
 * @param {string} options.apiKey ключ Google Vision API
 * @param {string[]} [options.languageHints]
 * @returns {Promise<object[]>} список товаров [{name, purchasePrice, weightOrVolume, quantity}]
 */
export async function extractProductsFromInvoicePhoto(imagePath, { apiKey, languageHints = ["ru", "be"] } = {}) {
  if (!apiKey) {
    throw new VisionOcrError(
      "Ключ Google Vision API не задан. Добавьте его в настройках приложения."
    );
  }

  const bytes = await readFile(imagePath);
  const imageContent = bytesToBase64(bytes);

  const payload = {
    requests: [
      {
        image: { content: imageContent },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints },
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (exc) {
    throw new VisionOcrError(`Не удалось обратиться к Google Vision API: ${exc}`);
  } finally {
    clearTimeout(timeoutId);
  }

  let data;
  try {
    data = await response.json();
  } catch (exc) {
    throw new VisionOcrError(`Google Vision вернул не-JSON ответ (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const message = data?.error?.message || (await response.text?.()) || response.status;
    throw new VisionOcrError(`Google Vision API вернул ошибку: ${message}`);
  }

  const apiResponse = (data.responses || [{}])[0];
  if (apiResponse.error) {
    throw new VisionOcrError(`Google Vision API вернул ошибку: ${apiResponse.error.message}`);
  }

  const blocks = extractWordBlocks(apiResponse);
  return parseProductsFromBlocks(blocks);
}
