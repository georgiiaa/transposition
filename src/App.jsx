import React, { useState, useRef, useEffect } from "react";

// transposition — a hermeneutic reading tool
// After C.S. Lewis's essay of the same name: what happens when a richer
// language is rendered into a poorer medium. The original text is the
// headline; English is the footnote. That inversion is the whole argument.

function extractJSON(data) {
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response");
  return JSON.parse(clean.slice(start, end + 1));
}

async function askClaude(payload) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return extractJSON(data);
}

const ABOUT = [
  `I love linguistics, I love scripture. I have trouble reading one through the other.`,
  `Scripture was originally written in languages whose words hold more than one thing at a time. Ruach is breath, wind, and spirit at once; the translator has to pick. English, as beautifully as it can sometimes be assembled, makes you choose. Every translation is a series of choices, and every choice closes doors the original left open.`,
  `I can't help feeling that a part of the truth is lost that way. Not the whole of it; the gospel survives translation; it is just as simple as it is complex. But a part.`,
  `Doing my own research on scripture, I couldn't find a consolidated tool to help do so, so I built this.`,
  `The name is borrowed from C.S. Lewis's essay "Transposition." It is his account of what happens when a richer language is rendered into a poorer medium. The richer meaning does not vanish, but it does wait to be looked for.`,
  `After all, it is written that those who seek, find.`,
  `Happy finding! :)`,
];

function AboutTab() {
  return (
    <div className="af-about">
      {ABOUT.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <p className="sig">
        Open to suggestions! Contact me{" "}
        <a href="mailto:georgiatoddbarrett@gmail.com">
          georgiatoddbarrett@gmail.com
        </a>
      </p>
    </div>
  );
}

function syncUrl(reference, wordIdx) {
  const params = new URLSearchParams();
  if (reference) params.set("ref", reference);
  if (wordIdx !== null && wordIdx !== undefined) params.set("word", wordIdx);
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  );
}

