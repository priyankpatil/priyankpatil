"""Model: compare candidate feature sets and k on the training snapshot, check
stability and next-year usefulness against an RFM baseline, then fit the chosen
configuration and assign every snapshot.

    python pipelines/customer-segments/model/model.py --explore   # print the comparison only
    python pipelines/customer-segments/model/model.py             # fit CHOSEN and write it

    --features                  (re)build the feature snapshots first: TRAIN_AS_OF and each 2011 month start
    SETS=rfm,core K_RANGE=3,4   limit the comparison (for quick --explore runs)

Reads customer_features and writes model_runs, centroids and assignments
(replacing earlier runs). The scaler is stored in the shape src/features.ts
reads, so the page scales slider values exactly as this script scaled the
training data. Connects with SUPABASE_DB_URL.
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd
import psycopg
from psycopg.types.json import Jsonb
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

TRAIN_AS_OF = "2010-12-01"
SEED = 20101201
BOOTSTRAPS = 20
K_RANGE = [int(k) for k in os.environ.get("K_RANGE", "3,4,5,6,7,8").split(",")]

# Skewed counts and amounts are compared on a log scale (FEATURES.md).
LOG_FEATURES = {"recency_days", "orders", "revenue", "avg_order_value", "product_breadth"}

# tenure_days is not a candidate: the data starts 2009-12-01, so at the training
# snapshot every customer's tenure is capped at ~365 days (see FEATURES.md).
FEATURE_SETS: dict[str, list[str]] = {
    "rfm": ["recency_days", "orders", "revenue"],
    "rfm_aov": ["recency_days", "orders", "avg_order_value"],
    "rfm_breadth": ["recency_days", "orders", "revenue", "product_breadth"],
    "core": ["recency_days", "orders", "avg_order_value", "return_rate"],
    "wide": ["recency_days", "orders", "avg_order_value", "active_months", "product_breadth", "return_rate", "trend"],
}

# Chosen after reading the --explore table (PLAN.md → Decisions).
CHOSEN = {"set": "rfm", "k": 4}

ALL_FEATURES = ["recency_days", "orders", "revenue", "avg_order_value", "tenure_days", "active_months", "product_breadth", "return_rate", "trend"]


# ── Scaling: log → cap at 1st/99th percentile → z-score, fitted on training only ─


def fit_scaler(features: list[str], train: pd.DataFrame) -> list[dict]:
    scaler = []
    for feature in features:
        log = feature in LOG_FEATURES
        t = np.log1p(np.maximum(train[feature].to_numpy(float), 0)) if log else train[feature].to_numpy(float)
        low, high = np.quantile(t, [0.01, 0.99])  # linear interpolation, as in src/features.ts
        capped = np.clip(t, low, high)
        sd = capped.std() or 1.0  # population standard deviation
        scaler.append({"feature": feature, "log": log, "low": float(low), "high": float(high), "mean": float(capped.mean()), "sd": float(sd)})
    return scaler


def scale(scaler: list[dict], rows: pd.DataFrame) -> np.ndarray:
    cols = []
    for e in scaler:
        x = rows[e["feature"]].to_numpy(float)
        t = np.log1p(np.maximum(x, 0)) if e["log"] else x
        cols.append((np.clip(t, e["low"], e["high"]) - e["mean"]) / e["sd"])
    return np.column_stack(cols)


# ── Checks ───────────────────────────────────────────────────────────────────


def r_squared(outcome: np.ndarray, groups: np.ndarray) -> float:
    """Share of an outcome's variance explained by group means."""
    s = pd.Series(outcome)
    between = s.groupby(groups).transform("mean")
    return float(((between - s.mean()) ** 2).sum() / ((s - s.mean()) ** 2).sum())


def rfm_groups(train: pd.DataFrame, k: int) -> np.ndarray:
    """Classic RFM: quintile scores for recency, frequency and spend, summed, cut into k groups."""
    n = len(train)

    def quintile(values: pd.Series, higher_is_better: bool) -> np.ndarray:
        rank = values.rank(method="first", ascending=higher_is_better).to_numpy() - 1
        return 1 + np.floor(rank / n * 5)

    total = pd.Series(quintile(train.recency_days, False) + quintile(train.orders, True) + quintile(train.revenue, True))
    position = total.rank(method="min").to_numpy() - 1
    return np.minimum(k - 1, np.floor(position / n * k)).astype(int)


def fit(points: np.ndarray, k: int, seed: int, restarts: int = 20) -> KMeans:
    """k-means++ starts, best of `restarts` fits by inertia."""
    return KMeans(n_clusters=k, init="k-means++", n_init=restarts, random_state=seed).fit(points)


def evaluate(set_name: str, k: int, points: np.ndarray, next_revenue: np.ndarray, churned: np.ndarray):
    model = fit(points, k, SEED)
    rng = np.random.default_rng(SEED + k)
    aris = []
    for b in range(BOOTSTRAPS):
        sample = points[rng.integers(0, len(points), len(points))]
        aris.append(adjusted_rand_score(model.labels_, fit(sample, k, SEED + b + 1, restarts=5).predict(points)))
    sizes = np.bincount(model.labels_, minlength=k) / len(points)
    candidate = {
        "set": set_name,
        "k": k,
        "silhouette": float(silhouette_score(points, model.labels_)),
        "smallest_share": float(sizes.min()),
        "stability": float(np.mean(aris)),
        "r2_next_revenue": r_squared(next_revenue, model.labels_),
        "r2_churn": r_squared(churned, model.labels_),
    }
    return candidate, model, aris


# ── Database ─────────────────────────────────────────────────────────────────

