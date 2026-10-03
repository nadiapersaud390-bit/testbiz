"use strict";

const crypto = require("crypto");
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 100000;
const INVALID_REASONS = [
  "Under $200k revenue",
  "Trucking",
  "Attorney",
  "No qualified call",
  "Unqualified business",
  "Other",
  "Unclear audio"
];

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(data));
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host || "").toLowerCase();
  } catch (_) {
    return false;
  }
}

function isSecureTransport(req) {
  if (req.socket && req.socket.encrypted) return true;
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (forwardedProtocol === "https") return true;
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  return host === "localhost" || host === "127.0.0.1";
}

function secretMatches(candidate, expected) {
  const left = Buffer.from(String(candidate || ""), "utf8");
  const right = Buffer.from(String(expected || ""), "utf8");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let tooLarge = false;
    req.on("data", chunk => {
      length += chunk.length;
      if (length > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("The transcript is too large. Shorten it and try again.");
        error.statusCode = 413;
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks, length));
    });
    req.on("aborted", () => reject(new Error("The transcript request was interrupted.")));
    req.on("error", reject);
  });
}

function parseTranscriptLines(rawTranscript) {
  return String(rawTranscript || "").split(/\r?\n/).map((source, index) => {
    let text = source.trim();
    if (!text) return null;
    let timestamp = "";
    const timeMatch = /^\s*(?:\[)?(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)(?:\])?\s*/.exec(text);
    if (timeMatch) {
      timestamp = timeMatch[1];
      text = text.slice(timeMatch[0].length).trim();
    }
    let speaker = "Unlabelled";
    const speakerMatch = /^([A-Za-z][A-Za-z0-9 _.'-]{0,39})\s*:\s*(.*)$/.exec(text);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      text = speakerMatch[2].trim();
    }
    if (!text) return null;
    return { line: index + 1, timestamp, reference: timestamp || "Line " + (index + 1), speaker, text: text.slice(0, MAX_TRANSCRIPT_CHARS) };
  }).filter(Boolean);
}

function configReady() {
  return Boolean(process.env.OPENAI_API_KEY && String(process.env.QA_REVIEW_ACCESS_TOKEN || "").length >= 32);
}

function normalizeQuote(value) {
  return String(value || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function findOutputText(response) {
  const pieces = [];
  (Array.isArray(response && response.output) ? response.output : []).forEach(item => {
    if (item && item.type === "message" && Array.isArray(item.content)) {
      item.content.forEach(part => {
        if (part && part.type === "output_text" && typeof part.text === "string") pieces.push(part.text);
      });
    }
  });
  return pieces.join("\n").trim();
}

async function providerJson(url, options, errorMessage) {
  let response;
  try {
    response = await fetch(url, Object.assign({}, options, { signal: AbortSignal.timeout(120000) }));
  } catch (error) {
    if (error && error.name === "TimeoutError") throw Object.assign(new Error("The AI review took too long. Try a shorter transcript."), { statusCode: 504 });
    throw Object.assign(new Error("Could not reach the AI review provider. Try again shortly."), { statusCode: 502 });
  }
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    if (response.status === 429) throw Object.assign(new Error("The AI provider is busy or has reached its rate limit. Try again later."), { statusCode: 429 });
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error("The server-side AI provider key was rejected. Check the server configuration."), { statusCode: 503 });
    if (response.status >= 500) throw Object.assign(new Error("The AI provider is temporarily unavailable. Try again later."), { statusCode: 502 });
    const detail = data && data.error && typeof data.error.message === "string" ? data.error.message.slice(0, 300) : "";
    throw Object.assign(new Error(detail || errorMessage), { statusCode: 422 });
  }
  return data;
}

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    agentSpeaker: { type: "string" },
    suggestedOutcome: { type: "string", enum: ["Valid", "Invalid", "Pending"] },
    primaryReason: { type: "string", enum: INVALID_REASONS.concat(["None"]) },
    summary: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          quote: { type: "string" },
          rule: { type: "string" }
        },
        required: ["timestamp", "quote", "rule"],
        additionalProperties: false
      }
    },
    coachingTip: { type: "string" },
    confidence: { type: "number" },
    limitations: { type: "string" }
  },
  required: ["agentSpeaker", "suggestedOutcome", "primaryReason", "summary", "evidence", "coachingTip", "confidence", "limitations"],
  additionalProperties: false
};

