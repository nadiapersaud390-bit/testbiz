# QA reviews and invalid-call reporting

The Admin Tools QA tab supports manual call reviews and a shared invalid-call report. Review records are written to the Firebase Realtime Database path qa_call_reviews, so connected admins see updates in real time. The report can be filtered and exported as CSV.

The app stores review metadata, findings, coaching notes, reviewer identity, and an optional phone last-four value. It does not store the uploaded audio file. An AI transcript is shown in the browser as a working reference and is not saved with the review. Reviewers should put only the relevant evidence and timestamps in the finding.

## Turning on AI-assisted audio review

AI audio review is off by default. js/config.js contains this setting:

    window.QA_REVIEW_ENDPOINT = '';

After deploying a same-origin review service, set this to its route, for example /api/qa/review. Do not put a model-provider secret in browser code. The review service must authenticate the admin using a trusted server-side method, limit accepted audio size and types, and apply the organization's recording and data-retention rules.

The browser sends a multipart/form-data POST with:

- audio: the selected recording
- agentId, agentName, team, callDate, and optional callId
- reasonCategories: JSON list of invalid-call reason categories
- responseFormat: json

A successful service response can use this shape:

    {
      "transcript": "Optional transcript text for the current browser session",
      "draft": {
        "suggestedOutcome": "Invalid",
        "primaryReason": "Trucking",
        "summary": "The agent continued after the caller described an excluded business type.",
        "evidence": [
          {
            "timestamp": "00:42",
            "quote": "Example words from the call",
            "rule": "Approved qualification rule"
          }
        ],
        "coachingTip": "Confirm the business type before continuing.",
        "confidence": 0.82
      }
    }

The app treats this as a draft. It leaves the final outcome for the admin to choose, and requires a reason before an invalid review can be saved. If the endpoint is empty, the file stays in the browser and is not uploaded.

## Access and server setup

Super Admins have access to the QA tab. They can grant it to a regular admin from Manage Admins under the Admin Tools permissions. New regular admin records default to no QA access.

This package includes the browser interface and request contract, but no audio-analysis server or model-provider key. The dashboard's custom admin login currently stores its session in browser storage, which a server cannot verify. Before enabling an AI endpoint or storing real call reviews, add server-verified admin authentication and matching Firebase rules for the QA data path. The browser permission check controls navigation, but it is not a server security boundary.
