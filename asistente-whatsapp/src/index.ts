import "dotenv/config";
import express from "express";
import { responder, resetSession } from "./claude.js";
import { asegurarHeadersPedidos } from "./sheets.js";
import { enviarMensaje, extraerMensajes, marcarLeido } from "./whatsapp.js";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "verify-token";
const PORT = Number(process.env.PORT || 3000);

app.get("/", (_req, res) => {
  res.send("Kukipet WhatsApp bot OK");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(String(challenge));
  }
  return res.sendStatus(403);
});

const enProceso = new Set<string>();

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const mensajes = extraerMensajes(req.body);
    for (const msg of mensajes) {
      if (enProceso.has(msg.from)) continue;
      enProceso.add(msg.from);

      marcarLeido(msg.messageId).catch(() => {});

      try {
        const texto = msg.texto.trim();
        if (/^(reset|reiniciar|nueva conversacion|nueva conversación)$/i.test(texto)) {
          resetSession(msg.from);
          await enviarMensaje(msg.from, "Listo, empezamos de cero. ¿En qué te ayudo? 🐶");
          continue;
        }
        const respuesta = await responder(msg.from, texto);
        await enviarMensaje(msg.from, respuesta);
      } catch (err) {
        console.error("[bot] error procesando", msg.from, err);
        await enviarMensaje(
          msg.from,
          "Uy, tuve un problema técnico. ¿Probás de nuevo en un momento? 🙏"
        ).catch(() => {});
      } finally {
        enProceso.delete(msg.from);
      }
    }
  } catch (e) {
    console.error("[webhook] error", e);
  }
});

app.listen(PORT, async () => {
  console.log(`[kukipet] escuchando en :${PORT}`);
  try {
    await asegurarHeadersPedidos();
    console.log("[sheets] headers de Pedidos OK");
  } catch (e) {
    console.warn("[sheets] no pude verificar headers de Pedidos:", e);
  }
});
