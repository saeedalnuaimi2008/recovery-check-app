import streamlit as st
import pandas as pd
from streamlit_gsheets import GSheetsConnection

st.set_page_config(page_title="Athlete Readiness", layout="centered")

st.title("Athlete Performance & Recovery")
st.caption("Daily readiness & injury prevention guide")

# Connect to Google Sheets
conn = st.connection("gsheets", type=GSheetsConnection)

# Fetch existing data from sheet
try:
    data = conn.read(ttl="0")
    logs_df = pd.DataFrame(data)
except Exception:
    logs_df = pd.DataFrame(columns=["Type", "Duration", "RPE", "Load"])

# Calculate Load Metrics
if not logs_df.empty and "Load" in logs_df.columns:
    total_load = logs_df["Load"].astype(float).sum()
    acute_load = total_load / max(len(logs_df), 1)
else:
    total_load = 0.0
    acute_load = 0.0

chronic_baseline = 350.0
acwr = acute_load / chronic_baseline if chronic_baseline > 0 else 1.0

# Traffic Light Display
if acwr > 1.45:
    st.error("RED LIGHT: High Fatigue / Rest Advised")
    st.info("**Today's Directive:** Fatigue spike detected. Swap high-intensity or live collision work today for light technical drills, mobility, or active recovery.")
elif acwr > 1.2:
    st.warning("YELLOW LIGHT: Moderate Strain / Capacity")
    st.info("**Today's Directive:** Fatigue is accumulating. Maintain your scheduled session volume, but avoid pushing extra high-intensity max efforts.")
else:
    st.success("GREEN LIGHT: Prime Readiness")
    st.info("**Today's Directive:** Your fitness base supports your current workload. You are cleared for full-intensity training and high impact.")

st.divider()

# Workout Form
st.subheader("Log Session")

with st.form("workout_form", clear_on_submit=True):
    workout_type = st.selectbox(
        "Session Type",
        [
            "High-Impact / Contact Session",
            "High-Intensity Intervals / Conditioning",
            "Game / Competition",
            "Strength & Power Training",
            "Technical / Skill Work",
            "Active Recovery / Low Intensity"
        ]
    )
    duration = st.slider("Duration (minutes)", 15, 180, 60, step=15)
    effort = st.slider("Session Effort (RPE 1-10)", 1, 10, 7)
    
    submitted = st.form_submit_button("Update Readiness")
    
    if submitted:
        calculated_load = duration * effort
        new_row = pd.DataFrame([{
            "Type": workout_type,
            "Duration": duration,
            "RPE": effort,
            "Load": calculated_load
        }])
        updated_df = pd.concat([logs_df, new_row], ignore_index=True)
        conn.update(data=updated_df)
        st.success("Session saved to cloud database!")
        st.rerun()

st.subheader("Recent Logs")
st.dataframe(logs_df, use_container_width=True)
