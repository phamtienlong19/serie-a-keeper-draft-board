# Yahoo snapshot reconciliation — 6 October 2026

The 7 October Yahoo snapshot refresh preserves the same 300 player IDs and the same 182 mapped / 16 unresolved historical rows. XRank is the snapshot's per-player OR value; its array order is average-pick order. The normalized player file and persisted ID map were regenerated from the new raw snapshot; no league declarations or resolver inputs were changed by that metadata refresh.

Review uses only the current raw snapshot, canonical history and the previously checked-in identity map. No web facts or fuzzy matches were used. Raw Yahoo source and canonical `teams.json` remain unchanged by normalization.

The initially reported 17 unresolved historical rows were:

| Historical player | Existing repository evidence | Outcome |
| --- | --- | --- |
| Isaiah Jackson | Previous Yahoo ID 6564 absent from current 300 | Unresolved / absent from supplied snapshot |
| Chris Boucher | Exact name absent; no previously mapped ID | Unresolved |
| Lonzo Ball | Exact name absent; no previously mapped ID | Unresolved |
| Obi Toppin | Previous Yahoo ID 6400 absent | Unresolved / absent from supplied snapshot |
| Buddy Hield | Previous Yahoo ID 5637 absent | Unresolved / absent from supplied snapshot |
| Chris Paul | Exact name absent; no previously mapped ID | Unresolved |
| Taylor Hendricks | Previous Yahoo ID 10110 absent | Unresolved / absent from supplied snapshot |
| Rob Dillingham | Exact name absent; no previously mapped ID | Unresolved |
| Gary Trent Jr | Exact name absent; no previously mapped ID | Unresolved |
| Cole Anthony | Exact name absent; no previously mapped ID | Unresolved |
| Tyus Jones | Exact name absent; no previously mapped ID | Unresolved |
| Cam Whitmore | Previous Yahoo ID 10118 absent | Unresolved / absent from supplied snapshot |
| Caris LeVert | Previous Yahoo ID 5651 absent | Unresolved / absent from supplied snapshot |
| D'Angelo Russell | Exact name absent; no previously mapped ID | Unresolved |
| Cam Thomas | Exact name absent; no previously mapped ID | Unresolved |
| Bobby Portis | Previous Yahoo ID **5482** is present as **Bobby Portis Jr.** | Resolved through established stable ID; external name change |
| Yang Hansen | Exact name absent; no previously mapped ID | Unresolved |

Absence does not establish retirement, current league membership, a changed Yahoo ID or a stale historical record. Those explanations remain unknown. For rows without a previously mapped ID, an unknown alias cannot be excluded from these files alone.

The normalization pipeline now preserves an established ID when a supplied snapshot changes its display name, and rejects conflicts between the established ID and exact-name candidates. Bobby Portis is recorded with `PERSISTED_YAHOO_ID`; no suffix stripping or fuzzy matching was introduced. This leaves **182 mapped historical rows and 16 unresolved rows**, with zero ambiguous matches.

None of the original 17 is one of the 12 declared keepers. All declared keepers have unique canonical/Yahoo identities, so the baseline remains **300 − 12 = 288 available players**. Missing enrichment cannot change keeper eligibility, original drafter or prior round. Those facts remain in canonical history. No incorrect join was introduced. Selecting an unreconciled player in a scenario displays a visible pool reconciliation warning.
