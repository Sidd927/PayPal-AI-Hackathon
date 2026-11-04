# Phase 2 Sponsor Strategy

Constraint: one Grand **or** one Honorable Mention, **plus one** Sponsor prize. Sponsor pages (`ag-grid.com`, Devpost sponsor tabs) could not be fetched from this environment, so the evidence below comes from search extracts and npm package sources.

| Sponsor | What it is / access | Evidence of what judges want | Genuine use in Unstuck | Effort | Risk | Decision |
|---|---|---|---|---|---|---|
| **AG Grid** ($5k / $2k / 3×$1k) | AG Grid Community (MIT); **AG Studio** (commercial, embedded analytics on AG Grid + AG Charts; 45-day free trial key; runs with a watermark without one) | AG Grid's hackathon post is titled *"Hackathon: PayPal and AG Studio"* and pitches self-serve dashboards, drag-and-drop charts and an AI assistant. The closest competitor (*Owed*) uses AG Studio | **Board:** AG Grid with custom renderers, transparent risk column, external reason filter, quick search, pinned totals, CSV export, change flashing. **Activity log:** AG Grid. **Insights:** AG Studio with a pre-built receivables report over three live tables, cross-filtering, a self-serve editor, brand theme | Done | Low (watermark without a trial key) | **Primary sponsor target** |
| Render (credits) | PaaS; free web service | "Using Render tools" | Hosting via `render.yaml` | Done (config) | Deployment needs the owner's account | Use for hosting; not the prize target, since only one sponsor prize can be won |
| APIMatic | SDK/docs generation from OpenAPI (it generates PayPal's server SDKs) | Unknown | Could publish an OpenAPI spec and generated SDK for Unstuck's own API. Not part of the core user journey | Medium | Low | Skip: no user value in the demo |
| Bryntum | Scheduler/Gantt (commercial) | Unknown | A payment-plan timeline could use it, but a 3-row table is clearer | Medium | Medium | Skip |
| Channel3 | Product catalogue API | — | No product discovery in receivables | — | — | Skip |
| Elastic | Search and observability | — | Overkill for this data volume | High | — | Skip |
| Zapier | Automation | — | Possible future "invoice paid → Slack" | — | — | Roadmap |

## Strategy

1. **Grand Prize** on the core product (two-sided resolution in PayPal).
2. **AG Grid** as the sponsor prize. Use AG Grid where a grid is the right tool (board, audit log), and AG Studio where an owner needs to explore (Insights). Mention both explicitly in the Devpost "Built with" list, the README and the video (about 5 seconds on Insights).
3. Ask the owner to request the free **AG Studio trial key** (`NEXT_PUBLIC_AG_GRID_LICENSE_KEY`) before recording, to remove the watermark.
