# Customer Segment Classifier: Plan

Rebuild the customer segment demo on priyankpatil.com (`/projects/customer-segments`) on real transaction data. A pipeline cleans the transactions, turns them into one row of features per customer, learns the segments with k-means, checks that they hold up and that they predict what customers do next, and serves a classifier that runs in the browser.

The project re-creates, on public data, the customer stratification model built at Clarke Power in 2019: segments that connect customer patterns to revenue potential and risk, and an action for each.

## Goals

1. Learn the segments from data. Today the four segments, their names and their centroids are hand-picked, and the 220 "customers" are random points drawn around them.
2. Show the modelling decisions in the open: which features, how they are scaled, how many segments, how stable they are.
3. Tie segments to business value: revenue share, and whether a segment predicts next year's spend and churn.
4. Use the existing stack (Next.js on Vercel, Supabase Postgres, TypeScript scripts), plus Python with scikit-learn for the modelling step. Keep inference in the browser.

## What changes on the page

The current demo (scatter of customers, four sliders, classification card with an action) stays as the interactive core. What changes:

| Today | After |
|---|---|
| 220 synthetic customers around hand-set centroids | ~4,300 real customers, centroids learned by k-means |
| Segment names chosen first | Segment names chosen after reading each cluster's profile |
| Axes "Purchase intensity" and "Engagement" are made-up projections | Axes are two real, labelled dimensions (see [Demo](#demo)) |
| Sliders: recency, frequency, avg order, tenure | Sliders for the features the model actually uses, with real ranges |
| "49% confidence" from a softmax over distances | Distance to the nearest and second-nearest segment, stated plainly ("closer to Promising than to At-risk by …") |

## Data

**Source:** [Online Retail II](https://archive.ics.uci.edu/dataset/502/online+retail+ii) (UCI Machine Learning Repository, Chen 2019), **CC BY 4.0**. Every transaction of a UK-based online gift retailer from 2009-12-01 to 2011-12-09. Many customers are wholesalers, which makes it a reasonable stand-in for a B2B account base. The file is downloaded by the pipeline, not committed.

Columns: `Invoice`, `StockCode`, `Description`, `Quantity`, `InvoiceDate`, `Price` (GBP), `Customer ID`, `Country`.

What profiling showed (2026-10-28):

| | |
|---|---|
| Rows | 1,067,371 across two sheets (2009–10, 2010–11) |
| Exact duplicate rows | 34,335 |
| Rows with no customer id | 22.8% |
| Cancellation lines (invoice starts with `C`) | 1.8% |
| Negative quantity without a cancellation | 3,457 rows (stock adjustments) |
| Price ≤ 0 | 6,207 rows |
| Non-product stock codes | `POST`, `DOT`, `M` (manual), `C2` (carriage), `D` (discount), `S`, `BANK CHARGES`, `ADJUST`, `AMAZONFEE`, `PADS`, gift vouchers, … |
| Extreme order | one line of 80,995 units, cancelled by a matching −80,995 line |
| **After cleaning** | 776,577 lines · **5,852 customers** · 36,594 invoices · £17.1M revenue |
| Customers in the UK | 91% |
| One-time buyers | 27.6% |
| Orders per customer | median 3, p90 13, p99 46, max 373 |
| Revenue per customer | median £856, p90 £5.4K, p99 £28.6K, max £581K |
| Revenue concentration | top 20% of customers bring 77% of revenue |
| Customers with any return | 41%; median return rate among them 2% |
| Customers with a purchase in the 12 months before 2010-12-01 / 2011-12-01 | 4,239 / 4,293 |

**What this means for modelling:** spend and frequency are heavily skewed (log transforms needed), a few very large accounts would dominate any distance-based model (capping needed), and over a quarter of customers have a single order, so features such as "days between orders" are undefined for them.

## Feature engineering

The core of the project: turning ~780K transaction lines into one comparable row per customer.

### Grain and time

- **One row per customer per snapshot date** (`as_of`). Features use only transactions **before** `as_of`, so a snapshot never sees the future. A test checks this.
- **Behaviour window:** the 12 months before `as_of`, so customers are compared over equal periods. Tenure is the one feature that looks at full history.
- **Snapshots:** 2010-12-01 (training) and 2011-12-01 (scoring and migration), plus month-ends through 2011 for the migration replay.
- **Who is included:** customers with at least one purchase in the window. Others are "lapsed" and reported, not clustered.

### Cleaning rules (applied before features)

| Rule | Why |
|---|---|
| Drop exact duplicates (also removes overlap between the two sheets) | Double counting |
| Drop rows with no customer id from customer features; keep them in totals for the data card | Can't attribute to a customer |
| Keep product stock codes only (5 digits, optional letter); postage, fees, discounts and manual lines are excluded | They are not purchase behaviour |
| Cancellations feed the return rate, never revenue | Revenue would otherwise net out unpredictably |
| Drop non-cancellation lines with quantity ≤ 0 or price ≤ 0 | Stock adjustments and write-offs |
| Each rule's row count is logged | So the data card can show what was removed and why |

### Candidate features

| Feature | Definition (in the 12-month window unless noted) | Captures |
|---|---|---|
| `recency_days` | Days from last purchase to `as_of` | How recently active |
| `orders` | Distinct invoices | Frequency |
| `revenue` | Sum of quantity × price | Value |
| `avg_order_value` | revenue / orders | Order size; wholesale vs. retail |
| `tenure_days` | Days from first ever purchase to `as_of` (full history) | How established |
| `avg_days_between` | Mean gap between consecutive orders; null for one order | Purchase rhythm |
| `active_months` | Months in the window with a purchase (0–12) | Regularity; defined for everyone |
| `product_breadth` | Distinct stock codes bought | Range of the relationship |
| `return_rate` | Cancelled value / purchased value, capped at 1 | Service risk |
| `trend` | Revenue in the last 6 months / revenue in the 6 months before (smoothed) | Growing or declining |
| `country_uk` | UK vs. elsewhere | **Descriptor only**, not a model input |

### Transforms

1. **Log** (`log1p`) for skewed counts and amounts: `orders`, `revenue`, `avg_order_value`, `product_breadth`, `recency_days`.
2. **Cap** each feature at its 1st and 99th percentiles, so a £581K account can't pull a centroid on its own.
3. **Standardise** (z-score) with means and standard deviations from the **training snapshot only**. The same parameters are exported to the browser so a slider value is scaled exactly as in training.
4. **Undefined values:** `avg_days_between` is undefined for one-order customers. Prefer `active_months`, which carries the same idea for everyone; drop `avg_days_between` from the model if so.

### Selecting model inputs

Distance-based clustering counts correlated features twice, so the inputs should be few and not redundant. From profiling (log scale): `orders` vs. `revenue` r = 0.85 and `product_breadth` vs. `revenue` r = 0.75, while `orders` vs. `avg_order_value` r = 0.21 and `return_rate` is uncorrelated with all of them.

Starting set, to be confirmed in stage 3: **`recency_days`, `orders`, `avg_order_value`, `tenure_days`, `return_rate`**. `revenue` is left out (it's `orders × avg_order_value`) but reported on every segment. Each candidate set is compared on cluster quality and on how well segments predict next-year behaviour, not on feel.

Features not used as inputs (`revenue`, `product_breadth`, `trend`, `country_uk`) are still kept as **descriptors**, used to name and explain segments.

**Result (stage 3):** the final inputs are **`recency_days`, `orders`, `revenue`**. `tenure_days` was dropped (censored by the data's start date), `avg_order_value` was swapped for `revenue` (same information on a log scale, better separation), and `return_rate` became a descriptor (it spent a segment on ~3% of heavy returners). Reasons and numbers are in [FEATURES.md](FEATURES.md) and [Decisions](#decisions-made-while-building).

### Storage

`customer_features` (one row per customer per `as_of`) holds raw values. The scaler (caps, means, standard deviations) is fitted in TypeScript (`src/features.ts`) and stored with each model in `model_runs.scaler`. A `build_features(as_of)` SQL function produces a snapshot. [FEATURES.md](FEATURES.md) defines every column.

## Model

- **Algorithm:** k-means with scikit-learn (`KMeans`, k-means++ starts, 20 restarts, fixed seed), in `model/model.py`. Small enough (~4K rows × 5 features) to run in seconds per fit.
- **Choosing k (3–8):** silhouette score and the elbow in within-cluster variance, then a sanity check: each segment must be large enough to act on (≥ 5% of customers) and describable in one sentence.
- **Stability:** re-fit on 20 bootstrap samples; the adjusted Rand index against the main fit should stay high. Unstable segments are merged or the feature set is revisited.
- **Baseline:** classic RFM quintile scores (a rule, no learning). The learned segments have to beat it on next-year prediction to justify themselves.
- **Classifier:** a new customer is assigned to the nearest centroid in scaled space, which is the k-means rule itself. The browser receives centroids and scaler parameters (a few hundred bytes).
- **Naming:** done last, from each segment's profile (feature medians, revenue share, return rate), with one recommended action each.

## Validation

1. **Out-of-time check:** assign segments at 2010-12-01, then measure 2011 revenue per customer and the share who stopped buying, per segment. Good segments separate these clearly; the RFM baseline sets the bar.
2. **Migration:** assign segments again at 2011-12-01 (same centroids and scaler) and build the from → to matrix. How many Champions slipped to At-risk, and how much revenue moved with them.
3. **Monthly replay:** month-end snapshots through 2011 show segment sizes changing over the year.

## Demo

Same shape as today, in plain language, one idea per step:

1. **The data:** a data card with one real customer's transactions, the cleaning counts, and the license.
2. **From transactions to features:** pick a customer and see their transactions become one feature row, then the log, cap and scale steps applied to it.
3. **Segments:** the scatter of real customers. Axes are two real scaled features (for example orders and recency), with a toggle to a 2-D projection if no single pair separates the segments well. Each segment's profile and action is listed.
4. **Classify a customer:** sliders for the model's inputs, nearest segment and runner-up, with the distances shown.
5. **Did it work:** customer share vs. revenue share per segment, next-year revenue and churn per segment against the RFM baseline, and the migration matrix.
6. **Architecture:** a small diagram in the style of the CX eval and wiki-stream pages.

The page says plainly that this is a re-creation on public data, not Clarke Power data.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Storage and transforms | Supabase Postgres, schema `customer_segments`; SQL functions raw → clean → features | Own schema, not exposed through the public API |
| Loader | TypeScript script with `tsx`: download the UCI zip, read the workbook, copy into a raw table | Needs an XLSX reader (open decision) |
| Model | Python: pandas, scikit-learn (`KMeans`, `silhouette_score`, `adjusted_rand_score`), psycopg; pinned in `model/requirements.txt` | Runs in `pipelines/customer-segments/.venv` |
| Serving | Static JSON exported to `lib/customer-segments/` (centroids, scaler, sampled points, metrics) | The page needs no database at request time |
| Orchestration | None: the data is historical, so the pipeline runs on demand | Monthly replay covers "change over time" |

## Schema (`customer_segments`)

```
Landing     raw_transactions · load_runs
Clean       transactions · cleaning_log (rule, rows removed)
Features    customer_features (as_of, customer_id, …)
Model       model_runs (features, k, seed, scaler, selection, stability, baseline) · centroids · assignments
Marts       mart_segment_profile · mart_segment_value · mart_migration · mart_baseline_comparison (views)
```

## Stages

| # | Stage | Builds | Status |
|---|---|---|---|
| 0 | Profile the data; write this plan | This plan | ✅ |
| 1 | **Load and clean:** raw load, cleaning rules as SQL, cleaning log | migration, `load.mts`, `clean_transactions()` | ✅ 1,067,371 rows in, 776,577 kept |
| 2 | **Features:** snapshots, transforms, feature dictionary | `build_features(as_of)`, `src/features.ts`, `FEATURES.md` | ✅ 13 snapshots (2010-12-01, 2011 month starts) |
| 3 | **Model:** feature-set comparison, k selection, stability, RFM baseline | `model/model.py`, `model_runs`, `centroids` | ✅ recency, orders, revenue · k = 4 |
| 4 | **Validate and name:** out-of-time check, migration, segment profiles, names and actions | marts, `src/segments.ts` | ✅ |
| 5 | **Export:** JSON for the page | `export.mts` → `lib/customer-segments/segments.json` (69 KB) | ✅ |
| 6 | **Page:** data card, feature walk-through, segments, classifier, results, architecture | `/projects/customer-segments` | ✅ |

Re-run end to end (with `SUPABASE_DB_URL` set): `npm run segments:load`, `npm run segments:setup` (once, creates the Python environment), `npm run segments:model -- --features`, `npm run segments:export`. `--explore` on the model step prints the full comparison without writing.

## Decisions made while building

- **Modelling moved to Python (2026-10-29).** `model/model.py` replaced the TypeScript k-means. It reproduces the earlier results: same choice (recency, orders, spend, k = 4), silhouette 0.344 in both, stability 0.93 vs. 0.92, identical RFM baseline; 8 of 4,239 customers changed segment because scikit-learn's random starts differ. Scaling is fitted in Python and stored in `model_runs.scaler`; `src/features.ts` applies it in the browser. Each run replaces the previous model.
- **XLSX reading:** `exceljs` (dev dependency) streams the workbook; no CSV conversion step.
- **Storage:** raw rows are deleted after cleaning (`load.mts --keep-raw` keeps them); the cleaning log keeps the counts. The schema uses ~90 MB, the whole database ~200 MB of the free tier's 500 MB.
- **Tenure dropped:** at the training snapshot the data is only a year old, so tenure is capped at ~365 days for everyone (left-censored).
- **Inputs: recency, orders, revenue.** Comparison on the training snapshot (k = 4): silhouette 0.34 vs. 0.27 with average order value instead of revenue, 0.26 when return rate is also added, 0.29 with the wide set.
- **k = 4:** best silhouette among 3–8 for the chosen inputs, smallest segment 18% of customers, adjusted Rand index 0.93 (min 0.84) over 20 bootstrap re-fits.
- **The RFM score predicts next-year spend slightly better.** Segments explain 29% of the variance in next-year log spend (churn 18%); an RFM quintile score cut into 4 groups explains 31% (churn 20%). Stated on the page. The segments' value is in telling apart customers with similar scores who need different actions, not in ranking.
- **One-time buyers** are clustered with everyone; they form most of "Gone quiet" without a special rule.
- **Scatter axes:** two real features, orders (log) and days since last order (log, recent at the top), with a small sideways jitter because orders are whole numbers. Spend, the third input, isn't plotted; the page says so.
- **Monthly replay** (13 snapshots) is computed and exported but not charted, to keep the page to a few results. Visible in it: Newcomers grow from October to December, the Christmas season.
- **Names** were given after reading the profiles: Champions (18% of customers, 65% of revenue, 4% stopped buying the next year), Slowing regulars (27%, 24%, 27%), Newcomers (about three in four first bought in the previous six months; 36%), Gone quiet (one order, 169 days ago; 61%).
