// 우리들 신문 — AI 글 도우미 (Vercel 서버 함수)
// Google AI Studio API 키는 Vercel 환경변수 GEMINI_API_KEY 에만 넣습니다.
// 편집위원(관리자·학생 편집위원)으로 로그인한 사람만 쓸 수 있습니다.

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "real-calss-newspaper";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// 로그인 토큰으로 Firestore 편집위원 명단을 읽어 봅니다.
// 보안 규칙상 편집위원만 읽을 수 있으므로, 읽기에 성공하면 편집위원입니다.
async function isEditor(idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config/members`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  return r.status === 200;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "no_api_key" });

  const auth = req.headers.authorization || "";
  const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!idToken) return res.status(401).json({ error: "login_required" });

  try {
    if (!(await isEditor(idToken))) return res.status(403).json({ error: "not_editor" });
  } catch {
    return res.status(502).json({ error: "auth_check_failed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const prompt = body?.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20000) {
    return res.status(400).json({ error: "bad_prompt" });
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        })
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const status = r.status === 429 ? 429 : 502;
      return res.status(status).json({ error: "gemini_error", detail: data?.error?.message ?? "" });
    }
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map(p => p.text || "")
      .join("")
      .trim();
    if (!text) return res.status(502).json({ error: "empty" });
    return res.status(200).json({ text });
  } catch {
    return res.status(502).json({ error: "gemini_unreachable" });
  }
}
