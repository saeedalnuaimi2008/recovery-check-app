import streamlit as st
import pandas as pd

st.set_page_config(page_title="Athlete Readiness", layout="centered")

st.title("Athlete Performance & Recovery")
st.caption("Daily readiness & injury prevention guide")

# 1. Initialize session logs in state (General baseline)
if "logs" not in st.session_state:
    st.session_state.logs = [
        {"Type": "High-Intensity Session", "Duration": 60, "RPE": 8, "Load": 480},
        {"Type": "Game / Competition", "Duration": 60, "RPE": 9, "Load": 540},
        {"Type": "General Conditioning", "Duration": 45, "RPE": 7, "Load": 315},
    ]

# 2. Under-the-hood ACWR / Strain Calculation
total_load = sum(item["Load"] for item in st.session_state.logs)
acute_load = total_load / max(len(st.session_state.logs), 1)
chronic_baseline = 350.0
acwr = acute_load / chronic_baseline

# 3. Traffic Light Status & Directives
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

# 4. Fast 5-Second Workout Entry
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
        st.session_state.logs.insert(0, {
            "Type": workout_type,
            "Duration": duration,
            "RPE": effort,
            "Load": calculated_load
        })
        st.rerun()

# 5. Recent Logs Display
st.subheader("Recent Logs")
df = pd.DataFrame(st.session_state.logs)
st.dataframe(df, use_container_width=True)
