# Feature dictionary

Built by `customer_segments.build_features(as_of)` (SQL) into `customer_features`, one row per customer per snapshot. Scaling is fitted in `model/model.py` and stored with the model; `src/features.ts` applies the same steps in the browser.

## Rules

- **No look-ahead.** A snapshot uses only transactions dated before `as_of`.
- **Equal windows.** Behaviour features use the 12 months (365 days) before `as_of`. Tenure is the only feature that looks further back.
- **Who is in a snapshot:** customers with at least one purchase in the window. Everyone else is "lapsed" for that snapshot.
- **Purchases vs. returns:** purchases come from `transactions` (cleaned product lines); cancellations come from `returns` and only feed `return_rate`.

## Features

| Column | Definition | Model input | Transform |
|---|---|---|---|
| `recency_days` | Days from the last order to `as_of` | ✅ | log |
| `orders` | Distinct invoices in the window | ✅ | log |
| `revenue` | Σ quantity × price in the window (GBP) | ✅ | log |
| `avg_order_value` | revenue / orders | descriptor | log |
| `tenure_days` | Days from the first purchase ever to `as_of` | ✗ (censored, see below) | — |
| `avg_days_between` | Mean gap between orders; null with one order | ✗ (undefined for 28% of customers) | — |
| `active_months` | Calendar months in the window with an order (0–12) | descriptor | — |
| `product_breadth` | Distinct stock codes bought | descriptor | log |
| `return_rate` | Cancelled value / purchased value, capped at 1 | descriptor | — |
| `trend` | (revenue in the last 182 days − revenue before) / revenue, in [−1, 1] | descriptor | — |
| `country_uk` | Most frequent country is the United Kingdom | descriptor | — |

**Descriptors** are not used to form segments but are reported for each one, to name and explain them.

## Scaling (model inputs)

Fitted on the training snapshot (2010-12-01) only and stored with the model (`model_runs.scaler`):

1. **Log:** `log(1 + x)` for skewed counts and amounts.
2. **Cap:** clip the transformed value to its 1st and 99th percentile in training, so a single very large account can't pull a segment centre.
3. **Standardise:** subtract the training mean, divide by the training standard deviation.

The page applies the same three steps to slider values before finding the nearest segment.

## Why some candidates were dropped

- **`tenure_days`:** the data starts on 2009-12-01, so at the 2010-12-01 training snapshot no customer can show more than ~365 days. Tenure there measures when the data starts, not how long the customer has bought, and it isn't comparable with later snapshots.
- **`avg_days_between`:** undefined for one-order customers. `active_months` carries the same idea for everyone but correlates 0.94 with `orders`, so it adds little as an input.
- **`avg_order_value` as an input:** on a log scale, `revenue = orders × avg_order_value`, so any two of the three carry the same information. Using `revenue` directly separated segments better (silhouette 0.34 vs. 0.27 at k = 4) and predicted next-year spend better.
- **`return_rate` as an input:** 59% of customers have no returns; as an input it spent one of the segments on ~3% of customers who returned a lot, without improving prediction. It's reported per segment instead.

Correlations (log-scaled and capped, training snapshot): `orders`–`revenue` 0.82, `orders`–`active_months` 0.94, `revenue`–`product_breadth` 0.72, `recency_days`–`orders` −0.49, `return_rate` ≈ 0 with everything.
