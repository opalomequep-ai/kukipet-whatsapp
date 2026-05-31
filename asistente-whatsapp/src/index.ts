import "dotenv/config";
import path from "node:path";
import express from "express";
import { responder, resetSession } from "./claude.js";
import { MODO_DEMO, asegurarHeadersPedidos, getPedidosDemo } from "./sheets.js";
import { enviarMensaje, extraerMensajes, marcarLeido } from "./whatsapp.js";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve("public")));

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "verify-token";
const PORT = Number(process.env.PORT || 3000);

app.get("/", (_req, res) => {
  res.redirect("/chat.html");
});

app.get("/api/status", (_req, res) => {
  res.json({
    demo: MODO_DEMO,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    whatsapp: !!process.env.WHATSAPP_ACCESS_TOKEN,
  });
});

app.get("/api/pedidos-demo", (_req, res) => {
  res.json(getPedidosDemo());
});

app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, text } = req.body || {};
    if (!sessionId || !text) return res.status(400).json({ error: "sessionId y text requeridos" });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Falta ANTHROPIC_API_KEY en .env" });
    }
    const reply = await responder(`web:${sessionId}`, String(text));
    res.json({ reply });
  } catch (e: any) {
    console.error("[/api/chat]", e);
    res.status(500).json({ error: e?.message || String(e) });
  }
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
