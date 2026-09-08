# Team economy invariants

- Direct money (`Yang`, `Won`, `GEM`) is attributed by percentage (`basis points`). Fractional results are allowed.
- Physical items are never divided fractionally. `totalQuantity` and `ourQuantity` are integers.
- The team percentage is not used to determine final physical item ownership. The user records the actual integer `ourQuantity`.
- Pile splitting works only on `ourQuantity`; any non-divisible remainder is stored separately.
- The DOBRYTEMAT item catalogue is imported idempotently into the persistent economy catalogue. Unknown items can extend the same catalogue later.
