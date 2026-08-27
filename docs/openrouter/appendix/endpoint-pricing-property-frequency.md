# Endpoint pricing property frequencies

These tables count the presence of each property in the endpoint `pricing` object. Frequencies
are sorted from most to least frequent; ties are alphabetical. Percentages use the number of
endpoint records in the corresponding profile as the denominator.

The source bundle was crawled at `2026-08-24T14:30:09.259Z`. The all population contains 1,231
endpoints. The text-only population contains the 786 models and 1,080 endpoints whose associated
model has `text` in both `input_modalities` and `output_modalities`.

## All

| Pricing property       | Frequency | Percent |
| ---------------------- | --------: | ------: |
| `completion`           |     1,231 |  100.0% |
| `discount`             |     1,231 |  100.0% |
| `display_pricing`      |     1,231 |  100.0% |
| `prompt`               |     1,231 |  100.0% |
| `input_cache_read`     |       743 |   60.4% |
| `web_search`           |       303 |   24.6% |
| `input_cache_write`    |       182 |   14.8% |
| `overrides`            |       109 |    8.9% |
| `input_cache_write_1h` |       101 |    8.2% |
| `image`                |        58 |    4.7% |
| `audio`                |        56 |    4.5% |
| `internal_reasoning`   |        49 |    4.0% |
| `image_output`         |        47 |    3.8% |
| `input_audio_cache`    |        46 |    3.7% |
| `image_token`          |        28 |    2.3% |
| `audio_output`         |         2 |    0.2% |

## Text only

| Pricing property       | Frequency | Percent |
| ---------------------- | --------: | ------: |
| `completion`           |     1,080 |  100.0% |
| `discount`             |     1,080 |  100.0% |
| `display_pricing`      |     1,080 |  100.0% |
| `prompt`               |     1,080 |  100.0% |
| `input_cache_read`     |       740 |   68.5% |
| `web_search`           |       300 |   27.8% |
| `input_cache_write`    |       182 |   16.9% |
| `overrides`            |       109 |   10.1% |
| `input_cache_write_1h` |       101 |    9.4% |
| `audio`                |        51 |    4.7% |
| `internal_reasoning`   |        49 |    4.5% |
| `image`                |        48 |    4.4% |
| `input_audio_cache`    |        46 |    4.3% |
| `image_output`         |        13 |    1.2% |
| `audio_output`         |         2 |    0.2% |
