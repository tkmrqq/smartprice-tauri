import './setup-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEdinXml } from '../src/lib/edinParser.js';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Root>
  <DeliveryNote>
    <DeliveryNoteID>DN-12345</DeliveryNoteID>
    <DeliveryNoteDate>2026-08-20</DeliveryNoteDate>
    <WaybillID>WB-999</WaybillID>
    <Currency>BYN</Currency>
    <Shipper>
      <Name>ООО Тестовый Поставщик</Name>
    </Shipper>
    <DespatchAdviceLogisticUnitLineItem>
      <LineItem>
        <LineItemSign>PROD</LineItemSign>
        <LineItemID>4810123456789</LineItemID>
        <LineItemName>Молоко Бабушкино 900мл 2.5%</LineItemName>
        <LineItemPrice>2,15</LineItemPrice>
        <TaxRate>20</TaxRate>
        <QuantityDespatched>12</QuantityDespatched>
        <CountryOfOrigin>BY</CountryOfOrigin>
      </LineItem>
      <LineItem>
        <LineItemSign>PROD</LineItemSign>
        <LineItemID>4810987654321</LineItemID>
        <LineItemName>Сыр Российский 1кг</LineItemName>
        <FieldCostControl>
          <LineItemManufacturerOutputPrice>18,90</LineItemManufacturerOutputPrice>
        </FieldCostControl>
        <TaxRate>10</TaxRate>
        <QuantityDespatched>5</QuantityDespatched>
        <CountryOfOrigin>RU</CountryOfOrigin>
      </LineItem>
      <LineItem>
        <LineItemSign>SERVICE</LineItemSign>
        <LineItemName>Доставка</LineItemName>
        <LineItemPrice>10,00</LineItemPrice>
      </LineItem>
    </DespatchAdviceLogisticUnitLineItem>
  </DeliveryNote>
</Root>`;

test('parses meta correctly', () => {
  const { meta } = parseEdinXml(sampleXml);
  assert.equal(meta.documentId, 'DN-12345');
  assert.equal(meta.shipperName, 'ООО Тестовый Поставщик');
  assert.equal(meta.currency, 'BYN');
});

test('parses products, skips non-PROD lines', () => {
  const { products } = parseEdinXml(sampleXml);
  assert.equal(products.length, 2);
});

test('extracts weight/volume from name (мл -> л)', () => {
  const { products } = parseEdinXml(sampleXml);
  const milk = products.find((p) => p.name.includes('Молоко'));
  assert.equal(milk.purchasePrice, 2.15);
  assert.equal(milk.weightOrVolume, 0.9);
  assert.equal(milk.unit, 'л');
  assert.equal(milk.country, 'Беларусь');
  assert.equal(milk.quantity, 12);
});

test('falls back to FieldCostControl price, maps country RU', () => {
  const { products } = parseEdinXml(sampleXml);
  const cheese = products.find((p) => p.name.includes('Сыр'));
  assert.equal(cheese.purchasePrice, 18.9);
  assert.equal(cheese.country, 'Россия');
  assert.equal(cheese.weightOrVolume, 1);
  assert.equal(cheese.unit, 'кг');
});

test('throws on missing DeliveryNote', () => {
  assert.throws(() => parseEdinXml('<Root><Nope/></Root>'));
});
