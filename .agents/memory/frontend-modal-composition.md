---
name: Modal composition
description: A durable frontend composition rule for the vanilla JavaScript client.
---

Complex modal branches in the vanilla JavaScript client should be assembled from named string sections or helper functions rather than deeply nested conditional template literals.

**Why:** Nested template literals made a valid-looking modal renderer difficult to parse and caused a syntax failure at the function boundary, obscuring the actual malformed branch.

**How to apply:** When a modal needs conditional sections, calculate options, body content, and footer actions separately, then compose the final modal string once.