FEATURE_SQL = """
select customer_id, recency_days, orders, revenue::float8 as revenue, avg_order_value::float8 as avg_order_value,
       tenure_days, active_months, product_breadth, return_rate, trend
from customer_segments.customer_features where as_of = %s order by customer_id
"""


def snapshot(conn: psycopg.Connection, as_of: str) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(FEATURE_SQL, (as_of,))
        return pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description]).astype({c: float for c in ALL_FEATURES})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--explore", action="store_true", help="print the comparison only")
    parser.add_argument("--features", action="store_true", help="rebuild the feature snapshots first")
    args = parser.parse_args()

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("Set SUPABASE_DB_URL.")

    with psycopg.connect(db_url, keepalives=1) as conn:
        conn.execute("set statement_timeout = 0")

        if args.features:
            for as_of in [TRAIN_AS_OF] + [f"2011-{m:02d}-01" for m in range(1, 13)]:
                n = conn.execute("select customer_segments.build_features(%s)", (as_of,)).fetchone()[0]
                print(f"features {as_of}: {n} customers")
            conn.commit()

        train = snapshot(conn, TRAIN_AS_OF)
        if train.empty:
            sys.exit(f"No features for {TRAIN_AS_OF}; run with --features first.")
        nxt = pd.DataFrame(
            conn.execute("select customer_id, revenue::float8, bought from customer_segments.next_year(%s) order by customer_id", (TRAIN_AS_OF,)).fetchall(),
            columns=["customer_id", "revenue", "bought"],
        )
        assert (nxt.customer_id.to_numpy() == train.customer_id.to_numpy()).all(), "next_year rows must line up with training rows"
        next_revenue = np.log1p(nxt.revenue.to_numpy(float))
        churned = (~nxt.bought.astype(bool)).astype(float).to_numpy()

        # Correlations of the log-scaled candidates, to spot inputs that would be counted twice.
        correlations = pd.DataFrame(scale(fit_scaler(ALL_FEATURES, train), train), columns=ALL_FEATURES).corr().round(2)

        selection = []
        only = os.environ.get("SETS")
        for set_name, features in FEATURE_SETS.items():
            if only and set_name not in only.split(","):
                continue
            points = scale(fit_scaler(features, train), train)
            for k in K_RANGE:
                candidate, _, _ = evaluate(set_name, k, points, next_revenue, churned)
                selection.append(candidate)
                print(f"{set_name:<11} {k}  " + "  ".join(f"{key}={value:.3f}" for key, value in candidate.items() if key not in ("set", "k")))
        baseline = [
            {"k": k, "r2_next_revenue": round(r_squared(next_revenue, g), 3), "r2_churn": round(r_squared(churned, g), 3)}
            for k in K_RANGE
            for g in [rfm_groups(train, k)]
        ]
        print("RFM baseline", baseline)

        if args.explore:
            print("Correlations (log-scaled, capped):")
            print(correlations.to_string())
            return

        # ── Fit the chosen configuration and write it ───────────────────────

        features = FEATURE_SETS[CHOSEN["set"]]
        scaler = fit_scaler(features, train)
        points = scale(scaler, train)
        _, model, aris = evaluate(CHOSEN["set"], CHOSEN["k"], points, next_revenue, churned)

        # Number segments by average revenue, highest first, so segment 0 is always the most valuable.
        revenue_by = train.revenue.groupby(model.labels_).mean()
        order = revenue_by.sort_values(ascending=False).index.to_numpy()
        centroids = model.cluster_centers_[order]

        with conn.transaction():
            conn.execute("delete from customer_segments.model_runs")  # one model at a time; assignments and centroids cascade
            model_id = conn.execute(
                """insert into customer_segments.model_runs (trained_on, features, k, seed, scaler, selection, stability, baseline, is_current)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, true) returning model_id""",
                (
                    TRAIN_AS_OF, features, CHOSEN["k"], SEED, Jsonb(scaler),
                    Jsonb({"chosen": CHOSEN, "candidates": selection, "correlations": correlations.to_dict(), "engine": "python · scikit-learn"}),
                    Jsonb({"bootstraps": BOOTSTRAPS, "mean_ari": round(float(np.mean(aris)), 3), "min_ari": round(float(np.min(aris)), 3)}),
                    Jsonb(next(b for b in baseline if b["k"] == CHOSEN["k"])),
                ),
            ).fetchone()[0]
            with conn.cursor() as cur:
                cur.executemany(
                    "insert into customer_segments.centroids values (%s, %s, %s)",
                    [(model_id, segment, [float(v) for v in c]) for segment, c in enumerate(centroids)],
                )

            snaps = [r[0] for r in conn.execute("select distinct to_char(as_of, 'YYYY-MM-DD') from customer_segments.customer_features order by 1").fetchall()]
            with conn.cursor() as cur:
                for as_of in snaps:
                    rows = train if as_of == TRAIN_AS_OF else snapshot(conn, as_of)
                    d = np.linalg.norm(scale(scaler, rows)[:, None, :] - centroids[None, :, :], axis=2)
                    ranked = np.argsort(d, axis=1)
                    idx = np.arange(len(rows))
                    with cur.copy("copy customer_segments.assignments from stdin") as copy:
                        for i, cid in enumerate(rows.customer_id.to_numpy()):
                            best, second = ranked[i, 0], ranked[i, 1]
                            copy.write_row((model_id, as_of, int(cid), int(best), float(d[idx[i], best]), int(second), float(d[idx[i], second])))

        print(f"Model {model_id}: {', '.join(features)} · k={CHOSEN['k']} · {len(snaps)} snapshots assigned")


if __name__ == "__main__":
    main()
