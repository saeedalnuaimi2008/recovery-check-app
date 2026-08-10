import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

# Import your calculation function directly from your backend script
from acwr_engine import calculate_ewma_acwr

# Page Configuration
st.set_page_config(
    page_title="Athlete Workload & ACWR Dashboard",
    layout="wide",
)

st.title("Athlete Workload & Injury Risk Engine")
st.markdown(
    "Analyze Exponentially Weighted Moving Average (EWMA) Acute:Chronic Workload Ratios (ACWR) "
    "to optimize recovery and prevent overuse injuries."
)

# Sidebar: Interactive Simulation Controls
st.sidebar.header("Simulation Controls")
num_days = st.sidebar.slider("Simulation Window (Days)", 30, 120, 60)
base_workload = st.sidebar.slider(
    "Baseline Daily Workload (AU)", 200, 800, 500, step=50
)

st.sidebar.subheader("Workload Spike Injection")
spike_start = st.sidebar.slider(
    "Spike Start Day", 15, num_days - 10, int(num_days * 0.6)
)
spike_intensity = st.sidebar.slider(
    "Spike Extra Workload (AU)", 0, 1000, 600, step=50
)

st.sidebar.markdown("---")
st.sidebar.subheader("EWMA Windows")
acute_days = st.sidebar.number_input("Acute window (days)", min_value=1, value=7)
chronic_days = st.sidebar.number_input("Chronic window (days)", min_value=1, value=28)

# Generate Synthetic Data based on user inputs
np.random.seed(42)
dates = pd.date_range(start="2026-06-01", periods=num_days, freq="D")
workloads = np.random.normal(loc=base_workload, scale=70, size=num_days)

# Inject the workload spike
workloads[spike_start : spike_start + 7] += spike_intensity
raw_df = pd.DataFrame({"date": dates, "workload": workloads})

# Process Data using acwr_engine module
df = calculate_ewma_acwr(
    raw_df, workload_col="workload", acute_days=acute_days, chronic_days=chronic_days
)

# Current Status Metrics (Latest Day)
latest_row = df.iloc[-1]
col1, col2, col3, col4 = st.columns(4)

col1.metric("Daily Workload", f"{int(latest_row['workload'])} AU")
col2.metric("Acute EWMA", f"{int(latest_row['ewma_acute'])} AU")
col3.metric("Chronic EWMA", f"{int(latest_row['ewma_chronic'])} AU")

# Color code the ACWR metric
acwr_val = round(latest_row["acwr"], 2) if pd.notna(latest_row["acwr"]) else None
if acwr_val is None:
    col4.metric("Current ACWR Ratio", "—")
elif acwr_val >= 1.5:
    col4.metric("Current ACWR Ratio", acwr_val, "DANGER ZONE", delta_color="inverse")
elif acwr_val > 1.3:
    col4.metric(
        "Current ACWR Ratio", acwr_val, "MODERATE OVERREACH", delta_color="off"
    )
elif acwr_val >= 0.8:
    col4.metric("Current ACWR Ratio", acwr_val, "OPTIMAL SWEET SPOT")
else:
    col4.metric("Current ACWR Ratio", acwr_val, "UNDERTRAINED", delta_color="off")

st.markdown("---")

# Chart 1: Acute vs. Chronic Workload Comparison (Line Chart)
st.subheader("Acute (Fatigue) vs. Chronic (Fitness) Workload")

fig_workload = go.Figure()
fig_workload.add_trace(
    go.Bar(
        x=df["date"],
        y=df["workload"],
        name="Daily Workload (AU)",
        marker_color="rgba(200, 200, 200, 0.4)",
    )
)
fig_workload.add_trace(
    go.Scatter(
        x=df["date"],
        y=df["ewma_acute"],
        mode="lines",
        name=f"Acute EWMA ({acute_days:g}-Day Fatigue)",
        line=dict(color="#FF4B4B", width=2.5),
    )
)
fig_workload.add_trace(
    go.Scatter(
        x=df["date"],
        y=df["ewma_chronic"],
        mode="lines",
        name=f"Chronic EWMA ({chronic_days:g}-Day Fitness)",
        line=dict(color="#0068C9", width=2.5),
    )
)

fig_workload.update_layout(
    xaxis_title="Date",
    yaxis_title="Arbitrary Units (AU)",
    hovermode="x unified",
    margin=dict(l=20, r=20, t=30, b=20),
)
st.plotly_chart(fig_workload, use_container_width=True)

# Chart 2: ACWR Ratio and Injury Danger Zones
st.subheader("ACWR Ratio & Injury Risk Thresholds")

fig_acwr = go.Figure()

# Add ACWR ratio line
fig_acwr.add_trace(
    go.Scatter(
        x=df["date"],
        y=df["acwr"],
        mode="lines+markers",
        name="ACWR Ratio",
        line=dict(color="#29B5E8", width=3),
    )
)

# Highlight Tim Gabbett Risk Bands
acwr_max = df["acwr"].max()
upper_bound = max(acwr_max + 0.3, 2.0) if pd.notna(acwr_max) else 2.0

fig_acwr.add_hrect(
    y0=0.0,
    y1=0.8,
    fillcolor="blue",
    opacity=0.1,
    line_width=0,
    annotation_text="Undertrained (< 0.8)",
)
fig_acwr.add_hrect(
    y0=0.8,
    y1=1.3,
    fillcolor="green",
    opacity=0.15,
    line_width=0,
    annotation_text="Sweet Spot (0.8 - 1.3)",
)
fig_acwr.add_hrect(
    y0=1.3,
    y1=1.5,
    fillcolor="orange",
    opacity=0.15,
    line_width=0,
    annotation_text="Overreach (1.3 - 1.5)",
)
fig_acwr.add_hrect(
    y0=1.5,
    y1=upper_bound,
    fillcolor="red",
    opacity=0.15,
    line_width=0,
    annotation_text="Danger Zone (≥ 1.5)",
)

fig_acwr.update_layout(
    xaxis_title="Date",
    yaxis_title="ACWR Ratio",
    hovermode="x unified",
    margin=dict(l=20, r=20, t=30, b=20),
)
st.plotly_chart(fig_acwr, use_container_width=True)

# Data Table Display
with st.expander("View Raw Log Data"):
    st.dataframe(
        df[
            [
                "date",
                "workload",
                "ewma_acute",
                "ewma_chronic",
                "acwr",
                "risk_zone",
            ]
        ],
        use_container_width=True,
    )
