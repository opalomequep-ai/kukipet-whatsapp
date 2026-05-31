import { google, sheets_v4 } from "googleapis";
import type { PedidoConfirmado, Producto } from "./types.js";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_PRECIOS = process.env.SHEET_PRECIOS || "Precios";
const SHEET_PEDIDOS = process.env.SHEET_PEDIDOS || "Pedidos";
const CACHE_TTL_MS = Number(process.env.PRECIOS_CACHE_TTL || 300) * 1000;

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

let cache: { at: number; data: Producto[] } | null = null;

function parsePrecio(raw: string | undefined): number {
  if (!raw) return 0;
  const limpio = String(raw)
    .replace(/[^0-9,.\-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export async function getProductos(force = false): Promise<Producto[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PRECIOS}!A1:Z1000`,
  });

  const rows = res.data.values || [];
  if (rows.length === 0) {
    cache = { at: Date.now(), data: [] };
    return [];
  }

  let headerIdx = rows.findIndex((r) =>
    r.some((c) => norm(String(c || "")) === "categoria")
  );
  if (headerIdx === -1) headerIdx = 0;

  const headers = rows[headerIdx].map((h) => norm(String(h || "")));
  const find = (...names: string[]) =>
    headers.findIndex((h) => names.some((n) => h === norm(n) || h.includes(norm(n))));

  const idxCat = find("categoria");
  const idxCod = find("codigo", "código");
  const idxNom = find("producto", "nombre");
  const idxUni = find("unidades", "unidad");
  const idxPre = find("precio", "precios", "valor");

  const productos: Producto[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;
    const codigo = String(row[idxCod] || "").trim();
    const nombre = String(row[idxNom] || "").trim();
    if (!codigo && !nombre) continue;

    const raw: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (h) raw[h] = String(row[j] || "").trim();
    });

    productos.push({
      categoria: String(row[idxCat] || "").trim(),
      codigo,
      nombre,
      unidad: String(row[idxUni] || "u").trim(),
      precio: parsePrecio(row[idxPre]),
      raw,
    });
  }

  cache = { at: Date.now(), data: productos };
  return productos;
}

export function buscarProducto(productos: Producto[], texto: string): Producto[] {
  const q = norm(texto);
  if (!q) return [];
  return productos.filter(
    (p) =>
      norm(p.codigo) === q ||
      norm(p.nombre).includes(q) ||
      norm(p.categoria).includes(q)
  );
}

export async function registrarPedido(pedido: PedidoConfirmado): Promise<string> {
  const sheets = getSheets();
  const fecha = new Date().toISOString();
  const orderId = `KP-${Date.now()}`;

  const detalle = pedido.items
    .map((i) => `${i.cantidad}x ${i.codigo} ${i.nombre} ($${i.subtotal.toFixed(2)})`)
    .join(" | ");

  const fila = [
    orderId,
    fecha,
    pedido.cliente.nombre || "",
    pedido.cliente.telefono,
    pedido.cliente.direccion || "",
    pedido.cliente.metodoPago || "",
    detalle,
    pedido.total.toFixed(2),
    pedido.cliente.notas || "",
    "nuevo",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PEDIDOS}!A:J`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [fila] },
  });

  return orderId;
}

export async function asegurarHeadersPedidos(): Promise<void> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PEDIDOS}!A1:J1`,
  });
  if (res.data.values && res.data.values.length > 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PEDIDOS}!A1:J1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "id_pedido",
        "fecha",
        "cliente",
        "telefono",
        "direccion",
        "metodo_pago",
        "detalle",
        "total",
        "notas",
        "estado",
      ]],
    },
  });
}
