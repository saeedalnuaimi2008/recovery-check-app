import numpy as np
import pandas as pd


def calculate_ewma_acwr(
    df: pd.DataFrame,
    workload_col: str = "workload",
    acute_days: float = 7.0,
    chronic_days: float = 28.0,
) -> pd.DataFrame:
    """Calculates Exponentially Weighted Moving Average (EWMA) ACWR for athlete workload data.

    Formula:
        lambda = 2 / (N + 1)
        EWMA_t = Workload_t * lambda + EWMA_{t-1} * (1 - lambda)
        ACWR = EWMA_acute / EWMA_chronic

    Args:
        df: DataFrame containing daily workload logs (must be sorted chronologically).
        workload_col: Column name representing daily strain/volume (e.g., sRPE, distance, calories).
        acute_days: Time decay window for acute fatigue (default: 7 days).
        chronic_days: Time decay window for chronic fitness (default: 28 days).

    Returns:
        DataFrame with added 'ewma_acute', 'ewma_chronic', 'acwr', and 'risk_zone' columns.
    """
    data = df.copy()

    # Decay constants (lambda) for exponentially weighted moving averages
    lambda_acute = 2 / (acute_days + 1)
    lambda_chronic = 2 / (chronic_days + 1)

    # Calculate EWMA using pandas ewm (adjust=False implements the classic recursive equation)
    data["ewma_acute"] = (
        data[workload_col].ewm(alpha=lambda_acute, adjust=False).mean()
    )
    data["ewma_chronic"] = (
        data[workload_col].ewm(alpha=lambda_chronic, adjust=False).mean()
    )

    # Compute Acute:Chronic Workload Ratio
    # Replace zeros in chronic workload to prevent division by zero errors
    chronic_safe = data["ewma_chronic"].replace(0, np.nan)
    data["acwr"] = data["ewma_acute"] / chronic_safe

    # Categorize injury risk zones based on Tim Gabbett's ACWR thresholds
    conditions = [
        (data["acwr"] < 0.8),
        (data["acwr"] >= 0.8) & (data["acwr"] <= 1.3),
        (data["acwr"] > 1.3) & (data["acwr"] < 1.5),
        (data["acwr"] >= 1.5),
    ]
    categories = [
        "Under-trained (Risk of undertraining)",
        "Sweet Spot (Optimal Low Risk)",
        "Overreach (Moderate Risk)",
        "Danger Zone (High Overuse Injury Risk)",
    ]

    data["risk_zone"] = np.select(conditions, categories, default="Uncategorized")

    return data


if __name__ == "__main__":
    # Quick smoke test / example usage
    np.random.seed(42)
    dates = pd.date_range(start="2026-06-01", periods=60, freq="D")
    base_workload = np.random.normal(loc=500, scale=80, size=60)
    base_workload[35:42] += 600

    raw_df = pd.DataFrame({"date": dates, "workload": base_workload})
    processed_df = calculate_ewma_acwr(raw_df, workload_col="workload")

    print("--- ACWR Engine Output Sample (Day 35 to Day 45) ---")
    print(
        processed_df[
            ["date", "workload", "ewma_acute", "ewma_chronic", "acwr", "risk_zone"]
        ]
        .iloc[35:45]
        .to_string(index=False)
    )
