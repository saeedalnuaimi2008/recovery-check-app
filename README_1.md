# Recovery Check

## the problem

I've been playing competitive ice hockey for years and training BJJ more recently, and I've been hurt more times than I want to admit. Not from one bad hit or one bad roll — from weeks where I pushed harder than usual and my body just couldn't keep up. By the time I noticed something was off, it was already too late and I was sitting out.

Talking to coaches, this isn't just a me problem. Overuse injuries are one of the most common — and most preventable — reasons athletes get sidelined, especially at the academy level where training loads change fast as players develop. The frustrating part is coaches usually only find out something's wrong after an athlete is already hurt, because there's no easy way to see it coming.

## the actual issue I'm solving

There's a real method sports scientists use to catch this early — it's called ACWR (Acute:Chronic Workload Ratio), and it compares an athlete's recent training load to what they've built up to handle over the past month. When that ratio spikes, injury risk spikes with it. The science has existed for years. What doesn't really exist is a simple way for a player or a coach to actually use it day to day, without a sports science degree or a spreadsheet.

So I built it.

## what it does

A player logs a session — how hard it felt and how long it lasted. The app runs that through the same calculation sports scientists use and tells them, in plain language, where they stand: building up safely, in the sweet spot, overreaching, or at real risk right now. No jargon, no raw numbers with no context — just "here's what's going on and here's what to do about it."

I'm currently piloting this with a coach at Al Ain FC's academy to see if it actually holds up with real players, not just my own training data.

## what's in here

`streamlit-app/` — the coach-facing dashboard (Python). Adjustable windows, charts, meant for someone monitoring load trends.

`react-app/` — the player-facing version. Built for someone who just wants to log a session and know if they're okay to keep pushing or need to back off.

## running it

```
cd streamlit-app
pip install -r requirements.txt
streamlit run app.py
```

```
cd react-app
npm install
npm run dev
```

## built with

python, pandas, numpy — the calculation engine. streamlit + plotly — coach dashboard. react + recharts — player app.

---

next up: letting a coach see all his players in one place instead of everyone only seeing their own data. that's the actual missing piece before this is useful for a whole team instead of one athlete at a time.
