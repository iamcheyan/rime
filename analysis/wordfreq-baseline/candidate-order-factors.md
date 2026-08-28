# Baseline candidate-order factors

Generated from the checked-in configuration at the baseline commit recorded in `manifest.json`.

1. `sbzr.dict.yaml` imports the static tables in listed order; each table declares `sort: by_weight` and columns `text`, `code`, `weight`.
2. `sbzr.schema.yaml` translators are `punct_translator`, `zdy_priority_translator`, `table_translator`, `easy_en`, and `history_translator` (`history_translator` has `size: 1` and `initial_quality: 10000`).
3. The filter order is `simplifier` -> `lua_filter@length_priority_filter` -> `lua_filter@dynamic_freq_filter` -> `lua_filter@en_switch_filter` -> `uniquifier` (`sbzr.schema.yaml:49-54`).
4. `lua/length_priority.lua` buffers up to 512 candidates, sorts by UTF-8 text length ascending, and preserves source order for equal lengths. This discards cross-length weight ordering before the dynamic filter sees candidates.
5. `lua/dynamic_freq.lua` reads the runtime LevelDb `dynamic_freq` and the local runtime sync file `dynamic_freq.local.txt`; it scans at most 64 candidates after length sorting and promotes the most recently recorded matching text/type. No private runtime data was read for this baseline.
6. `translator.enable_completion` and `sentence_over_completion` are enabled in the current `sbzr.schema.yaml`; completion therefore remains part of the regression surface. `easy_en.enable_completion` is also enabled.
7. `uniquifier` is last and removes duplicate candidate text after the preceding filters.

The rank fields in `probes.json` are a static pre-filter approximation: weight descending, then import order and row order. They are not a claim about a live Rime deployment.
