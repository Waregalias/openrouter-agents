# OpenRouter Agents

A small TypeScript CLI that runs LLM "agents" through [OpenRouter](https://openrouter.ai),
with optional **token-saving context compression** powered by
[Headroom](https://github.com/headroomlabs-ai/headroom).

You pick a model, optionally drop files/images into an attachments folder, ask a
question, and the agent answers — sending as few tokens as possible.

---

## Features

- **Model picker** — choose any free OpenRouter model from an interactive list.
- **Attachments** — text files (`.txt .md .json .ts .js`) and images
  (`.png .jpg .jpeg .webp .gif`) placed in the agent's attachments folder are
  automatically included in the prompt.
- **Headroom compression (optional)** — compresses everything sent to the model
  (text, files, logs, RAG chunks) for **60–95% fewer tokens**, with no loss of
  meaning. Fully reversible and runs locally. Falls back gracefully to no
  compression when the Headroom proxy isn't running.

---

## Requirements

| Tool        | Version   | Notes                                            |
|-------------|-----------|--------------------------------------------------|
| Node.js     | 18+       | Runs the agent (`tsx` / ESM).                    |
| Python      | **3.10+** | Only needed for Headroom compression (the proxy).|
| OpenRouter  | API key   | Free at <https://openrouter.ai/keys>.            |

---

## Setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in your OpenRouter key:

```bash
cp .env.example .env
```

`.env`:

```dotenv
OPENROUTER_API_KEY=sk-or-...

# --- Headroom (context compression, optional) ---
# Enabled by default. Set to 0 to disable compression.
HEADROOM_ENABLED=1
# URL of the Headroom proxy (started separately, see below).
# If the proxy is down, the agent runs normally, without compression.
HEADROOM_BASE_URL=http://localhost:8787
```

### 3. Run

```bash
npm start
```

You'll be asked:

1. **Which agent** to launch (scripts in `src/agents/`).
2. **Which model** to use.
3. **Your question** (attachments, if any, are loaded automatically).

---

## Attachments

Drop files into the folder matching the agent name under
`src/attachments/<agent-name>/`. For the `open-router` agent:

```
src/attachments/open-router/
├── report.md          # included as text
├── data.json          # included as text
└── screenshot.png     # included as an image
```

Anything in that folder is read and attached to the next prompt automatically.

---

## Headroom compression

The agent integrates Headroom so that prompts are compressed **before** they
reach the model. This is optional and degrades gracefully.

### How it works

The npm package `headroom-ai` is a **client** for a local Headroom **proxy**.
The actual compression runs in the proxy (a Python service). The flow is:

```
agent  ──>  compress() [headroom-ai client]  ──>  Headroom proxy (localhost:8787)
       <──  compressed messages              <──  (compresses, caches originals)
       ──>  OpenRouter API
```

If the proxy is **not** running, `compress()` returns the original messages
unchanged (`fallback: true`), so the agent keeps working — just without savings.

### What gets compressed

Headroom (by design) **never compresses your question** — user messages are
protected. The integration compresses your **attachments** (the file contents
loaded from `src/attachments/<agent>/`), which is where the tokens actually pile
up. Your question and any images pass through untouched. To avoid pointless risk,
only attachments larger than `HEADROOM_MIN_CHARS` (default 8000 chars ≈ 2000
tokens) are sent for compression; smaller ones are left intact.

> **Disabled by default.** Compression is lossy (see
> [Understanding "lossy" compression](#understanding-lossy-compression) at the
> bottom). Opt in with `HEADROOM_ENABLED=1` once you've read the trade-off.
>
> **About CCR (reversible) compression:** Headroom keeps the originals locally
> and can return them via a `headroom_retrieve` tool — but only if the model
> actively calls that tool. This one-shot agent does **not** run a tool-calling
> loop, so for us compression is effectively one-way: if something is dropped,
> it's gone for that request.

### Enabling compression (run the proxy)

Headroom's proxy requires **Python 3.10+**. This repo is already set up with a
local virtualenv (`.venv/`, pinned to Python 3.13 via pyenv / `.python-version`)
and `headroom-ai` installed.

```bash
# Start the proxy (leave it running in its own terminal).
# --target-ratio 0.7 keeps ~70% of tokens: more conservative, far less likely
# to drop an outlier than Headroom's default aggressive ratio.
.venv/bin/headroom proxy --port 8787 --target-ratio 0.7

# In another terminal, enable compression and run the agent
HEADROOM_ENABLED=1 npm start
```

Fresh setup from scratch (if `.venv/` is missing):

```bash
pyenv install 3.13          # needs pyenv; or use any Python 3.10+
python -m venv .venv
.venv/bin/pip install "headroom-ai[all]"   # heavy: pulls an ML model
.venv/bin/headroom proxy --port 8787
```

When the proxy is up, each model call prints a line like:

```
  - Headroom : 10144 → 1260 tokens (-8884, 88% saved) [smart_crusher, cache_aligner]
```

### Toggling / configuring

| Variable             | Default                   | Purpose                                          |
|----------------------|---------------------------|--------------------------------------------------|
| `HEADROOM_ENABLED`   | `0` (off)                 | Set to `1`/`true`/`on` to enable compression.    |
| `HEADROOM_BASE_URL`  | `http://localhost:8787`   | Where the Headroom proxy listens.                |
| `HEADROOM_MIN_CHARS` | `8000`                    | Min attachment size (chars) before compressing.  |

> The Node integration always fails open: if the proxy is unreachable or any
> error occurs, the original (uncompressed) content is sent and the agent runs
> normally.

---

## Project structure

```
src/
├── index.ts                  # entry point: picks an agent script and runs it
├── agents/
│   └── open-router.ts        # the OpenRouter agent (model picker + call)
├── utils/
│   ├── agent-utils.ts        # builds prompt input (attachments + question)
│   └── headroom.ts           # Headroom compression integration
└── attachments/
    └── open-router/          # files attached to the open-router agent
```

---

## Scripts

| Command         | Description                          |
|-----------------|--------------------------------------|
| `npm start`     | Run the agent (via `tsx`).           |
| `npm run build` | Compile TypeScript to `dist/`.       |

---

## Understanding "lossy" compression

In short, here's the trade-off in my own words:

- **Lossy** means *with loss*: unlike a zip (lossless, you get every byte back),
  Headroom **throws away** information it judges redundant to save tokens. You
  cannot rebuild the exact original from the compressed text.
- Its **SmartCrusher** algorithm targets big, repetitive JSON/log arrays: faced
  with 300 near-identical rows, it keeps a **representative sample** plus a
  summary instead of all 300. That's where the 50–95% savings come from.
- The risk: a **rare but important** item can be the one that gets sampled out.
  In one test, 300 `INFO` rows + a single `FATAL` error — the `FATAL` line (the
  needle in the haystack) was dropped. If you'd asked "find the error", the model
  would never have seen it.
- It's **data-dependent**, not always destructive (on plain-text logs the same
  `FATAL` survived). Great for summarizing redundant documents; risky when the
  signal is a rarity buried in noise.

That's why compression is **off by default** here, guarded by a size threshold,
and best run with a conservative `--target-ratio`.

---

## License

ISC
