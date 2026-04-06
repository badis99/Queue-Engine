export async function webhookHandler(payload: {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers: Record<string, string>;
  body: string;
}): Promise<void> {
  const response = await fetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.method === "GET" ? undefined : payload.body
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }
}
