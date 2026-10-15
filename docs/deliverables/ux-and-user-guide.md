> Current UI: Producer question, action-review and brief-feedback panels have been removed. Drafts support editing and manual copying only. Earlier screenshots/demo steps for those controls are historical; backend APIs remain separate from the current UI.

# User guide and UX contract

The latest palette reference is the supplied color_palatte.png: white, #0052ff action blue,
#001f61 navy, #000b24 ink, #29343d body, #f9fafb/#f0f5ff surfaces and #c7d1d9 borders.
Cards use compact padding and a 4px spacing grid. Skeletons preserve layout while loading;
reduced-motion preferences suppress animation. Current [preview images](../validation/grounding/)
show focused mocked-browser checks of the palette, regional portfolio navigation and Executive view.
Historical [earlier previews](../validation/hub-refresh/) retain loading/generation/evidence examples.

## Sign in and choose work

Use the synthetic accounts shown in the sign-in demo section. The server assigns role and
scope; there is no role impersonation control. jordan.davis@meridian.example and
priya.nair@meridian.example are Producers; morgan.hayes@meridian.example is the Regional
Leader. Demo credentials are fictional and documented in the setup guide; production
provisioning/SSO is not implemented. Remember-me changes session duration. Sign out revokes
the session and clears cached client data.

## Producer

1. Find a permitted client by name, industry or location; narrow risk/renewal filters.
2. Read current account, policy/claim/service counts and renewal timing. These source cards
   remain usable during AI preparation.
3. Read brief provenance: source-based, generating, saved/new AI or source-based fallback.
   Use Retry after failure; Regenerate explicitly requests another synthesis.
4. Inspect risks, confidence, assumptions and contradictions. Click a citation/source record
   to inspect permitted full content. Reconcile renewal-date conflicts before binding.
5. Open AI Brief for summary, agenda, talking points, risk drivers and opportunity hypotheses;
   print/export after review. A hypothesis is not a coverage recommendation or verified fact.
6. Ask a selected-client question. Source-based conversational retrieval is labeled as such;
   insufficient evidence should produce a limitation, not an invented answer.
7. Prepare a follow-up/review/referral proposal. Edit the draft, save/review and explicitly
   approve or reject using the available controls. Approval records a decision only; it
   does not send messages, bind coverage, change policy data or execute outside work.
8. Accept/reject a suggestion or provide a specific correction. Feedback records do not
   automatically retrain a model or prove accuracy improvement.

The conversational, persisted action and feedback controls are retired from the Producer UI
and reviewed draft submission. Representative backend checks passed; complete UI regression
is pending. Earlier local draft-copy functionality was exercised
through browser previews. Do not present a pending API as a verified production workflow.

## Regional Leader

Use the regional portfolio to compare premium at risk, upcoming renewals, open issues and
producer workloads within authorized regional scope. Searchable cards and sortable table
views share the same filters. Select a client to inspect context and prepare its brief;
the integrated regional experience retains the leader's identity. The Executive Dashboard
is a separate agency-wide screenshot fixture; it must not be read as live regional totals.
Only the two implemented personas are available; Account Executive/Service Leader are future.

## Troubleshooting and accessibility

| Symptom | Action and meaning |
|---|---|
| AI unavailable | Use labeled current source preparation, then retry. A fallback is not model-authored text. |
| Job disappeared after backend restart | Refresh source context and generate again; runtime briefs/jobs are session-lived. |
| Source changed during generation | Read refreshed source cards; stale synthesis is suppressed. Regenerate before relying on it. |
| Claim/resource restricted | Review accessible evidence only. Ask the appropriate owner for access through normal governance. |
| Access denied / session expired | Sign in with an authorized account. Changing URL/user parameters cannot grant permission. |
| Draft cannot be approved | Refresh changed source records; stale-source approval is intentionally rejected. |
| No citation/insufficient evidence | Inspect available records and validate with the client; do not invent supporting facts. |

Use Tab to reach controls; arrow keys move within tabs/table rows; Escape closes inspection
sheets and returns focus. Mobile tables scroll inside their containers. Automated axe checks
supplement keyboard and assistive-technology review; they are not WCAG certification.
