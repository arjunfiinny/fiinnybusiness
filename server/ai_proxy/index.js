import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function requireInternalKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!process.env.INTERNAL_API_KEY || key === process.env.INTERNAL_API_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/extract', requireInternalKey, async (req, res) => {
  try {
    const { transactions = [], rules_hint } = req.body || {};
    const compact = transactions.map(t => ({
      amount: t.amount,
      merchant: (t.merchant || '').slice(0, 32),
      desc: (t.desc || '').slice(0, 64),
      date: t.date
    })).slice(0, 200);

    const sys = `You are a strict financial labeler. Return ONLY JSON with:
{"items":[{"category":"<one_of:[Groceries,Dining,Fuel,Bills,Shopping,Travel,Health,Education,Entertainment,Transfers,Income,Other]>","confidence":0.0,"merchant_norm":""}]}`;
    const user = `Classify these transactions (Indian context & UPI):
transactions: ${JSON.stringify(compact)}
rules_hint: ${JSON.stringify(rules_hint || {})}`;

    const r = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    });

    const json = JSON.parse(r.choices[0].message.content || '{"items": []}');
    return res.json(json);
  } catch (e) {
    console.error('extract_error', e.status || e.code, e.message, e?.response?.data || e);
    return res.status(500).json({ error: 'extract_failed', code: e.status || e.code, message: e.message });
  }
});

app.post('/insights', requireInternalKey, async (req, res) => {
  try {
    const { summary = {} } = req.body || {};
    const sys = `Return ONLY JSON: {"insights":[{"title":"","reason":"","action":"","score":0.0}]}`;
    const user = `Monthly summary:\n${JSON.stringify(summary).slice(0, 9000)}\nOutput 3-5 short insights.`;

    const r = await client.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    });

    const json = JSON.parse(r.choices[0].message.content || '{"insights": []}');
    return res.json(json);
  } catch (e) {
    console.error('insights_error', e.status || e.code, e.message, e?.response?.data || e);
    return res.status(500).json({ error: 'insights_failed', code: e.status || e.code, message: e.message });
  }
});

app.post('/chat', requireInternalKey, async (req, res) => {
  try {
    const { prompt = "" } = req.body || {};
    const r = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a concise finance explainer for Indian consumers." },
        { role: "user", content: prompt }
      ]
    });
    return res.json({ text: r.choices?.[0]?.message?.content || "" });
  } catch (e) {
    console.error('chat_error', e);
    return res.status(500).json({ error: 'chat_failed' });
  }
});

const port = process.env.PORT || 8080;
app.get('/selftest', async (req, res) => {
  try {
    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 2
    });
    return res.json({ ok: true, model: MODEL, sample: r.choices?.[0]?.message?.content || "" });
  } catch (e) {
    console.error('selftest_error', e.status || e.code, e.message, e?.response?.data || e);
    return res.status(500).json({ ok: false, code: e.status || e.code, message: e.message });
  }
});

app.listen(port, () => console.log(`AI proxy listening on ${port}`));
