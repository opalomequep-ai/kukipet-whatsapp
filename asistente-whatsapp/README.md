# Kukipet — Asistente de ventas por WhatsApp

Bot conversacional que atiende clientes por WhatsApp, consulta el catálogo y precios desde una hoja de Google Sheets, arma el pedido y, al confirmar, lo registra en la pestaña **Pedidos**.

- **Canal:** WhatsApp Cloud API (Meta oficial)
- **IA:** Claude (Anthropic)
- **Datos:** Google Sheets (lectura `Precios`, escritura `Pedidos`)

---

## 1. Preparar la hoja de Google Sheets

### Pestaña `Precios`
Headers en alguna fila (el código los detecta automáticamente):

| Categoria | Codigo | Producto | Unidades | Precio |
|-----------|--------|----------|----------|--------|
| Horneados | ga001 | Doglletas | u | 2500 |
| ...       | ...   | ...       | ... | ... |

> Si no existe la columna **Precio**, agregala. El asistente solo cierra ventas con precio numérico.

### Pestaña `Pedidos`
Se crea automáticamente con estos headers la primera vez que arranca el server:

`id_pedido | fecha | cliente | telefono | direccion | metodo_pago | detalle | total | notas | estado`

### Compartir la hoja
Compartila con el **email del Service Account** (algo como `xxx@yyy.iam.gserviceaccount.com`) con permiso de **Editor**.

---

## 2. Instalar y configurar

```bash
cd asistente-whatsapp
npm install
cp .env.example .env
```

Copiá tu JSON de Service Account a `./google-credentials.json` (ya está en `.gitignore`).

Editá `.env` con tus credenciales reales.

---

## 3. WhatsApp Cloud API (Meta)

1. https://developers.facebook.com/apps → creá una app tipo **Business**.
2. Agregá el producto **WhatsApp**.
3. En *API Setup* copiá `Phone number ID` y generá un `Access token` permanente (mediante System User en Business Manager para producción).
4. Configurá el webhook:
   - Callback URL: `https://TU-DOMINIO/webhook` (necesitás HTTPS público — usá `ngrok` para desarrollo).
   - Verify token: el mismo `WHATSAPP_VERIFY_TOKEN` del `.env`.
   - Suscribite al campo **messages**.

### Tunel local para pruebas
```bash
npx ngrok http 3000
```
Usá la URL `https://...ngrok-free.app/webhook` en Meta.

---

## 4. Correr

```bash
npm run dev      # desarrollo con autoreload
npm run build && npm start   # producción
```

Probá enviando "hola" al número de WhatsApp Business.

Comando especial del cliente: enviar **`reset`** reinicia la conversación.

---

## 5. Cómo funciona el flujo

1. Cliente escribe por WhatsApp → Meta llama a `POST /webhook`.
2. `claude.ts` mantiene historial por número y llama a Claude con 3 herramientas:
   - `listar_productos` / `buscar_producto` → leen `Precios` (con cache de 5 min).
   - `registrar_pedido` → escribe una fila en `Pedidos` y devuelve `id_pedido`.
3. Claude conduce la conversación: catálogo → armado → datos del cliente → confirmación → registro.

---

## 6. Estructura

```
asistente-whatsapp/
├── src/
│   ├── index.ts        # Express + webhook
│   ├── whatsapp.ts     # Cliente Cloud API
│   ├── sheets.ts       # Lectura Precios / escritura Pedidos
│   ├── claude.ts       # Motor conversacional + tool use
│   └── types.ts
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 7. Notas

- El catálogo se cachea `PRECIOS_CACHE_TTL` segundos (default 300). Cambios en la hoja tardan hasta ese tiempo en propagarse.
- Sesiones viven en memoria; si reiniciás el server se pierden. Para producción serio, mover a Redis.
- Solo se procesan mensajes de tipo **texto**. Imágenes/audios se ignoran (se puede ampliar después).
