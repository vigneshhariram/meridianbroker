# Six-slide presentation

Open the [browser presentation](meridian-solution.html) or [six-page PDF](meridian-solution.pdf).
PowerPoint is not required. The HTML works offline; use Previous/Next, arrow keys or Home/End.
Print shows every slide. An [editable six-slide PowerPoint](meridian-solution.pptx) is optional.

The short story covers the business decision, authorized SQLite scope, architecture,
grounded AI flow, current Producer/Regional experiences and measured evidence/limitations.
It describes brief review and manual draft copying; removed Q&A, approval and feedback screens
are not presented as current UI. Financial assumptions are explicitly synthetic.

Rebuild all three formats from the repository root:

```powershell
python docs/presentation/build_presentation.py
```

The single builder uses installed python-pptx, Playwright/Edge and pypdf. It makes no
database or provider calls and writes only presentation artifacts. Navigation and the
six-page PDF count passed; see [artifact-check.json](artifact-check.json).