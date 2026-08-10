# Athlete Workload & Recovery Engine (ACWR)

Acute-to-Chronic Workload Ratio modeling designed to track training fatigue and prevent overtraining injuries.

## Background & Problem

In high-impact sports like ice hockey and combat sports like BJJ, physical fatigue degrades biomechanical control long before performance drops. Standard tracking methods rely on simple volume counts or subjective feedback, which fail to capture how fatigue actually builds up over time.

When acute training spikes faster than an athlete's chronic fitness base, soft-tissue injury risk increases significantly. This project applies an Acute-to-Chronic Workload Ratio (ACWR) model using Exponentially Weighted Moving Averages (EWMA) to weight recent training sessions higher than older ones, flagging when an athlete enters high-risk workload zones before injury occurs.

## Key Features

* EWMA ACWR Calculation: Uses exponential weighting to mirror physiological fatigue decay instead of basic rolling averages.
* Interactive Streamlit Interface: Web dashboard to log daily sessions, plot workload trends, and view real-time risk alerts.
* React / Vite Frontend: Modular UI setup built for fast web deployment and future API integration.
* Wearable & sRPE Integration: Structured to ingest Session RPE (sRPE) data, manual logs, or hardware telemetry.

## Tech Stack

* Analytics: Python, Pandas, NumPy
* Web UI: Streamlit, React, Vite, Tailwind CSS
* Deployment: Git, Streamlit Cloud, Vercel

## How the Model Works

The engine calculates the ratio between 7-day acute workload (fatigue) and 28-day chronic workload (fitness base):

ACWR = Acute Workload (7-Day EWMA) / Chronic Workload (28-Day EWMA)

Workload Zones:
* < 0.80: Undertraining zone (loss of conditioning)
* 0.80 - 1.30: Sweet spot (optimal training load)
* 1.35 - 1.50: Warning zone (fatigue accumulation)
* > 1.50: Danger zone (high overtraining/injury risk)

## Local Setup

### Streamlit App
```bash
git clone [https://github.com/YOUR_USERNAME/recovery-check-app.git](https://github.com/YOUR_USERNAME/recovery-check-app.git)
cd recovery-check-app/streamlit-app
pip install -r requirements.txt
streamlit run app.py