export default function App() {
  const [tab, setTab] = useState("read");
  const [query, setQuery] = useState("");
  const [verse, setVerse] = useState(null);
  const [verseState, setVerseState] = useState("idle"); // idle | loading | ok | error
  const [verseErr, setVerseErr] = useState("");
  const [selIdx, setSelIdx] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState("idle");
  const [copied, setCopied] = useState(false);
  const wordCache = useRef({});
  const pendingWord = useRef(null);

  const loadVerse = async (refString) => {
    const q = refString.trim();
    if (!q) return;
    setVerseState("loading");
    setVerse(null);
    setSelIdx(null);
    setDetail(null);
    setDetailState("idle");
    try {
      const v = await askClaude({ kind: "verse", ref: q });
      if (v.error) {
        setVerseErr(v.error);
        setVerseState("error");
      } else {
        setVerse(v);
        setVerseState("ok");
        wordCache.current = {};
        syncUrl(v.reference, null);
        // If this load came from a shared link with a word index, open it.
        const idx = pendingWord.current;
        pendingWord.current = null;
        if (idx !== null && idx !== "" && v.words[Number(idx)]) {
          openWord(Number(idx), v);
        }
      }
    } catch (e) {
      setVerseErr(
        "The source could not be read. Check the reference and try again."
      );
      setVerseState("error");
    }
  };

  const readVerse = () => loadVerse(query);

  const openWord = async (idx, verseObj) => {
    const v = verseObj || verse;
    if (!v) return;
    setSelIdx(idx);
    syncUrl(v.reference, idx);
    const key = String(idx);
    if (wordCache.current[key]) {
      setDetail(wordCache.current[key]);
      setDetailState("ok");
      return;
    }
    setDetail(null);
    setDetailState("loading");
    try {
      const d = await askClaude({
        kind: "word",
        word: v.words[idx],
        verse: { reference: v.reference, words: v.words },
      });
      wordCache.current[key] = d;
      setDetail(d);
      setDetailState("ok");
    } catch (e) {
      setDetailState("error");
    }
  };

  // On first load, restore state from a shared link: ?ref=John+1:1&word=3
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setQuery(ref);
      pendingWord.current = params.get("word");
      loadVerse(ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    if (!verse) return;
    const params = new URLSearchParams();
    params.set("ref", verse.reference);
    if (selIdx !== null) params.set("word", selIdx);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    const w = selIdx !== null ? verse.words[selIdx] : null;
    const text = w
      ? `${w.w} (${w.t}) — ${verse.reference}`
      : `${verse.reference} · ${verse.language}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "transposition", text, url });
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // user closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // last resort: show the url in a prompt for manual copy
      window.prompt("Copy this link:", url);
    }
  };

  const w = selIdx !== null && verse ? verse.words[selIdx] : null;

  return (
    <div className="af-root">
      <div className="af-wrap">
        <div className="af-topline">
          <div className="af-eyebrow">transposition</div>
          <div className="af-tabs">
            <button
              className={"af-tab" + (tab === "read" ? " on" : "")}
              onClick={() => setTab("read")}
            >
              read
            </button>
            <button
              className={"af-tab" + (tab === "about" ? " on" : "")}
              onClick={() => setTab("about")}
            >
              about
            </button>
          </div>
        </div>
        <div className="af-sub">
          the richer language beneath the poorer medium
        </div>

        {tab === "about" && <AboutTab />}

        {tab === "read" && (
          <div>
            <div className="af-inputrow">
              <input
                className="af-input"
                value={query}
                placeholder="John 1:1"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && verseState !== "loading" && readVerse()
                }
                aria-label="Scripture reference"
              />
              <button
                className="af-go"
                onClick={readVerse}
                disabled={verseState === "loading"}
              >
                {verseState === "loading" ? "reading" : "read"}
              </button>
            </div>

            {verseState === "idle" && (
              <p className="af-empty">
                Enter a reference. The verse returns in its original language;
                the English sits underneath, where it belongs. Touch any word
                to open it.
              </p>
            )}

            {verseState === "error" && (
              <p className="af-error">
                {verseErr} <button onClick={readVerse}>Try again</button>
              </p>
            )}

            {verseState === "ok" && verse && (
              <div>
                <div className="af-refrow">
                  <div className="af-ref">
                    {verse.reference} · {verse.language}
                  </div>
                  <button className="af-share" onClick={share}>
                    {copied ? "link copied" : "share"}
                  </button>
                </div>
                <div className="af-verse" dir={verse.direction || "ltr"}>
                  {verse.words.map((word, i) => (
                    <React.Fragment key={i}>
                      <button
                        className={"af-word" + (i === selIdx ? " sel" : "")}
                        data-g={word.g}
                        title={word.g}
                        onClick={() => openWord(i)}
                      >
                        <span className="af-w-orig">{word.w}</span>
                        <span className="af-w-gloss">{word.g}</span>
                      </button>{" "}
                    </React.Fragment>
                  ))}
                </div>
                <div className="af-translit">
                  {verse.words.map((x) => x.t).join(" ")}
                </div>
                <div className="af-english">{verse.translation}</div>
                {verse.note ? (
                  <div className="af-quiet" style={{ marginTop: 14 }}>
                    {verse.note}
                  </div>
                ) : null}

                {selIdx !== null && (
                  <div className="af-detail">
                    {detailState === "loading" && (
                      <p className="af-quiet">
                        opening {w.t} — checking the lexicons, this takes a
                        moment…
                      </p>
                    )}
                    {detailState === "error" && (
                      <p className="af-error">
                        The word would not open.{" "}
                        <button onClick={() => openWord(selIdx)}>
                          Try again
                        </button>
                      </p>
                    )}
                    {detailState === "ok" && detail && (
                      <div>
                        <div className="af-lemma">
                          {detail.lemma}
                          <span className="tr">{detail.lemma_translit}</span>
                        </div>
                        <div className="af-morph">
                          {detail.morphology}
                          {detail.strongs ? ` · ${detail.strongs}` : ""}
                        </div>

                        <div className="af-label">semantic range</div>
                        <div className="af-range">
                          {detail.semantic_range.map((g, i) => (
                            <span key={i}>
                              {g}
                              {i < detail.semantic_range.length - 1 && (
                                <span className="sep">·</span>
                              )}
                            </span>
                          ))}
                        </div>

                        <div className="af-label">etymology</div>
                        <p className="af-body">{detail.etymology}</p>

                        <div className="af-label">elsewhere</div>
                        <div className="af-elsewhere">
                          {detail.elsewhere.map((e, i) => (
                            <div key={i}>
                              <span className="eref">{e.ref}</span>
                              <span className="enote"> — {e.note}</span>
                            </div>
                          ))}
                        </div>

                        <div className="af-label">what English loses</div>
                        <p className="af-body">{detail.loss}</p>

                        {detail.verified ? (
                          <>
                            <div className="af-label">verification</div>
                            <p className="af-sources">{detail.verified}</p>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
