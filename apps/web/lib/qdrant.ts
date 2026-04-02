// Local Qdrant vector similarity for plagiarism detection.
// CLAUDE.md §0: "Offline-First AI: No cloud-hosted vector DBs. Use local Qdrant only."
// All functions are fail-open — they return null/[] on any error so the
// quality gate never blocks a scan because of a Qdrant connectivity issue.

const QDRANT_URL      = process.env.QDRANT_URL      ?? "http://localhost:6333";
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  ?? "";
const COLLECTION      = "deliverables";
const EMBED_MODEL     = "text-embedding-3-small";
const EMBED_DIM       = 1536;
export const SCORE_THRESHOLD = 0.85;
const MAX_TEXT_CHARS  = 8_000;   // stays well within 8192-token model limit
const TIMEOUT_MS      = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimilarResult {
  scan_id:       string;
  freelancer_id: string;
  file_name:     string;
  score:         number;
  created_at:    string;
}

interface QdrantPayload {
  scan_id:       string;
  freelancer_id: string;
  file_name:     string;
  created_at:    string;
}

// ── Collection setup ──────────────────────────────────────────────────────────

export async function ensureCollection(): Promise<void> {
  try {
    const check = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);

    if (check?.status === 404) {
      await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          vectors: { size: EMBED_DIM, distance: "Cosine" },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => null);
    }
  } catch {
    // Qdrant unreachable — fail-open
  }
}

// ── Embeddings ────────────────────────────────────────────────────────────────

/// Generates a 1536-dim embedding via OpenAI text-embedding-3-small.
/// Returns null if OPENAI_API_KEY is absent or the call fails.
export async function embedText(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;

  const truncated = text.slice(0, MAX_TEXT_CHARS);

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body:   JSON.stringify({
        model:           EMBED_MODEL,
        input:           truncated,
        encoding_format: "float",  // explicit: avoid base64 default
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);

    if (!res?.ok) return null;

    const data = await res.json() as { data: [{ embedding: number[] }] };
    return data.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Similarity search ─────────────────────────────────────────────────────────

/// Returns the top-5 stored deliverables with cosine similarity ≥ SCORE_THRESHOLD.
/// Pass excludeScanId to filter out the current scan's own point.
export async function searchSimilar(
  vector:        number[],
  excludeScanId?: string,
): Promise<SimilarResult[]> {
  try {
    const filter = excludeScanId
      ? { must_not: [{ key: "scan_id", match: { value: excludeScanId } }] }
      : undefined;

    const res = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/search`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          vector,
          limit:           5,
          with_payload:    true,
          score_threshold: SCORE_THRESHOLD,
          ...(filter ? { filter } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    ).catch(() => null);

    if (!res?.ok) return [];

    const data = await res.json() as {
      result: Array<{ score: number; payload: QdrantPayload }>;
    };

    return (data.result ?? []).map(r => ({
      scan_id:       r.payload.scan_id,
      freelancer_id: r.payload.freelancer_id,
      file_name:     r.payload.file_name,
      score:         r.score,
      created_at:    r.payload.created_at,
    }));
  } catch {
    return [];
  }
}

// ── Store vector ──────────────────────────────────────────────────────────────

/// Stores a deliverable vector. Fire-and-forget (wait=false).
/// scan_id is used as the Qdrant point ID (UUID format supported in v1.x).
export async function upsertVector(
  scanId:  string,
  vector:  number[],
  payload: QdrantPayload,
): Promise<void> {
  try {
    await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points?wait=false`,
      {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          points: [{ id: scanId, vector, payload }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    ).catch(() => null);
  } catch {
    // Fail-open: not storing the vector is acceptable
  }
}
