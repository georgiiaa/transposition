// api/claude.js — Vercel serverless function.
//
// Holds the Anthropic API key (set ANTHROPIC_API_KEY in your Vercel project
// settings) and builds all prompts server-side. The client sends structured
// requests ({ kind: "verse" } or { kind: "word" }), never raw prompts, so
// this endpoint can't be repurposed as a general-purpose Claude proxy.

const MODEL = "claude-sonnet-4-6";

const versePrompt = (ref) => `You are a careful biblical philologist working from the original languages (NA28/UBS5 for the Greek NT, BHS for the Hebrew Bible, noting Aramaic where relevant).

The reader asks for: "${ref}"

Return ONLY valid JSON, no markdown fences, no preamble, exactly this shape:
{
  "reference": "canonical reference",
  "language": "e.g. Koine Greek / Biblical Hebrew / Aramaic",
  "direction": "ltr" or "rtl",
  "words": [ { "w": "word in original script", "t": "transliteration", "g": "terse gloss, 1-3 words" } ],
  "translation": "a plain, literal English rendering of the verse",
  "note": "optional: one short sentence if the text is disputed or textually interesting, else empty string"
}

The words array must cover the verse in reading order. Keep glosses terse. If the request is not a locatable scripture reference, return {"error": "one plain sentence saying what you need"}.`;

const wordPrompt = (word, verse) => `You are a careful biblical philologist. The word "${word.w}" (${word.t}) appears in ${verse.reference}: "${verse.words.map((x) => x.w).join(" ")}"

FIRST, verify your parsing and lexical data against authoritative online sources: search for this word's entry in STEPBible, Blue Letter Bible, or a standard lexicon (BDAG/LSJ for Greek, BDB/HALOT for Hebrew). Check the morphological parsing for this exact verse and the Strong's number. If sources disagree with your instinct, defer to the sources and say so.

THEN return ONLY valid JSON as your final answer, no markdown fences, no preamble after your searching, exactly this shape:
{
  "lemma": "dictionary form in original script",
  "lemma_translit": "transliteration of the lemma",
  "strongs": "Strong's number, e.g. G3056 or H7307, or empty string if not found",
  "morphology": "parsing of this form in this verse, terse, as verified",
  "semantic_range": ["4 to 8 English glosses, most central first, drawn from the lexicon entry"],
  "etymology": "1-2 sentences: root, formation, cognates worth knowing",
  "elsewhere": [ { "ref": "reference", "note": "how the word works there, one short clause" } ],
  "loss": "1-2 sentences: what the standard English rendering flattens or forecloses in this verse. Be concrete and unsentimental.",
  "verified": "one short clause naming which source(s) confirmed the parsing, or noting any discrepancy found"
}

Two or three entries in elsewhere. No hedging filler.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
    return;
  }

  const { kind } = req.body || {};
  let prompt;
  let useSearch = false;

  if (kind === "verse") {
    const ref = String(req.body.ref || "").slice(0, 200);
    if (!ref.trim()) {
      res.status(400).json({ error: "Missing reference" });
      return;
    }
    prompt = versePrompt(ref);
  } else if (kind === "word") {
    const { word, verse } = req.body;
    const valid =
      word &&
      typeof word.w === "string" &&
      typeof word.t === "string" &&
      verse &&
      typeof verse.reference === "string" &&
      Array.isArray(verse.words) &&
      verse.words.length <= 120;
    if (!valid) {
      res.status(400).json({ error: "Malformed word request" });
      return;
    }
    prompt = wordPrompt(word, verse);
    useSearch = true;
  } else {
    res.status(400).json({ error: "Unknown request kind" });
    return;
  }

  const body = {
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  };
  if (useSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Upstream request failed" });
  }
}