async function makeDraft(lines) {
  const transcriptForReview = lines.map(line => ({ reference: line.reference, speaker: line.speaker, text: line.text }));
  const instructions = [
    "You are a careful call-quality reviewer who writes specific, respectful agent coaching.",
    "Review only what the supplied transcript supports. Do not invent words, policies, or facts.",
    "Use speaker labels to identify the sales agent. Return the exact label in agentSpeaker. If speaker labels are absent or the agent cannot be identified, set agentSpeaker to 'unclear' and choose Pending.",
    "The invalid-call categories are: Under $200k revenue, Trucking, Attorney, No qualified call, Unqualified business, Other, and Unclear audio.",
    "Use Under $200k revenue only when the caller explicitly states annual revenue is below $200,000. Use Trucking or Attorney only when the business is explicitly in that category. Use No qualified call or Unqualified business only when the transcript clearly supports the existing QA rule; if the rule is unclear, choose Pending.",
    "Choose Invalid only when a listed invalid-call rule is clearly supported. Choose Valid only when the transcript clearly supports a qualified call and no listed invalid reason. Otherwise choose Pending. Use primaryReason 'None' unless outcome is Invalid.",
    "Describe an agent mistake only when the transcript shows what they did. Give one practical coaching tip. Do not score vocal tone, accent, emotion, or audio quality from text. Keep the summary concise.",
    "Evidence must quote exact words from one transcript line. Use the line's reference value, which may be a timestamp or a line number. If there is no exact supporting quote, return an empty evidence list. Never fabricate a quotation or reference.",
    "Confidence is a number from 0 to 1. Mention missing speaker labels, transcript gaps, or policy uncertainty in limitations."
  ].join(" ");
  const input = "Review reason categories: " + INVALID_REASONS.join("; ") + "\n\nTranscript lines (JSON):\n" + JSON.stringify(transcriptForReview);
  const response = await providerJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.QA_REVIEW_MODEL || "gpt-5-mini",
      store: false,
      instructions,
      input,
      max_output_tokens: 1200,
      text: { format: { type: "json_schema", name: "qa_call_review", strict: true, schema: REVIEW_SCHEMA } }
    })
  }, "Could not create an AI call review.");

  let draft;
  try { draft = JSON.parse(findOutputText(response)); }
  catch (_) { throw Object.assign(new Error("The AI provider returned an unreadable review. Try again or complete the manual review."), { statusCode: 502 }); }

  const evidence = [];
  (Array.isArray(draft.evidence) ? draft.evidence : []).slice(0, 6).forEach(item => {
    const quote = String(item && item.quote || "").trim();
    const normalized = normalizeQuote(quote);
    if (normalized.length < 8) return;
    const sourceLine = lines.find(line => normalizeQuote(line.text).includes(normalized));
    if (!sourceLine) return;
    evidence.push({
      timestamp: sourceLine.reference,
      speaker: sourceLine.speaker === "Unlabelled" ? "" : sourceLine.speaker,
      quote,
      rule: String(item.rule || "").trim().slice(0, 240)
    });
  });

  const sourceSpeakers = new Set(lines.map(line => line.speaker).filter(speaker => speaker !== "Unlabelled"));
  const proposedSpeaker = String(draft.agentSpeaker || "unclear").trim();
  const agentSpeaker = [...sourceSpeakers].find(speaker => speaker.toLowerCase() === proposedSpeaker.toLowerCase()) || "unclear";
  let suggestedOutcome = ["Valid", "Invalid", "Pending"].includes(draft.suggestedOutcome) ? draft.suggestedOutcome : "Pending";
  let primaryReason = INVALID_REASONS.includes(draft.primaryReason) ? draft.primaryReason : "None";
  let limitations = String(draft.limitations || "").trim().slice(0, 600);
  let confidence = Math.max(0, Math.min(1, Number(draft.confidence) || 0));

  if (!evidence.length || agentSpeaker.toLowerCase() === "unclear") {
    suggestedOutcome = "Pending";
    primaryReason = "None";
    confidence = Math.min(confidence, 0.45);
    limitations = [limitations, "The transcript did not provide verifiable evidence and/or a clear agent speaker. Review the source call before scoring."].filter(Boolean).join(" ").slice(0, 600);
  }
  if (suggestedOutcome !== "Invalid") primaryReason = "None";

  return {
    agentSpeaker,
    suggestedOutcome,
    primaryReason,
    summary: String(draft.summary || "").trim().slice(0, 1200),
    evidence,
    coachingTip: String(draft.coachingTip || "").trim().slice(0, 1000),
    confidence,
    limitations
  };
}

async function handlePost(req, res) {
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: "This request must come from the QA dashboard." });
    return;
  }
  if (!isSecureTransport(req)) {
    sendJson(res, 400, { error: "Use the QA dashboard over HTTPS before sending a transcript." });
    return;
  }
  if (!configReady()) {
    sendJson(res, 503, { error: "The AI review service needs server setup. Add OPENAI_API_KEY and a QA_REVIEW_ACCESS_TOKEN of at least 32 characters." });
    return;
  }
  const authorization = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  if (!authorization || !secretMatches(authorization[1], process.env.QA_REVIEW_ACCESS_TOKEN)) {
    sendJson(res, 401, { error: "The AI service access code is missing or incorrect." });
    return;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers["content-type"] || ""))) {
    sendJson(res, 415, { error: "Paste a transcript in the QA form to request an AI draft." });
    return;
  }

  try {
    const body = await readRequestBody(req, MAX_BODY_BYTES);
    let data;
    try { data = JSON.parse(body.toString("utf8")); }
    catch (_) { throw Object.assign(new Error("The transcript request is invalid."), { statusCode: 400 }); }
    const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
    if (transcript.length < 20) throw Object.assign(new Error("Paste a longer call transcript before requesting a review."), { statusCode: 400 });
    if (transcript.length > MAX_TRANSCRIPT_CHARS) throw Object.assign(new Error("The transcript must be 100,000 characters or less."), { statusCode: 413 });
    const lines = parseTranscriptLines(transcript);
    if (!lines.length) throw Object.assign(new Error("No readable transcript lines were found."), { statusCode: 400 });
    const draft = await makeDraft(lines);
    sendJson(res, 200, { transcript, draft });
  } catch (error) {
    const statusCode = Number(error && error.statusCode) || 400;
    sendJson(res, statusCode, { error: error && error.message || "The AI review could not be completed." });
  }
}

function handleQAReviewApi(req, res, requestUrl) {
  if (requestUrl.pathname === "/api/qa/review/status" && req.method === "GET") {
    sendJson(res, 200, { ready: configReady() });
    return true;
  }
  if (requestUrl.pathname === "/api/qa/review" && req.method === "POST") {
    handlePost(req, res);
    return true;
  }
  return false;
}

module.exports = { handleQAReviewApi, parseTranscriptLines, normalizeQuote };
