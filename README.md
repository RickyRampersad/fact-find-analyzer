# factfind360.com

This repository is the site. Every file in the root is served at the root:
`ffproject.html` is what advisors open at **factfind360.com/ffproject**.

## The seven files

| File | Served at | What it is |
|---|---|---|
| `index.html` | `/` | Home page and the sign-in for Fact Find Insights |
| `ffproject.html` | `/ffproject` | **The fact find.** The form advisors fill in with clients |
| `insights.html` | `/insights` | The older manager dashboard and approval queue |
| `walkthrough.html` | `/walkthrough` | The guided tour, shareable without signing in |
| `wall.html` | `/wall` | Branch wall board |
| `try.html` | `/try` | The guest page: the practice fact find and the sample dashboard |
| `factfind360-film-v21.mp4` | | The short film (1m48s), first on `/walkthrough` and behind the home page card: the form field for field, RAI, the e-mails, both dashboards |
| `film-poster-v21.jpg` | | Its still frame, on the home page card and in link previews |
| `factfind360-film-v20.mp4` | | The earlier 90-second cut, kept for links already shared |
| `film-poster-v20.jpg` | | Its still frame |
| `factfind360-walkthrough-v20.mp4` | | The full 5m29s walkthrough, second on `/walkthrough`, with chapters |
| `tour-poster-v20.jpg` | | Its still frame |

`factfind360-tour-v19.mp4` and `tour-poster-v19.jpg` are the previous cut. They
stay so that links already sent still play.

`insights.html` and `wall.html` are not linked from the home page. Nothing on
screen will tell you if they go missing, so do not delete a file just because
you cannot find a link to it.

## Changing the site

Edit the file, commit, push. Netlify rebuilds and the change is live.

Push to a branch and open a pull request instead of committing to `main`, and
Netlify builds a **deploy preview** on its own URL. That is a full working copy
of the site with your change on it, and it touches nothing live. Open a real
case on the preview before merging. Merging publishes it.

## Three things that will bite

**The filename is lowercase.** `ffproject.html`, not `FFPROJECT.html`. The
address in circulation is factfind360.com/ffproject. Renaming the file moves
that address and breaks every link an advisor already has.

**Never deploy by dragging a folder onto Netlify again.** That is how this site
was published until August 2026, and a manual drag replaces every file on the
site — anything missing from the folder is deleted. It is what removed
`walkthrough.html`, `insights.html`, `wall.html` and the video on 23 August,
and what truncated the video on the deploy after it. Now that the site is
connected to this repository, git is the way in.

**One host, and that host is Netlify.** A Vercel project was also connected to
this repository and its builds failed on every push. The failures were doing
no harm — they were preventing one.

`netlify.toml` is the only thing standing between this repository and a public
copy of the branch with nothing guarded. It 404s `/apps-script/*` (18 files of
Apps Script source and install notes) and `/wall-audio/*` (50 MP3s that read
advisor names and production figures aloud), and it puts `no-store` and
`no-referrer` on `ffproject.html`, `insights.html`, `wall.html` and
`confirm.html`. **Vercel reads none of it.** A Vercel build that succeeded
would have published all of that, unguarded, on a second public URL.

So: do not connect a second host to this repository. If one ever has to be
connected, reproduce all six of those rules in that host's own config and test
the live headers before anything points at it — the settings do not travel.

## If a deploy goes wrong

Netlify keeps every previous deploy. In **Deploys**, open the last good one and
press **Publish deploy**. The site is back in about thirty seconds. Then fix
the problem here and push.
