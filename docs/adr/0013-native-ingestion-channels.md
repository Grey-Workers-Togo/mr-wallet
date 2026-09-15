# ADR-0013 — Ingestion channels: prioritize what the target market actually produces

## Status
Accepted — 2026-09-14
Follows from [ADR-0011](0011-stack-mobile-expo-react-native.md), which makes native ingestion possible for the first time.
Reprioritizes lot 14 of `12-roadmap-v2.md` (OFX/QIF import).

## Context

Ingestion was designed under a constraint that no longer holds. `06-import-export.md` specifies a file-upload pipeline — CSV, TSV, XLSX — and lot 14 plans to add OFX and QIF. That design is correct for a browser, which can receive a file and nothing else.

Two things have changed, and a third was never checked.

**The formats.** OFX and QIF are bank-export formats from the North American and European ecosystems. In the primary market described in `01-vision-perimetre.md § 7`, they are close to nonexistent. What users actually receive is a **transaction SMS per operation** from mobile money operators (Flooz, T-Money, Moov Money), and **PDF statements** from banks. Neither is in the pipeline, and neither is planned.

**The client.** A PWA can accept a file the user finds and uploads. A native application can receive a share from another app, read a notification or an SMS, and use the camera. ADR-0011 opened those doors; the ingestion design predates them.

**The unverified assumption.** `01-vision-perimetre.md § 8.2` states plainly that the availability and usability of target statement formats has not been confirmed on real samples. The whole import pipeline — the riskiest lot in the project, per `09-roadmap.md § Lot 3` — rests on it. Building a second file-format parser before checking that assumption compounds the risk instead of reducing it.

## Decision

**Validate the assumption first, then prioritize ingestion channels by what users actually receive — not by what is easiest to parse.**

### 1. Validation precedes construction

Before any new ingestion work: collect **real** samples — Flooz, T-Money and Moov Money statements and transaction SMS, plus statements from two or three local banks — and confirm what they contain, in what format, and whether the fields the pipeline needs are present. This is a few days of collection, and it decides everything that follows. `09-roadmap.md` already applies this rule to lot 3 ("test with real statements"); it applies identically here.

### 2. Ingestion channels, in priority order

| Priority | Channel | Platform | Note |
|---|---|---|---|
| 1 | **Share sheet** — the user shares a PDF, a screenshot, or a text selection into the application | iOS + Android | Portable, no sensitive permission, works for bank PDFs and for a forwarded SMS. The safest first step. |
| 2 | **Camera + OCR of a receipt** | iOS + Android | Serves cash, which no statement covers. Natural extension of lot 13 (attachments). |
| 3 | **PDF statement parsing** | server-side | Extends the existing pipeline: same mapping, same deduplication, same preview. Only the parser is new. |
| 4 | **Automatic SMS reading** | Android only | The highest value and the highest risk. See below. |
| 5 | OFX / QIF (current lot 14) | server-side | Kept, but demoted. Serves persona B in Europe, not the primary market. |

### 3. Automatic SMS reading: value and risk, stated separately

An operator's transaction SMS contains everything needed: amount, direction, counterparty, fee, date, reference. Reading it automatically would make entry *disappear* for the dominant operation type in the target market. That is the largest single improvement available to this product, and it is worth a deliberate effort.

It also carries risks that must not be discovered during store review:

- **Android permission policy.** Access to SMS is a restricted permission, granted only for a narrow set of declared use cases and subject to review. Whether a personal-finance application qualifies is **not settled** and must be verified against the policy in force before this is scheduled. A rejection here is a store-level blocker, not a bug.
- **iOS cannot do this at all.** There is no equivalent API. The share sheet is the fallback, and the two platforms will not be at parity on this feature. That asymmetry must be accepted explicitly rather than discovered late.
- **Sensitivity.** The application would be reading the user's messages. Parsing must be restricted to a whitelist of operator senders, everything else discarded without being read, nothing but the extracted transaction retained, and no message content ever leaving the device.

Accordingly: SMS reading is a **spike before it is a lot**. Its first deliverable is an answer on eligibility, not code.

### 4. What does not change

The pipeline itself. Whatever the channel, the flow stays the one in `06-import-export.md`: mapping, error-tolerant parsing, three-level deduplication, preview validated by the user (RG-I1), transactional commit. A new channel adds a parser at the front, never a second path to the database — and never an entry that writes without the user seeing it first. That rule matters more for automatic channels, not less: a transaction created from an SMS without review is exactly the silent write RG-I1 exists to forbid.

## Consequences

**Benefits** — Ingestion is aimed at what the target users actually hold. The share sheet and OCR are cheap, portable and unblock cash and PDF cases immediately. Demoting OFX/QIF frees roughly three days from the V2 pass without losing anything for the primary market.

**Costs**

- **Platform asymmetry.** Android may get automatic capture; iOS will not. The interface must present this as a platform capability, not as a missing feature on iOS.
- **A restricted permission to justify**, with a real chance of refusal, and a store review that is slower because of it.
- **OCR is imperfect.** A receipt read by OCR must go through the same preview as any import; never a silent creation.
- **Validation spends days before producing anything visible.** That is the point. Building the wrong parser costs more.

## Re-examination

If sample collection shows that local operators do publish usable CSV or XLSX statements, priorities 1 to 4 lose much of their value and the existing pipeline is sufficient. That is precisely why the collection comes first.
