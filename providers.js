// Each adapter takes { apiKey, model, baseUrl? } plus systemPrompt/userPrompt,
// and returns { text } — the raw text response. Callers parse JSON out of `text`.
// Every adapter throws a descriptive Error on failure; nothing here retries or
// hides provider errors, so failures surface plainly to the person running it.

const fetchFn = global.fetch; // Node 18+ has fetch built in

async function anthropicChat({ apiKey, model }, systemPrompt, userPrompt) {
  const resp = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Anthropic ${resp.status}: ${data?.error?.message || JSON.stringify(data)}`);
  const block = (data.content || []).find(b => b.type === "text");
  if (!block) throw new Error("Anthropic: no text block in response");
  return { text: block.text };
}

// Works for OpenAI, DeepSeek, Kimi (Moonshot), Groq, and anything else that
// speaks the OpenAI Chat Completions shape — only the baseUrl/model changes.
async function openAiCompatibleChat({ apiKey, model, baseUrl }, systemPrompt, userPrompt) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`${baseUrl} ${resp.status}: ${data?.error?.message || JSON.stringify(data)}`);
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${baseUrl}: no message content in response`);
  return { text };
}

async function geminiChat({ apiKey, model }, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 400 },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${data?.error?.message || JSON.stringify(data)}`);
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
  if (!text) throw new Error("Gemini: no text in response (possibly blocked or truncated)");
  return { text };
}

// Registry: each entry knows its adapter fn and default base URL (if OpenAI-compatible).
const PROVIDERS = {
  anthropic: { label: "Anthropic (Claude)", adapter: anthropicChat },
  openai: { label: "OpenAI (GPT)", adapter: openAiCompatibleChat, baseUrl: "https://api.openai.com/v1" },
  gemini: { label: "Google (Gemini)", adapter: geminiChat },
  deepseek: { label: "DeepSeek", adapter: openAiCompatibleChat, baseUrl: "https://api.deepseek.com" },
  kimi: { label: "Moonshot (Kimi)", adapter: openAiCompatibleChat, baseUrl: "https://api.moonshot.ai/v1" },
  custom: { label: "Custom (OpenAI-compatible)", adapter: openAiCompatibleChat, baseUrl: null },
};

async function callModel(providerId, config, systemPrompt, userPrompt) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const baseUrl = config.baseUrl || provider.baseUrl;
  return provider.adapter({ ...config, baseUrl }, systemPrompt, userPrompt);
}

module.exports = { PROVIDERS, callModel };
