const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const GRAPH_VERSION = "v21.0";

export async function enviarMensaje(to: string, texto: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: texto.slice(0, 4096) },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[WA] Error enviando mensaje:", res.status, err);
  }
}

export async function marcarLeido(messageId: string): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch(() => {});
}

export interface MensajeEntrante {
  from: string;
  messageId: string;
  texto: string;
  nombrePerfil?: string;
}

export function extraerMensajes(body: any): MensajeEntrante[] {
  const out: MensajeEntrante[] = [];
  const entries = body?.entry || [];
  for (const e of entries) {
    for (const ch of e.changes || []) {
      const value = ch.value || {};
      const contactos = value.contacts || [];
      const nombre = contactos[0]?.profile?.name;
      for (const m of value.messages || []) {
        if (m.type !== "text") continue;
        out.push({
          from: m.from,
          messageId: m.id,
          texto: m.text?.body || "",
          nombrePerfil: nombre,
        });
      }
    }
  }
  return out;
}
